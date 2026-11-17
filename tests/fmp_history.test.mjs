import assert from "node:assert/strict";
import test from "node:test";
import { onRequestGet } from "../web/functions/api/fmp-history.js";

test("FMP historical ingestion returns dated prices, annual and quarterly statements, and news provenance",async()=>{
 const original=globalThis.fetch;const urls=[];
 globalThis.fetch=async input=>{
  const u=new URL(String(input));urls.push(u);
  const p=u.pathname.split("/").pop();
  if(p==="full")return Response.json(Array.from({length:60},(_,i)=>{const date=new Date(Date.UTC(2025,0,2+i)).toISOString().slice(0,10);return {date,open:10+i/10,high:11+i/10,low:9+i/10,close:10.5+i/10,adjClose:10.4+i/10,volume:100+i};}));
  if(p==="income-statement")return Response.json([{date:"2025-12-31",filingDate:"2026-02-01",acceptedDate:"2026-02-01 06:00:00",period:u.searchParams.get("period"),revenue:100,reportedCurrency:"USD"}]);
  if(p==="balance-sheet-statement")return Response.json([{date:"2025-12-31",filingDate:"2026-02-01",acceptedDate:"2026-02-01 06:00:00",period:u.searchParams.get("period"),totalAssets:200}]);
  if(p==="cash-flow-statement")return Response.json([{date:"2025-12-31",filingDate:"2026-02-01",acceptedDate:"2026-02-01 06:00:00",period:u.searchParams.get("period"),operatingCashFlow:20}]);
  if(p==="stock")return Response.json([{symbol:"MSFT",publishedDate:"2025-03-01 12:00:00",title:"News",url:"https://example.com/news"}]);
  throw new Error("Unexpected FMP path "+p);
 };
 try{
  const request=new Request("https://northstar.test/api/fmp-history?ticker=MSFT&from=2025-01-01&to=2026-12-31");
  const response=await onRequestGet({request,env:{FMP_API_KEY:"test"}});
  assert.equal(response.status,200);const body=await response.json();
  assert.equal(body.provider,"Financial Modeling Prep");assert.equal(body.coverage.priceBars,60);
  assert.equal(body.statements.annualIncome[0].acceptedDate,"2026-02-01 06:00:00");
  assert.equal(body.statements.quarterIncome[0].period,"quarter");
  assert.equal(body.news[0].publishedDate,"2025-03-01 12:00:00");
  assert.equal(urls.length,8);assert.ok(urls.some(u=>u.pathname.endsWith("/historical-price-eod/full")));
 }finally{globalThis.fetch=original;}
});

test("FMP historical ingestion rejects windows beyond ten years",async()=>{
 const request=new Request("https://northstar.test/api/fmp-history?ticker=MSFT&from=2000-01-01&to=2026-01-01");
 const response=await onRequestGet({request,env:{FMP_API_KEY:"test"}});
 assert.equal(response.status,400);
});
