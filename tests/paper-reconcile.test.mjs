import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

async function loadFunction() {
  const helper=await readFile(new URL("../web/lib/paper-execution-policy.js",import.meta.url),"utf8");
  const helperUrl="data:text/javascript;base64,"+Buffer.from(helper).toString("base64");
  let source=await readFile(new URL("../web/functions/api/paper/reconcile.js",import.meta.url),"utf8");
  source=source.replace('from "../../../lib/paper-execution-policy.js"','from "'+helperUrl+'"');
  return import("data:text/javascript;base64,"+Buffer.from(source).toString("base64"));
}
const control={enabled:0,mode:"paper",kill_switch:1};
function mockDb({positions=[],orders=[],fillDerivedPositions=[]}={}) {
  return {prepare(sql) {
    return {async first(){assert.match(sql,/execution_control/);return control;},
      async all(){if(/paper_position_lots/.test(sql))return {results:fillDerivedPositions};if(/paper_positions/.test(sql))return {results:positions};if(/paper_orders/.test(sql)){assert.match(sql,/response_json/,"reconciliation must read the stored fill snapshot");return {results:orders};}throw new Error("unexpected SQL");}};
  }};
}
function request(token="secret") {
  return new Request("https://northstar.test/api/paper/reconcile",{method:"POST",headers:{"Authorization":"Bearer "+token}});
}
function fakeFetch({positions=[],orders=[]}={}) {
  return async url=>{
    const u=String(url);
    if(u.includes("/v2/account"))return Response.json({status:"ACTIVE",currency:"USD"});
    if(u.includes("/v2/positions"))return Response.json(positions);
    if(u.includes("/v2/orders"))return Response.json(orders);
    throw new Error("unexpected URL "+u);
  };
}
async function run({db=mockDb(),broker={},token="secret"}={}) {
  const {onRequestPost}=await loadFunction();
  const oldFetch=globalThis.fetch;globalThis.fetch=fakeFetch(broker);
  try{return await onRequestPost({request:request(token),env:{NORTHSTAR_DB:db,NORTHSTAR_OPERATOR_TOKEN:"secret",ALPACA_API_KEY_ID:"key",ALPACA_API_SECRET_KEY:"secret"}});}
  finally{globalThis.fetch=oldFetch;}
}
test("reconciliation rejects missing operator authentication",async()=>{
  const response=await run({token:"wrong"});
  assert.equal(response.status,401);
});
test("reconciliation passes when broker and ledger positions and orders match",async()=>{
  const positions=[{symbol:"AAPL",qty:"2",avg_entry_price:"100"}];
  const orders=[{id:"broker-1",symbol:"AAPL",side:"buy",qty:"2",status:"filled",filled_qty:"2",filled_avg_price:"100",order_class:"oto",legs:[{order_group_role:"stop_loss",type:"stop",status:"new",symbol:"AAPL",side:"sell",qty:"2",stop_price:"98"}]}];
  const db=mockDb({positions,fillDerivedPositions:positions,orders:[{id:"ledger-1",broker_order_id:"broker-1",symbol:"AAPL",side:"buy",qty:2,stop_price:98,status:"FILLED",response_json:JSON.stringify({filled_qty:"2",filled_avg_price:"100"})}]});
  const response=await run({db,broker:{positions,orders}});
  const body=await response.json();
  assert.equal(response.status,200);
  assert.equal(body.status,"RECONCILIATION_PASSED_READ_ONLY");
  assert.equal(body.execution,false);
});
test("reconciliation flags position quantity or average-entry mismatch",async()=>{
  const db=mockDb({positions:[{symbol:"AAPL",qty:2,avg_entry_price:100}]});
  const response=await run({db,broker:{positions:[{symbol:"AAPL",qty:"1",avg_entry_price:"100"}]}});
  const body=await response.json();
  assert.equal(response.status,409);
  assert.equal(body.mismatches.positions.length,1);
});
test("reconciliation flags broker orders missing from the ledger",async()=>{
  const response=await run({broker:{orders:[{id:"untracked",symbol:"MSFT",side:"buy",qty:"1",status:"new"}]}});
  const body=await response.json();
  assert.equal(response.status,409);
  assert.equal(body.mismatches.orders[0].reason,"BROKER_ORDER_MISSING_FROM_LEDGER");
});
test("reconciliation flags ledger orders without broker IDs or broker matches",async()=>{
  const db=mockDb({orders:[
    {id:"ledger-no-id",broker_order_id:null,symbol:"AAPL",side:"buy",qty:1,status:"new"},
    {id:"ledger-missing",broker_order_id:"gone",symbol:"MSFT",side:"buy",qty:1,status:"new"}
  ]});
  const response=await run({db});
  const body=await response.json();
  assert.equal(response.status,409);
  assert.deepEqual(body.mismatches.orders.map(x=>x.reason),["LEDGER_ORDER_MISSING_BROKER_ID","LEDGER_ORDER_NOT_FOUND_AT_BROKER"]);
});

