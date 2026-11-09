import test from "node:test";
import assert from "node:assert/strict";
import {readFile} from "node:fs/promises";
const helper=await readFile(new URL("../web/lib/paper-execution-policy.js",import.meta.url),"utf8");
const helperUrl="data:text/javascript;base64,"+Buffer.from(helper).toString("base64");
let source=await readFile(new URL("../web/functions/api/paper/fills-sync.js",import.meta.url),"utf8");
source=source.replace('from "../../../lib/paper-execution-policy.js"','from "'+helperUrl+'"');
const {onRequestPost}=await import("data:text/javascript;base64,"+Buffer.from(source).toString("base64"));
const control={enabled:0,mode:"paper",kill_switch:1};
const request=(token="secret")=>new Request("https://northstar.test/api/paper/fills-sync",{method:"POST",headers:{"Authorization":"Bearer "+token,"X-Request-ID":"fill-test"}});
function db(ledgerRows=[],controlRow=control){const state={batch:[]};return {state,prepare(sql){return {sql,bind(...args){return {sql,args};},async first(){return controlRow;},async all(){return {results:ledgerRows};}};},async batch(items){state.batch=items;return items.map((x,i)=>({meta:{changes:i===0?1:0}}));}};}
async function run({token="secret",activities=[{id:"act-1",order_id:"ord-1",symbol:"AAPL",side:"buy",qty:"2",price:"100",cum_qty:"2",leaves_qty:"0",order_status:"filled",transaction_time:"2026-01-01T10:00:00Z"}],brokerOrders=[],ledgerRows=[],controlRow=control}={}){const dbx=db(ledgerRows,controlRow),old=globalThis.fetch;globalThis.fetch=async url=>{const u=String(url);if(u.endsWith("/v2/account"))return Response.json({status:"ACTIVE"});if(u.includes("/v2/account/activities"))return Response.json(activities);if(u.includes("/v2/orders?"))return Response.json(brokerOrders);throw Error("unexpected "+u);};try{return {response:await onRequestPost({request:request(token),env:{NORTHSTAR_DB:dbx,NORTHSTAR_OPERATOR_TOKEN:"secret",ALPACA_API_KEY_ID:"key",ALPACA_API_SECRET_KEY:"secret"}}),db:dbx};}finally{globalThis.fetch=old;}}
test("fill import requires operator authentication",async()=>{const {response,db}=await run({token:"wrong"});assert.equal(response.status,401);assert.equal(db.state.batch.length,0);});
test("fill import validates and writes broker fills idempotently with audit",async()=>{const {response,db}=await run();const b=await response.json();assert.equal(response.status,200);assert.equal(b.imported,true);assert.equal(b.brokerRecords,1);assert.equal(db.state.batch.length,2);assert.match(db.state.batch[0].sql,/ON CONFLICT\(activity_id\) DO NOTHING/);assert.match(db.state.batch[1].sql,/execution_audit_log/);});
test("fill import rejects invalid activity without partial writes",async()=>{const {response,db}=await run({activities:[{id:"bad",order_id:"ord",symbol:"AAPL",side:"buy",qty:"NaN",price:"10",transaction_time:"2026-01-01"}]});assert.equal(response.status,503);assert.equal(db.state.batch.length,0);});
test("fill import remains read-only while paper execution is enabled and does not change controls",async()=>{
 const {response,db}=await run({activities:[],brokerOrders:[],controlRow:{enabled:1,mode:"paper",kill_switch:0}});
 const body=await response.json();
 assert.equal(response.status,200);
 assert.equal(body.imported,true);
 assert.equal(body.execution,false);
 assert.equal(db.state.batch.length,1);
 assert.equal(db.state.batch.some(x=>x.sql.includes("execution_control")),false);
 assert.ok(body.warnings.some(x=>/never changes execution-control settings/i.test(x)));
});
test("fill import advances a fully filled order only after its active stop child is verified",async()=>{
 const row={id:"northstar-order-1",broker_order_id:"ord-1",symbol:"AAPL",qty:5,stop_price:98,status:"ACCEPTED",response_json:'{"filled_qty":"1","filled_avg_price":"99"}'};
 const brokerOrder={id:"ord-1",symbol:"AAPL",side:"buy",qty:"5",filled_qty:"5",filled_avg_price:"100.5",status:"filled",order_class:"oto",legs:[{order_group_role:"stop_loss",type:"stop",status:"new",symbol:"AAPL",side:"sell",qty:"5",stop_price:"98"}]};
 const {response,db}=await run({brokerOrders:[brokerOrder],ledgerRows:[row]});
 const body=await response.json();
 assert.equal(response.status,200);
 assert.equal(body.ok,true);
 assert.equal(body.orderRowsUpdated,1);
 const update=db.state.batch.find(x=>x.sql.startsWith("UPDATE paper_orders"));
 assert.ok(update);
 assert.deepEqual(update.args.slice(0,1),["FILLED"]);
 assert.equal(update.args[3],"northstar-order-1");
 const event=db.state.batch.find(x=>x.sql.startsWith("INSERT INTO paper_trade_events"));
 assert.ok(event);
 assert.equal(event.args[1],"ORDER_STATUS_UPDATED");
 assert.equal(event.args[3],"alpaca_paper_fill_sync");
});
test("fill import blocks and engages the kill switch when cumulative exposure moves backwards",async()=>{
 const row={id:"northstar-order-1",broker_order_id:"ord-1",symbol:"AAPL",qty:5,stop_price:98,status:"PARTIALLY_FILLED",response_json:'{"filled_qty":"3","filled_avg_price":"100"}'};
 const brokerOrder={id:"ord-1",symbol:"AAPL",side:"buy",qty:"5",filled_qty:"2",filled_avg_price:"100",status:"partially_filled",order_class:"oto",legs:[{order_group_role:"stop_loss",type:"stop",status:"new",symbol:"AAPL",side:"sell",qty:"2",stop_price:"98"}]};
 const {response,db}=await run({brokerOrders:[brokerOrder],ledgerRows:[row]});
 const body=await response.json();
 assert.equal(response.status,409);
 assert.equal(body.ok,false);
 assert.equal(body.requiresManualRecovery,true);
 assert.equal(body.unsafeExposureCount,1);
 assert.equal(db.state.batch.some(x=>x.sql.includes("UPDATE execution_control SET enabled=0,kill_switch=1")),true);
 assert.equal(db.state.batch.some(x=>x.sql.startsWith("UPDATE paper_orders SET status='UNKNOWN'")),true);
});

