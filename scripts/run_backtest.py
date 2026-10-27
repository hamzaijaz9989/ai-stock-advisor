"""Run reproducible historical single-signal simulations from explicit JSON inputs.

This command does not generate strategy signals. It replays supplied, dated
signals and bars, records source metadata, and always labels the run as
research-only unless a separate validation process is completed.
"""

from __future__ import annotations

import argparse
import json
import math
import sys
from dataclasses import asdict
from datetime import date, datetime, UTC
from pathlib import Path
from typing import Any

from stock_advisor.backtest import (
    BacktestConfig,
    DailyBar,
    TradeSignal,
    simulate_signal,
    summarize_outcomes,
)


QUALITY_FLAGS = (
    "signals_are_point_in_time",
    "universe_survivorship_controlled",
    "corporate_actions_checked",
    "transaction_costs_calibrated",
    "holdout_period_untouched",
)


class InputError(ValueError):
    """Raised when an input file is malformed or lacks auditable provenance."""


def parse_payload(payload: Any) -> tuple[dict[str, Any], list[TradeSignal], dict[str, list[DailyBar]], BacktestConfig]:
    if not isinstance(payload, dict):
        raise InputError("Input JSON top level must be an object.")
    metadata = payload.get("metadata")
    if not isinstance(metadata, dict):
        raise InputError("A metadata object is required; no data provenance will be inferred.")
    for key in ("data_source", "signals_source", "as_of_date"):
        if not isinstance(metadata.get(key), str) or not metadata[key].strip():
            raise InputError(f"metadata.{key} is required and must be a non-empty string.")
    try:
        as_of_date = date.fromisoformat(metadata["as_of_date"])
    except ValueError as exc:
        raise InputError("metadata.as_of_date must use ISO YYYY-MM-DD format.") from exc
    if as_of_date > datetime.now(UTC).date():
        raise InputError("metadata.as_of_date cannot be in the future.")

    flags = metadata.get("quality_flags")
    if not isinstance(flags, dict):
        flags = {}
    cleaned_metadata = {
        "data_source": metadata["data_source"].strip(),
        "signals_source": metadata["signals_source"].strip(),
        "as_of_date": as_of_date.isoformat(),
        "quality_flags": {key: flags.get(key) is True for key in QUALITY_FLAGS},
        "notes": metadata.get("notes", "") if isinstance(metadata.get("notes", ""), str) else "",
    }

    raw_signals = payload.get("signals")
    raw_bars = payload.get("bars")
    if not isinstance(raw_signals, list) or not raw_signals:
        raise InputError("signals must be a non-empty array.")
    if not isinstance(raw_bars, dict) or not raw_bars:
        raise InputError("bars must be a non-empty object keyed by ticker.")

    config_raw = payload.get("config", {})
    if not isinstance(config_raw, dict):
        raise InputError("config must be an object.")
    try:
        config = BacktestConfig(
            slippage_bps_per_side=float(config_raw.get("slippage_bps_per_side", 5.0)),
            commission_bps_per_side=float(config_raw.get("commission_bps_per_side", 0.0)),
        )
    except (TypeError, ValueError) as exc:
        raise InputError("Transaction cost settings must be numeric.") from exc

    signals: list[TradeSignal] = []
    for index, raw in enumerate(raw_signals):
        if not isinstance(raw, dict):
            raise InputError(f"signals[{index}] must be an object.")
        try:
            signals.append(TradeSignal(
                symbol=str(raw["symbol"]),
                signal_date=str(raw["signal_date"]),
                entry_low=float(raw["entry_low"]),
                entry_high=float(raw["entry_high"]),
                stop_price=float(raw["stop_price"]),
                target_price=float(raw["target_price"]),
                max_holding_sessions=raw.get("max_holding_sessions", 126),
            ))
        except (KeyError, TypeError, ValueError) as exc:
            raise InputError(f"signals[{index}] is missing or has invalid fields: {exc}") from exc

    for index, signal in enumerate(signals):
        try:
            signal_day = date.fromisoformat(str(signal.signal_date))
        except ValueError as exc:
            raise InputError(f"signals[{index}].signal_date must use ISO YYYY-MM-DD format.") from exc
        if signal_day > as_of_date:
            raise InputError(f"signals[{index}] occurs after metadata.as_of_date.")

    bars: dict[str, list[DailyBar]] = {}
    for raw_symbol, raw_rows in raw_bars.items():
        symbol = str(raw_symbol).strip().upper()
        if not symbol or not isinstance(raw_rows, list):
            raise InputError(f"bars entry for {raw_symbol!r} must be an array.")
        rows: list[DailyBar] = []
        for index, raw in enumerate(raw_rows):
            if not isinstance(raw, dict):
                raise InputError(f"bars.{symbol}[{index}] must be an object.")
            try:
                bar_date = date.fromisoformat(str(raw["date"]))
                if bar_date > as_of_date:
                    raise InputError(f"bars.{symbol}[{index}] occurs after metadata.as_of_date.")
                rows.append(DailyBar(
                    date=bar_date,
                    open=float(raw["open"]),
                    high=float(raw["high"]),
                    low=float(raw["low"]),
                    close=float(raw["close"]),
                    adjusted_close=(
                        None if raw.get("adjusted_close") is None
                        else float(raw["adjusted_close"])
                    ),
                ))
            except (KeyError, TypeError, ValueError) as exc:
                raise InputError(f"bars.{symbol}[{index}] is missing or has invalid fields: {exc}") from exc
        bars[symbol] = rows

    return cleaned_metadata, signals, bars, config


