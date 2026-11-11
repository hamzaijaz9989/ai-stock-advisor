# Northstar AI — Provider Health Audit

**Audit date:** 2026-11-12 (PKT)  
**Evidence window:** 2026-11-11 19:43–19:51 UTC  
**Repository:** https://github.com/hamzaijaz9989/ai-stock-advisor  
**Production dashboard:** https://ai-stock-advisor.pages.dev

## Executive status

| Component | Verified state |
|---|---|
| GitHub `main` | Latest observed commit `2752b0c0930956c55d274ad1972fc4cf0eaf27d8` |
| Cloudflare Pages Production | Successful deployment `21fd21d5-1bc5-4569-8e76-cc41155a2bc6` from that exact commit |
| Market-monitor Worker | Active deployment `55a32182-cda3-47b5-95ab-48e285e78cd7`, version `dd19998b-c4f3-4f1c-a0d1-c7338cd4e7cc`, 100% traffic |
| Finnhub Worker binding | Present; live monitor quote rows and fallbacks confirm successful use |
| FMP Pages Production binding name | Present in Pages Production environment metadata; secret value not readable and was not inspected |
| FMP Worker binding | **Now present** as a Worker Secret binding after user update; value was not read. The latest recorded monitor run (#563) still returned HTTP 401, and predates/overlaps the binding update, so fresh post-update FMP success is not yet proven |
| Paper execution | Remains disabled; no execution controls changed |

## GitHub and Pages

The latest `main` commit is `2752b0c0930956c55d274ad1972fc4cf0eaf27d8` ("Deploy market monitor on worker changes (#138)", 2026-11-11 19:22:40 UTC). Cloudflare Pages Production deployment `21fd21d5-1bc5-4569-8e76-cc41155a2bc6` completed successfully at 19:22:56 UTC and reports the same commit SHA.

The commit adds push-triggered deployment for changes to `monitor/worker.js`, `monitor/wrangler.toml`, and the Worker deployment workflow. The GitHub combined commit-status endpoint returned no status entries for this SHA; exact-head CI is therefore not independently verified by this audit.

## FMP — separate credential surfaces

The Pages project `ai-stock-advisor` Production environment metadata lists secret binding names `FMP_API_KEY` and `FINNHUB_API_KEY`. Preview metadata currently lists only `NORTHSTAR_OPERATOR_TOKEN`; provider secrets are not copied into Preview.

The separate `northstar-market-monitor` Worker initially lacked `FMP_API_KEY`, but after the user reported updating the secret, a fresh settings read confirmed `FMP_API_KEY` is now present as a `secret_text` binding alongside `FINNHUB_API_KEY` and `NORTHSTAR_DB`. The secret value was not read. The monitor source expects `env.FMP_API_KEY` for allowlisted symbols.

Production D1 monitor run #562 (2026-11-11 19:50:52–19:51:01 UTC) completed successfully with 8 symbols checked and zero quote errors, but records two FMP HTTP 401 fallbacks (BILI and SIRI) to Finnhub. Run #561 was partial: TWTR failed across FMP HTTP 401, Finnhub provider error, and Yahoo HTTP 429; HCA successfully fell back to Finnhub. The observed FMP HTTP 401s and missing Worker binding mean the Worker FMP path is not healthy/verified. The available evidence does not establish whether the 401s came from an invalid/expired key or an earlier runtime binding state; do not guess.

A separate FMP connector test returned valid AAPL quote, company profile, annual income-statement rows, and daily historical-price rows. This proves the independent FMP connector can retrieve data; it does **not** verify the Cloudflare Pages or Worker secret.

### User update and post-update verification

The user confirmed updating the FMP key. A subsequent Cloudflare Worker settings read now confirms the `FMP_API_KEY` secret binding exists. The newest D1 monitor record available at that check was run #563 (19:55:52–19:56:01 UTC), which still reported two FMP HTTP 401 fallbacks (FUBO and RKT) to Finnhub. Because this run occurred at/around the secret update and no later run had yet been recorded, it is not valid evidence that the newly updated key has failed. **Post-update verification passed:** scheduled run #564 started 2026-11-11 20:00:52 UTC and completed 20:01:01 UTC with status `success`, 8 symbols checked, zero errors, and zero FMP fallbacks. D1 persisted AAPL ($354.50) and TSLA ($391.57) with source `Financial Modeling Prep` and provider quote timestamps `2026-11-11T20:00:53Z`. The six non-FMP shortlist symbols were sourced from Finnhub. This proves the updated Worker FMP secret authenticates and returns valid fresh quotes for two allowlisted symbols in this run. Continue monitoring for stability; one successful run does not guarantee all symbols or future runs.

### Required user action — FMP secret

Update the valid key in Cloudflare yourself, as planned:

1. In **Workers & Pages → Workers → northstar-market-monitor → Settings → Variables and Secrets**, add/update `FMP_API_KEY` as a **Secret**.
2. In **Workers & Pages → Pages → ai-stock-advisor → Settings → Environment variables → Production**, ensure `FMP_API_KEY` is the current valid **Secret** for Pages Functions as well.
3. Do not paste the key into chat, GitHub, source files, build variables, or logs. Do not put it in Preview unless you explicitly want Preview provider access.
4. After saving, trigger a Worker deployment/version rollout if Cloudflare does not apply the secret binding to the active version automatically. Then verify a fresh market-open monitor run no longer records FMP HTTP 401 and that FMP-sourced quotes are persisted.

The Pages and Worker environments are separate. Updating only the Pages secret will not configure the Worker.

## Finnhub — runtime verification

The Worker settings list `FINNHUB_API_KEY` as a secret binding. Production D1 contains recent quote observations with source `Finnhub` and valid provider timestamps. Run #562 successfully persisted 8 checked quotes with zero quote errors, including the two fallback symbols BILI and SIRI. Recent event rows also identify Finnhub as the source. This is positive live integration evidence, not a guarantee every symbol will be covered; run #561 shows a transient Finnhub failure for TWTR followed by Yahoo HTTP 429.

The Worker uses Finnhub as a secondary source after FMP failure and for symbols outside the exact FMP Free-plan allowlist. Yahoo remains the final fallback. Quote freshness and positive-price checks remain mandatory.

## Read-only evidence and safety

All D1 queries in this audit were SELECT-only. Cloudflare reported `rows_written=0` and `changed_db=false`. No secret values were read, written, or displayed. No production Pages/Worker settings were mutated. No paper or live orders were submitted. Paper execution remains disabled and the kill switch remains engaged per the project safety record.

Direct HTTP probes of the Pages API endpoints were blocked by the connected runtime's egress policy (HTTP 403 policy response), so this audit does not claim a direct public HTTP health-check result. The provider observations above come from production D1 monitor records and Cloudflare configuration metadata.

## Next acceptance checks

- [ ] User updates `FMP_API_KEY` in the Worker and Pages Production secret stores.
- [ ] Verify the Worker settings list `FMP_API_KEY` without reading its value.
- [ ] During the next US regular session, verify a new monitor run has no FMP HTTP 401 errors and at least one eligible FMP quote is persisted with a valid timestamp.
- [ ] Confirm Finnhub fallback still works for non-FMP symbols and FMP failures.
- [ ] Run a fresh Pages `/api/fmp-health` diagnostic through an authorized browser/runtime path; confirm quote, history, and fundamentals statuses.
- [ ] Re-run exact-head CI and capture workflow run IDs; the combined status endpoint returned no entries in this audit.
- [ ] Keep paper execution disabled and BUY validation gates closed.


## 2026-11-12 PKT — follow-up monitor continuity check

- Cloudflare Worker deployment history now shows active deployment `e412a3b8-8c76-42c3-b795-cef8a4ac8924`, version `60bc9eb2-b4c0-40b1-a33f-db2f18d8cd6f` (100% traffic), created `2026-11-11T19:56:06.988Z`. The version annotation is `Add secret: FMP_API_KEY`. This confirms the updated binding was deployed to the active version; the secret value was not inspected.
- Worker settings still expose binding names `FMP_API_KEY`, `FINNHUB_API_KEY`, and `NORTHSTAR_DB`; Cron remains `*/5 * * * *`.
- Latest Production D1 monitor record remains run #569, started `2026-11-11T20:25:53.345Z`, completed `2026-11-11T20:26:04.188Z`: success, 8 symbols, zero errors. Its quote rows show two FMP-sourced symbols and six Finnhub-sourced symbols with provider timestamps around 20:25 UTC.
- No later monitor run or quote observation is currently present in the queried D1 tables. The configured Cron and deployed version are present, but schedule invocation continuity is **not verified** after run #569. The available evidence does not establish why no later D1 records appeared; do not assume the Cron is disabled or change its schedule without diagnosing invocation logs.
- The five-minute Cron, Worker deployment, secret bindings, and D1 were inspected read-only. D1 query metadata reported zero rows written and no database change. No secrets were read, no deployment/configuration was changed, and paper execution remains disabled.
- Follow-up: inspect Worker invocation/exception telemetry and the scheduled-event path before making any runtime change; then verify a new scheduled run and fresh D1 quote persistence. Do not trigger manual order or paper-trading actions.


## Correction — scheduled monitor continuity verified (2026-11-12)

The prior follow-up section reported that run #569 was the latest D1 record and that invocation continuity was unverified. A subsequent read-only D1 query and Cloudflare Workers Observability query resolved that apparent gap:

- D1 run #570 started `2026-11-11T20:30:53.254Z` and completed `2026-11-11T20:31:03.480Z`; status `success`, 8 symbols checked, 0 errors, 0 FMP fallbacks.
- The latest quote observations were persisted around 20:30:58–20:31:02 UTC, including Finnhub-sourced non-FMP symbols.
- Cloudflare Workers Observability returned 13 scheduled-event records for `northstar-market-monitor` between approximately 19:44 and 20:31 UTC. They show the configured `*/5 * * * *` trigger, event type `scheduled`, outcome `ok`, and active version `60bc9eb2-b4c0-40b1-a33f-db2f18d8cd6f`.
- The observability query was executed with `dry=true`; no telemetry query result was persisted. D1 checks were SELECT-only and reported `rows_written=0`, `changed_db=false`.
- No Cron repair, deployment, schedule mutation, D1 write, or secret access was necessary. The earlier apparent gap was caused by checking before the next D1 run had become visible, not a confirmed scheduler failure.

**Current conclusion:** scheduled invocations and D1 persistence are both verified through run #570. Continue monitoring subsequent runs for sustained reliability; this finite window does not prove indefinite uptime.
