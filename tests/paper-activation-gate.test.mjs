import test from "node:test";
import assert from "node:assert/strict";
import {evaluatePaperActivationGate,validatePaperActivationConfiguration} from "../web/lib/paper-activation-gate.js";

const now=Date.parse("2026-11-09T20:56:00.000Z");
const accountId="11111111-1111-4111-8111-111111111111";
function config(overrides={}) {
  return {
    NORTHSTAR_OPERATOR_TOKEN:"operator-token-with-more-than-16-chars",
    NORTHSTAR_INTENT_REVIEW_TOKEN:"review-token-with-at-least-32-characters",
    NORTHSTAR_INTENT_REVIEWER:"Independent Intent Reviewer",
    NORTHSTAR_PAPER_EXECUTION_APPROVAL_TOKEN:"paper-approval-token-with-at-least-32-chars",
    NORTHSTAR_PAPER_EXECUTION_APPROVER:"Hamza Ijaz",
    NORTHSTAR_PAPER_ACCOUNT_ID:accountId,
    ...overrides
  };
}
function fixture(overrides={}) {
  const latest=new Date(now-5000).toISOString();
  const weekly=new Date(now-8*24*60*60*1000).toISOString();
  return {
    control:{enabled:0,mode:"paper",kill_switch:1,max_portfolio_usd:1000,default_risk_fraction:0.005,max_risk_fraction:0.01,max_position_fraction:0.25},
    strategyApproval:{approved:1,strategy_version:"northstar-provisional-gates-v1",report_version:1,report_sha256:"a".repeat(64),report_uri:"https://example.test/report",approved_at:new Date(now-60000).toISOString(),reviewer:"Independent Strategy Reviewer"},
    snapshots:[{captured_at:latest,equity_usd:100000},{captured_at:weekly,equity_usd:100000}],
    account:{id:accountId,status:"ACTIVE",currency:"USD",equity:100000,last_equity:100000,buying_power:400000,trading_blocked:false,account_blocked:false},
    configuredAccountId:accountId,
    reconciliation:{ok:true,reconciled:true,execution:false,status:"RECONCILIATION_PASSED_READ_ONLY",checkedAt:new Date(now-10000).toISOString(),counts:{brokerPositions:0,ledgerPositions:0,fillDerivedPositions:0,brokerOrders:0,ledgerOrders:0},mismatches:{positions:[],fillDerivedPositions:[],orders:[]}},
    ledgerCounts:{orders:0,positions:0,pendingIntents:0},
    claim:null,
    quote:{bid:100,ask:100.1,timestamp:new Date(now-5000).toISOString()},
    clock:{is_open:true},
    now,
    ...overrides
  };
}

test("activation configuration requires separate operator, reviewer and approver controls",()=>{
  const result=validatePaperActivationConfiguration(config());
  assert.equal(result.ok,true);
  assert.equal(result.accountId,accountId);
  assert.equal(result.approver,"Hamza Ijaz");
  assert.equal(JSON.stringify(result).includes("operator-token"),false);
  assert.equal(JSON.stringify(result).includes("paper-approval-token"),false);
});

test("activation configuration rejects shared credentials and shared reviewer identity",()=>{
  assert.equal(validatePaperActivationConfiguration(config({NORTHSTAR_PAPER_EXECUTION_APPROVAL_TOKEN:"operator-token-with-more-than-16-chars"})).ok,false);
  assert.equal(validatePaperActivationConfiguration(config({NORTHSTAR_PAPER_EXECUTION_APPROVER:"independent intent reviewer"})).ok,false);
  assert.equal(validatePaperActivationConfiguration(config({NORTHSTAR_PAPER_ACCOUNT_ID:""})).ok,false);
});

test("all PAPER activation gates pass only with fresh, flat and independently approved evidence",()=>{
  const result=evaluatePaperActivationGate(fixture());
  assert.equal(result.ok,true);
  assert.equal(result.execution,false);
  assert.equal(result.status,"PAPER_ACTIVATION_GATE_PASSED_NOT_ENABLED");
  assert.equal(result.evidence.paperApiHost,"paper-api.alpaca.markets");
  assert.equal(result.evidence.virtualCapitalUsd,1000);
  assert.equal(result.evidence.maxPositionUsd,250);
  assert.equal(result.evidence.maxRiskUsd,10);
  assert.equal(result.evidence.dailyLossCapUsd,20);
  assert.equal(result.evidence.maxDrawdownCapUsd,80);
});

