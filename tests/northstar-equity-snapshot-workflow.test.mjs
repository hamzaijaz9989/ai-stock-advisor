import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const workflow = await readFile(new URL("../.github/workflows/northstar-equity-snapshot.yml", import.meta.url), "utf8");
const fillsStep = workflow.split("- name: Import broker fills without submitting or changing orders\n")[1]?.split("\n      - name: Run read-only broker-to-ledger reconciliation")[0] || "";

test("scheduled snapshot stops if read-only fill import is incomplete or unsafe", () => {
  assert.ok(fillsStep, "fill import step must exist before reconciliation");
  assert.match(fillsStep, /curl --fail --silent --show-error/);
  assert.match(fillsStep, /\.ok == true and \.imported == true and \.execution == false/);
  assert.match(fillsStep, /\.safeToContinue == true and \.requiresManualRecovery == false/);
  assert.match(fillsStep, /if \[ "\$fills_ok" != "true" \] \|\| \[ "\$fills_safe" != "true" \]; then[\s\S]*?exit 1[\s\S]*?fi/);
  assert.doesNotMatch(fillsStep, /reconciliation will still run/);
});

test("read-only scheduled snapshots permit either internally consistent PAPER control state", () => {
  const readinessStep = workflow.split("- name: Verify production policy remains fail-closed\n")[1]?.split("\n      - name:")[0] || "";
  assert.ok(readinessStep, "readiness guard must exist");
  assert.match(readinessStep, /\.configured == true and \.policyVerified == true and \.mode == "paper"/);
  assert.doesNotMatch(readinessStep, /\.executionEnabled == false/);
  assert.doesNotMatch(readinessStep, /\.killSwitchEngaged == true/);
});
