import test from "node:test";
import assert from "node:assert/strict";
import {readFile} from "node:fs/promises";
const source=await readFile(new URL("../web/functions/api/paper/performance.js",import.meta.url),"utf8");
const {onRequestGet}=await import("data:text/javascript;base64,"+Buffer.from(source).toString("base64"));
import {derivePaperPositionLedger} from "../web/lib/paper-position-ledger.js";
const control={enabled:0,mode:"paper",kill_switch:1,max_portfolio_usd:1000};
function trackedIds(orders){
 const ids=new Set();
 for(const row of orders){
  if(row?.broker_order_id)ids.add(String(row.broker_order_id));
  let data;try{data=JSON.parse(row?.response_json||"{}");}catch{continue;}
  const roots=[data,data?.brokerResponse,data?.order,data?.response];
  for(const root of roots){
   if(!root||typeof root!=="object")continue;
   if(root.id)ids.add(String(root.id));
   for(const leg of Array.isArray(root.legs)?root.legs:[])if(leg?.id)ids.add(String(leg.id));
   for(const child of Array.isArray(root.child_orders)?root.child_orders:[])if(child?.id)ids.add(String(child.id));
  }
 }
 return ids;
}
function db({snapshots=[],positions=[],fills=[],orders=[{broker_order_id:"test-order",response_json:"{}"}]}={}){
 const ids=trackedIds(orders);
 const tracked=fills.filter(fill=>ids.has(String(fill?.broker_order_id||"")));
 const derived=tracked.length<=5000?derivePaperPositionLedger(tracked.map(fill=>({...fill,order_id:"northstar-test-order"}))):{ok:false,lots:[],realized:[]};
 const lots=(derived.ok?derived.lots:[]).map(lot=>({lot_id:lot.lotId,symbol:lot.symbol,open_qty:lot.openQty,entry_price:lot.entryPrice,opened_at:lot.openedAt}));
 const realized=(derived.ok?derived.realized:[]).map(row=>({close_activity_id:row.closeActivityId,open_activity_id:row.openActivityId,symbol:row.symbol,qty:row.qty,entry_price:row.entryPrice,exit_price:row.exitPrice,realized_pl_usd:row.realizedPl,closed_at:row.closedAt}));
 return {prepare(sql){return {
  async first(){if(sql.includes("execution_control"))return control;if(sql.includes("northstar_fill_ledger"))return {tracked_fill_count:tracked.length};throw Error("unexpected first SQL: "+sql);},
  async all(){if(sql.includes("paper_equity_snapshots"))return {results:snapshots};if(sql.includes("paper_position_lots"))return {results:lots};if(sql.includes("paper_realized_trades"))return {results:realized};if(sql.includes("paper_positions"))return {results:positions};if(sql.includes("broker_fill_activities"))return {results:fills};if(sql.includes("FROM paper_orders"))return {results:orders};throw Error("unexpected SQL: "+sql);}
 };}};
}
test("performance is unavailable with no durable snapshots and does not invent P&L",async()=>{const r=await onRequestGet({env:{NORTHSTAR_DB:db()}});const b=await r.json();assert.equal(r.status,200);assert.equal(b.available,false);assert.equal(b.snapshotCount,0);assert.equal(b.observedChange.returnPct,null);assert.equal(b.tradeStatistics.realizedPlUsd,null);assert.equal(b.execution,false);});
test("performance calculates observed return and peak drawdown from stored snapshots",async()=>{const snapshots=[{captured_at:"2026-01-01T00:00:00Z",equity_usd:100000,cash_usd:90000,day_pl_usd:0},{captured_at:"2026-01-02T00:00:00Z",equity_usd:105000,cash_usd:90000,day_pl_usd:5000},{captured_at:"2026-01-03T00:00:00Z",equity_usd:95000,cash_usd:90000,day_pl_usd:-10000}];const r=await onRequestGet({env:{NORTHSTAR_DB:db({snapshots})}});const b=await r.json();assert.equal(r.status,200);assert.equal(b.observedChange.amountUsd,-5000);assert.equal(b.observedChange.returnPct,-5);assert.equal(b.observedChange.maxDrawdownPct,-9.5238);assert.equal(b.tradeStatistics.winRatePct,null);assert.equal(b.equityCurve.length,3);});
test("performance fails closed outside paper mode",async()=>{const bad=db();bad.prepare=()=>({first:async()=>({...control,mode:"live",enabled:1,kill_switch:0}),all:async()=>({results:[]})});const r=await onRequestGet({env:{NORTHSTAR_DB:bad}});assert.equal(r.status,503);});

test("read-only performance remains available while paper execution is enabled",async()=>{const active=db();active.prepare=()=>({first:async()=>({...control,enabled:1,kill_switch:0}),all:async()=>({results:[]})});const r=await onRequestGet({env:{NORTHSTAR_DB:active}});const b=await r.json();assert.equal(r.status,200);assert.equal(b.execution,false);});

