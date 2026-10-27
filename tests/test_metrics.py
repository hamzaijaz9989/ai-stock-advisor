import math

import pytest

from stock_advisor.metrics import (
    compound_annual_growth_rate,
    margin,
    net_debt,
    percentage_change,
    weighted_score,
)


def test_percentage_change_positive_growth():
    assert percentage_change(110, 100) == pytest.approx(0.10)


@pytest.mark.parametrize("current,previous", [
    (None, 100),
    (100, None),
    (100, 0),
    (100, -1),
    (math.inf, 100),
    (math.nan, 100),
])
def test_percentage_change_rejects_undefined_inputs(current, previous):
    assert percentage_change(current, previous) is None


def test_margin():
    assert margin(25, 100) == pytest.approx(0.25)
    assert margin(25, 0) is None
    assert margin(None, 100) is None


def test_net_debt():
    assert net_debt(120, 30) == pytest.approx(90)
    assert net_debt(20, 30) == pytest.approx(-10)
    assert net_debt(-1, 10) is None
    assert net_debt(10, None) is None


def test_cagr():
    assert compound_annual_growth_rate(100, 121, 2) == pytest.approx(0.10)
    assert compound_annual_growth_rate(0, 121, 2) is None
    assert compound_annual_growth_rate(100, 121, 0) is None


def test_weighted_score_with_complete_data():
    assert weighted_score([(80, 0.5), (60, 0.5)]) == pytest.approx(70)


def test_weighted_score_refuses_insufficient_data():
    assert weighted_score([(80, 0.4), (None, 0.6)]) is None


def test_weighted_score_renormalizes_when_coverage_is_sufficient():
    assert weighted_score([(80, 0.8), (None, 0.2)]) == pytest.approx(80)


def test_weighted_score_rejects_invalid_weights_and_scores():
    with pytest.raises(ValueError):
        weighted_score([(80, 0.4), (60, 0.4)])
    with pytest.raises(ValueError):
        weighted_score([(101, 1.0)])
    with pytest.raises(ValueError):
        weighted_score([(80, -1.0), (60, 2.0)])
