import test from "node:test";
import assert from "node:assert/strict";
import {activatePaperExecution} from "../web/functions/api/paper/activate.js";

const now=Date.parse("2026-11-09T20:56:00.000Z");
const accountId="11111111-1111-4111-8111-111111111111";
const migrations=[
 "0001_paper_trading.sql","0002_research_decision_traces.sql","0003_research_council_runs.sql",
 "0004_broker_fill_activities.sql","0005_paper_trade_intents.sql","0006_northstar_fill_position_ledger.sql",
 "0007_strategy_validation_approval.sql","0008_paper_execution_single_flight.sql",
 "0009_paper_submission_boundary.sql","0010_paper_intent_review_audit.sql",
 "0011_continuous_market_monitor.sql","0012_paper_execution_activation_audit.sql"
];
const response=(body,status=200)=>new Response(JSON.stringify(body),{status,headers:{"content-type":"application/json"}});
function env(db,overrides={}){
 return {
  NORTHSTAR_OPERATOR_TOKEN:"operator-token-with-more-than-16-chars",
  NORTHSTAR_INTENT_REVIEW_TOKEN:"review-token-with-at-least-32-characters",
  NORTHSTAR_INTENT_REVIEWER:"Independent Intent Reviewer",
  NORTHSTAR_PAPER_EXECUTION_APPROVAL_TOKEN:"paper-approval-token-with-at-least-32-chars",
  NORTHSTAR_PAPER_EXECUTION_APPROVER:"Hamza Ijaz",
  NORTHSTAR_PAPER_ACCOUNT_ID:accountId,
  ALPACA_API_KEY_ID:"paper-key-fixture",
  ALPACA_API_SECRET_KEY:"paper-secret-fixture",
  NORTHSTAR_DB:db,
  ...overrides
 };
}
function makeDb(overrides={}){
 const latest=new Date(now-5000).toISOString(),weekly=new Date(now-8*24*60*60*1000).toISOString();
 const state={
  control:{enabled:0,mode:"paper",kill_switch:1,max_portfolio_usd:1000,default_risk_fraction:0.005,max_risk_fraction:0.01,max_position_fraction:0.25},
  strategyApproval:{approved:1,strategy_version:"northstar-provisional-gates-v1",report_version:1,report_sha256:"a".repeat(64),report_uri:"https://example.test/report",approved_at:new Date(now-60000).toISOString(),reviewer:"Independent Strategy Reviewer"},
  snapshots:[{captured_at:latest,equity_usd:100000},{captured_at:weekly,equity_usd:100000}],
  orders:0,positions:0,pendingIntents:0,claim:null,migrations:[...migrations],
  event:null,audit:null,requests:[],batchCalls:0,casChanges:1,
  ...overrides
 };
 const db={
  state,
  prepare(sql){
   const statement={sql,args:[],bind(...args){this.args=args;return this;},
    async first(){
     if(sql.includes("FROM execution_control"))return {...state.control};
     if(sql.includes("FROM northstar_strategy_approval"))return {...state.strategyApproval};
     if(sql.includes("COUNT(*) AS n FROM paper_orders"))return {n:state.orders};
     if(sql.includes("COUNT(*) AS n FROM paper_positions"))return {n:state.positions};
     if(sql.includes("COUNT(*) AS n FROM paper_trade_intents"))return {n:state.pendingIntents};
     if(sql.includes("FROM paper_execution_claims"))return state.claim?{...state.claim}:null;
     if(sql.includes("FROM paper_execution_activation_events"))return state.event?{...state.event}:null;
     if(sql.includes("FROM execution_audit_log"))return state.audit?{...state.audit}:null;
     return null;
    },
    async all(){
     if(sql.includes("FROM d1_migrations"))return {results:state.migrations.map(name=>({name}))};
     if(sql.includes("FROM paper_equity_snapshots"))return {results:state.snapshots};
     return {results:[]};
    },
    async run(){
     if(sql.startsWith("UPDATE execution_control SET enabled=0,kill_switch=1")){
      state.control={...state.control,enabled:0,kill_switch:1,updated_at:statement.args[0]};
      return {meta:{changes:1}};
     }
     return {meta:{changes:1}};
    }
   };
   return statement;
  },
  async batch(statements){
   state.batchCalls++;
   state.requests.push(statements[0].args);
   if(state.casChanges===0)return [{meta:{changes:1}},{meta:{changes:0}}];
   const req=statements[0].args,upd=statements[1].args;
   state.control={...state.control,enabled:1,kill_switch:0,last_activation_request_id:upd[0],updated_at:upd[1]};
   state.event={request_id:req[0],event_type:"PAPER_EXECUTION_ENABLED",actor:req[1],outcome:"SUCCESS",occurred_at:upd[1]};
   state.audit={request_id:req[0],actor:req[1],action:"ENABLE_PAPER_EXECUTION",outcome:"SUCCESS"};
   return [{meta:{changes:1}},{meta:{changes:1}}];
  }
 };
 return db;
}
function makeRequest(overrides={}){
 const headers={
  "content-type":"application/json",
  "Authorization":"Bearer operator-token-with-more-than-16-chars",
  "X-NORTHSTAR-PAPER-EXECUTION-APPROVAL":"paper-approval-token-with-at-least-32-chars",
  "X-Request-ID":"activation-test-request-0001",
  ...overrides.headers
 };
 return new Request("https://northstar.test/api/paper/activate",{
  method:"POST",headers,
  body:JSON.stringify(overrides.body||{action:"ENABLE_PAPER_EXECUTION",confirmation:"ENABLE_PAPER_EXECUTION"})
 });
}
function dependencies(overrides={}){
 const calls={sync:0,fill:0,reconcile:0,broker:[]};
 const reconciliation={
  ok:true,reconciled:true,execution:false,status:"RECONCILIATION_PASSED_READ_ONLY",
  checkedAt:new Date(now-10000).toISOString(),
  counts:{brokerPositions:0,ledgerPositions:0,fillDerivedPositions:0,brokerOrders:0,ledgerOrders:0},
  mismatches:{positions:[],fillDerivedPositions:[],orders:[]}
 };
 const deps={
  now:()=>now,randomUUID:()=>"activation-generated-request-0001",
  runSync:async()=>{calls.sync++;return response({ok:true,synced:true,execution:false});},
  runFillSync:async()=>{calls.fill++;return response({ok:true,safeToContinue:true,requiresManualRecovery:false,execution:false,status:"FILL_IMPORT_AND_ORDER_SYNC_PASSED_READ_ONLY"});},
  runReconcile:async()=>{calls.reconcile++;return response(reconciliation);},
  broker:async path=>{
   calls.broker.push(path);
   if(path==="/v2/account")return {id:accountId,status:"ACTIVE",currency:"USD",equity:100000,last_equity:100000,buying_power:400000,trading_blocked:false,account_blocked:false};
   if(path==="/v2/stocks/SPY/quotes/latest?feed=iex")return {quote:{bp:100,ap:100.1,t:new Date(now-5000).toISOString()}};
   if(path==="/v2/clock")return {is_open:true};
   throw new Error("Unexpected broker path");
  },
  ...overrides
 };
 return {deps,calls,reconciliation};
}

