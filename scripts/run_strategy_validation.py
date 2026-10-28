"""Run the point-in-time strategy validator from an auditable JSON dataset.

The input must contain snapshots with timezone-aware as-of/availability
timestamps and split-consistent daily OHLC bars keyed by ticker. This command
does not fetch or fabricate source data and can never approve live BUY.
"""
from __future__ import annotations

import argparse
import json
import math
import sys
from datetime import date
from pathlib import Path
from typing import Any

from stock_advisor.backtest import BacktestConfig, DailyBar
from stock_advisor.strategy_validation import build_validation_report


def _json_safe(value: Any) -> Any:
    if isinstance(value, (date,)):
        return value.isoformat()
    if isinstance(value, dict):
        return {str(k): _json_safe(v) for k, v in value.items()}
    if isinstance(value, (list, tuple)):
        return [_json_safe(v) for v in value]
    if isinstance(value, float) and not math.isfinite(value):
        return "Infinity" if value > 0 else "-Infinity" if value < 0 else None
    return value


def run(payload: Any) -> dict[str, Any]:
    if not isinstance(payload, dict):
        raise ValueError("Input root must be a JSON object.")
    snapshots = payload.get("snapshots")
    raw_bars = payload.get("bars")
    if not isinstance(snapshots, list) or not snapshots:
        raise ValueError("snapshots must be a non-empty array of point-in-time rows.")
    if not isinstance(raw_bars, dict) or not raw_bars:
        raise ValueError("bars must be a non-empty object keyed by ticker.")
    metadata = payload.get("metadata")
    if not isinstance(metadata, dict):
        raise ValueError("metadata object is required.")
    for field in ("data_source", "data_version", "as_of_date"):
        if not isinstance(metadata.get(field), str) or not metadata[field].strip():
            raise ValueError(f"metadata.{field} is required.")
    cutoff = date.fromisoformat(metadata["as_of_date"])
    for index, row in enumerate(snapshots):
        if not isinstance(row, dict):
            raise ValueError(f"snapshots[{index}] must be an object.")
        if date.fromisoformat(str(row.get("as_of_date", ""))) > cutoff:
            raise ValueError(f"snapshots[{index}] is after metadata.as_of_date.")
    bars: dict[str, list[DailyBar]] = {}
    for raw_ticker, values in raw_bars.items():
        ticker = str(raw_ticker).strip().upper()
        if not ticker or not isinstance(values, list):
            raise ValueError(f"bars.{raw_ticker} must be an array.")
        bars[ticker] = []
        for index, row in enumerate(values):
            if not isinstance(row, dict):
                raise ValueError(f"bars.{ticker}[{index}] must be an object.")
            bar_date = date.fromisoformat(str(row["date"]))
            if bar_date > cutoff:
                raise ValueError(f"bars.{ticker}[{index}] is after the declared data cutoff.")
            bars[ticker].append(DailyBar(
                date=bar_date, open=float(row["open"]), high=float(row["high"]),
                low=float(row["low"]), close=float(row["close"]),
                adjusted_close=None if row.get("adjusted_close") is None else float(row["adjusted_close"]),
            ))
    config_raw = payload.get("config", {})
    if not isinstance(config_raw, dict):
        raise ValueError("config must be an object.")
    config = BacktestConfig(
        slippage_bps_per_side=float(config_raw.get("slippage_bps_per_side", 5)),
        commission_bps_per_side=float(config_raw.get("commission_bps_per_side", 0)),
    )
    attestations = payload.get("quality_attestations", {})
    if not isinstance(attestations, dict):
        raise ValueError("quality_attestations must be an object.")
    report = build_validation_report(
        snapshots, bars,
        data_provenance_verified=attestations.get("data_provenance_verified") is True,
        point_in_time_coverage_verified=attestations.get("point_in_time_coverage_verified") is True,
        survivorship_control_verified=attestations.get("survivorship_control_verified") is True,
        corporate_actions_verified=attestations.get("corporate_actions_verified") is True,
        costs_calibrated=attestations.get("costs_calibrated") is True,
        holdout_untouched=attestations.get("holdout_untouched") is True,
        config=config,
        minimum_trades=int(payload.get("minimum_trades", 100)),
        minimum_walk_forward_folds=int(payload.get("minimum_walk_forward_folds", 4)),
    )
    report["input_metadata"] = metadata
    report["configuration"] = {
        "slippage_bps_per_side": config.slippage_bps_per_side,
        "commission_bps_per_side": config.commission_bps_per_side,
    }
    return _json_safe(report)


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--input", required=True, type=Path)
    parser.add_argument("--output", type=Path)
    args = parser.parse_args(argv)
    try:
        report = run(json.loads(args.input.read_text(encoding="utf-8")))
        rendered = json.dumps(report, indent=2, allow_nan=False) + "\n"
        if args.output:
            args.output.write_text(rendered, encoding="utf-8")
        else:
            sys.stdout.write(rendered)
        return 0
    except (OSError, json.JSONDecodeError, ValueError, TypeError, KeyError) as exc:
        sys.stderr.write(f"Strategy validation input error: {exc}\n")
        return 2


if __name__ == "__main__":
    raise SystemExit(main())
