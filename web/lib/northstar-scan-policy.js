/**
 * Northstar scan policy and deterministic candidate shortlist.
 *
 * This module does not discover or fabricate symbols and does not fetch market data.
 * The caller must supply the provider/account-supported US equity universe and
 * timestamped scanner observations. Missing/stale observations are excluded.
 */
export const NORTHSTAR_SCAN_POLICY = Object.freeze({
  universeLimit: 200,
  shortlistTarget: 25,
  shortlistMinimum: 20,
  shortlistMaximum: 30,
  intervalHours: 3,
  intervalMilliseconds: 3 * 60 * 60 * 1000,
  minimumAverageDollarVolume20: 5_000_000,
  quoteFreshnessRequired: "FRESH",
  market: "US",
  tradingAuthority: "RESEARCH_ONLY"
});

const finite = value => typeof value === "number" && Number.isFinite(value);
const normalizeSymbol = value => String(value || "").trim().toUpperCase();

export function normalizeSupportedUniverse(symbols, supportedSymbols) {
  if (!Array.isArray(symbols) || !Array.isArray(supportedSymbols)) {
    throw new TypeError("A requested universe and provider-supported symbol list are required.");
  }
  const supported = new Set(supportedSymbols.map(normalizeSymbol).filter(Boolean));
  const unique = [];
  const seen = new Set();
  for (const raw of symbols) {
    const symbol = normalizeSymbol(raw);
    if (!/^[A-Z][A-Z0-9.-]{0,11}$/.test(symbol) || !supported.has(symbol) || seen.has(symbol)) continue;
    seen.add(symbol);
    unique.push(symbol);
    if (unique.length === NORTHSTAR_SCAN_POLICY.universeLimit) break;
  }
  return unique;
}

/**
 * Split a validated universe into bounded provider batches.
 * A batch size of 1 is safest for endpoints without documented bulk-symbol support.
 */
export function createUniverseBatches(symbols, batchSize = 1) {
  if (!Array.isArray(symbols) || !Number.isSafeInteger(batchSize) || batchSize < 1 || batchSize > 25) {
    throw new TypeError("Symbols and a batch size from 1 to 25 are required.");
  }
  const unique = [...new Set(symbols.map(normalizeSymbol).filter(x => /^[A-Z][A-Z0-9.-]{0,11}$/.test(x)))];
  if (unique.length > NORTHSTAR_SCAN_POLICY.universeLimit) {
    throw new RangeError("Northstar scan universe cannot exceed 200 symbols.");
  }
  const batches = [];
  for (let i = 0; i < unique.length; i += batchSize) batches.push(unique.slice(i, i + batchSize));
  return batches;
}

/**
 * Rank only fully evidenced, fresh observations. The score is a screening priority,
 * not a predicted return, probability of profit, or investment recommendation.
 */
export function rankNorthstarCandidates(observations, options = {}) {
  if (!Array.isArray(observations)) throw new TypeError("Scanner observations must be an array.");
  const minDollarVolume = finite(options.minimumAverageDollarVolume20)
    ? options.minimumAverageDollarVolume20
    : NORTHSTAR_SCAN_POLICY.minimumAverageDollarVolume20;
  const candidates = [];
  const excluded = [];
  const seen = new Set();

  for (const item of observations) {
    const symbol = normalizeSymbol(item?.symbol);
    const metrics = item?.metrics || {};
    const reason = !/^[A-Z][A-Z0-9.-]{0,11}$/.test(symbol) ? "INVALID_SYMBOL"
      : seen.has(symbol) ? "DUPLICATE_SYMBOL"
      : item?.quoteFreshness !== NORTHSTAR_SCAN_POLICY.quoteFreshnessRequired ? "STALE_OR_UNVERIFIED_QUOTE"
      : !finite(metrics.price) || metrics.price <= 0 ? "INVALID_PRICE"
      : !finite(metrics.averageDollarVolume20) || metrics.averageDollarVolume20 < minDollarVolume ? "INSUFFICIENT_LIQUIDITY"
      : !finite(metrics.relativeVolume20) || metrics.relativeVolume20 < 0 ? "INVALID_RELATIVE_VOLUME"
      : !finite(metrics.changePercent) ? "MISSING_PRICE_CHANGE"
      : !finite(metrics.trendScore) || metrics.trendScore < 0 || metrics.trendScore > 100 ? "MISSING_OR_INVALID_TREND_SCORE"
      : null;
    if (reason) {
      excluded.push({ symbol: symbol || null, reason });
      continue;
    }
    seen.add(symbol);
    const volumeComponent = Math.min(metrics.relativeVolume20 / 3, 1) * 30;
    const momentumComponent = Math.min(Math.abs(metrics.changePercent) / 5, 1) * 20;
    const trendComponent = metrics.trendScore * 0.30;
    const liquidityComponent = Math.min(metrics.averageDollarVolume20 / (minDollarVolume * 10), 1) * 20;
    const score = Number((volumeComponent + momentumComponent + trendComponent + liquidityComponent).toFixed(4));
    candidates.push({
      symbol,
      score,
      metrics: {
        price: metrics.price,
        averageDollarVolume20: metrics.averageDollarVolume20,
        relativeVolume20: metrics.relativeVolume20,
        changePercent: metrics.changePercent,
        trendScore: metrics.trendScore
      },
      quoteAsOf: item.quoteAsOf,
      source: item.source || null
    });
  }

  candidates.sort((a, b) => b.score - a.score || a.symbol.localeCompare(b.symbol));
  const shortlistSize = Math.min(
    NORTHSTAR_SCAN_POLICY.shortlistMaximum,
    Math.max(NORTHSTAR_SCAN_POLICY.shortlistMinimum, NORTHSTAR_SCAN_POLICY.shortlistTarget)
  );
  return {
    policy: NORTHSTAR_SCAN_POLICY,
    scannedObservationCount: observations.length,
    eligibleCount: candidates.length,
    shortlisted: candidates.slice(0, shortlistSize),
    excluded,
    warning: "Screening priority is not a forecast or trade recommendation. Validate each candidate with all required research agents."
  };
}
