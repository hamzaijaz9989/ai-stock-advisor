import test from "node:test";
import assert from "node:assert/strict";
import {onRequestGet} from "../web/functions/api/research/council/status.js";

function makeDb({migrations,control,runs,equity}) {
  return {
    prepare(sql) {
      return {
        async all() {
          assert.match(sql,/d1_migrations/);
          return {results:migrations.map(name=>({name}))};
        },
        async first() {
          if (sql.includes("FROM execution_control")) return control;
          if (sql.includes("FROM research_council_runs")) return runs;
          if (sql.includes("FROM paper_equity_snapshots")) return equity;
          throw new Error("Unexpected read query: "+sql);
        }
      };
    }
  };
}

const safeControl={enabled:0,mode:"paper",kill_switch:1,max_portfolio_usd:1000};
const migrations=["0002_research_decision_traces.sql","0003_research_council_runs.sql"];

test("status endpoint fails closed when the audit database is unavailable",async()=>{
  const response=await onRequestGet({env:{}});
  assert.equal(response.status,503);
  const body=await response.json();
  assert.equal(body.execution,false);
  assert.equal(body.automatedOrderSubmission,false);
});

test("status endpoint reports production readiness blockers without leaking secret values or account data",async()=>{
  const now=Date.now();
  const db=makeDb({
    migrations,control:safeControl,runs:{run_count:0,latest_at:null,latest_status:null},
    equity:{snapshot_count:1,oldest_at:new Date(now-86400000).toISOString(),latest_at:new Date(now-86400000).toISOString()}
  });
  const response=await onRequestGet({env:{
    NORTHSTAR_DB:db,GEMINI_API_KEY:"model-secret",NORTHSTAR_OPERATOR_TOKEN:"operator-secret",
    ALPACA_API_KEY_ID:"alpaca-id-secret",ALPACA_API_SECRET_KEY:"alpaca-secret"
  }});
  const body=await response.json();
  const serialized=JSON.stringify(body);
  assert.equal(response.status,200);
  assert.equal(body.status,"BLOCKED");
  assert.equal(body.council.roles.length,9);
  assert.equal(body.council.runCount,0);
  assert.equal(body.collector.serverCollectorConfigured,true);
  assert.equal(body.collector.freshEquitySnapshot,false);
  assert.equal(body.collector.sevenDayEquityHistory,false);
  assert.equal(body.collector.readyForReadOnlyPreflight,false);
  assert.equal(body.safety.executionEnabled,false);
  assert.equal(body.safety.killSwitchEngaged,true);
  assert.equal(body.execution,false);
  assert.equal(body.automatedOrderSubmission,false);
  assert.equal(serialized.includes("model-secret"),false);
  assert.equal(serialized.includes("operator-secret"),false);
  assert.equal(serialized.includes("alpaca-secret"),false);
  assert.equal(serialized.includes("alpaca-id-secret"),false);
});

test("status endpoint only marks known preflight gates ready with fresh and seven-day equity history",async()=>{
  const now=Date.now();
  const db=makeDb({
    migrations,control:safeControl,runs:{run_count:3,latest_at:new Date(now-60000).toISOString(),latest_status:"NO_TRADE"},
    equity:{snapshot_count:10,oldest_at:new Date(now-8*86400000).toISOString(),latest_at:new Date(now-60000).toISOString()}
  });
  const response=await onRequestGet({env:{
    NORTHSTAR_DB:db,OPENAI_API_KEY:"configured",NORTHSTAR_OPERATOR_TOKEN:"configured",
    ALPACA_API_KEY_ID:"configured",ALPACA_API_SECRET_KEY:"configured"
  }});
  const body=await response.json();
  assert.equal(response.status,200);
  assert.equal(body.status,"READY_FOR_READ_ONLY_PREFLIGHT");
  assert.equal(body.collector.readyForReadOnlyPreflight,true);
  assert.ok(body.collector.blockers.includes("READ_ONLY_BROKER_STATE_PREFLIGHT_REQUIRED"));
  assert.equal(body.council.runCount,3);
  assert.equal(body.council.latestRunStatus,"NO_TRADE");
  assert.equal(body.safety.executionEnabled,false);
  assert.equal(body.safety.killSwitchEngaged,true);
});

test("status endpoint blocks missing schema and unsafe execution controls",async()=>{
  const now=Date.now();
  const db=makeDb({
    migrations:[],control:{...safeControl,enabled:1,kill_switch:0},
    runs:{run_count:0,latest_at:null,latest_status:null},
    equity:{snapshot_count:2,oldest_at:new Date(now-8*86400000).toISOString(),latest_at:new Date(now-60000).toISOString()}
  });
  const response=await onRequestGet({env:{
    NORTHSTAR_DB:db,GEMINI_API_KEY:"configured",NORTHSTAR_OPERATOR_TOKEN:"configured",
    ALPACA_API_KEY_ID:"configured",ALPACA_API_SECRET_KEY:"configured"
  }});
  const body=await response.json();
  assert.equal(body.status,"BLOCKED");
  assert.equal(body.collector.serverCollectorConfigured,false);
  assert.equal(body.collector.blockers.includes("COUNCIL_SCHEMA_MISSING"),true);
  assert.equal(body.collector.blockers.includes("PAPER_CONTROLS_NOT_SAFE"),true);
  assert.equal(body.safety.executionEnabled,true);
  assert.equal(body.safety.killSwitchEngaged,false);
});
