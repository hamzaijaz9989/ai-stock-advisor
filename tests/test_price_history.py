from datetime import UTC, date, datetime

import pytest

from stock_advisor.research_price_history import PriceDataError, fetch_symbol


def chart_payload():
    timestamp = int(datetime(2024, 1, 2, 14, 30, tzinfo=UTC).timestamp())
    return {
        "chart": {
            "error": None,
            "result": [{
                "meta": {"exchangeTimezoneName": "America/New_York", "currency": "USD"},
                "timestamp": [timestamp],
                "indicators": {
                    "quote": [{
                        "open": [100.0], "high": [105.0], "low": [99.0],
                        "close": [103.0], "volume": [12345],
                    }],
                    "adjclose": [{"adjclose": [102.5]}],
                },
                "events": {
                    "dividends": {str(timestamp): {"amount": 0.25}},
                    "splits": {},
                },
            }],
        },
    }


def test_fetch_symbol_normalizes_exchange_date_and_validates_ohlc():
    result = fetch_symbol(
        "aapl", start=date(2024, 1, 1), cutoff=date(2024, 1, 3),
        fetch_json=lambda _url: chart_payload(),
    )
    assert result["symbol"] == "AAPL"
    assert result["bar_count"] == 1
    assert result["bars"][0] == {
        "date": "2024-01-02", "open": 100.0, "high": 105.0,
        "low": 99.0, "close": 103.0, "adjusted_close": 102.5,
        "volume": 12345,
    }
    assert result["quality"]["ohlc_ranges_checked"] is True
    assert result["corporate_actions"][0]["type"] == "dividend"


def test_fetch_symbol_rejects_missing_or_invalid_chart_data():
    with pytest.raises(PriceDataError, match="No historical chart result"):
        fetch_symbol(
            "AAPL", start=date(2024, 1, 1), cutoff=date(2024, 1, 3),
            fetch_json=lambda _url: {"chart": {"result": None, "error": None}},
        )


def test_fetch_symbol_rejects_invalid_symbol():
    with pytest.raises(ValueError, match="Invalid symbol"):
        fetch_symbol(
            "AAPL;DROP", start=date(2024, 1, 1), cutoff=date(2024, 1, 3),
            fetch_json=lambda _url: chart_payload(),
        )
