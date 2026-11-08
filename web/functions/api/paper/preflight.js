// Read-only, authenticated paper-trade preflight. This route NEVER submits orders.
import {evaluatePortfolioRisk,deriveSnapshotRiskMetrics} from "../../../lib/paper-order-guards.js";
const H = {"Cache-Control":"no-store","X-Content-Type-Options":"nosniff","Referrer-Policy":"no-referrer"};
const fail = (error,status=400,extra={}) => Response.json({ok:false,execution:false,error,...extra},{status,headers:H});
function safeEqual(a,b) {
  if(typeof a!=="string"||typeof b!=="string"||!a||!b) return false;
  let diff=a.length^b.length;
  for(let i=0;i<Math.max(a.length,b.length);i++) diff|=(a.charCodeAt(i)||0)^(b.charCodeAt(i)||0);
  return diff===0;
}
function authorized(request,env) {
  const token=env?.NORTHSTAR_OPERATOR_TOKEN;
  return !!token && safeEqual(request.headers.get("Authorization")||"","Bearer "+token);
}
async function alpaca(path,key,secret) {
  const response=await fetch("https://paper-api.alpaca.markets"+path,{
    headers:{"APCA-API-KEY-ID":key,"APCA-API-SECRET-KEY":secret,"Accept":"application/json"},
    signal:AbortSignal.timeout(8000)
  });
  if(!response.ok) throw new Error("BROKER_HTTP_"+response.status);
  return response.json();
}
function close(a,b,tolerance=0.0001) {
  return Math.abs(Number(a)-Number(b))<=tolerance;
}
export async function onRequestPost({request,env}) {
  if(!authorized(request,env)) return fail("Unauthorized.",401);
  const db=env?.NORTHSTAR_DB;
  const key=env?.ALPACA_API_KEY_ID, secret=env?.ALPACA_API_SECRET_KEY;
  if(!db||!key||!secret) return fail("Paper ledger or Alpaca Paper credentials unavailable; preflight blocked.",503);
  let body;
  try { body=await request.json(); } catch { return fail("Send valid JSON."); }
  const symbol=String(body?.symbol||"").trim().toUpperCase();
  const stop=Number(body?.stopPrice);
  if(!/^[A-Z][A-Z0-9.-]{0,9}$/.test(symbol)) return fail("Invalid ticker symbol.");
  if(!Number.isFinite(stop)||stop<=0) return fail("stopPrice must be a positive number.");
  let control,ledgerPositions,equitySnapshots;
  try {
    control=await db.prepare("SELECT enabled,mode,kill_switch,max_portfolio_usd,default_risk_fraction,max_risk_fraction,max_position_fraction FROM execution_control WHERE id=1").first();
    ledgerPositions=await db.prepare("SELECT symbol,qty,avg_entry_price,market_value FROM paper_positions ORDER BY symbol").all();
    equitySnapshots=await db.prepare("SELECT captured_at,equity_usd FROM paper_equity_snapshots ORDER BY captured_at DESC LIMIT 1000").all();
  } catch { return fail("Could not verify ledger policy or positions; fail-closed.",503); }
  if(!control||control.mode!=="paper"||Number(control.enabled)!==0||Number(control.kill_switch)!==1) return fail("Paper execution controls are not in the required disabled/kill-switched state.",503);
  let account,brokerPositions,quote;
  try {
    [account,brokerPositions,quote]=await Promise.all([
      alpaca("/v2/account",key,secret),
      alpaca("/v2/positions",key,secret),
      alpaca("/v2/stocks/"+encodeURIComponent(symbol)+"/quotes/latest?feed=iex",key,secret)
    ]);
  } catch(error) {
    const code=String(error?.message||"");
    return fail(code.startsWith("BROKER_HTTP_")?"Alpaca Paper data request failed ("+code.slice(12)+"); no preflight approval.":"Alpaca Paper request timed out or failed; no preflight approval.",503);
  }
  if(account.status!=="ACTIVE"||account.trading_blocked||account.account_blocked) return fail("Alpaca paper account is not active or is blocked.",503);
  const q=quote?.quote;
  const bid=Number(q?.bp),ask=Number(q?.ap),quoteTime=Date.parse(q?.t||"");
  const now=Date.now(),ageMs=now-quoteTime;
  if(!Number.isFinite(bid)||!Number.isFinite(ask)||bid<=0||ask<bid||!Number.isFinite(quoteTime)||ageMs<0||ageMs>60000) return fail("Latest quote is missing, invalid, future-dated, or older than 60 seconds.",503);
  const spread=(ask-bid)/((ask+bid)/2);
  if(spread>0.01) return fail("Bid/ask spread exceeds the 1% preflight limit.",409,{quote:{bid,ask,spreadPct:Number((spread*100).toFixed(3)),ageMs}});
  if(stop>=ask) return fail("For a long-only preflight, stopPrice must be below the current ask.",400);
  const broker=Array.isArray(brokerPositions)?brokerPositions:[];
  const ledger=Array.isArray(ledgerPositions?.results)?ledgerPositions.results:[];
  const normBroker=broker.map(p=>({symbol:String(p.symbol).toUpperCase(),qty:Number(p.qty),avg:Number(p.avg_entry_price)})).sort((a,b)=>a.symbol.localeCompare(b.symbol));
  const normLedger=ledger.map(p=>({symbol:String(p.symbol).toUpperCase(),qty:Number(p.qty),avg:Number(p.avg_entry_price)})).sort((a,b)=>a.symbol.localeCompare(b.symbol));
  if(normBroker.length!==normLedger.length||normBroker.some((p,i)=>p.symbol!==normLedger[i]?.symbol||!close(p.qty,normLedger[i]?.qty)||!close(p.avg,normLedger[i]?.avg,0.01))) {
    return fail("Broker positions and Northstar ledger do not reconcile. Resolve reconciliation before any trade.",409,{brokerPositionCount:normBroker.length,ledgerPositionCount:normLedger.length});
  }
  if(normBroker.some(p=>p.symbol===symbol)) return fail("This symbol already has a broker position. Existing position lifecycle must be handled first.",409);
  const capital=Number(control.max_portfolio_usd);
  const riskFraction=Number(control.default_risk_fraction);
  const maxRisk=Number(control.max_risk_fraction);
  const maxPositionFraction=Number(control.max_position_fraction);
  if(!Number.isFinite(capital)||capital<=0||!Number.isFinite(riskFraction)||riskFraction<=0||riskFraction>maxRisk||!Number.isFinite(maxPositionFraction)||maxPositionFraction<=0) return fail("Risk policy values are invalid; fail-closed.",503);
  const equity=Number(account.equity),buyingPower=Number(account.buying_power);
  if(!Number.isFinite(equity)||equity<=0||!Number.isFinite(buyingPower)||buyingPower<=0) return fail("Broker equity or buying power is unavailable.",503);
  const history=deriveSnapshotRiskMetrics({snapshots:equitySnapshots?.results||[],currentEquity:equity,lastEquity:account.last_equity,virtualAllocationUsd:capital});
  if(!history.ok) return fail("Verified recent equity history is required for daily-loss and drawdown controls; preflight blocked ("+history.reason+").",503);
  if(broker.some(p=>p.market_value===null||p.market_value===undefined||!Number.isFinite(Number(p.market_value)))) return fail("Broker position market values are missing or invalid; risk preflight blocked.",503);
  const normalizedPositions=broker.map(p=>({symbol:String(p.symbol||"").toUpperCase(),market_value:Number(p.market_value)*(capital/equity)}));
  // All portfolio exposure calculations below use the separate virtual-allocation units.
  const currentExposure=normalizedPositions.reduce((sum,p)=>sum+Math.abs(p.market_value),0);
  const portfolioRisk=evaluatePortfolioRisk({account:{status:account.status,trading_blocked:account.trading_blocked,account_blocked:account.account_blocked,equity:capital,buying_power:buyingPower*(capital/equity)},positions:normalizedPositions,limits:{maxPortfolioUsd:capital,maxPositionFraction,maxRiskFraction:maxRisk,maxDailyLossFraction:0.02,maxDrawdownFraction:0.08},dailyLossUsd:history.dailyLossUsd,maxDrawdownUsd:history.maxDrawdownUsd});
  if(!portfolioRisk.ok) return fail("Deterministic portfolio risk committee blocked preflight: "+portfolioRisk.reason,409,{risk:portfolioRisk,history:history.history});
  const riskBudget=capital*riskFraction, perShareRisk=ask-stop;
  const maxPositionUsd=capital*maxPositionFraction;
  const remainingPortfolio=Math.max(0,capital-currentExposure);
  const remainingPosition=Math.max(0,maxPositionUsd);
  const shares=Math.max(0,Math.min(
    Math.floor(riskBudget/perShareRisk),
    Math.floor(remainingPosition/ask),
    Math.floor(remainingPortfolio/ask),
    Math.floor(buyingPower/ask)
  ));
  if(shares<1) return fail("No whole share fits all current risk, exposure and buying-power limits.",409,{riskBudgetUsd:riskBudget,maxPositionUsd,existingExposureUsd:Number(currentExposure.toFixed(2)),buyingPowerUsd:buyingPower});
  return Response.json({
    ok:true,execution:false,status:"PREFLIGHT_PASSED_PREVIEW_ONLY_NOT_AN_ORDER",mode:"paper",symbol,side:"buy",shares,
    quote:{bid,ask,spreadPct:Number((spread*100).toFixed(3)),timestamp:q.t,ageMs},
    stopPrice:stop,estimatedEntryPrice:ask,estimatedNotionalUsd:Number((shares*ask).toFixed(2)),
    plannedStopRiskUsd:Number((shares*perShareRisk).toFixed(2)),riskBudgetUsd:Number(riskBudget.toFixed(2)),
    exposure:{existingUsd:Number(currentExposure.toFixed(2)),afterProposedUsd:Number((currentExposure+shares*ask).toFixed(2)),maxPortfolioUsd:capital,maxPositionUsd},
    broker:{accountStatus:account.status,equityUsd:equity,buyingPowerUsd:buyingPower,positionsReconciled:true},
    risk:{status:portfolioRisk.status,dailyLossUsd:history.dailyLossUsd,maxDrawdownUsd:history.maxDrawdownUsd,history:history.history,virtualAllocationUsd:capital},
    warnings:["Read-only preflight. No order was submitted or stored.","Quote is IEX latest-quote data; this is not a guaranteed execution price.","Prices can move between preflight and any future order submission.","Execution remains disabled and kill switch remains engaged."],
    checkedAt:new Date().toISOString()
  },{headers:H});
}
