import {runBlockBootstrap} from "../../lib/time-machine.js";
import {requestFmpJson} from "../../lib/fmp-budget.js";
const ALLOWED = /^[A-Z0-9.^=-]{1,12}$/;
const COST_PER_SIDE = 5; // basis points; assumed cost, not broker-specific quote
const FAST = 50;
const SLOW = 200;
const MAX_BARS = 1400;

const HISTORY_DAYS = 5 * 366;

function dateString(date) {
  return date.toISOString().slice(0,10);
}

function normalizeRows(raw, source) {
  if (!Array.isArray(raw)) throw new Error(source + " returned an unexpected response shape");
  const byDate = new Map();
  for (const item of raw) {
    const date = String(item?.date || "").slice(0,10);
    const open = Number(item?.open);
    const high = Number(item?.high);
    const low = Number(item?.low);
    const close = Number(item?.close);
    const adjusted = Number(item?.adjClose ?? item?.adj_close ?? item?.adjustedClose ?? item?.adjusted_close ?? item?.close);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) continue;
    if (![open,high,low,close,adjusted].every(v=>Number.isFinite(v)&&v>0)) continue;
    const adjustmentFactor=adjusted/close;
    byDate.set(date,{date,open,adjustedOpen:open*adjustmentFactor,high,low,close,adjustedClose:adjusted});
  }
  const rows=[...byDate.values()].sort((a,b)=>a.date.localeCompare(b.date));
  if(rows.length < SLOW + 100) throw new Error(source + " returned only " + rows.length + " valid daily observations; at least " + (SLOW+100) + " are required.");
  return rows.length>MAX_BARS?rows.slice(-MAX_BARS):rows;
}

export async function fetchFmpSeries(ticker, apiKey, {db, verifiedDailyLimit, fetchImpl=fetch, now=Date.now()}={}) {
  if(typeof apiKey !== "string" || apiKey.trim().length === 0) throw new Error("FMP_API_KEY2/FMP_API_KEY binding is unavailable. Confirm the Production secret is saved, then redeploy.");
  const to = new Date(now);
  const from = new Date(to.getTime() - HISTORY_DAYS*86400000);
  const query=new URLSearchParams({symbol:ticker,from:dateString(from),to:dateString(to)});
  const payload=await requestFmpJson({
    db,service:"pages",path:"historical-price-eod/full?"+query.toString(),apiKey,fetchImpl,now,verifiedDailyLimit,
    cacheTtlMs:6*60*60*1000,timeoutMs:15000
  });
  return normalizeRows(payload,"FMP");
}

async function fetchYahooSeries(ticker) {
  const url="https://query1.finance.yahoo.com/v8/finance/chart/"+encodeURIComponent(ticker)+"?range=5y&interval=1d&events=div%2Csplits";
  const response=await fetch(url,{headers:{"Accept":"application/json"},signal:AbortSignal.timeout(12000)});
  if(!response.ok) throw new Error("Yahoo fallback HTTP "+response.status);
  const payload=await response.json();
  const result=payload?.chart?.result?.[0];
  if(!result||!Array.isArray(result.timestamp)) throw new Error("Yahoo fallback returned no historical series");
  const q=result.indicators?.quote?.[0]||{};
  const adj=result.indicators?.adjclose?.[0]?.adjclose||[];
  const rows=[];
  for(let i=0;i<result.timestamp.length;i++) {
    const row={date:new Date(result.timestamp[i]*1000).toISOString().slice(0,10),open:q.open?.[i],high:q.high?.[i],low:q.low?.[i],close:q.close?.[i],adjustedClose:adj[i]};
    if([row.open,row.high,row.low,row.close,row.adjustedClose].every(v=>typeof v==="number"&&Number.isFinite(v)&&v>0)) {
      row.adjustedOpen=row.open*(row.adjustedClose/row.close);
      rows.push(row);
    }
  }
  if(rows.length<SLOW+100) throw new Error("Yahoo fallback returned insufficient daily history");
  return rows.slice(-MAX_BARS);
}

async function fetchSeries(ticker, env) {
  const errors=[];
  try {
    const rows=await fetchFmpSeries(ticker,(env?.FMP_API_KEY2 || env?.FMP_API_KEY),{db:env?.NORTHSTAR_DB,verifiedDailyLimit:Number(env?.FMP_VERIFIED_DAILY_LIMIT)});
    return {rows,source:"Financial Modeling Prep (FMP)",adjustment:"FMP adjClose when supplied; otherwise split-adjusted close"};
  } catch(error) {
    errors.push(String(error?.message||error));
  }
  try {
    const rows=await fetchYahooSeries(ticker);
    return {rows,source:"Yahoo Finance fallback",adjustment:"Yahoo adjusted close",fallbackReason:errors[0]};
  } catch(error) {
    errors.push(String(error?.message||error));
  }
  throw new Error("Historical data unavailable. FMP: "+errors[0]+"; fallback: "+errors[1]);
}