test("FIFO realized P&L matches a buy lot to a later sell fill",async()=>{const fills=[{activity_id:"a1",broker_order_id:"test-order",symbol:"AAPL",side:"buy",qty:10,price:100,transaction_time:"2026-01-01T10:00:00Z"},{activity_id:"a2",broker_order_id:"test-order",symbol:"AAPL",side:"sell",qty:4,price:110,transaction_time:"2026-01-02T10:00:00Z"}];const r=await onRequestGet({env:{NORTHSTAR_DB:db({fills})}});const b=await r.json();assert.equal(r.status,200);assert.equal(b.tradeStatistics.grossRealizedPlUsd,40);assert.equal(b.tradeStatistics.matchedSellExecutions,1);assert.equal(b.tradeStatistics.winRatePct,100);assert.equal(b.fillLedger.openLots[0].qty,6);});
test("FIFO handles multiple entry lots and partial exits",async()=>{const fills=[{activity_id:"1",broker_order_id:"test-order",symbol:"MSFT",side:"buy",qty:2,price:10,transaction_time:"2026-01-01"},{activity_id:"2",broker_order_id:"test-order",symbol:"MSFT",side:"buy",qty:2,price:12,transaction_time:"2026-01-02"},{activity_id:"3",broker_order_id:"test-order",symbol:"MSFT",side:"sell",qty:3,price:15,transaction_time:"2026-01-03"}];const r=await onRequestGet({env:{NORTHSTAR_DB:db({fills})}});const b=await r.json();assert.equal(b.tradeStatistics.grossRealizedPlUsd,13);assert.equal(b.fillLedger.openLots[0].qty,1);});
test("FIFO withholds realized P&L when a sell has no imported buy cost basis",async()=>{const fills=[{activity_id:"1",broker_order_id:"test-order",symbol:"TSLA",side:"sell",qty:1,price:200,transaction_time:"2026-01-01"}];const r=await onRequestGet({env:{NORTHSTAR_DB:db({fills})}});const b=await r.json();assert.equal(b.tradeStatistics.status,"WITHHELD_FILL_DATA_QUALITY");assert.equal(b.tradeStatistics.grossRealizedPlUsd??null,null);assert.equal(b.fillLedger.dataQualityIssues[0].reason,"SELL_EXCEEDS_IMPORTED_BUY_LOTS");});

test("FIFO metrics are withheld when the 5,000-activity history limit is reached",async()=>{const fills=Array.from({length:5001},(_,i)=>({activity_id:"fill-"+i,broker_order_id:"test-order",symbol:"AAPL",side:"buy",qty:1,price:100,transaction_time:new Date(Date.UTC(2026,0,1,0,0,i)).toISOString()}));const r=await onRequestGet({env:{NORTHSTAR_DB:db({fills})}});const b=await r.json();assert.equal(r.status,200);assert.equal(b.fillLedger.available,false);assert.equal(b.fillLedger.historyComplete,false);assert.equal(b.fillLedger.importedFillActivities,5001);assert.equal(b.tradeStatistics.status,"WITHHELD_FILL_HISTORY_LIMIT_REACHED");assert.equal(b.tradeStatistics.grossRealizedPlUsd??null,null);assert.equal(b.fillLedger.closedSellExecutions.length,0);assert.equal(b.fillLedger.dataQualityIssues.at(-1).reason,"FILL_HISTORY_LIMIT_REACHED");});
test("performance excludes unrelated Alpaca fills and includes recorded OTO child fills",async()=>{
 const fills=[
  {activity_id:"ns-entry-fill",broker_order_id:"ns-entry",symbol:"AAPL",side:"buy",qty:2,price:100,transaction_time:"2026-01-01T10:00:00Z"},
  {activity_id:"ns-stop-fill",broker_order_id:"ns-stop-child",symbol:"AAPL",side:"sell",qty:1,price:120,transaction_time:"2026-01-02T10:00:00Z"},
  {activity_id:"manual-fill",broker_order_id:"manual-external",symbol:"AAPL",side:"buy",qty:10,price:1,transaction_time:"2026-01-03T10:00:00Z"}
 ];
 const orders=[{broker_order_id:"ns-entry",response_json:'{"id":"ns-entry","legs":[{"id":"ns-stop-child","type":"stop"}]}'}];
 const r=await onRequestGet({env:{NORTHSTAR_DB:db({fills,orders})}});
 const b=await r.json();
 assert.equal(r.status,200);
 assert.equal(b.fillLedger.trackedNorthstarFillActivities,2);
 assert.equal(b.fillLedger.untrackedBrokerFillActivities,1);
 assert.equal(b.tradeStatistics.grossRealizedPlUsd,20);
 assert.equal(b.fillLedger.openLots[0].qty,1);
});
