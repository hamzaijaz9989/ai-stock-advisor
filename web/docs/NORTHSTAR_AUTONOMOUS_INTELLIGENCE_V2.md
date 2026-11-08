# Northstar Autonomous Intelligence v2 — Foundation

## Objective
Connect the existing 253-symbol research shortlist to a deterministic, evidence-gated decision pipeline and later to an auditable paper-only ledger. This is not a live trading system and does not claim profitability.

## Implemented in this foundation branch
- Deterministic candidate validation with sourced, fresh quotes and liquidity/spread gates.
- Evidence validation requires an explicit evidence type, HTTPS source URL, publisher identity, recent publication timestamp and substantive summary. Publisher identity is a stable canonical ID supplied by the upstream source adapter; syndication and aliases still require a provenance registry.
- Explicit risk disclosures.
- Fail-closed portfolio inputs: equity, open risk, gross exposure, sector exposure, daily loss, drawdown and concurrent position count.
- Cost-aware sizing using a configured round-trip cost assumption.
- Authenticated server-side preview endpoint. It returns a decision trace but does not write D1, call a broker, or submit an order.

## Hard limits
- Per-idea risk fraction <= 0.5%.
- Position notional <= 25% of equity.
- Aggregate open risk <= 2% of equity.
- Sector exposure <= 40% of equity.
- Daily loss stop at 2%; weekly loss stop at 4%; drawdown pause at 8%.
- Gross exposure cannot exceed 100% of equity; sector exposure cannot exceed 40%; the initial one-position limit requires zero existing concurrent positions before sizing.
- Weekly loss fraction is a mandatory portfolio input; missing portfolio state rejects the candidate.
- One concurrent position in the initial configuration.
- Transaction-cost assumption is mandatory; missing inputs reject the candidate.

## Next integration gates
1. Add a canonical publisher/provenance registry and syndicated-content deduplication.
2. Map existing scanner/quote/history/news/fundamental contracts into this candidate schema without fabricating missing values.
3. Persist append-only decision traces and portfolio snapshots through a new D1 migration; authenticated, idempotent writes only.
4. Reconcile broker paper account state against the ledger before any paper lifecycle simulation.
5. Add unit/integration tests, chronological walk-forward validation, untouched holdout and forward paper tests.
6. Keep paper order submission disabled until independent review and explicit safety gates pass. Live trading remains out of scope.

## Endpoints
- `POST /api/research/pipeline` requires `Authorization: Bearer NORTHSTAR_OPERATOR_TOKEN`. Request JSON follows the candidate contract in `web/lib/agent-pipeline.js`. It is preview-only and always declares `execution=false`, `automatedOrderSubmission=false`, and `traceDurable=false`.
- `POST /api/research/decision` requires the same server-side token, a stable `requestId`, a candidate object, and the `NORTHSTAR_DB` D1 binding. Requests are limited to 32 KiB; the trace stores the deterministic result and SHA-256 input fingerprint, not the raw candidate payload. It persists both accepted-for-review and rejected `NO_TRADE` traces to `research_decision_traces`. Reusing a request ID with the same input safely replays the stored trace; reusing it with different input returns HTTP 409. It has no broker or order side effects.
- Apply `web/migrations/0002_research_decision_traces.sql` to the `northstar-paper-ledger` D1 database before deploying/using the durable endpoint. The migration does not enable paper execution.