function sma(rows, endIndex, period) {
  if (endIndex + 1 < period) return null;
  let total = 0;
  for (let i=endIndex-period+1; i<=endIndex; i++) total += rows[i].adjustedClose;
  return total / period;
}
function statsFromReturns(returns) {
  if (!returns.length) return {totalReturnPercent:null,annualizedReturnPercent:null,maxDrawdownPercent:null,volatilityPercent:null};
  let equity=1, peak=1, maxDrawdown=0;
  const daily=[];
  for (const r of returns) { equity*=1+r; peak=Math.max(peak,equity); maxDrawdown=Math.min(maxDrawdown,equity/peak-1); daily.push(r); }
  const years=daily.length/252;
  const mean=daily.reduce((a,b)=>a+b,0)/daily.length;
  const variance=daily.reduce((sum,r)=>sum+(r-mean)**2,0)/(daily.length-1||1);
  return {
    totalReturnPercent:(equity-1)*100,
    annualizedReturnPercent:(Math.pow(equity,1/years)-1)*100,
    maxDrawdownPercent:maxDrawdown*100,
    volatilityPercent:Math.sqrt(variance*252)*100
  };
}
export function evaluate(rows) {
  const strategyDaily=[], trades=[], benchmark=[];
  const cost=COST_PER_SIDE/10000;
  let invested=false, entryFill=null, entryDate=null, entryIndex=null;
  let equity=1, peak=1, maxDrawdown=0;
  // Each session is marked from prior adjusted close to today's adjusted open,
  // then (only while invested after the open) from today's adjusted open to close.
  // Signals are calculated using yesterday's close and execute at today's open.
  for(let i=1;i<rows.length;i++) {
    const prior=rows[i-1], current=rows[i];
    let dailyReturn=0;
    const signalIndex=i-1;
    if(signalIndex>=SLOW) {
      const pf=sma(rows,signalIndex-1,FAST), ps=sma(rows,signalIndex-1,SLOW);
      const f=sma(rows,signalIndex,FAST), sl=sma(rows,signalIndex,SLOW);
      const valid=[pf,ps,f,sl].every(Number.isFinite);
      const crossUp=valid&&pf<=ps&&f>sl;
      const crossDown=valid&&pf>=ps&&f<sl;
      if(!invested&&crossUp) {
        // Buy at adjusted next-session open; do not credit the overnight gap.
        entryFill=current.adjustedOpen*(1+cost);
        entryDate=current.date;
        entryIndex=i;
        invested=true;
        dailyReturn=(current.adjustedClose/current.adjustedOpen)/(1+cost)-1;
      } else if(invested&&crossDown) {
        // Existing position earns only the close-to-open gap, then exits at open.
        dailyReturn=(current.adjustedOpen/prior.adjustedClose)*(1-cost)-1;
        const exitFill=current.adjustedOpen*(1-cost);
        const ret=exitFill/entryFill-1;
        trades.push({
          entryDate,exitDate:current.date,entryFillPrice:entryFill,exitFillPrice:exitFill,
          exitReason:"SMA_CROSS_DOWN",netReturnPercent:ret*100,
          holdingSessions:i-entryIndex,status:"closed"
        });
        benchmark.push(current.adjustedOpen/rows[entryIndex-1].adjustedClose-1);
        invested=false; entryFill=null; entryDate=null; entryIndex=null;
      } else if(invested) {
        dailyReturn+=current.adjustedClose/prior.adjustedClose-1;
      }
    } else if(invested) {
      dailyReturn+=current.adjustedClose/prior.adjustedClose-1;
    }
    if(i===rows.length-1&&invested) dailyReturn=(1+dailyReturn)*(1-cost)-1; // mark open position net of estimated liquidation cost
    strategyDaily.push(dailyReturn);
    equity*=1+dailyReturn;
    peak=Math.max(peak,equity);
    maxDrawdown=Math.min(maxDrawdown,equity/peak-1);
  }
  if(invested) {
    const last=rows[rows.length-1];
    const exitMark=last.adjustedClose*(1-cost);
    const ret=exitMark/entryFill-1;
    trades.push({
      entryDate,exitDate:last.date,entryFillPrice:entryFill,exitFillPrice:exitMark,
      exitReason:"END_OF_TEST",netReturnPercent:ret*100,
      holdingSessions:rows.length-entryIndex,status:"open_at_end"
    });
    benchmark.push(last.adjustedClose/rows[entryIndex-1].adjustedClose-1);
  }
  const strategy=statsFromReturns(strategyDaily);
  const benchmarkAll=statsFromReturns(rows.slice(1).map((r,i)=>r.adjustedClose/rows[i].adjustedClose-1));
  const completed=trades.filter(t=>t.status==="closed");
  const monteCarlo=runBlockBootstrap(completed.map(t=>t.netReturnPercent));
  const wins=completed.filter(t=>t.netReturnPercent>0).length;
  const grossWins=completed.filter(t=>t.netReturnPercent>0).reduce((s,t)=>s+t.netReturnPercent,0);
  const grossLosses=Math.abs(completed.filter(t=>t.netReturnPercent<=0).reduce((s,t)=>s+t.netReturnPercent,0));
  // Reconcile the daily equity curve against the same sequential trade ledger.
  const ledgerEquity=trades.reduce((value,t)=>value*(1+t.netReturnPercent/100),1);
  const reconciliationDifferencePercent=(equity-ledgerEquity)*100;
  return {
    rules:"Long-only 50-day / 200-day SMA crossover; signal after adjusted close, execute at next session adjusted open; no leverage, no shorting.",
    costAssumption:"5 basis points per side (10 bps round trip), fixed assumption; excludes tax and may understate spreads/market impact.",
    strategy,benchmarkBuyHold:benchmarkAll,
    ledgerTotalReturnPercent:(ledgerEquity-1)*100,
    reconciliationDifferencePercent,
    reconciliationStatus:Math.abs(reconciliationDifferencePercent)<0.000001?"RECONCILED":"MISMATCH",
    trades:trades.length,completedTrades:completed.length,openAtEnd:trades.length-completed.length,
    monteCarlo,
    winRatePercent:completed.length?wins/completed.length*100:null,
    profitFactor:grossLosses>0?grossWins/grossLosses:(grossWins>0?null:0),
    averageTradeReturnPercent:completed.length?completed.reduce((s,t)=>s+t.netReturnPercent,0)/completed.length:null,
    averageBenchmarkDuringTradesPercent:benchmark.length?benchmark.reduce((a,b)=>a+b,0)/benchmark.length*100:null,
    tradeLog:trades.slice(-30)
  };
}

