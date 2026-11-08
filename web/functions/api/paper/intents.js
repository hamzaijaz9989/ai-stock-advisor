// Authenticated proposal journal only. No broker order lifecycle is implemented here.
const H={"Cache-Control":"no-store","X-Content-Type-Options":"nosniff","Referrer-Policy":"no-referrer"};
const fail=(error,status=400)=>Response.json({ok:false,execution:false,error},{status,headers:H});
function safeEqual(a,b){if(typeof a!=="string"||typeof b!=="string"||!a||!b)return false;let d=a.length^b.length;for(let i=0;i<Math.max(a.length,b.length);i++)d|=(a.charCodeAt(i)||0)^(b.charCodeAt(i)||0);return d===0;}
function authorized(req,env){return !!env?.NORTHSTAR_OPERATOR_TOKEN&&safeEqual(req.headers.get("Authorization")||"","Bearer "+env.NORTHSTAR_OPERATOR_TOKEN);}
const num=v=>v!==null&&v!==undefined&&v!==""&&Number.isFinite(Number(v))?Number(v):null;
async function hash(value){const bytes=new TextEncoder().encode(JSON.stringify(value));const digest=await crypto.subtle.digest("SHA-256",bytes);return [...new Uint8Array(digest)].map(x=>x.toString(16).padStart(2,"0")).join("");}
export async function onRequestGet({request,env}){
 if(!authorized(request,env))return fail("Unauthorized.",401);
 const db=env?.NORTHSTAR_DB;if(!db)return fail("Paper ledger unavailable.",503);
 try{const rows=await db.prepare("SELECT id,symbol,side,qty,reference_price,stop_price,estimated_notional_usd,planned_risk_usd,status,rationale,evidence_json,created_at,updated_at,decided_at,decision_note FROM paper_trade_intents ORDER BY created_at DESC LIMIT 100").all();
 return Response.json({ok:true,execution:false,items:(rows.results||[]).map(x=>{const {evidence_json,...item}=x;return {...item,evidence:JSON.parse(evidence_json)};}),limit:100,notes:["Proposal/review journal only; not an order ledger.","No approval in this endpoint authorizes broker submission.","All broker execution remains disabled."]},{headers:H});
 }catch{return fail("Intent journal unavailable; apply migration 0005 first.",503);}
}
export async function onRequestPost({request,env}){
 if(!authorized(request,env))return fail("Unauthorized.",401);
 const db=env?.NORTHSTAR_DB;if(!db)return fail("Paper ledger unavailable.",503);
 let body;try{body=await request.json();}catch{return fail("Send valid JSON.");}
 const key=String(body?.idempotencyKey||"").trim(),symbol=String(body?.symbol||"").trim().toUpperCase(),qty=num(body?.qty),entry=num(body?.referencePrice),stop=num(body?.stopPrice),rationale=String(body?.rationale||"").trim().slice(0,1000);
 const evidence=body?.evidence&&typeof body.evidence==="object"&&!Array.isArray(body.evidence)?body.evidence:{};
 let evidenceJson;try{evidenceJson=JSON.stringify(evidence);if(typeof evidenceJson!=="string"||new TextEncoder().encode(evidenceJson).byteLength>10240)return fail("Evidence payload must not exceed 10 KB.");}catch{return fail("Evidence must be valid JSON data.");}
 if(!/^[A-Za-z0-9._:-]{12,128}$/.test(key))return fail("idempotencyKey must be 12–128 safe characters.");
 if(!/^[A-Z][A-Z0-9.-]{0,9}$/.test(symbol)||!Number.isInteger(qty)||qty<=0||entry===null||entry<=0||stop===null||stop<=0||stop>=entry)return fail("Invalid long-only proposal fields.");
 const notional=qty*entry,risk=qty*(entry-stop);
 if(!Number.isFinite(notional)||!Number.isFinite(risk)||notional>250||risk>10)return fail("Proposal exceeds the $250 position or $10 maximum planned-risk ceiling.");
 let control;try{control=await db.prepare("SELECT enabled,mode,kill_switch,max_portfolio_usd FROM execution_control WHERE id=1").first();}catch{return fail("Could not verify execution controls; fail-closed.",503);}
 if(!control||control.mode!=="paper"||Number(control.enabled)!==0||Number(control.kill_switch)!==1||Number(control.max_portfolio_usd)!==1000)return fail("Proposal journal is locked unless paper mode is disabled and kill-switched.",503);
 const payload={symbol,side:"buy",qty,referencePrice:entry,stopPrice:stop,rationale,evidence},requestHash=await hash(payload),id=crypto.randomUUID(),now=new Date().toISOString();
 try{
  const existing=await db.prepare("SELECT id,request_hash,status FROM paper_trade_intents WHERE idempotency_key=?").bind(key).first();
  if(existing){if(existing.request_hash!==requestHash)return fail("Idempotency key already exists with a different proposal.",409);return Response.json({ok:true,execution:false,replayed:true,id:existing.id,status:existing.status},{headers:H});}
  const writes=await db.batch([
   db.prepare("INSERT INTO paper_trade_intents(id,idempotency_key,request_hash,symbol,side,qty,reference_price,stop_price,estimated_notional_usd,planned_risk_usd,status,rationale,evidence_json,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?,?,?,'PENDING_REVIEW',?,?,?,?)").bind(id,key,requestHash,symbol,"buy",qty,entry,stop,Number(notional.toFixed(2)),Number(risk.toFixed(2)),rationale,evidenceJson,now,now),
   db.prepare("INSERT INTO execution_audit_log(actor,action,outcome,request_id,details_json) VALUES(?,?,?,?,?)").bind("operator","PAPER_INTENT_CREATED","PENDING_REVIEW",id,JSON.stringify({symbol,qty,notionalUsd:notional,plannedRiskUsd:risk}))
  ]);
  if(!writes||writes.length!==2||Number(writes[0]?.meta?.changes)!==1||Number(writes[1]?.meta?.changes)!==1)throw new Error("Atomic intent/audit write failed.");
  return Response.json({ok:true,execution:false,id,status:"PENDING_REVIEW",notionalUsd:Number(notional.toFixed(2)),plannedRiskUsd:Number(risk.toFixed(2)),message:"Proposal recorded for review only. No broker order was created or submitted."},{status:201,headers:H});
 }catch{return fail("Could not persist proposal; no success is claimed.",503);}
}
