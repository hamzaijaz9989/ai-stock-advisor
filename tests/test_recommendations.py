import pytest

from stock_advisor.recommendations import (
    Decision,
    RecommendationInputs,
    decide,
    position_size,
    reward_to_risk,
    risk_budget,
)


def test_default_risk_budget_is_one_percent():
    assert risk_budget(500) == pytest.approx(5)


def test_risk_budget_rejects_more_than_two_percent():
    assert risk_budget(500, 0.03) is None


def test_position_size_respects_risk_and_allocation():
    result = position_size(500, 100, 95)
    assert result["shares"] == 1
    assert result["dollars"] == pytest.approx(100)
    assert result["planned_risk"] == pytest.approx(5)


def test_position_size_can_use_fractional_shares():
    result = position_size(500, 100, 90, fractional_shares=True)
    assert result["shares"] == pytest.approx(0.5)
    assert result["planned_risk"] == pytest.approx(5)


def test_position_size_rejects_invalid_levels():
    assert position_size(500, 100, 105)["shares"] is None
    assert position_size(500, 0, 90)["shares"] is None


def test_reward_to_risk():
    assert reward_to_risk(100, 110, 95) == pytest.approx(2)
    assert reward_to_risk(100, 99, 95) is None


def test_missing_event_or_valuation_data_never_buys():
    decision, reasons = decide(RecommendationInputs(
        quote_current=True,
        valuation_available=False,
        earnings_date_verified=False,
        material_news_reviewed=True,
        fundamentals_pass=True,
        valuation_pass=True,
        event_risk_acceptable=True,
        reward_risk=3,
    ))
    assert decision is Decision.INSUFFICIENT_EVIDENCE
    assert len(reasons) == 2


def test_failed_valuation_waits():
    decision, _ = decide(RecommendationInputs(
        quote_current=True, valuation_available=True,
        earnings_date_verified=True, material_news_reviewed=True,
        fundamentals_pass=True, valuation_pass=False,
        event_risk_acceptable=True, reward_risk=3,
    ))
    assert decision is Decision.WAIT


def test_thesis_broken_avoids():
    decision, _ = decide(RecommendationInputs(
        quote_current=True, valuation_available=True,
        earnings_date_verified=True, material_news_reviewed=True,
        fundamentals_pass=True, valuation_pass=True,
        event_risk_acceptable=True, reward_risk=3, thesis_broken=True,
    ))
    assert decision is Decision.AVOID


def test_all_gates_pass_allows_buy():
    decision, _ = decide(RecommendationInputs(
        quote_current=True, valuation_available=True,
        earnings_date_verified=True, material_news_reviewed=True,
        fundamentals_pass=True, valuation_pass=True,
        event_risk_acceptable=True, reward_risk=2,
    ))
    assert decision is Decision.BUY
