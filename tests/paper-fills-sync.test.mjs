import test from "node:test";
import assert from "node:assert/strict";
import {readFile} from "node:fs/promises";
const helper=await readFile(new URL("../web/lib/paper-execution-policy.js",import.meta.url),"utf8");
const helperUrl="data:text/javascript;base64,"+Buffer.from(helper).toString("base64");
const positionHelper=await readFile(new URL("../web/lib/paper-position-ledger.js",import.meta.url),"utf8");
const positionHelperUrl="data:text/javascript;base64,"+Buffer.from(positionHelper).toString("base64");
let source=await readFile(new URL("../web/functions/api/paper/fills-sync.js",import.meta.url),"utf8");
source=source.replace('from "../../../lib/paper-execution-policy.js"','from "'+helperUrl+'"');
source=source.replace('from "../../../lib/paper-position-ledger.js"','from "'+positionHelperUrl+'"');
const {onRequestPost}=await import("data:text/javascript;base64,"+Buffer.from(source).toString("base64"));
const control={enabled:0,mode:"paper",kill_switch:1};
const request=(token="secret")=>new Request("https://northstar.test/api/paper/fills-sync",{method:"POST",headers:{"Authorization":"Bearer "+token,"X-Request-ID":"fill-test"}});
function db(ledgerRows=[],controlRow=control,trackedFills=[]){const state={batch:[]};return {state,prepare(sql){return {sql,bind(...args){return {sql,args};},async first(){return controlRow;},async all(){return {results:/northstar_fill_ledger/.test(sql)?trackedFills:ledgerRows};}};},async batch(items){state.batch=items;return items.map((x,i)=>({meta:{changes:i===0?1:0}}));}};}
async function run({token="secret",activities=[{id:"act-1",order_id:"ord-1",symbol:"AAPL",side:"buy",qty:"2",price:"100",cum_qty:"2",leaves_qty:"0",order_status:"filled",transaction_time:"2026-01-01T10:00:00Z"}],brokerOrders=[],brokerPositions=[],ledgerRows=[],trackedFills=[],controlRow=control}={}){const dbx=db(ledgerRows,controlRow,trackedFills),old=globalThis.fetch;globalThis.fetch=async url=>{const u=String(url);if(u.endsWith("/v2/account"))return Response.json({status:"ACTIVE"});if(u.includes("/v2/account/activities"))return Response.json(activities);if(u.includes("/v2/orders?"))return Response.json(brokerOrders);if(u.endsWith("/v2/positions"))return Response.json(brokerPositions);throw Error("unexpected "+u);};try{return {response:await onRequestPost({request:request(token),env:{NORTHSTAR_DB:dbx,NORTHSTAR_OPERATOR_TOKEN:"secret",ALPACA_API_KEY_ID:"key",ALPACA_API_SECRET_KEY:"secret"}}),db:dbx};}finally{globalThis.fetch=old;}}
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
 assert.ok(body.warnings.some(x=>/when all tracked order states are verified.*never changes execution-control settings/i.test(x)));
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

test("fill sync fails closed for a live zero-fill entry whose OTO stop child is missing",async()=>{
 const row={id:"northstar-order-zero-fill",broker_order_id:"ord-zero",symbol:"AAPL",qty:5,stop_price:98,status:"SUBMITTING",response_json:'{"filled_qty":"0"}'};
 const brokerOrder={id:"ord-zero",symbol:"AAPL",side:"buy",qty:"5",filled_qty:"0",status:"new",order_class:"oto",legs:[]};
 const {response,db}=await run({activities:[],brokerOrders:[brokerOrder],ledgerRows:[row]});
 const body=await response.json();
 assert.equal(response.status,409);
 assert.equal(body.ok,false);
 assert.equal(body.safeToContinue,false);
 assert.equal(body.requiresManualRecovery,true);
 assert.equal(body.unsafeExposureCount,0);
 assert.equal(body.unsafeOrderCount,1);
 assert.equal(body.unsafeExposure[0].exposurePresent,false);
 assert.equal(body.unsafeExposure[0].reason,"PROTECTIVE_STOP_LEG_MISSING_OR_MISMATCHED");
 assert.equal(db.state.batch.some(x=>x.sql.startsWith("UPDATE paper_orders SET status='UNKNOWN'")),true);
 assert.equal(db.state.batch.some(x=>x.sql.includes("UPDATE execution_control SET enabled=0,kill_switch=1")),true);
});

