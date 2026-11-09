// Authenticated, read-only import of Alpaca Paper fill activities into an idempotent D1 ledger.
import {verifyOtoStopLeg} from "../../../lib/paper-execution-policy.js";
// Does not submit, amend, or cancel broker orders.
const H={"Cache-Control":"no-store","X-Content-Type-Options":"nosniff","Referrer-Policy":"no-referrer"};
const fail=(error,status=400)=>Response.json({ok:false,imported:false,execution:false,error},{status,headers:H});
function safeEqual(a,b){if(typeof a!=="string"||typeof b!=="string"||!a||!b)return false;let d=a.length^b.length;for(let i=0;i<Math.max(a.length,b.length);i++)d|=(a.charCodeAt(i)||0)^(b.charCodeAt(i)||0);return d===0;}
function authorized(req,env){return !!env?.NORTHSTAR_OPERATOR_TOKEN&&safeEqual(req.headers.get("Authorization")||"","Bearer "+env.NORTHSTAR_OPERATOR_TOKEN);}
async function alpaca(path,key,secret){const r=await fetch("https://paper-api.alpaca.markets"+path,{headers:{"APCA-API-KEY-ID":key,"APCA-API-SECRET-KEY":secret,"Accept":"application/json"},signal:AbortSignal.timeout(10000)});if(!r.ok)throw new Error("BROKER_HTTP_"+r.status);return r.json();}
const num=v=>v!==null&&v!==undefined&&v!==""&&Number.isFinite(Number(v))?Number(v):null;
export async function onRequestPost({request,env}){
 if(!authorized(request,env))return fail("Unauthorized.",401);
 const db=env?.NORTHSTAR_DB,key=env?.ALPACA_API_KEY_ID,secret=env?.ALPACA_API_SECRET_KEY;
 if(!db||!key||!secret)return fail("Ledger or Alpaca Paper credentials unavailable; fill import blocked.",503);
 let control,account;
 try{control=await db.prepare("SELECT enabled,mode,kill_switch FROM execution_control WHERE id=1").first();}
 catch{return fail("Could not verify execution controls; fail-closed.",503);}
 if(!control||control.mode!=="paper")return fail("Paper mode is required for read-only fill import.",503);
 try{account=await alpaca("/v2/account",key,secret);}catch(e){const m=String(e?.message||"");return fail(m.startsWith("BROKER_HTTP_")?"Alpaca Paper account check failed ("+m.slice(12)+").":"Alpaca Paper account unavailable.",503);}
 if(account?.status!=="ACTIVE"||account?.trading_blocked||account?.account_blocked)return fail("Alpaca Paper account is not active or is blocked.",503);
 let rows=[],token=null,pages=0,brokerOrders=[];
 try{
  do{
   const q=new URLSearchParams({activity_types:"FILL",direction:"asc",page_size:"100"});
   if(token)q.set("page_token",token);
   const batch=await alpaca("/v2/account/activities?"+q.toString(),key,secret);
   if(!Array.isArray(batch))return fail("Alpaca returned a malformed fill activity response; nothing imported.",503);
   rows.push(...batch);pages++;
   token=batch.length===100?(batch[batch.length-1]?.id||null):null;
   if(pages>=5&&token)return fail("Fill history exceeds the 500-record safe import limit. No partial import was written; contact support to extend pagination.",503);
  }while(token);
  // Fetch the broker's authoritative order state so existing Northstar orders can
  // advance through ACCEPTED / PARTIALLY_FILLED / FILLED / CANCELED / REJECTED.
  brokerOrders=await alpaca("/v2/orders?status=all&limit=500&direction=desc&nested=true",key,secret);
  if(!Array.isArray(brokerOrders)||brokerOrders.length>=500)return fail("Broker order history is malformed or reached the safe 500-order limit; no partial lifecycle sync was written.",503);
 }catch(e){const m=String(e?.message||"");return fail(m.startsWith("BROKER_HTTP_")?"Alpaca fill/order history request failed ("+m.slice(12)+").":"Alpaca fill/order history unavailable; nothing imported.",503);}
 const clean=[];
 for(const a of rows){
  const id=String(a?.id||""),order=String(a?.order_id||""),symbol=String(a?.symbol||"").toUpperCase(),side=String(a?.side||"").toLowerCase(),qty=num(a?.qty),price=num(a?.price),time=String(a?.transaction_time||"");
  if(!id||!order||!/^[A-Z][A-Z0-9.-]{0,9}$/.test(symbol)||!["buy","sell"].includes(side)||qty===null||qty<=0||price===null||price<=0||!Number.isFinite(Date.parse(time)))return fail("Fill activity contains missing or invalid identifiers, side, quantity, price or timestamp; no records imported.",503);
  clean.push({id,order,symbol,side,qty,price,cum:num(a.cum_qty),leaves:num(a.leaves_qty),status:String(a.order_status||""),time,raw:JSON.stringify(a)});
 }
 let ledgerOrders;
 try{ledgerOrders=await db.prepare("SELECT id,broker_order_id,symbol,qty,stop_price,status,response_json FROM paper_orders WHERE broker_order_id IS NOT NULL").all();}
 catch{return fail("Could not read existing Northstar orders; fill/order lifecycle sync blocked.",503);}
 const ledgerRows=Array.isArray(ledgerOrders?.results)?ledgerOrders.results:[];
 const byBrokerId=new Map(brokerOrders.map(o=>[String(o?.id||""),o]).filter(([id])=>!!id));
 const lifecycle=[],skippedLifecycle=[],unsafeExposure=[];
 const nextStatus=s=>({new:"ACCEPTED",accepted:"ACCEPTED",pending_new:"ACCEPTED",accepted_for_bidding:"ACCEPTED",partially_filled:"PARTIALLY_FILLED",filled:"FILLED",canceled:"CANCELED",rejected:"REJECTED"}[String(s||"").toLowerCase()]||null);
 const stored=row=>{try{const x=JSON.parse(row.response_json||"{}");return {qty:num(x.filled_qty),avg:num(x.filled_avg_price)};}catch{return {qty:null,avg:null};}};
 const allowed={SUBMITTING:["ACCEPTED","PARTIALLY_FILLED","FILLED","CANCELED","REJECTED","UNKNOWN"],ACCEPTED:["PARTIALLY_FILLED","FILLED","CANCELED","REJECTED","UNKNOWN"],PARTIALLY_FILLED:["PARTIALLY_FILLED","FILLED","CANCELED","UNKNOWN"],UNKNOWN:["ACCEPTED","PARTIALLY_FILLED","FILLED","CANCELED","REJECTED","UNKNOWN"]};
 const flagUnsafe=(row,brokerOrder,reason,filled)=>{if(!unsafeExposure.some(x=>x.id===row.id))unsafeExposure.push({id:row.id,brokerOrderId:String(brokerOrder?.id||row.broker_order_id||""),reason,filledQty:filled,brokerStatus:String(brokerOrder?.status||"UNKNOWN"),response:brokerOrder||{}});};
 for(const row of ledgerRows){
  const brokerOrder=byBrokerId.get(String(row.broker_order_id));
  if(!brokerOrder)continue;
  const rawStatus=String(brokerOrder.status||"UNKNOWN").toLowerCase();
  const status=nextStatus(rawStatus),filled=num(brokerOrder.filled_qty),avg=num(brokerOrder.filled_avg_price),qty=num(row.qty);
  const prior=stored(row),previousStatus=String(row.status||"").toUpperCase();
  const previousFilled=prior.qty===null&&["SUBMITTING","UNKNOWN"].includes(previousStatus)?0:prior.qty;
  if(!status){
   if(filled===null||filled>0||(previousFilled!==null&&previousFilled>0))flagUnsafe(row,brokerOrder,"BROKER_STATUS_OR_FILL_STATE_UNVERIFIED",filled);
   skippedLifecycle.push({orderId:row.id,brokerStatus:String(brokerOrder.status||"UNKNOWN")});continue;
  }
  if(qty===null||qty<=0||filled===null||filled<0||filled>qty||(filled>0&&(avg===null||avg<=0))){
   if(filled===null||filled>0||rawStatus==="partially_filled"||rawStatus==="filled")flagUnsafe(row,brokerOrder,"BROKER_FILL_QUANTITY_OR_PRICE_INVALID",filled);
   skippedLifecycle.push({orderId:row.id,reason:"BROKER_FILL_QUANTITY_OR_PRICE_INVALID"});continue;
  }
  if(status==="FILLED"&&Math.abs(filled-qty)>0.0001){
   if(filled>0)flagUnsafe(row,brokerOrder,"FILLED_STATUS_WITH_INCOMPLETE_CUMULATIVE_QUANTITY",filled);
   skippedLifecycle.push({orderId:row.id,reason:"FILLED_STATUS_WITH_INCOMPLETE_CUMULATIVE_QUANTITY"});continue;
  }
  if(status==="PARTIALLY_FILLED"&&(filled<=0||filled>=qty)){
   if(filled>0)flagUnsafe(row,brokerOrder,"PARTIAL_FILL_STATUS_WITH_INVALID_CUMULATIVE_QUANTITY",filled);
   skippedLifecycle.push({orderId:row.id,reason:"PARTIAL_FILL_STATUS_WITH_INVALID_CUMULATIVE_QUANTITY"});continue;
  }
  if(["ACCEPTED","REJECTED"].includes(status)&&filled!==0){
   if(filled>0)flagUnsafe(row,brokerOrder,"NON_FILL_STATUS_WITH_NONZERO_CUMULATIVE_QUANTITY",filled);
   skippedLifecycle.push({orderId:row.id,reason:"NON_FILL_STATUS_WITH_NONZERO_CUMULATIVE_QUANTITY"});continue;
  }
  if(previousFilled===null||filled<previousFilled){
   if(filled>0||(previousFilled!==null&&previousFilled>0))flagUnsafe(row,brokerOrder,"BROKER_CUMULATIVE_FILL_MOVED_BACKWARDS",filled);
   skippedLifecycle.push({orderId:row.id,reason:"BROKER_CUMULATIVE_FILL_MOVED_BACKWARDS"});continue;
  }
  if(!((allowed[previousStatus]||[]).includes(status))){
   if(filled>0)flagUnsafe(row,brokerOrder,"BROKER_ORDER_STATUS_TRANSITION_UNVERIFIED",filled);
   skippedLifecycle.push({orderId:row.id,reason:"BROKER_ORDER_STATUS_TRANSITION_UNVERIFIED"});continue;
  }
  const noExposureTerminal=(status==="REJECTED"&&filled===0)||(status==="CANCELED"&&filled===0);
  const stopPrice=num(row.stop_price);
  if(!noExposureTerminal){
   const stopCheck=stopPrice===null?{ok:false,reason:"PROTECTIVE_STOP_PRICE_MISSING"}:verifyOtoStopLeg(brokerOrder,{symbol:row.symbol,qty,stopPrice});
   if(!stopCheck.ok){
    skippedLifecycle.push({orderId:row.id,reason:stopCheck.reason});
    if(filled>0)flagUnsafe(row,brokerOrder,stopCheck.reason,filled);
    continue;
   }
  }
  const changed=status!==previousStatus||filled!==previousFilled||(filled>0&&prior.avg!==avg);
  if(changed)lifecycle.push({id:row.id,status,response:JSON.stringify(brokerOrder),eventType:status!==previousStatus?"ORDER_STATUS_UPDATED":"ORDER_FILL_UPDATED",previousStatus,previousFilled,filled,avg,brokerOrderId:String(brokerOrder.id)});
 }
 try{
  const statements=clean.map(a=>db.prepare("INSERT INTO broker_fill_activities(activity_id,broker_order_id,symbol,side,qty,price,cum_qty,leaves_qty,order_status,transaction_time,raw_json) VALUES(?,?,?,?,?,?,?,?,?,?,?) ON CONFLICT(activity_id) DO NOTHING").bind(a.id,a.order,a.symbol,a.side,a.qty,a.price,a.cum,a.leaves,a.status,a.time,a.raw));
  for(const item of lifecycle){
   const eventAt=new Date().toISOString();
   statements.push(db.prepare("UPDATE paper_orders SET status=?,response_json=?,updated_at=? WHERE id=?").bind(item.status,item.response,eventAt,item.id));
   statements.push(db.prepare("INSERT INTO paper_trade_events(order_id,event_type,event_at,source,details_json) VALUES(?,?,?,?,?)").bind(item.id,item.eventType,eventAt,"alpaca_paper_fill_sync",JSON.stringify({brokerOrderId:item.brokerOrderId,previousStatus:item.previousStatus,status:item.status,previousFilledQty:item.previousFilled,filledQty:item.filled,averageFillPrice:item.avg,execution:false})));
  }
  const checkedAt=new Date().toISOString();
  for(const item of unsafeExposure){
   statements.push(db.prepare("UPDATE paper_orders SET status='UNKNOWN',response_json=?,updated_at=? WHERE id=?").bind(JSON.stringify({brokerResponse:item.response,safetyReason:item.reason,requiresManualRecovery:true}),checkedAt,item.id));
   statements.push(db.prepare("INSERT INTO paper_trade_events(order_id,event_type,event_at,source,details_json) VALUES(?,?,?,?,?)").bind(item.id,"UNPROTECTED_EXPOSURE_REQUIRES_MANUAL_RECOVERY",checkedAt,"alpaca_paper_fill_sync",JSON.stringify({brokerOrderId:item.brokerOrderId,reason:item.reason,filledQty:item.filledQty,brokerStatus:item.brokerStatus,execution:false,killSwitchEngaged:true})));
  }
  if(unsafeExposure.length){
   statements.push(db.prepare("UPDATE execution_control SET enabled=0,kill_switch=1,updated_at=? WHERE id=1").bind(checkedAt));
   statements.push(db.prepare("INSERT INTO execution_audit_log(actor,action,outcome,request_id,details_json) VALUES(?,?,?,?,?)").bind("system","UNPROTECTED_PAPER_EXPOSURE_DETECTED","MANUAL_RECOVERY_REQUIRED",request.headers.get("X-Request-ID")||null,JSON.stringify({orders:unsafeExposure.map(x=>({orderId:x.id,brokerOrderId:x.brokerOrderId,reason:x.reason,filledQty:x.filledQty})),killSwitchEngaged:true,execution:false})));
  }
  statements.push(db.prepare("INSERT INTO execution_audit_log(actor,action,outcome,request_id,details_json) VALUES(?,?,?,?,?)").bind("operator","READ_ONLY_FILL_IMPORT_AND_ORDER_SYNC",unsafeExposure.length?"MANUAL_RECOVERY_REQUIRED":"SUCCESS",request.headers.get("X-Request-ID")||null,JSON.stringify({brokerRecords:clean.length,orderRowsUpdated:lifecycle.length,lifecycleEvents:lifecycle.length,skippedLifecycleCount:skippedLifecycle.length,unsafeExposureCount:unsafeExposure.length,pages,source:"alpaca_paper_account_activities_and_orders"})));
  const result=await db.batch(statements);
  const inserted=result.slice(0,clean.length).reduce((s,x)=>s+(Number(x?.meta?.changes)||0),0);
  const requiresManualRecovery=unsafeExposure.length>0;
  return Response.json({ok:!requiresManualRecovery,imported:true,execution:false,safeToContinue:!requiresManualRecovery,requiresManualRecovery,status:requiresManualRecovery?"MANUAL_RECOVERY_REQUIRED":"FILL_IMPORT_AND_ORDER_SYNC_PASSED_READ_ONLY",unsafeExposureCount:unsafeExposure.length,unsafeExposure:unsafeExposure.map(({id,brokerOrderId,reason,filledQty,brokerStatus})=>({orderId:id,brokerOrderId,reason,filledQty,brokerStatus})),brokerRecords:clean.length,newRecords:inserted,alreadyKnown:clean.length-inserted,orderRowsUpdated:lifecycle.length,lifecycleEvents:lifecycle.length,skippedLifecycleCount:skippedLifecycle.length,skippedLifecycle,pages,checkedAt:new Date().toISOString(),warnings:["Imported broker fill activities idempotently and refreshed matching Northstar order lifecycle snapshots from Alpaca Paper.","Only existing Northstar ledger orders with matching broker_order_id are updated; external broker orders are not fabricated into the Northstar ledger.","Position rows remain a separate authoritative read-only account sync.","Order lifecycle rows are not advanced unless the nested OTO protective stop leg is verified.","Any known unprotected filled exposure is marked UNKNOWN, the paper execution kill switch is engaged, and manual recovery is required; this does not itself protect or flatten that exposure.","No broker orders were submitted, modified, or cancelled.","Realized P&L remains gross FIFO and excludes fees, dividends, transfers, taxes and corporate actions unless separately modeled.","When no unsafe exposure is detected, this endpoint never changes execution-control settings; when unsafe exposure is detected, it only disables execution and engages the kill switch.","This endpoint never submits, modifies, or cancels broker orders."]},{status:requiresManualRecovery?409:200,headers:H});
 }catch{return fail("D1 fill/order lifecycle sync failed. No successful sync is claimed; verify schema and database before retrying.",503);}
}
