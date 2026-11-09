import test from "node:test";
import assert from "node:assert/strict";
import {parseSymbolsText,fetchValidationSources} from "../scripts/fetch_fmp_validation_sources.mjs";

function fakeFetch({historyOverride}={}){
 const calls=[];
 const fetchImpl=async(input,options={})=>{
  const url=new URL(String(input));calls.push({path:url.pathname,auth:options.headers?.Authorization||null});
  if(url.pathname==="/api/fmp-universe")return Response.json({available:true,provider:"Financial Modeling Prep",indexes:{sp500:{currentCount:500}}});
  if(url.pathname==="/api/fmp-earnings")return Response.json({available:true,retrievedAt:"2026-11-09T00:00:00.000Z",coverage:{providerRecords:2,providerLimit:4000},events:[{symbol:"AAPL",date:"2026-01-01"}]});
  if(url.pathname==="/api/fmp-history"){
   const symbol=url.searchParams.get("ticker");
   return Response.json(historyOverride?historyOverride(symbol):{available:true,ticker:symbol,retrievedAt:"2026-11-09T00:00:00.000Z",coverage:{priceBars:10,annualIncome:5,quarterIncome:20},prices:[],statements:{},news:[]});
  }
  throw new Error("Unexpected URL "+url);
 };
 return {fetchImpl,calls};
}

test("symbol parser normalizes, deduplicates and ignores full-line and trailing comments",()=>{
 assert.deepEqual(parseSymbolsText("# US universe\nAAPL, msft # note\nNVDA; aapl\n"),["AAPL","MSFT","NVDA"]);
});
test("symbol parser rejects empty, malformed and over-limit lists",()=>{
 assert.throws(()=>parseSymbolsText("# no tickers\n"),/no tickers/);
 assert.throws(()=>parseSymbolsText("AAPL\\nBAD/TICKER"),/Invalid ticker/);
 const many=Array.from({length:501},(_,i)=>"A"+String(i).padStart(3,"0")).join("\\n");
 assert.throws(()=>parseSymbolsText(many),/Maximum 500/);
});
test("raw acquisition fetches universe, bounded earnings windows and explicit symbol histories without exposing secrets",async()=>{
 const {fetchImpl,calls}=fakeFetch();
 const bundle=await fetchValidationSources({from:"2026-01-01",to:"2026-03-31",symbols:["aapl","SPY","AAPL"],baseUrl:"https://northstar.example",operatorToken:"do-not-persist",fetchImpl});
 assert.equal(bundle.metadata.stage,"RAW_SOURCE_BUNDLE_NOT_VALIDATION_INPUT");
 assert.deepEqual(bundle.metadata.requestedSymbols,["AAPL","SPY"]);
 assert.equal(bundle.coverage.symbolsWithHistory,2);
 assert.equal(bundle.coverage.earningsEvents,1);
 assert.equal(calls.filter(x=>x.path==="/api/fmp-earnings").length,1);
 assert.equal(calls.filter(x=>x.path==="/api/fmp-history").length,2);
 assert.equal(calls.find(x=>x.path==="/api/fmp-universe").auth,"Bearer do-not-persist");
 assert.equal(calls.find(x=>x.path==="/api/fmp-earnings").auth,"Bearer do-not-persist");
 assert.equal(calls.find(x=>x.path==="/api/fmp-history").auth,null);
 assert.equal(JSON.stringify(bundle).includes("do-not-persist"),false);
});
test("raw acquisition records incomplete per-symbol coverage rather than fabricating data",async()=>{
 const {fetchImpl}=fakeFetch({historyOverride:symbol=>({available:true,ticker:symbol,coverage:{priceBars:symbol==="SPY"?10:0,annualIncome:0,quarterIncome:0}})});
 const bundle=await fetchValidationSources({from:"2026-01-01",to:"2026-01-02",symbols:["AAPL","SPY"],baseUrl:"https://northstar.example",operatorToken:"token",fetchImpl});
 assert.deepEqual(bundle.coverage.symbolsWithMissingCoreCoverage,[{symbol:"AAPL",priceBars:0,annualIncome:0,quarterIncome:0}]);
});
test("raw acquisition rejects invalid windows, non-HTTPS API bases and mismatched history symbols",async()=>{
 const {fetchImpl}=fakeFetch({historyOverride:()=>({available:true,ticker:"OTHER",coverage:{priceBars:1}})});
 await assert.rejects(fetchValidationSources({from:"2026-02-02",to:"2026-01-01",symbols:["AAPL"],baseUrl:"https://northstar.example",operatorToken:"token",fetchImpl}),/valid ISO/);
 await assert.rejects(fetchValidationSources({from:"2026-01-01",to:"2026-01-02",symbols:["AAPL"],baseUrl:"http://northstar.example",operatorToken:"token",fetchImpl}),/HTTPS/);
 await assert.rejects(fetchValidationSources({from:"2026-01-01",to:"2026-01-02",symbols:["AAPL"],baseUrl:"https://northstar.example",operatorToken:"token",fetchImpl}),/mismatched/);
});
