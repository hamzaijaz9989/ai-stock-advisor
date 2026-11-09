// Pure, fail-closed decision policy for recovering a partially filled Alpaca PAPER OTO entry.
// This module performs no network requests, broker mutations, or database writes.
const finite = value => value !== null && value !== undefined && value !== "" && Number.isFinite(Number(value));
const number = value => finite(value) ? Number(value) : null;
const close = (a,b,tolerance=0.0001) => Math.abs(Number(a)-Number(b)) <= tolerance;
const OPEN_PARENT = new Set(["new","accepted","pending_new","accepted_for_bidding","partially_filled","done_for_day"]);
const TERMINAL_PARENT = new Set(["filled","canceled","cancelled","expired","rejected"]);
const ACTIVE_STOP = new Set(["new","accepted","pending_new","partially_filled"]);
const TERMINAL_STOP = new Set(["filled","canceled","cancelled","expired","rejected"]);

function blocked(reason, details={}) {
  return {ok:false, execution:false, action:"MANUAL_RECOVERY_REQUIRED", reason, details};
}

export function evaluatePartialFillRecovery({
  parent,
  stopChild=null,
  brokerPosition=null,
  stopPrice,
  quote=null,
  now=Date.now()
}) {
  if (!parent || typeof parent !== "object") return blocked("PARENT_ORDER_MISSING");
  const parentStatus=String(parent.status || "").toLowerCase();
  const symbol=String(parent.symbol || "").toUpperCase();
  const parentQty=number(parent.qty);
  const parentFilled=number(parent.filled_qty);
  const stop=number(stopPrice);
  const parentSide=String(parent.side || "").toLowerCase();
  if (!/^[A-Z][A-Z0-9.-]{0,9}$/.test(symbol) || parentSide!=="buy" ||
      !Number.isInteger(parentQty) || parentQty<=0 || parentFilled===null ||
      !Number.isInteger(parentFilled) || parentFilled<0 || parentFilled>parentQty || stop===null || stop<=0) {
    return blocked("PARENT_ORDER_OR_STOP_FIELDS_INVALID",{symbol,parentSide,parentQty,parentFilled,stopPrice});
  }
  if (["new","accepted","pending_new","accepted_for_bidding"].includes(parentStatus) && parentFilled!==0) {
    return blocked("UNFILLED_PARENT_STATUS_HAS_NONZERO_CUMULATIVE_QUANTITY",{parentStatus,parentFilled});
  }
  if (parentStatus==="partially_filled" && !(parentFilled>0 && parentFilled<parentQty)) {
    return blocked("PARTIAL_PARENT_HAS_INVALID_CUMULATIVE_QUANTITY",{parentQty,parentFilled});
  }
  if (parentStatus==="filled" && !close(parentFilled,parentQty)) {
    return blocked("FILLED_PARENT_HAS_INCOMPLETE_CUMULATIVE_QUANTITY",{parentQty,parentFilled});
  }

  if (OPEN_PARENT.has(parentStatus)) {
    return {
      ok:true, execution:false, action:"CANCEL_PARENT_REMAINDER",
      reason:"ENTRY_MUST_BE_TERMINAL_BEFORE_EXPOSURE_PROTECTION",
      symbol, parentQty, parentFilledQty:parentFilled, stopPrice:stop
    };
  }
  if (parentStatus==="pending_cancel") {
    return {
      ok:true, execution:false, action:"WAIT_FOR_CANCEL_CONFIRMATION",
      reason:"CANCEL_REQUEST_IS_STILL_PENDING",
      symbol, parentQty, parentFilledQty:parentFilled, stopPrice:stop
    };
  }
  if (!TERMINAL_PARENT.has(parentStatus)) {
    return blocked("PARENT_STATUS_NOT_RECOGNIZED_AS_SAFE_TERMINAL",{parentStatus});
  }
  let childFilled=0;
  let heldChild=false;
  if (stopChild) {
    const childStatus=String(stopChild.status || "").toLowerCase();
    const childSymbol=String(stopChild.symbol || "").toUpperCase();
    const childSide=String(stopChild.side || "").toLowerCase();
    const childType=String(stopChild.type || stopChild.order_type || "").toLowerCase();
    const childQty=number(stopChild.qty);
    childFilled=number(stopChild.filled_qty);
    const childStop=number(stopChild.stop_price);
    if (childSymbol!==symbol || childSide!=="sell" || !["stop","stop_limit"].includes(childType) ||
        !Number.isInteger(childQty) || childQty<=0 || childFilled===null || childFilled<0 ||
        childFilled>childQty || childStop===null || !close(childStop,stop,0.0001)) {
      return blocked("OTO_STOP_CHILD_FIELDS_INVALID_OR_MISMATCHED",{childStatus,childSymbol,childSide,childType,childQty,childFilled,childStop});
    }
    heldChild=childStatus==="held";
    if (!heldChild && !ACTIVE_STOP.has(childStatus) && !TERMINAL_STOP.has(childStatus)) {
      return blocked("OTO_STOP_CHILD_STATUS_UNVERIFIED",{childStatus});
    }
  }

  if (childFilled>parentFilled) {
    return blocked("STOP_CHILD_FILLED_MORE_THAN_ENTRY",{parentFilled,childFilled});
  }
  const expectedRemaining=Math.max(0,parentFilled-childFilled);
  const positionQty=brokerPosition ? number(brokerPosition.qty) : 0;
  const positionSide=String(brokerPosition?.side || (positionQty>0 ? "long" : "")).toLowerCase();
  if (positionQty===null || positionQty<0 || (positionQty>0 && positionSide!=="long")) {
    return blocked("BROKER_POSITION_IS_INVALID_OR_NOT_LONG",{positionQty,positionSide});
  }
  if (!close(positionQty,expectedRemaining)) {
    return blocked("BROKER_POSITION_DOES_NOT_MATCH_ENTRY_MINUS_STOP_FILLS",{expectedRemaining,positionQty,parentFilled,childFilled});
  }

  if (heldChild) {
    return {
      ok:true, execution:false, action:"CANCEL_HELD_STOP_CHILD",
      reason:"HELD_OTO_CHILD_IS_NOT_PROTECTIVE_AND_MUST_BE_REMOVED_BEFORE_STANDALONE_RECOVERY",
      symbol, parentStatus, parentFilledQty:parentFilled, stopChildFilledQty:childFilled,
      positionQty:expectedRemaining, heldStopOrderId:String(stopChild?.id || "")
    };
  }

  if (expectedRemaining===0) {
    return {
      ok:true, execution:false, action:"COMPLETED_NO_EXPOSURE",
      reason:"NO_REMAINING_LONG_POSITION",
      symbol, parentStatus, parentFilledQty:parentFilled, stopChildFilledQty:childFilled, positionQty:0
    };
  }

  if (stopChild && ACTIVE_STOP.has(String(stopChild.status || "").toLowerCase())) {
    const childQty=number(stopChild.qty);
    const childLeaves=number(stopChild.leaves_qty) ?? (childQty-childFilled);
    if (!close(childLeaves,expectedRemaining)) {
      return blocked("ACTIVE_OTO_STOP_DOES_NOT_COVER_EXACT_REMAINING_POSITION",{childLeaves,expectedRemaining,positionQty});
    }
    return {
      ok:true, execution:false, action:"PROTECTED_BY_EXISTING_OTO_STOP",
      reason:"ACTIVE_OTO_STOP_COVERS_ALL_REMAINING_SHARES",
      symbol, parentStatus, parentFilledQty:parentFilled, stopChildFilledQty:childFilled,
      positionQty, protectiveStopOrderId:String(stopChild.id || "")
    };
  }

  const bid=number(quote?.bid);
  const quoteAt=Date.parse(quote?.timestamp || "");
  if (bid===null || bid<=0 || !Number.isFinite(quoteAt) || quoteAt>now || now-quoteAt>60_000) {
    return blocked("FRESH_BID_REQUIRED_BEFORE_STANDALONE_STOP",{bid,quoteTimestamp:quote?.timestamp || null});
  }
  if (bid<=stop) {
    return blocked("STOP_PRICE_ALREADY_BREACHED_OR_AT_MARKET",{bid,stopPrice:stop});
  }

  return {
    ok:true, execution:false, action:"PLACE_STANDALONE_GTC_STOP",
    reason:"PARENT_IS_TERMINAL_POSITION_RECONCILES_AND_NO_ACTIVE_CHILD_STOP_REMAINS",
    symbol, parentStatus, parentFilledQty:parentFilled, stopChildFilledQty:childFilled,
    positionQty:expectedRemaining, stopPrice:stop,
    order:{symbol,qty:expectedRemaining,side:"sell",type:"stop",time_in_force:"gtc",stop_price:stop},
    executionPriceNotGuaranteed:true
  };
}


