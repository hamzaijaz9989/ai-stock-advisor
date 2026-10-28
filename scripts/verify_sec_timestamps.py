"""Verify a bounded sample of SEC acceptance timestamps against SGML headers."""
from __future__ import annotations

import argparse
import sys
from pathlib import Path

from stock_advisor.sec_ingest import SecDataError
from stock_advisor.sec_timestamp_verify import verify_dataset, write_verified_dataset


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--input", type=Path, required=True, help="SEC source bundle JSON")
    parser.add_argument("--output", type=Path, required=True, help="Verified bundle JSON output")
    parser.add_argument("--max-filings-per-company", type=int, default=100, help="Latest filings to check per company (default: 100)")
    parser.add_argument("--delay", type=float, default=0.12, help="Seconds between SEC requests (default: 0.12)")
    args = parser.parse_args(argv)
    try:
        import json
        dataset = json.loads(args.input.read_text(encoding="utf-8"))
        verified = verify_dataset(
            dataset,
            max_filings_per_company=args.max_filings_per_company,
            request_delay_seconds=args.delay,
        )
        write_verified_dataset(verified, args.output)
    except (OSError, ValueError, json.JSONDecodeError, SecDataError) as exc:
        print(f"SEC timestamp verification failed: {exc}", file=sys.stderr)
        return 2
    summary = verified["timestamp_verification"]
    print(
        f"Attempted {summary['attempted']} filings; verified {summary['verified']}; "
        f"blocked {summary['blocked']}; facts timestamped {summary['facts_timestamped']}."
    )
    print("decision_eligible remains false; a bounded sample is not a complete strategy dataset.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
