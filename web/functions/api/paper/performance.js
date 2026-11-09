// Read-only account snapshot and broker-fill performance. Gross FIFO P&L excludes fees and non-trade cash activities.
const H={"Cache-Control":"no-store","X-Content-Type-Options":"nosniff","Referrer-Policy":"no-referrer"};
function fifo(fills){
 const lots=new Map(),closed=[],issues=[];
 for(let i=1;i<fills.length;i++){
  const previous=fills[i-1],current=fills[i];
  if(String(previous.symbol||"").toUpperCase()===String(current.symbol||"").toUpperCase()&&
     String(previous.transaction_time||"")===String(current.transaction_time||"")&&
     (String(previous.side||"").toLowerCase()!==String(current.side||"").toLowerCase()||Number(previous.price)!==Number(current.price))){
   issues.push({activityId:current.activity_id,symbol:String(current.symbol||"").toUpperCase(),reason:"AMBIGUOUS_FILL_ORDERING"});
  }
 }
 for(const f of fills){
  const symbol=String(f.symbol||"").toUpperCase(),side=String(f.side||"").toLowerCase(),qty=Number(f.qty),price=Number(f.price);
  if(!symbol||!["buy","sell"].includes(side)||!Number.isFinite(qty)||qty<=0||!Number.isFinite(price)||price<=0){issues.push({activityId:f.activity_id,reason:"INVALID_FILL"});continue;}
  if(!lots.has(symbol))lots.set(symbol,[]);
  const queue=lots.get(symbol);
  if(side==="buy"){queue.push({remaining:qty,price});continue;}
  let remaining=qty,realized=0,matched=0;
  while(remaining>1e-8&&queue.length){
   const lot=queue[0],take=Math.min(remaining,lot.remaining);
   realized+=(price-lot.price)*take;remaining-=take;matched+=take;lot.remaining-=take;
   if(lot.remaining<=1e-8)queue.shift();
  }
  if(remaining>1e-8)issues.push({activityId:f.activity_id,symbol,reason:"SELL_EXCEEDS_IMPORTED_BUY_LOTS",unmatchedQty:Number(remaining.toFixed(8))});
  if(matched>0)closed.push({activityId:f.activity_id,symbol,matchedQty:Number(matched.toFixed(8)),grossRealizedPlUsd:Number(realized.toFixed(4)),fullyMatched:remaining<=1e-8,transactionTime:f.transaction_time});
 }
 const valid=issues.length===0;
 const wins=closed.filter(x=>x.fullyMatched&&x.grossRealizedPlUsd>0).length;
 const losses=closed.filter(x=>x.fullyMatched&&x.grossRealizedPlUsd<0).length;
 const matched=closed.filter(x=>x.fullyMatched);
 const gains=matched.filter(x=>x.grossRealizedPlUsd>0).reduce((s,x)=>s+x.grossRealizedPlUsd,0);
 const lossAbs=Math.abs(matched.filter(x=>x.grossRealizedPlUsd<0).reduce((s,x)=>s+x.grossRealizedPlUsd,0));
 return {valid,issues,closed,openLots:[...lots.entries()].flatMap(([symbol,queue])=>queue.map(l=>({symbol,qty:Number(l.remaining.toFixed(8)),entryPrice:l.price}))),metrics:valid?{matchedSellExecutions:matched.length,grossRealizedPlUsd:Number(matched.reduce((s,x)=>s+x.grossRealizedPlUsd,0).toFixed(2)),winRatePct:matched.length?Number((wins/matched.length*100).toFixed(2)):null,profitFactor:lossAbs>0?Number((gains/lossAbs).toFixed(3)):gains>0?"NO_LOSSES":null,wins,losses}:null};
}
function trackedOrderIds(rows){
 const ids=new Set();
 for(const row of rows){
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
export async function onRequestGet({env}){
 const db=env?.NORTHSTAR_DB;
 if(!db)return Response.json({ok:false,available:false,execution:false,error:"Paper ledger unavailable."},{status:503,headers:H});
 try{
  const [control,rows,positions,fillRows,orderRows,derivedFillCount,derivedLotRows,derivedRealizedRows]=await Promise.all([
   db.prepare("SELECT enabled,mode,kill_switch,max_portfolio_usd FROM execution_control WHERE id=1").first(),
   db.prepare("SELECT captured_at,equity_usd,cash_usd,buying_power_usd,day_pl_usd,source FROM paper_equity_snapshots ORDER BY captured_at ASC LIMIT 1000").all(),
   db.prepare("SELECT symbol,qty,avg_entry_price,market_value,unrealized_pl,reconciled_at FROM paper_positions ORDER BY symbol").all(),
   db.prepare("SELECT activity_id,broker_order_id,symbol,side,qty,price,transaction_time FROM broker_fill_activities ORDER BY transaction_time ASC,activity_id ASC LIMIT 5001").all(),
   db.prepare("SELECT broker_order_id,response_json FROM paper_orders ORDER BY submitted_at ASC").all(),
   db.prepare("SELECT COUNT(*) AS tracked_fill_count FROM northstar_fill_ledger").first(),
   db.prepare("SELECT lot_id,symbol,open_qty,entry_price,opened_at FROM paper_position_lots ORDER BY symbol,opened_at,lot_id LIMIT 5001").all(),
   db.prepare("SELECT close_activity_id,open_activity_id,symbol,qty,entry_price,exit_price,realized_pl_usd,closed_at FROM paper_realized_trades ORDER BY closed_at,close_activity_id,open_activity_id LIMIT 5001").all()
  ]);
  if(!control||control.mode!=="paper")return Response.json({ok:false,available:false,execution:false,error:"Paper mode is required for read-only performance reporting."},{status:503,headers:H});
  const snapshots=Array.isArray(rows?.results)?rows.results:[],rawFills=Array.isArray(fillRows?.results)?fillRows.results:[];
  const orderIds=trackedOrderIds(Array.isArray(orderRows?.results)?orderRows.results:[]);
  const trackedFills=rawFills.filter(fill=>orderIds.has(String(fill?.broker_order_id||"")));
  const untrackedBrokerFillActivities=Math.max(0,rawFills.length-trackedFills.length);
  const fillHistoryTruncated=rawFills.length>5000;
  const fills=trackedFills.slice(0,5000);
  const current=snapshots.at(-1)||null,first=snapshots[0]||null;
  let peak=-Infinity,maxDrawdown=0;
  const curve=snapshots.map(s=>{const e=Number(s.equity_usd);if(!Number.isFinite(e)||e<=0)return null;peak=Math.max(peak,e);const dd=e/peak-1;maxDrawdown=Math.min(maxDrawdown,dd);return {capturedAt:s.captured_at,equityUsd:e,cashUsd:Number(s.cash_usd),dayPlUsd:s.day_pl_usd===null?null:Number(s.day_pl_usd),drawdownPct:Number((dd*100).toFixed(4))};}).filter(Boolean);
  const start=first?Number(first.equity_usd):null,end=current?Number(current.equity_usd):null;
  const fifoResult=fifo(fills),tradeMetrics=fifoResult.metrics;
  const derivedCount=Number(derivedFillCount?.tracked_fill_count);
  const derivedLots=Array.isArray(derivedLotRows?.results)?derivedLotRows.results:[];
  const derivedRealized=Array.isArray(derivedRealizedRows?.results)?derivedRealizedRows.results:[];
  const derivedTruncated=derivedLots.length>5000||derivedRealized.length>5000;
  const fifoLotsSorted=[...fifoResult.openLots].map(x=>({symbol:String(x.symbol||"").toUpperCase(),qty:Number(x.qty),entryPrice:Number(x.entryPrice)})).sort((a,b)=>a.symbol.localeCompare(b.symbol)||a.entryPrice-b.entryPrice||a.qty-b.qty);
  const derivedLotsSorted=derivedLots.map(x=>({symbol:String(x.symbol||"").toUpperCase(),qty:Number(x.open_qty),entryPrice:Number(x.entry_price)})).sort((a,b)=>a.symbol.localeCompare(b.symbol)||a.entryPrice-b.entryPrice||a.qty-b.qty);
  const openLotsMatch=fifoLotsSorted.length===derivedLotsSorted.length&&fifoLotsSorted.every((lot,i)=>lot.symbol===derivedLotsSorted[i].symbol&&Number.isFinite(derivedLotsSorted[i].qty)&&Math.abs(lot.qty-derivedLotsSorted[i].qty)<=0.0001&&Math.abs(lot.entryPrice-derivedLotsSorted[i].entryPrice)<=0.01);
  const derivedGross=derivedRealized.reduce((sum,row)=>sum+Number(row.realized_pl_usd||0),0);
  const fifoGross=Number(tradeMetrics?.grossRealizedPlUsd||0);
  const derivedClosedQty=derivedRealized.reduce((sum,row)=>sum+Number(row.qty||0),0);
  const fifoClosedQty=fifoResult.closed.reduce((sum,row)=>sum+Number(row.matchedQty||0),0);
  const derivedCloseCount=new Set(derivedRealized.map(row=>String(row.close_activity_id||""))).size;
  const fifoCloseCount=Number(tradeMetrics?.matchedSellExecutions||0);
  const derivedLedgerIssues=[];
  if(!Number.isFinite(derivedCount)||derivedTruncated)derivedLedgerIssues.push({reason:"FILL_DERIVED_LEDGER_UNAVAILABLE_OR_TRUNCATED",trackedFillCount:Number.isFinite(derivedCount)?derivedCount:null,openLotRows:derivedLots.length,realizedRows:derivedRealized.length});
  if(Number.isFinite(derivedCount)&&derivedCount!==trackedFills.length)derivedLedgerIssues.push({reason:"FILL_DERIVED_TRACKED_COUNT_MISMATCH",derivedTrackedFills:derivedCount,importedTrackedFills:trackedFills.length});
  if(!derivedTruncated&&!openLotsMatch)derivedLedgerIssues.push({reason:"FILL_DERIVED_OPEN_LOTS_MISMATCH"});
  if(!derivedTruncated&&(Math.abs(derivedGross-fifoGross)>0.01||Math.abs(derivedClosedQty-fifoClosedQty)>0.0001||derivedCloseCount!==fifoCloseCount))derivedLedgerIssues.push({reason:"FILL_DERIVED_REALIZED_MATCH_MISMATCH",derivedGrossRealizedPlUsd:Number(derivedGross.toFixed(2)),fifoGrossRealizedPlUsd:fifoGross,derivedClosedQty:Number(derivedClosedQty.toFixed(8)),fifoClosedQty:Number(fifoClosedQty.toFixed(8)),derivedCloseCount,fifoCloseCount});
  const derivedLedgerConsistent=derivedLedgerIssues.length===0&&fifoResult.valid;
  const fillAvailable=fills.length>0&&!fillHistoryTruncated&&fifoResult.valid&&derivedLedgerConsistent;
  const fillIssues=[...fifoResult.issues,...derivedLedgerIssues,...(fillHistoryTruncated?[{reason:"FILL_HISTORY_LIMIT_REACHED",limit:5000,loaded:rawFills.length}]:[])];
  const fillStatus=fillHistoryTruncated?"WITHHELD_FILL_HISTORY_LIMIT_REACHED":!fifoResult.valid?"WITHHELD_FILL_DATA_QUALITY":fills.length&&!derivedLedgerConsistent?"WITHHELD_FILL_DERIVED_LEDGER_MISMATCH":fills.length?"WITHHELD_FILL_DATA_QUALITY":"NOT_AVAILABLE_NO_TRACKED_NORTHSTAR_FILLS";
  return Response.json({ok:true,available:snapshots.length>0,execution:false,mode:"paper",virtualAllocationUsd:Number(control.max_portfolio_usd),snapshotCount:snapshots.length,firstSnapshotAt:first?.captured_at||null,lastSnapshotAt:current?.captured_at||null,current:current?{equityUsd:end,cashUsd:Number(current.cash_usd),buyingPowerUsd:current.buying_power_usd===null?null:Number(current.buying_power_usd),dayPlUsd:current.day_pl_usd===null?null:Number(current.day_pl_usd)}:null,observedChange:{amountUsd:start!==null&&end!==null?Number((end-start).toFixed(2)):null,returnPct:start&&end!==null?Number(((end/start-1)*100).toFixed(4)):null,maxDrawdownPct:snapshots.length>0?Number((maxDrawdown*100).toFixed(4)):null},positions:(positions?.results||[]).map(p=>({symbol:p.symbol,qty:Number(p.qty),avgEntryPrice:Number(p.avg_entry_price),marketValue:p.market_value===null?null:Number(p.market_value),unrealizedPl:p.unrealized_pl===null?null:Number(p.unrealized_pl),reconciledAt:p.reconciled_at})),equityCurve:curve,fillLedger:{available:fillAvailable,historyComplete:!fillHistoryTruncated,historyLimit:5000,importedFillActivities:rawFills.length,trackedNorthstarFillActivities:trackedFills.length,untrackedBrokerFillActivities,derivedLedger:{complete:derivedLedgerConsistent&&!fillHistoryTruncated,trackedFillCount:Number.isFinite(derivedCount)?derivedCount:null,openLotCount:derivedLots.length,realizedMatchRows:derivedRealized.length,grossRealizedPlUsd:derivedLedgerConsistent&&!fillHistoryTruncated&&!derivedTruncated?Number(derivedGross.toFixed(2)):null,openLots:derivedLedgerConsistent&&!fillHistoryTruncated&&!derivedTruncated?derivedLotsSorted:[]},closedSellExecutions:fillAvailable?fifoResult.closed:[],openLots:fillAvailable?fifoResult.openLots:[],dataQualityIssues:fillIssues},tradeStatistics:fillAvailable?{...tradeMetrics,status:"GROSS_FIFO_FROM_BROKER_FILLS_EX_FEES"}:{completedTrades:null,realizedPlUsd:null,winRatePct:null,profitFactor:null,status:fillStatus},notes:["Observed account return and drawdown use saved broker equity snapshots; they are not strategy returns.","FIFO realized P&L is gross and excludes fees, dividends, transfers, taxes, corporate actions and FX unless separately modeled.","Only Alpaca Paper FILL activities associated with a Northstar ledger order or its recorded nested child-order IDs are included in Northstar trade statistics; unrelated broker activity is excluded.",
"Untracked broker fill activities remain visible as a count and are not attributed to the Northstar strategy.",
"Only Alpaca Paper FILL activities are imported; this endpoint never submits or modifies orders.","A sell without sufficient imported buy lots invalidates realized statistics rather than inventing a cost basis.","FIFO trade statistics are withheld when the 5,000-activity query limit is reached; a truncated history is not a complete cost-basis record.","FIFO statistics are published only when they agree with the independent D1 fill-derived open-lot and realized-match tables.","The broker account is separate from Northstar's $1,000 virtual planning allocation.","No order execution is performed by this endpoint."],checkedAt:new Date().toISOString()},{headers:H});
 }catch{return Response.json({ok:false,available:false,execution:false,error:"Could not read a consistent paper performance snapshot. Confirm migrations 0004 and 0006 are applied."},{status:503,headers:H});}
}
