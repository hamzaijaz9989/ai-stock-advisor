import pytest

from stock_advisor.valuation import dcf_equity_value_per_share, margin_of_safety, scenario_valuation


def test_dcf_returns_positive_value_for_valid_assumptions():
    value = dcf_equity_value_per_share(
        starting_free_cash_flow=100,
        shares_outstanding=10,
        growth_rates=(0.08, 0.07, 0.05, 0.04, 0.03),
        discount_rate=0.10,
        terminal_growth_rate=0.02,
        net_cash=20,
    )
    assert value is not None
    assert value > 0


def test_dcf_rejects_invalid_discount_and_terminal_growth():
    assert dcf_equity_value_per_share(
        starting_free_cash_flow=100, shares_outstanding=10,
        growth_rates=(0.05,), discount_rate=0.02,
        terminal_growth_rate=0.03,
    ) is None


def test_dcf_rejects_negative_or_missing_cash_flow():
    assert dcf_equity_value_per_share(
        starting_free_cash_flow=-10, shares_outstanding=10,
        growth_rates=(0.05,), discount_rate=0.10,
        terminal_growth_rate=0.02,
    ) is None


def test_margin_of_safety():
    assert margin_of_safety(100, 80) == pytest.approx(0.20)
    assert margin_of_safety(100, 120) == pytest.approx(-0.20)
    assert margin_of_safety(0, 10) is None


def test_scenario_valuation_requires_ordered_positive_values():
    assert scenario_valuation(70, 100, 130) == {"bear": 70, "base": 100, "bull": 130}
    assert scenario_valuation(100, 90, 130) is None
    assert scenario_valuation(70, None, 130) is None
