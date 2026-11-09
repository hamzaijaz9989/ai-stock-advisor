import test from "node:test";
import assert from "node:assert/strict";
import { runReadOnlySnapshotChain } from "../web/functions/api/paper/github-snapshot.js";

function request(headers = {}, method = "POST") {
  return new Request("https://ai-stock-advisor.pages.dev/api/paper/github-snapshot", { method, headers });
}
function jsonResponse(body, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
}

const validIdentity = { ok: true, runId: "12345678", runAttempt: "1", eventName: "schedule", tokenId: "unit-test-token-id-0001" };
const fakeDb = { prepare: () => ({ bind: () => ({ first: async () => null }) }) };
const baseHandlers = calls => ({
  syncAccount: async ({ request: req, env }) => { calls.push(["sync", req.headers.get("Authorization"), env]); return jsonResponse({ ok: true, execution: false, synced: true, capturedAt: "2026-11-09T10:00:00.000Z", snapshot: { positions: 0 } }); },
  importFills: async ({ request: req, env }) => { calls.push(["fills-sync", req.headers.get("Authorization"), env]); return jsonResponse({ ok: true, execution: false, imported: true, brokerRecords: 0, newRecords: 0, alreadyKnown: 0, pages: 1 }); },
  reconcileAccount: async ({ request: req, env }) => { calls.push(["reconcile", req.headers.get("Authorization"), env]); return jsonResponse({ ok: true, execution: false, reconciled: true, status: "RECONCILIATION_PASSED_READ_ONLY", counts: { brokerPositions: 0, ledgerPositions: 0, brokerOrders: 0, ledgerOrders: 0 }, checkedAt: "2026-11-09T10:01:00.000Z" }); }
});

test("runs sync, fill import and reconciliation sequentially using the server-side operator token", async () => {
  const calls = [];
  const env = { NORTHSTAR_OPERATOR_TOKEN: "server-side-operator-token-not-returned", NORTHSTAR_DB: fakeDb };
  const result = await runReadOnlySnapshotChain({
    request: request({ Authorization: "Bearer signed-oidc-token", "X-Request-ID": "northstar-equity-12345678-1" }),
    env,
    verify: async (token, options) => { assert.equal(token, "signed-oidc-token"); assert.equal(options.audience, "https://ai-stock-advisor.pages.dev"); return validIdentity; },
    handlers: baseHandlers(calls)
  });
  assert.equal(result.status, 200);
  const body = await result.json();
  assert.equal(body.ok, true);
  assert.equal(body.execution, false);
  assert.equal(body.reconciliation.reconciled, true);
  assert.deepEqual(calls.map(x => x[0]), ["sync", "fills-sync", "reconcile"]);
  assert.ok(calls.every(x => x[1] === "Bearer server-side-operator-token-not-returned"));
  assert.ok(calls.every(x => x[2] === env));
  assert.equal(JSON.stringify(body).includes(env.NORTHSTAR_OPERATOR_TOKEN), false);
});

test("rejects missing bearer token before any internal operation", async () => {
  const calls = [];
  const result = await runReadOnlySnapshotChain({ request: request(), env: { NORTHSTAR_OPERATOR_TOKEN: "server-side-operator-token" }, handlers: baseHandlers(calls) });
  assert.equal(result.status, 401);
  assert.equal(calls.length, 0);
});

test("rejects unverified GitHub workflow identity before any internal operation", async () => {
  const calls = [];
  const result = await runReadOnlySnapshotChain({ request: request({ Authorization: "Bearer forged-token" }), env: { NORTHSTAR_OPERATOR_TOKEN: "server-side-operator-token" }, verify: async () => ({ ok: false }), handlers: baseHandlers(calls) });
  assert.equal(result.status, 401);
  assert.equal(calls.length, 0);
});

test("fails closed when the server-side operator credential is absent", async () => {
  const calls = [];
  const result = await runReadOnlySnapshotChain({ request: request({ Authorization: "Bearer signed-oidc-token" }), env: {}, verify: async () => validIdentity, handlers: baseHandlers(calls) });
  assert.equal(result.status, 503);
  assert.equal(calls.length, 0);
});

test("stops after a failed snapshot and does not import fills or reconcile", async () => {
  const calls = [];
  const handlers = baseHandlers(calls);
  handlers.syncAccount = async () => { calls.push(["sync"]); return jsonResponse({ ok: false, execution: false, error: "snapshot unavailable" }, 503); };
  const result = await runReadOnlySnapshotChain({ request: request({ Authorization: "Bearer signed-oidc-token" }), env: { NORTHSTAR_OPERATOR_TOKEN: "server-side-operator-token", NORTHSTAR_DB: fakeDb }, verify: async () => validIdentity, handlers });
  assert.equal(result.status, 503);
  assert.equal((await result.json()).stage, "sync");
  assert.deepEqual(calls.map(x => x[0]), ["sync"]);
});