test("strategy approval and exact broker PAPER account identity are mandatory",()=>{
  assert.equal(evaluatePaperActivationGate(fixture({strategyApproval:{approved:0}})).reason,"STRATEGY_VALIDATION_NOT_APPROVED");
  assert.equal(evaluatePaperActivationGate(fixture({configuredAccountId:"22222222-2222-4222-8222-222222222222"})).reason,"BROKER_ACCOUNT_ID_MISMATCH");
  assert.equal(evaluatePaperActivationGate(fixture({account:{...fixture().account,status:"INACTIVE"}})).reason,"PAPER_ACCOUNT_NOT_ACTIVE_OR_USD");
});

test("fresh quote, narrow spread and open market clock are required",()=>{
  const f=fixture();
  assert.equal(evaluatePaperActivationGate({...f,quote:{...f.quote,timestamp:new Date(now-61000).toISOString()}}).reason,"PAPER_QUOTE_STALE_OR_INVALID");
  assert.equal(evaluatePaperActivationGate({...f,quote:{...f.quote,ask:102}}).reason,"PAPER_QUOTE_SPREAD_EXCEEDS_ONE_PERCENT");
  assert.equal(evaluatePaperActivationGate({...f,clock:{is_open:false}}).reason,"MARKET_CLOCK_NOT_OPEN");
});

test("clean fresh read-only reconciliation and an empty initial ledger are required",()=>{
  const f=fixture();
  assert.equal(evaluatePaperActivationGate({...f,reconciliation:{...f.reconciliation,status:"RECONCILIATION_MISMATCH_FAIL_CLOSED"}}).reason,"READ_ONLY_RECONCILIATION_NOT_CLEAN");
  assert.equal(evaluatePaperActivationGate({...f,reconciliation:{...f.reconciliation,counts:{...f.reconciliation.counts,brokerOrders:1}}}).reason,"INITIAL_EXECUTOR_REQUIRES_FLAT_BROKER_AND_LEDGER");
  assert.equal(evaluatePaperActivationGate({...f,ledgerCounts:{orders:0,positions:0,pendingIntents:1}}).reason,"NORTHSTAR_LEDGER_NOT_FLAT_OR_HAS_PENDING_INTENTS");
  assert.equal(evaluatePaperActivationGate({...f,claim:{state:"SUBMITTED"}}).reason,"DURABLE_SINGLE_FLIGHT_CLAIM_ALREADY_EXISTS");
});

test("fresh 15-minute snapshot and seven-day baseline are both mandatory",()=>{
  const f=fixture();
  assert.equal(evaluatePaperActivationGate({...f,snapshots:[{captured_at:new Date(now-16*60*1000).toISOString(),equity_usd:100000},f.snapshots[1]]}).reason,"RECONCILED_EQUITY_SNAPSHOT_NOT_FRESH");
  assert.equal(evaluatePaperActivationGate({...f,snapshots:[f.snapshots[0],{captured_at:new Date(now-6*24*60*60*1000).toISOString(),equity_usd:100000}]}).reason,"VERIFIED_SEVEN_DAY_EQUITY_BASELINE_UNAVAILABLE");
});

test("daily loss and maximum drawdown limits remain hard activation gates",()=>{
  const f=fixture();
  const dailyLoss={...f,account:{...f.account,equity:97900,last_equity:100000}};
  assert.equal(evaluatePaperActivationGate(dailyLoss).reason,"PORTFOLIO_DAILY_LOSS_OR_DRAWDOWN_GATE_BLOCKED");
  const drawdown={...f,account:{...f.account,equity:92000,last_equity:92000},snapshots:[
    {captured_at:new Date(now-8*24*60*60*1000).toISOString(),equity_usd:100000},
    {captured_at:new Date(now-5000).toISOString(),equity_usd:92000}
  ]};
  assert.equal(evaluatePaperActivationGate(drawdown).reason,"PORTFOLIO_DAILY_LOSS_OR_DRAWDOWN_GATE_BLOCKED");
});

test("inconsistent control state and stale reconciliation fail closed",()=>{
  const f=fixture();
  assert.equal(evaluatePaperActivationGate({...f,control:{...f.control,enabled:1}}).reason,"CONTROL_NOT_DISABLED_WITH_KILL_SWITCH_ENGAGED");
  assert.equal(evaluatePaperActivationGate({...f,reconciliation:{...f.reconciliation,checkedAt:new Date(now-61000).toISOString()}}).reason,"READ_ONLY_RECONCILIATION_STALE");
});
