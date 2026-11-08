import test from "node:test";
import assert from "node:assert/strict";
import {runBlockBootstrap} from "../web/lib/time-machine.js";

test("block bootstrap is reproducible and reports descriptive percentiles", () => {
  const sample = Array.from({length:40}, (_,i) => i % 3 === 0 ? -1.2 : 1.1);
  const a = runBlockBootstrap(sample, {simulations:1000, blockLength:4, seed:42});
  const b = runBlockBootstrap(sample, {simulations:1000, blockLength:4, seed:42});
  assert.deepEqual(a,b);
  assert.equal(a.status,"DESCRIPTIVE_RESAMPLING_ONLY");
  assert.equal(a.simulations,1000);
  assert.equal(a.sampleTrades,40);
  assert.ok(a.terminalReturnPercent.p05 <= a.terminalReturnPercent.median);
  assert.ok(a.terminalReturnPercent.median <= a.terminalReturnPercent.p95);
  assert.ok(a.maxDrawdownPercent.p50 <= 0);
});
test("small samples do not produce probability estimates", () => {
  const result = runBlockBootstrap(Array(19).fill(1));
  assert.equal(result.status,"INSUFFICIENT_SAMPLE");
  assert.equal(result.simulations,0);
  assert.equal(result.probabilityOfLossPercent,undefined);
});
test("invalid returns and unsafe simulation parameters are rejected", () => {
  assert.throws(() => runBlockBootstrap([0,-100,...Array(18).fill(1)]), /greater than -100/);
  assert.throws(() => runBlockBootstrap(Array(20).fill(1), {simulations:999}), /1000/);
  assert.throws(() => runBlockBootstrap(Array(20).fill(1), {blockLength:21}), /blockLength/);
});
