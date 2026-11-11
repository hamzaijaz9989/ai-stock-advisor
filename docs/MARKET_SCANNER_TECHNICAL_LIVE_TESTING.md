# Market Scanner production acceptance audit

## Live follow-up — 2026-11-10 21:39 UTC

- GitHub PR #117 is open and unmerged at `111bcd2397246d56c59d632e24a5c1da781698b2`; exact-head Tests `42906215140`, Validate `42906215127`, and full-history secret scan `42906215101` all passed. PR #108 and #115 remain open/unmerged and both contain overlapping FMP/Worker changes. The isolated release branch carries the FMP query-auth fix and sanitized failure classification; neither PR was merged.
- Cloudflare's current Pages project metadata confirms Preview `NORTHSTAR_DB` is `bdffc29f-a4f6-498e-ade7-22c85d9bd373` and Production is `528f3a23-1d1f-4d16-8463-f643d85f5deb`. Latest Preview deployment `d421d9e6-2370-4775-ae58-17633fc51816` succeeded from the release branch; Production remains `fec9c9e6-de57-41a4-8aaa-a83fdb3de56d` from main `85c51f847f4b4a966be629ff9f3702194d6ae262`.
- Production D1 SELECT-only audit at `2026-11-10T21:35Z`: 295 monitor runs, zero quote rows, zero event rows. Latest run #295 at `21:35:53Z` is `market_closed` (normal outside session). Latest active-session failures remain #287–#285 and each records 10 failures / 0 quotes; older Worker detail omits provider causes. The deployed Worker still uses the incorrect FMP custom-header transport; the corrected query parameter is on the unmerged branch. Thus FMP authentication transport is the confirmed Worker defect; the specific Yahoo fallback response remains unknown until a diagnostic-enabled Worker runs.
- The Production cache still originates from `2026-11-10T19:42:15.959Z` (201 ranked, 52 excluded, 10 enriched). At `21:39Z` it is about 117 minutes old, so `validate-stock-cache.mjs` correctly fails its 30-minute limit. A fresh workflow was not triggered because its commit-to-main step can trigger a Production Pages deployment, which is outside the current authorization.
- Focused scanner/provider tests passed 20/20. The full JavaScript suite passed 225/225; both scanner scripts passed `node --check`, and `git diff --check` passed. A first sandboxed test attempt failed with Windows `spawn EPERM`; the same suite passed after approval to run Node test workers.
- Production execution controls remain `mode=paper`, `enabled=0`, `kill_switch=1`; the read-only D1 query reported `rows_written=0`, `changed_db=false`. No Worker/Pages Production deployment, PR merge, secret operation, broker mutation, order or execution change occurred.

**Acceptance remains incomplete.** The exact production blockers are a cache younger than 30 minutes, a released Worker fix followed by a successful open-session quote run, and persisted quote rows verified in D1. The present branch is tested and CI-clean, but those production gates are not satisfied.

## Isolated provider release — 2026-11-11 02:30 PKT (2026-11-10 21:30 UTC)

- Narrow PR #117 (`19be2f98e895cef1d0fb67c27b20a7001fd06307`) contains only the Worker FMP auth/diagnostic fix, Gemini exact-output health fix, tests and this audit. Local provider tests passed 14/14 and the main-based full JavaScript suite passed 225/225. The initial Pages Preview build succeeded, but its deployment metadata exposed a Preview D1 binding drift: Preview pointed to the Production database despite `web/wrangler.toml` specifying the isolated Preview database.
- Root cause: `main`'s `web/wrangler.toml` had only a top-level Production D1 binding, so Preview inherited Production despite the dashboard's Preview setting. Restored explicit `env.preview` and `env.production` D1 overrides and corrected only the Pages project Preview `NORTHSTAR_DB` binding to `bdffc29f-a4f6-498e-ade7-22c85d9bd373`. Cloudflare's PATCH response confirmed Preview now points to `northstar-preview`; Production remains `528f3a23-1d1f-4d16-8463-f643d85f5deb`. The Preview operator-token binding remained configured; no provider secret value was read or changed. A new Preview deployment is required before exercising any Preview Function, so the previous Preview deployment is not used for runtime testing.
- PR #117 GitHub validation and full-history secret scan were still running at this timestamp. No Production deployment or PR merge has happened yet. Production FMP/Alpaca/Gemini observations above are direct live endpoint reads; Production remains on the old Gemini health check and old monitor Worker until the reviewed changes are released.

