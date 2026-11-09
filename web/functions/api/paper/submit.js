// Explicitly confirmed, fail-closed Alpaca PAPER order submission.
// Requires both the operator token and a separate paper-execution approval secret.
// This route is dormant while execution_control.enabled=0 / kill_switch=1.
import {deriveSnapshotRiskMetrics} from "../../../lib/paper-order-guards.js";
import {validatePaperExecutionGate,verifyOtoStopLeg} from "../../../lib/paper-execution-policy.js";

const H={"Cache-Control":"no-store","X-Content-Type-Options":"nosniff","Referrer-Policy":"no-referrer"};
const fail=(error,status=400,extra={})=>Response.json({ok:false,execution:false,error,...extra},{status,headers:H});
function equal(a,b){if(typeof a!=="string"||typeof b!=="string"||!a||!b)return false;let d=a.length^b.length;for(let i=0;i<Math.max(a.length,b.length);i++)d|=(a.charCodeAt(i)||0)^(b.charCodeAt(i)||0);return d===0;}
function authorized(req,env){return equal(req.headers.get("Authorization")||"","Bearer "+(env?.NORTHSTAR_OPERATOR_TOKEN||""))&&equal(req.headers.get("X-NORTHSTAR-PAPER-APPROVAL")||"",(env?.NORTHSTAR_PAPER_EXECUTION_APPROVAL_TOKEN||""))&&!!env?.NORTHSTAR_OPERATOR_TOKEN&&!!env?.NORTHSTAR_PAPER_EXECUTION_APPROVAL_TOKEN;}
async function broker(path,key,secret,options={}){
 const r=await fetch("https://paper-api.alpaca.markets"+path,{...options,headers:{"APCA-API-KEY-ID":key,"APCA-API-SECRET-KEY":secret,"Accept":"application/json","Content-Type":"application/json",...(options.headers||{})},signal:AbortSignal.timeout(10000)});
 const raw=await r.text();let data={};try{data=raw?JSON.parse(raw):{};}catch{}
 if(!r.ok){const e=new Error("ALPACA_HTTP_"+r.status);e.status=r.status;e.data=data;throw e;}return data;
}
const num=v=>v!==null&&v!==undefined&&v!==""&&Number.isFinite(Number(v))?Number(v):null;
const close=(a,b,t=.0001)=>Math.abs(Number(a)-Number(b))<=t;
const normalizeStatus=value=>{const s=String(value||"UNKNOWN").toUpperCase();if(["NEW","PENDING_NEW","HELD","ACCEPTED"].includes(s))return "ACCEPTED";return ["PARTIALLY_FILLED","FILLED","CANCELED","REJECTED","UNKNOWN"].includes(s)?s:"UNKNOWN";};
const safeJson=v=>JSON.stringify(v??{});
async function digest(v){const d=await crypto.subtle.digest("SHA-256",new TextEncoder().encode(JSON.stringify(v)));return [...new Uint8Array(d)].map(x=>x.toString(16).padStart(2,"0")).join("");}
async function markUnknown(db,{orderId,intentId,brokerOrderId=null,response={},reason}) {
 const now=new Date().toISOString();
 await db.batch([
  db.prepare("UPDATE paper_orders SET broker_order_id=?,status='UNKNOWN',response_json=?,updated_at=? WHERE id=?").bind(brokerOrderId,safeJson({brokerResponse:response,reason}),now,orderId),
  db.prepare("UPDATE execution_control SET enabled=0,kill_switch=1,updated_at=? WHERE id=1").bind(now),
  db.prepare("INSERT INTO paper_trade_events(order_id,event_type,event_at,source,details_json) VALUES(?,?,?,?,?)").bind(orderId,"SUBMISSION_UNKNOWN",now,"northstar",safeJson({intentId,brokerOrderId,reason,execution:false})),
  db.prepare("INSERT INTO execution_audit_log(actor,action,outcome,request_id,details_json) VALUES(?,?,?,?,?)").bind("system","PAPER_ORDER_OUTCOME_UNVERIFIED","UNKNOWN",orderId,safeJson({intentId,brokerOrderId,reason,killSwitchEngaged:true}))
 ]);
}
export async function onRequestPost({request,env}){
 if(!authorized(request,env))return fail("A separate operator and paper-execution approval credential are required.",401);
 const db=env?.NORTHSTAR_DB,key=env?.ALPACA_API_KEY_ID,secret=env?.ALPACA_API_SECRET_KEY;
 if(!db||!key||!secret)return fail("Paper ledger or Alpaca Paper credentials unavailable.",503);
 let body;try{body=await request.json();}catch{return fail("Send valid JSON.");}
 const intentId=String(body?.intentId||"");
 if(!/^[0-9a-f-]{36}$/i.test(intentId)||body?.confirmation!=="SUBMIT_THIS_PAPER_ORDER")return fail("Provide an intentId and exact paper-order confirmation.");
 let control,intent,existing,snapshots,positions,orders;
 try{
  [control,intent,existing,snapshots,positions,orders]=await Promise.all([
   db.prepare("SELECT enabled,mode,kill_switch,max_portfolio_usd,default_risk_fraction,max_risk_fraction,max_position_fraction FROM execution_control WHERE id=1").first(),
   db.prepare("SELECT id,symbol,side,qty,reference_price,stop_price,status,request_hash FROM paper_trade_intents WHERE id=?").bind(intentId).first(),
   db.prepare("SELECT id,idempotency_key,client_request_hash,status,broker_order_id,response_json FROM paper_orders WHERE idempotency_key=?").bind("intent:"+intentId).first(),
   db.prepare("SELECT captured_at,equity_usd FROM paper_equity_snapshots ORDER BY captured_at DESC LIMIT 1000").all(),
   db.prepare("SELECT symbol,qty,avg_entry_price FROM paper_positions ORDER BY symbol").all(),
   db.prepare("SELECT id,status FROM paper_orders ORDER BY updated_at DESC LIMIT 501").all()
  ]);
 }catch{return fail("Could not verify complete paper ledger; fail-closed.",503);}
 if(existing){
  // Never blindly retry. Recover the stable client_order_id and re-verify its
  // nested stop-loss leg before declaring an existing OTO order protected.
  try{
   const found=await broker("/v2/orders:by_client_order_id?client_order_id="+encodeURIComponent(existing.id),key,secret);
   if(found?.id){
    if(!intent){try{await markUnknown(db,{orderId:existing.id,brokerOrderId:found.id,response:found,reason:"RECOVERY_INTENT_MISSING"});}catch{}return fail("Existing broker order has no matching intent record. Treat as UNKNOWN and reconcile manually.",503,{orderId:existing.id,status:"UNKNOWN"});}
    let recovered=found,recoveredStatus=normalizeStatus(found.status),filled=num(found.filled_qty);
    if(recoveredStatus==="UNKNOWN"||filled===null||filled<0||filled>Number(intent.qty)||(recoveredStatus==="FILLED"&&Math.abs(filled-Number(intent.qty))>0.0001)||(recoveredStatus==="PARTIALLY_FILLED"&&(filled<=0||filled>=Number(intent.qty)))||(filled>0&&(!num(found.filled_avg_price)||num(found.filled_avg_price)<=0))){
     try{await markUnknown(db,{orderId:existing.id,intentId,brokerOrderId:found.id,response:found,reason:"RECOVERED_ORDER_STATE_INCONSISTENT"});}catch{}
     return fail("Recovered broker order state is inconsistent. Treat as UNKNOWN; no retry was attempted.",503,{orderId:existing.id,brokerOrderId:found.id,status:"UNKNOWN"});
    }
    let recoveredStopVerified=false;
    if(!(recoveredStatus==="REJECTED"||recoveredStatus==="CANCELED"&&filled===0)){
     const nested=await broker("/v2/orders?status=all&limit=500&direction=desc&nested=true",key,secret);
     if(!Array.isArray(nested))throw new Error("NESTED_ORDER_LIST_INVALID");
     recovered=nested.find(order=>String(order?.id||"")===String(found.id))||null;
     const parentMatches=recovered&&String(recovered.symbol||"").toUpperCase()===intent.symbol&&String(recovered.side||"").toLowerCase()==="buy"&&Math.abs(Number(recovered.qty)-Number(intent.qty))<=0.0001&&String(recovered.client_order_id||"")===existing.id;
     const recoveredStopCheck=verifyOtoStopLeg(recovered,{symbol:intent.symbol,qty:intent.qty,stopPrice:intent.stop_price});
     if(!parentMatches||!recoveredStopCheck.ok||(filled>0&&!recoveredStopCheck.protected)){
      try{await markUnknown(db,{orderId:existing.id,intentId,brokerOrderId:found.id,response:recovered||found,reason:"RECOVERED_PROTECTIVE_STOP_NOT_VERIFIED"});}catch{}
      return fail("Recovered OTO stop-loss leg is missing, inactive for exposed shares, or mismatched. Treat as UNKNOWN and reconcile manually.",503,{orderId:existing.id,brokerOrderId:found.id,status:"UNKNOWN"});
     }
     recoveredStopVerified=recoveredStopCheck.protected===true;
     recoveredStatus=normalizeStatus(recovered.status);filled=num(recovered.filled_qty);
     if(recoveredStatus==="UNKNOWN"||filled===null||filled<0||filled>Number(intent.qty)||(recoveredStatus==="FILLED"&&Math.abs(filled-Number(intent.qty))>0.0001)||(recoveredStatus==="PARTIALLY_FILLED"&&(filled<=0||filled>=Number(intent.qty)))){
      try{await markUnknown(db,{orderId:existing.id,intentId,brokerOrderId:found.id,response:recovered,reason:"RECOVERED_NESTED_STATE_INCONSISTENT"});}catch{}
      return fail("Recovered nested broker state is inconsistent. Treat as UNKNOWN; no retry was attempted.",503,{orderId:existing.id,brokerOrderId:found.id,status:"UNKNOWN"});
     }
    }
    const recoveredIntentStatus=recoveredStatus==="REJECTED"?"REJECTED":recoveredStatus==="CANCELED"?"CANCELLED":null;
    const statements=[
     db.prepare("UPDATE paper_orders SET broker_order_id=?,status=?,response_json=?,updated_at=? WHERE id=?").bind(found.id,recoveredStatus,safeJson(recovered),new Date().toISOString(),existing.id),
     db.prepare("INSERT INTO paper_trade_events(order_id,event_type,event_at,source,details_json) VALUES(?,?,?,?,?)").bind(existing.id,"BROKER_ORDER_RECOVERED",new Date().toISOString(),"alpaca_paper",safeJson({brokerOrderId:found.id,status:recoveredStatus,protectiveStopVerified:recoveredStopVerified})),
     db.prepare("INSERT INTO execution_audit_log(actor,action,outcome,request_id,details_json) VALUES(?,?,?,?,?)").bind("operator","ALPACA_PAPER_ORDER_RECOVERY","VERIFIED",existing.id,safeJson({brokerOrderId:found.id,status:recoveredStatus}))
    ];
    if(recoveredIntentStatus)statements.push(db.prepare("UPDATE paper_trade_intents SET status=?,updated_at=? WHERE id=?").bind(recoveredIntentStatus,new Date().toISOString(),intentId));
    await db.batch(statements);
    return Response.json({ok:true,execution:false,replayed:true,status:recoveredStatus,brokerOrderId:found.id,protectiveStopVerified:recoveredStatus!=="REJECTED"&&!(recoveredStatus==="CANCELED"&&filled===0),message:"Existing client order recovered and reconciled; no second order was submitted."},{headers:H});
   }
  }catch(e){
   try{await markUnknown(db,{orderId:existing.id,intentId,brokerOrderId:existing.broker_order_id||null,response:{ledgerStatus:existing.status},reason:"EXISTING_ORDER_RECOVERY_LOOKUP_FAILED"});}catch{}
   return fail("Existing submission outcome could not be verified. Treat it as UNKNOWN; execution kill switch engagement was attempted. No retry was made.",503,{orderId:existing.id,status:"UNKNOWN"});
  }
  try{await markUnknown(db,{orderId:existing.id,intentId,brokerOrderId:existing.broker_order_id||null,response:{ledgerStatus:existing.status},reason:"EXISTING_CLIENT_ORDER_ID_NOT_FOUND"});}catch{}
  return fail("Northstar has an order record that Alpaca cannot confirm. Treat it as UNKNOWN; no resubmission is permitted.",503,{orderId:existing.id,status:"UNKNOWN"});
 }
 // Enforce the global kill switch before considering any proposal or broker state.
 if(!control||control.mode!=="paper"||Number(control.enabled)!==1||Number(control.kill_switch)!==0||Number(control.max_portfolio_usd)!==1000)return fail("Paper execution controls are disabled or kill-switched.",503);
 if(!intent||intent.status!=="APPROVED_REVIEW_ONLY"||intent.side!=="buy")return fail("Only a specifically approved, long-only review intent can be considered.",409);
 if((positions.results||[]).length!==0||(orders.results||[]).length!==0)return fail("Initial executor requires an empty position ledger and no prior Northstar order history; reconcile first.",409);
 let account,quote,clock;
 try{[account,quote,clock]=await Promise.all([broker("/v2/account",key,secret),broker("/v2/stocks/"+encodeURIComponent(intent.symbol)+"/quotes/latest?feed=iex",key,secret),broker("/v2/clock",key,secret)]);}
 catch(e){return fail("Alpaca Paper account or quote unavailable; no order submitted.",503);}
 if(account.status!=="ACTIVE"||account.trading_blocked||account.account_blocked)return fail("Alpaca Paper account is restricted.",503);
 if(clock?.is_open!==true)return fail("US equity market is closed; no paper market order will be submitted.",409);
 const q=quote?.quote,bid=num(q?.bp),ask=num(q?.ap),timestamp=q?.t;
 const quoteAt=Date.parse(timestamp||""),quoteAge=Date.now()-quoteAt;
 if(!Number.isFinite(bid)||!Number.isFinite(ask)||bid<=0||ask<=0||ask<bid||!Number.isFinite(quoteAt)||quoteAge<0||quoteAge>60000)return fail("Latest Alpaca Paper quote is invalid, future-dated or older than 60 seconds.",503);
 const spread=(ask-bid)/((ask+bid)/2);
 if(spread>0.01)return fail("Current bid/ask spread exceeds the 1% paper-order limit.",409);
 if(Number(intent.stop_price)>=ask)return fail("Protective stop must remain below the current ask for a long entry.",409);
 const historyRows=snapshots.results||[];
 const nowMs=Date.now();
 const latestSnapshotAt=Date.parse(historyRows[0]?.captured_at||"");
 if(!Number.isFinite(latestSnapshotAt)||latestSnapshotAt>nowMs||nowMs-latestSnapshotAt>15*60*1000)return fail("A reconciled equity snapshot no older than 15 minutes is required before paper submission.",503);
 const weeklyBaseline=historyRows.find(row=>{const at=Date.parse(row?.captured_at||"");const value=Number(row?.equity_usd);return Number.isFinite(at)&&at<=nowMs-7*24*60*60*1000&&Number.isFinite(value)&&value>0;});
 if(!weeklyBaseline)return fail("A verified seven-day equity baseline is required before paper submission.",503);
 const history=deriveSnapshotRiskMetrics({snapshots:historyRows,currentEquity:account.equity,lastEquity:account.last_equity,virtualAllocationUsd:1000});
 if(!history.ok)return fail("Verified recent equity history is required: "+history.reason,503);
 // Require a fully flat broker and ledger before enabling this first, deliberately narrow executor.
 let brokerPositions,brokerOrders;
 try{[brokerPositions,brokerOrders]=await Promise.all([broker("/v2/positions",key,secret),broker("/v2/orders?status=all&limit=500&direction=desc",key,secret)]);}
 catch{return fail("Could not verify broker positions and open orders.",503);}
 if(!Array.isArray(brokerPositions)||!Array.isArray(brokerOrders)||brokerPositions.length!==0||brokerOrders.length>0||(orders.results||[]).length>0)return fail("Initial executor requires a fully flat broker and an empty Northstar order history; reconcile first.",409);
 const orderNotional=Number(intent.qty)*ask,buyingPower=num(account.buying_power);
 if(!Number.isInteger(Number(intent.qty))||Number(intent.qty)<=0||!Number.isFinite(orderNotional)||!Number.isFinite(buyingPower)||buyingPower<=0||orderNotional>buyingPower)return fail("Current Alpaca Paper buying power is insufficient or the approved quantity is invalid.",409);
 if(intent.qty>Math.floor(250/(ask||Infinity)))return fail("Approved quantity exceeds the $250 virtual position ceiling at the current ask.",409);
 const gate=validatePaperExecutionGate({control,account,reconciliation:{ok:true,reconciled:true,execution:false},equityHistory:history,quote:{bid,ask,timestamp},order:{symbol:intent.symbol,side:"buy",qty:intent.qty,stopPrice:intent.stop_price},virtualAllocationUsd:1000});
 if(!gate.ok)return fail("Deterministic paper execution policy blocked the order: "+gate.reason,409,{policy:gate});
 if(!Number.isFinite(bid)||!Number.isFinite(ask)||ask<bid)return fail("Invalid current quote.",503);
 const id=crypto.randomUUID(),now=new Date().toISOString(),idem="intent:"+intentId;
 const payload={symbol:intent.symbol,qty:intent.qty,side:"buy",type:"market",time_in_force:"day",order_class:"oto",stop_loss:{stop_price:Number(intent.stop_price).toFixed(2)},client_order_id:id};
 const requestHash=await digest(payload);
 try{
  const writes=await db.batch([
   db.prepare("INSERT INTO paper_orders(id,idempotency_key,client_request_hash,symbol,side,qty,order_type,time_in_force,stop_price,status,submitted_at,updated_at,response_json) VALUES(?,?,?,?,?,?,?,?,?,'SUBMITTING',?,?,?)").bind(id,idem,requestHash,intent.symbol,"buy",intent.qty,"market","day",intent.stop_price,now,now,safeJson({client_order_id:id,requestHash,virtualAllocationUsd:1000,policy:gate.status})),
   db.prepare("INSERT INTO paper_trade_events(order_id,event_type,event_at,source,details_json) VALUES(?,?,?,?,?)").bind(id,"SUBMISSION_STARTED",now,"northstar",safeJson({intentId,requestHash,executionMode:"paper"})),
   db.prepare("INSERT INTO execution_audit_log(actor,action,outcome,request_id,details_json) VALUES(?,?,?,?,?)").bind("operator","ALPACA_PAPER_ORDER_SUBMISSION","SUBMITTING",id,safeJson({intentId,symbol:intent.symbol,qty:intent.qty,virtualAllocationUsd:1000}))
  ]);
  if(writes.some(w=>Number(w?.meta?.changes)!==1))throw new Error("ORDER_LEDGER_WRITE_FAILED");
 }catch{return fail("Could not atomically persist the order intent before submission; no broker request was made.",503);}
 let result;
 try{
  result=await broker("/v2/orders",key,secret,{method:"POST",body:JSON.stringify(payload)});
 }catch(e){
  // A timeout or transport error is ambiguous. Query by client_order_id; never blindly retry.
  try{result=await broker("/v2/orders:by_client_order_id?client_order_id="+encodeURIComponent(id),key,secret);}
  catch{
   try{await markUnknown(db,{orderId:id,intentId,response:{client_order_id:id},reason:"BROKER_SUBMISSION_OUTCOME_UNVERIFIED"});}catch{}
   return fail("Submission outcome is uncertain. Order marked UNKNOWN, execution disabled and kill switch engaged; reconcile before any further action.",503,{orderId:id,status:"UNKNOWN"});
  }
 }
 if(!result?.id){
  try{result=await broker("/v2/orders:by_client_order_id?client_order_id="+encodeURIComponent(id),key,secret);}catch{}
 }
 if(!result?.id){
  try{await markUnknown(db,{orderId:id,intentId,response:result||{},reason:"BROKER_ORDER_ID_MISSING"});}catch{}
  return fail("Broker response did not include a verifiable order ID. Order marked UNKNOWN and kill switch engaged.",503,{orderId:id,status:"UNKNOWN"});
 }
 let normalized=normalizeStatus(result.status),verifiedOrder=result,stopVerification={ok:false,protected:false};
 if(normalized==="UNKNOWN"){
  try{await markUnknown(db,{orderId:id,intentId,brokerOrderId:result.id,response:result,reason:"BROKER_STATUS_UNRECOGNIZED"});}catch{}
  return fail("Broker returned an unrecognized order state. Order marked UNKNOWN and kill switch engaged.",503,{orderId:id,brokerOrderId:result.id,status:"UNKNOWN"});
 }
 if(normalized!=="REJECTED"){
  const initialFilled=num(result.filled_qty);
  if(initialFilled===null||initialFilled<0||initialFilled>Number(intent.qty)||
    (normalized==="FILLED"&&Math.abs(initialFilled-Number(intent.qty))>0.0001)||
    (normalized==="PARTIALLY_FILLED"&&(initialFilled<=0||initialFilled>=Number(intent.qty)))||
    (initialFilled>0&&(!num(result.filled_avg_price)||num(result.filled_avg_price)<=0))){
   try{await markUnknown(db,{orderId:id,intentId,brokerOrderId:result.id,response:result,reason:"BROKER_FILL_SNAPSHOT_INCONSISTENT"});}catch{}
   return fail("Broker fill snapshot is inconsistent with the approved quantity. Order marked UNKNOWN and kill switch engaged.",503,{orderId:id,brokerOrderId:result.id,status:"UNKNOWN"});
  }
  if(!(normalized==="CANCELED"&&initialFilled===0)){
   // Alpaca only returns child legs in nested order responses. Verify the actual
   // stop-loss child before treating the parent OTO order as protected.
   try{
    const nested=await broker("/v2/orders?status=all&limit=500&direction=desc&nested=true",key,secret);
    if(!Array.isArray(nested))throw new Error("NESTED_ORDER_LIST_INVALID");
    verifiedOrder=nested.find(order=>String(order?.id||"")===String(result.id))||null;
   }catch{
    try{await markUnknown(db,{orderId:id,intentId,brokerOrderId:result.id,response:result,reason:"NESTED_OTO_ORDER_LOOKUP_FAILED"});}catch{}
    return fail("Could not verify the broker's nested OTO stop-loss leg. Order marked UNKNOWN and kill switch engaged.",503,{orderId:id,brokerOrderId:result.id,status:"UNKNOWN"});
   }
   const parentMatches=verifiedOrder&&String(verifiedOrder.symbol||"").toUpperCase()===intent.symbol&&String(verifiedOrder.side||"").toLowerCase()==="buy"&&Math.abs(Number(verifiedOrder.qty)-Number(intent.qty))<=0.0001&&String(verifiedOrder.client_order_id||"")===id;
   stopVerification=verifyOtoStopLeg(verifiedOrder,{symbol:intent.symbol,qty:intent.qty,stopPrice:intent.stop_price});
   if(!parentMatches||!stopVerification.ok||(initialFilled>0&&!stopVerification.protected)){
    try{await markUnknown(db,{orderId:id,intentId,brokerOrderId:result.id,response:verifiedOrder||result,reason:"PROTECTIVE_STOP_LEG_NOT_VERIFIED"});}catch{}
    return fail("The exact protective stop-loss child was not verified as active for all exposed shares at Alpaca. Order marked UNKNOWN and kill switch engaged; manual recovery is required.",503,{orderId:id,brokerOrderId:result.id,status:"UNKNOWN"});
   }
   normalized=normalizeStatus(verifiedOrder.status);
   const verifiedFilled=num(verifiedOrder.filled_qty);
   if(normalized==="UNKNOWN"||verifiedFilled===null||verifiedFilled<0||verifiedFilled>Number(intent.qty)||
     (normalized==="FILLED"&&Math.abs(verifiedFilled-Number(intent.qty))>0.0001)||
     (normalized==="PARTIALLY_FILLED"&&(verifiedFilled<=0||verifiedFilled>=Number(intent.qty)))||
     (verifiedFilled>0&&(!num(verifiedOrder.filled_avg_price)||num(verifiedOrder.filled_avg_price)<=0))){
    try{await markUnknown(db,{orderId:id,intentId,brokerOrderId:result.id,response:verifiedOrder,reason:"NESTED_ORDER_STATE_INCONSISTENT"});}catch{}
    return fail("Nested broker order state is inconsistent. Order marked UNKNOWN and kill switch engaged.",503,{orderId:id,brokerOrderId:result.id,status:"UNKNOWN"});
   }
  }
 }
 const intentStatus=normalized==="REJECTED"?"REJECTED":normalized==="CANCELED"?"CANCELLED":null;
 const protectiveStopVerified=normalized!=="REJECTED"&&!(normalized==="CANCELED"&&num(verifiedOrder?.filled_qty)===0)&&stopVerification.protected===true;
 try{
  const statements=[
   db.prepare("UPDATE paper_orders SET broker_order_id=?,status=?,response_json=?,updated_at=? WHERE id=? AND status IN ('SUBMITTING','UNKNOWN')").bind(result.id,normalized,safeJson(verifiedOrder),new Date().toISOString(),id),
   db.prepare("INSERT INTO paper_trade_events(order_id,event_type,event_at,source,details_json) VALUES(?,?,?,?,?)").bind(id,"BROKER_RESPONSE_VERIFIED",new Date().toISOString(),"alpaca_paper",safeJson({brokerOrderId:result.id,status:normalized,protectiveStopVerified}))
  ];
  if(intentStatus)statements.push(db.prepare("UPDATE paper_trade_intents SET status=?,updated_at=? WHERE id=?").bind(intentStatus,new Date().toISOString(),intentId));
  statements.push(db.prepare("INSERT INTO execution_audit_log(actor,action,outcome,request_id,details_json) VALUES(?,?,?,?,?)").bind("operator","ALPACA_PAPER_ORDER_RESPONSE_VERIFIED",normalized,id,safeJson({intentId,brokerOrderId:result.id,status:normalized,protectiveStopVerified})));
  await db.batch(statements);
 }catch{try{await markUnknown(db,{orderId:id,intentId,brokerOrderId:result.id,response:verifiedOrder,reason:"BROKER_RESPONSE_LEDGER_WRITE_FAILED"});}catch{}return fail("Broker response received but ledger update failed. Treat the order as UNKNOWN; execution kill switch engagement was attempted. Reconcile; do not retry.",503,{orderId:id,brokerOrderId:result.id,status:"UNKNOWN"});}
 const canceled=normalized==="CANCELED",rejected=normalized==="REJECTED";
 return Response.json({ok:!canceled&&!rejected,execution:false,submittedTo:"alpaca-paper",orderId:id,brokerOrderId:result.id,status:normalized,protectiveStopVerified,qty:intent.qty,symbol:intent.symbol,estimatedNotionalUsd:gate.sizing.notionalUsd,plannedStopRiskUsd:gate.sizing.plannedRiskUsd,message:rejected?"Alpaca Paper rejected the order; reconcile before any new action.":canceled?"Alpaca Paper canceled the order; inspect any partial exposure and reconcile before any new action.":"Paper order submitted to Alpaca Paper; broker status and protective stop leg were verified. This is not a live-market order."},{status:canceled||rejected?409:201,headers:H});
}
