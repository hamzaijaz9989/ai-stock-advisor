"""Point-in-time strategy signal generation and auditable validation reports.

Input snapshots must be reconstructed from facts available at each snapshot date.
This module intentionally does not fetch or fabricate market data. It generates
signals from an explicit, validated snapshot contract, replays them against
historical bars, and keeps BUY approval closed unless independent data and
validation evidence is supplied.
"""
from __future__ import annotations

import math
from collections.abc import Iterable, Mapping
from datetime import UTC, date, datetime
from statistics import stdev
from typing import Any

from stock_advisor.portfolio import simulate_cash_only_portfolio

from stock_advisor.backtest import (
    BacktestConfig,
    DailyBar,
    TradeOutcome,
    TradeSignal,
    simulate_signal,
    summarize_outcomes,
    walk_forward_folds,
)

REQUIRED_SNAPSHOT_FIELDS = (
    "ticker", "as_of_date", "universe_member", "close", "dcf_base",
    "annual_revenue", "prior_annual_revenue", "annual_net_income",
    "annual_fcf", "quarter_revenue", "quarter_net_income",
    "quarter_revenue_yoy", "earnings_date", "recent_news_count",
    "risk_headline", "atr14",
)
REQUIRED_AVAILABILITY_FIELDS = (
    "price", "fundamentals", "quarterly_fundamentals", "earnings",
    "news", "universe_membership",
)


def _day(value: Any, field: str) -> date:
    if isinstance(value, datetime):
        return value.date()
    if isinstance(value, date):
        return value
    if isinstance(value, str):
        try:
            return date.fromisoformat(value[:10])
        except ValueError as exc:
            raise ValueError(f"{field} must be an ISO date.") from exc
    raise ValueError(f"{field} must be an ISO date.")


def _timestamp(value: Any, field: str) -> datetime:
    if not isinstance(value, str) or "T" not in value:
        raise ValueError(f"{field} must be a full ISO timestamp with timezone.")
    try:
        parsed = datetime.fromisoformat(value)
    except ValueError as exc:
        raise ValueError(f"{field} must be a valid ISO timestamp.") from exc
    if parsed.tzinfo is None or parsed.utcoffset() is None:
        raise ValueError(f"{field} must include an explicit timezone offset.")
    return parsed.astimezone(UTC)


def _finite(value: Any) -> float | None:
    if isinstance(value, bool) or value is None:
        return None
    try:
        result = float(value)
    except (TypeError, ValueError):
        return None
    return result if math.isfinite(result) else None


