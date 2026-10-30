const TICKER_RE = /^[A-Z][A-Z0-9.-]{0,11}$/;
const BASE = "https://financialmodelingprep.com/stable/";

function finite(value) {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}
function firstArray(payload) {
  return Array.isArray(payload) ? payload : [];
}
function compactRows(rows, fields) {
  return firstArray(rows).slice(0, 5).map(row => {
    const result = {};
    for (const field of fields) {
      const value = row?.[field];
      if (value === null || typeof value === "string" || typeof value === "number" && Number.isFinite(value)) {
        result[field] = value;
      }
    }
    return result;
  });
}
async function getFmp(path, ticker, key) {
  const url = new URL(path, BASE);
  url.searchParams.set("symbol", ticker);
  url.searchParams.set("apikey", key);
  const response = await fetch(url.toString(), {
    headers: { "Accept": "application/json" },
    signal: AbortSignal.timeout(9000)
  });
  if (!response.ok) throw new Error("FMP " + path + " returned HTTP " + response.status);
  const payload = await response.json();
  if (!Array.isArray(payload)) throw new Error("FMP " + path + " returned an unexpected response.");
  return payload;
}
export async function onRequestGet({ request, env }) {
  const url = new URL(request.url);
  const ticker = (url.searchParams.get("ticker") || "").trim().toUpperCase();
  const headers = { "Cache-Control": "public, max-age=300", "X-Content-Type-Options": "nosniff" };
  if (!TICKER_RE.test(ticker)) return Response.json({ error: "Enter a valid US stock ticker." }, { status: 400, headers });
  if (!env?.FMP_API_KEY) {
    return Response.json({
      available: false, configured: false,
      reason: "Financial Modeling Prep is not configured. Add FMP_API_KEY as a Cloudflare Pages secret."
    }, { status: 503, headers: { ...headers, "Cache-Control": "no-store" } });
  }
  const requests = [
    ["income", "income-statement?period=annual&limit=5"],
    ["balance", "balance-sheet-statement?period=annual&limit=5"],
    ["cashflow", "cash-flow-statement?period=annual&limit=5"],
    ["metrics", "key-metrics?period=annual&limit=5"],
    ["ratios", "ratios?period=annual&limit=5"],
    ["estimates", "analyst-estimates?period=annual&page=0&limit=5"]
  ];
  const settled = await Promise.allSettled(requests.map(([, path]) => getFmp(path, ticker, env.FMP_API_KEY)));
  const data = {};
  const errors = [];
  settled.forEach((result, index) => {
    const name = requests[index][0];
    if (result.status === "fulfilled") data[name] = result.value;
    else errors.push({ dataset: name, error: String(result.reason?.message || "Provider request failed").slice(0, 180) });
  });
  const income = data.income || [];
  const balance = data.balance || [];
  const cashflow = data.cashflow || [];
  const metrics = data.metrics || [];
  const ratios = data.ratios || [];
  const estimates = data.estimates || [];
  const latestIncome = income[0] || {};
  const latestBalance = balance[0] || {};
  const latestCash = cashflow[0] || {};
  const latestMetrics = metrics[0] || {};
  const latestRatios = ratios[0] || {};
  const fcf = finite(latestCash.operatingCashFlow) !== null && finite(latestCash.capitalExpenditure) !== null
    ? latestCash.operatingCashFlow - Math.abs(latestCash.capitalExpenditure) : null;
  const latestEstimate = estimates.find(row => row && row.date && row.date >= new Date().toISOString().slice(0, 10)) || estimates[0] || {};
  const fields = {
    income: ["date","fiscalYear","period","reportedCurrency","revenue","grossProfit","operatingIncome","netIncome","eps","epsDiluted","weightedAverageShsOutDil"],
    balance: ["date","fiscalYear","period","reportedCurrency","totalAssets","totalLiabilities","totalStockholdersEquity","cashAndCashEquivalents","shortTermDebt","longTermDebt","totalDebt","netDebt","totalCurrentAssets","totalCurrentLiabilities"],
    cashflow: ["date","fiscalYear","period","reportedCurrency","operatingCashFlow","capitalExpenditure","freeCashFlow","dividendsPaid","commonStockRepurchased"],
    metrics: ["date","fiscalYear","period","marketCap","enterpriseValue","peRatio","priceToSalesRatio","priceToBookRatio","evToEBITDA","evToFreeCashFlow","freeCashFlowYield","returnOnEquity","returnOnInvestedCapital","netDebtToEBITDA"],
    ratios: ["date","fiscalYear","period","currentRatio","quickRatio","debtToEquityRatio","grossProfitMargin","operatingProfitMargin","netProfitMargin","returnOnAssets","returnOnEquity"],
    estimates: ["date","revenueAvg","revenueLow","revenueHigh","epsAvg","epsLow","epsHigh","numAnalystsRevenue","numAnalystsEps"]
  };
  const output = {};
  for (const [name, selected] of Object.entries(fields)) output[name] = compactRows(data[name], selected);
  const usable = [income, balance, cashflow, metrics, ratios].filter(rows => rows.length > 0).length;
  return Response.json({
    available: usable > 0, configured: true, ticker, provider: "Financial Modeling Prep",
    retrievedAt: new Date().toISOString(), datasetCoverage: { available: usable, requested: 5, analystEstimatesAvailable: estimates.length > 0 },
    latest: {
      fiscalDate: latestIncome.date || latestBalance.date || latestCash.date || null,
      currency: latestIncome.reportedCurrency || latestBalance.reportedCurrency || null,
      revenue: finite(latestIncome.revenue), netIncome: finite(latestIncome.netIncome),
      operatingCashFlow: finite(latestCash.operatingCashFlow),
      capitalExpenditure: finite(latestCash.capitalExpenditure), approximateFreeCashFlow: fcf,
      totalAssets: finite(latestBalance.totalAssets), totalLiabilities: finite(latestBalance.totalLiabilities),
      totalDebt: finite(latestBalance.totalDebt), cash: finite(latestBalance.cashAndCashEquivalents),
      currentRatio: finite(latestRatios.currentRatio), quickRatio: finite(latestRatios.quickRatio),
      peRatio: finite(latestMetrics.peRatio), evToEBITDA: finite(latestMetrics.evToEBITDA),
      returnOnEquity: finite(latestRatios.returnOnEquity ?? latestMetrics.returnOnEquity),
      netDebtToEBITDA: finite(latestMetrics.netDebtToEBITDA),
      analystEpsAverage: finite(latestEstimate.epsAvg),
      analystRevenueAverage: finite(latestEstimate.revenueAvg),
      analystCountEps: finite(latestEstimate.numAnalystsEps),
      analystCountRevenue: finite(latestEstimate.numAnalystsRevenue)
    },
    history: output, errors,
    limitations: [
      "FMP data is an independent secondary source, not a replacement for SEC filings.",
      "Annual periods, restatements, currencies and units must be matched before combining values.",
      "Analyst estimates are forecasts, not reported results or guaranteed outcomes.",
      "This endpoint does not generate a BUY signal or change Northstar's historical-validation gate."
    ]
  }, { headers });
}
