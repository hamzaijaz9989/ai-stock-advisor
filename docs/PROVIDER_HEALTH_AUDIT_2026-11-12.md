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
| FMP Worker binding | Missing from current Worker settings; Cloudflare annotation says `Deleted Secret binding FMP_API_KEY` |
| Paper execution | Remains disabled; no execution controls changed |

## GitHub and Pages

The latest `main` commit is `2752b0c0930956c55d274ad1972fc4cf0eaf27d8` ("Deploy market monitor on worker changes (#138)", 2026-11-11 19:22:40 UTC). Cloudflare Pages Production deployment `21fd21d5-1bc5-4569-8e76-cc41155a2bc6` completed successfully at 19:22:56 UTC and reports the same commit SHA.

The commit adds push-triggered deployment for changes to `monitor/worker.js`, `monitor/wrangler.toml`, and the Worker deployment workflow. The GitHub combined commit-status endpoint returned no status entries for this SHA; exact-head CI is therefore not independently verified by this audit.

## FMP — separate credential surfaces

The Pages project `ai-stock-advisor` Production environment metadata lists secret binding names `FMP_API_KEY` and `FINNHUB_API_KEY`. Preview metadata currently lists only `NORTHSTAR_OPERATOR_TOKEN`; provider secrets are not copied into Preview.

The separate `northstar-market-monitor` Worker currently lists `FINNHUB_API_KEY` and `NORTHSTAR_DB`, but not `FMP_API_KEY`. Its current settings annotation explicitly says `Deleted Secret binding FMP_API_KEY`. The monitor source expects `env.FMP_API_KEY` for allowlisted symbols.

Production D1 monitor run #562 (2026-11-11 19:50:52–19:51:01 UTC) completed successfully with 8 symbols checked and zero quote errors, but records two FMP HTTP 401 fallbacks (BILI and SIRI) to Finnhub. Run #561 was partial: TWTR failed across FMP HTTP 401, Finnhub provider error, and Yahoo HTTP 429; HCA successfully fell back to Finnhub. The observed FMP HTTP 401s and missing Worker binding mean the Worker FMP path is not healthy/verified. The available evidence does not establish whether the 401s came from an invalid/expired key or an earlier runtime binding state; do not guess.

A separate FMP connector test returned valid AAPL quote, company profile, annual income-statement rows, and daily historical-price rows. This proves the independent FMP connector can retrieve data; it does **not** verify the Cloudflare Pages or Worker secret.

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
