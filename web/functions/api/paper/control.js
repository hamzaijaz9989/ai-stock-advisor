// Northstar operator controls. The only writable action here is ENGAGING the kill switch.
// Releasing the switch or enabling execution is intentionally not implemented.
// A successful kill-switch response also waits for any already-claimed submission
// to leave SUBMITTING. Existing broker orders are never cancelled by this route.
const H = {"Cache-Control":"no-store","X-Content-Type-Options":"nosniff","Referrer-Policy":"no-referrer"};
const TERMINAL_SUBMISSION_STATES = new Set(["SUBMITTED","UNKNOWN","REJECTED"]);
function sameSecret(a,b) {
  if (typeof a !== "string" || typeof b !== "string" || !a || !b) return false;
  let diff = a.length ^ b.length;
  const n = Math.max(a.length,b.length);
  for (let i=0;i<n;i++) diff |= (a.charCodeAt(i)||0) ^ (b.charCodeAt(i)||0);
  return diff === 0;
}
function authorized(request,env) {
  const expected=env?.NORTHSTAR_OPERATOR_TOKEN;
  const supplied=request.headers.get("Authorization") || "";
  return !!expected && sameSecret(supplied, "Bearer "+expected);
}
const sleep = ms => new Promise(resolve => setTimeout(resolve,ms));

/**
 * Wait until the durable singleton paper submission claim is no longer in
 * SUBMITTING. Claim acquisition happens before submit.js's final control read.
 * Therefore, if that final read has already passed, this route sees the claim
 * and does not acknowledge a quiesced kill switch until the broker operation
 * has been durably classified. A timeout is explicitly NOT a quiescence claim.
 */
export async function waitForSubmissionQuiescence(db,{timeoutMs=8000,pollMs=100,now=()=>Date.now(),pause=sleep}={}) {
  const deadline=now()+Math.max(0,timeoutMs);
  while(true) {
    let row;
    try {
      row=await db.prepare("SELECT state FROM paper_execution_claims WHERE id=1").first();
    } catch {
      return {ok:false,quiesced:false,state:"UNVERIFIED"};
    }
    if(!row) return {ok:true,quiesced:true,state:"NO_IN_FLIGHT_SUBMISSION"};
    const state=String(row.state||"").toUpperCase();
    if(TERMINAL_SUBMISSION_STATES.has(state)) return {ok:true,quiesced:true,state};
    if(state!=="SUBMITTING") return {ok:false,quiesced:false,state:state||"INVALID"};
    const remaining=deadline-now();
    if(remaining<=0) return {ok:true,quiesced:false,state:"SUBMITTING"};
    await pause(Math.min(pollMs,remaining));
  }
}

export async function onRequestGet({env}) {
  const db=env?.NORTHSTAR_DB;
  if(!db) return Response.json({ok:false,message:"Ledger unavailable; fail-closed."},{status:503,headers:H});
  try {
    const row=await db.prepare("SELECT enabled,mode,kill_switch,max_portfolio_usd,default_risk_fraction,max_risk_fraction,max_position_fraction,updated_at FROM execution_control WHERE id=1").first();
    if(!row) return Response.json({ok:false,message:"Control row missing; fail-closed."},{status:503,headers:H});
    return Response.json({ok:true,mode:"paper",executionEnabled:Number(row.enabled)===1,killSwitchEngaged:Number(row.kill_switch)===1,limits:{virtualCapitalUsd:row.max_portfolio_usd,defaultRiskFraction:row.default_risk_fraction,maxRiskFraction:row.max_risk_fraction,maxPositionFraction:row.max_position_fraction},updatedAt:row.updated_at,policy:"Execution remains disabled. This endpoint cannot enable execution."},{headers:H});
  } catch { return Response.json({ok:false,message:"Could not read controls; fail-closed."},{status:503,headers:H}); }
}
export async function onRequestPost({request,env}) {
  if(!authorized(request,env)) return Response.json({ok:false,error:"Unauthorized."},{status:401,headers:H});
  const db=env?.NORTHSTAR_DB;
  if(!db) return Response.json({ok:false,error:"Ledger unavailable."},{status:503,headers:H});
  try {
    const body=await request.json();
    if(body?.action!=="ENGAGE_KILL_SWITCH") return Response.json({ok:false,error:"Only ENGAGE_KILL_SWITCH is permitted. Disabling the switch and enabling execution are not supported."},{status:400,headers:H});
    const nowAt=new Date().toISOString();
    await db.batch([
      db.prepare("UPDATE execution_control SET enabled=0,kill_switch=1,updated_at=? WHERE id=1").bind(nowAt),
      db.prepare("INSERT INTO execution_audit_log(actor,action,outcome,request_id,details_json) VALUES(?,?,?,?,?)").bind("operator","ENGAGE_KILL_SWITCH","SUCCESS",request.headers.get("X-Request-ID")||null,JSON.stringify({mode:"paper",executionEnabled:false,killSwitchEngaged:true,at:nowAt}))
    ]);
    const drain=await waitForSubmissionQuiescence(db);
    if(!drain.ok) {
      return Response.json({ok:false,executionEnabled:false,killSwitchEngaged:true,submissionQuiesced:false,submissionState:drain.state,error:"Kill switch was written, but the in-flight submission state could not be verified. Treat submission status as unknown and reconcile before further action."},{status:503,headers:H});
    }
    if(!drain.quiesced) {
      return Response.json({ok:false,executionEnabled:false,killSwitchEngaged:true,submissionQuiesced:false,submissionState:drain.state,status:"KILL_SWITCH_ENGAGED_SUBMISSION_DRAIN_PENDING",message:"The kill switch is engaged, but an already-claimed broker submission has not reached a terminal ledger state. Do not treat the system as quiesced yet."},{status:202,headers:H});
    }
    return Response.json({ok:true,executionEnabled:false,killSwitchEngaged:true,submissionQuiesced:true,submissionState:drain.state,updatedAt:nowAt,warnings:["The kill switch prevents new paper submissions.","Any already-claimed submission has reached a terminal ledger state.","Existing broker orders are not cancelled; reconcile and manage them separately."]},{headers:H});
  } catch { return Response.json({ok:false,error:"Control update failed; assume kill switch remains engaged and verify ledger."},{status:503,headers:H}); }
}
