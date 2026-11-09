# Stock Brain Advisor — Decision Engine Specification

## Purpose

Stock Brain is the analysis and decision layer for the existing AI Stock Advisor dashboard. It must turn dated, sourced evidence into a transparent research report for US-listed equities. It is not an autonomous trading system and must never place orders.

## User profile and constraints

- Universe: US-listed NYSE/Nasdaq equities.
- Capital reference: $500.
- Risk tolerance: moderate.
- Holding horizon: a few weeks to six months.
- Research-only; execution and final decisions remain with the user.
- Default planned risk: approximately $5 per position (1% of capital); hard planning ceiling $10 (2%) before gaps, fees, and slippage. These are planning guardrails, not a guarantee of maximum loss.

## Required report

Every analyzed ticker should return:

1. Decision: BUY, WAIT, AVOID, or INSUFFICIENT EVIDENCE.
2. As-of time, quote timestamp (or explicit absence), currency, exchange, and source for each material data group.
3. Thesis summary and key evidence supporting it.
4. Fundamental quality: revenue, profitability, cash flow, balance-sheet risks, and recent quarterly trend, with fiscal period and filing date.
5. Valuation: assumptions, bear/base/bull scenarios, sensitivity, and limitations. Never silently substitute weighted-average shares for current shares outstanding.
6. Technical context: price trend, volatility, drawdown, liquidity where available, and explicitly labelled price levels.
7. Events: earnings date and timing, sourced calendar provider, and whether the issuer IR page was independently checked.
8. Plan: entry zone, target/reference value, invalidation/stop level, reward/risk, position size, cash remaining, and expected holding period. If inputs fail quality gates, show unavailable rather than invent levels.
9. Risks and thesis invalidation: what could go wrong, and what evidence would change the view.
10. Data-quality checklist and reason codes for any blocked recommendation.

## Decision policy

### INSUFFICIENT EVIDENCE
Use whenever critical inputs are missing, stale, contradictory, non-finite, poorly aligned by fiscal period, or not traceable to a source. A missing earnings-calendar result is not proof that no earnings event exists.

### AVOID
Use for a documented thesis failure or a clearly failed financial/risk-quality rule. Explain which rule failed and distinguish business weakness from a data-quality failure.

### WAIT
Use when evidence is usable but price, event proximity, reward/risk, uncertainty, or portfolio concentration makes immediate action unattractive.

### BUY
Keep disabled until all of the following are implemented and independently validated:
- Point-in-time historical fundamentals and prices with no look-ahead or survivorship bias.
- Complete valuation, event, liquidity, and portfolio-risk checks.
- Chronological walk-forward validation and a genuinely untouched holdout.
- Realistic transaction costs, slippage, dividend/split handling, and gap assumptions.
- Results reported by market regime, sector, and time period, with drawdown and expectancy—not only win rate.
- A fresh, dated evidence snapshot and all critical checks passing for the individual report.

A high screen score alone is never a BUY signal. No target win rate is promised.

## Evidence and data governance

- Prefer issuer filings, issuer investor-relations pages, and official exchange data for primary facts.
- Preserve publication/filing time, fiscal period, retrieval time, provider, and units.
- Treat third-party news feeds and earnings calendars as discovery sources until independently confirmed.
- Label delayed, daily-bar, unadjusted-close, or otherwise limited data.
- Do not infer missing information or present stale values as current.
- Before any public/commercial use, confirm data-provider licensing and redistribution permissions. Unofficial endpoints are not a production-grade licensed data strategy.

## Validation roadmap

### Phase 1 — Reliability gates
- Confirm CI actually runs Python tests, lint, JavaScript syntax checks, and Node logic tests.
- Add endpoint smoke checks and malformed/stale-data tests.
- Verify deployed JavaScript and API responses after each code change.

### Phase 2 — Evidence snapshot
- Define one normalized, timestamped report schema.
- Attach source and freshness metadata to every metric and event.
- Add issuer IR confirmation for earnings where feasible; otherwise mark unconfirmed and block BUY.

### Phase 3 — Transparent scoring
- Separate business quality, valuation, price trend, catalysts, and risk.
- Show raw values, scoring thresholds, and missing-data penalties.
- Never treat keyword-based news flags as sentiment analysis or a predictive model.

