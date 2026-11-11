# Northstar Cloudflare-Native Research Orchestration

**Status:** implementation design baseline; no production resources changed  
**Architecture:** Cloudflare Pages Functions + existing Workers + D1  
**Operating mode:** autonomous research only  
**Budget target:** use existing Cloudflare plan/resources; no paid queue, vector database, or always-on compute assumed

## 1. Decisions

- Keep the existing Cloudflare Pages dashboard, Pages Functions, market-monitor Worker, and D1 database.
- Do not introduce a separate Python service, OpenBB server, Redis, paid vector store, or another always-on host.
- Use the existing nine specialist roles and council implementation as the single research orchestration path. Do not duplicate the agents in a second framework.
- Use D1 for durable run metadata, task state, evidence references, evaluation summaries, and audit events.
- Use Cloudflare Cron Triggers for bounded scheduled work. Use D1-backed leases/idempotency before adding any queue-like behavior.
- Keep all market data credentials server-side in Cloudflare secrets. Do not send secrets to browser code or log them.
- Never submit broker orders, mutate execution controls, disable a kill switch, or enable BUY.
- No automatic production deployments or schema migrations.

## 2. Existing components to preserve

| Component | Existing responsibility | Integration decision |
|---|---|---|
| Pages dashboard | Research UI and stock analysis | Add read-only run history/status after API acceptance |
| Pages Functions | Quote, fundamentals, news, SEC, research endpoints | Reuse existing providers and endpoint contracts |
| `web/lib/research-specialist-agents.js` | Specialist analysis roles | Reuse; no parallel agent framework |
| `web/lib/research-council.js` | Council orchestration and evidence-aware synthesis | Reuse as the canonical council |
| `web/functions/api/research/collect.js` | Authenticated server-side collection | Preserve current authentication and portfolio preconditions |
| `web/functions/api/research/council.js` | Council endpoint | Reuse after contract and runtime verification |
| `monitor/worker.js` | Scheduled market monitoring | Keep separate from research-council execution; integrate health/status only after review |
| D1 | Existing operational and research records | Extend only through reviewed, additive migrations |

The scanner is a user-confirmed completed milestone. Do not rebuild it. Reopen only for a demonstrated regression or missing requirement.

## 3. Target flow

1. **Schedule / trigger:** a Cloudflare Cron Trigger creates or claims a bounded research task. It does not call privileged collection merely because a timer fired.
2. **Preflight:** validate market calendar/session, cache age, provider health, symbol allowlist, rate limits, and required source entitlements.
3. **Evidence collection:** call existing server-side source adapters. Every datum retains provider, symbol, observation time, retrieval time, units, period, and source reference.
4. **Specialists:** run the existing nine logical roles with bounded parallelism and timeouts. Missing sources stay explicitly unavailable.
5. **Challenge:** Bull and Bear work independently from the same frozen evidence pack. Portfolio synthesis follows; deterministic Risk Committee veto is final.
6. **Quality gate:** reject malformed, stale, contradictory, unsupported, or uncited claims. An agent scorecard is a contract-quality measure, not factual truth or predictive accuracy.
7. **Persist:** append immutable run metadata, evidence IDs, role outcomes, provider telemetry, evaluation results, and final research status to D1.
8. **Publish:** expose a read-only dashboard summary. Clearly label WAIT / AVOID / INSUFFICIENT EVIDENCE and limitations.
9. **Recover:** bounded retry only for transient provider/network failures; exponential backoff with jitter, maximum attempts, per-provider circuit breaker, and idempotency key. Never retry a financial action because no financial action exists in this mode.

## 4. Autonomy boundaries

### Allowed without user interaction
- Scheduled stock research and monitoring within configured symbol and request budgets.
- Provider health checks and freshness checks.
- Evidence collection from configured, permitted sources.
- Specialist-agent analysis, Bull/Bear challenge, deterministic risk veto.
- Persisting research traces and generating reports.
- Bounded retry and recovery of read-only research tasks.
- Marking a run blocked and surfacing a diagnostic when requirements fail.

### Always prohibited in this operating mode
- Live or paper order placement, modification, or cancellation.
- Changing broker, paper, execution, or kill-switch controls.
- Treating a model score, consensus, or cache rank as a validated BUY.
- Changing production secrets, database schema, Worker routes, or production deployments automatically.
- Scraping sources whose terms do not permit the intended use.
- Inventing missing data or silently substituting providers without attribution.

## 5. Minimal-cost deployment shape

- Reuse the existing Cloudflare Pages project, Worker, and D1 database.
- Prefer scheduled bounded batches over continuous compute.
- Keep expensive LLM calls limited to the shortlisted symbols and only after cheap deterministic checks pass.
- Use deterministic code for calculations, validation, deduplication, retry policy, and risk vetoes.
- Store compact evidence references and summaries in D1; avoid storing duplicate raw market-data payloads.
- Do not add a paid service until measured usage proves the existing Cloudflare allowance is insufficient.

