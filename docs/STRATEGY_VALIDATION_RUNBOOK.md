# Northstar AI strategy validation runbook

## Purpose and release boundary

This pipeline generates candidate signals from explicit, dated snapshots and replays them against daily bars. It is a research system, not brokerage execution. A generated `BUY SETUP — UNVALIDATED` is not a validated BUY. The current engine deliberately cannot self-approve the strategy.

## Data contract

Use `scripts/run_strategy_validation.py` with a JSON file containing:

- `metadata`: `data_source`, `data_version` and the final dataset `as_of_date`.
- `snapshots`: one row per ticker and decision date. Each row must contain all fields used by `evaluate_snapshot` and an `as_of_timestamp` with an explicit timezone.
- `available_at`: timezone-aware timestamps for price, annual fundamentals, quarterly fundamentals, earnings, news and universe membership. A field becoming available after the decision timestamp is a look-ahead failure.
- `bars`: daily OHLC and optional adjusted close, keyed by ticker, with split-consistent prices and data through the final cutoff.
- `benchmark_bars`: separate daily bars for a broad-market benchmark (default `SPY`), covering the exact entry and exit dates of completed trades. The report never substitutes the stock's own buy-and-hold return for a broad-market benchmark.
- `quality_attestations`: external evidence statements. These are attestations, not proof; the validator does not infer them.
- optional transaction cost settings and sample-size thresholds.

The provisional snapshot rules mirror the current app's major gates: positive annual and quarterly financial quality, revenue decline limits, price/DCF ratio within 0.40×–2.50×, entry zone at 75–80% of the DCF base, at least 2:1 reward/risk, ATR-derived risk, no known near-term earnings event or flagged risk headline, and whole-share risk/notional sizing. Any missing, malformed or future-dated input fails closed.

## Run

```bash
python -m pip install -e ".[dev]"
python scripts/run_strategy_validation.py --input examples/strategy_validation_input.example.json --output validation-report.synthetic.json
# The fixture is fake and should fail release-quality gates by design.
python scripts/run_strategy_validation.py --input path/to/real_point_in_time_dataset.json --output validation-report.json
pytest
ruff check .
node --test tests/web_logic.test.mjs
```

Do not use synthetic examples as evidence of strategy performance. A report should preserve the exact input data version, source lineage, script commit, configuration, generated signals and failed gates.

## Known gaps before production approval

1. A licensed, complete, reproducible historical data bundle has not yet been wired in. PtData is a candidate for point-in-time corporate facts and historical index constituents; verify its terms and coverage. It does not alone supply every historical price, timestamped news and earnings input required here.
2. The input builder must produce snapshots from source records; manual or today's revised values are not acceptable for historical dates.
3. The validator now includes a cash-only, single-position-at-a-time portfolio equity curve with fixed-dollar risk sizing, cash/notional limits, overlap skips and drawdown. This is deliberately conservative and does not simulate overlapping positions or margin.
4. The report now evaluates frozen-rule signals separately inside each chronological test window and truncates each symbol's future bars at that window's end. It does not fit or tune parameters in each training window; it is a repeated out-of-sample evaluation of a frozen strategy, not an adaptive model-training loop. Fold boundaries are currently based on unique snapshot dates, so the dataset builder must supply genuine market-session dates and a separately untouched final holdout.
5. Each fold reports its own completed/incomplete trades, returns, profit factor and exact-date broad-market benchmark excess where benchmark dates match. Missing or date-incomplete SPY bars are not forward-filled. The same-stock buy-and-hold figure is reported separately and is not used as the broad-market benchmark. Review uncertainty, confidence intervals, parameter sensitivity and missing/delisted-stock coverage independently.
6. The validated BUY gate remains disabled until these gaps are addressed and an independent reviewer approves a versioned report.

## Release checklist

- [ ] Provider licence permits the intended use and distribution.
- [ ] Historical universe includes delisted names and point-in-time membership.
- [ ] Every feature has an availability timestamp and source identifier.
- [ ] Filing amendments/restatements cannot leak into earlier dates.
- [ ] Corporate actions, dividends, splits, suspensions and missing bars are reconciled.
- [ ] Execution uses next-session prices with conservative gap and cost handling.
- [ ] Walk-forward folds and an untouched holdout are fixed before viewing results.
- [ ] Portfolio overlap, capital allocation, cash, drawdown and exposure limits are simulated.
- [ ] Results beat suitable benchmarks net of costs with adequate sample size and uncertainty bounds.
- [ ] Independent review signs off on the exact strategy/data/report version.
- [ ] Automated tests pass and deployment is verified on production.

