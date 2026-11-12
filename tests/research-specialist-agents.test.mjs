import test from "node:test";
import assert from "node:assert/strict";
import {SPECIALIST_AGENTS,runMarketScanner,runTechnicalAnalyst,runFundamentalAnalyst,runNewsAnalyst,runSentimentAnalyst} from "../web/lib/research-specialist-agents.js";
import {createResearchCouncilWorkers} from "../web/lib/research-council-adapters.js";
import {COUNCIL_ROLES,runResearchCouncil} from "../web/lib/research-council.js";

function context(){
 const rows=Array.from({length:80},(_,i)=>({date:new Date(Date.UTC(2025,0,1+i)).toISOString().slice(0,10),open:100+i,high:102+i,low:99+i,close:101+i,volume:1000+i*5}));
 return {ticker:"TEST",asOf:"2026-11-10T12:00:00Z",portfolio:{equityUsd:10000,openRiskUsd:0,grossExposureUsd:0,dailyLossFraction:0,weeklyLossFraction:0,drawdownFraction:0,sectorExposureUsd:0,concurrentPositions:0},facts:[
  {id:"q1",type:"QUOTE",value:{price:180,changePercent:1.2,quoteFreshness:{status:"FRESH"}}},
  {id:"h1",type:"DAILY_OHLCV_HISTORY",value:{rows,observationCount:80,dataQuality:"verified-adjusted"}},
  {id:"sec1",type:"SEC_REPORTED_FACT",value:{metric:"Revenue",availabilityTimestampVerified:true}},
  {id:"sec2",type:"SEC_REPORTED_FACT",value:{metric:"Net income",availabilityTimestampVerified:true}},
  {id:"sec3",type:"SEC_REPORTED_FACT",value:{metric:"Operating cash flow",availabilityTimestampVerified:true}},
  {id:"sec4",type:"SEC_REPORTED_FACT",value:{metric:"Long term debt",availabilityTimestampVerified:true}},
  {id:"fmp1",type:"FMP_REPORTED_FUNDAMENTALS_CROSSCHECK",value:{metric:"Revenue"}}
 ],evidence:[
  {id:"n1",type:"NEWS_DISCOVERY",value:{title:"Test issuer announces earnings",timestampStatus:"PRESENT",sourceTier:"reported-source"}},
  {id:"s1",type:"SENTIMENT_OBSERVATION",value:{timestampStatus:"PRESENT",timestamp:"2026-11-08T14:00:00Z",source:"Test sentiment feed",sampleCount:100,score:0.25,population:"retail",metric:"survey sentiment",methodology:"Provider survey normalization",normalizedScale:"minus1_to_plus1"}}
 ]};
}

test("all five specialist agents return evidence-linked reports on sufficient fixtures",()=>{
 const c=context();
 for(const [role,agent] of Object.entries(SPECIALIST_AGENTS)){
  const out=agent(c);assert.equal(out.status,"COMPLETE",role);
  assert.ok(out.findings.length>0,role);
  for(const item of [...out.findings,...out.risks]) for(const id of item.factIds) assert.ok([...c.facts,...c.evidence].some(x=>x.id===id),role+" cites unknown "+id);
 }
});

