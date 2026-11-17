import test from "node:test";
import assert from "node:assert/strict";
import {readFile} from "node:fs/promises";
import {fileURLToPath} from "node:url";
import {dirname,resolve} from "node:path";
const root=resolve(dirname(fileURLToPath(import.meta.url)),"..");
const [html,js,css]=await Promise.all(["web/trading-lab.html","web/research-council-ui.js","web/research-council-ui.css"].map(p=>readFile(resolve(root,p),"utf8")));
test("Command Center replacement exposes accessible run, refresh, report and history controls",()=>{
 for(const id of ["cc-title","cc-launch-form","cc-symbol","run-council","refresh-council","cc-agent-grid","cc-history-body","cc-report-dialog","cc-debate-load"])assert.ok(html.includes('id="'+id+'"'),"missing "+id);
 assert.match(html,/aria-live="polite"/);assert.match(html,/aria-labelledby="cc-title"/);
 assert.match(html,/research-council-ui\.js/);assert.match(html,/research-council-ui\.css/);
 assert.doesNotMatch(html,/id="council-ticker"|id="council-agent-market-scanner"/);
});
test("UI lists exactly the nine canonical agent roles and uses only existing research endpoints",()=>{
 const roles=["market_scanner","technical_analyst","fundamental_analyst","news_analyst","sentiment_analyst","bull_researcher","bear_researcher","portfolio_analyst","risk_committee"];
 assert.equal((js.match(/role:"[a-z_]+",name:/g)||[]).length,9);
 for(const role of roles)assert.ok(js.includes('role:"'+role+'"'),role);
 assert.ok(js.includes("/api/research/status?limit=10"));
 assert.ok(js.includes("/api/research/agent?"));
 assert.ok(js.includes("/api/research/collect"));
 assert.ok(js.includes('method:"POST"'));
 assert.ok(js.includes('method:"GET"')||js.includes("/api/research/status?limit=10"));
 assert.doesNotMatch(js,/innerHTML\s*=|\/api\/(paper\/intents|orders)/i);
 assert.doesNotMatch(js,/setInterval\([^)]*(progress|percent)|\b25%\b/);
});
test("mobile layout and keyboard focus styles are present",()=>{
 assert.match(css,/@media\(max-width:560px\)/);
 assert.match(css,/overflow:auto/);
 assert.match(css,/focus-visible/);
});

test("agent report identifies the first persisted finding as its executive summary",()=>{
 assert.ok(js.includes("Executive summary · first persisted finding"));
});