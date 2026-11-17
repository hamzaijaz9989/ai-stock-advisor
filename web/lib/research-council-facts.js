// Canonical fact/evidence adapter for Northstar Research Council.
// Call only with server-collected provider responses and a reconciled portfolio snapshot.
// Browser-supplied values must never be treated as authoritative inputs.
const TICKER_RE = /^[A-Z][A-Z0-9.-]{0,11}$/;
const finite = value => typeof value === "number" && Number.isFinite(value);
const dateMs = value => {
  const parsed = Date.parse(value || "");
  return Number.isFinite(parsed) ? parsed : null;
};
function stableSerialize(value) {
  if (value === null || typeof value !== "object") return JSON.stringify(value) ?? "null";
  if (Array.isArray(value)) return "[" + value.map(stableSerialize).join(",") + "]";
  return "{" + Object.keys(value).filter(key => value[key] !== undefined).sort()
    .map(key => JSON.stringify(key) + ":" + stableSerialize(value[key])).join(",") + "}";
}

async function makeId(namespace, canonical) {
  const digest = await globalThis.crypto.subtle.digest("SHA-256", new TextEncoder().encode(canonical));
  const hex = Array.from(new Uint8Array(digest), byte => byte.toString(16).padStart(2, "0")).join("");
  return "northstar:v1:" + namespace + ":" + hex;
}

function validatePortfolio(portfolio, asOfMs) {
  if (!portfolio || portfolio.verified !== true || typeof portfolio.source !== "string" || !portfolio.source.trim()) {
    throw new TypeError("A verified portfolio snapshot with an explicit source is required; missing portfolio data must not be replaced with zeroes.");
  }
  const capturedAt = dateMs(portfolio.asOf);
  if (capturedAt === null || capturedAt > asOfMs) throw new TypeError("Portfolio snapshot timestamp is missing or after the research as-of time.");
  const required = ["equityUsd","grossExposureUsd","concurrentPositions"];
  const optional = ["openRiskUsd","dailyLossFraction","weeklyLossFraction","drawdownFraction","sectorExposureUsd","maxPositionNotionalUsd"];
  if (required.some(key => portfolio[key] === null || portfolio[key] === undefined || portfolio[key] === "")) throw new TypeError("Core portfolio snapshot is incomplete.");
  const values = Object.fromEntries([...required,...optional].map(key => [key,
    portfolio[key] === null || portfolio[key] === undefined || portfolio[key] === "" ? null : Number(portfolio[key])
  ]));
  if (required.some(key => !Number.isFinite(values[key])) || values.equityUsd <= 0 ||
      values.grossExposureUsd < 0 || !Number.isInteger(values.concurrentPositions) ||
      optional.some(key => values[key] !== null && (!Number.isFinite(values[key]) || values[key] < 0))) {
    throw new TypeError("Portfolio risk snapshot contains invalid numeric fields.");
  }
  return {...values, asOf: new Date(capturedAt).toISOString(), source: portfolio.source, verified: true,
    sectorExposureMethod: portfolio.sectorExposureMethod || null, openRiskMethod: portfolio.openRiskMethod || null};
}

