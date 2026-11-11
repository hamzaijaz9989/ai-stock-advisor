import test from "node:test";
import assert from "node:assert/strict";
import { isUsMarketOpen, isQuoteFresh, parseWatchZone, getFmpQuote, getFinnhubQuote, getQuote, classifyQuoteFailure, FMP_FREE_SYMBOLS, getFmpScanBatch, getMonitorCandidates, getNonFmpShortlistBatch, reserveFmpRequest } from "../monitor/worker.js";

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

function fakeFmpBudgetDb() {
 return {
  prepare(sql) {
   return {
    run: async () => ({ success: true }),
    bind: (...args) => ({ first: async () => ({ requests: 1 }) })
   };
  }
 };
}

test("FMP Free universe exactly matches the canonical 87-symbol account whitelist in order",()=>{
 const expected = ["AAPL","TSLA","AMZN","MSFT","NVDA","GOOGL","META","NFLX","JPM","V","BAC","PYPL","DIS","T","PFE","COST","INTC","KO","TGT","NKE","SPY","BA","BABA","XOM","WMT","GE","CSCO","VZ","JNJ","CVX","PLTR","SQ","SHOP","SBUX","SOFI","HOOD","RBLX","SNAP","AMD","UBER","FDX","ABBV","ETSY","MRNA","LMT","GM","F","LCID","CCL","DAL","UAL","AAL","TSM","SONY","ET","MRO","COIN","RIVN","RIOT","CPRX","VWO","SPYG","NOK","ROKU","VIAC","ATVI","BIDU","DOCU","ZM","PINS","TLRY","WBA","MGM","NIO","C","GS","WFC","ADBE","PEP","UNH","CARR","HCA","TWTR","BILI","SIRI","FUBO","RKT"];
 assert.equal(FMP_FREE_SYMBOLS.length,87);
 assert.equal(new Set(FMP_FREE_SYMBOLS).size,87);
 assert.deepEqual(FMP_FREE_SYMBOLS,expected);
 const batch=getFmpScanBatch(new Date("2026-11-10T15:00:00.000Z"));
 assert.equal(batch.length,2);
 assert.ok(batch.every(symbol=>expected.includes(symbol)));
 assert.notDeepEqual(batch,getFmpScanBatch(new Date("2026-11-10T15:05:00.000Z")));
});

test("monitor scans additional shortlist symbols outside the FMP allowlist",()=>{
 const shortlist=[{ticker:"XYZ",entryStatus:"watch"},{ticker:"ABCD",entryStatus:"watch"},{ticker:"AAPL",entryStatus:"supported"},{ticker:"BAD TICKER",entryStatus:"invalid"}];
 const candidates=getMonitorCandidates(shortlist,new Date("2026-11-10T15:00:00.000Z"));
 assert.equal(candidates.length,4);
 assert.deepEqual(candidates.slice(2).map(stock=>stock.ticker),["XYZ","ABCD"]);
 assert.ok(candidates.slice(0,2).every(stock=>FMP_FREE_SYMBOLS.includes(stock.ticker)));
 assert.equal(candidates.some(stock=>stock.ticker==="BAD TICKER"),false);
});

test("non-FMP shortlist rotation reaches symbols beyond the first ten",()=>{
 const shortlist=Array.from({length:23},(_,i)=>({ticker:"X"+String(i).padStart(2,"0"),entryStatus:"watch"}));
 const first=getNonFmpShortlistBatch(shortlist,new Date("2026-11-10T15:00:00.000Z"));
 const second=getNonFmpShortlistBatch(shortlist,new Date("2026-11-10T15:05:00.000Z"));
 assert.equal(first.length,10);
 assert.equal(second.length,10);
 assert.notDeepEqual(first.map(x=>x.ticker),second.map(x=>x.ticker));
 const covered=new Set([...first,...second].map(x=>x.ticker));
 assert.ok(covered.size>10);
 assert.ok([...covered].every(ticker=>shortlist.some(stock=>stock.ticker===ticker)));
});

test("FMP rotation covers all 87 allowed symbols within 44 five-minute runs",()=>{
 const start=Date.parse("2026-11-10T15:00:00.000Z");
 const covered=new Set();
 for(let run=0;run<44;run++) {
  for(const symbol of getFmpScanBatch(new Date(start+run*5*60*1000))) covered.add(symbol);
 }
 assert.equal(covered.size,87);
 assert.ok(FMP_FREE_SYMBOLS.every(symbol=>covered.has(symbol)));
});

test("atomic FMP budget reservation allows 200 attempts and rejects attempt 201",async()=>{
 let requests=0;
 const db={
  prepare(sql) {
   assert.match(sql,/ON CONFLICT\(day\) DO UPDATE SET requests=requests\+1 WHERE requests < \?/);
   return {
    bind(day,limit) {
     assert.equal(day,"2026-11-11");
     assert.equal(limit,200);
     return {first:async()=>{
      if(requests>=limit) return null;
      requests+=1;
      return {requests};
     }};
    }
   };
  }
 };
 for(let attempt=1;attempt<=200;attempt++) {
  assert.equal(await reserveFmpRequest(db,new Date("2026-11-11T12:00:00.000Z")),attempt);
 }
 await assert.rejects(
  reserveFmpRequest(db,new Date("2026-11-11T12:00:00.000Z")),
  /FMP daily request budget exhausted/
 );
 assert.equal(requests,200);
});

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

