import fs from "node:fs/promises";
import path from "node:path";
import {fileURLToPath} from "node:url";

function validDate(value){
 if(!/^\d{4}-\d{2}-\d{2}$/.test(value))return false;
 const d=new Date(value+"T00:00:00Z");
 return Number.isFinite(d.getTime())&&d.toISOString().slice(0,10)===value;
}
export function buildEarningsWindows(from,to){
 if(!validDate(from)||!validDate(to)||from>to)throw new Error("Provide valid ISO from/to dates.");
 const end=Date.parse(to+"T00:00:00Z"),windows=[];
 let cursor=Date.parse(from+"T00:00:00Z");
 while(cursor<=end){
  const windowEnd=Math.min(cursor+89*86400000,end);
  windows.push({from:new Date(cursor).toISOString().slice(0,10),to:new Date(windowEnd).toISOString().slice(0,10)});
  cursor=windowEnd+86400000;
 }
 return windows;
}
export async function fetchEarningsHistory({from,to,baseUrl,operatorToken,fetchImpl=fetch}){
 const windows=buildEarningsWindows(from,to);
 if(typeof baseUrl!=="string"||!/^https:\/\//.test(baseUrl))throw new Error("A valid HTTPS NORTHSTAR_API_BASE is required.");
 if(typeof operatorToken!=="string"||!operatorToken)throw new Error("NORTHSTAR_OPERATOR_TOKEN is required.");
 const all=new Map(),retrievals=[];
 for(const window of windows){
  const url=new URL("/api/fmp-earnings",baseUrl);
  url.searchParams.set("from",window.from);url.searchParams.set("to",window.to);
  const response=await fetchImpl(url,{headers:{Authorization:"Bearer "+operatorToken,Accept:"application/json"},signal:AbortSignal.timeout(30000)});
  const payload=await response.json().catch(()=>null);
  if(!response.ok||payload?.available!==true)throw new Error("FMP earnings window "+window.from+" to "+window.to+" failed (HTTP "+response.status+"): "+String(payload?.error||"invalid response").slice(0,160));
  if(Number(payload?.coverage?.providerRecords)>=Number(payload?.coverage?.providerLimit||4000))throw new Error("FMP earnings window reached the provider record cap; refusing a possibly truncated dataset.");
  retrievals.push({window,retrievedAt:payload.retrievedAt,providerRecords:payload.coverage?.providerRecords??null});
  for(const event of payload.events||[]){
   const symbol=String(event?.symbol||"").toUpperCase(),date=String(event?.date||"");
   if(!/^[A-Z][A-Z0-9.-]{0,11}$/.test(symbol)||!validDate(date))throw new Error("FMP returned an invalid earnings event; dataset not written.");
   const key=symbol+"|"+date,prior=all.get(key);
   if(prior&&JSON.stringify(prior)!==JSON.stringify(event))throw new Error("Conflicting duplicate earnings event for "+key+"; dataset not written.");
   all.set(key,event);
  }
 }
 const events=[...all.values()].sort((a,b)=>String(a.date).localeCompare(String(b.date))||String(a.symbol).localeCompare(String(b.symbol)));
 return {metadata:{provider:"Financial Modeling Prep",retrievedAt:new Date().toISOString(),requestedWindow:{from,to},windows:retrievals,recordCount:events.length},events,pointInTimeWarning:"Earnings event date and lastUpdated are not proof of when the event was first publicly known. Do not treat them as point-in-time availability timestamps without independent evidence."};
}
function parseArgs(argv){
 const out={};for(let i=0;i<argv.length;i++){if(argv[i].startsWith("--"))out[argv[i].slice(2)]=argv[++i];}
 return out;
}
async function main(){
 const args=parseArgs(process.argv.slice(2));
 if(!args.from||!args.to||!args.output)throw new Error("Usage: node scripts/fetch_fmp_earnings.mjs --from YYYY-MM-DD --to YYYY-MM-DD --output earnings-history.json");
 const result=await fetchEarningsHistory({from:args.from,to:args.to,baseUrl:process.env.NORTHSTAR_API_BASE,operatorToken:process.env.NORTHSTAR_OPERATOR_TOKEN});
 await fs.mkdir(path.dirname(path.resolve(args.output)),{recursive:true});
 await fs.writeFile(args.output,JSON.stringify(result,null,2)+"\n",{flag:"wx"});
 console.log("Saved "+result.metadata.recordCount+" earnings events across "+result.metadata.windows.length+" verified windows to "+args.output);
}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url)){
 main().catch(error=>{console.error(error.message);process.exitCode=1;});
}
