// Northstar deterministic evidence-gated research pipeline v2.
// Research and sizing preview only. No broker or database access.
const isoMs = v => { const n = Date.parse(v); return Number.isFinite(n) ? n : null; };
const round = n => Number(n.toFixed(4));
const reject = (stage, reason, events) => ({status:"REJECTED",decision:"NO_TRADE",execution:false,automatedOrderSubmission:false,failedStage:stage,reason,sizing:null,events});
const TYPES = new Set(["SEC_FILING","EARNINGS_RELEASE","REGULATORY_FILING","COMPANY_RELEASE","NEWS_REPORT","ANALYST_RESEARCH","MARKET_DATA"]);
// Publisher IDs are canonical registrable domains, not feed labels or aggregator names.
// A source is accepted only when its article URL belongs to that publisher domain.
const PUBLISHERS = new Set([
  "sec.gov", "reuters.com", "bloomberg.com", "wsj.com", "cnbc.com",
  "marketwatch.com", "apnews.com", "nasdaq.com", "yahoo.com"
]);
function validEvidence(e, now) {
  if (!e || typeof e !== "object") return false;
  const published = isoMs(e.publishedAt);
  let url;
  try { url = new URL(String(e.url || "")); } catch { return false; }
  const publisherId = typeof e.publisherId === "string" ? e.publisherId.trim().toLowerCase() : "";
  const publisherKnown = PUBLISHERS.has(publisherId);
  const host = url.hostname.toLowerCase();
  const hostMatchesPublisher = publisherKnown && (host === publisherId || host.endsWith("." + publisherId));
  return TYPES.has(e.type) && publisherKnown && hostMatchesPublisher &&
    url.protocol === "https:" && !url.username && !url.password &&
    typeof e.summary === "string" && e.summary.trim().length >= 30 &&
    published !== null && published <= now && now-published <= 7*86400000;
}
function independentEvidence(items, now) {
  const accepted = [];
  const seenUrls = new Set();
  const seenSummaries = new Set();
  for (const item of Array.isArray(items) ? items : []) {
    if (!validEvidence(item, now)) continue;
    const url = new URL(item.url);
    url.hash = "";
    for (const key of [...url.searchParams.keys()]) {
      if (/^(utm_|fbclid$|gclid$|mc_cid$|mc_eid$)/i.test(key)) url.searchParams.delete(key);
    }
    const urlKey = url.toString().replace(/\\/$/, "");
    const summaryKey = item.summary.trim().toLowerCase().replace(/\\s+/g, " ");
    if (seenUrls.has(urlKey) || seenSummaries.has(summaryKey)) continue;
    seenUrls.add(urlKey);
    seenSummaries.add(summaryKey);
    accepted.push({...item, publisherId:item.publisherId.trim().toLowerCase(), url:urlKey});
  }
  return accepted;
}
export function runAgentPipeline(c) {
  const events=[]; const log=(agent,status,reason,details={})=>events.push({agent,status,reason,details});
  if (!c || typeof c !== "object") return reject("SCANNER","INVALID_CANDIDATE",events);
  const symbol=String(c.symbol||"").trim().toUpperCase();
  if (!/^[A-Z][A-Z0-9.]{0,9}$/.test(symbol)) return reject("SCANNER","INVALID_SYMBOL",events);
  const now=isoMs(c.now||new Date().toISOString()), q=c.quote||{};
  const price=Number(q.price),bid=Number(q.bid),ask=Number(q.ask),qt=isoMs(q.timestamp);
  if(now===null||![price,bid,ask].every(Number.isFinite)||price<=0||bid<=0||ask<bid||price<bid||price>ask||qt===null||typeof q.source!=="string"||q.source.trim().length<3){
    log("SCANNER","BLOCKED","INVALID_OR_UNSOURCED_QUOTE");return reject("SCANNER","INVALID_OR_UNSOURCED_QUOTE",events);
  }
  const quoteAgeMs=now-qt;
  if(quoteAgeMs<0||quoteAgeMs>60000){log("SCANNER","BLOCKED","STALE_OR_FUTURE_QUOTE",{quoteAgeMs});return reject("SCANNER","STALE_OR_FUTURE_QUOTE",events);}
  const spreadPct=((ask-bid)/((ask+bid)/2))*100, dollarVolume=Number(c.liquidity?.avgDollarVolumeUsd);
  if(!Number.isFinite(dollarVolume)||dollarVolume<5000000){log("SCANNER","BLOCKED","INSUFFICIENT_OR_UNKNOWN_DOLLAR_LIQUIDITY");return reject("SCANNER","INSUFFICIENT_OR_UNKNOWN_DOLLAR_LIQUIDITY",events);}
  if(spreadPct>1){log("SCANNER","BLOCKED","SPREAD_TOO_WIDE",{spreadPct:round(spreadPct)});return reject("SCANNER","SPREAD_TOO_WIDE",events);}
  log("SCANNER","PASSED","QUOTE_FRESH_SOURCED_AND_LIQUID",{quoteAgeMs,spreadPct:round(spreadPct),avgDollarVolumeUsd:dollarVolume});
  const evidence=independentEvidence(c.evidence,now);
  const publishers=new Set(evidence.map(e=>e.publisherId.toLowerCase()));
  if(typeof c.thesis!=="string"||c.thesis.trim().length<40||publishers.size<2){
    log("RESEARCH","BLOCKED","INSUFFICIENT_VERIFIABLE_INDEPENDENT_EVIDENCE",{validEvidence:evidence.length,independentPublishers:publishers.size});
    return reject("RESEARCH","INSUFFICIENT_VERIFIABLE_INDEPENDENT_EVIDENCE",events);
  }
  const risks=Array.isArray(c.risks)?c.risks.filter(x=>typeof x==="string"&&x.trim().length>=5):[];
  if(!risks.length){log("RESEARCH","BLOCKED","NO_EXPLICIT_RISK_ASSESSMENT");return reject("RESEARCH","NO_EXPLICIT_RISK_ASSESSMENT",events);}
  log("RESEARCH","PASSED","THESIS_AND_VERIFIABLE_EVIDENCE_PRESENT",{evidenceCount:evidence.length,publisherCount:publishers.size,riskFactors:risks.length});
  const a=c.account||{},l=c.limits||{},p=c.portfolio||{};
  const stop=Number(c.stopPrice),equity=Number(a.equityUsd),riskFraction=Number(l.riskFraction),maxPositionFraction=Number(l.maxPositionFraction);
  const openRisk=Number(p.openRiskUsd),gross=Number(p.grossExposureUsd),dailyLoss=Number(p.dailyLossFraction),weeklyLoss=Number(p.weeklyLossFraction),drawdown=Number(p.drawdownFraction);
  const sectorExposure=Number(p.sectorExposureUsd),concurrent=Number(p.concurrentPositions),sector=String(c.sector||"").trim();
  if(![stop,equity,riskFraction,maxPositionFraction,openRisk,gross,dailyLoss,weeklyLoss,drawdown,sectorExposure,concurrent].every(Number.isFinite)||
    !sector||stop<=0||stop>=price||equity<=0||riskFraction<=0||riskFraction>0.005||maxPositionFraction<=0||maxPositionFraction>0.25||
    openRisk<0||openRisk>equity*0.02||gross<0||gross>equity||dailyLoss<0||dailyLoss>=0.02||weeklyLoss<0||weeklyLoss>=0.04||drawdown<0||drawdown>=0.08||sectorExposure<0||sectorExposure>equity*0.40||concurrent!==0){
    log("RISK_AUDITOR","BLOCKED","MISSING_OR_BREACHED_PORTFOLIO_RISK_INPUTS");return reject("RISK_AUDITOR","MISSING_OR_BREACHED_PORTFOLIO_RISK_INPUTS",events);
  }
  const costBps=Number(l.estimatedRoundTripCostBps);
  if(!Number.isFinite(costBps)||costBps<0||costBps>500){log("RISK_AUDITOR","BLOCKED","INVALID_OR_MISSING_TRANSACTION_COST_ASSUMPTION");return reject("RISK_AUDITOR","INVALID_OR_MISSING_TRANSACTION_COST_ASSUMPTION",events);}
  const riskPerShare=price-stop, effectiveRisk=riskPerShare+price*costBps/10000, riskBudget=equity*riskFraction;
  const remainingAggregateRisk=Math.max(0,equity*0.02-openRisk),remainingGross=Math.max(0,equity-gross);
  const maxPosition=equity*maxPositionFraction,remainingSector=Math.max(0,equity*0.40-sectorExposure);
  const shares=Math.min(Math.floor(riskBudget/effectiveRisk),Math.floor(remainingAggregateRisk/effectiveRisk),Math.floor(maxPosition/price),Math.floor(remainingGross/price),Math.floor(remainingSector/price));
  if(shares<1){log("SIZER","BLOCKED","NO_WHOLE_SHARE_FITS_COST_AND_PORTFOLIO_LIMITS");return reject("SIZER","NO_WHOLE_SHARE_FITS_COST_AND_PORTFOLIO_LIMITS",events);}
  const notional=shares*price,costs=notional*costBps/10000;
  const sizing={shares,referenceEntryPriceUsd:round(price),stopPriceUsd:round(stop),plannedStopRiskUsd:round(shares*riskPerShare),estimatedRoundTripCostsUsd:round(costs),riskIncludingEstimatedCostsUsd:round(shares*effectiveRisk),notionalUsd:round(notional),riskBudgetUsd:round(riskBudget),remainingAggregateRiskUsd:round(remainingAggregateRisk),maxPositionValueUsd:round(maxPosition)};
  log("RISK_AUDITOR","PASSED","PORTFOLIO_LIMITS_AND_COST_ASSUMPTIONS_PASSED",{sector,openRiskUsd:openRisk,grossExposureUsd:gross,dailyLossFraction:dailyLoss,weeklyLossFraction:weeklyLoss,drawdownFraction:drawdown,sectorExposureUsd:sectorExposure,concurrentPositions:concurrent});
  log("SIZER","PASSED","COST_AWARE_WHOLE_SHARE_SIZE",sizing);
  log("PAPER_EXECUTOR","DISABLED","NO_ORDER_SUBMISSION_IMPLEMENTED");
  log("DECISION_TRACE","BUILT","TRACE_IS_NOT_DURABLE_PERSISTENCE",{eventCount:events.length+1});
  return {status:"PAPER_REVIEW_REQUIRED",decision:"WATCHLIST_CANDIDATE",symbol,execution:false,automatedOrderSubmission:false,quote:{price,bid,ask,source:q.source,timestamp:q.timestamp,ageMs:quoteAgeMs,spreadPct:round(spreadPct)},evidence:{count:evidence.length,independentPublisherCount:publishers.size,risks},sizing,events};
}
