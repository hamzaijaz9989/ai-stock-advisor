import assert from "node:assert/strict";
import test from "node:test";
import {onRequestGet} from "../web/functions/api/massive-news.js";

const request=new Request("https://northstar.test/api/massive-news?ticker=NVDA");
async function withFetch(fetcher,run){const old=globalThis.fetch;globalThis.fetch=fetcher;try{return await run();}finally{globalThis.fetch=old;}}

test("Massive news normalizes article metadata and provider sentiment insights",async()=>{
 await withFetch(async input=>{
  const url=new URL(String(input));
  assert.equal(url.hostname,"api.massive.com");
  assert.equal(url.pathname,"/v2/reference/news");
  assert.equal(url.searchParams.get("ticker"),"NVDA");
  assert.equal(url.searchParams.get("order"),"desc");
  assert.equal(url.searchParams.get("apiKey"),"massive-test-key");
  return Response.json({results:[
   {id:"a1",title:"NVIDIA reports results",description:"Company results",article_url:"https://example.com/a1",published_utc:"2026-11-16T15:00:00Z",publisher:{name:"Example News"},tickers:["NVDA"],insights:[{ticker:"NVDA",sentiment:"positive",sentiment_reasoning:"Positive evidence."}]},
   {id:"a2",title:"NVIDIA faces risk",article_url:"https://example.com/a2",published_utc:"2026-11-16T16:00:00Z",publisher:{name:"Other News"},tickers:["NVDA"],insights:[{ticker:"NVDA",sentiment:"negative",sentiment_reasoning:"Negative evidence."}]},
   {id:"a3",title:"Another ticker",article_url:"https://example.com/a3",published_utc:"2026-11-16T17:00:00Z",publisher:{name:"Other News"},tickers:["AAPL"],insights:[{ticker:"AAPL",sentiment:"positive"}]}
  ]});
 },async()=>{
  const response=await onRequestGet({request,env:{MASSIVE_API_KEY:"massive-test-key"}});
  const body=await response.json();
  assert.equal(response.status,200);assert.equal(body.available,true);
  assert.equal(body.items.length,2);
  assert.equal(body.items[0].source,"Example News");
  assert.equal(body.items[0].publishedAt,"2026-11-16T15:00:00Z");
  assert.equal(body.sentimentObservations.length,1);
  assert.equal(body.sentimentObservations[0].sampleCount,2);
  assert.equal(body.sentimentObservations[0].score,0);
  assert.equal(body.sentimentObservations[0].source,"Massive ticker-news insights");
  assert.equal(JSON.stringify(body).includes("massive-test-key"),false);
 });
});

test("Massive news rejects missing credentials and preserves provider errors",async()=>{
 const missing=await onRequestGet({request,env:{}});
 assert.equal(missing.status,503);assert.equal((await missing.json()).configured,false);
 await withFetch(async()=>new Response("forbidden",{status:403}),async()=>{
  const response=await onRequestGet({request,env:{MASSIVE_API_KEY:"bad"}});
  const body=await response.json();
  assert.equal(response.status,403);assert.equal(body.upstreamStatus,403);
  assert.equal(body.items.length,0);
 });
});

test("Massive news does not invent sentiment when article insights are missing",async()=>{
 await withFetch(async()=>Response.json({results:[
  {title:"No insight article",article_url:"https://example.com/no-insight",published_utc:"2026-11-16T15:00:00Z",tickers:["NVDA"]}
 ]}),async()=>{
  const response=await onRequestGet({request,env:{MASSIVE_API_KEY:"test"}});
  const body=await response.json();
  assert.equal(body.items.length,1);assert.equal(body.sentimentObservations.length,0);
 });
});
