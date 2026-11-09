import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const app = readFileSync(new URL("../web/app.js", import.meta.url), "utf8");
const cacheScript = readFileSync(new URL("../.github/scripts/refresh-stock-cache.mjs", import.meta.url), "utf8");
const lab = readFileSync(new URL("../web/trading-lab.js", import.meta.url), "utf8");
const refresh = readFileSync(new URL("../.github/scripts/refresh-stock-cache.mjs", import.meta.url), "utf8");

test("Northstar scanner contains exactly 253 unique normalized symbols", () => {
  const match = app.match(/const universe=(\[[^\n]+\]);/);
  assert.ok(match, "scanner universe array must be explicitly defined");
  const universe = JSON.parse(match[1]);
  assert.equal(universe.length, 253, `expected 253 symbols, got ${universe.length}`);
  assert.equal(new Set(universe).size, universe.length, "universe must not contain duplicate tickers");
  assert.ok(universe.every(ticker => /^[A-Z][A-Z0-9.-]{0,9}$/.test(ticker)), "symbols must be normalized ticker strings");
});

test("scheduled shortlist is explicitly top-ten and labelled with the 253-symbol universe", () => {
  assert.match(cacheScript, /slice\(0,10\)/);
  assert.match(cacheScript, /universeSize:\s*253/);
  assert.match(cacheScript, /253-stock screen/);
  assert.match(app, /Run live 253-stock scan/);
});

test("Trading Lab never presents cached candidates as validated buy signals", () => {
  assert.match(lab, /not an entry signal|not a validated BUY|not a validated buy/i);
  assert.match(lab, /stale|verify/i);
});

test("scheduled cache refuses partial or miscounted scans", () => {
  assert.match(refresh, /did not finish cleanly; preserving the previous cache/);
  assert.match(refresh, /rankedCount \+ excludedCount !== 253/);
  assert.match(refresh, /Cached result counts do not match/);
  assert.match(refresh, /refusing to overwrite the previous cache/);
});

import { validateStockCache } from "../scripts/verify-stock-cache.mjs";

test("stock cache monitor accepts a fresh complete 253-symbol shortlist", () => {
  const now=Date.parse("2026-11-09T12:00:00Z");
  const data={generatedAt:"2026-11-09T10:00:00Z",universeSize:253,rankedCount:200,excludedCount:53,status:"success",stocks:[
    {ticker:"AAPL",score:90,fundamentalFreshness:"CURRENT_WITHIN_18_MONTHS",entryStatus:"Checking live entry inputs"},
    {ticker:"TSM",score:88,fundamentalFreshness:"STALE_OR_UNVERIFIED",entryStatus:"BLOCKED: stale fundamentals"}
  ]};
  assert.equal(validateStockCache(data,{nowMs:now}).ok,true);
});
test("stock cache monitor rejects stale, incomplete, duplicate and unsafe shortlist data", () => {
  const now=Date.parse("2026-11-09T12:00:00Z");
  const stale={generatedAt:"2026-11-09T01:00:00Z",universeSize:253,rankedCount:200,excludedCount:53,status:"success",stocks:[
    {ticker:"AAPL",score:90,fundamentalFreshness:"CURRENT_WITHIN_18_MONTHS",entryStatus:"Checking"},
    {ticker:"AAPL",score:88,fundamentalFreshness:"STALE_OR_UNVERIFIED",entryStatus:"Checking"}
  ]};
  const result=validateStockCache(stale,{nowMs:now});
  assert.equal(result.ok,false);
  assert.ok(result.errors.some(x=>x.includes("older than six hours")));
  assert.ok(result.errors.some(x=>x.includes("duplicate")));
  assert.ok(result.errors.some(x=>x.includes("not explicitly blocked")));
});
