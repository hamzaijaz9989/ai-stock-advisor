# Northstar AI completion audit — 2026-11-12

## Snapshot and method

- Repository: `hamzaijaz9989/ai-stock-advisor`.
- Audited source: `main` at `5be851ea1bb976dd24d7ef9cfc94c34abff3ba29`.
- Working branch: `codex/stock-brain-consolidation-2026-11-12` (consolidation based on the prior development branch).
- Production baseline: the latest recorded provider/deployment audit is in [Provider Health Audit](PROVIDER_HEALTH_AUDIT_2026-11-12.md). It verifies a finite window of FMP/Finnhub monitor data, not the Pages research endpoints or ongoing uptime.
- Percentages estimate completed behavior against the product's stated acceptance requirements. Source code and deterministic tests count as implementation evidence. Live provider evidence counts only for the provider and time window actually observed. An unmerged PR, design document, synthetic fixture, or passing unit suite does not count as production acceptance or investment-strategy validation.

## Overall completion: 70% (development-branch source and exact-head CI verified; production acceptance remains incomplete)

| Workstream | Completion | Evidence and remaining gap |
|---|---:|---|
| Equity scanner and shortlist | 85% | Scanner, cached shortlist and validation workflow exist. User-confirmed scanner milestone is complete; cache freshness and provider coverage still need operational monitoring. |
| Market data and provider integrations | 80% | Pages and Worker FMP call sites share a D1-backed rolling 24-hour reservation and response cache, with endpoint fan-out costs reserved atomically and no retries. Runtime calls fail closed without a verified plan-limit binding and migration 0014. |
| SEC, financial analysis and history | 65% | SEC facts/filings, point-in-time ingestion, valuation and research-history tooling exist. Research price history uses an unofficial source and is explicitly not decision-eligible; data coverage and availability timestamps are incomplete. |
| Research Council / Stock Brain | 75% | Selective #116 port consolidates the collector, nine-role council contracts, deterministic evaluation, dashboard and focused tests on the development branch. Exact-head CI passes; production Pages bindings and durable live Council traces remain unverified. #116 is a continuation of #108. |
| Recommendations and strategy validation | 40% | WAIT/AVOID and risk calculations exist. BUY remains disabled; no complete point-in-time universe, frozen strategy, four-fold walk-forward, untouched holdout and independent approval package is evidenced. |
| Paper portfolio and lifecycle | 50% | Read-only Alpaca sync, paper controls, preflight, intents, reconciliation, fill handling and risk guards are implemented/tested. Production has no verified seven-day baseline or end-to-end order lifecycle; execution remains disabled and kill switch engaged. |
| Dashboard and user workflows | 78% | Research, history, positions, watchlist and Trading Lab surfaces include the Stock Brain council panel and pass endpoint/UI tests in the development branch. Live Pages integration acceptance remains outstanding. |
| Cloudflare operations and release | 70% | Pages/Worker workflows, D1 schema, scheduled monitoring and secret-safe configuration exist. Migration 0007 is proposed in open PR #139 and is not applied; current branch governance and exact-head release acceptance remain incomplete. |

This is a workstream estimate, not a claim that 66% of code is written or that the product is production-ready. Strategy validation and operational approval are hard gates regardless of this aggregate score.

## Agent completion estimates

| Agent | Completion | Implemented and tested | Remaining acceptance work |
|---|---:|---|---|
| Market Scanner | 80% | Evidence completeness, freshness, liquidity and coverage checks; scanner and shortlist tests. | Demonstrate stable cache freshness and role wiring in the accepted nine-role request path. |
| Technical Analyst | 80% | Deterministic trend, moving-average, RSI and volatility analysis from supplied history; synthetic tests. | Validate input coverage and corporate-action handling on licensed, point-in-time production history. |
| Fundamental Analyst | 80% | SEC/FMP observation coverage, period/unit checks and missing cross-check flags; tests. | Establish broader issuer coverage, fiscal-period alignment and availability semantics. |
| News Analyst | 65% | Timestamped discovery/source quality and freshness checks; tests. | Validate deduplication, issuer corroboration and provider entitlements in live use. |
| Sentiment Analyst | 25% | Provider-neutral adapter validates ticker, timestamp, defined population, sample count, provider-normalized scale and methodology; the specialist reports observations separately and never pools unlike populations. | No approved timestamped sentiment/positioning provider or entitlement is connected. See [provider adapter requirements](SENTIMENT_PROVIDER_ADAPTER.md). |
| Bull Researcher | 75% | Two rounds run before synthesis: preliminary thesis, then verbatim-claim challenge against Bear with cited council evidence. Invalid/missing challenge blocks all downstream stages; tests cover both. | Review semantic quality through accepted live runs; model outputs remain unverified research. |
| Bear Researcher | 75% | Two rounds run before synthesis: preliminary downside thesis, then verbatim-claim challenge against Bull with cited council evidence. Invalid/missing challenge blocks all downstream stages; tests cover both. | Review semantic quality through accepted live runs; model outputs remain unverified research. |
| Portfolio Analyst | 66% | Portfolio context and synthesis role, plus a manual-only diversified allocation planner and evidence-linked trade monitoring policy with deterministic tests. | Production portfolio history/context, strategy performance evidence and durable end-to-end collector acceptance remain incomplete. |
| Risk Committee | 85% | Deterministic fail-closed committee and paper risk guards are tested. | Keep independent validation and human-review gates closed until strategy evidence is approved. |

