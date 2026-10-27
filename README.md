# AI Stock Advisor

A research-first platform for long-term US equity investing. It produces evidence-backed research summaries and transparent metrics; it does **not** place orders or guarantee investment returns.

## Project principles

- Capital preservation and data quality before recommendations.
- Fundamentals, valuation, and risk are separate dimensions.
- Every figure should be traceable to a source and its publication date.
- Missing or inconsistent data must result in an explicit warning, not a fabricated score.
- Historical tests must avoid look-ahead and survivorship bias and include realistic costs.
- No automatic brokerage execution.

## Initial milestone

Build and test a small, deterministic Python core for financial metrics. Data-provider integrations and a dashboard come later, after calculations and data contracts are reliable.

## Quick start

Requires Python 3.11+.

```bash
python -m venv .venv
# macOS/Linux:
source .venv/bin/activate
# Windows PowerShell:
# .venv\Scripts\Activate.ps1
python -m pip install -e ".[dev]"
pytest
```

## Planned architecture

1. **Data adapters** — SEC EDGAR, historical prices, FRED and official investor-relations disclosures.
2. **Validation** — source provenance, publication timestamps, duplicate/missing observations, corporate actions.
3. **Fundamentals** — growth, margins, cash flow, leverage and dilution, with explicit missing-data handling.
4. **Valuation** — method selection appropriate to the business; bear/base/bull assumptions.
5. **Research synthesis** — AI summaries grounded in source documents, clearly separating facts and interpretation.
6. **Portfolio research** — diversification, sector concentration, correlated exposures and benchmark comparisons.
7. **Backtesting** — point-in-time inputs, walk-forward validation, costs and reproducible experiment logs.
8. **Dashboard** — watchlist, reports, evidence links and review history.

## Important limitations

This is an early-stage educational research tool, not a registered investment adviser and not a substitute for professional advice. A score is not a probability of profit. No win rate or return target is promised. Free data may be delayed, incomplete, rate-limited or subject to provider terms.

## Development status

**Stage 1:** project skeleton and tested financial metric primitives.