test("reconciliation flags order status mismatch",async()=>{
  const db=mockDb({orders:[{id:"ledger-1",broker_order_id:"broker-1",symbol:"AAPL",side:"buy",qty:2,status:"NEW",response_json:JSON.stringify({filled_qty:"0"})}]});
  const response=await run({db,broker:{orders:[{id:"broker-1",symbol:"AAPL",side:"buy",qty:"2",status:"filled",filled_qty:"2",filled_avg_price:"100"}]}});
  const body=await response.json();
  assert.equal(response.status,409);
  assert.ok(body.mismatches.orders.some(x=>x.reason==="ORDER_STATUS_DIFFER"));
});
test("reconciliation fails closed when cumulative fill data is missing from ledger",async()=>{
  const db=mockDb({orders:[{id:"ledger-1",broker_order_id:"broker-1",symbol:"AAPL",side:"buy",qty:2,status:"FILLED"}]});
  const response=await run({db,broker:{orders:[{id:"broker-1",symbol:"AAPL",side:"buy",qty:"2",status:"filled",filled_qty:"2",filled_avg_price:"100"}]}});
  const body=await response.json();
  assert.equal(response.status,409);
  assert.ok(body.mismatches.orders.some(x=>x.reason==="FILLED_QUANTITY_NOT_RECONCILED"));
  assert.ok(body.mismatches.orders.some(x=>x.reason==="AVERAGE_FILL_PRICE_NOT_RECONCILED"));
});
test("reconciliation flags duplicate broker order IDs",async()=>{
  const orders=[{id:"dup",symbol:"AAPL",side:"buy",qty:"1",status:"new",filled_qty:"0"},{id:"dup",symbol:"AAPL",side:"buy",qty:"1",status:"new",filled_qty:"0"}];
  const response=await run({broker:{orders}});
  const body=await response.json();
  assert.equal(response.status,409);
  assert.ok(body.mismatches.orders.some(x=>x.reason==="MISSING_OR_DUPLICATE_BROKER_ORDER_ID"));
});

test("reconciliation fails closed when broker data is unavailable",async()=>{
  const {onRequestPost}=await loadFunction();
  const oldFetch=globalThis.fetch;globalThis.fetch=async()=>new Response("unavailable",{status:503});
  try{
    const response=await onRequestPost({request:request(),env:{NORTHSTAR_DB:mockDb(),NORTHSTAR_OPERATOR_TOKEN:"secret",ALPACA_API_KEY_ID:"key",ALPACA_API_SECRET_KEY:"secret"}});
    assert.equal(response.status,503);
  }finally{globalThis.fetch=oldFetch;}
});


test("reconciliation normalizes Alpaca new status to Northstar ACCEPTED",async()=>{
  const db=mockDb({orders:[{id:"ledger-new",broker_order_id:"broker-new",symbol:"AAPL",side:"buy",qty:1,stop_price:98,status:"ACCEPTED",response_json:JSON.stringify({filled_qty:"0"})}]});
  const response=await run({db,broker:{orders:[{id:"broker-new",symbol:"AAPL",side:"buy",qty:"1",status:"new",filled_qty:"0",order_class:"oto",legs:[{order_group_role:"stop_loss",type:"stop",status:"held",symbol:"AAPL",side:"sell",qty:"1",stop_price:"98"}]}]}});
  const body=await response.json();
  assert.equal(response.status,200);
  assert.equal(body.reconciled,true);
});

