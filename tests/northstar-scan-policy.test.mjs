import test from "node:test";
import assert from "node:assert/strict";
import {
  NORTHSTAR_SCAN_POLICY,
  normalizeSupportedUniverse,
  createUniverseBatches,
  rankNorthstarCandidates
} from "../web/lib/northstar-scan-policy.js";

const observation = (symbol, overrides = {}) => ({
  symbol,
  quoteFreshness: "FRESH",
  quoteAsOf: "2026-11-13T15:00:00Z",
  source: "test-fixture",
  metrics: {
    price: 100,
    averageDollarVolume20: 50_000_000,
    relativeVolume20: 2,
    changePercent: 1.5,
    trendScore: 70,
    ...overrides
  }
});

test("scan policy fixes 200 symbols, three-hour cadence and a 25-candidate target", () => {
  assert.equal(NORTHSTAR_SCAN_POLICY.universeLimit, 200);
  assert.equal(NORTHSTAR_SCAN_POLICY.intervalHours, 3);
  assert.equal(NORTHSTAR_SCAN_POLICY.shortlistTarget, 25);
  assert.ok(NORTHSTAR_SCAN_POLICY.shortlistTarget >= 20);
  assert.ok(NORTHSTAR_SCAN_POLICY.shortlistTarget <= 30);
});

test("normalizes, deduplicates and restricts symbols to the supported allowlist", () => {
  const supported = ["AAPL", "MSFT", "NVDA"];
  assert.deepEqual(
    normalizeSupportedUniverse([" aapl ", "MSFT", "AAPL", "UNKNOWN", "bad ticker"], supported),
    ["AAPL", "MSFT"]
  );
});

test("never returns more than 200 supported symbols", () => {
  const symbols = Array.from({ length: 250 }, (_, i) => "T" + String(i).padStart(3, "0"));
  assert.equal(normalizeSupportedUniverse(symbols, symbols).length, 200);
  assert.throws(() => createUniverseBatches(symbols, 5), /cannot exceed 200/);
});

test("creates bounded provider batches without losing symbols", () => {
  const symbols = ["AAPL", "MSFT", "NVDA", "AMZN", "GOOGL"];
  assert.deepEqual(createUniverseBatches(symbols, 2), [["AAPL", "MSFT"], ["NVDA", "AMZN"], ["GOOGL"]]);
  assert.throws(() => createUniverseBatches(symbols, 26), /batch size/);
});

test("ranks only fresh, liquid and fully evidenced observations", () => {
  const rows = [
    observation("AAPL", { relativeVolume20: 3, trendScore: 90 }),
    { ...observation("MSFT"), quoteFreshness: "STALE" },
    observation("NVDA", { averageDollarVolume20: 1000 }),
    observation("AMZN", { trendScore: null })
  ];
  const result = rankNorthstarCandidates(rows);
  assert.deepEqual(result.shortlisted.map(x => x.symbol), ["AAPL"]);
  assert.equal(result.excluded.length, 3);
  assert.ok(result.excluded.some(x => x.reason === "STALE_OR_UNVERIFIED_QUOTE"));
  assert.ok(result.excluded.some(x => x.reason === "INSUFFICIENT_LIQUIDITY"));
  assert.ok(result.excluded.some(x => x.reason === "MISSING_OR_INVALID_TREND_SCORE"));
});

test("shortlists no more than 25 candidates and does not claim a forecast", () => {
  const rows = Array.from({ length: 40 }, (_, i) => observation("T" + String(i).padStart(3, "0"), {
    trendScore: 50 + (i % 40)
  }));
  const result = rankNorthstarCandidates(rows);
  assert.equal(result.eligibleCount, 40);
  assert.equal(result.shortlisted.length, 25);
  assert.match(result.warning, /not a forecast or trade recommendation/i);
});

test("rejects malformed inputs and invalid ranking collections", () => {
  assert.throws(() => normalizeSupportedUniverse("AAPL", ["AAPL"]), /required/);
  assert.throws(() => rankNorthstarCandidates(null), /array/);
});
