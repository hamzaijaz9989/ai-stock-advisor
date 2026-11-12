import {FMP_LIMITS} from "../../web/lib/fmp-budget.js";

export function createFmpBudgetTestDb(){
 const events=[],cache=new Map();let batchChain=Promise.resolve();
 function statement(sql){
  let args=[];
  const handle=()=>{
   if(sql.startsWith("INSERT INTO fmp_request_events")){
    const [event_id,requested_at_ms,service,cost,cutoff,totalCost,totalLimit,scopeCutoff,scope,scopeCost,scopeLimit]=args;
    const total=events.filter(x=>x.requested_at_ms>cutoff).reduce((n,x)=>n+x.cost,0);
    const scoped=events.filter(x=>x.requested_at_ms>scopeCutoff&&x.service===scope).reduce((n,x)=>n+x.cost,0);
    if(total+totalCost>totalLimit||scoped+scopeCost>scopeLimit)return null;
    const row={event_id,requested_at_ms,service,cost};events.push(row);return row;
   }
   if(sql.startsWith("INSERT INTO fmp_response_cache")){
    const [cache_key,token,leaseUntil,now,claimNow]=args,old=cache.get(cache_key);
    if(old&&(old.expires_at_ms>now||old.lease_until_ms>claimNow))return null;
    cache.set(cache_key,{response_json:null,expires_at_ms:0,lease_token:token,lease_until_ms:leaseUntil});return {cache_key};
   }
   if(sql.startsWith("SELECT response_json")){
    const row=cache.get(args[0]);return row&&row.expires_at_ms>args[1]?{response_json:row.response_json}:null;
   }
   return null;
  };
  return {
   sql,
   bind(...values){args=values;return this;},
   async first(){return handle();},
   async run(){
    if(sql.startsWith("DELETE FROM fmp_request_events")){for(let i=events.length-1;i>=0;i--)if(events[i].requested_at_ms<args[0])events.splice(i,1);return {success:true};}
    if(sql.startsWith("DELETE FROM fmp_response_cache")){for(const [key,row] of cache)if(row.expires_at_ms<args[0]&&row.lease_until_ms<args[1])cache.delete(key);return {success:true};}
    if(sql.startsWith("UPDATE fmp_response_cache SET response_json=")){
      const [response_json,expires_at_ms,key,token]=args,row=cache.get(key);
      if(row?.lease_token===token)Object.assign(row,{response_json,expires_at_ms,lease_token:null,lease_until_ms:0});
      return {success:true};
    }
    if(sql.startsWith("UPDATE fmp_response_cache SET lease_token=NULL")){
      const [key,token]=args,row=cache.get(key);if(row?.lease_token===token)Object.assign(row,{lease_token:null,lease_until_ms:0});return {success:true};
    }
    if(sql.startsWith("UPDATE fmp_response_cache SET expires_at_ms=0")){
      const row=cache.get(args[0]);if(row)row.expires_at_ms=0;return {success:true};
    }
    throw new Error("Unexpected FMP budget test D1 run: "+sql);
   }
  };
 }
 return {
  events,cache,prepare:statement,
  async batch(stmts){
   const previous=batchChain;let unlock;batchChain=new Promise(resolve=>{unlock=resolve;});await previous;
   try{
    const out=[];
    for(const stmt of stmts){
     if(stmt.sql.startsWith("DELETE FROM")){out.push(await stmt.run());continue;}
     const row=await stmt.first();out.push({results:row?[row]:[]});
    }
    return out;
   }finally{unlock();}
  }
 };
}
