import test from "node:test";
import assert from "node:assert/strict";
import {readFile} from "node:fs/promises";

async function load(){
 const helper=await readFile(new URL("../web/lib/strategy-validation-gate.js",import.meta.url),"utf8");
 const helperUrl="data:text/javascript;base64,"+Buffer.from(helper).toString("base64");
 const policy=await readFile(new URL("../web/lib/paper-execution-policy.js",import.meta.url),"utf8");
 const policyUrl="data:text/javascript;base64,"+Buffer.from(policy).toString("base64");
 let source=await readFile(new URL("../web/functions/api/paper/readiness.js",import.meta.url),"utf8");
 source=source.replace('from "../../../lib/strategy-validation-gate.js"','from "'+helperUrl+'"');
 source=source.replace('from "../../../lib/paper-execution-policy.js"','from "'+policyUrl+'"');
 return import("data:text/javascript;base64,"+Buffer.from(source).toString("base64"));
}
const control={enabled:0,mode:"paper",kill_switch:1,max_portfolio_usd:1000,default_risk_fraction:0.005,max_risk_fraction:0.01,max_position_fraction:0.25};
const approved={approved:1,strategy_version:"northstar-provisional-gates-v1",report_version:3,report_sha256:"a".repeat(64),report_uri:"https://github.com/hamzaijaz9989/ai-stock-advisor/blob/main/docs/strategy-validation-report.md",approved_at:"2026-11-09T05:00:00.000Z",reviewer:"independent-reviewer"};
function db(approval){
 return {prepare(sql){return {async first(){if(sql.includes("execution_control"))return control;if(sql.includes("northstar_strategy_approval"))return approval;throw new Error("unexpected SQL "+sql);}};}};
}
test("missing D1 binding fails closed and reports execution disabled",async()=>{
 const {onRequestGet}=await load();
 const response=await onRequestGet({env:{}});
 const body=await response.json();
 assert.equal(response.status,503);
 assert.equal(body.executionEnabled,false);
 assert.equal(body.killSwitchEngaged,true);
});
test("readiness reports safe controls but keeps BUY blocked when strategy is not approved",async()=>{
 const {onRequestGet}=await load();
 const response=await onRequestGet({env:{NORTHSTAR_DB:db({approved:0,strategy_version:"northstar-provisional-gates-v1"})}});
 const body=await response.json();
 assert.equal(response.status,200);
 assert.equal(body.policyVerified,true);
 assert.equal(body.executionEnabled,false);
 assert.equal(body.killSwitchEngaged,true);
 assert.equal(body.strategyValidationApproved,false);
 assert.equal(body.strategyValidation.status,"STRATEGY_VALIDATION_NOT_APPROVED");
 assert.match(body.message,/BUY and paper order submission remain blocked/i);
});
test("readiness fails closed when strategy approval record is missing",async()=>{
 const {onRequestGet}=await load();
 const response=await onRequestGet({env:{NORTHSTAR_DB:db(null)}});
 const body=await response.json();
 assert.equal(response.status,200);
 assert.equal(body.strategyValidationApproved,false);
 assert.ok(body.strategyValidation.issues.includes("STRATEGY_APPROVAL_RECORD_MISSING"));
});
test("a valid strategy attestation does not enable execution or release the kill switch",async()=>{
 const {onRequestGet}=await load();
 const response=await onRequestGet({env:{NORTHSTAR_DB:db(approved)}});
 const body=await response.json();
 assert.equal(response.status,200);
 assert.equal(body.strategyValidationApproved,true);
 assert.equal(body.executionEnabled,false);
 assert.equal(body.killSwitchEngaged,true);
});
test("policy drift fails closed",async()=>{
 const {onRequestGet}=await load();
 const dbWithDrift={prepare(sql){return {async first(){if(sql.includes("execution_control"))return {...control,enabled:1};return approved;}};}};
 const response=await onRequestGet({env:{NORTHSTAR_DB:dbWithDrift}});
 const body=await response.json();
 assert.equal(response.status,503);
 assert.equal(body.executionEnabled,false);
});
test("missing control row fails closed",async()=>{
 const {onRequestGet}=await load();
 const dbMissing={prepare(sql){return {async first(){if(sql.includes("execution_control"))return null;return approved;}};}};
 const response=await onRequestGet({env:{NORTHSTAR_DB:dbMissing}});
 const body=await response.json();
 assert.equal(response.status,503);
 assert.equal(body.executionEnabled,false);
});

test("readiness reports every immutable risk cap",async()=>{
 const {onRequestGet}=await load();
 const response=await onRequestGet({env:{NORTHSTAR_DB:db({approved:0,strategy_version:"northstar-provisional-gates-v1"})}});
 const body=await response.json();
 assert.equal(response.status,200);
 assert.deepEqual(body.limits,{virtualCapitalUsd:1000,defaultRiskUsd:5,maxRiskUsd:10,maxPositionUsd:250,dailyLossCapUsd:20,maxDrawdownUsd:80});
 assert.equal(body.executionEnabled,false);
 assert.equal(body.killSwitchEngaged,true);
});
