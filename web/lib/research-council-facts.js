// Canonical fact/evidence adapter for Northstar Research Council.
// Call only with server-collected provider responses and a reconciled portfolio snapshot.
// Browser-supplied values must never be treated as authoritative inputs.
const TICKER_RE = /^[A-Z][A-Z0-9.-]{0,11}$/;
const finite = value => typeof value === "number" && Number.isFinite(value);
const dateMs = value => {
  const parsed = Date.parse(value || "");
  return Number.isFinite(parsed) ? parsed : null;
};
const safeIdPart = value => String(value ?? "na").trim().replace(/[^A-Za-z0-9._-]/g, "_").slice(0, 48) || "na";
const makeId = (...parts) => parts.map(safeIdPart).join(":").slice(0, 180);

function validatePortfolio(portfolio, asOfMs) {
  if (!portfolio || portfolio.verified !== true || typeof portfolio.source !== "string" || !portfolio.source.trim()) {
    throw new TypeError("A verified portfolio snapshot with an explicit source is required; missing portfolio data must not be replaced with zeroes.");
  }
  const capturedAt = dateMs(portfolio.asOf);
  if (capturedAt === null || capturedAt > asOfMs) throw new TypeError("Portfolio snapshot timestamp is missing or after the research as-of time.");
  const fields = ["equityUsd","openRiskUsd","grossExposureUsd","dailyLossFraction","weeklyLossFraction","drawdownFraction","sectorExposureUsd","concurrentPositions"];
  if (fields.some(key => portfolio[key] === null || portfolio[key] === undefined || portfolio[key] === "")) throw new TypeError("Portfolio risk snapshot contains missing numeric fields.");
  const values = Object.fromEntries(fields.map(key => [key, Number(portfolio[key])]));
  if (!fields.every(key => Number.isFinite(values[key])) || values.equityUsd <= 0 ||
      fields.filter(key => key !== "equityUsd" && key !== "concurrentPositions").some(key => values[key] < 0) ||
      !Number.isInteger(values.concurrentPositions)) {
    throw new TypeError("Portfolio risk snapshot contains missing or invalid numeric fields.");
  }
  return {...values, asOf: new Date(capturedAt).toISOString(), source: portfolio.source, verified: true};
}

export function buildResearchCouncilContext(input) {
  const ticker = String(input?.ticker || "").trim().toUpperCase();
  if (!TICKER_RE.test(ticker)) throw new TypeError("A valid US equity ticker is required.");
  const asOfMs = dateMs(input?.asOf);
  if (asOfMs === null) throw new TypeError("A valid ISO research as-of timestamp is required.");
  const asOf = new Date(asOfMs).toISOString();
  const asOfDate = asOf.slice(0, 10);
  const facts = [], evidence = [], ids = new Set();
  const add = (target, id, type, value, source, observedAt = null) => {
    if (ids.has(id)) throw new TypeError("Canonical fact/evidence IDs must be globally unique.");
    ids.add(id);
    target.push({id,type,value,source,observedAt,asOf});
  };

  const quote = input.quote;
  if (quote && (quote.ticker === undefined || String(quote.ticker).toUpperCase() === ticker) && finite(quote.price) && quote.price > 0) {
    const quoteTime = dateMs(quote.quoteTime);
    add(facts, makeId("quote",ticker,quote.quoteTime || "untimestamped"), "QUOTE", {
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
    if (rows.length) add(facts, makeId("price-history",ticker,history.startDate || rows[0].date,rows[rows.length-1].date),
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
    add(facts, makeId("sec",ticker,row.key,row.end,row.unit,row.accession), "SEC_REPORTED_FACT", {
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
      add(facts, makeId("fmp-latest",ticker,latest.fiscalDate || fmp.retrievedAt),
        "FMP_REPORTED_FUNDAMENTALS_CROSSCHECK", {fiscalDate:latest.fiscalDate || null,currency:latest.currency || null,metrics:latest},
        fmp.provider || "Financial Modeling Prep", fmp.retrievedAt || null);
      if (Object.keys(estimateMetrics).length) add(facts, makeId("fmp-latest-estimates",ticker,latest.fiscalDate || fmp.retrievedAt),
        "FMP_ANALYST_ESTIMATE", {period:latest.fiscalDate || null,metrics:estimateMetrics},
        fmp.provider || "Financial Modeling Prep", fmp.retrievedAt || null);
    }
    const sections = ["income","balance","cashflow","metrics","ratios","estimates"];
    for (const section of sections) {
      const rows = Array.isArray(fmp.history?.[section]) ? fmp.history[section] : [];
      for (const row of rows.slice(0, 10)) {
        const period = row?.date || row?.fiscalDate || fmp.retrievedAt || "undated";
        if (section !== "estimates" && typeof period === "string" && /^20\d{2}-\d{2}-\d{2}$/.test(period) && period > asOfDate) continue;
        add(facts, makeId("fmp",ticker,section,period,row?.period), section === "estimates" ? "FMP_ANALYST_ESTIMATE" : ["income","balance","cashflow"].includes(section) ? "FMP_STATEMENT_PERIOD" : "FMP_PROVIDER_METRIC",
          {section,period:row?.period || null,reportedCurrency:row?.reportedCurrency || null,values:row},
          fmp.provider || "Financial Modeling Prep", fmp.retrievedAt || null);
      }
    }
  }

  const news = input.news;
  if (Array.isArray(news?.items)) for (const item of news.items.slice(0, 50)) {
    if (!item || typeof item.title !== "string" || typeof item.url !== "string" || !/^https?:\/\//i.test(item.url)) continue;
    const published = dateMs(item.publishedAt);
    add(evidence, makeId("news",ticker,item.url,item.publishedAt || item.title), "NEWS_DISCOVERY", {
      title:item.title, description:item.description || "", url:item.url, publishedAt:item.publishedAt || null,
      timestampStatus:published === null ? "MISSING" : published > asOfMs ? "AFTER_AS_OF" : "PRESENT",
      publisher:item.source || null, publisherVerified:item.publisherVerified === true,
      note:"Discovery source only; headline and description are unverified claims until checked against original reporting."
    }, item.source || "news discovery feed", item.publishedAt || null);
  }

  const earnings = input.earnings;
  if (Array.isArray(earnings?.events) && earnings.events.length) {
    for (const event of earnings.events.slice(0, 20)) add(evidence,
      makeId("earnings",ticker,event?.date || event?.startDate || "undated",event?.provider || earnings.provider),
      "EARNINGS_CALENDAR_EVENT", {event,verified:earnings.verified === true,provider:earnings.provider || null,
        warning:earnings.warning || "Confirm event directly with issuer investor relations."},
      earnings.provider || "earnings calendar", earnings.fetchedAt || null);
  } else if (earnings && typeof earnings === "object") {
    add(evidence, makeId("earnings-check",ticker,earnings.throughDate || earnings.windowEnd || asOfDate),
      "EARNINGS_CALENDAR_CHECK", {found:earnings.found === true,verified:earnings.verified === true,
        throughDate:earnings.throughDate || null,warning:earnings.warning || "No event in the checked window is not proof that no earnings date exists."},
      earnings.provider || "earnings calendar", earnings.fetchedAt || null);
  }

  const portfolio = validatePortfolio(input.portfolio, asOfMs);
  if (facts.length + evidence.length > 500) throw new TypeError("Research Council context exceeds 500 canonical facts and evidence items.");
  return {ticker,asOf,facts,evidence,portfolio};
}