export function evaluateWalkForward(rows) {
  // Fixed, pre-declared rules; folds are chronological and each test window is six months.
  // SMA values may use earlier history, but each fold's reported return only uses its test window.
  const warmup=SLOW+1, testSessions=126, folds=[];
  const cost=COST_PER_SIDE/10000;
  for(let start=warmup;start+testSessions<rows.length;start+=testSessions) {
    const end=Math.min(rows.length-1,start+testSessions-1);
    let invested=false, equity=1, peak=1, maxDrawdown=0;
    const dailyReturns=[];
    let entries=0, exits=0;
    for(let i=start;i<=end;i++) {
      const prior=rows[i-1], current=rows[i];
      let dailyReturn=0;
      const signalIndex=i-1;
      const pf=sma(rows,signalIndex-1,FAST), ps=sma(rows,signalIndex-1,SLOW);
      const f=sma(rows,signalIndex,FAST), sl=sma(rows,signalIndex,SLOW);
      const valid=[pf,ps,f,sl].every(Number.isFinite);
      const up=valid&&pf<=ps&&f>sl;
      const down=valid&&pf>=ps&&f<sl;
      // Signals are known after the prior close and execute at this session's adjusted open.
      if(!invested&&up) {
        invested=true; entries++;
        dailyReturn=(current.adjustedClose/current.adjustedOpen)/(1+cost)-1;
      } else if(invested&&down) {
        // A held position earns the overnight gap, then exits at the open with exit cost.
        invested=false; exits++;
        dailyReturn=(current.adjustedOpen/prior.adjustedClose)*(1-cost)-1;
      } else if(invested) {
        dailyReturn=current.adjustedClose/prior.adjustedClose-1;
      }
      // Mark any position still open at the fold boundary net of estimated liquidation cost.
      if(i===end&&invested) dailyReturn=(1+dailyReturn)*(1-cost)-1;
      dailyReturns.push(dailyReturn);
      equity*=1+dailyReturn;
      peak=Math.max(peak,equity);
      maxDrawdown=Math.min(maxDrawdown,equity/peak-1);
    }
    const avg=dailyReturns.reduce((a,b)=>a+b,0)/dailyReturns.length;
    const variance=dailyReturns.reduce((sum,r)=>sum+(r-avg)**2,0)/(dailyReturns.length-1||1);
    folds.push({
      testStart:rows[start].date,testEnd:rows[end].date,observations:end-start+1,
      returnPercent:(equity-1)*100,
      annualizedReturnPercent:(Math.pow(equity,252/dailyReturns.length)-1)*100,
      maxDrawdownPercent:maxDrawdown*100,
      volatilityPercent:Math.sqrt(variance*252)*100,
      entries,exits,openAtEnd:invested?1:0
    });
  }
  const testReturns=folds.map(f=>f.returnPercent);
  return {
    methodology:"Expanding historical warm-up with non-overlapping six-month chronological test windows; fixed 50/200-day rules; signals after prior adjusted close and execution at current adjusted open; entry/exit costs compounded; open positions marked net of estimated liquidation cost at fold end.",
    folds,
    positiveFolds:folds.filter(f=>f.returnPercent>0).length,
    totalFolds:folds.length,
    medianFoldReturnPercent:folds.length?[...testReturns].sort((a,b)=>a-b)[Math.floor((testReturns.length-1)/2)]:null,
    warning:"These folds are chronological diagnostics on current provider history, not a fully point-in-time backtest. Corporate actions, historical universe, survivorship and exact next-open portfolio equity are not independently reconstructed."
  };
}

