# Data Policy — SEC EDGAR

## Official endpoints

- Company submissions: https://data.sec.gov/submissions/CIK##########.json
- Company facts: https://data.sec.gov/api/xbrl/companyfacts/CIK##########.json
- Documentation: https://www.sec.gov/edgar/sec-api-documentation
- Developer resources and fair access: https://www.sec.gov/developer

## Required provenance

Every normalized financial observation should preserve company CIK, ticker mapping
source, XBRL concept/tag, unit, value, fiscal period end, filing/publication date,
filing form, accession number, source URL, retrieval timestamp and transformation
version.

Never treat period-end date as the date information became public. A backtest may
only use a fact after its public filing date. If timing is unknown, mark the
observation unusable for point-in-time testing.

## Reliability rules

- Set SEC_USER_AGENT to a descriptive application name plus a monitored contact email.
- Respect SEC fair-access rules; cache responses and avoid redundant requests.
- Handle HTTP errors, timeouts and invalid JSON explicitly.
- Preserve raw payloads separately from normalized facts.
- Never silently convert missing facts to zero.
- XBRL concepts can differ across issuers and accounting contexts.
- Company Facts does not replace reading filings when context, non-GAAP adjustments,
  segments, restatements or accounting policy matter.

This initial adapter does not yet implement persistent caching, ticker-to-CIK
discovery, retry/backoff, or robust annual/quarterly aggregation.
