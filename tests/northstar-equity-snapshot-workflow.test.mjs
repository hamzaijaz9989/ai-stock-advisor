import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const workflow = await readFile(new URL("../.github/workflows/northstar-equity-snapshot.yml", import.meta.url), "utf8");

test("scheduled snapshot uses scoped GitHub OIDC and no repository operator secret", () => {
  assert.match(workflow, /id-token:\s*write/);
  assert.match(workflow, /ACTIONS_ID_TOKEN_REQUEST_URL/);
  assert.match(workflow, /ACTIONS_ID_TOKEN_REQUEST_TOKEN/);
  assert.match(workflow, /\/api\/paper\/github-snapshot/);
  assert.doesNotMatch(workflow, /secrets\.NORTHSTAR_OPERATOR_TOKEN/);
});

test("scheduled snapshot accepts only consistent PAPER control states", () => {
  const readinessStep = workflow.split("- name: Verify production policy remains fail-closed\n")[1]?.split("\n      - name:")[0] || "";
  assert.ok(readinessStep, "readiness guard must exist");
  assert.ok(readinessStep.includes('.configured == true and .policyVerified == true and .mode == "paper"'));
  assert.ok(readinessStep.includes('(.executionEnabled == false and .killSwitchEngaged == true) or (.executionEnabled == true and .killSwitchEngaged == false)'));
});

test("scheduled snapshot fails closed unless account sync, fill import and reconciliation pass read-only", () => {
  assert.match(workflow, /\.sync\.synced == true/);
  assert.match(workflow, /\.fills\.imported == true/);
  assert.match(workflow, /\.fills\.status == "FILL_IMPORT_AND_ORDER_SYNC_PASSED_READ_ONLY"/);
  assert.match(workflow, /\.reconciliation\.reconciled == true/);
  assert.match(workflow, /\.reconciliation\.status == "RECONCILIATION_PASSED_READ_ONLY"/);
  assert.match(workflow, /\.execution == false/);
});

test("scheduled workflow has no broker order endpoint or execution-enable action", () => {
  assert.doesNotMatch(workflow, /\/v2\/orders/);
  assert.doesNotMatch(workflow, /ENABLE_PAPER_EXECUTION/);
});
