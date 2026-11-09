import test from "node:test";
import assert from "node:assert/strict";
import { validateStockCache } from "../.github/scripts/validate-stock-cache.mjs";

const now = Date.parse("2026-11-10T00:00:00.000Z");
function fixture(overrides = {}) {
  const stocks = [
    { ticker: "AAA", name: "Alpha Inc.", score: 90, entryReady: false, entryStatus: "NOT ENTRY-READY — earnings data unavailable.", fundamentalFreshness: "CURRENT_WITHIN_18_MONTHS" },
    { ticker: "BBB", name: "Beta Inc.", score: 80, entryReady: false, entryStatus: "BLOCKED: annual fundamentals are stale or unverified.", fundamentalFreshness: "STALE_OR_UNVERIFIED" }
  ];
  return {
    schemaVersion: 1, status: "success",
    generatedAt: new Date(now).toISOString(), completedAt: new Date(now).toISOString(),
    universeSize: 253, rankedCount: 2, excludedCount: 251,
    enrichedCount: 2, workflowRunId: "12345", sourceCommit: "a".repeat(40),
    scanDurationSeconds: 720, stocks,
    ...overrides
  };
}

test("accepts a complete fresh 253-symbol scan cache", () => {
  const result = validateStockCache(fixture(), now);
  assert.equal(result.ok, true);
  assert.deepEqual(result.errors, []);
  assert.equal(result.summary.enrichedCount, 2);
});

test("rejects incomplete top-ten enrichment", () => {
  const data = fixture();
  data.stocks[0].entryStatus = "Checking latest quote and valuation inputs…";
  const result = validateStockCache(data, now);
  assert.equal(result.ok, false);
  assert.ok(result.errors.some(error => error.includes("incomplete enrichment")));
});

test("rejects incomplete universe accounting", () => {
  const result = validateStockCache(fixture({ excludedCount: 250 }), now);
  assert.ok(result.errors.some(error => error.includes("must equal 253")));
});

test("rejects stale cache timestamps", () => {
  const result = validateStockCache(fixture(), now + 31 * 60 * 1000);
  assert.ok(result.errors.some(error => error.includes("freshness window")));
});

test("rejects duplicate symbols and invalid scores", () => {
  const data = fixture();
  data.stocks[1].ticker = "AAA";
  data.stocks[1].score = 101;
  const result = validateStockCache(data, now);
  assert.ok(result.errors.some(error => error.includes("duplicate ticker")));
  assert.ok(result.errors.some(error => error.includes("invalid score")));
});

test("requires stale fundamentals to remain explicitly blocked", () => {
  const data = fixture();
  data.stocks[1].entryStatus = "Provisional watch";
  const result = validateStockCache(data, now);
  assert.ok(result.errors.some(error => error.includes("without an explicit blocked status")));
});
