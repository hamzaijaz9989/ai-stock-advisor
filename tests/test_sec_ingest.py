from datetime import date
import gzip
import json

import pytest

from stock_advisor.sec_ingest import (
    SEC_COMPANYFACTS_URL,
    SEC_SUBMISSIONS_URL,
    SEC_TICKERS_URL,
    collect_company,
    collect_dataset,
    _fetch_json,
)


@pytest.fixture
def sec_responses():
    return {
        SEC_TICKERS_URL: {
            "0": {"cik_str": 320193, "ticker": "AAPL", "title": "Apple Inc."},
        },
        SEC_SUBMISSIONS_URL.format(cik="0000320193"): {
            "filings": {
                "recent": {
                    "accessionNumber": ["0000320193-25-000010", "0000320193-25-000011"],
                    "filingDate": ["2025-02-01", "2025-03-01"],
                    "reportDate": ["2024-12-28", "2025-01-25"],
                    "form": ["10-Q", "8-K"],
                    "primaryDocument": ["quarter.htm", "event.htm"],
                    "primaryDocDescription": ["Quarterly report", "Current report"],
                    "acceptanceDateTime": ["2025-02-01T16:30:00.000Z", "2025-03-01T15:01:00.000Z"],
                },
                "files": [],
            }
        },
        SEC_COMPANYFACTS_URL.format(cik="0000320193"): {
            "facts": {
                "us-gaap": {
                    "Revenues": {
                        "label": "Revenue",
                        "units": {
                            "USD": [
                                {
                                    "val": 1000,
                                    "start": "2024-10-01",
                                    "end": "2024-12-28",
                                    "fy": 2025,
                                    "fp": "Q1",
                                    "form": "10-Q",
                                    "filed": "2025-02-01",
                                    "accn": "0000320193-25-000010",
                                },
                                {
                                    "val": 9999,
                                    "start": "2025-01-01",
                                    "end": "2025-03-31",
                                    "fy": 2025,
                                    "fp": "Q2",
                                    "form": "10-Q",
                                    "filed": "2025-04-20",
                                    "accn": "0000320193-25-000012",
                                },
                            ]
                        },
                    }
                }
            }
        },
    }


def test_collect_company_preserves_acceptance_time_and_excludes_future_filed_facts(sec_responses):
    company = collect_company(
        "AAPL", sec_responses[SEC_TICKERS_URL], lambda url: sec_responses[url], cutoff=date(2025, 2, 28)
    )
    assert company["cik"] == "0000320193"
    assert len(company["filings"]) == 1
    assert company["facts"][0]["value"] == 1000
    assert company["facts"][0]["available_at"] == "2025-02-01T16:30:00+00:00"
    assert company["quality"]["eligible_as_complete_strategy_dataset"] is False
    assert company["quality"]["prices_included"] is False


def test_missing_acceptance_timestamp_is_explicitly_unverified(sec_responses):
    submissions_url = SEC_SUBMISSIONS_URL.format(cik="0000320193")
    sec_responses[submissions_url]["filings"]["recent"]["acceptanceDateTime"] = []
    company = collect_company(
        "AAPL", sec_responses[SEC_TICKERS_URL], lambda url: sec_responses[url], cutoff=date(2025, 2, 28)
    )
    assert company["facts"][0]["available_at"] is None
    assert company["facts"][0]["availability_timestamp_verified"] is False
    assert company["quality"]["facts_missing_exact_acceptance_timestamp"] == 1


def test_unknown_ticker_fails_closed(sec_responses):
    with pytest.raises(ValueError, match="not found"):
        collect_company("NOTATICKER", sec_responses[SEC_TICKERS_URL], lambda url: sec_responses[url], cutoff=date(2025, 2, 28))


def test_dataset_requires_symbols():
    with pytest.raises(ValueError, match="At least one ticker"):
        collect_dataset([], cutoff=date(2025, 2, 28), fetch_json=lambda _url: {})


def test_dataset_deduplicates_tickers_and_sets_not_decision_eligible(sec_responses):
    dataset = collect_dataset(
        ["AAPL", "aapl", " AAPL "],
        cutoff=date(2025, 2, 28),
        fetch_json=lambda url: sec_responses[url],
        request_delay_seconds=0,
    )
    assert len(dataset["companies"]) == 1
    assert dataset["decision_eligible"] is False



def test_fetch_json_decompresses_gzip_response(monkeypatch):
    class FakeResponse:
        def __enter__(self):
            return self

        def __exit__(self, *_args):
            return False

        def read(self):
            return gzip.compress(json.dumps({"ok": True}).encode("utf-8"))

    monkeypatch.setattr("stock_advisor.sec_ingest.urlopen", lambda *_args, **_kwargs: FakeResponse())
    assert _fetch_json("https://example.test/data.json", user_agent="Northstar test") == {"ok": True}
