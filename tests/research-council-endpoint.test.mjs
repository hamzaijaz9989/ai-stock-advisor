import test from "node:test";
import assert from "node:assert/strict";
import {createResearchCouncilWorkers,normalizeCouncilModelReport} from "../web/lib/research-council-adapters.js";
import {onRequestPost} from "../web/functions/api/research/council.js";

function makeDb() {
  const rows = new Map();
  return {
    rows,
    prepare(sql) {
      return {
        bind(...args) {
          return {
            async run() {
              const [id, hash, symbol, status, json] = args;
              if (rows.has(id)) return {meta:{changes:0}};
              rows.set(id, {input_sha256:hash, result_json:json, symbol, status, created_at:"2026-11-08T16:00:00.000Z"});
              return {meta:{changes:1}};
            },
            async first() { return rows.get(args[0]) || null; }
          };
        }
      };
    }
  };
}
const context = {
  ticker:"NVDA", asOf:"2026-11-08T15:00:00Z",
  facts:[{id:"quote-1",type:"QUOTE",value:180},{id:"risk-1",type:"PORTFOLIO",value:"zero open risk"}],
  evidence:[{id:"filing-1",type:"SEC_FILING",url:"https://www.sec.gov/Archives/example",summary:"Official filing excerpt supplied by the upstream research collector."}],
  portfolio:{equityUsd:10000,openRiskUsd:0,grossExposureUsd:0,dailyLossFraction:0,weeklyLossFraction:0,drawdownFraction:0,sectorExposureUsd:0,concurrentPositions:0}
};
const env = db => ({NORTHSTAR_OPERATOR_TOKEN:"operator-secret",NORTHSTAR_DB:db});
function request(body, token="operator-secret") {
  return new Request("https://northstar.example/api/research/council", {
    method:"POST", headers:{"Authorization":"Bearer "+token,"Content-Type":"application/json"}, body:JSON.stringify(body)
  });
}

test("provider absence makes model specialists unavailable and risk committee reject incomplete context", async () => {
  const workers = await createResearchCouncilWorkers({});
  for (const role of ["market_scanner","technical_analyst","fundamental_analyst","news_analyst","sentiment_analyst","bull_researcher","bear_researcher","portfolio_analyst"]) {
    const result = await workers[role]({facts:[],evidence:[],portfolio:{}});
    assert.equal(result.status,"UNAVAILABLE");
  }
  const risk = await workers.risk_committee({facts:[],portfolio:{}});
  assert.equal(risk.decision,"REJECT");
  assert.ok(risk.vetoReasons.length>0);
});

test("council endpoint authenticates and requires persistent audit storage", async () => {
  const denied = await onRequestPost({request:request({requestId:"council-0001",context},"wrong"),env:env(makeDb())});
  assert.equal(denied.status,401);
  const missing = await onRequestPost({request:request({requestId:"council-0002",context}),env:{NORTHSTAR_OPERATOR_TOKEN:"operator-secret"}});
  assert.equal(missing.status,503);
});

test("council endpoint stores a fail-closed result and replays idempotently without AI credentials", async () => {
  const db=makeDb(), body={requestId:"council-0003",context};
  const first=await onRequestPost({request:request(body),env:env(db)});
  const firstJson=await first.json();
  assert.equal(first.status,200);
  assert.equal(firstJson.traceDurable,true);
  assert.equal(firstJson.result.status,"NO_TRADE");
  assert.equal(firstJson.execution,false);
  assert.equal(firstJson.automatedOrderSubmission,false);
  assert.equal(firstJson.replayed,false);
  const second=await onRequestPost({request:request(body),env:env(db)});
  const secondJson=await second.json();
  assert.equal(second.status,200);
  assert.equal(secondJson.replayed,true);
  assert.equal(db.rows.size,1);
});

test("council endpoint rejects request ID reuse with changed context", async () => {
  const db=makeDb();
  await onRequestPost({request:request({requestId:"council-0004",context}),env:env(db)});
  const changed={...context,ticker:"AAPL"};
  const conflict=await onRequestPost({request:request({requestId:"council-0004",context:changed}),env:env(db)});
  assert.equal(conflict.status,409);
});

test("council endpoint rejects oversized contexts and malformed IDs", async () => {
  const db=makeDb();
  const bad=await onRequestPost({request:request({requestId:"x",context}),env:env(db)});
  assert.equal(bad.status,400);
  const huge={...context,facts:Array.from({length:501},(_,i)=>({id:"f-"+i}))};
  const large=await onRequestPost({request:request({requestId:"council-0005",context:huge}),env:env(db)});
  assert.equal(large.status,413);
});

test("model report normalization preserves UNAVAILABLE and rejects false completion", () => {
  const unavailable=normalizeCouncilModelReport({status:"UNAVAILABLE",findings:[],risks:[]});
  assert.equal(unavailable.status,"UNAVAILABLE");
  assert.throws(()=>normalizeCouncilModelReport({status:"UNAVAILABLE",findings:[{claim:"A claim that must not be kept.",factIds:["quote-1"]}],risks:[]}),/Unavailable/);
  assert.throws(()=>normalizeCouncilModelReport({status:"PARTIAL",findings:[],risks:[]}),/contract/);
  assert.throws(()=>normalizeCouncilModelReport({status:"COMPLETE",findings:[],risks:[],decision:"ACCEPT_FOR_REVIEW"}),/decision fields/);
  assert.throws(()=>normalizeCouncilModelReport({status:"COMPLETE",findings:{},risks:[]}),/contract/);
});

test("deterministic risk committee rejects negative daily or weekly loss inputs", async () => {
  const workers=await createResearchCouncilWorkers({});
  const base={facts:[{id:"portfolio-state-1"}],portfolio:{equityUsd:10000,openRiskUsd:0,grossExposureUsd:0,dailyLossFraction:0,weeklyLossFraction:0,drawdownFraction:0,sectorExposureUsd:0,concurrentPositions:0}};
  for (const field of ["dailyLossFraction","weeklyLossFraction"]) {
    const portfolio={...base.portfolio,[field]:-0.01};
    const result=await workers.risk_committee({...base,portfolio});
    assert.equal(result.decision,"REJECT");
    assert.ok(result.vetoReasons.some(x=>x.includes("incomplete or invalid")));
  }
});

test("risk committee does not attach unrelated market fact IDs to portfolio assertions", async () => {
  const workers=await createResearchCouncilWorkers({});
  const result=await workers.risk_committee({facts:[{id:"quote-1",type:"QUOTE"}],portfolio:{equityUsd:10000,openRiskUsd:0,grossExposureUsd:0,dailyLossFraction:0,weeklyLossFraction:0,drawdownFraction:0,sectorExposureUsd:0,concurrentPositions:0}});
  assert.equal(result.decision,"ACCEPT_FOR_REVIEW");
  assert.deepEqual(result.findings,[]);
  assert.deepEqual(result.risks,[]);
  assert.deepEqual(result.vetoReasons,[]);
});
