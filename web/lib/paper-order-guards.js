// Pure paper-order lifecycle guards. This module never calls a broker or writes a database.
export const ORDER_STATUSES = Object.freeze(["PREVIEWED","SUBMITTING","ACCEPTED","PARTIALLY_FILLED","FILLED","CANCELED","REJECTED","UNKNOWN"]);
const transitions = Object.freeze({
  PREVIEWED:["SUBMITTING","CANCELED"],
  SUBMITTING:["ACCEPTED","PARTIALLY_FILLED","FILLED","CANCELED","REJECTED","UNKNOWN"],
  ACCEPTED:["PARTIALLY_FILLED","FILLED","CANCELED","REJECTED","UNKNOWN"],
  PARTIALLY_FILLED:["PARTIALLY_FILLED","FILLED","CANCELED","UNKNOWN"],
  UNKNOWN:["ACCEPTED","PARTIALLY_FILLED","FILLED","CANCELED","REJECTED","UNKNOWN"],
  FILLED:[], CANCELED:[], REJECTED:[]
});
const finite = v => v!==null && v!==undefined && v!=="" && Number.isFinite(Number(v));
export function validateOrderTransition(current,next) {
  const from=String(current||"").toUpperCase(), to=String(next||"").toUpperCase();
  if(!ORDER_STATUSES.includes(from)||!ORDER_STATUSES.includes(to)) return {ok:false,reason:"INVALID_STATUS"};
  if(!transitions[from].includes(to)) return {ok:false,reason:"ILLEGAL_STATUS_TRANSITION"};
  return {ok:true,reason:"ALLOWED"};
}
export function validateFillUpdate({orderQty,previousFilledQty,nextFilledQty,averageFillPrice}) {
  if(!finite(orderQty)||!finite(previousFilledQty)||!finite(nextFilledQty)||Number(orderQty)<=0||Number(previousFilledQty)<0||Number(nextFilledQty)<0) return {ok:false,reason:"INVALID_FILL_QUANTITY"};
  if(Number(nextFilledQty)<Number(previousFilledQty)) return {ok:false,reason:"CUMULATIVE_FILL_DECREASED"};
  if(Number(nextFilledQty)>Number(orderQty)) return {ok:false,reason:"OVERFILL"};
  if(Number(nextFilledQty)>0&&(!finite(averageFillPrice)||Number(averageFillPrice)<=0)) return {ok:false,reason:"INVALID_AVERAGE_FILL_PRICE"};
  if(Number(nextFilledQty)===0&&finite(averageFillPrice)&&Number(averageFillPrice)!==0) return {ok:false,reason:"PRICE_WITHOUT_FILL"};
  return {ok:true,reason:"VALID_FILL_UPDATE"};
}
export function validateIdempotency({existingRequestHash,incomingRequestHash}) {
  if(!incomingRequestHash||typeof incomingRequestHash!=="string") return {ok:false,reason:"MISSING_REQUEST_HASH"};
  if(existingRequestHash===undefined||existingRequestHash===null) return {ok:true,reason:"NEW_IDEMPOTENCY_KEY"};
  return existingRequestHash===incomingRequestHash?{ok:true,reason:"SAFE_REPLAY"}:{ok:false,reason:"IDEMPOTENCY_KEY_CONFLICT"};
}
// Fail-closed portfolio risk calculation. Daily loss and drawdown limits are distinct from per-position risk.
export function evaluatePortfolioRisk({account,positions,limits,dailyLossUsd,maxDrawdownUsd,openOrderExposureUsd=0}) {
  const block=(reason,details={})=>({ok:false,status:"RISK_BLOCKED_FAIL_CLOSED",reason,details,execution:false});
  if(!account||!Array.isArray(positions)||!limits) return block("MISSING_ACCOUNT_POSITIONS_OR_LIMITS");
  const equity=Number(account.equity), buyingPower=Number(account.buying_power);
  const cap=Number(limits.maxPortfolioUsd), maxPosition=Number(limits.maxPositionFraction), maxRisk=Number(limits.maxRiskFraction);
  const maxDailyLoss=Number(limits.maxDailyLossFraction ?? 0.02), maxDrawdown=Number(limits.maxDrawdownFraction ?? 0.08);
  if(![equity,buyingPower,cap,maxPosition,maxRisk,maxDailyLoss,maxDrawdown,Number(openOrderExposureUsd)].every(Number.isFinite)||equity<=0||buyingPower<0||cap<=0||maxPosition<=0||maxPosition>1||maxRisk<=0||maxRisk>0.01||maxDailyLoss<=0||maxDailyLoss>0.02||maxDrawdown<=0||maxDrawdown>0.08||openOrderExposureUsd<0) return block("INVALID_RISK_INPUTS");
  if(dailyLossUsd===null||dailyLossUsd===undefined||dailyLossUsd===""||maxDrawdownUsd===null||maxDrawdownUsd===undefined||maxDrawdownUsd===""||!Number.isFinite(Number(dailyLossUsd))||!Number.isFinite(Number(maxDrawdownUsd))||Number(dailyLossUsd)<0||Number(maxDrawdownUsd)<0) return block("DAILY_LOSS_OR_DRAWDOWN_NOT_VERIFIED");
  if(positions.some(p=>!Number.isFinite(Number(p.market_value)))) return block("INVALID_POSITION_MARKS");
  const gross=positions.reduce((s,p)=>s+Math.abs(Number(p.market_value)),0)+Number(openOrderExposureUsd);
  const concentration=positions.map(p=>({symbol:String(p.symbol||"").toUpperCase(),weight:Math.abs(Number(p.market_value))/equity}));
  const breaches=[];
  if(gross>Math.min(cap,equity)) breaches.push("PORTFOLIO_EXPOSURE_LIMIT");
  if(concentration.some(p=>p.weight>maxPosition)) breaches.push("POSITION_CONCENTRATION_LIMIT");
  if(Number(dailyLossUsd)>=cap*maxDailyLoss) breaches.push("DAILY_LOSS_LIMIT");
  if(Number(maxDrawdownUsd)>=cap*maxDrawdown) breaches.push("DRAWDOWN_LIMIT");
  if(account.trading_blocked||account.account_blocked||account.status!=="ACTIVE") breaches.push("BROKER_ACCOUNT_RESTRICTED");
  return {ok:breaches.length===0,status:breaches.length?"RISK_BLOCKED_FAIL_CLOSED":"RISK_CHECK_PASSED_READ_ONLY",reason:breaches.length?breaches.join(","):"WITHIN_CONFIGURED_LIMITS",execution:false,metrics:{equityUsd:equity,buyingPowerUsd:buyingPower,grossExposureUsd:Number(gross.toFixed(2)),dailyLossUsd:Number(dailyLossUsd),maxDrawdownUsd:Number(maxDrawdownUsd),concentration},breaches};
}

 // Convert broker equity history into the independent virtual-allocation risk units.
 // Missing or stale history is never treated as zero drawdown.
