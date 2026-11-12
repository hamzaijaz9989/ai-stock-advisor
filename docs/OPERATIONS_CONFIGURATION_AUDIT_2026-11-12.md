# Northstar operations configuration check — 2026-11-12

Read-only configuration and D1 inspection was performed for this milestone. No secret values were read, displayed or changed. No D1 migration was applied; no Worker/Pages settings were changed; no deployment was initiated.

## Cloudflare and D1 observations

- Pages project `ai-stock-advisor` production branch is `main`; latest recorded successful production deployment uses commit `8211eb8b2d8394ceb5942d6d363d70570c92bef1`.
- Pages Production binds `NORTHSTAR_DB` to `northstar-paper-ledger` (ID `528f3a23-1d1f-4d16-8463-f643d85f5deb`). Preview binds `NORTHSTAR_DB` to separate `northstar-preview` (ID `bdffc29f-a4f6-498e-ade7-22c85d9bd373`).
- Pages Production has configured secret names for FMP, Finnhub, Alpaca, Gemini and operator auth. Preview has the operator token only; it has no FMP key. The market-monitor Worker has FMP, Finnhub and Alpaca secret names. Secret presence does not establish validity, plan access or endpoint entitlement.
- Neither Pages nor Worker has a `FMP_VERIFIED_DAILY_LIMIT` binding. The PR #144 FMP integration therefore remains intentionally fail-closed in runtime. The actual FMP account quota, reset behavior and endpoint entitlements were not verifiable because the credential is secret and the connected FMP account dashboard was unavailable.
- Production D1 migration records show 0001–0013 applied. Preview records show 0001–0006 applied. Production includes the older `fmp_request_budget` table but not the new `fmp_request_events` and `fmp_response_cache` tables; Preview has none of these budget/cache tables.
- The PR #144 migration file was named `0008_shared_fmp_budget.sql`, but production already records `0008_paper_execution_single_flight`. This branch renames the proposed FMP migration to `0014_shared_fmp_budget.sql` to avoid a migration-number collision. Source migrations 0007–0013 are absent from the current branch, so the repository migration history must be reconciled before migration 0014 can safely be applied anywhere. Do not apply it yet.
- A Preview deployment entry exists for the PR #144 branch at `4d280df5434e283d056e63c7f1379d9b6727be64`, but its stage status was `idle`; this is not proof of a successful functional Preview. No new deployment was requested or created.

## Provider and sentiment findings

FMP's official pricing material advertises 250 daily calls on its Free plan, but that public plan statement does not prove the connected account's plan or endpoint access. Northstar reserves at most 200 rolling-24-hour calls when configured, leaving 50 of the published Free-plan amount as headroom; the runtime requires an operator-verified quota and does not assume all endpoints are available. See [FMP pricing](https://site.financialmodelingprep.com/developer/docs/pricing) and [FMP FAQ](https://site.financialmodelingprep.com/faqs?code=platform).

Finnhub documents a symbol-level social sentiment endpoint, while its business/enterprise page describes Social Sentiment and enterprise commercial-use licensing by contacting sales. Existing `FINNHUB_API_KEY` presence does not establish social-sentiment endpoint entitlement or license scope. Stocktwits' official developer notice says API terms/registration are under review; scraping is not an authorized substitute. No sentiment integration was added because access and licensing could not be verified. The exact requirement is written confirmation that the configured Finnhub credential can call the social-sentiment endpoint and that the license permits this product's intended use, or an approved alternative provider with timestamp, methodology, population/sample count and use rights. See [Finnhub endpoint overview](https://finnhub.io/static/finnhub-how-to-connect-mcp-server.html), [Finnhub enterprise licensing](https://api.finnhub.io/pricing-startups-and-enterprise), and [Stocktwits developer notice](https://api.stocktwits.com/developers).

## Safety status

This check made no requests that consume FMP API quota. No production migration, deployment, secret readout, live trade, paper order, BUY activation or execution-control change occurred.
