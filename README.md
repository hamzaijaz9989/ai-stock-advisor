# AI Stock Advisor

A research-first platform for long-term US equity investing. It produces evidence-backed research summaries and transparent metrics; it does **not** place orders or guarantee investment returns.

## Project principles

- Capital preservation and data quality before recommendations.
- Fundamentals, valuation, and risk are separate dimensions.
- Every figure should be traceable to a source and its publication date.
- Missing or inconsistent data must result in an explicit warning, not a fabricated score.
- Historical tests must avoid look-ahead and survivorship bias and include realistic costs.
- No automatic brokerage execution.

## Quick start: Python core

Requires Python 3.11+.

```bash
python -m venv .venv
# macOS/Linux:
source .venv/bin/activate
# Windows PowerShell:
# .venv\\Scripts\\Activate.ps1
python -m pip install -e ".[dev]"
pytest
```

## Browser dashboard (GitHub Pages)

The static dashboard lives in `web/`. It lets you enter a US stock ticker and attempts to fetch company identity and reported financial facts directly from SEC EDGAR. Filing dates and reporting-period ends are shown separately. It does not make up missing values or place trades.

### Publish the dashboard

A GitHub Actions deployment workflow is included at `.github/workflows/pages.yml`. In the repository, open **Settings → Pages** and choose **GitHub Actions** as the deployment source if prompted. Then open **Actions** and run **Deploy AI Stock Advisor to GitHub Pages**, or push a change under `web/`.

**Visibility note:** this repository is currently private. GitHub Pages availability for private repositories depends on the GitHub plan. Do not change the repository to public unless you intend to publish all source code.

### Dashboard limitations

- This is a static frontend. It does not run the Python SEC client or Python tests in the browser.
- Browser requests to SEC endpoints may fail due to CORS, network, or SEC access restrictions. The diagnostics panel reports the failure instead of substituting sample data.
- Different SEC accounting tags are shown as reported and are not fully reconciled into one canonical accounting value.
- No broker integration, automated trading, personalized investment advice, fabricated price, valuation, or performance data.

## News monitoring

The dashboard includes best-effort headline discovery using Yahoo Finance RSS and Google News RSS when available. Headlines are not independently verified and do not create a buy recommendation. See [docs/NEWS_AND_SIGNAL_POLICY.md](docs/NEWS_AND_SIGNAL_POLICY.md) for source hierarchy and validation rules.

## Market quotes and opportunity ranking\n\nA best-effort Yahoo Finance quote endpoint is available for the selected ticker; quotes may be delayed or unavailable and must be checked against a broker. The dashboard does not yet generate ranked buy recommendations, valuation-based entry zones, or exit levels. Those remain gated on validated data and backtesting. See [docs/MARKET_DATA_AND_RECOMMENDATIONS.md](docs/MARKET_DATA_AND_RECOMMENDATIONS.md).\n\n## Planned architecture

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
