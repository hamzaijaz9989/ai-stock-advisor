"""Small, cautious client for the SEC's public EDGAR data APIs.

Official API docs: https://www.sec.gov/edgar/sec-api-documentation
Configure SEC_USER_AGENT with an app name and contact email before requests.
"""

from __future__ import annotations

import json
import os
import re
from dataclasses import dataclass
from typing import Any
from urllib.error import HTTPError, URLError
from urllib.request import Request, urlopen

SEC_DATA_BASE = "https://data.sec.gov"
_CIK_RE = re.compile(r"^\d{1,10}$")


class SECDataError(RuntimeError):
    """Raised when SEC data cannot be safely retrieved or interpreted."""


@dataclass(frozen=True)
class SECClient:
    """Minimal SEC client. Cache responses and respect SEC fair-access guidance."""

    user_agent: str | None = None
    timeout_seconds: float = 20.0

    def _headers(self) -> dict[str, str]:
        agent = self.user_agent or os.getenv("SEC_USER_AGENT")
        if not agent or "@" not in agent:
            raise SECDataError(
                "Set SEC_USER_AGENT to a descriptive app name and contact email "
                "before calling the SEC API."
            )
        return {"User-Agent": agent, "Accept": "application/json"}

    @staticmethod
    def normalize_cik(cik: str | int) -> str:
        raw = str(cik).strip()
        if not _CIK_RE.fullmatch(raw):
            raise ValueError("CIK must contain 1 to 10 digits.")
        return raw.zfill(10)

    def _get_json(self, url: str) -> dict[str, Any]:
        request = Request(url, headers=self._headers(), method="GET")
        try:
            with urlopen(request, timeout=self.timeout_seconds) as response:
                status = getattr(response, "status", 200)
                if status != 200:
                    raise SECDataError(f"SEC API returned HTTP {status}.")
                payload = json.loads(response.read().decode("utf-8"))
        except HTTPError as exc:
            raise SECDataError(f"SEC API returned HTTP {exc.code}.") from exc
        except (URLError, TimeoutError, OSError) as exc:
            raise SECDataError("Unable to reach SEC API.") from exc
        except (UnicodeDecodeError, json.JSONDecodeError) as exc:
            raise SECDataError("SEC API returned invalid JSON.") from exc
        if not isinstance(payload, dict):
            raise SECDataError("SEC API response was not a JSON object.")
        return payload

    def company_submissions(self, cik: str | int) -> dict[str, Any]:
        """Fetch filing history from the official SEC submissions endpoint."""
        normalized = self.normalize_cik(cik)
        return self._get_json(f"{SEC_DATA_BASE}/submissions/CIK{normalized}.json")

    def company_facts(self, cik: str | int) -> dict[str, Any]:
        """Fetch XBRL company facts; preserve filing/publication dates."""
        normalized = self.normalize_cik(cik)
        return self._get_json(
            f"{SEC_DATA_BASE}/api/xbrl/companyfacts/CIK{normalized}.json"
        )

    @staticmethod
    def extract_facts(
        payload: dict[str, Any],
        concepts: tuple[str, ...] = ("Revenue", "Revenues", "NetIncomeLoss"),
    ) -> list[dict[str, Any]]:
        """Extract selected US-GAAP observations with source-period metadata.

        Does not guess between tags, aggregate quarters, or infer publication
        dates from period ends. Those require explicit, separately tested logic.
        """
        facts = payload.get("facts")
        if not isinstance(facts, dict):
            raise SECDataError("Company facts payload has no valid facts object.")
        us_gaap = facts.get("us-gaap", {})
        if not isinstance(us_gaap, dict):
            raise SECDataError("Company facts payload has invalid us-gaap data.")

        rows: list[dict[str, Any]] = []
        for concept in concepts:
            item = us_gaap.get(concept)
            if not isinstance(item, dict):
                continue
            units = item.get("units", {})
            if not isinstance(units, dict):
                continue
            for unit, observations in units.items():
                if not isinstance(observations, list):
                    continue
                for obs in observations:
                    if not isinstance(obs, dict):
                        continue
                    filed, end, value = obs.get("filed"), obs.get("end"), obs.get("val")
                    if filed is None or end is None or value is None:
                        continue
                    rows.append({
                        "concept": concept,
                        "label": item.get("label"),
                        "unit": unit,
                        "value": value,
                        "period_start": obs.get("start"),
                        "period_end": end,
                        "filed": filed,
                        "form": obs.get("form"),
                        "fiscal_year": obs.get("fy"),
                        "fiscal_period": obs.get("fp"),
                        "frame": obs.get("frame"),
                        "accession_number": obs.get("accn"),
                        "source": "SEC EDGAR Company Facts API",
                    })
        rows.sort(key=lambda row: (row["filed"], row["period_end"], row["concept"]))
        return rows
