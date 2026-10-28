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
7. **Validation:** do not label the signal validated until walk-forward and untouched holdout tests include point-in-time data, corporate actions, slippage, fees, and delisted securities where applicable. The UI may show a clearly labelled provisional BUY setup when all current gates pass, but it must never describe that setup as validated or guaranteed.

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

## Historical validation implementation

The repository includes `src/stock_advisor/backtest.py` for deterministic single-signal simulation and walk-forward date splitting. It is not connected to the live ranking logic and is not a completed portfolio-level or point-in-time backtest. See [docs/BACKTESTING.md](BACKTESTING.md) for the protocol. BUY remains disabled until the actual strategy and its input data pass the full validation gate.

## Current implementation status

The dashboard has SEC-reported facts, best-effort quotes and one-year history, headline discovery, third-party earnings-calendar checks, a preliminary DCF scenario, ATR-based risk references, a research-candidate ranking for a curated 60-stock US universe, CSV export, and a local research snapshot log. The research-priority ranking is not a predictive model and does not itself generate a BUY recommendation.

The system is a research prototype, not a production-grade or validated investment service. Yahoo Finance chart and RSS endpoints currently used by the dashboard are unofficial access paths; the project has not obtained a commercial market-data license from Yahoo. Review provider terms before commercial distribution. A quote with no machine-readable provider timestamp, a stale quote, or a daily-bar snapshot must not pass the current-price gate. Third-party earnings dates and headlines must be verified against issuer or SEC sources before trading.

The dashboard's DCF and entry/risk levels are hypothetical scenarios with simplified assumptions, not reliable short-term price forecasts. No end-to-end walk-forward/holdout validation has established a durable trading edge. Do not claim a win rate, guaranteed profit, or 100% prediction accuracy.


## Active decision labels (provisional)

The dashboard exposes six research decision states, including the separate provisional setup and the non-actionable review/wait states:
- **BUY SETUP — UNVALIDATED:** only when timestamped price, valuation inputs, annual and quarterly quality screens, verified upcoming earnings date, timestamped recent news without risk-keyword flags, ATR risk reference, entry-zone conditions, minimum 2:1 reward/risk, and nonzero whole-share sizing all pass. This is a provisional research setup, not a validated BUY and not a guarantee.
- **SELL REVIEW:** when the annual/quarterly quality screen fails or recent headlines contain potential material-risk keywords. It prompts source verification and is not an automatic order.
- **HOLD:** the evidence does not support a provisional entry and no sell-review rule has fired.
- **WAIT:** required data/evidence is missing or the setup is not eligible for a new entry.

These are rule-based research labels, not proven profitable instructions. The BUY state is deliberately marked provisional while robust historical validation and licensed, reliable real-time data remain unresolved.


## Quote-to-valuation sanity gate

Before valuation-derived entry zones or fair-value references are displayed, the UI compares the timestamped quote with the simplified base-case per-share estimate. If the ratio is above 2.5× or below 0.4×, valuation outputs are withheld and the user is asked to verify cash-flow units, share count, corporate actions, and assumptions. This coarse guard is not proof that values inside the band are accurate; all DCF values remain simplified and unvalidated.


## DCF input audit and market/model gap policy

The DCF proxy is calculated from matched-period annual USD operating cash flow minus USD capital expenditures, divided by a recent SEC-reported instant shares-outstanding fact. The shares fact date and filing date must both be no more than 180 days old. Weighted-average shares are not substituted for a current share count. Each of the latest three annual FCF periods must have matching annual revenue and positive, finite USD FCF; unit mismatches, missing periods, stale share facts, and non-positive FCF block the DCF.

The scenario method remains intentionally simplified: a five-year growth path is inferred from clipped historical FCF and revenue growth, then discounted using fixed 12%/10%/9% rates and terminal growth assumptions of 1.5%/2.5%/3%. These are generic assumptions, not company-specific cost-of-equity estimates or a calibrated forecast. The results are illustrative scenarios, not validated fair values.

Before showing entry/exit/risk levels, the app checks the ratio of the latest timestamped quote to the model base case. Ratios above 2.5x or below 0.4x cause those levels to be withheld and surface the raw model value plus the market/model ratio for audit. A wide gap can be a real market premium/discount or a limitation of this simplified model; it does not by itself prove a data error or establish that market pricing is wrong. The research shortlist uses the same rule. This policy is a conservative review control, not a valuation theorem or proof that estimates inside the band are correct.


## Strongest current research setup (provisional)

The 60-stock screen may identify a **strongest current research setup** only after checking each displayed candidate's recent timestamped quote, simplified valuation sanity band, model entry zone, positive risk reference, minimum 2:1 illustrative reward/risk, positive annual net-profit and approximate free-cash-flow margins, revenue trend, provider-listed upcoming earnings date, and recent timestamped news. A candidate is marked provisional only when every implemented check passes. Any missing feed, unknown earnings date, imminent earnings event, risk-keyword headline, stale quote, or failed level check blocks the candidate from being called entry-ready. The top pick is the highest research-score candidate among those that pass these gates; the score is not a calibrated return forecast.

This label is **not a validated BUY**. Full point-in-time walk-forward and untouched holdout validation is still required, and the provisional DCF remains simplified. If no candidate passes, the dashboard explicitly recommends waiting rather than forcing a trade. Never promise profit, rank a stock as certain to rise, or convert a research shortlist into an execution instruction.
