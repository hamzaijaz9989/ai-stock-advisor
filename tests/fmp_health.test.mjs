import assert from "node:assert/strict";
import test from "node:test";
import { onRequestGet } from "../web/functions/api/fmp-health.js";

test("FMP health uses canonical FMP_API_KEY before the legacy alias and never echoes either secret", async () => {
  const originalFetch = globalThis.fetch;
  let requestedUrl;
  globalThis.fetch = async input => {
    requestedUrl = new URL(String(input));
    return Response.json([{ date: "2026-11-10", close: 100 }]);
  };
  const canonical = "canonical-secret-test";
  const legacy = "legacy-secret-test";
  try {
    const request = new Request("https://northstar.test/api/fmp-health");
    const response = await onRequestGet({
      request,
      env: { FMP_API_KEY: canonical, FMP_API_KEY2: legacy }
    });
    assert.equal(response.status, 200);
    assert.equal(requestedUrl.searchParams.get("apikey"), canonical);
    const payload = await response.json();
    assert.equal(payload.status, "FMP_REACHABLE");
    assert.equal(payload.fmpConfigured, true);
    assert.doesNotMatch(JSON.stringify(payload), /canonical-secret-test|legacy-secret-test/);
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