A high win rate by itself is not proof of an edge. Passing a historical test does not guarantee future returns.


## Conservative SEC/FMP chronology admission — 2026-11-10

For any point-in-time reconstruction, a date-only SEC `filed` value is insufficient to establish intraday availability. Exclude same-day filings unless a separately verified exact public-availability timestamp is no later than the decision timestamp; prior-day date-only filings may be included, with the limitation retained. FMP statement rows require a provider `acceptedDate` time no later than the decision timestamp, or a `filingDate` strictly earlier than the decision date. Provider accepted/filing timestamps are not independently verified public availability, so preserve that caveat. FMP snapshot `retrievedAt` must not be later than the research as-of time. Provider estimates are retrieval-time snapshots, not immutable historical estimate archives. The validator must continue to reject future/missing availability and never infer it from fiscal period end.


## Quote freshness admission — 2026-11-10 10:26 PKT / 05:26 UTC

Historical point-in-time validation must retain quote observation time separately from retrieval time. For the live Stock Brain collection path, the canonical adapter classifies a quote as fresh only when it is no later than the research `asOf` and within the market-state age limit: 15 minutes for open/unknown/pre/post states, or five calendar days only when the provider explicitly reports the market closed. Missing, future and stale quotes are rejected before specialist model invocation. Do not infer a closed session from the wall clock or a missing provider market-state field. This is a conservative admission rule and does not establish licensed data rights or historical strategy validity. Implementation `24b42afd41d0b0455b055cce8719c8a10e01ddec`; exact-head CI Tests `42762768731`, Validate `42762768617`, secret scan `42762768610`, push Tests `42762763147` passed; Preview deployment `700ebefd-605c-4aee-bfa1-5b63214b9844` succeeded. No database changes or Production deployment occurred.


## Additional provider licensing gate — 2026-11-10

A provider's technical accessibility or free API quota is not proof of permission to use its data in a public application or to distribute derived analytics. Alpha Vantage's default terms are personal/non-commercial and require written agreement for commercial use; Twelve Data's Free Tier explicitly disallows commercial use. Do not use either free tier as a public fallback. Confirm public display, caching, redistribution and derived-data rights in the applicable plan/agreement before ingesting historical bars. This is separate from point-in-time quality and strategy-performance acceptance.


## 2026-11-10 20:31 PKT / 15:31 UTC — latest live Phase 2 audit

