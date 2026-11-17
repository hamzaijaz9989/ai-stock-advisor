// Read-only, allowlisted Research Council agent detail endpoint.
// Returns agent-authored reports plus cited-source metadata, never raw provider inputs or portfolio values.
const HEADERS={"Cache-Control":"no-store","X-Content-Type-Options":"nosniff","Referrer-Policy":"no-referrer"};
const ROLES=new Set(["market_scanner","technical_analyst","fundamental_analyst","news_analyst","sentiment_analyst","bull_researcher","bear_researcher","portfolio_analyst","risk_committee"]);
const reply=(body,status=200)=>Response.json(body,{status,headers:HEADERS});
const cleanItems=(value,refs)=>Array.isArray(value)?value.slice(0,30).map(item=>{
 const factIds=Array.isArray(item?.factIds)?item.factIds.filter(x=>typeof x==="string").slice(0,10):[];
 const confidence=["string","number"].includes(typeof item?.confidence)&&String(item.confidence).length<=40?item.confidence:null;
 return {claim:typeof item?.claim==="string"?item.claim.slice(0,2000):"Claim text unavailable",factIds,confidence,
  evidence:factIds.map(id=>refs.get(id)).filter(Boolean)};
}):[];
function parsePublicRunId(value){
 if(typeof value!=="string")return null;const i=value.indexOf("|");if(i<1)return null;
 const symbol=value.slice(0,i),createdAt=value.slice(i+1);
 if(!/^[A-Z][A-Z0-9.-]{0,11}$/.test(symbol)||!createdAt||!Number.isFinite(Date.parse(createdAt)))return null;
 return {symbol,createdAt};
}
function publicRunId(symbol,createdAt){return String(symbol||"").toUpperCase()+"|"+String(createdAt||"");}
export async function onRequestGet({request,env}){
 const url=new URL(request.url),symbol=String(url.searchParams.get("symbol")||"").trim().toUpperCase(),role=String(url.searchParams.get("role")||""),requestedRunId=url.searchParams.get("runId");
 if(!/^[A-Z][A-Z0-9.-]{0,11}$/.test(symbol)||!ROLES.has(role))return reply({ok:false,error:"A valid ticker and known agent role are required."},400);
 if(!env?.NORTHSTAR_DB)return reply({ok:false,error:"Research ledger unavailable."},503);
 let exact=null;if(requestedRunId!==null){exact=parsePublicRunId(requestedRunId);if(!exact||exact.symbol!==symbol)return reply({ok:false,error:"A valid public run ID for this ticker is required."},400);}
 try{
  const query=exact
   ?env.NORTHSTAR_DB.prepare("SELECT symbol,status,result_json,created_at FROM research_council_runs WHERE symbol=? AND created_at=? LIMIT 1").bind(symbol,exact.createdAt)
   :env.NORTHSTAR_DB.prepare("SELECT symbol,status,result_json,created_at FROM research_council_runs WHERE symbol=? ORDER BY created_at DESC LIMIT 10").bind(symbol);
  const rows=await query.all(),history=[];
  for(const row of rows?.results||[]){
   let result=null;try{result=JSON.parse(row.result_json);}catch{}
   const agent=Array.isArray(result?.agents)?result.agents.find(x=>x?.role===role):null;if(!agent)continue;
   const telemetry=agent.telemetry&&typeof agent.telemetry==="object"?agent.telemetry:null;
   const allRefs=new Map((Array.isArray(result?.evidenceReferences)?result.evidenceReferences:[]).filter(x=>x&&typeof x.factId==="string").map(x=>[x.factId,{
    factId:x.factId,type:typeof x.type==="string"?x.type:null,source:typeof x.source==="string"?x.source:null,
    observedAt:typeof x.observedAt==="string"?x.observedAt:null,label:typeof x.label==="string"?x.label.slice(0,240):null
   }]));
   const findings=cleanItems(agent.findings,allRefs),risks=cleanItems(agent.risks,allRefs);
   const cited=new Set([...findings,...risks].flatMap(item=>item.factIds));
   const refs=new Map(Array.from(cited).map(id=>[id,allRefs.get(id)]).filter(([,value])=>value));
   history.push({runId:publicRunId(symbol,row.created_at),symbol,runStatus:String(result?.status||"UNKNOWN"),createdAt:row.created_at||null,
    evidenceReferencesAvailable:Array.isArray(result?.evidenceReferences),
    evidenceReferences:Array.from(refs.values()).slice(0,100),
    agent:{role,status:String(agent.status||"UNKNOWN"),decision:typeof agent.decision==="string"?agent.decision:null,
     vetoReasons:Array.isArray(agent.vetoReasons)?agent.vetoReasons.filter(x=>typeof x==="string").slice(0,20).map(x=>x.slice(0,500)):[],
     findings,risks,
     durationMs:Number.isFinite(Number(agent.durationMs))?Number(agent.durationMs):null,
     provider:typeof telemetry?.provider==="string"?telemetry.provider:null,model:typeof telemetry?.model==="string"?telemetry.model:null,
     inputTokens:Number.isSafeInteger(telemetry?.inputTokens)?telemetry.inputTokens:null,outputTokens:Number.isSafeInteger(telemetry?.outputTokens)?telemetry.outputTokens:null,
     failureCode:/^[a-z0-9_]{3,64}$/.test(String(agent.failureCode||telemetry?.failureCode||""))?(agent.failureCode||telemetry?.failureCode):null,
     reason:typeof agent.reason==="string"?agent.reason.slice(0,500):null,unavailableReason:typeof agent.unavailableReason==="string"?agent.unavailableReason.slice(0,500):null,
     evidenceCount:Array.isArray(agent.findings)?agent.findings.reduce((n,x)=>n+(Array.isArray(x?.factIds)?x.factIds.length:0),0):0}
   });
  }
  return reply({ok:true,symbol,role,checkedAt:new Date().toISOString(),history,latest:history[0]||null});
 }catch{return reply({ok:false,error:"Agent detail query failed safely."},503);}
}
