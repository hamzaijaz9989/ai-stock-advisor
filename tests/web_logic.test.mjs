import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { runInNewContext } from "node:vm";
import test from "node:test";

const source = readFileSync(new URL("../web/app.js", import.meta.url), "utf8");

function makeElement(id = "") {
  return {
    id,
    textContent: "",
    innerHTML: "",
    className: "",
    disabled: false,
    dataset: {},
    children: [],
    classList: { add() {}, remove() {} },
    append(...children) { this.children.push(...children); },
    addEventListener() {}
  };
}

function loadAppFunctions() {
  const elements = new Map();
  const document = {
    getElementById(id) {
      if (!elements.has(id)) elements.set(id, makeElement(id));
      return elements.get(id);
    },
    querySelectorAll() { return []; },
    createElement(tag) { return makeElement(tag); }
  };
  const context = { document, fetch: async () => { throw new Error("Unexpected fetch in unit test"); } };
  runInNewContext(source, context, { filename: "web/app.js" });
  return context;
}

function obs(key, value, start, end, form = "10-K", unit = "USD", filed = end) {
  return { key, value, start, end, form, unit, filed, tag: key, metric: key };
}

function shareFacts(value = 90e6) {
  const today = new Date().toISOString().slice(0,10);
  return {facts:{"us-gaap":{EntityCommonStockSharesOutstanding:{units:{shares:[
    {val:value,end:today,filed:today,form:"10-Q"}
  ]}}}}};
}

function annualFixtures({ includeShares = true } = {}) {
  const years = [
    {start:"2022-01-01",end:"2022-12-31",filed:"2023-02-15",revenue:500,cfo:110,capex:-10,netIncome:60,shares:100},
    {start:"2023-01-01",end:"2023-12-31",filed:"2024-02-15",revenue:550,cfo:122,capex:-11,netIncome:66,shares:98},
    {start:"2024-01-01",end:"2024-12-31",filed:"2025-02-15",revenue:600,cfo:130,capex:-12,netIncome:72,shares:96}
  ];
  const rows = [];
  for (const y of years) {
    rows.push(obs("revenue", y.revenue * 1e9, y.start, y.end, "10-K", "USD", y.filed));
    rows.push(obs("operatingCashFlow", y.cfo * 1e9, y.start, y.end, "10-K", "USD", y.filed));
    rows.push(obs("capex", y.capex * 1e9, y.start, y.end, "10-K", "USD", y.filed));
    rows.push(obs("netIncome", y.netIncome * 1e9, y.start, y.end, "10-K", "USD", y.filed));
    if (includeShares) rows.push(obs("dilutedShares", y.shares * 1e6, y.start, y.end, "10-K", "shares", y.filed));
  }
  return rows;
}

test("annualSeries keeps unambiguous annual values and sorts chronologically", () => {
  const app = loadAppFunctions();
  const series = app.annualSeries(annualFixtures(), "revenue");
  assert.equal(series.length, 3);
  assert.equal(series[0].end, "2022-12-31");
  assert.equal(series[2].value, 600e9);
});

test("annualSeries excludes conflicting same-period values", () => {
  const app = loadAppFunctions();
  const rows = annualFixtures();
  rows.push(obs("revenue", 610e9, "2024-01-01", "2024-12-31", "10-K", "USD", "2025-02-15"));
  const series = app.annualSeries(rows, "revenue");
  assert.equal(series.length, 2);
  assert.ok(!series.some(row => row.end === "2024-12-31"));
});

test("quarterlySeries selects three-month disclosures and matches the prior year", () => {
  const app = loadAppFunctions();
  const rows = [
    obs("revenue", 100, "2025-04-01", "2025-06-30", "10-Q", "USD", "2025-08-01"),
    obs("revenue", 120, "2026-04-01", "2026-06-30", "10-Q", "USD", "2026-08-01"),
    obs("revenue", 350, "2026-01-01", "2026-06-30", "10-Q", "USD", "2026-08-01")
  ];
  const series = app.quarterlySeries(rows, "revenue");
  assert.equal(series.length, 2);
  const current = series[1];
  const prior = app.matchingPriorYear(series, current);
  assert.equal(prior.value, 100);
  assert.ok(Math.abs((current.value / prior.value - 1) - 0.2) < 1e-9);
});

