"""Transparent scenario valuation helpers; outputs are estimates, not forecasts."""

from __future__ import annotations

import math


def dcf_equity_value_per_share(
    *,
    starting_free_cash_flow: float,
    shares_outstanding: float,
    growth_rates: tuple[float, ...],
    discount_rate: float,
    terminal_growth_rate: float,
    net_cash: float = 0.0,
) -> float | None:
    """Estimate per-share equity value from an explicit FCF forecast.

    starting_free_cash_flow is the most recent annual FCF in currency units.
    growth_rates contains one annual growth assumption per forecast year.
    net_cash is cash minus debt; it may be negative. This simplified model
    does not model changing share count, stock-based compensation, or cycles.
    """
    values = (starting_free_cash_flow, shares_outstanding, discount_rate, terminal_growth_rate, net_cash)
    if not all(math.isfinite(value) for value in values):
        return None
    if not growth_rates or not all(math.isfinite(rate) for rate in growth_rates):
        return None
    if starting_free_cash_flow <= 0 or shares_outstanding <= 0:
        return None
    if discount_rate <= terminal_growth_rate or terminal_growth_rate < -0.05:
        return None
    if discount_rate <= 0 or discount_rate > 0.5:
        return None
    if any(rate <= -1 or rate > 1 for rate in growth_rates):
        return None

    cash_flow = starting_free_cash_flow
    present_value = 0.0
    for year, growth in enumerate(growth_rates, start=1):
        cash_flow *= 1 + growth
        present_value += cash_flow / ((1 + discount_rate) ** year)

    terminal_value = cash_flow * (1 + terminal_growth_rate) / (discount_rate - terminal_growth_rate)
    present_value += terminal_value / ((1 + discount_rate) ** len(growth_rates))
    equity_value = present_value + net_cash
    if not math.isfinite(equity_value) or equity_value <= 0:
        return None
    return equity_value / shares_outstanding


def margin_of_safety(fair_value_per_share: float, market_price: float) -> float | None:
    """Return discount to fair value as a decimal; negative means price exceeds value."""
    if not all(math.isfinite(value) for value in (fair_value_per_share, market_price)):
        return None
    if fair_value_per_share <= 0 or market_price <= 0:
        return None
    return 1 - market_price / fair_value_per_share


def scenario_valuation(
    bear_value: float | None,
    base_value: float | None,
    bull_value: float | None,
) -> dict[str, float] | None:
    """Validate ordered bear/base/bull per-share scenario values."""
    values = (bear_value, base_value, bull_value)
    if any(value is None or not math.isfinite(value) or value <= 0 for value in values):
        return None
    bear, base, bull = values
    if not bear <= base <= bull:
        return None
    return {"bear": float(bear), "base": float(base), "bull": float(bull)}
