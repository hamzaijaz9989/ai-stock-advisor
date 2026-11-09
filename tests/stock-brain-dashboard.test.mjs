import test from "node:test";
import assert from "node:assert/strict";
import {readFile} from "node:fs/promises";
import {runInNewContext} from "node:vm";

const html = await readFile(new URL("../web/trading-lab.html", import.meta.url), "utf8");
const client = await readFile(new URL("../web/trading-lab.js", import.meta.url), "utf8");

test("Trading Lab exposes the Stock Brain nine-agent workspace", () => {
  assert.match(html, /id="stock-brain"/);
  assert.match(html, /id="stock-brain-ticker"/);
  assert.match(html, /id="run-stock-brain"/);
  assert.match(html, /id="stock-brain-agents"/);
  assert.match(html, /9-AGENT STOCK BRAIN/);
});

test("Stock Brain client uses authenticated server-side collection without persisting the operator token", () => {
  assert.match(client, /fetch\("\/api\/research\/collect"/);
  assert.match(client, /Authorization:"Bearer "\+token/);
  assert.match(client, /body:JSON\.stringify\(\{ticker,requestId\}\)/);
  assert.match(client, /COUNCIL_DISPLAY_ROLES/);
  assert.match(client, /stock-brain-trace/);
  assert.doesNotMatch(client, /localStorage\.setItem\([^\n]*token/i);
});

test("Stock Brain report renderer writes untrusted specialist text with textContent", () => {
  const start = client.indexOf("function renderCouncilResult");
  const end = client.indexOf('$("run-stock-brain").addEventListener', start);
  assert.ok(start >= 0 && end > start, "renderer and event handler must exist");
  const renderer = client.slice(start, end);
  assert.match(renderer, /\.textContent\s*=/);
  assert.doesNotMatch(renderer, /\.innerHTML\s*=/);
});

test("Stock Brain parser returns JSON and replaces proxy HTML/parser details with a safe error", async () => {
  const start = client.indexOf("async function parseStockBrainResponse");
  const end = client.indexOf("\\n  }", start);
  assert.ok(start >= 0 && end > start, "safe response parser must exist");
  const parser = runInNewContext("(" + client.slice(start, end + 4) + ")");
  const valid = await parser({status:200, text:async () => JSON.stringify({ok:true, result:{status:"NO_TRADE"}})});
  assert.equal(valid.ok, true);
  await assert.rejects(
    () => parser({status:403, text:async () => "<html>proxy secret detail</html>"}),
    error => {
      assert.equal(error.message, "Stock Brain service returned a non-JSON response (HTTP 403).");
      assert.doesNotMatch(error.message, /proxy secret detail|Unexpected token/i);
      return true;
    }
  );
  await assert.rejects(
    () => parser({status:200, text:async () => "[]"}),
    /Stock Brain service returned an invalid response/
  );
});

test("Stock Brain agent role labels are human-readable", () => {
  const line = client.split("\\n").find(value => value.includes("const roleTitle ="));
  assert.ok(line, "role label formatter must exist");
  const formatter = runInNewContext("(" + line.trim().replace(/^const roleTitle = /, "").replace(/;$/, "") + ")");
  assert.equal(formatter("market_scanner"), "Market Scanner");
  assert.equal(formatter("risk_committee"), "Risk Committee");
});