test("buildDcfEstimate uses recent shares outstanding and produces ordered scenarios", () => {
  const app = loadAppFunctions();
  const result = app.buildDcfEstimate(annualFixtures(), shareFacts());
  assert.equal(result.available, true);
  assert.equal(result.shares, 90e6);
  assert.equal(result.sharesFiled, new Date().toISOString().slice(0,10));
  assert.ok(result.bear > 0);
  assert.ok(result.bear < result.base);
  assert.ok(result.base < result.bull);
});

test("buildDcfEstimate rejects non-USD or mixed-unit annual valuation inputs", () => {
  const app=loadAppFunctions();
  const rows=annualFixtures();
  rows.find(row=>row.key==="operatingCashFlow"&&row.end==="2024-12-31").unit="EUR";
  const result=app.buildDcfEstimate(rows,shareFacts());
  assert.equal(result.available,false);
  assert.match(result.reason,/non-USD, mixed-unit/i);
});

test("valuation gap check flags extreme divergence without claiming either value is wrong", () => {
  const app=loadAppFunctions();
  const gap=app.assessQuoteValuationGap(530.30,145.56);
  assert.equal(gap.checked,true);
  assert.equal(gap.blocked,true);
  assert.ok(gap.ratio>3.6);
  assert.match(gap.reason,/does not prove either price is wrong/i);
  const ordinary=app.assessQuoteValuationGap(100,100);
  assert.equal(ordinary.blocked,false);
});


test("buildDcfEstimate refuses annual weighted-average shares without a recent shares-outstanding fact", () => {
  const app = loadAppFunctions();
  const result = app.buildDcfEstimate(annualFixtures(), {});
  assert.equal(result.available, false);
  assert.match(result.reason, /fact date and filing date are both within the last 180 days/i);
});

test("averageTrueRange refuses incomplete OHLC observations", () => {
  const app = loadAppFunctions();
  const rows = Array.from({length:16}, (_, i) => ({
    date: "2026-01-"+String(i+1).padStart(2,"0"),
    close: 100,
    high: 102,
    low: 98
  }));
  assert.equal(app.averageTrueRange({data:rows}), 4);
  rows[15].high = null;
  assert.equal(app.averageTrueRange({data:rows}), null);
});

function quarterlyFixtures() {
  const rows = [];
  const periods = [
    {start:"2025-04-01",end:"2025-06-30",filed:"2025-08-01",revenue:100,netIncome:10,eps:1.0},
    {start:"2026-04-01",end:"2026-06-30",filed:"2026-08-01",revenue:120,netIncome:20,eps:1.2}
  ];
  for (const q of periods) {
    rows.push(obs("revenue",q.revenue*1e9,q.start,q.end,"10-Q","USD",q.filed));
    rows.push(obs("netIncome",q.netIncome*1e9,q.start,q.end,"10-Q","USD",q.filed));
    rows.push(obs("dilutedEps",q.eps,q.start,q.end,"10-Q","USD/shares",q.filed));
  }
  return rows;
}

test("quarterly snapshot returns latest-quarter revenue growth and net income", () => {
  const app = loadAppFunctions();
  const quarter = app.renderQuarterlySnapshot(quarterlyFixtures());
  assert.equal(quarter.available, true);
  assert.equal(quarter.currentRevenue, 120e9);
  assert.equal(quarter.currentIncome, 20e9);
  assert.ok(Math.abs(quarter.revenueYoY - 0.2) < 1e-9);
  assert.equal(quarter.periodEnd, "2026-06-30");
});

