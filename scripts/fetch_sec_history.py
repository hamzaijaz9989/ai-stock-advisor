"""Fetch raw SEC EDGAR filing/fundamental history into an auditable JSON bundle."""
from __future__ import annotations

import argparse
import sys
from datetime import date
from pathlib import Path

from stock_advisor.sec_ingest import SecDataError, collect_dataset, write_dataset


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--symbols", nargs="+", required=True, help="US stock ticker symbols, e.g. AAPL MSFT")
    parser.add_argument("--cutoff", required=True, help="Latest filing date to include (YYYY-MM-DD)")
    parser.add_argument("--output", type=Path, required=True, help="Output JSON path")
    parser.add_argument("--delay", type=float, default=0.12, help="Seconds between issuer requests (default: 0.12)")
    args = parser.parse_args(argv)
    try:
        cutoff = date.fromisoformat(args.cutoff)
        dataset = collect_dataset(args.symbols, cutoff=cutoff, request_delay_seconds=args.delay)
        write_dataset(dataset, args.output)
    except (ValueError, OSError, SecDataError) as exc:
        print(f"SEC ingestion failed: {exc}", file=sys.stderr)
        return 2
    print(f"Wrote SEC source bundle for {len(dataset['companies'])} companies to {args.output}")
    print("This is not a complete strategy dataset; decision_eligible remains false.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
