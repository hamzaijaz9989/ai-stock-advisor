import test from "node:test";
import assert from "node:assert/strict";
import {buildResearchCouncilContext} from "../web/lib/research-council-facts.js";
import {runResearchCouncil,COUNCIL_ROLES} from "../web/lib/research-council.js";

const asOf="2026-11-09T12:00:00.000Z";
const portfolio={verified:true,source:"test-reconciled-paper-ledger",asOf:"2026-11-09T11:59:00.000Z",
 equityUsd:1000,openRiskUsd:0,grossExposureUsd:0,dailyLossFraction:0,weeklyLossFraction:0,
 drawdownFraction:0,sectorExposureUsd:0,concurrentPositions:0};

function makeContext(overrides={}) {
 const data={ticker:"NVDA",asOf,portfolio,
  quote:{ticker:"NVDA",price:180,quoteTime:"2026-11-09T11:59:30.000Z",source:"test-quote"},
  history:{source:"test-history",fetchedAt:asOf,data:Array.from({length:65},(_,i)=>({date:"2026-09-"+String((i%28)+1).padStart(2,"0"),open:10,high:12,low:9,close:11,volume:100}))},
  secObservations:[{key:"Revenue",value:100,unit:"USD",filed:"2026-10-01",end:"2026-09-30",accession:"abc"}],
  fmpFundamentals:{available:true,provider:"FMP",retrievedAt:asOf,latest:{fiscalDate:"2026-09-30",revenue:100}},
  news:{items:[{title:"Company update",url:"https://example.com/news",publishedAt:"2026-11-09T10:00:00Z",source:"discovery"}]},
  earnings:{events:[],found:false,provider:"test-earnings",fetchedAt:asOf}};
 return buildResearchCouncilContext({...data,...overrides});
}

test("resource coverage exposes role-specific gaps without inventing unavailable feeds",()=>{
 const context=makeContext();
 assert.equal(context.resourceCoverage.roles.technical_analyst.status,"PARTIAL");
 assert.equal(context.resourceCoverage.roles.fundamental_analyst.status,"PARTIAL");
 assert.equal(context.resourceCoverage.roles.sentiment_analyst.status,"MISSING");
 assert.equal(context.resourceCoverage.roles.portfolio_analyst.status,"PARTIAL");
 assert.ok(context.resourceCoverage.roles.sentiment_analyst.gaps.some(x=>x.includes("No dedicated")));
 assert.ok(context.resourceCoverage.roles.fundamental_analyst.gaps.some(x=>x.includes("public-availability")));
 assert.ok(context.resourceCoverage.roles.technical_analyst.gaps.some(x=>x.includes("corporate-action")));
});

test("resource coverage marks absent quote, history, fundamentals and news as insufficient",()=>{
 const context=makeContext({quote:null,history:null,secObservations:[],fmpFundamentals:{available:false},news:{items:[]}});
 assert.equal(context.resourceCoverage.roles.market_scanner.status,"INSUFFICIENT");
 assert.equal(context.resourceCoverage.roles.technical_analyst.status,"INSUFFICIENT");
 assert.equal(context.resourceCoverage.roles.fundamental_analyst.status,"INSUFFICIENT");
 assert.equal(context.resourceCoverage.roles.news_analyst.status,"INSUFFICIENT");
});

test("all specialist stages receive the same immutable resource coverage inventory",async()=>{
 const context=makeContext();
 const report=()=>({status:"COMPLETE",findings:[{claim:"Evidence-linked test observation.",factIds:[context.facts[0].id]}],risks:[]});
 const workers={};
 for(const role of [...COUNCIL_ROLES.independent,...COUNCIL_ROLES.debate,"portfolio_analyst"]){
  workers[role]=async payload=>{
   assert.deepEqual(payload.resourceCoverage,context.resourceCoverage);
   assert.equal(Object.isFrozen(payload.resourceCoverage),true);
   return report();
  };
 }
 workers.risk_committee=async()=>({status:"COMPLETE",findings:[],risks:[],decision:"ACCEPT_FOR_REVIEW",vetoReasons:[]});
 const result=await runResearchCouncil({requestId:"resource-test-0001",context,workers});
 assert.equal(result.status,"RESEARCH_REVIEW_REQUIRED");
 assert.deepEqual(result.resourceCoverage,context.resourceCoverage);
});
