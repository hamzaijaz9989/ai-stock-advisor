import test from "node:test";
import assert from "node:assert/strict";
import {onRequestPost} from "../web/functions/api/research/collect.js";

const DAY=24*60*60*1000;
const TOKEN="synthetic-operator-token";

function makeD1(){
 const state={
  control:{enabled:0,mode:"paper",kill_switch:1,max_portfolio_usd:1000},
  snapshots:[{captured_at:new Date(Date.now()-8*DAY).toISOString(),equity_usd:100000,source:"alpaca_paper_read_only_sync"}],
  positions:[],orders:[],runs:new Map(),writes:[]
 };
 const db={
  prepare(sql){
   let args=[];
   const statement={
    sql,
    bind(...values){args=values;statement.args=values;return statement;},
    args,
    async first(){
     if(sql.includes("execution_control"))return {...state.control};
     if(sql.includes("research_council_runs"))return state.runs.get(args[0])||null;
     return null;
    },
    async all(){
     if(sql.includes("paper_positions"))return {results:[...state.positions]};
     if(sql.includes("paper_orders"))return {results:[...state.orders]};
     if(sql.includes("paper_equity_snapshots"))return {results:[...state.snapshots].sort((a,b)=>Date.parse(b.captured_at)-Date.parse(a.captured_at))};
     return {results:[]};
    },
    async run(){
     if(sql.includes("INSERT INTO research_council_runs")){
      const [requestId,inputHash,symbol,status,resultJson]=args;
      if(state.runs.has(requestId))return {meta:{changes:0}};
      state.runs.set(requestId,{symbol,input_sha256:inputHash,status,result_json:resultJson,created_at:new Date().toISOString()});
      state.writes.push("research_council_runs");
      return {meta:{changes:1}};
     }
     throw new Error("Unexpected synthetic D1 run: "+sql);
    }
   };
   return statement;
  },
  async batch(statements){
   for(const statement of statements){
    const args=statement.args||[];
    if(statement.sql.includes("INSERT INTO paper_equity_snapshots")){
     const [capturedAt,equity,cash,buyingPower,dayPl,source]=args;
     if(!state.snapshots.some(row=>row.captured_at===capturedAt)){
      state.snapshots.push({captured_at:capturedAt,equity_usd:equity,cash_usd:cash,buying_power_usd:buyingPower,day_pl_usd:dayPl,source});
      state.writes.push("paper_equity_snapshots");
     }
    }else if(statement.sql.includes("DELETE FROM paper_positions")){
     state.positions=[];
     state.writes.push("paper_positions_delete");
    }else if(statement.sql.includes("INSERT INTO paper_positions")){
     const [symbol,qty,avg,marketValue,unrealized,brokerUpdated,reconciled]=args;
     state.positions.push({symbol,qty,avg_entry_price:avg,market_value:marketValue,unrealized_pl:unrealized,broker_updated_at:brokerUpdated,reconciled_at:reconciled});
     state.writes.push("paper_positions");
    }else if(statement.sql.includes("INSERT INTO execution_audit_log")){
     state.writes.push("execution_audit_log");
    }else{
     throw new Error("Unexpected synthetic D1 batch statement: "+statement.sql);
    }
   }
   return {success:true};
  }
 };
 return {db,state};
}

