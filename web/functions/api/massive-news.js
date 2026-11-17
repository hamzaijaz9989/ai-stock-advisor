const TICKER_RE=/^[A-Z][A-Z0-9.-]{0,11}$/;
const HEADERS={"Cache-Control":"public, max-age=300","X-Content-Type-Options":"nosniff"};
function normalizedSentiment(value){
 const word=String(value||"").trim().toLowerCase();
 if(word==="positive")return 1;
 if(word==="negative")return -1;
 if(word==="neutral")return 0;
 return null;
}
export async function onRequestGet({request,env}){
 const url=new URL(request.url),ticker=(url.searchParams.get("ticker")||"").trim().toUpperCase();
 if(!TICKER_RE.test(ticker))return Response.json({available:false,error:"Enter a valid US stock ticker."},{status:400,headers:HEADERS});
 const key=typeof env?.MASSIVE_API_KEY==="string"?env.MASSIVE_API_KEY.trim():"";
 if(!key)return Response.json({available:false,configured:false,provider:"Massive",items:[],sentimentObservations:[],warning:"MASSIVE_API_KEY is not configured in Cloudflare Pages Production."},{status:503,headers:{"Cache-Control":"no-store","X-Content-Type-Options":"nosniff"}});
 const api=new URL("https://api.massive.com/v2/reference/news");
 api.searchParams.set("ticker",ticker);api.searchParams.set("sort","published_utc");api.searchParams.set("order","desc");api.searchParams.set("limit","100");api.searchParams.set("apiKey",key);
 try{
  const response=await fetch(api.toString(),{headers:{Accept:"application/json"},signal:AbortSignal.timeout(10000)});
  if(!response.ok)return Response.json({available:false,configured:true,provider:"Massive",items:[],sentimentObservations:[],upstreamStatus:response.status,warning:"Massive news request failed (HTTP "+response.status+")."},{status:502,headers:{"Cache-Control":"no-store","X-Content-Type-Options":"nosniff"}});
  const payload=await response.json(),rows=Array.isArray(payload?.results)?payload.results:[];
  const items=rows.filter(row=>typeof row?.title==="string"&&typeof row?.article_url==="string"&&/^https?:\\/\\//i.test(row.article_url))
   .filter(row=>Array.isArray(row.tickers)&&row.tickers.some(symbol=>String(symbol).toUpperCase()===ticker))
   .map(row=>({title:row.title,description:typeof row.description==="string"?row.description:"",url:row.article_url,
    publishedAt:typeof row.published_utc==="string"?row.published_utc:null,
    source:row.publisher?.name||"Massive news publisher",publisherVerified:Boolean(row.publisher?.name),
    insights:Array.isArray(row.insights)?row.insights.filter(x=>String(x?.ticker||"").toUpperCase()===ticker).map(x=>({sentiment:x.sentiment||null,reasoning:x.sentiment_reasoning||null})):[]}))
   .filter((row,i,all)=>all.findIndex(other=>other.url===row.url)===i);
  const scores=items.flatMap(item=>item.insights.map(insight=>({score:normalizedSentiment(insight.sentiment),publishedAt:item.publishedAt})))
   .filter(x=>x.score!==null&&x.publishedAt&&Number.isFinite(Date.parse(x.publishedAt)));
  const sentimentObservations=[];
  if(scores.length){
   const retrievalTime=new Date().toISOString();
   const latestArticle=scores.map(x=>Date.parse(x.publishedAt)).sort((a,b)=>b-a)[0];
   const oldestArticle=scores.map(x=>Date.parse(x.publishedAt)).sort((a,b)=>a-b)[0];
   const score=scores.reduce((sum,x)=>sum+x.score,0)/scores.length;
   if(latestArticle<=Date.now()+30000&&oldestArticle>=Date.now()-2*86400000){
    sentimentObservations.push({
     timestamp:retrievalTime,source:"Massive ticker-news insights",sampleCount:scores.length,
     score:Number(score.toFixed(4)),window:"latest_48h_news_insights",
     scoreMethod:"equal-weight mean of provider positive=+1, neutral=0, negative=-1 article insights",
     note:"Aggregated from article-level Massive news insights. Sample contains only articles with a matching ticker insight and a valid publication timestamp; it is news sentiment, not social or options positioning."
    });
   }
  }
  return Response.json({available:true,configured:true,ticker,provider:"Massive",retrievedAt:new Date().toISOString(),items,
   sentimentObservations,coverage:{newsItems:items.length,sentimentSamples:sentimentObservations[0]?.sampleCount||0,newsRecency:"updated_hourly"},
   warning:items.length?"Massive Basic news is updated hourly; insights sentiment availability begins in July 2024 and depends on article coverage.":"No ticker-specific news articles were returned."},{headers:HEADERS});
 }catch(error){
  return Response.json({available:false,configured:true,provider:"Massive",items:[],sentimentObservations:[],warning:"Massive news request could not be completed: "+String(error?.name||"Error").slice(0,60)},{status:502,headers:{"Cache-Control":"no-store","X-Content-Type-Options":"nosniff"}});
 }
}
