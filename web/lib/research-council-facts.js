import {SENTIMENT_POPULATIONS} from "./sentiment-provider.js";
// Canonical fact/evidence adapter for Northstar Research Council.
// Call only with server-collected provider responses and a reconciled portfolio snapshot.
// Browser-supplied values must never be treated as authoritative inputs.
const TICKER_RE = /^[A-Z][A-Z0-9.-]{0,11}$/;
const finite = value => typeof value === "number" && Number.isFinite(value);
const dateMs = value => {
  const parsed = Date.parse(value || "");
  return Number.isFinite(parsed) ? parsed : null;
};
const dateOnly = value => typeof value === "string" && /^\d{4}-\d{2}-\d{2}$/.test(value) ? value : null;
const exactTimestampMs = value => {
  if (typeof value !== "string") return null;
  const text = value.trim();
  if (!/^\d{4}-\d{2}-\d{2}[T ]\d{2}:\d{2}(?::\d{2}(?:\.\d{1,3})?)?(?:Z|[+-]\d{2}:\d{2})$/i.test(text)) return null;
  return dateMs(text.replace(/^(\d{4}-\d{2}-\d{2}) /, "$1T"));
};

const QUOTE_OPEN_MAX_AGE_MS = 15 * 60 * 1000;
const QUOTE_CLOSED_MAX_AGE_MS = 5 * 24 * 60 * 60 * 1000;

// A quote may be up to 15 minutes old unless the provider explicitly reports
// the market closed; then the most recent session close is accepted for up to
// five calendar days (weekends/holiday closures). Unknown/pre/post states use
// the stricter open-session limit. Missing and future timestamps always fail.
export function assessQuoteFreshness(quote, asOf) {
  const asOfMs = dateMs(asOf);
  const quoteMs = dateMs(quote?.quoteTime);
  const marketState = String(quote?.marketState || "").trim().toUpperCase();
  const explicitlyClosed = marketState === "CLOSED" || marketState.includes("MARKET CLOSED");
  const maxAgeMs = explicitlyClosed ? QUOTE_CLOSED_MAX_AGE_MS : QUOTE_OPEN_MAX_AGE_MS;
  if (asOfMs === null || quoteMs === null) {
    return {status:"MISSING",ageMs:null,maxAgeMs,marketState:marketState || "UNKNOWN",reason:"QUOTE_TIMESTAMP_MISSING"};
  }
  if (quoteMs > asOfMs) {
    return {status:"AFTER_AS_OF",ageMs:null,maxAgeMs,marketState:marketState || "UNKNOWN",reason:"QUOTE_AFTER_AS_OF"};
  }
  const ageMs = asOfMs - quoteMs;
  if (ageMs > maxAgeMs) {
    return {
      status:"STALE",ageMs,maxAgeMs,marketState:marketState || "UNKNOWN",
      reason:explicitlyClosed ? "CLOSED_SESSION_QUOTE_OLDER_THAN_5_DAYS" : "QUOTE_OLDER_THAN_15_MINUTES"
    };
  }
  return {status:"FRESH",ageMs,maxAgeMs,marketState:marketState || "UNKNOWN",reason:"WITHIN_MARKET_STATE_AGE_LIMIT"};
}
function secAvailability(row, asOfDate, asOfMs) {
  const filed = dateOnly(row?.filed);
  const availableAtText = typeof row?.availableAt === "string" ? row.availableAt : "";
  const hasExactTime = /(?:T|\s)\d{2}:\d{2}/.test(availableAtText);
  const availableAtMs = hasExactTime ? dateMs(availableAtText) : null;
  const verified = row?.availabilityTimestampVerified === true &&
    availableAtMs !== null && availableAtMs <= asOfMs;
  const filedBeforeAsOf = !!filed && (filed < asOfDate || (filed === asOfDate && verified));
  return {
    eligible: filedBeforeAsOf && (availableAtMs === null || availableAtMs <= asOfMs),
    verified,
    availableAt: verified ? new Date(availableAtMs).toISOString() : null
  };
}
function fmpStatementAvailability(row, asOfDate, asOfMs) {
  const acceptedAt = typeof row?.acceptedDate === "string" ? row.acceptedDate.trim() : "";
  const acceptedAtMs = exactTimestampMs(acceptedAt);
  if (acceptedAtMs !== null) {
    return {
      eligible: acceptedAtMs <= asOfMs,
      timestamp: new Date(acceptedAtMs).toISOString(),
      kind: "PROVIDER_ACCEPTED_AT"
    };
  }
  const filingDate = dateOnly(row?.filingDate);
  return {
    eligible: !!filingDate && filingDate < asOfDate,
    timestamp: filingDate,
    kind: filingDate ? "PRIOR_DAY_FILING_DATE" : null
  };
}
const safeIdPart = value => String(value ?? "na").trim().replace(/[^A-Za-z0-9._-]/g, "_").slice(0, 48) || "na";
const makeId = (...parts) => parts.map(safeIdPart).join(":").slice(0, 180);

