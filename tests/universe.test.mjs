import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const app = readFileSync(new URL("../web/app.js", import.meta.url), "utf8");

test("Northstar scanner covers at least 200 unique equity symbols", () => {
  const match = app.match(/const universe=(\[[^\n]+\]);/);
  assert.ok(match, "scanner universe array must be explicitly defined");
  const universe = JSON.parse(match[1]);
  assert.ok(universe.length >= 200, `expected at least 200 symbols, got ${universe.length}`);
  assert.equal(new Set(universe).size, universe.length, "universe must not contain duplicate tickers");
  assert.ok(universe.every(ticker => /^[A-Z][A-Z0-9.-]{0,9}$/.test(ticker)), "symbols must be normalized ticker strings");
  assert.match(app, /Run live 253-stock scan/);
});
