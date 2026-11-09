import test from "node:test";
import assert from "node:assert/strict";
import {runResearchCouncil,COUNCIL_ROLES,COUNCIL_ROLE_ORDER} from "../web/lib/research-council.js";
const context={ticker:"TEST",asOf:"2026-11-08T15:00:00Z",facts:[{id:"price-1",value:100},{id:"sma-1",value:98}],evidence:[{id:"sec-1",type:"SEC_FILING",url:"https://www.sec.gov/Archives/example"}],portfolio:{equity:10000,openRisk:0,dailyLoss:0,weeklyLoss:0,drawdown:0,sectorExposure:0}};
const report=()=>({status:"COMPLETE",findings:[{claim:"Verified observation based on supplied data.",factIds:["price-1"]}],risks:[{claim:"Potential downside risk requires independent review.",factIds:["sma-1"]}]});
function workers(){const w={};for(const role of [...COUNCIL_ROLES.independent,...COUNCIL_ROLES.debate,"portfolio_analyst"])w[role]=async()=>report();w.risk_committee=async()=>({...report(),decision:"ACCEPT_FOR_REVIEW",vetoReasons:[]});return w;}
test("runs independent specialists, bull/bear debate, synthesis and risk veto",async()=>{const r=await runResearchCouncil({requestId:"request-0001",context,workers:workers()});assert.equal(r.status,"RESEARCH_REVIEW_REQUIRED");assert.equal(r.agents.length,9);assert.equal(r.execution,false);assert.equal(r.automatedOrderSubmission,false);assert.equal(r.traceDurable,false);});
test("missing specialist defaults to NO_TRADE and prevents downstream stages",async()=>{const w=workers();delete w.news_analyst;const r=await runResearchCouncil({requestId:"request-0002",context,workers:w});assert.equal(r.status,"NO_TRADE");assert.ok(r.vetoReasons.some(x=>x.includes("news_analyst")));assert.equal(r.agents.some(x=>x.role==="risk_committee"&&x.status==="BLOCKED"),true);});
test("always returns all nine roles in canonical order when an upstream specialist is unavailable",async()=>{
 const w=workers();delete w.news_analyst;
 const r=await runResearchCouncil({requestId:"request-nine-0001",context,workers:w});
 assert.deepEqual(r.agents.map(x=>x.role),COUNCIL_ROLE_ORDER);
 assert.equal(r.agents.length,9);
 assert.equal(r.agents.find(x=>x.role==="news_analyst").status,"UNAVAILABLE");
 for(const role of ["bull_researcher","bear_researcher","portfolio_analyst","risk_committee"]){
  const item=r.agents.find(x=>x.role===role);
  assert.equal(item.status,"BLOCKED");
  assert.match(item.reason,/not run/i);
 }
});
test("marks synthesis and risk committee blocked when either debate specialist fails",async()=>{
 const w=workers();delete w.bear_researcher;
 const r=await runResearchCouncil({requestId:"request-nine-0002",context,workers:w});
 assert.deepEqual(r.agents.map(x=>x.role),COUNCIL_ROLE_ORDER);
 assert.equal(r.agents.find(x=>x.role==="bull_researcher").status,"COMPLETE");
 assert.equal(r.agents.find(x=>x.role==="bear_researcher").status,"UNAVAILABLE");
 assert.equal(r.agents.find(x=>x.role==="portfolio_analyst").status,"BLOCKED");
 assert.equal(r.agents.find(x=>x.role==="risk_committee").status,"BLOCKED");
});
test("unverifiable agent claims are blocked",async()=>{const w=workers();w.technical_analyst=async()=>({status:"COMPLETE",findings:[{claim:"Unsubstantiated claim from the agent.",factIds:["made-up"]}],risks:[]});const r=await runResearchCouncil({requestId:"request-0003",context,workers:w});assert.equal(r.status,"NO_TRADE");assert.ok(r.agents.some(x=>x.role==="technical_analyst"&&x.status==="BLOCKED"));});
test("risk committee has final veto even when all analysts agree",async()=>{const w=workers();w.risk_committee=async()=>({...report(),decision:"REJECT",vetoReasons:["Portfolio concentration exceeds policy."]});const r=await runResearchCouncil({requestId:"request-0004",context,workers:w});assert.equal(r.status,"NO_TRADE");assert.ok(r.vetoReasons.some(x=>x.includes("Portfolio concentration")));});
test("rejects missing stable IDs and missing portfolio state",async()=>{await assert.rejects(()=>runResearchCouncil({requestId:"short",context,workers:workers()}),/requestId/);await assert.rejects(()=>runResearchCouncil({requestId:"request-0005",context:{facts:[],evidence:[]},workers:workers()}),/portfolio/);});
test("agents receive immutable copies of the context",async()=>{const w=workers();w.market_scanner=async input=>{assert.equal(Object.isFrozen(input.facts),true);return report();};const r=await runResearchCouncil({requestId:"request-0006",context,workers:w});assert.equal(r.status,"RESEARCH_REVIEW_REQUIRED");});

