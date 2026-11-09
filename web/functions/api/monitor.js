// Read-only event monitor status and alert feed. No trading or order capabilities.
const H={"Cache-Control":"no-store","X-Content-Type-Options":"nosniff","Referrer-Policy":"no-referrer"};
export async function onRequestGet({request,env}) {
 const db=env?.NORTHSTAR_DB;
 if(!db)return Response.json({ok:false,available:false,execution:false,error:"Monitor ledger unavailable."},{status:503,headers:H});
 const url=new URL(request.url), limit=Math.max(1,Math.min(100,Number(url.searchParams.get("limit"))||30));
 try {
  const [run,counts,events,quotes]=await Promise.all([
   db.prepare("SELECT started_at,completed_at,status,symbols_checked,errors,detail FROM monitor_runs ORDER BY id DESC LIMIT 1").first(),
   db.prepare("SELECT COUNT(*) AS total FROM monitor_events WHERE acknowledged_at IS NULL").first(),
   db.prepare("SELECT id,symbol,event_type,severity,message,price,change_pct,source,observed_at,acknowledged_at FROM monitor_events ORDER BY id DESC LIMIT ?").bind(limit).all(),
   db.prepare("SELECT symbol,price,previous_close,change_pct,quote_time,fetched_at,source,watch_low,watch_high,in_watch_zone FROM monitor_quotes ORDER BY fetched_at DESC LIMIT 10").all()
  ]);
  return Response.json({ok:true,available:true,execution:false,cadence:"5 minutes during US regular session",latestRun:run||null,unacknowledgedEvents:Number(counts?.total||0),quotes:quotes?.results||[],events:events?.results||[],checkedAt:new Date().toISOString()},{headers:H});
 } catch {return Response.json({ok:false,available:false,execution:false,error:"Monitor status could not be read."},{status:503,headers:H});}
}
