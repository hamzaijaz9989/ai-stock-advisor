// Pure fail-closed gate for the one-time PAPER activation procedure.
// No broker calls, database writes, order creation, or control mutations occur here.
import {evaluatePortfolioRisk,deriveSnapshotRiskMetrics} from "./paper-order-guards.js";
import {evaluateStrategyApproval} from "./strategy-validation-gate.js";
import {PAPER_EXECUTION_LIMITS} from "./paper-execution-policy.js";

const finite=value=>value!==null&&value!==undefined&&value!==""&&Number.isFinite(Number(value));
const same=(a,b)=>String(a??"").trim().toLowerCase()===String(b??"").trim().toLowerCase();

export function validatePaperActivationConfiguration(env={}) {
  const issues=[];
  const operator=env.NORTHSTAR_OPERATOR_TOKEN;
  const reviewToken=env.NORTHSTAR_INTENT_REVIEW_TOKEN;
  const reviewer=String(env.NORTHSTAR_INTENT_REVIEWER||"").trim();
  const approvalToken=env.NORTHSTAR_PAPER_EXECUTION_APPROVAL_TOKEN;
  const approver=String(env.NORTHSTAR_PAPER_EXECUTION_APPROVER||"").trim();
  const accountId=String(env.NORTHSTAR_PAPER_ACCOUNT_ID||"").trim();
  if(typeof operator!=="string"||operator.length<16)issues.push("OPERATOR_TOKEN_NOT_CONFIGURED");
  if(typeof reviewToken!=="string"||reviewToken.length<32||reviewToken.length>256)issues.push("SEPARATE_INTENT_REVIEW_TOKEN_NOT_CONFIGURED");
  if(typeof approvalToken!=="string"||approvalToken.length<32||approvalToken.length>256)issues.push("SEPARATE_PAPER_EXECUTION_APPROVAL_TOKEN_NOT_CONFIGURED");
  if(typeof operator==="string"&&typeof reviewToken==="string"&&operator===reviewToken)issues.push("OPERATOR_AND_REVIEW_TOKENS_MUST_DIFFER");
  if(typeof operator==="string"&&typeof approvalToken==="string"&&operator===approvalToken)issues.push("OPERATOR_AND_PAPER_APPROVAL_TOKENS_MUST_DIFFER");
  if(typeof reviewToken==="string"&&typeof approvalToken==="string"&&reviewToken===approvalToken)issues.push("REVIEW_AND_PAPER_APPROVAL_TOKENS_MUST_DIFFER");
  if(reviewer.length<3||reviewer.length>120)issues.push("INDEPENDENT_INTENT_REVIEWER_NOT_CONFIGURED");
  if(approver.length<3||approver.length>120)issues.push("PAPER_EXECUTION_APPROVER_NOT_CONFIGURED");
  if(reviewer&&approver&&same(reviewer,approver))issues.push("PAPER_APPROVER_MUST_DIFFER_FROM_INTENT_REVIEWER");
  if(!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(accountId))issues.push("EXPECTED_PAPER_ACCOUNT_ID_NOT_CONFIGURED");
  return {ok:issues.length===0,issues,accountId:accountId||null,approver:approver||null,reviewer:reviewer||null};
}

