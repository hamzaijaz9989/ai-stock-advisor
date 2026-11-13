import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

export function validateStockCache(data, nowMs = Date.now(), maxAgeMs = 30 * 60 * 1000) {
  const errors = [];
  const generated = Date.parse(data?.generatedAt || "");
  const completed = Date.parse(data?.completedAt || "");
  if (data?.schemaVersion !== 1) errors.push("schemaVersion must equal 1");
  if (data?.status !== "success") errors.push("status must equal success");
  if (data?.universeSize !== 200) errors.push("universeSize must equal 200");
  if (!Number.isFinite(generated)) errors.push("generatedAt must be a valid timestamp");
  else if (generated > nowMs + 5 * 60 * 1000 || nowMs - generated > maxAgeMs) errors.push("generatedAt is outside the allowed freshness window");
  if (!Number.isFinite(completed) || completed !== generated) errors.push("completedAt must match generatedAt");
  if (!Number.isInteger(data?.rankedCount) || data.rankedCount < 1) errors.push("rankedCount must be a positive integer");
  if (!Number.isInteger(data?.excludedCount) || data.excludedCount < 0) errors.push("excludedCount must be a non-negative integer");
  if (Number.isInteger(data?.rankedCount) && Number.isInteger(data?.excludedCount) && data.rankedCount + data.excludedCount !== 253) {
    errors.push("rankedCount + excludedCount must equal 253");
  }
  if (!Array.isArray(data?.stocks)) errors.push("stocks must be an array");
  const stocks = Array.isArray(data?.stocks) ? data.stocks : [];
  const expectedCount = Number.isInteger(data?.rankedCount) ? Math.min(10, data.rankedCount) : -1;
  if (stocks.length !== expectedCount) errors.push("stocks length must equal min(25, rankedCount)");
  if (data?.enrichedCount !== stocks.length) errors.push("enrichedCount must equal stocks length");
  if (typeof data?.workflowRunId !== "string" || !data.workflowRunId) errors.push("workflowRunId is required");
  if (typeof data?.sourceCommit !== "string" || !/^[a-f0-9]{40}$/i.test(data.sourceCommit)) errors.push("sourceCommit must be a Git commit SHA");
  if (!Number.isFinite(data?.scanDurationSeconds) || data.scanDurationSeconds < 0) errors.push("scanDurationSeconds must be non-negative");
  const seen = new Set();
  for (const [index, stock] of stocks.entries()) {
    const ticker = String(stock?.ticker || "").trim().toUpperCase();
    if (!/^[A-Z][A-Z0-9.^=-]{0,11}$/.test(ticker)) errors.push("stock " + index + " has an invalid ticker");
    if (seen.has(ticker)) errors.push("duplicate ticker: " + ticker);
    seen.add(ticker);
    if (typeof stock?.name !== "string" || !stock.name.trim()) errors.push("stock " + ticker + " has no company name");
    if (!Number.isFinite(stock?.score) || stock.score < 0 || stock.score > 100) errors.push("stock " + ticker + " has an invalid score");
    if (typeof stock?.entryReady !== "boolean") errors.push("stock " + ticker + " has no completed entryReady result");
    if (typeof stock?.entryStatus !== "string" || !stock.entryStatus.trim() || /Checking latest quote and valuation inputs/i.test(stock.entryStatus)) {
      errors.push("stock " + ticker + " has incomplete enrichment status");
    }
    if (stock?.fundamentalFreshness === "STALE_OR_UNVERIFIED" && !/^BLOCKED:/i.test(stock.entryStatus || "")) {
      errors.push("stock " + ticker + " has stale fundamentals without an explicit blocked status");
    }
    if (stock?.fundamentalFreshness === "STALE_OR_UNVERIFIED" && stock?.entryReady === true) {
      errors.push("stock " + ticker + " cannot be entry-ready while fundamentals are stale or unverified");
    }
  }
  return {
    ok: errors.length === 0,
    errors,
    summary: {
      generatedAt: data?.generatedAt || null,
      universeSize: data?.universeSize ?? null,
      rankedCount: data?.rankedCount ?? null,
      excludedCount: data?.excludedCount ?? null,
      enrichedCount: data?.enrichedCount ?? null,
      topTickers: stocks.map(stock => stock.ticker)
    }
  };
}

const isMain = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) {
  const target = path.resolve(process.argv[2] || "web/data/top-stocks-cache.json");
  const data = JSON.parse(await fs.readFile(target, "utf8"));
  const result = validateStockCache(data);
  console.log(JSON.stringify(result.summary, null, 2));
  if (!result.ok) {
    for (const error of result.errors) console.error("ERROR:", error);
    process.exitCode = 1;
  } else {
    console.log("Stock cache validation passed.");
  }
}
