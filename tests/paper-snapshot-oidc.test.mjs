import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {onRequestPost} from "../web/functions/api/paper/snapshot.js";

const url="https://northstar.test/api/paper/snapshot";
function guardedEnv(){
 return {
  NORTHSTAR_OPERATOR_TOKEN:"synthetic-operator-token",
  ALPACA_API_KEY_ID:"synthetic-paper-key",
  ALPACA_API_SECRET_KEY:"synthetic-paper-secret",
  NORTHSTAR_DB:{prepare(){throw new Error("D1 must not be touched before OIDC authentication.");}}
 };
}

test("read-only snapshot endpoint rejects missing OIDC authorization before D1 or provider access",async()=>{
 const response=await onRequestPost({request:new Request(url,{method:"POST"}),env:guardedEnv()});
 assert.equal(response.status,401);
 assert.deepEqual(await response.json(),{ok:false,error:"Unauthorized.",execution:false});
});

test("read-only snapshot endpoint rejects malformed OIDC before D1 or provider access",async()=>{
 const response=await onRequestPost({
  request:new Request(url,{method:"POST",headers:{Authorization:"Bearer not.a.jwt"}}),
  env:guardedEnv()
 });
 assert.equal(response.status,401);
 assert.deepEqual(await response.json(),{ok:false,error:"Unauthorized GitHub Actions identity.",execution:false});
});

test("scheduled snapshot workflow uses pinned OIDC and never requires a GitHub operator secret",()=>{
 const workflow=readFileSync(new URL("../.github/workflows/northstar-equity-snapshot.yml",import.meta.url),"utf8");
 assert.match(workflow,/permissions:\s*\n\s*contents:\s*read\s*\n\s*id-token:\s*write/);
 assert.match(workflow,/ACTIONS_ID_TOKEN_REQUEST_URL/);
 assert.match(workflow,/ACTIONS_ID_TOKEN_REQUEST_TOKEN/);
 assert.ok(workflow.includes('base="https://ai-stock-advisor.pages.dev/api/paper"'));
 assert.ok(workflow.includes('"$base/snapshot"'));
 assert.match(workflow,/\/api\/paper\/snapshot/);
 assert.match(workflow,/executionEnabled == false/);
 assert.match(workflow,/killSwitchEngaged == true/);
 assert.match(workflow,/automatedOrderSubmission == false/);
 assert.match(workflow,/cancel-in-progress:\s*false/);
 assert.doesNotMatch(workflow,/secrets\.NORTHSTAR_OPERATOR_TOKEN/);
 assert.doesNotMatch(workflow,/\/api\/paper\/(sync|reconcile)/);
});
