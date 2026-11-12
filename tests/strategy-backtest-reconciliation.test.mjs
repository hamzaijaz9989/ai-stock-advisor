import assert from "node:assert/strict";
import test from "node:test";
import { evaluate, evaluateWalkForward, fetchFmpSeries } from "../web/functions/api/strategy-backtest.js";
import { createFmpBudgetTestDb } from "./helpers/fmp-budget-db.mjs";

test("daily strategy equity reconciles to next-open trade ledger including costs",()=>{
  const rows=[];
  for(let i=0;i<700;i++) {
    const close=i<250?100:(i<470?150:80);
    const date=new Date(Date.UTC(2024,0,1+i)).toISOString().slice(0,10);
    rows.push({date,open:close,adjustedOpen:close,high:close,low:close,close,adjustedClose:close});
  }
  const report=evaluate(rows);
  assert.ok(report.trades>=1,"fixture should create at least one trade");
  assert.equal(report.reconciliationStatus,"RECONCILED");
  assert.ok(Math.abs(report.reconciliationDifferencePercent)<0.000001);
  assert.ok(Math.abs(report.strategy.totalReturnPercent-report.ledgerTotalReturnPercent)<0.000001);
});

test("entry-day overnight gap is not credited before next-open entry",()=>{
  const rows=[];
  for(let i=0;i<700;i++) {
    const close=i<250?100:(i<470?150:80);
    const open=close*1.1;
    const date=new Date(Date.UTC(2024,0,1+i)).toISOString().slice(0,10);
    rows.push({date,open,adjustedOpen:open,high:Math.max(open,close),low:Math.min(open,close),close,adjustedClose:close});
  }
  const report=evaluate(rows);
  assert.equal(report.reconciliationStatus,"RECONCILED");
  const first=report.tradeLog[0];
  assert.ok(first);
  const entryBar=rows.find(row=>row.date===first.entryDate);
  assert.equal(first.entryFillPrice,entryBar.adjustedOpen*(1+5/10000));
});

test("walk-forward folds use next-open entry and exit accounting",()=>{
  const rows=[];
  for(let i=0;i<700;i++) {
    const close=i<250?100:(i<470?150:80);
    const open=close*1.1;
    const date=new Date(Date.UTC(2024,0,1+i)).toISOString().slice(0,10);
    rows.push({date,open,adjustedOpen:open,high:Math.max(open,close),low:Math.min(open,close),close,adjustedClose:close});
  }
  const report=evaluateWalkForward(rows);
  assert.equal(report.totalFolds,3);
  assert.ok(report.folds.every(fold=>Number.isFinite(fold.returnPercent)));
  assert.ok(report.folds.some(fold=>fold.entries>0));
  assert.match(report.methodology,/execution at current adjusted open/);
});

test("historical FMP fetch shares the verified daily budget and persistent cache",async()=>{
  const db=createFmpBudgetTestDb();let calls=0;
  const now=Date.UTC(2026,10,12,15);
  const rows=Array.from({length:400},(_,i)=>{const d=new Date(Date.UTC(2025,0,1+i)).toISOString().slice(0,10);return {date:d,open:100,high:101,low:99,close:100,adjClose:100};});
  const fetchImpl=async url=>{calls++;assert.equal(new URL(url).pathname,"/stable/historical-price-eod/full");return new Response(JSON.stringify(rows),{status:200,headers:{"Content-Type":"application/json"}});};
  await assert.rejects(()=>fetchFmpSeries("AAPL","test-key",{db,now,fetchImpl}),/FMP_VERIFIED_DAILY_LIMIT/);
  assert.equal(calls,0,"unverified account limits must prevent provider calls");
  const first=await fetchFmpSeries("AAPL","test-key",{db,verifiedDailyLimit:250,now,fetchImpl});
  assert.equal(first.length,400);assert.equal(calls,1);
  const second=await fetchFmpSeries("AAPL","test-key",{db,verifiedDailyLimit:250,now,fetchImpl});
  assert.equal(second.length,400);assert.equal(calls,1,"cached history must not consume another upstream request");
  assert.equal(db.events.reduce((sum,event)=>sum+event.cost,0),1);
});
