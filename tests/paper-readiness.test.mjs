import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import vm from "node:vm";

const source = readFileSync(new URL("../web/functions/api/paper/readiness.js", import.meta.url), "utf8");
const sandbox = { Response, Date, Number, module: { exports: {} } };
const scriptSource = source.replace("export async function onRequestGet", "async function onRequestGet");
vm.runInNewContext(scriptSource + "\nmodule.exports = { onRequestGet };", sandbox);
const { onRequestGet } = sandbox.module.exports;

const policy = {
  enabled: 0,
  mode: "paper",
  kill_switch: 1,
  max_portfolio_usd: 1000,
  default_risk_fraction: 0.005,
  max_risk_fraction: 0.01,
  max_position_fraction: 0.25
};

test("missing D1 binding fails closed and reports execution disabled", async () => {
  const response = await onRequestGet({ env: {} });
  const body = await response.json();
  assert.equal(response.status, 503);
  assert.equal(body.executionEnabled, false);
  assert.equal(body.killSwitchEngaged, true);
});

test("valid ledger policy is reported but never enables execution", async () => {
  const db = { prepare(sql) {
    assert.match(sql, /SELECT enabled, mode, kill_switch/);
    return { first: async () => ({ ...policy }) };
  }};
  const response = await onRequestGet({ env: { NORTHSTAR_DB: db } });
  const body = await response.json();
  assert.equal(response.status, 200);
  assert.equal(body.configured, true);
  assert.equal(body.policyVerified, true);
  assert.equal(body.executionEnabled, false);
  assert.equal(body.killSwitchEngaged, true);
  assert.equal(body.limits.virtualCapitalUsd, 1000);
});

test("policy drift fails closed", async () => {
  const db = { prepare() {
    return { first: async () => ({ ...policy, enabled: 1 }) };
  }};
  const response = await onRequestGet({ env: { NORTHSTAR_DB: db } });
  const body = await response.json();
  assert.equal(response.status, 503);
  assert.equal(body.executionEnabled, false);
});

test("missing control row fails closed", async () => {
  const db = { prepare() { return { first: async () => null }; }};
  const response = await onRequestGet({ env: { NORTHSTAR_DB: db } });
  const body = await response.json();
  assert.equal(response.status, 503);
  assert.equal(body.executionEnabled, false);
});
