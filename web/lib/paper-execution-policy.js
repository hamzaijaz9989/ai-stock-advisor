// Central fail-closed policy for any future Northstar paper-order submission.
// Pure validation only: no broker calls, no database writes, and no control changes.
const finite = value => value !== null && value !== undefined && value !== "" && Number.isFinite(Number(value));

export function validatePaperExecutionGate({
  control, account, reconciliation, equityHistory, quote,
  order, strategyValidation, virtualAllocationUsd = 1000, now = Date.now()
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
  if (!strategyValidation || strategyValidation.ok !== true || strategyValidation.approved !== true) return block("STRATEGY_VALIDATION_NOT_APPROVED");
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


// Verify that a standalone recovery stop is the sole valid protection for a
// terminal Northstar OTO parent after its original child is no longer active.
// This is a pure check: it never calls a broker or mutates a database.
export function verifyStandaloneRecoveryStop({
  parent,
  parentRow,
  recoveryOrder,
  recoveryRow,
  brokerPosition
} = {}) {
  const block = (reason, details = {}) => ({ok:false, protected:false, reason, details});
  const number = value => finite(value) ? Number(value) : null;
  const close = (a,b,tolerance=0.0001) => Math.abs(Number(a)-Number(b)) <= tolerance;
  const normalizedStatus = value => {
    const status = String(value || "").toLowerCase();
    return ({
      new:"ACCEPTED", accepted:"ACCEPTED", pending_new:"ACCEPTED",
      accepted_for_bidding:"ACCEPTED", partially_filled:"PARTIALLY_FILLED",
      filled:"FILLED", canceled:"CANCELED", cancelled:"CANCELED",
      expired:"CANCELED", rejected:"REJECTED"
    })[status] || "UNKNOWN";
  };

  if (!parent || !parentRow || !recoveryOrder || !recoveryRow) {
    return block("STANDALONE_RECOVERY_LEDGER_OR_BROKER_ORDER_MISSING");
  }

  const parentId = String(parentRow.id || "");
  const symbol = String(parentRow.symbol || "").toUpperCase();
  const parentStatus = String(parent.status || "").toLowerCase();
  const parentQty = number(parent.qty);
  const parentFilled = number(parent.filled_qty);
  const ledgerParentQty = number(parentRow.qty);
  const stopPrice = number(parentRow.stop_price);
  const terminalParent = ["filled","canceled","cancelled","expired","rejected"].includes(parentStatus);

  if (!parentId || !/^[A-Z][A-Z0-9.-]{0,9}$/.test(symbol) ||
      String(parentRow.side || "").toLowerCase() !== "buy" ||
      String(parentRow.broker_order_id || "") !== String(parent.id || "") ||
      String(parent.client_order_id || "") !== parentId ||
      String(parent.order_class || "").toLowerCase() !== "oto" ||
      String(parent.side || "").toLowerCase() !== "buy" ||
      String(parent.symbol || "").toUpperCase() !== symbol ||
      parentQty === null || ledgerParentQty === null || parentQty <= 0 ||
      !close(parentQty,ledgerParentQty) || !Number.isInteger(parentQty) ||
      parentFilled === null || parentFilled < 0 || parentFilled > parentQty ||
      stopPrice === null || stopPrice <= 0) {
    return block("STANDALONE_RECOVERY_PARENT_IDENTITY_OR_FIELDS_INVALID");
  }
  if (!terminalParent) return block("STANDALONE_RECOVERY_PARENT_NOT_TERMINAL");
  if (parentStatus === "filled" && !close(parentFilled,parentQty)) {
    return block("STANDALONE_RECOVERY_FILLED_PARENT_QUANTITY_MISMATCH");
  }
  if (!Array.isArray(parent.legs)) return block("STANDALONE_RECOVERY_OTO_CHILD_LIST_UNAVAILABLE");

  const stopChildren = parent.legs.filter(leg => {
    const role = String(leg?.order_group_role || leg?.group_role || leg?.role || "").toLowerCase();
    const type = String(leg?.type || leg?.order_type || "").toLowerCase();
    return String(leg?.side || "").toLowerCase() === "sell" &&
      (["stop","stop_limit"].includes(type) || role === "stop_loss");
  });
  if (stopChildren.length > 1) return block("STANDALONE_RECOVERY_OTO_CHILD_AMBIGUOUS");

  let childFilled = 0;
  if (stopChildren.length === 1) {
    const child = stopChildren[0];
    const childStatus = String(child?.status || "").toLowerCase();
    const childQty = number(child?.qty);
    const childFillQty = number(child?.filled_qty);
    const childStop = number(child?.stop_price);
    const childTerminal = ["filled","canceled","cancelled","expired","rejected"].includes(childStatus);
    if (!child?.id || String(child.symbol || "").toUpperCase() !== symbol ||
        String(child.side || "").toLowerCase() !== "sell" ||
        !["stop","stop_limit"].includes(String(child.type || child.order_type || "").toLowerCase()) ||
        childQty === null || !Number.isInteger(childQty) || childQty <= 0 || childQty > parentQty ||
        childFillQty === null || childFillQty < 0 || childFillQty > childQty ||
        childFillQty > parentFilled || childStop === null || !close(childStop,stopPrice)) {
      return block("STANDALONE_RECOVERY_OTO_CHILD_FIELDS_INVALID");
    }
    if (!childTerminal) return block("STANDALONE_RECOVERY_OTO_CHILD_NOT_TERMINAL",{childStatus});
    childFilled = childFillQty;
  }

  const expectedQty = parentFilled - childFilled;
  if (!Number.isInteger(expectedQty) || expectedQty <= 0) {
    return block("STANDALONE_RECOVERY_NO_REMAINING_EXPOSURE",{parentFilled,childFilled});
  }

  const recoveryId = String(recoveryRow.id || "");
  const recoveryQty = number(recoveryRow.qty);
  const brokerQty = number(recoveryOrder.qty);
  const brokerFilled = number(recoveryOrder.filled_qty);
  const brokerStop = number(recoveryOrder.stop_price);
  const brokerStatus = normalizedStatus(recoveryOrder.status);
  const rowStatus = String(recoveryRow.status || "").toUpperCase();

  if (!recoveryId || String(recoveryRow.idempotency_key || "") !== "recovery:" + parentId ||
      String(recoveryRow.broker_order_id || "") !== String(recoveryOrder.id || "") ||
      String(recoveryRow.symbol || "").toUpperCase() !== symbol ||
      String(recoveryRow.side || "").toLowerCase() !== "sell" ||
      String(recoveryRow.order_type || "").toLowerCase() !== "stop" ||
      String(recoveryRow.time_in_force || "").toLowerCase() !== "gtc" ||
      recoveryQty === null || !close(recoveryQty,expectedQty) ||
      number(recoveryRow.stop_price) === null || !close(number(recoveryRow.stop_price),stopPrice)) {
    return block("STANDALONE_RECOVERY_LEDGER_FIELDS_MISMATCH",{expectedQty});
  }
  if (String(recoveryOrder.client_order_id || "") !== recoveryId ||
      String(recoveryOrder.symbol || "").toUpperCase() !== symbol ||
      String(recoveryOrder.side || "").toLowerCase() !== "sell" ||
      String(recoveryOrder.type || recoveryOrder.order_type || "").toLowerCase() !== "stop" ||
      String(recoveryOrder.time_in_force || "").toLowerCase() !== "gtc" ||
      brokerQty === null || !close(brokerQty,expectedQty) ||
      brokerFilled === null || brokerFilled < 0 || brokerFilled > brokerQty ||
      brokerStop === null || !close(brokerStop,stopPrice) ||
      brokerStatus === "UNKNOWN" || rowStatus !== brokerStatus) {
    return block("STANDALONE_RECOVERY_BROKER_FIELDS_OR_STATUS_MISMATCH",{expectedQty,brokerStatus,rowStatus});
  }

  const leaves = number(recoveryOrder.leaves_qty) ?? (brokerQty - brokerFilled);
  if (!close(leaves,brokerQty-brokerFilled) || leaves < 0) {
    return block("STANDALONE_RECOVERY_LEAVES_QUANTITY_INVALID",{leaves,brokerQty,brokerFilled});
  }

  if (["ACCEPTED","PARTIALLY_FILLED"].includes(brokerStatus)) {
    const positionQty = brokerPosition ? number(brokerPosition.qty) : null;
    const positionSide = String(brokerPosition?.side || "").toLowerCase();
    if (leaves <= 0 || positionQty === null || positionQty <= 0 ||
        positionSide !== "long" ||
        String(brokerPosition.symbol || "").toUpperCase() !== symbol ||
        !close(positionQty,leaves)) {
      return block("STANDALONE_RECOVERY_STOP_DOES_NOT_COVER_POSITION",{leaves,positionQty,positionSide});
    }
    return {ok:true,protected:true,reason:"STANDALONE_RECOVERY_STOP_VERIFIED",status:brokerStatus,expectedQty,filledQty:brokerFilled,leavesQty:leaves};
  }

  if (brokerStatus === "FILLED") {
    const positionQty = brokerPosition ? number(brokerPosition.qty) : 0;
    if (!close(brokerFilled,brokerQty) || leaves !== 0 ||
        (brokerPosition && (positionQty === null || positionQty > 0))) {
      return block("STANDALONE_RECOVERY_FILLED_STOP_POSITION_NOT_FLAT",{brokerQty,brokerFilled,leaves,positionQty});
    }
    return {ok:true,protected:false,noExposure:true,reason:"STANDALONE_RECOVERY_STOP_FILLED_AND_POSITION_FLAT",status:brokerStatus,expectedQty,filledQty:brokerFilled,leavesQty:0};
  }

  return block("STANDALONE_RECOVERY_STOP_NOT_ACTIVE_OR_FILLED",{brokerStatus,leaves});
}
