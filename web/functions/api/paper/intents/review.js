// Separate human-review gate for a previously created PAPER proposal.
// This route can approve/reject an intent but never submits or mutates broker orders.
import {onRequestPost as runPreflight} from "../preflight.js";

const H={"Cache-Control":"no-store","X-Content-Type-Options":"nosniff","Referrer-Policy":"no-referrer"};
const fail=(error,status=400,extra={})=>Response.json({ok:false,execution:false,brokerOrderCreated:false,error,...extra},{status,headers:H});
function equal(a,b){
 if(typeof a!=="string"||typeof b!=="string"||!a||!b)return false;
 let d=a.length^b.length;
 for(let i=0;i<Math.max(a.length,b.length);i++)d|=(a.charCodeAt(i)||0)^(b.charCodeAt(i)||0);
 return d===0;
}
const close=(a,b,t=.01)=>Number.isFinite(Number(a))&&Number.isFinite(Number(b))&&Math.abs(Number(a)-Number(b))<=t;
function reviewConfiguration(env){
 const operator=env?.NORTHSTAR_OPERATOR_TOKEN;
 const reviewerToken=env?.NORTHSTAR_INTENT_REVIEW_TOKEN;
 const reviewer=String(env?.NORTHSTAR_INTENT_REVIEWER||"").trim();
 const paperApproval=env?.NORTHSTAR_PAPER_EXECUTION_APPROVAL_TOKEN;
 return !!operator&&!!reviewerToken&&reviewerToken!==operator&&reviewerToken!==paperApproval&&reviewer.length>=3&&reviewer.length<=120;
}
function authorized(request,env){
 return reviewConfiguration(env)&&
  equal(request.headers.get("Authorization")||"","Bearer "+env.NORTHSTAR_OPERATOR_TOKEN)&&
  equal(request.headers.get("X-NORTHSTAR-INTENT-REVIEW")||"",env.NORTHSTAR_INTENT_REVIEW_TOKEN);
}
function validIntentId(value){return /^[0-9a-f-]{36}$/i.test(String(value||""));}
function safeEvidence(raw){
 try{const parsed=JSON.parse(raw||"{}");return parsed&&typeof parsed==="object"&&!Array.isArray(parsed)?parsed:{};}catch{return {};}
}

