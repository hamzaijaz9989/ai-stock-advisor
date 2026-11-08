// Explicitly confirmed, fail-closed Alpaca PAPER order submission.
// Requires both the operator token and a separate paper-execution approval secret.
// This route is dormant while execution_control.enabled=0 / kill_switch=1.
import {deriveSnapshotRiskMetrics} from "../../../lib/paper-order-guards.js";
import {validatePaperExecutionGate} from "../../../lib/paper-execution-policy.js";

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
   db.prepare("SELECT id,status FROM paper_orders WHERE status IN ('SUBMITTING','ACCEPTED','PARTIALLY_FILLED','UNKNOWN') ORDER BY updated_at DESC LIMIT 500").all()
  ]);
 }catch{return fail("Could not verify complete paper ledger; fail-closed.",503);}
 if(existing){
  // Never blindly retry. First ask Alpaca whether the stable client_order_id already exists.
  try{
   const found=await broker("/v2/orders:by_client_order_id?client_order_id="+encodeURIComponent(existing.id),key,secret);
   if(found?.id){const recoveredStatus=normalizeStatus(found.status);await db.prepare("UPDATE paper_orders SET broker_order_id=?,status=?,response_json=?,updated_at=? WHERE id=?").bind(found.id,recoveredStatus,safeJson(found),new Date().toISOString(),existing.id).run();return Response.json({ok:true,execution:false,replayed:true,status:recoveredStatus,brokerOrderId:found.id,message:"Existing client order recovered; no second order was submitted."},{headers:H});}
  }catch(e){if(e?.status!==404)return fail("Existing submission outcome is uncertain. No retry was attempted; reconcile by client_order_id.",503,{orderId:existing.id,status:existing.status});}
  return fail("An order record already exists. No automatic resubmission is permitted.",409,{orderId:existing.id,status:existing.status});
 }
 // Enforce the global kill switch before considering any proposal or broker state.
 if(!control||control.mode!=="paper"||Number(control.enabled)!==1||Number(control.kill_switch)!==0||Number(control.max_portfolio_usd)!==1000)return fail("Paper execution controls are disabled or kill-switched.",503);
 if(!intent||intent.status!=="APPROVED_REVIEW_ONLY"||intent.side!=="buy")return fail("Only a specifically approved, long-only review intent can be considered.",409);
 if((positions.results||[]).length!==0||(orders.results||[]).length!==0)return fail("Initial executor permits no existing positions or unresolved orders; reconcile first.",409);
 let account,quote;
 try{[account,quote]=await Promise.all([broker("/v2/account",key,secret),broker("/v2/stocks/"+encodeURIComponent(intent.symbol)+"/quotes/latest?feed=iex",key,secret)]);}
 catch(e){return fail("Alpaca Paper account or quote unavailable; no order submitted.",503);}
 if(account.status!=="ACTIVE"||account.trading_blocked||account.account_blocked)return fail("Alpaca Paper account is restricted.",503);
 const q=quote?.quote,bid=num(q?.bp),ask=num(q?.ap),timestamp=q?.t;
 const history=deriveSnapshotRiskMetrics({snapshots:snapshots.results||[],currentEquity:account.equity,lastEquity:account.last_equity,virtualAllocationUsd:1000});
 if(!history.ok)return fail("Verified recent equity history is required: "+history.reason,503);
 // Require a fully flat broker and ledger before enabling this first, deliberately narrow executor.
 let brokerPositions,brokerOrders;
 try{[brokerPositions,brokerOrders]=await Promise.all([broker("/v2/positions",key,secret),broker("/v2/orders?status=open&limit=500",key,secret)]);}
 catch{return fail("Could not verify broker positions and open orders.",503);}
 if(!Array.isArray(brokerPositions)||!Array.isArray(brokerOrders)||brokerOrders.length>0||(orders.results||[]).length>0)return fail("Executor requires no open broker orders or unresolved Northstar orders; reconcile first.",409);
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
   await db.prepare("UPDATE paper_orders SET status='UNKNOWN',updated_at=?,response_json=? WHERE id=?").bind(new Date().toISOString(),safeJson({client_order_id:id,outcome:"UNKNOWN_REQUIRES_RECONCILIATION"}),id).run();
   return fail("Submission outcome is uncertain. Order marked UNKNOWN; no retry was attempted. Reconcile this client_order_id before any further action.",503,{orderId:id,status:"UNKNOWN"});
  }
 }
 const normalized=normalizeStatus(result?.status);
 try{
  await db.batch([
   db.prepare("UPDATE paper_orders SET broker_order_id=?,status=?,response_json=?,updated_at=? WHERE id=? AND status IN ('SUBMITTING','UNKNOWN')").bind(result?.id||null,normalized,safeJson(result),new Date().toISOString(),id),
   db.prepare("INSERT INTO paper_trade_events(order_id,event_type,event_at,source,details_json) VALUES(?,?,?,?,?)").bind(id,"BROKER_RESPONSE",new Date().toISOString(),"alpaca_paper",safeJson({brokerOrderId:result?.id||null,status:normalized})),
   db.prepare("UPDATE paper_trade_intents SET status='APPROVED_REVIEW_ONLY',updated_at=? WHERE id=?").bind(new Date().toISOString(),intentId)
  ]);
 }catch{return fail("Broker response received but ledger update failed. Treat order as unresolved and reconcile; do not retry.",503,{orderId:id,brokerOrderId:result?.id||null,status:"UNKNOWN"});}
 return Response.json({ok:normalized!=="REJECTED",execution:false,submittedTo:"alpaca-paper",orderId:id,brokerOrderId:result?.id||null,status:normalized,qty:intent.qty,symbol:intent.symbol,estimatedNotionalUsd:gate.sizing.notionalUsd,plannedStopRiskUsd:gate.sizing.plannedRiskUsd,message:"Paper order submitted. This is not a live-market order."},{status:normalized==="REJECTED"?409:201,headers:H});
}
