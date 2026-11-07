import test from "node:test";
import assert from "node:assert/strict";
import {runAgentPipeline} from "../web/lib/agent-pipeline.js";

const now="2026-11-08T12:00:00.000Z";
const good=()=>({
 symbol:"AAPL",now,
 quote:{price:200,bid:199.8,ask:200.2,timestamp:now,source:"IEX"},
 liquidity:{avgDollarVolumeUsd:100_000_000},
 thesis:"Revenue growth and improving margins support a constructive medium-term setup.",
 evidence:[
  {source:"SEC filing",publishedAt:"2026-11-07T12:00:00Z",summary:"Latest filing reports improving operating margin and cash generation."},
  {source:"Company earnings",publishedAt:"2026-11-07T13:00:00Z",summary:"Management raised its outlook and discussed demand resilience."}
 ],
 risks:["Valuation remains elevated","Broad market volatility may invalidate the setup"],
 stopPrice:198,account:{equityUsd:1000},limits:{riskFraction:.005,maxPositionFraction:.25}
});

test("valid candidate passes evidence gates but never submits an order",()=>{
 const r=runAgentPipeline(good());
 assert.equal(r.status,"PAPER_REVIEW_REQUIRED");
 assert.equal(r.decision,"WATCHLIST_CANDIDATE");
 assert.equal(r.execution,false);
 assert.equal(r.automatedOrderSubmission,false);
 assert.ok(r.sizing.shares>0);
 assert.ok(r.events.some(e=>e.agent==="PAPER_EXECUTOR"&&e.status==="DISABLED"));
});
test("stale quote is rejected before research or sizing",()=>{
 const c=good(); c.quote.timestamp="2026-11-08T11:58:00Z";
 const r=runAgentPipeline(c);
 assert.equal(r.failedStage,"SCANNER");
 assert.equal(r.reason,"STALE_OR_FUTURE_QUOTE");
 assert.equal(r.sizing,null);
});
test("one source or weak thesis cannot pass research",()=>{
 const c=good(); c.evidence=c.evidence.slice(0,1);
 const r=runAgentPipeline(c);
 assert.equal(r.failedStage,"RESEARCH");
 assert.equal(r.reason,"INSUFFICIENT_INDEPENDENT_RECENT_EVIDENCE");
});
test("wide spread and illiquid names are rejected",()=>{
 const a=good(); a.quote.ask=203;
 assert.equal(runAgentPipeline(a).reason,"SPREAD_TOO_WIDE");
 const b=good(); b.liquidity.avgDollarVolumeUsd=1000;
 assert.equal(runAgentPipeline(b).reason,"INSUFFICIENT_OR_UNKNOWN_DOLLAR_LIQUIDITY");
});
test("risk policy rejects invalid stop and no-share sizing",()=>{
 const a=good(); a.stopPrice=201;
 assert.equal(runAgentPipeline(a).reason,"INVALID_STOP_OR_RISK_POLICY");
 const b=good(); b.account.equityUsd=10;
 assert.equal(runAgentPipeline(b).reason,"NO_WHOLE_SHARE_FITS_RISK_LIMITS");
});
test("future evidence and missing explicit risks fail closed",()=>{
 const a=good(); a.evidence[0].publishedAt="2026-11-09T00:00:00Z";
 assert.equal(runAgentPipeline(a).reason,"INSUFFICIENT_INDEPENDENT_RECENT_EVIDENCE");
 const b=good(); b.risks=[];
 assert.equal(runAgentPipeline(b).reason,"NO_EXPLICIT_RISK_ASSESSMENT");
});
