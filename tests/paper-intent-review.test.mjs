import test from "node:test";
import assert from "node:assert/strict";
import {readFile} from "node:fs/promises";

let source=await readFile(new URL("../web/functions/api/paper/intents/review.js",import.meta.url),"utf8");
source=source.replace(
 'import {onRequestPost as runPreflight} from "../preflight.js";',
 'const runPreflight=async ({request,env})=>{env.preflightCalls=(env.preflightCalls||0)+1;return env.preflightResponse||Response.json({ok:true,execution:false,status:"PREFLIGHT_PASSED_PREVIEW_ONLY_NOT_AN_ORDER",shares:1,estimatedEntryPrice:100,stopPrice:95,estimatedNotionalUsd:100,plannedStopRiskUsd:5,checkedAt:"2026-11-09T00:00:00.000Z"});};'
);
const {onRequestPost}=await import("data:text/javascript;base64,"+Buffer.from(source).toString("base64"));

const id="123e4567-e89b-12d3-a456-426614174000";
const pending={
 id,symbol:"AAPL",side:"buy",qty:1,reference_price:100,stop_price:95,
 estimated_notional_usd:100,planned_risk_usd:5,status:"PENDING_REVIEW",
 evidence_json:JSON.stringify({source:"northstar_server_preflight",preflight:{shares:1}})
};
const config={
 NORTHSTAR_OPERATOR_TOKEN:"test-only",
 NORTHSTAR_INTENT_REVIEW_TOKEN:"review-secret-12345678901234567890123456789012",
 NORTHSTAR_PAPER_EXECUTION_APPROVAL_TOKEN:"paper-execution-secret",
 NORTHSTAR_INTENT_REVIEWER:"Independent Risk Reviewer"
};
const body=(decision="APPROVE",overrides={})=>({
 intentId:id,decision,confirmation:"REVIEW_THIS_PAPER_INTENT",
 note:"Reviewed against current risk policy and source evidence.",...overrides
});
const request=(payload=body(),headers={})=>new Request("https://northstar.test/api/paper/intents/review",{
 method:"POST",
 headers:{"content-type":"application/json","Authorization":"Bearer test-only","X-NORTHSTAR-INTENT-REVIEW":"review-secret-12345678901234567890123456789012","X-Request-ID":"northstar-review-12345678",...headers},
 body:JSON.stringify(payload)
});
function makeDb({intent=pending,changes=1}={}){
 const state={reads:[],write:null};
 const db={
  state,
  prepare(sql){
   const stmt={sql,args:[],bind(...args){this.args=args;return this;},
    async first(){state.reads.push(sql);return sql.includes("FROM paper_trade_intents")?intent:null;},
    async run(){state.write={sql,args:this.args};return {meta:{changes}};}
   };
   return stmt;
  }
 };
 return db;
}
const environment=(db,extra={})=>({...config,NORTHSTAR_DB:db,...extra});

test("intent review requires a distinct reviewer credential and configured reviewer identity",async()=>{
 const db=makeDb();
 const noToken=await onRequestPost({request:request(),env:{...config,NORTHSTAR_DB:db,NORTHSTAR_INTENT_REVIEW_TOKEN:""}});
 assert.equal(noToken.status,503);
 const reused=await onRequestPost({request:request(),env:{...config,NORTHSTAR_DB:db,NORTHSTAR_INTENT_REVIEW_TOKEN:config.NORTHSTAR_OPERATOR_TOKEN}});
 assert.equal(reused.status,503);
 const missingIdentity=await onRequestPost({request:request(),env:{...config,NORTHSTAR_DB:db,NORTHSTAR_INTENT_REVIEWER:""}});
 assert.equal(missingIdentity.status,503);
 assert.equal(db.state.reads.length,0);
});

test("intent review rejects an incorrect reviewer credential before reading the ledger",async()=>{
 const db=makeDb();
 const r=await onRequestPost({request:request(body(),{"X-NORTHSTAR-INTENT-REVIEW":"wrong"}),env:environment(db)});
 assert.equal(r.status,401);
 assert.equal(db.state.reads.length,0);
});

test("approval re-runs fresh preflight and atomically records reviewer attribution without a broker order",async()=>{
 const db=makeDb(),env=environment(db);
 const r=await onRequestPost({request:request(),env});
 const result=await r.json();
 assert.equal(r.status,200);
 assert.equal(result.ok,true);
 assert.equal(result.execution,false);
 assert.equal(result.brokerOrderCreated,false);
 assert.equal(result.status,"APPROVED_REVIEW_ONLY");
 assert.equal(result.reviewer,"Independent Risk Reviewer");
 assert.equal(env.preflightCalls,1);
 assert.equal(db.state.write.args[0],"APPROVED_REVIEW_ONLY");
 assert.equal(db.state.write.args[1],"Independent Risk Reviewer");
 assert.equal(db.state.write.args[5],result.decidedAt);
 assert.equal(db.state.write.args[6],id);
 const evidence=JSON.parse(db.state.write.args[4]);
 assert.equal(evidence.review.decision,"APPROVE");
 assert.equal(evidence.review.requestId,"northstar-review-12345678");
 assert.equal(evidence.review.preflight.shares,1);
});

test("stale preflight sizing cannot be approved and leaves the intent pending",async()=>{
 const db=makeDb(),env=environment(db,{preflightResponse:Response.json({
  ok:true,execution:false,status:"PREFLIGHT_PASSED_PREVIEW_ONLY_NOT_AN_ORDER",
  shares:2,estimatedEntryPrice:100,stopPrice:95,estimatedNotionalUsd:200,plannedStopRiskUsd:10
 })});
 const r=await onRequestPost({request:request(),env});
 assert.equal(r.status,409);
 assert.equal((await r.json()).ok,false);
 assert.equal(env.preflightCalls,1);
 assert.equal(db.state.write,null);
});

test("rejection records a reviewer decision without running preflight or creating a broker order",async()=>{
 const db=makeDb(),env=environment(db);
 const r=await onRequestPost({request:request(body("REJECT")),env});
 const result=await r.json();
 assert.equal(r.status,200);
 assert.equal(result.status,"REJECTED");
 assert.equal(result.execution,false);
 assert.equal(result.brokerOrderCreated,false);
 assert.equal(env.preflightCalls||0,0);
 assert.equal(db.state.write.args[0],"REJECTED");
 assert.equal(db.state.write.args[1],"Independent Risk Reviewer");
});

test("already reviewed intents cannot be approved or rejected again",async()=>{
 const db=makeDb({intent:{...pending,status:"APPROVED_REVIEW_ONLY",reviewer:"Independent Risk Reviewer"}});
 const env=environment(db);
 const r=await onRequestPost({request:request(),env});
 assert.equal(r.status,409);
 assert.equal(env.preflightCalls||0,0);
 assert.equal(db.state.write,null);
});

test("a concurrent decision that loses the pending-status compare-and-set is rejected",async()=>{
 const db=makeDb({changes:0}),env=environment(db);
 const r=await onRequestPost({request:request(),env});
 assert.equal(r.status,409);
 assert.equal(env.preflightCalls,1);
 assert.equal(db.state.write.args[0],"APPROVED_REVIEW_ONLY");
});

test("review requires a meaningful note and exact confirmation",async()=>{
 const db=makeDb(),env=environment(db);
 const short=await onRequestPost({request:request(body("APPROVE",{note:"ok"})),env});
 assert.equal(short.status,400);
 const wrong=await onRequestPost({request:request(body("APPROVE",{confirmation:"yes"})),env});
 assert.equal(wrong.status,400);
 assert.equal(db.state.write,null);
});
