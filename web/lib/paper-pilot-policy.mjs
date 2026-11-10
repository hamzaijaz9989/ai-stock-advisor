// Pure, fail-closed policy for Northstar's approved paper-only pilot.
// No broker calls, secrets, persistence, or live-trading support belong in this module.
export const PAPER_PILOT_LIMITS = Object.freeze({
  allocationUsd: 2500,
  maxRiskPerTradeUsd: 25,
  dailyLossLimitUsd: 50,
  maxSectorExposureUsd: 1000,
  maxConcurrentPositions: 1,
  maxQuoteAgeMs: 60_000,
  allowedOrderType: "limit",
  allowedSide: "buy"
});

const finite = value => value !== null && value !== undefined &&
  value !== "" && Number.isFinite(Number(value));
const deny = reason => Object.freeze({ ok: false, execution: false, reason });

export function validatePaperEnvironment({ mode, brokerHost, accountStatus, tradingBlocked, accountBlocked }) {
  if (mode !== "paper") return deny("PAPER_MODE_REQUIRED");
  if (brokerHost !== "https://paper-api.alpaca.markets") return deny("PAPER_HOST_MISMATCH");
  if (accountStatus !== "ACTIVE" || tradingBlocked === true || accountBlocked === true)
    return deny("PAPER_ACCOUNT_NOT_ACTIVE");
  return Object.freeze({ ok: true, execution: false, reason: "PAPER_ENVIRONMENT_VERIFIED" });
}

export function sizePaperPilotOrder({
  symbol, side, orderType, entryPrice, stopPrice, pilotCashUsd,
  deployedNotionalUsd = 0, openOrderNotionalUsd = 0,
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
  if (![entryPrice, stopPrice, pilotCashUsd, deployedNotionalUsd, openOrderNotionalUsd,
        dailyLossUsd, sectorExposureUsd, openPositions, quoteTimestamp, now, maxQuoteAgeMs].every(finite))
    return deny("MISSING_OR_INVALID_RISK_INPUT");
  const entry = Number(entryPrice), stop = Number(stopPrice), cash = Number(pilotCashUsd);
  const deployed = Number(deployedNotionalUsd), pending = Number(openOrderNotionalUsd);
  const dailyLoss = Number(dailyLossUsd), sector = Number(sectorExposureUsd);
  const age = Number(now) - Number(quoteTimestamp);
  if (entry <= 0 || stop <= 0 || stop >= entry || cash < 0 || deployed < 0 || pending < 0 ||
      dailyLoss < 0 || sector < 0 || Number(openPositions) < 0 || !Number.isInteger(Number(openPositions)) ||
      Number(maxQuoteAgeMs) <= 0 || age < 0 || age > Number(maxQuoteAgeMs))
    return deny("INVALID_STOP_CASH_OR_STALE_QUOTE");
  if (cash + deployed + pending > PAPER_PILOT_LIMITS.allocationUsd + 0.000001)
    return deny("PILOT_ALLOCATION_EXCEEDED");
  if (dailyLoss >= PAPER_PILOT_LIMITS.dailyLossLimitUsd)
    return deny("DAILY_LOSS_STOP_REACHED");
  if (Number(openPositions) >= PAPER_PILOT_LIMITS.maxConcurrentPositions)
    return deny("MAX_CONCURRENT_POSITIONS_REACHED");
  if (sector + Math.max(0, PAPER_PILOT_LIMITS.allocationUsd - cash - deployed - pending) >
      PAPER_PILOT_LIMITS.maxSectorExposureUsd && sector >= PAPER_PILOT_LIMITS.maxSectorExposureUsd)
    return deny("SECTOR_EXPOSURE_LIMIT_REACHED");

  const riskBudget = Math.min(PAPER_PILOT_LIMITS.maxRiskPerTradeUsd,
    PAPER_PILOT_LIMITS.dailyLossLimitUsd - dailyLoss);
  const riskPerShare = entry - stop;
  const availableAllocation = Math.max(0, PAPER_PILOT_LIMITS.allocationUsd - deployed - pending);
  const quantity = Math.floor(Math.min(riskBudget / riskPerShare, availableAllocation / entry, cash / entry));
  if (!Number.isSafeInteger(quantity) || quantity < 1) return deny("NO_VALID_POSITION_SIZE");
  const notional = Number((quantity * entry).toFixed(2));
  if (sector + notional > PAPER_PILOT_LIMITS.maxSectorExposureUsd) return deny("SECTOR_EXPOSURE_LIMIT_EXCEEDED");
  const plannedRisk = Number((quantity * riskPerShare).toFixed(2));
  if (plannedRisk > PAPER_PILOT_LIMITS.maxRiskPerTradeUsd + 0.000001)
    return deny("PER_TRADE_RISK_LIMIT_EXCEEDED");
  return Object.freeze({
    ok: true, execution: false, reason: "PAPER_ORDER_PREVIEW_APPROVED",
    orderPreview: Object.freeze({
      symbol, side: "buy", type: "limit", quantity, limitPrice: entry,
      stopPrice: stop, notionalUsd: notional, plannedRiskUsd: plannedRisk,
      remainingAllocationUsd: Number((availableAllocation - notional).toFixed(2)),
      dailyLossLimitUsd: PAPER_PILOT_LIMITS.dailyLossLimitUsd,
      allocationLimitUsd: PAPER_PILOT_LIMITS.allocationUsd
    }),
    note: "Preview only. This policy does not submit or authorize a broker order."
  });
}
