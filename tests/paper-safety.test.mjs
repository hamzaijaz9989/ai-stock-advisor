import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

async function loadFunction(path) {
  const source = await readFile(new URL(path, import.meta.url), "utf8");
  return import("data:text/javascript;base64," + Buffer.from(source).toString("base64"));
}

function mockDb(control) {
  const calls = [];
  const db = {
    prepare(sql) {
      return {
        sql,
        values: [],
        bind(...values) { this.values = values; return this; },
        async first() {
          calls.push({ type: "first", sql });
          return sql.includes("paper_execution_claims") ? null : control;
        }
      };
    },
    async batch(statements) { calls.push({ type: "batch", statements }); return []; }
  };
  return { db, calls };
}

test("paper sizing preview calculates whole shares and never submits an order", async () => {
  const { onRequestPost } = await loadFunction("../web/functions/api/paper/preview.js");
  const { db, calls } = mockDb({
    enabled: 0, mode: "paper", kill_switch: 1,
    max_portfolio_usd: 1000, default_risk_fraction: 0.005,
    max_risk_fraction: 0.01, max_position_fraction: 0.25
  });
  const request = new Request("https://northstar.test/api/paper/preview", {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ symbol: "NVDA", entryPrice: 100, stopPrice: 95 })
  });
  const response = await onRequestPost({ request, env: { NORTHSTAR_DB: db } });
  const body = await response.json();
  assert.equal(response.status, 200);
  assert.equal(body.status, "PREVIEW_ONLY_NOT_AN_ORDER");
  assert.equal(body.execution, false);
  assert.equal(body.shares, 1);
  assert.equal(body.notionalUsd, 100);
  assert.equal(calls.filter(call => call.type === "first").length, 1);
  assert.equal(calls.some(call => call.type === "batch"), false);
});

test("paper sizing preview fails closed if control row is absent", async () => {
  const { onRequestPost } = await loadFunction("../web/functions/api/paper/preview.js");
  const { db } = mockDb(null);
  const response = await onRequestPost({
    request: new Request("https://northstar.test/api/paper/preview", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ symbol: "NVDA", entryPrice: 100, stopPrice: 95 })
    }),
    env: { NORTHSTAR_DB: db }
  });
  assert.equal(response.status, 503);
  assert.equal((await response.json()).execution, false);
});

test("paper sizing preview rejects risk above configured maximum", async () => {
  const { onRequestPost } = await loadFunction("../web/functions/api/paper/preview.js");
  const { db } = mockDb({
    enabled: 0, mode: "paper", kill_switch: 1,
    max_portfolio_usd: 1000, default_risk_fraction: 0.005,
    max_risk_fraction: 0.01, max_position_fraction: 0.25
  });
  const response = await onRequestPost({
    request: new Request("https://northstar.test/api/paper/preview", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ symbol: "NVDA", entryPrice: 100, stopPrice: 95, riskFraction: 0.02 })
    }),
    env: { NORTHSTAR_DB: db }
  });
  assert.equal(response.status, 400);
});

test("operator control rejects unauthenticated requests without changing the ledger", async () => {
  const { onRequestPost } = await loadFunction("../web/functions/api/paper/control.js");
  const { db, calls } = mockDb({});
  const response = await onRequestPost({
    request: new Request("https://northstar.test/api/paper/control", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "ENGAGE_KILL_SWITCH" })
    }),
    env: { NORTHSTAR_DB: db, NORTHSTAR_OPERATOR_TOKEN: "test-token" }
  });
  assert.equal(response.status, 401);
  assert.equal(calls.length, 0);
});

test("operator control only permits engaging the kill switch and audits the change", async () => {
  const { onRequestPost } = await loadFunction("../web/functions/api/paper/control.js");
  const { db, calls } = mockDb({});
  db.batch = async statements => {
    calls.push({ type: "batch", statements });
    return statements.map(() => ({ meta: { changes: 1 } }));
  };
  const response = await onRequestPost({
    request: new Request("https://northstar.test/api/paper/control", {
      method: "POST",
      headers: { "Content-Type": "application/json", "Authorization": "Bearer test-token" },
      body: JSON.stringify({ action: "ENGAGE_KILL_SWITCH" })
    }),
    env: { NORTHSTAR_DB: db, NORTHSTAR_OPERATOR_TOKEN: "test-token" }
  });
  assert.equal(response.status, 200);
  const body = await response.json();
  assert.equal(body.killSwitchEngaged, true);
  assert.equal(body.submissionQuiesced, true);
  assert.equal(calls.filter(call => call.type === "batch").length, 1);
  assert.equal(calls.find(call => call.type === "batch").statements.length, 2);
});