def evaluate_snapshot(snapshot: Mapping[str, Any], *, risk_budget: float = 5.0,
                      max_notional: float = 500.0) -> dict[str, Any]:
    """Apply a frozen, explicit version of the current provisional setup rules."""
    ticker = str(snapshot.get("ticker", "")).strip().upper()
    try:
        as_of = _day(snapshot.get("as_of_date"), "as_of_date")
        as_of_timestamp = _timestamp(snapshot.get("as_of_timestamp"), "as_of_timestamp")
        if as_of_timestamp.date() != as_of:
            raise ValueError("as_of_timestamp date must match as_of_date.")
    except ValueError as exc:
        return {"eligible": False, "ticker": ticker, "as_of_date": str(snapshot.get("as_of_date", "")),
                "failed_gates": [str(exc)]}
    failed: list[str] = []
    if not ticker:
        failed.append("ticker_missing")
    if snapshot.get("universe_member") is not True:
        failed.append("not_in_point_in_time_universe")

    availability = snapshot.get("available_at")
    if not isinstance(availability, Mapping):
        failed.append("availability_timestamps_missing")
    else:
        for key in REQUIRED_AVAILABILITY_FIELDS:
            try:
                available_at = _timestamp(availability.get(key), f"available_at.{key}")
                if available_at > as_of_timestamp:
                    failed.append(f"lookahead_{key}")
            except ValueError:
                failed.append(f"availability_{key}_missing_or_invalid")

    numeric_names = (
        "close", "dcf_base", "annual_revenue", "prior_annual_revenue",
        "annual_net_income", "annual_fcf", "quarter_revenue",
        "quarter_net_income", "quarter_revenue_yoy", "atr14",
    )
    values = {name: _finite(snapshot.get(name)) for name in numeric_names}
    for name in numeric_names:
        if values[name] is None:
            failed.append(f"{name}_missing_or_invalid")

    if any(values[name] is None for name in ("close", "dcf_base", "atr14")):
        return {"eligible": False, "ticker": ticker, "as_of_date": as_of.isoformat(),
                "failed_gates": sorted(set(failed + ["price_or_valuation_unavailable"]))}

    price, base, atr = values["close"], values["dcf_base"], values["atr14"]
    assert price is not None and base is not None and atr is not None
    if price <= 0 or base <= 0 or atr <= 0:
        failed.append("nonpositive_price_valuation_or_atr")
    ratio = price / base if base > 0 else None
    if ratio is not None and not 0.40 <= ratio <= 2.50:
        failed.append("market_model_ratio_outside_allowed_band")

    for name in ("annual_revenue", "prior_annual_revenue", "annual_net_income",
                 "annual_fcf", "quarter_revenue", "quarter_net_income"):
        if values[name] is not None and values[name] <= 0:
            failed.append(f"{name}_quality_gate_failed")
    annual_revenue, prior_revenue = values["annual_revenue"], values["prior_annual_revenue"]
    if (annual_revenue is not None and prior_revenue is not None and prior_revenue > 0
            and annual_revenue / prior_revenue - 1 < -0.10):
        failed.append("annual_revenue_decline_exceeds_10pct")
    if values["quarter_revenue_yoy"] is not None and values["quarter_revenue_yoy"] < -0.15:
        failed.append("quarterly_revenue_decline_exceeds_15pct")

    try:
        earnings_date = _day(snapshot.get("earnings_date"), "earnings_date")
        days_to_earnings = (earnings_date - as_of).days
        if days_to_earnings <= 7:
            failed.append("earnings_within_7_days_or_date_in_past")
    except ValueError:
        days_to_earnings = None
        failed.append("earnings_date_missing_or_invalid")

    if not isinstance(snapshot.get("recent_news_count"), int) or snapshot["recent_news_count"] < 1:
        failed.append("recent_timestamped_news_missing")
    if snapshot.get("risk_headline") is not False:
        failed.append("potential_material_risk_headline_or_unknown")

    entry_low, entry_high = base * 0.75, base * 0.80
    entry_mid = (entry_low + entry_high) / 2
    stop = entry_mid - 2 * atr
    target = base
    reward_risk = (target - entry_mid) / (entry_mid - stop) if entry_mid > stop else None
    if not entry_low <= price <= entry_high:
        failed.append("price_outside_entry_zone")
    if stop <= 0 or reward_risk is None or reward_risk < 2:
        failed.append("risk_or_reward_risk_gate_failed")

    if not (math.isfinite(risk_budget) and risk_budget > 0 and math.isfinite(max_notional) and max_notional > 0):
        failed.append("invalid_position_sizing_configuration")
        shares = 0
    elif stop > 0 and entry_mid > stop:
        shares = min(math.floor(risk_budget / (entry_mid - stop)), math.floor(max_notional / entry_mid))
    else:
        shares = 0
    if shares < 1:
        failed.append("no_whole_share_fits_risk_and_notional_limits")

    return {
        "eligible": not failed,
        "ticker": ticker,
        "as_of_date": as_of.isoformat(),
        "entry_low": entry_low,
        "entry_high": entry_high,
        "stop_price": stop,
        "target_price": target,
        "reward_risk": reward_risk,
        "planned_shares": shares,
        "days_to_earnings": days_to_earnings,
        "market_model_ratio": ratio,
        "failed_gates": sorted(set(failed)),
        "label": "BUY SETUP — UNVALIDATED" if not failed else "NO SIGNAL",
    }


def generate_signals(snapshots: Iterable[Mapping[str, Any]]) -> tuple[list[TradeSignal], list[dict[str, Any]]]:
    """Generate dated candidates from point-in-time snapshots; never backfill missing facts."""
    signals: list[TradeSignal] = []
    audit: list[dict[str, Any]] = []
    seen: set[tuple[str, date]] = set()
    for snapshot in snapshots:
        result = evaluate_snapshot(snapshot)
        audit.append(result)
        if not result["eligible"]:
            continue
        signal_date = _day(result["as_of_date"], "as_of_date")
        key = (result["ticker"], signal_date)
        if key in seen:
            audit[-1] = {**result, "eligible": False, "label": "NO SIGNAL",
                         "failed_gates": ["duplicate_ticker_snapshot_date"]}
            continue
        seen.add(key)
        signals.append(TradeSignal(
            symbol=result["ticker"],
            signal_date=signal_date,
            entry_low=result["entry_low"],
            entry_high=result["entry_high"],
            stop_price=result["stop_price"],
            target_price=result["target_price"],
            max_holding_sessions=126,
        ))
    signals.sort(key=lambda item: (_day(item.signal_date, "signal_date"), item.symbol))
    return signals, audit


