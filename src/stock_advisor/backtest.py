"""Leakage-aware single-position backtesting primitives.

This module evaluates precomputed, timestamped trade signals against daily OHLC
bars. It does not create signals or prove that the current stock-screening rules
are predictive. Use only information available on or before each signal date.
"""

from __future__ import annotations

import math
from collections.abc import Iterable
from dataclasses import dataclass
from datetime import date, datetime
from statistics import mean, median


def _as_date(value: date | datetime | str) -> date:
    if isinstance(value, datetime):
        return value.date()
    if isinstance(value, date):
        return value
    if isinstance(value, str):
        return date.fromisoformat(value)
    raise TypeError("Dates must be datetime.date, datetime, or ISO YYYY-MM-DD strings.")


def _number(value: float | None) -> float | None:
    if value is None or isinstance(value, bool):
        return None
    try:
        result = float(value)
    except (TypeError, ValueError):
        return None
    return result if math.isfinite(result) else None


@dataclass(frozen=True)
class DailyBar:
    date: date | datetime | str
    open: float
    high: float
    low: float
    close: float
    adjusted_close: float | None = None


@dataclass(frozen=True)
class TradeSignal:
    symbol: str
    signal_date: date | datetime | str
    entry_low: float
    entry_high: float
    stop_price: float
    target_price: float
    max_holding_sessions: int = 126


@dataclass(frozen=True)
class BacktestConfig:
    slippage_bps_per_side: float = 5.0
    commission_bps_per_side: float = 0.0


@dataclass(frozen=True)
class TradeOutcome:
    symbol: str
    status: str
    signal_date: date
    entry_date: date | None = None
    entry_fill_price: float | None = None
    exit_date: date | None = None
    exit_fill_price: float | None = None
    exit_reason: str | None = None
    holding_sessions: int | None = None
    net_return_pct: float | None = None
    benchmark_return_pct: float | None = None
    r_multiple: float | None = None
    adjusted_returns_used: bool = False
    detail: str = ""


@dataclass(frozen=True)
class WalkForwardFold:
    train_start: date
    train_end: date
    test_start: date
    test_end: date


def _validate_bars(bars: Iterable[DailyBar]) -> tuple[list[dict[str, float | date | None]], str | None]:
    normalized: list[dict[str, float | date | None]] = []
    seen: set[date] = set()
    for bar in bars:
        try:
            day = _as_date(bar.date)
        except (TypeError, ValueError) as exc:
            return [], f"Invalid daily-bar date: {exc}"
        if day in seen:
            return [], f"Duplicate daily-bar date: {day.isoformat()}"
        seen.add(day)
        values = {
            "open": _number(bar.open),
            "high": _number(bar.high),
            "low": _number(bar.low),
            "close": _number(bar.close),
            "adjusted_close": _number(bar.adjusted_close),
        }
        if any(values[key] is None or values[key] <= 0 for key in ("open", "high", "low", "close")):
            return [], f"Missing, non-finite, or non-positive OHLC value on {day.isoformat()}."
        op, hi, lo, close = values["open"], values["high"], values["low"], values["close"]
        if lo > min(op, close) or hi < max(op, close) or lo > hi:
            return [], f"Inconsistent OHLC range on {day.isoformat()}."
        adj = values["adjusted_close"]
        if adj is not None and adj <= 0:
            values["adjusted_close"] = None
        normalized.append({"date": day, **values})
    normalized.sort(key=lambda row: row["date"])
    return normalized, None


