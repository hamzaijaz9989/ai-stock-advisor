import test from "node:test";
import assert from "node:assert/strict";
import {onRequestPost,waitForSubmissionQuiescence} from "../web/functions/api/paper/control.js";

function request(body={action:"ENGAGE_KILL_SWITCH"},headers={}) {
  return new Request("https://northstar.test/api/paper/control",{
    method:"POST",
    headers:{"content-type":"application/json","Authorization":"Bearer operator",...headers},
    body:JSON.stringify(body)
  });
}

function controlDb(state) {
  const writes=[];
  const db={
    prepare(sql) {
      const statement={sql,args:[],bind(...args){this.args=args;return this;},async first(){return {state};}};
      return statement;
    },
    async batch(statements) { writes.push(...statements); return statements.map(()=>({meta:{changes:1}})); }
  };
  return {db,writes};
}

test("kill switch acknowledgement waits until an already-claimed submission is terminal",async()=>{
  const {db,writes}=controlDb("SUBMITTED");
  const response=await onRequestPost({request:request(),env:{NORTHSTAR_OPERATOR_TOKEN:"operator",NORTHSTAR_DB:db}});
  const body=await response.json();
  assert.equal(response.status,200);
  assert.equal(body.ok,true);
  assert.equal(body.executionEnabled,false);
  assert.equal(body.killSwitchEngaged,true);
  assert.equal(body.submissionQuiesced,true);
  assert.equal(body.submissionState,"SUBMITTED");
  assert.equal(body.brokerOutcomeVerified,true);
  assert.ok(writes.some(x=>x.sql.includes("UPDATE execution_control SET enabled=0,kill_switch=1")));
  assert.ok(writes.some(x=>x.args.includes("ENGAGE_KILL_SWITCH")));
  assert.match(body.warnings.join(" "),/Existing broker orders are not cancelled/);
});

test("kill switch never reports quiescence while a submission claim remains SUBMITTING",async()=>{
  const db={prepare(){return {async first(){return {state:"SUBMITTING"};}};}};
  const result=await waitForSubmissionQuiescence(db,{timeoutMs:0,now:()=>100,pause:async()=>{}});
  assert.deepEqual(result,{ok:true,quiesced:false,state:"SUBMITTING"});
});

test("kill switch returns a retry interval instead of claiming quiescence while a submission remains in flight",async()=>{
  const {db}=controlDb("SUBMITTING");
  const originalNow=Date.now,originalTimeout=globalThis.setTimeout;
  let clock=0;
  Date.now=()=>{clock+=1000;return clock;};
  globalThis.setTimeout=callback=>{callback();return 0;};
  try {
    const response=await onRequestPost({request:request(),env:{NORTHSTAR_OPERATOR_TOKEN:"operator",NORTHSTAR_DB:db}});
    const body=await response.json();
    assert.equal(response.status,202);
    assert.equal(response.headers.get("Retry-After"),"2");
    assert.equal(body.killSwitchEngaged,true);
    assert.equal(body.submissionQuiesced,false);
    assert.equal(body.submissionState,"SUBMITTING");
    assert.equal(body.brokerOutcomeVerified,false);
  } finally {
    Date.now=originalNow;
    globalThis.setTimeout=originalTimeout;
  }
});

test("kill switch drain follows an in-flight claim until an UNKNOWN broker outcome",async()=>{
  let reads=0,clock=0;
  const db={prepare(){return {async first(){reads++;return {state:reads===1?"SUBMITTING":"UNKNOWN"};}};}};
  const result=await waitForSubmissionQuiescence(db,{timeoutMs:1000,pollMs:100,now:()=>clock+=10,pause:async()=>{}});
  assert.equal(result.ok,true);
  assert.equal(result.quiesced,false);
  assert.equal(result.state,"UNKNOWN");
  assert.equal(reads,2);
});

test("kill switch does not acknowledge quiescence for an UNKNOWN broker outcome",async()=>{
  const {db}=controlDb("UNKNOWN");
  const response=await onRequestPost({request:request(),env:{NORTHSTAR_OPERATOR_TOKEN:"operator",NORTHSTAR_DB:db}});
  const body=await response.json();
  assert.equal(response.status,503);
  assert.equal(body.killSwitchEngaged,true);
  assert.equal(body.submissionQuiesced,false);
  assert.equal(body.manualReconciliationRequired,true);
  assert.equal(body.brokerOutcomeVerified,false);
});

test("kill switch fails closed when claim state cannot be read",async()=>{
  const db={prepare(){return {async first(){throw new Error("missing migration or D1 failure");}};}};
  const result=await waitForSubmissionQuiescence(db,{timeoutMs:0});
  assert.deepEqual(result,{ok:false,quiesced:false,state:"UNVERIFIED"});
});

test("kill switch treats an unknown claim state as unverified, not quiesced",async()=>{
  const db={prepare(){return {async first(){return {state:"PAUSED"};}};}};
  const result=await waitForSubmissionQuiescence(db,{timeoutMs:0});
  assert.deepEqual(result,{ok:false,quiesced:false,state:"PAUSED"});
});

test("kill switch treats an absent singleton claim as no in-flight submission",async()=>{
  const db={prepare(){return {async first(){return null;}};}};
  const result=await waitForSubmissionQuiescence(db,{timeoutMs:0});
  assert.deepEqual(result,{ok:true,quiesced:true,state:"NO_IN_FLIGHT_SUBMISSION"});
});


test("kill switch fails closed when the execution-control singleton is missing",async()=>{
  const db={
    prepare(sql){return {sql,args:[],bind(...args){this.args=args;return this;}};},
    async batch(){return [{meta:{changes:0}},{meta:{changes:0}}];}
  };
  const response=await onRequestPost({request:request(),env:{NORTHSTAR_OPERATOR_TOKEN:"operator",NORTHSTAR_DB:db}});
  const body=await response.json();
  assert.equal(response.status,503);
  assert.equal(body.ok,false);
  assert.equal(body.controlStateVerified,false);
  assert.equal(body.submissionQuiesced,false);
  assert.equal(body.killSwitchEngaged,undefined);
});

test("kill switch does not acknowledge success without a durable audit event",async()=>{
  const db={
    prepare(sql){return {sql,args:[],bind(...args){this.args=args;return this;}};},
    async batch(){return [{meta:{changes:1}},{meta:{changes:0}}];}
  };
  const response=await onRequestPost({request:request(),env:{NORTHSTAR_OPERATOR_TOKEN:"operator",NORTHSTAR_DB:db}});
  const body=await response.json();
  assert.equal(response.status,503);
  assert.equal(body.ok,false);
  assert.equal(body.controlStateVerified,false);
  assert.equal(body.submissionQuiesced,false);
});
