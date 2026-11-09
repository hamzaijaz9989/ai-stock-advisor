// Explicit PAPER-only activation. This route performs read-only broker checks and
// D1 audit writes only; it never creates, submits, modifies, or cancels an order.
import {onRequestPost as runAccountSync} from "./sync.js";
import {onRequestPost as runFillSync} from "./fills-sync.js";
import {onRequestPost as runReadOnlyReconciliation} from "./reconcile.js";
import {evaluatePaperActivationGate,validatePaperActivationConfiguration} from "../../../lib/paper-activation-gate.js";

const PAPER_API_HOST="https://paper-api.alpaca.markets";
const H={"Cache-Control":"no-store","X-Content-Type-Options":"nosniff","Referrer-Policy":"no-referrer"};
const REQUIRED_MIGRATIONS=[
 "0001_paper_trading.sql","0002_research_decision_traces.sql","0003_research_council_runs.sql",
 "0004_broker_fill_activities.sql","0005_paper_trade_intents.sql","0006_northstar_fill_position_ledger.sql",
 "0007_strategy_validation_approval.sql","0008_paper_execution_single_flight.sql",
 "0009_paper_submission_boundary.sql","0010_paper_intent_review_audit.sql",
 "0011_continuous_market_monitor.sql","0012_paper_execution_activation_audit.sql"
];
const fail=(error,status=409,extra={})=>Response.json({ok:false,execution:false,executionEnabled:false,error,...extra},{status,headers:H});
function sameSecret(a,b){
 if(typeof a!=="string"||typeof b!=="string"||!a||!b)return false;
 let diff=a.length^b.length;
 for(let i=0;i<Math.max(a.length,b.length);i++)diff|=(a.charCodeAt(i)||0)^(b.charCodeAt(i)||0);
 return diff===0;
}
async function paperGet(path,env){
 const response=await fetch(PAPER_API_HOST+path,{
  headers:{"APCA-API-KEY-ID":env.ALPACA_API_KEY_ID,"APCA-API-SECRET-KEY":env.ALPACA_API_SECRET_KEY,"Accept":"application/json"},
  signal:AbortSignal.timeout(10000)
 });
 if(!response.ok)throw new Error("PAPER_HTTP_"+response.status);
 return response.json();
}
async function invokeReadOnly(handler,path,request,env,requestId){
 const internalRequest=new Request(new URL(path,request.url),{
  method:"POST",
  headers:{
   "Authorization":request.headers.get("Authorization")||"",
   "X-Request-ID":requestId,
   "Accept":"application/json"
  }
 });
 const response=await handler({request:internalRequest,env});
 let payload;
 try{payload=await response.json();}catch{payload={};}
 return {ok:response.ok,status:response.status,payload};
}
function count(row){return Number(row?.n);}
function emptyMismatches(value){
 return value&&Array.isArray(value.positions)&&value.positions.length===0&&
  Array.isArray(value.fillDerivedPositions)&&value.fillDerivedPositions.length===0&&
  Array.isArray(value.orders)&&value.orders.length===0;
}