test("worker adapter records latency and provider usage for all nine roles",async()=>{
 const c=context();
 const fetcher=async(input,init={})=>{
  const url=new URL(input);
  if(url.pathname.endsWith("/models"))return Response.json({models:[{name:"models/gemini-2.5-flash",supportedGenerationMethods:["generateContent"]}]});
  if(url.pathname.includes(":generateContent")){
   const request=JSON.parse(init.body);
   const prompt=JSON.parse(request.contents[0].parts[0].text);
   const factId=prompt.context.facts[0].id;
   const report={status:"COMPLETE",findings:[{claim:"Model-backed specialist provides an evidence-linked synthetic finding for review.",factIds:[factId]}],risks:[{claim:"Independent source confirmation and human review remain necessary.",factIds:[factId]}],...(prompt.context.debateChallenge?{challenge:{opposingClaim:(prompt.context.debateChallenge.opponentReport.findings[0]||prompt.context.debateChallenge.opponentReport.risks[0]).claim,response:"The opposing claim is challenged using supplied evidence.",factIds:[factId]}}:{})};
   return Response.json({candidates:[{content:{parts:[{text:JSON.stringify(report)}]}}],usageMetadata:{promptTokenCount:120,candidatesTokenCount:40,totalTokenCount:160}});
  }
  throw new Error("Unexpected telemetry test fetch: "+url);
 };
 const workers=await createResearchCouncilWorkers({GEMINI_API_KEY:"synthetic-gemini-key"},fetcher);
 const result=await runResearchCouncil({requestId:"specialist-telemetry-001",context:c,workers});
 assert.equal(result.status,"RESEARCH_REVIEW_REQUIRED",JSON.stringify({agents:result.agents,telemetry:workers.telemetry}));
 const roles=[...COUNCIL_ROLES.independent,...COUNCIL_ROLES.debate,...COUNCIL_ROLES.synthesis,...COUNCIL_ROLES.veto];
 assert.equal(roles.length,9);
 assert.deepEqual(Object.keys(workers.telemetry).sort(),[...roles].sort());
 for(const role of roles)assert.ok(Number.isFinite(workers.telemetry[role].latencyMs),role);
 for(const role of Object.keys(SPECIALIST_AGENTS)){
  assert.equal(workers.telemetry[role].provider,"deterministic",role);
  assert.match(workers.telemetry[role].model,/^northstar-/);
 }
 for(const role of [...COUNCIL_ROLES.debate,...COUNCIL_ROLES.synthesis]){
  assert.equal(workers.telemetry[role].provider,"gemini",role);assert.equal(workers.telemetry[role].calls,role==="portfolio_analyst"?1:2,role);
  assert.equal(workers.telemetry[role].inputTokens,role==="portfolio_analyst"?120:240,role);
  assert.equal(workers.telemetry[role].outputTokens,role==="portfolio_analyst"?40:80,role);
  assert.equal(workers.telemetry[role].totalTokens,role==="portfolio_analyst"?160:320,role);
 }
 assert.equal(workers.telemetry.risk_committee.provider,"deterministic");
 assert.equal(workers.providerMetadata.defaultProvider,"gemini");
});

test("scanner and technical analyst fail closed on missing history",()=>{
 const c={ticker:"TEST",facts:[{id:"q",type:"QUOTE",value:{price:10}}],evidence:[]};
 assert.equal(runMarketScanner(c).status,"UNAVAILABLE");
 assert.equal(runTechnicalAnalyst(c).status,"UNAVAILABLE");
});
test("fundamental analyst refuses to infer fundamentals from quote alone",()=>{
 assert.equal(runFundamentalAnalyst({facts:[{id:"q",type:"QUOTE",value:{price:10}}],evidence:[]}).status,"UNAVAILABLE");
});
test("news analyst reports missing news rather than fabricating catalysts",()=>{
 assert.equal(runNewsAnalyst({facts:[],evidence:[]}).status,"UNAVAILABLE");
});
test("sentiment analyst refuses to invent sentiment when no dedicated feed exists",()=>{
 assert.equal(runSentimentAnalyst({facts:[],evidence:[]}).status,"UNAVAILABLE");
});
test("sentiment observations without timestamp, source, sample count and bounded score are rejected",()=>{
 const c={facts:[],evidence:[{id:"s",type:"SENTIMENT_OBSERVATION",value:{score:0.9}}]};
 assert.equal(runSentimentAnalyst(c).status,"UNAVAILABLE");
});
test("news headlines remain discovery evidence and are not elevated to verified catalysts",()=>{
 const c={facts:[],evidence:[{id:"n",type:"NEWS_DISCOVERY",value:{title:"Issuer story",timestampStatus:"PRESENT",sourceTier:"unverified-source"}}]};
 const out=runNewsAnalyst(c);assert.equal(out.status,"COMPLETE");assert.ok(out.risks.length>0);assert.ok([...out.findings,...out.risks].every(item=>item.factIds.length>0));
});

