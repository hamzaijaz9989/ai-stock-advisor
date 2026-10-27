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

test("buildDcfEstimate uses matched-period diluted shares and produces ordered scenarios", () => {
  const app = loadAppFunctions();
  const result = app.buildDcfEstimate(annualFixtures(), {});
  assert.equal(result.available, true);
  assert.equal(result.shares, 96e6);
  assert.equal(result.sharesFiled, "2025-02-15");
  assert.ok(result.bear > 0);
  assert.ok(result.bear < result.base);
  assert.ok(result.base < result.bull);
});

test("buildDcfEstimate refuses to value when share count is missing or stale", () => {
  const app = loadAppFunctions();
  const result = app.buildDcfEstimate(annualFixtures({includeShares:false}), {});
  assert.equal(result.available, false);
  assert.match(result.reason, /share count/i);
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

test("decision panel never issues BUY even when every preliminary check passes", () => {
  const app = loadAppFunctions();
  const observations = [...annualFixtures(), ...quarterlyFixtures()];
  const valuation = app.buildDcfEstimate(observations, {});
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
    facts:{},
    quote:{price:entry,quoteTime:new Date().toISOString(),source:"test"},
    history:{data:historyRows},
    news:{items:[{title:"Quarterly performance update",publishedAt:new Date().toISOString(),source:"test"}]},
    earnings:{provider:"test calendar",verified:true,events:[{reportDate:future,reportTime:"AMC",company:"Test Corp"}]},
    quarter:app.renderQuarterlySnapshot(observations)
  });
  const title=elements.getElementById("decision-title").textContent;
  assert.ok(title.startsWith("WAIT") || title.startsWith("INSUFFICIENT EVIDENCE"));
  assert.ok(!title.startsWith("BUY"));
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
  const valuation=app.buildDcfEstimate(observations,{});
  const entry=valuation.base*0.775;
  const historyRows=Array.from({length:16},(_,i)=>({
    date:"2026-01-"+String(i+1).padStart(2,"0"),
    close:entry,high:entry+2,low:entry-2
  }));
  const future=new Date(Date.now()+60*86400000).toISOString().slice(0,10);
  app.renderDecision({
    ticker:"TEST",observations,facts:{},
    quote:{price:entry,quoteTime:new Date().toISOString(),source:"test"},
    history:{data:historyRows},
    news:{items:[{title:"Quarterly performance update",publishedAt:new Date().toISOString(),source:"test"}]},
    earnings:{provider:"test calendar",verified:true,events:[{reportDate:future,reportTime:"AMC",company:"Test Corp"}]},
    quarter:{available:true,currentRevenue:120e9,currentIncome:-1e9,currentEps:1.2,revenueYoY:0.2,periodEnd:"2026-06-30",filed:"2026-08-01"}
  });
  assert.ok(app.document.getElementById("decision-title").textContent.startsWith("AVOID"));
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
  const valuation=app.buildDcfEstimate(observations,{});
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
  assert.ok(title.startsWith("INSUFFICIENT EVIDENCE"));
  const checks=app.document.getElementById("decision-checks").children;
  assert.ok(checks.some(row=>row.children.some(child=>child.textContent?.includes("daily-bar snapshot"))));
});