const NEWS_PUBLISHERS = /reuters|bloomberg|wall street journal|wsj|cnbc|associated press|ap news|financial times|marketwatch|yahoo finance|nasdaq|finnhub|financial modeling prep/i;
const NEWS_MACRO_SCOPE = /\b(federal reserve|fed rate|interest rates?|inflation|cpi|pce|nonfarm payrolls|unemployment rate|treasury yields?|recession|gdp growth)\b/i;
const NEWS_SECTOR_SCOPE = /\b(semiconductor industry|chipmakers|cloud computing sector|banking sector|oil prices|crude prices|retail sector|automotive industry|biotech sector)\b/i;
const NEWS_MAX_AGE_DAYS = 14;
const NEWS_MAX_AGE_MS = NEWS_MAX_AGE_DAYS * 24 * 60 * 60 * 1000;
function normalizeNewsHeadline(value) {
  return String(value || "").normalize("NFKC").toLowerCase()
    .replace(/&amp;/g," and ").replace(/[^\p{L}\p{N}]+/gu," ").trim().replace(/\s+/g," ");
}
function canonicalNewsUrl(value) {
  try {
    const url = new URL(String(value));
    if (!["http:","https:"].includes(url.protocol)) return null;
    url.hash = "";
    const params = [...url.searchParams.entries()]
      .filter(([key]) => !/^utm_/i.test(key) && !/^(gclid|fbclid|ocid)$/i.test(key))
      .sort(([a,av],[b,bv]) => a.localeCompare(b) || av.localeCompare(bv));
    url.search = "";
    for (const [key,val] of params) url.searchParams.append(key,val);
    return url.toString().replace(/\/$/,"");
  } catch {
    return null;
  }
}
function classifyNewsScope(item,ticker) {
  const text = normalizeNewsHeadline([item?.title,item?.description].filter(Boolean).join(" "));
  const symbol = normalizeNewsHeadline(ticker);
  if (symbol && (" "+text+" ").includes(" "+symbol+" ")) return "company";
  if (NEWS_MACRO_SCOPE.test(text)) return "macro";
  if (NEWS_SECTOR_SCOPE.test(text)) return "sector";
  return "ambiguous";
}
function classifyNewsSource(item) {
  const source = String(item?.source || item?.publisher || "");
  let host = "";
  try { host = new URL(String(item?.url || "")).hostname.toLowerCase(); } catch {}
  if (host === "sec.gov" || host.endsWith(".sec.gov") || host.startsWith("investor.") ||
      /\b(investor relations|company newsroom|official press release)\b/i.test(source)) return "primary-source";
  if (NEWS_PUBLISHERS.test(source) ||
      /(^|\.)(reuters\.com|bloomberg\.com|wsj\.com|cnbc\.com|apnews\.com|ft\.com|marketwatch\.com|finance\.yahoo\.com|nasdaq\.com|finnhub\.io)$/.test(host)) return "reported-source";
  return "unverified-source";
}


