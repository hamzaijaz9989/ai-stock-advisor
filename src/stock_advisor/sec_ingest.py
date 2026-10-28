"""Auditable SEC EDGAR ingestion for point-in-time historical research.

This adapter collects source records; it deliberately does not infer a fact's
availability timestamp from its fiscal period or filed date. Facts without an
exact accession acceptance timestamp remain explicitly unavailable for
intraday point-in-time eligibility until independently reconciled.
"""
from __future__ import annotations

import gzip
import json
import os
import time
from collections.abc import Callable, Mapping
from datetime import UTC, date, datetime
from pathlib import Path
from typing import Any
from urllib.error import HTTPError, URLError
from urllib.request import Request, urlopen

SEC_TICKERS_URL = "https://www.sec.gov/files/company_tickers.json"
SEC_SUBMISSIONS_URL = "https://data.sec.gov/submissions/CIK{cik}.json"
SEC_COMPANYFACTS_URL = "https://data.sec.gov/api/xbrl/companyfacts/CIK{cik}.json"
DEFAULT_USER_AGENT = "NorthstarAI research contact: ihamzaij681@gmail.com"


class SecDataError(RuntimeError):
    """Raised when an SEC response is unavailable or invalid."""


def _parse_date(value: str, field: str) -> date:
    try:
        return date.fromisoformat(value[:10])
    except (TypeError, ValueError) as exc:
        raise ValueError(f"{field} must be an ISO date (YYYY-MM-DD).") from exc


def _fetch_json(url: str, *, user_agent: str, timeout: float = 30.0) -> Any:
    request = Request(url, headers={
        "User-Agent": user_agent,
        "Accept": "application/json",
        "Accept-Encoding": "gzip, deflate",
    })
    try:
        with urlopen(request, timeout=timeout) as response:
            body = response.read()
            # Some SEC endpoints return gzip-compressed bytes. urllib does not
            # transparently decompress this response body.
            if body.startswith(bytes((0x1F, 0x8B))):
                body = gzip.decompress(body)
            return json.loads(body.decode("utf-8"))
    except (HTTPError, URLError, TimeoutError, OSError, UnicodeDecodeError, json.JSONDecodeError) as exc:
        raise SecDataError(f"SEC request failed for {url}: {exc}") from exc


def _acceptance_by_accession(submissions: Mapping[str, Any]) -> dict[str, str]:
    recent = submissions.get("filings", {}).get("recent", {})
    accessions = recent.get("accessionNumber", [])
    accepted = recent.get("acceptanceDateTime", [])
    result: dict[str, str] = {}
    for index, accession in enumerate(accessions):
        if index >= len(accepted):
            continue
        timestamp = accepted[index]
        if isinstance(accession, str) and isinstance(timestamp, str) and timestamp:
            try:
                parsed = datetime.fromisoformat(timestamp)
            except ValueError:
                continue
            if parsed.tzinfo is not None and parsed.utcoffset() is not None:
                result[accession] = parsed.isoformat()
    return result


def _filings_from_submissions(
    submissions: Mapping[str, Any], acceptance: Mapping[str, str], cutoff: date
) -> list[dict[str, Any]]:
    recent = submissions.get("filings", {}).get("recent", {})
    keys = (
        "accessionNumber", "filingDate", "reportDate", "form", "primaryDocument",
        "primaryDocDescription",
    )
    lengths = [len(recent.get(key, [])) for key in keys]
    count = min(lengths, default=0)
    rows: list[dict[str, Any]] = []
    for index in range(count):
        filed = recent["filingDate"][index]
        if not isinstance(filed, str) or _parse_date(filed, "filingDate") > cutoff:
            continue
        accession = recent["accessionNumber"][index]
        rows.append({
            "accession": accession,
            "filed_date": filed,
            "report_date": recent["reportDate"][index] or None,
            "form": recent["form"][index],
            "primary_document": recent["primaryDocument"][index] or None,
            "primary_document_description": recent["primaryDocDescription"][index] or None,
            "available_at": acceptance.get(accession),
            "availability_timestamp_verified": accession in acceptance,
        })
    return rows


def _facts_from_companyfacts(
    companyfacts: Mapping[str, Any], acceptance: Mapping[str, str], cutoff: date
) -> list[dict[str, Any]]:
    """Flatten SEC XBRL facts while preserving source accession and reporting context."""
    facts: list[dict[str, Any]] = []
    namespaces = companyfacts.get("facts", {})
    if not isinstance(namespaces, Mapping):
        return facts
    for namespace, concepts in namespaces.items():
        if not isinstance(concepts, Mapping):
            continue
        for concept, definition in concepts.items():
            if not isinstance(definition, Mapping):
                continue
            units = definition.get("units", {})
            if not isinstance(units, Mapping):
                continue
            for unit, observations in units.items():
                if not isinstance(observations, list):
                    continue
                for observation in observations:
                    if not isinstance(observation, Mapping):
                        continue
                    filed = observation.get("filed")
                    accession = observation.get("accn")
                    if not isinstance(filed, str) or _parse_date(filed, "fact.filed") > cutoff:
                        continue
                    if not isinstance(accession, str):
                        accession = None
                    accepted_at = acceptance.get(accession) if accession else None
                    facts.append({
                        "namespace": namespace,
                        "concept": concept,
                        "label": definition.get("label"),
                        "unit": unit,
                        "value": observation.get("val"),
                        "period_start": observation.get("start"),
                        "period_end": observation.get("end"),
                        "fiscal_year": observation.get("fy"),
                        "fiscal_period": observation.get("fp"),
                        "form": observation.get("form"),
                        "filed_date": filed,
                        "accession": accession,
                        "available_at": accepted_at,
                        "availability_timestamp_verified": accepted_at is not None,
                    })
    facts.sort(key=lambda row: (
        row["filed_date"], row["namespace"], row["concept"], row["period_end"] or "",
        row["accession"] or "",
    ))
    return facts


