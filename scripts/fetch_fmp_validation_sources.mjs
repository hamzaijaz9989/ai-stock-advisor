import fs from "node:fs/promises";
import path from "node:path";
import {fileURLToPath} from "node:url";
import {fetchEarningsHistory} from "./fetch_fmp_earnings.mjs";

const TICKER_RE=/^[A-Z][A-Z0-9.-]{0,11}$/;
function validDate(value){
 if(!/^\d{4}-\d{2}-\d{2}$/.test(value))return false;
 const d=new Date(value+"T00:00:00Z");
 return Number.isFinite(d.getTime())&&d.toISOString().slice(0,10)===value;
}
export function parseSymbolsText(content){
 if(typeof content!=="string")throw new TypeError("Symbols file must be text.");
 const withoutComments=content.split(/\r?\n/).map(line=>line.replace(/#.*/,"")).join("\n");
 const tokens=withoutComments.split(/[\s,;]+/).map(x=>x.trim().toUpperCase()).filter(Boolean);
 const symbols=[...new Set(tokens)];
 if(!symbols.length)throw new Error("Symbols file contains no tickers.");
 if(symbols.length>500)throw new Error("Maximum 500 unique tickers per acquisition run.");
 const invalid=symbols.filter(x=>!TICKER_RE.test(x));
 if(invalid.length)throw new Error("Invalid ticker symbols: "+invalid.slice(0,10).join(", "));
 return symbols.sort();
}
function validateWindow(from,to){
 if(!validDate(from)||!validDate(to)||from>to)throw new Error("Provide valid ISO from/to dates.");
 if((Date.parse(to+"T00:00:00Z")-Date.parse(from+"T00:00:00Z"))/86400000>3653)throw new Error("Maximum acquisition window is 10 years.");
}
async function getJson(fetchImpl,url,headers,label){
 const response=await fetchImpl(url,{headers,signal:AbortSignal.timeout(30000)});
 const payload=await response.json().catch(()=>null);
 if(!response.ok||!payload||typeof payload!=="object")throw new Error(label+" failed (HTTP "+response.status+").");
 return payload;
}
export async function fetchValidationSources({from,to,symbols,baseUrl,operatorToken,fetchImpl=fetch}){
 validateWindow(from,to);
 if(!Array.isArray(symbols)||!symbols.length)throw new Error("An explicit non-empty ticker list is required.");
 const normalized=[...new Set(symbols.map(x=>String(x).trim().toUpperCase()))].sort();
 if(normalized.length>500||normalized.some(x=>!TICKER_RE.test(x)))throw new Error("Ticker list is invalid or exceeds 500 unique symbols.");
 if(typeof baseUrl!=="string"||!/^https:\/\//.test(baseUrl))throw new Error("A valid HTTPS NORTHSTAR_API_BASE is required.");
 if(typeof operatorToken!=="string"||!operatorToken)throw new Error("NORTHSTAR_OPERATOR_TOKEN is required.");
 const base=baseUrl.replace(/\/$/,"");
 const auth={Authorization:"Bearer "+operatorToken,Accept:"application/json"};
 const universeUrl=new URL("/api/fmp-universe",base);universeUrl.searchParams.set("from",from);
 const universe=await getJson(fetchImpl,universeUrl,auth,"FMP universe acquisition");
 if(universe.available!==true)throw new Error("FMP universe endpoint did not confirm available data.");
 const earnings=await fetchEarningsHistory({from,to,baseUrl:base,operatorToken,fetchImpl});
 const historyBySymbol={};
 const gaps=[];
 for(const symbol of normalized){
  const url=new URL("/api/fmp-history",base);
  url.searchParams.set("ticker",symbol);url.searchParams.set("from",from);url.searchParams.set("to",to);
  const history=await getJson(fetchImpl,url,{Accept:"application/json"},"FMP history for "+symbol);
  if(history.available!==true||history.ticker!==symbol)throw new Error("FMP history for "+symbol+" was unavailable or mismatched.");
  const priceBars=Number(history.coverage?.priceBars)||0;
  const annual=Number(history.coverage?.annualIncome)||0;
  const quarterly=Number(history.coverage?.quarterIncome)||0;
  if(priceBars===0||annual===0||quarterly===0)gaps.push({symbol,priceBars,annualIncome:annual,quarterIncome:quarterly});
  historyBySymbol[symbol]=history;
 }
 const allSymbols=[...normalized];
 return {
  metadata:{
   provider:"Financial Modeling Prep via Northstar server-side adapters",
   requestedWindow:{from,to},
   acquiredAt:new Date().toISOString(),
   requestedSymbols:allSymbols,
   symbolCount:allSymbols.length,
   acquisitionVersion:1,
   stage:"RAW_SOURCE_BUNDLE_NOT_VALIDATION_INPUT",
   warning:"This bundle is raw source evidence. It is not a point-in-time snapshot dataset, backtest, strategy approval, or BUY authorization."
  },
  universe,
  earnings,
  historyBySymbol,
  coverage:{
   symbolsRequested:allSymbols.length,
   symbolsWithHistory:Object.keys(historyBySymbol).length,
   symbolsWithMissingCoreCoverage:gaps,
   earningsEvents:earnings.metadata.recordCount,
   pointInTimeLimitations:[
    "FMP current historical responses are not immutable vendor-revision archives.",
    "Earnings date and lastUpdated do not prove first-public availability.",
    "Historical index membership must be reconstructed and independently verified.",
    "Delisted-company coverage may be incomplete.",
    "Financial statement acceptedDate/filingDate and news publishedDate must be checked against every decision timestamp.",
    "Price adjustment, splits, dividends, symbol reuse and suspensions require independent reconciliation.",
    "The first 100 news records per symbol may be incomplete."
   ]
  }
 };
}
function parseArgs(argv){
 const out={};for(let i=0;i<argv.length;i++){if(argv[i].startsWith("--"))out[argv[i].slice(2)]=argv[++i];}
 return out;
}
async function main(){
 const args=parseArgs(process.argv.slice(2));
 if(!args.from||!args.to||!args["symbols-file"]||!args.output)throw new Error("Usage: node scripts/fetch_fmp_validation_sources.mjs --from YYYY-MM-DD --to YYYY-MM-DD --symbols-file symbols.txt --output raw-sources.json");
 const symbols=parseSymbolsText(await fs.readFile(args["symbols-file"],"utf8"));
 const result=await fetchValidationSources({from:args.from,to:args.to,symbols,baseUrl:process.env.NORTHSTAR_API_BASE,operatorToken:process.env.NORTHSTAR_OPERATOR_TOKEN});
 await fs.mkdir(path.dirname(path.resolve(args.output)),{recursive:true});
 await fs.writeFile(args.output,JSON.stringify(result,null,2)+"\n",{flag:"wx"});
 console.log("Saved raw source bundle for "+result.metadata.symbolCount+" tickers; "+result.coverage.symbolsWithMissingCoreCoverage.length+" symbols have incomplete core coverage. No validation approval was created.");
}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url)){
 main().catch(error=>{console.error(error.message);process.exitCode=1;});
}