test("rejects a risk committee that omits explicit veto reasons",async()=>{const w=workers();w.risk_committee=async()=>({...report(),decision:"ACCEPT_FOR_REVIEW"});const r=await runResearchCouncil({requestId:"request-0007",context,workers:w});assert.equal(r.status,"NO_TRADE");assert.ok(r.vetoReasons.some(x=>x.includes("risk_committee")));});
test("rejects ACCEPT_FOR_REVIEW when veto reasons are present",async()=>{const w=workers();w.risk_committee=async()=>({...report(),decision:"ACCEPT_FOR_REVIEW",vetoReasons:["Unresolved concentration risk."]});const r=await runResearchCouncil({requestId:"request-0008",context,workers:w});assert.equal(r.status,"NO_TRADE");});
test("rejects UNAVAILABLE reports containing hidden risk claims",async()=>{const w=workers();w.news_analyst=async()=>({status:"UNAVAILABLE",findings:[],risks:[{claim:"Hidden unsupported risk claim.",factIds:["price-1"]}]});const r=await runResearchCouncil({requestId:"request-0009",context,workers:w});assert.equal(r.status,"NO_TRADE");assert.ok(r.agents.some(x=>x.role==="news_analyst"&&x.status==="BLOCKED"));});
test("rejects duplicate IDs across facts and evidence",async()=>{const duplicate={...context,evidence:[{id:"price-1",type:"SEC_FILING"}]};await assert.rejects(()=>runResearchCouncil({requestId:"request-0010",context:duplicate,workers:workers()}),/unique/);});
test("rejects an ordinary analyst attempting to set the risk decision",async()=>{const w=workers();w.bull_researcher=async()=>({...report(),decision:"ACCEPT_FOR_REVIEW",vetoReasons:[]});const r=await runResearchCouncil({requestId:"request-0011",context,workers:w});assert.equal(r.status,"NO_TRADE");});
test("rejects oversized fact/evidence context before invoking workers",async()=>{const oversized={...context,facts:Array.from({length:501},(_,i)=>({id:"f-"+i}))};await assert.rejects(()=>runResearchCouncil({requestId:"request-0012",context:oversized,workers:workers()}),/maximum 500/);});

test("rejects overlong model claims and excessive fact references without truncating them", async()=>{
 const w=workers();
 w.technical_analyst=async()=>({status:"COMPLETE",findings:[{claim:"x".repeat(2001),factIds:["price-1"]}],risks:[]});
 const longClaim=await runResearchCouncil({requestId:"request-0013",context,workers:w});
 assert.equal(longClaim.status,"NO_TRADE");
 assert.ok(longClaim.agents.some(x=>x.role==="technical_analyst"&&x.status==="BLOCKED"));
 const w2=workers();
 w2.technical_analyst=async()=>({status:"COMPLETE",findings:[{claim:"This claim cites too many facts and should be rejected.",factIds:Array(11).fill("price-1")}],risks:[]});
 const tooManyRefs=await runResearchCouncil({requestId:"request-0014",context,workers:w2});
 assert.equal(tooManyRefs.status,"NO_TRADE");
 assert.ok(tooManyRefs.agents.some(x=>x.role==="technical_analyst"&&x.status==="BLOCKED"));
});
