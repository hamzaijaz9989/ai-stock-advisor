import test from "node:test";
import assert from "node:assert/strict";
import {validatePaperExecutionGate,verifyOtoStopLeg} from "../web/lib/paper-execution-policy.js";

const now = Date.parse("2026-11-09T12:00:00Z");
const base = {
  control:{mode:"paper",max_portfolio_usd:1000,enabled:1,kill_switch:0},
  account:{status:"ACTIVE",equity:100000,buying_power:400000},
  reconciliation:{ok:true,reconciled:true,execution:false},
  equityHistory:{ok:true,dailyLossUsd:0,maxDrawdownUsd:0},
  quote:{bid:99.9,ask:100,timestamp:new Date(now-1000).toISOString()},
  order:{symbol:"AAPL",side:"buy",qty:2,stopPrice:98},
  strategyValidation:{ok:true,approved:true},
  virtualAllocationUsd:1000,now
};

test("paper execution policy passes only when every prerequisite is verified",()=>{
 const r=validatePaperExecutionGate(base);
 assert.equal(r.ok,true);
 assert.equal(r.execution,false);
 assert.equal(r.sizing.notionalUsd,200);
 assert.equal(r.sizing.plannedRiskUsd,4);
});

test("execution remains blocked by disabled controls or engaged kill switch",()=>{
 assert.equal(validatePaperExecutionGate({...base,control:{...base.control,enabled:0}}).reason,"PAPER_EXECUTION_CONTROL_NOT_EXPLICITLY_ENABLED");
 assert.equal(validatePaperExecutionGate({...base,control:{...base.control,kill_switch:1}}).ok,false);
});

test("paper execution blocks missing reconciliation or equity history",()=>{
 assert.equal(validatePaperExecutionGate({...base,reconciliation:{ok:false,reconciled:false}}).reason,"BROKER_LEDGER_RECONCILIATION_NOT_VERIFIED");
 assert.equal(validatePaperExecutionGate({...base,equityHistory:{ok:false}}).reason,"EQUITY_HISTORY_AND_DRAWDOWN_NOT_VERIFIED");
});

test("paper execution enforces quote freshness, stop, position and risk ceilings",()=>{
 assert.equal(validatePaperExecutionGate({...base,quote:{...base.quote,timestamp:new Date(now-61000).toISOString()}}).reason,"QUOTE_STALE_OR_FUTURE_DATED");
 assert.equal(validatePaperExecutionGate({...base,order:{...base.order,qty:3}}).reason,"POSITION_LIMIT_EXCEEDED");
 assert.equal(validatePaperExecutionGate({...base,order:{...base.order,stopPrice:90}}).reason,"PER_TRADE_RISK_LIMIT_EXCEEDED");
 assert.equal(validatePaperExecutionGate({...base,order:{...base.order,stopPrice:100}}).reason,"INVALID_LONG_ORDER_OR_PROTECTIVE_STOP");
});

test("paper execution blocks at the exact $20 daily-loss and $80 drawdown caps",()=>{
 assert.equal(validatePaperExecutionGate({...base,equityHistory:{...base.equityHistory,dailyLossUsd:19.99}}).ok,true);
 assert.equal(validatePaperExecutionGate({...base,equityHistory:{...base.equityHistory,dailyLossUsd:20}}).reason,"DAILY_LOSS_LIMIT_EXCEEDED");
 assert.equal(validatePaperExecutionGate({...base,equityHistory:{...base.equityHistory,maxDrawdownUsd:79.99}}).ok,true);
 assert.equal(validatePaperExecutionGate({...base,equityHistory:{...base.equityHistory,maxDrawdownUsd:80}}).reason,"MAX_DRAWDOWN_LIMIT_EXCEEDED");
});

test("the virtual allocation cannot silently expand to broker buying power",()=>{
 assert.equal(validatePaperExecutionGate({...base,virtualAllocationUsd:100000}).reason,"VIRTUAL_ALLOCATION_MUST_EQUAL_1000");
});


