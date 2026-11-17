import assert from "node:assert/strict";
import test from "node:test";
import {onRequestGet} from "../web/functions/api/finnhub-sentiment.js";
const request=new Request("https://northstar.test/api/finnhub-sentiment?ticker=NVDA");
async function withFetch(fetcher,run){const original=globalThis.fetch;globalThis.fetch=fetcher;try{return await run();}finally{globalThis.fetch=original;}}
const now=Math.floor(Date.now()/1000);
const rows=[
 {headline:"NVDA launches new product",url:"https://news.example/a",datetime:now-3600,source:"Example News",summary:"Company update"},
 {headline:"Duplicate",url:"https://news.example/a",datetime:now-1800,source:"Example News"},
 {headline:"Old article",url:"https://news.example/old",datetime:now-9*86400,source:"Example News"},
 {headline:"Undated",url:"https://news.example/no-date",source:"Example News"},
 {headline:"No URL",datetime:now-500,source:"Example News"}
];
test("Finnhub retrieves timestamped company news through company-news and rejects stale/duplicate rows",async()=>withFetch(async input=>{const u=new URL(String(input));assert.equal(u.pathname,"/api/v1/company-news");assert.equal(u.searchParams.get("symbol"),"NVDA");assert.ok(u.searchParams.get("from"));assert.ok(u.searchParams.get("to"));return Response.json(rows);},async()=>{const r=await onRequestGet({request,env:{FINNHUB_API_KEY:"test-token"}}),b=await r.json();assert.equal(r.status,200);assert.equal(b.available,true);assert.equal(b.articles.length,1);assert.equal(b.articles[0].headline,rows[0].headline);assert.equal(b.articles[0].providerReportedSentiment,false);assert.equal(JSON.stringify(b).includes("test-token"),false);}));
test("Finnhub 403 is an entitlement blocker with one request and no paid endpoint retry",async()=>{let calls=0;await withFetch(async input=>{calls++;assert.equal(new URL(String(input)).pathname,"/api/v1/company-news");return new Response("Forbidden",{status:403});},async()=>{const r=await onRequestGet({request,env:{FINNHUB_API_KEY:"test-token"}}),b=await r.json();assert.equal(calls,1);assert.equal(b.available,false);assert.equal(b.upstreamStatus,403);assert.match(b.warning,/access is unavailable/);assert.equal(JSON.stringify(b).includes("test-token"),false);});});
test("Finnhub reports missing news and missing credentials without fabricating observations",async()=>{await withFetch(async()=>Response.json([]),async()=>{const r=await onRequestGet({request,env:{FINNHUB_API_KEY:"test-token"}});assert.equal((await r.json()).available,false);});await withFetch(async()=>{throw Error("must not fetch");},async()=>{const r=await onRequestGet({request,env:{}});assert.equal(r.status,503);assert.equal((await r.json()).configured,false);});});