function validatePortfolio(portfolio, asOfMs) {
  if (!portfolio || portfolio.verified !== true || typeof portfolio.source !== "string" || !portfolio.source.trim()) {
    throw new TypeError("A verified portfolio snapshot with an explicit source is required; missing portfolio data must not be replaced with zeroes.");
  }
  const capturedAt = dateMs(portfolio.asOf);
  if (capturedAt === null || capturedAt > asOfMs) throw new TypeError("Portfolio snapshot timestamp is missing or after the research as-of time.");
  const fields = ["equityUsd","virtualAllocationUsd","actualAccountEquityUsd","openRiskUsd","grossExposureUsd","dailyLossFraction","weeklyLossFraction","drawdownFraction","sectorExposureUsd","concurrentPositions"];
  if (fields.some(key => portfolio[key] === null || portfolio[key] === undefined || portfolio[key] === "")) throw new TypeError("Portfolio risk snapshot contains missing numeric fields.");
  const values = Object.fromEntries(fields.map(key => [key, Number(portfolio[key])]));
  if (!fields.every(key => Number.isFinite(values[key])) || values.equityUsd <= 0 || values.virtualAllocationUsd <= 0 || values.actualAccountEquityUsd <= 0 ||
      Math.abs(values.equityUsd - values.virtualAllocationUsd) > 0.01 ||
      portfolio.riskMetricBasis !== "actual_alpaca_paper_account_equity" ||
      fields.filter(key => key !== "equityUsd" && key !== "concurrentPositions").some(key => values[key] < 0) ||
      !Number.isInteger(values.concurrentPositions)) {
    throw new TypeError("Portfolio risk snapshot contains missing or invalid numeric fields.");
  }
  return {...values, capitalBasis:"virtual_strategy_allocation", accountEquityBasis:"actual_alpaca_paper_account", riskMetricBasis:portfolio.riskMetricBasis, asOf: new Date(capturedAt).toISOString(), source: portfolio.source, verified: true};
}