export async function onRequestGet({request,env}) {
  const url=new URL(request.url);
  const ticker=(url.searchParams.get("ticker")||"").trim().toUpperCase();
  if(!ALLOWED.test(ticker)) return Response.json({error:"Enter a valid US stock ticker."},{status:400});
  try {
    const [primary,benchmarkData]=await Promise.all([
      fetchSeries(ticker,env),
      ticker==="SPY"?Promise.resolve(null):fetchSeries("SPY",env)
    ]);
    const rows=primary.rows;
    const spyRows=ticker==="SPY"?rows:benchmarkData.rows;
    const report=evaluate(rows);
    const walkForward=evaluateWalkForward(rows);
    const commonStart=ticker==="SPY"?rows[0].date:(rows[0].date>spyRows[0].date?rows[0].date:spyRows[0].date);
    const commonEnd=ticker==="SPY"?rows[rows.length-1].date:(rows[rows.length-1].date<spyRows[spyRows.length-1].date?rows[rows.length-1].date:spyRows[spyRows.length-1].date);
    const alignedSpy=spyRows.filter(row=>row.date>=commonStart&&row.date<=commonEnd);
    const benchmark=alignedSpy.length>1?statsFromReturns(alignedSpy.slice(1).map((r,i)=>r.adjustedClose/alignedSpy[i].adjustedClose-1)):null;
    const fallbackUsed=primary.source!=="Financial Modeling Prep (FMP)"||(benchmarkData&&benchmarkData.source!=="Financial Modeling Prep (FMP)");
    return Response.json({
      ticker,source:primary.source,benchmarkSource:ticker==="SPY"?primary.source:benchmarkData.source,
      sourceStatus:fallbackUsed?"FALLBACK_USED":"PRIMARY_PROVIDER",
      adjustmentMethod:primary.adjustment,
      startDate:rows[0].date,endDate:rows[rows.length-1].date,
      benchmarkTicker:"SPY",benchmarkStartDate:alignedSpy[0]?.date||null,benchmarkEndDate:alignedSpy[alignedSpy.length-1]?.date||null,
      observations:rows.length,fastSma:FAST,slowSma:SLOW,slippageAndCostBpsPerSide:COST_PER_SIDE,
      strategy:report.strategy,spyBuyHold:benchmark,
      ledgerTotalReturnPercent:report.ledgerTotalReturnPercent,
      reconciliationDifferencePercent:report.reconciliationDifferencePercent,
      reconciliationStatus:report.reconciliationStatus,
      trades:report.trades,completedTrades:report.completedTrades,openAtEnd:report.openAtEnd,
      winRatePercent:report.winRatePercent,profitFactor:report.profitFactor,
      averageTradeReturnPercent:report.averageTradeReturnPercent,
      averageBenchmarkDuringTradesPercent:report.averageBenchmarkDuringTradesPercent,
      tradeLog:report.tradeLog,monteCarlo:report.monteCarlo,walkForward,
      warning:"EXPERIMENTAL TECHNICAL STRATEGY ONLY — not the live recommendation engine. Uses current provider history, not point-in-time fundamentals or a delisted-stock universe. Corporate actions and exact fills are not independently reconstructed. This is not an out-of-sample validated signal and must not enable BUY or execution."
    },{headers:{"Cache-Control":"public, max-age=900, s-maxage=900","X-Content-Type-Options":"nosniff"}});
  } catch(error) {
    return Response.json({ticker,error:String(error?.message||"Backtest unavailable"),provider:"FMP primary with Yahoo fallback",warning:"No synthetic prices or performance results have been substituted."},{status:503,headers:{"Cache-Control":"no-store","X-Content-Type-Options":"nosniff"}});
  }
}