test("decision panel refuses BUY when no whole share fits the planned-risk budget", () => {
  const app = loadAppFunctions();
  const observations = [...annualFixtures(), ...quarterlyFixtures()];
  const valuation = app.buildDcfEstimate(observations, shareFacts());
  assert.equal(valuation.available, true);
  const entry = valuation.base * 0.775;
  const historyRows = Array.from({length:16},(_,i)=>({
    date:"2026-01-"+String(i+1).padStart(2,"0"),
    close:entry, high:entry+2, low:entry-2
  }));
  const future = new Date(Date.now()+60*86400000).toISOString().slice(0,10);
  const elements = app.document;
  app.renderQuarterlySnapshot(observations);
  app.renderDecision({
    ticker:"TEST",
    observations,
    facts:shareFacts(),
    quote:{price:entry,quoteTime:new Date().toISOString(),source:"test"},
    history:{data:historyRows},
    news:{items:[{title:"Quarterly performance update",publishedAt:new Date().toISOString(),source:"test"}]},
    earnings:{provider:"test calendar",verified:true,events:[{reportDate:future,reportTime:"AMC",company:"Test Corp"}]},
    quarter:app.renderQuarterlySnapshot(observations)
  });
  const title=elements.getElementById("decision-title").textContent;
  assert.ok(title.startsWith("HOLD — NO NEW ENTRY TRIGGER"));
  assert.ok(elements.getElementById("decision-bottom-line").textContent.includes("no clear new-entry setup"));
  assert.ok(elements.getElementById("decision-next-step").textContent.includes("hold off on adding"));
  const renderedChecks=elements.getElementById("decision-checks").children.map(row=>row.children[1].children[0].textContent);
  for(const label of ["Growth screen","Profitability screen","Liquidity screen","Cash-flow screen","Event-risk screen"]) {
    assert.ok(renderedChecks.includes(label), "missing separate financial screen: "+label);
  }
});


test("earnings comparison uses SEC actuals and converts third-party revenue consensus from millions", () => {
  const app = loadAppFunctions();
  const payload = {
    ticker:"TEST", quarter:"Q3-2026", available:true, status:"reported",
    estimates:{consensusEps:1.1,consensusRevenue:110000,numAnalysts:12},
    headline:"Test results summary",
    whatItMeans:"Test context",
    sourceUrl:"https://example.com/earnings"
  };
  const quarter = {
    periodEnd:"2026-06-30", filed:"2026-08-01",
    currentRevenue:120000000000, currentIncome:20000000000,
    currentEps:1.2, fiscalQuarterId:"Q3-2026"
  };
  app.renderEarningsResult(payload,quarter,"Q3-2026");
  const root=app.document.getElementById("earnings-results-content");
  assert.equal(root.children[0].children[1].textContent,"$120.00B");
  assert.equal(root.children[3].children[1].textContent,"$110.00B");
  assert.ok(root.children[4].children[1].textContent.includes("9.09%"));
  assert.ok(root.children[6].children[1].textContent.includes("9.09%"));
  assert.ok(root.children.some(node=>node.children?.some(child=>String(child.textContent||"").includes("raw actual EPS/revenue"))));
  assert.ok(!root.children.some(node=>node.children?.some(child=>child.textContent==="Test results summary")));
});

test("earnings comparison does not invent consensus when the public brief is unavailable", () => {
  const app=loadAppFunctions();
  const payload={available:false,reason:"Provider access unavailable"};
  const quarter={periodEnd:"2026-06-30",filed:"2026-08-01",currentRevenue:120000000000,currentIncome:20000000000,currentEps:1.2};
  app.renderEarningsResult(payload,quarter,null);
  const root=app.document.getElementById("earnings-results-content");
  assert.equal(root.children.length,4);
  assert.ok(root.children[3].textContent.includes("Provider access unavailable"));
  assert.ok(!root.children.some(node=>node.children?.[0]?.textContent==="Revenue vs consensus"));
});


test("decision panel says AVOID when quarterly financials are available but fail quality checks", () => {
  const app=loadAppFunctions();
  const observations=[...annualFixtures(),...quarterlyFixtures()];
  const valuation=app.buildDcfEstimate(observations,shareFacts());
  const entry=valuation.base*0.775;
  const historyRows=Array.from({length:16},(_,i)=>({
    date:"2026-01-"+String(i+1).padStart(2,"0"),
    close:entry,high:entry+2,low:entry-2
  }));
  const future=new Date(Date.now()+60*86400000).toISOString().slice(0,10);
  app.renderDecision({
    ticker:"TEST",observations,facts:shareFacts(),
    quote:{price:entry,quoteTime:new Date().toISOString(),source:"test"},
    history:{data:historyRows},
    news:{items:[{title:"Quarterly performance update",publishedAt:new Date().toISOString(),source:"test"}]},
    earnings:{provider:"test calendar",verified:true,events:[{reportDate:future,reportTime:"AMC",company:"Test Corp"}]},
    quarter:{available:true,currentRevenue:120e9,currentIncome:-1e9,currentEps:1.2,revenueYoY:0.2,periodEnd:"2026-06-30",filed:"2026-08-01"}
  });
  assert.ok(app.document.getElementById("decision-title").textContent.startsWith("SELL REVIEW"));
});


