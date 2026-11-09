// Authenticated proposal journal. Every stored quantity, entry, stop and risk figure
// is derived from the server-side live-quote preflight; client-supplied sizing is ignored.
import {onRequestPost as runPreflight} from "./preflight.js";
const H={"Cache-Control":"no-store","X-Content-Type-Options":"nosniff","Referrer-Policy":"no-referrer"};
const fail=(error,status=400,extra={})=>Response.json({ok:false,execution:false,error,...extra},{status,headers:H});
function safeEqual(a,b){if(typeof a!=="string"||typeof b!=="string"||!a||!b)return false;let d=a.length^b.length;for(let i=0;i<Math.max(a.length,b.length);i++)d|=(a.charCodeAt(i)||0)^(b.charCodeAt(i)||0);return d===0;}
function authorized(req,env){return !!env?.NORTHSTAR_OPERATOR_TOKEN&&safeEqual(req.headers.get("Authorization")||"","Bearer "+env.NORTHSTAR_OPERATOR_TOKEN);}
async function hash(value){const bytes=new TextEncoder().encode(JSON.stringify(value));const digest=await crypto.subtle.digest("SHA-256",bytes);return [...new Uint8Array(digest)].map(x=>x.toString(16).padStart(2,"0")).join("");}
export async function onRequestGet({request,env}){
 if(!authorized(request,env))return fail("Unauthorized.",401);
 const db=env?.NORTHSTAR_DB;if(!db)return fail("Paper ledger unavailable.",503);
 try{
  const rows=await db.prepare("SELECT id,symbol,side,qty,reference_price,stop_price,estimated_notional_usd,planned_risk_usd,status,rationale,evidence_json,created_at,updated_at,decided_at,decision_note FROM paper_trade_intents ORDER BY created_at DESC LIMIT 100").all();
  return Response.json({ok:true,execution:false,items:(rows.results||[]).map(x=>{const {evidence_json,...item}=x;let evidence={};try{evidence=JSON.parse(evidence_json||"{}");}catch{}return {...item,evidence};}),limit:100,notes:["Proposal/review journal only; not an order ledger.","Approval is review-only and does not authorize broker submission.","Execution remains disabled unless all independent safeguards pass."]},{headers:H});
 }catch{return fail("Intent journal unavailable; apply migration 0005 first.",503);}
}
export async function onRequestPost({request,env}){
 if(!authorized(request,env))return fail("Unauthorized.",401);
 const db=env?.NORTHSTAR_DB;if(!db)return fail("Paper ledger unavailable.",503);
 let body;try{body=await request.json();}catch{return fail("Send valid JSON.");}
 const key=String(body?.idempotencyKey||"").trim(),symbol=String(body?.symbol||"").trim().toUpperCase(),stop=Number(body?.stopPrice),rationale=String(body?.rationale||"").trim().slice(0,1000);
 if(!/^[A-Za-z0-9._:-]{12,128}$/.test(key))return fail("idempotencyKey must be 12–128 safe characters.");
 if(!/^[A-Z][A-Z0-9.-]{0,9}$/.test(symbol)||!Number.isFinite(stop)||stop<=0)return fail("Provide a valid ticker and positive protective stop.");
 let control;try{control=await db.prepare("SELECT enabled,mode,kill_switch,max_portfolio_usd FROM execution_control WHERE id=1").first();}catch{return fail("Could not verify execution controls; fail-closed.",503);}
 if(!control||control.mode!=="paper"||Number(control.max_portfolio_usd)!==1000)return fail("Proposal journal requires the verified $1,000 paper allocation.",503);
 // The idempotency hash binds only the caller's proposal intent, not a moving quote.
 const requestHash=await hash({symbol,stopPrice:stop,rationale});
 try{
  const existing=await db.prepare("SELECT id,request_hash,status FROM paper_trade_intents WHERE idempotency_key=?").bind(key).first();
  if(existing){if(existing.request_hash!==requestHash)return fail("Idempotency key already exists with a different proposal.",409);return Response.json({ok:true,execution:false,replayed:true,id:existing.id,status:existing.status},{headers:H});}
 }catch{return fail("Could not verify proposal idempotency; fail-closed.",503);}
 // Re-run trusted preflight here; never trust caller-provided qty, entry, risk or evidence.
 let previewResponse,preview;
 try{
  const preflightRequest=new Request(new URL("/api/paper/preflight",request.url),{method:"POST",headers:{"Content-Type":"application/json","Authorization":request.headers.get("Authorization")||""},body:JSON.stringify({symbol,stopPrice:stop})});
  previewResponse=await runPreflight({request:preflightRequest,env});
  preview=await previewResponse.json();
 }catch{return fail("Trusted preflight could not be completed; proposal not stored.",503);}
 if(!previewResponse.ok||preview?.ok!==true||preview?.execution!==false||preview?.status!=="PREFLIGHT_PASSED_PREVIEW_ONLY_NOT_AN_ORDER")return fail("Server-side preflight blocked this proposal: "+String(preview?.error||"unknown preflight failure"),previewResponse.status||409,{preflight:preview});
 const qty=Number(preview.shares),entry=Number(preview.estimatedEntryPrice),verifiedStop=Number(preview.stopPrice),notional=Number(preview.estimatedNotionalUsd),risk=Number(preview.plannedStopRiskUsd);
 if(!Number.isInteger(qty)||qty<=0||!Number.isFinite(entry)||entry<=verifiedStop||!Number.isFinite(notional)||notional<=0||notional>250||!Number.isFinite(risk)||risk<=0||risk>10)return fail("Trusted preflight returned invalid sizing; proposal not stored.",503);
 const evidence={source:"northstar_server_preflight",preflight:preview};
 const evidenceJson=JSON.stringify(evidence);
 if(new TextEncoder().encode(evidenceJson).byteLength>10240)return fail("Verified evidence payload exceeds the 10 KB journal limit.",503);
 const now=new Date().toISOString();
 try{
  const existing=await db.prepare("SELECT id,request_hash,status FROM paper_trade_intents WHERE idempotency_key=?").bind(key).first();
  if(existing){if(existing.request_hash!==requestHash)return fail("Idempotency key already exists with a different server-verified proposal.",409);return Response.json({ok:true,execution:false,replayed:true,id:existing.id,status:existing.status},{headers:H});}
  const id=crypto.randomUUID();
  const writes=await db.batch([
   db.prepare("INSERT INTO paper_trade_intents(id,idempotency_key,request_hash,symbol,side,qty,reference_price,stop_price,estimated_notional_usd,planned_risk_usd,status,rationale,evidence_json,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?,?,?,'PENDING_REVIEW',?,?,?,?)").bind(id,key,requestHash,symbol,"buy",qty,entry,verifiedStop,Number(notional.toFixed(2)),Number(risk.toFixed(2)),rationale,evidenceJson,now,now),
   db.prepare("INSERT INTO execution_audit_log(actor,action,outcome,request_id,details_json) VALUES(?,?,?,?,?)").bind("operator","PAPER_INTENT_CREATED","PENDING_REVIEW",id,JSON.stringify({symbol,qty,notionalUsd:notional,plannedRiskUsd:risk,preflightCheckedAt:preview.checkedAt}))
  ]);
  if(!writes||writes.length!==2||Number(writes[0]?.meta?.changes)!==1||Number(writes[1]?.meta?.changes)!==1)throw new Error("Atomic intent/audit write failed.");
  return Response.json({ok:true,execution:false,id,status:"PENDING_REVIEW",symbol,qty,referencePrice:entry,stopPrice:verifiedStop,notionalUsd:Number(notional.toFixed(2)),plannedRiskUsd:Number(risk.toFixed(2)),preflight:preview,message:"Server-verified proposal recorded for human review only. No broker order was created or submitted."},{status:201,headers:H});
 }catch{return fail("Could not persist proposal; no success is claimed.",503);}
}
