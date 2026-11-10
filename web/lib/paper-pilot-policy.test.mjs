import test from "node:test";
import assert from "node:assert/strict";
import { PAPER_PILOT_LIMITS, validatePaperEnvironment, sizePaperPilotOrder } from "./paper-pilot-policy.mjs";

const valid = (overrides = {}) => ({
  symbol: "AAPL", side: "buy", orderType: "limit", entryPrice: 100, stopPrice: 95,
  pilotCashUsd: 2500, deployedNotionalUsd: 0, openOrderNotionalUsd: 0,
  dailyLossUsd: 0, openPositions: 0, sectorExposureUsd: 0,
  quoteTimestamp: 1_000_000, now: 1_000_010,
  strategyApproved: true, sessionArmed: true, killSwitch: false,
  environmentVerified: true, operatorAuthorized: true, ...overrides
});

test("pilot limits match the user's approved caps", () => {
  assert.equal(PAPER_PILOT_LIMITS.allocationUsd, 2500);
  assert.equal(PAPER_PILOT_LIMITS.maxRiskPerTradeUsd, 25);
  assert.equal(PAPER_PILOT_LIMITS.dailyLossLimitUsd, 50);
});

test("paper environment accepts only the exact paper host and active account", () => {
  assert.equal(validatePaperEnvironment({mode:"paper",brokerHost:"https://paper-api.alpaca.markets",accountStatus:"ACTIVE",tradingBlocked:false,accountBlocked:false}).ok, true);
  assert.equal(validatePaperEnvironment({mode:"live",brokerHost:"https://paper-api.alpaca.markets",accountStatus:"ACTIVE"}).reason, "PAPER_MODE_REQUIRED");
  assert.equal(validatePaperEnvironment({mode:"paper",brokerHost:"https://api.alpaca.markets",accountStatus:"ACTIVE"}).reason, "PAPER_HOST_MISMATCH");
  assert.equal(validatePaperEnvironment({mode:"paper",brokerHost:"https://paper-api.alpaca.markets",accountStatus:"ACTIVE",tradingBlocked:true}).ok, false);
});

test("sizes down to at most $25 planned risk and never exceeds pilot cash", () => {
  const r = sizePaperPilotOrder(valid());
  assert.equal(r.ok, true);
  assert.ok(r.orderPreview.plannedRiskUsd <= 25);
  assert.ok(r.orderPreview.notionalUsd <= 2500);
  assert.equal(r.orderPreview.quantity, 5);
});

test("fails closed for missing authorization, unvalidated strategy, unarmed session, and kill switch", () => {
  assert.equal(sizePaperPilotOrder(valid({operatorAuthorized:false})).reason, "OPERATOR_NOT_AUTHORIZED");
  assert.equal(sizePaperPilotOrder(valid({strategyApproved:false})).reason, "STRATEGY_NOT_VALIDATED");
  assert.equal(sizePaperPilotOrder(valid({sessionArmed:false})).reason, "PAPER_SESSION_NOT_ARMED_OR_KILL_SWITCH_ON");
  assert.equal(sizePaperPilotOrder(valid({killSwitch:true})).reason, "PAPER_SESSION_NOT_ARMED_OR_KILL_SWITCH_ON");
});

test("blocks live/short/market/invalid symbols and stale or future quotes", () => {
  assert.equal(sizePaperPilotOrder(valid({environmentVerified:false})).reason, "PAPER_ENVIRONMENT_NOT_VERIFIED");
  assert.equal(sizePaperPilotOrder(valid({side:"sell"})).reason, "LONG_ONLY");
  assert.equal(sizePaperPilotOrder(valid({orderType:"market"})).reason, "LIMIT_ORDERS_ONLY");
  assert.equal(sizePaperPilotOrder(valid({symbol:"BTC/USD"})).reason, "INVALID_US_SYMBOL");
  assert.equal(sizePaperPilotOrder(valid({now:1_100_000})).reason, "INVALID_STOP_CASH_OR_STALE_QUOTE");
  assert.equal(sizePaperPilotOrder(valid({quoteTimestamp:1_000_020})).reason, "INVALID_STOP_CASH_OR_STALE_QUOTE");
});

test("blocks daily stop, allocation overflow, and concurrent position cap", () => {
  assert.equal(sizePaperPilotOrder(valid({dailyLossUsd:50})).reason, "DAILY_LOSS_STOP_REACHED");
  assert.equal(sizePaperPilotOrder(valid({pilotCashUsd:2500,deployedNotionalUsd:1})).reason, "PILOT_ALLOCATION_EXCEEDED");
  assert.equal(sizePaperPilotOrder(valid({openPositions:1})).reason, "MAX_CONCURRENT_POSITIONS_REACHED");
});

test("invalid stop and no affordable share are rejected", () => {
  assert.equal(sizePaperPilotOrder(valid({stopPrice:100})).reason, "INVALID_STOP_CASH_OR_STALE_QUOTE");
  assert.equal(sizePaperPilotOrder(valid({pilotCashUsd:10})).reason, "NO_VALID_POSITION_SIZE");
});

test("preview is explicitly non-executing", () => {
  const r = sizePaperPilotOrder(valid());
  assert.equal(r.execution, false);
  assert.match(r.note, /does not submit/);
});

test("blocks a position that would breach the sector exposure cap", () => {
  assert.equal(sizePaperPilotOrder(valid({sectorExposureUsd: 990})).reason, "SECTOR_EXPOSURE_LIMIT_EXCEEDED");
});
