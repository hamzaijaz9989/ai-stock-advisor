import test from "node:test";
import assert from "node:assert/strict";
import {SPECIALIST_AGENTS,runMarketScanner,runTechnicalAnalyst,runFundamentalAnalyst,runNewsAnalyst,runSentimentAnalyst} from "../web/lib/research-specialist-agents.js";

function context(){
 const rows=Array.from({length:80},(_,i)=>({date:new Date(Date.UTC(2025,0,1+i)).toISOString().slice(0,10),open:100+i,high:102+i,low:99+i,close:101+i,volume:1000+i*5}));
 return {ticker:"TEST",facts:[
  {id:"q1",type:"QUOTE",value:{price:180,changePercent:1.2,quoteFreshness:{status:"FRESH"}}},
  {id:"h1",type:"DAILY_OHLCV_HISTORY",value:{rows,observationCount:80,dataQuality:"verified-adjusted"}},
  {id:"sec1",type:"SEC_REPORTED_FACT",value:{metric:"Revenue",availabilityTimestampVerified:true}},
  {id:"sec2",type:"SEC_REPORTED_FACT",value:{metric:"Net income",availabilityTimestampVerified:true}},
  {id:"sec3",type:"SEC_REPORTED_FACT",value:{metric:"Operating cash flow",availabilityTimestampVerified:true}},
  {id:"sec4",type:"SEC_REPORTED_FACT",value:{metric:"Long term debt",availabilityTimestampVerified:true}},
  {id:"fmp1",type:"FMP_REPORTED_FUNDAMENTALS_CROSSCHECK",value:{metric:"Revenue"}}
 ],evidence:[
  {id:"n1",type:"NEWS_DISCOVERY",value:{title:"Test issuer announces earnings",timestampStatus:"PRESENT",sourceTier:"reported-source"}},
  {id:"s1",type:"SENTIMENT_OBSERVATION",value:{timestampStatus:"PRESENT",source:"Test sentiment feed",sampleCount:100,score:0.25}}
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
 const out=runNewsAnalyst(c);assert.equal(out.status,"COMPLETE");assert.ok(out.risks.length>0);
});
