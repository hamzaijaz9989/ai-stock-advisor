# SEC point-in-time ingestion

## What it does

`scripts/fetch_sec_history.py` downloads issuer submissions and XBRL company facts from the official SEC EDGAR APIs. It preserves accession numbers, filing dates, fiscal periods, original fact values and the exact acceptance timestamp when present in the submissions response. A fact with no exact timestamp is marked `availability_timestamp_verified: false`; the script does not invent one from a fiscal period or filing date.

## Run

Set a descriptive SEC user agent if desired, then run:

```bash
python scripts/fetch_sec_history.py --symbols AAPL MSFT NVDA --cutoff 2026-10-28 --output data/sec-source-bundle.json
```

The SEC's public APIs do not require an API key. Respect the SEC's fair-access guidance and keep request volume low. Do not commit downloaded source bundles or secrets to Git.

## Important limits

This is the first real-data ingestion adapter, not a strategy backtest and not a complete signal dataset. It does not ingest daily prices, corporate-action-adjusted OHLCV, point-in-time index membership, historical timestamped news, or a complete earnings calendar. SEC companyfacts can include duplicate contexts and amended/restated reports; consumers must select a fact by accession, form, unit, fiscal period and its verified availability timestamp. Facts without a verified timestamp must be excluded from historical signal generation.

The output always marks `decision_eligible: false`. It must not be fed directly into the strategy validator as if it were a complete dataset. BUY remains locked until independent validation passes on a complete, licensed, point-in-time dataset.
