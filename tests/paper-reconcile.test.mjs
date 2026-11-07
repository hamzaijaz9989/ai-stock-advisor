import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

async function loadFunction() {
  const source=await readFile(new URL("../web/functions/api/paper/reconcile.js",import.meta.url),"utf8");
  return import("data:text/javascript;base64,"+Buffer.from(source).toString("base64"));
}
const control={enabled:0,mode:"paper",kill_switch:1};
function mockDb({positions=[],orders=[]}={}) {
  return {prepare(sql) {
    return {async first(){assert.match(sql,/execution_control/);return control;},
      async all(){if(/paper_positions/.test(sql))return {results:positions};if(/paper_orders/.test(sql))return {results:orders};throw new Error("unexpected SQL");}};
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
  const orders=[{id:"broker-1",symbol:"AAPL",side:"buy",qty:"2",status:"filled",filled_qty:"2",filled_avg_price:"100"}];
  const db=mockDb({positions,orders:[{id:"ledger-1",broker_order_id:"broker-1",symbol:"AAPL",side:"buy",qty:2,status:"FILLED",response_json:JSON.stringify({filled_qty:"2",filled_avg_price:"100"})}]});
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
