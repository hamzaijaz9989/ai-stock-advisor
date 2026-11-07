# Evidence-gated agent pipeline

This module is a deterministic orchestration layer for research candidates. It is not an autonomous trading system and does not call external services.

## Agent sequence
1. **Scanner** — validates symbol, quote timestamp (<=60 seconds old), spread (<=1%) and average dollar liquidity (>=USD 5m).
2. **Research** — requires a written thesis, at least two distinct recent sources (last seven days), and explicit risk factors.
3. **Risk auditor** — validates stop placement and configured risk/position caps.
4. **Sizer** — calculates whole-share size from the smaller of risk-budget sizing and position-exposure sizing.
5. **Paper executor** — deliberately disabled; pipeline emits no order and cannot call a broker.
6. **Logger** — returns a trace of each agent decision and rejection reason.

## Output contract
- Rejected candidates return `NO_TRADE`, the failed stage and a machine-readable reason.
- Candidates that pass return `PAPER_REVIEW_REQUIRED`, never BUY or an order instruction.
- `execution` and `automatedOrderSubmission` are always false.
- Inputs must come from trusted upstream data providers. This module does not itself verify source authenticity or market-data licensing.

## Limitations / next integration
- Integrate with the existing scanner and research data contracts after reviewing their exact schemas.
- Add sector/correlation exposure and account-wide open-order reservations.
- Use broker-derived equity and independently audited daily-loss/drawdown inputs before any paper order workflow.
- Persist decision traces only through a separately reviewed append-only D1 API.
- Backtest and paper-forward-test any strategy; passing these gates is not evidence of profitability.
