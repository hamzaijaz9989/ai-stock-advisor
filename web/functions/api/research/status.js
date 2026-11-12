// Public, read-only Research Council observability.
// Only run metadata and agent role/status pairs are exposed; reports, evidence,
// portfolio values, request IDs and provider payloads remain server-side.
const HEADERS={"Cache-Control":"no-store","X-Content-Type-Options":"nosniff","Referrer-Policy":"no-referrer"};
const AGENT_ROLES=Object.freeze([
 "market_scanner","technical_analyst","fundamental_analyst","news_analyst","sentiment_analyst",
 "bull_researcher","bear_researcher","portfolio_analyst","risk_committee"
]);
const allowedAgentStatus=new Set(["COMPLETE","UNAVAILABLE","BLOCKED","NOT_RUN"]);
const allowedRunStatus=new Set(["NO_TRADE","RESEARCH_REVIEW_REQUIRED","RESEARCH_ONLY_PARTIAL"]);
const respond=(body,status=200)=>Response.json(body,{status,headers:HEADERS});
function summarize(row){
 let result=null;
 try{result=JSON.parse(row.result_json);}catch{}
 const byRole=new Map((Array.isArray(result?.agents)?result.agents:[])
  .filter(x=>x&&typeof x.role==="string").map(x=>[x.role,allowedAgentStatus.has(x.status)?x.status:"UNKNOWN"]));
 return {
  symbol:/^[A-Z][A-Z0-9.-]{0,11}$/.test(String(row.symbol||"").toUpperCase())?String(row.symbol).toUpperCase():"UNKNOWN",
  status:allowedRunStatus.has(result?.status)?result.status:"TRACE_UNAVAILABLE",
  createdAt:typeof row.created_at==="string"?row.created_at:null,
  agents:AGENT_ROLES.map(role=>{const agent=(Array.isArray(result?.agents)?result.agents:[]).find(x=>x?.role===role);const t=agent?.telemetry&&typeof agent.telemetry==="object"?agent.telemetry:null;return {role,status:byRole.get(role)||"NOT_RUN",latencyMs:Number.isFinite(t?.latencyMs)?t.latencyMs:null,provider:typeof t?.provider==="string"?t.provider:null,model:typeof t?.model==="string"?t.model:null,failed:t?.failed===true,unavailable:t?.unavailable===true,inputTokens:Number.isSafeInteger(t?.inputTokens)?t.inputTokens:null,outputTokens:Number.isSafeInteger(t?.outputTokens)?t.outputTokens:null,totalTokens:Number.isSafeInteger(t?.totalTokens)?t.totalTokens:null}})
 };
}
export async function onRequestGet({request,env}){
 const db=env?.NORTHSTAR_DB;
 if(!db)return respond({ok:false,error:"Research observability ledger unavailable."},503);
 const requested=Number(new URL(request.url).searchParams.get("limit")||5);
 const limit=Number.isInteger(requested)?Math.max(1,Math.min(10,requested)):5;
 try{
  const rows=await db.prepare("SELECT symbol,status,result_json,created_at FROM research_council_runs ORDER BY created_at DESC LIMIT ?").bind(limit).all();
  const runs=(rows?.results||[]).map(summarize);
  return respond({ok:true,checkedAt:new Date().toISOString(),agentCount:AGENT_ROLES.length,latestRun:runs[0]||null,runs});
 }catch{
  return respond({ok:false,error:"Research observability query failed safely."},503);
 }
}
