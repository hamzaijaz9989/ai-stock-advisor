import test from "node:test";
import assert from "node:assert/strict";
import {readFile} from "node:fs/promises";

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

