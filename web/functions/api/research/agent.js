// Read-only, allowlisted Research Council agent detail endpoint.
// Exposes agent-authored claims and evidence IDs, never raw provider facts or portfolio data.
const HEADERS={"Cache-Control":"no-store","X-Content-Type-Options":"nosniff","Referrer-Policy":"no-referrer"};
const ROLES=new Set(["market_scanner","technical_analyst","fundamental_analyst","news_analyst","sentiment_analyst","bull_researcher","bear_researcher","portfolio_analyst","risk_committee"]);
const reply=(body,status=200)=>Response.json(body,{status,headers:HEADERS});
const cleanItems=value=>Array.isArray(value)?value.slice(0,30).map(item=>({
 claim:typeof item?.claim==="string"?item.claim.slice(0,2000):"Claim text unavailable",
 factIds:Array.isArray(item?.factIds)?item.factIds.filter(x=>typeof x==="string").slice(0,10):[]
})): [];
export async function onRequestGet({request,env}){
 const url=new URL(request.url),symbol=String(url.searchParams.get("symbol")||"").trim().toUpperCase(),role=String(url.searchParams.get("role")||"");
 if(!/^[A-Z][A-Z0-9.-]{0,11}$/.test(symbol)||!ROLES.has(role))return reply({ok:false,error:"A valid ticker and known agent role are required."},400);
 if(!env?.NORTHSTAR_DB)return reply({ok:false,error:"Research ledger unavailable."},503);
 try{
  const rows=await env.NORTHSTAR_DB.prepare("SELECT symbol,status,result_json,created_at FROM research_council_runs WHERE symbol=? ORDER BY created_at DESC LIMIT 10").bind(symbol).all();
  const history=[];
  for(const row of rows?.results||[]){
   let result=null;try{result=JSON.parse(row.result_json);}catch{}
   const agent=Array.isArray(result?.agents)?result.agents.find(x=>x?.role===role):null;
   if(!agent)continue;
   history.push({
    symbol,runStatus:String(result?.status||"UNKNOWN"),createdAt:row.created_at||null,
    agent:{
     role,status:String(agent.status||"UNKNOWN"),decision:typeof agent.decision==="string"?agent.decision:null,
     vetoReasons:Array.isArray(agent.vetoReasons)?agent.vetoReasons.filter(x=>typeof x==="string").slice(0,20).map(x=>x.slice(0,500)):[],
     findings:cleanItems(agent.findings),risks:cleanItems(agent.risks),
     durationMs:Number.isFinite(Number(agent.durationMs))?Number(agent.durationMs):null,
     reason:typeof agent.reason==="string"?agent.reason.slice(0,500):null,
     unavailableReason:typeof agent.unavailableReason==="string"?agent.unavailableReason.slice(0,500):null,
     evidenceCount:Array.isArray(agent.findings)?agent.findings.reduce((n,x)=>n+(Array.isArray(x?.factIds)?x.factIds.length:0),0):0
    }
   });
  }
  return reply({ok:true,symbol,role,checkedAt:new Date().toISOString(),history,latest:history[0]||null});
 }catch{return reply({ok:false,error:"Agent detail query failed safely."},503);}
}