test("reconciliation keeps unknown broker order states fail-closed",async()=>{
  const db=mockDb({orders:[{id:"ledger-1",broker_order_id:"broker-1",symbol:"AAPL",side:"buy",qty:1,status:"ACCEPTED",response_json:JSON.stringify({filled_qty:"0"})}]});
  const response=await run({db,broker:{orders:[{id:"broker-1",symbol:"AAPL",side:"buy",qty:"1",status:"done_for_day",filled_qty:"0"}]}});
  const body=await response.json();
  assert.equal(response.status,409);
  assert.ok(body.mismatches.orders.some(x=>x.reason==="ORDER_STATUS_DIFFER" && x.brokerStatus==="UNKNOWN"));
});

test("reconciliation flags a missing or mismatched OTO protective stop leg",async()=>{
  const ledger={id:"ledger-oto",broker_order_id:"broker-oto",symbol:"AAPL",side:"buy",qty:2,stop_price:98,status:"ACCEPTED",response_json:JSON.stringify({filled_qty:"0"})};
  const broker={id:"broker-oto",symbol:"AAPL",side:"buy",qty:"2",status:"new",filled_qty:"0",order_class:"oto",legs:[]};
  const response=await run({db:mockDb({orders:[ledger]}),broker:{orders:[broker]}});
  const body=await response.json();
  assert.equal(response.status,409);
  assert.ok(body.mismatches.orders.some(x=>x.reason==="PROTECTIVE_STOP_LEG_NOT_RECONCILED"));
});

test("reconciliation rejects nonterminal orders with no ledger protective stop price",async()=>{
  const db=mockDb({orders:[{id:"ledger-no-stop",broker_order_id:"broker-no-stop",symbol:"AAPL",side:"buy",qty:1,stop_price:null,status:"ACCEPTED",response_json:JSON.stringify({filled_qty:"0"})}]});
  const response=await run({db,broker:{orders:[{id:"broker-no-stop",symbol:"AAPL",side:"buy",qty:"1",status:"new",filled_qty:"0"}]}});
  const body=await response.json();
  assert.equal(response.status,409);
  assert.ok(body.mismatches.orders.some(x=>x.reason==="PROTECTIVE_STOP_PRICE_MISSING"));
});

test("reconciliation does not exempt rejected broker orders with nonzero fills from stop verification",async()=>{
  const db=mockDb({orders:[{id:"ledger-rejected-partial",broker_order_id:"broker-rejected-partial",symbol:"AAPL",side:"buy",qty:2,stop_price:98,status:"REJECTED",response_json:JSON.stringify({filled_qty:"1",filled_avg_price:"100"})}]});
  const response=await run({db,broker:{orders:[{id:"broker-rejected-partial",symbol:"AAPL",side:"buy",qty:"2",status:"rejected",filled_qty:"1",filled_avg_price:"100",order_class:"oto",legs:[]}]}});
  const body=await response.json();
  assert.equal(response.status,409);
  assert.ok(body.mismatches.orders.some(x=>x.reason==="PROTECTIVE_STOP_LEG_NOT_RECONCILED"));
});


test("reconciliation rejects broker positions that are absent from the independent fill-derived ledger",async()=>{
 const positions=[{symbol:"AAPL",qty:2,avg_entry_price:100}];
 const response=await run({db:mockDb({positions,fillDerivedPositions:[]}),broker:{positions,orders:[]}});
 const body=await response.json();
 assert.equal(response.status,409);
 assert.ok(body.mismatches.fillDerivedPositions.some(x=>x.reason==="BROKER_FILL_DERIVED_POSITION_MISMATCH"&&x.symbol==="AAPL"));
});

test("reconciliation passes only when broker, snapshot mirror and fill-derived positions agree",async()=>{
 const positions=[{symbol:"AAPL",qty:2,avg_entry_price:100}];
 const response=await run({db:mockDb({positions,fillDerivedPositions:positions}),broker:{positions,orders:[]}});
 const body=await response.json();
 assert.equal(response.status,200);
 assert.equal(body.counts.fillDerivedPositions,1);
 assert.deepEqual(body.mismatches.fillDerivedPositions,[]);
});


