const TICKER_RE=/^[A-Z][A-Z0-9.-]{0,11}$/;
const HEADERS={"Cache-Control":"no-store","X-Content-Type-Options":"nosniff"};
function unavailable(reason,status=200,extra={}){
 return Response.json({available:false,configured:true,provider:"Finnhub news sentiment",observations:[],warning:reason,...extra},{status,headers:HEADERS});
}
export async function onRequestGet({request,env}){
 const url=new URL(request.url),ticker=(url.searchParams.get("ticker")||"").trim().toUpperCase(),key=env?.FINNHUB_API_KEY;
 if(!TICKER_RE.test(ticker))return Response.json({error:"Enter a valid US stock ticker."},{status:400,headers:HEADERS});
 if(typeof key!=="string"||!key.trim())return Response.json({available:false,configured:false,provider:"Finnhub news sentiment",observations:[],warning:"FINNHUB_API_KEY is not configured."},{status:503,headers:HEADERS});
 try{
  const endpoint=new URL("https://finnhub.io/api/v1/news-sentiment");
  endpoint.searchParams.set("symbol",ticker);
  endpoint.searchParams.set("token",key);
  const response=await fetch(endpoint.toString(),{headers:{Accept:"application/json"},signal:AbortSignal.timeout(9000)});
  if(!response.ok)return unavailable("Finnhub news-sentiment request failed (HTTP "+response.status+").",502,{upstreamStatus:response.status});
  const payload=await response.json();
  const symbol=String(payload?.symbol||ticker).toUpperCase();
  const sampleCount=Number(payload?.buzz?.articlesInLastWeek);
  const bullishPercent=Number(payload?.sentiment?.bullishPercent);
  const bearishPercent=Number(payload?.sentiment?.bearishPercent);
  // Finnhub reports bullish/bearish percentages and the number of news articles
  // in its rolling-week aggregate. Reject missing, empty or out-of-range samples.
  if(symbol!==ticker||!Number.isSafeInteger(sampleCount)||sampleCount<=0||
     !Number.isFinite(bullishPercent)||!Number.isFinite(bearishPercent)||
     bullishPercent<0||bullishPercent>100||bearishPercent<0||bearishPercent>100){
   return unavailable("Finnhub returned no usable rolling-week sentiment sample for this ticker.");
  }
  const retrievedAt=new Date().toISOString();
  const score=(bullishPercent-bearishPercent)/100;
  const observation={
   timestamp:retrievedAt,timestampStatus:"PRESENT",source:"Finnhub news-sentiment API",
   sampleCount,score,window:"rolling_7d_news_aggregate",
   scoreMethod:"(bullishPercent - bearishPercent) / 100",
   bullishPercent,bearishPercent,
   companyNewsScore:Number.isFinite(Number(payload?.companyNewsScore))?Number(payload.companyNewsScore):null,
   note:"Timestamp is the retrieval time of Finnhub's rolling seven-day news aggregate, not an article publication timestamp. This is news sentiment, not social or options positioning."
  };
  return Response.json({available:true,configured:true,ticker,provider:"Finnhub news sentiment",retrievedAt,observations:[observation],warning:"One provider snapshot only; source concentration and provider methodology must be considered."},{headers:HEADERS});
 }catch(error){
  return unavailable("Finnhub news-sentiment request could not be completed: "+String(error?.name||"Error").slice(0,60),502);
 }
}
