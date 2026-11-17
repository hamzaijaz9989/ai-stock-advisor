import assert from "node:assert/strict";
import test from "node:test";
import {onRequestGet} from "../web/functions/api/massive-market-summary.js";

const request=new Request("https://northstar.test/api/massive-market-summary?date=2026-11-16");
async function withFetch(fetcher,run){const old=globalThis.fetch;globalThis.fetch=fetcher;try{return await run();}finally{globalThis.fetch=old;}}

test("Massive grouped daily market summary retrieves the whole US market in one call",async()=>{
 await withFetch(async input=>{
  const url=new URL(String(input));
  assert.equal(url.hostname,"api.massive.com");
  assert.equal(url.pathname,"/v2/aggs/grouped/locale/us/market/stocks/2026-11-16");
  assert.equal(url.searchParams.get("adjusted"),"true");
  assert.equal(url.searchParams.get("apiKey"),"massive-test-key");
  return Response.json({results:[
   {T:"NVDA",o:150,h:160,l:149,c:158,v:100000,vw:155,n:1000},
   {T:"AAPL",o:200,h:205,l:199,c:203,v:200000,vw:202,n:2000},
   {T:"BAD",o:20,h:10,l:21,c:20,v:100}
  ]});
 },async()=>{
  const response=await onRequestGet({request,env:{MASSIVE_API_KEY:"massive-test-key"}});
  const body=await response.json();
  assert.equal(response.status,200);assert.equal(body.available,true);
  assert.equal(body.count,2);assert.equal(body.stocks[0].ticker,"NVDA");
  assert.equal(body.stocks[0].close,158);
  assert.equal(body.dataRecency,"end_of_day");
  assert.equal(JSON.stringify(body).includes("massive-test-key"),false);
 });
});

test("Massive daily summary requires configured key and valid ISO date",async()=>{
 const missing=await onRequestGet({request,env:{}});
 assert.equal(missing.status,503);
 const bad=new Request("https://northstar.test/api/massive-market-summary?date=2026-02-31");
 const invalid=await onRequestGet({request:bad,env:{MASSIVE_API_KEY:"test"}});
 assert.equal(invalid.status,400);
});