test("reconciliation verifies standalone recovery GTC stop against exact remaining position",async()=>{
  const positions=[{symbol:"AAPL",qty:"2",avg_entry_price:"100"}];
  const brokerOrder={id:"recovery-broker",client_order_id:"recovery-ledger",symbol:"AAPL",side:"sell",qty:"2",status:"new",filled_qty:"0",filled_avg_price:null,type:"stop",time_in_force:"gtc",stop_price:"95",leaves_qty:"2"};
  const ledgerOrder={id:"recovery-ledger",broker_order_id:"recovery-broker",symbol:"AAPL",side:"sell",qty:2,stop_price:95,status:"ACCEPTED",response_json:JSON.stringify({filled_qty:"0"})};
  const db=mockDb({positions,fillDerivedPositions:positions,orders:[ledgerOrder]});
  const response=await run({db,broker:{positions,orders:[brokerOrder]}});
  const body=await response.json();
  assert.equal(response.status,200);
  assert.equal(body.reconciled,true);
});
test("reconciliation rejects standalone recovery stop with insufficient leaves quantity",async()=>{
  const positions=[{symbol:"AAPL",qty:"2",avg_entry_price:"100"}];
  const brokerOrder={id:"recovery-broker",client_order_id:"recovery-ledger",symbol:"AAPL",side:"sell",qty:"2",status:"new",filled_qty:"0",type:"stop",time_in_force:"gtc",stop_price:"95",leaves_qty:"1"};
  const ledgerOrder={id:"recovery-ledger",broker_order_id:"recovery-broker",symbol:"AAPL",side:"sell",qty:2,stop_price:95,status:"ACCEPTED",response_json:JSON.stringify({filled_qty:"0"})};
  const db=mockDb({positions,fillDerivedPositions:positions,orders:[ledgerOrder]});
  const response=await run({db,broker:{positions,orders:[brokerOrder]}});
  const body=await response.json();
  assert.equal(response.status,409);
  assert.ok(body.mismatches.orders.some(x=>x.reason==="STANDALONE_RECOVERY_STOP_DOES_NOT_COVER_POSITION"));
});


test("reconciliation accepts a terminal OTO parent protected by its linked standalone recovery stop",async()=>{
 const positions=[{symbol:"AAPL",qty:"2",avg_entry_price:"100",side:"long"}];
 const parentLedger={id:"entry-ledger",idempotency_key:"intent:entry",broker_order_id:"entry-broker",symbol:"AAPL",side:"buy",qty:5,stop_price:95,status:"CANCELED",response_json:JSON.stringify({filled_qty:"2",filled_avg_price:"100"})};
 const recoveryLedger={id:"recovery-ledger",idempotency_key:"recovery:entry-ledger",broker_order_id:"recovery-broker",symbol:"AAPL",side:"sell",qty:2,order_type:"stop",time_in_force:"gtc",stop_price:95,status:"ACCEPTED",response_json:JSON.stringify({filled_qty:"0",filled_avg_price:null})};
 const parentBroker={id:"entry-broker",client_order_id:"entry-ledger",order_class:"oto",symbol:"AAPL",side:"buy",qty:"5",filled_qty:"2",filled_avg_price:"100",status:"canceled",legs:[{id:"child-stop",symbol:"AAPL",side:"sell",type:"stop",qty:"5",filled_qty:"0",stop_price:"95",status:"canceled"}]};
 const recoveryBroker={id:"recovery-broker",client_order_id:"recovery-ledger",symbol:"AAPL",side:"sell",qty:"2",filled_qty:"0",filled_avg_price:null,status:"new",type:"stop",time_in_force:"gtc",stop_price:"95",leaves_qty:"2"};
 const db=mockDb({positions,fillDerivedPositions:positions,orders:[parentLedger,recoveryLedger]});
 const response=await run({db,broker:{positions,orders:[parentBroker,recoveryBroker]}});
 const body=await response.json();
 assert.equal(response.status,200);
 assert.equal(body.reconciled,true);
 assert.equal(body.mismatches.orders.length,0);
});
