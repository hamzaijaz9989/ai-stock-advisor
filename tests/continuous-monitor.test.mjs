import test from "node:test";
import assert from "node:assert/strict";
import { isUsMarketOpen, isQuoteFresh, parseWatchZone } from "../monitor/worker.js";

test("parses provisional entry watch zones and rejects malformed ranges",()=>{
 assert.deepEqual(parseWatchZone("NOT ENTRY-READY — Model entry watch zone: $34.01–$36.28; base-case reference"),{low:34.01,high:36.28});
 assert.deepEqual(parseWatchZone("Model entry watch zone: $1,234.50-$1,300.00"),{low:1234.5,high:1300});
 assert.equal(parseWatchZone("No verified entry zone"),null);
 assert.equal(parseWatchZone("Model entry watch zone: $0–$10"),null);
 assert.equal(parseWatchZone("Model entry watch zone: $20–$10"),null);
});
test("market-hours gate uses New York time and excludes weekends",()=>{
 assert.equal(isUsMarketOpen(new Date("2026-11-10T15:00:00Z")),true);
 assert.equal(isUsMarketOpen(new Date("2026-11-10T21:00:00Z")),false);
 assert.equal(isUsMarketOpen(new Date("2026-11-14T15:00:00Z")),false);
 assert.equal(isUsMarketOpen(new Date("2026-11-10T14:29:00Z")),false);
});

test("quote freshness gate rejects missing, stale, and future timestamps",()=>{
 const now=Date.parse("2026-11-10T15:00:00.000Z");
 assert.equal(isQuoteFresh("2026-11-10T14:50:00.000Z",now),true);
 assert.equal(isQuoteFresh("2026-11-10T14:44:00.000Z",now),false);
 assert.equal(isQuoteFresh(null,now),false);
 assert.equal(isQuoteFresh("2026-11-10T15:03:00.000Z",now),false);
});