export async function onRequestPost({request,env}){
 if(!reviewConfiguration(env))return fail("Separate operator, intent-review credentials and a configured reviewer identity are required.",503);
 if(!authorized(request,env))return fail("Operator and independent intent-review authentication are required.",401);
 const db=env?.NORTHSTAR_DB;
 if(!db||typeof db.prepare!=="function")return fail("Paper intent ledger unavailable; review is blocked.",503);
 let body;try{body=await request.json();}catch{return fail("Send valid JSON.");}
 const intentId=String(body?.intentId||"");
 const decision=String(body?.decision||"").toUpperCase();
 const confirmation=body?.confirmation;
 const note=String(body?.note||"").trim();
 if(!validIntentId(intentId)||confirmation!=="REVIEW_THIS_PAPER_INTENT"||!["APPROVE","REJECT"].includes(decision))return fail("Provide an intentId, APPROVE/REJECT decision and exact review confirmation.");
 if(note.length<10||note.length>1000)return fail("Review note must contain 10–1000 characters.");
 const requestId=request.headers.get("X-Request-ID")||intentId;
 if(!/^[A-Za-z0-9._:-]{8,160}$/.test(requestId))return fail("X-Request-ID must contain 8–160 safe characters.");
 let intent;
 try{
  intent=await db.prepare("SELECT id,symbol,side,qty,reference_price,stop_price,estimated_notional_usd,planned_risk_usd,status,evidence_json FROM paper_trade_intents WHERE id=?").bind(intentId).first();
 }catch{return fail("Could not read the proposal ledger; fail-closed.",503);}
 if(!intent)return fail("Paper intent was not found.",404);
 if(intent.status!=="PENDING_REVIEW")return fail("Only a pending review intent can receive a decision.",409,{intentId,status:intent.status});
 if(intent.side!=="buy"||!Number.isInteger(Number(intent.qty))||Number(intent.qty)<=0)return fail("Intent is not a valid long-only review proposal.",409);

 let preview=null;
 if(decision==="APPROVE"){
  let preflightResponse;
  try{
   const preflightRequest=new Request(new URL("/api/paper/preflight",request.url),{
    method:"POST",
    headers:{"Content-Type":"application/json","Authorization":request.headers.get("Authorization")||""},
    body:JSON.stringify({symbol:intent.symbol,stopPrice:intent.stop_price})
   });
   preflightResponse=await runPreflight({request:preflightRequest,env});
   preview=await preflightResponse.json();
  }catch{return fail("Fresh server-side preflight could not be completed; intent remains pending.",503);}
  if(!preflightResponse.ok||preview?.ok!==true||preview?.execution!==false||preview?.status!=="PREFLIGHT_PASSED_PREVIEW_ONLY_NOT_AN_ORDER"){
   return fail("Fresh server-side preflight blocked approval; intent remains pending.",preflightResponse.status||409,{preflight:preview});
  }
  const exactSizing=Number(preview.shares)===Number(intent.qty)&&
   close(preview.estimatedEntryPrice,intent.reference_price)&&
   close(preview.stopPrice,intent.stop_price)&&
   close(preview.estimatedNotionalUsd,intent.estimated_notional_usd)&&
   close(preview.plannedStopRiskUsd,intent.planned_risk_usd);
  if(!exactSizing)return fail("Live quote/preflight sizing no longer matches the proposal. Reject this stale intent and create a new proposal for review.",409,{intentId,preflight:preview,stored:{qty:intent.qty,referencePrice:intent.reference_price,stopPrice:intent.stop_price,notionalUsd:intent.estimated_notional_usd,riskUsd:intent.planned_risk_usd}});
 }
 const reviewer=String(env.NORTHSTAR_INTENT_REVIEWER).trim();
 const decidedAt=new Date().toISOString();
 const status=decision==="APPROVE"?"APPROVED_REVIEW_ONLY":"REJECTED";
 const evidence=safeEvidence(intent.evidence_json);
 evidence.review={
  reviewer,decision,note,reviewedAt:decidedAt,requestId,
  preflight:preview?{
   checkedAt:preview.checkedAt||null,
   shares:preview.shares,
   estimatedEntryPrice:preview.estimatedEntryPrice,
   stopPrice:preview.stopPrice,
   estimatedNotionalUsd:preview.estimatedNotionalUsd,
   plannedStopRiskUsd:preview.plannedStopRiskUsd
  }:null
 };
 const evidenceJson=JSON.stringify(evidence);
 if(new TextEncoder().encode(evidenceJson).byteLength>16384)return fail("Review evidence exceeds the 16 KB intent evidence limit.",503);
 let write;
 try{
  write=await db.prepare("UPDATE paper_trade_intents SET status=?,reviewer=?,decided_at=?,decision_note=?,evidence_json=?,updated_at=? WHERE id=? AND status='PENDING_REVIEW' AND symbol=? AND side=? AND qty=? AND reference_price=? AND stop_price=? AND estimated_notional_usd=? AND planned_risk_usd=? AND evidence_json=?")
   .bind(status,reviewer,decidedAt,note,evidenceJson,decidedAt,intentId,intent.symbol,intent.side,intent.qty,intent.reference_price,intent.stop_price,intent.estimated_notional_usd,intent.planned_risk_usd,intent.evidence_json).run();
 }catch{return fail("Intent decision could not be written atomically with its database audit trigger; no approval is claimed.",503);}
 if(Number(write?.meta?.changes)!==1)return fail("Intent was concurrently reviewed or changed; refresh the journal before another decision.",409);
 return Response.json({
  ok:true,execution:false,brokerOrderCreated:false,intentId,status,reviewer,decidedAt,
  preflight:preview,
  message:decision==="APPROVE"
   ?"Intent approved for review-only submission consideration. A separate PAPER execution approval, enabled controls, current risk gates and broker reconciliation are still required. No broker order was created."
   :"Intent rejected by the configured reviewer. No broker order was created."
 },{headers:H});
}
