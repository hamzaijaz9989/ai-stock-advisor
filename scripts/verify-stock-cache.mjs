import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

export function validateStockCache(data, { nowMs=Date.now(), maxAgeMs=6*60*60*1000 }={}) {
  const errors=[];
  const generatedAt=Date.parse(data?.generatedAt||"");
  if(!Number.isFinite(generatedAt)) errors.push("generatedAt is missing or invalid");
  else if(generatedAt>nowMs+5*60*1000) errors.push("cache timestamp is in the future");
  else if(nowMs-generatedAt>maxAgeMs) errors.push("cache is older than six hours");
  if(data?.universeSize!==253) errors.push("universeSize must be exactly 253");
  if(data?.status!=="success") errors.push("scan status is not success");
  if(!Number.isInteger(data?.rankedCount)||!Number.isInteger(data?.excludedCount)||data.rankedCount+data.excludedCount!==253) errors.push("ranked and excluded counts do not account for all 253 symbols");
  if(!Array.isArray(data?.stocks)||data.stocks.length<1||data.stocks.length>10) errors.push("shortlist must contain between one and ten candidates");
  const tickers=(data?.stocks||[]).map(x=>String(x?.ticker||"").toUpperCase());
  if(tickers.some(x=>!/^[A-Z][A-Z0-9.-]{0,9}$/.test(x))) errors.push("shortlist contains an invalid ticker");
  if(new Set(tickers).size!==tickers.length) errors.push("shortlist contains duplicate tickers");
  for(const stock of data?.stocks||[]) {
    if(!Number.isFinite(Number(stock?.score))) errors.push("candidate "+stock?.ticker+" has no numeric research score");
    if(stock?.fundamentalFreshness==="STALE_OR_UNVERIFIED" && !/^BLOCKED:/i.test(String(stock?.entryStatus||""))) errors.push("stale fundamentals are not explicitly blocked for "+stock?.ticker);
    if(!["CURRENT_WITHIN_18_MONTHS","STALE_OR_UNVERIFIED"].includes(stock?.fundamentalFreshness)) errors.push("candidate "+stock?.ticker+" has unknown fundamental freshness");
  }
  return {ok:errors.length===0,errors,ageMinutes:Number.isFinite(generatedAt)?Math.floor((nowMs-generatedAt)/60000):null,generatedAt:Number.isFinite(generatedAt)?new Date(generatedAt).toISOString():null,candidateCount:tickers.length};
}

async function main() {
  const file=path.resolve(process.cwd(),"web/data/top-stocks-cache.json");
  const data=JSON.parse(await fs.readFile(file,"utf8"));
  const result=validateStockCache(data);
  const summary=[
    "# Northstar scheduled scan health",
    "",
    "- Result: "+(result.ok?"PASS":"FAIL"),
    "- Cache generated: "+(result.generatedAt||"unknown"),
    "- Cache age: "+(result.ageMinutes===null?"unknown":result.ageMinutes+" minutes"),
    "- Universe: "+String(data.universeSize??"unknown"),
    "- Ranked / excluded: "+String(data.rankedCount??"unknown")+" / "+String(data.excludedCount??"unknown"),
    "- Shortlist: "+(data.stocks||[]).map(x=>x.ticker).join(", "),
    "",
    ...(result.errors.length?["## Issues",...result.errors.map(x=>"- "+x)]:["All freshness, universe, shortlist, and stale-fundamental safeguards passed."])
  ].join("\n");
  if(process.env.GITHUB_STEP_SUMMARY) await fs.appendFile(process.env.GITHUB_STEP_SUMMARY,summary+"\n");
  console.log(summary);
  if(!result.ok) process.exitCode=1;
}
if(process.argv[1] && path.resolve(process.argv[1])===fileURLToPath(import.meta.url)) await main();
