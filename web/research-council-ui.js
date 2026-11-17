(()=>{"use strict";
const $=id=>document.getElementById(id);
const ROLES=[
 {role:"market_scanner",name:"Market Scanner",description:"Eligibility, coverage, liquidity and candidate discovery.",deps:"Provider quotes and scanner universe."},
 {role:"technical_analyst",name:"Technical Analyst",description:"Price structure, trend, volatility and technical invalidation.",deps:"Validated quote and historical bars."},
 {role:"fundamental_analyst",name:"Fundamental Analyst",description:"Reported financial facts, valuation inputs and accounting caveats.",deps:"SEC/FMP facts with provenance."},
 {role:"news_analyst",name:"News Analyst",description:"Catalysts, source quality, chronology and event uncertainty.",deps:"Timestamped news and filings."},
 {role:"sentiment_analyst",name:"Sentiment Analyst",description:"AI-derived sentiment from qualifying timestamped company headlines.",deps:"At least three unique, fresh, dated articles."},
 {role:"bull_researcher",name:"Bull Researcher",description:"Independent strongest evidence-backed upside case and falsifiers.",deps:"Validated preliminary evidence; separate provider role."},
 {role:"bear_researcher",name:"Bear Researcher",description:"Independent adversarial downside case and thesis invalidators.",deps:"Same thesis evidence; independently invoked role."},
 {role:"portfolio_analyst",name:"Portfolio Analyst",description:"Diversification, concentration and fit against verified holdings.",deps:"Validated specialists, both debate reports and verified portfolio snapshot."},
 {role:"risk_committee",name:"Risk Committee",description:"Deterministic final gate; reviews missing inputs and risk vetoes.",deps:"All required specialist reports and verified portfolio snapshot."}
];
const STATUS=["COMPLETE","BLOCKED","UNAVAILABLE","FAILED","NOT_RUN","RUNNING"];
const labels={COMPLETE:"Complete",BLOCKED:"Blocked",UNAVAILABLE:"Unavailable",FAILED:"Failed",NOT_RUN:"Not run",RUNNING:"Running"};
const failureHelp={unknown_evidence_id:"The report cited an evidence ID outside the validated research context.",missing_evidence_ids:"A claim did not include a required evidence reference.",invalid_evidence_id:"An evidence reference did not match the required format.",too_many_evidence_ids:"The report exceeded the evidence-reference limit.",invalid_report_contract:"The report did not match the required schema.",invalid_claim_text:"A claim did not meet the validation contract.",worker_exception:"The agent worker failed during execution.",worker_not_configured:"No worker is configured for this role.",agent_unavailable:"The required agent or provider is unavailable.",provider_http_400:"The provider rejected the generation request.",provider_http_401:"The provider rejected the configured API key.",provider_http_403:"The provider key lacks access to this operation or model.",provider_http_404:"The configured generation model is unavailable.",provider_http_429:"Provider quota or rate limit was reached.",request_timeout:"The provider request timed out.",response_validation:"The provider response was malformed or failed schema validation.",provider_request_failed:"The provider request failed.",insufficient_fresh_news:"Fewer than three unique recent timestamped news items were available."};
let runs=[],selected=null,launching=false,cache=new Map(),refreshBusy=false;
const text=(node,value)=>{if(node)node.textContent=value===null||value===undefined||value===""?"Unavailable":String(value);};
const safeStatus=value=>STATUS.includes(value)?value:"UNKNOWN";
const statusLabel=value=>labels[value]||"Unknown";
function utc(value){const d=new Date(value||"");return Number.isFinite(d.getTime())?d.toISOString().replace("T"," ").replace(".000Z","Z"):"Not recorded";}
function count(run,status){return (run?.agents||[]).filter(a=>a.status===status).length;}
function statusChip(value){const span=document.createElement("span");span.className="cc-status";span.dataset.status=safeStatus(value);span.textContent=statusLabel(safeStatus(value));return span;}
function renderSummary(run){
 selected=run||null;
 text($("cc-run-heading"),run?run.symbol+" research run":"No research run selected");
 const state=run?.runState||run?.status||"UNKNOWN";
 const chip=$("cc-run-status");if(chip){chip.dataset.status=safeStatus(state);chip.textContent=state.replaceAll("_"," ");}
 text($("cc-run-symbol"),run?.symbol||"—");text($("cc-run-id"),run?.runId||"—");
 text($("cc-run-created"),run?.createdAt?utc(run.createdAt):"—");
 text($("cc-run-updated"),run?.updatedAt?utc(run.updatedAt):"Not recorded by backend");text($("cc-run-outcome"),run?.riskDecision||run?.status||"Not recorded");
 text($("cc-count-complete"),count(run,"COMPLETE")+" COMPLETE");
 text($("cc-count-blocked"),count(run,"BLOCKED")+" BLOCKED");
 text($("cc-count-unavailable"),count(run,"UNAVAILABLE")+" UNAVAILABLE");
 text($("cc-count-failed"),count(run,"FAILED")+" FAILED");text($("cc-count-running"),count(run,"RUNNING")+" RUNNING");
 text($("cc-count-notrun"),count(run,"NOT_RUN")+" NOT RUN");
 const debateButton=$("cc-debate-load");if(debateButton)debateButton.disabled=!run;
 renderAgents(run);renderRiskPortfolio(run);renderDebatePlaceholders(run);
}
function renderAgents(run){
 const grid=$("cc-agent-grid");if(!grid)return;grid.replaceChildren();
 if(!run){const p=document.createElement("p");p.className="cc-empty";p.textContent="No persisted Research Council run is available.";grid.append(p);return;}
 const byRole=new Map((run.agents||[]).map(a=>[a.role,a]));
 for(let i=0;i<ROLES.length;i++){
  const spec=ROLES[i],agent=byRole.get(spec.role),state=agent?safeStatus(agent.status):"NOT_RUN";
  const card=document.createElement("article");card.className="cc-agent-card";card.dataset.status=state;
  const head=document.createElement("div");head.className="cc-agent-head";
  const name=document.createElement("div"),number=document.createElement("span"),h=document.createElement("h4");
  number.className="cc-agent-number";number.textContent=String(i+1).padStart(2,"0")+" / 09";h.textContent=spec.name;name.append(number,h);head.append(name,statusChip(state));
  const desc=document.createElement("p");desc.textContent=spec.description;
  const meta=document.createElement("div");meta.className="cc-agent-meta";
  const add=(label,value)=>{const box=document.createElement("span"),b=document.createElement("b");b.textContent=label;box.append(b,document.createTextNode(value));meta.append(box);};
  add("RUN TIME",agent?.latencyMs!==null&&agent?.latencyMs!==undefined?agent.latencyMs+" ms":agent?.status==="NOT_RUN"?"Not executed":"Not recorded");
  add("PROVIDER / MODEL",[agent?.provider,agent?.model].filter(Boolean).join(" · ")||"Not recorded");
  add("EVIDENCE REFS",agent?.evidenceCount!==null&&agent?.evidenceCount!==undefined?String(agent.evidenceCount):"Open report for references");
  add("VALIDATION",agent?.status==="COMPLETE"?"Persisted as validated":agent?.failureCode||agent?.reason||"No result recorded");
  const deps=document.createElement("div");deps.className="cc-agent-meta";const dep=document.createElement("span");dep.style.gridColumn="1/-1";const b=document.createElement("b");b.textContent="DEPENDENCIES";dep.append(b,document.createTextNode(spec.deps));deps.append(dep);
  const view=document.createElement("button");view.type="button";view.textContent="View report";view.setAttribute("aria-label","View "+spec.name+" report");view.disabled=!run.runId;
  view.addEventListener("click",()=>openReport(spec.role));
  card.append(head,desc,meta,deps,view);grid.append(card);
 }
 const note=$("cc-board-note");if(note)note.textContent=run.runState==="RUNNING"?"Collection is active; individual reports are persisted when orchestration completes. Agents still marked NOT RUN have no persisted result.":"Agent states reflect the selected durable run; NOT RUN means no result was recorded.";
}
function renderRiskPortfolio(run){
 const p=$("cc-portfolio-state"),r=$("cc-risk-state"),v=$("cc-vetoes");if(v)v.replaceChildren();
 if(!run){text(p,"No persisted result.");text(r,"No persisted Committee result.");return;}
 const agents=new Map((run.agents||[]).map(x=>[x.role,x]));
 const portfolio=agents.get("portfolio_analyst"),risk=agents.get("risk_committee");
 text(p,portfolio?statusLabel(portfolio.status)+(portfolio.failureCode?" · "+(failureHelp[portfolio.failureCode]||portfolio.failureCode):"")+(portfolio.reason?" · "+portfolio.reason:""):"No persisted result.");
 text(r,risk?statusLabel(risk.status)+(risk.decision?" · "+risk.decision:"")+(risk.failureCode?" · "+(failureHelp[risk.failureCode]||risk.failureCode):""):"No persisted Committee result.");
 if(risk?.vetoReasons?.length){for(const reason of risk.vetoReasons){const item=document.createElement("div");item.className="cc-failure";item.textContent=reason;v.append(item);}}
 else if(risk?.status==="COMPLETE"){const item=document.createElement("p");item.className="cc-validation";item.textContent="Veto detail loads from the persisted deterministic Committee report.";v.append(item);}
 const runId=run.runId;
 Promise.all([loadAgent("portfolio_analyst"),loadAgent("risk_committee")]).then(entries=>{
  if(selected?.runId!==runId)return;
  const portfolioAgent=entries[0]?.agent,riskAgent=entries[1]?.agent;
  if(portfolioAgent)text(p,statusLabel(portfolioAgent.status)+(portfolioAgent.failureCode?" · "+(failureHelp[portfolioAgent.failureCode]||portfolioAgent.failureCode):"")+(portfolioAgent.reason?" · "+portfolioAgent.reason:""));
  if(riskAgent){
   text(r,statusLabel(riskAgent.status)+(riskAgent.decision?" · "+riskAgent.decision:"")+(riskAgent.failureCode?" · "+(failureHelp[riskAgent.failureCode]||riskAgent.failureCode):"")+(riskAgent.reason?" · "+riskAgent.reason:""));
   v.replaceChildren();
   if(riskAgent.vetoReasons?.length)for(const reason of riskAgent.vetoReasons){const item=document.createElement("div");item.className="cc-failure";item.textContent=reason;v.append(item);}
   else{const item=document.createElement("p");item.className="cc-validation";item.textContent=riskAgent.status==="COMPLETE"?"No persisted veto reasons.":"Veto reasons unavailable because no Committee report was persisted.";v.append(item);}
  }
 }).catch(()=>{});
}
function renderDebatePlaceholders(run){
 for(const [id,role] of [["cc-bull-summary","bull_researcher"],["cc-bear-summary","bear_researcher"]]){
  const agent=(run?.agents||[]).find(a=>a.role===role);text($(id),agent?statusLabel(agent.status)+(agent.failureCode?" · "+(failureHelp[agent.failureCode]||agent.failureCode):""):"No persisted result.");
 }
 $("cc-bull-points")?.replaceChildren();$("cc-bear-points")?.replaceChildren();
}
function renderHistory(){
 const body=$("cc-history-body");if(!body)return;body.replaceChildren();
 if(!runs.length){const tr=document.createElement("tr"),td=document.createElement("td");td.colSpan=7;td.textContent="No durable research runs are available.";tr.append(td);body.append(tr);return;}
 for(const run of runs){
  const tr=document.createElement("tr");if(selected?.runId===run.runId)tr.setAttribute("aria-current","true");
  const values=[run.symbol,run.runId||"Unavailable",utc(run.createdAt),count(run,"COMPLETE")+"/9",String(run.runState||run.status||"UNKNOWN").replaceAll("_"," "),run.riskDecision||"Not recorded"];
  for(const value of values){const td=document.createElement("td");td.textContent=String(value);tr.append(td);}
  const td=document.createElement("td"),button=document.createElement("button");button.type="button";button.textContent="Open run";button.addEventListener("click",()=>{cache.clear();renderSummary(run);renderHistory();text($("cc-operation"),"Selected persisted run "+run.runId+". No research was launched.");});
  td.append(button);tr.append(td);body.append(tr);
 }
}
function renderRuns(data){
 runs=Array.isArray(data?.runs)?data.runs:[];
 const success=runs.find(x=>(x.agents||[]).some(a=>a.status==="COMPLETE"));
 text($("cc-api-status"),"Council ledger connected · "+(data.agentCount||ROLES.length)+" roles");$("cc-api-status").dataset.state="ok";
 text($("cc-refresh-time"),"Checked "+utc(data.checkedAt));
 if(data.latestRun){const keep=selected&&runs.find(x=>x.runId===selected.runId);renderSummary(keep||data.latestRun);}
 else{renderSummary(null);}
 text($("cc-header-last-success"),success?utc(success.createdAt):"No run with a persisted COMPLETE agent");
 renderHistory();
 if(data.latestRun?.runState==="RUNNING")text($("cc-operation"),"Persisted collection is running. Per-agent completion is not available until the backend records it.");
}
async function fetchJson(url,options={}){
 const response=await fetch(url,{cache:"no-store",headers:{Accept:"application/json",...(options.headers||{})},...options});
 let body;try{body=await response.json();}catch{throw new Error("Server returned an unreadable response (HTTP "+response.status+").");}
 if(!response.ok||body?.ok===false)throw new Error(body?.error||"Request failed (HTTP "+response.status+").");
 return body;
}
async function refresh(){
 if(refreshBusy)return;refreshBusy=true;const b=$("refresh-council");if(b)b.disabled=true;
 try{const data=await fetchJson("/api/research/status?limit=10");renderRuns(data);if(selected?.runId){const current=runs.find(x=>x.runId===selected.runId);if(current)renderSummary(current);}}
 catch(error){$("cc-api-status").dataset.state="error";text($("cc-api-status"),"Ledger unavailable · "+error.message);text($("cc-operation"),"Refresh failed. No local or demo data was substituted.");}
 finally{refreshBusy=false;if(b)b.disabled=launching;}
}
function appendEvidence(parent,ids,refs){
 const mapping=new Map((Array.isArray(refs)?refs:[]).map(x=>[x.factId,x]));
 for(const id of Array.isArray(ids)?ids:[]){
  const ref=mapping.get(id),box=document.createElement("div");box.className="cc-evidence-ref";
  const title=document.createElement("strong");title.textContent=id;box.append(title);
  const detail=document.createElement("div");detail.textContent=ref?[ref.type,ref.source,ref.observedAt?utc(ref.observedAt):"source timestamp not recorded",ref.label].filter(Boolean).join(" · "):"Source metadata was not stored for this historical evidence reference.";
  box.append(detail);parent.append(box);
 }
}
function reportBlock(parent,title,items,refs){
 const section=document.createElement("section");section.className="cc-report-block";const h=document.createElement("h4");h.textContent=title;section.append(h);
 if(!Array.isArray(items)||!items.length){const p=document.createElement("p");p.className="cc-empty";p.textContent="No persisted "+title.toLowerCase()+".";section.append(p);}
 else for(const item of items){const p=document.createElement("p");p.textContent=item.claim||"Claim text unavailable";section.append(p);if(item.confidence!==undefined&&item.confidence!==null){const c=document.createElement("small");c.textContent="Confidence supplied by report: "+String(item.confidence);section.append(c);}appendEvidence(section,item.factIds,refs);}
 parent.append(section);
}
async function loadAgent(role){
 if(!selected?.runId||!selected.symbol){text($("cc-operation"),"Select a persisted run before opening reports.");return null;}
 const key=selected.runId+"|"+role;if(cache.has(key))return cache.get(key);
 const params=new URLSearchParams({symbol:selected.symbol,role,runId:selected.runId});
 const data=await fetchJson("/api/research/agent?"+params.toString());cache.set(key,data.latest);return data.latest;
}
async function openReport(role){
 const dialog=$("cc-report-dialog"),body=$("cc-report-body"),title=$("cc-report-title"),spec=ROLES.find(x=>x.role===role);
 if(!dialog||!body)return;body.replaceChildren();text(title,spec?.name||role);
 const loading=document.createElement("p");loading.textContent="Loading persisted report…";body.append(loading);
 if(!dialog.open)dialog.showModal();
 try{
  const entry=await loadAgent(role),agent=entry?.agent;
  body.replaceChildren();
  if(!agent){const p=document.createElement("p");p.textContent="No agent report was persisted for this role in the selected run.";body.append(p);return;}
  const summary=document.createElement("div");summary.className="cc-report-block";
  const state=statusChip(agent.status);summary.append(state);
  const line=document.createElement("p");line.textContent="Run "+selected.runId+" · "+utc(entry.createdAt)+" UTC · duration "+(agent.durationMs!==null?agent.durationMs+" ms":"not recorded")+" · provider "+(agent.provider||"not recorded")+" · model "+(agent.model||"not recorded");summary.append(line);
  const validation=document.createElement("p");validation.className="cc-validation";validation.textContent=agent.status==="COMPLETE"?"Persisted validated status: COMPLETE.":agent.failureCode?(failureHelp[agent.failureCode]||agent.failureCode):agent.reason||agent.unavailableReason||"This role did not persist a validated result.";summary.append(validation);
  if(agent.failureCode){const err=document.createElement("div");err.className="cc-failure";err.textContent=(failureHelp[agent.failureCode]||"Agent failure")+ " · "+agent.failureCode;summary.append(err);}
  if(agent.reason&&agent.status!=="COMPLETE"){const why=document.createElement("p");why.textContent=agent.reason;summary.append(why);}
  if(agent.decision){const d=document.createElement("p");d.textContent="Committee decision: "+agent.decision;summary.append(d);}
  if(agent.vetoReasons?.length){for(const v of agent.vetoReasons){const item=document.createElement("div");item.className="cc-failure";item.textContent=v;summary.append(item);}}
  body.append(summary);
  reportBlock(body,"Findings",agent.findings,entry.evidenceReferences);reportBlock(body,"Risks",agent.risks,entry.evidenceReferences);
 }catch(error){body.replaceChildren();const p=document.createElement("p");p.className="cc-failure";p.textContent="Agent report unavailable: "+error.message;body.append(p);}
}
async function loadDebate(){
 if(!selected)return;const button=$("cc-debate-load");if(button)button.disabled=true;
 try{
  const [bull,bear]=await Promise.all([loadAgent("bull_researcher"),loadAgent("bear_researcher")]);
  for(const [prefix,entry] of [["bull",bull],["bear",bear]]){
   const agent=entry?.agent,summary=$(("cc-"+prefix+"-summary"));summary.textContent=agent?.status==="COMPLETE"?(agent.findings?.[0]?.claim||"A validated report has no persisted findings."):(agent?.reason||agent?.unavailableReason||"No validated report was persisted; no thesis is shown.");
   const root=$("cc-"+prefix+"-points");root.replaceChildren();
   if(agent?.status==="COMPLETE"){
    for(const [label,items] of [["Findings",agent.findings],["Risks / counter-evidence",agent.risks]])for(const item of items||[]){
     const div=document.createElement("div");div.className="cc-point";div.textContent=item.claim||"Claim text unavailable";appendEvidence(div,item.factIds,entry.evidenceReferences);root.append(div);
    }
   }
  }
 }catch(error){text($("cc-operation"),"Debate reports unavailable: "+error.message);}
 finally{if(button)button.disabled=!selected;}
}
async function launch(event){
 event?.preventDefault();if(launching)return;
 const input=$("cc-symbol"),ticker=String(input?.value||"").trim().toUpperCase();
 if(!/^[A-Z][A-Z0-9.-]{0,11}$/.test(ticker)){text($("cc-operation"),"Enter a valid ticker using letters, digits, dots or hyphens.");input?.focus();return;}
 launching=true;const button=$("run-council"),refreshButton=$("refresh-council");
 button.disabled=true;refreshButton.disabled=true;button.textContent="Research running…";text($("cc-operation"),"Submitting one same-origin research request. Server cooldown and authorization remain enforced.");
 const requestId="ui-"+(crypto.randomUUID?crypto.randomUUID():Array.from(crypto.getRandomValues(new Uint8Array(16)),x=>x.toString(16).padStart(2,"0")).join(""));
 let poll=setInterval(()=>{if(document.visibilityState==="visible")refresh();},5000);
 try{
  const data=await fetchJson("/api/research/collect",{method:"POST",headers:{"Content-Type":"application/json","Accept":"application/json"},body:JSON.stringify({ticker,requestId})});
  text($("cc-operation"),data.replayed?"Loaded the persisted idempotent result.":"Research request completed; loading the persisted D1 result.");
  await refresh();
  if(data.traceDurable!==true)text($("cc-operation"),"The server did not confirm durable persistence. Do not treat this request as a completed run.");
 }catch(error){text($("cc-operation"),"Research launch failed safely: "+error.message);await refresh();}
 finally{clearInterval(poll);launching=false;button.disabled=false;refreshButton.disabled=false;button.textContent="Run Research";}
}
$("cc-launch-form")?.addEventListener("submit",launch);
$("refresh-council")?.addEventListener("click",()=>{text($("cc-operation"),"Refreshing server state only; no research request will be sent.");refresh();});
$("cc-report-close")?.addEventListener("click",()=>$("cc-report-dialog")?.close());
$("cc-debate-load")?.addEventListener("click",loadDebate);
$("cc-report-dialog")?.addEventListener("click",event=>{if(event.target===$("cc-report-dialog"))$("cc-report-dialog").close();});
$("cc-symbol")?.addEventListener("input",event=>{event.target.value=event.target.value.toUpperCase().replace(/[^A-Z0-9.-]/g,"").slice(0,12);});
refresh();
})();