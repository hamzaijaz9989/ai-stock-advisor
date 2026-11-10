import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const DEFAULT_CONFIG = resolve(ROOT, "web/wrangler.toml");
const DEFAULT_PROJECT = "ai-stock-advisor";

function section(text, heading) {
  const start = text.indexOf(heading);
  if (start < 0) throw new Error("Missing Wrangler D1 section: " + heading);
  const bodyStart = start + heading.length;
  const next = text.indexOf("\n[[", bodyStart);
  return text.slice(bodyStart, next < 0 ? undefined : next);
}

function value(text, key) {
  return text.match(new RegExp("^\\s*" + key + "\\s*=\\s*\"([^\"]+)\"", "m"))?.[1] ?? null;
}

export function parsePagesD1Bindings(configText) {
  const base = section(configText, "[[d1_databases]]");
  const preview = section(configText, "[[env.preview.d1_databases]]");
  const production = section(configText, "[[env.production.d1_databases]]");
  const result = {
    base: { binding: value(base, "binding"), databaseName: value(base, "database_name"), databaseId: value(base, "database_id") },
    preview: { binding: value(preview, "binding"), databaseName: value(preview, "database_name"), databaseId: value(preview, "database_id") },
    production: { binding: value(production, "binding"), databaseName: value(production, "database_name"), databaseId: value(production, "database_id") }
  };
  for (const [environment, binding] of Object.entries(result)) {
    if (binding.binding !== "NORTHSTAR_DB" || !binding.databaseId) {
      throw new Error("Invalid NORTHSTAR_DB binding in Wrangler " + environment + " configuration.");
    }
  }
  if (result.preview.databaseId === result.production.databaseId) {
    throw new Error("Wrangler Preview and Production D1 database IDs must differ.");
  }
  return result;
}

export async function verifyCloudflarePagesD1Isolation({
  accountId,
  apiToken,
  projectName = DEFAULT_PROJECT,
  configText,
  fetcher = fetch
} = {}) {
  if (!accountId || !apiToken) {
    throw new Error("CLOUDFLARE_ACCOUNT_ID and CLOUDFLARE_API_TOKEN are required.");
  }
  const source = configText ?? await readFile(DEFAULT_CONFIG, "utf8");
  const expected = parsePagesD1Bindings(source);
  const endpoint = "https://api.cloudflare.com/client/v4/accounts/" +
    encodeURIComponent(accountId) + "/pages/projects/" + encodeURIComponent(projectName);
  let response;
  try {
    response = await fetcher(endpoint, {
      method: "GET",
      headers: { Authorization: "Bearer " + apiToken, Accept: "application/json" },
      signal: AbortSignal.timeout(12000)
    });
  } catch {
    throw new Error("Cloudflare Pages project read failed (network error).");
  }
  let payload;
  try {
    payload = await response.json();
  } catch {
    throw new Error("Cloudflare Pages project read failed (HTTP " + response.status + "; invalid JSON).");
  }
  if (!response.ok || payload?.success !== true) {
    throw new Error("Cloudflare Pages project read failed (HTTP " + response.status + ").");
  }
  const configs = payload.result?.deployment_configs;
  const preview = configs?.preview;
  const production = configs?.production;
  const previewId = preview?.d1_databases?.NORTHSTAR_DB?.id;
  const productionId = production?.d1_databases?.NORTHSTAR_DB?.id;
  if (previewId !== expected.preview.databaseId) {
    throw new Error("Live Preview NORTHSTAR_DB binding does not match web/wrangler.toml.");
  }
  if (productionId !== expected.production.databaseId) {
    throw new Error("Live Production NORTHSTAR_DB binding does not match web/wrangler.toml.");
  }
  if (previewId === productionId) {
    throw new Error("Live Preview and Production NORTHSTAR_DB bindings must be isolated.");
  }
  if (preview?.fail_open !== false || production?.fail_open !== false) {
    throw new Error("Live Preview and Production must both keep fail_open=false.");
  }
  return {
    projectName,
    previewDatabaseId: previewId,
    productionDatabaseId: productionId,
    previewIsolated: true,
    failOpen: false
  };
}

const invokedPath = process.argv[1] ? resolve(process.argv[1]) : null;
if (invokedPath === fileURLToPath(import.meta.url)) {
  try {
    const result = await verifyCloudflarePagesD1Isolation({
      accountId: process.env.CLOUDFLARE_ACCOUNT_ID,
      apiToken: process.env.CLOUDFLARE_API_TOKEN,
      projectName: process.env.CLOUDFLARE_PAGES_PROJECT || DEFAULT_PROJECT
    });
    console.log(JSON.stringify(result));
  } catch (error) {
    console.error(error?.message || "Cloudflare Pages binding verification failed.");
    process.exitCode = 1;
  }
}
