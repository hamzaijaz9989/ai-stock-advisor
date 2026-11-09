// Read-only account snapshot and broker-fill performance. Gross FIFO P&L excludes fees and non-trade cash activities.
const H={"Cache-Control":"no-store","X-Content-Type-Options":"nosniff","Referrer-Policy":"no-referrer"};
function fifo(fills){
 const lots=new Map(),closed=[],issues=[];
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
export async function onRequestGet({env}){
 const db=env?.NORTHSTAR_DB;
 if(!db)return Response.json({ok:false,available:false,execution:false,error:"Paper ledger unavailable."},{status:503,headers:H});
 try{
  const [control,rows,positions,fillRows]=await Promise.all([
   db.prepare("SELECT enabled,mode,kill_switch,max_portfolio_usd FROM execution_control WHERE id=1").first(),
   db.prepare("SELECT captured_at,equity_usd,cash_usd,buying_power_usd,day_pl_usd,source FROM paper_equity_snapshots ORDER BY captured_at ASC LIMIT 1000").all(),
   db.prepare("SELECT symbol,qty,avg_entry_price,market_value,unrealized_pl,reconciled_at FROM paper_positions ORDER BY symbol").all(),
   db.prepare("SELECT activity_id,broker_order_id,symbol,side,qty,price,transaction_time FROM broker_fill_activities ORDER BY transaction_time ASC,activity_id ASC LIMIT 5001").all()
  ]);
  if(!control||control.mode!=="paper")return Response.json({ok:false,available:false,execution:false,error:"Paper mode is required for read-only performance reporting."},{status:503,headers:H});
  const snapshots=Array.isArray(rows?.results)?rows.results:[],rawFills=Array.isArray(fillRows?.results)?fillRows.results:[];
  const fillHistoryTruncated=rawFills.length>5000;
  const fills=rawFills.slice(0,5000);
  const current=snapshots.at(-1)||null,first=snapshots[0]||null;
  let peak=-Infinity,maxDrawdown=0;
  const curve=snapshots.map(s=>{const e=Number(s.equity_usd);if(!Number.isFinite(e)||e<=0)return null;peak=Math.max(peak,e);const dd=e/peak-1;maxDrawdown=Math.min(maxDrawdown,dd);return {capturedAt:s.captured_at,equityUsd:e,cashUsd:Number(s.cash_usd),dayPlUsd:s.day_pl_usd===null?null:Number(s.day_pl_usd),drawdownPct:Number((dd*100).toFixed(4))};}).filter(Boolean);
  const start=first?Number(first.equity_usd):null,end=current?Number(current.equity_usd):null;
  const fifoResult=fifo(fills),tradeMetrics=fifoResult.metrics;
  const fillAvailable=fills.length>0&&!fillHistoryTruncated&&fifoResult.valid;
  const fillIssues=[...fifoResult.issues,...(fillHistoryTruncated?[{reason:"FILL_HISTORY_LIMIT_REACHED",limit:5000,loaded:rawFills.length}]:[])];
  const fillStatus=fillHistoryTruncated?"WITHHELD_FILL_HISTORY_LIMIT_REACHED":fills.length?"WITHHELD_FILL_DATA_QUALITY":"NOT_AVAILABLE_NO_IMPORTED_FILLS";
  return Response.json({ok:true,available:snapshots.length>0,execution:false,mode:"paper",virtualAllocationUsd:Number(control.max_portfolio_usd),snapshotCount:snapshots.length,firstSnapshotAt:first?.captured_at||null,lastSnapshotAt:current?.captured_at||null,current:current?{equityUsd:end,cashUsd:Number(current.cash_usd),buyingPowerUsd:current.buying_power_usd===null?null:Number(current.buying_power_usd),dayPlUsd:current.day_pl_usd===null?null:Number(current.day_pl_usd)}:null,observedChange:{amountUsd:start!==null&&end!==null?Number((end-start).toFixed(2)):null,returnPct:start&&end!==null?Number(((end/start-1)*100).toFixed(4)):null,maxDrawdownPct:snapshots.length>0?Number((maxDrawdown*100).toFixed(4)):null},positions:(positions?.results||[]).map(p=>({symbol:p.symbol,qty:Number(p.qty),avgEntryPrice:Number(p.avg_entry_price),marketValue:p.market_value===null?null:Number(p.market_value),unrealizedPl:p.unrealized_pl===null?null:Number(p.unrealized_pl),reconciledAt:p.reconciled_at})),equityCurve:curve,fillLedger:{available:fillAvailable,historyComplete:!fillHistoryTruncated,historyLimit:5000,importedFillActivities:rawFills.length,closedSellExecutions:fillAvailable?fifoResult.closed:[],openLots:fillAvailable?fifoResult.openLots:[],dataQualityIssues:fillIssues},tradeStatistics:fillAvailable?{...tradeMetrics,status:"GROSS_FIFO_FROM_BROKER_FILLS_EX_FEES"}:{completedTrades:null,realizedPlUsd:null,winRatePct:null,profitFactor:null,status:fillStatus},notes:["Observed account return and drawdown use saved broker equity snapshots; they are not strategy returns.","FIFO realized P&L is gross and excludes fees, dividends, transfers, taxes, corporate actions and FX unless separately modeled.","Only Alpaca Paper FILL activities are imported; this endpoint never submits or modifies orders.","A sell without sufficient imported buy lots invalidates realized statistics rather than inventing a cost basis.","FIFO trade statistics are withheld when the 5,000-activity query limit is reached; a truncated history is not a complete cost-basis record.","The broker account is separate from Northstar's $1,000 virtual planning allocation.","No order execution is performed by this endpoint."],checkedAt:new Date().toISOString()},{headers:H});
 }catch{return Response.json({ok:false,available:false,execution:false,error:"Could not read a consistent paper performance snapshot. Confirm migration 0004 is applied."},{status:503,headers:H});}
}