def _max_drawdown(returns_pct: list[float]) -> float | None:
    if not returns_pct:
        return None
    equity = peak = 1.0
    worst = 0.0
    for value in returns_pct:
        equity *= max(0.0, 1 + value / 100)
        peak = max(peak, equity)
        if peak:
            worst = min(worst, equity / peak - 1)
    return worst * 100


def _sample_std(values: list[float]) -> float | None:
    return stdev(values) if len(values) >= 2 else None


def build_validation_report(
    snapshots: Iterable[Mapping[str, Any]],
    bars_by_symbol: Mapping[str, Iterable[DailyBar]],
    *,
    data_provenance_verified: bool = False,
    point_in_time_coverage_verified: bool = False,
    survivorship_control_verified: bool = False,
    corporate_actions_verified: bool = False,
    costs_calibrated: bool = False,
    holdout_untouched: bool = False,
    config: BacktestConfig | None = None,
    minimum_trades: int = 100,
    minimum_walk_forward_folds: int = 4,
) -> dict[str, Any]:
    """Produce an auditable report; eligibility requires explicit evidence attestations."""
    rows = list(snapshots)
    signals, audit = generate_signals(rows)
    outcomes: list[TradeOutcome] = []
    missing_bars = 0
    normalized_bars = {str(symbol).strip().upper(): list(bars) for symbol, bars in bars_by_symbol.items()}
    for signal in signals:
        bars = normalized_bars.get(signal.symbol)
        if bars is None:
            missing_bars += 1
            continue
        outcome = simulate_signal(signal, bars, config)
        outcomes.append(outcome)

    completed = [item for item in outcomes if item.status == "closed" and item.net_return_pct is not None]
    completed_returns = [float(item.net_return_pct) for item in completed]
    summary = summarize_outcomes(outcomes)
    portfolio = simulate_cash_only_portfolio(signals, bars_by_symbol, config=config)
    summary["max_drawdown_pct_sequential_trade_proxy"] = _max_drawdown(completed_returns)
    summary["return_stddev_pct"] = _sample_std(completed_returns)
    summary["missing_bars"] = missing_bars
    dates = sorted({_day(row["as_of_date"], "as_of_date") for row in rows if row.get("as_of_date")})
    folds = walk_forward_folds(dates, min_train_sessions=252, test_sessions=126, step_sessions=126) if len(dates) >= 378 else []
    flags = {
        "data_provenance_verified": data_provenance_verified,
        "point_in_time_coverage_verified": point_in_time_coverage_verified,
        "survivorship_control_verified": survivorship_control_verified,
        "corporate_actions_verified": corporate_actions_verified,
        "costs_calibrated": costs_calibrated,
        "holdout_untouched": holdout_untouched,
    }
    blockers = [name for name, passed in flags.items() if passed is not True]
    if len(completed) < minimum_trades:
        blockers.append("minimum_completed_trade_count_not_met")
    if len(folds) < minimum_walk_forward_folds:
        blockers.append("minimum_walk_forward_fold_count_not_met")
    if summary.get("profit_factor") is None or not isinstance(summary.get("profit_factor"), (int, float)) or summary["profit_factor"] <= 1:
        blockers.append("net_profit_factor_not_above_1")
    if summary.get("average_excess_return_pct") is None or summary["average_excess_return_pct"] <= 0:
        blockers.append("average_excess_return_not_positive")
    if portfolio["completed_positions"] < minimum_trades:
        blockers.append("minimum_completed_portfolio_positions_not_met")
    blockers.append("independent_validation_review_required")
    return {
        "report_version": 2,
        "strategy_version": "northstar-provisional-gates-v1",
        "signals_generated": len(signals),
        "snapshots_evaluated": len(audit),
        "audit": audit,
        "summary": summary,
        "portfolio_simulation": portfolio,
        "walk_forward_folds": [
            {"train_start": f.train_start.isoformat(), "train_end": f.train_end.isoformat(),
             "test_start": f.test_start.isoformat(), "test_end": f.test_end.isoformat()}
            for f in folds
        ],
        "quality_attestations": flags,
        "validation": {
            "strategy_validation_passed": False,
            "decision_eligible": False,
            "blockers": sorted(set(blockers)),
            "explanation": "This report is a research diagnostic. It cannot enable validated BUY until portfolio-level overlap, equity curve, uncertainty analysis, source provenance and independent review are complete.",
        },
    }
