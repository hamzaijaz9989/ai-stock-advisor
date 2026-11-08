import test from "node:test";
import assert from "node:assert/strict";
import {onRequestPost} from "../web/functions/api/paper/submit.js";

function request(headers={},body={intentId:"123e4567-e89b-12d3-a456-426614174000",confirmation:"SUBMIT_THIS_PAPER_ORDER"}){
 return new Request("https://northstar.test/api/paper/submit",{method:"POST",headers:{"content-type":"application/json",...headers},body:JSON.stringify(body)});
}
test("paper executor rejects requests without both independent credentials",async()=>{
 const r=await onRequestPost({request:request({"Authorization":"Bearer operator"}),env:{NORTHSTAR_OPERATOR_TOKEN:"operator",NORTHSTAR_DB:{}}});
 assert.equal(r.status,401);
 assert.equal((await r.json()).execution,false);
});
test("paper executor requires exact per-order confirmation",async()=>{
 const r=await onRequestPost({request:request({"Authorization":"Bearer operator","X-NORTHSTAR-PAPER-APPROVAL":"approval"},{intentId:"123e4567-e89b-12d3-a456-426614174000",confirmation:"yes"}),env:{NORTHSTAR_OPERATOR_TOKEN:"operator",NORTHSTAR_PAPER_EXECUTION_APPROVAL_TOKEN:"approval",NORTHSTAR_DB:{}}});
 assert.equal(r.status,503);
 assert.match((await r.json()).error,/ledger|credentials/i);
});
test("disabled execution controls stop before any broker request",async()=>{
 const original=globalThis.fetch;
 globalThis.fetch=async()=>{throw new Error("BROKER_MUST_NOT_BE_CALLED");};
 const db={prepare(sql){return {first:async()=>sql.includes("execution_control")?({enabled:0,mode:"paper",kill_switch:1,max_portfolio_usd:1000}):null,all:async()=>({results:[]})};}};
 try{
  const r=await onRequestPost({request:request({"Authorization":"Bearer operator","X-NORTHSTAR-PAPER-APPROVAL":"approval"}),env:{NORTHSTAR_OPERATOR_TOKEN:"operator",NORTHSTAR_PAPER_EXECUTION_APPROVAL_TOKEN:"approval",ALPACA_API_KEY_ID:"paper-key",ALPACA_API_SECRET_KEY:"paper-secret",NORTHSTAR_DB:db}});
  assert.equal(r.status,503);
  assert.match((await r.json()).error,/disabled|kill-switched/i);
 }finally{globalThis.fetch=original;}
});
