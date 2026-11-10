import {onRequestGet as getFundamentals} from "../fmp-fundamentals.js";
import {onRequestGet as getNews} from "../news.js";
import {runFundamentalAnalyst,runNewsAnalyst} from "../../../lib/research-specialist-agents.js";

const HEADERS={"Cache-Control":"no-store","X-Content-Type-Options":"nosniff","Referrer-Policy":"no-referrer"};
const reply=(body,status=200)=>Response.json(body,{status,headers:HEADERS});
const finite=x=>typeof x==="number"&&Number.isFinite(x);
function safeEqual(a,b){if(typeof a!=="string"||typeof b!=="string"||!a||!b)return false;let d=a.length^b.length;for(let i=0;i<Math.max(a.length,b.length);i++)d|=(a.charCodeAt(i)||0)^(b.charCodeAt(i)||0);return d===0;}
async function read(handler,origin,path,env){const response=await handler({request:new Request(origin+path),env});if(!response.ok)throw new Error("Research provider endpoint failed (HTTP "+response.status+").");return response.json();}
export async function onRequestPost({request,env}){
 if(!safeEqual(request.headers.get("Authorization")||"","Bearer "+(env?.NORTHSTAR_OPERATOR_TOKEN||"")))return reply({ok:false,error:"Unauthorized.",execution:false},401);
 let body;try{body=await request.json();}catch{return reply({ok:false,error:"Valid JSON required."},400);}
 const ticker=String(body?.ticker||"").trim().toUpperCase();
 if(!/^[A-Z][A-Z0-9.-]{0,11}$/.test(ticker))return reply({ok:false,error:"A valid US equity ticker is required."},400);
 const origin=new URL(request.url).origin,started=Date.now();
 try{
  const [fundamentals,news]=await Promise.all([
   read(getFundamentals,origin,"/api/fmp-fundamentals?ticker="+encodeURIComponent(ticker),env),
   read(getNews,origin,"/api/news?ticker="+encodeURIComponent(ticker),env)
  ]);
  const facts=[];
  if(fundamentals.latest&&typeof fundamentals.latest==="object"){
   const latest={...fundamentals.latest};
   const estimateKeys=["analystEpsAverage","analystRevenueAverage","analystCountEps","analystCountRevenue"];
   const estimates=Object.fromEntries(estimateKeys.filter(k=>latest[k]!==null&&latest[k]!==undefined).map(k=>[k,latest[k]]));
   for(const k of estimateKeys)delete latest[k];
   facts.push({id:"fmp-latest:"+ticker+":"+(latest.fiscalDate||fundamentals.retrievedAt||"unknown"),type:"FMP_REPORTED_FUNDAMENTALS_CROSSCHECK",source:fundamentals.provider||"Financial Modeling Prep",observedAt:fundamentals.retrievedAt||null,value:{fiscalDate:latest.fiscalDate||null,currency:latest.currency||null,metrics:latest}});
   if(Object.keys(estimates).length)facts.push({id:"fmp-estimates:"+ticker+":"+(latest.fiscalDate||"latest"),type:"FMP_ANALYST_ESTIMATE",source:fundamentals.provider||"Financial Modeling Prep",observedAt:fundamentals.retrievedAt||null,value:{metrics:estimates,period:latest.fiscalDate||null}});
  }
  for(const section of ["income","balance","cashflow","metrics","ratios","estimates"]){
   for(const [i,row] of (Array.isArray(fundamentals.history?.[section])?fundamentals.history[section]:[]).entries()){
    const period=row?.date||row?.fiscalYear||"undated";
    facts.push({id:"fmp:"+ticker+":"+section+":"+period+":"+i,type:section==="estimates"?"FMP_ANALYST_ESTIMATE":["income","balance","cashflow"].includes(section)?"FMP_STATEMENT_PERIOD":"FMP_PROVIDER_METRIC",source:fundamentals.provider||"Financial Modeling Prep",observedAt:fundamentals.retrievedAt||null,value:{section,period:row?.period||row?.date||null,reportedCurrency:row?.reportedCurrency||null,values:row}});
   }
  }
  const items=(Array.isArray(news.items)?news.items:[]).map((item,i)=>({id:"news:"+ticker+":"+i,type:"NEWS_DISCOVERY",source:item.source||"news discovery",observedAt:item.publishedAt||null,value:{title:String(item.title||""),description:String(item.description||""),url:String(item.url||""),publishedAt:item.publishedAt||null,publisher:item.source||null,publisherVerified:item.publisherVerified===true,sourceTier:"unverified-source",timestampStatus:Date.parse(item.publishedAt||"")>Date.now()?"AFTER_AS_OF":Date.parse(item.publishedAt||"")?"PRESENT":"MISSING",note:"News discovery only; verify material claims against original issuer/regulator sources."}}));
  const context={ticker,asOf:new Date().toISOString(),facts,evidence:items};
  const fundamental=runFundamentalAnalyst(context),newsReport=runNewsAnalyst(context);
  return reply({ok:true,ticker,asOf:context.asOf,elapsedMs:Date.now()-started,liveData:{fundamentals:{provider:fundamentals.provider||"Financial Modeling Prep",retrievedAt:fundamentals.retrievedAt||null,available:fundamentals.available===true,datasetCoverage:fundamentals.datasetCoverage||null,errors:fundamentals.errors||[],secCrossCheck:"not included in this endpoint; must be added before full fundamental acceptance"},news:{fetchedAt:news.fetchedAt||null,items:items.length,sources:news.sources||[],note:news.note||null}},agents:{fundamental_analyst:fundamental,news_analyst:newsReport},execution:false,automatedOrderSubmission:false},200);
 }catch(error){return reply({ok:false,error:String(error?.message||"Fundamental/news collection failed").slice(0,240),execution:false,automatedOrderSubmission:false},503);}
}
