"""Manual-only portfolio planning and trade-monitoring rules.

This module converts validated, precomputed research inputs into auditable plans.
It does not fetch data, predict returns, submit orders, or validate an investment edge.
"""
from __future__ import annotations

import math
from collections import Counter
from collections.abc import Mapping, Sequence
from datetime import datetime
from typing import Any

from stock_advisor.recommendations import Decision, RecommendationInputs, decide, reward_to_risk

STRATEGIES = frozenset({"long_term", "short_term"})
DEFAULT_SLEEVE_FRACTIONS = {"long_term": 0.60, "short_term": 0.20}
MONTHLY_NET_TARGET_USD = 150.0


def _number(value: Any) -> float | None:
    if isinstance(value, bool):
        return None
    try:
        result = float(value)
    except (TypeError, ValueError):
        return None
    return result if math.isfinite(result) else None


def _timestamp(value: Any) -> datetime | None:
    if not isinstance(value, str):
        return None
    try:
        parsed = datetime.fromisoformat(value.strip())
    except ValueError:
        return None
    if parsed.tzinfo is None or parsed.utcoffset() is None:
        return None
    return parsed


def _valid_ids(value: Any) -> list[str]:
    if not isinstance(value, list):
        return []
    ids = [item.strip() for item in value if isinstance(item, str) and item.strip()]
    return list(dict.fromkeys(ids)) if len(ids) == len(value) and ids else []


def _base_status(candidate: Mapping[str, Any], status: str, reasons: Sequence[str]) -> dict[str, Any]:
    return {
        "ticker": str(candidate.get("ticker", "")).strip().upper() or None,
        "strategy": candidate.get("strategy"),
        "status": status,
        "reasons": list(reasons),
        "shares": 0,
        "allocation_usd": 0.0,
        "planned_risk_usd": 0.0,
        "paper_execution_eligible": False,
        "automated_order_submission": False,
        "live_order_submission": False,
        "evidence_ids": _valid_ids(candidate.get("evidence_ids")),
    }


def _validate_portfolio(snapshot: Mapping[str, Any], as_of: datetime) -> tuple[dict[str, Any] | None, list[str]]:
    errors: list[str] = []
    if snapshot.get("verified") is not True:
        errors.append("portfolio_snapshot_not_verified")
    if not isinstance(snapshot.get("source"), str) or not snapshot["source"].strip():
        errors.append("portfolio_snapshot_source_missing")
    captured = _timestamp(snapshot.get("as_of"))
    if captured is None or captured > as_of:
        errors.append("portfolio_snapshot_timestamp_missing_invalid_or_future")
    equity, cash = _number(snapshot.get("equity")), _number(snapshot.get("cash"))
    if equity is None or equity <= 0 or cash is None or cash < 0 or cash > equity:
        errors.append("portfolio_equity_or_cash_invalid")
    positions = snapshot.get("positions")
    if not isinstance(positions, list):
        errors.append("portfolio_positions_missing")
        positions = []
    normalized: list[dict[str, Any]] = []
    for index, row in enumerate(positions):
        if not isinstance(row, Mapping):
            errors.append(f"portfolio_position_{index}_invalid")
            continue
        ticker = str(row.get("ticker", "")).strip().upper()
        sector = str(row.get("sector", "")).strip()
        strategy = row.get("strategy")
        market_value, open_risk = _number(row.get("market_value_usd")), _number(row.get("open_risk_usd"))
        if not ticker or not sector or strategy not in STRATEGIES or market_value is None or market_value < 0 or open_risk is None or open_risk < 0:
            errors.append(f"portfolio_position_{index}_incomplete")
            continue
        normalized.append({"ticker": ticker, "sector": sector, "strategy": strategy,
                           "market_value_usd": market_value, "open_risk_usd": open_risk})
    if equity is not None and cash is not None:
        exposure = sum(row["market_value_usd"] for row in normalized)
        if exposure + cash > equity * 1.02:
            errors.append("cash_and_position_value_exceed_equity")
        if abs((exposure + cash) - equity) > max(1.0, equity * 0.02):
            errors.append("portfolio_snapshot_does_not_reconcile")
    if errors:
        return None, errors
    assert equity is not None and cash is not None and captured is not None
    return {"equity": equity, "cash": cash, "positions": normalized, "as_of": captured}, []