## Provider API verification — 2026-11-11 02:18 PKT (2026-11-10 21:18 UTC)

- Production `GET /api/fmp-health` at `2026-11-10T21:16:30.842Z` returned HTTP 200. The FMP quote, history and fundamentals probes each returned HTTP 200 with 1, 32 and 1 rows respectively; the latest history date was `2026-11-10`. This verifies authenticated provider access and non-empty responses, not independent market-data accuracy. It also confirms FMP itself is reachable while the separate Production monitor Worker still has the FMP authentication transport defect documented below.
- Production `GET /api/alpaca/status` at `2026-11-10T21:16:52.505Z` returned HTTP 200, `connected=true`, `environment=paper`, account status `ACTIVE`, and no positions. This verifies the paper-account endpoint only; no order or market-data request was made. Sensitive balance fields returned by the endpoint are intentionally omitted here.
- Production `GET /api/gemini-health` at `2026-11-10T21:17:02.917Z` reported generation passed on `gemma-4-26b-a4b-it`, but the response also had `finishReason=MAX_TOKENS` and length 218. The endpoint only checked whether the expected token appeared anywhere, so it produced a false positive for a non-exact/truncated response. Locally fixed the health probe to require the exact token and `STOP`; added `tests/gemini-health.test.mjs`. Production still runs the old health check until an approved release. The protected nine-agent live collection was not invoked, so this does not validate role-report accuracy.
- Provider check regression suite passed 14/14 and the full JavaScript suite passed 290/290 after the Gemini health fix. No provider credentials or generated response text were exposed. The Gemini health probe performs a minimal generation request and may consume provider quota.

**Provider verdict:** FMP and Alpaca Paper authentication/endpoints are currently reachable; Gemini authenticates and generates but its live response failed the exact-output health contract, which the current Production health route incorrectly marked as success. None of these checks establishes market-data truth or validates research-agent output quality.

## Current follow-up — 2026-11-11 02:08 PKT (2026-11-10 21:08 UTC)

- GitHub main remains `85c51f847f4b4a966be629ff9f3702194d6ae262`. Draft PR #116 carries the isolated nine-agent integration plus scanner safeguards and the timezone fix; its exact-head Node tests, Python tests, and full-history secret scan passed. PRs #108 and #115 remain open and unmerged.
- Full JavaScript suite: 288/288 passed. The point-in-time regression now rejects FMP accepted timestamps without an explicit timezone instead of interpreting them using the machine's local timezone.
- Latest production D1 monitor run #287 (`2026-11-10T20:55:52.645Z`) failed with zero symbols checked and ten quote failures. `monitor_quotes`, `monitor_events`, `research_council_runs`, and `research_decision_traces` each contain zero rows. Read-only controls remain `mode=paper`, `enabled=0`, `kill_switch=1`; D1 reads wrote zero rows.
- Production Worker version `2739d49a-4182-423f-8113-616252c5ddd6` still sends FMP authentication in the custom header. The checked-in cache is generated at `2026-11-10T19:42:15.959Z`, outside the 30-minute validator window. No refresh was dispatched, production deployment performed, or PR merged.

## Live follow-up — 2026-11-11 02:08 PKT (2026-11-10 21:08 UTC)

