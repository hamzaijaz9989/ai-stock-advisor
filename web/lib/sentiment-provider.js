// Neutral adapter boundary for a future approved, licensed sentiment/positioning source.
// It accepts provider-normalized observations only; it performs no network calls and
// never transforms raw score scales into Northstar scores.
export const SENTIMENT_POPULATIONS=Object.freeze(["retail","institutional","short_interest","options_positioning","analyst_revisions","news_sentiment"]);
const ZONED_ISO=/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:\d{2})$/;
const TICKER=/^[A-Z][A-Z0-9.-]{0,11}$/;
function timestampMs(value){if(typeof value!=="string"||!ZONED_ISO.test(value))return null;const parsed=Date.parse(value);return Number.isFinite(parsed)?parsed:null;}
export function normalizeSentimentProviderPayload({ticker,asOf,providerId,payload}={}){
 const symbol=String(ticker||"").trim().toUpperCase(),asOfMs=timestampMs(asOf);
 if(!TICKER.test(symbol)||asOfMs===null||typeof providerId!=="string"||!/^[A-Za-z0-9._-]{2,80}$/.test(providerId))
  return {status:"UNAVAILABLE",providerId:null,observations:[],rejectedCount:0,reason:"A valid ticker, zoned as-of timestamp and provider identity are required."};
 if(String(payload?.symbol||"").trim().toUpperCase()!==symbol)
  return {status:"UNAVAILABLE",providerId,observations:[],rejectedCount:Array.isArray(payload?.observations)?payload.observations.length:0,reason:"Provider symbol does not match the requested ticker."};
 const rows=Array.isArray(payload?.observations)?payload.observations.slice(0,100):[],observations=[];
 for(const [index,row] of rows.entries()){
  const observed=timestampMs(row?.timestamp),score=row?.normalizedScore,sampleCount=row?.sampleCount;
  if(observed===null||observed>asOfMs||!SENTIMENT_POPULATIONS.includes(row?.population)||
   typeof row?.metric!=="string"||!row.metric.trim()||typeof row?.methodology!=="string"||row.methodology.trim().length<10||
   row?.normalizedScale!=="minus1_to_plus1"||typeof score!=="number"||!Number.isFinite(score)||score < -1||score>1||
   !Number.isSafeInteger(sampleCount)||sampleCount<1)continue;
  const observationId=typeof row.id==="string"&&/^[A-Za-z0-9._:-]{1,80}$/.test(row.id)?row.id:"obs-"+index;
  observations.push({id:observationId,symbol,timestamp:new Date(observed).toISOString(),timestampStatus:"PRESENT",source:providerId,
   population:row.population,metric:row.metric.trim().slice(0,100),methodology:row.methodology.trim().slice(0,500),
   normalizedScale:"minus1_to_plus1",score,sampleCount});
 }
 const rejectedCount=(Array.isArray(payload?.observations)?payload.observations.length:0)-observations.length;
 return {status:observations.length?"AVAILABLE":"UNAVAILABLE",providerId,asOf:new Date(asOfMs).toISOString(),observations,rejectedCount,
  reason:observations.length?null:"No observations passed timestamp, population, methodology, sample and normalized-score validation."};
}
export function createSentimentProviderAdapter({providerId,fetchObservations}={}){
 if(typeof providerId!=="string"||typeof fetchObservations!=="function")return async()=>({status:"UNAVAILABLE",observations:[],rejectedCount:0,reason:"No approved sentiment provider adapter is configured."});
 return async ({ticker,asOf}={})=>{
  let payload;try{payload=await fetchObservations({ticker,asOf});}catch{return {status:"UNAVAILABLE",providerId,observations:[],rejectedCount:0,reason:"Configured provider request failed."};}
  return normalizeSentimentProviderPayload({ticker,asOf,providerId,payload});
 };
}