export async function buildResearchCouncilContext(input) {
  const ticker = String(input?.ticker || "").trim().toUpperCase();
  if (!TICKER_RE.test(ticker)) throw new TypeError("A valid US equity ticker is required.");
  const asOfMs = dateMs(input?.asOf);
  if (asOfMs === null) throw new TypeError("A valid ISO research as-of timestamp is required.");
  const asOf = new Date(asOfMs).toISOString();
  const asOfDate = asOf.slice(0, 10);
  const facts = [], evidence = [], ids = new Map();
  const add = async (target, identity, type, value, source, observedAt = null) => {
    const collection = target === facts ? "fact" : "evidence";
    const canonical = stableSerialize({version:1,collection,ticker,type,identity,source,observedAt,value});
    const id = await makeId(collection, canonical);
    const existing = ids.get(id);
    if (existing !== undefined) {
      if (existing !== canonical) throw new TypeError("Canonical fact/evidence hash collision detected.");
      return; // Identical source observations are intentionally deduplicated.
    }
    ids.set(id, canonical);
    target.push({id,type,value,source,observedAt,asOf});
  };

  const quote = input.quote;
  if (quote && (quote.ticker === undefined || String(quote.ticker).toUpperCase() === ticker) && finite(quote.price) && quote.price > 0) {
    const quoteTime = dateMs(quote.quoteTime);
    await add(facts, ["quote",quote.source || "unknown",quote.quoteTime || "untimestamped"], "QUOTE", {
      price:quote.price, currency:quote.currency || null, exchange:quote.exchange || null,
      previousClose:finite(quote.previousClose) ? quote.previousClose : null,
      change:finite(quote.change) ? quote.change : null,
      changePercent:finite(quote.changePercent) ? quote.changePercent : null,
      quoteTime:quote.quoteTime || null, timestampStatus:quoteTime === null ? "MISSING" : quoteTime > asOfMs ? "AFTER_AS_OF" : "PRESENT",
      marketState:quote.marketState || null, delayedOrRealtime:quote.delayedOrRealtime || null,
      interval:quote.interval || null, warning:quote.warning || null
    }, quote.source || "unknown", quote.quoteTime || null);
  }

  const history = input.history;
  if (history && Array.isArray(history.data)) {
    const rows = history.data.filter(row => row && typeof row.date === "string" && row.date <= asOfDate &&
      ["open","high","low","close","volume"].every(key => finite(row[key])) &&
      row.open > 0 && row.high >= row.close && row.high >= row.open && row.low > 0 &&
      row.low <= row.close && row.low <= row.open && row.volume >= 0)
      .sort((a,b) => a.date.localeCompare(b.date)).slice(-252);
    if (rows.length) await add(facts, ["price-history",history.source || "unknown",history.interval || "unknown",history.startDate || rows[0].date,rows[rows.length-1].date],
      "DAILY_OHLCV_HISTORY", {interval:history.interval || "unknown",currency:history.currency || null,
        startDate:rows[0].date,endDate:rows[rows.length-1].date,observationCount:rows.length,
        dataQuality:history.dataQuality || null,warning:history.warning || null,rows},
      history.source || "unknown", history.fetchedAt || null);
  }

  const observations = Array.isArray(input.secObservations) ? input.secObservations : [];
  for (const row of observations.slice(0, 250)) {
    if (!row || typeof row.key !== "string" || !finite(row.value) ||
        typeof row.filed !== "string" || typeof row.end !== "string" ||
        row.filed > asOfDate || row.end > asOfDate) continue;
    await add(facts, ["sec",row.taxonomy || null,row.key,row.unit || null,row.fy ?? null,row.fp || null,row.start || null,row.end,row.filed,row.form || null,row.accession || null], "SEC_REPORTED_FACT", {
      metric:row.metric || row.key, key:row.key, taxonomy:row.taxonomy || null, tag:row.tag || null,
      value:row.value, unit:row.unit || null, start:row.start || null, end:row.end, filed:row.filed,
      form:row.form || null, accession:row.accession || null, fiscalYear:row.fy ?? null,
      fiscalPeriod:row.fp || null, availabilityTimestampVerified:false,
      note:"SEC filed date is not an exact public-availability timestamp."
    }, "SEC EDGAR companyfacts", row.filed);
  }

  const fmp = input.fmpFundamentals;
  if (fmp?.available === true) {
    if (fmp.latest && typeof fmp.latest === "object") {
      const latest = {...fmp.latest};
      const estimateKeys = ["analystEpsAverage","analystRevenueAverage","analystCountEps","analystCountRevenue"];
      const estimateMetrics = Object.fromEntries(estimateKeys.filter(key => latest[key] !== null && latest[key] !== undefined).map(key => [key,latest[key]]));
      for (const key of estimateKeys) delete latest[key];
      await add(facts, ["fmp-latest",fmp.provider || "Financial Modeling Prep",latest.fiscalDate || fmp.retrievedAt],
        "FMP_REPORTED_FUNDAMENTALS_CROSSCHECK", {fiscalDate:latest.fiscalDate || null,currency:latest.currency || null,metrics:latest},
        fmp.provider || "Financial Modeling Prep", fmp.retrievedAt || null);
      if (Object.keys(estimateMetrics).length) await add(facts, ["fmp-latest-estimates",fmp.provider || "Financial Modeling Prep",latest.fiscalDate || fmp.retrievedAt],
        "FMP_ANALYST_ESTIMATE", {period:latest.fiscalDate || null,metrics:estimateMetrics},
        fmp.provider || "Financial Modeling Prep", fmp.retrievedAt || null);
    }
    const sections = ["income","balance","cashflow","metrics","ratios","estimates"];
    for (const section of sections) {
      const rows = Array.isArray(fmp.history?.[section]) ? fmp.history[section] : [];
      for (const row of rows.slice(0, 10)) {
        const period = row?.date || row?.fiscalDate || fmp.retrievedAt || "undated";
        if (section !== "estimates" && typeof period === "string" && /^20\d{2}-\d{2}-\d{2}$/.test(period) && period > asOfDate) continue;
        await add(facts, ["fmp",fmp.provider || "Financial Modeling Prep",section,period,row?.period || null], section === "estimates" ? "FMP_ANALYST_ESTIMATE" : ["income","balance","cashflow"].includes(section) ? "FMP_STATEMENT_PERIOD" : "FMP_PROVIDER_METRIC",
          {section,period:row?.period || null,reportedCurrency:row?.reportedCurrency || null,values:row},
          fmp.provider || "Financial Modeling Prep", fmp.retrievedAt || null);
      }
    }
  }

  const news = input.news;
  if (Array.isArray(news?.items)) for (const item of news.items.slice(0, 50)) {
    if (!item || typeof item.title !== "string" || typeof item.url !== "string" || !/^https?:\/\//i.test(item.url)) continue;
    const published = dateMs(item.publishedAt);
    await add(evidence, ["news",news.provider || item.source || "news discovery feed",item.url,item.publishedAt || null], "NEWS_DISCOVERY", {
      title:item.title, description:item.description || "", url:item.url, publishedAt:item.publishedAt || null,
      timestampStatus:published === null ? "MISSING" : published > asOfMs ? "AFTER_AS_OF" : "PRESENT",
      publisher:item.source || null, publisherVerified:item.publisherVerified === true,
      note:"Discovery source only; headline and description are unverified claims until checked against original reporting."
    }, item.source || "news discovery feed", item.publishedAt || null);
  }

  const sentimentObservations = Array.isArray(input.sentimentObservations) ? input.sentimentObservations : [];
  for (const row of sentimentObservations.slice(0, 20)) {
    if (!row || typeof row.source !== "string" || !row.source.trim() ||
        !finite(row.sampleCount) || row.sampleCount <= 0 ||
        !finite(row.score) || row.score < -1 || row.score > 1) continue;
    const timestamp = typeof row.timestamp === "string" ? row.timestamp : null;
    const observedMs = dateMs(timestamp);
    const timestampStatus = observedMs === null ? "MISSING" : observedMs > asOfMs ? "AFTER_AS_OF" : "PRESENT";
    await add(evidence, ["sentiment",row.source,timestamp || "untimestamped",row.window || null], "SENTIMENT_OBSERVATION", {
      timestamp, timestampStatus, source: row.source, sampleCount: row.sampleCount, score: row.score,
      window: row.window || null, scoreMethod: row.scoreMethod || null,
      bullishPercent: finite(row.bullishPercent) ? row.bullishPercent : null,
      bearishPercent: finite(row.bearishPercent) ? row.bearishPercent : null,
      companyNewsScore: finite(row.companyNewsScore) ? row.companyNewsScore : null,
      note: row.note || "Provider snapshot; interpret only within its stated observation window."
    }, row.source, timestamp);
  }

  const earnings = input.earnings;
  if (Array.isArray(earnings?.events) && earnings.events.length) {
    for (const event of earnings.events.slice(0, 20)) await add(evidence,
      ["earnings",earnings.provider || event?.provider || "earnings calendar",event?.eventId || event?.id || null,event?.date || event?.startDate || "undated",event?.type || null],
      "EARNINGS_CALENDAR_EVENT", {event,verified:earnings.verified === true,provider:earnings.provider || null,
        warning:earnings.warning || "Confirm event directly with issuer investor relations."},
      earnings.provider || "earnings calendar", earnings.fetchedAt || null);
  } else if (earnings && typeof earnings === "object") {
    await add(evidence, ["earnings-check",earnings.provider || "earnings calendar",earnings.throughDate || earnings.windowEnd || asOfDate],
      "EARNINGS_CALENDAR_CHECK", {found:earnings.found === true,verified:earnings.verified === true,
        throughDate:earnings.throughDate || null,warning:earnings.warning || "No event in the checked window is not proof that no earnings date exists."},
      earnings.provider || "earnings calendar", earnings.fetchedAt || null);
  }

  const portfolio = validatePortfolio(input.portfolio, asOfMs);
  if (facts.length + evidence.length > 500) throw new TypeError("Research Council context exceeds 500 canonical facts and evidence items.");
  return {ticker,asOf,facts,evidence,portfolio};
}
