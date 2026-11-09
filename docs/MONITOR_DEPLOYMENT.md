# Market monitor deployment

The production Worker is `northstar-market-monitor`. Its cron schedule and D1 binding are declared in `monitor/wrangler.toml`.

The GitHub Actions deployment workflow is manual by design. Before running it, add these repository Actions secrets:

- `CLOUDFLARE_API_TOKEN`: a Cloudflare API token with permission to edit Workers Scripts and deploy Workers in this account.
- `CLOUDFLARE_ACCOUNT_ID`: the Cloudflare account ID used by the Worker configuration.

Then open **Actions → Deploy Northstar market monitor → Run workflow**.

The five-minute cron configuration is deployed with Wrangler. The Worker uses D1 database `northstar-paper-ledger`. Confirm the deployment version and the next D1 `monitor_runs` row after deployment.

This workflow does not create API tokens or write secrets. Do not commit credentials to the repository.