The role percentages measure software behavior, not the quality of generated investment conclusions or predictive performance.

## Audit findings and work completed in this branch

1. Main already contains a broad research, market-data and paper-only implementation; replacing it would be counterproductive. User-confirmed scanner work was treated as complete.
2. Open PRs #108 and #116 contain additional Stock Brain integration and acceptance work; they are not part of the audited `main` snapshot. PR #139 contains a proposed explicit FMP-budget migration and shortlist rotation; migration 0007 is not applied.
3. The quote endpoint accepted non-positive Yahoo/Nasdaq prices and could return a quote without a normalized observation timestamp. This conflicts with the endpoint's fail-closed data policy and the timestamp requirements used by other providers.
4. This branch now rejects non-positive/non-finite prices and missing/invalid timestamps from Yahoo and Nasdaq, allowing the existing configured provider fallbacks to continue. If no provider returns a usable observation, the endpoint returns 503. Added three regression tests for rejection, fallback and valid Yahoo behavior.

## Verification

- JavaScript tests on the audited `main` snapshot: 243 assertions passed across 36 files. After this change, 246 assertions passed across 37 files, run one file per Node process because this execution environment denies Node's test-runner child-process spawning.
- New quote endpoint tests after the change: 3 passed; `node --check` and `git diff --check` passed.
- Python tests and Ruff could not run locally because Python and Ruff are not installed in the task environment. Exact-head GitHub Actions Tests workflow run `43181944912` on commit `e29dd7bc3778bf9c47abac131fabf8cc68f94d5e` passed, including Python tests, JavaScript tests, script syntax checks and Ruff.
- After the audit refresh and line-ending normalization, GitHub Actions Tests run `43182201309` passed on exact head `ab0434ee0427e78b1404b06e4f961879edef2446`, including Python tests, JavaScript tests, syntax checks and Ruff.
- No production setting, D1 data, secret, paper control, or order was changed. No deployment was performed.
- Public web probes for the homepage, `/api/quote` and `/api/fmp-health` were inaccessible from the available browser tool, so current production Pages behavior was not independently verified in this session.

## Remaining priorities

1. Confirm the actual FMP account daily quota and endpoint entitlements, apply migration 0014 to production and preview D1, then coordinate the fail-closed budget cutover.
2. Select and approve a licensed timestamped sentiment/positioning source, define its sample/population methodology, and connect its fetch adapter without blending populations.
3. Complete point-in-time strategy walk-forward and untouched holdout validation with independent approval before enabling BUY.
4. Complete paper lifecycle recovery and failure-injection acceptance while execution remains disabled and the kill switch stays engaged.
5. Verify production Pages/Worker bindings and post-migration operational monitoring before any release decision.


## Stock Brain consolidation milestone (2026-11-12)

- PR #116 is eight commits ahead of #108 with no commits behind; #116 includes #108. Consolidation ports the #116 work selectively onto the current development branch rather than merging either old-base PR.
- Preserved newer Northstar changes from the development branch, including the quote validation fix and current monitor/dashboard behavior. Generated quote caches and stale PR documentation are excluded.
- FMP history uses the existing server-side route. This branch now centralizes Pages and monitor calls behind persistent D1 rolling-window budget reservations and response caching. FMP costs are reserved before network calls; failures stay charged, cache hits are free, retries are not automatic, and missing plan configuration fails closed. Runtime cutover still requires an operator-verified plan limit and applying migration 0014 to the shared production D1; the preview D1 also needs the migration.
- Gemini remains a model-provider fallback for model-driven council roles; deterministic Northstar roles and risk gates remain authoritative. The separate Gemini research endpoint remains a fallback after native Northstar collection.
- BUY remains disabled; collector outputs set execution false and automated order submission false. No PR was merged or deployment performed.

- Exact-head CI at `353bc62c9a3ecebe2f76143a69f6c357be0398e6`: 94 Python tests, 309 JavaScript tests, JavaScript syntax checks, lint, and secret scan passed. Cloudflare Pages generated a branch Preview; Production was not deployed.
- The initial CI run exposed two failures (durable-trace marker and dashboard label); both were fixed and the rerun passed with zero failures.
- Next Sentiment Analyst work is provider approval/entitlement and sample methodology. Until a timestamped provider is selected, the correctly tested output remains `UNAVAILABLE`.


