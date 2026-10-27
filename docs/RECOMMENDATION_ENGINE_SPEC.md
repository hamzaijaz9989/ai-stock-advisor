# Recommendation Engine Specification

## Investor profile
- Market: US-listed common stocks on NYSE/Nasdaq.
- Horizon: a few weeks to six months.
- Capital: USD 500.
- Risk tolerance: moderate.
- Advice must be plain-language BUY / WAIT / AVOID with an entry zone, target zone, invalidation/exit level, time horizon, and evidence.
- Research only; no broker integration or automatic order placement.

## Non-negotiable recommendation gates
A candidate cannot receive BUY unless all required gates pass:
1. **Identity/data quality:** unambiguous ticker/company mapping; current quote has a provider timestamp; material financial metrics have period end and filing date; no material data conflict.
2. **Earnings/event risk:** verify next earnings date from an authoritative or clearly labeled secondary source; check material SEC 8-K/10-Q/10-K filings and dated news. If the date is unknown or a major binary event is imminent, default to WAIT unless the strategy explicitly supports event risk.
3. **Fundamentals:** review revenue and earnings trend, margins, cash generation, balance-sheet risk, dilution and business-specific measures. Compare the most recent report with prior periods and management guidance.
4. **Valuation:** provide bear/base/bull estimates using a method appropriate to the business. DCF requires explicit forecast assumptions, discount rate and terminal assumptions; multiples require comparable-company rationale. Cross-check against history and avoid false precision.
5. **Price and reward/risk:** entry must be within a defensible valuation range and the setup must offer at least 2:1 estimated upside to downside to the invalidation level, unless a separately tested rule justifies otherwise. Target and downside are scenarios, not guarantees.
6. **Portfolio fit:** size the position from the entry-to-invalidation distance and the risk budget; account for correlated holdings and available cash.
7. **Validation:** do not label the signal validated until walk-forward and untouched holdout tests include point-in-time data, corporate actions, slippage, fees, and delisted securities where applicable.

## Risk sizing for $500
- Default planned risk per position: 1% of capital = $5.
- Hard planned-risk ceiling: 2% = $10, before gap risk, fees, and slippage.
- Formula: shares = floor(risk budget / (entry price - invalidation price)), adjusted for fractional-share availability. If no shares fit the budget or the minimum practical trade is too large, recommend WAIT.
- No leverage, margin, short selling, or options in this version.
- Never imply a stop price guarantees a fill. Overnight gaps can cause larger losses.
- Do not force the full $500 into one name. Cash is an acceptable position.

## Output contract
Every final recommendation must state:
- Decision: BUY / WAIT / AVOID (or INSUFFICIENT EVIDENCE).
- Quote and analysis timestamp, source and market state.
- Suggested entry range, base-case target range, invalidation/exit level, estimated holding period.
- Position size in dollars and shares, planned dollar risk, and remaining cash; clearly state assumptions about fractional shares.
- Thesis in plain English, valuation assumptions, recent earnings versus expectations when verified, upcoming earnings date, relevant news, bear-case risks, and thesis invalidation conditions.
- Confidence must be qualitative and evidence-based, never an uncalibrated win probability.
- Explain what would change the decision.
- If price, earnings date, valuation inputs or source data cannot be verified, do not manufacture an actionable price. Return WAIT or INSUFFICIENT EVIDENCE.

## Current implementation status
The existing dashboard has SEC-reported facts, best-effort headlines and quotes, one-year price history, and an experimental four-stock research-priority score. It does not yet satisfy all BUY gates above. Do not expose that score as a buy recommendation or fabricate a valuation-derived entry/exit.