- GitHub MCP refresh still reports main at `85c51f847f4b4a966be629ff9f3702194d6ae262`; PR #108 and #115 remain open/unmerged and PR #116 remains a draft. A local `git fetch origin` could not reach GitHub because the configured network proxy refused the connection; the GitHub connector supplied the current commit and PR state.
- Focused Market Scanner tests passed 18/18 and the full JavaScript suite passed 288/288 on integration head `b0d8ce5b9e9b2c8ef631c2b59043411992bc0f00`. The cache validator correctly fails the checked-in cache: generated at `2026-11-10T19:42:15.959Z`, it was approximately 86 minutes old, beyond the 30-minute limit.
- Read-only Production D1 query at approximately `2026-11-10T21:08Z` found latest monitor run #289 (`2026-11-10T21:05:52.862Z`) `market_closed`, zero symbols checked, zero errors, with the Worker intentionally idle. The last active-session failure remains run #287: ten quote failures and zero symbols checked. `monitor_quotes`, `monitor_events`, `research_council_runs`, and `research_decision_traces` each still have zero rows. Controls remain `mode=paper`, `enabled=0`, `kill_switch=1`; all D1 reads returned `rows_written=0` and `changed_db=false`.
- Root cause remains established in deployed source: FMP auth is sent in a custom header instead of the documented `apikey` query parameter. The corrected transport and sanitized provider-status classification are in the unmerged integration branch, so provider behavior and quote persistence have not been verified in Production. The last active failure's provider-specific cause is not present in the old Worker's D1 detail.
- No authorized workflow-dispatch action is available through the connected GitHub tool, and the local GitHub network path is unavailable. No workflow was dispatched, no production deployment or PR merge occurred, and no D1 writes/secrets/trades/execution-control changes occurred.

**Acceptance remains incomplete.** Current Production acceptance: 0/3 runtime gates passed (cache within 30 minutes, corrected Worker quote retrieval, and quote persistence to D1). Scanner code tests pass, but these do not replace fresh scan or Production evidence.

**Current acceptance: incomplete.** The scanner code and nine-agent integration pass automated tests, but live production quote retrieval, D1 quote persistence and authenticated nine-agent execution remain unverified or failing.

## Verified state — 2026-11-10 20:10 UTC

- Current `main` at audit start: `85c51f847f4b4a966be629ff9f3702194d6ae262`.
- Refresh run `42887359931` completed successfully. It evaluated all 253 symbols: 201 ranked, 52 excluded, and all ten shortlist candidates enriched. The validator passed. The published cache was generated at `2026-11-10T19:42:15.959Z`.
- Cloudflare Pages production deployment `fec9c9e6-de57-41a4-8aaa-a83fdb3de56d` succeeded from that `main` commit. A live cache-bypass browser read returned the same cache and complete scan accounting.
- Local `validate-stock-cache.mjs` passed. `tests/stock-cache-validation.test.mjs` passed 9/9 after a restricted process-spawn permission prevented the first test-run attempt.
- Production `/api/monitor?limit=20` and direct Worker `/health` returned HTTP 200. Direct `/events?limit=20` returned HTTP 200 with an empty event list. The latest D1 run (`2026-11-10T20:05:53.098Z`) failed with zero quotes checked and ten quote failures. D1 has zero `monitor_quotes` and zero `monitor_events` rows. The Worker cron is `*/5 * * * *`.
- D1 history shows the Worker rejected the old cache as stale before the refresh completed. From 19:45Z through 20:05Z, it continued failing all ten quote lookups after the refreshed cache was live. The production Worker counts these failures but does not retain provider-specific causes, so the upstream failure class is not yet known.
- The production Trading Lab displays the same ten tickers and scores as the published cache, with its generated timestamp. This confirms it renders the actual cache data.
- Production `execution_control` was read-only verified as `mode=paper`, `enabled=0`, `kill_switch=1`. No secrets were read, and no broker or execution-control action was taken.

