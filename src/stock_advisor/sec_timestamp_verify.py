"""Verify a bounded SEC filing sample against SEC filing-index header pages.

The filing-index header's ACCEPTANCE-DATETIME is converted from SEC Eastern time to UTC.
This verifies filing acceptance time, not the exact moment the filing became
publicly retrievable on sec.gov. The dataset remains decision-ineligible.
"""
from __future__ import annotations

import gzip
import json
import os
import re
import time
from collections.abc import Callable, Mapping
from datetime import UTC, date, datetime
from pathlib import Path
from typing import Any
from urllib.error import HTTPError, URLError
from urllib.request import Request, urlopen
from zoneinfo import ZoneInfo

from stock_advisor.sec_ingest import DEFAULT_USER_AGENT, SecDataError

SEC_ARCHIVES = "https://www.sec.gov/Archives/edgar/data"
EASTERN = ZoneInfo("America/New_York")
ACCESSION_RE = re.compile(r"(?:<ACCESSION-NUMBER>\s*|ACCESSION NUMBER:\s*)([0-9-]+)", re.IGNORECASE)
ACCEPTANCE_RE = re.compile(r"<ACCEPTANCE-DATETIME>\s*(\d{14})", re.IGNORECASE)
FILED_RE = re.compile(r"(?:<FILED AS OF DATE>\s*|FILED AS OF DATE:\s*)(\d{8})", re.IGNORECASE)


class TimestampVerificationError(RuntimeError):
    """Raised when a source request fails or the bundle is malformed."""


def parse_sec_header(text: str, expected_accession: str, expected_filed_date: str) -> dict[str, Any]:
    """Parse and validate an SEC filing-index header for one accession."""
    accession_match = ACCESSION_RE.search(text[:200_000])
    accepted_match = ACCEPTANCE_RE.search(text[:200_000])
    filed_match = FILED_RE.search(text[:200_000])
    if not accession_match or not accepted_match or not filed_match:
        return {"verified": False, "reason": "required_header_fields_missing"}
    accession = accession_match.group(1).strip()
    if accession != expected_accession:
        return {"verified": False, "reason": "accession_mismatch", "header_accession": accession}
    try:
        filed = datetime.strptime(filed_match.group(1), "%Y%m%d").date()
        accepted_local = datetime.strptime(accepted_match.group(1), "%Y%m%d%H%M%S").replace(tzinfo=EASTERN)
        expected_filed = date.fromisoformat(expected_filed_date[:10])
    except ValueError:
        return {"verified": False, "reason": "header_date_invalid"}
    if filed != expected_filed or accepted_local.date() != filed:
        return {
            "verified": False,
            "reason": "filing_date_conflict",
            "header_filed_date": filed.isoformat(),
            "header_acceptance_date": accepted_local.date().isoformat(),
        }
    accepted_utc = accepted_local.astimezone(UTC).isoformat()
    return {
        "verified": True,
        "acceptance_at": accepted_utc,
        "acceptance_timestamp_verified": True,
        "acceptance_datetime_eastern": accepted_local.isoformat(),
        "header_filed_date": filed.isoformat(),
        "timestamp_provenance": "sec_filing_index_header_acceptance_datetime",
    }


def _fetch_text(url: str, *, user_agent: str, timeout: float = 30.0) -> str:
    request = Request(url, headers={
        "User-Agent": user_agent,
        "Accept": "text/plain, */*",
        "Accept-Encoding": "gzip, deflate",
    })
    try:
        with urlopen(request, timeout=timeout) as response:
            body = response.read()
            if body.startswith(bytes((0x1F, 0x8B))):
                body = gzip.decompress(body)
            return body.decode("utf-8", errors="replace")
    except (HTTPError, URLError, TimeoutError, OSError, UnicodeDecodeError) as exc:
        raise SecDataError(f"SEC filing-header request failed for {url}: {exc}") from exc


def _header_url(cik: str, accession: str) -> str:
    digits = re.sub(r"\D", "", accession)
    cik_digits = re.sub(r"\D", "", cik)
    if len(digits) != 18 or not cik_digits or not accession:
        raise ValueError("Invalid CIK or accession number in SEC bundle.")
    return f"{SEC_ARCHIVES}/{int(cik_digits)}/{digits}/{accession}-index-headers.html"


