const TICKERS = ["AAPL", "MSFT", "NVDA", "INTC", "JPM"];
const SEC_HEADERS = {
  Accept: "application/json",
  "User-Agent": "NorthstarAI research contact: ihamzaij681@gmail.com"
};
const SEC_FACTS = new Set([
  "RevenueFromContractWithCustomerExcludingAssessedTax",
  "Revenues",
  "SalesRevenueNet",
  "RevenueFromContractWithCustomerIncludingAssessedTax",
  "NetIncomeLoss",
  "ProfitLoss",
  "OperatingIncomeLoss",
  "Assets",
  "Liabilities",
  "StockholdersEquity",
  "CashAndCashEquivalentsAtCarryingValue",
  "LongTermDebtCurrent",
  "LongTermDebtNoncurrent",
  "OperatingCashFlow",
  "NetCashProvidedByUsedInOperatingActivities",
  "PaymentsToAcquirePropertyPlantAndEquipment",
  "PropertyPlantAndEquipmentAndIntangibleAssetsNet",
  "EarningsPerShareBasic",
  "EarningsPerShareDiluted",
  "WeightedAverageNumberOfSharesOutstandingBasic",
  "WeightedAverageNumberOfDilutedSharesOutstanding"
]);

async function getJson(url, headers = SEC_HEADERS) {
  const response = await fetch(url, { headers, signal: AbortSignal.timeout(25000) });
  if (!response.ok) throw new Error("HTTP " + response.status);
  return response.json();
}
function nextCalendarDay(value) {
  const d = new Date(value + "T00:00:00Z");
  d.setUTCDate(d.getUTCDate() + 1);
  return d.toISOString().slice(0, 10);
}
function flattenFacts(companyfacts, filingDateByAccession, cutoff) {
  const rows = [];
  const facts = companyfacts?.facts || {};
  for (const [namespace, concepts] of Object.entries(facts)) {
    for (const [concept, definition] of Object.entries(concepts || {})) {
      if (!SEC_FACTS.has(concept)) continue;
      for (const [unit, observations] of Object.entries(definition?.units || {})) {
        for (const fact of observations || []) {
          if (!fact?.accn || !fact?.filed || fact.filed > cutoff) continue;
          const filingDate = filingDateByAccession.get(fact.accn) || fact.filed;
          if (filingDate > cutoff) continue;
          rows.push({
            namespace, concept, label: definition.label || concept, unit,
            value: fact.val, start: fact.start || null, end: fact.end || null,
            fiscalYear: fact.fy ?? null, fiscalPeriod: fact.fp || null,
            form: fact.form || null, accession: fact.accn,
            filedDate: filingDate,
            // Conservative daily-bar rule: a filing is not used on its filing date.
            availableFromDate: nextCalendarDay(filingDate),
            availabilityBasis: "SEC filing date + 1 calendar day (conservative; no intraday claim)"
          });
        }
      }
    }
  }
  return rows.sort((a, b) =>
    a.filedDate.localeCompare(b.filedDate) ||
    a.concept.localeCompare(b.concept) ||
    String(a.end || "").localeCompare(String(b.end || "")) ||
    a.accession.localeCompare(b.accession)
  );
}
async function getFmpPrices(ticker, from, to, key) {
  const url = new URL("https://financialmodelingprep.com/stable/historical-price-eod/full");
  url.searchParams.set("symbol", ticker);
  url.searchParams.set("from", from);
  url.searchParams.set("to", to);
  url.searchParams.set("apikey", key);
  const rows = await getJson(url.toString(), { Accept: "application/json" });
  if (!Array.isArray(rows)) throw new Error("Unexpected FMP historical-price response");
  return rows.filter(row => row?.date >= from && row?.date <= to)
    .sort((a, b) => a.date.localeCompare(b.date))
    .map(row => ({
      date: row.date, open: row.open, high: row.high, low: row.low,
      close: row.close, adjustedClose: row.adjClose ?? null, volume: row.volume ?? null
    }));
}
async function collectTicker(ticker, cik, from, to, key) {
  const cik10 = String(cik).padStart(10, "0");
  const [submissions, companyfacts, pricesResult] = await Promise.allSettled([
    getJson("https://data.sec.gov/submissions/CIK" + cik10 + ".json"),
    getJson("https://data.sec.gov/api/xbrl/companyfacts/CIK" + cik10 + ".json"),
    getFmpPrices(ticker, from, to, key)
  ]);
  const errors = [];
  if (submissions.status !== "fulfilled") errors.push({ source: "SEC submissions", error: String(submissions.reason?.message || "Unavailable") });
  if (companyfacts.status !== "fulfilled") errors.push({ source: "SEC companyfacts", error: String(companyfacts.reason?.message || "Unavailable") });
  if (pricesResult.status !== "fulfilled") errors.push({ source: "FMP prices", error: String(pricesResult.reason?.message || "Unavailable") });
  const filingDateByAccession = new Map();
  const recent = submissions.status === "fulfilled" ? submissions.value?.filings?.recent : null;
  if (recent) {
    const count = Math.min(recent.accessionNumber?.length || 0, recent.filingDate?.length || 0);
    for (let i = 0; i < count; i++) {
      if (recent.accessionNumber[i] && recent.filingDate[i]) filingDateByAccession.set(recent.accessionNumber[i], recent.filingDate[i]);
    }
  }
  if (submissions.status === "fulfilled") {
    for (const archive of submissions.value?.filings?.files || []) {
      if (!archive?.name || (archive.filingFrom && archive.filingFrom > to)) continue;
      try {
        const archived = await getJson("https://data.sec.gov/submissions/" + archive.name);
        const count = Math.min(archived.accessionNumber?.length || 0, archived.filingDate?.length || 0);
        for (let i = 0; i < count; i++) {
          if (archived.accessionNumber[i] && archived.filingDate[i] && archived.filingDate[i] <= to) {
            filingDateByAccession.set(archived.accessionNumber[i], archived.filingDate[i]);
          }
        }
      } catch (error) {
        errors.push({ source: "SEC historical submissions archive " + archive.name, error: String(error?.message || "Unavailable") });
      }
    }
  }
  const facts = companyfacts.status === "fulfilled"
    ? flattenFacts(companyfacts.value, filingDateByAccession, to)
    : [];
  const prices = pricesResult.status === "fulfilled" ? pricesResult.value : [];
  return {
    ticker, cik: cik10,
    companyName: submissions.status === "fulfilled" ? submissions.value?.name || null : null,
    prices, facts, errors,
    coverage: {
      priceBars: prices.length, secFacts: facts.length,
      filingDatesMapped: filingDateByAccession.size,
      firstPriceDate: prices[0]?.date || null,
      lastPriceDate: prices.at(-1)?.date || null,
      latestFactFilingDate: facts.at(-1)?.filedDate || null
    }
  };
}
export async function onRequestGet({ request, env }) {
  const params = new URL(request.url).searchParams;
  const from = params.get("from") || "2021-01-01";
  const to = params.get("to") || new Date().toISOString().slice(0, 10);
  const requested = (params.get("tickers") || TICKERS.join(",")).split(",").map(x => x.trim().toUpperCase()).filter(Boolean);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(from) || !/^\d{4}-\d{2}-\d{2}$/.test(to) || from > to ||
      (Date.parse(to) - Date.parse(from)) / 86400000 > 3653) {
    return Response.json({ available: false, error: "Use valid ISO dates and a maximum 10-year window." }, { status: 400 });
  }
  if (!requested.length || requested.some(t => !TICKERS.includes(t)) || new Set(requested).size !== requested.length) {
    return Response.json({ available: false, error: "Allowed tickers: " + TICKERS.join(", ") }, { status: 400 });
  }
  if (!env?.FMP_API_KEY) return Response.json({ available: false, error: "FMP_API_KEY is not configured." }, { status: 503 });
  try {
    const tickerIndex = await getJson("https://www.sec.gov/files/company_tickers.json");
    const index = Object.values(tickerIndex || {});
    const results = await Promise.all(requested.map(async ticker => {
      const issuer = index.find(item => String(item.ticker || "").toUpperCase() === ticker);
      if (!issuer?.cik_str) return { ticker, errors: [{ source: "SEC ticker index", error: "Issuer not found" }], prices: [], facts: [], coverage: { priceBars: 0, secFacts: 0 } };
      return collectTicker(ticker, issuer.cik_str, from, to, env.FMP_API_KEY);
    }));
    const allPrices = results.every(item => item.coverage.priceBars > 0);
    const allSecFacts = results.every(item => item.coverage.secFacts > 0);
    return Response.json({
      available: results.some(item => item.coverage.priceBars || item.coverage.secFacts),
      datasetType: "source_bundle_not_backtest",
      provider: { prices: "Financial Modeling Prep", filingsAndFacts: "SEC EDGAR" },
      retrievedAt: new Date().toISOString(), window: { from, to },
      availabilityPolicy: "Use a filing's facts only from the calendar day after its SEC filing date; this avoids same-day look-ahead but does not claim an exact public-availability timestamp.",
      coverage: {
        requestedTickers: requested, tickersWithPrices: results.filter(x => x.coverage.priceBars > 0).length,
        tickersWithSecFacts: results.filter(x => x.coverage.secFacts > 0).length,
        allTickersHavePrices: allPrices, allTickersHaveSecFacts: allSecFacts
      },
      companies: results,
      limitations: [
        "A fixed five-stock watchlist is not a survivorship-free historical market universe.",
        "FMP adjusted close is supplied for total-return measurement; intraday OHLC remains raw. Do not mix adjusted and unadjusted execution levels.",
        "SEC facts preserve accession, form, period and filed date; later amendments must be selected by availabilityFromDate at each historical snapshot.",
        "This source bundle does not yet calculate historical DCF values, ATR snapshots, bank-specific capital metrics, or point-in-time universe membership.",
        "This endpoint never generates a signal or approves BUY."
      ],
      decisionEligible: false
    }, { headers: { "Cache-Control": "no-store", "X-Content-Type-Options": "nosniff" } });
  } catch (error) {
    return Response.json({ available: false, error: String(error?.message || "Source collection failed").slice(0, 240) }, { status: 502 });
  }
}