test("PAPER activation runs only read-only sync/reconciliation and atomically records approval",async()=>{
 const db=makeDb(),{deps,calls}=dependencies();
 const result=await activatePaperExecution({request:makeRequest(),env:env(db),dependencies:deps});
 const body=await result.json();
 assert.equal(result.status,200);
 assert.equal(body.ok,true);
 assert.equal(body.executionEnabled,true);
 assert.equal(body.killSwitchEngaged,false);
 assert.equal(body.brokerOrderCreated,false);
 assert.equal(body.brokerOrdersSubmitted,false);
 assert.equal(db.state.control.enabled,1);
 assert.equal(db.state.control.kill_switch,0);
 assert.equal(db.state.event.event_type,"PAPER_EXECUTION_ENABLED");
 assert.equal(db.state.audit.action,"ENABLE_PAPER_EXECUTION");
 assert.deepEqual(calls.broker,["/v2/account","/v2/stocks/SPY/quotes/latest?feed=iex","/v2/clock"]);
 assert.deepEqual([calls.sync,calls.fill,calls.reconcile],[1,1,1]);
 assert.equal(db.state.orders,0);
 assert.equal(db.state.batchCalls,1);
});

test("missing migration blocks before sync, broker calls or control writes",async()=>{
 const db=makeDb({migrations:migrations.filter(name=>name!=="0012_paper_execution_activation_audit.sql")});
 const {deps,calls}=dependencies();
 const result=await activatePaperExecution({request:makeRequest(),env:env(db),dependencies:deps});
 const body=await result.json();
 assert.equal(result.status,503);
 assert.ok(body.missingMigrations.includes("0012_paper_execution_activation_audit.sql"));
 assert.deepEqual([calls.sync,calls.fill,calls.reconcile,calls.broker.length,db.state.batchCalls],[0,0,0,0,0]);
});