function syntheticFetch(){
 const calls=[];
 const nowSeconds=Math.floor(Date.now()/1000)-60;
 const quotePayload={chart:{result:[{
  meta:{currency:"USD",exchangeName:"NASDAQ",marketState:"REGULAR",regularMarketTime:nowSeconds,shortName:"NVIDIA"},
  timestamp:[nowSeconds],indicators:{quote:[{close:[180]}]}
 }]}};
 const priceRows=Array.from({length:65},(_,index)=>{
  const date=new Date(Date.now()-(index+1)*DAY).toISOString().slice(0,10);
  return {date,open:100,high:101,low:99,close:100,adjOpen:100,adjHigh:101,adjLow:99,adjClose:100,volume:1000};
 });
 const statementRow={
  date:"2025-12-31",filingDate:"2026-01-15",fiscalYear:2025,period:"FY",reportedCurrency:"USD",
  revenue:100000000,grossProfit:50000000,operatingIncome:10000000,netIncome:8000000,eps:2,epsDiluted:2,
  weightedAverageShsOutDil:4000000,totalAssets:200000000,totalLiabilities:50000000,totalStockholdersEquity:150000000,
  cashAndCashEquivalents:30000000,totalDebt:10000000,totalCurrentAssets:100000000,totalCurrentLiabilities:20000000,
  operatingCashFlow:15000000,capitalExpenditure:-5000000,freeCashFlow:10000000,dividendsPaid:0,commonStockRepurchased:0,
  currentRatio:5,quickRatio:4,debtToEquityRatio:0.1,grossProfitMargin:0.5,operatingProfitMargin:0.1,
  netProfitMargin:0.08,returnOnAssets:0.04,returnOnEquity:0.05,peRatio:20,evToEBITDA:15,
  marketCap:1000000000,enterpriseValue:1010000000,priceToSalesRatio:10,priceToBookRatio:6,
  evToFreeCashFlow:100,freeCashFlowYield:0.01,returnOnInvestedCapital:0.04,netDebtToEBITDA:0.5
 };
 const fetcher=async(input,init={})=>{
  const url=new URL(input);
  const method=String(init.method||"GET").toUpperCase();
  calls.push({url:url.toString(),host:url.hostname,path:url.pathname,method});
  if(url.hostname==="paper-api.alpaca.markets"){
   if(url.pathname==="/v2/account")return Response.json({status:"ACTIVE",currency:"USD",equity:"100000",cash:"100000",buying_power:"400000",last_equity:"100000",trading_blocked:false,account_blocked:false});
   if(url.pathname==="/v2/positions")return Response.json([]);
   if(url.pathname==="/v2/orders")return Response.json([]);
  }
  if(url.hostname==="query1.finance.yahoo.com"||url.hostname==="query2.finance.yahoo.com")return Response.json(quotePayload);
  if(url.hostname==="financialmodelingprep.com"){
   if(url.pathname.endsWith("/historical-price-eod/full"))return Response.json(priceRows);
   if(url.pathname.endsWith("/news/stock"))return Response.json([]);
   if(url.pathname.endsWith("/analyst-estimates"))return Response.json([{date:"2026-12-31",epsAvg:5,revenueAvg:120000000,numAnalystsEps:8,numAnalystsRevenue:8}]);
   if(/income-statement|balance-sheet-statement|cash-flow-statement|key-metrics|ratios/.test(url.pathname))return Response.json([statementRow]);
  }
  if(url.hostname==="www.sec.gov"&&url.pathname==="/files/company_tickers.json")return Response.json({0:{ticker:"NVDA",cik_str:1045810}});
  if(url.hostname==="data.sec.gov"&&url.pathname.includes("/companyfacts/"))return Response.json({facts:{"us-gaap":{"Revenues":{label:"Revenue",units:{USD:[{val:100000000,filed:"2026-01-15",end:"2025-12-31",form:"10-K",accn:"0001",fy:2025,fp:"FY"}]}}}}});
  if(url.hostname==="generativelanguage.googleapis.com"){
   if(method==="GET")return Response.json({models:[{name:"models/gemini-2.5-flash",supportedGenerationMethods:["generateContent"]}]});
   if(method==="POST"&&url.pathname.includes(":generateContent")){
    const requestBody=JSON.parse(init.body);
    const prompt=JSON.parse(requestBody.contents[0].parts[0].text);
    const context=prompt.context;
    const role=prompt.role;
    const selected=role==="news_analyst"||role==="sentiment_analyst"
      ? context.facts.find(item=>item.type==="RESOURCE_COVERAGE_SNAPSHOT")
      : role==="portfolio_analyst"
       ? context.facts.find(item=>item.type==="PORTFOLIO_RISK_SNAPSHOT")
       : role==="fundamental_analyst"
        ? context.facts.find(item=>item.type==="SEC_REPORTED_FACT")||context.facts[0]
        : role==="technical_analyst"
         ? context.facts.find(item=>item.type==="DAILY_OHLCV_HISTORY")
         : role==="market_scanner"
          ? context.facts.find(item=>item.type==="QUOTE")
          : context.facts.find(item=>item.type==="QUOTE");
    assert.ok(selected?.id,"synthetic model must cite a real role-relevant fact");
    const report={
     status:"COMPLETE",
     findings:[{claim:role+" has one evidence-linked synthetic observation for human review.",factIds:[selected.id]}],
     risks:[{claim:"Independent source confirmation and human review remain necessary.",factIds:[selected.id]}]
    };
    return Response.json({candidates:[{content:{parts:[{text:JSON.stringify(report)}]}}],usageMetadata:{promptTokenCount:120,candidatesTokenCount:50,totalTokenCount:170}});
   }
  }
  if(["feeds.finance.yahoo.com","news.google.com","www.bing.com"].includes(url.hostname))return new Response("<rss><channel></channel></rss>",{status:200,headers:{"Content-Type":"application/rss+xml"}});
  if(url.hostname==="www.nasdaq.com"&&url.pathname.includes("/api/news/topic/articlebysymbol"))return Response.json({data:{rows:[]}});
  if(url.hostname==="api.nasdaq.com"&&url.pathname==="/api/calendar/earnings")return Response.json({data:{rows:null},status:{rCode:200}});
  if(url.hostname==="earningsnxt.ai")return Response.json({events:[],count:0});
  throw new Error("Unexpected synthetic fetch: "+method+" "+url.toString());
 };
 return {fetcher,calls};
}

