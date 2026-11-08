// Read-only performance summary derived only from durable D1 equity snapshots.
const H={"Cache-Control":"no-store","X-Content-Type-Options":"nosniff","Referrer-Policy":"no-referrer"};
export async function onRequestGet({env}){
 const db=env?.NORTHSTAR_DB;
 if(!db)return Response.json({ok:false,available:false,execution:false,error:"Paper ledger unavailable."},{status:503,headers:H});
 try{
  const [control,rows,positions]=await Promise.all([
   db.prepare("SELECT enabled,mode,kill_switch,max_portfolio_usd FROM execution_control WHERE id=1").first(),
   db.prepare("SELECT captured_at,equity_usd,cash_usd,buying_power_usd,day_pl_usd,source FROM paper_equity_snapshots ORDER BY captured_at ASC LIMIT 1000").all(),
   db.prepare("SELECT symbol,qty,avg_entry_price,market_value,unrealized_pl,reconciled_at FROM paper_positions ORDER BY symbol").all()
  ]);
  if(!control||control.mode!=="paper"||Number(control.enabled)!==0||Number(control.kill_switch)!==1)return Response.json({ok:false,available:false,execution:false,error:"Execution policy is not in the required disabled/kill-switched state."},{status:503,headers:H});
  const snapshots=Array.isArray(rows?.results)?rows.results:[];
  const current=snapshots.at(-1)||null,first=snapshots[0]||null;
  let peak=-Infinity,maxDrawdown=0;
  const curve=snapshots.map(s=>{const e=Number(s.equity_usd);if(!Number.isFinite(e)||e<=0)return null;peak=Math.max(peak,e);const dd=(e/peak)-1;maxDrawdown=Math.min(maxDrawdown,dd);return {capturedAt:s.captured_at,equityUsd:e,cashUsd:Number(s.cash_usd),dayPlUsd:s.day_pl_usd===null?null:Number(s.day_pl_usd),drawdownPct:Number((dd*100).toFixed(4))};}).filter(Boolean);
  const start=first?Number(first.equity_usd):null,end=current?Number(current.equity_usd):null;
  const totalReturnPct=start&&end!==null?Number(((end/start-1)*100).toFixed(4)):null;
  return Response.json({ok:true,available:snapshots.length>0,execution:false,mode:"paper",virtualAllocationUsd:Number(control.max_portfolio_usd),snapshotCount:snapshots.length,firstSnapshotAt:first?.captured_at||null,lastSnapshotAt:current?.captured_at||null,current:current?{equityUsd:end,cashUsd:Number(current.cash_usd),buyingPowerUsd:current.buying_power_usd===null?null:Number(current.buying_power_usd),dayPlUsd:current.day_pl_usd===null?null:Number(current.day_pl_usd)}:null,observedChange:{amountUsd:start!==null&&end!==null?Number((end-start).toFixed(2)):null,returnPct:totalReturnPct,maxDrawdownPct:snapshots.length>0?Number((maxDrawdown*100).toFixed(4)):null},positions:(positions?.results||[]).map(p=>({symbol:p.symbol,qty:Number(p.qty),avgEntryPrice:Number(p.avg_entry_price),marketValue:p.market_value===null?null:Number(p.market_value),unrealizedPl:p.unrealized_pl===null?null:Number(p.unrealized_pl),reconciledAt:p.reconciled_at})),equityCurve:curve,tradeStatistics:{completedTrades:null,realizedPlUsd:null,winRatePct:null,profitFactor:null,status:"NOT_AVAILABLE_NO_DURABLE_FILL_LEDGER"},notes:["Return and drawdown are calculated from the first and latest stored broker equity snapshots; they are not strategy returns.","A single snapshot is not enough to calculate a return or drawdown history.","Realized P&L, win rate, expectancy and profit factor are intentionally null until durable fills and closed-trade accounting exist.","The broker account is a separate Alpaca Paper account; the $1,000 virtual planning allocation is not substituted for broker equity.","No order execution is performed by this endpoint."],checkedAt:new Date().toISOString()},{headers:H});
 }catch{return Response.json({ok:false,available:false,execution:false,error:"Could not read a consistent paper performance snapshot."},{status:503,headers:H});}
}
