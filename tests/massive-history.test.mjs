import assert from "node:assert/strict";
import test from "node:test";
import {onRequestGet} from "../web/functions/api/massive-history.js";

const request=new Request("https://northstar.test/api/massive-history?ticker=NVDA&from=2025-01-01&to=2025-03-01");
async function withFetch(fetcher,run){const old=globalThis.fetch;globalThis.fetch=fetcher;try{return await run();}finally{globalThis.fetch=old;}}
const rows=Array.from({length:60},(_,i)=>({t:Date.UTC(2025,0,1+i),o:100+i,h:102+i,l:99+i,c:101+i,v:10000+i}));

test("Massive history requests adjusted daily aggregates and normalizes validated OHLCV",async()=>{
 await withFetch(async input=>{
  const url=new URL(String(input));
  assert.equal(url.hostname,"api.massive.com");
  assert.match(url.pathname,/\/v2\/aggs\/ticker\/NVDA\/range\/1\/day\//);
  assert.equal(url.searchParams.get("adjusted"),"true");
  assert.equal(url.searchParams.get("sort"),"asc");
  assert.equal(url.searchParams.get("apiKey"),"massive-test-key");
  return Response.json({status:"OK",results:rows});
 },async()=>{
  const response=await onRequestGet({request,env:{MASSIVE_API_KEY:"massive-test-key"}});
  const body=await response.json();
  assert.equal(response.status,200);assert.equal(body.available,true);
  assert.equal(body.provider,"Massive");assert.equal(body.coverage.priceBars,60);
  assert.equal(body.prices[0].date,"2025-01-01");
  assert.equal(body.prices[0].close,101);
  assert.equal(body.prices[0].adjClose,101);
  assert.equal(JSON.stringify(body).includes("massive-test-key"),false);
 });
});

test("Massive history rejects missing credentials and windows beyond the Basic two-year limit",async()=>{
 const missing=await onRequestGet({request,env:{}});
 assert.equal(missing.status,503);assert.equal((await missing.json()).configured,false);
 const wide=new Request("https://northstar.test/api/massive-history?ticker=NVDA&from=2020-01-01&to=2025-01-01");
 const tooWide=await onRequestGet({request:wide,env:{MASSIVE_API_KEY:"test"}});
 assert.equal(tooWide.status,400);
});

test("Massive history discards malformed bars and reports insufficient coverage",async()=>{
 await withFetch(async()=>Response.json({status:"OK",results:[
  {t:Date.UTC(2025,0,1),o:10,h:12,l:9,c:11,v:100},
  {t:Date.UTC(2025,0,2),o:10,h:9,l:11,c:10,v:100}
 ]}),async()=>{
  const response=await onRequestGet({request:new Request("https://northstar.test/api/massive-history?ticker=NVDA&from=2025-01-01&to=2025-03-01"),env:{MASSIVE_API_KEY:"test"}});
  const body=await response.json();
  assert.equal(response.status,200);assert.equal(body.available,false);
  assert.equal(body.prices.length,1);assert.equal(body.coverage.priceBars,1);
 });
});

test("Massive authentication errors are preserved for quick provider fallback",async()=>{
 await withFetch(async()=>new Response("unauthorized",{status:401}),async()=>{
  const response=await onRequestGet({request,env:{MASSIVE_API_KEY:"bad"}});
  const body=await response.json();
  assert.equal(response.status,401);assert.equal(body.upstreamStatus,401);
 });
});
