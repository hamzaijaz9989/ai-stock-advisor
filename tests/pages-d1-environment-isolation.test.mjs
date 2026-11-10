import test from "node:test";
import assert from "node:assert/strict";
import {readFile} from "node:fs/promises";

const config = await readFile(new URL("../web/wrangler.toml", import.meta.url), "utf8");

function value(section, key) {
  const match = section.match(new RegExp("^" + key + " = \"([^\"]+)\"", "m"));
  return match?.[1] ?? null;
}

test("Pages production and Preview use distinct D1 databases", () => {
  const production = config.split("[[d1_databases]]")[1]?.split("[[previews.d1_databases]]")[0] ?? "";
  const preview = config.split("[[previews.d1_databases]]")[1] ?? "";

  assert.ok(production, "production D1 binding must be declared");
  assert.ok(preview, "Preview D1 binding must be declared in the previews block");
  assert.equal(value(production, "binding"), "NORTHSTAR_DB");
  assert.equal(value(production, "database_name"), "northstar-paper-ledger");
  assert.equal(value(production, "database_id"), "528f3a23-1d1f-4d16-8463-f643d85f5deb");
  assert.equal(value(preview, "binding"), "NORTHSTAR_DB");
  assert.equal(value(preview, "database_name"), "northstar-preview");
  assert.equal(value(preview, "database_id"), "bdffc29f-a4f6-498e-ade7-22c85d9bd373");
  assert.notEqual(value(preview, "database_id"), value(production, "database_id"),
    "Preview must never point to the production D1 database");
});