test("fill sync fails closed when a tracked ledger order is absent from broker history",async()=>{
 const row={id:"northstar-order-missing",broker_order_id:"ord-missing",symbol:"AAPL",qty:5,stop_price:98,status:"UNKNOWN",response_json:'{"filled_qty":"0"}'};
 const {response,db}=await run({activities:[],brokerOrders:[],ledgerRows:[row]});
 const body=await response.json();
 assert.equal(response.status,409);
 assert.equal(body.ok,false);
 assert.equal(body.safeToContinue,false);
 assert.equal(body.requiresManualRecovery,true);
 assert.equal(body.unsafeOrderCount,1);
 assert.equal(body.unsafeExposure[0].reason,"LEDGER_ORDER_MISSING_FROM_BROKER_HISTORY");
 assert.equal(db.state.batch.some(x=>x.sql.startsWith("UPDATE paper_orders SET status='UNKNOWN'")),true);
 assert.equal(db.state.batch.some(x=>x.sql.includes("UPDATE execution_control SET enabled=0,kill_switch=1")),true);
});


test("fill sync builds a fill-derived FIFO position from the tracked parent entry",async()=>{
 const row={id:"northstar-order-entry",broker_order_id:"ord-entry",symbol:"AAPL",qty:2,stop_price:98,status:"ACCEPTED",response_json:'{"filled_qty":"0"}'};
 const brokerOrder={id:"ord-entry",symbol:"AAPL",side:"buy",qty:"2",filled_qty:"2",filled_avg_price:"100",status:"filled",order_class:"oto",legs:[{id:"stop-entry",order_group_role:"stop_loss",type:"stop",status:"new",symbol:"AAPL",side:"sell",qty:"2",stop_price:"98"}]};
 const activity={id:"buy-fill-1",order_id:"ord-entry",symbol:"AAPL",side:"buy",qty:"2",price:"100",transaction_time:"2026-01-01T10:00:00Z"};
 const {response,db}=await run({activities:[activity],brokerOrders:[brokerOrder],ledgerRows:[row]});
 const body=await response.json();
 assert.equal(response.status,200);
 assert.equal(body.positionLedger.complete,true);
 assert.equal(body.positionLedger.trackedFillCount,1);
 assert.equal(body.positionLedger.positions[0].qty,2);
 assert.ok(db.state.batch.some(x=>x.sql.startsWith("INSERT INTO northstar_fill_ledger")));
 assert.ok(db.state.batch.some(x=>x.sql.startsWith("INSERT INTO paper_position_lots")));
});

test("fill sync maps an OTO stop-child fill to its parent and closes the FIFO lot",async()=>{
 const row={id:"northstar-order-entry",broker_order_id:"ord-entry",symbol:"AAPL",qty:2,stop_price:98,status:"FILLED",response_json:'{"filled_qty":"2","filled_avg_price":"100"}'};
 const brokerOrder={id:"ord-entry",symbol:"AAPL",side:"buy",qty:"2",filled_qty:"2",filled_avg_price:"100",status:"filled",order_class:"oto",legs:[{id:"stop-child",order_group_role:"stop_loss",type:"stop",status:"filled",symbol:"AAPL",side:"sell",qty:"2",stop_price:"98"}]};
 const activities=[
  {id:"buy-fill",order_id:"ord-entry",symbol:"AAPL",side:"buy",qty:"2",price:"100",transaction_time:"2026-01-01T10:00:00Z"},
  {id:"sell-fill",order_id:"stop-child",symbol:"AAPL",side:"sell",qty:"2",price:"110",transaction_time:"2026-01-02T10:00:00Z"}
 ];
 const {response,db}=await run({activities,brokerOrders:[brokerOrder],ledgerRows:[row]});
 const body=await response.json();
 assert.equal(response.status,200);
 assert.equal(body.positionLedger.complete,true);
 assert.equal(body.positionLedger.trackedFillCount,2);
 assert.equal(body.positionLedger.openLotCount,0);
 assert.equal(body.positionLedger.realizedMatchCount,1);
 assert.equal(body.positionLedger.grossRealizedPlUsd,20);
 assert.ok(db.state.batch.some(x=>x.sql.startsWith("INSERT INTO paper_realized_trades")));
});

