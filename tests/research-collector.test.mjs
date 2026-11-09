import test from "node:test";
import assert from "node:assert/strict";
import {onRequestPost} from "../web/functions/api/research/collect.js";

test("server-side research collector rejects unauthenticated callers before provider access",async()=>{
 const response=await onRequestPost({request:new Request("https://northstar.test/api/research/collect",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({ticker:"NVDA",requestId:"collector-0001"})}),env:{NORTHSTAR_OPERATOR_TOKEN:"secret",NORTHSTAR_DB:{}}});
 assert.equal(response.status,401);
 const body=await response.json();
 assert.equal(body.execution,false);
});

test("server-side research collector accepts only a ticker and stable request identifier contract",async()=>{
 const response=await onRequestPost({request:new Request("https://northstar.test/api/research/collect",{method:"POST",headers:{Authorization:"Bearer secret","Content-Type":"application/json"},body:JSON.stringify({ticker:"bad ticker",requestId:"collector-0002"})}),env:{NORTHSTAR_OPERATOR_TOKEN:"secret",NORTHSTAR_DB:{}}});
 assert.equal(response.status,400);
});


function collectorRequest(body,token="secret"){
 return new Request("https://northstar.test/api/research/collect",{method:"POST",headers:{Authorization:"Bearer "+token,"Content-Type":"application/json"},body:JSON.stringify(body)});
}
test("collector replays a durable request ID before any provider or broker access",async()=>{
 const stored={symbol:"NVDA",result_json:JSON.stringify({status:"NO_TRADE"}),created_at:"2026-11-09T00:00:00.000Z"};
 const db={prepare(sql){return {bind(){return {first:async()=>stored};}};}};
 const old=globalThis.fetch;globalThis.fetch=async()=>{throw new Error("external access must not occur on replay");};
 try{
  const response=await onRequestPost({request:collectorRequest({ticker:"NVDA",requestId:"collector-replay-0001"}),env:{NORTHSTAR_OPERATOR_TOKEN:"secret",NORTHSTAR_DB:db}});
  const body=await response.json();
  assert.equal(response.status,200);
  assert.equal(body.ok,true);
  assert.equal(body.replayed,true);
  assert.equal(body.traceDurable,true);
  assert.equal(body.result.status,"NO_TRADE");
 }finally{globalThis.fetch=old;}
});
test("collector rejects reuse of a request ID for a different ticker",async()=>{
 const db={prepare(){return {bind(){return {first:async()=>({symbol:"NVDA",result_json:'{"status":"NO_TRADE"}',created_at:"2026-11-09T00:00:00.000Z"})};}};}};
 const response=await onRequestPost({request:collectorRequest({ticker:"AAPL",requestId:"collector-replay-0002"}),env:{NORTHSTAR_OPERATOR_TOKEN:"secret",NORTHSTAR_DB:db}});
 assert.equal(response.status,409);
 assert.match((await response.json()).error,/different ticker/i);
});
