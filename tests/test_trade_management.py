from stock_advisor.trade_management import (
    build_portfolio_plan,
    monitor_trade,
)

AS_OF = "2026-11-12T15:00:00Z"


def candidate(ticker, strategy, sector):
    return {
        "ticker": ticker, "strategy": strategy, "sector": sector,
        "quote_time": "2026-11-12T14:59:00Z", "quote_status": "FRESH",
        "quote_source": "verified-provider", "current_price": 99.5,
        "entry_low": 99.0, "entry_high": 100.0,
        "target_low": 109.0, "target_high": 112.0, "stop_price": 95.0,
        "max_holding_days": 90 if strategy == "long_term" else 10,
        "entry_condition": "Enter only while the verified price stays in range.",
        "invalidation_condition": "Reassess if the stated thesis fails.",
        "thesis": "Documented evidence supports this conditional setup.",
        "evidence_ids": ["quote:1", "research:2"],
        "gates": {
            "quote_current": True, "valuation_available": True,
            "earnings_date_verified": True, "material_news_reviewed": True,
            "fundamentals_pass": True, "valuation_pass": True,
            "event_risk_acceptable": True,
        },
    }


def portfolio():
    return {
        "verified": True, "source": "broker-sync", "as_of": "2026-11-12T14:00:00Z",
        "equity": 1000.0, "cash": 1000.0, "positions": [],
    }


def test_manual_plan_sizes_diversified_sleeves_and_never_enables_execution():
    report = build_portfolio_plan(
        portfolio(),
        [candidate("AAA", "long_term", "Health"), candidate("BBB", "short_term", "Technology")],
        as_of=AS_OF,
    )
    assert report["status"] == "MANUAL_REVIEW_REQUIRED"
    assert report["planned_allocation_usd"] > 0
    assert report["implied_monthly_return_target_pct"] == 15.0
    assert report["target_is_forecast"] is False
    assert {item["strategy"] for item in report["positions"]} == {"long_term", "short_term"}
    for item in report["positions"]:
        assert item["status"] == "BUY SETUP — UNVALIDATED"
        assert item["paper_execution_eligible"] is False
        assert item["automated_order_submission"] is False
        assert item["live_order_submission"] is False
        assert item["evidence_ids"]


def test_plan_fails_closed_on_unverified_portfolio_and_bad_reward_risk():
    bad_portfolio = portfolio() | {"verified": False}
    report = build_portfolio_plan(bad_portfolio, [candidate("AAA", "long_term", "Health")], as_of=AS_OF)
    assert report["status"] == "INSUFFICIENT EVIDENCE"
    assert report["positions"] == []
    bad = candidate("AAA", "long_term", "Health") | {"target_low": 101.0}
    report = build_portfolio_plan(portfolio(), [bad], as_of=AS_OF)
    assert report["positions"][0]["status"] == "WAIT"


def test_existing_exposure_and_risk_reduce_new_allocation():
    snapshot = portfolio() | {
        "cash": 800.0,
        "positions": [{
            "ticker": "OLD", "sector": "Health", "strategy": "long_term",
            "market_value_usd": 200.0, "open_risk_usd": 20.0,
        }],
    }
    report = build_portfolio_plan(snapshot, [candidate("AAA", "long_term", "Health")], as_of=AS_OF)
    assert report["planned_allocation_usd"] == 0
    assert report["positions"][0]["status"] == "WAIT"


def position(**overrides):
    value = {
        "ticker": "AAA", "entry_price": 100.0, "stop_price": 95.0,
        "target_low": 110.0, "opened_at": "2026-11-01T14:00:00Z",
        "max_holding_days": 30, "evidence_ids": ["thesis:3"],
    }
    return value | overrides


def market(price=101.0, **overrides):
    value = {
        "price": price, "quote_time": "2026-11-12T14:59:00Z",
        "quote_status": "FRESH", "source": "verified-provider",
        "evidence_ids": ["quote:4"],
    }
    return value | overrides


def test_small_gain_does_not_trigger_exit_and_review_keeps_manual_only_flags():
    result = monitor_trade(position(), market(101.0), as_of=AS_OF)
    assert result["status"] == "HOLD_MONITORING"
    assert "small gains alone" in result["reason"]
    assert result["manual_review_required"] is True
    assert result["automated_exit"] is False
    assert result["live_order_submission"] is False
    assert result["evidence_ids"] == ["thesis:3", "quote:4"]


def test_monitor_surfaces_stop_target_stale_and_thesis_alerts():
    assert monitor_trade(position(), market(94.0), as_of=AS_OF)["status"] == "STOP_LOSS_REVIEW"
    assert monitor_trade(position(), market(110.0), as_of=AS_OF)["status"] == "PROFIT_TAKING_REVIEW"
    stale = monitor_trade(position(), market(110.0, quote_status="STALE"), as_of=AS_OF)
    assert stale["status"] == "PRICE_DATA_REVIEW"
    invalidated = monitor_trade(position(thesis_invalidated=True), market(101.0), as_of=AS_OF)
    assert invalidated["status"] == "EXIT_REVIEW"
