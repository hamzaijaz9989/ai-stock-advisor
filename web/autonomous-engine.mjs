/**
 * Northstar Autonomous Equity Intelligence Engine
 * Deterministic, research-only agent pipeline. No broker or order execution.
 * Input bars must be chronological OHLCV observations from an authorized provider.
 */
export const ENGINE_VERSION = "0.1.0";

const finite = (n) => typeof n === "number" && Number.isFinite(n);
const clamp = (n, lo, hi) => Math.max(lo, Math.min(hi, n));

function mean(values) {
  return values.length ? values.reduce((a, b) => a + b, 0) / values.length : null;
}

function validateBars(bars) {
  if (!Array.isArray(bars) || bars.length < 55) {
    return { ok: false, reason: "At least 55 chronological daily OHLCV bars are required." };
  }
  let previous = -Infinity;
  for (const [i, b] of bars.entries()) {
    if (!b || !["open", "high", "low", "close", "volume"].every(k => finite(b[k]))) {
      return { ok: false, reason: `Bar ${i} has missing or non-numeric OHLCV fields.` };
    }
    if (b.open <= 0 || b.low <= 0 || b.volume < 0 || b.high < b.low ||
        b.high < Math.max(b.open, b.close) || b.low > Math.min(b.open, b.close)) {
      return { ok: false, reason: `Bar ${i} contains impossible OHLCV values.` };
    }
    const t = Date.parse(b.timestamp);
    if (!Number.isFinite(t) || t <= previous) {
      return { ok: false, reason: "Bars must have valid, strictly increasing timestamps without duplicates." };
    }
    previous = t;
  }
  return { ok: true };
}

function indicators(bars) {
  const closes = bars.map(b => b.close);
  const last = bars.at(-1);
  const ranges = bars.slice(1).map((b, i) =>
    Math.max(b.high - b.low, Math.abs(b.high - bars[i].close), Math.abs(b.low - bars[i].close))
  );
  const atr14 = mean(ranges.slice(-14));
  const avgVol20 = mean(bars.slice(-21, -1).map(b => b.volume));
  const avgDollarVol20 = mean(bars.slice(-21, -1).map(b => b.close * b.volume));
  const avgVol50 = mean(bars.slice(-51, -1).map(b => b.volume));
  const sma20 = mean(closes.slice(-20));
  const sma50 = mean(closes.slice(-50));
  const prior20High = Math.max(...bars.slice(-21, -1).map(b => b.high));
  const volumeRatio = avgVol20 > 0 ? last.volume / avgVol20 : null;
  const changePct = ((last.close / bars.at(-2).close) - 1) * 100;
  const returns = closes.slice(-15).slice(1).map((c, i) => c - closes.slice(-15)[i]);
  const gains = returns.map(x => Math.max(0, x));
  const losses = returns.map(x => Math.max(0, -x));
  const avgGain = mean(gains), avgLoss = mean(losses);
  const rsi14 = avgLoss === 0 ? 100 : 100 - (100 / (1 + avgGain / avgLoss));
  const gapPct = ((last.open / bars.at(-2).close) - 1) * 100;
  return { last, atr14, avgVol20, avgVol50, avgDollarVol20, sma20, sma50,
    prior20High, volumeRatio, changePct, rsi14, gapPct };
}

function marketScanner(m) {
  const flags = [];
  if (m.volumeRatio >= 2) flags.push("Unusual volume: at least 2× the prior 20-session average");
  if (m.last.close > m.prior20High) flags.push("Close broke above the prior 20-session high");
  if (m.sma20 > m.sma50 && m.last.close > m.sma20) flags.push("Price and 20-session trend are above the 50-session trend");
  if (m.rsi14 >= 55 && m.rsi14 <= 72) flags.push("Momentum is positive without an extreme RSI reading");
  if (m.rsi14 > 78) flags.push("Momentum is stretched (RSI above 78)");
  if (m.changePct <= -8 || m.gapPct <= -8) flags.push("Large downside move / gap requires review");
  return flags;
}

function riskGuardian(m, quote, config) {
  const blocks = [];
  if (m.avgDollarVol20 < config.minAverageDollarVolume) blocks.push("Average dollar volume is below the liquidity floor");
  if (m.gapPct > config.maxGapPct || m.gapPct < -config.maxGapPct) blocks.push("Large opening gap: price discovery / slippage risk");
  if (m.changePct > config.maxDailyMovePct || m.changePct < -config.maxDailyMovePct) blocks.push("Extreme daily move: event / volatility review required");
  if (!finite(m.atr14) || m.atr14 <= 0) blocks.push("ATR is unavailable or invalid");
  if (quote) {
    const age = Date.now() - Date.parse(quote.timestamp);
    if (!finite(quote.price) || quote.price <= 0 || !Number.isFinite(age) || age < -60000 || age > config.maxQuoteAgeMs) {
      blocks.push("Quote is missing, future-dated or stale");
    }
    if (finite(quote.price) && Math.abs(quote.price / m.last.close - 1) > config.maxQuoteBarDeviation) {
      blocks.push("Latest quote materially diverges from the latest daily close");
    }
  }
  return blocks;
}

function opportunityAnalyst(m) {
  const components = {
    trend: m.last.close > m.sma20 && m.sma20 > m.sma50 ? 25 : m.last.close > m.sma20 ? 12 : 0,
    breakout: m.last.close > m.prior20High ? 25 : 0,
    volume: m.volumeRatio >= 2 ? 20 : m.volumeRatio >= 1.4 ? 12 : 0,
    momentum: m.rsi14 >= 55 && m.rsi14 <= 72 ? 15 : m.rsi14 >= 50 && m.rsi14 < 55 ? 8 : 0,
    liquidity: m.avgDollarVol20 >= 50_000_000 ? 15 : m.avgDollarVol20 >= 10_000_000 ? 10 : 0
  };
  return { score: Object.values(components).reduce((a, b) => a + b, 0), components };
}

