import test from "node:test";
import assert from "node:assert/strict";
import {onRequestPost} from "../web/functions/api/paper/recover.js";

const PARENT_ID="123e4567-e89b-12d3-a456-426614174000";
const parentRow={id:PARENT_ID,broker_order_id:"parent-broker",symbol:"AAPL",side:"buy",qty:5,stop_price:95,status:"PARTIALLY_FILLED",response_json:"{}"};
const parent=(overrides={})=>({id:"parent-broker",symbol:"AAPL",side:"buy",qty:"5",filled_qty:"2",status:"canceled",...overrides});
const child=(overrides={})=>({id:"child-broker",symbol:"AAPL",side:"sell",type:"stop",qty:"5",filled_qty:"0",leaves_qty:"5",stop_price:"95",status:"held",...overrides});
const request=(headers={},body={orderId:PARENT_ID,confirmation:"RECOVER_THIS_PAPER_ORDER"})=>new Request("https://northstar.test/api/paper/recover",{method:"POST",headers:{"content-type":"application/json",...headers},body:JSON.stringify(body)});
function makeDb({control={enabled:0,mode:"paper",kill_switch:1},row=parentRow,existing=null}={}){
 const batches=[];
 return {batches,prepare(sql){return {sql,args:[],bind(...args){this.args=args;return this;},
  async first(){
   if(sql.includes("execution_control"))return control;
   if(sql.includes("idempotency_key"))return existing;
   if(sql.includes("FROM paper_orders WHERE id=?"))return row;
   return null;
  }
 };},async batch(items){batches.push(items);return items.map(()=>({meta:{changes:1}}));}};
}
function baseEnv(db){return {NORTHSTAR_OPERATOR_TOKEN:"operator",ALPACA_API_KEY_ID:"paper-key",ALPACA_API_SECRET_KEY:"paper-secret",NORTHSTAR_DB:db};}
async function run({db=makeDb(),brokerParent=parent(),positions=[{symbol:"AAPL",qty:"2",side:"long"}],quote={quote:{bp:"99",ap:"99.1",t:new Date().toISOString()}},token="operator",fetchOverride=null}={}){
 const calls=[];
 const original=globalThis.fetch;
 globalThis.fetch=fetchOverride|| (async(url,options={})=>{
  const u=String(url);calls.push({url:u,method:options.method||"GET"});
  if(u.includes("/v2/orders/parent-broker?nested=true"))return Response.json(brokerParent);
  if(u.endsWith("/v2/positions"))return Response.json(positions);
  if(u.includes("/v2/stocks/AAPL/quotes/latest"))return Response.json(quote);
  if(u.endsWith("/v2/orders")&&options.method==="DELETE")return new Response(null,{status:204});
  if(u.endsWith("/v2/orders")&&options.method==="POST"){
   const payload=JSON.parse(options.body);
   return Response.json({id:"recovery-broker",client_order_id:payload.client_order_id,symbol:payload.symbol,side:payload.side,qty:payload.qty,type:payload.type,time_in_force:payload.time_in_force,stop_price:payload.stop_price,status:"new",filled_qty:"0",leaves_qty:payload.qty});
  }
  throw new Error("unexpected broker request "+u);
 });
 try{
  const response=await onRequestPost({request:request({"Authorization":"Bearer "+token}),env:baseEnv(db)});
  return {response,calls,batches:db.batches};
 }finally{globalThis.fetch=original;}
}
test("recovery rejects missing operator authentication",async()=>{
 const db=makeDb();
 const {response,calls}=await run({db,token:"wrong"});
 assert.equal(response.status,401);
 assert.equal(calls.length,0);
});
test("recovery is available only with execution disabled and kill switch engaged",async()=>{
 const db=makeDb({control:{enabled:0,mode:"paper",kill_switch:0}});
 const {response,calls}=await run({db});
 assert.equal(response.status,409);
 assert.equal(calls.length,0);
});
test("partially filled open parent is canceled first and no stop is submitted in the same pass",async()=>{
 const db=makeDb();
 const {response,calls}=await run({db,brokerParent:parent({status:"partially_filled"})});
 const body=await response.json();
 assert.equal(response.status,202);
 assert.equal(body.status,"CANCEL_REQUEST_ACCEPTED");
 assert.ok(calls.some(x=>x.method==="DELETE"&&x.url.endsWith("/v2/orders/parent-broker")));
 assert.equal(calls.some(x=>x.method==="POST"),false);
});
test("pending parent cancellation is observed without another mutation",async()=>{
 const db=makeDb();
 const {response,calls}=await run({db,brokerParent:parent({status:"pending_cancel"})});
 assert.equal(response.status,202);
 assert.equal((await response.json()).status,"WAITING_FOR_PARENT_CANCEL");
 assert.equal(calls.some(x=>x.method==="DELETE"||x.method==="POST"),false);
});
test("held OTO child is canceled only after position reconciliation",async()=>{
 const db=makeDb();
 const {response,calls}=await run({db,brokerParent:parent({legs:[child()]})});
 assert.equal(response.status,202);
 assert.equal((await response.json()).status,"HELD_CHILD_CANCEL_REQUEST_ACCEPTED");
 assert.ok(calls.some(x=>x.method==="DELETE"&&x.url.endsWith("/v2/orders/child-broker")));
 assert.equal(calls.some(x=>x.method==="POST"),false);
});
test("terminal partial entry receives only an exact-quantity standalone GTC sell stop",async()=>{
 const db=makeDb();
 const {response,calls,batches}=await run({db});
 const body=await response.json();
 assert.equal(response.status,201);
 assert.equal(body.status,"PROTECTED_BY_STANDALONE_GTC_STOP");
 assert.equal(body.protectiveStopVerified,true);
 const post=calls.find(x=>x.method==="POST");
 assert.ok(post);
 assert.equal(calls.filter(x=>x.method==="POST").length,1);
 assert.equal(batches.length,2);
 const orderInsert=batches[0][0];
 assert.match(orderInsert.sql,/INSERT INTO paper_orders/);
 assert.ok(orderInsert.args.includes("sell"));
 assert.ok(orderInsert.args.includes(2));
 assert.ok(orderInsert.args.includes("gtc"));
});
test("broker position mismatch prevents any recovery stop submission",async()=>{
 const db=makeDb();
 const {response,calls}=await run({db,positions:[{symbol:"AAPL",qty:"3",side:"long"}]});
 assert.equal(response.status,409);
 assert.equal((await response.json()).reason,"BROKER_POSITION_DOES_NOT_MATCH_ENTRY_MINUS_STOP_FILLS");
 assert.equal(calls.some(x=>x.method==="POST"),false);
});
test("ambiguous recovery stop submission is marked UNKNOWN and never blindly retried",async()=>{
 const db=makeDb();
 const calls=[];
 const {response}=await run({db,fetchOverride:async(url,options={})=>{
  const u=String(url);calls.push({url:u,method:options.method||"GET"});
  if(u.includes("/v2/orders/parent-broker?nested=true"))return Response.json(parent());
  if(u.endsWith("/v2/positions"))return Response.json([{symbol:"AAPL",qty:"2",side:"long"}]);
  if(u.includes("/v2/stocks/AAPL/quotes/latest"))return Response.json({quote:{bp:"99",t:new Date().toISOString()}});
  if(u.endsWith("/v2/orders")&&options.method==="POST")throw new Error("network timeout");
  if(u.includes("/v2/orders:by_client_order_id"))return Response.json({message:"not found"},{status:404});
  throw new Error("unexpected "+u);
 }});
 const body=await response.json();
 assert.equal(response.status,503);
 assert.equal(body.status,"UNKNOWN");
 assert.equal(calls.filter(x=>x.method==="POST").length,1);
 assert.ok(db.batches.some(batch=>batch.some(stmt=>stmt.sql.includes("UPDATE execution_control SET enabled=0,kill_switch=1"))));
});
