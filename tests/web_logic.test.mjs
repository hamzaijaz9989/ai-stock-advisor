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
  assert.equal(current.value / prior.value - 1, 0.2);
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
