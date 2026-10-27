from datetime import date, timedelta

import pytest

from stock_advisor.backtest import (
    BacktestConfig,
    DailyBar,
    TradeSignal,
    simulate_signal,
    summarize_outcomes,
    walk_forward_folds,
)


def bars_from(start, rows):
    output = []
    for index, (open_price, high, low, close) in enumerate(rows):
        day = start + timedelta(days=index)
        output.append(DailyBar(day, open_price, high, low, close, close))
    return output


def test_signal_enters_next_session_and_exits_at_target():
    bars = bars_from(date(2024, 1, 1), [
        (100, 102, 98, 100),
        (100, 102, 98, 101),
        (103, 111, 102, 108),
        (108, 110, 106, 109),
    ])
    signal = TradeSignal("TEST", "2024-01-01", 99, 101, 95, 110, 3)
    outcome = simulate_signal(signal, bars, BacktestConfig(0, 0))
    assert outcome.status == "closed"
    assert outcome.entry_date == date(2024, 1, 2)
    assert outcome.exit_date == date(2024, 1, 3)
    assert outcome.exit_reason == "target"
    assert outcome.net_return_pct == pytest.approx(10)
    assert outcome.r_multiple == pytest.approx(2)


def test_stop_is_assumed_first_when_target_and_stop_hit_same_daily_bar():
    bars = bars_from(date(2024, 1, 1), [
        (100, 102, 98, 100),
        (100, 112, 94, 101),
        (100, 102, 98, 100),
    ])
    signal = TradeSignal("TEST", "2024-01-01", 99, 101, 95, 110, 2)
    outcome = simulate_signal(signal, bars, BacktestConfig(0, 0))
    assert outcome.exit_reason == "stop"
    assert outcome.exit_fill_price == pytest.approx(95)
    assert outcome.net_return_pct == pytest.approx(-5)


def test_stop_gap_is_filled_at_open_not_at_stop():
    bars = bars_from(date(2024, 1, 1), [
        (100, 101, 99, 100),
        (100, 103, 98, 101),
        (90, 94, 88, 91),
        (91, 94, 89, 92),
    ])
    signal = TradeSignal("TEST", "2024-01-01", 99, 101, 95, 110, 3)
    outcome = simulate_signal(signal, bars, BacktestConfig(0, 0))
    assert outcome.exit_reason == "stop_gap"
    assert outcome.exit_fill_price == pytest.approx(90)
    assert outcome.net_return_pct == pytest.approx(-10)


def test_entry_is_not_filled_if_next_open_is_outside_entry_zone():
    bars = bars_from(date(2024, 1, 1), [
        (100, 101, 99, 100),
        (104, 105, 102, 104),
    ])
    signal = TradeSignal("TEST", "2024-01-01", 99, 101, 95, 110, 5)
    outcome = simulate_signal(signal, bars, BacktestConfig(0, 0))
    assert outcome.status == "not_filled"


def test_incomplete_future_history_is_not_counted_as_a_closed_trade():
    bars = bars_from(date(2024, 1, 1), [
        (100, 101, 99, 100),
        (100, 102, 98, 101),
        (101, 102, 99, 100),
    ])
    signal = TradeSignal("TEST", "2024-01-01", 99, 101, 95, 110, 5)
    outcome = simulate_signal(signal, bars, BacktestConfig(0, 0))
    assert outcome.status == "insufficient_future_data"


def test_adjusted_return_factors_and_costs_are_applied():
    bars = [
        DailyBar("2024-01-01", 100, 101, 99, 100, 100),
        DailyBar("2024-01-02", 100, 101, 99, 100, 99),
        DailyBar("2024-01-03", 103, 111, 102, 108, 104),
    ]
    signal = TradeSignal("TEST", "2024-01-01", 99, 101, 95, 110, 2)
    outcome = simulate_signal(signal, bars, BacktestConfig(5, 0))
    assert outcome.status == "closed"
    assert outcome.adjusted_returns_used is True
    assert outcome.net_return_pct < 10
    assert outcome.benchmark_return_pct == pytest.approx((104 / 99 - 1) * 100)


def test_summary_excludes_unfilled_and_incomplete_signals():
    bars = bars_from(date(2024, 1, 1), [
        (100, 102, 98, 100),
        (100, 102, 98, 101),
        (103, 111, 102, 108),
    ])
    signal = TradeSignal("TEST", "2024-01-01", 99, 101, 95, 110, 2)
    closed = simulate_signal(signal, bars, BacktestConfig(0, 0))
    not_filled = TradeSignal("TEST", "2024-01-01", 90, 95, 85, 110, 2)
    skipped = simulate_signal(not_filled, bars, BacktestConfig(0, 0))
    summary = summarize_outcomes([closed, skipped])
    assert summary["completed_trades"] == 1
    assert summary["not_filled"] == 1
    assert summary["win_rate_pct"] == pytest.approx(100)


def test_walk_forward_folds_have_no_date_overlap():
    dates = [date(2020, 1, 1) + timedelta(days=i) for i in range(500)]
    folds = walk_forward_folds(dates, min_train_sessions=200, test_sessions=100)
    assert len(folds) == 3
    assert all(fold.train_end < fold.test_start for fold in folds)
    assert folds[0].test_start == dates[200]
    assert folds[-1].test_end == dates[499]


def test_walk_forward_rejects_duplicate_dates():
    dates = [date(2024, 1, 1), date(2024, 1, 2), date(2024, 1, 2), date(2024, 1, 3)]
    with pytest.raises(ValueError, match="unique"):
        walk_forward_folds(dates, min_train_sessions=1, test_sessions=1)
