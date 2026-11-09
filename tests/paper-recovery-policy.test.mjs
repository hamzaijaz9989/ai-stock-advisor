import test from "node:test";
import assert from "node:assert/strict";
import {evaluatePartialFillRecovery} from "../web/lib/paper-recovery-policy.js";

const now=Date.parse("2026-11-09T06:55:00.000Z");
const parent=(overrides={})=>({id:"parent-1",symbol:"AAPL",side:"buy",qty:"5",filled_qty:"2",status:"canceled",...overrides});
const child=(overrides={})=>({id:"child-1",symbol:"AAPL",side:"sell",type:"stop",qty:"5",filled_qty:"0",leaves_qty:"5",stop_price:"95",status:"new",...overrides});
const quote=(overrides={})=>({bid:99,ask:99.1,timestamp:new Date(now-1000).toISOString(),...overrides});
const evaluate=(overrides={})=>evaluatePartialFillRecovery({
  parent:parent(),stopPrice:95,brokerPosition:{qty:"2",side:"long"},quote:quote(),now,...overrides
});

test("open parent requires cancellation before any protection decision",()=>{
  const result=evaluate({parent:parent({status:"partially_filled"})});
  assert.equal(result.action,"CANCEL_PARENT_REMAINDER");
});
test("pending cancellation waits and does not place a second order",()=>{
  const result=evaluate({parent:parent({status:"pending_cancel"})});
  assert.equal(result.action,"WAIT_FOR_CANCEL_CONFIRMATION");
});
test("canceled zero-fill order completes without a stop",()=>{
  const result=evaluate({parent:parent({filled_qty:"0"}),brokerPosition:null,quote:null});
  assert.equal(result.action,"COMPLETED_NO_EXPOSURE");
});
test("partial fill after terminal cancellation recommends exact standalone GTC stop",()=>{
  const result=evaluate();
  assert.equal(result.action,"PLACE_STANDALONE_GTC_STOP");
  assert.deepEqual(result.order,{symbol:"AAPL",qty:2,side:"sell",type:"stop",time_in_force:"gtc",stop_price:95});
  assert.equal(result.executionPriceNotGuaranteed,true);
});
test("fully verified active OTO stop is accepted without creating another stop",()=>{
  const result=evaluate({parent:parent({status:"filled",filled_qty:"5"}),stopChild:child(),brokerPosition:{qty:"5",side:"long"}});
  assert.equal(result.action,"PROTECTED_BY_EXISTING_OTO_STOP");
});
test("partially filled OTO stop is accepted only when leaves exactly equal the remaining position",()=>{
  const result=evaluate({stopChild:child({status:"partially_filled",filled_qty:"1",leaves_qty:"1",qty:"2"}),brokerPosition:{qty:"1",side:"long"}});
  assert.equal(result.action,"PROTECTED_BY_EXISTING_OTO_STOP");
});
test("active OTO stop with undercoverage is manual recovery",()=>{
  const result=evaluate({stopChild:child({qty:"1",leaves_qty:"1"})});
  assert.equal(result.action,"MANUAL_RECOVERY_REQUIRED");
  assert.equal(result.reason,"ACTIVE_OTO_STOP_DOES_NOT_COVER_EXACT_REMAINING_POSITION");
});
test("held OTO child is explicitly canceled only after broker exposure reconciles",()=>{
  const result=evaluate({stopChild:child({status:"held"})});
  assert.equal(result.action,"CANCEL_HELD_STOP_CHILD");
  assert.equal(result.heldStopOrderId,"child-1");
});
test("held OTO child with a broker-position mismatch remains manual recovery",()=>{
  const result=evaluate({stopChild:child({status:"held"}),brokerPosition:{qty:"3",side:"long"}});
  assert.equal(result.action,"MANUAL_RECOVERY_REQUIRED");
  assert.equal(result.reason,"BROKER_POSITION_DOES_NOT_MATCH_ENTRY_MINUS_STOP_FILLS");
});
test("position mismatch blocks standalone stop placement",()=>{
  const result=evaluate({brokerPosition:{qty:"3",side:"long"}});
  assert.equal(result.action,"MANUAL_RECOVERY_REQUIRED");
  assert.equal(result.reason,"BROKER_POSITION_DOES_NOT_MATCH_ENTRY_MINUS_STOP_FILLS");
});
test("stale quote blocks standalone stop placement",()=>{
  const result=evaluate({quote:quote({timestamp:new Date(now-61000).toISOString()})});
  assert.equal(result.action,"MANUAL_RECOVERY_REQUIRED");
  assert.equal(result.reason,"FRESH_BID_REQUIRED_BEFORE_STANDALONE_STOP");
});
test("already breached stop price blocks automatic recovery",()=>{
  const result=evaluate({quote:quote({bid:94.99})});
  assert.equal(result.action,"MANUAL_RECOVERY_REQUIRED");
  assert.equal(result.reason,"STOP_PRICE_ALREADY_BREACHED_OR_AT_MARKET");
});
test("unknown parent state fails closed",()=>{
  const result=evaluate({parent:parent({status:"replaced"})});
  assert.equal(result.action,"MANUAL_RECOVERY_REQUIRED");
});
test("filled parent with incomplete cumulative quantity fails closed",()=>{
  const result=evaluate({parent:parent({status:"filled",filled_qty:"4"}),brokerPosition:{qty:"4",side:"long"}});
  assert.equal(result.action,"MANUAL_RECOVERY_REQUIRED");
});
test("canceled child with prior stop fills permits protection of only the reconciled remainder",()=>{
  const result=evaluate({stopChild:child({status:"canceled",qty:"5",filled_qty:"1",leaves_qty:"0"}),brokerPosition:{qty:"1",side:"long"}});
  assert.equal(result.action,"PLACE_STANDALONE_GTC_STOP");
  assert.equal(result.order.qty,1);
});
test("sell or short broker positions are never treated as long exposure to protect",()=>{
  const result=evaluate({brokerPosition:{qty:"2",side:"short"}});
  assert.equal(result.action,"MANUAL_RECOVERY_REQUIRED");
});
test("invalid cumulative fills fail closed",()=>{
  const result=evaluate({parent:parent({filled_qty:"6"})});
  assert.equal(result.action,"MANUAL_RECOVERY_REQUIRED");
});

test("non-buy parent orders are never eligible for long-position recovery",()=>{
  const result=evaluate({parent:parent({side:"sell"})});
  assert.equal(result.action,"MANUAL_RECOVERY_REQUIRED");
  assert.equal(result.reason,"PARENT_ORDER_OR_STOP_FIELDS_INVALID");
});
test("new parent with a nonzero fill snapshot is inconsistent and blocked",()=>{
  const result=evaluate({parent:parent({status:"new",filled_qty:"1"})});
  assert.equal(result.action,"MANUAL_RECOVERY_REQUIRED");
  assert.equal(result.reason,"UNFILLED_PARENT_STATUS_HAS_NONZERO_CUMULATIVE_QUANTITY");
});
test("partially filled parent with zero cumulative fills is inconsistent and blocked",()=>{
  const result=evaluate({parent:parent({status:"partially_filled",filled_qty:"0"}),brokerPosition:null});
  assert.equal(result.action,"MANUAL_RECOVERY_REQUIRED");
  assert.equal(result.reason,"PARTIAL_PARENT_HAS_INVALID_CUMULATIVE_QUANTITY");
});
