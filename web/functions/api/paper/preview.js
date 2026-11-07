// Deterministic sizing preview only. No broker calls and no order submission.
const H={"Cache-Control":"no-store","X-Content-Type-Options":"nosniff","Referrer-Policy":"no-referrer"};
const fail=(error,status=400)=>Response.json({ok:false,execution:false,error},{status,headers:H});
export async function onRequestPost({request,env}) {
  if(!env?.NORTHSTAR_DB) return fail("Paper ledger unavailable; no trade can be considered.",503);
  let control;
  try { control=await env.NORTHSTAR_DB.prepare("SELECT enabled,mode,kill_switch,max_portfolio_usd,default_risk_fraction,max_risk_fraction,max_position_fraction FROM execution_control WHERE id=1").first(); }
  catch { return fail("Could not verify risk policy; fail-closed.",503); }
  if(!control || control.mode!=="paper" || Number(control.enabled)!==0 || Number(control.kill_switch)!==1) return fail("Execution policy is not in the required disabled/kill-switched state.",503);
  let body;
  try { body=await request.json(); } catch { return fail("Send a valid JSON request."); }
  const symbol=String(body?.symbol||"").trim().toUpperCase();
  const entry=Number(body?.entryPrice), stop=Number(body?.stopPrice);
  const riskFraction=body?.riskFraction===undefined?Number(control.default_risk_fraction):Number(body.riskFraction);
  if(!/^[A-Z][A-Z0-9.-]{0,9}$/.test(symbol)) return fail("Invalid ticker symbol.");
  if(!Number.isFinite(entry)||!Number.isFinite(stop)||entry<=0||stop<=0||entry<=stop) return fail("For a long-only preview, entryPrice must be greater than a positive stopPrice.");
  if(!Number.isFinite(riskFraction)||riskFraction<=0||riskFraction>Number(control.max_risk_fraction)) return fail("Risk fraction exceeds the configured maximum.");
  const capital=Number(control.max_portfolio_usd), riskBudget=capital*riskFraction, perShareRisk=entry-stop;
  const shares=Math.max(0,Math.min(Math.floor(riskBudget/perShareRisk),Math.floor(capital*Number(control.max_position_fraction)/entry)));
  const notional=shares*entry, plannedLoss=shares*perShareRisk;
  return Response.json({ok:true,execution:false,status:"PREVIEW_ONLY_NOT_AN_ORDER",mode:"paper",symbol,entryPrice:entry,stopPrice:stop,shares,notionalUsd:Number(notional.toFixed(2)),plannedStopRiskUsd:Number(plannedLoss.toFixed(2)),riskBudgetUsd:Number(riskBudget.toFixed(2)),limits:{virtualCapitalUsd:capital,maxPositionUsd:capital*Number(control.max_position_fraction),maxRiskFraction:Number(control.max_risk_fraction)},warnings:["Prices are user-supplied and are not live-quote validated.","Whole-share sizing only; gaps, slippage and fees can increase losses.","No broker request was made. No order was created."],checkedAt:new Date().toISOString()},{headers:H});
}