test("earnings brief headline is only displayed when provider raw actuals are present", () => {
  const app=loadAppFunctions();
  const payload={
    available:true,status:"reported",quarter:"Q3-2026",
    estimates:{consensusEps:1.1,consensusRevenue:110000},
    actualEps:1.2,actualRevenue:120000,
    headline:"Provider headline",
    whatItMeans:"Provider interpretation",
    sourceUrl:"https://example.com/brief"
  };
  const quarter={periodEnd:"2026-06-30",filed:"2026-08-01",currentRevenue:120000000000,currentIncome:20000000000,currentEps:1.2};
  app.renderEarningsResult(payload,quarter,"Q3-2026");
  const root=app.document.getElementById("earnings-results-content");
  assert.ok(root.children.some(node=>node.children?.some(child=>String(child.textContent||"").includes("Provider headline"))));
});


test("daily-bar snapshot never passes the current-quote decision gate", () => {
  const app=loadAppFunctions();
  const observations=[...annualFixtures(),...quarterlyFixtures()];
  const valuation=app.buildDcfEstimate(observations,shareFacts());
  const entry=valuation.base*0.775;
  const historyRows=Array.from({length:16},(_,i)=>({
    date:"2026-01-"+String(i+1).padStart(2,"0"),
    close:entry,high:entry+2,low:entry-2
  }));
  const future=new Date(Date.now()+60*86400000).toISOString().slice(0,10);
  const quarter={available:true,currentRevenue:120e9,currentIncome:20e9,currentEps:1.2,revenueYoY:0.2,periodEnd:"2026-06-30",filed:"2026-08-01"};
  app.renderDecision({
    ticker:"TEST",observations,facts:{},
    quote:{price:entry,quoteTime:new Date().toISOString(),interval:"1d",delayedOrRealtime:"Daily interval; not real-time",source:"test"},
    history:{data:historyRows},
    news:{items:[{title:"Quarterly performance update",publishedAt:new Date().toISOString(),source:"test"}]},
    earnings:{provider:"test calendar",verified:true,events:[{reportDate:future,reportTime:"AMC",company:"Test Corp"}]},
    quarter
  });
  const title=app.document.getElementById("decision-title").textContent;
  assert.ok(title.startsWith("WAIT"));
  const checks=app.document.getElementById("decision-checks").children;
  assert.ok(checks.some(row=>row.children.some(child=>
    child.children?.some(nested=>nested.textContent?.includes("daily-bar snapshot"))
  )));
});


test("date-only quote labels do not imply a precise trade timestamp", () => {
  const app=loadAppFunctions();
  app.renderQuote({
    ticker:"TEST",price:100,currency:"USD",changePercent:1,
    marketState:"Closed",quoteTime:null,quoteLabel:"Oct 27, 2026",
    fetchedAt:"2026-10-28T07:00:00.000Z",source:"Nasdaq quote API",
    delayedOrRealtime:"Latest available quote; may be delayed"
  });
  const label=app.document.getElementById("quote-time").textContent;
  assert.ok(label.includes("Provider quote date: Oct 27, 2026"));
  assert.ok(label.includes("time not supplied"));
  assert.ok(!label.includes("Quote timestamp:"));
});


test("buildDcfEstimate refuses mismatched annual revenue and free-cash-flow periods", () => {
  const app=loadAppFunctions();
  const rows=annualFixtures().filter(row=>!(row.key==="revenue"&&row.end==="2023-12-31"));
  const result=app.buildDcfEstimate(rows,{});
  assert.equal(result.available,false);
  assert.match(result.reason,/each of the latest three annual free-cash-flow periods must match/i);
});


