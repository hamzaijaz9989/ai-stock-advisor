// Server-side Northstar research collection and durable Council run.
// The browser supplies only a ticker and request ID. All market/portfolio inputs are
// collected here from providers and the reconciled Alpaca Paper ledger.
import {onRequestGet as getQuote} from "../quote.js";
import {onRequestGet as getFundamentals} from "../fmp-fundamentals.js";
import {onRequestGet as getHistory} from "../fmp-history.js";
import {onRequestGet as getNews} from "../news.js";
import {onRequestGet as getEarnings} from "../earnings.js";
import {buildResearchCouncilContext} from "../../../lib/research-council-facts.js";
import {runResearchCouncil} from "../../../lib/research-council.js";
import {createResearchCouncilWorkers} from "../../../lib/research-council-adapters.js";
import {deriveSnapshotRiskMetrics} from "../../../lib/paper-order-guards.js";
import {onRequestPost as syncPaperAccount} from "../paper/sync.js";

const H={"Cache-Control":"no-store","X-Content-Type-Options":"nosniff","Referrer-Policy":"no-referrer"};
const reply=(body,status=200)=>Response.json(body,{status,headers:H});
const finite=v=>v!==null&&v!==undefined&&v!==""&&Number.isFinite(Number(v))?Number(v):null;
function safeEqual(a,b){if(typeof a!=="string"||typeof b!=="string"||!a||!b)return false;let d=a.length^b.length;for(let i=0;i<Math.max(a.length,b.length);i++)d|=(a.charCodeAt(i)||0)^(b.charCodeAt(i)||0);return d===0;}
function stable(v){if(Array.isArray(v))return "["+v.map(stable).join(",")+"]";if(v&&typeof v==="object")return "{"+Object.keys(v).sort().map(k=>JSON.stringify(k)+":"+stable(v[k])).join(",")+"}";return JSON.stringify(v);}
async function sha256(v){const b=await crypto.subtle.digest("SHA-256",new TextEncoder().encode(v));return Array.from(new Uint8Array(b),x=>x.toString(16).padStart(2,"0")).join("");}
async function endpoint(handler,origin,path,env){const r=await handler({request:new Request(origin+path),env});if(!r.ok)throw new Error(path.split("?")[0]+" unavailable (HTTP "+r.status+")");return r.json();}
async function secFacts(ticker,collectionStartedAt){
 const headers={Accept:"application/json","User-Agent":"NorthstarAI/1.0 contact: ihamzaij681@gmail.com"};
 const mapResponse=await fetch("https://www.sec.gov/files/company_tickers.json",{headers,signal:AbortSignal.timeout(8000)});
 if(!mapResponse.ok)throw new Error("SEC ticker directory unavailable (HTTP "+mapResponse.status+")");
 const directory=await mapResponse.json();
 const row=Object.values(directory||{}).find(x=>String(x?.ticker||"").toUpperCase()===ticker);
 if(!row||!Number.isFinite(Number(row.cik_str)))throw new Error("SEC CIK mapping unavailable for "+ticker);
 const cik=String(row.cik_str).padStart(10,"0");
 const response=await fetch("https://data.sec.gov/api/xbrl/companyfacts/CIK"+cik+".json",{headers,signal:AbortSignal.timeout(12000)});
 if(!response.ok)throw new Error("SEC company facts unavailable (HTTP "+response.status+")");
 const payload=await response.json(),cutoff=collectionStartedAt.slice(0,10),out=[];
 for(const [taxonomy,concepts] of Object.entries(payload.facts||{}))for(const [key,concept] of Object.entries(concepts||{})){
  for(const [unit,rows] of Object.entries(concept.units||{})){
   for(const fact of rows||[]){
    if(!fact||typeof fact.filed!=="string"||typeof fact.end!=="string"||fact.filed>cutoff||fact.end>cutoff||!Number.isFinite(Number(fact.val)))continue;
    out.push({key,metric:concept.label||key,taxonomy,tag:key,value:Number(fact.val),unit,start:fact.start||null,end:fact.end,filed:fact.filed,form:fact.form||null,accession:fact.accn||null,fy:fact.fy??null,fp:fact.fp||null});
   }
  }
 }
 out.sort((a,b)=>b.filed.localeCompare(a.filed));
 return {cik,observations:out.slice(0,250)};
}
async function portfolioSnapshot(env){
 const db=env.NORTHSTAR_DB,key=env.ALPACA_API_KEY_ID,secret=env.ALPACA_API_SECRET_KEY;
 if(!db||!key||!secret)throw new Error("Paper ledger or Alpaca Paper credentials are unavailable.");
 const control=await db.prepare("SELECT enabled,mode,kill_switch,max_portfolio_usd FROM execution_control WHERE id=1").first();
 if(!control||control.mode!=="paper"||Number(control.enabled)!==0||Number(control.kill_switch)!==1||Number(control.max_portfolio_usd)!==1000)throw new Error("Paper execution controls are not in the required disabled/kill-switched $1,000 configuration.");
 const headers={"APCA-API-KEY-ID":key,"APCA-API-SECRET-KEY":secret,Accept:"application/json"};
 const get=async path=>{const r=await fetch("https://paper-api.alpaca.markets"+path,{headers,signal:AbortSignal.timeout(9000)});if(!r.ok)throw new Error("Alpaca Paper read failed (HTTP "+r.status+").");return r.json();};
 const [account,brokerPositions,brokerOrders,ledgerRows,snapshotRows]=await Promise.all([
  get("/v2/account"),get("/v2/positions"),get("/v2/orders?status=open&limit=500&direction=desc"),
  db.prepare("SELECT symbol,qty,avg_entry_price FROM paper_positions ORDER BY symbol").all(),
  db.prepare("SELECT captured_at,equity_usd FROM paper_equity_snapshots ORDER BY captured_at DESC LIMIT 1000").all()
 ]);
 if(account?.status!=="ACTIVE"||account.trading_blocked||account.account_blocked||!Array.isArray(brokerPositions)||!Array.isArray(brokerOrders))throw new Error("Alpaca Paper account is not active or returned incomplete positions/orders.");
 if(brokerOrders.length)throw new Error("Open broker orders exist; reconcile them before research sizing.");
 const normalize=rows=>rows.map(p=>({symbol:String(p.symbol||"").toUpperCase(),qty:finite(p.qty),avg:finite(p.avg_entry_price)})).sort((a,b)=>a.symbol.localeCompare(b.symbol));
 const bp=normalize(brokerPositions),lp=normalize(ledgerRows?.results||[]);
 if(bp.length!==lp.length||bp.some((p,i)=>p.symbol!==lp[i]?.symbol||p.qty===null||p.avg===null||Math.abs(p.qty-lp[i].qty)>1e-6||Math.abs(p.avg-lp[i].avg)>0.01))throw new Error("Broker positions and the Northstar ledger do not reconcile.");
 const equity=finite(account.equity),lastEquity=finite(account.last_equity);
 if(equity===null||equity<=0||lastEquity===null||lastEquity<=0)throw new Error("Broker equity snapshot is incomplete.");
 const snapshots=snapshotRows?.results||[];
 const history=deriveSnapshotRiskMetrics({snapshots,currentEquity:equity,lastEquity,virtualAllocationUsd:1000});
 const now=Date.now(),latest=snapshots[0],latestMs=Date.parse(latest?.captured_at||"");
 if(!Number.isFinite(latestMs)||now-latestMs>15*60*1000||latestMs>now+30000)throw new Error("Latest reconciled equity snapshot is stale or future-dated; run read-only account sync.");
 const dailyLossFraction=history?.ok&&Number.isFinite(history.dailyLossUsd)?history.dailyLossUsd/1000:null;
 const drawdownFraction=history?.ok&&Number.isFinite(history.maxDrawdownUsd)?history.maxDrawdownUsd/1000:null;
 const weeklyBase=snapshots.find(x=>Date.parse(x.captured_at)<=now-7*86400000);
 const weeklyEquity=finite(weeklyBase?.equity_usd);
 const weeklyLossFraction=weeklyEquity!==null&&weeklyEquity>0?Math.max(0,(weeklyEquity-equity)/weeklyEquity):null;
 const grossExposureUsd=bp.reduce((sum,p)=>sum+Math.abs(finite(p.market_value)||0),0);
 // Existing broker holdings are valid research context, not a reason to suppress all agents.
 // Unknown stop-based risk and missing weekly history are passed as unknown (null), never zero.
 return {verified:true,source:"alpaca_paper_account+reconciled_D1_positions+equity_history",asOf:new Date().toISOString(),
  equityUsd:1000,openRiskUsd:null,grossExposureUsd,dailyLossFraction,weeklyLossFraction,drawdownFraction,
  sectorExposureUsd:null,concurrentPositions:bp.length};
}
export async function onRequestPost({request,env}){
 if(!safeEqual(request.headers.get("Authorization")||"","Bearer "+(env?.NORTHSTAR_OPERATOR_TOKEN||"")))return reply({ok:false,execution:false,error:"Unauthorized."},401);
 if(!env?.NORTHSTAR_DB)return reply({ok:false,execution:false,error:"Research audit ledger unavailable."},503);
 let body;try{body=await request.json();}catch{return reply({ok:false,error:"Valid JSON required."},400);}
 const ticker=String(body?.ticker||"").trim().toUpperCase(),requestId=String(body?.requestId||"").trim();
 if(!/^[A-Z][A-Z0-9.-]{0,11}$/.test(ticker)||!/^[A-Za-z0-9._:-]{8,100}$/.test(requestId))return reply({ok:false,error:"A valid US ticker and stable requestId are required."},400);
 const origin=new URL(request.url).origin;
 try{
  // A request ID is an idempotency key: return the durable result before making
  // new provider calls or writing another equity snapshot.
  const prior=await env.NORTHSTAR_DB.prepare("SELECT symbol,result_json,created_at FROM research_council_runs WHERE request_id=?").bind(requestId).first();
  if(prior){
   if(String(prior.symbol||"").toUpperCase()!==ticker)return reply({ok:false,error:"requestId already belongs to a different ticker."},409);
   return reply({ok:true,replayed:true,traceDurable:true,result:JSON.parse(prior.result_json),createdAt:prior.created_at,execution:false,automatedOrderSubmission:false});
  }
  // Refresh the read-only broker snapshot before using portfolio values.
  const syncResponse=await syncPaperAccount({request:new Request(origin+"/api/paper/sync",{method:"POST",headers:{Authorization:request.headers.get("Authorization")||"", "X-Request-ID":requestId}}),env});
  if(!syncResponse.ok)throw new Error("Read-only Alpaca Paper sync failed; research collection is blocked.");
  const portfolio=await portfolioSnapshot(env);
  // Record the collection start for date-bounded provider requests. The final as-of
  // timestamp is set after all providers return, so a fresh quote retrieved during
  // collection is not incorrectly marked as occurring after the research snapshot.
  const collectionStartedAt=new Date().toISOString();
  const [quote,fundamentals,history,news,earnings,sec]=await Promise.all([
   endpoint(getQuote,origin,"/api/quote?ticker="+encodeURIComponent(ticker),env),
   endpoint(getFundamentals,origin,"/api/fmp-fundamentals?ticker="+encodeURIComponent(ticker),env),
   endpoint(getHistory,origin,"/api/fmp-history?ticker="+encodeURIComponent(ticker)+"&to="+collectionStartedAt.slice(0,10),env),
   endpoint(getNews,origin,"/api/news?ticker="+encodeURIComponent(ticker),env),
   endpoint(getEarnings,origin,"/api/earnings?ticker="+encodeURIComponent(ticker),env),
   secFacts(ticker,collectionStartedAt)
  ]);
  const asOf=new Date().toISOString();
  if(!quote?.price||!quote?.quoteTime)throw new Error("A timestamped market quote is required; latest quote is missing or undated.");
  if(!history?.available||!Array.isArray(history.prices)||history.prices.length<60)throw new Error("At least 60 valid daily price bars are required for research.");
  if(!fundamentals?.available)throw new Error("Fundamental data provider did not return usable statements.");
  const fmpHistory={income:history.statements?.annualIncome||[],balance:history.statements?.annualBalance||[],cashflow:history.statements?.annualCashflow||[],metrics:[],ratios:[],estimates:[]};
  const context=buildResearchCouncilContext({ticker,asOf,quote:{ticker,price:Number(quote.price),currency:quote.currency,exchange:quote.exchange,previousClose:finite(quote.previousClose),change:finite(quote.change),changePercent:finite(quote.changePercent),quoteTime:quote.quoteTime,marketState:quote.marketState,delayedOrRealtime:quote.delayedOrRealtime,interval:quote.interval,source:quote.source},
   history:{data:history.prices,interval:"1d",currency:"USD",source:history.provider,fetchedAt:history.retrievedAt,dataQuality:history.coverage},
   secObservations:sec.observations,fmpFundamentals:{available:true,provider:fundamentals.provider,retrievedAt:fundamentals.retrievedAt,latest:fundamentals.latest,history:fmpHistory},
   news:{items:Array.isArray(news.items)?news.items:[]},
   earnings:{events:Array.isArray(earnings.events)?earnings.events.map(e=>({...e,date:e.reportDate||e.date||null})):[],found:earnings.found===true,verified:earnings.verified===true,throughDate:earnings.throughDate||null,provider:earnings.provider,fetchedAt:earnings.fetchedAt||earnings.fetchedAt,warning:earnings.warning||null},
   portfolio});
  if(context.facts.length+context.evidence.length<3)throw new Error("Collected research evidence is insufficient.");
  const inputHash=await sha256(stable({ticker,asOf,context}));
  const existing=await env.NORTHSTAR_DB.prepare("SELECT input_sha256,result_json,created_at FROM research_council_runs WHERE request_id=?").bind(requestId).first();
  if(existing){if(existing.input_sha256!==inputHash)return reply({ok:false,error:"requestId already used for a different research snapshot."},409);return reply({ok:true,replayed:true,traceDurable:true,result:JSON.parse(existing.result_json),createdAt:existing.created_at,execution:false,automatedOrderSubmission:false});}
  const workers=await createResearchCouncilWorkers(env);
  const result=await runResearchCouncil({requestId,context,workers});
  const storedResult={...result,collection:{sources:["Yahoo/Nasdaq quote adapter","FMP fundamentals and daily history","SEC EDGAR companyfacts","news discovery","earnings calendar","Alpaca Paper account and reconciled ledger"],factCount:context.facts.length,evidenceCount:context.evidence.length,portfolioSource:portfolio.source},execution:false,automatedOrderSubmission:false};
  const write=await env.NORTHSTAR_DB.prepare("INSERT INTO research_council_runs(request_id,input_sha256,symbol,status,result_json) VALUES(?,?,?,?,?) ON CONFLICT(request_id) DO NOTHING").bind(requestId,inputHash,ticker,result.status,JSON.stringify(storedResult)).run();
  const stored=await env.NORTHSTAR_DB.prepare("SELECT input_sha256,result_json,created_at FROM research_council_runs WHERE request_id=?").bind(requestId).first();
  if(!stored||stored.input_sha256!==inputHash)return reply({ok:false,error:"Durable Council write could not be confirmed."},503);
  return reply({ok:true,replayed:!(Number(write?.meta?.changes)>0),traceDurable:true,createdAt:stored.created_at,result:JSON.parse(stored.result_json),execution:false,automatedOrderSubmission:false});
 }catch(error){return reply({ok:false,execution:false,traceDurable:false,error:String(error?.message||"Research collection failed safely.").slice(0,300)},503);}
}
