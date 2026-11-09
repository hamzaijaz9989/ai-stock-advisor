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
 if(!control||control.mode!=="paper"||Number(control.enabled)!==0||Number(control.kill_switch)!==1)return fail("Execution controls are not in the required disabled/kill-switched state.",503);
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
 const lifecycle=[],skippedLifecycle=[];
 const nextStatus=s=>({new:"ACCEPTED",accepted:"ACCEPTED",pending_new:"ACCEPTED",accepted_for_bidding:"ACCEPTED",partially_filled:"PARTIALLY_FILLED",filled:"FILLED",canceled:"CANCELED",rejected:"REJECTED"}[String(s||"").toLowerCase()]||null);
 const stored=row=>{try{const x=JSON.parse(row.response_json||"{}");return {qty:num(x.filled_qty),avg:num(x.filled_avg_price)};}catch{return {qty:null,avg:null};}};
 const allowed={SUBMITTING:["ACCEPTED","PARTIALLY_FILLED","FILLED","CANCELED","REJECTED","UNKNOWN"],ACCEPTED:["PARTIALLY_FILLED","FILLED","CANCELED","REJECTED","UNKNOWN"],PARTIALLY_FILLED:["PARTIALLY_FILLED","FILLED","CANCELED","UNKNOWN"],UNKNOWN:["ACCEPTED","PARTIALLY_FILLED","FILLED","CANCELED","REJECTED","UNKNOWN"]};
 for(const row of ledgerRows){
  const brokerOrder=byBrokerId.get(String(row.broker_order_id));
  if(!brokerOrder)continue;
  const status=nextStatus(brokerOrder.status),filled=num(brokerOrder.filled_qty),avg=num(brokerOrder.filled_avg_price),qty=num(row.qty);
  if(!status){skippedLifecycle.push({orderId:row.id,brokerStatus:String(brokerOrder.status||"UNKNOWN")});continue;}
  if(qty===null||qty<=0||filled===null||filled<0||filled>qty||(filled>0&&(avg===null||avg<=0)))continue;
  if(status==="FILLED"&&Math.abs(filled-qty)>0.0001)continue;
  if(status==="PARTIALLY_FILLED"&&(filled<=0||filled>=qty))continue;
  if(["ACCEPTED","REJECTED"].includes(status)&&filled!==0)continue;
  const prior=stored(row),previousStatus=String(row.status||"").toUpperCase();
  const previousFilled=prior.qty===null&&["SUBMITTING","UNKNOWN"].includes(previousStatus)?0:prior.qty;
  if(previousFilled===null||filled<previousFilled)continue;
  if(!((allowed[previousStatus]||[]).includes(status)))continue;
  const noExposureTerminal=status==="REJECTED"||(status==="CANCELED"&&filled===0);
  const stopPrice=num(row.stop_price);
  if(stopPrice!==null&&!noExposureTerminal){
   const stopCheck=verifyOtoStopLeg(brokerOrder,{symbol:row.symbol,qty,stopPrice});
   if(!stopCheck.ok){skippedLifecycle.push({orderId:row.id,reason:stopCheck.reason});continue;}
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
  statements.push(db.prepare("INSERT INTO execution_audit_log(actor,action,outcome,request_id,details_json) VALUES(?,?,?,?,?)").bind("operator","READ_ONLY_FILL_IMPORT_AND_ORDER_SYNC","SUCCESS",request.headers.get("X-Request-ID")||null,JSON.stringify({brokerRecords:clean.length,orderRowsUpdated:lifecycle.length,lifecycleEvents:lifecycle.length,skippedLifecycleCount:skippedLifecycle.length,pages,source:"alpaca_paper_account_activities_and_orders"})));
  const result=await db.batch(statements);
  const inserted=result.slice(0,clean.length).reduce((s,x)=>s+(Number(x?.meta?.changes)||0),0);
  return Response.json({ok:true,imported:true,execution:false,brokerRecords:clean.length,newRecords:inserted,alreadyKnown:clean.length-inserted,orderRowsUpdated:lifecycle.length,lifecycleEvents:lifecycle.length,skippedLifecycleCount:skippedLifecycle.length,skippedLifecycle,pages,checkedAt:new Date().toISOString(),warnings:["Imported broker fill activities idempotently and refreshed matching Northstar order lifecycle snapshots from Alpaca Paper.","Only existing Northstar ledger orders with matching broker_order_id are updated; external broker orders are not fabricated into the Northstar ledger.","Position rows remain a separate authoritative read-only account sync.","Order lifecycle rows are not advanced unless the nested OTO protective stop leg is verified.","No broker orders were submitted, modified, or cancelled.","Realized P&L remains gross FIFO and excludes fees, dividends, transfers, taxes and corporate actions unless separately modeled.","Execution remains disabled and the kill switch remains engaged."]},{headers:H});
 }catch{return fail("D1 fill/order lifecycle sync failed. No successful sync is claimed; verify schema and database before retrying.",503);}
}