test("fundamental analyst compares supplied periods and flags SEC availability limits",()=>{
 const c=context();
 c.facts.push({id:"sec5",type:"SEC_REPORTED_FACT",value:{metric:"Revenue",value:100,unit:"USD",end:"2024-12-31",availabilityTimestampVerified:false}});
 c.facts.push({id:"sec6",type:"SEC_REPORTED_FACT",value:{metric:"Revenue",value:125,unit:"USD",end:"2025-12-31",availabilityTimestampVerified:false}});
 const out=runFundamentalAnalyst(c);
 assert.equal(out.status,"COMPLETE");
 assert.ok(out.findings.some(x=>x.claim.includes("changed 25.00%")));
 assert.ok(out.risks.some(x=>x.claim.includes("public-availability timestamps")));
});
test("news analyst excludes future and undated items and flags unverified sources",()=>{
 const c={asOf:"2026-11-10T12:00:00Z",facts:[],evidence:[
  {id:"n1",type:"NEWS_DISCOVERY",value:{title:"Issuer results",url:"https://example.com/a",publishedAt:"2026-11-10T10:00:00Z",publisher:"Unknown"}},
  {id:"n2",type:"NEWS_DISCOVERY",value:{title:"Future story",url:"https://example.com/b",publishedAt:"2026-11-10T13:00:00Z"}},
  {id:"n3",type:"NEWS_DISCOVERY",value:{title:"Undated story",url:"https://example.com/c"}},
  {id:"n4",type:"NEWS_DISCOVERY",value:{title:"Date-only story",url:"https://example.com/d",publishedAt:"2026-11-10"}},
  {id:"n5",type:"NEWS_DISCOVERY",value:{title:"Timezone-less story",url:"https://example.com/e",publishedAt:"2026-11-10T11:00:00"}}
 ]};
 const out=runNewsAnalyst(c);
 assert.equal(out.status,"COMPLETE");
 assert.ok(out.findings.some(x=>x.claim.includes("1 unique, dated")));
 assert.ok(out.risks.some(x=>x.claim.includes("after the research as-of time")));
 assert.ok(out.risks.some(x=>x.claim.includes("missing or invalid publication timestamps")));
 assert.ok(out.risks.some(x=>x.claim.includes("unverified publisher attribution")));
});
test("news analyst removes duplicate URLs from unique dated counts",()=>{
 const c={asOf:"2026-11-10T12:00:00Z",facts:[],evidence:[
  {id:"n1",type:"NEWS_DISCOVERY",value:{title:"Story",url:"https://example.com/a",publishedAt:"2026-11-10T10:00:00Z",publisher:"Reuters",sourceTier:"reported-source"}},
  {id:"n2",type:"NEWS_DISCOVERY",value:{title:"Story duplicate",url:"https://example.com/a",publishedAt:"2026-11-10T10:00:00Z",publisher:"Reuters",sourceTier:"reported-source"}}
 ]};
 const out=runNewsAnalyst(c);
 assert.ok(out.findings.some(x=>x.claim.includes("1 unique, dated")));
 assert.ok(out.risks.some(x=>x.claim.includes("duplicate news item")));
});

test("bull and bear role guidance remains distinct, evidence-only and falsifiable",async()=>{
 const {readFile}=await import("node:fs/promises");
 const source=await readFile(new URL("../web/lib/research-council-adapters.js",import.meta.url),"utf8");
 const bull=source.match(/bull_researcher: "([^"]+)"/)?.[1]||"";
 const bear=source.match(/bear_researcher: "([^"]+)"/)?.[1]||"";
 assert.ok(bull.includes("positive thesis"));
 assert.ok(bull.includes("falsify"));
 assert.ok(bull.includes("ONLY supplied evidence IDs"));
 assert.ok(bear.includes("downside thesis"));
 assert.ok(bear.includes("falsify"));
 assert.ok(bear.includes("ONLY supplied evidence IDs"));
 assert.notEqual(bull,bear);
 assert.ok(bull.includes("Do not issue BUY/SELL"));
 assert.ok(bear.includes("Do not issue BUY/SELL"));
});