test("does not continue when account sync returns ok but synced is false", async () => {
  const calls = [];
  const handlers = baseHandlers(calls);
  handlers.syncAccount = async () => { calls.push(["sync"]); return jsonResponse({ ok: true, execution: false, synced: false }); };
  const result = await runReadOnlySnapshotChain({
    request: request({ Authorization: "Bearer signed-oidc-token", "X-Request-ID": "northstar-equity-12345678-1" }),
    env: { NORTHSTAR_OPERATOR_TOKEN: "server-side-operator-token", NORTHSTAR_DB: fakeDb },
    verify: async () => validIdentity,
    handlers
  });
  assert.equal(result.status, 503);
  assert.equal((await result.json()).stage, "sync");
  assert.deepEqual(calls.map(x => x[0]), ["sync"]);
});

test("does not continue when fill import returns ok but imported is false", async () => {
  const calls = [];
  const handlers = baseHandlers(calls);
  handlers.importFills = async () => { calls.push(["fills-sync"]); return jsonResponse({ ok: true, execution: false, imported: false }); };
  const result = await runReadOnlySnapshotChain({
    request: request({ Authorization: "Bearer signed-oidc-token", "X-Request-ID": "northstar-equity-12345678-1" }),
    env: { NORTHSTAR_OPERATOR_TOKEN: "server-side-operator-token", NORTHSTAR_DB: fakeDb },
    verify: async () => validIdentity,
    handlers
  });
  assert.equal(result.status, 503);
  assert.equal((await result.json()).stage, "fills-sync");
  assert.deepEqual(calls.map(x => x[0]), ["fills-sync"]);
});

test("does not report success when reconciliation is not clean", async () => {
  const calls = [];
  const handlers = baseHandlers(calls);
  handlers.reconcileAccount = async () => { calls.push(["reconcile"]); return jsonResponse({ ok: false, execution: false, reconciled: false, status: "RECONCILIATION_MISMATCH_FAIL_CLOSED" }, 409); };
  const result = await runReadOnlySnapshotChain({ request: request({ Authorization: "Bearer signed-oidc-token" }), env: { NORTHSTAR_OPERATOR_TOKEN: "server-side-operator-token", NORTHSTAR_DB: fakeDb }, verify: async () => validIdentity, handlers });
  assert.equal(result.status, 409);
  assert.equal((await result.json()).stage, "reconcile");
});

test("rejects a replayed workflow run attempt before invoking any internal handler", async () => {
  const calls = [];
  const duplicateDb = { prepare: () => ({ bind: () => ({ first: async () => ({ id: 7, action: "READ_ONLY_ACCOUNT_SYNC" }) }) }) };
  const result = await runReadOnlySnapshotChain({ request: request({ Authorization: "Bearer signed-oidc-token", "X-Request-ID": "northstar-equity-12345678-1" }), env: { NORTHSTAR_OPERATOR_TOKEN: "server-side-operator-token", NORTHSTAR_DB: duplicateDb }, verify: async () => validIdentity, handlers: baseHandlers(calls) });
  assert.equal(result.status, 409);
  assert.equal((await result.json()).stage, "idempotency");
  assert.equal(calls.length, 0);
});

test("requires the request identifier to match the signed workflow run identity", async () => {
  const result = await runReadOnlySnapshotChain({ request: request({ Authorization: "Bearer signed-oidc-token", "X-Request-ID": "northstar-equity-99999999-1" }), env: { NORTHSTAR_OPERATOR_TOKEN: "server-side-operator-token", NORTHSTAR_DB: fakeDb }, verify: async () => validIdentity });
  assert.equal(result.status, 400);
});

test("rejects non-POST requests and invalid request identifiers", async () => {
  const getResult = await runReadOnlySnapshotChain({ request: request({ Authorization: "Bearer token" }, "GET"), env: {} });
  assert.equal(getResult.status, 405);
  const badId = await runReadOnlySnapshotChain({ request: request({ Authorization: "Bearer token", "X-Request-ID": "bad id" }), env: { NORTHSTAR_OPERATOR_TOKEN: "server-side-operator-token", NORTHSTAR_DB: fakeDb }, verify: async () => validIdentity });
  assert.equal(badId.status, 400);
});