## Shared FMP budget, sentiment contract, and adversarial review (2026-11-12)

- Added a D1-backed shared rolling 24-hour FMP event ledger and persistent response cache for all audited Pages and monitor call sites. Fan-out requests reserve their complete uncached endpoint cost in one atomic statement before any upstream calls; provider failures remain charged, and there are no retries. The application caps total use at 200 calls per rolling 24 hours, retaining 50 calls of headroom against the documented 250-call free tier. Pages and monitor sub-caps are 40 and 160.
- No account entitlement is assumed: `FMP_VERIFIED_DAILY_LIMIT` must be set to the actual account's verified daily quota. Absent or invalid value, missing D1 schema, or exhausted budget stops FMP requests. Apply migration 0014 before runtime cutover; prior Pages call counts were not recorded, so a cleanly coordinated cutover is still required.
- Added a neutral sentiment provider adapter and strict contract. No approved source is configured, so the correct result remains unavailable; no sentiment observations or data are fabricated.
- Bull and Bear now receive the opposing preliminary report in a second round, must challenge an exact opposing claim with supplied council fact IDs, and block portfolio/risk stages when that contract fails. Repeated model call timing/token usage is accumulated in telemetry.
- Final exact-head CI at `95d7e5ad05e04814a44b75655b91273d6ed23eac`: 94 Python tests and 323 JavaScript tests passed; JavaScript syntax checks, validation workflow, Ruff, and full-history secret scan passed. No failures remained.
- No migration was applied, no production deployment or PR merge occurred, and no BUY, paper-trading execution or kill-switch setting was changed.


## Portfolio intelligence milestone (2026-11-12)

- Added `src/stock_advisor/trade_management.py`, a manual-only diversified portfolio plan and trade-monitor policy consuming validated Northstar evidence and a reconciled portfolio snapshot. Default plan: 60% long-term, 20% short-term, 20% cash reserve; 80% gross exposure; 20% name cap; 30% sector cap; 1% per idea risk and 2% aggregate planned risk. Cost assumptions are explicit. Candidate allocations remain `BUY SETUP — UNVALIDATED`; all live/paper submission and execution flags are false.
- Added conditional entry/target/stop/holding period/invalidation/evidence details and manual monitoring alerts for invalidation, stale data, stop, target and time. A target prompts a review, and small gains alone remain monitored without an exit alert.
- The $150 monthly target implies 15% per month on $1,000. It is disclosed as an aspiration, not a forecast or validation result. No profitability claim is supported.
- Updated the recommendation specification to the $1,000 profile and added [portfolio and trade management policy](PORTFOLIO_AND_TRADE_MANAGEMENT.md). Added [read-only operations findings](OPERATIONS_CONFIGURATION_AUDIT_2026-11-12.md).
- Read-only D1 check found Production migrations 0001–0013, Preview 0001–0006, no new PR #144 budget/cache tables in either environment, and missing repository migration sources 0007–0013. Renamed proposed budget migration to 0014 to avoid collision with Production's existing 0008. Migration application remains blocked until history/source reconciliation; none was applied.
- Finnhub social-sentiment access/license and actual FMP account quota/endpoint access remain unverified. No provider integration or quota-consuming call was made.
- The existing historical simulator remains a single-position replay. This milestone does not implement or validate multi-asset walk-forward returns. Point-in-time multi-asset data, portfolio-level replay, realistic cost/fill modeling, untouched holdout and independent review remain required before BUY activation. Paper execution remains disabled.
- Exact-head CI run `43198904022` passed on `19c2cd089bda2dec4458be48e8c234e2074e7fc3`: 99 Python tests, 323 JavaScript tests, scheduled scanner syntax check, and Ruff; zero failures. No production deployment or migration occurred.


## Trading Lab planning integration — 2026-11-12

- Added a ticker-only handoff from a durable nine-agent Stock Brain result into the manual position-sizing console. It transfers no price, stop, target, allocation, or order instruction; entry and invalidation remain manual pending validated strategy levels.
- The browser-local plan calculator now reserves saved planned stop risk against a 1% aggregate ceiling, rejects duplicate symbols, and limits the local plan list to ten. This is not broker-position reconciliation and does not represent verified live holdings.
- Aligned the standalone Python portfolio allocator defaults and hard ceilings to the existing Trading Lab policy: 0.5% per idea / 1% aggregate risk. Added regression checks. BUY activation, paper execution, and production deployment remain disabled.
- FMP strategy-backtest history now routes through the shared persistent budget/cache. It fails closed when D1 or a verified account limit is absent; the existing Yahoo fallback remains explicitly labeled.
- Exact-head CI is pending for this update. The exact-head Tests workflow on the code integration commit passed (100 Python tests, 324 JavaScript tests, scanner syntax, Ruff). Preview is verified on the code commit; production configuration and migration history still block release.
