import assert from "node:assert/strict";
import test from "node:test";
import {onRequestGet} from "../web/functions/api/fmp-health.js";

test("FMP health accepts only the canonical FMP_API_KEY binding",async()=>{
 const request=new Request("https://northstar.test/api/fmp-health");
 const response=await onRequestGet({request,env:{FMP_API_KEY2:"legacy-test"}});
 assert.equal(response.status,503);
 const payload=await response.json();
 assert.equal(payload.fmpBindingPresent,false);
 assert.equal(payload.status,"MISSING_BINDING");
});

test("FMP health probes quote, history and fundamentals without exposing the key",async()=>{
 const original=globalThis.fetch;let count=0;
 globalThis.fetch=async input=>{
  count++;const url=new URL(String(input));
  assert.equal(url.searchParams.get("apikey"),"secret-test");
  const body=url.pathname.endsWith("/quote")?[{symbol:"NVDA",price:100}]:[{date:"2026-11-10",revenue:10}];
  return Response.json(body);
 };
 try{
  const response=await onRequestGet({request:new Request("https://northstar.test/api/fmp-health"),env:{FMP_API_KEY:"secret-test",ALPACA_API_KEY_ID:"a",GEMINI_API_KEY:"g"}});
  const payload=await response.json();
  assert.equal(response.status,200);assert.equal(payload.status,"FMP_PARTIALLY_OR_FULLY_REACHABLE");
  assert.equal(payload.checks.length,3);assert.equal(count,3);
  assert.equal(JSON.stringify(payload).includes("secret-test"),false);
  assert.equal(payload.alpacaBindingPresent,true);assert.equal(payload.geminiBindingPresent,true);
 }finally{globalThis.fetch=original;}
});

test("FMP health distinguishes invalid credentials from plan restrictions",async()=>{
 const original=globalThis.fetch;
 globalThis.fetch=async input=>new URL(String(input)).pathname.endsWith("/quote")
  ?new Response(JSON.stringify({["Error Message"]:"Invalid API KEY"}),{status:401,headers:{"Content-Type":"application/json"}})
  :new Response(JSON.stringify({["Error Message"]:"Plan restricted"}),{status:403,headers:{"Content-Type":"application/json"}});
 try{
  const response=await onRequestGet({request:new Request("https://northstar.test/api/fmp-health"),env:{FMP_API_KEY:"test"}});
  const payload=await response.json();
  assert.equal(response.status,502);assert.equal(payload.status,"FMP_AUTHENTICATION_FAILED");
  assert.equal(payload.checks.find(x=>x.dataset==="quote").status,"AUTHENTICATION_FAILED");
  assert.equal(payload.checks.find(x=>x.dataset==="history").status,"PLAN_OR_PERMISSION_RESTRICTED");
 }finally{globalThis.fetch=original;}
});
