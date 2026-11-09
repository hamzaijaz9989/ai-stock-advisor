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


test("collector reconciles the broker against the existing ledger before sync can overwrite a mismatch",async()=>{
 const calls=[];
 const db={prepare(sql){
  const statement={bind(){return statement;},
   async first(){
    if(sql.includes("research_council_runs"))return null;
    if(sql.includes("execution_control"))return {enabled:0,mode:"paper",kill_switch:1};
    return null;
   },
   async all(){if(sql.includes("paper_positions")||sql.includes("paper_orders"))return {results:[]};return {results:[]};}
  };
  return statement;
 }};
 const old=globalThis.fetch;
 globalThis.fetch=async url=>{
  const u=String(url);calls.push(u);
  if(u.includes("/v2/account"))return Response.json({status:"ACTIVE",currency:"USD"});
  if(u.includes("/v2/positions"))return Response.json([{symbol:"AAPL",qty:"1",avg_entry_price:"100"}]);
  if(u.includes("/v2/orders?"))return Response.json([]);
  throw new Error("unexpected external request "+u);
 };
 try{
  const response=await onRequestPost({request:collectorRequest({ticker:"NVDA",requestId:"collector-mismatch-0001"}),env:{
   NORTHSTAR_OPERATOR_TOKEN:"secret",NORTHSTAR_DB:db,ALPACA_API_KEY_ID:"paper-key",ALPACA_API_SECRET_KEY:"paper-secret"
  }});
  const body=await response.json();
  assert.equal(response.status,503);
  assert.match(body.error,/Pre-sync broker-to-ledger reconciliation failed/i);
  assert.equal(calls.filter(u=>u.includes("/v2/account")).length,1,"only reconciliation should call the broker before the mismatch blocks collection");
  assert.equal(calls.some(u=>u.includes("sec.gov")),false,"provider collection must not begin after reconciliation fails");
 }finally{globalThis.fetch=old;}
});
