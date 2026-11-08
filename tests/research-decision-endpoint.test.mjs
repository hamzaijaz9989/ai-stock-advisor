import test from "node:test";
import assert from "node:assert/strict";
import {onRequestPost} from "../web/functions/api/research/decision.js";

function makeDb() {
  const rows = new Map();
  return {
    rows,
    prepare(sql) {
      return { bind(...args) {
        return {
          async run() {
            const [requestId,inputHash,symbol,status,decision,failedStage,reason,traceJson] = args;
            if (sql.startsWith("INSERT")) {
              if (rows.has(requestId)) return {meta:{changes:0}};
              rows.set(requestId,{request_id:requestId,input_sha256:inputHash,symbol,status,decision,failed_stage:failedStage,reason,trace_json:traceJson,created_at:"2026-11-08T15:00:00.000Z"});
              return {meta:{changes:1}};
            }
            throw new Error("Unexpected SQL run");
          },
          async first() {
            if (!sql.startsWith("SELECT")) throw new Error("Unexpected SQL read");
            return rows.get(args[0]) || null;
          }
        };
      }};
    }
  };
}
const candidate = () => ({
  now:"2026-11-08T15:00:00.000Z",symbol:"NVDA",sector:"Technology",
  quote:{price:180,bid:179.9,ask:180.1,timestamp:"2026-11-08T15:00:00.000Z",source:"Alpaca IEX"},
  liquidity:{avgDollarVolumeUsd:25000000},
  thesis:"Revenue growth, operating leverage and product demand support further research, subject to valuation and execution risks.",
  evidence:[
    {type:"SEC_FILING",publisherId:"sec.gov",url:"https://www.sec.gov/Archives/edgar/data/1/filing.htm",publishedAt:"2026-11-07T12:00:00Z",summary:"The company disclosed quarterly revenue, operating performance and risk factors in its latest filing."},
    {type:"NEWS_REPORT",publisherId:"reuters.com",url:"https://www.reuters.com/markets/example",publishedAt:"2026-11-07T13:00:00Z",summary:"Independent reporting discusses demand trends, competitive pressures and the company outlook."}
  ],
  risks:["Valuation multiple remains elevated."],stopPrice:176,account:{equityUsd:1000},
  limits:{riskFraction:0.005,maxPositionFraction:0.25,estimatedRoundTripCostBps:20},
  portfolio:{openRiskUsd:0,grossExposureUsd:0,dailyLossFraction:0,weeklyLossFraction:0,drawdownFraction:0,sectorExposureUsd:0,concurrentPositions:0}
});
function req(body, token="test-operator-token") {
  return new Request("https://northstar.example/api/research/decision",{
    method:"POST",headers:{"Authorization":"Bearer "+token,"Content-Type":"application/json"},
    body:JSON.stringify(body)
  });
}
const env = db => ({NORTHSTAR_OPERATOR_TOKEN:"test-operator-token",NORTHSTAR_DB:db});

test("decision endpoint refuses missing authentication and missing ledger",async()=>{
  const unauthorized=await onRequestPost({request:req({requestId:"request-0001",candidate: candidate()},"wrong"),env:env(makeDb())});
  assert.equal(unauthorized.status,401);
  const unavailable=await onRequestPost({request:req({requestId:"request-0002",candidate:candidate()}),env:{NORTHSTAR_OPERATOR_TOKEN:"test-operator-token"}});
  assert.equal(unavailable.status,503);
});
test("decision endpoint persists a research-only trace and safely replays idempotently",async()=>{
  const db=makeDb(), body={requestId:"request-0003",candidate:candidate()};
  const first=await onRequestPost({request:req(body),env:env(db)});
  const firstJson=await first.json();
  assert.equal(first.status,200);
  assert.equal(firstJson.traceDurable,true);
  assert.equal(firstJson.execution,false);
  assert.equal(firstJson.automatedOrderSubmission,false);
  assert.equal(firstJson.replayed,false);
  assert.equal(db.rows.size,1);
  const second=await onRequestPost({request:req(body),env:env(db)});
  const secondJson=await second.json();
  assert.equal(second.status,200);
  assert.equal(secondJson.replayed,true);
  assert.equal(db.rows.size,1);
});
test("decision endpoint rejects requestId reuse with different input",async()=>{
  const db=makeDb(), body={requestId:"request-0004",candidate:candidate()};
  await onRequestPost({request:req(body),env:env(db)});
  const changed=candidate(); changed.thesis="A different thesis with a distinct evidence-based rationale for research.";
  const conflict=await onRequestPost({request:req({requestId:body.requestId,candidate:changed}),env:env(db)});
  assert.equal(conflict.status,409);
});
test("decision endpoint persists rejected candidates as auditable NO_TRADE traces",async()=>{
  const db=makeDb(), c=candidate(); c.quote.timestamp="2026-11-08T14:00:00.000Z";
  const response=await onRequestPost({request:req({requestId:"request-0005",candidate:c}),env:env(db)});
  const json=await response.json();
  assert.equal(response.status,200);
  assert.equal(json.trace.status,"REJECTED");
  assert.equal(json.trace.decision,"NO_TRADE");
  assert.equal(db.rows.size,1);
});
test("decision endpoint rejects missing request identifiers",async()=>{
  const response=await onRequestPost({request:req({candidate:candidate()}),env:env(makeDb())});
  assert.equal(response.status,400);
});
