import assert from "node:assert/strict";
import test from "node:test";
import { onRequestGet } from "../web/functions/api/validation-source.js";

test("combined validation source joins SEC filing facts with FMP daily bars conservatively", async () => {
  const original = globalThis.fetch;
  const urls = [];
  globalThis.fetch = async input => {
    const url = new URL(String(input));
    urls.push(url);
    if (url.hostname === "www.sec.gov") {
      return Response.json({ "0": { cik_str: 320193, ticker: "AAPL", title: "Apple Inc." } });
    }
    if (url.hostname === "data.sec.gov" && url.pathname.includes("/submissions/")) {
      return Response.json({
        name: "Apple Inc.",
        filings: { recent: {
          accessionNumber: ["0000320193-26-000001"],
          filingDate: ["2026-02-01"],
          form: ["10-Q"]
        }, files: [] }
      });
    }
    if (url.hostname === "data.sec.gov" && url.pathname.includes("/companyfacts/")) {
      return Response.json({ facts: { "us-gaap": { Revenues: {
        label: "Revenue", units: { USD: [{
          val: 1000, start: "2025-10-01", end: "2025-12-31",
          fy: 2026, fp: "Q1", form: "10-Q", filed: "2026-02-01",
          accn: "0000320193-26-000001"
        }] }
      } } } });
    }
    if (url.hostname === "financialmodelingprep.com") {
      assert.equal(url.searchParams.get("symbol"), "AAPL");
      return Response.json([{ date: "2026-01-30", open: 250, high: 252, low: 248,
        close: 251, adjClose: 250.5, volume: 100000 }]);
    }
    throw new Error("Unexpected URL " + url);
  };
  try {
    const request = new Request("https://northstar.test/api/validation-source?tickers=AAPL&from=2026-01-01&to=2026-12-31");
    const response = await onRequestGet({ request, env: { FMP_API_KEY: "test" } });
    assert.equal(response.status, 200);
    const body = await response.json();
    assert.equal(body.datasetType, "source_bundle_not_backtest");
    assert.equal(body.companies[0].coverage.priceBars, 1);
    assert.equal(body.companies[0].facts[0].value, 1000);
    assert.equal(body.companies[0].facts[0].filedDate, "2026-02-01");
    assert.equal(body.companies[0].facts[0].availableFromDate, "2026-02-02");
    assert.equal(body.decisionEligible, false);
    assert.ok(urls.some(url => url.hostname === "data.sec.gov"));
    assert.ok(urls.some(url => url.hostname === "financialmodelingprep.com"));
  } finally {
    globalThis.fetch = original;
  }
});

test("combined validation source restricts the watchlist and never accepts unknown symbols", async () => {
  const request = new Request("https://northstar.test/api/validation-source?tickers=AAPL,FAKE");
  const response = await onRequestGet({ request, env: { FMP_API_KEY: "test" } });
  assert.equal(response.status, 400);
});

test("combined validation source requires the FMP secret without exposing it", async () => {
  const request = new Request("https://northstar.test/api/validation-source?tickers=AAPL");
  const response = await onRequestGet({ request, env: {} });
  assert.equal(response.status, 503);
  const body = await response.json();
  assert.match(body.error, /not configured/);
});