function buildResourceCoverage(facts, evidence, portfolio, asOf, newsQuality = {}) {
  const byType = type => facts.filter(item => item.type === type);
  const evidenceByType = type => evidence.filter(item => item.type === type);
  const history = byType("DAILY_OHLCV_HISTORY");
  const quote = byType("QUOTE");
  const sec = byType("SEC_REPORTED_FACT");
  const fmp = byType("FMP_REPORTED_FUNDAMENTALS_CROSSCHECK").concat(byType("FMP_STATEMENT_PERIOD"));
  const news = evidenceByType("NEWS_DISCOVERY");
  const sentiment = evidenceByType("SENTIMENT_OBSERVATION");
  const earnings = evidence.filter(item => item.type.startsWith("EARNINGS_"));
  const historyCount = history.reduce((n,item) => n + Number(item.value?.observationCount || 0), 0);
  const exactAvailability = sec.some(item => item.value?.availabilityTimestampVerified === true);
  const quoteFreshness = quote[0]?.value?.quoteFreshness || {
    status:"MISSING",ageMs:null,maxAgeMs:QUOTE_OPEN_MAX_AGE_MS,marketState:"UNKNOWN",reason:"QUOTE_TIMESTAMP_MISSING"
  };
  const quoteFresh = quoteFreshness.status === "FRESH";
  const entry = (status, ids, gaps) => ({status, factIds:ids, gaps});
  return {
    generatedBy:"northstar-canonical-fact-adapter",
    asOf,
    newsQuality:{
      eligibleCount:Number(newsQuality.eligibleCount || 0),
      uniqueEligibleCount:Number(newsQuality.uniqueEligibleCount || 0),
      excludedFutureDatedCount:Number(newsQuality.excludedFutureDatedCount || 0),
      excludedUndatedCount:Number(newsQuality.excludedUndatedCount || 0),
      excludedStaleCount:Number(newsQuality.excludedStaleCount || 0),
      maxAgeDays:Number(newsQuality.maxAgeDays || NEWS_MAX_AGE_DAYS),
      duplicateCount:Number(newsQuality.duplicateCount || 0),
      companySpecificCount:Number(newsQuality.companySpecificCount || 0),
      macroCount:Number(newsQuality.macroCount || 0),
      sectorCount:Number(newsQuality.sectorCount || 0),
      ambiguousCount:Number(newsQuality.ambiguousCount || 0),
      primarySourceCount:Number(newsQuality.primarySourceCount || 0),
      reportedSourceCount:Number(newsQuality.reportedSourceCount || 0),
      unverifiedSourceCount:Number(newsQuality.unverifiedSourceCount || 0)
    },
    roles:{
      market_scanner:{
        ...entry(quoteFresh && historyCount >= 60 ? "PARTIAL" : "INSUFFICIENT",
          [...quote,...history].map(x=>x.id),
          [...(!quoteFresh?["Quote freshness gate failed: "+quoteFreshness.reason+"."]:[]),
            ...(historyCount < 60?["At least 60 valid daily bars are not present."]:[]),
            "Broad market-universe, breadth and cross-sectional liquidity coverage are not supplied."]),
        quoteFreshness
      },
      technical_analyst:entry(historyCount >= 60 ? "PARTIAL" : "INSUFFICIENT",history.map(x=>x.id),
        [...(historyCount < 60?["Fewer than 60 valid daily OHLCV observations."]:[]),
          "Adjusted-price and corporate-action continuity are not independently attested.",
          "Trusted precomputed technical indicators are not supplied."]),
      fundamental_analyst:entry(sec.length || fmp.length ? "PARTIAL" : "INSUFFICIENT",
        [...sec,...fmp].map(x=>x.id),
        [...(!sec.length?["SEC company-facts observations are missing; provider-only metrics require filing-level verification."]:[]),
          ...(!fmp.length?["FMP secondary reported-fundamental cross-checks are missing; SEC company-facts remains the primary source."]:[]),
          ...(!exactAvailability?["Exact public-availability timestamps for SEC facts are not verified."]:[])]),
      news_analyst:entry(news.length ? "PARTIAL" : "INSUFFICIENT",
        [...news,...earnings].map(x=>x.id),
        [
          ...(!news.length ? ["No decision-eligible timestamped news items published at or before the research as-of time are available."] : []),
          ...(Number(newsQuality.excludedFutureDatedCount || 0) > 0 ? ["Excluded " + Number(newsQuality.excludedFutureDatedCount) + " future-dated news items after the research as-of time."] : []),
          ...(Number(newsQuality.excludedUndatedCount || 0) > 0 ? ["Excluded " + Number(newsQuality.excludedUndatedCount) + " news items with missing or invalid publication timestamps."] : []),
          ...(Number(newsQuality.excludedStaleCount || 0) > 0 ? ["Excluded " + Number(newsQuality.excludedStaleCount) + " stale news items older than the " + NEWS_MAX_AGE_DAYS + "-day research freshness window."] : []),
          ...(Number(newsQuality.companySpecificCount || 0) === 0 && news.length ? ["No unique timestamped news item explicitly identifies the ticker; macro, sector and ambiguous stories are context only."] : []),
          ...(Number(newsQuality.duplicateCount || 0) > 0 ? ["Marked " + Number(newsQuality.duplicateCount) + " duplicate or syndicated news items; do not count them as independent corroboration."] : []),
          ...(Number(newsQuality.unverifiedSourceCount || 0) > 0 ? ["Unverified publisher/source heuristics apply to " + Number(newsQuality.unverifiedSourceCount) + " unique items; they remain discovery claims only."] : []),
          "News scope and source-tier labels are deterministic heuristics, not proof of truth or independent corroboration.",
          "News items are discovery evidence; original-source corroboration is not established by collection.",
          "Issuer/regulator source verification is not consistently recorded."
        ]),
      sentiment_analyst:entry(sentiment.length?"PARTIAL":"MISSING",sentiment.map(x=>x.id),
        sentiment.length?["Provider-normalized timestamped sentiment is present; population methodology, source entitlement and comparability remain independently unverified."]:
          ["No dedicated timestamped sentiment or positioning feed is connected.",
           "Retail, institutional, short-interest, options-flow and analyst-revision populations are unavailable."]),
      bull_researcher:entry("DEPENDENT",facts.map(x=>x.id).concat(evidence.map(x=>x.id)),
        ["Upside case is bounded by the upstream evidence gaps; no independent external retrieval is available."]),
      bear_researcher:entry("DEPENDENT",facts.map(x=>x.id).concat(evidence.map(x=>x.id)),
        ["Downside case is bounded by the upstream evidence gaps; no independent external retrieval is available."]),
      portfolio_analyst:entry(portfolio?.verified === true ? "PARTIAL" : "INSUFFICIENT",[],
        ["Sector classification and portfolio-wide correlation matrix are not supplied.",
          "Portfolio fit must remain limited where exposure or risk inputs are unavailable."]),
      risk_committee:{
        status:portfolio?.verified === true ? "SUFFICIENT_FOR_DETERMINISTIC_GATES" : "INSUFFICIENT",
        factIds:[],
        inputFields:["equityUsd","openRiskUsd","grossExposureUsd","dailyLossFraction","weeklyLossFraction","drawdownFraction","sectorExposureUsd","concurrentPositions"],
        gaps:portfolio?.verified === true ? [] : ["Verified portfolio risk inputs are unavailable."]
      }
    }
  };
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
    const quoteFreshness = assessQuoteFreshness(quote,asOf);
    add(facts, makeId("quote",ticker,quote.quoteTime || "untimestamped"), "QUOTE", {
      price:quote.price, currency:quote.currency || null, exchange:quote.exchange || null,
      previousClose:finite(quote.previousClose) ? quote.previousClose : null,
      change:finite(quote.change) ? quote.change : null,
      changePercent:finite(quote.changePercent) ? quote.changePercent : null,
      quoteTime:quote.quoteTime || null, timestampStatus:quoteTime === null ? "MISSING" : quoteTime > asOfMs ? "AFTER_AS_OF" : "PRESENT",
      quoteFreshness,
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
    const availability = secAvailability(row, asOfDate, asOfMs);
    if (!row || typeof row.key !== "string" || !finite(row.value) ||
        !dateOnly(row.end) || row.end > asOfDate || !availability.eligible) continue;
    add(facts, makeId("sec",ticker,row.key,row.end,row.unit,row.accession), "SEC_REPORTED_FACT", {
      metric:row.metric || row.key, key:row.key, taxonomy:row.taxonomy || null, tag:row.tag || null,
      value:row.value, unit:row.unit || null, start:row.start || null, end:row.end, filed:row.filed,
      form:row.form || null, accession:row.accession || null, fiscalYear:row.fy ?? null,
      fiscalPeriod:row.fp || null, availabilityTimestampVerified:availability.verified,
      availableAt:availability.availableAt,
      note:availability.verified
        ? "Exact public-availability timestamp is supplied and is not after the research as-of time."
        : "SEC filed date is not an exact public-availability timestamp; same-day filings are excluded."
    }, "SEC EDGAR companyfacts", availability.availableAt || row.filed);
  }

  const fmp = input.fmpFundamentals;
  if (fmp?.available === true) {
    const retrievedAtMs = dateMs(fmp.retrievedAt);
    const fmpSnapshotAvailable = retrievedAtMs !== null && retrievedAtMs <= asOfMs;
    if (fmpSnapshotAvailable && fmp.latest && typeof fmp.latest === "object") {
      const latest = {...fmp.latest};
      const estimateKeys = ["analystEpsAverage","analystRevenueAverage","analystCountEps","analystCountRevenue"];
      const estimateMetrics = Object.fromEntries(estimateKeys.filter(key => latest[key] !== null && latest[key] !== undefined).map(key => [key,latest[key]]));
      for (const key of estimateKeys) delete latest[key];
      add(facts, makeId("fmp-latest",ticker,latest.fiscalDate || fmp.retrievedAt),
        "FMP_REPORTED_FUNDAMENTALS_CROSSCHECK", {
          fiscalDate:latest.fiscalDate || null,currency:latest.currency || null,metrics:latest,
          availabilityTimestampVerified:false,
          note:"Current provider cross-check captured at retrieval time; not an immutable point-in-time filing archive."
        }, fmp.provider || "Financial Modeling Prep", fmp.retrievedAt);
      if (Object.keys(estimateMetrics).length) add(facts, makeId("fmp-latest-estimates",ticker,latest.fiscalDate || fmp.retrievedAt),
        "FMP_ANALYST_ESTIMATE", {
          period:latest.fiscalDate || null,metrics:estimateMetrics,
          availabilityTimestampVerified:false,
          note:"Provider estimate snapshot is only evidenced at retrieval time, not as an immutable historical estimate archive."
        }, fmp.provider || "Financial Modeling Prep", fmp.retrievedAt);
    }
    const sections = ["income","balance","cashflow","metrics","ratios","estimates"];
    for (const section of sections) {
      const rows = Array.isArray(fmp.history?.[section]) ? fmp.history[section] : [];
      for (const row of rows.slice(0, 10)) {
        if (!fmpSnapshotAvailable) continue;
        const period = row?.date || row?.fiscalDate || fmp.retrievedAt || "undated";
        if (section !== "estimates") {
          const availability = fmpStatementAvailability(row, asOfDate, asOfMs);
          if (!availability.eligible ||
              (typeof period === "string" && /^20\d{2}-\d{2}-\d{2}$/.test(period) && period > asOfDate)) continue;
          add(facts, makeId("fmp",ticker,section,period,row?.period), "FMP_STATEMENT_PERIOD", {
            section,period:row?.period || null,reportedCurrency:row?.reportedCurrency || null,values:row,
            availabilityTimestampVerified:false,pointInTimeTimestamp:availability.timestamp,
            pointInTimeTimestampKind:availability.kind,
            note:"FMP accepted/filing timestamp is provider-reported and is not independently verified public availability."
          }, fmp.provider || "Financial Modeling Prep", fmp.retrievedAt);
        } else {
          add(facts, makeId("fmp",ticker,section,period,row?.period), "FMP_ANALYST_ESTIMATE", {
            section,period:row?.period || null,reportedCurrency:row?.reportedCurrency || null,values:row,
            availabilityTimestampVerified:false,
            note:"Provider estimate snapshot is evidenced at retrieval time only; historical revisions are not archived here."
          }, fmp.provider || "Financial Modeling Prep", fmp.retrievedAt);
        }
      }
    }
  }

  const news = input.news;
  const newsQuality = {
    eligibleCount:0,uniqueEligibleCount:0,excludedFutureDatedCount:0,excludedUndatedCount:0,
    excludedStaleCount:0,maxAgeDays:NEWS_MAX_AGE_DAYS,duplicateCount:0,companySpecificCount:0,macroCount:0,sectorCount:0,ambiguousCount:0,
    primarySourceCount:0,reportedSourceCount:0,unverifiedSourceCount:0
  };
  const seenNewsByUrl = new Map(), seenNewsByHeadlineDay = new Map();
  if (Array.isArray(news?.items)) for (const [index,item] of news.items.slice(0, 50).entries()) {
    if (!item || typeof item.title !== "string" || !item.title.trim() ||
        typeof item.url !== "string" || !/^https?:\/\//i.test(item.url)) continue;
    const published = exactTimestampMs(item.publishedAt);
    if (published === null) {
      newsQuality.excludedUndatedCount++;
      continue;
    }
    if (published > asOfMs) {
      newsQuality.excludedFutureDatedCount++;
      continue;
    }
    const ageMs = asOfMs - published;
    if (ageMs > NEWS_MAX_AGE_MS) {
      newsQuality.excludedStaleCount++;
      continue;
    }
    const canonicalUrl = canonicalNewsUrl(item.url);
    const headline = normalizeNewsHeadline(item.title);
    if (!canonicalUrl || !headline) continue;
    const publicationDay = new Date(published).toISOString().slice(0,10);
    const headlineDayKey = headline + ":" + publicationDay;
    const urlDuplicateOf = seenNewsByUrl.get(canonicalUrl) || null;
    const headlineDuplicateOf = seenNewsByHeadlineDay.get(headlineDayKey) || null;
    const duplicateOf = urlDuplicateOf || headlineDuplicateOf || null;
    const duplicateReason = urlDuplicateOf ? "canonical-url" : headlineDuplicateOf ? "normalized-headline-same-day" : null;
    const id = makeId("news",ticker,canonicalUrl,item.publishedAt,index);
    const scope = classifyNewsScope(item,ticker);
    const sourceTier = classifyNewsSource(item);
    newsQuality.eligibleCount++;
    if (duplicateOf) {
      newsQuality.duplicateCount++;
      seenNewsByUrl.set(canonicalUrl,duplicateOf);
      seenNewsByHeadlineDay.set(headlineDayKey,duplicateOf);
    } else {
      newsQuality.uniqueEligibleCount++;
      if (scope === "company") newsQuality.companySpecificCount++;
      else if (scope === "macro") newsQuality.macroCount++;
      else if (scope === "sector") newsQuality.sectorCount++;
      else newsQuality.ambiguousCount++;
      if (sourceTier === "primary-source") newsQuality.primarySourceCount++;
      else if (sourceTier === "reported-source") newsQuality.reportedSourceCount++;
      else newsQuality.unverifiedSourceCount++;
      seenNewsByUrl.set(canonicalUrl,id);
      seenNewsByHeadlineDay.set(headlineDayKey,id);
    }
    add(evidence,id,"NEWS_DISCOVERY",{
      title:item.title,description:item.description || "",url:item.url,canonicalUrl,publishedAt:item.publishedAt,
      timestampStatus:"PRESENT",freshnessStatus:"FRESH",ageMs,maxAgeMs:NEWS_MAX_AGE_MS,scope,scopeEligible:scope === "company",
      sourceTier,sourceTierHeuristic:true,duplicate:Boolean(duplicateOf),duplicateOf,duplicateReason,
      publisher:item.source || null,publisherVerified:item.publisherVerified === true,
      note:"Discovery source only; publication timestamp is within the 14-day freshness window. Scope and source-tier labels are heuristics, not verification. Duplicate items are not independent corroboration. Headline and description remain unverified claims until checked against original reporting."
    },item.source || "news discovery feed",item.publishedAt);
  }

  const sentimentObservations=Array.isArray(input.sentimentObservations)?input.sentimentObservations:[];
  for(const [index,observation] of sentimentObservations.slice(0,10).entries()){
    const timestamp=observation?.timestamp,observed=exactTimestampMs(timestamp),score=observation?.score;
    if(String(observation?.symbol||"").toUpperCase()!==ticker||observed===null||observed>asOfMs||
      observation?.timestampStatus!=="PRESENT"||!SENTIMENT_POPULATIONS.includes(observation?.population)||
      typeof observation?.source!=="string"||!observation.source.trim()||!Number.isSafeInteger(observation.sampleCount)||observation.sampleCount<1||
      !finite(score)||score < -1||score > 1||observation.normalizedScale!=="minus1_to_plus1"||
      typeof observation.metric!=="string"||!observation.metric.trim()||typeof observation.methodology!=="string"||observation.methodology.trim().length<10)continue;
    add(evidence,makeId("sentiment",ticker,observation.source,timestamp,observation.population,observation.metric,observation.id||index),
      "SENTIMENT_OBSERVATION",{timestamp,timestampStatus:"PRESENT",source:observation.source,population:observation.population,
      metric:observation.metric,methodology:observation.methodology,normalizedScale:observation.normalizedScale,score,sampleCount:observation.sampleCount},
      observation.source,timestamp);
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
  const resourceCoverage = buildResourceCoverage(facts,evidence,portfolio,asOf,newsQuality);

  // Give specialists first-class, citable records for portfolio inputs and known resource
  // gaps. Without these records, a role with no dedicated feed (notably sentiment) could
  // only satisfy the citation contract by attaching its limitation to unrelated market data.
  const portfolioFactId = makeId("portfolio-risk",ticker,asOf);
  const coverageFactId = makeId("resource-coverage",ticker,asOf);
  add(facts,portfolioFactId,"PORTFOLIO_RISK_SNAPSHOT",{...portfolio},portfolio.source,portfolio.asOf);
  const coverageRecord = {
    generatedBy:resourceCoverage.generatedBy,
    asOf:resourceCoverage.asOf,
    newsQuality:{...resourceCoverage.newsQuality},
    roles:Object.fromEntries(Object.entries(resourceCoverage.roles).map(([role,entry])=>[role,{
      status:entry.status,
      gaps:[...entry.gaps],
      inputFields:Array.isArray(entry.inputFields)?[...entry.inputFields]:[]
    }]))
  };
  add(facts,coverageFactId,"RESOURCE_COVERAGE_SNAPSHOT",coverageRecord,"Northstar deterministic resource inventory",asOf);
  for (const [role,entry] of Object.entries(resourceCoverage.roles)) {
    const ids = new Set(Array.isArray(entry.factIds)?entry.factIds:[]);
    ids.add(coverageFactId);
    if (role === "portfolio_analyst" || role === "risk_committee") ids.add(portfolioFactId);
    entry.factIds = [...ids];
  }

  if (facts.length + evidence.length > 500) throw new TypeError("Research Council context exceeds 500 canonical facts and evidence items.");
  return {ticker,asOf,facts,evidence,portfolio,resourceCoverage};
}
