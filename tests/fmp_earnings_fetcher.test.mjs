import assert from "node:assert/strict";
import test from "node:test";
import {buildEarningsWindows,fetchEarningsHistory} from "../scripts/fetch_fmp_earnings.mjs";

test("earnings windows are consecutive, non-overlapping, and no longer than 90 calendar days",()=>{
 const windows=buildEarningsWindows("2025-01-01","2025-07-01");
 assert.equal(windows[0].from,"2025-01-01");
 assert.equal(windows.at(-1).to,"2025-07-01");
 for(let i=0;i<windows.length;i++){
  assert.ok((Date.parse(windows[i].to)-Date.parse(windows[i].from))/86400000<=89);
  if(i)assert.equal(Date.parse(windows[i].from),Date.parse(windows[i-1].to)+86400000);
 }
});

test("earnings history fetcher authenticates, chunks, and merges events",async()=>{
 const calls=[];
 const result=await fetchEarningsHistory({
  from:"2025-01-01",to:"2025-07-01",baseUrl:"https://northstar.example",operatorToken:"operator",
  fetchImpl:async(input,init)=>{
   const url=new URL(String(input));calls.push({url,init});
   return Response.json({available:true,retrievedAt:"2026-11-09T00:00:00.000Z",coverage:{providerRecords:2,providerLimit:4000},events:[
    {symbol:"AAPL",date:url.searchParams.get("from"),epsActual:1,lastUpdated:"2025-01-02"}
   ]});
  }
 });
 assert.equal(calls.length,3);
 assert.ok(calls.every(x=>x.init.headers.Authorization==="Bearer operator"));
 assert.equal(result.metadata.windows.length,3);
 assert.equal(result.events.length,3);
 assert.equal(result.metadata.recordCount,3);
});

test("earnings history fetcher rejects a possibly truncated provider page",async()=>{
 await assert.rejects(()=>fetchEarningsHistory({
  from:"2025-01-01",to:"2025-01-10",baseUrl:"https://northstar.example",operatorToken:"operator",
  fetchImpl:async()=>Response.json({available:true,coverage:{providerRecords:4000,providerLimit:4000},events:[]})
 }),/provider record cap/);
});

test("earnings history fetcher rejects invalid dates and missing operator credentials",()=>{
 assert.throws(()=>buildEarningsWindows("2025-02-30","2025-03-01"),/valid ISO/);
 assert.throws(()=>buildEarningsWindows("2025-03-01","2025-02-01"),/valid ISO/);
});
