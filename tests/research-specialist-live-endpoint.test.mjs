import test from "node:test";
import assert from "node:assert/strict";
import {onRequestPost} from "../web/functions/api/research/specialists.js";
test("live specialist endpoint rejects missing operator authentication",async()=>{const r=await onRequestPost({request:new Request("https://northstar.test/api/research/specialists",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({ticker:"AAPL"})}),env:{NORTHSTAR_OPERATOR_TOKEN:"expected"}});assert.equal(r.status,401);const b=await r.json();assert.equal(b.execution,false);});
test("live specialist endpoint validates ticker before provider access",async()=>{const r=await onRequestPost({request:new Request("https://northstar.test/api/research/specialists",{method:"POST",headers:{Authorization:"Bearer expected","Content-Type":"application/json"},body:JSON.stringify({ticker:"INVALID TICKER"})}),env:{NORTHSTAR_OPERATOR_TOKEN:"expected"}});assert.equal(r.status,400);});
