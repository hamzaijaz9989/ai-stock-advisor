import assert from "node:assert/strict";
import test from "node:test";
import { onRequestGet } from "../web/functions/api/fmp-health.js";

test("FMP health uses only FMP_API_KEY and never echoes the secret", async () => {
  const originalFetch = globalThis.fetch;
  let requestedUrl;
  globalThis.fetch = async input => {
    requestedUrl = new URL(String(input));
    return Response.json([{ date: "2026-11-10", close: 100 }]);
  };
  const canonical = "canonical-secret-test";
  try {
    const request = new Request("https://northstar.test/api/fmp-health");
    const response = await onRequestGet({
      request,
      env: { FMP_API_KEY: canonical }
    });
    assert.equal(response.status, 200);
    assert.equal(requestedUrl.searchParams.get("apikey"), canonical);
    const payload = await response.json();
    assert.equal(payload.status, "FMP_REACHABLE");
    assert.equal(payload.fmpConfigured, true);
    assert.doesNotMatch(JSON.stringify(payload), /canonical-secret-test/);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("FMP health fails closed when no supported key binding exists", async () => {
  const response = await onRequestGet({
    request: new Request("https://northstar.test/api/fmp-health"),
    env: {}
  });
  assert.equal(response.status, 503);
  const payload = await response.json();
  assert.equal(payload.status, "MISSING_BINDING");
  assert.equal(payload.fmpConfigured, false);
});


test("FMP health ignores FMP_API_KEY2 when the canonical binding is absent", async () => {
  const originalFetch = globalThis.fetch;
  let called = false;
  globalThis.fetch = async () => { called = true; return Response.json([]); };
  try {
    const response = await onRequestGet({
      request: new Request("https://northstar.test/api/fmp-health"),
      env: { FMP_API_KEY2: "must-not-be-used" }
    });
    assert.equal(response.status, 503);
    const payload = await response.json();
    assert.equal(payload.status, "MISSING_BINDING");
    assert.equal(payload.fmpBindingPresent, false);
    assert.equal(payload.fmpConfigured, false);
    assert.equal(called, false);
  } finally {
    globalThis.fetch = originalFetch;
  }
});
