import test from "node:test";
import assert from "node:assert/strict";
import { syncAlpacaEquitySnapshot, getAlpacaEquityHealth } from "../monitor/worker.js";

function mockDb({control={enabled:0,mode:"paper",kill_switch:1},last=null,failRead=false,failWrite=false}={}) {
  const writes=[];
  return {
    writes,
    prepare(sql) {
      return {
        bind(...values) {
          return {
            async first() {
              if(failRead) throw new Error("D1 read unavailable");
              if(sql.includes("execution_control")) return control;
              if(sql.includes("paper_equity_snapshots")) return last;
              return null;
            },
            async run() {
              if(failWrite) throw new Error("D1 write unavailable");
              writes.push({sql,values});
              return {success:true};
            }
          };
        },
        async first() {
          if(failRead) throw new Error("D1 read unavailable");
          if(sql.includes("execution_control")) return control;
          if(sql.includes("paper_equity_snapshots")) return last;
          return null;
        }
      };
    }
  };
}
const envFor=(db)=>({NORTHSTAR_DB:db,ALPACA_API_KEY_ID:"test-key-id",ALPACA_API_SECRET_KEY:"test-secret"});

test("records a valid account snapshot using only the Alpaca account endpoint",async()=>{
  const db=mockDb(); let requested="";
  const result=await syncAlpacaEquitySnapshot(envFor(db),Date.parse("2026-11-12T18:00:00Z"),async(url)=>{
    requested=url;
    return {ok:true,json:async()=>({status:"ACTIVE",equity:"100000",cash:"100000",buying_power:"400000",last_equity:"99900"})};
  });
  assert.equal(result.status,"recorded");
  assert.equal(db.writes.length,1);
  assert.equal(requested,"https://paper-api.alpaca.markets/v2/account");
  assert.equal(db.writes[0].values[1],100000);
});

test("fails closed on Alpaca authentication errors without writing",async()=>{
  const db=mockDb();
  await assert.rejects(()=>syncAlpacaEquitySnapshot(envFor(db),Date.parse("2026-11-12T18:00:00Z"),async()=>({ok:false,status:401})),/HTTP 401/);
  assert.equal(db.writes.length,0);
});

test("fails closed when account data is invalid",async()=>{
  const db=mockDb();
  await assert.rejects(()=>syncAlpacaEquitySnapshot(envFor(db),Date.parse("2026-11-12T18:00:00Z"),async()=>({ok:true,json:async()=>({status:"ACTIVE",equity:"NaN",cash:"100"})})),/invalid equity\/cash/);
  assert.equal(db.writes.length,0);
});

test("safety gate prevents provider request and database write",async()=>{
  const db=mockDb({control:{enabled:1,mode:"paper",kill_switch:1}});
  let called=false;
  await assert.rejects(()=>syncAlpacaEquitySnapshot(envFor(db),Date.parse("2026-11-12T18:00:00Z"),async()=>{called=true;throw new Error("must not call");}),/blocked/);
  assert.equal(called,false);
  assert.equal(db.writes.length,0);
});

test("D1 write failure is surfaced and never reported as recorded",async()=>{
  const db=mockDb({failWrite:true});
  await assert.rejects(()=>syncAlpacaEquitySnapshot(envFor(db),Date.parse("2026-11-12T18:00:00Z"),async()=>({ok:true,json:async()=>({status:"ACTIVE",equity:"100000",cash:"100000",buying_power:"400000"})})),/D1 write unavailable/);
});

test("read-only health diagnostic reports binding, credential presence, safety and snapshot age",async()=>{
  const capturedAt="2026-11-12T17:00:00.000Z";
  const db=mockDb({last:{captured_at:capturedAt}});
  const health=await getAlpacaEquityHealth(envFor(db),Date.parse("2026-11-12T18:00:00Z"));
  assert.equal(health.d1Available,true);
  assert.equal(health.credentialsPresent,true);
  assert.equal(health.executionSafe,true);
  assert.equal(health.lastSnapshotAt,capturedAt);
  assert.equal(health.snapshotAgeMs,3600000);
  assert.equal(db.writes.length,0);
});

test("health diagnostic fails closed if D1 is unavailable",async()=>{
  const health=await getAlpacaEquityHealth({ALPACA_API_KEY_ID:"x",ALPACA_API_SECRET_KEY:"y"},0);
  assert.equal(health.ok,false);
  assert.equal(health.d1Available,false);
});