def build_portfolio_plan(
    portfolio_snapshot: Mapping[str, Any],
    candidates: Sequence[Mapping[str, Any]],
    *,
    as_of: str,
    fractional_shares: bool = False,
    sleeve_fractions: Mapping[str, float] | None = None,
    reserve_cash_fraction: float = 0.20,
    max_single_name_fraction: float = 0.20,
    max_sector_fraction: float = 0.30,
    max_gross_exposure_fraction: float = 0.80,
    max_total_open_risk_fraction: float = 0.02,
    max_per_trade_risk_fraction: float = 0.01,
    commission_bps_per_side: float = 5.0,
    slippage_bps_per_side: float = 5.0,
) -> dict[str, Any]:
    """Build a diversified, conditional manual research plan.

    Equal budget is assigned within each sleeve; no predicted-return ranking is
    used. Default policy reserves 20% cash, caps a name at 20%, a sector at 30%,
    gross exposure at 80%, aggregate planned stop risk at 2%, and a single idea
    at 1%. Caps are planning constraints, not an assertion that diversification
    removes market risk. Stop gaps can exceed planned risk.
    """
    plan_time = _timestamp(as_of)
    if plan_time is None:
        raise ValueError("as_of must be an ISO timestamp with an explicit timezone.")
    if not isinstance(portfolio_snapshot, Mapping) or not isinstance(candidates, Sequence) or isinstance(candidates, (str, bytes)):
        raise TypeError("A portfolio snapshot and candidate sequence are required.")
    normalized, portfolio_errors = _validate_portfolio(portfolio_snapshot, plan_time)
    if normalized is None:
        return {
            "status": "INSUFFICIENT EVIDENCE", "positions": [],
            "portfolio_errors": portfolio_errors, "paper_execution_eligible": False,
            "automated_order_submission": False, "live_order_submission": False,
        }
    fractions = dict(DEFAULT_SLEEVE_FRACTIONS if sleeve_fractions is None else sleeve_fractions)
    numeric_policy = {
        "reserve_cash_fraction": reserve_cash_fraction,
        "max_single_name_fraction": max_single_name_fraction,
        "max_sector_fraction": max_sector_fraction,
        "max_gross_exposure_fraction": max_gross_exposure_fraction,
        "max_total_open_risk_fraction": max_total_open_risk_fraction,
        "max_per_trade_risk_fraction": max_per_trade_risk_fraction,
        "commission_bps_per_side": commission_bps_per_side,
        "slippage_bps_per_side": slippage_bps_per_side,
        **{f"sleeve_{key}": value for key, value in fractions.items()},
    }
    if (any(not math.isfinite(value) for value in numeric_policy.values()) or
        any(value < 0 for key, value in numeric_policy.items() if key.startswith("sleeve_")) or
        any(value <= 0 for key, value in numeric_policy.items() if not key.startswith("sleeve_") and "bps" not in key) or
        sum(fractions.values()) > max_gross_exposure_fraction or
        reserve_cash_fraction + max_gross_exposure_fraction > 1.000001 or
        max_total_open_risk_fraction > 0.02 or max_per_trade_risk_fraction > 0.02 or
        commission_bps_per_side + slippage_bps_per_side >= 5000):
        raise ValueError("Portfolio allocation or risk policy is invalid or exceeds the 2% risk ceiling.")
    if set(fractions) != STRATEGIES:
        raise ValueError("Both long_term and short_term sleeve fractions are required.")
    if not isinstance(fractional_shares, bool):
        raise TypeError("fractional_shares must be explicitly true or false.")

    positions = normalized["positions"]
    equity, current_cash = normalized["equity"], normalized["cash"]
    total_exposure = sum(row["market_value_usd"] for row in positions)
    risk_used = sum(row["open_risk_usd"] for row in positions)
    if risk_used > equity * max_total_open_risk_fraction + 1e-9:
        risk_left = 0.0
    else:
        risk_left = max(0.0, equity * max_total_open_risk_fraction - risk_used)
    exposure_left = max(0.0, equity * max_gross_exposure_fraction - total_exposure)
    spendable_cash = max(0.0, current_cash - equity * reserve_cash_fraction)
    sleeve_used = Counter()
    ticker_used = Counter()
    sector_used = Counter()
    for row in positions:
        sleeve_used[row["strategy"]] += row["market_value_usd"]
        ticker_used[row["ticker"]] += row["market_value_usd"]
        sector_used[row["sector"]] += row["market_value_usd"]

    prepared: list[dict[str, Any]] = []
    seen: set[str] = set()
    for candidate in candidates:
        if not isinstance(candidate, Mapping):
            prepared.append({"candidate": {}, "plan": _base_status({}, "INSUFFICIENT EVIDENCE", ["candidate_invalid"])})
            continue
        ticker = str(candidate.get("ticker", "")).strip().upper()
        reason: list[str] = []
        strategy = candidate.get("strategy")
        sector = str(candidate.get("sector", "")).strip()
        evidence_ids = _valid_ids(candidate.get("evidence_ids"))
        quote_time = _timestamp(candidate.get("quote_time"))
        current_price = _number(candidate.get("current_price"))
        entry_low, entry_high = _number(candidate.get("entry_low")), _number(candidate.get("entry_high"))
        target_low, target_high = _number(candidate.get("target_low")), _number(candidate.get("target_high"))
        stop = _number(candidate.get("stop_price"))
        hold_days = candidate.get("max_holding_days")
        fields = (ticker, sector, strategy, evidence_ids, quote_time, current_price, entry_low, entry_high, target_low, target_high, stop)
        if not all(fields):
            reason.append("identity_prices_sector_timestamp_or_evidence_missing")
        if not ticker or ticker in seen:
            reason.append("ticker_missing_or_duplicated")
        seen.add(ticker)
        if strategy not in STRATEGIES:
            reason.append("strategy_must_be_long_term_or_short_term")
        if not sector:
            reason.append("sector_missing")
        source = candidate.get("quote_source")
        if not isinstance(source, str) or not source.strip():
            reason.append("quote_source_missing")
        if quote_time is None or quote_time > plan_time:
            reason.append("quote_timestamp_missing_invalid_or_future")
        if candidate.get("quote_status") != "FRESH":
            reason.append("quote_not_marked_fresh_by_upstream_validation")
        prices = (current_price, entry_low, entry_high, target_low, target_high, stop)
        if any(value is None or value <= 0 for value in prices):
            reason.append("price_level_nonpositive_or_invalid")
        if all(value is not None and value > 0 for value in prices):
            assert entry_low is not None and entry_high is not None and target_low is not None and target_high is not None and stop is not None
            if not stop < entry_low <= entry_high < target_low <= target_high:
                reason.append("require_stop_below_entry_zone_below_ordered_target_zone")
        if isinstance(hold_days, bool) or not isinstance(hold_days, int) or hold_days < 1 or hold_days > 756:
            reason.append("holding_period_days_must_be_between_1_and_756")
        for field in ("entry_condition", "invalidation_condition", "thesis"):
            if not isinstance(candidate.get(field), str) or len(candidate[field].strip()) < 8:
                reason.append(f"{field}_missing")
        if not evidence_ids:
            reason.append("evidence_ids_missing")

        rr = None
        if not reason and current_price is not None and entry_low is not None and entry_high is not None and target_low is not None and stop is not None:
            midpoint = (entry_low + entry_high) / 2
            rr = reward_to_risk(midpoint, target_low, stop)
            if rr is None or rr < 2.0:
                reason.append("conservative_target_reward_risk_below_2_to_1")
            if not entry_low <= current_price <= entry_high:
                reason.append("current_price_outside_entry_zone_wait_for_condition")

        gates = candidate.get("gates")
        if not isinstance(gates, Mapping):
            reason.append("required_recommendation_gates_missing")
            gates = {}
        names = ("quote_current", "valuation_available", "earnings_date_verified",
                 "material_news_reviewed", "fundamentals_pass", "valuation_pass",
                 "event_risk_acceptable")
        gate_values = {name: gates.get(name) is True for name in names}
        if gates.get("thesis_broken") is True:
            gate_values["thesis_broken"] = True
        if not all(gate_values.get(name) is True for name in names):
            reason.append("one_or_more_northstar_recommendation_gates_failed")
        decision, decision_reasons = decide(RecommendationInputs(
            **gate_values, reward_risk=rr,
        ))
        if reason:
            prepared.append({"candidate": candidate, "plan": _base_status(candidate, "WAIT", reason)})
            continue
        if decision is not Decision.BUY:
            prepared.append({"candidate": candidate, "plan": _base_status(candidate, decision.value, decision_reasons)})
            continue
        prepared.append({"candidate": candidate, "plan": _base_status(candidate, "BUY SETUP — UNVALIDATED", [])})

    eligible_by_sleeve = Counter(
        item["candidate"].get("strategy") for item in prepared
        if item["plan"]["status"] == "BUY SETUP — UNVALIDATED"
    )
    remaining_by_sleeve = Counter(eligible_by_sleeve)
    plan_rows: list[dict[str, Any]] = []
    for item in sorted(prepared, key=lambda value: (str(value["candidate"].get("strategy")), str(value["candidate"].get("ticker", "")).upper())):
        candidate, row = item["candidate"], item["plan"]
        if row["status"] != "BUY SETUP — UNVALIDATED":
            plan_rows.append(row)
            continue
        ticker = str(candidate["ticker"]).strip().upper()
        sector = str(candidate["sector"]).strip()
        strategy = candidate["strategy"]
        entry_low, entry_high = float(candidate["entry_low"]), float(candidate["entry_high"])
        stop = float(candidate["stop_price"])
        entry = (entry_low + entry_high) / 2
        sleeve_capacity = max(0.0, equity * fractions[strategy] - sleeve_used[strategy])
        names_left = max(1, remaining_by_sleeve[strategy])
        equal_sleeve_budget = sleeve_capacity / names_left
        name_capacity = max(0.0, equity * max_single_name_fraction - ticker_used[ticker])
        sector_capacity = max(0.0, equity * max_sector_fraction - sector_used[sector])
        notional_cap = min(equal_sleeve_budget, name_capacity, sector_capacity, spendable_cash, exposure_left)
        available_ideas = max(1, sum(remaining_by_sleeve.values()))
        idea_risk = min(equity * max_per_trade_risk_fraction, risk_left / available_ideas)
        unit_risk = (entry - stop) + entry * 2 * (commission_bps_per_side + slippage_bps_per_side) / 10_000
        if unit_risk <= 0 or notional_cap <= 0 or idea_risk <= 0:
            shares = 0.0
        else:
            raw_shares = min(idea_risk / unit_risk, notional_cap / entry)
            shares = round(raw_shares, 6) if fractional_shares else math.floor(raw_shares)
        allocation = round(shares * entry, 4)
        planned_risk = round(shares * unit_risk, 4)
        if shares <= 0 or allocation < 1.0:
            row["status"] = "WAIT"
            row["reasons"] = ["no_share_fits_cash_diversification_and_risk_limits"]
        else:
            row.update({
                "status": "BUY SETUP — UNVALIDATED",
                "shares": shares if fractional_shares else int(shares),
                "allocation_usd": allocation,
                "planned_risk_usd": planned_risk,
                "entry_range": [entry_low, entry_high],
                "target_range": [float(candidate["target_low"]), float(candidate["target_high"])],
                "stop_loss_review_level": stop,
                "max_holding_days": int(candidate["max_holding_days"]),
                "entry_condition": candidate["entry_condition"].strip(),
                "invalidation_condition": candidate["invalidation_condition"].strip(),
                "thesis": candidate["thesis"].strip(),
                "quote": {"price": float(candidate["current_price"]), "timestamp": candidate["quote_time"],
                          "source": candidate["quote_source"]},
                "reward_risk_at_midpoint_to_target_low": round(reward_to_risk(entry, float(candidate["target_low"]), stop) or 0.0, 4),
                "assumptions": {
                    "cost_bps_per_side": commission_bps_per_side + slippage_bps_per_side,
                    "gap_risk_excluded": True,
                    "fractional_shares": fractional_shares,
                    "manual_user_review_required": True,
                    "not_a_validated_buy": True,
                },
                "paper_execution_eligible": False,
                "automated_order_submission": False,
                "live_order_submission": False,
            })
            ticker_used[ticker] += allocation
            sector_used[sector] += allocation
            sleeve_used[strategy] += allocation
            spendable_cash = max(0.0, spendable_cash - allocation)
            current_cash -= allocation
            exposure_left = max(0.0, exposure_left - allocation)
            risk_left = max(0.0, risk_left - planned_risk)
        remaining_by_sleeve[strategy] -= 1
        plan_rows.append(row)
    total_new = round(sum(row["allocation_usd"] for row in plan_rows), 4)
    return {
        "status": "MANUAL_REVIEW_REQUIRED" if total_new else "NO_ELIGIBLE_ALLOCATION",
        "as_of": plan_time.isoformat(),
        "equity_usd": equity,
        "current_cash_usd": normalized["cash"],
        "planned_allocation_usd": total_new,
        "cash_after_plan_usd": round(current_cash, 4),
        "monthly_net_target_usd": MONTHLY_NET_TARGET_USD,
        "implied_monthly_return_target_pct": round(MONTHLY_NET_TARGET_USD / equity * 100, 4),
        "target_is_forecast": False,
        "positions": plan_rows,
        "policy": {
            "sleeve_fractions": fractions,
            "cash_reserve_fraction": reserve_cash_fraction,
            "max_single_name_fraction": max_single_name_fraction,
            "max_sector_fraction": max_sector_fraction,
            "max_gross_exposure_fraction": max_gross_exposure_fraction,
            "max_total_open_risk_fraction": max_total_open_risk_fraction,
            "max_per_trade_risk_fraction": max_per_trade_risk_fraction,
        },
        "paper_execution_eligible": False,
        "automated_order_submission": False,
        "live_order_submission": False,
        "warnings": [
            "This is a conditional research allocation, not an order. Recheck every fact and quote before acting.",
            "Stop levels do not cap losses; overnight gaps, liquidity, costs, taxes and execution may increase losses.",
            "Dollar sizing is an assumption-based plan and does not establish a profitable strategy.",
            "The monthly dollar target is an aspiration, not a forecast, signal gate or guarantee.",
        ],
    }


