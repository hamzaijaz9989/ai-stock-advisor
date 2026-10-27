from stock_advisor.fundamentals import classify_period, normalize_facts


def test_classifies_annual_quarterly_and_instant_periods():
    assert classify_period({"period_start": "2024-01-01", "period_end": "2024-12-31"}) == "annual"
    assert classify_period({"period_start": "2024-01-01", "period_end": "2024-03-31"}) == "quarterly"
    assert classify_period({"period_end": "2024-12-31"}) == "instant"


def test_normalization_preserves_filing_date_and_does_not_aggregate():
    rows = [
        {
            "concept": "Revenues", "value": 100, "unit": "USD",
            "start": "2024-01-01", "period_end": "2024-03-31",
            "filed": "2024-05-01", "form": "10-Q",
            "accession_number": "0000000000-24-000001",
        },
        {
            "concept": "Revenues", "value": 130, "unit": "USD",
            "start": "2024-04-01", "period_end": "2024-06-30",
            "filed": "2024-08-01", "form": "10-Q",
            "accession_number": "0000000000-24-000002",
        },
    ]
    normalized = normalize_facts(rows)
    assert len(normalized) == 2
    assert [row["value"] for row in normalized] == [100, 130]
    assert normalized[0]["metric"] == "revenue"
    assert normalized[0]["period_type"] == "quarterly"
    assert normalized[0]["availability_date"] == "2024-05-01"
    assert normalized[0]["accession_number"] == "0000000000-24-000001"


def test_ignores_unknown_concepts_and_missing_filed_date():
    rows = [
        {"concept": "UnknownMetric", "value": 5, "filed": "2024-01-01"},
        {"concept": "Revenues", "value": 5, "period_end": "2023-12-31"},
    ]
    assert normalize_facts(rows) == []


def test_invalid_period_is_not_guessed():
    assert classify_period({"period_start": "not-a-date", "period_end": "2024-12-31"}) == "unknown"
