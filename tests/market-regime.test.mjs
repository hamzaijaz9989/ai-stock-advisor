import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import vm from "node:vm";

const source=readFileSync(new URL("../web/market-regime.js",import.meta.url),"utf8");
const sandbox={module:{exports:{}},Date,Math,Number,Array,Set};
vm.runInNewContext(source,sandbox);
const {assessMarketRegime}=sandbox.module.exports;
function history(direction="up",now=Date.now(),count=230) {
  const data=[];
  for(let i=0;i<count;i++) {
    const progress=i/(count-1);
    const close=direction==="up"?100+progress*80:direction==="down"?180-progress*80:100+Math.sin(i/7)*2;
    data.push({date:new Date(now-(count-1-i)*86400000).toISOString().slice(0,10),close,adjustedClose:close});
  }
  return {data,endDate:data[data.length-1].date};
}

test("missing benchmark data fails closed to UNKNOWN",()=>{
  const result=assessMarketRegime(null,history("up"));
  assert.equal(result.state,"UNKNOWN");
  assert.equal(result.entryGate,"BLOCK_NEW_ENTRIES");
});

test("supportive SPY and QQQ trends are labelled RISK-ON, not a buy signal",()=>{
  const result=assessMarketRegime(history("up"),history("up"));
  assert.equal(result.state,"RISK-ON");
  assert.equal(result.entryGate,"NORMAL_RESEARCH_REVIEW");
  assert.match(result.summary,/individual stocks still require/);
});

test("broad market downtrend is labelled RISK-OFF",()=>{
  const result=assessMarketRegime(history("down"),history("down"));
  assert.equal(result.state,"RISK-OFF");
  assert.equal(result.entryGate,"BLOCK_NEW_ENTRIES");
});

test("conflicting benchmark trends are labelled MIXED",()=>{
  const result=assessMarketRegime(history("up"),history("down"));
  assert.equal(result.state,"MIXED");
  assert.equal(result.entryGate,"CAUTION_REQUIRES_FULL_VALIDATION");
});

test("stale benchmark history fails closed",()=>{
  const old=history("up",Date.now()-10*86400000);
  const result=assessMarketRegime(old,old);
  assert.equal(result.state,"UNKNOWN");
  assert.equal(result.entryGate,"BLOCK_NEW_ENTRIES");
});
