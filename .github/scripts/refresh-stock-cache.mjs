import { chromium } from "playwright";
import fs from "node:fs/promises";
import path from "node:path";

const url = process.env.NORTHSTAR_URL || "https://ai-stock-advisor.pages.dev";
const browser = await chromium.launch({ headless: true });
try {
  const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
  page.setDefaultTimeout(30000);
  await page.goto(url, { waitUntil: "domcontentloaded", timeout: 90000 });
  await page.locator("#ranking-disclosure").evaluate(el => { el.open = true; });
  await page.locator("#run-live-screen").evaluate(button => button.click());
  await page.waitForFunction(() => {
    const status = document.querySelector("#screen-status")?.textContent || "";
    const cards = document.querySelectorAll("#screen-results .screen-card").length;
    return /\d+ ranked|Screen interrupted/i.test(status) && (cards > 0 || /interrupted/i.test(status));
  }, null, { timeout: 12 * 60 * 1000 });
  const result = await page.evaluate(() => {
    const cards = [...document.querySelectorAll("#screen-results .screen-card")].slice(0,10).map(card => {
      const title = card.querySelector(".screen-card-header strong")?.textContent || "";
      const match = title.match(/^\d+\.\s+([A-Z0-9.^=-]+)\s+·\s+(.*)$/);
      const scoreText = card.querySelector(".screen-score")?.textContent || "";
      const score = Number.parseFloat(scoreText);
      const components = [...card.querySelectorAll(".screen-component")].map(cell => ({
        name: cell.querySelector("span")?.textContent || "",
        display: cell.querySelector("strong")?.textContent || ""
      }));
      const period = card.querySelector(".screen-card-header .muted")?.textContent || "";
      const entryStatus = card.querySelector(".candidate-plan p")?.textContent || "Entry eligibility not verified in cache.";
      return {
        ticker: match?.[1] || "",
        name: match?.[2] || title,
        score: Number.isFinite(score) ? score : null,
        financialPeriod: (period.match(/Annual financial period:\s*([^·]+)/)||[])[1]?.trim() || null,
        historyPeriod: (period.match(/Price data:\s*([^·]+)/)||[])[1]?.trim() || null,
        components,
        entryStatus
      };
    }).filter(x => x.ticker);
    return {
      schemaVersion: 1,
      generatedAt: new Date().toISOString(),
      refreshIntervalHours: 3,
      source: "Northstar AI scheduled live 253-stock screen",
      universeSize: 253,
      rankedCount: Number((document.querySelector("#screen-status")?.textContent || "").match(/^(\d+) ranked/)?.[1]) || cards.length,
      excludedCount: Number((document.querySelector("#screen-status")?.textContent || "").match(/· (\d+) excluded/)?.[1]) || null,
      status: cards.length ? "success" : "no_qualified_candidates",
      stocks: cards,
      note: "Research-priority ranking only; not a validated BUY signal. Verify live data in full analysis."
    };
  });
  if (!result.stocks.length) throw new Error("Screen completed but no stock cards could be extracted; refusing to overwrite the previous cache.");
  const target = path.resolve("web/data/top-stocks-cache.json");
  await fs.mkdir(path.dirname(target), { recursive: true });
  await fs.writeFile(target, JSON.stringify(result, null, 2) + "\n");
  console.log("Saved cached shortlist:", result.stocks.map(x => x.ticker).join(", "));
} finally {
  await browser.close();
}
