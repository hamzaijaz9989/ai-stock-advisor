const CACHE_URL = "https://ai-stock-advisor.pages.dev/data/top-stocks-cache.json";
const QUOTE_HOSTS = ["query1.finance.yahoo.com","query2.finance.yahoo.com"];
const MAX_CACHE_AGE_MS = 4 * 60 * 60 * 1000;
const MAX_QUOTE_AGE_MS = 15 * 60 * 1000;
const MAX_FUTURE_QUOTE_SKEW_MS = 2 * 60 * 1000;
const MAX_SYMBOLS = 10;
const MAX_CONCURRENCY = 3;
const MOVE_ALERT_PCT = 3;
const HEADERS = {"Cache-Control":"no-store","X-Content-Type-Options":"nosniff"};

function nthWeekday(year, month, weekday, occurrence) {
  const first = new Date(Date.UTC(year, month - 1, 1)).getUTCDay();
  return 1 + (weekday - first + 7) % 7 + (occurrence - 1) * 7;
}
function lastWeekday(year, month, weekday) {
  const last = new Date(Date.UTC(year, month, 0));
  return last.getUTCDate() - (last.getUTCDay() - weekday + 7) % 7;
}
function observedFixedHoliday(year, month, day) {
  const date = new Date(Date.UTC(year, month - 1, day));
  const weekday = date.getUTCDay();
  if (weekday === 6) date.setUTCDate(date.getUTCDate() - 1);
  if (weekday === 0) date.setUTCDate(date.getUTCDate() + 1);
  return date.toISOString().slice(0, 10);
}
function easterSunday(year) {
  const a=year%19,b=Math.floor(year/100),c=year%100,d=Math.floor(b/4),e=b%4,f=Math.floor((b+8)/25),g=Math.floor((b-f+1)/3);
  const h=(19*a+b-d-g+15)%30,i=Math.floor(c/4),k=c%4,l=(32+2*e+2*i-h-k)%7,m=Math.floor((a+11*h+22*l)/451);
  const month=Math.floor((h+l-7*m+114)/31),day=(h+l-7*m+114)%31+1;
  return new Date(Date.UTC(year,month-1,day));
}
function usMarketCalendar(year) {
  const holidays = new Set([
    observedFixedHoliday(year,1,1), observedFixedHoliday(year,6,19),
    observedFixedHoliday(year,7,4), observedFixedHoliday(year,12,25),
    new Date(Date.UTC(year,0,nthWeekday(year,1,1,3))).toISOString().slice(0,10),
    new Date(Date.UTC(year,1,nthWeekday(year,2,1,3))).toISOString().slice(0,10),
    new Date(Date.UTC(year,4,lastWeekday(year,5,1))).toISOString().slice(0,10),
    new Date(Date.UTC(year,8,nthWeekday(year,9,1,1))).toISOString().slice(0,10),
    new Date(Date.UTC(year,10,nthWeekday(year,11,4,4))).toISOString().slice(0,10)
  ]);
  const easter=easterSunday(year); easter.setUTCDate(easter.getUTCDate()-2);
  holidays.add(easter.toISOString().slice(0,10));
  holidays.add(observedFixedHoliday(year+1,1,1));
  const earlyCloses = new Set();
  const thanksgiving = new Date(Date.UTC(year,10,nthWeekday(year,11,4,4)));
  const fridayAfter = new Date(thanksgiving); fridayAfter.setUTCDate(fridayAfter.getUTCDate()+1);
  earlyCloses.add(fridayAfter.toISOString().slice(0,10));
  const christmasEve = new Date(Date.UTC(year,11,24));
  if (![0,6].includes(christmasEve.getUTCDay())) earlyCloses.add(christmasEve.toISOString().slice(0,10));
  const julyThird = new Date(Date.UTC(year,6,3));
  if (![0,6].includes(julyThird.getUTCDay()) && !holidays.has(julyThird.toISOString().slice(0,10))) earlyCloses.add(julyThird.toISOString().slice(0,10));
  return {holidays,earlyCloses};
}
export function isUsMarketOpen(date = new Date()) {
  const parts = Object.fromEntries(new Intl.DateTimeFormat("en-US", {
    timeZone:"America/New_York",year:"numeric",month:"2-digit",day:"2-digit",weekday:"short",hour:"2-digit",minute:"2-digit",hourCycle:"h23"
  }).formatToParts(date).map(p=>[p.type,p.value]));
  if (["Sat","Sun"].includes(parts.weekday)) return false;
  const key=parts.year+"-"+parts.month+"-"+parts.day;
  const calendar=usMarketCalendar(Number(parts.year));
  if (calendar.holidays.has(key)) return false;
  const minutes=Number(parts.hour)*60+Number(parts.minute);
  const close=calendar.earlyCloses.has(key)?13*60:16*60;
  return minutes>=570&&minutes<close;
}
export function isQuoteFresh(quoteTime, now = Date.now()) {
  const timestamp = Date.parse(quoteTime || "");
  return Number.isFinite(timestamp) && timestamp <= now + MAX_FUTURE_QUOTE_SKEW_MS && now - timestamp <= MAX_QUOTE_AGE_MS;
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
export async function getFmpQuote(symbol, apiKey, fetchImpl = fetch, now = Date.now()) {
  const url = new URL("https://financialmodelingprep.com/stable/quote");
  url.searchParams.set("symbol", symbol);
  const response = await fetchImpl(url.toString(), {
    headers: { Accept: "application/json", apikey: apiKey },
    signal: AbortSignal.timeout(7000)
  });
  if (!response.ok) throw new Error("FMP quote HTTP " + response.status);
  const rows = await response.json();
  const row = Array.isArray(rows) ? rows.find(item => item?.symbol === symbol) : null;
  if (!row) throw new Error("FMP returned no quote for " + symbol);
  const price = Number(row.price);
  const previousClose = Number(row.previousClose);
  const timestamp = Number(row.timestamp);
  const quoteTime = Number.isFinite(timestamp) && timestamp > 0
    ? new Date(timestamp * 1000).toISOString()
    : null;
  if (!Number.isFinite(price) || price <= 0) throw new Error("FMP returned an invalid price");
  if (!isQuoteFresh(quoteTime, now)) throw new Error("FMP quote timestamp missing, stale, or unexpectedly in the future");
  const reportedChange = row.changePercentage;
  const changePct = reportedChange !== null && reportedChange !== undefined && reportedChange !== "" && Number.isFinite(Number(reportedChange))
    ? Number(reportedChange)
    : Number.isFinite(previousClose) && previousClose > 0 ? (price / previousClose - 1) * 100 : null;
  return {
    symbol, price,
    previousClose: Number.isFinite(previousClose) && previousClose > 0 ? previousClose : null,
    changePct,
    quoteTime, fetchedAt: new Date().toISOString(), source: "Financial Modeling Prep"
  };
}
export async function getYahooQuote(symbol, fetchImpl = fetch, now = Date.now()) {
  let last;
  for(const host of QUOTE_HOSTS) {
    try {
      const response=await fetchImpl("https://"+host+"/v8/finance/chart/"+encodeURIComponent(symbol)+"?range=1d&interval=1m",{headers:{Accept:"application/json"},signal:AbortSignal.timeout(7000)});
      if(!response.ok) throw new Error("Yahoo quote HTTP "+response.status);
      const raw=await response.json(), result=raw?.chart?.result?.[0];
      if(!result) throw new Error("Yahoo returned an empty quote result");
      const meta=result.meta||{}, closes=result.indicators?.quote?.[0]?.close||[], times=result.timestamp||[];
      let idx=-1; for(let i=closes.length-1;i>=0;i--) if(Number.isFinite(closes[i])) {idx=i;break;}
      const price=idx>=0?closes[idx]:meta.regularMarketPrice;
      const prev=meta.chartPreviousClose??meta.previousClose??null;
      if(!Number.isFinite(price)||price<=0) throw new Error("Yahoo returned no usable price");
      const quoteTime=idx>=0&&times[idx]?new Date(times[idx]*1000).toISOString():meta.regularMarketTime?new Date(meta.regularMarketTime*1000).toISOString():null;
      if(!isQuoteFresh(quoteTime, now)) throw new Error("Yahoo quote timestamp missing, stale, or unexpectedly in the future");
      return {symbol,price,previousClose:Number.isFinite(prev)?prev:null,changePct:Number.isFinite(prev)&&prev>0?(price/prev-1)*100:null,quoteTime,fetchedAt:new Date().toISOString(),source:"Yahoo Finance chart API"};
    } catch(error) { last=error; }
  }
  throw last||new Error("Yahoo quote unavailable");
}
export async function getQuote(symbol, env, fetchImpl = fetch, now = Date.now()) {
  if (env.FMP_API_KEY) {
    try {
      return await getFmpQuote(symbol, env.FMP_API_KEY, fetchImpl, now);
    } catch (fmpError) {
      try {
        const fallback = await getYahooQuote(symbol, fetchImpl, now);
        return { ...fallback, fallbackReason: String(fmpError?.message || fmpError).slice(0, 180) };
      } catch (yahooError) {
        throw new Error("FMP failed (" + String(fmpError?.message || fmpError) + "); Yahoo fallback failed (" + String(yahooError?.message || yahooError) + ")");
      }
    }
  }
  return getYahooQuote(symbol, fetchImpl, now);
}
function quoteFailureCategory(message) {
  const value=String(message||"").toLowerCase();
  const status=value.match(/\bhttp\s+(\d{3})\b/);
  if(status) return "http_"+status[1];
  if(/rate.?limit|too many requests/.test(value)) return "rate_limited";
  if(/timestamp missing|stale|unexpectedly in the future/.test(value)) return "stale_quote";
  if(/invalid price|no usable price|empty quote|no quote/.test(value)) return "invalid_quote";
  if(/timeout|timed out|abort/.test(value)) return "timeout";
  if(/fetch failed|network|connection|dns/.test(value)) return "network_error";
  return "provider_error";
}
export function classifyQuoteFailure(error) {
  const message=String(error?.message||error||"");
  const fmp=message.match(/FMP failed \(([^)]*)\)/i);
  const yahoo=message.match(/Yahoo fallback failed \(([^)]*)\)/i);
  const categories=[];
  if(fmp) categories.push("fmp_"+quoteFailureCategory(fmp[1]));
  if(yahoo) categories.push("yahoo_"+quoteFailureCategory(yahoo[1]));
  if(categories.length) return categories.join("+");
  if(/\bFMP\b/i.test(message)) return "fmp_"+quoteFailureCategory(message);
  if(/\bYahoo\b/i.test(message)) return "yahoo_"+quoteFailureCategory(message);
  return quoteFailureCategory(message);
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
  const quoteFailureCounts=new Map();
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
    const results=await bounded(candidates,MAX_CONCURRENCY,symbol=>getQuote(symbol,env));
    const at=new Date().toISOString(), day=dateKey(new Date());
    for(let i=0;i<results.length;i++) {
      const result=results[i], stock=candidates[i];
      if(!result.ok){errors++;const category=classifyQuoteFailure(result.error);quoteFailureCounts.set(category,(quoteFailureCounts.get(category)||0)+1);continue;}
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
    const failureSummary=[...quoteFailureCounts].sort(([a],[b])=>a.localeCompare(b)).map(([category,count])=>category+"="+count).join(", ");
    const detail="Checked "+checked+" of "+candidates.length+" candidates; quote failures: "+errors+(failureSummary?" ("+failureSummary+")":"");
    await db.prepare("UPDATE monitor_runs SET completed_at=?,status=?,symbols_checked=?,errors=?,detail=? WHERE id=?").bind(at,status,checked,errors,detail,runId).run();
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
