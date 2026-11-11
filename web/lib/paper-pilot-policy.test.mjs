import test from "node:test";
import assert from "node:assert/strict";
import {PAPER_PILOT_LIMITS,validatePaperEnvironment,sizePaperPilotOrder} from "./paper-pilot-policy.mjs";

const valid=(overrides={})=>({
 symbol:"AAPL",side:"buy",orderType:"limit",entryPrice:100,stopPrice:95,
 pilotCashUsd:1000,pilotEquityUsd:1000,deployedNotionalUsd:0,openOrderNotionalUsd:0,
 openRiskUsd:0,dailyLossUsd:0,openPositions:0,sectorExposureUsd:0,
 quoteTimestamp:1_000_000,now:1_000_010,strategyApproved:true,sessionArmed:true,
 killSwitch:false,environmentVerified:true,operatorAuthorized:true,...overrides
});

test("pilot risk limits are percentage-based and allocation is $1,000",()=>{
 assert.equal(PAPER_PILOT_LIMITS.allocationUsd,1000);
 assert.equal(PAPER_PILOT_LIMITS.riskPerTradePct,0.5);
 assert.equal(PAPER_PILOT_LIMITS.maxAggregateOpenRiskPct,1);
 assert.equal(PAPER_PILOT_LIMITS.dailyLossLimitPct,2);
 assert.equal(PAPER_PILOT_LIMITS.maxPositionNotionalPct,25);
});
test("paper environment accepts only exact paper host and active account",()=>{
 assert.equal(validatePaperEnvironment({mode:"paper",brokerHost:"https://paper-api.alpaca.markets",accountStatus:"ACTIVE",tradingBlocked:false,accountBlocked:false}).ok,true);
 assert.equal(validatePaperEnvironment({mode:"live",brokerHost:"https://paper-api.alpaca.markets",accountStatus:"ACTIVE"}).reason,"PAPER_MODE_REQUIRED");
 assert.equal(validatePaperEnvironment({mode:"paper",brokerHost:"https://api.alpaca.markets",accountStatus:"ACTIVE"}).reason,"PAPER_HOST_MISMATCH");
 assert.equal(validatePaperEnvironment({mode:"paper",brokerHost:"https://paper-api.alpaca.markets",accountStatus:"ACTIVE",tradingBlocked:true}).ok,false);
});
test("sizes a $100 position from its stop distance rather than a fixed $25 cap",()=>{
 const r=sizePaperPilotOrder(valid({entryPrice:100,stopPrice:98}));
 assert.equal(r.ok,true);
 assert.equal(r.orderPreview.notionalUsd,100);
 assert.equal(r.orderPreview.plannedRiskUsd,2);
 assert.equal(r.orderPreview.riskBudgetUsd,5);
});
test("risk budget is 0.5% of current pilot equity and adjusts dynamically",()=>{
 const r=sizePaperPilotOrder(valid({pilotCashUsd:500,pilotEquityUsd:800,entryPrice:100,stopPrice:90}));
 assert.equal(r.ok,true);
 assert.equal(r.orderPreview.riskBudgetUsd,4);
 assert.equal(r.orderPreview.plannedRiskUsd,4);
});
test("position sizing respects stop risk, 25% notional cap and $1,000 allocation",()=>{
 const r=sizePaperPilotOrder(valid());
 assert.equal(r.ok,true);
 assert.equal(r.orderPreview.plannedRiskUsd,5);
 assert.equal(r.orderPreview.notionalUsd,200);
 assert.equal(r.orderPreview.quantity,2);
 assert.ok(r.orderPreview.notionalUsd<=250);
 assert.equal(r.orderPreview.allocationLimitUsd,1000);
});
test("fails closed for missing authorization, unvalidated strategy, unarmed session and kill switch",()=>{
 assert.equal(sizePaperPilotOrder(valid({operatorAuthorized:false})).reason,"OPERATOR_NOT_AUTHORIZED");
 assert.equal(sizePaperPilotOrder(valid({strategyApproved:false})).reason,"STRATEGY_NOT_VALIDATED");
 assert.equal(sizePaperPilotOrder(valid({sessionArmed:false})).reason,"PAPER_SESSION_NOT_ARMED_OR_KILL_SWITCH_ON");
 assert.equal(sizePaperPilotOrder(valid({killSwitch:true})).reason,"PAPER_SESSION_NOT_ARMED_OR_KILL_SWITCH_ON");
});
test("blocks live, short, market, invalid symbol, stale and future quotes",()=>{
 assert.equal(sizePaperPilotOrder(valid({environmentVerified:false})).reason,"PAPER_ENVIRONMENT_NOT_VERIFIED");
 assert.equal(sizePaperPilotOrder(valid({side:"sell"})).reason,"LONG_ONLY");
 assert.equal(sizePaperPilotOrder(valid({orderType:"market"})).reason,"LIMIT_ORDERS_ONLY");
 assert.equal(sizePaperPilotOrder(valid({symbol:"BTC/USD"})).reason,"INVALID_US_SYMBOL");
 assert.equal(sizePaperPilotOrder(valid({now:1_100_000})).reason,"INVALID_STOP_CASH_OR_STALE_QUOTE");
 assert.equal(sizePaperPilotOrder(valid({quoteTimestamp:1_000_020})).reason,"INVALID_STOP_CASH_OR_STALE_QUOTE");
});
test("enforces the 2% daily stop, allocation and concurrent-position cap",()=>{
 assert.equal(sizePaperPilotOrder(valid({dailyLossUsd:20})).reason,"DAILY_LOSS_STOP_REACHED");
 assert.equal(sizePaperPilotOrder(valid({pilotCashUsd:1000,deployedNotionalUsd:1})).reason,"PILOT_ALLOCATION_EXCEEDED");
 assert.equal(sizePaperPilotOrder(valid({pilotCashUsd:1000,openOrderNotionalUsd:1})).reason,"PILOT_ALLOCATION_EXCEEDED");
 assert.equal(sizePaperPilotOrder(valid({openPositions:1})).reason,"MAX_CONCURRENT_POSITIONS_REACHED");
});
test("enforces aggregate open-risk cap and sizes down to remaining risk",()=>{
 assert.equal(sizePaperPilotOrder(valid({openRiskUsd:10})).reason,"AGGREGATE_OPEN_RISK_LIMIT_REACHED");
 const r=sizePaperPilotOrder(valid({openRiskUsd:8,entryPrice:100,stopPrice:95}));
 assert.equal(r.ok,true);
 assert.equal(r.orderPreview.plannedRiskUsd,2);
});
test("invalid stops, missing inputs and unaffordable shares are rejected",()=>{
 assert.equal(sizePaperPilotOrder(valid({stopPrice:100})).reason,"INVALID_STOP_CASH_OR_STALE_QUOTE");
 assert.equal(sizePaperPilotOrder(valid({pilotCashUsd:10})).reason,"NO_VALID_POSITION_SIZE");
 assert.equal(sizePaperPilotOrder(valid({pilotEquityUsd:undefined})).reason,"MISSING_OR_INVALID_RISK_INPUT");
});
test("preview is explicitly non-executing",()=>{
 const r=sizePaperPilotOrder(valid());
 assert.equal(r.execution,false);
 assert.match(r.note,/does not submit/);
});
test("blocks sector concentration above 40% of pilot equity",()=>{
 assert.equal(sizePaperPilotOrder(valid({sectorExposureUsd:390})).reason,"NO_VALID_POSITION_SIZE");
});