## 6. Reliability contracts

Every run must have:
- Stable `run_id` and idempotency key.
- `created_at`, `started_at`, `completed_at` and explicit status.
- Config version and code commit SHA.
- Symbol universe / allowlist snapshot.
- Per-provider status, latency, retrieval timestamp, and failure category.
- Per-agent status, duration, evidence IDs, and explicit unavailable reasons.
- Bull/Bear outputs, deterministic risk-veto result, and final disposition.
- A machine-readable quality summary and user-readable limitations.
- Append-only audit events; no silent overwrite of historical decisions.

Terminal statuses: `completed`, `blocked`, `partial`, `failed`, `cancelled`. A partial run must never appear as a complete council result.

Retry policy:
- Retry only transient timeout, 429, and selected 5xx failures.
- Respect `Retry-After`; bounded exponential backoff with jitter.
- Do not retry 4xx entitlement, authentication, schema, or validation failures without a configuration change.
- Use a per-provider circuit breaker and stop work when the budget or time ceiling is reached.
- Idempotent writes only; no duplicate research runs for the same scheduled slot and config version.

## 7. Implementation sequence and acceptance gates

### Step A — Integration inventory and contracts
- Verify the current main/PR state and all nine-agent endpoint paths.
- Compare existing D1 tables and migrations with the target run/evidence/audit contracts.
- Resolve overlapping draft PRs by selecting one canonical implementation; do not merge by title alone.
- Acceptance: one documented canonical path from trigger through collector, council, persistence, and dashboard.

### Step B — Cloudflare scheduler foundation
- Add an additive D1 migration for scheduler state only if existing tables cannot safely support leases and idempotency.
- Add a bounded scheduler entry point to the existing Worker or a separate small Worker only if isolation is required.
- Default scheduler to disabled until explicitly enabled through a reviewed deployment setting.
- Acceptance: unit tests prove duplicate cron deliveries cannot create duplicate runs; failed leases recover safely; no broker endpoint is reachable.

### Step C — Research-only execution adapter
- Connect scheduler to the existing authenticated collector using a server-to-server trust mechanism, never a browser token.
- Preserve collector's read-only broker reconciliation and fresh-portfolio prerequisites; if they cannot be satisfied, mark the task blocked rather than bypassing them.
- Acceptance: controlled Preview run only, with exact commit, evidence pack, all nine role outcomes, and durable trace verified.

### Step D — Dashboard visibility
- Add read-only run history, last successful run, provider health, missing resources, agent status, and risk veto details.
- Do not expose secrets, account identifiers, raw broker account values, or operator credentials.
- Acceptance: browser can only read authorized research summaries; no privileged collection endpoint is callable from an unauthenticated page.

### Step E — Reliability and operational acceptance
- Test timeouts, 429, 5xx, malformed JSON, stale quotes, missing sentiment, duplicate cron, D1 contention, and partial council completion.
- Verify cost and invocation counts against actual Cloudflare plan limits.
- Acceptance: failure injection passes, exact-head CI passes, Preview behavior is verified, and independent review is complete.

### Step F — Production promotion
- Requires separate explicit approval after Preview acceptance, security review, schema review, and rollback plan.
- This document does not authorize production migration, deployment, or any financial execution.

## 8. Known blockers at design time

- The current production D1/research collector has historically required a fresh portfolio snapshot and seven-day equity baseline; verify whether this gate has since been resolved. Never bypass it.
- Earlier production audits found no durable research-council runs or decision traces; verify fresh runtime state before claiming end-to-end operation.
- The current public research page was documented as calling the older supplemental AI-research path rather than the nine-agent collector/council path; verify current dashboard wiring.
- Provider entitlements and freshness are not uniform. A successful HTTP response alone is not proof that a source is licensed, complete, or decision-eligible.
- Strategy validation remains unapproved; BUY stays disabled.

## 9. Proven upstream patterns to adapt, not wholesale copy

- **TradingAgents**: independent analyst roles, Bull/Bear challenge, explicit workflow checkpoints. Reuse the pattern only; retain Northstar's evidence contracts and deterministic veto.
- **FinRobot**: deterministic financial calculation boundaries, typed/validated financial data, auditability. Reuse the pattern only; do not import its desktop or provider stack.
- **OpenBB**: normalized provider adapter concepts. Defer a runtime dependency until licensing, provider coverage, bundle size, and Cloudflare compatibility are verified.

No upstream code is copied by this design-only baseline. Any later code import requires exact commit pinning, license and dependency review, security review, attribution, isolated tests, and a clear reason it is better than the existing Northstar code.

## 10. Current implementation status

- Architecture decision: Cloudflare-native — confirmed by user.
- Autonomy: research-only — confirmed by user.
- Budget: minimal — confirmed by user.
- Design baseline: added on feature branch.
- Scheduler implementation: not yet started.
- Dashboard integration: not yet started.
- Preview/production verification: not performed.
- Production resources, D1 data, secrets, broker settings, and deployments: unchanged.
