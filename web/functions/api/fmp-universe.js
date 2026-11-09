const BASE="https://financialmodelingprep.com/stable/";
const INDEX_ENDPOINTS=[
 ["sp500","sp500-constituent","historical-sp500-constituent"],
 ["nasdaq100","nasdaq-constituent","historical-nasdaq-constituent"],
 ["dowjones","dowjones-constituent","historical-dowjones-constituent"]
];
async function get(path,key){
 const url=new URL(path,BASE);url.searchParams.set("apikey",key);
 const response=await fetch(url,{headers:{Accept:"application/json"},signal:AbortSignal.timeout(18000)});
 if(!response.ok)throw new Error("HTTP "+response.status+" for "+path.split("?")[0]);
 const payload=await response.json();
 if(!Array.isArray(payload))throw new Error("Unexpected response for "+path.split("?")[0]);
 return payload;
}
function validDate(value){
 if(!/^\d{4}-\d{2}-\d{2}$/.test(value))return false;
 const date=new Date(value+"T00:00:00Z");
 return Number.isFinite(date.getTime())&&date.toISOString().slice(0,10)===value;
}
export async function onRequestGet({request,env}){
 const query=new URL(request.url).searchParams;
 const from=query.get("from")||"2000-01-01";
 if(!validDate(from))return Response.json({available:false,error:"Provide a valid ISO from date."},{status:400});
 const key=env?.FMP_API_KEY2||env?.FMP_API_KEY;
 if(!key)return Response.json({available:false,configured:false,error:"FMP_API_KEY is not configured."},{status:503,headers:{"Cache-Control":"no-store"}});
 const settled=await Promise.allSettled(INDEX_ENDPOINTS.flatMap(([,current,historical])=>[
  get(current,key),get(historical,key)
 ]));
 const indexes={},errors=[];
 for(let i=0;i<INDEX_ENDPOINTS.length;i++){
  const [name,,]=INDEX_ENDPOINTS[i],current=settled[i*2],history=settled[i*2+1];
  const currentRows=current.status==="fulfilled"?current.value:null;
  const historyRows=history.status==="fulfilled"?history.value:null;
  if(current.status==="rejected")errors.push({dataset:name+"_current",error:String(current.reason?.message||"FMP request failed").slice(0,160)});
  if(history.status==="rejected")errors.push({dataset:name+"_history",error:String(history.reason?.message||"FMP request failed").slice(0,160)});
  indexes[name]={
   current:currentRows,
   historicalChanges:historyRows?historyRows.filter(row=>String(row?.date||"")>=from):null,
   currentCount:currentRows?.length??null,
   historicalChangeCount:historyRows?.filter(row=>String(row?.date||"")>=from).length??null,
   historyAvailableFrom:from
  };
 }
 const available=Object.values(indexes).some(x=>Array.isArray(x.current)||Array.isArray(x.historicalChanges));
 return Response.json({
  available,configured:true,provider:"Financial Modeling Prep",retrievedAt:new Date().toISOString(),
  historicalChangesSince:from,indexes,errors,
  reconstructionRules:{
   currentListsAreCurrentAsOfRetrieval:true,
   applyHistoricalChangesInReverseChronologicalOrderToReconstructEarlierMembership:true,
   preserveBothAddedAndRemovedTickers:true,
   warning:"Do not assume historical event feeds are complete. Validate every event, symbol identity/reuse, index rules, effective date, and source coverage before treating reconstructed membership as verified."
  },
  limitations:[
   "The endpoint provides S&P 500, Nasdaq 100 and Dow Jones constituent data only; it is not a complete point-in-time US equity universe.",
   "FMP documentation notes that some delisted-company data may be unavailable.",
   "A current list plus change events must be independently checked for event completeness and symbol reuse before backtesting.",
   "No strategy approval or trade recommendation is produced."
  ]
 },{headers:{"Cache-Control":"no-store","X-Content-Type-Options":"nosniff"}});
}
