/**
 * Deterministic moving-block bootstrap for completed historical trade returns.
 *
 * This describes resampling uncertainty in the observed trade sequence. It is
 * not a forecast, calibrated probability of future profit, or substitute for
 * point-in-time out-of-sample and forward paper validation.
 */
const finite = value => typeof value === "number" && Number.isFinite(value);
function quantile(values, probability) {
  const sorted = [...values].sort((a, b) => a - b);
  const position = (sorted.length - 1) * probability;
  const lower = Math.floor(position), upper = Math.ceil(position);
  return sorted[lower] + (sorted[upper] - sorted[lower]) * (position - lower);
}
function makeRandom(seed) {
  let state = seed >>> 0 || 0x9e3779b9;
  return () => {
    state ^= state << 13; state ^= state >>> 17; state ^= state << 5;
    return (state >>> 0) / 4294967296;
  };
}
export function runBlockBootstrap(tradeReturnsPercent, options = {}) {
  const returns = Array.isArray(tradeReturnsPercent) ? tradeReturnsPercent : [];
  const simulations = options.simulations ?? 10000;
  const blockLength = options.blockLength ?? 5;
  const seed = options.seed ?? 20261108;
  if (returns.some(value => !finite(value) || value <= -100)) {
    throw new TypeError("Trade returns must be finite percentages greater than -100.");
  }
  if (!Number.isInteger(simulations) || simulations < 1000 || simulations > 50000) {
    throw new RangeError("simulations must be an integer from 1000 to 50000.");
  }
  if (!Number.isInteger(blockLength) || blockLength < 1 || blockLength > 20) {
    throw new RangeError("blockLength must be an integer from 1 to 20.");
  }
  if (!Number.isInteger(seed) || seed < 0 || seed > 0xffffffff) {
    throw new RangeError("seed must be an unsigned 32-bit integer.");
  }
  if (returns.length < 20) {
    return {
      status: "INSUFFICIENT_SAMPLE", sampleTrades: returns.length,
      requiredTrades: 20, simulations: 0, blockLength: null,
      warning: "At least 20 completed trades are required for descriptive block-bootstrap analysis. No probability estimate is reported."
    };
  }
  const random = makeRandom(seed);
  const terminal = [], drawdowns = [];
  let profitable = 0;
  const n = returns.length;
  const block = Math.min(blockLength, n);
  for (let path = 0; path < simulations; path++) {
    let equity = 1, peak = 1, maxDrawdown = 0, sampled = 0;
    while (sampled < n) {
      const start = Math.floor(random() * n);
      for (let offset = 0; offset < block && sampled < n; offset++, sampled++) {
        const value = returns[(start + offset) % n] / 100;
        equity *= 1 + value;
        peak = Math.max(peak, equity);
        maxDrawdown = Math.min(maxDrawdown, equity / peak - 1);
      }
    }
    const result = (equity - 1) * 100;
    terminal.push(result);
    drawdowns.push(maxDrawdown * 100);
    if (result > 0) profitable++;
  }
  return {
    status: "DESCRIPTIVE_RESAMPLING_ONLY",
    sampleTrades: n, simulations, blockLength: block, seed,
    probabilityOfLossPercent: (simulations - profitable) / simulations * 100,
    terminalReturnPercent: {
      p05: quantile(terminal, 0.05), p25: quantile(terminal, 0.25),
      median: quantile(terminal, 0.50), p75: quantile(terminal, 0.75),
      p95: quantile(terminal, 0.95)
    },
    maxDrawdownPercent: {
      p50: quantile(drawdowns, 0.50), p90: quantile(drawdowns, 0.90),
      p95: quantile(drawdowns, 0.95)
    },
    methodology: "Circular moving-block bootstrap of the observed completed-trade return sequence; blocks preserve limited local ordering. Each path resamples the same number of trades as the source sample.",
    warning: "These are resampling frequencies conditional on this historical sample and its assumptions—not probabilities of future profit or loss. They do not correct look-ahead, survivorship, point-in-time data, regime change, or execution-model bias. Use only alongside untouched holdout and forward paper results."
  };
}
