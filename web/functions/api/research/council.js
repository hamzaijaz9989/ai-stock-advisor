import { runResearchCouncil } from "../../../lib/research-council.js";
import { createResearchCouncilWorkers } from "../../../lib/research-council-adapters.js";

const HEADERS={"Cache-Control":"no-store","X-Content-Type-Options":"nosniff","Referrer-Policy":"no-referrer"};
const MAX_BODY=65536;
const respond=(payload,status=200)=>Response.json(payload,{status,headers:HEADERS});
function authorized(request,token){
  const expected=typeof token==="string"&&token?"Bearer "+token:"";
  const actual=request.headers.get("Authorization")||"";
  if(!expected||actual.length!==expected.length)return false;
  let diff=0;for(let i=0;i<expected.length;i++)diff|=expected.charCodeAt(i)^actual.charCodeAt(i);
  return diff===0;
}
function stable(value){
  if(Array.isArray(value))return "["+value.map(stable).join(",")+"]";
  if(value&&typeof value==="object")return "{"+Object.keys(value).sort().map(k=>JSON.stringify(k)+":"+stable(value[k])).join(",")+"}";
  return JSON.stringify(value);
}
async function digest(value){
  const bytes=await crypto.subtle.digest("SHA-256",new TextEncoder().encode(value));
  return Array.from(new Uint8Array(bytes),x=>x.toString(16).padStart(2,"0")).join("");
}
export async function onRequestPost({request,env}){
  if(!authorized(request,env?.NORTHSTAR_OPERATOR_TOKEN))return respond({ok:false,error:"Unauthorized.",execution:false},401);
  if(!env?.NORTHSTAR_DB)return respond({ok:false,error:"Council audit ledger unavailable; request not accepted.",traceDurable:false,execution:false},503);
  const declared=Number(request.headers.get("Content-Length")||0);
  if(declared>MAX_BODY)return respond({ok:false,error:"Request body too large."},413);
  const raw=await request.text();
  if(new TextEncoder().encode(raw).byteLength>MAX_BODY)return respond({ok:false,error:"Request body too large."},413);
  let body;try{body=JSON.parse(raw);}catch{return respond({ok:false,error:"Valid JSON body required."},400);}
  if(typeof body?.requestId!=="string"||!/^[A-Za-z0-9._:-]{8,100}$/.test(body.requestId))return respond({ok:false,error:"A stable requestId is required."},400);
  const context=body.context;
  if(!context||typeof context!=="object"||!Array.isArray(context.facts)||!Array.isArray(context.evidence)||!context.portfolio)return respond({ok:false,error:"Facts, evidence and portfolio context are required."},400);
  if(context.facts.length+context.evidence.length>500)return respond({ok:false,error:"Maximum 500 fact/evidence items."},413);

  // A Council run is not eligible for review unless its portfolio risk snapshot
  // carries explicit provenance and complete, internally consistent fields.
  // This is a fail-closed shape/freshness gate, not cryptographic source attestation:
  // only a future server-side collector can establish the snapshot's provenance.
  const portfolio=context.portfolio;
  const asOfMs=Date.parse(context.asOf||"");
  const portfolioAsOfMs=Date.parse(portfolio.asOf||"");
  const portfolioFields=["equityUsd","openRiskUsd","grossExposureUsd","dailyLossFraction","weeklyLossFraction","drawdownFraction","sectorExposureUsd","concurrentPositions"];
  const portfolioValues=Object.fromEntries(portfolioFields.map(key=>[key,Number(portfolio[key])]));
  const validPortfolio=portfolio.verified===true&&typeof portfolio.source==="string"&&portfolio.source.trim().length>0&&
    Number.isFinite(asOfMs)&&Number.isFinite(portfolioAsOfMs)&&portfolioAsOfMs<=asOfMs&&
    portfolioFields.every(key=>portfolio[key]!==null&&portfolio[key]!==undefined&&portfolio[key]!==""&&Number.isFinite(portfolioValues[key]))&&
    portfolioValues.equityUsd>0&&portfolioFields.filter(key=>key!=="equityUsd"&&key!=="concurrentPositions").every(key=>portfolioValues[key]>=0)&&
    Number.isInteger(portfolioValues.concurrentPositions);
  if(!validPortfolio)return respond({ok:false,error:"A complete, explicitly verified portfolio snapshot with source and timestamp is required; missing risk data must never be replaced with zeroes.",execution:false,traceDurable:false},422);
  try{
    const input=stable(context),hash=await digest(input);
    const existing=await env.NORTHSTAR_DB.prepare("SELECT input_sha256,result_json,created_at FROM research_council_runs WHERE request_id=?").bind(body.requestId).first();
    if(existing){
      if(existing.input_sha256!==hash)return respond({ok:false,error:"requestId already used for a different context."},409);
      return respond({ok:true,replayed:true,traceDurable:true,createdAt:existing.created_at,result:JSON.parse(existing.result_json),execution:false,automatedOrderSubmission:false});
    }
    const workers=await createResearchCouncilWorkers(env);
    const result=await runResearchCouncil({requestId:body.requestId,context,workers});
    const symbol=String(context.ticker||"UNKNOWN").trim().toUpperCase().slice(0,12);
    const write=await env.NORTHSTAR_DB.prepare(
      "INSERT INTO research_council_runs (request_id,input_sha256,symbol,status,result_json) VALUES (?,?,?,?,?) ON CONFLICT(request_id) DO NOTHING"
    ).bind(body.requestId,hash,symbol,result.status,JSON.stringify(result)).run();
    const stored=await env.NORTHSTAR_DB.prepare("SELECT input_sha256,result_json,created_at FROM research_council_runs WHERE request_id=?").bind(body.requestId).first();
    if(!stored)return respond({ok:false,error:"Council audit write could not be confirmed.",traceDurable:false,execution:false},503);
    if(stored.input_sha256!==hash)return respond({ok:false,error:"requestId was concurrently used for another context.",traceDurable:true},409);
    return respond({ok:true,replayed:!(Number(write?.meta?.changes)>0),traceDurable:true,createdAt:stored.created_at,result:JSON.parse(stored.result_json),execution:false,automatedOrderSubmission:false});
  }catch{return respond({ok:false,error:"Council run failed safely; no order action was taken.",traceDurable:false,execution:false},503);}
}
