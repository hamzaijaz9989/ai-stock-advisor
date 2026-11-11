// Pure, fail-closed sizing policy for Northstar's paper-only pilot.
// Risk is calculated from current pilot equity and stop distance, never from
// a fixed dollar-per-trade constant. This module never calls a broker.
export const PAPER_PILOT_LIMITS = Object.freeze({
  allocationUsd: 1000,
  riskPerTradePct: 0.5,
  maxAggregateOpenRiskPct: 1,
  dailyLossLimitPct: 2,
  maxPositionNotionalPct: 25,
  maxSectorExposurePct: 40,
  maxConcurrentPositions: 1,
  maxQuoteAgeMs: 60_000,
  allowedOrderType: "limit",
  allowedSide: "buy"
});

const finite = value => value !== null && value !== undefined &&
  value !== "" && Number.isFinite(Number(value));
const round = value => Number(value.toFixed(2));
const deny = reason => Object.freeze({ ok: false, execution: false, reason });

export function validatePaperEnvironment({ mode, brokerHost, accountStatus, tradingBlocked, accountBlocked }) {
  if (mode !== "paper") return deny("PAPER_MODE_REQUIRED");
  if (brokerHost !== "https://paper-api.alpaca.markets") return deny("PAPER_HOST_MISMATCH");
  if (accountStatus !== "ACTIVE" || tradingBlocked === true || accountBlocked === true)
    return deny("PAPER_ACCOUNT_NOT_ACTIVE");
  return Object.freeze({ ok: true, execution: false, reason: "PAPER_ENVIRONMENT_VERIFIED" });
}

