const CACHE_URL = "https://ai-stock-advisor.pages.dev/data/top-stocks-cache.json";
const QUOTE_HOSTS = ["query1.finance.yahoo.com","query2.finance.yahoo.com"];
const MAX_CACHE_AGE_MS = 4 * 60 * 60 * 1000;
const MAX_SYMBOLS = 10;
const MAX_CONCURRENCY = 3;
const MOVE_ALERT_PCT = 3;
const HEADERS = {"Cache-Control":"no-store","X-Content-Type-Options":"nosniff"};

export function isUsMarketOpen(date = new Date()) {
  const parts = Object.fromEntries(new Intl.DateTimeFormat("en-US", {
    timeZone:"America/New_York",weekday:"short",hour:"2-digit",minute:"2-digit",hourCycle:"h23"
  }).formatToParts(date).map(p=>[p.type,p.value]));
  const day = parts.weekday;
  const minutes = Number(parts.hour)*60+Number(parts.minute);
  return !["Sat","Sun"].includes(day) && minutes >= 570 && minutes < 960;
}
export function parseWatchZone(text) {
  if (typeof text !== "string") return null;
  const m = text.match(/Model entry watch zone:\s*\$([\d,.]+)\s*[–-]\s*\$([\d,.]+)/i);
  if (!m) return null;
  const low=Number(m[1].replace(/,/g,"")), high=Number(m[2].replace(/,/g,""));
  return Number.isFinite(low)&&Number.isFinite(high)&&low>0&&high>=low?{low,high}:null;
}
function dateKey(date) {
  const p=Object.fromEntries(new Intl.DateTimeFormat("en-CA",{timeZone:"America/New_York",year:"numeric",month:"2-digit",day:"2-digit"}).formatToParts(date).map(x=>[x.type,x.value]));
  return p.year+p.month+p.day;
}
async function getQuote(symbol) {
  let last;
  for(const host of QUOTE_HOSTS) {
    try {
      const response=await fetch("https://"+host+"/v8/finance/chart/"+encodeURIComponent(symbol)+"?range=1d&interval=1m",{headers:{Accept:"application/json"},signal:AbortSignal.timeout(7000)});
      if(!response.ok) throw new Error("Quote HTTP "+response.status);
      const raw=await response.json(), result=raw?.chart?.result?.[0];
      if(!result) throw new Error("Empty quote result");
      const meta=result.meta||{}, closes=result.indicators?.quote?.[0]?.close||[], times=result.timestamp||[];
      let idx=-1; for(let i=closes.length-1;i>=0;i--) if(Number.isFinite(closes[i])) {idx=i;break;}
      const price=idx>=0?closes[idx]:meta.regularMarketPrice;
      const prev=meta.chartPreviousClose??meta.previousClose??null;
      if(!Number.isFinite(price)||price<=0) throw new Error("No usable price");
      return {symbol,price,previousClose:Number.isFinite(prev)?prev:null,changePct:Number.isFinite(prev)&&prev>0?(price/prev-1)*100:null,quoteTime:idx>=0&&times[idx]?new Date(times[idx]*1000).toISOString():meta.regularMarketTime?new Date(meta.regularMarketTime*1000).toISOString():null,fetchedAt:new Date().toISOString(),source:"Yahoo Finance chart API"};
    } catch(error) { last=error; }
  }
  throw last||new Error("Quote unavailable");
}
async function bounded(items,limit,fn) {
  const out=new Array(items.length); let next=0;
  await Promise.all(Array.from({length:Math.min(limit,items.length)},async()=>{while(true){const i=next++;if(i>=items.length)return;try{out[i]={ok:true,value:await fn(items[i])};}catch(error){out[i]={ok:false,error:String(error?.message||error)};}}}));
  return out;
}
async function emitEvent(db,event) {
  await db.prepare("INSERT OR IGNORE INTO monitor_events(event_key,symbol,event_type,severity,message,price,change_pct,source,observed_at) VALUES(?,?,?,?,?,?,?,?,?)")
    .bind(event.key,event.symbol,event.type,event.severity,event.message,event.price??null,event.changePct??null,event.source,event.at).run();
}
async function scan(env) {
  const db=env.NORTHSTAR_DB;
  if(!db) throw new Error("NORTHSTAR_DB binding unavailable");
  const started=new Date().toISOString();
  const run=await db.prepare("INSERT INTO monitor_runs(started_at,status) VALUES(?, 'running')").bind(started).run();
  const runId=run.meta?.last_row_id;
  let checked=0,errors=0;
  try {
    if(!isUsMarketOpen()) {
      await db.prepare("UPDATE monitor_runs SET completed_at=?,status='market_closed',detail=? WHERE id=?").bind(new Date().toISOString(),"US regular session closed; monitor intentionally idle.",runId).run();
      return {status:"market_closed",checked:0,errors:0};
    }
    const response=await fetch(CACHE_URL,{headers:{Accept:"application/json"},cf:{cacheTtl:0},signal:AbortSignal.timeout(10000)});
    if(!response.ok) throw new Error("Shortlist cache HTTP "+response.status);
    const cache=await response.json();
    const cacheAge=Date.now()-Date.parse(cache.completedAt||cache.generatedAt||"");
    if(!Number.isFinite(cacheAge)||cacheAge<0||cacheAge>MAX_CACHE_AGE_MS||cache.status!=="success"||!Array.isArray(cache.stocks)) throw new Error("Shortlist cache is stale or incomplete; monitoring fail-closed.");
    const candidates=cache.stocks.slice(0,MAX_SYMBOLS).filter(s=>/^[A-Z0-9.^=-]{1,12}$/.test(s.ticker));
    const results=await bounded(candidates,MAX_CONCURRENCY,getQuote);
    const at=new Date().toISOString(), day=dateKey(new Date());
    for(let i=0;i<results.length;i++) {
      const result=results[i], stock=candidates[i];
      if(!result.ok){errors++;continue;}
      const q=result.value, zone=parseWatchZone(stock.entryStatus);
      const inside=Boolean(zone&&q.price>=zone.low&&q.price<=zone.high);
      const prior=await db.prepare("SELECT in_watch_zone FROM monitor_quotes WHERE symbol=?").bind(q.symbol).first();
      await db.prepare("INSERT INTO monitor_quotes(symbol,price,previous_close,change_pct,quote_time,fetched_at,source,watch_low,watch_high,in_watch_zone) VALUES(?,?,?,?,?,?,?,?,?,?) ON CONFLICT(symbol) DO UPDATE SET price=excluded.price,previous_close=excluded.previous_close,change_pct=excluded.change_pct,quote_time=excluded.quote_time,fetched_at=excluded.fetched_at,source=excluded.source,watch_low=excluded.watch_low,watch_high=excluded.watch_high,in_watch_zone=excluded.in_watch_zone")
        .bind(q.symbol,q.price,q.previousClose,q.changePct,q.quoteTime,q.fetchedAt,q.source,zone?.low??null,zone?.high??null,inside?1:0).run();
      if(inside&&Number(prior?.in_watch_zone)!==1) await emitEvent(db,{key:q.symbol+":entered-watch-zone:"+day,symbol:q.symbol,type:"ENTERED_WATCH_ZONE",severity:"warning",message:q.symbol+" entered its provisional model watch zone. This is a research alert, not a BUY signal.",price:q.price,changePct:q.changePct,source:q.source,at});
      if(zone&&!inside&&Number(prior?.in_watch_zone)===1) await emitEvent(db,{key:q.symbol+":exited-watch-zone:"+day,symbol:q.symbol,type:"EXITED_WATCH_ZONE",severity:"info",message:q.symbol+" moved outside its provisional model watch zone.",price:q.price,changePct:q.changePct,source:q.source,at});
      if(Number.isFinite(q.changePct)&&Math.abs(q.changePct)>=MOVE_ALERT_PCT) await emitEvent(db,{key:q.symbol+":move-"+(q.changePct>0?"up":"down")+":"+day,symbol:q.symbol,type:q.changePct>0?"LARGE_MOVE_UP":"LARGE_MOVE_DOWN",severity:"warning",message:q.symbol+" moved "+q.changePct.toFixed(2)+"% versus provider previous close; review price and news context.",price:q.price,changePct:q.changePct,source:q.source,at});
      checked++;
    }
    const status=errors===0?"success":checked>0?"partial":"failed";
    await db.prepare("UPDATE monitor_runs SET completed_at=?,status=?,symbols_checked=?,errors=?,detail=? WHERE id=?").bind(at,status,checked,errors,"Checked "+checked+" of "+candidates.length+" candidates; quote failures: "+errors,runId).run();
    return {status,checked,errors,at};
  } catch(error) {
    await db.prepare("UPDATE monitor_runs SET completed_at=?,status='failed',symbols_checked=?,errors=?,detail=? WHERE id=?").bind(new Date().toISOString(),checked,errors,String(error?.message||error).slice(0,500),runId).run();
    throw error;
  }
}
export default {
 async scheduled(_controller,env,ctx) { ctx.waitUntil(scan(env)); },
 async fetch(request,env) {
   const url=new URL(request.url);
   if(url.pathname==="/health"&&request.method==="GET") {
     if(!env.NORTHSTAR_DB)return Response.json({ok:false,error:"D1 unavailable"},{status:503,headers:HEADERS});
     try {const run=await env.NORTHSTAR_DB.prepare("SELECT started_at,completed_at,status,symbols_checked,errors,detail FROM monitor_runs ORDER BY id DESC LIMIT 1").first();const count=await env.NORTHSTAR_DB.prepare("SELECT COUNT(*) AS total FROM monitor_events WHERE acknowledged_at IS NULL").first();return Response.json({ok:true,service:"northstar-market-monitor",cadence:"5 minutes during US regular session",marketOpen:isUsMarketOpen(),latestRun:run||null,unacknowledgedEvents:Number(count?.total||0),execution:false,checkedAt:new Date().toISOString()},{headers:HEADERS});}catch{return Response.json({ok:false,error:"Monitor ledger unavailable"},{status:503,headers:HEADERS});}
   }
   if(url.pathname==="/events"&&request.method==="GET") {
     if(!env.NORTHSTAR_DB)return Response.json({ok:false,error:"D1 unavailable"},{status:503,headers:HEADERS});
     const limit=Math.max(1,Math.min(100,Number(url.searchParams.get("limit"))||30));
     try {const rows=await env.NORTHSTAR_DB.prepare("SELECT id,symbol,event_type,severity,message,price,change_pct,source,observed_at,acknowledged_at FROM monitor_events ORDER BY id DESC LIMIT ?").bind(limit).all();return Response.json({ok:true,events:rows.results||[],execution:false},{headers:HEADERS});}catch{return Response.json({ok:false,error:"Event ledger unavailable"},{status:503,headers:HEADERS});}
   }
   return new Response("Not found",{status:404});
 }
};
