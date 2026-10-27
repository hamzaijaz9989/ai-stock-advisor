"""Ticker-to-CIK lookup using the SEC's published company ticker mapping."""

from __future__ import annotations

from dataclasses import dataclass
from typing import Any

from .sec import SECClient, SECDataError

TICKER_MAPPING_URL = "https://www.sec.gov/files/company_tickers_exchange.json"


@dataclass(frozen=True)
class CompanyIdentity:
    ticker: str
    cik: str
    name: str
    exchange: str | None = None


class CompanyLookup:
    """Resolve a ticker from the SEC mapping; cache the mapping at the app layer."""

    def __init__(self, client: SECClient | None = None) -> None:
        self.client = client or SECClient()

    def all_companies(self) -> list[CompanyIdentity]:
        payload = self.client._get_json(TICKER_MAPPING_URL)
        rows: list[CompanyIdentity] = []

        # The exchange mapping is published as a list of records. Fail closed
        # if the schema changes rather than returning misleading identities.
        if isinstance(payload, list):
            records: Any = payload
        elif isinstance(payload, dict):
            records = payload.get("data", payload)
            if isinstance(records, dict):
                records = list(records.values())
        else:
            raise SECDataError("SEC ticker mapping has an unexpected structure.")

        if not isinstance(records, list):
            raise SECDataError("SEC ticker mapping has an unexpected structure.")

        for item in records:
            if not isinstance(item, dict):
                continue
            ticker = item.get("ticker") or item.get("symbol")
            cik = item.get("cik") or item.get("cik_str")
            name = item.get("name") or item.get("title")
            exchange = item.get("exchange")
            if not isinstance(ticker, str) or not isinstance(name, str) or cik is None:
                continue
            try:
                normalized_cik = SECClient.normalize_cik(cik)
            except (ValueError, TypeError):
                continue
            rows.append(
                CompanyIdentity(
                    ticker=ticker.strip().upper(),
                    cik=normalized_cik,
                    name=name.strip(),
                    exchange=exchange.strip() if isinstance(exchange, str) else None,
                )
            )
        if not rows:
            raise SECDataError("SEC ticker mapping contained no usable company records.")
        return rows

    def lookup(self, ticker: str) -> CompanyIdentity:
        normalized = ticker.strip().upper()
        if not normalized or any(ch.isspace() for ch in normalized):
            raise ValueError("Ticker must be a non-empty symbol without spaces.")
        matches = [company for company in self.all_companies() if company.ticker == normalized]
        if not matches:
            raise LookupError(f"No SEC ticker mapping found for {normalized}.")
        # Exchange-specific data can contain multiple listings for a symbol.
        # Do not guess when multiple distinct issuers are returned.
        identities = {(company.cik, company.name) for company in matches}
        if len(identities) > 1:
            raise LookupError(
                f"Ticker {normalized} maps to multiple SEC issuers; choose a company explicitly."
            )
        return matches[0]
