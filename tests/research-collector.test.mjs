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
