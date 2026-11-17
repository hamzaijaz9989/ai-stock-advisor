// Server-side Northstar research collection and durable Council run.
// The browser supplies only a ticker and request ID. All market/portfolio inputs are
// collected here from providers and the reconciled Alpaca Paper ledger.
import {onRequestGet as getQuote} from "../quote.js";
import {onRequestGet as getFundamentals} from "../fmp-fundamentals.js";
import {onRequestGet as getMassiveHistory} from "../massive-history.js";
import {onRequestGet as getMassiveNews} from "../massive-news.js";
import {onRequestGet as getHistory} from "../fmp-history.js";
import {onRequestGet as getFinnhubSentiment} from "../finnhub-sentiment.js";
import {onRequestGet as getNews} from "../news.js";
import {onRequestGet as getEarnings} from "../earnings.js";
import {buildResearchCouncilContext} from "../../../lib/research-council-facts.js";
import {mergeFinnhubCompanyNews} from "../../../lib/research-news-merge.js";
import {consumesResearchLaunchCooldown} from "../../../lib/research-launch-cooldown.js";
import {fetchSecCompanyFacts} from "../../../lib/sec-companyfacts.js";
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
async function endpoint(handler,origin,path,env){
 let lastError=null;
 // Quote providers can transiently throttle Cloudflare-origin requests even when
 // a direct browser quote succeeds. Retry only safe GET provider reads.
 for(let attempt=0;attempt<3;attempt++){
  try{
   const r=await handler({request:new Request(origin+path,{headers:{Accept:"application/json","Cache-Control":"no-cache"}}),env});
   const payload=await r.json().catch(()=>null);
   if(r.ok)return payload;
   const providerErrors=Array.isArray(payload?.providerErrors)?payload.providerErrors.slice(0,8).join("; "):null;
   lastError=new Error(path.split("?")[0]+" unavailable (HTTP "+r.status+")"+(providerErrors?": "+providerErrors:"") );
   if(r.status!==429&&r.status<500)break;
  }catch(error){lastError=error;}
  if(attempt<2)await new Promise(resolve=>setTimeout(resolve,350*(attempt+1)));
 }
 throw lastError||new Error(path.split("?")[0]+" unavailable");
}
async function providerReadOnce(handler,origin,path,env){
 const response=await handler({request:new Request(origin+path,{headers:{Accept:"application/json","Cache-Control":"no-cache"}}),env});
 const payload=await response.json().catch(()=>null);
 if(!response.ok)throw new Error(path.split("?")[0]+" unavailable (HTTP "+response.status+")"+(payload?.error?": "+String(payload.error).slice(0,160):""));
 return payload;
}
async function resolveHistory(origin,ticker,collectionStartedAt,env){
 const path="/api/massive-history?ticker="+encodeURIComponent(ticker)+"&to="+collectionStartedAt.slice(0,10);
 let primaryError="Massive history unavailable";
 try{
  const primary=await providerReadOnce(getMassiveHistory,origin,path,env);
  if(primary?.available&&Array.isArray(primary.prices)&&primary.prices.length>=20)
   return {...primary,provider:"Massive",priceProvider:"Massive"};
  primaryError=primary?.error||"Massive returned fewer than 20 valid daily bars";
 }catch(error){primaryError=String(error?.message||primaryError).slice(0,180);}
 // FMP is retained only as a last-resort historical fallback. Its adapter itself
 // validates provider data and can fall through to Finnhub/Yahoo when FMP is down.
 try{
  const fallback=await endpoint(getHistory,origin,"/api/fmp-history?ticker="+encodeURIComponent(ticker)+"&to="+collectionStartedAt.slice(0,10),env);
  if(fallback?.available&&Array.isArray(fallback.prices)&&fallback.prices.length>=20)
   return {...fallback,fallbackReason:"Massive primary history unavailable: "+primaryError,provider:fallback.provider||fallback.priceProvider||"Validated secondary history"};
  throw new Error(fallback?.error||"Historical fallback returned insufficient bars");
 }catch(error){
  throw new Error("Massive primary history failed ("+primaryError+"); secondary history failed ("+String(error?.message||"unavailable").slice(0,180)+").");
 }
}
async function resolveNews(origin,ticker,env){
 let primaryError="Massive news unavailable",primary=null,finnhub={articles:[],warning:"Finnhub company news unavailable"};
 const [massiveResult,finnhubResult]=await Promise.allSettled([
  providerReadOnce(getMassiveNews,origin,"/api/massive-news?ticker="+encodeURIComponent(ticker),env),
  providerReadOnce(getFinnhubSentiment,origin,"/api/finnhub-sentiment?ticker="+encodeURIComponent(ticker),env)
 ]);
 if(massiveResult.status==="fulfilled"&&massiveResult.value?.available&&Array.isArray(massiveResult.value.items))primary=massiveResult.value;
 else primaryError=massiveResult.status==="rejected"?String(massiveResult.reason?.message||primaryError).slice(0,180):(massiveResult.value?.warning||"Massive returned no usable news");
 if(finnhubResult.status==="fulfilled"&&finnhubResult.value?.available===true&&Array.isArray(finnhubResult.value.articles))finnhub=finnhubResult.value;
 else if(finnhubResult.status==="fulfilled")finnhub.warning=finnhubResult.value?.warning||finnhub.warning;
 else finnhub.warning=String(finnhubResult.reason?.message||finnhub.warning).slice(0,180);
 let base=primary?{...primary,provider:"Massive"}:null;
 if(!base){
  try{
   const fallback=await endpoint(getNews,origin,"/api/news?ticker="+encodeURIComponent(ticker),env);
   base={...fallback,provider:fallback.provider||"RSS/news discovery",fallbackReason:"Massive primary news unavailable: "+primaryError};
  }catch(error){
   base={items:[],provider:"news discovery",warning:"Massive news unavailable ("+primaryError+"); secondary news unavailable ("+String(error?.message||"unknown").slice(0,140)+")."};
  }
 }
 const merged=mergeFinnhubCompanyNews(base.items,finnhub.articles||[]);
 const added=merged.added;
 return {...base,items:merged.items,newsSources:[...(Array.isArray(base.sources)?base.sources:[]),{name:"Finnhub company news",status:added?"ok":(finnhub.warning?"unavailable":"no new unique articles"),count:added}],finnhubNews:{status:added?"ok":"unavailable_or_duplicate",count:added,warning:finnhub.warning||null}};
}
async function portfolioSnapshot(env,syncData){
 const db=env.NORTHSTAR_DB,key=env.ALPACA_API_KEY_ID,secret=env.ALPACA_API_SECRET_KEY;
 if(!db||!key||!secret||syncData?.ok!==true||syncData?.synced!==true||syncData?.execution!==false||!syncData?.broker)throw new Error("A successful read-only Alpaca Paper sync is required.");
 const control=await db.prepare("SELECT enabled,mode,kill_switch,max_portfolio_usd,default_risk_fraction,max_risk_fraction,max_position_fraction FROM execution_control WHERE id=1").first();
 if(!control||control.mode!=="paper"||Number(control.enabled)!==0||Number(control.kill_switch)!==1||Number(control.max_portfolio_usd)!==1000||Number(control.default_risk_fraction)!==0.005||Number(control.max_risk_fraction)!==0.01||Number(control.max_position_fraction)!==0.25)throw new Error("Paper execution controls are not in the required disabled/kill-switched $1,000 configuration with $5 default / $10 maximum per-trade risk.");
 const broker=syncData.broker;
 const ordersResponse=await fetch("https://paper-api.alpaca.markets/v2/orders?status=open&limit=500&direction=desc",{
  headers:{"APCA-API-KEY-ID":key,"APCA-API-SECRET-KEY":secret,Accept:"application/json"},
  signal:AbortSignal.timeout(7000)
 });
 if(!ordersResponse.ok)throw new Error("Alpaca Paper open-order read failed (HTTP "+ordersResponse.status+").");
 const brokerOrders=await ordersResponse.json();
 const [ledgerRows,snapshotRows]=await Promise.all([
  db.prepare("SELECT symbol,qty,avg_entry_price FROM paper_positions ORDER BY symbol").all(),
  db.prepare("SELECT captured_at,equity_usd FROM paper_equity_snapshots ORDER BY captured_at DESC LIMIT 1000").all()
 ]);
 if(broker.status!=="ACTIVE"||!Array.isArray(broker.positions)||!Array.isArray(brokerOrders)||brokerOrders.length)throw new Error("Alpaca Paper account is not active, has open orders, or returned incomplete broker data.");
 const normalize=rows=>rows.map(p=>({symbol:String(p.symbol||"").toUpperCase(),qty:finite(p.qty),avg:finite(p.avg_entry_price)})).sort((a,b)=>a.symbol.localeCompare(b.symbol));
 const bp=normalize(broker.positions),lp=normalize(ledgerRows?.results||[]);
 if(bp.length!==lp.length||bp.some((p,i)=>p.symbol!==lp[i]?.symbol||p.qty===null||p.avg===null||Math.abs(p.qty-lp[i].qty)>1e-6||Math.abs(p.avg-lp[i].avg)>0.01))throw new Error("Broker positions and the Northstar ledger do not reconcile.");
 const equity=finite(broker.equity),lastEquity=finite(broker.lastEquity);
 if(equity===null||equity<=0||lastEquity===null||lastEquity<=0)throw new Error("Broker equity snapshot is incomplete.");
 const snapshots=snapshotRows?.results||[];
 const history=deriveSnapshotRiskMetrics({snapshots,currentEquity:equity,lastEquity,virtualAllocationUsd:Number(control.max_portfolio_usd)});
 const now=Date.now(),latest=snapshots[0],latestMs=Date.parse(latest?.captured_at||"");
 if(!Number.isFinite(latestMs)||now-latestMs>15*60*1000||latestMs>now+30000)throw new Error("Latest reconciled equity snapshot is stale or future-dated; run read-only account sync.");
 const dailyLossFraction=history?.ok&&Number.isFinite(history.dailyLossUsd)?history.dailyLossUsd/Number(control.max_portfolio_usd):null;
 const drawdownFraction=history?.ok&&Number.isFinite(history.maxDrawdownUsd)?history.maxDrawdownUsd/Number(control.max_portfolio_usd):null;
 const weeklyBase=snapshots.find(x=>Date.parse(x.captured_at)<=now-7*86400000);
 const weeklyEquity=finite(weeklyBase?.equity_usd);
 const weeklyLossFraction=weeklyEquity!==null&&weeklyEquity>0?Math.max(0,(weeklyEquity-equity)/weeklyEquity):null;
 const positionNotionals=broker.positions.map(p=>{
  const marketValue=finite(p.market_value),qty=finite(p.qty),avg=finite(p.avg_entry_price);
  return marketValue!==null?Math.abs(marketValue):qty!==null&&avg!==null?Math.abs(qty*avg):null;
 });
 const grossExposureUsd=positionNotionals.every(Number.isFinite)?positionNotionals.reduce((sum,value)=>sum+value,0):null;
 const maxPositionNotionalUsd=positionNotionals.length&&positionNotionals.every(Number.isFinite)?Math.max(...positionNotionals):0;
 // Without a verified stop order, the full long-position cost basis is the
 // conservative maximum loss to zero. A short or incomplete position stays unknown.
 const openRiskValues=broker.positions.map(p=>{
  const qty=finite(p.qty),avg=finite(p.avg_entry_price);
  if(qty===null||avg===null||qty<0||avg<=0)return null;
  return qty*avg;
 });
 const openRiskUsd=openRiskValues.every(Number.isFinite)?openRiskValues.reduce((sum,value)=>sum+value,0):null;
 // Sector metadata is not yet a required provider input. Treating all holdings
 // as one sector is a conservative upper bound, not a claim about actual sectors.
 const sectorExposureUsd=grossExposureUsd;
 return {verified:true,source:"alpaca_paper_account+reconciled_D1_positions+equity_history",asOf:syncData.capturedAt||new Date().toISOString(),
  equityUsd:Number(control.max_portfolio_usd),openRiskUsd,grossExposureUsd,maxPositionNotionalUsd,dailyLossFraction,weeklyLossFraction,drawdownFraction,
  sectorExposureUsd,sectorExposureMethod:"worst_case_all_positions_one_sector",openRiskMethod:"full_long_cost_basis_without_verified_stop",concurrentPositions:bp.length};
}
export async function onRequestPost({request,env}){
 const supplied=request.headers.get("Authorization")||"";
 const operatorAuthorized=safeEqual(supplied,"Bearer "+(env?.NORTHSTAR_OPERATOR_TOKEN||""));
 const requestOrigin=request.headers.get("Origin")||"";
 const sameOrigin=requestOrigin===new URL(request.url).origin && request.headers.get("Sec-Fetch-Site")==="same-origin";
 if(!operatorAuthorized&&!sameOrigin)return reply({ok:false,execution:false,error:"Use the Northstar same-origin research launch control."},401);
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
   let priorResult=null;try{priorResult=JSON.parse(prior.result_json);}catch{}
   const inProgress=Array.isArray(priorResult?.vetoReasons) &&
    priorResult.vetoReasons.some(reason=>typeof reason==="string" && /collection is in progress|awaiting provider collection/i.test(reason));
   // Replay durable terminal results, including a recorded NO_TRADE failure.
   // Only the explicit placeholder inserted for the currently running request
   // may proceed into collection.
   if(priorResult && !inProgress)
    return reply({ok:true,replayed:true,traceDurable:true,result:priorResult,createdAt:prior.created_at,execution:false,automatedOrderSubmission:false});
  }
  if(!operatorAuthorized){
    const recent=await env.NORTHSTAR_DB.prepare("SELECT result_json FROM research_council_runs WHERE created_at >= datetime('now','-5 minutes') ORDER BY created_at DESC LIMIT 25").all();
    const launchInWindow=(recent?.results||[]).some(row=>{
     try{return consumesResearchLaunchCooldown(JSON.parse(row.result_json));}
     catch{return true;}
    });
    if(launchInWindow)return reply({ok:false,execution:false,error:"Research launch cooldown: an active or dispatched public launch occurred within the last five minutes. Try again shortly."},429);
  }
  const attemptHash=await sha256("attempt:"+requestId);
  const roles=["market_scanner","technical_analyst","fundamental_analyst","news_analyst","sentiment_analyst","bull_researcher","bear_researcher","portfolio_analyst","risk_committee"];
  const initial={version:"1.0.2",requestId,ticker,asOf:new Date().toISOString(),status:"NO_TRADE",execution:false,automatedOrderSubmission:false,agents:roles.map(role=>({role,status:"NOT_RUN",reason:"Research launch started; awaiting provider collection."})),vetoReasons:["Research collection is in progress."],traceDurable:true};
  await env.NORTHSTAR_DB.prepare("INSERT INTO research_council_runs(request_id,input_sha256,symbol,status,result_json) VALUES(?,?,?,?,?) ON CONFLICT(request_id) DO UPDATE SET input_sha256=excluded.input_sha256,status='NO_TRADE',result_json=excluded.result_json WHERE research_council_runs.symbol=excluded.symbol").bind(requestId,attemptHash,ticker,"NO_TRADE",JSON.stringify(initial)).run();
  // Refresh the read-only broker snapshot before using portfolio values.
  const syncResponse=await syncPaperAccount({request:new Request(origin+"/api/paper/sync",{method:"POST",headers:{Authorization:"Bearer "+String(env?.NORTHSTAR_OPERATOR_TOKEN||""), "X-Request-ID":requestId}}),env});
  if(!syncResponse.ok)throw new Error("Read-only Alpaca Paper sync failed; research collection is blocked.");
  const syncData=await syncResponse.json();
  if(syncData?.ok!==true||syncData?.synced!==true)throw new Error("Read-only Alpaca Paper sync returned an incomplete result.");
  const portfolio=await portfolioSnapshot(env,syncData);
  // Record the collection start for date-bounded provider requests. The final as-of
  // timestamp is set after all providers return, so a fresh quote retrieved during
  // collection is not incorrectly marked as occurring after the research snapshot.
  const collectionStartedAt=new Date().toISOString();
  // Core market inputs are required. SEC companyfacts and the broad earnings
  // calendar are enrichment sources: either can exceed the Pages request budget.
  // Their failure must not prevent the evidence-first specialists from running.
  const [quote,history,news,sec]=await Promise.all([
   endpoint(getQuote,origin,"/api/quote?ticker="+encodeURIComponent(ticker),env),
   resolveHistory(origin,ticker,collectionStartedAt,env),
   resolveNews(origin,ticker,env),
   fetchSecCompanyFacts(ticker,collectionStartedAt).catch(error=>({cik:null,observations:[],warning:String(error?.message||"SEC companyfacts unavailable").slice(0,180)}))
  ]);
  let fundamentals={available:false,provider:"SEC EDGAR",warning:"SEC companyfacts is the primary reported-fundamentals source; FMP is not queried unless SEC coverage is unavailable."};
  // FMP is now a dormant secondary fundamentals fallback. Do not spend requests
  // when SEC already supplied evidence; do not block the Council if FMP fails.
  if(!sec.observations.length&&env?.FMP_API_KEY){
   try{fundamentals=await endpoint(getFundamentals,origin,"/api/fmp-fundamentals?ticker="+encodeURIComponent(ticker),env);}
   catch(error){fundamentals={available:false,provider:"Financial Modeling Prep",warning:String(error?.message||"FMP fallback unavailable").slice(0,180)};}
  }
  // Sentiment is derived by the Council from the already collected timestamped news evidence.
  // Avoid a second Finnhub request or treating retrieval time as sentiment observation time.
  const sentiment={observations:[],warning:"Provider-reported or social sentiment is unavailable; AI-derived news sentiment requires three unique fresh headlines."};
  // Earnings calendar remains optional; SEC EDGAR is the primary fundamentals source.
  const earnings={ticker,provider:"earnings calendar not queried",fetchedAt:new Date().toISOString(),
   events:[],found:false,verified:false,warning:"Earnings calendar was not queried in this bounded research run; confirm dates with issuer investor relations."};
  const asOf=new Date().toISOString();
  if(!quote?.price||!quote?.quoteTime)throw new Error("A timestamped market quote is required; latest quote is missing or undated.");
  if(!history?.available||!Array.isArray(history.prices)||history.prices.length<20)throw new Error("At least 20 valid daily price bars are required to start research; the Technical Analyst independently requires 60.");
  const validFundamentals=fundamentals?.available===true;
  const context=await buildResearchCouncilContext({ticker,asOf,quote:{ticker,price:Number(quote.price),currency:quote.currency,exchange:quote.exchange,previousClose:finite(quote.previousClose),change:finite(quote.change),changePercent:finite(quote.changePercent),quoteTime:quote.quoteTime,marketState:quote.marketState,delayedOrRealtime:quote.delayedOrRealtime,interval:quote.interval,source:quote.source},
   history:{data:history.prices,interval:"1d",currency:"USD",source:history.provider,fetchedAt:history.retrievedAt,dataQuality:history.coverage},
   secObservations:sec.observations,sentimentObservations:sentiment.observations||[],fmpFundamentals:{available:validFundamentals,provider:fundamentals.provider||"SEC EDGAR",retrievedAt:fundamentals.retrievedAt||null,latest:validFundamentals?fundamentals.latest:null,history:validFundamentals?fundamentals.history||{}:{}},
   news:{items:Array.isArray(news.items)?news.items:[],warning:news.warning||null},
   earnings:{events:Array.isArray(earnings.events)?earnings.events.map(e=>({...e,date:e.reportDate||e.date||null})):[],found:earnings.found===true,verified:earnings.verified===true,throughDate:earnings.throughDate||null,provider:earnings.provider,fetchedAt:earnings.fetchedAt||earnings.fetchedAt,warning:earnings.warning||null},
   portfolio});
  if(context.facts.length+context.evidence.length<3)throw new Error("Collected research evidence is insufficient.");
  const inputHash=await sha256(stable({ticker,asOf,context}));
  const existing=await env.NORTHSTAR_DB.prepare("SELECT input_sha256,result_json,created_at FROM research_council_runs WHERE request_id=?").bind(requestId).first();
  if(existing?.input_sha256===inputHash)return reply({ok:true,replayed:true,traceDurable:true,result:JSON.parse(existing.result_json),createdAt:existing.created_at,execution:false,automatedOrderSubmission:false});
  if(existing && existing.input_sha256!==attemptHash)return reply({ok:false,error:"requestId already used for a different research snapshot."},409);
  const workers=await createResearchCouncilWorkers(env);
  const result=await runResearchCouncil({requestId,context,workers});
  const storedResult={...result,collection:{sources:["Alpaca/Finnhub/Nasdaq timestamped quote adapter",history.provider||"Historical price provider",...(validFundamentals?["FMP secondary fundamentals fallback"]:[]),...(sec.observations.length?["SEC EDGAR companyfacts (primary fundamentals)"]:[]),...(sentiment.observations?.length?[(sentiment.provider||"Provider")+" news sentiment"]:[]),...(Array.isArray(news.items)&&news.items.length?[news.provider||"news discovery"]:[]),"Alpaca Paper account and reconciled ledger"],providerWarnings:[history.priceWarning,history.fallbackReason,fundamentals.warning,sec.warning,sentiment.warning,news.warning,news.fallbackReason].filter(Boolean),factCount:context.facts.length,evidenceCount:context.evidence.length,portfolioSource:portfolio.source},execution:false,automatedOrderSubmission:false};
  const write=await env.NORTHSTAR_DB.prepare("UPDATE research_council_runs SET input_sha256=?,status=?,result_json=? WHERE request_id=? AND symbol=?").bind(inputHash,result.status,JSON.stringify(storedResult),requestId,ticker).run();
  const stored=await env.NORTHSTAR_DB.prepare("SELECT input_sha256,result_json,created_at FROM research_council_runs WHERE request_id=?").bind(requestId).first();
  if(!stored||stored.input_sha256!==inputHash)return reply({ok:false,error:"Durable Council write could not be confirmed."},503);
  return reply({ok:true,replayed:!(Number(write?.meta?.changes)>0),traceDurable:true,createdAt:stored.created_at,result:JSON.parse(stored.result_json),execution:false,automatedOrderSubmission:false});
 }catch(error){
  const message=String(error?.message||"Research collection failed safely.").slice(0,300);
  try{
   const roles=["market_scanner","technical_analyst","fundamental_analyst","news_analyst","sentiment_analyst","bull_researcher","bear_researcher","portfolio_analyst","risk_committee"];
   const failed={version:"1.0.2",requestId,ticker,asOf:new Date().toISOString(),status:"NO_TRADE",execution:false,automatedOrderSubmission:false,agents:roles.map(role=>({role,status:"NOT_RUN",reason:"Collection stopped before specialist execution: "+message})),vetoReasons:["Research collection failed before agents could run: "+message],traceDurable:true};
   await env.NORTHSTAR_DB.prepare("UPDATE research_council_runs SET status='NO_TRADE',result_json=? WHERE request_id=?").bind(JSON.stringify(failed),requestId).run();
  }catch{}
  return reply({ok:false,execution:false,traceDurable:true,error:message},503);
 }
}
