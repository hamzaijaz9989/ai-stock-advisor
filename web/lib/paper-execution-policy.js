// Central fail-closed policy for any future Northstar paper-order submission.
// Pure validation only: no broker calls, no database writes, and no control changes.
const finite = value => value !== null && value !== undefined && value !== "" && Number.isFinite(Number(value));

export function validatePaperExecutionGate({
  control, account, reconciliation, equityHistory, quote,
  order, virtualAllocationUsd = 1000, now = Date.now()
}) {
  const block = (reason, details = {}) => ({
    ok: false, execution: false, status: "PAPER_EXECUTION_BLOCKED",
    reason, details
  });

  if (!control || control.mode !== "paper" ||
      Number(control.max_portfolio_usd) !== 1000 ||
      Number(control.enabled) !== 1 || Number(control.kill_switch) !== 0) {
    return block("PAPER_EXECUTION_CONTROL_NOT_EXPLICITLY_ENABLED");
  }
  if (virtualAllocationUsd !== 1000) return block("VIRTUAL_ALLOCATION_MUST_EQUAL_1000");
  if (!account || account.status !== "ACTIVE" || account.trading_blocked ||
      account.account_blocked || !finite(account.equity) || Number(account.equity) <= 0 ||
      !finite(account.buying_power) || Number(account.buying_power) <= 0) {
    return block("BROKER_PAPER_ACCOUNT_NOT_READY");
  }
  if (!reconciliation || reconciliation.ok !== true ||
      reconciliation.reconciled !== true || reconciliation.execution !== false) {
    return block("BROKER_LEDGER_RECONCILIATION_NOT_VERIFIED");
  }
  if (!equityHistory || equityHistory.ok !== true ||
      !finite(equityHistory.dailyLossUsd) || !finite(equityHistory.maxDrawdownUsd)) {
    return block("EQUITY_HISTORY_AND_DRAWDOWN_NOT_VERIFIED");
  }
  if (!quote || !finite(quote.bid) || !finite(quote.ask) ||
      Number(quote.bid) <= 0 || Number(quote.ask) < Number(quote.bid)) {
    return block("VALID_LIVE_QUOTE_REQUIRED");
  }
  const quoteAt = Date.parse(quote.timestamp || "");
  if (!Number.isFinite(quoteAt) || quoteAt > now || now - quoteAt > 60_000) {
    return block("QUOTE_STALE_OR_FUTURE_DATED");
  }
  if (!order || !/^[A-Z][A-Z0-9.-]{0,9}$/.test(String(order.symbol || "")) ||
      order.side !== "buy" || !Number.isInteger(Number(order.qty)) ||
      Number(order.qty) <= 0 || !finite(order.stopPrice) || Number(order.stopPrice) <= 0 ||
      Number(order.stopPrice) >= Number(quote.ask)) {
    return block("INVALID_LONG_ORDER_OR_PROTECTIVE_STOP");
  }
  const qty = Number(order.qty), ask = Number(quote.ask), stop = Number(order.stopPrice);
  const notional = qty * ask, risk = qty * (ask - stop);
  const maxRisk = 10, maxPosition = 250;
  if (!Number.isFinite(notional) || notional > maxPosition) return block("POSITION_LIMIT_EXCEEDED", {notionalUsd:notional,maxPositionUsd:maxPosition});
  if (!Number.isFinite(risk) || risk > maxRisk) return block("PER_TRADE_RISK_LIMIT_EXCEEDED", {plannedRiskUsd:risk,maxRiskUsd:maxRisk});
  if (Number(equityHistory.dailyLossUsd) > 20) return block("DAILY_LOSS_LIMIT_EXCEEDED");
  if (Number(equityHistory.maxDrawdownUsd) > 80) return block("MAX_DRAWDOWN_LIMIT_EXCEEDED");
  return {
    ok: true, execution: false, status: "PAPER_EXECUTION_POLICY_PASSED_NOT_SUBMITTED",
    reason: "ALL_PRE_SUBMISSION_POLICY_CHECKS_PASSED",
    sizing: {qty, referencePrice:ask, stopPrice:stop,
      notionalUsd:Number(notional.toFixed(2)), plannedRiskUsd:Number(risk.toFixed(2))}
  };
}
