import test from "node:test";
import assert from "node:assert/strict";
import {evaluateResearchCouncilRun} from "../web/lib/research-council-evaluation.js";

const run={
 version:"1.0.4",requestId:"evaluation-test-001",status:"NO_TRADE",
 resourceCoverage:{roles:{technical_analyst:{status:"PARTIAL"},sentiment_analyst:{status:"MISSING"}}},
 agents:[{role:"bull_researcher",status:"COMPLETE"},{role:"bear_researcher",status:"COMPLETE"},{role:"technical_analyst",status:"COMPLETE"},{role:"sentiment_analyst",status:"UNAVAILABLE"}],
 reports:[
  {role:"bull_researcher",report:{findings:[{claim:"Upside evidence.",factIds:["f1","e1"]}],risks:[]}},
  {role:"bear_researcher",report:{findings:[],risks:[{claim:"Downside evidence.",factIds:["e1","bad-id"]}]}},
  {role:"technical_analyst",status:"COMPLETE",report:{findings:[{claim:"Technical observation.",factIds:["f1"]}],risks:[]}}
 ]
};

test("scorecard measures reference integrity and reports role coverage",()=>{
 const score=evaluateResearchCouncilRun(run,{factIds:["f1"],evidenceIds:["e1"]});
 assert.equal(score.evaluationScope,"REPORT_CONTRACT_AND_DECLARED_TELEMETRY_ONLY");
 assert.equal(score.totals.claims,3);
 assert.equal(score.totals.validReferences,4);
 assert.equal(score.totals.totalReferences,5);
 assert.equal(score.totals.invalidReferenceClaims,1);
 assert.equal(score.roles.technical_analyst.resourceStatus,"PARTIAL");
 assert.equal(score.roles.technical_analyst.status,"COMPLETE");
 assert.equal(score.roles.bull_researcher.status,"COMPLETE");
 assert.equal(score.roles.sentiment_analyst.status,"UNAVAILABLE");
 assert.equal(score.roles.sentiment_analyst.resourceStatus,"MISSING");
 assert.equal(score.totals.roleCount,9);
 assert.equal(score.totals.roleReports,3);
 assert.equal(score.debate.sharedCitedEvidenceCount,1);
 assert.deepEqual(score.debate.sharedEvidenceIds,["e1"]);
 assert.equal(score.totals.costUsd,null);
});

test("scorecard includes trusted telemetry only when explicitly supplied",()=>{
 const score=evaluateResearchCouncilRun(run,{factIds:["f1"],evidenceIds:["e1"],roles:{
  bull_researcher:{latencyMs:1200,inputTokens:300,outputTokens:80,totalTokens:380,costUsd:0.002,provider:"gemini",model:"flash"},
  bear_researcher:{latencyMs:1500,inputTokens:350,outputTokens:90,costUsd:0.003,provider:"openai",model:"gpt",failed:true}
 }});
 assert.equal(score.roles.bull_researcher.latencyMs,1200);
 assert.equal(score.roles.bull_researcher.provider,"gemini");
 assert.equal(score.roles.bull_researcher.totalTokens,380);
 assert.equal(score.roles.bear_researcher.failed,true);
 assert.equal(score.totals.latencyMs,null);
 assert.equal(score.totals.costUsd,null);
});

test("scorecard does not invent denominators or performance metrics",()=>{
 const score=evaluateResearchCouncilRun({reports:[],status:"NO_TRADE"});
 assert.equal(score.totals.claimCitationCoverage,null);
 assert.equal(score.totals.citationPrecision,null);
 assert.equal(score.totals.latencyMs,null);
 assert.equal(score.totals.totalTokens,null);
 assert.equal(score.totals.costUsd,null);
 assert.ok(score.limitations.some(x=>x.includes("factual truth")));
});

test("scorecard rejects malformed run input",()=>{
 assert.throws(()=>evaluateResearchCouncilRun(null),/result with reports/);
});

test("scorecard retains failed specialist telemetry even when no report exists",()=>{
 const partial={...run,agents:[...run.agents]};
 const score=evaluateResearchCouncilRun(partial,{roles:{
  sentiment_analyst:{latencyMs:321,provider:"gemini",model:"flash",failed:true}
 }});
 assert.equal(score.roles.sentiment_analyst.reportPresent,false);
 assert.equal(score.roles.sentiment_analyst.status,"UNAVAILABLE");
 assert.equal(score.roles.sentiment_analyst.latencyMs,321);
 assert.equal(score.roles.sentiment_analyst.failed,true);
 assert.equal(score.totals.telemetryRoles,1);
 assert.equal(score.totals.failedInvocations,1);
});

test("token aggregates include only model-assisted roles while all nine roles retain latency telemetry",()=>{
 const roles=[
  "market_scanner","technical_analyst","fundamental_analyst","news_analyst","sentiment_analyst",
  "bull_researcher","bear_researcher","portfolio_analyst","risk_committee"
 ];
 const deterministic=new Set([
  "market_scanner","technical_analyst","fundamental_analyst","news_analyst","sentiment_analyst","risk_committee"
 ]);
 const roleTelemetry=Object.fromEntries(roles.map((role,index)=>[
  role,{
   latencyMs:index+1,
   provider:deterministic.has(role)?"deterministic":"gemini",
   model:deterministic.has(role)?"northstar-"+role+"-v1":"gemini-test",
   // Deliberately inject impossible token/cost values for deterministic roles:
   // the scorecard must never count or display them as model usage.
   inputTokens:deterministic.has(role)?900:100,
   outputTokens:deterministic.has(role)?900:50,
   totalTokens:deterministic.has(role)?1800:150,
   costUsd:deterministic.has(role)?99:0.01
  }
 ]));
 const score=evaluateResearchCouncilRun({reports:[],status:"NO_TRADE"},{roles:roleTelemetry});
 assert.equal(score.totals.roleCount,9);
 assert.equal(score.totals.telemetryRoles,9);
 assert.equal(score.totals.latencyMs,45);
 assert.equal(score.totals.inputTokens,300);
 assert.equal(score.totals.outputTokens,150);
 assert.equal(score.totals.totalTokens,450);
 assert.equal(score.totals.costUsd,0.03);
 for(const role of deterministic){
  assert.equal(score.roles[role].provider,"deterministic");
  assert.equal(score.roles[role].latencyMs>0,true);
  assert.equal(score.roles[role].inputTokens,null);
  assert.equal(score.roles[role].outputTokens,null);
  assert.equal(score.roles[role].totalTokens,null);
  assert.equal(score.roles[role].costUsd,null);
 }
 assert.equal(score.roles.portfolio_analyst.totalTokens,150);
});
