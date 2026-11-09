// Operator-only emergency recovery for an existing Alpaca PAPER OTO entry.
// This route can cancel an existing BUY parent or held child and place only an
// exact-quantity SELL stop. It cannot open/increase a long position or flatten at market.
import {evaluatePartialFillRecovery} from "../../../lib/paper-recovery-policy.js";

const H={"Cache-Control":"no-store","X-Content-Type-Options":"nosniff","Referrer-Policy":"no-referrer"};
const fail=(error,status=400,extra={})=>Response.json({ok:false,execution:false,recovered:false,error,...extra},{status,headers:H});
function equal(a,b){if(typeof a!=="string"||typeof b!=="string"||!a||!b)return false;let d=a.length^b.length;for(let i=0;i<Math.max(a.length,b.length);i++)d|=(a.charCodeAt(i)||0)^(b.charCodeAt(i)||0);return d===0;}
function authorized(req,env){return !!env?.NORTHSTAR_OPERATOR_TOKEN&&equal(req.headers.get("Authorization")||"","Bearer "+env.NORTHSTAR_OPERATOR_TOKEN);}
async function broker(path,key,secret,options={}){
 const r=await fetch("https://paper-api.alpaca.markets"+path,{...options,headers:{"APCA-API-KEY-ID":key,"APCA-API-SECRET-KEY":secret,"Accept":"application/json","Content-Type":"application/json",...(options.headers||{})},signal:AbortSignal.timeout(10000)});
 const raw=await r.text();let data={};try{data=raw?JSON.parse(raw):{};}catch{}
 if(!r.ok){const e=new Error("ALPACA_HTTP_"+r.status);e.status=r.status;e.data=data;throw e;}return data;
}
const num=v=>v!==null&&v!==undefined&&v!==""&&Number.isFinite(Number(v))?Number(v):null;
const close=(a,b,t=.0001)=>Math.abs(Number(a)-Number(b))<=t;
const safeJson=v=>JSON.stringify(v??{});
const statusOf=v=>{const s=String(v||"").toLowerCase();return ({new:"ACCEPTED",accepted:"ACCEPTED",pending_new:"ACCEPTED",accepted_for_bidding:"ACCEPTED",partially_filled:"PARTIALLY_FILLED",filled:"FILLED",canceled:"CANCELED",cancelled:"CANCELED",expired:"CANCELED",rejected:"REJECTED"})[s]||"UNKNOWN";};
async function digest(v){const d=await crypto.subtle.digest("SHA-256",new TextEncoder().encode(JSON.stringify(v)));return [...new Uint8Array(d)].map(x=>x.toString(16).padStart(2,"0")).join("");}
function childStop(parent){
 const legs=Array.isArray(parent?.legs)?parent.legs:[];
 const stops=legs.filter(x=>String(x?.side||"").toLowerCase()==="sell"&&(
  ["stop","stop_limit"].includes(String(x?.type||x?.order_type||"").toLowerCase())||
  String(x?.order_group_role||x?.group_role||x?.role||"").toLowerCase()==="stop_loss"));
 if(stops.length>1)return {ambiguous:true,child:null};
 return {ambiguous:false,child:stops[0]||null};
}
function positionFor(rows,symbol){
 if(!Array.isArray(rows))return {ok:false,position:null,reason:"BROKER_POSITIONS_MALFORMED"};
 const matches=rows.filter(x=>String(x?.symbol||"").toUpperCase()===symbol);
 if(matches.length>1)return {ok:false,position:null,reason:"DUPLICATE_BROKER_POSITION"};
 if(!matches.length)return {ok:true,position:null};
 const p=matches[0],qty=num(p.qty),side=String(p.side||"").toLowerCase();
 if(qty===null||qty<0||!["long","short"].includes(side))return {ok:false,position:null,reason:"BROKER_POSITION_INVALID"};
 return {ok:true,position:{qty,side}};
}
async function audit(db,{orderId,event,actor="operator",outcome="REQUESTED",details={},requestId=null}){
 const now=new Date().toISOString();
 await db.batch([
  db.prepare("INSERT INTO paper_trade_events(order_id,event_type,event_at,source,details_json) VALUES(?,?,?,?,?)").bind(orderId,event,now,"northstar_paper_recovery",safeJson({...details,execution:false})),
  db.prepare("INSERT INTO execution_audit_log(actor,action,outcome,request_id,details_json) VALUES(?,?,?,?,?)").bind(actor,event,outcome,requestId||orderId,safeJson({...details,orderId,execution:false}))
 ]);
}
async function markUnknown(db,{parentId,recoveryId=null,reason,details={}}){
 const now=new Date().toISOString();
 await db.batch([
  db.prepare("UPDATE execution_control SET enabled=0,kill_switch=1,updated_at=? WHERE id=1").bind(now),
  ...(recoveryId?[db.prepare("UPDATE paper_orders SET status='UNKNOWN',response_json=?,updated_at=? WHERE id=?").bind(safeJson({reason,details}),now,recoveryId)]:[]),
  db.prepare("INSERT INTO paper_trade_events(order_id,event_type,event_at,source,details_json) VALUES(?,?,?,?,?)").bind(parentId,"PAPER_PARTIAL_FILL_RECOVERY_UNKNOWN",now,"northstar_paper_recovery",safeJson({reason,details,execution:false,killSwitchEngaged:true})),
  db.prepare("INSERT INTO execution_audit_log(actor,action,outcome,request_id,details_json) VALUES(?,?,?,?,?)").bind("system","PAPER_PARTIAL_FILL_RECOVERY_UNKNOWN","UNKNOWN",parentId,safeJson({reason,details,killSwitchEngaged:true}))
 ]);
}
async function verifyExistingRecovery(db,key,secret,parent,existing){
 let found;
 try{found=await broker("/v2/orders:by_client_order_id?client_order_id="+encodeURIComponent(existing.id),key,secret);}
 catch(e){
  await markUnknown(db,{parentId:parent.id,recoveryId:existing.id,reason:"EXISTING_RECOVERY_ORDER_LOOKUP_FAILED",details:{brokerStatus:e.status||null}});
  return fail("Existing recovery stop cannot be verified. It is marked UNKNOWN; do not submit another stop.",503,{orderId:parent.id,recoveryOrderId:existing.id,status:"UNKNOWN"});
 }
 const qty=num(found.qty),filled=num(found.filled_qty),stop=num(found.stop_price),status=statusOf(found.status);
 const parentStatus=String(parent.status||"").toLowerCase();
 const parentFilled=num(parent.filled_qty);
 const childResult=childStop(parent);
 const child=childResult.child;
 const childStatus=String(child?.status||"").toLowerCase();
 const childFilled=child?num(child.filled_qty):0;
 const parentTerminal=["filled","canceled","cancelled","expired","rejected"].includes(parentStatus);
 const childTerminal=!child||["filled","canceled","cancelled","expired","rejected"].includes(childStatus);
 const expectedBeforeRecovery=parentFilled!==null&&childFilled!==null?parentFilled-childFilled:null;
 const expectedAfterRecovery=expectedBeforeRecovery!==null&&filled!==null?expectedBeforeRecovery-filled:null;
 const valid=found?.id&&String(found.client_order_id||"")===existing.id&&String(found.symbol||"").toUpperCase()===parent.symbol&&
  String(found.side||"").toLowerCase()==="sell"&&String(found.type||found.order_type||"").toLowerCase()==="stop"&&
  String(found.time_in_force||"").toLowerCase()==="gtc"&&qty!==null&&filled!==null&&filled>=0&&filled<=qty&&
  close(qty,Number(existing.qty))&&stop!==null&&close(stop,Number(existing.stop_price))&&status!=="UNKNOWN"&&
  parentTerminal&&childTerminal&&!childResult.ambiguous&&(parentFilled===0||Array.isArray(parent.legs))&&parentFilled!==null&&childFilled!==null&&
  expectedBeforeRecovery>=0&&close(qty,expectedBeforeRecovery)&&expectedAfterRecovery>=0;
 let positions;
 try{positions=await broker("/v2/positions",key,secret);}catch{return fail("Could not verify broker position against the existing recovery stop.",503);}
 const pos=positionFor(positions,parent.symbol);
 if(!valid||!pos.ok){await markUnknown(db,{parentId:parent.id,recoveryId:existing.id,reason:"EXISTING_RECOVERY_STOP_FIELDS_OR_LIFECYCLE_INVALID",details:{valid,parentStatus,childStatus,expectedBeforeRecovery,positionReason:pos.reason||null}});return fail("Existing recovery stop, parent/child lifecycle, or position does not match the durable ledger; manual recovery is required.",503,{status:"UNKNOWN"});}
 const leaves=num(found.leaves_qty)??(qty-filled);
 const flat=!pos.position||pos.position.qty===0;
 if(!pos.ok||pos.position&&pos.position.side!=="long"||pos.position&&!close(pos.position.qty,expectedAfterRecovery)){
  await markUnknown(db,{parentId:parent.id,recoveryId:existing.id,reason:"EXISTING_RECOVERY_STOP_POSITION_DOES_NOT_MATCH_CUMULATIVE_FILLS",details:{expectedAfterRecovery,position:pos.position}});
  return fail("Existing recovery stop position does not match entry fills minus child and recovery-stop fills.",503,{status:"UNKNOWN"});
 }
 if(status==="ACCEPTED"||status==="PARTIALLY_FILLED"){
  if(!pos.position||!close(pos.position.qty,leaves)){
   await markUnknown(db,{parentId:parent.id,recoveryId:existing.id,reason:"EXISTING_RECOVERY_STOP_DOES_NOT_COVER_POSITION",details:{leaves,position:pos.position}});
   return fail("Existing recovery stop does not cover the exact remaining long position.",503,{status:"UNKNOWN"});
  }
 }else if(!flat){
  return fail("The existing recovery stop is no longer active while exposure remains. No replacement was submitted; manual recovery is required.",409,{status:"MANUAL_RECOVERY_REQUIRED"});
 }
 const noExposure=["FILLED","CANCELED","REJECTED"].includes(status)&&(!pos.position||pos.position.qty===0);
 const now=new Date().toISOString();
 const writes=await db.batch([
  db.prepare("UPDATE paper_orders SET broker_order_id=?,status=?,response_json=?,updated_at=? WHERE id=?").bind(found.id,status,safeJson(found),now,existing.id),
  db.prepare("INSERT INTO paper_trade_events(order_id,event_type,event_at,source,details_json) VALUES(?,?,?,?,?)").bind(parent.id,"PAPER_RECOVERY_STOP_REVERIFIED",now,"alpaca_paper",safeJson({recoveryOrderId:existing.id,status,position:pos.position,execution:false}))
 ]);
 if(writes.some(x=>Number(x?.meta?.changes)!==1))return fail("Existing recovery order was verified but its ledger update failed; reconcile before continuing.",503,{status:"UNKNOWN"});
 return Response.json({ok:true,recovered:true,execution:false,status:noExposure?"COMPLETED_NO_EXPOSURE":"PROTECTED_BY_STANDALONE_GTC_STOP",recoveryOrderId:existing.id,brokerOrderId:found.id,position:pos.position,protectiveStopVerified:!noExposure,message:"Existing recovery order was queried and reconciled; no second order was submitted."},{headers:H});
}
export async function onRequestPost({request,env}){
 if(!authorized(request,env))return fail("Operator authentication is required.",401);
 const db=env?.NORTHSTAR_DB,key=env?.ALPACA_API_KEY_ID,secret=env?.ALPACA_API_SECRET_KEY;
 if(!db||!key||!secret)return fail("Paper ledger or Alpaca Paper credentials unavailable.",503);
 let body;try{body=await request.json();}catch{return fail("Send valid JSON.");}
 const parentId=String(body?.orderId||"");
 if(!/^[0-9a-f-]{36}$/i.test(parentId)||body?.confirmation!=="RECOVER_THIS_PAPER_ORDER")return fail("Provide a Northstar orderId and exact recovery confirmation.");
 let control,parentRow,existing;
 try{
  [control,parentRow,existing]=await Promise.all([
   db.prepare("SELECT enabled,mode,kill_switch FROM execution_control WHERE id=1").first(),
   db.prepare("SELECT id,broker_order_id,symbol,side,qty,stop_price,status,response_json FROM paper_orders WHERE id=?").bind(parentId).first(),
   db.prepare("SELECT id,qty,stop_price,status,broker_order_id,response_json FROM paper_orders WHERE idempotency_key=?").bind("recovery:"+parentId).first()
  ]);
 }catch{return fail("Could not read the complete recovery ledger; fail-closed.",503);}
 if(!control||control.mode!=="paper"||Number(control.enabled)!==0||Number(control.kill_switch)!==1)return fail("Emergency recovery is allowed only while paper execution is disabled and the kill switch is engaged.",409);
 if(!parentRow||String(parentRow.side||"").toLowerCase()!=="buy"||!parentRow.broker_order_id||!num(parentRow.stop_price))return fail("The referenced Northstar BUY order is missing, incomplete, or not broker-linked.",404);
 if(!/^[A-Z][A-Z0-9.-]{0,9}$/.test(String(parentRow.symbol||"").toUpperCase())||!Number.isInteger(Number(parentRow.qty))||Number(parentRow.qty)<=0)return fail("The Northstar parent order fields are invalid.",409);
 const symbol=String(parentRow.symbol).toUpperCase();
 let parent;
 try{parent=await broker("/v2/orders/"+encodeURIComponent(parentRow.broker_order_id)+"?nested=true",key,secret);}
 catch(e){return fail("Could not retrieve the original Alpaca Paper parent order; no recovery mutation was made.",503,{brokerStatus:e.status||null});}
 if(String(parent?.id||"")!==String(parentRow.broker_order_id)||String(parent.client_order_id||"")!==parentId||String(parent.order_class||"").toLowerCase()!=="oto"||String(parent.symbol||"").toUpperCase()!==symbol||String(parent.side||"").toLowerCase()!=="buy"||!close(num(parent.qty),Number(parentRow.qty)))return fail("Broker parent order does not match the Northstar OTO ledger; manual recovery is required.",409);
 if(num(parent.filled_qty)>0&&!Array.isArray(parent.legs))return fail("Alpaca Paper did not return the nested OTO child list; no recovery mutation was made.",503);
 if(existing)return verifyExistingRecovery(db,key,secret,{...parent,id:parentId},existing);

 let brokerPositions;
 try{brokerPositions=await broker("/v2/positions",key,secret);}catch{return fail("Could not retrieve the authoritative Alpaca Paper position set.",503);}
 const position=positionFor(brokerPositions,symbol);
 if(!position.ok)return fail("Broker position set is ambiguous or malformed; manual recovery is required.",409,{reason:position.reason});
 const childResult=childStop(parent);
 if(childResult.ambiguous)return fail("More than one OTO stop child was returned; manual recovery is required.",409);
 const child=childResult.child;
 let decision=evaluatePartialFillRecovery({parent,stopChild:child,brokerPosition:position.position,stopPrice:parentRow.stop_price,quote:null});
 const requestId=request.headers.get("X-Request-ID")||parentId;
 if(decision.action==="CANCEL_PARENT_REMAINDER"){
  try{
   await audit(db,{orderId:parentId,event:"PAPER_RECOVERY_CANCEL_PARENT_REQUESTED",details:{brokerOrderId:parent.id,parentStatus:parent.status,filledQty:parent.filled_qty},requestId});
   await broker("/v2/orders/"+encodeURIComponent(parent.id),key,secret,{method:"DELETE"});
   await audit(db,{orderId:parentId,event:"PAPER_RECOVERY_CANCEL_PARENT_ACCEPTED",outcome:"ACCEPTED",details:{brokerOrderId:parent.id},requestId});
   return Response.json({ok:true,recovered:false,execution:false,status:"CANCEL_REQUEST_ACCEPTED",nextAction:"REQUERY_PARENT_UNTIL_TERMINAL",message:"Cancellation was accepted. Re-run recovery after Alpaca reports a terminal parent status; no stop order was submitted."},{status:202,headers:H});
  }catch(e){return fail("Parent cancellation was not confirmed. Re-query broker state before taking another action.",503,{brokerStatus:e.status||null});}
 }
 if(decision.action==="WAIT_FOR_CANCEL_CONFIRMATION")return Response.json({ok:true,recovered:false,execution:false,status:"WAITING_FOR_PARENT_CANCEL",message:"The parent is pending cancellation. No further broker mutation was made."},{status:202,headers:H});
 if(decision.action==="CANCEL_HELD_STOP_CHILD"){
  if(!decision.heldStopOrderId)return fail("Held OTO child has no broker order ID; manual recovery is required.",409);
  try{
   await audit(db,{orderId:parentId,event:"PAPER_RECOVERY_CANCEL_HELD_CHILD_REQUESTED",details:{childOrderId:decision.heldStopOrderId,positionQty:decision.positionQty},requestId});
   await broker("/v2/orders/"+encodeURIComponent(decision.heldStopOrderId),key,secret,{method:"DELETE"});
   await audit(db,{orderId:parentId,event:"PAPER_RECOVERY_CANCEL_HELD_CHILD_ACCEPTED",outcome:"ACCEPTED",details:{childOrderId:decision.heldStopOrderId},requestId});
   return Response.json({ok:true,recovered:false,execution:false,status:"HELD_CHILD_CANCEL_REQUEST_ACCEPTED",nextAction:"REQUERY_PARENT_AND_POSITION",message:"The non-protective held child cancellation was accepted. Re-run recovery after the child is terminal; no replacement stop was submitted."},{status:202,headers:H});
  }catch(e){return fail("Held-child cancellation was not confirmed. Re-query broker state before taking another action.",503,{brokerStatus:e.status||null});}
 }
 if(decision.reason==="FRESH_BID_REQUIRED_BEFORE_STANDALONE_STOP"){
  let quote;
  try{quote=await broker("/v2/stocks/"+encodeURIComponent(symbol)+"/quotes/latest?feed=iex",key,secret);}catch{return fail("A fresh quote is unavailable; no recovery stop was submitted.",503);}
  decision=evaluatePartialFillRecovery({parent,stopChild:child,brokerPosition:position.position,stopPrice:parentRow.stop_price,quote:{bid:quote?.quote?.bp,timestamp:quote?.quote?.t}});
 }
 if(!decision.ok||decision.action==="MANUAL_RECOVERY_REQUIRED")return fail("Recovery policy requires manual intervention; no broker mutation was made.",409,{reason:decision.reason,details:decision.details||{}});
 if(decision.action==="COMPLETED_NO_EXPOSURE")return Response.json({ok:true,recovered:true,execution:false,status:"COMPLETED_NO_EXPOSURE",message:"Broker position and recorded fills reconcile to zero exposure; no stop was needed."},{headers:H});
 if(decision.action==="PROTECTED_BY_EXISTING_OTO_STOP")return Response.json({ok:true,recovered:true,execution:false,status:"PROTECTED_BY_EXISTING_OTO_STOP",protectiveStopVerified:true,brokerOrderId:decision.protectiveStopOrderId,positionQty:decision.positionQty,message:"The existing OTO stop is active and covers the exact remaining position."},{headers:H});
 if(decision.action!=="PLACE_STANDALONE_GTC_STOP")return fail("Recovery policy returned an unsupported action; no broker mutation was made.",409,{reason:decision.reason});

 // The first broker snapshot precedes the quote request. Re-read the parent,
 // nested stop child, and exact position after the quote and immediately before
 // the durable recovery-order claim. Never submit a stop sized from stale fills.
 let finalParent,finalPositions,finalQuote;
 try{
  [finalParent,finalPositions,finalQuote]=await Promise.all([
   broker("/v2/orders/"+encodeURIComponent(parentRow.broker_order_id)+"?nested=true",key,secret),
   broker("/v2/positions",key,secret),
   broker("/v2/stocks/"+encodeURIComponent(symbol)+"/quotes/latest?feed=iex",key,secret)
  ]);
 }catch{return fail("Could not refresh the broker parent, child, position, and quote immediately before recovery; no stop was submitted.",503);}
 const finalParentMatches=String(finalParent?.id||"")===String(parentRow.broker_order_id)&&
  String(finalParent?.client_order_id||"")===parentId&&String(finalParent?.order_class||"").toLowerCase()==="oto"&&
  String(finalParent?.symbol||"").toUpperCase()===symbol&&String(finalParent?.side||"").toLowerCase()==="buy"&&
  close(num(finalParent?.qty),Number(parentRow.qty));
 const finalPosition=positionFor(finalPositions,symbol);
 const finalChildResult=childStop(finalParent);
 if(!finalParentMatches||!finalPosition.ok||finalChildResult.ambiguous)return fail("Broker parent/child identity or position changed during recovery; no standalone stop was submitted.",409,{reason:!finalParentMatches?"PARENT_CHANGED_BEFORE_RECOVERY_POST":finalPosition.reason||"AMBIGUOUS_STOP_CHILD"});
 const finalDecision=evaluatePartialFillRecovery({
  parent:finalParent,stopChild:finalChildResult.child,brokerPosition:finalPosition.position,
  stopPrice:parentRow.stop_price,quote:{bid:finalQuote?.quote?.bp,timestamp:finalQuote?.quote?.t}
 });
 if(finalDecision.action==="COMPLETED_NO_EXPOSURE")return Response.json({ok:true,recovered:true,execution:false,status:"COMPLETED_NO_EXPOSURE",message:"The final broker recheck confirms zero exposure; no stop was needed."},{headers:H});
 if(finalDecision.action==="PROTECTED_BY_EXISTING_OTO_STOP")return Response.json({ok:true,recovered:true,execution:false,status:"PROTECTED_BY_EXISTING_OTO_STOP",protectiveStopVerified:true,brokerOrderId:finalDecision.protectiveStopOrderId,positionQty:finalDecision.positionQty,message:"The final broker recheck confirms the existing OTO stop covers the exact remaining position."},{headers:H});
 if(!finalDecision.ok||finalDecision.action!=="PLACE_STANDALONE_GTC_STOP")return fail("The final broker recheck no longer permits a standalone recovery stop; no stop was submitted.",409,{reason:finalDecision.reason||finalDecision.action,details:finalDecision.details||{}});
 let finalControl;
 try{finalControl=await db.prepare("SELECT enabled,mode,kill_switch FROM execution_control WHERE id=1").first();}catch{return fail("Could not recheck the paper kill switch immediately before recovery; no stop was submitted.",503);}
 if(!finalControl||finalControl.mode!=="paper"||Number(finalControl.enabled)!==0||Number(finalControl.kill_switch)!==1)return fail("Paper execution controls changed during recovery; no standalone stop was submitted.",409,{reason:"RECOVERY_REQUIRES_DISABLED_PAPER_EXECUTION_AND_ENGAGED_KILL_SWITCH"});
 decision=finalDecision;

 const order=decision.order,clientId=crypto.randomUUID(),now=new Date().toISOString(),idempotencyKey="recovery:"+parentId;
 const precision=Number(order.stop_price)>=1?2:4;
 const formattedStop=Number(order.stop_price).toFixed(precision);
 if(!close(Number(formattedStop),Number(order.stop_price),0.0000001))return fail("The stop price does not meet Alpaca's supported price increment; no recovery order was submitted.",409,{reason:"STOP_PRICE_PRECISION_UNSUPPORTED"});
 const payload={symbol:order.symbol,qty:String(order.qty),side:"sell",type:"stop",time_in_force:"gtc",stop_price:formattedStop,client_order_id:clientId};
 const requestHash=await digest(payload);
 try{
  const writes=await db.batch([
   db.prepare("INSERT INTO paper_orders(id,idempotency_key,client_request_hash,symbol,side,qty,order_type,time_in_force,stop_price,status,submitted_at,updated_at,response_json) VALUES(?,?,?,?,?,?,?,?,?,'SUBMITTING',?,?,?)").bind(clientId,idempotencyKey,requestHash,symbol,"sell",order.qty,"stop","gtc",order.stop_price,now,now,safeJson({client_order_id:clientId,requestHash,parentOrderId:parentId,recovery:true,execution:false})),
   db.prepare("INSERT INTO paper_trade_events(order_id,event_type,event_at,source,details_json) VALUES(?,?,?,?,?)").bind(parentId,"PAPER_RECOVERY_STANDALONE_STOP_SUBMITTING",now,"northstar_paper_recovery",safeJson({recoveryOrderId:clientId,qty:order.qty,stopPrice:order.stop_price,execution:false})),
   db.prepare("INSERT INTO execution_audit_log(actor,action,outcome,request_id,details_json) VALUES(?,?,?,?,?)").bind("operator","PAPER_RECOVERY_STANDALONE_STOP","SUBMITTING",requestId,safeJson({parentOrderId:parentId,recoveryOrderId:clientId,symbol,qty:order.qty,stopPrice:order.stop_price,execution:false}))
  ]);
  if(writes.some(x=>Number(x?.meta?.changes)!==1))throw new Error("RECOVERY_ORDER_LEDGER_WRITE_FAILED");
 }catch{return fail("Could not persist the idempotent recovery stop before submission. No broker order was submitted.",503);}
 let submitted;
 try{submitted=await broker("/v2/orders",key,secret,{method:"POST",body:JSON.stringify(payload)});}
 catch{
  try{submitted=await broker("/v2/orders:by_client_order_id?client_order_id="+encodeURIComponent(clientId),key,secret);}
  catch{
   try{await markUnknown(db,{parentId,recoveryId:clientId,reason:"RECOVERY_STOP_SUBMISSION_OUTCOME_UNKNOWN",details:{clientOrderId:clientId}});}catch{}
   return fail("Recovery stop submission is ambiguous. The ledger is UNKNOWN and the kill switch remains engaged; do not retry.",503,{status:"UNKNOWN",recoveryOrderId:clientId});
  }
 }
 if(!submitted?.id){
  try{submitted=await broker("/v2/orders:by_client_order_id?client_order_id="+encodeURIComponent(clientId),key,secret);}catch{}
 }
 const brokerQty=num(submitted?.qty),brokerFilled=num(submitted?.filled_qty),brokerStop=num(submitted?.stop_price),brokerStatus=statusOf(submitted?.status);
 const exact=submitted?.id&&String(submitted.client_order_id||"")===clientId&&String(submitted.symbol||"").toUpperCase()===symbol&&
  String(submitted.side||"").toLowerCase()==="sell"&&String(submitted.type||submitted.order_type||"").toLowerCase()==="stop"&&
  String(submitted.time_in_force||"").toLowerCase()==="gtc"&&brokerQty!==null&&close(brokerQty,order.qty)&&brokerFilled!==null&&brokerFilled>=0&&brokerFilled<=brokerQty&&
  brokerStop!==null&&close(brokerStop,order.stop_price)&&brokerStatus!=="UNKNOWN";
 if(!exact){
  try{await markUnknown(db,{parentId,recoveryId:clientId,reason:"RECOVERY_STOP_BROKER_RESPONSE_MISMATCH",details:{brokerOrderId:submitted?.id||null,status:submitted?.status||null}});}catch{}
  return fail("Broker recovery-stop response did not match the exact sell-only GTC request. Treat as UNKNOWN; no retry is permitted.",503,{status:"UNKNOWN",recoveryOrderId:clientId});
 }
 let finalPositions;
 try{finalPositions=await broker("/v2/positions",key,secret);}catch{return fail("Recovery stop was submitted but final position coverage could not be verified; reconcile immediately.",503,{recoveryOrderId:clientId,brokerOrderId:submitted.id,status:brokerStatus});}
 const finalPosition=positionFor(finalPositions,symbol);
 const leaves=num(submitted.leaves_qty)??(brokerQty-brokerFilled);
 const active=["ACCEPTED","PARTIALLY_FILLED"].includes(brokerStatus);
 const protectedNow=active&&finalPosition.ok&&finalPosition.position?.side==="long"&&close(finalPosition.position.qty,leaves);
 const noExposure=brokerStatus==="FILLED"&&finalPosition.ok&&(!finalPosition.position||finalPosition.position.qty===0);
 if(!protectedNow&&!noExposure){
  try{await markUnknown(db,{parentId,recoveryId:clientId,reason:"RECOVERY_STOP_POSITION_COVERAGE_NOT_VERIFIED",details:{brokerStatus,leaves,position:finalPosition.position||null,positionError:finalPosition.reason||null}});}catch{}
  return fail("Recovery stop exists but exact remaining-position coverage could not be verified. The ledger is UNKNOWN; manual recovery is required.",503,{status:"UNKNOWN",recoveryOrderId:clientId,brokerOrderId:submitted.id});
 }
 const storedStatus=brokerStatus;
 try{
  const writes=await db.batch([
   db.prepare("UPDATE paper_orders SET broker_order_id=?,status=?,response_json=?,updated_at=? WHERE id=? AND status='SUBMITTING'").bind(submitted.id,storedStatus,safeJson(submitted),new Date().toISOString(),clientId),
   db.prepare("INSERT INTO paper_trade_events(order_id,event_type,event_at,source,details_json) VALUES(?,?,?,?,?)").bind(parentId,"PAPER_RECOVERY_STOP_VERIFIED",new Date().toISOString(),"alpaca_paper",safeJson({recoveryOrderId:clientId,brokerOrderId:submitted.id,status:storedStatus,position:finalPosition.position,execution:false})),
   db.prepare("INSERT INTO execution_audit_log(actor,action,outcome,request_id,details_json) VALUES(?,?,?,?,?)").bind("operator","PAPER_RECOVERY_STOP_VERIFIED",storedStatus,requestId,safeJson({parentOrderId:parentId,recoveryOrderId:clientId,brokerOrderId:submitted.id,position:finalPosition.position,execution:false}))
  ]);
  if(writes.some(x=>Number(x?.meta?.changes)!==1))throw new Error("RECOVERY_STOP_LEDGER_FINALIZE_INCOMPLETE");
 }catch{
  try{await markUnknown(db,{parentId,recoveryId:clientId,reason:"RECOVERY_STOP_LEDGER_FINALIZE_FAILED",details:{brokerOrderId:submitted.id}});}catch{}
  return fail("Recovery stop exists but its ledger finalization failed. Treat as UNKNOWN and reconcile; never resubmit.",503,{recoveryOrderId:clientId,brokerOrderId:submitted.id,status:"UNKNOWN"});
 }
 return Response.json({ok:true,recovered:true,execution:false,status:noExposure?"COMPLETED_NO_EXPOSURE":"PROTECTED_BY_STANDALONE_GTC_STOP",recoveryOrderId:clientId,brokerOrderId:submitted.id,position:finalPosition.position,protectiveStopVerified:protectedNow,message:noExposure?"The protective stop filled and the broker position is flat.":"A standalone GTC sell stop was verified against the exact remaining long position."},{status:201,headers:H});
}
