import test from "node:test";
import assert from "node:assert/strict";
import {runMarketScanner,runTechnicalAnalyst} from "../web/lib/research-specialist-agents.js";
const mk=(n=80)=>Array.from({length:n},(_,i)=>({date:new Date(Date.UTC(2026,7,29+i)).toISOString().slice(0,10),open:100+i,high:102+i,low:99+i,close:101+i,volume:1000+i*5}));
function ctx(rows=mk()){return {ticker:"TEST",asOf:"2026-11-17T12:00:00Z",facts:[{id:"q",type:"QUOTE",observedAt:"2026-11-17T11:55:00Z",value:{price:180,changePercent:1.1,quoteTime:"2026-11-17T11:55:00Z",timestampStatus:"PRESENT",quoteFreshness:{status:"FRESH"},delayedOrRealtime:"Daily interval; not real-time"}},{id:"h",type:"DAILY_OHLCV_HISTORY",observedAt:"2026-11-17T11:56:00Z",value:{rows,dataQuality:"provider-adjustment-policy-unverified"}}],evidence:[]};}
test("scanner rejects duplicate or out-of-order OHLCV sessions",()=>{const c=ctx();c.facts[1].value.rows[10].date=c.facts[1].value.rows[9].date;assert.equal(runMarketScanner(c).status,"UNAVAILABLE");});
test("technical analyst calculates SMA, RSI, MACD and observed range with evidence links",()=>{const c=ctx(),r=runTechnicalAnalyst(c);assert.equal(r.status,"COMPLETE");assert.equal(r.findings.length,5);assert.ok(r.findings.every(x=>x.factIds.includes("h")));assert.ok(r.risks.length>0);});
test("technical analyst rejects malformed OHLCV values",()=>{const c=ctx();c.facts[1].value.rows[20].high=-1;assert.equal(runTechnicalAnalyst(c).status,"UNAVAILABLE");});
test("scanner flags non-real-time provider quote",()=>{const r=runMarketScanner(ctx());assert.ok(r.risks.some(x=>x.claim.includes("delayed or non-real-time")));});
