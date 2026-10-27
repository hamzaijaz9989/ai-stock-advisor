import pytest

from stock_advisor.sec import SECClient, SECDataError


def test_normalize_cik():
    assert SECClient.normalize_cik("320193") == "0000320193"
    assert SECClient.normalize_cik(320193) == "0000320193"


@pytest.mark.parametrize("value", ["", "abc", "-1", "12345678901", "1.2"])
def test_invalid_cik_rejected(value):
    with pytest.raises(ValueError):
        SECClient.normalize_cik(value)


def test_user_agent_must_identify_contact():
    with pytest.raises(SECDataError, match="SEC_USER_AGENT"):
        SECClient()._headers()
    assert "research@example.com" in SECClient(
        user_agent="AI Stock Advisor research research@example.com"
    )._headers()["User-Agent"]


def test_extract_facts_preserves_filing_date_and_accession():
    payload = {
        "facts": {
            "us-gaap": {
                "Revenues": {
                    "label": "Revenue",
                    "units": {"USD": [{
                        "val": 1000, "end": "2024-12-31", "filed": "2025-02-15",
                        "form": "10-K", "fy": 2024, "fp": "FY",
                        "accn": "0000000000-25-000001",
                    }]},
                }
            }
        }
    }
    rows = SECClient.extract_facts(payload, concepts=("Revenues",))
    assert len(rows) == 1
    assert rows[0]["value"] == 1000
    assert rows[0]["period_end"] == "2024-12-31"
    assert rows[0]["filed"] == "2025-02-15"
    assert rows[0]["accession_number"] == "0000000000-25-000001"


def test_extract_facts_does_not_invent_missing_filed_date():
    payload = {"facts": {"us-gaap": {"Revenues": {"units": {
        "USD": [{"val": 100, "end": "2024-12-31"}]
    }}}}
    assert SECClient.extract_facts(payload, concepts=("Revenues",)) == []


def test_extract_facts_rejects_invalid_payload():
    with pytest.raises(SECDataError):
        SECClient.extract_facts({})