test("separate approval credential is mandatory and checked before any side effect",async()=>{
 const db=makeDb(),{deps,calls}=dependencies();
 const req=makeRequest({headers:{"X-NORTHSTAR-PAPER-EXECUTION-APPROVAL":"wrong-approval-token"}});
 const result=await activatePaperExecution({request:req,env:env(db),dependencies:deps});
 assert.equal(result.status,401);
 assert.deepEqual([calls.sync,calls.fill,calls.reconcile,calls.broker.length,db.state.batchCalls],[0,0,0,0,0]);
});

test("unsafe fill import blocks reconciliation and activation",async()=>{
 const db=makeDb(),{deps,calls}=dependencies();
 deps.runFillSync=async()=>{calls.fill++;return response({ok:false,safeToContinue:false,requiresManualRecovery:true,execution:false,status:"MANUAL_RECOVERY_REQUIRED"},409);};
 const result=await activatePaperExecution({request:makeRequest(),env:env(db),dependencies:deps});
 assert.equal(result.status,409);
 assert.equal(calls.sync,1);
 assert.equal(calls.fill,1);
 assert.equal(calls.reconcile,0);
 assert.equal(calls.broker.length,0);
 assert.equal(db.state.batchCalls,0);
});

test("non-clean reconciliation blocks before account quote checks or control changes",async()=>{
 const db=makeDb(),{deps,calls}=dependencies();
 deps.runReconcile=async()=>{calls.reconcile++;return response({ok:false,reconciled:false,execution:false,status:"RECONCILIATION_MISMATCH_FAIL_CLOSED"},409);};
 const result=await activatePaperExecution({request:makeRequest(),env:env(),dependencies:deps});
 assert.equal(result.status,409);
 assert.equal(calls.reconcile,1);
 assert.equal(calls.broker.length,0);
 assert.equal(db.state.batchCalls,0);
});

test("strategy approval and seven-day history are checked before the atomic enable",async()=>{
 const db=makeDb({strategyApproval:{approved:0}});
 const {deps,calls}=dependencies();
 const result=await activatePaperExecution({request:makeRequest(),env:env(),dependencies:{...deps,db}});
 const body=await result.json();
 assert.equal(result.status,409);
 assert.equal(body.gateReason,"STRATEGY_VALIDATION_NOT_APPROVED");
 assert.equal(db.state.batchCalls,0);
 assert.equal(calls.broker.length,3);

 const db2=makeDb({snapshots:[{captured_at:new Date(now-5000).toISOString(),equity_usd:100000}]});
 const result2=await activatePaperExecution({request:makeRequest(),env:env(db2),dependencies:deps});
 const body2=await result2.json();
 assert.equal(result2.status,409);
 assert.equal(body2.gateReason,"SEVEN_DAY_EQUITY_HISTORY_UNAVAILABLE");
 assert.equal(db2.state.batchCalls,0);
});

test("compare-and-set race cannot report PAPER activation",async()=>{
 const db=makeDb({casChanges:0}),{deps}=dependencies();
 const result=await activatePaperExecution({request:makeRequest(),env:env(),dependencies:{...deps,db}});
 const body=await result.json();
 assert.equal(result.status,409);
 assert.equal(body.ok,false);
 assert.equal(db.state.control.enabled,0);
 assert.equal(db.state.control.kill_switch,1);
 assert.equal(db.state.event,null);
});

test("activation rejects a pending intent or existing claim before control mutation",async()=>{
 const db=makeDb({pendingIntents:1}),{deps}=dependencies();
 const result=await activatePaperExecution({request:makeRequest(),env:env(),dependencies:{...deps,db}});
 const body=await result.json();
 assert.equal(result.status,409);
 assert.equal(body.gateReason,"NORTHSTAR_LEDGER_NOT_FLAT_OR_HAS_PENDING_INTENTS");
 assert.equal(db.state.batchCalls,0);
});
