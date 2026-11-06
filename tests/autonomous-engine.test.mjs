import test from "node:test";
import assert from "node:assert/strict";
import { runNorthstarAgents } from "../web/autonomous-engine.mjs";

function makeBars({count=60, start=100, volume=1_000_000, breakout=false}={}) {
  const bars=[];
  for(let i=0;i<count;i++) {
    const close=start+i*0.25+(breakout&&i===count-1?4:0);
    bars.push({timestamp:new Date(Date.UTC(2026,8,1+i)).toISOString(),
      open:close-0.2,high:close+0.5,low:close-0.5,close,volume});
  }
  return bars;
}
const now="2026-11-07T00:00:00.000Z";

test("rejects insufficient history",()=>{
  const r=runNorthstarAgents({ticker:"TEST",bars:makeBars({count:20}),now});
  assert.equal(r.status,"INSUFFICIENT_DATA");
  assert.equal(r.score,null);
});

test("rejects malformed and duplicate timestamps",()=>{
  const bars=makeBars(); bars[10].timestamp=bars[9].timestamp;
  const r=runNorthstarAgents({ticker:"TEST",bars,now});
  assert.match(r.blockers[0],/strictly increasing/);
});

test("rejects illiquid symbols instead of manufacturing a setup",()=>{
  const r=runNorthstarAgents({ticker:"THIN",bars:makeBars({volume:1000}),now,equity:500});
  assert.equal(r.status,"INSUFFICIENT_DATA");
  assert.ok(r.blockers.some(x=>/liquidity/i.test(x)));
});

test("keeps execution disabled and exposes six auditable agents",()=>{
  const bars=makeBars({breakout:true});
  bars[bars.length-1].volume=3_000_000;
  const r=runNorthstarAgents({ticker:"TEST",bars,now,equity:500});
  assert.equal(r.executionEnabled,false);
  assert.equal(r.mode,"RESEARCH_ONLY");
  assert.equal(r.audit.length,6);
  assert.ok(["HIGH_PRIORITY_WATCH","WATCH","NO_SETUP","INSUFFICIENT_DATA"].includes(r.status));
  assert.equal(r.scoreMeaning,"Heuristic setup-ranking score, not probability of profit.");
});

test("position sizing is bounded by risk and exposure caps",()=>{
  const bars=makeBars({breakout:true}); bars.at(-1).volume=3_000_000;
  const r=runNorthstarAgents({ticker:"TEST",bars,now,equity:500});
  assert.ok(r.illustrativeSizing.shares>=0);
  assert.ok(r.illustrativeSizing.estimatedNotional<=50);
});
