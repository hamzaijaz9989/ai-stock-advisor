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


// Verify the broker's nested OTO response contains the exact protective stop
// for any shares currently exposed by the parent order. Alpaca holds the child
// while the entry is unfilled; a HELD child is not protection for a partial fill.
export function verifyOtoStopLeg(order,{symbol,qty,stopPrice}={}) {
  const block=reason=>({ok:false,protected:false,reason});
  if(!order||String(order.order_class||"").toLowerCase()!=="oto") return block("OTO_ORDER_CLASS_NOT_CONFIRMED");
  if(!Array.isArray(order.legs)) return block("NESTED_ORDER_LEGS_UNAVAILABLE");
  if(!finite(order.filled_qty)) return block("PARENT_FILLED_QUANTITY_UNAVAILABLE");
  const parentQty=Number(qty),brokerQty=Number(order.qty),filled=Number(order.filled_qty);
  if(!Number.isFinite(parentQty)||parentQty<=0||!Number.isFinite(brokerQty)||Math.abs(brokerQty-parentQty)>0.0001||filled<0||filled>parentQty) return block("PARENT_ORDER_QUANTITY_INVALID");
  const expectedSymbol=String(symbol||"").toUpperCase();
  const expectedStop=Number(stopPrice);
  const expectedQty=filled>0?filled:parentQty;
  const leg=order.legs.find(item=>{
    const role=String(item?.order_group_role||item?.group_role||item?.role||"").toLowerCase();
    const type=String(item?.type||item?.order_type||"").toLowerCase();
    const legStop=Number(item?.stop_price);
    const legQty=Number(item?.qty);
    return (role==="stop_loss"||type==="stop"||type==="stop_limit") &&
      String(item?.symbol||"").toUpperCase()===expectedSymbol &&
      String(item?.side||"").toLowerCase()==="sell" &&
      Number.isFinite(legQty)&&Math.abs(legQty-expectedQty)<=0.0001 &&
      Number.isFinite(legStop)&&Math.abs(legStop-expectedStop)<=0.0001;
  });
  if(!leg) return block("PROTECTIVE_STOP_LEG_MISSING_OR_MISMATCHED");
  const status=String(leg.status||"").toLowerCase();
  const active=["new","pending_new","accepted","accepted_for_bidding","partially_filled","filled"];
  if(filled===0) {
    if(!active.includes(status)&&status!=="held") return block("UNFILLED_OTO_STOP_CHILD_NOT_ACCEPTED");
    return {
      ok:true,protected:active.includes(status),
      reason:status==="held"?"OTO_STOP_HELD_WITH_NO_EXPOSURE":"OTO_STOP_LEG_VERIFIED",
      legStatus:status.toUpperCase(),legQty:Number(leg.qty),stopPrice:Number(leg.stop_price),exposedQty:0
    };
  }
  if(status==="held") return block("PARTIAL_FILL_WITH_HELD_STOP_CHILD");
  if(!active.includes(status)) return block("EXPOSED_POSITION_STOP_CHILD_NOT_ACTIVE");
  return {
    ok:true,protected:true,reason:"PROTECTIVE_STOP_LEG_VERIFIED",
    legStatus:status.toUpperCase(),legQty:Number(leg.qty),stopPrice:Number(leg.stop_price),exposedQty:filled
  };
}
