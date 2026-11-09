import test from "node:test";
import assert from "node:assert/strict";
import {readFile} from "node:fs/promises";

let source=await readFile(new URL("../web/functions/api/paper/intents.js",import.meta.url),"utf8");
source=source.replace(
 'import {onRequestPost as runPreflight} from "./preflight.js";',
 'const runPreflight=async ({request,env})=>{env.preflightCalls=(env.preflightCalls||0)+1;return env.preflightResponse||Response.json({ok:true,execution:false,status:"PREFLIGHT_PASSED_PREVIEW_ONLY_NOT_AN_ORDER",shares:1,estimatedEntryPrice:100,stopPrice:95,estimatedNotionalUsd:100,plannedStopRiskUsd:5,checkedAt:"2026-11-09T00:00:00.000Z"});};'
);
const {onRequestPost}=await import("data:text/javascript;base64,"+Buffer.from(source).toString("base64"));
const control={enabled:0,mode:"paper",kill_switch:1,max_portfolio_usd:1000};
const hash=async value=>{
 const d=await crypto.subtle.digest("SHA-256",new TextEncoder().encode(JSON.stringify(value)));
 return [...new Uint8Array(d)].map(x=>x.toString(16).padStart(2,"0")).join("");
};
const makeRequest=(body,token="operator")=>new Request("https://northstar.test/api/paper/intents",{method:"POST",headers:{"content-type":"application/json","Authorization":"Bearer "+token},body:JSON.stringify(body)});
function makeDb(existing=null){
 const state={batch:[],queries:[]};
 const db={
  state,
  prepare(sql){const stmt={sql,args:[],bind(...args){this.args=args;return this;},async first(){state.queries.push(sql);if(sql.includes("execution_control"))return control;if(sql.includes("paper_trade_intents"))return existing;return null;}};return stmt;},
  async batch(items){state.batch=items;return items.map(()=>({meta:{changes:1}}));}
 };
 return db;
}
const proposal={idempotencyKey:"northstar-intent-0001",symbol:"AAPL",stopPrice:95,rationale:"Test proposal"};

test("intent creation requires operator authentication",async()=>{
 const db=makeDb();
 const r=await onRequestPost({request:makeRequest(proposal,"wrong"),env:{NORTHSTAR_DB:db,NORTHSTAR_OPERATOR_TOKEN:"operator"}});
 assert.equal(r.status,401);
 assert.equal(db.state.queries.length,0);
});

test("idempotent intent replay returns before a fresh quote/preflight",async()=>{
 const requestHash=await hash({symbol:"AAPL",stopPrice:95,rationale:"Test proposal"});
 const db=makeDb({id:"existing-intent",request_hash:requestHash,status:"PENDING_REVIEW"});
 const env={NORTHSTAR_DB:db,NORTHSTAR_OPERATOR_TOKEN:"operator"};
 const r=await onRequestPost({request:makeRequest(proposal),env});
 const body=await r.json();
 assert.equal(r.status,200);
 assert.equal(body.replayed,true);
 assert.equal(body.id,"existing-intent");
 assert.equal(env.preflightCalls||0,0);
 assert.equal(db.state.batch.length,0);
});

test("reusing an intent idempotency key with different proposal fields is rejected",async()=>{
 const requestHash=await hash({symbol:"AAPL",stopPrice:95,rationale:"Test proposal"});
 const db=makeDb({id:"existing-intent",request_hash:requestHash,status:"PENDING_REVIEW"});
 const r=await onRequestPost({request:makeRequest({...proposal,symbol:"MSFT"}),env:{NORTHSTAR_DB:db,NORTHSTAR_OPERATOR_TOKEN:"operator"}});
 assert.equal(r.status,409);
 assert.match((await r.json()).error,/different proposal/i);
});

test("new intent uses only server-preflight sizing and atomically writes proposal plus audit",async()=>{
 const db=makeDb(null),env={NORTHSTAR_DB:db,NORTHSTAR_OPERATOR_TOKEN:"operator"};
 const r=await onRequestPost({request:makeRequest({...proposal,qty:999,referencePrice:1,evidence:{trusted:false}}),env});
 const body=await r.json();
 assert.equal(r.status,201);
 assert.equal(body.execution,false);
 assert.equal(body.status,"PENDING_REVIEW");
 assert.equal(body.qty,1);
 assert.equal(body.referencePrice,100);
 assert.equal(body.stopPrice,95);
 assert.equal(env.preflightCalls,1);
 assert.equal(db.state.batch.length,2);
 assert.match(db.state.batch[0].sql,/INSERT INTO paper_trade_intents/);
 assert.match(db.state.batch[1].sql,/execution_audit_log/);
});

test("blocked preflight is returned with its evidence and no journal write",async()=>{
 const db=makeDb(null),env={NORTHSTAR_DB:db,NORTHSTAR_OPERATOR_TOKEN:"operator",preflightResponse:Response.json({ok:false,execution:false,error:"seven-day baseline missing"},{status:503})};
 const r=await onRequestPost({request:makeRequest(proposal),env});
 const body=await r.json();
 assert.equal(r.status,503);
 assert.match(body.error,/preflight blocked/i);
 assert.match(body.preflight.error,/seven-day baseline/i);
 assert.equal(db.state.batch.length,0);
});
