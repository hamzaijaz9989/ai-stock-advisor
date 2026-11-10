import test from "node:test";
import assert from "node:assert/strict";
import { isUsMarketOpen, isQuoteFresh, parseWatchZone, getFmpQuote, getQuote } from "../monitor/worker.js";

test("parses provisional entry watch zones and rejects malformed ranges",()=>{
 assert.deepEqual(parseWatchZone("NOT ENTRY-READY — Model entry watch zone: $34.01–$36.28; base-case reference"),{low:34.01,high:36.28});
 assert.deepEqual(parseWatchZone("Model entry watch zone: $1,234.50-$1,300.00"),{low:1234.5,high:1300});
 assert.equal(parseWatchZone("No verified entry zone"),null);
 assert.equal(parseWatchZone("Model entry watch zone: $0–$10"),null);
 assert.equal(parseWatchZone("Model entry watch zone: $20–$10"),null);
});
test("market-hours gate uses New York time and excludes weekends, exchange holidays and early closes",()=>{
 assert.equal(isUsMarketOpen(new Date("2026-11-10T15:00:00Z")),true);
 assert.equal(isUsMarketOpen(new Date("2026-11-10T21:00:00Z")),false);
 assert.equal(isUsMarketOpen(new Date("2026-11-14T15:00:00Z")),false);
 assert.equal(isUsMarketOpen(new Date("2026-11-10T14:29:00Z")),false);
 assert.equal(isUsMarketOpen(new Date("2026-11-26T16:00:00Z")),false);
 assert.equal(isUsMarketOpen(new Date("2026-04-03T15:00:00Z")),false);
 assert.equal(isUsMarketOpen(new Date("2026-06-19T15:00:00Z")),false);
 assert.equal(isUsMarketOpen(new Date("2026-12-25T15:00:00Z")),false);
 assert.equal(isUsMarketOpen(new Date("2026-11-27T18:30:00Z")),false);
 assert.equal(isUsMarketOpen(new Date("2026-11-27T17:00:00Z")),true);
});

test("quote freshness gate rejects missing, stale, and future timestamps",()=>{
 const now=Date.parse("2026-11-10T15:00:00.000Z");
 assert.equal(isQuoteFresh("2026-11-10T14:50:00.000Z",now),true);
 assert.equal(isQuoteFresh("2026-11-10T14:44:00.000Z",now),false);
 assert.equal(isQuoteFresh(null,now),false);
 assert.equal(isQuoteFresh("2026-11-10T15:03:00.000Z",now),false);
});


function jsonResponse(payload, status = 200) {
 return new Response(JSON.stringify(payload), { status, headers: { "Content-Type": "application/json" } });
}
function yahooQuotePayload(timestampSeconds, price = 210, previousClose = 200) {
 return {
  chart: {
   result: [{
    meta: { chartPreviousClose: previousClose },
    timestamp: [timestampSeconds],
    indicators: { quote: [{ close: [price] }] }
   }]
  }
 };
}

test("FMP quote uses the documented apikey query parameter and never sends a custom key header", async () => {
 const now = Date.parse("2026-11-10T15:00:00.000Z");
 const calls = [];
 const quote = await getFmpQuote("AAPL", "test-only-fmp-key", async (input, init) => {
  calls.push({ url: String(input), headers: new Headers(init.headers) });
  return jsonResponse([{
   symbol: "AAPL",
   price: 210,
   previousClose: 200,
   changePercentage: null,
   timestamp: Math.floor((now - 60_000) / 1000)
  }]);
 }, now);
 assert.equal(calls.length, 1);
 const url = new URL(calls[0].url);
 assert.equal(url.origin, "https://financialmodelingprep.com");
 assert.equal(url.pathname, "/stable/quote");
 assert.equal(url.searchParams.get("symbol"), "AAPL");
 assert.equal(url.searchParams.get("apikey"), "test-only-fmp-key");
 assert.equal(calls[0].headers.get("apikey"), null);
 assert.equal(quote.source, "Financial Modeling Prep");
 assert.ok(Math.abs(quote.changePct - 5) < 1e-9);
 assert.equal(quote.price, 210);
});

test("FMP stale quotes fall back to a fresh Yahoo quote without exposing the key", async () => {
 const now = Date.parse("2026-11-10T15:00:00.000Z");
 const calls = [];
 const quote = await getQuote("AAPL", { FMP_API_KEY: "test-only-fmp-key" }, async (input) => {
  const url = new URL(String(input));
  calls.push(url.hostname);
  if (url.hostname === "financialmodelingprep.com") {
   return jsonResponse([{
    symbol: "AAPL",
    price: 210,
    previousClose: 200,
    changePercentage: 5,
    timestamp: Math.floor((now - 16 * 60_000) / 1000)
   }]);
  }
  return jsonResponse(yahooQuotePayload(Math.floor((now - 60_000) / 1000)));
 }, now);
 assert.deepEqual(calls, ["financialmodelingprep.com", "query1.finance.yahoo.com"]);
 assert.equal(quote.source, "Yahoo Finance chart API");
 assert.match(quote.fallbackReason, /stale/i);
 assert.equal(quote.fallbackReason.includes("test-only-fmp-key"), false);
});

test("missing FMP key uses Yahoo only and never attempts an FMP request", async () => {
 const now = Date.parse("2026-11-10T15:00:00.000Z");
 const calls = [];
 const quote = await getQuote("AAPL", {}, async (input) => {
  const url = new URL(String(input));
  calls.push(url.hostname);
  return jsonResponse(yahooQuotePayload(Math.floor((now - 60_000) / 1000)));
 }, now);
 assert.deepEqual(calls, ["query1.finance.yahoo.com"]);
 assert.equal(quote.source, "Yahoo Finance chart API");
});

test("FMP and Yahoo failures both fail closed instead of returning an unverified quote", async () => {
 const now = Date.parse("2026-11-10T15:00:00.000Z");
 await assert.rejects(
  getQuote("AAPL", { FMP_API_KEY: "test-only-fmp-key" }, async (input) => {
   const host = new URL(String(input)).hostname;
   return new Response("", { status: host === "financialmodelingprep.com" ? 401 : 503 });
  }, now),
  /FMP failed .*Yahoo fallback failed/
 );
});

test("FMP quote rejects a missing provider timestamp", async () => {
 const now = Date.parse("2026-11-10T15:00:00.000Z");
 await assert.rejects(
  getFmpQuote("AAPL", "test-only-fmp-key", async () => jsonResponse([{
   symbol: "AAPL", price: 210, previousClose: 200, changePercentage: 5, timestamp: null
  }]), now),
  /timestamp missing, stale, or unexpectedly in the future/
 );
});
