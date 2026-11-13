import { chromium } from "playwright";
import fs from "node:fs/promises";
import path from "node:path";

const url = process.env.NORTHSTAR_URL || "https://ai-stock-advisor.pages.dev/research.html";
const scanStartedAt = Date.now();
const browser = await chromium.launch({ headless: true });
try {
  const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
  page.setDefaultTimeout(30000);
  await page.goto(url, { waitUntil: "domcontentloaded", timeout: 90000 });
  await page.locator("#ranking-disclosure").evaluate(el => { el.open = true; });
  await page.locator("#run-live-screen").evaluate(button => button.click());
  await page.waitForFunction(() => {
    const status = document.querySelector("#screen-status")?.textContent || "";
    const completed = /^(\d+) ranked · (\d+) excluded from 200$/.exec(status.trim());
    if (!completed) return false;
    const ranked = Number(completed[1]);
    const expected = Math.min(25, ranked);
    const cards = [...document.querySelectorAll("#screen-results .screen-card:not(.screen-best-pick)")];
    const plans = cards.slice(0, expected).map(card => card.querySelector(".candidate-plan"));
    return ranked > 0 &&
      cards.length >= expected &&
      plans.length === expected &&
      plans.every(plan =>
        plan &&
        (plan.dataset.ready === "true" || plan.dataset.ready === "false") &&
        !/Checking latest quote and valuation inputs/i.test(plan.querySelector("p")?.textContent || "")
      );
  }, null, { timeout: 12 * 60 * 1000 });
  const scanStatus = await page.locator("#screen-status").textContent();
  const completed = /^(\d+) ranked · (\d+) excluded from 200$/.exec((scanStatus || "").trim());
  if (!completed) throw new Error("The 253-symbol scan did not finish cleanly; preserving the previous cache. Status: " + (scanStatus || "unavailable"));
  const rankedCount = Number(completed[1]);
  const excludedCount = Number(completed[2]);
  if (rankedCount + excludedCount !== 200) throw new Error("Universe accounting mismatch: " + rankedCount + " ranked + " + excludedCount + " excluded. Preserving previous cache.");

  const result = await page.evaluate(() => {
    const cards = [...document.querySelectorAll("#screen-results .screen-card:not(.screen-best-pick)")].slice(0,25).map(card => {
      const title = card.querySelector(".screen-card-header strong")?.textContent || "";
      const match = title.match(/^\d+\.\s+([A-Z0-9.^=-]+)\s+·\s+(.*)$/);
      const scoreText = card.querySelector(".screen-score")?.textContent || "";
      const score = Number.parseFloat(scoreText);
      const components = [...card.querySelectorAll(".screen-component")].map(cell => ({
        name: cell.querySelector("span")?.textContent || "",
        display: cell.querySelector("strong")?.textContent || ""
      }));
      const period = card.querySelector(".screen-card-header .muted")?.textContent || "";
      const plan = card.querySelector(".candidate-plan");
      const entryStatus = plan?.querySelector("p")?.textContent || "Entry eligibility not verified in cache.";
      const entryReady = plan?.dataset.ready === "true";
      const financialPeriod = (period.match(/Annual financial period:\s*([^·]+)/)||[])[1]?.trim() || null;
      const periodTime = financialPeriod ? Date.parse(financialPeriod + "T00:00:00Z") : NaN;
      const ageDays = Number.isFinite(periodTime) ? Math.floor((Date.now() - periodTime) / 86400000) : null;
      const fundamentalsFresh = ageDays !== null && ageDays >= 0 && ageDays <= 548;
      return {
        ticker: match?.[1] || "",
        name: match?.[2] || title,
        score: Number.isFinite(score) ? score : null,
        financialPeriod,
        fundamentalAgeDays: ageDays,
        fundamentalFreshness: fundamentalsFresh ? "CURRENT_WITHIN_18_MONTHS" : "STALE_OR_UNVERIFIED",
        historyPeriod: (period.match(/Price data:\s*([^·]+)/)||[])[1]?.trim() || null,
        components,
        entryReady: fundamentalsFresh && entryReady,
        entryStatus: fundamentalsFresh ? entryStatus : "BLOCKED: annual fundamentals are stale or unverified; refresh and reconcile the latest reported period before any entry decision."
      };
    }).filter(x => x.ticker);
    return {
      schemaVersion: 1,
      generatedAt: new Date().toISOString(),
      refreshIntervalHours: 3,
      source: "Northstar AI scheduled live 200-stock screen",
      fundamentalFreshnessPolicy: { maxAnnualPeriodAgeDays: 548, staleOrUnknownEntryBlocked: true },
      universeSize: 200,
      rankedCount: Number((document.querySelector("#screen-status")?.textContent || "").match(/^(\d+) ranked/)?.[1]) || cards.length,
      excludedCount: Number((document.querySelector("#screen-status")?.textContent || "").match(/· (\d+) excluded/)?.[1]) || null,
      status: cards.length ? "success" : "no_qualified_candidates",
      stocks: cards,
      note: "Research-priority ranking only; not a validated BUY signal. Verify live data in full analysis."
    };
  });
  if (!result.stocks.length) throw new Error("Screen completed but no stock cards could be extracted; refusing to overwrite the previous cache.");
  if (result.rankedCount !== rankedCount || result.excludedCount !== excludedCount) throw new Error("Cached result counts do not match the completed scan status; refusing to overwrite the previous cache.");
  if (result.stocks.length !== Math.min(25, rankedCount)) throw new Error("Expected " + Math.min(25, rankedCount) + " shortlist cards but extracted " + result.stocks.length + "; refusing to overwrite the previous cache.");
  if (result.stocks.length > 25) throw new Error("Shortlist exceeded the 25-candidate cache limit; refusing to overwrite the previous cache.");
  if (result.stocks.some(stock => typeof stock.entryReady !== "boolean" || !stock.entryStatus || /Checking latest quote and valuation inputs/i.test(stock.entryStatus))) {
    throw new Error("At least one cached candidate has incomplete enrichment; preserving the previous cache.");
  }
  result.generatedAt = new Date().toISOString();
  result.completedAt = result.generatedAt;
  result.workflowRunId = process.env.GITHUB_RUN_ID || null;
  result.sourceCommit = process.env.GITHUB_SHA || null;
  result.scanDurationSeconds = Math.max(0, Math.round((Date.now() - scanStartedAt) / 1000));
  result.enrichedCount = result.stocks.length;
  const target = path.resolve("web/data/top-stocks-cache.json");
  await fs.mkdir(path.dirname(target), { recursive: true });
  await fs.writeFile(target, JSON.stringify(result, null, 2) + "\n");
  console.log("Saved cached shortlist:", result.stocks.map(x => x.ticker).join(", "));
} finally {
  await browser.close();
}
