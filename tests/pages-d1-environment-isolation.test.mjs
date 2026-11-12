import test from "node:test";
import {parsePagesD1Bindings, verifyCloudflarePagesD1Isolation} from "../scripts/verify_pages_d1_isolation.mjs";
import assert from "node:assert/strict";
import {readFile} from "node:fs/promises";

const config = await readFile(new URL("../web/wrangler.toml", import.meta.url), "utf8");

function section(start, end) {
  const from = config.indexOf(start);
  if (from < 0) return "";
  const contentStart = from + start.length;
  const to = end ? config.indexOf(end, contentStart) : config.length;
  return config.slice(contentStart, to < 0 ? config.length : to);
}

function value(content, key) {
  const match = content.match(new RegExp("^" + key + " = \"([^\"]+)\"", "m"));
  return match?.[1] ?? null;
}

test("Pages Preview uses its isolated D1 database while production remains unchanged", () => {
  const base = section("[[d1_databases]]", "[[env.preview.d1_databases]]");
  const preview = section("[[env.preview.d1_databases]]", "[[env.production.d1_databases]]");
  const production = section("[[env.production.d1_databases]]", null);

  assert.ok(base, "default D1 binding must remain declared");
  assert.ok(preview, "Preview environment D1 override must be declared");
  assert.ok(production, "Production environment D1 override must be declared");

  for (const binding of [base, preview, production]) {
    assert.equal(value(binding, "binding"), "NORTHSTAR_DB");
    assert.equal(value(binding, "migrations_dir"), "migrations");
  }

  assert.equal(value(base, "database_id"), "528f3a23-1d1f-4d16-8463-f643d85f5deb");
  assert.equal(value(production, "database_name"), "northstar-paper-ledger");
  assert.equal(value(production, "database_id"), "528f3a23-1d1f-4d16-8463-f643d85f5deb");
  assert.equal(value(preview, "database_name"), "northstar-preview");
  assert.equal(value(preview, "database_id"), "bdffc29f-a4f6-498e-ade7-22c85d9bd373");
  assert.notEqual(value(preview, "database_id"), value(production, "database_id"),
    "Preview must never point to the production D1 database");
});



test("live Pages verifier accepts matching isolated D1 bindings using a read-only request", async () => {
  const expected = parsePagesD1Bindings(config);
  let request;
  const response = await verifyCloudflarePagesD1Isolation({
    accountId: "account-test",
    apiToken: "never-log-this-token",
    configText: config,
    fetcher: async (url, options) => {
      request = {url, options};
      return Response.json({success: true, result: {deployment_configs: {
        preview: {d1_databases: {NORTHSTAR_DB: {id: expected.preview.databaseId}}, fail_open: false},
        production: {d1_databases: {NORTHSTAR_DB: {id: expected.production.databaseId}}, fail_open: false}
      }}});
    }
  });
  assert.equal(request.options.method, "GET");
  assert.match(request.options.headers.Authorization, /^Bearer /);
  assert.equal(response.previewIsolated, true);
  assert.equal(response.failOpen, false);
  assert.doesNotMatch(JSON.stringify(response), /never-log-this-token/);
});

test("live Pages verifier fails closed when Preview drifts to the Production D1 database", async () => {
  const expected = parsePagesD1Bindings(config);
  await assert.rejects(() => verifyCloudflarePagesD1Isolation({
    accountId: "account-test",
    apiToken: "test-token",
    configText: config,
    fetcher: async () => Response.json({success: true, result: {deployment_configs: {
      preview: {d1_databases: {NORTHSTAR_DB: {id: expected.production.databaseId}}, fail_open: false},
      production: {d1_databases: {NORTHSTAR_DB: {id: expected.production.databaseId}}, fail_open: false}
    }}})
  }), /Live Preview NORTHSTAR_DB binding does not match/);
});

test("live Pages verifier fails closed if either environment enables fail_open", async () => {
  const expected = parsePagesD1Bindings(config);
  await assert.rejects(() => verifyCloudflarePagesD1Isolation({
    accountId: "account-test",
    apiToken: "test-token",
    configText: config,
    fetcher: async () => Response.json({success: true, result: {deployment_configs: {
      preview: {d1_databases: {NORTHSTAR_DB: {id: expected.preview.databaseId}}, fail_open: true},
      production: {d1_databases: {NORTHSTAR_DB: {id: expected.production.databaseId}}, fail_open: false}
    }}})
  }), /fail_open=false/);
});

test("live Pages verifier requires credentials before making a request", async () => {
  let called = false;
  await assert.rejects(() => verifyCloudflarePagesD1Isolation({
    accountId: "account-test",
    configText: config,
    fetcher: async () => { called = true; return Response.json({success: true}); }
  }), /CLOUDFLARE_ACCOUNT_ID and CLOUDFLARE_API_TOKEN are required/);
  assert.equal(called, false);
});