test("OTO verification treats a held stop child as unprotected only while there is exposure",()=>{
 const held={order_class:"oto",qty:"2",filled_qty:"0",legs:[{group_role:"stop_loss",type:"stop",status:"held",symbol:"AAPL",side:"sell",qty:"2",stop_price:"98"}]};
 const r=verifyOtoStopLeg(held,{symbol:"AAPL",qty:2,stopPrice:98});
 assert.equal(r.ok,true);
 assert.equal(r.protected,false);
 assert.equal(r.reason,"OTO_STOP_HELD_WITH_NO_EXPOSURE");
 assert.equal(r.exposedQty,0);
});

test("OTO verification rejects a held stop child when the parent has a partial fill",()=>{
 const order={order_class:"oto",qty:"5",filled_qty:"2",legs:[{group_role:"stop_loss",type:"stop",status:"held",symbol:"AAPL",side:"sell",qty:"2",stop_price:"98"}]};
 const r=verifyOtoStopLeg(order,{symbol:"AAPL",qty:5,stopPrice:98});
 assert.equal(r.ok,false);
 assert.equal(r.protected,false);
 assert.equal(r.reason,"PARTIAL_FILL_WITH_HELD_STOP_CHILD");
});

test("OTO verification accepts a matching active stop for actual partial exposure",()=>{
 const order={order_class:"oto",qty:"5",filled_qty:"2",legs:[{group_role:"stop_loss",type:"stop",status:"new",symbol:"AAPL",side:"sell",qty:"2",stop_price:"98"}]};
 const r=verifyOtoStopLeg(order,{symbol:"AAPL",qty:5,stopPrice:98});
 assert.equal(r.ok,true);
 assert.equal(r.protected,true);
 assert.equal(r.exposedQty,2);
});

test("OTO verification fails closed on missing, mismatched, rejected, or malformed stop legs",()=>{
 const good={order_class:"oto",qty:"2",filled_qty:"0",legs:[{group_role:"stop_loss",type:"stop",status:"held",symbol:"AAPL",side:"sell",qty:"2",stop_price:"98"}]};
 assert.equal(verifyOtoStopLeg({...good,legs:[]},{symbol:"AAPL",qty:2,stopPrice:98}).reason,"PROTECTIVE_STOP_LEG_MISSING_OR_MISMATCHED");
 assert.equal(verifyOtoStopLeg({...good,legs:[{...good.legs[0],stop_price:"97"}]},{symbol:"AAPL",qty:2,stopPrice:98}).ok,false);
 assert.equal(verifyOtoStopLeg({...good,legs:[{...good.legs[0],qty:"1"}]},{symbol:"AAPL",qty:2,stopPrice:98}).ok,false);
 assert.equal(verifyOtoStopLeg({...good,legs:[{...good.legs[0],status:"rejected"}]},{symbol:"AAPL",qty:2,stopPrice:98}).ok,false);
 assert.equal(verifyOtoStopLeg({...good,order_class:"simple"},{symbol:"AAPL",qty:2,stopPrice:98}).ok,false);
 assert.equal(verifyOtoStopLeg({...good,filled_qty:"NaN"},{symbol:"AAPL",qty:2,stopPrice:98}).reason,"PARENT_FILLED_QUANTITY_UNAVAILABLE");
 assert.equal(verifyOtoStopLeg({...good,qty:"3"},{symbol:"AAPL",qty:2,stopPrice:98}).reason,"PARENT_ORDER_QUANTITY_INVALID");
});

test("paper execution blocks a missing or unapproved strategy validation attestation",()=>{
 assert.equal(validatePaperExecutionGate({...base,strategyValidation:null}).reason,"STRATEGY_VALIDATION_NOT_APPROVED");
 assert.equal(validatePaperExecutionGate({...base,strategyValidation:{ok:false,approved:false}}).reason,"STRATEGY_VALIDATION_NOT_APPROVED");
});
