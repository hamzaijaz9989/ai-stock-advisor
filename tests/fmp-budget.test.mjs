import test from "node:test";
import assert from "node:assert/strict";
import {FMP_LIMITS,reserveFmpBudget,requestFmpJson} from "../web/lib/fmp-budget.js";
import {createFmpBudgetTestDb} from "./helpers/fmp-budget-db.mjs";

test("shared rolling 24-hour FMP budget is concurrency-safe and enforces service and global caps",async()=>{
 const db=createFmpBudgetTestDb(),now=Date.parse("2026-11-12T12:00:00Z");
 const page=await Promise.allSettled(Array.from({length:45},()=>reserveFmpBudget(db,{service:"pages",now,verifiedDailyLimit:250})));
 assert.equal(page.filter(x=>x.status==="fulfilled").length,FMP_LIMITS.maximumPages);
 const monitor=await Promise.allSettled(Array.from({length:165},()=>reserveFmpBudget(db,{service:"monitor",now,verifiedDailyLimit:250})));
 assert.equal(monitor.filter(x=>x.status==="fulfilled").length,FMP_LIMITS.maximumMonitor);
 assert.equal(db.events.reduce((n,x)=>n+x.cost,0),FMP_LIMITS.maximumRolling24h);
 assert.ok([...page,...monitor].filter(x=>x.status==="rejected").every(x=>x.reason.code==="FMP_DAILY_BUDGET_EXHAUSTED"));
});

test("rolling budget expires old usage only after a full 24 hours",async()=>{
 const db=createFmpBudgetTestDb(),t=Date.parse("2026-11-12T12:00:00Z");
 await reserveFmpBudget(db,{service:"pages",cost:40,now:t,verifiedDailyLimit:250});
 await assert.rejects(reserveFmpBudget(db,{service:"pages",now:t+24*60*60*1000-1,verifiedDailyLimit:250}),e=>e.code==="FMP_DAILY_BUDGET_EXHAUSTED");
 await reserveFmpBudget(db,{service:"pages",now:t+24*60*60*1000+1,verifiedDailyLimit:250});
 assert.equal(db.events.length,2);
});

test("FMP responses are persistently cached and cache hits consume no API budget",async()=>{
 const db=createFmpBudgetTestDb();let calls=0;
 const fetchImpl=async url=>{calls++;assert.equal(new URL(url).searchParams.get("apikey"),"never-log-this");return Response.json([{date:"2026-11-11",close:12}]);};
 const args={db,service:"pages",verifiedDailyLimit:250,path:"historical-price-eod/full?symbol=AAPL",apiKey:"never-log-this",fetchImpl,now:Date.now(),cacheTtlMs:60_000};
 assert.deepEqual(await requestFmpJson(args),[{date:"2026-11-11",close:12}]);
 assert.deepEqual(await requestFmpJson(args),[{date:"2026-11-11",close:12}]);
 assert.equal(calls,1);assert.equal(db.events.reduce((n,x)=>n+x.cost,0),1);
 assert.equal([...db.cache.keys()][0].includes("never-log-this"),false);
});

test("failed FMP calls remain charged and are never automatically retried",async()=>{
 const db=createFmpBudgetTestDb();let calls=0;
 await assert.rejects(requestFmpJson({db,service:"pages",verifiedDailyLimit:250,path:"quote?symbol=AAPL",apiKey:"test",fetchImpl:async()=>{calls++;return new Response("restricted",{status:403});},cacheTtlMs:0}),e=>e.code==="FMP_PROVIDER_HTTP_403");
 assert.equal(calls,1);assert.equal(db.events.reduce((n,x)=>n+x.cost,0),1);
});

test("concurrent identical cache misses share one upstream call and one reservation",async()=>{
 const db=createFmpBudgetTestDb();let calls=0;
 const fetchImpl=async()=>{calls++;await new Promise(resolve=>setTimeout(resolve,25));return Response.json([{symbol:"AAPL"}]);};
 const args={db,service:"pages",verifiedDailyLimit:250,path:"quote?symbol=AAPL",apiKey:"test",fetchImpl,cacheTtlMs:60_000};
 const [a,b]=await Promise.all([requestFmpJson(args),requestFmpJson(args)]);
 assert.deepEqual(a,b);assert.equal(calls,1);assert.equal(db.events.reduce((n,x)=>n+x.cost,0),1);
});

test("missing shared D1 never falls back to a direct provider call",async()=>{
 let calls=0;
 await assert.rejects(requestFmpJson({db:null,service:"pages",verifiedDailyLimit:250,path:"quote?symbol=AAPL",apiKey:"test",fetchImpl:async()=>{calls++;return Response.json([]);}}),e=>e.code==="FMP_BUDGET_UNAVAILABLE");
 assert.equal(calls,0);
});

test("multi-endpoint fan-out reserves its full uncached cost before making any call",async()=>{
 const db=createFmpBudgetTestDb(),now=Date.parse("2026-11-12T12:00:00Z");let calls=0;
 await reserveFmpBudget(db,{service:"pages",cost:FMP_LIMITS.maximumPages-1,now,verifiedDailyLimit:250});
 const {requestFmpJsonBatch}=await import("../web/lib/fmp-budget.js");
 await assert.rejects(requestFmpJsonBatch({db,service:"pages",apiKey:"test",now,
  verifiedDailyLimit:250,requests:[{path:"income-statement?symbol=AAPL"},{path:"ratios?symbol=AAPL"}],
  fetchImpl:async()=>{calls++;return Response.json([]);}
 }),e=>e.code==="FMP_DAILY_BUDGET_EXHAUSTED");
 assert.equal(calls,0);
 assert.equal(db.events.reduce((n,x)=>n+x.cost,0),FMP_LIMITS.maximumPages-1);
});