test("Finnhub quote uses the token header and validates the provider timestamp", async () => {
 const now = Date.parse("2026-11-10T15:00:00.000Z");
 const calls = [];
 const quote = await getFinnhubQuote("AAPL", "test-only-finnhub-key", async (input, init) => {
  calls.push({ url: String(input), headers: new Headers(init.headers) });
  return jsonResponse({ c: 210, pc: 200, dp: 5, t: Math.floor((now - 60_000) / 1000) });
 }, now);
 const url = new URL(calls[0].url);
 assert.equal(url.origin, "https://finnhub.io");
 assert.equal(url.pathname, "/api/v1/quote");
 assert.equal(url.searchParams.get("symbol"), "AAPL");
 assert.equal(url.searchParams.has("token"), false);
 assert.equal(calls[0].headers.get("X-Finnhub-Token"), "test-only-finnhub-key");
 assert.equal(quote.source, "Finnhub");
 assert.equal(quote.price, 210);
 assert.equal(quote.changePct, 5);
});

test("symbols outside the FMP Free allowlist skip FMP and use Finnhub", async () => {
 const now = Date.parse("2026-11-10T15:00:00.000Z");
 const calls = [];
 const quote = await getQuote("XYZ", { FMP_API_KEY: "test-only-fmp-key", FINNHUB_API_KEY: "test-only-finnhub-key" }, async (input, init) => {
  calls.push({ host: new URL(String(input)).hostname, headers: new Headers(init.headers) });
  return jsonResponse({ c: 42, pc: 40, dp: 5, t: Math.floor((now - 60_000) / 1000) });
 }, now);
 assert.deepEqual(calls.map(call=>call.host), ["finnhub.io"]);
 assert.equal(calls[0].headers.get("X-Finnhub-Token"), "test-only-finnhub-key");
 assert.equal(quote.source, "Finnhub");
 assert.match(quote.fallbackReason, /outside the Free-plan allowlist/);
});

test("FMP failure falls back to Finnhub before Yahoo", async () => {
 const now = Date.parse("2026-11-10T15:00:00.000Z");
 const calls = [];
 const quote = await getQuote("AAPL", {
  FMP_API_KEY: "test-only-fmp-key", FINNHUB_API_KEY: "test-only-finnhub-key", NORTHSTAR_DB: fakeFmpBudgetDb()
 }, async (input) => {
  const url = new URL(String(input)); calls.push(url.hostname);
  if (url.hostname === "financialmodelingprep.com") return new Response("", { status: 401 });
  return jsonResponse({ c: 210, pc: 200, dp: 5, t: Math.floor((now - 60_000) / 1000) });
 }, now);
 assert.deepEqual(calls, ["financialmodelingprep.com", "finnhub.io"]);
 assert.equal(quote.source, "Finnhub");
 assert.match(quote.fallbackReason, /FMP failed/);
});

test("FMP stale quotes fall back to a fresh Yahoo quote without exposing the key", async () => {
 const now = Date.parse("2026-11-10T15:00:00.000Z");
 const calls = [];
 const quote = await getQuote("AAPL", { FMP_API_KEY: "test-only-fmp-key", NORTHSTAR_DB: fakeFmpBudgetDb() }, async (input) => {
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
  getQuote("AAPL", { FMP_API_KEY: "test-only-fmp-key", NORTHSTAR_DB: fakeFmpBudgetDb() }, async (input) => {
   const host = new URL(String(input)).hostname;
   return new Response("", { status: host === "financialmodelingprep.com" ? 401 : 503 });
  }, now),
  /FMP failed .*Yahoo fallback failed/
 );
});

test("quote failure diagnostics retain provider and status classes without raw error details",()=>{
 const classified=classifyQuoteFailure(new Error("FMP failed (FMP quote HTTP 401); Yahoo fallback failed (Yahoo quote HTTP 429)"));
 assert.equal(classified,"fmp_http_401+yahoo_http_429");
 assert.equal(classifyQuoteFailure("FMP failed (FMP quote HTTP 401); Finnhub failed (Finnhub quote HTTP 429); Yahoo fallback failed (Yahoo quote HTTP 503)"),"fmp_http_401+finnhub_http_429+yahoo_http_503");
 assert.equal(classified.includes("test-only-fmp-key"),false);
 assert.equal(classifyQuoteFailure("FMP quote timestamp missing, stale, or unexpectedly in the future"),"fmp_stale_quote");
 assert.equal(classifyQuoteFailure("Yahoo quote request timed out"),"yahoo_timeout");
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
