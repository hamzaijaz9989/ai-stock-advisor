import {requestFmpJsonBatch} from "../../lib/fmp-budget.js";
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
  let settled;
  try{
    settled=await requestFmpJsonBatch({db:env.NORTHSTAR_DB,service:"pages",apiKey:key,verifiedDailyLimit:env.FMP_VERIFIED_DAILY_LIMIT,
      requests:checks.map(([,path])=>({path,cacheTtlMs:30_000,timeoutMs:12_000}))});
  }catch(error){
    const status=Number(error?.status)||0,code=error?.code;
    const label=["FMP_DAILY_BUDGET_EXHAUSTED","FMP_PLAN_LIMIT_UNVERIFIED"].includes(code)?code:status?classify(status):code||"NETWORK_ERROR";
    settled=checks.map(()=>({status:"rejected",reason:{status,code:label,name:error?.name||"Error"}}));
  }
  const results=settled.map((result,index)=>{
    const name=checks[index][0];
    if(result.status==="fulfilled"){
      const rows=Array.isArray(result.value)?result.value:[];
      return {dataset:name,status:"OK",httpStatus:200,rowCount:rows.length,latestDate:rows.map(x=>x?.date).filter(Boolean).sort().at(-1)||null,providerMessage:null};
    }
    const error=result.reason||{},status=Number(error.status)||0,code=error.code;
    const label=["FMP_DAILY_BUDGET_EXHAUSTED","FMP_PLAN_LIMIT_UNVERIFIED"].includes(code)?code:status?classify(status):code||"NETWORK_ERROR";
    return {dataset:name,status:label,httpStatus:status||null,errorName:error.name||"Error"};
  });
  const authFailed=results.some(x=>x.httpStatus===401);
  const budgetExhausted=results.some(x=>x.status==="FMP_DAILY_BUDGET_EXHAUSTED");
  const planLimitUnverified=results.some(x=>x.status==="FMP_PLAN_LIMIT_UNVERIFIED");
  const anyOk=results.some(x=>x.status==="OK");
  const status=planLimitUnverified?"FMP_PLAN_LIMIT_UNVERIFIED":budgetExhausted?"FMP_BUDGET_EXHAUSTED":authFailed?"FMP_AUTHENTICATION_FAILED":anyOk?"FMP_PARTIALLY_OR_FULLY_REACHABLE":"FMP_ENDPOINTS_UNAVAILABLE";
  return Response.json({...base,status,checks:results},{status:planLimitUnverified?503:budgetExhausted?429:authFailed?502:anyOk?200:502,headers:HEADERS});
}
