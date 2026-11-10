import assert from "node:assert/strict";
import test from "node:test";
import {onRequestGet} from "../web/functions/api/fmp-health.js";

test("FMP health accepts only canonical FMP_API_KEY binding",async()=>{
 const response=await onRequestGet({request:new Request("https://northstar.test/api/fmp-health"),env:{FMP_API_KEY2:"legacy-test"}});
 assert.equal(response.status,503);const p=await response.json();assert.equal(p.fmpBindingPresent,false);assert.equal(p.status,"MISSING_BINDING");
});
test("FMP health probes quote, history and fundamentals without exposing key",async()=>{
 const original=globalThis.fetch;let count=0;
 globalThis.fetch=async input=>{count++;const url=new URL(String(input));assert.equal(url.searchParams.get("apikey"),"secret-test");
  return Response.json(url.pathname.endsWith("/quote")?[{symbol:"NVDA",price:100}]:[{date:"2026-11-10",revenue:10}]);};
 try{const response=await onRequestGet({request:new Request("https://northstar.test/api/fmp-health"),env:{FMP_API_KEY:"secret-test",ALPACA_API_KEY_ID:"a",GEMINI_API_KEY:"g"}});
  const p=await response.json();assert.equal(response.status,200);assert.equal(p.status,"FMP_PARTIALLY_OR_FULLY_REACHABLE");
  assert.equal(p.checks.length,3);assert.equal(count,3);assert.equal(JSON.stringify(p).includes("secret-test"),false);
  assert.equal(p.alpacaBindingPresent,true);assert.equal(p.geminiBindingPresent,true);
 }finally{globalThis.fetch=original;}
});
test("FMP health distinguishes invalid credentials from plan restrictions",async()=>{
 const original=globalThis.fetch;globalThis.fetch=async input=>new URL(String(input)).pathname.endsWith("/quote")
  ?new Response(JSON.stringify({["Error Message"]:"Invalid API KEY"}),{status:401,headers:{"Content-Type":"application/json"}})
  :new Response(JSON.stringify({["Error Message"]:"Plan restricted"}),{status:403,headers:{"Content-Type":"application/json"}});
 try{const response=await onRequestGet({request:new Request("https://northstar.test/api/fmp-health"),env:{FMP_API_KEY:"test"}});
  const p=await response.json();assert.equal(response.status,502);assert.equal(p.status,"FMP_AUTHENTICATION_FAILED");
  assert.equal(p.checks.find(x=>x.dataset==="quote").status,"AUTHENTICATION_FAILED");
  assert.equal(p.checks.find(x=>x.dataset==="history").status,"PLAN_OR_PERMISSION_RESTRICTED");
 }finally{globalThis.fetch=original;}
});
