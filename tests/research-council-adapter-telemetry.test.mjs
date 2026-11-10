// Regression coverage for both supported model-provider telemetry paths and fail-safe outages.
import test from "node:test";
import assert from "node:assert/strict";
import {createResearchCouncilWorkers} from "../web/lib/research-council-adapters.js";

test("Gemini worker records provider, model, latency and provider-reported token usage for a model-backed role",async()=>{
 const calls=[];
 const mockFetch=async(url,options={})=>{
  calls.push({url:String(url),headers:options.headers||{}});
  if(String(url).includes("/models?pageSize="))return Response.json({models:[{name:"models/gemini-2.5-flash",supportedGenerationMethods:["generateContent"]}]});
  return Response.json({
   candidates:[{content:{parts:[{text:JSON.stringify({status:"COMPLETE",findings:[{claim:"A supplied evidence item is available.",factIds:["f1"]}],risks:[]})}]}}],
   usageMetadata:{promptTokenCount:120,candidatesTokenCount:40,totalTokenCount:160}
  });
 };
 const workers=await createResearchCouncilWorkers({GEMINI_API_KEY:"test-secret"},mockFetch);
 const report=await workers.bull_researcher({facts:[{id:"f1",type:"QUOTE",value:{price:123}}],evidence:[],resourceCoverage:{roles:{bull_researcher:{status:"PARTIAL"}}}});
 assert.equal(report.status,"COMPLETE");
 assert.equal(workers.telemetry.bull_researcher.provider,"gemini");
 assert.equal(workers.telemetry.bull_researcher.model,"models/gemini-2.5-flash");
 assert.ok(Number.isFinite(workers.telemetry.bull_researcher.latencyMs));
 assert.ok(workers.telemetry.market_scanner.latencyMs>=0);
 assert.equal(workers.telemetry.bull_researcher.inputTokens,120);
 assert.equal(workers.telemetry.bull_researcher.outputTokens,40);
 assert.equal(workers.telemetry.bull_researcher.totalTokens,160);
 assert.equal(JSON.stringify(workers.telemetry).includes("test-secret"),false);
 assert.equal(calls.length,2);
});

test("unconfigured model-backed workers disclose absence rather than fabricated telemetry",async()=>{
 const workers=await createResearchCouncilWorkers({});
 const report=await workers.bull_researcher({facts:[{id:"f1",type:"QUOTE",value:{price:123}}],evidence:[]});
 assert.equal(report.status,"UNAVAILABLE");
 assert.equal(workers.telemetry.bull_researcher.provider,"none");
 assert.equal(workers.telemetry.bull_researcher.model,null);
 assert.equal(workers.telemetry.bull_researcher.unavailable,true);
 assert.equal(workers.providerMetadata.defaultProvider,"none");
 assert.equal(workers.providerMetadata.defaultModel,null);
});

test("OpenAI worker records provider-reported token usage without exposing credentials",async()=>{
 const mockFetch=async(url,options={})=>{
  assert.match(String(url),/api\.openai\.com\/v1\/responses/);
  assert.ok(options.headers.Authorization.startsWith("Bearer "));
  return Response.json({
   output_text:JSON.stringify({status:"COMPLETE",findings:[{claim:"An evidence-backed observation.",factIds:["f1"]}],risks:[]}),
   usage:{input_tokens:210,output_tokens:55,total_tokens:265}
  });
 };
 const workers=await createResearchCouncilWorkers({OPENAI_API_KEY:"openai-test-secret",OPENAI_RESEARCH_MODEL:"gpt-test"},mockFetch);
 const report=await workers.bear_researcher({facts:[{id:"f1",type:"QUOTE",value:{price:123}}],evidence:[]});
 assert.equal(report.status,"COMPLETE");
 assert.equal(workers.telemetry.bear_researcher.provider,"openai");
 assert.equal(workers.telemetry.bear_researcher.model,"gpt-test");
 assert.equal(workers.telemetry.bear_researcher.inputTokens,210);
 assert.equal(workers.telemetry.bear_researcher.outputTokens,55);
 assert.equal(workers.telemetry.bear_researcher.totalTokens,265);
 assert.equal(JSON.stringify(workers.telemetry).includes("openai-test-secret"),false);
});

test("deterministic sentiment worker reports the missing feed and records deterministic telemetry",async()=>{
 const workers=await createResearchCouncilWorkers({});
 const report=await workers.sentiment_analyst({facts:[],evidence:[],asOf:"2026-11-10T10:00:00Z"});
 assert.equal(report.status,"UNAVAILABLE");
 assert.equal(workers.telemetry.sentiment_analyst.provider,"deterministic");
 assert.equal(workers.telemetry.sentiment_analyst.model,"northstar-sentiment_analyst-v1");
 assert.ok(Number.isFinite(workers.telemetry.sentiment_analyst.latencyMs));
});

test("failed specialist calls retain measured latency and a failure marker",async()=>{
 const mockFetch=async()=>Response.json({error:"provider unavailable"},{status:503});
 const workers=await createResearchCouncilWorkers({OPENAI_API_KEY:"test-secret"},mockFetch);
 await assert.rejects(()=>workers.bear_researcher({facts:[],evidence:[]}),/HTTP 503/);
 assert.equal(workers.telemetry.bear_researcher.provider,"openai");
 assert.equal(workers.telemetry.bear_researcher.failed,true);
 assert.ok(Number.isFinite(workers.telemetry.bear_researcher.latencyMs));
});

test("deterministic risk committee records latency without model token claims",async()=>{
 const workers=await createResearchCouncilWorkers({});
 const report=await workers.risk_committee({portfolio:{}});
 assert.equal(report.status,"COMPLETE");
 assert.equal(workers.telemetry.risk_committee.provider,"deterministic");
 assert.equal(workers.telemetry.risk_committee.model,"northstar-risk-committee-v1");
 assert.ok(Number.isFinite(workers.telemetry.risk_committee.latencyMs));
 assert.equal(workers.telemetry.risk_committee.inputTokens,undefined);
});
