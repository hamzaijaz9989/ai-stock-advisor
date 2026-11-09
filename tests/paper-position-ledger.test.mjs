import test from "node:test";
import assert from "node:assert/strict";
import {derivePaperPositionLedger} from "../web/lib/paper-position-ledger.js";

const fill=(activity_id,order_id,broker_order_id,side,qty,price,transaction_time)=>({
  activity_id,order_id,broker_order_id,symbol:"AAPL",side,qty,price,transaction_time
});

test("FIFO ledger preserves multiple open lots and weighted average cost",()=>{
  const result=derivePaperPositionLedger([
    fill("b2","o2","bo2","buy",2,110,"2026-01-02T10:00:00Z"),
    fill("b1","o1","bo1","buy",3,100,"2026-01-01T10:00:00Z")
  ]);
  assert.equal(result.ok,true);
  assert.equal(result.positions.length,1);
  assert.equal(result.positions[0].qty,5);
  assert.equal(result.positions[0].avgEntryPrice,104);
  assert.equal(result.lots.length,2);
});

test("FIFO sell closes the oldest lot first and records realized gross P&L",()=>{
  const result=derivePaperPositionLedger([
    fill("buy-1","entry-1","broker-entry","buy",2,100,"2026-01-01T10:00:00Z"),
    fill("buy-2","entry-2","broker-entry-2","buy",2,110,"2026-01-02T10:00:00Z"),
    fill("sell-1","entry-2","broker-stop","sell",3,120,"2026-01-03T10:00:00Z")
  ]);
  assert.equal(result.ok,true);
  assert.equal(result.realized.length,2);
  assert.equal(result.realized[0].openActivityId,"buy-1");
  assert.equal(result.realized[0].qty,2);
  assert.equal(result.realized[1].openActivityId,"buy-2");
  assert.equal(result.realized[1].qty,1);
  assert.equal(result.grossRealizedPlUsd,50);
  assert.equal(result.positions[0].qty,1);
  assert.equal(result.positions[0].avgEntryPrice,110);
});

test("sell activity that exceeds tracked long shares fails closed",()=>{
  const result=derivePaperPositionLedger([
    fill("sell-1","close-1","broker-stop","sell",1,105,"2026-01-02T10:00:00Z")
  ]);
  assert.equal(result.ok,false);
  assert.equal(result.reason,"SELL_EXCEEDS_TRACKED_LONG_POSITION");
  assert.equal(result.execution,false);
});

test("duplicate activity identifiers fail closed",()=>{
  const row=fill("same","entry","broker","buy",1,100,"2026-01-01T10:00:00Z");
  const result=derivePaperPositionLedger([row,row]);
  assert.equal(result.ok,false);
  assert.equal(result.reason,"DUPLICATE_FILL_ACTIVITY_ID");
});

test("invalid timestamps and unsupported sides fail closed",()=>{
  assert.equal(derivePaperPositionLedger([fill("a","o","bo","buy",1,100,"bad")]).reason,"FILL_ROW_INVALID");
  assert.equal(derivePaperPositionLedger([fill("a","o","bo","short",1,100,"2026-01-01T10:00:00Z")]).reason,"FILL_ROW_INVALID");
});
