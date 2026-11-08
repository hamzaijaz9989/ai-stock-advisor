import assert from "node:assert/strict";
import test from "node:test";
import { evaluate } from "../web/functions/api/strategy-backtest.js";

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
