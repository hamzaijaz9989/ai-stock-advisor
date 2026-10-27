"""Transparent recommendation gates and position-sizing helpers.

These functions enforce risk/data rules; they do not predict returns or guarantee outcomes.
"""

from __future__ import annotations

import math
from dataclasses import dataclass
from enum import StrEnum


class Decision(StrEnum):
    BUY = "BUY"
    WAIT = "WAIT"
    AVOID = "AVOID"
    INSUFFICIENT_EVIDENCE = "INSUFFICIENT EVIDENCE"


@dataclass(frozen=True)
class RecommendationInputs:
    quote_current: bool
    valuation_available: bool
    earnings_date_verified: bool
    material_news_reviewed: bool
    fundamentals_pass: bool
    valuation_pass: bool
    event_risk_acceptable: bool
    reward_risk: float | None
    thesis_broken: bool = False


def risk_budget(capital: float, risk_fraction: float = 0.01) -> float | None:
    """Return planned dollar risk; default is 1% of capital."""
    if not math.isfinite(capital) or not math.isfinite(risk_fraction):
        return None
    if capital <= 0 or not 0 < risk_fraction <= 0.02:
        return None
    return capital * risk_fraction


def position_size(
    capital: float,
    entry_price: float,
    invalidation_price: float,
    *,
    risk_fraction: float = 0.01,
    max_allocation_fraction: float = 1.0,
    fractional_shares: bool = False,
) -> dict[str, float | int | None]:
    """Size a position from risk budget and price-to-invalidation distance.

    Returns no size for invalid levels. Gap risk, fees, slippage, and execution
    constraints can make realized losses exceed the planned risk.
    """
    values = (capital, entry_price, invalidation_price, max_allocation_fraction)
    if not all(math.isfinite(v) for v in values):
        return {"shares": None, "dollars": None, "planned_risk": None}
    if capital <= 0 or entry_price <= 0 or invalidation_price <= 0:
        return {"shares": None, "dollars": None, "planned_risk": None}
    if invalidation_price >= entry_price or not 0 < max_allocation_fraction <= 1:
        return {"shares": None, "dollars": None, "planned_risk": None}
    budget = risk_budget(capital, risk_fraction)
    if budget is None:
        return {"shares": None, "dollars": None, "planned_risk": None}

    per_share_risk = entry_price - invalidation_price
    risk_limited_shares = budget / per_share_risk
    allocation_limited_shares = capital * max_allocation_fraction / entry_price
    raw_shares = min(risk_limited_shares, allocation_limited_shares)
    shares: float | int = raw_shares if fractional_shares else math.floor(raw_shares)
    if shares <= 0:
        return {"shares": 0, "dollars": 0.0, "planned_risk": 0.0}
    dollars = shares * entry_price
    planned_risk = shares * per_share_risk
    return {"shares": shares, "dollars": dollars, "planned_risk": planned_risk}


def reward_to_risk(
    entry_price: float, target_price: float, invalidation_price: float
) -> float | None:
    """Return upside/downside ratio if all levels are valid for a long position."""
    if not all(math.isfinite(x) for x in (entry_price, target_price, invalidation_price)):
        return None
    if invalidation_price >= entry_price or target_price <= entry_price:
        return None
    return (target_price - entry_price) / (entry_price - invalidation_price)


def decide(inputs: RecommendationInputs) -> tuple[Decision, tuple[str, ...]]:
    """Apply conservative gates; missing evidence never becomes a BUY."""
    if inputs.thesis_broken:
        return Decision.AVOID, ("The investment thesis is marked as broken; reassess before considering entry.",)

    required = {
        "current quote is not verified": inputs.quote_current,
        "valuation inputs are unavailable": inputs.valuation_available,
        "earnings date is not verified": inputs.earnings_date_verified,
        "material news has not been reviewed": inputs.material_news_reviewed,
    }
    missing = [reason for reason, passed in required.items() if not passed]
    if missing:
        return Decision.INSUFFICIENT_EVIDENCE, tuple(missing)

    if not inputs.fundamentals_pass:
        return Decision.AVOID, ("Fundamental quality checks did not pass.",)
    if not inputs.valuation_pass:
        return Decision.WAIT, ("Current price does not pass the valuation rule.",)
    if not inputs.event_risk_acceptable:
        return Decision.WAIT, ("Event risk is too high or too close for the current setup.",)
    if inputs.reward_risk is None or not math.isfinite(inputs.reward_risk):
        return Decision.INSUFFICIENT_EVIDENCE, ("Reward/risk cannot be calculated from valid price levels.",)
    if inputs.reward_risk < 2.0:
        return Decision.WAIT, ("Estimated upside is less than twice the downside to invalidation.",)

    return Decision.BUY, ("All configured evidence and risk gates passed; outcomes remain uncertain.",)