### Phase 4 — Strategy validation
- Connect actual candidate rules to a point-in-time backtest.
- Include delisted securities where data is available, avoid look-ahead, and account for costs.
- Run walk-forward folds and reserve a holdout period that is not repeatedly tuned against.
- Track live paper recommendations prospectively before enabling BUY.

### Phase 5 — Portfolio-aware reports
- Account for current holdings, sector concentration, correlated exposures, available cash, whole-share constraints, and earnings gaps.
- Track every recommendation and its later outcome without rewriting the original snapshot.

## Current implementation status (2026-10-28)

Already present in the dashboard: SEC filing/fundamental retrieval, quote/history/news/earnings discovery endpoints, preliminary DCF scenario logic, a 60-stock cross-sector research-priority screen, risk-plan calculations, and a backtesting primitives module.

Not yet proven: end-to-end point-in-time strategy backtesting, live/holdout performance, licensed production-grade market data, issuer-confirmed earnings for every ticker, portfolio-level simulations, and an automated passing CI run. The existing 60-stock screen is a research-priority ranking—not a validated investment signal. Its universe is curated, not the full US market, and results depend on third-party provider coverage and rate limits.

## 2026-11-10 04:50 PKT — Research Council scorecard, telemetry and Preview acceptance

- Phase: Phase 2 — nine-agent Research Council / Stock Brain. Universe scanning remains user-confirmed COMPLETE and was not rebuilt.
- Objective: complete the previously missing deterministic resource-coverage inventory, role-specific resource packs, measured per-agent telemetry, persisted evaluation scorecard, and Trading Lab scorecard visibility; harden the collector against pre-existing broker/ledger mismatches.
- Code files: `web/lib/research-council.js` (v1.0.4; exports canonical `COUNCIL_ROLE_ORDER`, retains all nine status rows even when downstream stages are blocked, passes role-specific resource packs, rejects empty COMPLETE model-specialist reports while allowing the deterministic risk committee's decision-only contract); `web/lib/research-council-facts.js` (per-role resource coverage and explicit gaps); `web/lib/research-council-adapters.js` (measured provider/model/latency, provider-reported token usage, failed-call markers, deterministic risk-committee latency); new `web/lib/research-council-evaluation.js` (deterministic report-contract/reference-integrity scorecard; missing telemetry remains null, never fabricated zero; cost remains null); `web/functions/api/research/collect.js` (read-only broker/ledger reconciliation before broker snapshot sync, then scorecard calculation and persistence inside durable `research_council_runs.result_json`); `web/trading-lab.html` and `web/trading-lab.js` (scorecard panel, per-role resource coverage and telemetry, safe text-only rendering, no raw parser-error leakage).
- Test files: `tests/research-council.test.mjs`, `tests/research-council-adapter-telemetry.test.mjs`, `tests/research-council-evaluation.test.mjs`, `tests/research-council-resource-coverage.test.mjs`, `tests/research-collector.test.mjs`, `tests/stock-brain-dashboard.test.mjs`.
- Code verification commit: `2da608f742cd54936d8dc3b4b2d60c06d6f59f8f`. Key integration commits include `8dd2c688acff68e92565fc5a6d10ee2d9ae6821e` (orchestration), `27030fde2a5be6e7dc17607af8e0a8483fd68bfd` (resource coverage), `e8077a79d824ae13d2de0560261acf09654a3cfc` (adapter telemetry), `3e9c0666cda0d11944e6164f05c20ad371cd155b` (collector reconciliation and persistence), `b724ba0fb15c30ce4018df29dd947ab617cbbb3a` (scorecard evaluator), `6189b40e75301ade9bb97090474d5190e3147548` / `eaf7014f839f408596587a7f2414887aad7727c4` (dashboard panel/renderer), and `2c9e248b7c4936e89e5c13110f14cef571bfa8df` (preserve stable nine-role matrix).
- PR: #103, branch `northstar/research-council-status-dashboard`, open, non-draft, mergeable, 111 commits ahead of main and 0 behind at the code-verification point. Main remains `d1c9b964204c89639bf1c13d511e75d9c398d51f`. No formal reviews or inline review comments are recorded. Do not merge until independent review and branch-governance requirements are evidenced.
- Exact-code-head CI: Tests `42722839878` and `42722830794` passed; Validate AI Stock Advisor `42722840195` passed; full-history secret scan `42722839852` passed. Intermediate failures during integration exposed and corrected the missing stable nine-role matrix, scorecard role-status propagation, and absent-telemetry handling. Final code-verification head is green across all three workflow families.
- Preview deployment: Cloudflare Pages deployment `571103bc-5810-4a0d-96f6-c3671e2e6837`, URL `https://571103bc.ai-stock-advisor.pages.dev`, environment `preview`, commit `2da608f742cd54936d8dc3b4b2d60c06d6f59f8f`, stage `success`, `uses_functions=true`. Read-only Firecrawl smoke returned HTTP 200 for `/trading-lab.html`; the returned HTML contains the Stock Brain workspace, run button and `stock-brain-scorecard` panel. A credential-free POST to `/api/research/collect` returned HTTP 401 JSON `{"ok":false,"execution":false,"error":"Unauthorized."}`, confirming the deployed Pages Function route and auth gate without starting collection. No authenticated research run was attempted.
- Production Pages: latest successful deployment remains `921087a4-6194-4a67-ac61-2f8557edb0bc` for older commit `57aa9f0743917401dd0e3e90521fc39c22bd9f55`; newer deployment `6c3c67bd-94e2-4606-a2ac-e62c6e19a0d3` for main `d1c9b964...` is `idle`. No Production deployment or configuration change was made.
- Preview credentials: Pages project configuration still shows only `NORTHSTAR_OPERATOR_TOKEN` in Preview. Production retains the Alpaca key ID/secret, `FMP_API_KEY2`, Gemini and operator bindings. Secret values remain write-only and were not read, copied, changed or committed. The authenticated collector acceptance run is blocked until Preview provider credentials are restored through the authorized secret-entry path.
- D1 schema and records: Production migration ledger remains `0001`–`0005`; Preview remains `0001`–`0012`. No migrations, D1 writes or schema changes occurred. Production counts remain 0 monitor quotes/events, 0 research council runs, 0 decision traces, 1 equity snapshot, and 0 paper orders/positions/intents/trade events/fill activities. Preview counts for those tables remain 0. The sole Production equity snapshot is stale (`2026-11-08T18:34:38.720Z`, $100,000 broker equity); no genuine seven-day baseline exists.
- Monitor: Worker `northstar-market-monitor` schedule remains `*/5 * * * *`; deployment `7326f3e7-f323-4856-badf-aa8b979dffb4` remains at 100%. Production monitor run IDs 21–32 were all `market_closed`, 0 symbols checked, 0 errors; no quote/event rows were produced.
- Strategy and paper lifecycle: strategy-validation status remains NOT APPROVED; four-fold walk-forward and untouched holdout evidence on genuine data are absent. Production execution control remains `enabled=0`, `mode=paper`, `kill_switch=1`, $1,000 cap, unchanged risk fractions. No paper/live orders, positions, intents, fills or trade events exist. No execution controls were changed.
- Governance: GitHub repository metadata still reports `visibility=public`, conflicting with the README/user report; treat repository contents as public and do not change visibility without explicit authorization. Branch-protection read endpoint remains 403 to this integration, so enforcement cannot be independently confirmed.
- Safety: no broker/provider API call, authenticated collection, D1 mutation, production migration, production deployment, secret change, paper order or live order occurred. The only runtime API probe was an unauthenticated POST rejected at the auth boundary.
- Complete: all nine role statuses remain visible; resource coverage and gaps are passed to each role; specialist and deterministic risk telemetry are captured when available; scorecard is stored with the durable council result; dashboard renders the scorecard and role coverage; final code CI passed; exact-head Preview build and unauthenticated route/auth smoke passed. These are implementation, CI and Preview verification—not strategy validation or approval.
- Blockers: restore Preview FMP/Alpaca/Gemini secrets; establish a fresh reconciled seven-day equity history without bypassing safety gates; perform an authenticated research-only acceptance run and verify the persisted run/scorecard; obtain independent PR review and confirm branch governance; resolve repository-visibility discrepancy in GitHub Settings; complete separate point-in-time strategy validation and independent approval.
- Exact next action: after the unavoidable Preview credentials and seven-day baseline are available, run one controlled authenticated research-only collection with execution still disabled, then read back `research_council_runs.result_json` and verify all nine roles, resource coverage, scorecard and telemetry. Do not merge PR #103 or deploy Production until formal review/governance gates pass.
