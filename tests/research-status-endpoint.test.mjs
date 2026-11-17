import test from "node:test";
import assert from "node:assert/strict";
import {onRequestGet} from "../web/functions/api/research/status.js";

function dbWith(rows){
 return {prepare(sql){assert.match(sql,/SELECT symbol,status,result_json,created_at FROM research_council_runs/);return {bind(limit){assert.ok(limit>=1&&limit<=10);return {all:async()=>({results:rows})};}};}};
}
test("research status is read-only and returns all nine roles without exposing reports or portfolio data",async()=>{
 const payload={status:"RESEARCH_REVIEW_REQUIRED",agents:[
  {role:"market_scanner",status:"COMPLETE"},{role:"technical_analyst",status:"COMPLETE"},
  {role:"fundamental_analyst",status:"BLOCKED",failureCode:"unknown_evidence_id"},{role:"news_analyst",status:"COMPLETE"},
  {role:"sentiment_analyst",status:"BLOCKED"},{role:"bull_researcher",status:"NOT_RUN"},
  {role:"bear_researcher",status:"NOT_RUN"},{role:"portfolio_analyst",status:"NOT_RUN"},
  {role:"risk_committee",status:"NOT_RUN"}],
  reports:[{role:"market_scanner",report:{findings:["private detail"]}}],
  portfolio:{equityUsd:98765},evidence:[{url:"private"}]};
 const response=await onRequestGet({request:new Request("https://northstar.test/api/research/status?limit=3"),env:{NORTHSTAR_DB:dbWith([{symbol:"NVDA",status:"RESEARCH_REVIEW_REQUIRED",result_json:JSON.stringify(payload),created_at:"2026-11-11T10:00:00Z"}])}});
 const body=await response.json();
 assert.equal(response.status,200);assert.equal(body.ok,true);assert.equal(body.agentCount,9);
 assert.equal(body.latestRun.agents.length,9);assert.equal(body.latestRun.runId,"NVDA|2026-11-11T10:00:00Z");assert.equal(body.latestRun.runState,"RESEARCH_REVIEW_REQUIRED");assert.equal(body.latestRun.updatedAt,null);assert.equal(body.latestRun.agents[2].status,"BLOCKED");assert.equal(body.latestRun.agents[2].failureCode,"unknown_evidence_id");
 assert.equal(body.latestRun.agents[4].status,"BLOCKED");
 assert.equal(body.latestRun.agents[8].status,"NOT_RUN");
 assert.equal(JSON.stringify(body).includes("private detail"),false);
 assert.equal(JSON.stringify(body).includes("98765"),false);
 assert.equal(JSON.stringify(body).includes("reports"),false);
 assert.equal(Object.hasOwn(body.latestRun.agents[2],"evidence"),false);
});
test("empty research ledger is represented honestly without invented agent activity",async()=>{
 const response=await onRequestGet({request:new Request("https://northstar.test/api/research/status"),env:{NORTHSTAR_DB:dbWith([])}});
 const body=await response.json();assert.equal(response.status,200);assert.equal(body.latestRun,null);assert.deepEqual(body.runs,[]);
});
test("research status fails safely when the ledger is unavailable",async()=>{
 const response=await onRequestGet({request:new Request("https://northstar.test/api/research/status"),env:{}});
 assert.equal(response.status,503);assert.equal((await response.json()).ok,false);
});
test("requested history length is capped at ten",async()=>{
 let captured=0;
 const db={prepare(){return {bind(limit){captured=limit;return {all:async()=>({results:[]})};}};}};
 await onRequestGet({request:new Request("https://northstar.test/api/research/status?limit=1000"),env:{NORTHSTAR_DB:db}});
 assert.equal(captured,10);
});

test("status exposes persisted collection state without calling unexecuted agents complete",async()=>{
 const payload={status:"NO_TRADE",traceDurable:true,vetoReasons:["Research collection is in progress."],agents:Array.from({length:9},(_,i)=>({role:["market_scanner","technical_analyst","fundamental_analyst","news_analyst","sentiment_analyst","bull_researcher","bear_researcher","portfolio_analyst","risk_committee"][i],status:"NOT_RUN",reason:"Research launch started; awaiting provider collection."}))};
 const response=await onRequestGet({request:new Request("https://northstar.test/api/research/status"),env:{NORTHSTAR_DB:dbWith([{symbol:"AAPL",status:"NO_TRADE",result_json:JSON.stringify(payload),created_at:"2026-11-17T12:00:00.000Z"}])}});
 const run=(await response.json()).latestRun;assert.equal(run.runState,"RUNNING");assert.equal(run.agents.every(a=>a.status==="NOT_RUN"),true);
});
test("collection failure is represented as failed rather than simulated agent activity",async()=>{
 const payload={status:"NO_TRADE",traceDurable:true,vetoReasons:["Research collection failed before agents could run: quote unavailable."],agents:[{role:"market_scanner",status:"NOT_RUN",reason:"Collection stopped."}]};
 const response=await onRequestGet({request:new Request("https://northstar.test/api/research/status"),env:{NORTHSTAR_DB:dbWith([{symbol:"AAPL",status:"NO_TRADE",result_json:JSON.stringify(payload),created_at:"2026-11-17T12:00:00.000Z"}])}});
 const run=(await response.json()).latestRun;assert.equal(run.runState,"FAILED");assert.equal(run.agents[0].status,"NOT_RUN");
});