function positionSizer(price, atr, equity, config) {
  if (!finite(equity) || equity <= 0 || !finite(price) || price <= 0 || !finite(atr) || atr <= 0) return null;
  const stopDistance = Math.max(atr * config.stopAtrMultiple, price * 0.01);
  const riskBudget = equity * config.riskPerIdeaPct;
  const sharesByRisk = Math.floor(riskBudget / stopDistance);
  const sharesByExposure = Math.floor((equity * config.maxPositionPct) / price);
  const shares = Math.max(0, Math.min(sharesByRisk, sharesByExposure));
  return {
    shares, estimatedNotional: round(shares * price, 2),
    riskBudget: round(riskBudget, 2), stopDistance: round(stopDistance, 4),
    illustrativeStop: round(price - stopDistance, 4),
    sizingNote: "Illustrative research sizing only; excludes gaps, fees, taxes and execution slippage."
  };
}

function round(n, digits = 2) { return Number(n.toFixed(digits)); }

/**
 * Six logical agents share a single validated snapshot:
 * scanner, integrity/rug-check equivalent, opportunity analyst, risk sizer,
 * catalyst reviewer (supplied verified inputs only), and audit logger.
 */
export function runNorthstarAgents(input) {
  const config = {
    minAverageDollarVolume: 10_000_000,
    maxGapPct: 12,
    maxDailyMovePct: 15,
    maxQuoteAgeMs: 15 * 60 * 1000,
    maxQuoteBarDeviation: 0.08,
    riskPerIdeaPct: 0.005,
    maxPositionPct: 0.10,
    stopAtrMultiple: 2,
    ...(input?.config || {})
  };
  const now = input?.now || new Date().toISOString();
  const integrity = validateBars(input?.bars);
  const base = { engineVersion: ENGINE_VERSION, ticker: String(input?.ticker || "").toUpperCase(),
    asOf: now, mode: "RESEARCH_ONLY", executionEnabled: false };
  if (!integrity.ok) return { ...base, status: "INSUFFICIENT_DATA", score: null,
    blockers: [integrity.reason], agents: { integrity: "BLOCKED" }, audit: [] };

  const m = indicators(input.bars);
  const latestBarAge = Date.parse(now) - Date.parse(m.last.timestamp);
  const blockers = [];
  if (!Number.isFinite(latestBarAge) || latestBarAge < -60000 || latestBarAge > 5 * 86400000) {
    blockers.push("Latest daily bar is stale or future-dated.");
  }
  if (!finite(m.avgDollarVol20) || m.avgDollarVol20 < config.minAverageDollarVolume) {
    blockers.push("Insufficient average dollar liquidity.");
  }
  const scannerFlags = marketScanner(m);
  const integrityBlocks = riskGuardian(m, input?.quote || null, config);
  blockers.push(...integrityBlocks);
  const opportunity = opportunityAnalyst(m);
  const catalysts = Array.isArray(input?.catalysts) ? input.catalysts : [];
  const verifiedCatalysts = catalysts.filter(c => c?.verified === true &&
    ["SEC", "COMPANY_IR", "LICENSED_NEWS"].includes(c.sourceType) &&
    typeof c.title === "string" && c.title.length > 0);
  const sizing = positionSizer(m.last.close, m.atr14, input?.equity, config);
  const status = blockers.length ? "INSUFFICIENT_DATA" :
    opportunity.score >= 70 ? "HIGH_PRIORITY_WATCH" :
    opportunity.score >= 45 ? "WATCH" : "NO_SETUP";
  const audit = [
    { agent: "Market Scanner", result: scannerFlags.length ? "FLAGS_FOUND" : "NO_SETUP",
      details: scannerFlags },
    { agent: "Integrity Guardian", result: blockers.length ? "BLOCKED" : "PASSED",
      details: blockers },
    { agent: "Opportunity Analyst", result: "SCORED",
      details: opportunity.components },
    { agent: "Position Sizer", result: sizing ? "CALCULATED" : "NOT_AVAILABLE",
      details: sizing },
    { agent: "Catalyst Reviewer", result: verifiedCatalysts.length ? "VERIFIED_INPUTS" : "NO_VERIFIED_CATALYSTS",
      details: verifiedCatalysts.map(c => ({ title: c.title, sourceType: c.sourceType, url: c.url || null, publishedAt: c.publishedAt || null })) },
    { agent: "Trade Auditor", result: "LOGGED",
      details: "Decision snapshot recorded; no order was sent." }
  ];
  return {
    ...base, status, score: blockers.length ? null : opportunity.score,
    scoreMeaning: "Heuristic setup-ranking score, not probability of profit.",
    price: m.last.close, indicators: {
      atr14: round(m.atr14, 4), rsi14: round(m.rsi14, 1),
      relativeVolume20: round(m.volumeRatio, 2), averageDollarVolume20: round(m.avgDollarVol20, 2),
      sma20: round(m.sma20, 4), sma50: round(m.sma50, 4),
      prior20SessionHigh: round(m.prior20High, 4), dailyChangePct: round(m.changePct, 2)
    },
    scannerFlags, blockers, components: opportunity.components, illustrativeSizing: sizing,
    catalysts: verifiedCatalysts, agents: Object.fromEntries(audit.map(a => [a.agent, a.result])),
    audit, disclaimer: "Research only. This is not a validated BUY/SELL signal, a return forecast, or an instruction to trade."
  };
}
