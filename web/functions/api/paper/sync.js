// Authenticated, read-only Alpaca Paper account snapshot sync.
// Persists account equity and the current position set to D1. It never submits orders.
const H={"Cache-Control":"no-store","X-Content-Type-Options":"nosniff","Referrer-Policy":"no-referrer"};
const fail=(error,status=400)=>Response.json({ok:false,synced:false,execution:false,error},{status,headers:H});
function safeEqual(a,b){if(typeof a!=="string"||typeof b!=="string"||!a||!b)return false;let d=a.length^b.length;for(let i=0;i<Math.max(a.length,b.length);i++)d|=(a.charCodeAt(i)||0)^(b.charCodeAt(i)||0);return d===0;}
function authorized(request,env){return !!env?.NORTHSTAR_OPERATOR_TOKEN&&safeEqual(request.headers.get("Authorization")||"","Bearer "+env.NORTHSTAR_OPERATOR_TOKEN);}
async function alpaca(path,key,secret){const r=await fetch("https://paper-api.alpaca.markets"+path,{headers:{"APCA-API-KEY-ID":key,"APCA-API-SECRET-KEY":secret,"Accept":"application/json"},signal:AbortSignal.timeout(10000)});if(!r.ok)throw new Error("BROKER_HTTP_"+r.status);return r.json();}
const n=v=>v!==null&&v!==undefined&&v!==""&&Number.isFinite(Number(v))?Number(v):null;
export async function onRequestPost({request,env}){
 if(!authorized(request,env))return fail("Unauthorized.",401);
 const db=env?.NORTHSTAR_DB,key=env?.ALPACA_API_KEY_ID,secret=env?.ALPACA_API_SECRET_KEY;
 if(!db||!key||!secret)return fail("Ledger or Alpaca Paper credentials unavailable; sync blocked.",503);
 let control;
 try{control=await db.prepare("SELECT enabled,mode,kill_switch FROM execution_control WHERE id=1").first();}catch{return fail("Could not verify execution controls; fail-closed.",503);}
 if(!control||control.mode!=="paper"||Number(control.enabled)!==0||Number(control.kill_switch)!==1)return fail("Execution controls are not in the required disabled/kill-switched state.",503);
 let account,positions;
 try{[account,positions]=await Promise.all([alpaca("/v2/account",key,secret),alpaca("/v2/positions",key,secret)]);}catch(e){const m=String(e?.message||"");return fail(m.startsWith("BROKER_HTTP_")?"Alpaca Paper request failed ("+m.slice(12)+").":"Alpaca Paper request timed out or returned invalid data.",503);}
 if(account?.status!=="ACTIVE"||account?.trading_blocked||account?.account_blocked)return fail("Alpaca Paper account is not active or is blocked.",503);
 if(!Array.isArray(positions))return fail("Alpaca returned an invalid positions payload; no snapshot stored.",503);
 const equity=n(account.equity),cash=n(account.cash),buyingPower=n(account.buying_power),lastEquity=n(account.last_equity);
 if(equity===null||cash===null||equity<=0)return fail("Broker equity/cash is missing or invalid; no snapshot stored.",503);
 const now=new Date().toISOString();
 const clean=[];
 for(const p of positions){
  const symbol=String(p?.symbol||"").toUpperCase(),qty=n(p?.qty),avg=n(p?.avg_entry_price),mv=n(p?.market_value),upl=n(p?.unrealized_pl),updated=String(p?.asset_class||"")?now:now;
  if(!/^[A-Z][A-Z0-9.-]{0,9}$/.test(symbol)||qty===null||avg===null||qty<=0||avg<=0)return fail("Broker position payload contains invalid symbol, quantity, or average entry; no snapshot stored.",503);
  clean.push({symbol,qty,avg,mv,upl,updated});
 }
 const statements=[
  db.prepare("INSERT INTO paper_equity_snapshots(captured_at,equity_usd,cash_usd,buying_power_usd,day_pl_usd,source) VALUES(?,?,?,?,?,?) ON CONFLICT(captured_at) DO NOTHING").bind(now,equity,cash,buyingPower,lastEquity===null?null:equity-lastEquity,"alpaca_paper_read_only_sync"),
  db.prepare("DELETE FROM paper_positions")
 ];
 for(const p of clean)statements.push(db.prepare("INSERT INTO paper_positions(symbol,qty,avg_entry_price,market_value,unrealized_pl,broker_updated_at,reconciled_at) VALUES(?,?,?,?,?,?,?)").bind(p.symbol,p.qty,p.avg,p.mv,p.upl,p.updated,now));
 statements.push(db.prepare("INSERT INTO execution_audit_log(actor,action,outcome,request_id,details_json) VALUES(?,?,?,?,?)").bind("operator","READ_ONLY_ACCOUNT_SYNC","SUCCESS",request.headers.get("X-Request-ID")||null,JSON.stringify({capturedAt:now,positionCount:clean.length,source:"alpaca_paper"})));
 try{await db.batch(statements);}catch{return fail("D1 snapshot write failed. No sync success is claimed; verify database before retrying.",503);}
 return Response.json({ok:true,synced:true,execution:false,mode:"paper",capturedAt:now,snapshot:{equityUsd:equity,cashUsd:cash,buyingPowerUsd:buyingPower,dayPlUsd:lastEquity===null?null:Number((equity-lastEquity).toFixed(2)),positions:clean.length},warnings:["Read-only account sync; no orders were submitted, changed, or cancelled.","Position rows represent the latest broker snapshot, not a historical position ledger.","Equity snapshots are durable; realized P&L and completed-trade statistics remain unavailable until order/fill event ingestion is implemented.","Execution remains disabled and the kill switch remains engaged."]},{headers:H});
}
