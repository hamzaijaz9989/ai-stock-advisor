import {onRequestGet as getQuote} from "../quote.js";
import {onRequestGet as getHistory} from "../fmp-history.js";
import {runMarketScanner,runTechnicalAnalyst} from "../../../lib/research-specialist-agents.js";

const headers={"Cache-Control":"no-store","X-Content-Type-Options":"nosniff","Referrer-Policy":"no-referrer"};
const reply=(body,status=200)=>Response.json(body,{status,headers});
const finite=x=>typeof x==="number"&&Number.isFinite(x);
function safeEqual(a,b){if(typeof a!=="string"||typeof b!=="string"||!a||!b)return false;let d=a.length^b.length;for(let i=0;i<Math.max(a.length,b.length);i++)d|=(a.charCodeAt(i)||0)^(b.charCodeAt(i)||0);return d===0;}
async function read(handler,origin,path,env){const response=await handler({request:new Request(origin+path),env});if(!response.ok)throw new Error("Provider endpoint failed (HTTP "+response.status+").");return response.json();}
export async function onRequestPost({request,env}){
 if(!safeEqual(request.headers.get("Authorization")||"","Bearer "+(env?.NORTHSTAR_OPERATOR_TOKEN||"")))return reply({ok:false,error:"Unauthorized.",execution:false},401);
 let body;try{body=await request.json();}catch{return reply({ok:false,error:"Valid JSON required."},400);}
 const ticker=String(body?.ticker||"").trim().toUpperCase();
 if(!/^[A-Z][A-Z0-9.-]{0,11}$/.test(ticker))return reply({ok:false,error:"A valid US equity ticker is required."},400);
 const origin=new URL(request.url).origin,started=Date.now();
 try{
  const [quote,history]=await Promise.all([
   read(getQuote,origin,"/api/quote?ticker="+encodeURIComponent(ticker),env),
   read(getHistory,origin,"/api/fmp-history?ticker="+encodeURIComponent(ticker),env)
  ]);
  if(String(quote?.ticker||"").toUpperCase()!==ticker||!finite(quote?.price)||quote.price<=0||!quote.quoteTime)return reply({ok:false,error:"Quote is missing, mismatched or undated.",execution:false},503);
  if(String(history?.ticker||"").toUpperCase()!==ticker||!history.available||!Array.isArray(history.prices))return reply({ok:false,error:"Historical price data is missing or mismatched.",execution:false,providerErrors:history?.errors||[]},503);
  const rows=history.prices.map(x=>({date:x.date,open:x.adjOpen??x.open,high:x.adjHigh??x.high,low:x.adjLow??x.low,close:x.adjClose??x.close,volume:x.volume})).filter(x=>typeof x.date==="string"&&x.date<new Date().toISOString().slice(0,10)&&["open","high","low","close","volume"].every(k=>finite(x[k]))&&x.open>0&&x.high>=x.low&&x.low>0&&x.volume>=0).sort((a,b)=>a.date.localeCompare(b.date));
  if(rows.length<60)return reply({ok:false,error:"At least 60 valid daily OHLCV bars are required.",availableBars:rows.length,execution:false},503);
  const quoteAgeMs=Date.now()-Date.parse(quote.quoteTime);
  const freshness=Number.isFinite(quoteAgeMs)&&quoteAgeMs>=0&&quoteAgeMs<=15*60*1000?"FRESH":"NOT_FRESH";
  const context={ticker,facts:[
   {id:"quote:"+ticker+":"+quote.quoteTime,type:"QUOTE",source:quote.source||"unknown",observedAt:quote.quoteTime,value:{price:quote.price,changePercent:finite(quote.changePercent)?quote.changePercent:null,quoteTime:quote.quoteTime,quoteFreshness:{status:freshness,ageMs:quoteAgeMs},delayedOrRealtime:quote.delayedOrRealtime||"unknown",source:quote.source||"unknown",interval:quote.interval||"unknown",warning:quote.warning||null}},
   {id:"ohlcv:"+ticker+":"+rows[0].date+":"+rows.at(-1).date,type:"DAILY_OHLCV_HISTORY",source:history.provider||"Financial Modeling Prep",observedAt:history.retrievedAt||new Date().toISOString(),value:{rows,observationCount:rows.length,startDate:rows[0].date,endDate:rows.at(-1).date,dataQuality:"provider-adjustment-policy-unverified",coverage:history.coverage||null,pointInTimeRules:history.pointInTimeRules||null}}
  ],evidence:[]};
  const scanner=runMarketScanner(context),technical=runTechnicalAnalyst(context);
  return reply({ok:true,ticker,asOf:new Date().toISOString(),elapsedMs:Date.now()-started,liveData:{quote:{source:quote.source,quoteTime:quote.quoteTime,ageMs:quoteAgeMs,freshness:freshness,providerLabel:quote.delayedOrRealtime,warning:quote.warning||null},history:{provider:history.provider,rows:rows.length,from:rows[0].date,to:rows.at(-1).date,retrievedAt:history.retrievedAt,adjustmentPolicy:"unverified; technical report carries an explicit limitation",errors:history.errors||[]}},agents:{market_scanner:scanner,technical_analyst:technical},execution:false,automatedOrderSubmission:false},200);
 }catch(error){return reply({ok:false,error:String(error?.message||"Live specialist collection failed").slice(0,240),execution:false,automatedOrderSubmission:false},503);}
}