test("sentiment analyst rejects future-dated and malformed observations and weights valid samples",()=>{
 const c={asOf:"2026-11-10T12:00:00Z",facts:[],evidence:[
  {id:"s-old",type:"SENTIMENT_OBSERVATION",value:{timestampStatus:"PRESENT",timestamp:"2026-11-10T11:00:00Z",source:"Feed A",sampleCount:100,score:0.2}},
  {id:"s-large",type:"ANALYST_SENTIMENT",value:{timestampStatus:"PRESENT",timestamp:"2026-11-10T11:30:00Z",source:"Feed B",sampleCount:300,score:0.6,population:"analyst_revisions",metric:"estimate revisions",methodology:"Provider revision normalization",normalizedScale:"minus1_to_plus1"}},
  {id:"s-future",type:"POSITIONING_SENTIMENT",value:{timestampStatus:"PRESENT",timestamp:"2026-11-10T13:00:00Z",source:"Feed C",sampleCount:500,score:-1}},
  {id:"s-date-only",type:"SENTIMENT_OBSERVATION",value:{timestampStatus:"PRESENT",timestamp:"2026-11-10",source:"Feed D",sampleCount:1000,score:1}},
  {id:"s-nozone",type:"SENTIMENT_OBSERVATION",value:{timestampStatus:"PRESENT",timestamp:"2026-11-10T11:00:00",source:"Feed E",sampleCount:1000,score:-1}}
 ]};
 const out=runSentimentAnalyst(c);assert.equal(out.status,"COMPLETE");
 assert.equal(out.findings.length,2);assert.ok(out.findings.some(x=>x.claim.includes("0.200")));assert.ok(out.findings.some(x=>x.claim.includes("0.600")));assert.ok(out.risks.some(x=>x.claim.includes("not pooled")));assert.ok(out.risks.some(x=>x.claim.includes("excluded")));
});
test("sentiment analyst requires actual timestamp, not only timestampStatus",()=>{
 const c={facts:[],evidence:[{id:"s",type:"SENTIMENT_OBSERVATION",value:{timestampStatus:"PRESENT",source:"Feed",sampleCount:10,score:0.2}}]};
 assert.equal(runSentimentAnalyst(c).status,"UNAVAILABLE");
});
test("portfolio analyst guidance prohibits fabricated exposures and trade recommendations",async()=>{
 const {readFile}=await import("node:fs/promises");
 const source=await readFile(new URL("../web/lib/research-council-adapters.js",import.meta.url),"utf8");
 const start=source.indexOf("portfolio_analyst:");const end=source.indexOf("\n};",start);const guidance=source.slice(start,end);
 assert.match(guidance,/exact factIds/);assert.match(guidance,/Never invent weights, correlations/);assert.match(guidance,/Do not recommend BUY\/SELL/);
});


test("deterministic risk committee fails closed on incomplete or invalid portfolio state",async()=>{
 const workers=await createResearchCouncilWorkers({});
 const base={portfolio:{equityUsd:10000,openRiskUsd:0,grossExposureUsd:0,dailyLossFraction:0,weeklyLossFraction:0,drawdownFraction:0,sectorExposureUsd:0,concurrentPositions:0}};
 const missing=await workers.risk_committee({portfolio:{...base.portfolio,equityUsd:undefined}});
 assert.equal(missing.decision,"REJECT");assert.match(missing.vetoReasons[0],/incomplete/);
 const invalid=await workers.risk_committee({portfolio:{...base.portfolio,dailyLossFraction:1.2}});
 assert.equal(invalid.decision,"REJECT");assert.match(invalid.vetoReasons[0],/unsupported units or bounds/);
});
test("deterministic risk committee applies all configured hard limits at threshold",async()=>{
 const workers=await createResearchCouncilWorkers({});
 const p={equityUsd:10000,openRiskUsd:201,grossExposureUsd:10001,dailyLossFraction:0.02,weeklyLossFraction:0.04,drawdownFraction:0.08,sectorExposureUsd:4001,concurrentPositions:1};
 const out=await workers.risk_committee({portfolio:p});
 assert.equal(out.decision,"REJECT");assert.equal(out.vetoReasons.length,7);
});
test("deterministic risk committee accepts only a fully populated portfolio below every limit",async()=>{
 const workers=await createResearchCouncilWorkers({});
 const out=await workers.risk_committee({portfolio:{equityUsd:10000,openRiskUsd:100,grossExposureUsd:9000,dailyLossFraction:0.01,weeklyLossFraction:0.02,drawdownFraction:0.03,sectorExposureUsd:3000,concurrentPositions:0}});
 assert.equal(out.decision,"ACCEPT_FOR_REVIEW");assert.deepEqual(out.vetoReasons,[]);
});


test("fundamental analyst can report from SEC primary facts without the optional FMP cross-check",()=>{
 const c=context();
 c.facts=c.facts.filter(item=>!item.type.startsWith("FMP_"));
 const out=runFundamentalAnalyst(c);
 assert.equal(out.status,"COMPLETE");
 assert.ok(out.findings.some(item=>item.claim.includes("SEC fact observation")));
 assert.ok(out.risks.some(item=>item.claim.includes("FMP statement/provider cross-check observations are absent")));
});
