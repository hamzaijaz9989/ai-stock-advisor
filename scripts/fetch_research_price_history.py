"""Fetch historical Yahoo Finance chart data for internal research prototypes only.

Yahoo Finance does not offer this endpoint as an official public API. Verify the
provider's current terms and obtain a licensed feed before commercial use,
redistribution, or production decisions. This tool never marks output eligible
for validated BUY.
"""
from __future__ import annotations

import argparse
import json
import math
import time
from datetime import UTC, date, datetime, timedelta
from pathlib import Path
from typing import Any
from urllib.error import HTTPError, URLError
from urllib.parse import urlencode
from urllib.request import Request, urlopen
from zoneinfo import ZoneInfo

DEFAULT_SYMBOLS = ["AAPL", "MSFT", "NVDA", "AMZN", "GOOGL", "SPY"]
DEFAULT_START = date(2010, 1, 1)
USER_AGENT = "NorthstarAI research-only historical data audit contact: ihamzaij681@gmail.com"


class PriceDataError(RuntimeError):
    """Raised when the price provider returns invalid or unavailable data."""


def _fetch_json(url: str, timeout: float = 30.0) -> Any:
    request = Request(url, headers={
        "User-Agent": USER_AGENT,
        "Accept": "application/json",
        "Accept-Encoding": "identity",
    })
    try:
        with urlopen(request, timeout=timeout) as response:
            return json.loads(response.read().decode("utf-8"))
    except (HTTPError, URLError, TimeoutError, OSError, UnicodeDecodeError, json.JSONDecodeError) as exc:
        raise PriceDataError(f"Price request failed for {url}: {exc}") from exc


def _finite(value: Any) -> float | None:
    if isinstance(value, bool) or value is None:
        return None
    try:
        result = float(value)
    except (TypeError, ValueError):
        return None
    return result if math.isfinite(result) else None


