const DAY=/^\d{4}-\d{2}-\d{2}$/;
const HEADERS={"Cache-Control":"public, max-age=900","X-Content-Type-Options":"nosniff"};
export async function onRequestGet({request,env}){
 const date=new URL(request.url).searchParams.get("date")||new Date(Date.now()-86400000).toISOString().slice(0,10);
 if(!DAY.test(date)||Number.isNaN(Date.parse(date+"T00:00:00Z")))return Response.json({available:false,error:"Provide a valid ISO market date."},{status:400,headers:HEADERS});
 const key=typeof env?.MASSIVE_API_KEY==="string"?env.MASSIVE_API_KEY.trim():"";
 if(!key)return Response.json({available:false,configured:false,provider:"Massive",error:"MASSIVE_API_KEY is not configured."},{status:503,headers:{"Cache-Control":"no-store","X-Content-Type-Options":"nosniff"}});
 const url=new URL("https://api.massive.com/v2/aggs/grouped/locale/us/market/stocks/"+date);
 url.searchParams.set("adjusted","true");url.searchParams.set("include_otc","false");url.searchParams.set("apiKey",key);
 try{
  const response=await fetch(url.toString(),{headers:{Accept:"application/json"},signal:AbortSignal.timeout(15000)});
  if(!response.ok)return Response.json({available:false,configured:true,provider:"Massive",upstreamStatus:response.status,error:"Massive grouped daily summary failed (HTTP "+response.status+")."},{status:502,headers:{"Cache-Control":"no-store","X-Content-Type-Options":"nosniff"}});
  const payload=await response.json();
  const stocks=(Array.isArray(payload?.results)?payload.results:[]).map(row=>{
   const symbol=String(row?.T||"").toUpperCase(),open=Number(row?.o),high=Number(row?.h),low=Number(row?.l),close=Number(row?.c),volume=Number(row?.v);
   if(!/^[A-Z][A-Z0-9.-]{0,11}$/.test(symbol)||![open,high,low,close,volume].every(Number.isFinite)||Math.min(open,high,low,close)<=0||volume<0||high<Math.max(open,close,low)||low>Math.min(open,close,high))return null;
   return {ticker:symbol,open,high,low,close,volume,vwap:Number.isFinite(Number(row?.vw))?Number(row.vw):null,transactions:Number.isFinite(Number(row?.n))?Number(row.n):null,date};
  }).filter(Boolean);
  return Response.json({available:stocks.length>0,configured:true,provider:"Massive",date,dataRecency:"end_of_day",count:stocks.length,stocks,
   warning:"Grouped daily summary is end-of-day market data; it is not an intraday quote or a real-time signal."},{headers:HEADERS});
 }catch(error){return Response.json({available:false,configured:true,provider:"Massive",error:"Massive daily summary could not be completed: "+String(error?.name||"Error").slice(0,60)},{status:502,headers:{"Cache-Control":"no-store","X-Content-Type-Options":"nosniff"}});
 }
}