test("fill sync blocks inconsistent FILLED status with partial exposure and engages kill switch",async()=>{
 const row={id:"northstar-order-1",broker_order_id:"ord-1",symbol:"AAPL",qty:5,stop_price:98,status:"ACCEPTED",response_json:'{"filled_qty":"0"}'};
 const brokerOrder={id:"ord-1",symbol:"AAPL",side:"buy",qty:"5",filled_qty:"3",filled_avg_price:"100",status:"filled"};
 const {response,db}=await run({brokerOrders:[brokerOrder],ledgerRows:[row]});
 const body=await response.json();
 assert.equal(response.status,409);
 assert.equal(body.ok,false);
 assert.equal(body.requiresManualRecovery,true);
 assert.equal(body.unsafeExposureCount,1);
 assert.equal(db.state.batch.some(x=>x.sql.startsWith("UPDATE paper_orders SET status='UNKNOWN'")),true);
 assert.equal(db.state.batch.some(x=>x.sql.includes("UPDATE execution_control SET enabled=0,kill_switch=1")),true);
});

test("fill sync engages the kill switch when filled exposure has no verified stop child",async()=>{
 const row={id:"northstar-order-1",broker_order_id:"ord-1",symbol:"AAPL",qty:5,stop_price:98,status:"ACCEPTED",response_json:'{"filled_qty":"0"}'};
 const brokerOrder={id:"ord-1",symbol:"AAPL",side:"buy",qty:"5",filled_qty:"2",filled_avg_price:"100",status:"partially_filled",order_class:"oto",legs:[]};
 const {response,db}=await run({brokerOrders:[brokerOrder],ledgerRows:[row]});
 const body=await response.json();
 assert.equal(response.status,409);
 assert.equal(body.ok,false);
 assert.equal(body.requiresManualRecovery,true);
 assert.equal(body.skippedLifecycleCount,1);
 assert.equal(body.skippedLifecycle[0].reason,"PROTECTIVE_STOP_LEG_MISSING_OR_MISMATCHED");
 assert.equal(db.state.batch.some(x=>x.sql.startsWith("UPDATE paper_orders SET status='UNKNOWN'")),true);
 assert.equal(db.state.batch.some(x=>x.sql.includes("UPDATE execution_control SET enabled=0,kill_switch=1")),true);
});