test("fill sync refuses to publish a short position from an oversized tracked sell",async()=>{
 const row={id:"northstar-order-entry",broker_order_id:"ord-entry",symbol:"AAPL",qty:1,stop_price:98,status:"FILLED",response_json:'{"filled_qty":"1","filled_avg_price":"100"}'};
 const brokerOrder={id:"ord-entry",symbol:"AAPL",side:"buy",qty:"1",filled_qty:"1",filled_avg_price:"100",status:"filled",order_class:"oto",legs:[{id:"stop-child",order_group_role:"stop_loss",type:"stop",status:"filled",symbol:"AAPL",side:"sell",qty:"1",stop_price:"98"}]};
 const activities=[
  {id:"buy-fill",order_id:"ord-entry",symbol:"AAPL",side:"buy",qty:"1",price:"100",transaction_time:"2026-01-01T10:00:00Z"},
  {id:"oversell-fill",order_id:"stop-child",symbol:"AAPL",side:"sell",qty:"2",price:"90",transaction_time:"2026-01-02T10:00:00Z"}
 ];
 const {response,db}=await run({activities,brokerOrders:[brokerOrder],ledgerRows:[row]});
 const body=await response.json();
 assert.equal(response.status,409);
 assert.equal(body.positionLedger.complete,false);
 assert.equal(body.positionLedger.error.reason,"SELL_EXCEEDS_TRACKED_LONG_POSITION");
 assert.equal(body.requiresManualRecovery,true);
 assert.ok(db.state.batch.some(x=>x.sql.includes("UPDATE execution_control SET enabled=0,kill_switch=1")));
 assert.equal(db.state.batch.some(x=>x.sql.startsWith("DELETE FROM paper_position_lots")),false);
});


test("fill sync idempotently rebuilds a previously imported terminal fill without reopening its order",async()=>{
 const row={id:"northstar-order-entry",broker_order_id:"ord-entry",symbol:"AAPL",qty:2,stop_price:98,status:"FILLED",response_json:'{"filled_qty":"2","filled_avg_price":"100"}'};
 const brokerOrder={id:"ord-entry",symbol:"AAPL",side:"buy",qty:"2",filled_qty:"2",filled_avg_price:"100",status:"filled",order_class:"oto",legs:[{id:"stop-child",order_group_role:"stop_loss",type:"stop",status:"new",symbol:"AAPL",side:"sell",qty:"2",stop_price:"98"}]};
 const activity={id:"buy-fill",order_id:"ord-entry",symbol:"AAPL",side:"buy",qty:"2",price:"100",transaction_time:"2026-01-01T10:00:00Z"};
 const tracked={activity_id:"buy-fill",order_id:"northstar-order-entry",broker_order_id:"ord-entry",symbol:"AAPL",side:"buy",qty:2,price:100,transaction_time:"2026-01-01T10:00:00Z",raw_json:JSON.stringify(activity)};
 const {response,db}=await run({activities:[activity],brokerOrders:[brokerOrder],ledgerRows:[row],trackedFills:[tracked]});
 const body=await response.json();
 assert.equal(response.status,200);
 assert.equal(body.positionLedger.complete,true);
 assert.equal(body.positionLedger.newTrackedFills,0);
 assert.equal(body.positionLedger.positions[0].qty,2);
 assert.equal(db.state.batch.some(x=>x.sql.includes("UPDATE execution_control")),false);
 assert.equal(db.state.batch.some(x=>x.sql.startsWith("UPDATE paper_orders")),false);
});


