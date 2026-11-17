const HEADERS={Accept:"application/json","User-Agent":"NorthstarAI/1.0 contact: ihamzaij681@gmail.com"};
const TICKER_RE=/^[A-Z][A-Z0-9.-]{0,11}$/;
export async function fetchSecCompanyFacts(ticker,asOf=new Date().toISOString(),fetcher=fetch){
 const symbol=String(ticker||"").trim().toUpperCase();
 if(!TICKER_RE.test(symbol))throw new TypeError("A valid US equity ticker is required for SEC companyfacts.");
 const asOfMs=Date.parse(asOf);
 if(!Number.isFinite(asOfMs))throw new TypeError("A valid research as-of timestamp is required for SEC companyfacts.");
 const cutoff=new Date(asOfMs).toISOString().slice(0,10);
 const mapResponse=await fetcher("https://www.sec.gov/files/company_tickers.json",{headers:HEADERS,signal:AbortSignal.timeout(8000)});
 if(!mapResponse.ok)throw new Error("SEC ticker directory unavailable (HTTP "+mapResponse.status+").");
 const directory=await mapResponse.json();
 const row=Object.values(directory||{}).find(x=>String(x?.ticker||"").toUpperCase()===symbol);
 if(!row||!Number.isFinite(Number(row.cik_str)))throw new Error("SEC CIK mapping unavailable for "+symbol+".");
 const cik=String(row.cik_str).padStart(10,"0");
 const response=await fetcher("https://data.sec.gov/api/xbrl/companyfacts/CIK"+cik+".json",{headers:HEADERS,signal:AbortSignal.timeout(12000)});
 if(!response.ok)throw new Error("SEC companyfacts unavailable (HTTP "+response.status+").");
 const payload=await response.json(),observations=[];
 for(const [taxonomy,concepts] of Object.entries(payload.facts||{})){
  for(const [key,concept] of Object.entries(concepts||{})){
   for(const [unit,rows] of Object.entries(concept.units||{})){
    for(const fact of rows||[]){
     if(!fact||typeof fact.filed!=="string"||typeof fact.end!=="string"||fact.filed>cutoff||fact.end>cutoff||!Number.isFinite(Number(fact.val)))continue;
     observations.push({key,metric:concept.label||key,taxonomy,tag:key,value:Number(fact.val),unit,start:fact.start||null,end:fact.end,filed:fact.filed,form:fact.form||null,accession:fact.accn||null,fy:fact.fy??null,fp:fact.fp||null});
    }
   }
  }
 }
 observations.sort((a,b)=>b.filed.localeCompare(a.filed));
 return {ticker:symbol,cik,companyName:payload.entityName||row.title||symbol,observations:observations.slice(0,250),
  provider:"SEC EDGAR companyfacts",asOf:cutoff,pointInTimeWarning:"SEC filed dates are not exact public-availability timestamps; Northstar must not claim strict point-in-time availability."};
}
