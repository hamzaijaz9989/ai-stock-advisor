import test from "node:test";
import assert from "node:assert/strict";
import {runAgentPipeline} from "../web/lib/agent-pipeline.js";

const now="2026-11-08T15:00:00.000Z";
const candidate=()=>({
  now,symbol:"NVDA",sector:"Technology",
  quote:{price:180,bid:179.9,ask:180.1,timestamp:now,source:"Alpaca IEX"},
  liquidity:{avgDollarVolumeUsd:25000000},
  thesis:"Revenue growth, operating leverage and product demand support further research, subject to valuation and execution risks.",
  evidence:[
    {type:"SEC_FILING",publisherId:"sec.gov",url:"https://www.sec.gov/Archives/edgar/data/1/filing.htm",publishedAt:"2026-11-07T12:00:00Z",summary:"The company disclosed quarterly revenue, operating performance and risk factors in its latest filing."},
    {type:"NEWS_REPORT",publisherId:"reuters.com",url:"https://www.reuters.com/markets/example",publishedAt:"2026-11-07T13:00:00Z",summary:"Independent reporting discusses demand trends, competitive pressures and the company outlook."}
  ],
  risks:["Valuation multiple remains elevated.","Semiconductor demand is cyclical."],
  stopPrice:175,account:{equityUsd:1000},
  limits:{riskFraction:0.005,maxPositionFraction:0.25,estimatedRoundTripCostBps:20},
  portfolio:{openRiskUsd:0,grossExposureUsd:0,dailyLossFraction:0,drawdownFraction:0,sectorExposureUsd:0,concurrentPositions:0}
});

test("valid sourced candidate returns review-only decision and cost-aware size",()=>{
 const r=runAgentPipeline(candidate());
 assert.equal(r.status,"PAPER_REVIEW_REQUIRED");
 assert.equal(r.decision,"WATCHLIST_CANDIDATE");
 assert.equal(r.execution,false);
 assert.equal(r.automatedOrderSubmission,false);
 assert.ok(r.sizing.estimatedRoundTripCostsUsd>0);
 assert.ok(r.sizing.riskIncludingEstimatedCostsUsd<=r.sizing.riskBudgetUsd);
});
test("rejects quote without source or with stale timestamp",()=>{
 const c=candidate(); c.quote.source="";
 assert.equal(runAgentPipeline(c).reason,"INVALID_OR_UNSOURCED_QUOTE");
 const stale=candidate(); stale.quote.timestamp="2026-11-08T14:58:00Z";
 assert.equal(runAgentPipeline(stale).reason,"STALE_OR_FUTURE_QUOTE");
});
test("rejects evidence without URL, type, or canonical publisher identity",()=>{
 const c=candidate(); delete c.evidence[0].url;
 assert.equal(runAgentPipeline(c).reason,"INSUFFICIENT_VERIFIABLE_INDEPENDENT_EVIDENCE");
 const missingType=candidate(); delete missingType.evidence[0].type;
 assert.equal(runAgentPipeline(missingType).reason,"INSUFFICIENT_VERIFIABLE_INDEPENDENT_EVIDENCE");
});
test("rejects missing transaction-cost assumption and portfolio risk inputs",()=>{
 const c=candidate(); delete c.limits.estimatedRoundTripCostBps;
 assert.equal(runAgentPipeline(c).reason,"INVALID_OR_MISSING_TRANSACTION_COST_ASSUMPTION");
 const p=candidate(); delete p.portfolio.drawdownFraction;
 assert.equal(runAgentPipeline(p).reason,"MISSING_OR_BREACHED_PORTFOLIO_RISK_INPUTS");
});
test("rejects candidates when aggregate risk or daily loss gates are breached",()=>{
 const aggregate=candidate(); aggregate.portfolio.openRiskUsd=20;
 assert.equal(runAgentPipeline(aggregate).reason,"MISSING_OR_BREACHED_PORTFOLIO_RISK_INPUTS");
 const daily=candidate(); daily.portfolio.dailyLossFraction=0.02;
 assert.equal(runAgentPipeline(daily).reason,"MISSING_OR_BREACHED_PORTFOLIO_RISK_INPUTS");
});