function collectorRequest(requestId){
 return new Request("https://northstar.test/api/research/collect",{
  method:"POST",
  headers:{Authorization:"Bearer "+TOKEN,"Content-Type":"application/json"},
  body:JSON.stringify({ticker:"NVDA",requestId})
 });
}

test("synthetic collector acceptance runs all nine roles, persists scorecard/trace, and replays without provider access",async()=>{
 const {db,state}=makeD1();
 const {fetcher,calls}=syntheticFetch();
 const originalFetch=globalThis.fetch;
 globalThis.fetch=fetcher;
 try{
  const env={
   NORTHSTAR_OPERATOR_TOKEN:TOKEN,NORTHSTAR_DB:db,
   ALPACA_API_KEY_ID:"synthetic-paper-key",ALPACA_API_SECRET_KEY:"synthetic-paper-secret",
   FMP_API_KEY:"synthetic-fmp-key",GEMINI_API_KEY:"synthetic-gemini-key"
  };
  const first=await onRequestPost({request:collectorRequest("collector-e2e-0001"),env});
  const body=await first.json();
  assert.equal(first.status,200);
  assert.equal(body.ok,true);
  assert.equal(body.replayed,false);
  assert.equal(body.traceDurable,true);
  assert.equal(body.execution,false);
  assert.equal(body.automatedOrderSubmission,false);
  assert.equal(body.result.status,"RESEARCH_REVIEW_REQUIRED");
  assert.equal(body.result.traceDurable,true);
  assert.deepEqual(body.result.agents.map(agent=>agent.role),[
   "market_scanner","technical_analyst","fundamental_analyst","news_analyst","sentiment_analyst",
   "bull_researcher","bear_researcher","portfolio_analyst","risk_committee"
  ]);
  assert.ok(body.result.agents.every(agent=>agent.status==="COMPLETE"));
  assert.equal(body.result.reports.length,9);
  assert.equal(body.result.evaluation.totals.roleCount,9);
  assert.equal(body.result.evaluation.totals.rolesComplete,9);
  assert.equal(body.result.evaluation.totals.telemetryRoles,9);
  assert.equal(body.result.evaluation.roles.news_analyst.resourceStatus,"INSUFFICIENT");
  assert.equal(body.result.resourceCoverage.newsQuality.eligibleCount,0);
  assert.equal(state.runs.size,1);
  assert.ok(state.writes.includes("research_council_runs"));
  assert.ok(state.writes.includes("paper_equity_snapshots"));
  assert.equal(state.snapshots.length,2,"the synthetic read-only sync adds one current snapshot to the seeded seven-day baseline");
  assert.equal(state.positions.length,0);
  assert.equal(state.orders.length,0);
  assert.equal(state.writes.some(name=>name.includes("paper_orders")||name.includes("paper_trade_intents")),false);
  const brokerCalls=calls.filter(call=>call.host==="paper-api.alpaca.markets");
  assert.ok(brokerCalls.length>0);
  assert.ok(brokerCalls.every(call=>call.method==="GET"),"broker access must remain read-only");
  assert.equal(brokerCalls.some(call=>call.path.includes("/orders")&&call.method!=="GET"),false);

  const callsBeforeReplay=calls.length;
  const writesBeforeReplay=state.writes.length;
  globalThis.fetch=async()=>{throw new Error("durable replay must not access providers or broker");};
  const replay=await onRequestPost({request:collectorRequest("collector-e2e-0001"),env});
  const replayBody=await replay.json();
  assert.equal(replay.status,200);
  assert.equal(replayBody.replayed,true);
  assert.equal(replayBody.traceDurable,true);
  assert.equal(replayBody.execution,false);
  assert.equal(replayBody.result.evaluation.totals.roleCount,9);
  assert.equal(calls.length,callsBeforeReplay);
  assert.equal(state.writes.length,writesBeforeReplay);
 }finally{
  globalThis.fetch=originalFetch;
 }
});
