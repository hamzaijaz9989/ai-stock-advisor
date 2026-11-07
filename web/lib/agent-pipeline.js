// Deterministic, evidence-gated Northstar agent pipeline.
// This is a research and paper-review orchestrator only: it never submits orders.
const finite = v => v !== null && v !== undefined && v !== "" && Number.isFinite(Number(v));
const isoMs = v => { const n=Date.parse(v); return Number.isFinite(n)?n:null; };
const round = n => Number(n.toFixed(4));
const reject = (stage, reason, events) => ({
  status:"REJECTED", decision:"NO_TRADE", execution:false, failedStage:stage,
  reason, sizing:null, events
});

/**
 * candidate contract:
 * {symbol, quote:{price,bid,ask,timestamp,source}, liquidity:{avgDollarVolumeUsd},
 *  evidence:[{type,source,publishedAt,summary}], thesis, risks:[string],
 *  stopPrice, account:{equityUsd}, limits:{riskFraction,maxPositionFraction},
 *  now?}
 */
export function runAgentPipeline(candidate) {
  const events=[];
  const log=(agent,status,reason,details={})=>events.push({agent,status,reason,details});
  if(!candidate || typeof candidate!=="object") return reject("SCANNER","INVALID_CANDIDATE",events);
  const symbol=String(candidate.symbol||"").trim().toUpperCase();
  if(!/^[A-Z][A-Z0-9.]{0,9}$/.test(symbol)) return reject("SCANNER","INVALID_SYMBOL",events);
  const now=isoMs(candidate.now||new Date().toISOString());
  const q=candidate.quote||{};
  const price=Number(q.price), bid=Number(q.bid), ask=Number(q.ask), quoteAt=isoMs(q.timestamp);
  if(now===null || ![price,bid,ask].every(Number.isFinite) || price<=0 || bid<=0 || ask<bid || quoteAt===null) {
    log("SCANNER","BLOCKED","INVALID_OR_MISSING_QUOTE");
    return reject("SCANNER","INVALID_OR_MISSING_QUOTE",events);
  }
  const quoteAgeMs=now-quoteAt;
  if(quoteAgeMs<0 || quoteAgeMs>60_000) {
    log("SCANNER","BLOCKED","STALE_OR_FUTURE_QUOTE",{quoteAgeMs});
    return reject("SCANNER","STALE_OR_FUTURE_QUOTE",events);
  }
  const spreadPct=((ask-bid)/((ask+bid)/2))*100;
  const dollarVolume=Number(candidate.liquidity?.avgDollarVolumeUsd);
  if(!Number.isFinite(dollarVolume)||dollarVolume<5_000_000) {
    log("SCANNER","BLOCKED","INSUFFICIENT_OR_UNKNOWN_DOLLAR_LIQUIDITY",{dollarVolumeUsd:finite(dollarVolume)?dollarVolume:null});
    return reject("SCANNER","INSUFFICIENT_OR_UNKNOWN_DOLLAR_LIQUIDITY",events);
  }
  if(spreadPct>1) {
    log("SCANNER","BLOCKED","SPREAD_TOO_WIDE",{spreadPct:round(spreadPct)});
    return reject("SCANNER","SPREAD_TOO_WIDE",events);
  }
  log("SCANNER","PASSED","QUOTE_FRESH_AND_LIQUID",{quoteAgeMs,spreadPct:round(spreadPct),avgDollarVolumeUsd:dollarVolume});

  const evidence=Array.isArray(candidate.evidence)?candidate.evidence:[];
  const recent=evidence.filter(e=>{
    const t=isoMs(e?.publishedAt);
    return typeof e?.source==="string" && e.source.trim().length>2 &&
      typeof e?.summary==="string" && e.summary.trim().length>=20 &&
      t!==null && t<=now && now-t<=7*86400_000;
  });
  const independentSources=new Set(recent.map(e=>e.source.trim().toLowerCase()));
  if(typeof candidate.thesis!=="string" || candidate.thesis.trim().length<40 || independentSources.size<2) {
    log("RESEARCH","BLOCKED","INSUFFICIENT_INDEPENDENT_RECENT_EVIDENCE",{validEvidence:recent.length,independentSources:independentSources.size});
    return reject("RESEARCH","INSUFFICIENT_INDEPENDENT_RECENT_EVIDENCE",events);
  }
  const risks=Array.isArray(candidate.risks)?candidate.risks.filter(x=>typeof x==="string"&&x.trim()):[];
  if(risks.length===0) {
    log("RESEARCH","BLOCKED","NO_EXPLICIT_RISK_ASSESSMENT");
    return reject("RESEARCH","NO_EXPLICIT_RISK_ASSESSMENT",events);
  }
  log("RESEARCH","PASSED","THESIS_AND_INDEPENDENT_EVIDENCE_PRESENT",{evidenceCount:recent.length,sourceCount:independentSources.size,riskFactors:risks.length});

  const stop=Number(candidate.stopPrice);
  const equity=Number(candidate.account?.equityUsd);
  const riskFraction=Number(candidate.limits?.riskFraction);
  const maxPositionFraction=Number(candidate.limits?.maxPositionFraction);
  if(![stop,equity,riskFraction,maxPositionFraction].every(Number.isFinite) ||
     stop<=0 || stop>=price || equity<=0 || riskFraction<=0 || riskFraction>0.01 ||
     maxPositionFraction<=0 || maxPositionFraction>0.25) {
    log("RISK_AUDITOR","BLOCKED","INVALID_STOP_OR_RISK_POLICY");
    return reject("RISK_AUDITOR","INVALID_STOP_OR_RISK_POLICY",events);
  }
  const riskPerShare=price-stop;
  const riskBudget=equity*riskFraction;
  const sharesByRisk=Math.floor(riskBudget/riskPerShare);
  const sharesByExposure=Math.floor((equity*maxPositionFraction)/price);
  const shares=Math.min(sharesByRisk,sharesByExposure);
  if(shares<1) {
    log("RISK_AUDITOR","BLOCKED","NO_WHOLE_SHARE_FITS_RISK_LIMITS",{riskBudgetUsd:round(riskBudget),riskPerShareUsd:round(riskPerShare)});
    return reject("RISK_AUDITOR","NO_WHOLE_SHARE_FITS_RISK_LIMITS",events);
  }
  const sizing={shares,referenceEntryPriceUsd:round(price),stopPriceUsd:round(stop),
    maxLossAtStopUsd:round(shares*riskPerShare),notionalUsd:round(shares*price),
    riskBudgetUsd:round(riskBudget),maxPositionValueUsd:round(equity*maxPositionFraction)};
  log("SIZER","PASSED","POSITION_SIZED_WITHIN_CONFIGURED_LIMITS",sizing);

  log("PAPER_EXECUTOR","DISABLED","PAPER_EXECUTION_NOT_CONNECTED_OR_AUTHORIZED");
  log("LOGGER","RECORDED","DECISION_TRACE_CREATED",{eventCount:events.length+1});
  return {
    status:"PAPER_REVIEW_REQUIRED", decision:"WATCHLIST_CANDIDATE", symbol,
    execution:false, automatedOrderSubmission:false, quote:{price,bid,ask,source:q.source||null,timestamp:q.timestamp,ageMs:quoteAgeMs,spreadPct:round(spreadPct)},
    evidence:{count:recent.length,independentSourceCount:independentSources.size,risks},
    sizing, events
  };
}