**Historical acceptance state: incomplete.** Full-universe scanning and cache publication passed at the recorded scan time. The production Worker has not received the FMP auth correction or safe provider-failure categories. Do not call the scanner production-complete until a fresh cache passes the 30-minute validator, fresh quotes persist to D1, and the remaining acceptance criteria pass.

# Parallel live-data acceptance: Market Scanner + Technical Analyst

The authenticated POST endpoint `/api/research/specialists` collects quote and FMP historical OHLCV evidence without invoking Alpaca, D1, portfolio sync, or execution. It requires the existing `NORTHSTAR_OPERATOR_TOKEN` bearer token and a ticker.

The endpoint verifies ticker identity, quote timestamp, quote age, OHLCV schema, chronology and minimum history coverage. It runs the Market Scanner and Technical Analyst against the same canonical evidence and returns provider/source timestamps and explicit limitations. It never places orders or returns a BUY decision.

Market Scanner calculates relative latest-session volume against the prior 19 sessions and reports the provider quote change. It is a single-ticker analysis, not a universe-wide ranking; provider-delayed quotes are explicitly flagged.

Technical Analyst calculates SMA(20), SMA(50), RSI(14), MACD(12,26,9) and the observed 20-session high/low range. Historical adjustment policy remains unverified, so the report carries that limitation and must not be treated as certified support/resistance.

Synthetic tests cover malformed and out-of-order bars and indicator output. A live Preview request with a valid operator token is still required for live acceptance. No Production deployment is part of this change.


## Verified production release — 2026-11-11 12:30 UTC

- PR #117 (provider health and market-scanner authentication fix) was merged to `main` as `ac4f2508e9257eca6e88970a4eb24a4654aebebc`. Exact-head GitHub Actions checks passed: Tests, Validate AI Stock Advisor, and full-history secret scan.
- Cloudflare Pages Production deployment `0da695c5` is active from the merge commit. Production retains its original D1 binding `528f3a23-1d1f-4d16-8463-f643d85f5deb` and the expected secret binding names for Alpaca Paper, FMP, Gemini and the operator token. Secret values were not read or changed.
- The separate `northstar-market-monitor` Worker was uploaded from the merged `main/monitor/worker.js` source. New version `49a3e91f-4dfd-4bc4-8a28-7262367f51f4` is deployed at 100%. Existing `FMP_API_KEY` secret binding and Production D1 binding `528f3a23-1d1f-4d16-8463-f643d85f5deb` were preserved. Its existing `*/5 * * * *` cron schedule is unchanged.
- Post-deployment Production D1 shows scheduled run #473 at `2026-11-11T12:25:52.802Z` completed as `market_closed`, with zero errors. This is expected outside the US regular session and confirms the updated Worker is being invoked by its schedule. It does not yet test live quote retrieval.
- Production quote and event tables still contain zero rows. The published 253-stock cache was generated at `2026-11-11T10:47:23.072Z`: 201 ranked, 52 excluded, 10 enriched, scan status success. It was within the Worker four-hour cache limit at this checkpoint, but older than the application's stricter 30-minute cache-freshness acceptance threshold.
- Production paper controls remain `mode=paper`, `enabled=0`, `kill_switch=1`, `max_portfolio_usd=1000`, `default_risk_fraction=0.005`, `max_risk_fraction=0.01`, `max_position_fraction=0.25`. No broker orders, fills, paper intents or positions exist. No production D1 migrations or direct writes were made by this release.
- Research Council runs and decision traces remain zero. The nine-agent collection workflow is not production-accepted. PR #118 remains open/draft because lease recovery/concurrency, migration, durable run replay, historical validation and pilot-ledger gates are incomplete.

**Acceptance remains incomplete.** The FMP Worker authentication defect is released and the scheduled Worker is invoking successfully, but live-session quote retrieval and D1 persistence must be proven during the next US regular session. The 30-minute cache gate, authenticated research run and strategy validation also remain open. Paper execution stays disabled.