test("screen CSV preserves component evidence, timestamps, exclusions, and escapes cells", () => {
  const app=loadAppFunctions();
  const csv=app.buildScreenCsv([{
    ticker:"AAPL",name:'Apple, Inc.',score:80,financialPeriod:"2025-09-27",
    historyPeriod:"2025-10-28 to 2026-10-27",source:"Nasdaq historical API",
    components:[{name:'Revenue "growth"',value:12.5,display:"12.5%",score:15,max:25}]
  }],["BAD: Missing matched-period data"],"2026-10-28T12:00:00.000Z");
  assert.match(csv,/generated_at_utc,ticker,company,rank,research_score/);
  assert.match(csv,/"Apple, Inc\."/);
  assert.match(csv,/"Revenue ""growth"""/);
  assert.match(csv,/2026-10-28T12:00:00\.000Z/);
  assert.match(csv,/qualified/);
  assert.match(csv,/excluded/);
  assert.match(csv,/Missing matched-period data/);
  assert.match(csv,/not a validated investment signal/i);
});

test("decision panel withholds valuation targets when quote and model value are implausibly far apart", () => {
  const app=loadAppFunctions();
  const observations=[...annualFixtures(),...quarterlyFixtures()];
  const valuation=app.buildDcfEstimate(observations,shareFacts());
  assert.equal(valuation.available,true);
  const price=valuation.base*3;
  const historyRows=Array.from({length:16},(_,i)=>({date:"2026-01-"+String(i+1).padStart(2,"0"),close:price,high:price+2,low:price-2}));
  const future=new Date(Date.now()+60*86400000).toISOString().slice(0,10);
  app.renderDecision({
    ticker:"TEST",observations,facts:shareFacts(),quote:{price,quoteTime:new Date().toISOString(),source:"test"},
    history:{data:historyRows},news:{items:[{title:"Quarterly performance update",publishedAt:new Date().toISOString(),source:"test"}]},
    earnings:{provider:"test calendar",verified:true,events:[{reportDate:future,reportTime:"AMC",company:"Test Corp"}]},
    quarter:{available:true,currentRevenue:120e9,currentIncome:20e9,currentEps:1.2,revenueYoY:0.2,periodEnd:"2026-06-30",filed:"2026-08-01"}
  });
  assert.ok(app.document.getElementById("decision-title").textContent.startsWith("WAIT"));
  assert.ok(app.document.getElementById("decision-explanation").textContent.includes("Valuation withheld"));
  assert.ok(app.document.getElementById("decision-metrics").children.some(card=>card.children[0].textContent==="Illustrative DCF base case"));
  assert.ok(app.document.getElementById("decision-metrics").children.some(card=>card.children[0].textContent==="Entry / exit levels" && card.children[1].textContent==="WITHHELD"));
  const labels=app.document.getElementById("decision-metrics").children.map(card=>card.children[0].textContent);
  assert.ok(!labels.includes("Illustrative entry watch zone"));
  assert.ok(!labels.includes("Risk reference"));
});

test("quote label without machine-readable timestamp cannot satisfy current-price gate", () => {
  const app=loadAppFunctions();
  const observations=[...annualFixtures(),...quarterlyFixtures()];
  const valuation=app.buildDcfEstimate(observations,shareFacts());
  const entry=valuation.base*0.775;
  const historyRows=Array.from({length:16},(_,i)=>({
    date:"2026-01-"+String(i+1).padStart(2,"0"),
    close:entry,high:entry+2,low:entry-2
  }));
  const future=new Date(Date.now()+60*86400000).toISOString().slice(0,10);
  app.renderDecision({
    ticker:"TEST",observations,facts:shareFacts(),
    quote:{price:entry,quoteTime:null,quoteLabel:"Oct 27, 2026 4:00 PM ET",source:"test"},
    history:{data:historyRows},
    news:{items:[{title:"Quarterly performance update",publishedAt:new Date().toISOString(),source:"test"}]},
    earnings:{provider:"test calendar",verified:true,events:[{reportDate:future,reportTime:"AMC",company:"Test Corp"}]},
    quarter:{available:true,currentRevenue:120e9,currentIncome:20e9,currentEps:1.2,revenueYoY:0.2,periodEnd:"2026-06-30",filed:"2026-08-01"}
  });
  const currentPriceCheck=app.document.getElementById("decision-checks").children.find(row=>
    row.children.some(child=>child.children?.some(nested=>nested.textContent==="Current price"))
  );
  assert.ok(currentPriceCheck);
  assert.equal(currentPriceCheck.children[0].textContent,"REVIEW");
  assert.ok(currentPriceCheck.children[1].children[1].textContent.includes("missing a usable date/time"));
});

