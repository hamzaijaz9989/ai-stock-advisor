"""Cash-only portfolio simulation for sequential, non-overlapping research trades."""
from __future__ import annotations

import math
from collections.abc import Iterable, Mapping
from datetime import date
from typing import Any

from stock_advisor.backtest import BacktestConfig, DailyBar, TradeSignal, simulate_signal


def _day(value: Any) -> date:
    if isinstance(value, date):
        return value
    return date.fromisoformat(str(value)[:10])


def simulate_cash_only_portfolio(
    signals: Iterable[TradeSignal],
    bars_by_symbol: Mapping[str, Iterable[DailyBar]],
    *,
    initial_capital: float = 1000.0,
    risk_budget: float = 10.0,
    max_notional: float = 1000.0,
    config: BacktestConfig | None = None,
) -> dict[str, Any]:
    """Simulate a cash-only account with one open position maximum.

    Signals that arrive before the previous position exits are skipped; no
    margin or overlapping positions are allowed. Incomplete open trades block
    later signals to the end of available history.
    """
    if not all(math.isfinite(value) and value > 0 for value in (initial_capital, risk_budget, max_notional)):
        raise ValueError("Initial capital, risk budget and max notional must be finite and positive.")

    normalized = {str(symbol).strip().upper(): list(rows) for symbol, rows in bars_by_symbol.items()}
    cash = float(initial_capital)
    last_exit: date | None = None
    completed = overlap_skips = sizing_skips = incomplete = 0
    audit: list[dict[str, Any]] = []
    equity_curve = [{"date": None, "equity": round(cash, 4)}]

    ordered = sorted(signals, key=lambda item: (_day(item.signal_date), item.symbol.upper()))
    for signal in ordered:
        signal_day = _day(signal.signal_date)
        ticker = signal.symbol.strip().upper()
        if last_exit is not None and signal_day < last_exit:
            overlap_skips += 1
            audit.append({"ticker": ticker, "signal_date": signal_day.isoformat(),
                          "status": "skipped_overlap", "detail": "A previous position had not exited."})
            continue

        bars = normalized.get(ticker)
        if bars is None:
            audit.append({"ticker": ticker, "signal_date": signal_day.isoformat(), "status": "missing_bars"})
            continue

        outcome = simulate_signal(signal, bars, config)
        if outcome.status != "closed" or outcome.entry_fill_price is None or outcome.net_return_pct is None:
            audit.append({"ticker": ticker, "signal_date": signal_day.isoformat(),
                          "status": outcome.status, "detail": outcome.detail})
            if outcome.status == "insufficient_future_data" and outcome.entry_date is not None:
                incomplete += 1
                last_exit = max((_day(bar.date) for bar in bars), default=signal_day)
            continue

        entry_fill = outcome.entry_fill_price
        risk_per_share = entry_fill - signal.stop_price
        affordable = min(float(max_notional), cash)
        risk_shares = math.floor(risk_budget / risk_per_share) if risk_per_share > 0 else 0
        cash_shares = math.floor(affordable / entry_fill) if entry_fill > 0 else 0
        shares = min(risk_shares, cash_shares)
        if shares < 1:
            sizing_skips += 1
            audit.append({"ticker": ticker, "signal_date": signal_day.isoformat(),
                          "status": "skipped_sizing", "detail": "No whole share fits cash, risk and notional limits."})
            continue

        deployed = shares * entry_fill
        profit_loss = deployed * outcome.net_return_pct / 100
        cash += profit_loss
        completed += 1
        last_exit = outcome.exit_date
        audit.append({
            "ticker": ticker, "signal_date": signal_day.isoformat(),
            "entry_date": outcome.entry_date.isoformat() if outcome.entry_date else None,
            "exit_date": outcome.exit_date.isoformat() if outcome.exit_date else None,
            "status": "closed", "shares": shares, "deployed_notional": round(deployed, 4),
            "net_return_pct": outcome.net_return_pct, "profit_loss": round(profit_loss, 4),
            "equity_after_exit": round(cash, 4), "exit_reason": outcome.exit_reason,
        })
        equity_curve.append({"date": outcome.exit_date.isoformat() if outcome.exit_date else None,
                             "equity": round(cash, 4)})

    peak = float(initial_capital)
    max_drawdown = 0.0
    for point in equity_curve:
        equity = float(point["equity"])
        peak = max(peak, equity)
        if peak > 0:
            max_drawdown = min(max_drawdown, equity / peak - 1)

    return {
        "model": "cash-only, sequential positions, fixed-dollar risk sizing, no margin",
        "initial_capital": float(initial_capital),
        "ending_equity": round(cash, 4),
        "net_return_pct": round((cash / initial_capital - 1) * 100, 6),
        "max_drawdown_pct": round(max_drawdown * 100, 6),
        "completed_positions": completed, "skipped_overlap": overlap_skips,
        "skipped_sizing": sizing_skips, "incomplete_open_positions": incomplete,
        "equity_curve": equity_curve, "trades": audit,
    }
