import test from "node:test";
import assert from "node:assert/strict";
import {onRequestGet} from "../web/functions/api/research/agent.js";

function environment(result){
 const row={symbol:"AAPL",status:"NO_TRADE",result_json:JSON.stringify(result),created_at:"2026-11-17T00:00:00Z"};
 return {NORTHSTAR_DB:{prepare(){return {bind(){return {all:async()=>({results:[row]})};}};}}};
}

test("agent detail returns persisted provider and model telemetry without raw inputs",async()=>{
 const result={status:"NO_TRADE",agents:[{role:"market_scanner",status:"COMPLETE",durationMs:12,findings:[{claim:"Observed momentum from validated bars.",factIds:["northstar:v1:fact:abc"]}],risks:[],telemetry:{provider:"deterministic",model:"northstar-market-scanner-v1",latencyMs:12,inputTokens:0,outputTokens:0}}]};
 const response=await onRequestGet({request:new Request("https://northstar.test/api/research/agent?symbol=AAPL&role=market_scanner"),env:environment(result)});
 const body=await response.json();
 assert.equal(response.status,200);
 assert.equal(body.latest.agent.status,"COMPLETE");
 assert.equal(body.latest.agent.provider,"deterministic");
 assert.equal(body.latest.agent.model,"northstar-market-scanner-v1");
 assert.equal(body.latest.agent.durationMs,12);
 assert.deepEqual(body.latest.agent.findings[0].factIds,["northstar:v1:fact:abc"]);
 assert.equal("portfolio" in body.latest,false);
});

test("agent detail reports an empty history when the requested role never ran",async()=>{
 const response=await onRequestGet({request:new Request("https://northstar.test/api/research/agent?symbol=AAPL&role=market_scanner"),env:environment({status:"NO_TRADE",agents:[]})});
 const body=await response.json();
 assert.equal(response.status,200);
 assert.equal(body.latest,null);
 assert.deepEqual(body.history,[]);
});

test("agent detail exposes only allowlisted failure-code strings",async()=>{
 const result={status:"NO_TRADE",agents:[{role:"fundamental_analyst",status:"BLOCKED",failureCode:"unknown_evidence_id",reason:"Citation is outside validated context.",findings:[],risks:[]}]};
 const response=await onRequestGet({request:new Request("https://northstar.test/api/research/agent?symbol=AAPL&role=fundamental_analyst"),env:environment(result)});
 const body=await response.json();assert.equal(body.latest.agent.failureCode,"unknown_evidence_id");
 const unsafe={status:"NO_TRADE",agents:[{role:"news_analyst",status:"BLOCKED",failureCode:"api_key=secret",findings:[],risks:[]}]};
 const safe=await onRequestGet({request:new Request("https://northstar.test/api/research/agent?symbol=AAPL&role=news_analyst"),env:environment(unsafe)});
 assert.equal((await safe.json()).latest.agent.failureCode,null);
});
