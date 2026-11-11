import test from "node:test";
import assert from "node:assert/strict";
import {claimResearchLease,renewResearchLease,releaseResearchLease,portfolioSnapshot} from "../web/functions/api/research/collect.js";

function leaseDb(){
 const rows=new Map();
 return {rows,prepare(sql){return {bind(...args){return {
  async run(){
   if(sql.startsWith("INSERT OR IGNORE")){
    const [requestId,symbol,token]=args;
    if(!rows.has(requestId))rows.set(requestId,{symbol,lease_token:token,lease_until:new Date(Date.now()+30*60_000).toISOString()});
    return {meta:{changes:1}};
   }
   if(sql.startsWith("UPDATE research_council_run_leases SET lease_token")){
    const [token,requestId]=args,row=rows.get(requestId);
    if(row&&Date.parse(row.lease_until)<=Date.now()){row.lease_token=token;row.lease_until=new Date(Date.now()+30*60_000).toISOString();return {meta:{changes:1}};}
    return {meta:{changes:0}};
   }
   if(sql.startsWith("UPDATE research_council_run_leases SET lease_until")){
    const [requestId,token]=args,row=rows.get(requestId);
    if(row&&row.lease_token===token&&Date.parse(row.lease_until)>Date.now()){row.lease_until=new Date(Date.now()+30*60_000).toISOString();return {meta:{changes:1}};}
    return {meta:{changes:0}};
   }
   if(sql.startsWith("DELETE FROM research_council_run_leases")){
    const [requestId,token]=args,row=rows.get(requestId);
    if(row&&row.lease_token===token){rows.delete(requestId);return {meta:{changes:1}};}
    return {meta:{changes:0}};
   }
   return {meta:{changes:0}};
  },
  async first(){const [requestId]=args,row=rows.get(requestId);return row?{...row}:null;}
 };}};}};}
test("a live lease prevents a concurrent duplicate collector",async()=>{
 const db=leaseDb(),first=await claimResearchLease(db,"lease-req-0001","NVDA");
 assert.equal(first.ok,true);
 const second=await claimResearchLease(db,"lease-req-0001","NVDA");
 assert.equal(second.ok,false);assert.equal(second.reason,"RESEARCH_ALREADY_RUNNING");
});
test("expired lease can be reclaimed by a new owner",async()=>{
 const db=leaseDb(),first=await claimResearchLease(db,"lease-req-0002","AAPL");
 db.rows.get("lease-req-0002").lease_until="2000-01-01T00:00:00.000Z";
 const second=await claimResearchLease(db,"lease-req-0002","AAPL");
 assert.equal(second.ok,true);assert.notEqual(second.token,first.token);
});
test("renewal requires the current unexpired lease token",async()=>{
 const db=leaseDb(),lease=await claimResearchLease(db,"lease-req-0003","MSFT");
 assert.equal(await renewResearchLease(db,"lease-req-0003",lease.token),true);
 assert.equal(await renewResearchLease(db,"lease-req-0003","wrong-token"),false);
 db.rows.get("lease-req-0003").lease_until="2000-01-01T00:00:00.000Z";
 assert.equal(await renewResearchLease(db,"lease-req-0003",lease.token),false);
});
test("release only deletes the lease owned by the caller",async()=>{
 const db=leaseDb(),lease=await claimResearchLease(db,"lease-req-0004","AMZN");
 await releaseResearchLease(db,"lease-req-0004","wrong-token");
 assert.equal(db.rows.has("lease-req-0004"),true);
 await releaseResearchLease(db,"lease-req-0004",lease.token);
 assert.equal(db.rows.has("lease-req-0004"),false);
});

test("portfolio snapshot explicitly separates virtual allocation from broker equity for the Council fact adapter", async () => {
 const now=Date.now();
 const snapshots=[
  {captured_at:new Date(now-60_000).toISOString(),equity_usd:100000},
  {captured_at:new Date(now-8*86400_000).toISOString(),equity_usd:100000}
 ];
 const db={prepare(sql){return {
  async first(){return {enabled:0,mode:"paper",kill_switch:1,max_portfolio_usd:1000};},
  async all(){
   if(sql.includes("paper_positions")) return {results:[]};
   if(sql.includes("paper_equity_snapshots")) return {results:snapshots};
   return {results:[]};
  }
 };}};
 const originalFetch=globalThis.fetch;
 globalThis.fetch=async url=>new Response(JSON.stringify(
  String(url).includes("/v2/account")
   ? {status:"ACTIVE",trading_blocked:false,account_blocked:false,equity:"100000",last_equity:"100000"}
   : []
 ),{status:200,headers:{"Content-Type":"application/json"}});
 try {
  const result=await portfolioSnapshot({NORTHSTAR_DB:db,ALPACA_API_KEY_ID:"paper-id",ALPACA_API_SECRET_KEY:"paper-secret"});
  assert.equal(result.equityUsd,1000);
  assert.equal(result.virtualAllocationUsd,1000);
  assert.equal(result.actualAccountEquityUsd,100000);
  assert.equal(result.riskMetricBasis,"actual_alpaca_paper_account_equity");
  assert.equal(result.verified,true);
 } finally {
  globalThis.fetch=originalFetch;
 }
});
