// Safe diagnostic for the canonical FMP Pages secret binding.
// Never returns, logs, or echoes the API key.
const HEADERS={"Cache-Control":"no-store","X-Content-Type-Options":"nosniff"};
function classify(status){
  if(status===401)return "AUTHENTICATION_FAILED";
  if(status===403||status===402)return "PLAN_OR_PERMISSION_RESTRICTED";
  if(status===429)return "RATE_LIMITED";
  if(status>=500)return "PROVIDER_ERROR";
  return status>=200&&status<300?"OK":"REQUEST_FAILED";
}
export async function onRequestGet(context){
  const env=context?.env||{},key=env.FMP_API_KEY;
  const configured=typeof key==="string"&&key.trim().length>0;
  const base={
    runtime:"Cloudflare Pages Functions",
    envObjectPresent:!!context?.env,
    fmpBindingPresent:Object.prototype.hasOwnProperty.call(env,"FMP_API_KEY"),
    fmpConfigured:configured,
    alpacaBindingPresent:Object.prototype.hasOwnProperty.call(env,"ALPACA_API_KEY_ID"),
    geminiBindingPresent:Object.prototype.hasOwnProperty.call(env,"GEMINI_API_KEY"),
    checkedAt:new Date().toISOString()
  };
  if(!configured)return Response.json({...base,status:"MISSING_BINDING"},{status:503,headers:HEADERS});
  const today=new Date().toISOString().slice(0,10);
  const from=new Date(Date.now()-45*86400000).toISOString().slice(0,10);
  const checks=[
    ["quote","quote?symbol=NVDA"],
    ["history","historical-price-eod/full?symbol=NVDA&from="+from+"&to="+today],
    ["fundamentals","income-statement?symbol=NVDA&period=annual&limit=1"]
  ];
  const results=await Promise.all(checks.map(async([name,path])=>{
    try{
      const url=new URL(path,"https://financialmodelingprep.com/stable/");
      url.searchParams.set("apikey",key);
      const response=await fetch(url.toString(),{headers:{Accept:"application/json"},signal:AbortSignal.timeout(12000)});
      const body=await response.json().catch(()=>null);
      const rows=Array.isArray(body)?body:[];
      const providerMessage=!Array.isArray(body)?String(body?.["Error Message"]||body?.message||body?.error||"Unexpected provider response").slice(0,180):null;
      return {dataset:name,httpStatus:response.status,status:classify(response.status),rowCount:rows.length,latestDate:rows.map(x=>x?.date).filter(Boolean).sort().at(-1)||null,providerMessage};
    }catch(error){return {dataset:name,status:"NETWORK_ERROR",errorName:error?.name||"Error"};}
  }));
  const authFailed=results.some(x=>x.status==="AUTHENTICATION_FAILED");
  const anyOk=results.some(x=>x.status==="OK");
  const status=authFailed?"FMP_AUTHENTICATION_FAILED":anyOk?"FMP_PARTIALLY_OR_FULLY_REACHABLE":"FMP_ENDPOINTS_UNAVAILABLE";
  return Response.json({...base,status,checks:results},{status:authFailed?502:anyOk?200:502,headers:HEADERS});
}
