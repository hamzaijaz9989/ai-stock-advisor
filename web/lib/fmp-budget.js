// Shared, fail-closed FMP request budget and persistent response cache.
// Every uncached upstream call reserves one request before it leaves Northstar.
// Failed/time-out responses are charged; no automatic retries are performed.
export const FMP_LIMITS=Object.freeze({maximumRolling24h:200,maximumMonitor:160,maximumPages:40,reservedOutsideCalls:50});
const DAY_MS=24*60*60*1000;
const CACHE_LEASE_MS=25_000;
const CACHE_WAIT_MS=300;
const delay=ms=>new Promise(resolve=>setTimeout(resolve,ms));
export class FmpBudgetError extends Error{
  constructor(code,message,status=503){super(message);this.name="FmpBudgetError";this.code=code;this.status=status;}
}
function nowMs(value){const n=value instanceof Date?value.getTime():Number(value??Date.now());if(!Number.isFinite(n))throw new FmpBudgetError("FMP_BUDGET_CLOCK_INVALID","FMP budget clock is invalid.");return Math.trunc(n);}
function uuid(){return crypto.randomUUID();}
async function cacheKey(path,apiKey){
  const url=new URL(path,"https://financialmodelingprep.com/stable/");
  url.searchParams.delete("apikey");
  url.searchParams.sort();
  const accountHash=await crypto.subtle.digest("SHA-256",new TextEncoder().encode(apiKey));
  const identity=Array.from(new Uint8Array(accountHash),x=>x.toString(16).padStart(2,"0")).join("");
  const bytes=await crypto.subtle.digest("SHA-256",new TextEncoder().encode(identity+"|"+url.pathname+url.search));
  return Array.from(new Uint8Array(bytes),x=>x.toString(16).padStart(2,"0")).join("");
}
async function readCache(db,key,now){
  const row=await db.prepare("SELECT response_json FROM fmp_response_cache WHERE cache_key=? AND expires_at_ms>?").bind(key,now).first();
  if(!row?.response_json)return null;
  try{const payload=JSON.parse(row.response_json);if(Array.isArray(payload))return payload;}catch{}
  await db.prepare("UPDATE fmp_response_cache SET expires_at_ms=0 WHERE cache_key=?").bind(key).run();
  return null;
}
async function claimCache(db,key,token,now){
  const insert=db.prepare("INSERT INTO fmp_response_cache(cache_key,response_json,expires_at_ms,lease_token,lease_until_ms) VALUES(?,NULL,0,?,?) ON CONFLICT(cache_key) DO UPDATE SET lease_token=excluded.lease_token,lease_until_ms=excluded.lease_until_ms WHERE fmp_response_cache.expires_at_ms<=? AND fmp_response_cache.lease_until_ms<=? RETURNING cache_key")
    .bind(key,token,now+CACHE_LEASE_MS,now,now);
  if(typeof db.batch==="function"){
    const results=await db.batch([
      db.prepare("DELETE FROM fmp_response_cache WHERE expires_at_ms<? AND lease_until_ms<?").bind(now-DAY_MS,now),
      insert
    ]);
    return !!results?.[1]?.results?.[0];
  }
  await db.prepare("DELETE FROM fmp_response_cache WHERE expires_at_ms<? AND lease_until_ms<?").bind(now-DAY_MS,now).run();
  return !!(await insert.first());
}
async function releaseCache(db,key,token){
  await db.prepare("UPDATE fmp_response_cache SET lease_token=NULL,lease_until_ms=0 WHERE cache_key=? AND lease_token=?").bind(key,token).run();
}
export async function reserveFmpBudget(db,{service="pages",cost=1,now=Date.now(),verifiedDailyLimit}={}){
  const at=nowMs(now);
  if(!db?.prepare)throw new FmpBudgetError("FMP_BUDGET_UNAVAILABLE","Shared FMP budget storage is unavailable.");
  if(!["monitor","pages"].includes(service)||!Number.isSafeInteger(cost)||cost<1)
    throw new FmpBudgetError("FMP_BUDGET_REQUEST_INVALID","FMP budget request is invalid.",400);
  const planLimit=Number(verifiedDailyLimit);
  if(!Number.isSafeInteger(planLimit)||planLimit<=FMP_LIMITS.reservedOutsideCalls)
    throw new FmpBudgetError("FMP_PLAN_LIMIT_UNVERIFIED","Set FMP_VERIFIED_DAILY_LIMIT from the connected account's verified plan before making FMP calls.");
  const totalLimit=Math.min(FMP_LIMITS.maximumRolling24h,planLimit-FMP_LIMITS.reservedOutsideCalls);
  const pagesLimit=Math.min(FMP_LIMITS.maximumPages,totalLimit);
  const monitorLimit=Math.min(FMP_LIMITS.maximumMonitor,totalLimit-pagesLimit);
  const serviceLimit=service==="pages"?pagesLimit:monitorLimit;
  if(cost>totalLimit||cost>serviceLimit)throw new FmpBudgetError("FMP_DAILY_BUDGET_EXHAUSTED","Shared FMP request budget exhausted.",429);
  const eventId=uuid(),cutoff=at-DAY_MS;
  const insert=db.prepare("INSERT INTO fmp_request_events(event_id,requested_at_ms,service,cost) SELECT ?,?,?,? WHERE (SELECT COALESCE(SUM(cost),0) FROM fmp_request_events WHERE requested_at_ms>?) + ? <= ? AND (SELECT COALESCE(SUM(cost),0) FROM fmp_request_events WHERE requested_at_ms>? AND service=?) + ? <= ? RETURNING event_id")
    .bind(eventId,at,service,cost,cutoff,cost,totalLimit,cutoff,service,cost,serviceLimit);
  try{
    let row;
    if(typeof db.batch==="function"){
      const results=await db.batch([
        db.prepare("DELETE FROM fmp_request_events WHERE requested_at_ms<?").bind(at-2*DAY_MS),
        insert
      ]);
      row=results?.[1]?.results?.[0]||null;
    }else row=await insert.first();
    if(!row)throw new FmpBudgetError("FMP_DAILY_BUDGET_EXHAUSTED","Shared FMP request budget exhausted.",429);
    return {reserved:cost,service};
  }catch(error){
    if(error instanceof FmpBudgetError)throw error;
    throw new FmpBudgetError("FMP_BUDGET_UNAVAILABLE","Shared FMP budget storage is unavailable.");
  }
}
async function fetchUncached({db,service,path,apiKey,fetchImpl,now,cacheTtlMs,timeoutMs,key,token}){
 try{
  // The whole uncached batch was atomically reserved before any network call.
  const url=new URL(path,"https://financialmodelingprep.com/stable/");
  url.searchParams.set("apikey",apiKey);
  let response;
  try{response=await fetchImpl(url.toString(),{headers:{Accept:"application/json"},signal:AbortSignal.timeout(timeoutMs)});}
  catch{throw new FmpBudgetError("FMP_NETWORK_ERROR","FMP request failed; its budget reservation remains charged.",502);}
  if(!response.ok)throw new FmpBudgetError("FMP_PROVIDER_HTTP_"+response.status,"FMP returned HTTP "+response.status+"; its budget reservation remains charged.",response.status===429?429:502);
  let payload;try{payload=await response.json();}catch{throw new FmpBudgetError("FMP_INVALID_RESPONSE","FMP returned invalid JSON; its budget reservation remains charged.",502);}
  if(!Array.isArray(payload))throw new FmpBudgetError("FMP_INVALID_RESPONSE","FMP returned an unexpected response type; its budget reservation remains charged.",502);
  if(cacheTtlMs>0){
   try{await db.prepare("UPDATE fmp_response_cache SET response_json=?,expires_at_ms=?,lease_token=NULL,lease_until_ms=0 WHERE cache_key=? AND lease_token=?")
    .bind(JSON.stringify(payload),nowMs(Date.now())+Math.trunc(cacheTtlMs),key,token).run();}
   catch{throw new FmpBudgetError("FMP_CACHE_UNAVAILABLE","FMP response could not be cached safely.");}
  }
  return payload;
 }catch(error){
  if(cacheTtlMs>0&&token){try{await releaseCache(db,key,token);}catch{}}
  throw error;
 }
}
export async function requestFmpJsonBatch({db,service="pages",requests,apiKey,fetchImpl=fetch,now=Date.now(),verifiedDailyLimit}={}){
 if(typeof apiKey!=="string"||!apiKey.trim())throw new FmpBudgetError("FMP_NOT_CONFIGURED","FMP is not configured.",503);
 if(!db?.prepare)throw new FmpBudgetError("FMP_BUDGET_UNAVAILABLE","Shared FMP budget storage is unavailable.");
 if(!Array.isArray(requests)||requests.length<1||requests.length>20)throw new FmpBudgetError("FMP_REQUEST_INVALID","FMP request batch is invalid.",400);
 const at=nowMs(now),items=[];
 for(const request of requests){
  if(typeof request?.path!=="string"||!request.path||request.path.includes("apikey="))throw new FmpBudgetError("FMP_REQUEST_INVALID","FMP request path is invalid.",400);
  const ttl=Number.isFinite(request.cacheTtlMs)&&request.cacheTtlMs>0?Math.trunc(request.cacheTtlMs):0;
  const timeout=Number.isFinite(request.timeoutMs)&&request.timeoutMs>0?Math.trunc(request.timeoutMs):12_000;
  const key=ttl?await cacheKey(request.path,apiKey):null;
  items.push({...request,cacheTtlMs:ttl,timeoutMs:timeout,key,token:null,cached:false,payload:undefined});
 }
 try{
  for(const item of items){
   if(!item.cacheTtlMs)continue;
   const cached=await readCache(db,item.key,at);
   if(cached!==null){item.cached=true;item.payload=cached;continue;}
   const token=uuid();
   if(!await claimCache(db,item.key,token,at)){
    let found=null;
    for(let elapsed=0;elapsed<CACHE_WAIT_MS;elapsed+=50){await delay(50);found=await readCache(db,item.key,nowMs(Date.now()));if(found!==null)break;}
    if(found===null)throw new FmpBudgetError("FMP_REQUEST_IN_PROGRESS","An identical FMP request is already in progress; retry shortly.",503);
    item.cached=true;item.payload=found;
   }else item.token=token;
  }
  const misses=items.filter(item=>!item.cached);
  if(misses.length)await reserveFmpBudget(db,{service,cost:misses.length,now:at,verifiedDailyLimit});
 }catch(error){
  await Promise.all(items.filter(item=>item.token).map(item=>releaseCache(db,item.key,item.token).catch(()=>{})));
  if(error instanceof FmpBudgetError)throw error;
  throw new FmpBudgetError("FMP_BUDGET_UNAVAILABLE","Shared FMP budget or cache storage is unavailable.");
 }
 const results=await Promise.all(items.map(async item=>{
  if(item.cached)return {status:"fulfilled",value:item.payload};
  try{return {status:"fulfilled",value:await fetchUncached({db,service,path:item.path,apiKey,fetchImpl,now:at,cacheTtlMs:item.cacheTtlMs,timeoutMs:item.timeoutMs,key:item.key,token:item.token})};}
  catch(reason){return {status:"rejected",reason};}
 }));
 return results;
}
export async function requestFmpJson(options={}){
 const result=(await requestFmpJsonBatch({...options,requests:[{path:options.path,cacheTtlMs:options.cacheTtlMs,timeoutMs:options.timeoutMs}]}))[0];
 if(result.status==="rejected")throw result.reason;
 return result.value;
}
