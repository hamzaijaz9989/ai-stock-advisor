const TICKER_RE=/^[A-Z][A-Z0-9.-]{0,11}$/;
const BASE="https://financialmodelingprep.com/stable/";
const FIELDS={
 income:["date","filingDate","acceptedDate","fiscalYear","period","reportedCurrency","revenue","grossProfit","operatingIncome","netIncome","eps","epsDiluted","weightedAverageShsOutDil"],
 balance:["date","filingDate","acceptedDate","fiscalYear","period","reportedCurrency","totalAssets","totalLiabilities","totalStockholdersEquity","cashAndCashEquivalents","totalDebt","totalCurrentAssets","totalCurrentLiabilities"],
 cashflow:["date","filingDate","acceptedDate","fiscalYear","period","reportedCurrency","operatingCashFlow","capitalExpenditure","freeCashFlow","dividendsPaid","commonStockRepurchased"]
};
async function get(path,key){
 const u=new URL(path,BASE);u.searchParams.set("apikey",key);
 const r=await fetch(u,{headers:{Accept:"application/json"},signal:AbortSignal.timeout(18000)});
 if(!r.ok)throw new Error("HTTP "+r.status+" for "+path.split("?")[0]);
 const j=await r.json();if(!Array.isArray(j))throw new Error("Unexpected response for "+path.split("?")[0]);return j;
}
function pick(rows,fields){return rows.map(row=>Object.fromEntries(fields.filter(k=>row?.[k]!==undefined).map(k=>[k,row[k]])));}