export async function activatePaperExecution({request,env,dependencies={}}){
 const config=validatePaperActivationConfiguration(env);
 if(!config.ok)return fail("PAPER activation credentials and account identity are not fully configured.",503,{configurationIssues:config.issues});
 if(!sameSecret(request.headers.get("Authorization")||"","Bearer "+env.NORTHSTAR_OPERATOR_TOKEN))return fail("Unauthorized.",401);
 if(!sameSecret(request.headers.get("X-NORTHSTAR-PAPER-EXECUTION-APPROVAL")||"",env.NORTHSTAR_PAPER_EXECUTION_APPROVAL_TOKEN))return fail("A separate PAPER execution approval credential is required.",401);
 let body;
 try{body=await request.json();}catch{return fail("Send valid JSON.",400);}
 if(body?.action!=="ENABLE_PAPER_EXECUTION"||body?.confirmation!=="ENABLE_PAPER_EXECUTION")return fail("Exact ENABLE_PAPER_EXECUTION action and confirmation are required.",400);
 const randomUUID=dependencies.randomUUID||(()=>crypto.randomUUID());
 const requestId=request.headers.get("X-Request-ID")||randomUUID();
 if(!/^[A-Za-z0-9._:-]{8,160}$/.test(requestId))return fail("X-Request-ID must contain 8–160 safe characters.",400);
 const db=env?.NORTHSTAR_DB;
 if(!db||typeof db.prepare!=="function"||typeof db.batch!=="function")return fail("PAPER ledger unavailable; activation blocked.",503);
 if(!env.ALPACA_API_KEY_ID||!env.ALPACA_API_SECRET_KEY)return fail("Alpaca PAPER credentials unavailable; activation blocked.",503);

 // Verify schema before any sync writes. The migration creates an independent
 // audit trail and database triggers that reject direct or incomplete enablement.
 let migrationRows;
 try{
  const sql="SELECT name FROM d1_migrations WHERE name IN ("+REQUIRED_MIGRATIONS.map(()=>"?").join(",")+")";
  migrationRows=await db.prepare(sql).bind(...REQUIRED_MIGRATIONS).all();
 }catch{return fail("PAPER activation migrations are not fully applied; no sync or control change was attempted.",503,{requiredMigrations:REQUIRED_MIGRATIONS});}
 const applied=new Set((migrationRows?.results||[]).map(row=>String(row.name)));
 const missingMigrations=REQUIRED_MIGRATIONS.filter(name=>!applied.has(name));
 if(missingMigrations.length)return fail("PAPER activation schema is incomplete; no sync or control change was attempted.",503,{missingMigrations});

 const nowFn=dependencies.now||Date.now;
 const now=Number(nowFn());
 const runSync=dependencies.runSync||runAccountSync;
 const runFillSync=dependencies.runFillSync||runFillSync;
 const runReconcile=dependencies.runReconcile||runReadOnlyReconciliation;
 let syncResult,fillResult,reconciliation;
 try{
  syncResult=await invokeReadOnly(runSync,"/api/paper/sync",request,env,requestId);
  if(!syncResult.ok||syncResult.payload?.ok!==true||syncResult.payload?.synced!==true||syncResult.payload?.execution!==false)
   return fail("Fresh Alpaca PAPER account sync did not pass; activation blocked.",503,{syncStatus:syncResult.payload?.error||"UNVERIFIED"});
  fillResult=await invokeReadOnly(runFillSync,"/api/paper/fills-sync",request,env,requestId);
  if(!fillResult.ok||fillResult.payload?.ok!==true||fillResult.payload?.safeToContinue!==true||
    fillResult.payload?.requiresManualRecovery!==false||fillResult.payload?.execution!==false||
    fillResult.payload?.status!=="FILL_IMPORT_AND_ORDER_SYNC_PASSED_READ_ONLY")
   return fail("PAPER fill import or order-lifecycle verification did not pass; activation blocked.",409,{fillSyncStatus:fillResult.payload?.status||"UNVERIFIED",manualRecoveryRequired:fillResult.payload?.requiresManualRecovery===true});
  reconciliation=await invokeReadOnly(runReconcile,"/api/paper/reconcile",request,env,requestId);
  if(!reconciliation.ok||reconciliation.payload?.ok!==true||reconciliation.payload?.reconciled!==true||
    reconciliation.payload?.execution!==false||reconciliation.payload?.status!=="RECONCILIATION_PASSED_READ_ONLY"||
    !emptyMismatches(reconciliation.payload?.mismatches))
   return fail("Fresh read-only broker-to-ledger reconciliation did not pass; activation blocked.",409,{reconciliationStatus:reconciliation.payload?.status||"UNVERIFIED"});
 }catch{return fail("Read-only PAPER sync, fill import or reconciliation could not be completed; activation blocked.",503);}

 const broker=dependencies.broker||((path)=>paperGet(path,env));
 let account,quoteResponse,clock;
 try{
  [account,quoteResponse,clock]=await Promise.all([
   broker("/v2/account"),
   broker("/v2/stocks/SPY/quotes/latest?feed=iex"),
   broker("/v2/clock")
  ]);
 }catch(error){
  const code=String(error?.message||"");
  return fail(code.startsWith("PAPER_HTTP_")?"Alpaca PAPER account/quote request failed ("+code.slice(11)+"); activation blocked.":"Alpaca PAPER account/quote request timed out or returned invalid data; activation blocked.",503);
 }
 const q=quoteResponse?.quote;
 const quote={bid:q?.bp,ask:q?.ap,timestamp:q?.t};
 let control,strategyApproval,snapshots,orderCount,positionCount,claim,pendingIntents;
 try{
  [control,strategyApproval,snapshots,orderCount,positionCount,claim,pendingIntents]=await Promise.all([
   db.prepare("SELECT enabled,mode,kill_switch,max_portfolio_usd,default_risk_fraction,max_risk_fraction,max_position_fraction FROM execution_control WHERE id=1").first(),
   db.prepare("SELECT approved,strategy_version,report_version,report_sha256,report_uri,approved_at,reviewer FROM northstar_strategy_approval WHERE id=1").first(),
   db.prepare("SELECT captured_at,equity_usd FROM paper_equity_snapshots ORDER BY captured_at DESC LIMIT 1000").all(),
   db.prepare("SELECT COUNT(*) AS n FROM paper_orders").first(),
   db.prepare("SELECT COUNT(*) AS n FROM paper_positions").first(),
   db.prepare("SELECT state FROM paper_execution_claims WHERE id=1").first(),
   db.prepare("SELECT COUNT(*) AS n FROM paper_trade_intents WHERE status IN ('PENDING_REVIEW','APPROVED_REVIEW_ONLY')").first()
  ]);
 }catch{return fail("Could not verify the full PAPER ledger, strategy approval or equity history; activation blocked.",503);}
 const ledgerCounts={orders:count(orderCount),positions:count(positionCount),pendingIntents:count(pendingIntents)};
 const gate=evaluatePaperActivationGate({
  control,strategyApproval,snapshots:snapshots?.results||[],account,configuredAccountId:config.accountId,
  reconciliation:reconciliation.payload,ledgerCounts,claim,quote,clock,now
 });
 if(!gate.ok)return fail("PAPER activation safety gate blocked the request: "+gate.reason,409,{gateStatus:gate.status,gateReason:gate.reason,gateDetails:gate.details||{}});
 const details={
  requestId,approver:config.approver,executionEnabled:true,killSwitchEngaged:false,
  activationProcedure:"GUARDED_PAPER_ONLY",...gate.evidence,
  risk:gate.risk,
  intentReviewConfigured:true,
  fillSyncStatus:fillResult.payload.status,
  accountSyncStatus:"READ_ONLY_ACCOUNT_SYNC_PASSED",
  noBrokerOrderCreated:true
 };
 const detailsJson=JSON.stringify(details);
 if(new TextEncoder().encode(detailsJson).byteLength>12000)return fail("PAPER activation evidence exceeds the durable audit size limit.",503);
 const requestedAt=new Date(now).toISOString();
 const latestSnapshotAt=gate.evidence.latestSnapshotAt;
 const weeklyBaselineAt=gate.evidence.weeklyBaselineAt;
 let writes;
 try{
  writes=await db.batch([
   db.prepare("INSERT INTO paper_execution_activation_requests(request_id,approver,requested_at,account_id,strategy_report_sha256,reconciliation_checked_at,latest_snapshot_at,weekly_baseline_at,quote_at,details_json) VALUES(?,?,?,?,?,?,?,?,?,?)")
    .bind(requestId,config.approver,requestedAt,config.accountId,gate.evidence.strategyReportSha256,reconciliation.payload.checkedAt,latestSnapshotAt,weeklyBaselineAt,quote.timestamp,detailsJson),
   db.prepare("UPDATE execution_control SET enabled=1,kill_switch=0,last_activation_request_id=?,updated_at=? WHERE id=1 AND mode='paper' AND enabled=0 AND kill_switch=1 AND max_portfolio_usd=1000 AND default_risk_fraction=0.005 AND max_risk_fraction=0.01 AND max_position_fraction=0.25 AND EXISTS (SELECT 1 FROM northstar_strategy_approval WHERE id=1 AND approved=1 AND strategy_version=? AND report_version=? AND report_sha256=? AND report_uri=? AND approved_at=? AND reviewer=?) AND NOT EXISTS (SELECT 1 FROM paper_execution_claims WHERE id=1) AND NOT EXISTS (SELECT 1 FROM paper_orders) AND NOT EXISTS (SELECT 1 FROM paper_positions) AND NOT EXISTS (SELECT 1 FROM paper_trade_intents WHERE status IN ('PENDING_REVIEW','APPROVED_REVIEW_ONLY')) AND EXISTS (SELECT 1 FROM paper_equity_snapshots WHERE captured_at=?) AND EXISTS (SELECT 1 FROM paper_equity_snapshots WHERE captured_at=?)")
    .bind(requestId,requestedAt,strategyApproval.strategy_version,strategyApproval.report_version,strategyApproval.report_sha256,strategyApproval.report_uri,strategyApproval.approved_at,strategyApproval.reviewer,latestSnapshotAt,weeklyBaselineAt)
  ]);
 }catch{return fail("Atomic PAPER activation transaction failed; execution was not confirmed. Verify the control row and audit tables.",503);}
 if(writes.length!==2||Number(writes[0]?.meta?.changes)!==1||Number(writes[1]?.meta?.changes)!==1)
  return fail("PAPER activation compare-and-set did not acquire the disabled control row; no enablement is claimed.",409,{controlStateUnchanged: true});
 let controlAfter,event,audit;
 try{
  [controlAfter,event,audit]=await Promise.all([
   db.prepare("SELECT enabled,mode,kill_switch,last_activation_request_id,updated_at FROM execution_control WHERE id=1").first(),
   db.prepare("SELECT request_id,event_type,actor,outcome,occurred_at FROM paper_execution_activation_events WHERE request_id=?").bind(requestId).first(),
   db.prepare("SELECT actor,action,outcome,request_id FROM execution_audit_log WHERE request_id=? AND action='ENABLE_PAPER_EXECUTION'").bind(requestId).first()
  ]);
 }catch{
  try{
   const failAt=new Date(Number(nowFn())).toISOString();
   await db.batch([
    db.prepare("UPDATE execution_control SET enabled=0,kill_switch=1,updated_at=? WHERE id=1 AND mode='paper'").bind(failAt),
    db.prepare("INSERT INTO execution_audit_log(actor,action,outcome,request_id,details_json) VALUES(?,?,?,?,?)").bind("system","PAPER_ACTIVATION_POSTWRITE_VERIFICATION_FAILED","FAIL_CLOSED",requestId,JSON.stringify({requestId,executionEnabled:false,killSwitchEngaged:true}))
   ]);
  }catch{}
  return fail("PAPER activation write could not be independently verified. A kill-switch re-engagement was attempted; inspect control and audit state before any further action.",503,{controlStateUnknown:true});
 }
 const verified=Number(controlAfter?.enabled)===1&&controlAfter?.mode==="paper"&&Number(controlAfter?.kill_switch)===0&&
  controlAfter?.last_activation_request_id===requestId&&event?.request_id===requestId&&event?.event_type==="PAPER_EXECUTION_ENABLED"&&
  event?.actor===config.approver&&event?.outcome==="SUCCESS"&&audit?.request_id===requestId&&
  audit?.actor===config.approver&&audit?.action==="ENABLE_PAPER_EXECUTION"&&audit?.outcome==="SUCCESS";
 if(!verified){
  try{
   const failAt=new Date(Number(nowFn())).toISOString();
   await db.batch([
    db.prepare("UPDATE execution_control SET enabled=0,kill_switch=1,updated_at=? WHERE id=1 AND mode='paper'").bind(failAt),
    db.prepare("INSERT INTO execution_audit_log(actor,action,outcome,request_id,details_json) VALUES(?,?,?,?,?)").bind("system","PAPER_ACTIVATION_POSTWRITE_VERIFICATION_FAILED","FAIL_CLOSED",requestId,JSON.stringify({requestId,executionEnabled:false,killSwitchEngaged:true}))
   ]);
  }catch{}
  return fail("PAPER activation state or immutable audit event did not verify. A kill-switch re-engagement was attempted; manually verify before any further action.",503,{controlStateUnknown:true});
 }
 return Response.json({
  ok:true,execution:false,executionEnabled:true,killSwitchEngaged:false,mode:"paper",
  accountId:config.accountId,approver:config.approver,activationRequestId:requestId,
  brokerOrderCreated:false,brokerOrdersSubmitted:false,
  strategyValidation:gate.strategyValidation,
  reconciliation:{status:reconciliation.payload.status,checkedAt:reconciliation.payload.checkedAt,counts:reconciliation.payload.counts},
  risk:gate.risk,
  limits:{virtualCapitalUsd:1000,maxPositionUsd:250,maxRiskUsd:10,dailyLossCapUsd:20,maxDrawdownUsd:80},
  audit:{eventType:event.event_type,outcome:event.outcome,occurredAt:event.occurred_at},
  warnings:[
   "PAPER execution controls are enabled; no broker order was created or submitted by this activation request.",
   "Every future intent still requires independent review, fresh per-symbol preflight, idempotent submission and a verified protective stop.",
   "The separate operator kill-switch endpoint remains available; reconcile any uncertain broker outcome before further action."
  ]
 },{headers:H});
}

export async function onRequestPost(context){return activatePaperExecution(context);}
