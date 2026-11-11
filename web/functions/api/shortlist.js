// Read-only proxy for the latest validated shortlist published on main.
const HEADERS={"Cache-Control":"no-store, max-age=0","Content-Type":"application/json; charset=utf-8","X-Content-Type-Options":"nosniff","Referrer-Policy":"no-referrer"};
const reply=(body,status=200)=>new Response(JSON.stringify(body),{status,headers:HEADERS});
export async function onRequestGet(){
  try{
    const upstream=await fetch("https://raw.githubusercontent.com/hamzaijaz9989/ai-stock-advisor/main/web/data/top-stocks-cache.json",{headers:{Accept:"application/json"},cache:"no-store"});
    if(!upstream.ok)return reply({ok:false,error:"Latest published shortlist could not be fetched.",upstreamStatus:upstream.status},503);
    const data=await upstream.json();
    const generatedAt=typeof data.generatedAt==="string"?data.generatedAt:null;
    const stocks=Array.isArray(data.stocks)?data.stocks.filter(stock=>
      stock&&typeof stock.ticker==="string"&&/^[A-Z][A-Z0-9.-]{0,11}$/.test(stock.ticker)&&
      Number.isFinite(Number(stock.score))&&Number(stock.score)>=0&&Number(stock.score)<=100
    ).slice(0,10).map(stock=>({
      ticker:stock.ticker,name:typeof stock.name==="string"?stock.name.slice(0,160):null,
      score:Number(stock.score),entryReady:stock.entryReady===true,
      entryStatus:typeof stock.entryStatus==="string"?stock.entryStatus.slice(0,500):null,
      fundamentalFreshness:typeof stock.fundamentalFreshness==="string"?stock.fundamentalFreshness:null
    })): [];
    if(data.status!=="success"||!generatedAt||!Number.isFinite(Date.parse(generatedAt))||!stocks.length)
      return reply({ok:false,error:"Published shortlist failed freshness or schema validation."},503);
    return reply({ok:true,status:data.status,generatedAt,completedAt:data.completedAt||null,
      refreshIntervalHours:Number(data.refreshIntervalHours)||3,source:typeof data.source==="string"?data.source:null,
      workflowRunId:data.workflowRunId||null,sourceCommit:data.sourceCommit||null,
      universeSize:Number(data.universeSize)||null,rankedCount:Number(data.rankedCount)||null,
      excludedCount:Number(data.excludedCount)||null,stocks});
  }catch{
    return reply({ok:false,error:"Latest published shortlist is temporarily unavailable."},503);
  }
}
