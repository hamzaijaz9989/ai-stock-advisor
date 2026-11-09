import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

async function loadFunction() {
  const helper = await readFile(new URL("../web/lib/paper-order-guards.js", import.meta.url), "utf8");
  const helperUrl = "data:text/javascript;base64," + Buffer.from(helper).toString("base64");
  const strategyHelper = await readFile(new URL("../web/lib/strategy-validation-gate.js", import.meta.url), "utf8");
  const strategyHelperUrl = "data:text/javascript;base64," + Buffer.from(strategyHelper).toString("base64");
  let source = await readFile(new URL("../web/functions/api/paper/preflight.js", import.meta.url), "utf8");
  source = source.replace('from "../../../lib/paper-order-guards.js"', 'from "' + helperUrl + '"');
  source = source.replace('from "../../../lib/strategy-validation-gate.js"', 'from "' + strategyHelperUrl + '"');
  return import("data:text/javascript;base64," + Buffer.from(source).toString("base64"));
}
function mockDb(control, ledgerRows=[], snapshots=null, approval={approved:1,strategy_version:"northstar-provisional-gates-v1",report_version:3,report_sha256:"a".repeat(64),report_uri:"https://github.com/hamzaijaz9989/ai-stock-advisor/blob/main/docs/strategy-validation-report.md",approved_at:"2026-11-09T05:00:00.000Z",reviewer:"independent-reviewer"}) {
  const history=snapshots||[
    {captured_at:new Date().toISOString(),equity_usd:100000},
    {captured_at:new Date(Date.now()-8*86400000).toISOString(),equity_usd:100000}
  ];
  return { prepare(sql) {
    return {
      async first() { if(/execution_control/.test(sql)) return control; if(/northstar_strategy_approval/.test(sql)) return approval; throw new Error("unexpected first SQL "+sql); },
      async all() { if(/paper_positions/.test(sql)) return {results:ledgerRows}; if(/paper_equity_snapshots/.test(sql)) return {results:history}; throw new Error("unexpected SQL "+sql); }
    };
  }};
}
const control={enabled:0,mode:"paper",kill_switch:1,max_portfolio_usd:1000,default_risk_fraction:0.005,max_risk_fraction:0.01,max_position_fraction:0.25};
function makeRequest(body, token="secret") {
  return new Request("https://northstar.test/api/paper/preflight",{method:"POST",headers:{"Content-Type":"application/json","Authorization":"Bearer "+token},body:JSON.stringify(body)});
}
function fakeFetch({quoteTime=new Date().toISOString(),bid=99.9,ask=100,positions=[],marketOpen=true}={}) {
  return async url => {
    if(String(url).includes("/v2/account")) return Response.json({status:"ACTIVE",trading_blocked:false,account_blocked:false,equity:"100000",last_equity:"100000",buying_power:"400000"});
    if(String(url).includes("/v2/positions")) return Response.json(positions);
    if(String(url).endsWith("/v2/clock")) return Response.json({is_open:marketOpen});
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
    assert.equal(body.strategyValidation.approved,true);
  } finally { globalThis.fetch=oldFetch; }
});
test("preflight normalizes existing broker exposure to the virtual allocation before sizing",async()=>{
  const {onRequestPost}=await loadFunction();
  const oldFetch=globalThis.fetch;
  globalThis.fetch=fakeFetch({positions:[{symbol:"AAPL",qty:"1",avg_entry_price:"100",market_value:"10000"}]});
  try {
    const ledger=[{symbol:"AAPL",qty:"1",avg_entry_price:"100",market_value:"10000"}];
    const response=await onRequestPost({request:makeRequest({symbol:"NVDA",stopPrice:95}),env:{NORTHSTAR_DB:mockDb(control,ledger),NORTHSTAR_OPERATOR_TOKEN:"secret",ALPACA_API_KEY_ID:"key",ALPACA_API_SECRET_KEY:"secret"}});
    const body=await response.json();
    assert.equal(response.status,200);
    assert.equal(body.shares,1);
    assert.equal(body.exposure.existingUsd,100);
    assert.equal(body.exposure.afterProposedUsd,200);
    assert.equal(body.exposure.maxPortfolioUsd,1000);
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

test("preflight requires a seven-day baseline even when the latest snapshot is fresh",async()=>{
  const {onRequestPost}=await loadFunction();
  const oldFetch=globalThis.fetch;globalThis.fetch=fakeFetch();
  try{
    const response=await onRequestPost({request:makeRequest({symbol:"NVDA",stopPrice:95}),env:{NORTHSTAR_DB:mockDb(control,[],[{captured_at:new Date().toISOString(),equity_usd:100000}]),NORTHSTAR_OPERATOR_TOKEN:"secret",ALPACA_API_KEY_ID:"key",ALPACA_API_SECRET_KEY:"secret"}});
    assert.equal(response.status,503);
    assert.match((await response.json()).error,/seven-day equity baseline/i);
  }finally{globalThis.fetch=oldFetch;}
});
test("preflight blocks market orders while the US equity market is closed",async()=>{
  const {onRequestPost}=await loadFunction();
  const oldFetch=globalThis.fetch;globalThis.fetch=fakeFetch({marketOpen:false});
  try{
    const response=await onRequestPost({request:makeRequest({symbol:"NVDA",stopPrice:95}),env:{NORTHSTAR_DB:mockDb(control),NORTHSTAR_OPERATOR_TOKEN:"secret",ALPACA_API_KEY_ID:"key",ALPACA_API_SECRET_KEY:"secret"}});
    assert.equal(response.status,409);
    assert.match((await response.json()).error,/market is closed/i);
  }finally{globalThis.fetch=oldFetch;}
});

test("preflight blocks an unapproved strategy before making broker requests",async()=>{
 const {onRequestPost}=await loadFunction();
 const oldFetch=globalThis.fetch;globalThis.fetch=async()=>{throw new Error("BROKER_MUST_NOT_BE_CALLED");};
 try{
  const response=await onRequestPost({request:makeRequest({symbol:"NVDA",stopPrice:95}),env:{NORTHSTAR_DB:mockDb(control,[],null,{approved:0,strategy_version:"northstar-provisional-gates-v1"}),NORTHSTAR_OPERATOR_TOKEN:"secret",ALPACA_API_KEY_ID:"key",ALPACA_API_SECRET_KEY:"secret"}});
  const body=await response.json();
  assert.equal(response.status,409);
  assert.equal(body.strategyValidation.approved,false);
  assert.ok(body.strategyValidation.issues.includes("STRATEGY_VALIDATION_NOT_APPROVED"));
 }finally{globalThis.fetch=oldFetch;}
});

test("preflight blocks when the strategy approval record is missing",async()=>{
 const {onRequestPost}=await loadFunction();
 const oldFetch=globalThis.fetch;globalThis.fetch=async()=>{throw new Error("BROKER_MUST_NOT_BE_CALLED");};
 try{
  const response=await onRequestPost({request:makeRequest({symbol:"NVDA",stopPrice:95}),env:{NORTHSTAR_DB:mockDb(control,[],null,null),NORTHSTAR_OPERATOR_TOKEN:"secret",ALPACA_API_KEY_ID:"key",ALPACA_API_SECRET_KEY:"secret"}});
  const body=await response.json();
  assert.equal(response.status,409);
  assert.ok(body.strategyValidation.issues.includes("STRATEGY_APPROVAL_RECORD_MISSING"));
 }finally{globalThis.fetch=oldFetch;}
});
