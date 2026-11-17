import assert from "node:assert/strict";
import test from "node:test";
import { onRequestGet } from "../web/functions/api/fmp-history.js";

test("FMP historical ingestion returns dated prices, annual and quarterly statements, and news provenance",async()=>{
 const original=globalThis.fetch;const urls=[];
 globalThis.fetch=async input=>{
  const u=new URL(String(input));urls.push(u);
  if(u.hostname==="query1.finance.yahoo.com"){
    const timestamps=Array.from({length:60},(_,i)=>Math.floor(Date.UTC(2025,0,1+i)/1000));
    const values=Array.from({length:60},(_,i)=>100+i);
    return Response.json({chart:{result:[{timestamp:timestamps,indicators:{quote:[{open:values,high:values.map(x=>x+1),low:values.map(x=>x-1),close:values,volume:values.map(()=>1000)}],adjclose:[{adjclose:values}]}}],error:null}});
  }
  const p=u.pathname.split("/").pop();
  if(p==="full")return Response.json([{date:"2025-01-02",open:10,high:11,low:9,close:10.5,adjClose:10.4,volume:100},{date:"2026-01-02",open:12,high:13,low:11,close:12.5,adjClose:12.4,volume:120}]);
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
  assert.equal(body.provider,"Yahoo Finance chart API");assert.equal(body.coverage.priceBars,60);
  assert.equal(body.statements.annualIncome[0].acceptedDate,"2026-02-01 06:00:00");
  assert.equal(body.statements.quarterIncome[0].period,"quarter");
  assert.equal(body.news[0].publishedDate,"2025-03-01 12:00:00");
  assert.equal(urls.length,9);assert.ok(urls.some(u=>u.pathname.endsWith("/historical-price-eod/full")));
 }finally{globalThis.fetch=original;}
});

test("FMP historical ingestion rejects windows beyond ten years",async()=>{
 const request=new Request("https://northstar.test/api/fmp-history?ticker=MSFT&from=2000-01-01&to=2026-01-01");
 const response=await onRequestGet({request,env:{FMP_API_KEY:"test"}});
 assert.equal(response.status,400);
});
