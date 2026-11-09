import test from "node:test";
import assert from "node:assert/strict";
import {createResearchCouncilWorkers} from "../web/lib/research-council-adapters.js";

test("Gemini worker records provider, model and measured per-role latency without secrets",async()=>{
 const old=globalThis.fetch;
 const calls=[];
 globalThis.fetch=async(url,options={})=>{
  calls.push({url:String(url),headers:options.headers||{}});
  if(String(url).includes("/models?pageSize="))return Response.json({models:[{name:"models/gemini-2.5-flash",supportedGenerationMethods:["generateContent"]}]});
  return Response.json({candidates:[{content:{parts:[{text:JSON.stringify({status:"COMPLETE",findings:[{claim:"A supplied evidence item is available.",factIds:["f1"]}],risks:[]})}]}}],usageMetadata:{promptTokenCount:120,candidatesTokenCount:40,totalTokenCount:160}});
 };
 try{
  const workers=await createResearchCouncilWorkers({GEMINI_API_KEY:"test-secret"});
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
 }finally{globalThis.fetch=old;}
});

test("unconfigured workers disclose absence rather than fabricated telemetry",async()=>{
 const workers=await createResearchCouncilWorkers({});
 const report=await workers.sentiment_analyst({});
 assert.equal(report.status,"UNAVAILABLE");
 assert.deepEqual(workers.telemetry,{});
 assert.deepEqual(workers.providerMetadata,{provider:"none",model:null});
});
