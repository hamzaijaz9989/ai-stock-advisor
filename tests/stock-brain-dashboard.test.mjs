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
  assert.match(html, /id="stock-brain-scorecard"/);
  assert.match(html, /9-AGENT STOCK BRAIN/);
});

test("Stock Brain client uses authenticated server-side collection without persisting the operator token", () => {
  assert.match(client, /fetch\("\/api\/research\/collect"/);
  assert.match(client, /Authorization:"Bearer "\+token/);
  assert.match(client, /body:JSON\.stringify\(\{ticker,requestId\}\)/);
  assert.match(client, /COUNCIL_DISPLAY_ROLES/);
  assert.match(client, /stock-brain-trace/);
  assert.match(client, /payload\.traceDurable===true&&result\.traceDurable===true/);
  assert.match(client, /parseStockBrainResponse\(response\)/);
  assert.match(client, /renderCouncilEvaluation\(result\.evaluation,result\.agents,coverage,newsQuality\)/);
  assert.doesNotMatch(client, /localStorage\.setItem\([^\n]*token/i);
  assert.doesNotMatch(client, /sessionStorage|localStorage\.setItem\([^\n]*northstar_operator_token/i);
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
  const parserMatch = client.match(/async function parseStockBrainResponse\(response\) \{[\s\S]*?^  \}/m);
  assert.ok(parserMatch, "safe response parser must exist");
  const parser = runInNewContext("(" + parserMatch[0] + ")");
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
  const line = client.split(/\r?\n/).find(value => value.includes("const roleTitle ="));
  assert.ok(line, "role label formatter must exist");
  const formatter = runInNewContext("(" + line.trim().replace(/^const roleTitle = /, "").replace(/;$/, "") + ")");
  assert.equal(formatter("market_scanner"), "Market Scanner");
  assert.equal(formatter("risk_committee"), "Risk Committee");
});

test("Stock Brain scorecard exposes role coverage and renders untrusted values as text", () => {
  const start = client.indexOf("function renderCouncilEvaluation");
  const end = client.indexOf('$("run-stock-brain").addEventListener', start);
  assert.ok(start >= 0 && end > start, "scorecard renderer must exist");
  const renderer = client.slice(start, end);
  assert.match(renderer, /COUNCIL_DISPLAY_ROLES/);
  assert.match(renderer, /resource\.status/);
  assert.match(renderer, /Unique timestamped news/);
  assert.match(renderer, /Company-specific news/);
  assert.match(renderer, /Duplicate \/ syndicated/);
  assert.match(renderer, /Unverified-source items/);
  assert.match(renderer, /\.textContent\s*=/);
  assert.doesNotMatch(renderer, /\.innerHTML\s*=/);
});

test("Trading Lab has no client-side login facade or session-persisted operator token", () => {
  assert.doesNotMatch(html, /northstar-login|northstar_operator_token|sessionStorage|auth\/check|Hamza Rana/);
  assert.match(client, /const token=prompt\("Enter the NORTHSTAR_OPERATOR_TOKEN/);
  assert.doesNotMatch(client, /sessionStorage|localStorage\.setItem\([^\n]*token/i);
});