test("money formatter uses compact whole-unit K/M values and preserves negative signs", () => {
  const app=loadAppFunctions();
  assert.equal(app.fmtMoney(729000), "$729K");
  assert.equal(app.fmtMoney(18740000), "$19M");
  assert.equal(app.fmtMoney(-670000), "-$670K");
  assert.equal(app.fmtMoney(-0.15,{compact:false,decimals:2}), "-$0.15");
  assert.equal(app.fmtMoney(Number.NaN), "Not reported");
});

test("company name cleanup title-cases uppercase SEC names and removes duplicate terminal periods", () => {
  const app=loadAppFunctions();
  assert.equal(app.titleCaseCompanyName("ACME TECHNOLOGIES INC.."), "Acme Technologies Inc.");
  assert.equal(app.titleCaseCompanyName("MICROSOFT CORP."), "Microsoft Corp.");
  assert.equal(app.titleCaseCompanyName("NVIDIA CORPORATION"), "Nvidia Corporation");
  assert.equal(app.titleCaseCompanyName("Apple Inc."), "Apple Inc.");
});

test("history API falls back to Nasdaq after Yahoo HTTP 429 and returns an explicit quality scan", async () => {
  const historySource=readFileSync(new URL("../web/functions/api/history.js",import.meta.url),"utf8")
    .replace("export async function onRequestGet","async function onRequestGet")+"\nglobalThis.__historyHandler=onRequestGet;";
  const calls=[];
  const rows=Array.from({length:40},(_,i)=>{
    const date=new Date(Date.UTC(2026,0,1+i));
    return {date:(date.getUTCMonth()+1)+"/"+date.getUTCDate()+"/"+date.getUTCFullYear(),
      close:String(100+i),open:String(99.5+i),high:String(101+i),low:String(99+i),volume:"1000000"};
  });
  const context={URL,Response,Date,Math,Number,String,Array,Object,JSON,AbortSignal,
    fetch:async url=>{
      calls.push(String(url));
      if(String(url).includes("finance.yahoo.com")) return {ok:false,status:429,json:async()=>({})};
      return {ok:true,status:200,json:async()=>({data:{symbol:"TEST",tradesTable:{rows}}})};
    }};
  runInNewContext(historySource,context,{filename:"web/functions/api/history.js"});
  const response=await context.__historyHandler({request:new Request("https://example.test/api/history?ticker=TEST")});
  const payload=await response.json();
  assert.equal(response.status,200);
  assert.equal(payload.source,"Nasdaq historical API");
  assert.equal(payload.observations,40);
  assert.equal(payload.dataQuality.status,"NO_RULE_TRIGGERED");
  assert.equal(calls.filter(url=>url.includes("finance.yahoo.com")).length,2);
  assert.ok(calls.some(url=>url.includes("api.nasdaq.com")));
});

test("history API rejects malformed tickers before calling providers", async () => {
  const historySource=readFileSync(new URL("../web/functions/api/history.js",import.meta.url),"utf8")
    .replace("export async function onRequestGet","async function onRequestGet")+"\nglobalThis.__historyHandler=onRequestGet;";
  let called=false;
  const context={URL,Response,Date,Math,Number,String,Array,Object,JSON,AbortSignal,
    fetch:async()=>{called=true;throw new Error("Provider must not be called");}};
  runInNewContext(historySource,context,{filename:"web/functions/api/history.js"});
  const response=await context.__historyHandler({request:new Request("https://example.test/api/history?ticker=!!!")});
  assert.equal(response.status,400);
  assert.equal(called,false);
});

test("snapshot CSV cell escaping quotes commas and structured rule results", () => {
  const app=loadAppFunctions();
  assert.equal(app.csvCell('A "quote", and comma'), '"A ""quote"", and comma"');
  assert.equal(app.csvCell({label:"Growth",passed:false}), '"{""label"":""Growth"",""passed"":false}"');
  assert.equal(app.csvCell(null), '""');
});

