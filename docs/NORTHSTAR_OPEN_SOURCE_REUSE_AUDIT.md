# Northstar Open-Source Reuse Audit — 2026-11-11

## Executive result

**No source-code files from TradingAgents, FinRobot, or OpenBB have been imported or copied into Northstar in this audit.** The current Northstar research council and specialist implementation remain Northstar-owned code in JavaScript/Cloudflare Pages Functions. This is a scoped review of the current feature branch and selected upstream modules, not a forensic scan of every historical commit or every file in all repositories.

The purpose of this audit is to identify reusable engineering patterns without adding an incompatible runtime or weakening Northstar's research-only safety boundary.

## Northstar files inspected

Feature branch: `northstar/cloudflare-research-orchestration`

Inspected current branch files:
- `web/functions/api/research/collect.js`
- `web/functions/api/research/council.js`
- `web/lib/research-council.js`
- `web/lib/research-specialist-agents.js`
- `web/lib/agent-pipeline.js`

Observations:
- Northstar's council defines its own nine-role contract, fact-ID validation, staged analyst/debate/synthesis/risk flow, and advisory-only decision status.
- Its research collector independently gathers SEC/FMP/market/news inputs and requires a verified portfolio snapshot before council work.
- Its deterministic specialist code contains Northstar-specific evidence checks and calculations.
- The files reviewed are JavaScript modules for Cloudflare Workers/Pages. The upstream projects reviewed below are predominantly Python systems; importing their frameworks wholesale would introduce a separate runtime and dependencies.

## Upstream projects and review decisions

### 1. TauricResearch/TradingAgents
- Repository: https://github.com/TauricResearch/TradingAgents
- Default branch reviewed: `main`
- License reported by GitHub: Apache-2.0; the repository LICENSE file was read.
- Upstream files inspected: `tradingagents/graph/checkpointer.py`, `tradingagents/graph/propagation.py`, `tradingagents/graph` directory listing, and README.
- Potentially useful patterns: resumable workflow checkpoints, deterministic run/thread identity, explicit initial state, parallel specialist work, Bull/Bear research debate, and point-in-time data discipline.
- Reuse decision: **adapt concepts only for now**. The checkpoint implementation depends on Python, LangGraph, and SQLite and is not directly suitable for the existing Cloudflare JavaScript + D1 architecture. Do not copy these files verbatim.

### 2. AI4Finance-Foundation/FinRobot
- Repository: https://github.com/AI4Finance-Foundation/FinRobot
- Default branch reviewed: `master`
- License reported by GitHub: Apache-2.0; the repository LICENSE file was read.
- Upstream files inspected: `finrobot_desktop/pyproject.toml`, compute directory listing, repository README metadata.
- Potentially useful patterns: deterministic compute separated from LLM interpretation, typed/validated financial inputs, provenance-aware artifacts, audit coverage, and explicit test gates.
- Compatibility finding: the current V2 desktop project is Python 3.11+ and declares PydanticAI, FastAPI, Uvicorn, aiosqlite, yfinance, edgartools, and other dependencies.
- Reuse decision: **adapt concepts only for now**. Do not add its Python runtime or dependency set to the Cloudflare deployment. Any future isolated utility must first pass provider, licensing, security, data provenance, and deployment review.

### 3. OpenBB
- Repository reference: https://github.com/OpenBB-finance/OpenBB
- Initial research indicates a Python-oriented financial data platform. The official repository/license identity was not conclusively verified in this pass.
- Reuse decision: **deferred**. No OpenBB code, package, or license assertion is approved by this audit. Revisit only after confirming the canonical repository, exact commit, applicable license for the specific components, and Cloudflare compatibility.

## Import / attribution status

| Project | Source copied into Northstar by this work | License review | Decision |
|---|---:|---|---|
| TradingAgents | No | Apache-2.0 repository LICENSE inspected | Patterns only |
| FinRobot | No | Apache-2.0 repository LICENSE inspected | Patterns only |
| OpenBB | No | Not conclusively verified | Deferred |

No upstream dependency was added. No upstream source file was added. No upstream copyright notice was removed or altered.

## Proposed Northstar adaptations

1. **D1-backed checkpointing:** adapt the idea of deterministic run identity and resumable workflow state using D1, not SQLite/LangGraph.
2. **Typed evidence contracts:** retain and strengthen Northstar's existing fact IDs, timestamps, source provenance, and schema validation.
3. **Deterministic calculation boundary:** keep financial arithmetic and risk vetoes in deterministic code; LLMs may explain evidence but cannot override gates.
4. **Research workflow observability:** persist bounded stage transitions, attempt counts, timestamps, and terminal statuses.
5. **Point-in-time integrity:** reject information that was not demonstrably available as of the research timestamp.

## Safety and deployment constraints

- Research-only autonomy remains in force.
- No live or paper orders, order modifications, cancellations, or execution-control changes.
- No automatic BUY output.
- No production deployment, migration, or secret changes from this audit.
- Existing portfolio freshness and historical-baseline gates must not be bypassed.
- Any future source import must record the upstream repository, exact commit SHA, source paths, license, required notices, modifications, dependency impact, and tests.

## Scope limitation

This audit inspected the named Northstar files and selected upstream files and metadata. It is not a complete similarity scan of every Northstar file, all historical Git commits, or all transitive dependencies. Therefore the precise conclusion is: **no third-party source was copied as part of this audit or the previously described architecture-document milestone; a full-repository provenance scan remains a separate task.**
