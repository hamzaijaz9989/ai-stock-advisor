import assert from "node:assert/strict";
import test from "node:test";
import {onRequestGet} from "../web/functions/api/fmp-earnings.js";

test("FMP earnings adapter fetches a bounded window and filters by ticker",async()=>{
 const original=globalThis.fetch;let requested;
 globalThis.fetch=async input=>{
  requested=new URL(String(input));
  return Response.json([
   {symbol:"AAPL",date:"2025-01-30",epsActual:2.4,lastUpdated:"2025-01-31"},
   {symbol:"MSFT",date:"2025-01-31",epsActual:3.1,lastUpdated:"2025-02-01"}
  ]);
 };
 try{
  const response=await onRequestGet({request:new Request("https://northstar.test/api/fmp-earnings?from=2025-01-01&to=2025-03-01&ticker=AAPL"),env:{FMP_API_KEY:"test"}});
  assert.equal(response.status,200);const body=await response.json();
  assert.equal(body.events.length,1);assert.equal(body.events[0].symbol,"AAPL");
  assert.equal(requested.searchParams.get("from"),"2025-01-01");
  assert.equal(requested.searchParams.get("to"),"2025-03-01");
  assert.equal(requested.searchParams.get("includeReportTimes"),"true");
  assert.equal(body.coverage.providerLimit,4000);
  assert.match(body.pointInTimeWarning,/first publicly known/);
 }finally{globalThis.fetch=original;}
});

test("FMP earnings adapter rejects windows longer than 90 days",async()=>{
 const response=await onRequestGet({request:new Request("https://northstar.test/api/fmp-earnings?from=2025-01-01&to=2025-05-01"),env:{FMP_API_KEY:"test"}});
 assert.equal(response.status,400);
});

test("FMP earnings adapter rejects impossible dates",async()=>{
 const response=await onRequestGet({request:new Request("https://northstar.test/api/fmp-earnings?from=2025-02-30&to=2025-03-01"),env:{FMP_API_KEY:"test"}});
 assert.equal(response.status,400);
});
