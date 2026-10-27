"""Deterministic financial metrics with explicit handling of invalid inputs.

These helpers calculate descriptive metrics only. They do not generate buy/sell
recommendations or infer probabilities of investment success.
"""

from __future__ import annotations

import math
from collections.abc import Sequence


def _finite_number(value: float | None) -> float | None:
    """Return a finite float or None for missing, non-numeric, or infinite values."""
    if value is None or isinstance(value, bool):
        return None
    try:
        number = float(value)
    except (TypeError, ValueError):
        return None
    return number if math.isfinite(number) else None


def percentage_change(current: float | None, previous: float | None) -> float | None:
    """Return percentage change, e.g. 0.10 for +10%; None if undefined.

    A zero or negative previous value is rejected because ordinary growth rates
    are misleading when the denominator is zero or changes sign.
    """
    now = _finite_number(current)
    before = _finite_number(previous)
    if now is None or before is None or before <= 0:
        return None
    return (now - before) / before


def margin(numerator: float | None, denominator: float | None) -> float | None:
    """Return numerator / denominator when both are finite and denominator > 0."""
    top = _finite_number(numerator)
    bottom = _finite_number(denominator)
    if top is None or bottom is None or bottom <= 0:
        return None
    return top / bottom


def net_debt(
    total_debt: float | None, cash_and_equivalents: float | None
) -> float | None:
    """Return total debt minus cash; reject missing or negative source values."""
    debt = _finite_number(total_debt)
    cash = _finite_number(cash_and_equivalents)
    if debt is None or cash is None or debt < 0 or cash < 0:
        return None
    return debt - cash


def compound_annual_growth_rate(
    start_value: float | None, end_value: float | None, years: float | None
) -> float | None:
    """Calculate CAGR as a decimal; require positive endpoints and duration."""
    start = _finite_number(start_value)
    end = _finite_number(end_value)
    duration = _finite_number(years)
    if (
        start is None
        or end is None
        or duration is None
        or start <= 0
        or end <= 0
        or duration <= 0
    ):
        return None
    return (end / start) ** (1 / duration) - 1


def weighted_score(
    components: Sequence[tuple[float | None, float]],
    *,
    minimum_coverage: float = 0.8,
) -> float | None:
    """Calculate a 0–100 weighted score only when enough weight is observed.

    Each component is (score, weight). Scores must be in [0, 100], weights
    must be finite and non-negative, and weights must sum to approximately 1.
    Missing scores are excluded from the weighted mean, but insufficient
    observed weight returns None instead of a misleading score.
    """
    coverage_threshold = _finite_number(minimum_coverage)
    if coverage_threshold is None or not 0 < coverage_threshold <= 1:
        raise ValueError("minimum_coverage must be in (0, 1]")

    total_weight = 0.0
    observed_weight = 0.0
    weighted_total = 0.0

    for raw_score, raw_weight in components:
        weight = _finite_number(raw_weight)
        if weight is None or weight < 0:
            raise ValueError("weights must be finite and non-negative")
        total_weight += weight

        score = _finite_number(raw_score)
        if score is None:
            continue
        if not 0 <= score <= 100:
            raise ValueError("scores must be between 0 and 100")
        observed_weight += weight
        weighted_total += score * weight

    if not math.isclose(total_weight, 1.0, rel_tol=0, abs_tol=1e-6):
        raise ValueError("weights must sum to 1.0")
    if observed_weight < coverage_threshold:
        return None
    if observed_weight == 0:
        return None

    return weighted_total / observed_weight