def verify_dataset(
    dataset: Mapping[str, Any],
    *,
    fetch_text: Callable[[str], str] | None = None,
    user_agent: str | None = None,
    max_filings_per_company: int = 100,
    request_delay_seconds: float = 0.12,
) -> dict[str, Any]:
    """Verify up to N latest filings per company; propagate verified times to facts."""
    if max_filings_per_company < 1:
        raise ValueError("max_filings_per_company must be at least 1.")
    if request_delay_seconds < 0:
        raise ValueError("request_delay_seconds cannot be negative.")
    companies = dataset.get("companies")
    if not isinstance(companies, list):
        raise TypeError("Dataset must contain a companies list.")
    getter = fetch_text or (lambda url: _fetch_text(url, user_agent=(
        user_agent or os.environ.get("SEC_USER_AGENT", DEFAULT_USER_AGENT)
    )))
    result = json.loads(json.dumps(dataset))
    totals = {"attempted": 0, "verified": 0, "blocked": 0, "facts_acceptance_verified": 0}
    for company in result["companies"]:
        if not isinstance(company, dict):
            continue
        cik = str(company.get("cik", ""))
        filings = company.get("filings", [])
        if not isinstance(filings, list):
            continue
        candidates = sorted(
            (row for row in filings if isinstance(row, dict) and row.get("accession") and row.get("filed_date")),
            key=lambda row: str(row["filed_date"]),
            reverse=True,
        )[:max_filings_per_company]
        verified_by_accession: dict[str, dict[str, Any]] = {}
        for index, filing in enumerate(candidates):
            if index and request_delay_seconds:
                time.sleep(request_delay_seconds)
            accession = str(filing["accession"])
            totals["attempted"] += 1
            try:
                header = getter(_header_url(cik, accession))
                outcome = parse_sec_header(header, accession, str(filing["filed_date"]))
            except (SecDataError, ValueError) as exc:
                outcome = {"verified": False, "reason": "source_fetch_or_input_error", "detail": str(exc)}
            raw_timestamp = filing.get("raw_acceptance_timestamp")
            raw_matches_header = None
            if isinstance(raw_timestamp, str):
                try:
                    raw_parsed = datetime.fromisoformat(raw_timestamp)
                    if raw_parsed.tzinfo is not None and raw_parsed.utcoffset() is not None and outcome.get("verified"):
                        difference = abs((raw_parsed.astimezone(UTC) - datetime.fromisoformat(outcome["acceptance_at"])).total_seconds())
                        raw_matches_header = difference <= 1
                        outcome["raw_timestamp_difference_seconds"] = difference
                except ValueError:
                    raw_matches_header = None
            outcome["raw_timestamp_matches_header"] = raw_matches_header
            filing["acceptance_timestamp_verified"] = bool(outcome.get("verified"))
            filing["acceptance_at"] = outcome.get("acceptance_at") if outcome.get("verified") else None
            # Acceptance time is not the exact time SEC.gov made content public.
            filing["availability_timestamp_verified"] = False
            filing["available_at"] = None
            filing["timestamp_verification"] = outcome
            filing["timestamp_provenance"] = outcome.get("timestamp_provenance", "unverified")
            if outcome.get("verified"):
                verified_by_accession[accession] = outcome
                totals["verified"] += 1
            else:
                totals["blocked"] += 1
        for filing in filings:
            if not isinstance(filing, dict):
                continue
            accession = filing.get("accession")
            if accession in verified_by_accession:
                outcome = verified_by_accession[accession]
                filing["acceptance_timestamp_verified"] = True
                filing["acceptance_at"] = outcome["acceptance_at"]
                filing["availability_timestamp_verified"] = False
                filing["available_at"] = None
                filing["timestamp_provenance"] = outcome["timestamp_provenance"]
        for fact in company.get("facts", []) if isinstance(company.get("facts"), list) else []:
            if not isinstance(fact, dict):
                continue
            outcome = verified_by_accession.get(fact.get("accession"))
            if outcome:
                fact["acceptance_timestamp_verified"] = True
                fact["acceptance_at"] = outcome["acceptance_at"]
                # Do not substitute EDGAR acceptance time for public-web availability.
                fact["availability_timestamp_verified"] = False
                fact["available_at"] = None
                fact["timestamp_provenance"] = outcome["timestamp_provenance"]
                totals["facts_acceptance_verified"] += 1
    result["timestamp_verification"] = {
        **totals,
        "scope": "bounded_latest_filings_per_company",
        "max_filings_per_company": max_filings_per_company,
        "source": "SEC filing-index header",
        "timestamp_semantics": "EDGAR acceptance time converted from America/New_York to UTC; not proof of public web availability time",
    }
    result["decision_eligible"] = False
    result["note"] = (
        "A bounded sample of SEC acceptance timestamps was reconciled against filing-index header pages. "
        "This is not a complete point-in-time strategy dataset; decision_eligible remains false."
    )
    return result


def write_verified_dataset(dataset: Mapping[str, Any], output: str | Path) -> None:
    path = Path(output)
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(dataset, indent=2, allow_nan=False) + "\n", encoding="utf-8")
