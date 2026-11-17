import assert from "node:assert/strict";
import test from "node:test";
import {onRequestGet} from "../web/functions/api/finnhub-sentiment.js";

const request=new Request("https://northstar.test/api/finnhub-sentiment?ticker=NVDA");
async function withFetch(fetcher,run){
 const original=globalThis.fetch;globalThis.fetch=fetcher;
 try{return await run();}finally{globalThis.fetch=original;}
}

test("Finnhub news sentiment returns a normalized, timestamped rolling-week observation",async()=>{
 await withFetch(async input=>{
  const url=new URL(String(input));
  assert.equal(url.hostname,"finnhub.io");
  assert.equal(url.pathname,"/api/v1/news-sentiment");
  assert.equal(url.searchParams.get("symbol"),"NVDA");
  assert.equal(url.searchParams.get("token"),"secret-test");
  return Response.json({symbol:"NVDA",buzz:{articlesInLastWeek:20},sentiment:{bullishPercent:62,bearishPercent:28},companyNewsScore:0.74});
 },async()=>{
  const response=await onRequestGet({request,env:{FINNHUB_API_KEY:"secret-test"}});
  const body=await response.json(),observation=body.observations[0];
  assert.equal(response.status,200);assert.equal(body.available,true);
  assert.equal(observation.sampleCount,20);assert.equal(observation.score,0.34);
  assert.equal(observation.timestampStatus,"PRESENT");
  assert.equal(observation.window,"rolling_7d_news_aggregate");
  assert.equal(observation.companyNewsScore,0.74);
  assert.equal(JSON.stringify(body).includes("secret-test"),false);
 });
});

test("Finnhub news sentiment rejects empty or malformed samples",async()=>{
 await withFetch(async()=>Response.json({symbol:"NVDA",buzz:{articlesInLastWeek:0},sentiment:{bullishPercent:60,bearishPercent:20}}),async()=>{
  const response=await onRequestGet({request,env:{FINNHUB_API_KEY:"secret-test"}});
  const body=await response.json();
  assert.equal(response.status,200);assert.equal(body.available,false);assert.equal(body.observations.length,0);
 });
});

test("Finnhub authorization failures remain visible without exposing the key",async()=>{
 await withFetch(async()=>new Response("Forbidden",{status:403}),async()=>{
  const response=await onRequestGet({request,env:{FINNHUB_API_KEY:"secret-test"}});
  const body=await response.json();
  assert.equal(response.status,502);assert.equal(body.available,false);
  assert.equal(body.upstreamStatus,403);
  assert.equal(JSON.stringify(body).includes("secret-test"),false);
 });
});

test("Finnhub sentiment reports a missing key without attempting a provider request",async()=>{
 await withFetch(async()=>{throw new Error("must not fetch");},async()=>{
  const response=await onRequestGet({request,env:{}});
  const body=await response.json();
  assert.equal(response.status,503);assert.equal(body.configured,false);
 });
});