export function sizePaperPilotOrder({
  symbol, side, orderType, entryPrice, stopPrice, pilotCashUsd, pilotEquityUsd, sessionStartEquityUsd,
  deployedNotionalUsd = 0, openOrderNotionalUsd = 0, openRiskUsd = 0,
  dailyLossUsd, openPositions = 0, sectorExposureUsd = 0,
  quoteTimestamp, now = Date.now(), maxQuoteAgeMs = PAPER_PILOT_LIMITS.maxQuoteAgeMs,
  strategyApproved = false, sessionArmed = false, killSwitch = true,
  environmentVerified = false, operatorAuthorized = false
}) {
  if (!environmentVerified) return deny("PAPER_ENVIRONMENT_NOT_VERIFIED");
  if (!operatorAuthorized) return deny("OPERATOR_NOT_AUTHORIZED");
  if (!strategyApproved) return deny("STRATEGY_NOT_VALIDATED");
  if (!sessionArmed || killSwitch) return deny("PAPER_SESSION_NOT_ARMED_OR_KILL_SWITCH_ON");
  if (!/^[A-Z][A-Z0-9.-]{0,9}$/.test(String(symbol || ""))) return deny("INVALID_US_SYMBOL");
  if (side !== PAPER_PILOT_LIMITS.allowedSide) return deny("LONG_ONLY");
  if (orderType !== PAPER_PILOT_LIMITS.allowedOrderType) return deny("LIMIT_ORDERS_ONLY");
  if (![entryPrice, stopPrice, pilotCashUsd, pilotEquityUsd, deployedNotionalUsd,
        openOrderNotionalUsd, openRiskUsd, dailyLossUsd, sessionStartEquityUsd, sectorExposureUsd,
        openPositions, quoteTimestamp, now, maxQuoteAgeMs].every(finite))
    return deny("MISSING_OR_INVALID_RISK_INPUT");

  const entry=Number(entryPrice), stop=Number(stopPrice), cash=Number(pilotCashUsd);
  const equity=Number(pilotEquityUsd), deployed=Number(deployedNotionalUsd);
  const pending=Number(openOrderNotionalUsd), openRisk=Number(openRiskUsd);
  const dailyLoss=Number(dailyLossUsd), sector=Number(sectorExposureUsd);
  const age=Number(now)-Number(quoteTimestamp);
  if (entry<=0 || stop<=0 || stop>=entry || cash<0 || equity<=0 ||
      equity>PAPER_PILOT_LIMITS.allocationUsd+0.000001 || Number(sessionStartEquityUsd)<=0 || Number(sessionStartEquityUsd)>PAPER_PILOT_LIMITS.allocationUsd || deployed<0 || pending<0 ||
      openRisk<0 || dailyLoss<0 || sector<0 || Number(openPositions)<0 ||
      !Number.isInteger(Number(openPositions)) || Number(maxQuoteAgeMs)<=0 ||
      age<0 || age>Number(maxQuoteAgeMs))
    return deny("INVALID_STOP_CASH_OR_STALE_QUOTE");

  const dailyLossLimit=Number(sessionStartEquityUsd)*PAPER_PILOT_LIMITS.dailyLossLimitPct/100;
  if (dailyLoss>=dailyLossLimit) return deny("DAILY_LOSS_STOP_REACHED");
  if (Number(openPositions)>=PAPER_PILOT_LIMITS.maxConcurrentPositions)
    return deny("MAX_CONCURRENT_POSITIONS_REACHED");
  if (cash+deployed+pending>PAPER_PILOT_LIMITS.allocationUsd+0.000001)
    return deny("PILOT_ALLOCATION_EXCEEDED");

  const perTradeBudget=equity*PAPER_PILOT_LIMITS.riskPerTradePct/100;
  const aggregateRiskLimit=equity*PAPER_PILOT_LIMITS.maxAggregateOpenRiskPct/100;
  const aggregateRiskRemaining=aggregateRiskLimit-openRisk;
  if (aggregateRiskRemaining<=0) return deny("AGGREGATE_OPEN_RISK_LIMIT_REACHED");
  const riskBudget=Math.min(perTradeBudget,aggregateRiskRemaining,dailyLossLimit-dailyLoss);
  const riskPerShare=entry-stop;
  const allocationRemaining=Math.max(0,PAPER_PILOT_LIMITS.allocationUsd-deployed-pending);
  const positionNotionalLimit=equity*PAPER_PILOT_LIMITS.maxPositionNotionalPct/100;
  const sectorLimit=equity*PAPER_PILOT_LIMITS.maxSectorExposurePct/100;
  const quantity=Math.floor(Math.min(
    riskBudget/riskPerShare,
    positionNotionalLimit/entry,
    allocationRemaining/entry,
    cash/entry,
    Math.max(0,sectorLimit-sector)/entry
  ));
  if (!Number.isSafeInteger(quantity) || quantity<1) return deny("NO_VALID_POSITION_SIZE");

  const notional=round(quantity*entry);
  const plannedRisk=round(quantity*riskPerShare);
  if (plannedRisk>perTradeBudget+0.000001) return deny("PER_TRADE_RISK_LIMIT_EXCEEDED");
  if (openRisk+plannedRisk>aggregateRiskLimit+0.000001)
    return deny("AGGREGATE_OPEN_RISK_LIMIT_REACHED");
  if (sector+notional>sectorLimit+0.000001) return deny("SECTOR_EXPOSURE_LIMIT_REACHED");

  return Object.freeze({
    ok:true, execution:false, reason:"PAPER_ORDER_PREVIEW_APPROVED",
    orderPreview:Object.freeze({
      symbol,side:"buy",type:"limit",quantity,limitPrice:entry,stopPrice:stop,
      notionalUsd:notional,plannedRiskUsd:plannedRisk,
      riskBudgetUsd:round(riskBudget),riskPerTradePct:PAPER_PILOT_LIMITS.riskPerTradePct,
      remainingAllocationUsd:round(allocationRemaining-notional),
      dailyLossLimitUsd:round(dailyLossLimit),
      aggregateOpenRiskLimitUsd:round(aggregateRiskLimit),
      maxPositionNotionalUsd:round(positionNotionalLimit),
      allocationLimitUsd:PAPER_PILOT_LIMITS.allocationUsd
    }),
    note:"Preview only. This policy does not submit or authorize a broker order."
  });
}
