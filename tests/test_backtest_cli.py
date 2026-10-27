import importlib.util
import sys
from pathlib import Path

import pytest

_runner_path = Path(__file__).resolve().parents[1] / "scripts" / "run_backtest.py"
_runner_spec = importlib.util.spec_from_file_location("ai_stock_advisor_backtest_runner", _runner_path)
if _runner_spec is None or _runner_spec.loader is None:
    raise RuntimeError("Could not load backtest runner for tests.")
_runner_module = importlib.util.module_from_spec(_runner_spec)
sys.modules[_runner_spec.name] = _runner_module
_runner_spec.loader.exec_module(_runner_module)
InputError = _runner_module.InputError
run_payload = _runner_module.run_payload


def payload():
    return {
        "metadata": {
            "data_source": "synthetic test fixture",
            "signals_source": "hand-authored unit-test signal",
            "as_of_date": "2024-01-03",
            "quality_flags": {
                "signals_are_point_in_time": True,
                "universe_survivorship_controlled": True,
                "corporate_actions_checked": True,
                "transaction_costs_calibrated": True,
                "holdout_period_untouched": True,
            },
        },
        "config": {"slippage_bps_per_side": 0, "commission_bps_per_side": 0},
        "signals": [{
            "symbol": "TEST",
            "signal_date": "2024-01-01",
            "entry_low": 99,
            "entry_high": 101,
            "stop_price": 95,
            "target_price": 110,
            "max_holding_sessions": 2,
        }],
        "bars": {
            "TEST": [
                {"date": "2024-01-01", "open": 100, "high": 102, "low": 98, "close": 100, "adjusted_close": 100},
                {"date": "2024-01-02", "open": 100, "high": 102, "low": 98, "close": 101, "adjusted_close": 100},
                {"date": "2024-01-03", "open": 103, "high": 111, "low": 102, "close": 108, "adjusted_close": 107},
            ],
        },
    }


def test_runner_outputs_replay_summary_and_keeps_decision_gate_closed():
    report = run_payload(payload())
    assert report["summary"]["signals"] == 1
    assert report["summary"]["completed_trades"] == 1
    assert report["outcomes"][0]["status"] == "closed"
    assert report["validation"]["quality_flags_all_true"] is True
    assert report["validation"]["strategy_validation_passed"] is False
    assert report["validation"]["decision_eligible"] is False


def test_runner_rejects_prices_after_dataset_cutoff():
    data = payload()
    data["bars"]["TEST"].append({
        "date": "2024-01-04", "open": 108, "high": 109, "low": 107,
        "close": 108, "adjusted_close": 108,
    })
    with pytest.raises(InputError, match="as_of_date"):
        run_payload(data)


def test_runner_rejects_signals_after_dataset_cutoff():
    data = payload()
    data["signals"][0]["signal_date"] = "2024-01-04"
    with pytest.raises(InputError, match="as_of_date"):
        run_payload(data)


def test_runner_requires_data_source_provenance():
    data = payload()
    del data["metadata"]["data_source"]
    with pytest.raises(InputError, match="data_source"):
        run_payload(data)


def test_missing_symbol_bars_are_reported_not_silently_dropped():
    data = payload()
    data["signals"].append({
        "symbol": "MISSING", "signal_date": "2024-01-01",
        "entry_low": 99, "entry_high": 101, "stop_price": 95,
        "target_price": 110, "max_holding_sessions": 2,
    })
    report = run_payload(data)
    assert report["summary"]["signals"] == 2
    assert report["summary"]["missing_bars"] == 1
    assert report["outcomes"][1]["status"] == "missing_bars"