def monitor_trade(
    position: Mapping[str, Any],
    market: Mapping[str, Any],
    *,
    as_of: str,
) -> dict[str, Any]:
    """Return a manual exit/hold review; never creates an order.

    Small gains alone do not cause a profit-taking alert. Stale data creates a
    price-data review rather than a fabricated stop/target determination.
    """
    now = _timestamp(as_of)
    if now is None:
        raise ValueError("as_of must be an ISO timestamp with an explicit timezone.")
    ticker = str(position.get("ticker", "")).strip().upper() or None
    evidence = _valid_ids(position.get("evidence_ids")) + _valid_ids(market.get("evidence_ids"))
    entry = _number(position.get("entry_price"))
    stop = _number(position.get("stop_price"))
    target_low = _number(position.get("target_low"))
    opened = _timestamp(position.get("opened_at"))
    max_days = position.get("max_holding_days")
    quote_time = _timestamp(market.get("quote_time"))
    price = _number(market.get("price"))
    reason = None
    status = "HOLD_MONITORING"
    if position.get("thesis_invalidated") is True:
        status, reason = "EXIT_REVIEW", "The stated thesis invalidation condition has been reported; verify its evidence and review a manual exit."
    elif (quote_time is None or quote_time > now or market.get("quote_status") not in {"FRESH", "CLOSED_RECENT"}
          or price is None or price <= 0):
        status, reason = "PRICE_DATA_REVIEW", "Current price data is missing, stale, future-dated, or invalid; recheck manually."
    elif entry is None or stop is None or target_low is None or opened is None or isinstance(max_days, bool) or not isinstance(max_days, int) or max_days < 1:
        status, reason = "INSUFFICIENT_POSITION_DATA", "Position levels, opened timestamp, or maximum holding period are incomplete."
    elif price <= stop:
        status, reason = "STOP_LOSS_REVIEW", "The validated quote is at or below the planned stop level; check gaps, liquidity, and the actual executable price."
    elif price >= target_low:
        status, reason = "PROFIT_TAKING_REVIEW", "The price has reached the base target zone; review partial profit-taking, continued holding, valuation, and thesis evidence manually."
    elif (now.date() - opened.date()).days >= max_days:
        status, reason = "TIME_REVIEW", "The planned maximum holding period has elapsed; reassess the thesis and opportunity cost."
    else:
        reason = "No stop, target, invalidation, or time condition is met; small gains alone do not trigger an exit."
    unrealized = None
    if entry and entry > 0 and price is not None and price > 0:
        unrealized = round((price / entry - 1) * 100, 4)
    return {
        "ticker": ticker,
        "status": status,
        "reason": reason,
        "unrealized_return_pct_before_costs": unrealized,
        "quote": {"price": price, "timestamp": market.get("quote_time"), "source": market.get("source")},
        "manual_review_required": True,
        "automated_exit": False,
        "live_order_submission": False,
        "paper_execution_eligible": False,
        "evidence_ids": list(dict.fromkeys(evidence)),
    }
