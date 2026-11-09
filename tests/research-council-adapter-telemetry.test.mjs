// Regression coverage for both supported model-provider telemetry paths and fail-safe outages.
import test from "node:test";
import assert from "node:assert/strict";
import {createResearchCouncilWorkers} from "../web/lib/research-council-adapters.js";

test("Gemini worker records provider, model, latency and provider-reported token usage",async()=>{
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
 const report=await workers.market_scanner({facts:[{id:"f1"}],evidence:[],resourceCoverage:{roles:{market_scanner:{status:"PARTIAL"}}}});
 assert.equal(report.status,"COMPLETE");
 assert.equal(workers.telemetry.market_scanner.provider,"gemini");
 assert.equal(workers.telemetry.market_scanner.model,"models/gemini-2.5-flash");
 assert.ok(Number.isFinite(workers.telemetry.market_scanner.latencyMs));
 assert.ok(workers.telemetry.market_scanner.latencyMs>=0);
 assert.equal(workers.telemetry.market_scanner.inputTokens,120);
 assert.equal(workers.telemetry.market_scanner.outputTokens,40);
 assert.equal(workers.telemetry.market_scanner.totalTokens,160);
 assert.equal(JSON.stringify(workers.telemetry).includes("test-secret"),false);
 assert.equal(calls.length,2);
});

test("unconfigured workers disclose absence rather than fabricated telemetry",async()=>{
 const workers=await createResearchCouncilWorkers({});
 const report=await workers.sentiment_analyst({});
 assert.equal(report.status,"UNAVAILABLE");
 assert.deepEqual(workers.telemetry,{});
 assert.deepEqual(workers.providerMetadata,{provider:"none",model:null});
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
 const report=await workers.news_analyst({facts:[{id:"f1"}],evidence:[]});
 assert.equal(report.status,"COMPLETE");
 assert.equal(workers.telemetry.news_analyst.provider,"openai");
 assert.equal(workers.telemetry.news_analyst.model,"gpt-test");
 assert.equal(workers.telemetry.news_analyst.inputTokens,210);
 assert.equal(workers.telemetry.news_analyst.outputTokens,55);
 assert.equal(workers.telemetry.news_analyst.totalTokens,265);
 assert.equal(JSON.stringify(workers.telemetry).includes("openai-test-secret"),false);
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