def collect_company(
    ticker: str,
    ticker_index: Mapping[str, Any],
    fetch_json: Callable[[str], Any],
    *,
    cutoff: date,
) -> dict[str, Any]:
    """Collect one issuer's SEC submissions and facts up to the requested filing date."""
    normalized = ticker.strip().upper()
    entries = ticker_index.values() if isinstance(ticker_index, Mapping) else ticker_index
    match = next((
        item for item in entries
        if isinstance(item, Mapping) and str(item.get("ticker", "")).strip().upper() == normalized
    ), None)
    if not match:
        raise ValueError(f"Ticker {normalized!r} was not found in the SEC ticker index.")
    cik_raw = match.get("cik_str")
    if not isinstance(cik_raw, int) or cik_raw <= 0:
        raise ValueError(f"SEC ticker index has an invalid CIK for {normalized}.")
    cik = f"{cik_raw:010d}"
    submissions = fetch_json(SEC_SUBMISSIONS_URL.format(cik=cik))
    companyfacts = fetch_json(SEC_COMPANYFACTS_URL.format(cik=cik))
    if not isinstance(submissions, Mapping) or not isinstance(companyfacts, Mapping):
        raise SecDataError(f"SEC returned an unexpected response for {normalized}.")
    acceptance = _acceptance_by_accession(submissions)
    filings = _filings_from_submissions(submissions, acceptance, cutoff)
    facts = _facts_from_companyfacts(companyfacts, acceptance, cutoff)
    return {
        "ticker": normalized,
        "cik": cik,
        "company_name": match.get("title"),
        "source": "SEC EDGAR",
        "cutoff_filing_date": cutoff.isoformat(),
        "retrieved_at_utc": datetime.now(UTC).isoformat(),
        "filings": filings,
        "facts": facts,
        "quality": {
            "official_source": True,
            "fact_values_preserved_as_reported": True,
            "exact_acceptance_timestamp_coverage": sum(
                bool(row["availability_timestamp_verified"]) for row in facts
            ),
            "facts_missing_exact_acceptance_timestamp": sum(
                not row["availability_timestamp_verified"] for row in facts
            ),
            "historical_index_membership_included": False,
            "prices_included": False,
            "news_and_earnings_calendar_included": False,
            "eligible_as_complete_strategy_dataset": False,
        },
        "limitations": [
            "This is a source-ingestion bundle, not a complete strategy snapshot.",
            "SEC companyfacts may contain multiple contexts and later amendments; select facts by accession and availability timestamp before use.",
            "Facts without exact acceptance timestamps must not be used in timestamp-sensitive historical signals.",
            "The SEC feed does not provide daily prices, historical universe membership, timestamped news, or a complete earnings calendar.",
            "Filing history is limited to the recent submissions array; older archive files are not ingested by this initial version.",
        ],
    }


def collect_dataset(
    tickers: list[str],
    *,
    cutoff: date,
    user_agent: str | None = None,
    fetch_json: Callable[[str], Any] | None = None,
    request_delay_seconds: float = 0.12,
) -> dict[str, Any]:
    if not tickers:
        raise ValueError("At least one ticker is required.")
    if request_delay_seconds < 0:
        raise ValueError("Request delay cannot be negative.")
    agent = user_agent or os.environ.get("SEC_USER_AGENT", DEFAULT_USER_AGENT)
    getter = fetch_json or (lambda url: _fetch_json(url, user_agent=agent))
    ticker_index = getter(SEC_TICKERS_URL)
    if not isinstance(ticker_index, Mapping):
        raise SecDataError("SEC ticker index response was not an object.")
    companies: list[dict[str, Any]] = []
    for index, ticker in enumerate(dict.fromkeys(item.strip().upper() for item in tickers if item.strip())):
        if index:
            time.sleep(request_delay_seconds)
        companies.append(collect_company(ticker, ticker_index, getter, cutoff=cutoff))
    if not companies:
        raise ValueError("At least one non-empty ticker is required.")
    return {
        "schema_version": 1,
        "provider": "SEC EDGAR",
        "cutoff_filing_date": cutoff.isoformat(),
        "created_at_utc": datetime.now().astimezone().isoformat(),
        "companies": companies,
        "decision_eligible": False,
        "note": "Raw source bundle only. Never interpret as a validated signal dataset.",
    }


def write_dataset(dataset: Mapping[str, Any], output: str | Path) -> None:
    path = Path(output)
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(dataset, indent=2, allow_nan=False) + "\n", encoding="utf-8")