// Cross-check a durable standalone recovery stop against the original OTO
// parent, its terminal child fills, the recovery-order ledger and live position.
export function verifyStandaloneRecoveryStop({parent,parentRow,recoveryOrder,recoveryRow,brokerPosition=null}) {
  const blocked=reason=>({ok:false,reason});
  if(!parent||!parentRow||!recoveryOrder||!recoveryRow)return blocked("RECOVERY_STOP_OR_LINKED_LEDGER_ROW_MISSING");
  const parentStatus=String(parent.status||"").toLowerCase();
  const parentQty=number(parent.qty),parentFilled=number(parent.filled_qty);
  const symbol=String(parentRow.symbol||"").toUpperCase();
  const stopPrice=number(parentRow.stop_price);
  const terminalParent=["filled","canceled","cancelled","expired","rejected"].includes(parentStatus);
  if(!terminalParent||String(parent.order_class||"").toLowerCase()!=="oto"||
     String(parent.client_order_id||"")!==String(parentRow.id||"")||
     String(parent.side||"").toLowerCase()!=="buy"||
     String(parent.symbol||"").toUpperCase()!==symbol||
     !Number.isInteger(parentQty)||parentQty<=0||!Number.isInteger(parentFilled)||parentFilled<0||parentFilled>parentQty||
     !close(parentQty,number(parentRow.qty))||stopPrice===null||stopPrice<=0||
     (parentStatus==="filled"&&!close(parentFilled,parentQty)))return blocked("RECOVERY_PARENT_NOT_TERMINAL_OR_MISMATCHED");

  const legs=Array.isArray(parent.legs)?parent.legs:[];
  const children=legs.filter(x=>String(x?.side||"").toLowerCase()==="sell"&&(
    ["stop","stop_limit"].includes(String(x?.type||x?.order_type||"").toLowerCase())||
    String(x?.order_group_role||x?.group_role||x?.role||"").toLowerCase()==="stop_loss"));
  if(children.length>1)return blocked("RECOVERY_PARENT_HAS_AMBIGUOUS_STOP_CHILDREN");
  let childFilled=0;
  if(children.length){
    const child=children[0],childStatus=String(child.status||"").toLowerCase();
    const childQty=number(child.qty),filled=number(child.filled_qty),childStop=number(child.stop_price);
    if(!["filled","canceled","cancelled","expired","rejected"].includes(childStatus)||
       String(child.symbol||"").toUpperCase()!==symbol||
       !["stop","stop_limit"].includes(String(child.type||child.order_type||"").toLowerCase())||
       !Number.isInteger(childQty)||childQty<=0||!Number.isInteger(filled)||filled<0||filled>childQty||
       childStop===null||!close(childStop,stopPrice))return blocked("RECOVERY_OTO_CHILD_NOT_TERMINAL_OR_MISMATCHED");
    childFilled=filled;
  }
  if(childFilled>parentFilled)return blocked("RECOVERY_CHILD_FILLS_EXCEED_PARENT_FILLS");
  const expectedBeforeRecovery=parentFilled-childFilled;
  const recoveryQty=number(recoveryRow.qty),recoveryFilled=number(recoveryOrder.filled_qty);
  const recoveryStop=number(recoveryOrder.stop_price);
  const recoveryStatus=String(recoveryOrder.status||"").toLowerCase();
  const recoveryStatusActive=["new","accepted","pending_new","accepted_for_bidding","partially_filled"].includes(recoveryStatus);
  const recoveryStatusFilled=recoveryStatus==="filled";
  const recoveryStatusTerminal=["canceled","cancelled","expired","rejected"].includes(recoveryStatus);
  if(expectedBeforeRecovery<=0||recoveryRow.idempotency_key!=="recovery:"+parentRow.id||
     String(recoveryRow.side||"").toLowerCase()!=="sell"||String(recoveryRow.order_type||"").toLowerCase()!=="stop"||
     String(recoveryRow.time_in_force||"").toLowerCase()!=="gtc"||!close(recoveryQty,expectedBeforeRecovery)||
     !close(number(recoveryRow.stop_price),stopPrice)||
     String(recoveryOrder.id||"")!==String(recoveryRow.broker_order_id||"")||
     String(recoveryOrder.client_order_id||"")!==String(recoveryRow.id||"")||
     String(recoveryOrder.symbol||"").toUpperCase()!==symbol||
     String(recoveryOrder.side||"").toLowerCase()!=="sell"||
     String(recoveryOrder.type||recoveryOrder.order_type||"").toLowerCase()!=="stop"||
     String(recoveryOrder.time_in_force||"").toLowerCase()!=="gtc"||
     !close(number(recoveryOrder.qty),recoveryQty)||recoveryStop===null||!close(recoveryStop,stopPrice)||
     recoveryFilled===null||recoveryFilled<0||recoveryFilled>recoveryQty||
     !(recoveryStatusActive||recoveryStatusFilled||recoveryStatusTerminal))return blocked("RECOVERY_STOP_ORDER_OR_LEDGER_MISMATCHED");

  const expectedAfterRecovery=expectedBeforeRecovery-recoveryFilled;
  const positionQty=brokerPosition?number(brokerPosition.qty):0;
  const positionSide=String(brokerPosition?.side||(positionQty>0?"long":"")).toLowerCase();
  if(positionQty===null||positionQty<0||!close(positionQty,expectedAfterRecovery)||
     (positionQty>0&&positionSide!=="long"))return blocked("RECOVERY_STOP_POSITION_DOES_NOT_MATCH_CUMULATIVE_FILLS");
  const leaves=number(recoveryOrder.leaves_qty)??(recoveryQty-recoveryFilled);
  if(recoveryStatusActive){
    if(expectedAfterRecovery<=0||!close(leaves,expectedAfterRecovery))return blocked("RECOVERY_STOP_LEAVES_DO_NOT_COVER_REMAINING_POSITION");
  }else if(recoveryStatusFilled){
    if(!close(recoveryFilled,recoveryQty)||expectedAfterRecovery!==0)return blocked("RECOVERY_STOP_FILLED_QUANTITY_INCOMPLETE");
  }else if(expectedAfterRecovery!==0){
    return blocked("RECOVERY_STOP_TERMINAL_WITH_REMAINING_EXPOSURE");
  }
  return {ok:true,reason:"STANDALONE_RECOVERY_STOP_RECONCILED",expectedBeforeRecovery,expectedAfterRecovery,recoveryStatus,positionQty,leaves};
}