- Phase: Phase 2 — nine-agent Research Council / Stock Brain. Phase 1 universe scanning remains user-confirmed COMPLETE; no scanner rebuild was started.
- Objective: refresh repository, CI, Preview/Production Pages, Worker/cron, D1, data freshness, Council, strategy and paper-lifecycle evidence; preserve fail-closed gates.
- Source commit: `7fa64406351d5e5dfa36bdec4d8b6ae8ab2f4292` on PR #108 branch `northstar/stock-brain-clean-review-20261110`; main is `3f765d8dd0f9099e05df57d09c9f48c9b247ba9c`. PR #108 is OPEN, non-draft, mergeable, 71 ahead / 0 behind before this docs refresh; formal reviews 0; inline threads 0. Main branch-protection GET returned 403 Resource not accessible by integration; required-check enforcement is unverified. PR #103 is stale/non-mergeable; PR #109 is a separate draft and its news-quality helper is not wired into Council scoring.
- Exact source-head CI: Tests `42842079359`, Validate `42842079254`, full-history secret scan `42842079583` — all SUCCESS on `7fa64406351d5e5dfa36bdec4d8b6ae8ab2f4292`. This docs-only follow-up needs its own exact-head CI; do not inherit these results as proof for the new head.
- Preview: Pages deployment `a20a98b6-a3b4-4b6a-a560-e2deb277fe12` succeeded for `7fa64406351d5e5dfa36bdec4d8b6ae8ab2f4292`, Functions enabled, isolated Preview D1 `bdffc29f-a4f6-498e-ade7-22c85d9bd373`. Live Trading Lab UI returned HTTP 200. Read-only readiness/performance/monitor returned HTTP 200; readiness confirms paper mode, execution disabled and kill switch engaged; Preview snapshots/runs/quotes/events are empty. FMP health returned HTTP 503 `MISSING_BINDING`, expected because Preview has no FMP/Alpaca/Gemini bindings.
- Production: Pages deployment `3782f3e9-0d2e-4d04-b95a-4dcd931a6133` serves main `3f765d8dd0f9099e05df57d09c9f48c9b247ba9c`. Read-only readiness, performance, monitor and FMP-health returned HTTP 200. Production FMP health reports quote 1 row, history 32 rows (latest 2026-11-10), fundamentals 1 row (latest 2026-01-25); this diagnostic is not proof of complete provider coverage or Council acceptance.
- Production D1: migrations `0001`–`0006`; 2 equity snapshots. Only `2026-11-08T18:34:38.720Z` (`alpaca_paper_read_only_sync`) is eligible trusted provenance. `2026-11-10T11:42:59.813Z` is `alpaca_paper_plugin_read_only_capture` and excluded from risk history. No trusted point is yet seven days old; earliest existing trusted baseline reaches seven days at `2026-11-15T18:34:38.720Z`. Council runs/traces 0/0; paper orders/positions/intents/fills/trade events 0; monitor quotes/events 0/0; audit rows 2. Controls: `enabled=0`, `mode=paper`, `kill_switch=1`. Preview D1 migrations `0001`–`0012`, empty, strategy approval `approved=0`.
- Snapshot workflow blocker: scheduled main workflow run `42837941172` failed at job `129905057412`, step 3, because GitHub Actions secret `NORTHSTAR_OPERATOR_TOKEN` was empty/missing. Production readiness precheck passed; sync/reconciliation steps were skipped, so no snapshot was written. PR #108 contains the replacement pinned-OIDC workflow and `POST /api/paper/snapshot` handler, but it is not merged or Production-verified.
- Monitor blocker: Production D1 has 222 monitor runs: 209 `market_closed`, 13 `failed`, aggregate errors 70; zero runs checked symbols and zero quote/event rows. Latest run #222 at `2026-11-10T15:30:53.341Z` failed with `Shortlist cache is stale or incomplete; monitoring fail-closed.` Cache `generatedAt=2026-11-10T11:04:27.273Z`, status success, 253 universe / 201 ranked / 52 excluded; at audit time it was about 4h27 old, beyond the Worker's 4h limit. Latest scheduled refresh observed: run `42803828945` (11:00:13Z–11:04:34Z); no later scheduled cache run was present as of 15:31Z. Worker `northstar-market-monitor` remains deployment `7326f3e7-f323-4856-badf-aa8b979dffb4`, version `2739d49a-4182-423f-8113-616252c5ddd6` at 100%, cron `*/5 * * * *`. Deployed code still sends FMP auth in a custom header; PR #108 commit `3040f164f5bd31ee60b59e55b9cbac68045a8d35` changes to `apikey` query auth but is not deployed. Current latest failures are stale-cache failures; earlier runs #214–#216 had 10/10 quote failures.
- Council: all nine role integrations, dashboard rendering, durable trace/scorecard and telemetry are implemented on PR #108 and exact source-head CI passed. Synthetic integration is not live acceptance: without eligible timestamped news and a permitted sentiment feed it correctly returns `NO_TRADE` (market scanner, technical and fundamental complete; news/sentiment unavailable; bull/bear/portfolio/risk blocked). Sentiment remains unavailable until a permitted timestamped source is authorized; do not scrape or use unofficial wrappers. Preview provider bindings are absent.
- Strategy validation NOT APPROVED; paper lifecycle NOT READY; validated BUY disabled. No authenticated `POST /api/research/collect` was invoked.
- Database changes: NONE. D1 access was SELECT-only (`rows_written=0`, `changed_db=false`). No migrations, secrets read/changed, broker calls, order actions, execution-control changes or Production deployment.
- Repository visibility unresolved: GitHub API reports `private=false` / public while the owner states private; GitHub Settings has not been verified. Do not change visibility; treat contents as publicly accessible until Settings confirms otherwise.
- Exact next action: obtain independent review and authorized governance for PR #108; after approval/merge, verify the pinned-OIDC scheduled read-only snapshot workflow and separate Worker release. Keep the collector blocked until fresh trusted snapshot, genuine seven-day baseline, broker/ledger reconciliation, provider/auth, eligible news and permitted sentiment gates all pass. Then run one controlled research-only collection and verify all nine outcomes, trace/scorecard, telemetry and idempotent replay. Never enable execution or submit an order.

