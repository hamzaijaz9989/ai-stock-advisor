import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {runInNewContext} from "node:vm";

const source=readFileSync(new URL("../web/workspace.js",import.meta.url),"utf8");
const roles=["market_scanner","technical_analyst","fundamental_analyst","news_analyst","sentiment_analyst","bull_researcher","bear_researcher","portfolio_analyst","risk_committee"];
function makeNode(){return {children:[],style:{},append(...items){this.children.push(...items);},replaceChildren(...items){this.children=[...items];},setAttribute(){},addEventListener(){},className:"",textContent:""};}
async function renderAgentDetail(path,role,{hasRun=true}={}){
 const elements=new Map(),calls=[];
 const document={body:makeNode(),getElementById(id){if(!elements.has(id))elements.set(id,makeNode());return elements.get(id);},createElement(){return makeNode();}};
 const status={ok:true,latestRun:hasRun?{symbol:"AAPL"}:null};
 const detail={ok:true,latest:{symbol:"AAPL",runStatus:"NO_TRADE",createdAt:"2026-11-17T00:00:00Z",agent:{role,status:"COMPLETE",decision:null,vetoReasons:[],findings:[{claim:"Evidence-backed finding from a test fixture.",factIds:["northstar:v1:fact:test"]}],risks:[],durationMs:12,provider:"deterministic",model:"northstar-test-v1",evidenceCount:1}},history:[]};
 const fetch=async url=>{calls.push(url);const data=url.startsWith("/api/research/status")?status:detail;return {ok:true,json:async()=>data};};
 runInNewContext(source,{document,location:{pathname:path,search:"?role="+encodeURIComponent(role)},fetch,URLSearchParams,AbortSignal});
 await new Promise(resolve=>setImmediate(resolve));
 return {elements,calls};
}

test("extensionless and .html routes execute the persisted detail loader",async()=>{
 for(const path of ["/agent-detail","/agent-detail.html"]){
  const {elements,calls}=await renderAgentDetail(path,"market_scanner");
  assert.equal(calls.length,2,path);
  assert.match(calls[1],/role=market_scanner/);
  assert.equal(elements.get("agent-name").textContent,"Market Scanner");
  assert.equal(elements.get("agent-status").textContent,"COMPLETE");
  assert.ok(elements.get("agent-report").children.some(x=>x.children?.some(y=>y.textContent==="Provider")));
 }
});

test("all nine allowlisted roles execute detail lookup",async()=>{
 for(const role of roles){
  const {elements,calls}=await renderAgentDetail("/agent-detail",role);
  assert.equal(calls.length,2,role);
  assert.match(calls[1],new RegExp("role="+role));
  assert.notEqual(elements.get("agent-name").textContent,"Agent not found");
 }
});

test("invalid roles are rejected without a backend request",async()=>{
 const {elements,calls}=await renderAgentDetail("/agent-detail","fake_agent");
 assert.equal(calls.length,0);
 assert.equal(elements.get("agent-name").textContent,"Agent not found");
 assert.equal(elements.get("agent-status").textContent,"INVALID ROLE");
});

test("a missing persisted run displays a terminal empty state",async()=>{
 const {elements,calls}=await renderAgentDetail("/agent-detail","market_scanner",{hasRun:false});
 assert.equal(calls.length,1);
 assert.equal(elements.get("agent-status").textContent,"NOT RUN");
 assert.match(elements.get("agent-report").children[0].textContent,/No persisted run exists/);
});
