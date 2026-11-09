import test from "node:test";
import assert from "node:assert/strict";
import {evaluateResearchCouncilRun} from "../web/lib/research-council-evaluation.js";

const run={
 version:"1.0.4",requestId:"evaluation-test-001",status:"NO_TRADE",
 resourceCoverage:{roles:{technical_analyst:{status:"PARTIAL"},sentiment_analyst:{status:"MISSING"}}},
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
 assert.equal(score.roles.sentiment_analyst,undefined);
 assert.equal(score.debate.sharedCitedEvidenceCount,1);
 assert.deepEqual(score.debate.sharedEvidenceIds,["e1"]);
 assert.equal(score.totals.costUsd,null);
});

test("scorecard includes trusted telemetry only when explicitly supplied",()=>{
 const score=evaluateResearchCouncilRun(run,{factIds:["f1"],evidenceIds:["e1"],roles:{
  bull_researcher:{latencyMs:1200,inputTokens:300,outputTokens:80,totalTokens:380,costUsd:0.002,provider:"gemini",model:"flash"},
  bear_researcher:{latencyMs:1500,inputTokens:350,outputTokens:90,costUsd:0.003,provider:"openai",model:"gpt"}
 }});
 assert.equal(score.roles.bull_researcher.latencyMs,1200);
 assert.equal(score.roles.bull_researcher.provider,"gemini");
 assert.equal(score.roles.bull_researcher.totalTokens,380);
 assert.equal(score.totals.latencyMs,null);
 assert.equal(score.totals.costUsd,null);
});

test("scorecard does not invent denominators or performance metrics",()=>{
 const score=evaluateResearchCouncilRun({reports:[],status:"NO_TRADE"});
 assert.equal(score.totals.claimCitationCoverage,null);
 assert.equal(score.totals.citationPrecision,null);
 assert.equal(score.totals.latencyMs,0);
 assert.equal(score.totals.costUsd,0);
 assert.ok(score.limitations.some(x=>x.includes("factual truth")));
});

test("scorecard rejects malformed run input",()=>{
 assert.throws(()=>evaluateResearchCouncilRun(null),/result with reports/);
});
