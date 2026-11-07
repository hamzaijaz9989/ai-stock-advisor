import test from "node:test";
import assert from "node:assert/strict";
import {validateOrderTransition,validateFillUpdate,validateIdempotency,evaluatePortfolioRisk} from "../web/lib/paper-order-guards.js";

test("order lifecycle permits forward progress and blocks terminal-state resurrection",()=>{
 assert.equal(validateOrderTransition("PREVIEWED","SUBMITTING").ok,true);
 assert.equal(validateOrderTransition("FILLED","ACCEPTED").reason,"ILLEGAL_STATUS_TRANSITION");
 assert.equal(validateOrderTransition("CANCELED","FILLED").ok,false);
});
test("UNKNOWN remains explicitly resolvable but never implies a blind resubmission",()=>{
 assert.equal(validateOrderTransition("UNKNOWN","ACCEPTED").ok,true);
 assert.equal(validateOrderTransition("UNKNOWN","SUBMITTING").ok,false);
});
test("fill quantities are monotonic, bounded and priced",()=>{
 assert.equal(validateFillUpdate({orderQty:10,previousFilledQty:2,nextFilledQty:3,averageFillPrice:12}).ok,true);
 assert.equal(validateFillUpdate({orderQty:10,previousFilledQty:3,nextFilledQty:2,averageFillPrice:12}).reason,"CUMULATIVE_FILL_DECREASED");
 assert.equal(validateFillUpdate({orderQty:10,previousFilledQty:0,nextFilledQty:11,averageFillPrice:12}).reason,"OVERFILL");
 assert.equal(validateFillUpdate({orderQty:10,previousFilledQty:0,nextFilledQty:1,averageFillPrice:null}).reason,"INVALID_AVERAGE_FILL_PRICE");
});
test("idempotency permits exact replay but blocks same-key changed request",()=>{
 assert.equal(validateIdempotency({incomingRequestHash:"abc"}).ok,true);
 assert.equal(validateIdempotency({existingRequestHash:"abc",incomingRequestHash:"abc"}).reason,"SAFE_REPLAY");
 assert.equal(validateIdempotency({existingRequestHash:"abc",incomingRequestHash:"xyz"}).reason,"IDEMPOTENCY_KEY_CONFLICT");
});
test("risk evaluator fails closed without verified daily loss and drawdown",()=>{
 const r=evaluatePortfolioRisk({account:{status:"ACTIVE",equity:1000,buying_power:1000},positions:[],limits:{maxPortfolioUsd:1000,maxPositionFraction:.25,maxRiskFraction:.01}});
 assert.equal(r.ok,false); assert.equal(r.reason,"DAILY_LOSS_OR_DRAWDOWN_NOT_VERIFIED");
});
test("risk evaluator blocks excess exposure and restricted accounts",()=>{
 const limits={maxPortfolioUsd:1000,maxPositionFraction:.25,maxRiskFraction:.01};
 const r=evaluatePortfolioRisk({account:{status:"ACTIVE",equity:1000,buying_power:500},positions:[{symbol:"AAPL",market_value:300}],limits,dailyLossUsd:0,maxDrawdownUsd:0});
 assert.equal(r.ok,false); assert.ok(r.breaches.includes("POSITION_CONCENTRATION_LIMIT"));
 const b=evaluatePortfolioRisk({account:{status:"ACTIVE",trading_blocked:true,equity:1000,buying_power:500},positions:[],limits,dailyLossUsd:0,maxDrawdownUsd:0});
 assert.ok(b.breaches.includes("BROKER_ACCOUNT_RESTRICTED"));
});
