import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

async function loadFunction() {
  const source = await readFile(new URL("../web/functions/api/paper/preflight.js", import.meta.url), "utf8");
  return import("data:text/javascript;base64," + Buffer.from(source).toString("base64"));
}
function mockDb(control, ledgerRows=[]) {
  return { prepare(sql) {
    return {
      async first() { assert.match(sql,/execution_control/); return control; },
      async all() { assert.match(sql,/paper_positions/); return {results:ledgerRows}; }
    };
  }};
}
const control={enabled:0,mode:"paper",kill_switch:1,max_portfolio_usd:1000,default_risk_fraction:0.005,max_risk_fraction:0.01,max_position_fraction:0.25};
function makeRequest(body, token="secret") {
  return new Request("https://northstar.test/api/paper/preflight",{method:"POST",headers:{"Content-Type":"application/json","Authorization":"Bearer "+token},body:JSON.stringify(body)});
}
function fakeFetch({quoteTime=new Date().toISOString(),bid=99.9,ask=100,positions=[]}={}) {
  return async url => {
    if(String(url).includes("/v2/account")) return Response.json({status:"ACTIVE",trading_blocked:false,account_blocked:false,equity:"100000",buying_power:"400000"});
    if(String(url).includes("/v2/positions")) return Response.json(positions);
    if(String(url).includes("/quotes/latest")) return Response.json({quote:{bp:bid,ap:ask,t:quoteTime}});
    throw new Error("unexpected URL "+url);
  };
}
test("preflight rejects missing operator authentication before broker calls",async()=>{
  const {onRequestPost}=await loadFunction();
  const response=await onRequestPost({request:makeRequest({symbol:"NVDA",stopPrice:95},"wrong"),env:{NORTHSTAR_DB:mockDb(control),NORTHSTAR_OPERATOR_TOKEN:"secret"}});
  assert.equal(response.status,401);
});
test("preflight sizes from fresh quote and reconciled paper ledger without submitting orders",async()=>{
  const {onRequestPost}=await loadFunction();
  const oldFetch=globalThis.fetch; globalThis.fetch=fakeFetch();
  try {
    const response=await onRequestPost({request:makeRequest({symbol:"NVDA",stopPrice:95}),env:{NORTHSTAR_DB:mockDb(control),NORTHSTAR_OPERATOR_TOKEN:"secret",ALPACA_API_KEY_ID:"key",ALPACA_API_SECRET_KEY:"secret"}});
    const body=await response.json();
    assert.equal(response.status,200);
    assert.equal(body.status,"PREFLIGHT_PASSED_PREVIEW_ONLY_NOT_AN_ORDER");
    assert.equal(body.execution,false);
    assert.equal(body.shares,1);
    assert.equal(body.broker.positionsReconciled,true);
  } finally { globalThis.fetch=oldFetch; }
});
test("preflight rejects stale quotes",async()=>{
  const {onRequestPost}=await loadFunction();
  const oldFetch=globalThis.fetch; globalThis.fetch=fakeFetch({quoteTime:new Date(Date.now()-120000).toISOString()});
  try {
    const response=await onRequestPost({request:makeRequest({symbol:"NVDA",stopPrice:95}),env:{NORTHSTAR_DB:mockDb(control),NORTHSTAR_OPERATOR_TOKEN:"secret",ALPACA_API_KEY_ID:"key",ALPACA_API_SECRET_KEY:"secret"}});
    assert.equal(response.status,503);
    assert.match((await response.json()).error,/older than 60 seconds/);
  } finally { globalThis.fetch=oldFetch; }
});
test("preflight blocks broker-ledger position mismatch",async()=>{
  const {onRequestPost}=await loadFunction();
  const oldFetch=globalThis.fetch; globalThis.fetch=fakeFetch({positions:[{symbol:"AAPL",qty:"2",avg_entry_price:"100",market_value:"210"}]});
  try {
    const response=await onRequestPost({request:makeRequest({symbol:"NVDA",stopPrice:95}),env:{NORTHSTAR_DB:mockDb(control),NORTHSTAR_OPERATOR_TOKEN:"secret",ALPACA_API_KEY_ID:"key",ALPACA_API_SECRET_KEY:"secret"}});
    assert.equal(response.status,409);
    assert.match((await response.json()).error,/do not reconcile/);
  } finally { globalThis.fetch=oldFetch; }
});
test("preflight blocks excessive spread",async()=>{
  const {onRequestPost}=await loadFunction();
  const oldFetch=globalThis.fetch; globalThis.fetch=fakeFetch({bid:98,ask:100});
  try {
    const response=await onRequestPost({request:makeRequest({symbol:"NVDA",stopPrice:95}),env:{NORTHSTAR_DB:mockDb(control),NORTHSTAR_OPERATOR_TOKEN:"secret",ALPACA_API_KEY_ID:"key",ALPACA_API_SECRET_KEY:"secret"}});
    assert.equal(response.status,409);
    assert.match((await response.json()).error,/spread exceeds/);
  } finally { globalThis.fetch=oldFetch; }
});
