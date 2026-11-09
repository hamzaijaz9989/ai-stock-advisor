# Northstar security investigation — 2026-11-10

## Result

The full-history Gitleaks investigation completed with **zero unallowlisted findings** on the security-scan branch.

- Scanner: Gitleaks v8.24.3, pinned in the workflow.
- Scope: all reachable Git refs and complete history (fetch-depth: 0, --log-opts="--all --full-history").
- Report: the SARIF artifact for the clean run contains zero results.
- Workflow: .github/workflows/northstar-secret-scan.yml.
- Configuration: .gitleaks.toml.

## Initial findings and disposition

The first full-history run reported five generic-api-key matches:

1. One static operator bearer value in a unit-test fixture. Source context confirmed it was a test-only mock credential, not a production secret. The current fixture now builds a deterministic inert test sentinel from string fragments; the historical occurrence is allowlisted only for its exact commit, exact test file, rule ID and source-line pattern.
2. Two matches on the FMP environment-binding expression in web/functions/api/fmp-health.js. The matched text is variable/binding names, not a credential value. Each historical commit is allowlisted only for its exact commit, exact file, rule ID and source-line pattern.
3. Two matches on the read-only reconciliation pagination cursor assignment in web/functions/api/paper/reconcile.js. The matched text is pagination logic, not a credential value. Each historical commit is allowlisted only for its exact commit, exact file, rule ID and source-line pattern.

No credential values are reproduced in this report. No broad path-only or rule-wide suppressions were added. All five exceptions require the exact historical commit, file path, rule ID and expected source-line regex.

## Credential rotation assessment

The five findings did not identify a provider-issued credential value in the inspected source context. The test-only fixture value was replaced in the active development branch. No provider credential was rotated because no real provider credential was identified by these findings. If an operator knows that any test fixture value was reused as a live credential outside the repository, that credential must still be revoked and rotated at its issuer.

## Scope and limitations

This is a clean Gitleaks result for the reachable Git history fetched by the workflow at the recorded run. It is not a guarantee that no secret was ever exposed outside reachable refs, in deleted/unreachable Git objects, GitHub Actions logs/artifacts, forks, deployment settings, external services or other repositories. GitHub's native secret-scanning alert state and external provider credential validity were not independently queried in this investigation.

## Ongoing control

The workflow runs on pull requests to main, pushes to main and the security branch, weekly, and on manual dispatch. It uses read-only repository permissions and uploads a redacted SARIF artifact. Any new unallowlisted finding fails the job; do not suppress a new finding without verifying its source and scope.