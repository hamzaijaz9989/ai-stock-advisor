import {onRequestGet as getFmpFundamentals} from "../fmp-fundamentals.js";
import {onRequestGet as getMassiveNews} from "../massive-news.js";
import {onRequestGet as getNews} from "../news.js";
import {fetchSecCompanyFacts} from "../../../lib/sec-companyfacts.js";
import {runFundamentalAnalyst,runNewsAnalyst} from "../../../lib/research-specialist-agents.js";

const HEADERS={"Cache-Control":"no-store","X-Content-Type-Options":"nosniff","Referrer-Policy":"no-referrer"};
const reply=(body,status=200)=>Response.json(body,{status,headers:HEADERS});
function safeEqual(a,b){if(typeof a!=="string"||typeof b!=="string"||!a||!b)return false;let d=a.length^b.length;for(let i=0;i<Math.max(a.length,b.length);i++)d|=(a.charCodeAt(i)||0)^(b.charCodeAt(i)||0);return d===0;}
async function read(handler,origin,path,env){
 const response=await handler({request:new Request(origin+path,{headers:{Accept:"application/json"}}),env});
 const body=await response.json().catch(()=>null);
 if(!response.ok)throw new Error(body?.error||"Provider endpoint failed (HTTP "+response.status+").");
 return body;
}
async function loadNews(origin,ticker,env){
 let primaryError=null;
 try{
  const primary=await read(getMassiveNews,origin,"/api/massive-news?ticker="+encodeURIComponent(ticker),env);
  if(primary.available&&Array.isArray(primary.items))return {...primary,provider:"Massive"};
  primaryError=primary.warning||"Massive news returned no usable articles";
 }catch(error){primaryError=String(error?.message||"Massive news unavailable").slice(0,160);}
 try{
  const fallback=await read(getNews,origin,"/api/news?ticker="+encodeURIComponent(ticker),env);
  return {...fallback,provider:fallback.provider||"RSS/news discovery",fallbackReason:"Massive primary news unavailable: "+String(primaryError||"unknown")};
 }catch(error){
  return {items:[],sources:[],provider:"news discovery",warning:"Massive and secondary news feeds unavailable.",fallbackReason:String(error?.message||"Secondary news unavailable").slice(0,160)};
 }
}
function secFact(fact,ticker,asOf){
 const id="sec:"+ticker+":"+fact.key+":"+fact.end+":"+fact.unit+":"+(fact.accession||fact.filed);
 return {id,type:"SEC_REPORTED_FACT",source:"SEC EDGAR companyfacts",observedAt:fact.filed,asOf,
  value:{metric:fact.metric||fact.key,key:fact.key,taxonomy:fact.taxonomy||null,tag:fact.tag||null,value:fact.value,unit:fact.unit||null,start:fact.start||null,end:fact.end,filed:fact.filed,form:fact.form||null,accession:fact.accession||null,fiscalYear:fact.fy??null,fiscalPeriod:fact.fp||null,availabilityTimestampVerified:false,note:"SEC filed date is not an exact public-availability timestamp."}};
}
function fmpFallbackFacts(fundamentals,ticker){
 const facts=[],latest=fundamentals?.latest;
 if(latest&&typeof latest==="object"){
  facts.push({id:"fmp-latest:"+ticker+":"+(latest.fiscalDate||fundamentals.retrievedAt||"unknown"),type:"FMP_REPORTED_FUNDAMENTALS_CROSSCHECK",source:"Financial Modeling Prep fallback",observedAt:fundamentals.retrievedAt||null,value:{fiscalDate:latest.fiscalDate||null,currency:latest.currency||null,metrics:latest}});
 }
 for(const section of ["income","balance","cashflow","metrics","ratios","estimates"]){
  for(const [i,row] of (Array.isArray(fundamentals?.history?.[section])?fundamentals.history[section]:[]).entries()){
   const period=row?.date||row?.fiscalYear||"undated";
   facts.push({id:"fmp:"+ticker+":"+section+":"+period+":"+i,type:section==="estimates"?"FMP_ANALYST_ESTIMATE":["income","balance","cashflow"].includes(section)?"FMP_STATEMENT_PERIOD":"FMP_PROVIDER_METRIC",source:"Financial Modeling Prep fallback",observedAt:fundamentals.retrievedAt||null,value:{section,period:row?.period||row?.date||null,reportedCurrency:row?.reportedCurrency||null,values:row}});
  }
 }
 return facts;
}
export async function onRequestPost({request,env}){
 if(!safeEqual(request.headers.get("Authorization")||"","Bearer "+(env?.NORTHSTAR_OPERATOR_TOKEN||"")))return reply({ok:false,error:"Unauthorized.",execution:false},401);
 let body;try{body=await request.json();}catch{return reply({ok:false,error:"Valid JSON required."},400);}
 const ticker=String(body?.ticker||"").trim().toUpperCase();
 if(!/^[A-Z][A-Z0-9.-]{0,11}$/.test(ticker))return reply({ok:false,error:"A valid US equity ticker is required."},400);
 const origin=new URL(request.url).origin,started=Date.now(),asOf=new Date().toISOString();
 try{
  const [secResult,news]=await Promise.all([
   fetchSecCompanyFacts(ticker,asOf).then(value=>({ok:true,value}),error=>({ok:false,error:String(error?.message||error).slice(0,180)})),
   loadNews(origin,ticker,env)
  ]);
  const observations=secResult.ok?secResult.value.observations:[];
  let fundamentals={available:observations.length>0,configured:true,provider:"SEC EDGAR companyfacts",ticker,
   retrievedAt:asOf,observationCount:observations.length,warning:secResult.ok?secResult.value.pointInTimeWarning:secResult.error};
  let facts=observations.map(row=>secFact(row,ticker,asOf));
  // FMP is an optional last-resort fundamentals fallback only if SEC returns no
  // usable facts. Never ask FMP to replace or overwrite SEC observations.
  if(!facts.length&&env?.FMP_API_KEY){
   try{
    const fallback=await read(getFmpFundamentals,origin,"/api/fmp-fundamentals?ticker="+encodeURIComponent(ticker),env);
    if(fallback.available){
     fundamentals={...fallback,provider:"Financial Modeling Prep fallback",fallbackUsed:true};
     facts=fmpFallbackFacts(fallback,ticker);
    }else fundamentals={...fundamentals,warning:fallback.warning||fallback.reason||"SEC facts and FMP fallback unavailable."};
   }catch(error){fundamentals={...fundamentals,warning:String(error?.message||"FMP fallback unavailable").slice(0,180)};}
  }
  const items=(Array.isArray(news.items)?news.items:[]).map((item,i)=>{
   const published=typeof item.publishedAt==="string"?item.publishedAt:null;
   const timestamp=published?Date.parse(published):NaN;
   const timestampStatus=!Number.isFinite(timestamp)?"MISSING":timestamp>Date.parse(asOf)?"AFTER_AS_OF":"PRESENT";
   return {id:"news:"+ticker+":"+i,type:"NEWS_DISCOVERY",source:item.source||"news discovery",observedAt:published,value:{
    title:String(item.title||""),description:String(item.description||""),url:String(item.url||""),publishedAt:published,
    publisher:item.source||null,publisherVerified:item.publisherVerified===true,sourceTier:item.publisherVerified===true?"reported-source":"unverified-source",
    timestampStatus,note:"News discovery only; verify material claims against original issuer/regulator sources."
   }};
  });
  const context={ticker,asOf,facts,evidence:items};
  const fundamental=runFundamentalAnalyst(context),newsReport=runNewsAnalyst(context);
  return reply({ok:true,ticker,asOf,elapsedMs:Date.now()-started,liveData:{
   fundamentals:{provider:fundamentals.provider||"SEC EDGAR companyfacts",available:fundamentals.available===true,observationCount:observations.length,
    fallbackUsed:fundamentals.fallbackUsed===true,warning:fundamentals.warning||null},
   news:{provider:news.provider||"Massive",fetchedAt:news.retrievedAt||news.fetchedAt||null,items:items.length,
    sources:news.sources||[],warning:news.warning||null,fallbackReason:news.fallbackReason||null}
  },agents:{fundamental_analyst:fundamental,news_analyst:newsReport},execution:false,automatedOrderSubmission:false},200);
 }catch(error){return reply({ok:false,error:String(error?.message||"Fundamental/news collection failed").slice(0,240),execution:false,automatedOrderSubmission:false},503);}
}
