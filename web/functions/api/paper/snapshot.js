import { verifyNorthstarSnapshotOidcToken } from "../../../lib/github-actions-oidc.js";
import { onRequestPost as reconcilePaperAccount } from "./reconcile.js";
import { onRequestPost as syncPaperAccount } from "./sync.js";

const HEADERS={"Cache-Control":"no-store","X-Content-Type-Options":"nosniff","Referrer-Policy":"no-referrer"};
const reply=(payload,status=200)=>Response.json(payload,{status,headers:HEADERS});
const safeJson=async response=>{try{return await response.json();}catch{return null;}};
function internalRequest(path,operatorToken,requestId) {
  const headers={"Authorization":"Bearer "+operatorToken,"Accept":"application/json"};
  if(requestId) headers["X-Request-ID"]=requestId;
  return new Request("https://northstar.internal"+path,{method:"POST",headers});
}
function parseDetails(row) {
  try {
    const value=JSON.parse(row?.details_json||"{}");
    if(typeof value?.capturedAt!=="string"||!Number.isFinite(Date.parse(value.capturedAt))||
       !Number.isSafeInteger(Number(value.positionCount))||Number(value.positionCount)<0) return null;
    return value;
  } catch { return null; }
}
function controlIsFailClosed(control) {
  return !!control&&control.mode==="paper"&&Number(control.enabled)===0&&Number(control.kill_switch)===1;
}
export async function onRequestPost({request,env}) {
  const authorization=request.headers.get("Authorization")||"";
  if(!authorization.startsWith("Bearer ")) return reply({ok:false,error:"Unauthorized.",execution:false},401);
  const oidcToken=authorization.slice(7).trim();
  if(!oidcToken||oidcToken.length>16384) return reply({ok:false,error:"Unauthorized.",execution:false},401);
  const claims=await verifyNorthstarSnapshotOidcToken(oidcToken);
  if(!claims) return reply({ok:false,error:"Unauthorized GitHub Actions identity.",execution:false},401);
  const raw=await request.text();
  if(raw.trim()) return reply({ok:false,error:"This endpoint does not accept a request body."},400);

  const db=env?.NORTHSTAR_DB,operatorToken=env?.NORTHSTAR_OPERATOR_TOKEN;
  if(!db||!operatorToken||!env?.ALPACA_API_KEY_ID||!env?.ALPACA_API_SECRET_KEY) {
    return reply({ok:false,error:"Production snapshot prerequisites are unavailable.",execution:false},503);
  }
  let control;
  try { control=await db.prepare("SELECT enabled,mode,kill_switch FROM execution_control WHERE id=1").first(); }
  catch { return reply({ok:false,error:"Could not verify execution controls; fail-closed.",execution:false},503); }
  if(!controlIsFailClosed(control)) {
    return reply({ok:false,error:"Execution controls are not in the required disabled/kill-switched state.",execution:false},503);
  }

  const requestId="northstar-equity-"+claims.runId+"-"+claims.runAttempt;
  if(!/^[A-Za-z0-9._:-]{8,100}$/.test(requestId)) return reply({ok:false,error:"Invalid workflow request identity.",execution:false},401);
  let completed;
  try {
    completed=await db.prepare(
      "SELECT details_json,occurred_at FROM execution_audit_log WHERE action=? AND outcome=? AND request_id=? ORDER BY id DESC LIMIT 1"
    ).bind("READ_ONLY_OIDC_SNAPSHOT","SUCCESS",requestId).first();
  } catch { return reply({ok:false,error:"Snapshot idempotency record unavailable; fail-closed.",execution:false},503); }
  if(completed) {
    const details=parseDetails(completed);
    if(!details||details.schemaVersion!==1||details.requestId!==requestId) {
      return reply({ok:false,error:"Stored snapshot completion record failed integrity validation.",execution:false},503);
    }
    return reply({
      ok:true,synced:true,reconciled:true,replayed:true,execution:false,automatedOrderSubmission:false,mode:"paper",
      requestId,capturedAt:details.capturedAt,positionCount:details.positionCount,
      preReconciliation:details.preReconciliation,postReconciliation:details.postReconciliation,
      checkedAt:completed.occurred_at||null
    });
  }

  const preResponse=await reconcilePaperAccount({request:internalRequest("/api/paper/reconcile",operatorToken),env});
  const pre=await safeJson(preResponse);
  if(!preResponse.ok||pre?.ok!==true||pre?.reconciled!==true||pre?.execution!==false||pre?.status!=="RECONCILIATION_PASSED_READ_ONLY") {
    return reply({
      ok:false,synced:false,reconciled:false,execution:false,automatedOrderSubmission:false,
      status:pre?.status||"PRE_SYNC_RECONCILIATION_FAILED",counts:pre?.counts||null
    },409);
  }

  let syncData;
  let priorSync;
  try {
    priorSync=await db.prepare(
      "SELECT details_json,occurred_at FROM execution_audit_log WHERE action=? AND outcome=? AND request_id=? ORDER BY id DESC LIMIT 1"
    ).bind("READ_ONLY_ACCOUNT_SYNC","SUCCESS",requestId).first();
  } catch { return reply({ok:false,synced:false,reconciled:false,execution:false,error:"Prior sync record unavailable; fail-closed."},503); }
  if(priorSync) {
    const details=parseDetails(priorSync);
    if(!details) return reply({ok:false,synced:false,reconciled:false,execution:false,error:"Prior sync record failed integrity validation."},503);
    syncData={ok:true,synced:true,execution:false,mode:"paper",capturedAt:details.capturedAt,snapshot:{positions:details.positionCount},replayed:true};
  } else {
    const syncResponse=await syncPaperAccount({request:internalRequest("/api/paper/sync",operatorToken,requestId),env});
    syncData=await safeJson(syncResponse);
    if(!syncResponse.ok||syncData?.ok!==true||syncData?.synced!==true||syncData?.execution!==false||syncData?.mode!=="paper") {
      return reply({ok:false,synced:false,reconciled:false,execution:false,automatedOrderSubmission:false,error:"Read-only Alpaca snapshot sync failed safely."},503);
    }
  }

  let snapshotRow;
  try {
    snapshotRow=await db.prepare("SELECT captured_at FROM paper_equity_snapshots WHERE captured_at=?").bind(syncData.capturedAt).first();
  } catch { return reply({ok:false,synced:false,reconciled:false,execution:false,error:"Snapshot persistence could not be verified.",capturedAt:syncData.capturedAt},503); }
  if(!snapshotRow) return reply({ok:false,synced:false,reconciled:false,execution:false,error:"Snapshot persistence could not be verified.",capturedAt:syncData.capturedAt},503);

  const postResponse=await reconcilePaperAccount({request:internalRequest("/api/paper/reconcile",operatorToken),env});
  const post=await safeJson(postResponse);
  if(!postResponse.ok||post?.ok!==true||post?.reconciled!==true||post?.execution!==false||post?.status!=="RECONCILIATION_PASSED_READ_ONLY") {
    return reply({
      ok:false,synced:true,reconciled:false,execution:false,automatedOrderSubmission:false,
      status:post?.status||"POST_SYNC_RECONCILIATION_FAILED",capturedAt:syncData.capturedAt,counts:post?.counts||null
    },409);
  }

  const details={
    schemaVersion:1,requestId,capturedAt:syncData.capturedAt,
    positionCount:Number(syncData.snapshot?.positions??0),
    preReconciliation:pre.counts||null,postReconciliation:post.counts||null,
    workflow:{runId:claims.runId,runAttempt:claims.runAttempt,commitSha:claims.commitSha,workflowSha:claims.workflowSha,eventName:claims.eventName},
    execution:false,automatedOrderSubmission:false
  };
  let write;
  try {
    write=await db.prepare(
      "INSERT INTO execution_audit_log(actor,action,outcome,request_id,details_json) VALUES(?,?,?,?,?)"
    ).bind("github-actions","READ_ONLY_OIDC_SNAPSHOT","SUCCESS",requestId,JSON.stringify(details)).run();
  } catch { return reply({ok:false,synced:true,reconciled:true,execution:false,error:"Snapshot completion audit write failed; retry is idempotent."},503); }
  let stored;
  try {
    stored=await db.prepare(
      "SELECT details_json,occurred_at FROM execution_audit_log WHERE action=? AND outcome=? AND request_id=? ORDER BY id DESC LIMIT 1"
    ).bind("READ_ONLY_OIDC_SNAPSHOT","SUCCESS",requestId).first();
  } catch { return reply({ok:false,synced:true,reconciled:true,execution:false,error:"Snapshot completion audit could not be confirmed."},503); }
  const persisted=parseDetails(stored);
  if(!stored||!persisted||persisted.requestId!==requestId||persisted.capturedAt!==syncData.capturedAt) {
    return reply({ok:false,synced:true,reconciled:true,execution:false,error:"Snapshot completion audit could not be confirmed."},503);
  }
  return reply({
    ok:true,synced:true,reconciled:true,replayed:Number(write?.meta?.changes)===0,execution:false,
    automatedOrderSubmission:false,mode:"paper",requestId,capturedAt:persisted.capturedAt,
    positionCount:persisted.positionCount,preReconciliation:persisted.preReconciliation,
    postReconciliation:persisted.postReconciliation,checkedAt:stored.occurred_at||null
  });
}
