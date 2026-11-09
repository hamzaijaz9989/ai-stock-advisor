const BASE="https://financialmodelingprep.com/stable/";
function validDate(value){
 if(!/^\d{4}-\d{2}-\d{2}$/.test(value))return false;
 const date=new Date(value+"T00:00:00Z");
 return Number.isFinite(date.getTime())&&date.toISOString().slice(0,10)===value;
}
export async function onRequestGet({request,env}){
 const query=new URL(request.url).searchParams;
 const from=query.get("from")||"",to=query.get("to")||"",ticker=(query.get("ticker")||"").trim().toUpperCase();
 if(!validDate(from)||!validDate(to)||from>to)return Response.json({available:false,error:"Provide valid ISO from and to dates."},{status:400});
 if((Date.parse(to)-Date.parse(from))/86400000>90)return Response.json({available:false,error:"FMP earnings-calendar requests are limited to 90 days; request consecutive windows."},{status:400});
 if(ticker&&!/^[A-Z][A-Z0-9.-]{0,11}$/.test(ticker))return Response.json({available:false,error:"Invalid ticker."},{status:400});
 const key=env?.FMP_API_KEY2||env?.FMP_API_KEY;
 if(!key)return Response.json({available:false,configured:false,error:"FMP_API_KEY is not configured."},{status:503,headers:{"Cache-Control":"no-store"}});
 const url=new URL("earnings-calendar",BASE);url.searchParams.set("from",from);url.searchParams.set("to",to);url.searchParams.set("page","0");url.searchParams.set("includeReportTimes","true");url.searchParams.set("apikey",key);
 try{
  const response=await fetch(url,{headers:{Accept:"application/json"},signal:AbortSignal.timeout(18000)});
  if(!response.ok)throw new Error("HTTP "+response.status);
  const payload=await response.json();
  if(!Array.isArray(payload))throw new Error("Unexpected response");
  const events=payload.filter(row=>!ticker||String(row?.symbol||"").toUpperCase()===ticker);
  return Response.json({
   available:true,configured:true,provider:"Financial Modeling Prep",retrievedAt:new Date().toISOString(),
   window:{from,to},ticker:ticker||null,coverage:{providerRecords:payload.length,matchingEvents:events.length,providerLimit:4000},
   events:events.map(row=>({symbol:row.symbol,date:row.date,time:row.time??row.reportTime??null,epsActual:row.epsActual,epsEstimated:row.epsEstimated,revenueActual:row.revenueActual,revenueEstimated:row.revenueEstimated,lastUpdated:row.lastUpdated})),
   pointInTimeWarning:"The event date and lastUpdated field do not necessarily establish when the earnings date was first publicly known. Do not use them as point-in-time availability timestamps without independent timestamp evidence.",
   limitations:["Maximum 90-day request window; callers must request adjacent windows to build longer histories.","The endpoint is capped at 4,000 provider records per request; a full or partial response must be checked for truncation.","Historical event records are not proof of when an earnings date was first announced or rescheduled."]
  },{headers:{"Cache-Control":"no-store","X-Content-Type-Options":"nosniff"}});
 }catch(error){
  return Response.json({available:false,configured:true,error:String(error?.message||"FMP earnings request failed").slice(0,160)},{status:502,headers:{"Cache-Control":"no-store"}});
 }
}
