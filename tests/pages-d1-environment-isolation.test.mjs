import test from "node:test";
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