def simulate_signal(
    signal: TradeSignal,
    bars: Iterable[DailyBar],
    config: BacktestConfig | None = None,
) -> TradeOutcome:
    """Simulate one long signal, entering only on the next session's open.

    Entry occurs only if the next session opens inside the signal's entry zone,
    so the same-session close cannot leak into entry execution. When both stop
    and target are touched in one daily bar, the stop is assumed to hit first.
    A stop gap exits at the observed open, not the stop level. Trades without
    enough future bars and without an earlier exit are marked incomplete.
    """
    if config is None:
        config = BacktestConfig()
    signal_date = _as_date(signal.signal_date)
    symbol = str(signal.symbol).strip().upper()
    empty = {"symbol": symbol, "signal_date": signal_date}
    if not symbol:
        return TradeOutcome(**empty, status="invalid_signal", detail="Ticker is blank.")
    signal_values = (
        _number(signal.entry_low),
        _number(signal.entry_high),
        _number(signal.stop_price),
        _number(signal.target_price),
    )
    if any(value is None or value <= 0 for value in signal_values):
        return TradeOutcome(**empty, status="invalid_signal", detail="All signal price levels must be finite and positive.")
    entry_low, entry_high, stop, target = signal_values
    if entry_low > entry_high or stop >= entry_low or target <= entry_high:
        return TradeOutcome(**empty, status="invalid_signal", detail="Require stop < entry zone < target.")
    if (
        isinstance(signal.max_holding_sessions, bool)
        or not isinstance(signal.max_holding_sessions, int)
        or signal.max_holding_sessions < 1
    ):
        return TradeOutcome(
            **empty,
            status="invalid_signal",
            detail="Maximum holding sessions must be a positive integer.",
        )

    slip = _number(config.slippage_bps_per_side)
    commission = _number(config.commission_bps_per_side)
    if slip is None or commission is None or slip < 0 or commission < 0 or slip + commission >= 10_000:
        return TradeOutcome(**empty, status="invalid_config", detail="Transaction-cost basis points are invalid.")

    rows, error = _validate_bars(bars)
    if error:
        return TradeOutcome(**empty, status="invalid_data", detail=error)
    entry_idx = next((idx for idx, row in enumerate(rows) if row["date"] > signal_date), None)
    if entry_idx is None:
        return TradeOutcome(**empty, status="insufficient_future_data", detail="No later trading session is available for a next-open entry.")

    entry_bar = rows[entry_idx]
    raw_entry = float(entry_bar["open"])
    if not entry_low <= raw_entry <= entry_high:
        return TradeOutcome(**empty, status="not_filled", detail="Next session opened outside the specified entry zone.")

    cost_rate = (slip + commission) / 10_000
    entry_fill = raw_entry * (1 + cost_rate)
    use_adjusted = all(row["adjusted_close"] is not None for row in rows[entry_idx:])
    entry_close = float(entry_bar["close"])
    entry_adj_factor = (float(entry_bar["adjusted_close"]) / entry_close) if use_adjusted else 1.0
    entry_total_return_basis = entry_fill * entry_adj_factor
    risk_per_share = entry_fill - stop
    risk_fraction = risk_per_share / entry_fill if entry_fill > 0 else None

    horizon_end = min(len(rows), entry_idx + signal.max_holding_sessions)
    for idx in range(entry_idx, horizon_end):
        row = rows[idx]
        op, hi, lo, close = (float(row[key]) for key in ("open", "high", "low", "close"))
        reason: str | None = None
        exit_raw: float | None = None

        if idx > entry_idx and op <= stop:
            reason, exit_raw = "stop_gap", op
        elif idx > entry_idx and op >= target:
            reason, exit_raw = "target_gap", target
        else:
            stop_hit = lo <= stop
            target_hit = hi >= target
            if stop_hit:
                reason, exit_raw = "stop", stop
            elif target_hit:
                reason, exit_raw = "target", target
            elif idx == entry_idx + signal.max_holding_sessions - 1:
                reason, exit_raw = "time", close

        if reason is None:
            continue

        exit_fill = exit_raw * (1 - cost_rate)
        exit_close = close
        exit_adj_factor = (float(row["adjusted_close"]) / exit_close) if use_adjusted else 1.0
        net_return = exit_fill * exit_adj_factor / entry_total_return_basis - 1
        benchmark_entry_basis = raw_entry * entry_adj_factor
        benchmark_close_exit = float(row["adjusted_close"]) if use_adjusted else exit_close
        benchmark_return = benchmark_close_exit / benchmark_entry_basis - 1
        return TradeOutcome(
            **empty,
            status="closed",
            entry_date=entry_bar["date"],
            entry_fill_price=entry_fill,
            exit_date=row["date"],
            exit_fill_price=exit_fill,
            exit_reason=reason,
            holding_sessions=idx - entry_idx + 1,
            net_return_pct=net_return * 100,
            benchmark_return_pct=benchmark_return * 100,
            r_multiple=(net_return / risk_fraction) if risk_fraction and risk_fraction > 0 else None,
            adjusted_returns_used=use_adjusted,
            detail="Adjusted-close factors are used for total-return approximation." if use_adjusted else "Adjusted closes unavailable; returns exclude dividends."
        )

    if horizon_end - entry_idx < signal.max_holding_sessions:
        return TradeOutcome(
            **empty,
            status="insufficient_future_data",
            entry_date=entry_bar["date"],
            entry_fill_price=entry_fill,
            adjusted_returns_used=use_adjusted,
            detail="Future data ends before stop, target, or the full holding horizon."
        )
    return TradeOutcome(**empty, status="invalid_data", detail="A valid exit was not produced for the holding horizon.")