export function evaluatePaperActivationGate({
  control,strategyApproval,snapshots,account,configuredAccountId,
  reconciliation,ledgerCounts,claim,quote,clock,now=Date.now()
}) {
  const block=(reason,details={})=>({ok:false,execution:false,status:"PAPER_ACTIVATION_BLOCKED",reason,details});
  if(!control||control.mode!=="paper"||Number(control.enabled)!==0||Number(control.kill_switch)!==1)return block("CONTROL_NOT_DISABLED_WITH_KILL_SWITCH_ENGAGED");
  if(Number(control.max_portfolio_usd)!==PAPER_EXECUTION_LIMITS.virtualCapitalUsd||
    Number(control.default_risk_fraction)!==PAPER_EXECUTION_LIMITS.defaultRiskFraction||
    Number(control.max_risk_fraction)!==PAPER_EXECUTION_LIMITS.maxRiskFraction||
    Number(control.max_position_fraction)!==PAPER_EXECUTION_LIMITS.maxPositionFraction)return block("PAPER_RISK_CONFIGURATION_MISMATCH");
  const strategy=evaluateStrategyApproval(strategyApproval);
  if(!strategy.ok)return block("STRATEGY_VALIDATION_NOT_APPROVED",{strategy});
  if(!account||String(account.id||"")!==String(configuredAccountId||""))return block("BROKER_ACCOUNT_ID_MISMATCH");
  if(account.status!=="ACTIVE"||account.trading_blocked||account.account_blocked||account.currency!=="USD")return block("PAPER_ACCOUNT_NOT_ACTIVE_OR_USD");
  const equity=Number(account.equity),lastEquity=Number(account.last_equity),buyingPower=Number(account.buying_power);
  if(![equity,lastEquity,buyingPower].every(Number.isFinite)||equity<=0||lastEquity<=0||buyingPower<=0)return block("BROKER_EQUITY_OR_BUYING_POWER_INVALID");
  if(clock?.is_open!==true)return block("MARKET_CLOCK_NOT_OPEN");
  const bid=Number(quote?.bid),ask=Number(quote?.ask),quoteAt=Date.parse(quote?.timestamp||"");
  const quoteAgeMs=now-quoteAt;
  if(!Number.isFinite(bid)||!Number.isFinite(ask)||bid<=0||ask<bid||!Number.isFinite(quoteAt)||quoteAgeMs<0||quoteAgeMs>60000)return block("PAPER_QUOTE_STALE_OR_INVALID");
  const spread=(ask-bid)/((ask+bid)/2);
  if(!Number.isFinite(spread)||spread>0.01)return block("PAPER_QUOTE_SPREAD_EXCEEDS_ONE_PERCENT",{spreadPct:Number((spread*100).toFixed(4))});
  if(!reconciliation||reconciliation.ok!==true||reconciliation.reconciled!==true||reconciliation.execution!==false||
    reconciliation.status!=="RECONCILIATION_PASSED_READ_ONLY")return block("READ_ONLY_RECONCILIATION_NOT_CLEAN");
  const reconciledAt=Date.parse(reconciliation.checkedAt||"");
  if(!Number.isFinite(reconciledAt)||reconciledAt>now||now-reconciledAt>60000)return block("READ_ONLY_RECONCILIATION_STALE");
  const counts=reconciliation.counts||{};
  const zeroCounts=["brokerPositions","ledgerPositions","fillDerivedPositions","brokerOrders","ledgerOrders"];
  if(zeroCounts.some(key=>Number(counts[key])!==0))return block("INITIAL_EXECUTOR_REQUIRES_FLAT_BROKER_AND_LEDGER",{counts});
  const mismatchGroups=["positions","fillDerivedPositions","orders"];
  if(!reconciliation.mismatches||mismatchGroups.some(key=>!Array.isArray(reconciliation.mismatches[key])||reconciliation.mismatches[key].length!==0))return block("RECONCILIATION_MISMATCH_DETAILS_MISSING_OR_NONEMPTY");
  if(!ledgerCounts||Number(ledgerCounts.orders)!==0||Number(ledgerCounts.positions)!==0||Number(ledgerCounts.pendingIntents)!==0)return block("NORTHSTAR_LEDGER_NOT_FLAT_OR_HAS_PENDING_INTENTS",{ledgerCounts});
  if(claim)return block("DURABLE_SINGLE_FLIGHT_CLAIM_ALREADY_EXISTS",{claimState:claim.state||"PRESENT"});
  if(!Array.isArray(snapshots)||snapshots.length<2)return block("SEVEN_DAY_EQUITY_HISTORY_UNAVAILABLE");
  const validSnapshots=snapshots.map(row=>({captured_at:row?.captured_at,equity_usd:row?.equity_usd}));
  const latest=[...validSnapshots].sort((a,b)=>Date.parse(b.captured_at)-Date.parse(a.captured_at))[0];
  const latestAt=Date.parse(latest?.captured_at||"");
  if(!Number.isFinite(latestAt)||latestAt>now||now-latestAt>15*60*1000)return block("RECONCILED_EQUITY_SNAPSHOT_NOT_FRESH");
  const weeklyBaseline=validSnapshots.filter(row=>{
    const at=Date.parse(row.captured_at||"");
    return Number.isFinite(at)&&at<=now-7*24*60*60*1000&&finite(row.equity_usd)&&Number(row.equity_usd)>0;
  }).sort((a,b)=>Date.parse(b.captured_at)-Date.parse(a.captured_at))[0];
  if(!weeklyBaseline)return block("VERIFIED_SEVEN_DAY_EQUITY_BASELINE_UNAVAILABLE");
  const history=deriveSnapshotRiskMetrics({
    snapshots:validSnapshots,currentEquity:equity,lastEquity,
    virtualAllocationUsd:PAPER_EXECUTION_LIMITS.virtualCapitalUsd,now
  });
  if(!history.ok)return block("EQUITY_HISTORY_RISK_METRICS_UNVERIFIED",{reason:history.reason});
  const virtualBuyingPower=buyingPower*(PAPER_EXECUTION_LIMITS.virtualCapitalUsd/equity);
  const portfolioRisk=evaluatePortfolioRisk({
    account:{status:account.status,trading_blocked:account.trading_blocked,account_blocked:account.account_blocked,equity:PAPER_EXECUTION_LIMITS.virtualCapitalUsd,buying_power:virtualBuyingPower},
    positions:[],
    limits:{
      maxPortfolioUsd:PAPER_EXECUTION_LIMITS.virtualCapitalUsd,
      maxPositionFraction:PAPER_EXECUTION_LIMITS.maxPositionFraction,
      maxRiskFraction:PAPER_EXECUTION_LIMITS.maxRiskFraction,
      maxDailyLossFraction:PAPER_EXECUTION_LIMITS.dailyLossCapUsd/PAPER_EXECUTION_LIMITS.virtualCapitalUsd,
      maxDrawdownFraction:PAPER_EXECUTION_LIMITS.maxDrawdownUsd/PAPER_EXECUTION_LIMITS.virtualCapitalUsd
    },
    dailyLossUsd:history.dailyLossUsd,maxDrawdownUsd:history.maxDrawdownUsd
  });
  if(!portfolioRisk.ok)return block("PORTFOLIO_DAILY_LOSS_OR_DRAWDOWN_GATE_BLOCKED",{portfolioRisk,history});
  return {
    ok:true,execution:false,status:"PAPER_ACTIVATION_GATE_PASSED_NOT_ENABLED",
    strategyValidation:strategy,
    risk:{status:portfolioRisk.status,dailyLossUsd:history.dailyLossUsd,maxDrawdownUsd:history.maxDrawdownUsd,history:history.history},
    evidence:{
      accountId:account.id,accountStatus:account.status,currency:account.currency,paperApiHost:"paper-api.alpaca.markets",
      reconciliationStatus:reconciliation.status,reconciliationCheckedAt:reconciliation.checkedAt,
      brokerPositions:0,brokerOrders:0,ledgerPositions:0,ledgerOrders:0,fillDerivedPositions:0,
      latestSnapshotAt:latest.captured_at,weeklyBaselineAt:weeklyBaseline.captured_at,
      quoteSymbol:"SPY",quoteAt:quote.timestamp,quoteAgeMs,quoteSpreadPct:Number((spread*100).toFixed(4)),marketOpen:true,
      dailyLossUsd:history.dailyLossUsd,maxDrawdownUsd:history.maxDrawdownUsd,
      virtualCapitalUsd:PAPER_EXECUTION_LIMITS.virtualCapitalUsd,maxPositionUsd:PAPER_EXECUTION_LIMITS.maxPositionUsd,
      maxRiskUsd:PAPER_EXECUTION_LIMITS.maxRiskUsd,dailyLossCapUsd:PAPER_EXECUTION_LIMITS.dailyLossCapUsd,
      maxDrawdownCapUsd:PAPER_EXECUTION_LIMITS.maxDrawdownUsd,strategyReportSha256:strategy.reportSha256
    }
  };
}
