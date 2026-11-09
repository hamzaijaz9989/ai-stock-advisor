import test from "node:test";
import assert from "node:assert/strict";
import {readFile} from "node:fs/promises";
async function load(path){const s=await readFile(new URL(path,import.meta.url),"utf8");return import("data:text/javascript;base64,"+Buffer.from(s).toString("base64"));}
const control={enabled:0,mode:"paper",kill_switch:1};
function req(token="secret"){return new Request("https://northstar.test/api/paper/sync",{method:"POST",headers:{"Authorization":"Bearer "+token,"X-Request-ID":"test-sync"},body:"{}"});}
function dbMock(controlRow=control){const state={batch:[],first:0};return {state,prepare(sql){return {sql,bind(...args){return {sql,args};},async first(){state.first++;return controlRow;}};},async batch(items){state.batch=items;return items.map(()=>({success:true}));}};}
async function run({token="secret",broker={}}={}){const {onRequestPost}=await load("../web/functions/api/paper/sync.js");const db=dbMock();const old=globalThis.fetch;globalThis.fetch=async url=>{const u=String(url);if(u.includes("/v2/account"))return Response.json(broker.account||{status:"ACTIVE",equity:"100000",cash:"95000",buying_power:"95000",last_equity:"99900"});if(u.includes("/v2/positions"))return Response.json(broker.positions??[{symbol:"NVDA",qty:"2",avg_entry_price:"100",market_value:"220",unrealized_pl:"20"}]);throw Error("unexpected "+u);};try{return {response:await onRequestPost({request:req(token),env:{NORTHSTAR_DB:db,NORTHSTAR_OPERATOR_TOKEN:"secret",ALPACA_API_KEY_ID:"key",ALPACA_API_SECRET_KEY:"secret"}}),db};}finally{globalThis.fetch=old;}}
test("sync rejects missing operator authentication",async()=>{const {response,db}=await run({token:"wrong"});assert.equal(response.status,401);assert.equal(db.state.batch.length,0);});
test("sync persists a validated account snapshot, latest positions and audit row",async()=>{const {response,db}=await run();const body=await response.json();assert.equal(response.status,200);assert.equal(body.synced,true);assert.equal(body.execution,false);assert.equal(body.snapshot.equityUsd,100000);assert.equal(body.snapshot.dayPlUsd,100);assert.equal(body.snapshot.positions,1);assert.equal(db.state.batch.length,4);assert.match(db.state.batch[0].sql,/paper_equity_snapshots/);assert.match(db.state.batch[1].sql,/DELETE FROM paper_positions/);assert.match(db.state.batch[2].sql,/INSERT INTO paper_positions/);assert.match(db.state.batch[3].sql,/execution_audit_log/);});
test("read-only sync remains available while paper execution is enabled and does not change controls",async()=>{
 const {onRequestPost}=await load("../web/functions/api/paper/sync.js");
 const enabledControl={enabled:1,mode:"paper",kill_switch:0};
 const db=dbMock(enabledControl),old=globalThis.fetch;
 globalThis.fetch=async url=>String(url).includes("/v2/account")
  ?Response.json({status:"ACTIVE",equity:"100000",cash:"95000",buying_power:"95000",last_equity:"99900"})
  :Response.json([]);
 try{
  const response=await onRequestPost({request:req(),env:{NORTHSTAR_DB:db,NORTHSTAR_OPERATOR_TOKEN:"secret",ALPACA_API_KEY_ID:"key",ALPACA_API_SECRET_KEY:"secret"}});
  const body=await response.json();
  assert.equal(response.status,200);
  assert.equal(body.execution,false);
  assert.ok(body.warnings.some(x=>/does not change execution controls/i.test(x)));
  assert.equal(db.state.batch.some(x=>/execution_control/i.test(x.sql)),false);
 }finally{globalThis.fetch=old;}
});
test("sync refuses invalid broker positions without writing",async()=>{const {response,db}=await run({broker:{positions:[{symbol:"NVDA",qty:"NaN",avg_entry_price:"100"}]}});assert.equal(response.status,503);assert.equal(db.state.batch.length,0);});
