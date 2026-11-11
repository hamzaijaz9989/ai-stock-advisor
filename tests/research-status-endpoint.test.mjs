import test from "node:test";
import assert from "node:assert/strict";
import {onRequestGet} from "../web/functions/api/research/status.js";

function dbWith(rows){
 return {prepare(sql){assert.match(sql,/SELECT symbol,status,result_json,created_at FROM research_council_runs/);return {bind(limit){assert.ok(limit>=1&&limit<=10);return {all:async()=>({results:rows})};}};}};
}
test("research status is read-only and returns all nine roles without exposing reports or portfolio data",async()=>{
 const payload={status:"RESEARCH_REVIEW_REQUIRED",agents:[
  {role:"market_scanner",status:"COMPLETE"},{role:"technical_analyst",status:"COMPLETE"},
  {role:"fundamental_analyst",status:"UNAVAILABLE"},{role:"news_analyst",status:"COMPLETE"},
  {role:"sentiment_analyst",status:"BLOCKED"},{role:"bull_researcher",status:"NOT_RUN"},
  {role:"bear_researcher",status:"NOT_RUN"},{role:"portfolio_analyst",status:"NOT_RUN"},
  {role:"risk_committee",status:"NOT_RUN"}],
  reports:[{role:"market_scanner",report:{findings:["private detail"]}}],
  portfolio:{equityUsd:98765},evidence:[{url:"private"}]};
 const response=await onRequestGet({request:new Request("https://northstar.test/api/research/status?limit=3"),env:{NORTHSTAR_DB:dbWith([{symbol:"NVDA",status:"RESEARCH_REVIEW_REQUIRED",result_json:JSON.stringify(payload),created_at:"2026-11-11T10:00:00Z"}])}});
 const body=await response.json();
 assert.equal(response.status,200);assert.equal(body.ok,true);assert.equal(body.agentCount,9);
 assert.equal(body.latestRun.agents.length,9);assert.equal(body.latestRun.agents[2].status,"UNAVAILABLE");
 assert.equal(body.latestRun.agents[4].status,"BLOCKED");
 assert.equal(body.latestRun.agents[8].status,"NOT_RUN");
 assert.equal(JSON.stringify(body).includes("private detail"),false);
 assert.equal(JSON.stringify(body).includes("98765"),false);
 assert.equal(JSON.stringify(body).includes("reports"),false);
 assert.equal(JSON.stringify(body).includes("evidence"),false);
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
