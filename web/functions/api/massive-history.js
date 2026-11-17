const TICKER_RE=/^[A-Z][A-Z0-9.-]{0,11}$/;
const DAY=/^\d{4}-\d{2}-\d{2}$/;
const HEADERS={"Cache-Control":"public, max-age=300","X-Content-Type-Options":"nosniff"};
const BASIC_WINDOW_DAYS=730;
function isoDay(value){if(typeof value!=="string"||!DAY.test(value))return false;const d=new Date(value+"T00:00:00Z");return !Number.isNaN(d.getTime())&&d.toISOString().slice(0,10)===value;}
export async function onRequestGet({request,env}){
 const q=new URL(request.url).searchParams;
 const ticker=(q.get("ticker")||"").trim().toUpperCase();
 const to=q.get("to")||new Date().toISOString().slice(0,10);
 const defaultFrom=new Date(Date.parse(to+"T00:00:00Z")-BASIC_WINDOW_DAYS*86400000).toISOString().slice(0,10);
 const from=q.get("from")||defaultFrom;
 if(!TICKER_RE.test(ticker)||!isoDay(from)||!isoDay(to)||from>to)
  return Response.json({available:false,error:"Provide a valid US ticker and ISO from/to dates."},{status:400,headers:HEADERS});
 if((Date.parse(to+"T00:00:00Z")-Date.parse(from+"T00:00:00Z"))/86400000>730)
  return Response.json({available:false,error:"Massive Basic supports a rolling two-year historical-bars window; requested range is too large."},{status:400,headers:HEADERS});
 const key=typeof env?.MASSIVE_API_KEY==="string"?env.MASSIVE_API_KEY.trim():"";
 if(!key)return Response.json({available:false,configured:false,provider:"Massive",error:"MASSIVE_API_KEY is not configured in Cloudflare Pages Production."},{status:503,headers:{"Cache-Control":"no-store","X-Content-Type-Options":"nosniff"}});
 const url=new URL("https://api.massive.com/v2/aggs/ticker/"+encodeURIComponent(ticker)+"/range/1/day/"+from+"/"+to);
 url.searchParams.set("adjusted","true");url.searchParams.set("sort","asc");url.searchParams.set("limit","50000");url.searchParams.set("apiKey",key);
 try{
  const response=await fetch(url.toString(),{headers:{Accept:"application/json"},signal:AbortSignal.timeout(12000)});
  if(!response.ok)return Response.json({available:false,configured:true,provider:"Massive",upstreamStatus:response.status,error:"Massive historical aggregates request failed (HTTP "+response.status+")."},{status:[401,403].includes(response.status)?response.status:502,headers:{"Cache-Control":"no-store","X-Content-Type-Options":"nosniff"}});
  const payload=await response.json();
  if(payload?.status&&payload.status!=="OK"&&payload.status!=="DELAYED")
   return Response.json({available:false,configured:true,provider:"Massive",error:"Massive returned status "+String(payload.status).slice(0,60)+"."},{status:502,headers:{"Cache-Control":"no-store","X-Content-Type-Options":"nosniff"}});
  const rows=Array.isArray(payload?.results)?payload.results:[];
  const prices=rows.map(row=>{
   const time=Number(row?.t),open=Number(row?.o),high=Number(row?.h),low=Number(row?.l),close=Number(row?.c),volume=Number(row?.v);
   if(!Number.isFinite(time)||time<=0||![open,high,low,close,volume].every(Number.isFinite))return null;
   const date=new Date(time).toISOString().slice(0,10);
   if(date<from||date>to||Math.min(open,high,low,close)<=0||volume<0||high<Math.max(open,close,low)||low>Math.min(open,close,high))return null;
   return {date,open,high,low,close,adjClose:close,volume};
  }).filter(Boolean).sort((a,b)=>a.date.localeCompare(b.date));
  const unique=prices.filter((row,i)=>i===0||prices[i-1].date!==row.date);
  return Response.json({
   available:unique.length>=20,configured:true,ticker,provider:"Massive",priceProvider:"Massive",
   retrievedAt:new Date().toISOString(),window:{from,to},
   coverage:{priceBars:unique.length,historyYears:2,dataRecency:"end_of_day",adjustedForSplits:true},
   prices:unique,statements:{},news:[],
   warning:"Massive Basic stock aggregates are end-of-day data and adjusted for splits, not dividend-adjusted total-return prices. Intraday quotes come from the separate Alpaca/Finnhub quote adapter.",
   errors:unique.length>=20?[]:[{dataset:"prices",error:"Fewer than 20 valid daily bars were returned."}]
  },{headers:HEADERS});
 }catch(error){
  return Response.json({available:false,configured:true,provider:"Massive",error:"Massive history request could not be completed: "+String(error?.name||"Error").slice(0,60)},{status:502,headers:{"Cache-Control":"no-store","X-Content-Type-Options":"nosniff"}});
 }
}