def summarize_outcomes(outcomes: Iterable[TradeOutcome]) -> dict[str, float | int | None]:
    """Summarize completed independent trade outcomes; no overlapping portfolio curve implied."""
    items = list(outcomes)
    closed = [
        item for item in items
        if item.status == "closed" and item.net_return_pct is not None and math.isfinite(item.net_return_pct)
    ]
    returns = [item.net_return_pct for item in closed]
    r_values = [item.r_multiple for item in closed if item.r_multiple is not None and math.isfinite(item.r_multiple)]
    gains = sum(value for value in returns if value > 0)
    losses = -sum(value for value in returns if value < 0)
    benchmark = [item.benchmark_return_pct for item in closed if item.benchmark_return_pct is not None]
    count = len(closed)
    return {
        "signals": len(items),
        "completed_trades": count,
        "not_filled": sum(item.status == "not_filled" for item in items),
        "incomplete": sum(item.status == "insufficient_future_data" for item in items),
        "invalid": sum(item.status in {"invalid_signal", "invalid_data", "invalid_config"} for item in items),
        "win_rate_pct": (sum(value > 0 for value in returns) / count * 100) if count else None,
        "average_net_return_pct": mean(returns) if count else None,
        "median_net_return_pct": median(returns) if count else None,
        "average_r_multiple": mean(r_values) if r_values else None,
        "profit_factor": (gains / losses) if losses > 0 else (math.inf if gains > 0 else None),
        "average_benchmark_return_pct": mean(benchmark) if benchmark else None,
        "average_excess_return_pct": mean([
            item.net_return_pct - item.benchmark_return_pct
            for item in closed
            if item.benchmark_return_pct is not None
        ]) if any(item.benchmark_return_pct is not None for item in closed) else None,
    }


def walk_forward_folds(
    session_dates: Iterable[date | datetime | str],
    *,
    min_train_sessions: int = 252,
    test_sessions: int = 63,
    step_sessions: int | None = None,
) -> list[WalkForwardFold]:
    """Create expanding-window chronological folds with no train/test date overlap."""
    raw_dates = [_as_date(item) for item in session_dates]
    if len(set(raw_dates)) != len(raw_dates):
        raise ValueError("Session dates must be unique.")
    dates = sorted(raw_dates)
    if min_train_sessions < 1 or test_sessions < 1:
        raise ValueError("Training and test session counts must be positive.")
    step = test_sessions if step_sessions is None else step_sessions
    if step < 1:
        raise ValueError("Step sessions must be positive.")

    folds: list[WalkForwardFold] = []
    test_start_idx = min_train_sessions
    while test_start_idx + test_sessions <= len(dates):
        folds.append(WalkForwardFold(
            train_start=dates[0],
            train_end=dates[test_start_idx - 1],
            test_start=dates[test_start_idx],
            test_end=dates[test_start_idx + test_sessions - 1],
        ))
        test_start_idx += step
    return folds