### Current approval state — 2026-11-10

No point-in-time strategy validation report has been accepted or independently approved. The Council synthetic integration test is a software contract test, not a performance result. Production has no trusted seven-day baseline, no Council runs/traces, no paper fills/trades and no complete timestamped news/sentiment history. Keep `approved=0` in the isolated Preview ledger, do not create a Production approval record, and keep validated BUY disabled.


## 2026-11-10 20:38 PKT / 15:38 UTC — sentiment-source alternatives and exact-head verification

- Phase/objective: finish the independent sentiment-source investigation for Phase 2 and refresh exact-head CI/Preview evidence; no production collection or order endpoint was invoked.
- Source commit under audit: `f9a52aa3ad877382eba7ff66129e25fc1563a766` on PR #108, 73 commits ahead / 0 behind main. PR #108 remains open; independent reviews 0; branch protection still not readable (403); mergeability state is unknown, not confirmed conflict-free. Exact-head CI all SUCCESS: Tests push `42846179313`, Tests PR `42846199256`, Validate `42846200399`, full-history secret scan `42846199331`.
- Exact Preview deployment `57dde387-e8ec-42d9-a87e-79cf5ab0dd28` succeeded. Smoke: Trading Lab UI 200; readiness/performance/monitor 200; paper mode/locked execution/kill switch confirmed; FMP health 503 MISSING_BINDING as expected in isolated Preview. No Preview writes.
- Provider alternatives evaluated:
  1. FMP Historical Social Sentiment exists only in FMP's legacy endpoint documentation and its example timestamp is a timezone-less string (for example `2022-06-30 23:00:00`). It cannot meet Northstar's exact point-in-time chronology requirement until FMP confirms timezone semantics. FMP's official public-app/client-dashboard guidance says the agreement must cover the intended users, datasets and delivery method; an individual API plan is not sufficient evidence of commercial display/redistribution rights. Do not use it for Council sentiment until both written rights and timestamp semantics are confirmed. Sources: https://site.financialmodelingprep.com/developer/docs/social-sentiment-api and https://site.financialmodelingprep.com/insights/platform/can-you-use-fmp-data-in-a-public-app-website-or-client-dashboard
  2. Finnhub documents a `/stock/social-sentiment` endpoint for Reddit/Twitter. Its official Startups/Enterprise pricing lists Social Sentiment and commercial use/redistribution rights under Enterprise with contact-sales pricing. Public schema examples expose `atTime` as a timezone-less local datetime, so timezone semantics also require written confirmation. No Finnhub commercial contract or API credential is connected. Do not integrate until licensed and timestamp-qualified. Source: https://api.finnhub.io/pricing-startups-and-enterprise
  3. News discovery is not a substitute for social sentiment. Current production news items are timestamped but publisherVerified=false and redirect/discovery attributed; the News Analyst may report them with explicit source-quality risks, not as verified catalysts. The Nasdaq earnings calendar event for 2026-11-17 AMC is a separate event input, not sentiment.
- Current production input smoke remains: FMP history 1,255 bars and 7/7 datasets through 2026-11-10; quote timestamp 2026-11-10T15:35:00Z; news discovery items present but unverified; Nasdaq earnings event found. No sentiment feed. The collector was not called.
- Database changes: NONE; GET-only provider checks and SELECT-only D1 audit. No secrets read/changed, broker requests, orders, execution-control changes or Production deployment.
- Status: source alternatives researched; no safe credential-free/licensed/timezone-qualified sentiment provider can be enabled now. Sentiment Analyst remains UNAVAILABLE; downstream Council roles remain blocked; strategy NOT APPROVED; paper lifecycle NOT READY; BUY disabled.
- Exact next action: obtain independent review/governance for PR #108. Separately, only after the owner has a commercial provider agreement and provider-confirmed UTC/timezone semantics, add a provider adapter with timestamp/coverage/volume/quality tests. Until then, keep sentiment explicitly unavailable and keep the collector blocked by the remaining gates.
