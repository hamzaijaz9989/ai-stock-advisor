import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {onRequestPost} from "../web/functions/api/paper/snapshot.js";
import {makeToken,publicJwk} from "./helpers/github-actions-oidc-fixture.mjs";

const url="https://northstar.test/api/paper/snapshot";
function guardedEnv(){
 return {
  NORTHSTAR_OPERATOR_TOKEN:"synthetic-operator-token",
  ALPACA_API_KEY_ID:"synthetic-paper-key",
  ALPACA_API_SECRET_KEY:"synthetic-paper-secret",
  NORTHSTAR_DB:{prepare(){throw new Error("D1 must not be touched before OIDC authentication.");}}
 };
}

test("read-only snapshot endpoint rejects missing OIDC authorization before D1 or provider access",async()=>{
 const response=await onRequestPost({request:new Request(url,{method:"POST"}),env:guardedEnv()});
 assert.equal(response.status,401);
 assert.deepEqual(await response.json(),{ok:false,error:"Unauthorized.",execution:false});
});

test("read-only snapshot endpoint rejects malformed OIDC before D1 or provider access",async()=>{
 const response=await onRequestPost({
  request:new Request(url,{method:"POST",headers:{Authorization:"Bearer not.a.jwt"}}),
  env:guardedEnv()
 });
 assert.equal(response.status,401);
 assert.deepEqual(await response.json(),{ok:false,error:"Unauthorized GitHub Actions identity.",execution:false});
});

test("scheduled snapshot workflow uses pinned OIDC and never requires a GitHub operator secret",()=>{
 const workflow=readFileSync(new URL("../.github/workflows/northstar-equity-snapshot.yml",import.meta.url),"utf8");
 assert.match(workflow,/permissions:\s*\n\s*contents:\s*read\s*\n\s*id-token:\s*write/);
 assert.match(workflow,/ACTIONS_ID_TOKEN_REQUEST_URL/);
 assert.match(workflow,/ACTIONS_ID_TOKEN_REQUEST_TOKEN/);
 assert.ok(workflow.includes('base="https://ai-stock-advisor.pages.dev/api/paper"'));
 assert.ok(workflow.includes('"$base/snapshot"'));
 assert.match(workflow,/executionEnabled == false/);
 assert.match(workflow,/killSwitchEngaged == true/);
 assert.match(workflow,/automatedOrderSubmission == false/);
 assert.match(workflow,/cancel-in-progress:\s*false/);
 assert.doesNotMatch(workflow,/secrets\.NORTHSTAR_OPERATOR_TOKEN/);
 assert.doesNotMatch(workflow,/\/api\/paper\/(sync|reconcile)/);
});

function memoryDb() {
 const state={snapshots:[],positions:[],orders:[],audit:[],batchCount:0};
 const control={enabled:0,mode:"paper",kill_switch:1};
 const storeAudit=args=>state.audit.push({
  actor:args[0],action:args[1],outcome:args[2],request_id:args[3],
  details_json:args[4],occurred_at:new Date().toISOString()
 });
 return {
  state,
  prepare(sql) {
   return {
    sql,args:[],
    bind(...args){this.args=args;return this;},
    async first(){
     if(sql.includes("FROM execution_control"))return control;
     if(sql.includes("FROM execution_audit_log")){
      const [action,outcome,requestId]=this.args;
      return state.audit.filter(row=>row.action===action&&row.outcome===outcome&&row.request_id===requestId).at(-1)||null;
     }
     if(sql.includes("FROM paper_equity_snapshots")){
      const [capturedAt]=this.args;
      return state.snapshots.find(row=>row.captured_at===capturedAt)||null;
     }
     throw new Error("Unexpected D1 first query: "+sql);
    },
    async all(){
     if(sql.includes("FROM paper_positions"))return {results:state.positions.map(row=>({...row}))};
     if(sql.includes("FROM paper_orders"))return {results:state.orders.map(row=>({...row}))};
     throw new Error("Unexpected D1 all query: "+sql);
    },
    async run(){
     if(sql.startsWith("INSERT INTO execution_audit_log")){storeAudit(this.args);return {meta:{changes:1}};}
     throw new Error("Unexpected D1 run query: "+sql);
    }
   };
  },
  async batch(statements){
   state.batchCount++;
   for(const statement of statements){
    const args=statement.args||[];
    if(statement.sql.includes("INSERT INTO paper_equity_snapshots")){
     state.snapshots.push({captured_at:args[0],equity_usd:args[1],cash_usd:args[2],buying_power_usd:args[3],day_pl_usd:args[4],source:args[5]});
    }else if(statement.sql.includes("DELETE FROM paper_positions")){
     state.positions=[];
    }else if(statement.sql.includes("INSERT INTO paper_positions")){
     state.positions.push({symbol:args[0],qty:args[1],avg_entry_price:args[2]});
    }else if(statement.sql.startsWith("INSERT INTO execution_audit_log")){
     storeAudit(args);
    }else{
     throw new Error("Unexpected D1 batch statement: "+statement.sql);
    }
   }
   return statements.map(()=>({success:true}));
  }
 };
}
function snapshotEnv(db) {
 return {NORTHSTAR_DB:db,NORTHSTAR_OPERATOR_TOKEN:"synthetic-operator-token",ALPACA_API_KEY_ID:"synthetic-paper-key",ALPACA_API_SECRET_KEY:"synthetic-paper-secret"};
}
function mockSnapshotFetch({brokerOrders=[],calls=[]}={}) {
 return async (input,init={})=>{
  const url=String(input),method=String(init.method||"GET").toUpperCase();
  calls.push({url,method});
  if(url==="https://token.actions.githubusercontent.com/.well-known/jwks")return Response.json({keys:[publicJwk]});
  if(url==="https://paper-api.alpaca.markets/v2/account")return Response.json({status:"ACTIVE",currency:"USD",equity:"100000",cash:"100000",buying_power:"400000",last_equity:"99900"});
  if(url==="https://paper-api.alpaca.markets/v2/positions")return Response.json([]);
  if(url.startsWith("https://paper-api.alpaca.markets/v2/orders"))return Response.json(brokerOrders);
  throw new Error("Unexpected snapshot test fetch: "+url);
 };
}

