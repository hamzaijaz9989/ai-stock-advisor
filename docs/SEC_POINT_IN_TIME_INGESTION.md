# SEC point-in-time ingestion

## What it does

`scripts/fetch_sec_history.py` downloads issuer submissions and XBRL company facts from the official SEC EDGAR APIs. It preserves accession numbers, filing dates, fiscal periods, original fact values, and raw `acceptanceDateTime` text. The raw timestamp is **not considered verified availability time**: timezone interpretation in SEC submissions JSON has been found inconsistent across issuers and dates. The bundle therefore sets `available_at: null` and `availability_timestamp_verified: false` until the timestamp is reconciled against filing-index or SGML-header evidence.

## Run

Set a descriptive SEC user agent if desired, then run:

```bash
python scripts/fetch_sec_history.py --symbols AAPL MSFT NVDA --cutoff 2026-10-28 --output data/sec-source-bundle.json
```

The SEC's public APIs do not require an API key. Respect the SEC's fair-access guidance and keep request volume low. Do not commit downloaded source bundles or secrets to Git.

## Run it from GitHub Actions

1. Open the repository's **Actions** tab.
2. Select **Fetch SEC historical source bundle**.
3. Choose **Run workflow**, enter 1–10 ticker symbols and optionally a cutoff date, then run it.
4. When the workflow succeeds, download the `northstar-sec-source-<run-id>` artifact from that run. The artifact expires after 7 days and is not committed to the repository.

This workflow only downloads official SEC filings/facts. It does not manufacture prices, news, earnings dates, index membership, or a BUY signal. The resulting artifact is not yet a complete backtest dataset.

## Important limits

This is the first real-data ingestion adapter, not a strategy backtest and not a complete signal dataset. It does not ingest daily prices, corporate-action-adjusted OHLCV, point-in-time index membership, historical timestamped news, or a complete earnings calendar. SEC companyfacts can include duplicate contexts and amended/restated reports; consumers must select a fact by accession, form, unit, fiscal period and its verified availability timestamp. All facts in this initial bundle are ineligible for point-in-time signal generation until raw acceptance timestamps are independently reconciled. Never treat `raw_acceptance_timestamp` as verified.

The output always marks `decision_eligible: false`. It must not be fed directly into the strategy validator as if it were a complete dataset. BUY remains locked until timestamps are reconciled and independent validation passes on a complete, licensed, point-in-time dataset.


## Bounded SGML-header timestamp verification

Use the verifier to cross-check a bounded sample of filings against the compact SEC filing-index header page. The SEC documents that the header contains the acceptance date and time; the script checks accession and official filed-date consistency, allows acceptance and official filing dates to differ (including after-hours submissions), and converts the acceptance time from America/New_York to UTC. This is an acceptance timestamp, **not** proof of the exact time the filing became publicly retrievable on sec.gov.

```bash
python scripts/verify_sec_timestamps.py --input sec-source-bundle.json --output sec-verified-sample.json --max-filings-per-company 100 --delay 0.12
```

The GitHub Actions workflow also uploads a separate `northstar-sec-verified-sample-<run-id>` artifact. It verifies up to 100 of the latest filings per company, records whether the raw submissions timestamp agrees with the independent header timestamp, and keeps public availability unverified; unverified and failed acceptance records stay blocked. This bounded sample is useful for pipeline testing but does not timestamp every historical observation, reconstruct the complete point-in-time signal set, or change `decision_eligible: false`. Review the verification summary and failure reasons before using any sample in research.
