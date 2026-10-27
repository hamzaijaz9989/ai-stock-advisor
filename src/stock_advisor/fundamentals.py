"""Conservative normalization of SEC company-facts observations.

This module classifies reported observations but does not aggregate quarterly
values, select a preferred XBRL tag, or infer missing values.
"""

from __future__ import annotations

from datetime import date
from typing import Any

# Explicit aliases only. Expand only with tests and evidence that concepts are
# sufficiently comparable across issuers.
STANDARD_CONCEPTS: dict[str, tuple[str, ...]] = {
    "revenue": ("Revenue", "Revenues", "SalesRevenueNet"),
    "net_income": ("NetIncomeLoss", "ProfitLoss"),
    "operating_income": ("OperatingIncomeLoss",),
    "total_assets": ("Assets",),
    "total_liabilities": ("Liabilities",),
    "equity": ("StockholdersEquity", "StockholdersEquityIncludingPortionAttributableToNoncontrollingInterest"),
    "operating_cash_flow": ("NetCashProvidedByUsedInOperatingActivities",),
    "capital_expenditures": ("PaymentsToAcquirePropertyPlantAndEquipment",),
    "cash_and_equivalents": ("CashAndCashEquivalentsAtCarryingValue",),
    "long_term_debt": ("LongTermDebtCurrent", "LongTermDebtNoncurrent"),
}


def _days_between(start: str, end: str) -> int | None:
    try:
        return (date.fromisoformat(end) - date.fromisoformat(start)).days + 1
    except (TypeError, ValueError):
        return None


def classify_period(row: dict[str, Any]) -> str:
    """Return instant, annual, quarterly, other_duration, or unknown."""
    start, end = row.get("period_start"), row.get("period_end")
    if not end:
        return "unknown"
    if not start:
        return "instant"
    days = _days_between(start, end)
    if days is None or days <= 0:
        return "unknown"
    if 330 <= days <= 400:
        return "annual"
    if 70 <= days <= 110:
        return "quarterly"
    return "other_duration"


def normalize_facts(
    rows: list[dict[str, Any]],
    concepts: dict[str, tuple[str, ...]] | None = None,
) -> list[dict[str, Any]]:
    """Map extracted SEC facts to standard metric names without unsafe math.

    A fact's reported start/end, filing date, form, unit and accession are
    retained. The period is classified by duration, not by calendar labels.
    Facts without publication dates or values are discarded rather than
    backfilled. Conflicting aliases remain separate rows for downstream review.
    """
    aliases = concepts or STANDARD_CONCEPTS
    reverse = {
        tag: standard_name
        for standard_name, tags in aliases.items()
        for tag in tags
    }
    normalized: list[dict[str, Any]] = []
    for row in rows:
        tag = row.get("concept")
        standard_name = reverse.get(tag)
        if standard_name is None or row.get("filed") is None or row.get("value") is None:
            continue
        result = dict(row)
        result["metric"] = standard_name
        result["period_start"] = row.get("period_start") or row.get("start")
        result["period_type"] = classify_period(result)
        result["availability_date"] = row["filed"]
        result["normalization_note"] = (
            "Reported observation; no quarter aggregation or alias reconciliation performed."
        )
        normalized.append(result)

    normalized.sort(
        key=lambda row: (
            str(row.get("metric", "")),
            str(row.get("period_end", "")),
            str(row.get("filed", "")),
            str(row.get("concept", "")),
        )
    )
    return normalized
