import test from "node:test";
import assert from "node:assert/strict";
import {evaluateStrategyApproval,REQUIRED_STRATEGY_VERSION} from "../web/lib/strategy-validation-gate.js";

const approved={
  approved:1,
  strategy_version:REQUIRED_STRATEGY_VERSION,
  report_version:3,
  report_sha256:"a".repeat(64),
  report_uri:"https://github.com/hamzaijaz9989/ai-stock-advisor/blob/main/docs/strategy-validation-report.md",
  approved_at:"2026-11-09T05:00:00.000Z",
  reviewer:"independent-reviewer"
};

test("missing strategy approval record fails closed",()=>{
  const result=evaluateStrategyApproval(null);
  assert.equal(result.ok,false);
  assert.ok(result.issues.includes("STRATEGY_APPROVAL_RECORD_MISSING"));
});

test("seeded NOT APPROVED state cannot authorize BUY",()=>{
  const result=evaluateStrategyApproval({approved:0,strategy_version:REQUIRED_STRATEGY_VERSION});
  assert.equal(result.ok,false);
  assert.equal(result.approved,false);
  assert.ok(result.issues.includes("STRATEGY_VALIDATION_NOT_APPROVED"));
});

test("complete versioned independent approval record passes the pure validator",()=>{
  const result=evaluateStrategyApproval(approved);
  assert.equal(result.ok,true);
  assert.equal(result.execution,false);
  assert.equal(result.status,"STRATEGY_VALIDATION_APPROVED");
  assert.equal(result.reportVersion,3);
});

test("wrong strategy version, report hash, report URI, timestamp or reviewer fail closed",()=>{
  for(const patch of [
    {strategy_version:"different-strategy"},
    {report_sha256:"not-a-hash"},
    {report_uri:"http://example.com/report"},
    {approved_at:"not-a-date"},
    {reviewer:"   "}
  ]){
    const result=evaluateStrategyApproval({...approved,...patch});
    assert.equal(result.ok,false);
  }
});
