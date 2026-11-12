import {requestFmpJsonBatch} from "../../lib/fmp-budget.js";
const TICKER_RE=/^[A-Z][A-Z0-9.-]{0,11}$/;
const FIELDS={
 income:["date","filingDate","acceptedDate","fiscalYear","period","reportedCurrency","revenue","grossProfit","operatingIncome","netIncome","eps","epsDiluted","weightedAverageShsOutDil"],
 balance:["date","filingDate","acceptedDate","fiscalYear","period","reportedCurrency","totalAssets","totalLiabilities","totalStockholdersEquity","cashAndCashEquivalents","totalDebt","totalCurrentAssets","totalCurrentLiabilities"],
 cashflow:["date","filingDate","acceptedDate","fiscalYear","period","reportedCurrency","operatingCashFlow","capitalExpenditure","freeCashFlow","dividendsPaid","commonStockRepurchased"]
};
function pick(rows,fields){return rows.map(row=>Object.fromEntries(fields.filter(k=>row?.[k]!==undefined).map(k=>[k,row[k]])));}
export async function onRequestGet({request,env}){
 const q=new URL(request.url).searchParams;
 const ticker=(q.get("ticker")||"").trim().toUpperCase();
 const to=q.get("to")||new Date().toISOString().slice(0,10);
 const from=q.get("from")||(()=>{const d=new Date(to+"T00:00:00Z");d.setUTCFullYear(d.getUTCFullYear()-5);return d.toISOString().slice(0,10)})();
 const validDate=value=>{if(!/^[0-9]{4}-[0-9]{2}-[0-9]{2}$/.test(value))return false;const d=new Date(value+"T00:00:00Z");return Number.isFinite(d.getTime())&&d.toISOString().slice(0,10)===value;};
 if(!TICKER_RE.test(ticker)||!validDate(from)||!validDate(to)||from>to)
  return Response.json({available:false,error:"Provide a valid ticker and ISO from/to dates."},{status:400});
 const earliest=new Date(to+"T00:00:00Z");earliest.setUTCFullYear(earliest.getUTCFullYear()-5);
 if(from<earliest.toISOString().slice(0,10))return Response.json({available:false,error:"Maximum requested window is five years under Northstar's conservative FMP plan policy."},{status:400});
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
 let settled;
 try {
  settled=await requestFmpJsonBatch({db:env?.NORTHSTAR_DB,service:"pages",apiKey:fmpKey,verifiedDailyLimit:env?.FMP_VERIFIED_DAILY_LIMIT,
   requests:tasks.map(([name,path])=>({path,cacheTtlMs:name==="news"?300_000:21_600_000,timeoutMs:18_000}))});
 } catch(error) {
  return Response.json({available:false,ticker,provider:"Financial Modeling Prep",error:error?.message||"Shared FMP budget unavailable."},
   {status:Number(error?.status)||503,headers:{"Cache-Control":"no-store","X-Content-Type-Options":"nosniff"}});
 }
 const raw={},errors=[];
 settled.forEach((v,i)=>{const name=tasks[i][0];if(v.status==="fulfilled")raw[name]=v.value;else errors.push({dataset:name,error:String(v.reason?.message||"FMP request failed").slice(0,160)});});
 const prices=(raw.prices||[]).filter(x=>x.date>=from&&x.date<=to).sort((a,b)=>a.date.localeCompare(b.date));
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
  available:prices.length>0||Object.values(statements).some(x=>x.length>0),ticker,provider:"Financial Modeling Prep",retrievedAt:new Date().toISOString(),window:{from,to},
  coverage:{datasetsReturned:complete,datasetsRequested:7,priceBars:prices.length,annualIncome:statements.annualIncome?.length||0,quarterIncome:statements.quarterIncome?.length||0,newsArticles:news.length},
  prices:prices.map(x=>({date:x.date,open:x.open,high:x.high,low:x.low,close:x.close,adjOpen:x.adjOpen,adjHigh:x.adjHigh,adjLow:x.adjLow,adjClose:x.adjClose,volume:x.volume})),
  statements,news,errors,
  pointInTimeRules:{financialAvailabilityField:"acceptedDate preferred; filingDate fallback only when acceptedDate absent",priceAvailabilityField:"daily bar date; close is available after that session",newsAvailabilityField:"publishedDate",warning:"Do not use a statement before its accepted/filing timestamp. If neither timestamp exists, exclude it from point-in-time snapshots. FMP's current historical response is not an immutable archive of every prior vendor revision."},
  limitations:["Current ticker history does not establish historical index membership or include every delisted security.","News coverage and timestamps vary by symbol and may not be complete.","Historical prices may be adjusted; use a consistent adjustment policy and corporate-action audit before replay.","This endpoint retrieves source data; it does not approve BUY or certify a backtest."]
 },{headers:{"Cache-Control":"no-store","X-Content-Type-Options":"nosniff"}});
}