test("OIDC snapshot performs read-only pre/post reconciliation, persists one snapshot and replays idempotently", {concurrency:false}, async()=>{
 const db=memoryDb(),token=makeToken(),calls=[],oldFetch=globalThis.fetch;
 globalThis.fetch=mockSnapshotFetch({calls});
 try{
  const request=()=>new Request(url,{method:"POST",headers:{Authorization:"Bearer "+token}});
  const first=await onRequestPost({request:request(),env:snapshotEnv(db)});
  const firstBody=await first.json();
  assert.equal(first.status,200);
  assert.equal(firstBody.ok,true);
  assert.equal(firstBody.synced,true);
  assert.equal(firstBody.reconciled,true);
  assert.equal(firstBody.execution,false);
  assert.equal(firstBody.automatedOrderSubmission,false);
  assert.equal(firstBody.mode,"paper");
  assert.equal(firstBody.positionCount,0);
  assert.equal(firstBody.replayed,false);
  assert.equal(db.state.snapshots.length,1);
  assert.equal(db.state.snapshots[0].source,"alpaca_paper_read_only_sync");
  assert.equal(db.state.audit.filter(row=>row.action==="READ_ONLY_ACCOUNT_SYNC").length,1);
  assert.equal(db.state.audit.filter(row=>row.action==="READ_ONLY_OIDC_SNAPSHOT").length,1);
  const brokerCallsAfterFirst=calls.filter(call=>call.url.startsWith("https://paper-api.alpaca.markets")).length;
  const second=await onRequestPost({request:request(),env:snapshotEnv(db)});
  const secondBody=await second.json();
  assert.equal(second.status,200);
  assert.equal(secondBody.replayed,true);
  assert.equal(secondBody.execution,false);
  assert.equal(db.state.batchCount,1);
  assert.equal(db.state.snapshots.length,1);
  assert.equal(db.state.audit.length,2);
  assert.equal(calls.filter(call=>call.url.startsWith("https://paper-api.alpaca.markets")).length,brokerCallsAfterFirst);
  assert.ok(calls.every(call=>call.method==="GET"),"OIDC verification and broker access must remain GET-only");
 }finally{globalThis.fetch=oldFetch;}
});

test("OIDC snapshot blocks a broker-ledger mismatch before any equity snapshot write", {concurrency:false}, async()=>{
 const db=memoryDb(),token=makeToken(),calls=[],oldFetch=globalThis.fetch;
 globalThis.fetch=mockSnapshotFetch({brokerOrders:[{id:"untracked-order",symbol:"NVDA",side:"buy",qty:"1",status:"new",filled_qty:"0"}],calls});
 try{
  const response=await onRequestPost({
   request:new Request(url,{method:"POST",headers:{Authorization:"Bearer "+token}}),
   env:snapshotEnv(db)
  });
  const body=await response.json();
  assert.equal(response.status,409);
  assert.equal(body.reconciled,false);
  assert.equal(body.execution,false);
  assert.equal(body.status,"RECONCILIATION_MISMATCH_FAIL_CLOSED");
  assert.equal(db.state.batchCount,0);
  assert.equal(db.state.snapshots.length,0);
  assert.equal(db.state.audit.length,0);
  assert.ok(calls.some(call=>call.url.startsWith("https://paper-api.alpaca.markets/v2/orders")));
 }finally{globalThis.fetch=oldFetch;}
});
