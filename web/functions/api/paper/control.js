// Northstar operator controls. The only writable action here is ENGAGING the kill switch.
// Releasing the switch or enabling execution is intentionally not implemented.
const H = {"Cache-Control":"no-store","X-Content-Type-Options":"nosniff","Referrer-Policy":"no-referrer"};
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
    const now=new Date().toISOString();
    await db.batch([
      db.prepare("UPDATE execution_control SET enabled=0,kill_switch=1,updated_at=? WHERE id=1").bind(now),
      db.prepare("INSERT INTO execution_audit_log(actor,action,outcome,request_id,details_json) VALUES(?,?,?,?,?)").bind("operator","ENGAGE_KILL_SWITCH","SUCCESS",request.headers.get("X-Request-ID")||null,JSON.stringify({mode:"paper",executionEnabled:false,killSwitchEngaged:true,at:now}))
    ]);
    return Response.json({ok:true,executionEnabled:false,killSwitchEngaged:true,updatedAt:now},{headers:H});
  } catch { return Response.json({ok:false,error:"Control update failed; assume kill switch remains engaged and verify ledger."},{status:503,headers:H}); }
}
