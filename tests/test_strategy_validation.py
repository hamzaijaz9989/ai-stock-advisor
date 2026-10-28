from datetime import date, timedelta

from stock_advisor.backtest import DailyBar, TradeSignal
from stock_advisor.portfolio import simulate_cash_only_portfolio
from stock_advisor.strategy_validation import (
    build_validation_report,
    evaluate_snapshot,
    generate_signals,
)


def snapshot(**overrides):
    base = {
        "ticker": "TEST",
        "as_of_date": "2025-01-02",
        "as_of_timestamp": "2025-01-02T21:00:00Z",
        "universe_member": True,
        "close": 77.5,
        "dcf_base": 100.0,
        "annual_revenue": 110.0,
        "prior_annual_revenue": 100.0,
        "annual_net_income": 15.0,
        "annual_fcf": 12.0,
        "quarter_revenue": 30.0,
        "quarter_net_income": 4.0,
        "quarter_revenue_yoy": 0.05,
        "earnings_date": "2025-03-01",
        "recent_news_count": 3,
        "risk_headline": False,
        "atr14": 2.0,
        "available_at": {
            "price": "2025-01-02T20:59:00Z",
            "fundamentals": "2024-11-01T12:00:00Z",
            "quarterly_fundamentals": "2024-11-01T12:00:00Z",
            "earnings": "2024-12-20T12:00:00Z",
            "news": "2025-01-02T20:30:00Z",
            "universe_membership": "2025-01-02T14:00:00Z",
        },
    }
    base.update(overrides)
    return base


def test_eligible_snapshot_generates_unvalidated_setup_not_approved_buy():
    result = evaluate_snapshot(snapshot())
    assert result["eligible"] is True
    assert result["label"] == "BUY SETUP — UNVALIDATED"
    assert result["planned_shares"] > 0
    signals, audit = generate_signals([snapshot()])
    assert len(signals) == 1
    assert audit[0]["eligible"] is True


def test_future_news_availability_is_rejected_as_lookahead():
    row = snapshot()
    row["available_at"] = dict(row["available_at"], news="2025-01-02T21:01:00Z")
    result = evaluate_snapshot(row)
    assert result["eligible"] is False
    assert "lookahead_news" in result["failed_gates"]


def test_missing_timezone_or_availability_timestamp_fails_closed():
    row = snapshot(as_of_timestamp="2025-01-02T21:00:00")
    result = evaluate_snapshot(row)
    assert result["eligible"] is False
    assert "timezone" in result["failed_gates"][0].lower()


def test_bad_financial_quality_and_risk_headline_block_signal():
    row = snapshot(quarter_net_income=-1, risk_headline=True)
    result = evaluate_snapshot(row)
    assert result["eligible"] is False
    assert "quarter_net_income_quality_gate_failed" in result["failed_gates"]
    assert "potential_material_risk_headline_or_unknown" in result["failed_gates"]


def test_report_never_self_approves_even_when_attestations_are_true():
    report = build_validation_report(
        [snapshot()],
        {"TEST": [DailyBar(date(2025, 1, 3) + timedelta(days=i), 77.5, 79, 76, 78, 78)
                  for i in range(140)]},
        data_provenance_verified=True,
        point_in_time_coverage_verified=True,
        survivorship_control_verified=True,
        corporate_actions_verified=True,
        costs_calibrated=True,
        holdout_untouched=True,
    )
    assert report["validation"]["strategy_validation_passed"] is False
    assert report["validation"]["decision_eligible"] is False
    assert "independent_validation_review_required" in report["validation"]["blockers"]

def test_portfolio_simulator_tracks_cash_equity_and_skips_overlapping_signals():
    bars = [
        DailyBar(date(2025, 1, 3) + timedelta(days=i), 77.5, 79, 76, 78, 78)
        for i in range(140)
    ]
    signals = [
        TradeSignal("TEST", "2025-01-02", 75, 80, 73.5, 100, 126),
        TradeSignal("TEST", "2025-01-03", 75, 80, 73.5, 100, 126),
    ]
    report = simulate_cash_only_portfolio(signals, {"TEST": bars})
    assert report["completed_positions"] == 1
    assert report["skipped_overlap"] == 1
    assert report["ending_equity"] > report["initial_capital"]
    assert report["equity_curve"][-1]["equity"] == report["ending_equity"]


def test_stop_inside_full_entry_zone_blocks_signal():
    row = snapshot(atr14=1.0)
    result = evaluate_snapshot(row)
    assert result["eligible"] is False
    assert "stop_not_below_full_entry_zone" in result["failed_gates"]

