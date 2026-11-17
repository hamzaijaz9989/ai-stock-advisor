const TICKER_RE=/^[A-Z][A-Z0-9.-]{0,11}$/;
const HEADERS={"Cache-Control":"no-store","X-Content-Type-Options":"nosniff"};
const DAY=86400000;
function unavailable(reason,status=200,extra={}){
 return Response.json({available:false,configured:true,provider:"Finnhub company-news feed",articles:[],warning:reason,...extra},{status,headers:HEADERS});
}
export async function onRequestGet({request,env}){
 const url=new URL(request.url),ticker=(url.searchParams.get("ticker")||"").trim().toUpperCase(),key=env?.FINNHUB_API_KEY;
 if(!TICKER_RE.test(ticker))return Response.json({error:"Enter a valid US stock ticker."},{status:400,headers:HEADERS});
 if(typeof key!=="string"||!key.trim())return Response.json({available:false,configured:false,provider:"Finnhub company-news feed",articles:[],warning:"FINNHUB_API_KEY is not configured."},{status:503,headers:HEADERS});
 const now=Date.now(),to=new Date(now).toISOString().slice(0,10),from=new Date(now-7*DAY).toISOString().slice(0,10);
 const endpoint=new URL("https://finnhub.io/api/v1/company-news");
 endpoint.searchParams.set("symbol",ticker);endpoint.searchParams.set("from",from);endpoint.searchParams.set("to",to);endpoint.searchParams.set("token",key);
 try{
  const response=await fetch(endpoint.toString(),{headers:{Accept:"application/json"},signal:AbortSignal.timeout(9000)});
  if(!response.ok)return unavailable(response.status===403?"Finnhub company-news access is unavailable for this key (HTTP 403); the restricted sentiment endpoint is not retried.":"Finnhub company-news request failed (HTTP "+response.status+").",200,{upstreamStatus:response.status});
  const payload=await response.json();if(!Array.isArray(payload))return unavailable("Finnhub returned an invalid company-news response.");
  const seen=new Set(),articles=[];
  for(const row of payload){
   const headline=typeof row?.headline==="string"?row.headline.trim():"",articleUrl=typeof row?.url==="string"?row.url.trim():"";
   const timestamp=Number.isFinite(row?.datetime)?new Date(row.datetime*1000).toISOString():null,ms=timestamp?Date.parse(timestamp):NaN;
   if(!headline||!(articleUrl.startsWith("https://")||articleUrl.startsWith("http://"))||!Number.isFinite(ms)||ms>now||now-ms>7*DAY||seen.has(articleUrl))continue;
   seen.add(articleUrl);articles.push({headline,summary:typeof row.summary==="string"?row.summary.slice(0,1000):"",url:articleUrl,publishedAt:timestamp,source:typeof row.source==="string"&&row.source.trim()?row.source.trim():"Finnhub (publisher unavailable)",provider:"Finnhub company-news",providerReportedSentiment:false});
   if(articles.length>=50)break;
  }
  articles.sort((a,b)=>Date.parse(b.publishedAt)-Date.parse(a.publishedAt));
  return Response.json({available:articles.length>0,configured:true,ticker,provider:"Finnhub company-news feed",retrievedAt:new Date().toISOString(),articles,methodology:"Raw timestamped company-news articles only. Northstar may derive AI sentiment from qualifying headlines; Finnhub provider-reported sentiment is not requested.",warning:articles.length?null:"No unique, dated, non-stale company-news articles were returned."},{headers:HEADERS});
 }catch(error){return unavailable("Finnhub company-news request could not be completed: "+String(error?.name||"Error").slice(0,60),200);}
}