export function deriveSnapshotRiskMetrics({snapshots,currentEquity,lastEquity,virtualAllocationUsd,now=Date.now(),maxAgeMs=26*60*60*1000}) {
  const block=reason=>({ok:false,reason});
  if(!Array.isArray(snapshots)||snapshots.length===0) return block("EQUITY_HISTORY_UNAVAILABLE");
  const equity=Number(currentEquity),baseline=Number(lastEquity),allocation=Number(virtualAllocationUsd);
  if(![equity,baseline,allocation,now,maxAgeMs].every(Number.isFinite)||equity<=0||baseline<=0||allocation<=0||maxAgeMs<=0) return block("INVALID_EQUITY_HISTORY_INPUT");
  const points=snapshots.map(s=>({time:Date.parse(s.captured_at),equity:Number(s.equity_usd)}));
  if(points.some(p=>!Number.isFinite(p.time)||!Number.isFinite(p.equity)||p.equity<=0)) return block("INVALID_EQUITY_HISTORY_POINT");
  points.sort((a,b)=>a.time-b.time);
  const latest=points[points.length-1];
  if(latest.time>now||now-latest.time>maxAgeMs) return block("EQUITY_HISTORY_STALE_OR_FUTURE");
  let peak=0,maxDrawdownFraction=0;
  for(const point of [...points,{time:now,equity}]) {
    peak=Math.max(peak,point.equity);
    maxDrawdownFraction=Math.max(maxDrawdownFraction,(peak-point.equity)/peak);
  }
  const dailyLossFraction=Math.max(0,(baseline-equity)/baseline);
  return {ok:true,dailyLossUsd:Number((dailyLossFraction*allocation).toFixed(4)),maxDrawdownUsd:Number((maxDrawdownFraction*allocation).toFixed(4)),history:{latestSnapshotAt:new Date(latest.time).toISOString(),snapshotCount:points.length,dailyLossFraction:Number(dailyLossFraction.toFixed(6)),maxDrawdownFraction:Number(maxDrawdownFraction.toFixed(6)),virtualAllocationUsd:allocation}};
}
