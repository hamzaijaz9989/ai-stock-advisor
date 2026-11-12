// Independent, research-only activation path for Market Scanner and Technical Analyst.
// This route deliberately bypasses portfolio sync, debate, risk committee and all broker APIs.
import {onRequestGet as getQuote} from "../quote.js";
import {runMarketScanner,runTechnicalAnalyst} from "../../../lib/research-specialist-agents.js";

const ROLES=["market_scanner","technical_analyst","fundamental_analyst","news_analyst","sentiment_analyst","bull_researcher","bear_researcher","portfolio_analyst","risk_committee"];
const H={"Cache-Control":"no-store","X-Content-Type-Options":"nosniff","Referrer-Policy":"no-referrer"};
const reply=(body,status=200)=>Response.json(body,{status,headers:H});
const validTicker=x=>/^[A-Z][A-Z0-9.-]{0,11}$/.test(x);
const safeEqual=(a,b)=>{if(typeof a!=="string"||typeof b!=="string"||!a||!b)return false;let d=a.length^b.length;for(let i=0;i<Math.max(a.length,b.length);i++)d|=(a.charCodeAt(i)||0)^(b.charCodeAt(i)||0);return d===0;};
const finite=x=>typeof x==="number"&&Number.isFinite(x);
async function getHistory(ticker){
 const url="https://query1.finance.yahoo.com/v8/finance/chart/"+encodeURIComponent(ticker)+"?range=1y&interval=1d";
 const response=await fetch(url,{headers:{Accept:"application/json"},signal:AbortSignal.timeout(9000)});
 if(!response.ok)throw new Error("Daily history provider returned HTTP "+response.status+".");
 const raw=await response.json(),result=raw?.chart?.result?.[0];
 if(!result)throw new Error("Daily OHLCV history unavailable.");
 const q=result.indicators?.quote?.[0]||{},ts=result.timestamp||[];
 const rows=[];
 for(let i=0;i<ts.length;i++){
  const row={date:new Date(ts[i]*1000).toISOString().slice(0,10),open:q.open?.[i],high:q.high?.[i],low:q.low?.[i],close:q.close?.[i],volume:q.volume?.[i]};
  if(["open","high","low","close","volume"].every(k=>finite(row[k]))&&row.open>0&&row.low>0&&row.high>=Math.max(row.open,row.close,row.low)&&row.low<=Math.min(row.open,row.close))rows.push(row);
 }
 return {rows,source:"Yahoo Finance chart endpoint",fetchedAt:new Date().toISOString(),dataQuality:"unverified-adjustment"};
}
function validateReport(report,ids){
 if(!report||!["COMPLETE","UNAVAILABLE"].includes(report.status)||!Array.isArray(report.findings)||!Array.isArray(report.risks))throw new Error("Agent report contract invalid.");
 if(report.status==="UNAVAILABLE"&&(report.findings.length||report.risks.length))throw new Error("Unavailable report cannot contain claims.");
 for(const item of [...report.findings,...report.risks]){
  if(typeof item?.claim!=="string"||item.claim.trim().length<12||!Array.isArray(item.factIds)||!item.factIds.length||item.factIds.some(id=>!ids.has(id)))throw new Error("Agent returned an unsupported claim or fact reference.");
 }
 return report;
}
export async function onRequestPost({request,env}){
 const origin=request.headers.get("Origin")||"";
 const sameOrigin=origin===new URL(request.url).origin&&request.headers.get("Sec-Fetch-Site")==="same-origin";
 const authorized=safeEqual(request.headers.get("Authorization")||"","Bearer "+String(env?.NORTHSTAR_OPERATOR_TOKEN||""));
 if(!sameOrigin&&!authorized)return reply({ok:false,error:"Use the Northstar same-origin research launch control."},401);
 if(!env?.NORTHSTAR_DB)return reply({ok:false,error:"Research audit ledger unavailable."},503);
 let body;try{body=await request.json();}catch{return reply({ok:false,error:"Valid JSON required."},400);}
 const ticker=String(body?.ticker||"").trim().toUpperCase(),requestId=String(body?.requestId||"").trim();
 if(!validTicker(ticker)||!/^[A-Za-z0-9._:-]{8,100}$/.test(requestId))return reply({ok:false,error:"A valid ticker and stable requestId are required."},400);
 const db=env.NORTHSTAR_DB;
 try{
  const prior=await db.prepare("SELECT symbol,result_json,created_at FROM research_council_runs WHERE request_id=?").bind(requestId).first();
  if(prior){
   if(String(prior.symbol||"").toUpperCase()!==ticker)return reply({ok:false,error:"requestId already belongs to another ticker."},409);
   let result=null;try{result=JSON.parse(prior.result_json);}catch{}
   if(result?.runType==="TWO_AGENT_INDEPENDENT"&&result?.completedAt)return reply({ok:true,replayed:true,result,createdAt:prior.created_at,execution:false,automatedOrderSubmission:false});
   return reply({ok:false,error:"This request ID is already in progress or contains an incomplete attempt. Use a new request ID."},409);
  }
  const asOf=new Date().toISOString();
  const initial={version:"1.0.2",runType:"TWO_AGENT_INDEPENDENT",requestId,ticker,asOf,status:"RESEARCH_ONLY_PARTIAL",execution:false,automatedOrderSubmission:false,finalDecision:false,agents:ROLES.map(role=>({role,status:"NOT_RUN",reason:"Outside this limited two-agent activation."})),reports:[],warning:"Partial research run only. No portfolio approval, BUY/SELL decision or broker action is produced."};
  await db.prepare("INSERT INTO research_council_runs(request_id,input_sha256,symbol,status,result_json) VALUES(?,?,?,?,?)").bind(requestId,"quick-scan:"+requestId,ticker,"NO_TRADE",JSON.stringify(initial)).run();
  const persist=async result=>{
   await db.prepare("UPDATE research_council_runs SET result_json=?,status='NO_TRADE' WHERE request_id=? AND symbol=?").bind(JSON.stringify(result),requestId,ticker).run();
  };
  const [quoteResult,historyResult]=await Promise.allSettled([
   getQuote({request:new Request(new URL("/api/quote?ticker="+encodeURIComponent(ticker),request.url)),env}).then(async r=>{const v=await r.json();if(!r.ok)throw new Error(v?.error||"Timestamped quote unavailable.");return v;}),
   getHistory(ticker)
  ]);
  const facts=[],ids=new Set();
  if(quoteResult.status==="fulfilled"){
   const q=quoteResult.value;
   if(finite(q.price)&&q.price>0){
    const id="quote:"+ticker+":"+(q.quoteTime||"untimestamped");ids.add(id);
    facts.push({id,type:"QUOTE",source:q.source||"unknown",observedAt:q.quoteTime||null,asOf,value:{price:q.price,currency:q.currency||null,exchange:q.exchange||null,previousClose:finite(q.previousClose)?q.previousClose:null,change:finite(q.change)?q.change:null,changePercent:finite(q.changePercent)?q.changePercent:null,quoteTime:q.quoteTime||null,timestampStatus:!q.quoteTime?"MISSING":Date.parse(q.quoteTime)>Date.parse(asOf)?"AFTER_AS_OF":"PRESENT",marketState:q.marketState||null,delayedOrRealtime:q.delayedOrRealtime||null,interval:q.interval||null,warning:q.warning||null}});
   }
  }
  if(historyResult.status==="fulfilled"&&historyResult.value.rows.length){
   const h=historyResult.value,id="history:"+ticker+":"+h.rows[0].date+":"+h.rows.at(-1).date;ids.add(id);
   facts.push({id,type:"DAILY_OHLCV_HISTORY",source:h.source,observedAt:h.fetchedAt,asOf,value:{interval:"1d",currency:"USD",startDate:h.rows[0].date,endDate:h.rows.at(-1).date,observationCount:h.rows.length,dataQuality:h.dataQuality,rows:h.rows}});
  }
  const context={ticker,asOf,facts,evidence:[]};
  const roles=[["market_scanner",runMarketScanner],["technical_analyst",runTechnicalAnalyst]];
  const result={...initial,agents:initial.agents.map(x=>({...x}))};
  await persist(result);
  for(const [role,worker] of roles){
   const started=Date.now();
   try{
    const report=validateReport(worker(context),ids);
    const agent={role,status:report.status,reason:report.reason||null,findings:report.findings,risks:report.risks,durationMs:Date.now()-started,telemetry:{provider:"deterministic",model:"northstar-"+role+"-v1",failed:false,unavailable:report.status==="UNAVAILABLE"}};
    result.agents=result.agents.map(x=>x.role===role?agent:x);
    result.reports=result.reports.filter(x=>x.role!==role).concat([{role,report}]);
   }catch(error){
    result.agents=result.agents.map(x=>x.role===role?{role,status:"BLOCKED",reason:String(error?.message||"Agent validation failed.").slice(0,250),findings:[],risks:[],durationMs:Date.now()-started}:x);
   }
   await persist(result);
  }
  result.completedAt=new Date().toISOString();
  result.asOf=result.completedAt;
  result.collection={quote:quoteResult.status==="fulfilled"?{source:quoteResult.value.source||null,quoteTime:quoteResult.value.quoteTime||null}: {error:String(quoteResult.reason?.message||"Quote unavailable").slice(0,180)},history:historyResult.status==="fulfilled"?{source:historyResult.value.source,bars:historyResult.value.rows.length,from:historyResult.value.rows[0]?.date||null,to:historyResult.value.rows.at(-1)?.date||null}:{error:String(historyResult.reason?.message||"History unavailable").slice(0,180)}};
  result.summary={completed:result.agents.filter(x=>["market_scanner","technical_analyst"].includes(x.role)&&x.status==="COMPLETE").length,unavailable:result.agents.filter(x=>["market_scanner","technical_analyst"].includes(x.role)&&x.status==="UNAVAILABLE").length,blocked:result.agents.filter(x=>["market_scanner","technical_analyst"].includes(x.role)&&x.status==="BLOCKED").length};
  result.warning="Partial research only; remaining seven agents were not run. No portfolio risk approval, BUY/SELL recommendation, order or trading permission is implied.";
  await persist(result);
  const stored=await db.prepare("SELECT result_json,created_at FROM research_council_runs WHERE request_id=? AND symbol=?").bind(requestId,ticker).first();
  if(!stored)return reply({ok:false,error:"Durable two-agent report could not be verified."},503);
  const saved=JSON.parse(stored.result_json);
  if(!saved.completedAt||!saved.agents.some(x=>x.role==="market_scanner"&&x.status!=="NOT_RUN")||!saved.agents.some(x=>x.role==="technical_analyst"&&x.status!=="NOT_RUN"))return reply({ok:false,error:"Both independent agent outcomes were not durably saved."},503);
  return reply({ok:true,replayed:false,traceDurable:true,createdAt:stored.created_at,result:saved,execution:false,automatedOrderSubmission:false});
 }catch(error){
  return reply({ok:false,execution:false,error:String(error?.message||"Independent research run failed safely.").slice(0,300)},503);
 }
}
