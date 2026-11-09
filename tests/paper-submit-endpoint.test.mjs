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
 const db={prepare(sql){const stmt={bind(){return stmt;},first:async()=>sql.includes("execution_control")?({enabled:0,mode:"paper",kill_switch:1,max_portfolio_usd:1000}):null,all:async()=>({results:[]}),run:async()=>({meta:{changes:1}})};return stmt;}};
 try{
  const r=await onRequestPost({request:request({"Authorization":"Bearer operator","X-NORTHSTAR-PAPER-APPROVAL":"approval"}),env:{NORTHSTAR_OPERATOR_TOKEN:"operator",NORTHSTAR_PAPER_EXECUTION_APPROVAL_TOKEN:"approval",ALPACA_API_KEY_ID:"paper-key",ALPACA_API_SECRET_KEY:"paper-secret",NORTHSTAR_DB:db}});
  assert.equal(r.status,503);
  assert.match((await r.json()).error,/disabled|kill-switched/i);
 }finally{globalThis.fetch=original;}
});


test("paper executor blocks an untracked broker position before writing or submitting an order",async()=>{
 const now=new Date().toISOString();
 const calls=[];
 const db={
  prepare(sql){
   const stmt={sql,args:[],bind(...args){this.args=args;return this;},
    async first(){
     if(sql.includes("execution_control"))return {enabled:1,mode:"paper",kill_switch:0,max_portfolio_usd:1000,default_risk_fraction:0.005,max_risk_fraction:0.01,max_position_fraction:0.25};
     if(sql.includes("paper_trade_intents"))return {id:"123e4567-e89b-12d3-a456-426614174000",symbol:"AAPL",side:"buy",qty:1,reference_price:100,stop_price:95,status:"APPROVED_REVIEW_ONLY"};
     if(sql.includes("paper_orders"))return null;
     return null;
    },
    async all(){
     if(sql.includes("paper_equity_snapshots"))return {results:[{captured_at:now,equity_usd:100000}]};
     return {results:[]};
    }
   };return stmt;
  },
  async batch(){throw new Error("must not write order ledger when broker has an untracked position");}
 };
 const original=globalThis.fetch;
 globalThis.fetch=async url=>{
  const u=String(url);calls.push(u);
  if(u.endsWith("/v2/account"))return Response.json({status:"ACTIVE",equity:"100000",last_equity:"100000",buying_power:"400000"});
  if(u.includes("/v2/stocks/AAPL/quotes/latest"))return Response.json({quote:{bp:99.9,ap:100,t:now}});
  if(u.endsWith("/v2/positions"))return Response.json([{symbol:"MSFT",qty:"1",avg_entry_price:"50",market_value:"50"}]);
  if(u.includes("/v2/orders?status=open"))return Response.json([]);
  if(u.endsWith("/v2/orders"))throw new Error("broker order submission must not occur");
  throw new Error("unexpected broker request "+u);
 };
 try{
  const r=await onRequestPost({request:request({"Authorization":"Bearer operator","X-NORTHSTAR-PAPER-APPROVAL":"approval"}),env:{NORTHSTAR_OPERATOR_TOKEN:"operator",NORTHSTAR_PAPER_EXECUTION_APPROVAL_TOKEN:"approval",ALPACA_API_KEY_ID:"paper-key",ALPACA_API_SECRET_KEY:"paper-secret",NORTHSTAR_DB:db}});
  const body=await r.json();
  assert.equal(r.status,409);
  assert.match(body.error,/fully flat broker and ledger/i);
  assert.equal(calls.some(x=>x.endsWith("/v2/orders")),false);
 }finally{globalThis.fetch=original;}
});


async function runHistoricalOrderCase({ledgerOrderRows=[],brokerOrderRows=[]}={}){
 const now=new Date().toISOString(),calls=[];let submitted=false;
 const db={prepare(sql){return {sql,args:[],bind(...args){this.args=args;return this;},
  async first(){
   if(sql.includes("execution_control"))return {enabled:1,mode:"paper",kill_switch:0,max_portfolio_usd:1000,default_risk_fraction:0.005,max_risk_fraction:0.01,max_position_fraction:0.25};
   if(sql.includes("paper_trade_intents"))return {id:"123e4567-e89b-12d3-a456-426614174000",symbol:"AAPL",side:"buy",qty:1,reference_price:100,stop_price:95,status:"APPROVED_REVIEW_ONLY"};
   return null;
  },
  async all(){
   if(sql.includes("paper_equity_snapshots"))return {results:[{captured_at:now,equity_usd:100000}]};
   if(sql.includes("paper_orders"))return {results:ledgerOrderRows};
   return {results:[]};
  }
 };},async batch(){throw new Error("order ledger write must not occur when historical orders exist");}};
 const original=globalThis.fetch;
 globalThis.fetch=async(url,options={})=>{
  const u=String(url);calls.push(u);
  if(u.endsWith("/v2/account"))return Response.json({status:"ACTIVE",equity:"100000",last_equity:"100000",buying_power:"400000"});
  if(u.includes("/v2/stocks/AAPL/quotes/latest"))return Response.json({quote:{bp:99.9,ap:100,t:now}});
  if(u.endsWith("/v2/positions"))return Response.json([]);
  if(u.includes("/v2/orders?status=all"))return Response.json(brokerOrderRows);
  if(u.endsWith("/v2/orders")&&options.method==="POST"){submitted=true;throw new Error("submission must not occur");}
  throw new Error("unexpected broker request "+u);
 };
 try{
  const response=await onRequestPost({request:request({"Authorization":"Bearer operator","X-NORTHSTAR-PAPER-APPROVAL":"approval"}),env:{NORTHSTAR_OPERATOR_TOKEN:"operator",NORTHSTAR_PAPER_EXECUTION_APPROVAL_TOKEN:"approval",ALPACA_API_KEY_ID:"paper-key",ALPACA_API_SECRET_KEY:"paper-secret",NORTHSTAR_DB:db}});
  return {response,submitted,calls};
 }finally{globalThis.fetch=original;}
}
test("paper executor blocks historical broker orders even when none are open",async()=>{
 const {response,submitted}=await runHistoricalOrderCase({brokerOrderRows:[{id:"old-order",status:"filled"}]});
 assert.equal(response.status,409);
 assert.equal(submitted,false);
 assert.match((await response.json()).error,/historical|order history/i);
});
test("paper executor blocks historical Northstar ledger orders",async()=>{
 const {response,submitted}=await runHistoricalOrderCase({ledgerOrderRows:[{id:"old-ledger-order",status:"FILLED"}]});
 assert.equal(response.status,409);
 assert.equal(submitted,false);
 assert.match((await response.json()).error,/historical|order history/i);
});