test("fill sync accepts a verified standalone recovery GTC stop with exact position coverage",async()=>{
 const row={id:"recovery-order-ledger",broker_order_id:"recovery-order-broker",symbol:"AAPL",side:"sell",qty:2,stop_price:95,status:"ACCEPTED",response_json:'{"filled_qty":"0"}'};
 const brokerOrder={id:"recovery-order-broker",client_order_id:"recovery-order-ledger",symbol:"AAPL",side:"sell",qty:"2",filled_qty:"0",status:"new",type:"stop",time_in_force:"gtc",stop_price:"95",leaves_qty:"2"};
 const {response,db}=await run({activities:[],brokerOrders:[brokerOrder],brokerPositions:[{symbol:"AAPL",qty:"2",side:"long"}],ledgerRows:[row]});
 const body=await response.json();
 assert.equal(response.status,200);
 assert.equal(body.safeToContinue,true);
 assert.equal(body.requiresManualRecovery,false);
 assert.equal(db.state.batch.some(x=>x.sql.startsWith("UPDATE paper_orders SET status='UNKNOWN'")),false);
});
test("fill sync flags a standalone recovery stop whose leaves do not cover the broker position",async()=>{
 const row={id:"recovery-order-ledger",broker_order_id:"recovery-order-broker",symbol:"AAPL",side:"sell",qty:2,stop_price:95,status:"ACCEPTED",response_json:'{"filled_qty":"0"}'};
 const brokerOrder={id:"recovery-order-broker",client_order_id:"recovery-order-ledger",symbol:"AAPL",side:"sell",qty:"2",filled_qty:"0",status:"new",type:"stop",time_in_force:"gtc",stop_price:"95",leaves_qty:"1"};
 const {response,db}=await run({activities:[],brokerOrders:[brokerOrder],brokerPositions:[{symbol:"AAPL",qty:"2",side:"long"}],ledgerRows:[row]});
 const body=await response.json();
 assert.equal(response.status,409);
 assert.equal(body.safeToContinue,false);
 assert.equal(body.requiresManualRecovery,true);
 assert.ok(body.skippedLifecycle.some(x=>x.reason==="STANDALONE_RECOVERY_STOP_DOES_NOT_RECONCILE_TO_POSITION"));
 assert.equal(db.state.batch.some(x=>x.sql.includes("UPDATE execution_control SET enabled=0,kill_switch=1")),true);
});


test("fill sync accepts a canceled OTO parent when its linked standalone recovery stop covers exposure",async()=>{
 const parentRow={id:"entry-ledger",idempotency_key:"intent:entry",broker_order_id:"entry-broker",symbol:"AAPL",side:"buy",qty:5,stop_price:95,status:"CANCELED",response_json:'{"filled_qty":"2","filled_avg_price":"100"}'};
 const recoveryRow={id:"recovery-ledger",idempotency_key:"recovery:entry-ledger",broker_order_id:"recovery-broker",symbol:"AAPL",side:"sell",qty:2,order_type:"stop",time_in_force:"gtc",stop_price:95,status:"ACCEPTED",response_json:'{"filled_qty":"0"}'};
 const parentOrder={id:"entry-broker",client_order_id:"entry-ledger",order_class:"oto",symbol:"AAPL",side:"buy",qty:"5",filled_qty:"2",filled_avg_price:"100",status:"canceled",legs:[{id:"child-stop",symbol:"AAPL",side:"sell",type:"stop",qty:"5",filled_qty:"0",stop_price:"95",status:"canceled"}]};
 const recoveryOrder={id:"recovery-broker",client_order_id:"recovery-ledger",symbol:"AAPL",side:"sell",qty:"2",filled_qty:"0",status:"new",type:"stop",time_in_force:"gtc",stop_price:"95",leaves_qty:"2"};
 const {response,db}=await run({activities:[],brokerOrders:[parentOrder,recoveryOrder],brokerPositions:[{symbol:"AAPL",qty:"2",side:"long"}],ledgerRows:[parentRow,recoveryRow]});
 const body=await response.json();
 assert.equal(response.status,200);
 assert.equal(body.safeToContinue,true);
 assert.equal(body.requiresManualRecovery,false);
 assert.equal(db.state.batch.some(x=>x.sql.startsWith("UPDATE execution_control SET enabled=0,kill_switch=1")),false);
});
