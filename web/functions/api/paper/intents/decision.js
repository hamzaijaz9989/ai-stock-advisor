// Human review decision endpoint. APPROVED_REVIEW_ONLY is never broker authorization.
const H={"Cache-Control":"no-store","X-Content-Type-Options":"nosniff","Referrer-Policy":"no-referrer"};
const fail=(error,status=400)=>Response.json({ok:false,execution:false,error},{status,headers:H});
function safeEqual(a,b){if(typeof a!=="string"||typeof b!=="string"||!a||!b)return false;let d=a.length^b.length;for(let i=0;i<Math.max(a.length,b.length);i++)d|=(a.charCodeAt(i)||0)^(b.charCodeAt(i)||0);return d===0;}
function authorized(req,env){return !!env?.NORTHSTAR_OPERATOR_TOKEN&&safeEqual(req.headers.get("Authorization")||"","Bearer "+env.NORTHSTAR_OPERATOR_TOKEN);}
export async function onRequestPost({request,env}){
 if(!authorized(request,env))return fail("Unauthorized.",401);
 const db=env?.NORTHSTAR_DB;if(!db)return fail("Paper ledger unavailable.",503);
 let body;try{body=await request.json();}catch{return fail("Send valid JSON.");}
 const id=String(body?.id||""),decision=String(body?.decision||"").toLowerCase(),note=String(body?.note||"").trim().slice(0,1000);
 if(!/^[0-9a-f-]{36}$/i.test(id)||!["approve","reject","cancel"].includes(decision))return fail("Provide a valid intent id and approve, reject or cancel decision.");
 const target=decision==="approve"?"APPROVED_REVIEW_ONLY":decision==="reject"?"REJECTED":"CANCELLED",now=new Date().toISOString();
 try{
  const writes=await db.batch([
   db.prepare("UPDATE paper_trade_intents SET status=?,updated_at=?,decided_at=?,decision_note=? WHERE id=? AND status='PENDING_REVIEW'").bind(target,now,now,note,id),
   db.prepare("INSERT INTO execution_audit_log(actor,action,outcome,request_id,details_json) SELECT ?,?,?,?,? WHERE EXISTS (SELECT 1 FROM paper_trade_intents WHERE id=? AND status=? AND decided_at=?)").bind("operator","PAPER_INTENT_DECISION",target,id,JSON.stringify({decision,note,execution:false}),id,target,now)
  ]);
  if(Number(writes?.[0]?.meta?.changes)!==1){
   const current=await db.prepare("SELECT status FROM paper_trade_intents WHERE id=?").bind(id).first();
   return current?fail("Intent is not pending review; no status change made.",409):fail("Intent not found.",404);
  }
  if(Number(writes?.[1]?.meta?.changes)!==1)throw new Error("Atomic decision audit write failed.");
  return Response.json({ok:true,execution:false,id,status:target,message:target==="APPROVED_REVIEW_ONLY"?"Proposal approved for review record only. This does not authorize or submit a broker order.":"Proposal decision recorded. No broker order was created or changed."},{headers:H});
 }catch{return fail("Could not persist review decision.",503);}
}
