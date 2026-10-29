const MODEL="@cf/meta/llama-3.1-8b-instruct";
const MAX_BODY=12000;
const ALLOWED=new Set(["AVOID","WAIT","INSUFFICIENT DATA","BUY SETUP — UNVALIDATED","BUY","SELL REVIEW","HOLD"]);
function reply(body,status=200){return new Response(JSON.stringify(body),{status,headers:{"Content-Type":"application/json; charset=utf-8","Cache-Control":"no-store","X-Content-Type-Options":"nosniff"}});}
function txt(v,n=180){return typeof v==="string"?v.replace(/[\u0000-\u001f<>]/g," ").slice(0,n):"";}
function num(v){return typeof v==="number"&&Number.isFinite(v)?v:null;}
export async function onRequestPost({request,env}){
 if(request.headers.get("content-type")?.split(";")[0].trim().toLowerCase()!=="application/json")return reply({error:"Content-Type must be application/json."},415);
 const origin=request.headers.get("origin");if(origin){try{if(new URL(origin).host!==new URL(request.url).host)return reply({error:"Cross-origin requests are not allowed."},403);}catch{return reply({error:"Invalid origin."},403);}}
 if(Number(request.headers.get("content-length")||0)>MAX_BODY)return reply({error:"Request too large."},413);
 let raw;try{raw=await request.text();}catch{return reply({error:"Invalid request body."},400);}if(raw.length>MAX_BODY)return reply({error:"Request too large."},413);
 let body;try{body=JSON.parse(raw);}catch{return reply({error:"Invalid JSON."},400);}
 const ticker=txt(body?.ticker,12).toUpperCase(),decision=txt(body?.decision,40);
 if(!/^[A-Z0-9.-]{1,12}$/.test(ticker)||!ALLOWED.has(decision))return reply({error:"Invalid ticker or decision."},400);
 if(!env?.AI||typeof env.AI.run!=="function")return reply({available:false,error:"Workers AI binding is not configured. Deterministic research remains available."},503);
 const e=body?.evidence&&typeof body.evidence==="object"?body.evidence:{};
 const evidence={quote:num(e.quote),quoteFresh:e.quoteFresh===true,valuationAvailable:e.valuationAvailable===true,valuationRatio:num(e.valuationRatio),annualRevenueGrowthPct:num(e.annualRevenueGrowthPct),quarterlyRevenueGrowthPct:num(e.quarterlyRevenueGrowthPct),annualNetIncomePositive:e.annualNetIncomePositive===true,annualFreeCashFlowPositive:e.annualFreeCashFlowPositive===true,quarterlyNetIncomePositive:e.quarterlyNetIncomePositive===true,earningsVerified:e.earningsVerified===true,daysToEarnings:num(e.daysToEarnings),recentHeadlineCount:Number.isInteger(e.recentHeadlineCount)?Math.max(0,Math.min(20,e.recentHeadlineCount)):null,flaggedHeadlineCount:Number.isInteger(e.flaggedHeadlineCount)?Math.max(0,Math.min(20,e.flaggedHeadlineCount)):null,historyAvailable:e.historyAvailable===true,missingChecks:Array.isArray(e.missingChecks)?e.missingChecks.slice(0,8).map(x=>txt(x,100)):[]};
 const prompt="You are Northstar AI, a conservative US equity research assistant. Explain only the supplied verified evidence. The deterministic rules engine owns the verdict: never change, upgrade, downgrade, or contradict it. Never invent facts, prices, news, earnings dates, figures, sources, or causes. null means unknown. A price/model ratio outside 0.40-2.50 means the valuation model is unreliable for this decision, not proof the stock is overpriced. No automatic trade instructions or price targets. Output ONLY valid JSON: {headline: string max 90 chars, reasons: exactly 2 concise strings, risk: concise string, data_quality: concise string}. Plain English; explicitly state missing data. No flagged headlines is not proof of no risk. Ticker: "+ticker+"\nDeterministic verdict (must remain unchanged): "+decision+"\nVerified evidence: "+JSON.stringify(evidence);
 try{
  const result=await env.AI.run(MODEL,{messages:[{role:"system",content:"Follow research-only constraints. Return valid JSON only."},{role:"user",content:prompt}],max_tokens:260,temperature:0.1});
  const output=typeof result?.response==="string"?result.response:"",match=output.match(/\{[\s\S]*\}/);if(!match)throw new Error("No JSON");
  const parsed=JSON.parse(match[0]),headline=txt(parsed.headline,90),reasons=Array.isArray(parsed.reasons)?parsed.reasons.slice(0,2).map(x=>txt(x,180)).filter(Boolean):[],risk=txt(parsed.risk,180),dataQuality=txt(parsed.data_quality,180);
  if(!headline||reasons.length!==2||!risk||!dataQuality)throw new Error("Invalid shape");
  return reply({available:true,model:MODEL,ticker,deterministicDecision:decision,headline,reasons,risk,dataQuality});
 }catch{return reply({available:false,error:"AI reasoning was unavailable or failed validation. The deterministic verdict is unchanged."},502);}
}