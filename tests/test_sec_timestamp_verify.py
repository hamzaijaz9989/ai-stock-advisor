from __future__ import annotations

from stock_advisor.sec_timestamp_verify import parse_sec_header, verify_dataset


def header(accession="0000320193-26-000001", accepted="20261027161530", filed="20261027"):
    return (
        "<SEC-DOCUMENT>example.txt\n<SEC-HEADER>example.hdr.sgml\n"
        f"<ACCEPTANCE-DATETIME>{accepted}\n"
        f"<ACCESSION-NUMBER>{accession}\n"
        f"<FILED AS OF DATE>{filed}\n"
    )


def test_parse_sec_header_converts_eastern_daylight_time_to_utc():
    result = parse_sec_header(header(), "0000320193-26-000001", "2026-10-27")
    assert result["verified"] is True
    assert result["acceptance_at"] == "2026-10-27T20:15:30+00:00"
    assert result["timestamp_provenance"] == "sec_filing_index_header_acceptance_datetime"


def test_parse_sec_filing_index_header_field_labels():
    text = (
        "<SEC-HEADER>example-index-headers.html\n"
        "<ACCEPTANCE-DATETIME>20261027161530\n"
        "ACCESSION NUMBER: 0000320193-26-000001\n"
        "FILED AS OF DATE: 20261027\n"
    )
    result = parse_sec_header(text, "0000320193-26-000001", "2026-10-27")
    assert result["verified"] is True
    assert result["acceptance_at"] == "2026-10-27T20:15:30+00:00"


def test_parse_sec_header_blocks_accession_mismatch():
    result = parse_sec_header(header(), "0000320193-26-000099", "2026-10-27")
    assert result["verified"] is False
    assert result["reason"] == "accession_mismatch"


def test_parse_sec_header_blocks_filing_date_conflict():
    result = parse_sec_header(header(accepted="20261026161530", filed="20261026"),
                              "0000320193-26-000001", "2026-10-27")
    assert result["verified"] is False
    assert result["reason"] == "filing_date_conflict"


def test_verifier_propagates_verified_timestamp_but_never_unlocks_dataset():
    accession = "0000320193-26-000001"
    dataset = {"decision_eligible": False, "companies": [{
        "ticker": "AAPL", "cik": "0000320193",
        "filings": [{"accession": accession, "filed_date": "2026-10-27",
                     "raw_acceptance_timestamp": "2026-10-27T16:15:30Z",
                     "available_at": None, "availability_timestamp_verified": False}],
        "facts": [{"accession": accession, "concept": "Revenue", "available_at": None,
                   "availability_timestamp_verified": False}],
    }]}
    result = verify_dataset(dataset, fetch_text=lambda _: header(), request_delay_seconds=0)
    company = result["companies"][0]
    assert company["filings"][0]["acceptance_timestamp_verified"] is True
    assert company["filings"][0]["acceptance_at"] == "2026-10-27T20:15:30+00:00"
    assert company["filings"][0]["timestamp_verification"]["raw_timestamp_matches_header"] is False
    assert company["facts"][0]["acceptance_at"] == "2026-10-27T20:15:30+00:00"
    assert company["facts"][0]["availability_timestamp_verified"] is False
    assert company["facts"][0]["available_at"] is None
    assert result["timestamp_verification"]["verified"] == 1
    assert result["timestamp_verification"]["facts_acceptance_verified"] == 1
    assert result["decision_eligible"] is False