async function yahooDailyHistory(ticker,from,to){
 const period1=Math.floor(Date.parse(from+"T00:00:00Z")/1000);
 const period2=Math.floor(Date.parse(to+"T23:59:59Z")/1000)+1;
 const url="https://query1.finance.yahoo.com/v8/finance/chart/"+encodeURIComponent(ticker)+"?period1="+period1+"&period2="+period2+"&interval=1d&events=div%2Csplits";
 const response=await fetch(url,{headers:{Accept:"application/json","User-Agent":"Mozilla/5.0 (compatible; NorthstarAI/1.0)"},signal:AbortSignal.timeout(12000)});
 if(!response.ok)throw new Error("Yahoo Finance history returned HTTP "+response.status);
 const payload=await response.json(),result=payload?.chart?.result?.[0];
 if(payload?.chart?.error||!result)throw new Error(payload?.chart?.error?.description||"Yahoo Finance returned no chart history");
 const timestamps=result.timestamp||[],quote=result.indicators?.quote?.[0]||{},adjusted=result.indicators?.adjclose?.[0]?.adjclose||[];
 const rows=[];
 for(let i=0;i<timestamps.length;i++){
  const date=new Date(timestamps[i]*1000).toISOString().slice(0,10);
  const open=Number(quote.open?.[i]),high=Number(quote.high?.[i]),low=Number(quote.low?.[i]),close=Number(quote.close?.[i]),volume=Number(quote.volume?.[i]);
  if(date<from||date>to||![open,high,low,close,volume].every(Number.isFinite)||Math.min(open,high,low,close)<=0||volume<0||high<Math.max(open,close,low)||low>Math.min(open,close,high))continue;
  const adjClose=Number(adjusted[i]);
  rows.push({date,open,high,low,close,adjClose:Number.isFinite(adjClose)&&adjClose>0?adjClose:null,volume});
 }
 rows.sort((a,b)=>a.date.localeCompare(b.date));
 const unique=rows.filter((row,i)=>i===0||rows[i-1].date!==row.date);
 if(unique.length<60)throw new Error("Yahoo Finance returned only "+unique.length+" valid daily bars; 60 are required.");
 return unique;
}
export async function onRequestGet({request,env}){
 const q=new URL(request.url).searchParams;
 const ticker=(q.get("ticker")||"").trim().toUpperCase();
 const to=q.get("to")||new Date().toISOString().slice(0,10);
 const from=q.get("from")||(()=>{const d=new Date(to+"T00:00:00Z");d.setUTCFullYear(d.getUTCFullYear()-5);return d.toISOString().slice(0,10)})();
 if(!TICKER_RE.test(ticker)||!/^[0-9]{4}-[0-9]{2}-[0-9]{2}$/.test(from)||!/^[0-9]{4}-[0-9]{2}-[0-9]{2}$/.test(to)||from>to)
  return Response.json({available:false,error:"Provide a valid ticker and ISO from/to dates."},{status:400});
 if((Date.parse(to)-Date.parse(from))/86400000>3653)return Response.json({available:false,error:"Maximum requested window is 10 years."},{status:400});
 const fmpKey=env?.FMP_API_KEY;
 if(!fmpKey)return Response.json({available:false,configured:false,error:"FMP_API_KEY is not configured."},{status:503,headers:{"Cache-Control":"no-store"}});
 const tasks=[
  ["prices",`historical-price-eod/full?symbol=${encodeURIComponent(ticker)}&from=${from}&to=${to}`],
  ["annualIncome",`income-statement?symbol=${ticker}&period=annual&limit=5`],
  ["annualBalance",`balance-sheet-statement?symbol=${ticker}&period=annual&limit=5`],
  ["annualCashflow",`cash-flow-statement?symbol=${ticker}&period=annual&limit=5`],
  ["quarterIncome",`income-statement?symbol=${ticker}&period=quarter&limit=5`],
  ["quarterBalance",`balance-sheet-statement?symbol=${ticker}&period=quarter&limit=5`],
  ["quarterCashflow",`cash-flow-statement?symbol=${ticker}&period=quarter&limit=5`],
  ["news",`news/stock?symbols=${ticker}&from=${from}&to=${to}&limit=5&page=0`]
 ];
 const settled=await Promise.allSettled(tasks.map(([,path])=>get(path,fmpKey)));
 const raw={},errors=[];
 settled.forEach((v,i)=>{const name=tasks[i][0];if(v.status==="fulfilled")raw[name]=v.value;else errors.push({dataset:name,error:String(v.reason?.message||"FMP request failed").slice(0,160)});});
 let prices=(raw.prices||[]).filter(x=>x.date>=from&&x.date<=to).sort((a,b)=>a.date.localeCompare(b.date));
 let priceProvider="Financial Modeling Prep",priceWarning=null;
 if(prices.length<60){
  try{prices=await yahooDailyHistory(ticker,from,to);priceProvider="Yahoo Finance chart API";priceWarning="FMP returned fewer than 60 usable daily bars; historical OHLCV was sourced from Yahoo Finance. Verify corporate-action adjustment and vendor coverage before relying on technical levels.";}
  catch(error){priceWarning="FMP returned "+prices.length+" usable daily bars and Yahoo Finance fallback failed: "+String(error?.message||error).slice(0,180);}
 }
 const statements={};
 for(const [name,rows] of Object.entries(raw)){
  if(name==="prices"||name==="news")continue;
  const kind=name.replace(/^annual|^quarter/,"").toLowerCase();
  const fields=FIELDS[kind]||[];
  statements[name]=pick(rows||[],fields).sort((a,b)=>String(a.date||"").localeCompare(String(b.date||"")));
 }
 const news=(raw.news||[]).filter(x=>x.publishedDate&&x.publishedDate.slice(0,10)>=from&&x.publishedDate.slice(0,10)<=to).map(x=>({symbol:x.symbol,publishedDate:x.publishedDate,publisher:x.publisher,title:x.title,url:x.url,site:x.site}));
 const complete=["prices","annualIncome","annualBalance","annualCashflow","quarterIncome","quarterBalance","quarterCashflow"].filter(k=>Array.isArray(raw[k])&&raw[k].length>0).length;
 return Response.json({
  available:prices.length>0||Object.values(statements).some(x=>x.length>0),ticker,provider:priceProvider,priceProvider,priceWarning,retrievedAt:new Date().toISOString(),window:{from,to},
  coverage:{datasetsReturned:complete,datasetsRequested:7,priceBars:prices.length,priceProvider,annualIncome:statements.annualIncome?.length||0,quarterIncome:statements.quarterIncome?.length||0,newsArticles:news.length},
  prices:prices.map(x=>({date:x.date,open:x.open,high:x.high,low:x.low,close:x.close,adjOpen:x.adjOpen,adjHigh:x.adjHigh,adjLow:x.adjLow,adjClose:x.adjClose,volume:x.volume})),
  statements,news,errors,priceWarning,
  pointInTimeRules:{financialAvailabilityField:"acceptedDate preferred; filingDate fallback only when acceptedDate absent",priceAvailabilityField:"daily bar date; close is available after that session",newsAvailabilityField:"publishedDate",warning:"Do not use a statement before its accepted/filing timestamp. If neither timestamp exists, exclude it from point-in-time snapshots. FMP's current historical response is not an immutable archive of every prior vendor revision."},
  limitations:["Yahoo Finance fallback is an unlicensed public endpoint and may throttle, change or restrict access; fallback does not guarantee availability or redistribution rights.","Current ticker history does not establish historical index membership or include every delisted security.","News coverage and timestamps vary by symbol and may not be complete.","Historical prices may be adjusted; use a consistent adjustment policy and corporate-action audit before replay.","This endpoint retrieves source data; it does not approve BUY or certify a backtest."]
 },{headers:{"Cache-Control":"no-store","X-Content-Type-Options":"nosniff"}});
}