def json_safe(value: Any) -> Any:
    if isinstance(value, (date, datetime)):
        return value.isoformat()
    if isinstance(value, dict):
        return {str(key): json_safe(item) for key, item in value.items()}
    if isinstance(value, (list, tuple)):
        return [json_safe(item) for item in value]
    if isinstance(value, float) and not math.isfinite(value):
        return "Infinity" if value > 0 else "-Infinity" if value < 0 else None
    return value


def run_payload(payload: Any) -> dict[str, Any]:
    metadata, signals, bars_by_symbol, config = parse_payload(payload)
    outcomes = []
    outcome_objects = []
    for signal in signals:
        symbol = signal.symbol.strip().upper()
        if symbol not in bars_by_symbol:
            outcomes.append({
                "symbol": symbol,
                "status": "missing_bars",
                "signal_date": str(signal.signal_date),
                "detail": f"No historical bars supplied for {symbol}.",
            })
            continue
        outcome = simulate_signal(signal, bars_by_symbol[symbol], config)
        outcome_objects.append(outcome)
        outcomes.append(asdict(outcome))

    quality = metadata["quality_flags"]
    flags_passed = all(quality.values())
    summary = summarize_outcomes(outcome_objects)
    missing_bars = sum(item.get("status") == "missing_bars" for item in outcomes)
    summary["signals"] = len(signals)
    summary["missing_bars"] = missing_bars

    return json_safe({
        "report_version": 1,
        "generated_at": datetime.now(UTC),
        "metadata": metadata,
        "configuration": asdict(config),
        "summary": summary,
        "outcomes": outcomes,
        "validation": {
            "quality_flags_all_true": flags_passed,
            "strategy_validation_passed": False,
            "decision_eligible": False,
            "reason": (
                "This tool replays supplied signals only. It does not generate point-in-time signals, "
                "simulate an overlapping portfolio/equity curve, or independently audit the stated data "
                "quality flags. Walk-forward and untouched holdout results for the actual advisor strategy "
                "must be evaluated separately before any BUY signal can be enabled."
            ),
        },
        "limitations": [
            "Independent single-position outcomes are not a portfolio equity curve; overlapping positions are not simulated.",
            "Daily bars cannot reveal the exact intraday order of stops and targets; the stop-first convention is an approximation.",
            "OHLC inputs must be consistently split-adjusted. Adjusted closes approximate dividends when available.",
            "Incomplete forward history and unfilled entries are shown but excluded from completed-trade return summaries.",
            "Execution costs, corporate-action treatment and data-source statements are supplied assumptions and are not independently verified.",
        ],
    })


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--input", required=True, type=Path, help="Path to a backtest input JSON file.")
    parser.add_argument("--output", type=Path, help="Optional path to write the JSON report; stdout is used by default.")
    args = parser.parse_args(argv)

    try:
        payload = json.loads(args.input.read_text(encoding="utf-8"))
        report = run_payload(payload)
        rendered = json.dumps(report, indent=2, allow_nan=False) + "\n"
        if args.output:
            args.output.write_text(rendered, encoding="utf-8")
        else:
            sys.stdout.write(rendered)
        return 0
    except (OSError, json.JSONDecodeError, InputError) as exc:
        sys.stderr.write(f"Backtest input error: {exc}\n")
        return 2


if __name__ == "__main__":
    raise SystemExit(main())
