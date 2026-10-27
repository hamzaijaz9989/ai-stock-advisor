import pytest

from stock_advisor.lookup import CompanyIdentity, CompanyLookup
from stock_advisor.sec import SECDataError


class FakeClient:
    def __init__(self, payload):
        self.payload = payload

    def _get_json(self, url):
        assert "company_tickers_exchange.json" in url
        return self.payload


def test_lookup_normalizes_ticker_and_cik():
    lookup = CompanyLookup(FakeClient([
        {"ticker": "aapl", "cik": 320193, "name": "Apple Inc.", "exchange": "Nasdaq"}
    ]))
    assert lookup.lookup(" AAPL ") == CompanyIdentity(
        ticker="AAPL", cik="0000320193", name="Apple Inc.", exchange="Nasdaq"
    )


def test_lookup_does_not_guess_between_distinct_issuers():
    lookup = CompanyLookup(FakeClient([
        {"ticker": "ABC", "cik": 1, "name": "Issuer One"},
        {"ticker": "ABC", "cik": 2, "name": "Issuer Two"},
    ]))
    with pytest.raises(LookupError, match="multiple SEC issuers"):
        lookup.lookup("ABC")


def test_lookup_raises_for_missing_ticker():
    lookup = CompanyLookup(FakeClient([
        {"ticker": "AAPL", "cik": 320193, "name": "Apple Inc."}
    ]))
    with pytest.raises(LookupError, match="No SEC ticker mapping"):
        lookup.lookup("MSFT")


def test_lookup_rejects_empty_mapping():
    lookup = CompanyLookup(FakeClient([]))
    with pytest.raises(SECDataError, match="no usable"):
        lookup.all_companies()