def fetch_symbol(
    symbol: str,
    *,
    start: date,
    cutoff: date,
    fetch_json=_fetch_json,
) -> dict[str, Any]:
    ticker = symbol.strip().upper()
    if not ticker or any(ch not in "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789.-^=" for ch in ticker):
        raise ValueError(f"Invalid symbol syntax: {symbol!r}")
    if start > cutoff:
        raise ValueError("Start date must be on or before cutoff date.")
    period1 = int(datetime.combine(start, datetime.min.time(), UTC).timestamp())
    period2 = int(datetime.combine(cutoff + timedelta(days=1), datetime.min.time(), UTC).timestamp())
    query = urlencode({
        "period1": period1,
        "period2": period2,
        "interval": "1d",
        "events": "div,splits",
        "includeAdjustedClose": "true",
    })
    url = f"https://query1.finance.yahoo.com/v8/finance/chart/{ticker}?{query}"
    payload = fetch_json(url)
    chart = payload.get("chart", {}) if isinstance(payload, dict) else {}
    if chart.get("error"):
        raise PriceDataError(f"Provider error for {ticker}: {chart['error']}")
    results = chart.get("result")
    if not isinstance(results, list) or not results or not isinstance(results[0], dict):
        raise PriceDataError(f"No historical chart result returned for {ticker}.")
    result = results[0]
    meta = result.get("meta", {})
    timezone_name = meta.get("exchangeTimezoneName", "America/New_York")
    try:
        exchange_tz = ZoneInfo(timezone_name)
    except (KeyError, ValueError):
        exchange_tz = ZoneInfo("America/New_York")
    timestamps = result.get("timestamp", [])
    indicators = result.get("indicators", {})
    quotes = indicators.get("quote", [{}])
    quote = quotes[0] if quotes else {}
    adjusted_groups = indicators.get("adjclose", [])
    adjusted = adjusted_groups[0].get("adjclose", []) if adjusted_groups else []
    bars = []
    for index, timestamp in enumerate(timestamps):
        session_date = datetime.fromtimestamp(timestamp, exchange_tz).date()
        if session_date < start or session_date > cutoff:
            continue
        row = {}
        for key in ("open", "high", "low", "close", "volume"):
            values = quote.get(key, [])
            row[key] = values[index] if index < len(values) else None
        row["adjusted_close"] = adjusted[index] if index < len(adjusted) else None
        o, h, low, close = (_finite(row[k]) for k in ("open", "high", "low", "close"))
        if any(value is None or value <= 0 for value in (o, h, low, close)):
            continue
        if low > min(o, close) or h < max(o, close) or low > h:
            continue
        adj = _finite(row["adjusted_close"])
        bars.append({
            "date": session_date.isoformat(),
            "open": o, "high": h, "low": low, "close": close,
            "adjusted_close": adj if adj is not None and adj > 0 else None,
            "volume": row["volume"] if isinstance(row["volume"], int) and row["volume"] >= 0 else None,
        })
    dates = [bar["date"] for bar in bars]
    if not bars:
        raise PriceDataError(f"No valid daily OHLC bars returned for {ticker}.")
    if len(dates) != len(set(dates)):
        raise PriceDataError(f"Duplicate daily sessions returned for {ticker}.")
    if dates != sorted(dates):
        raise PriceDataError(f"Daily bars are not in ascending date order for {ticker}.")
    events = result.get("events", {})
    corporate_actions = []
    for event_type in ("dividends", "splits"):
        entries = events.get(event_type, {})
        if isinstance(entries, dict):
            for epoch, item in entries.items():
                try:
                    action_date = datetime.fromtimestamp(int(epoch), exchange_tz).date()
                except (ValueError, TypeError, OSError):
                    continue
                if start <= action_date <= cutoff and isinstance(item, dict):
                    corporate_actions.append({
                        "date": action_date.isoformat(),
                        "type": "dividend" if event_type == "dividends" else "split",
                        "amount": item.get("amount"),
                        "numerator": item.get("numerator"),
                        "denominator": item.get("denominator"),
                    })
    corporate_actions.sort(key=lambda item: (item["date"], item["type"]))
    return {
        "symbol": ticker,
        "exchange_timezone": timezone_name,
        "currency": meta.get("currency"),
        "first_bar_date": dates[0],
        "last_bar_date": dates[-1],
        "bar_count": len(bars),
        "bars": bars,
        "corporate_actions": corporate_actions,
        "quality": {
            "chronological": True,
            "duplicate_sessions": False,
            "ohlc_ranges_checked": True,
            "adjusted_close_coverage": sum(bar["adjusted_close"] is not None for bar in bars),
            "corporate_actions_included": True,
            "historical_universe_membership_included": False,
        },
    }


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--symbols", nargs="+", default=DEFAULT_SYMBOLS)
    parser.add_argument("--start", default=DEFAULT_START.isoformat())
    parser.add_argument("--cutoff", default=date.today().isoformat())
    parser.add_argument("--output", type=Path, required=True)
    parser.add_argument("--delay", type=float, default=1.0)
    args = parser.parse_args(argv)
    try:
        start = date.fromisoformat(args.start)
        cutoff = date.fromisoformat(args.cutoff)
        if args.delay < 0:
            raise ValueError("Delay cannot be negative.")
        symbols = list(dict.fromkeys(symbol.strip().upper() for symbol in args.symbols if symbol.strip()))
        if not symbols:
            raise ValueError("At least one symbol is required.")
        results = []
        for index, symbol in enumerate(symbols):
            if index:
                time.sleep(args.delay)
            results.append(fetch_symbol(symbol, start=start, cutoff=cutoff))
        output = {
            "schema_version": 1,
            "provider": "Yahoo Finance chart endpoint (unofficial)",
            "retrieved_at_utc": datetime.now(UTC).isoformat(),
            "requested_start_date": start.isoformat(),
            "cutoff_date": cutoff.isoformat(),
            "symbols": symbols,
            "data": {item["symbol"]: item for item in results},
            "commercial_use_authorized": False,
            "decision_eligible": False,
            "limitations": [
                "Yahoo Finance chart endpoint is unofficial; verify current provider terms before use.",
                "This artifact is for internal research and pipeline testing only, not commercial display or redistribution.",
                "Price bars do not establish point-in-time universe membership or the live strategy's fundamental, earnings, news, and valuation inputs.",
                "No BUY signal can be validated from this artifact alone.",
            ],
        }
        args.output.parent.mkdir(parents=True, exist_ok=True)
        args.output.write_text(json.dumps(output, indent=2, allow_nan=False) + "\n", encoding="utf-8")
    except (ValueError, OSError, PriceDataError) as exc:
        parser.exit(2, f"Price history collection failed: {exc}\n")
    print(f"Wrote {len(results)} symbols to {args.output}; decision_eligible=false.")
    for item in results:
        print(f"{item['symbol']}: {item['bar_count']} bars, {item['first_bar_date']}..{item['last_bar_date']}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
