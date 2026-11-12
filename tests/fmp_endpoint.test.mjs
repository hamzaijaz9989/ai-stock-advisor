import assert from "node:assert/strict";
import test from "node:test";
import { onRequestGet } from "../web/functions/api/fmp-fundamentals.js";
import {createFmpBudgetTestDb} from "./helpers/fmp-budget-db.mjs";

test("FMP fundamentals endpoint fails closed when the API key is absent", async () => {
  const request = new Request("https://northstar.test/api/fmp-fundamentals?ticker=AAPL");
  const response = await onRequestGet({ request, env: {} });
  assert.equal(response.status, 503);
  const payload = await response.json();
  assert.equal(payload.configured, false);
});

test("FMP fundamentals endpoint validates ticker input", async () => {
  const request = new Request("https://northstar.test/api/fmp-fundamentals?ticker=bad%20ticker");
  const response = await onRequestGet({ request, env: { FMP_API_KEY: "test", FMP_VERIFIED_DAILY_LIMIT:"250", NORTHSTAR_DB:createFmpBudgetTestDb() } });
  assert.equal(response.status, 400);
});

test("FMP fundamentals endpoint returns separate source datasets and derived FCF", async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async input => {
    const url = new URL(String(input));
    const path = url.pathname.split("/").pop();
    const responses = {
      "income-statement": [{ date: "2025-12-31", reportedCurrency: "USD", revenue: 1000, netIncome: 100 }],
      "balance-sheet-statement": [{ date: "2025-12-31", reportedCurrency: "USD", totalAssets: 900, totalLiabilities: 400, totalDebt: 100, cashAndCashEquivalents: 50 }],
      "cash-flow-statement": [{ date: "2025-12-31", operatingCashFlow: 150, capitalExpenditure: -30 }],
      "key-metrics": [{ date: "2025-12-31", peRatio: 20, evToEBITDA: 12 }],
      "ratios": [{ date: "2025-12-31", currentRatio: 1.8, quickRatio: 1.2, returnOnEquity: 0.15 }],
      "analyst-estimates": [{ date: "2027-12-31", epsAvg: 5, revenueAvg: 1200, numAnalystsEps: 8, numAnalystsRevenue: 10 }]
    };
    return Response.json(responses[path] || []);
  };
  try {
    const request = new Request("https://northstar.test/api/fmp-fundamentals?ticker=AAPL");
    const budget=createFmpBudgetTestDb();
    const response = await onRequestGet({ request, env: { FMP_API_KEY: "test", FMP_VERIFIED_DAILY_LIMIT:"250", NORTHSTAR_DB:budget } });
    assert.equal(response.status, 200);
    const payload = await response.json();
    assert.equal(payload.available, true);
    assert.equal(payload.datasetCoverage.available, 5);
    assert.equal(payload.latest.approximateFreeCashFlow, 120);
    assert.equal(payload.latest.revenue, 1000);
    assert.equal(payload.latest.analystEpsAverage, 5);
    assert.equal(payload.provider, "Financial Modeling Prep");
    assert.equal(budget.events.reduce((n,row)=>n+row.cost,0),6);
  } finally {
    globalThis.fetch = originalFetch;
  }
});
