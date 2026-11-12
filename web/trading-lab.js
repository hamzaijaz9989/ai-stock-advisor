// Cached candidates are research priorities, not an entry signal or a validated BUY.
(() => {
  "use strict";
  const $ = id => document.getElementById(id);
  const CAPITAL = 1000;
  const RISK_PCT_MAX = 0.5;
  const AGGREGATE_PLANNED_RISK_PCT_MAX = 1;
  const STORAGE_KEY = "northstar-trading-lab-plans-v1";
  const money = value => new Intl.NumberFormat("en-US", {style:"currency",currency:"USD",maximumFractionDigits:2}).format(value);
  const safeReadPlans = () => {
    try {
      const parsed = JSON.parse(localStorage.getItem(STORAGE_KEY) || "[]");
      return Array.isArray(parsed) ? parsed.filter(item => item && typeof item.id === "string" && typeof item.symbol === "string") : [];
    } catch { return []; }
  };
  const savePlans = plans => {
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(plans)); return true; }
    catch { return false; }
  };
  const plans = safeReadPlans();
  let latestDurableCouncilTicker = null;
  $("capital").textContent = money(CAPITAL);
  $("risk-budget").textContent = money(CAPITAL * 0.005);
  $("max-position").textContent = money(CAPITAL * 0.25);

  function calculate() {
    const symbol = String($("symbol").value || "").trim().toUpperCase();
    const entry = Number($("entry").value);
    const stop = Number($("stop").value);
    const riskPct = Number($("risk-pct").value);
    const committedPlanRisk = plans.reduce((total, plan) => {
      const risk = Number(plan?.plannedLoss);
      return total + (Number.isFinite(risk) && risk > 0 ? risk : 0);
    }, 0);
    const aggregateRiskRoom = Math.max(0, CAPITAL * AGGREGATE_PLANNED_RISK_PCT_MAX / 100 - committedPlanRisk);
    const riskBudget = Math.min(CAPITAL * Math.min(Math.max(riskPct, 0), RISK_PCT_MAX) / 100, aggregateRiskRoom);
    const valid = /^[A-Z][A-Z0-9.-]{0,9}$/.test(symbol) &&
      Number.isFinite(entry) && Number.isFinite(stop) && entry > stop && stop > 0 &&
      Number.isFinite(riskPct) && riskPct > 0 && riskPct <= RISK_PCT_MAX;
    if (!symbol || !Number.isFinite(entry) || entry <= 0 || !Number.isFinite(stop) || stop <= 0) {
      $("quantity").textContent = "—";
      $("risk-result").textContent = "Enter a ticker, planned entry and invalidation price to calculate position size.";
      return null;
    }
    if (!valid || riskBudget <= 0) {
      $("quantity").textContent = "NO TRADE";
      $("risk-result").textContent = riskBudget <= 0 ? "No aggregate planned-risk capacity remains under the 1% ceiling. Review or remove an existing plan before sizing another." : "Check the ticker, ensure entry is above the stop, and keep risk between 0.1% and 0.5% of pilot equity.";
      return null;
    }
    const perShareRisk = entry - stop;
    const byRisk = Math.floor(riskBudget / perShareRisk);
    const byNotional = Math.floor((CAPITAL * 0.25) / entry);
    const shares = Math.max(0, Math.min(byRisk, byNotional));
    const notional = shares * entry;
    const plannedLoss = shares * perShareRisk;
    $("quantity").textContent = shares ? shares + (shares === 1 ? " share" : " shares") : "NO TRADE";
    $("risk-result").textContent = shares
      ? "Position value " + money(notional) + " · planned stop risk " + money(plannedLoss) +
        " · risk budget " + money(riskBudget) + " (requested up to " + money(CAPITAL * riskPct / 100) + "; remaining aggregate room " + money(aggregateRiskRoom) + "). Whole-share sizing; gaps can cause larger losses."
      : "No whole share fits both the risk budget and 25% position cap. Do not force a trade.";
    return shares ? {symbol, entry, stop, shares, notional, plannedLoss, riskBudget, riskPct} : null;
  }

  function renderJournal() {
    $("plan-count").textContent = String(plans.length);
    const root = $("journal");
    root.replaceChildren();
    if (!plans.length) {
      const empty = document.createElement("p");
      empty.className = "muted small";
      empty.textContent = "No saved plans yet.";
      root.appendChild(empty);
      return;
    }
    for (const plan of [...plans].reverse()) {
      const row = document.createElement("div");
      row.className = "journal-row";
      const detail = document.createElement("div");
      const title = document.createElement("strong");
      title.textContent = plan.symbol + " · " + plan.shares + (plan.shares === 1 ? " share" : " shares");
      const meta = document.createElement("div");
      meta.className = "muted small";
      meta.textContent = "Entry " + money(plan.entry) + " · Stop " + money(plan.stop) +
        " · Planned risk " + money(plan.plannedLoss) + " · Plan only";
      detail.append(title, meta);
      const remove = document.createElement("button");
      remove.className = "secondary";
      remove.type = "button";
      remove.textContent = "Remove";
      remove.setAttribute("aria-label", "Remove " + plan.symbol + " plan");
      remove.addEventListener("click", () => {
        const index = plans.findIndex(item => item.id === plan.id);
        if (index >= 0) plans.splice(index, 1);
        if (!savePlans(plans)) {
          alert("Browser storage is unavailable. The plan could not be removed.");
          return;
        }
        renderJournal();
        calculate();
      });
      row.append(detail, remove);
      root.appendChild(row);
    }
  }

  ["symbol","entry","stop","risk-pct"].forEach(id => $(id).addEventListener("input", calculate));
  $("save-plan").addEventListener("click", () => {
    const result = calculate();
    if (!result) return;
    if (plans.some(item => item.symbol === result.symbol)) {
      alert("A plan for this ticker already exists. Review or remove it before creating another.");
      return;
    }
    if (plans.length >= 10) {
      alert("The local plan list is limited to ten tickers.");
      return;
    }
    const plan = {...result, id: (crypto.randomUUID ? crypto.randomUUID() : String(Date.now()) + Math.random().toString(16).slice(2)), createdAt: new Date().toISOString(), status:"PLANNED_NOT_EXECUTED"};
    plans.push(plan);
    if (!savePlans(plans)) {
      plans.pop();
      alert("Browser storage is unavailable. No plan was saved.");
      return;
    }
    renderJournal();
    calculate();
  });
  $("reset-calc").addEventListener("click", () => {
    $("symbol").value = "";
    $("entry").value = "";
    $("stop").value = "";
    $("risk-pct").value = "0.5";
    calculate();
  });

  const monitorTime = value => {const d=new Date(value||"");return Number.isFinite(d.getTime())?d.toLocaleString():"Not recorded";};
  function monitorMetric(id,value){const el=$(id);if(el)el.textContent=String(value??"—");}
  function renderMonitorEvents(events){
    const root=$("monitor-events");root.replaceChildren();
    if(!Array.isArray(events)||!events.length){const p=document.createElement("p");p.className="muted small";p.textContent="No monitor alerts recorded yet. This is not evidence of a buy or sell signal.";root.appendChild(p);return;}
    for(const event of events.slice(0,20)){
      const row=document.createElement("div");row.className="journal-row";
      const left=document.createElement("div");
      const title=document.createElement("strong");title.textContent=String(event.symbol||"—")+" · "+String(event.event_type||"EVENT").replaceAll("_"," ");left.appendChild(title);
      const message=document.createElement("div");message.className="muted tiny";message.textContent=String(event.message||"No event detail");left.appendChild(message);
      const meta=document.createElement("div");meta.className="muted tiny";meta.textContent=monitorTime(event.observed_at)+" · "+String(event.source||"Source not recorded")+(Number.isFinite(Number(event.price))?" · $"+Number(event.price).toFixed(2):"");left.appendChild(meta);
      const severity=document.createElement("span");severity.className="state";severity.textContent=String(event.severity||"INFO").toUpperCase();
      row.append(left,severity);root.appendChild(row);
    }
  }
  function renderMonitorQuotes(quotes){
    const root=$("monitor-quotes");if(!root)return;root.replaceChildren();
    if(!Array.isArray(quotes)||!quotes.length){const p=document.createElement("p");p.className="muted small";p.textContent="No verified quotes have been recorded yet. Quote collection is pending a successful market-session run.";root.appendChild(p);return;}
    for(const quote of quotes){
      const row=document.createElement("div");row.className="journal-row";
      const left=document.createElement("div");
      const title=document.createElement("strong");title.textContent=String(quote.symbol||"—")+" · "+(Number.isFinite(Number(quote.price))?"$"+Number(quote.price).toFixed(2):"Price unavailable");left.appendChild(title);
      const pct=Number(quote.change_pct);const change=document.createElement("div");change.className="muted tiny";change.textContent=(Number.isFinite(pct)?(pct>0?"+":"")+pct.toFixed(2)+"% vs previous close":"Daily change unavailable")+(Number(quote.in_watch_zone)===1?" · Inside provisional watch zone":"");left.appendChild(change);
      const stamp=document.createElement("div");stamp.className="muted tiny";
      const qtime=Date.parse(quote.quote_time||"");const age=Number.isFinite(qtime)?(Date.now()-qtime)/60000:Infinity;
      const freshness=age<0?"Future timestamp · reject":age<=15?"Fresh quote":"Last recorded quote · stale";
      stamp.textContent="Quote "+monitorTime(quote.quote_time)+" · "+freshness+" · "+String(quote.source||"Source unavailable");left.appendChild(stamp);
      row.appendChild(left);const status=document.createElement("span");status.className="state";status.textContent=age<=15&&age>=0?"FRESH":"STALE";row.appendChild(status);root.appendChild(row);
    }
  }
  async function loadMonitor(){
    const status=$("monitor-status"),button=$("refresh-monitor");
    if(status)status.textContent="Refreshing monitor ledger…";
    if(button)button.disabled=true;
    try{
      const response=await fetch("/api/monitor?limit=20",{headers:{Accept:"application/json"},cache:"no-store"});
      const data=await response.json();
      if(!response.ok||data.ok!==true)throw new Error(data.error||"Monitor ledger unavailable");
      const run=data.latestRun||{};
      monitorMetric("monitor-run-status",String(run.status||"NO RUN").replaceAll("_"," ").toUpperCase());
      monitorMetric("monitor-run-time",run.completed_at?"Completed "+monitorTime(run.completed_at):"No completed run");
      monitorMetric("monitor-symbols",Number.isFinite(Number(run.symbols_checked))?run.symbols_checked:"—");
      monitorMetric("monitor-errors",Number.isFinite(Number(run.errors))?run.errors:"—");
      monitorMetric("monitor-alert-count",data.unacknowledgedEvents??0);
      renderMonitorQuotes(data.quotes);
      renderMonitorEvents(data.events);
      if(status)status.textContent="Ledger connected · checked "+monitorTime(data.checkedAt)+" · "+String(data.cadence||"scheduled cadence");
    }catch(error){
      if(status)status.textContent="Monitor unavailable · "+(error?.message||"request failed");
      renderMonitorQuotes([]);
      renderMonitorEvents([]);
      monitorMetric("monitor-run-status","UNAVAILABLE");
      monitorMetric("monitor-run-time","No verified status");
      monitorMetric("monitor-symbols","—");monitorMetric("monitor-errors","—");monitorMetric("monitor-alert-count","—");
    }finally{if(button)button.disabled=false;}
  }
  const COUNCIL_AGENTS = [
    ["market_scanner","market-scanner"],["technical_analyst","technical-analyst"],
    ["fundamental_analyst","fundamental-analyst"],["news_analyst","news-analyst"],
    ["sentiment_analyst","sentiment-analyst"],["bull_researcher","bull-researcher"],
    ["bear_researcher","bear-researcher"],["portfolio_analyst","portfolio-analyst"],
    ["risk_committee","risk-committee"]
  ];
  const councilTime = value => {const d=new Date(value||"");return Number.isFinite(d.getTime())?d.toLocaleString():"Not recorded";};
  function renderCouncilAgents(run){
    const statuses=new Map((Array.isArray(run?.agents)?run.agents:[]).map(agent=>[agent.role,agent.status]));
    let complete=0,blocked=0;
    for(const [role,id] of COUNCIL_AGENTS){
      const node=$("council-agent-"+id);
      const value=run?(statuses.get(role)||"NOT RUN"):"NOT VERIFIED";
      if(value==="COMPLETE")complete++;
      if(value==="BLOCKED"||value==="UNAVAILABLE")blocked++;
      if(node){
        node.textContent=value.replaceAll("_"," ");
        const tile=node.closest(".module");
        if(tile)tile.dataset.state=value;
      }
    }
    const completeNode=$("council-complete-count"),pendingNode=$("council-pending-count");
    const blockedNode=$("council-blocked-count"),bar=$("council-completion-bar");
    if(completeNode)completeNode.textContent=complete+" / 9";
    if(pendingNode)pendingNode.textContent=String(Math.max(0,9-complete-blocked));
    if(blockedNode)blockedNode.textContent=String(blocked);
    if(bar)bar.style.width=(complete/9*100)+"%";
  }
  function renderCouncilRuns(runs){
    const root=$("council-runs");root.replaceChildren();
    if(!Array.isArray(runs)||!runs.length){
      const p=document.createElement("p");p.className="muted small";
      p.textContent="No durable Research Council runs have been recorded yet.";root.appendChild(p);return;
    }
    for(const run of runs){
      const row=document.createElement("div");row.className="journal-row";
      const left=document.createElement("div");
      const title=document.createElement("strong");title.textContent=String(run.symbol||"UNKNOWN")+" · "+String(run.status||"UNKNOWN").replaceAll("_"," ");
      const detail=document.createElement("div");detail.className="muted tiny";
      const complete=(run.agents||[]).filter(agent=>agent.status==="COMPLETE").length;
      detail.textContent=councilTime(run.createdAt)+" · "+complete+"/9 roles complete";
      left.append(title,detail);
      const state=document.createElement("span");state.className="state";state.textContent=String(run.status||"UNKNOWN").replaceAll("_"," ");
      row.append(left,state);root.appendChild(row);
    }
  }
  async function loadResearchCouncil(){
    const status=$("council-status"),button=$("refresh-council");
    if(status)status.textContent="Refreshing the read-only research ledger…";
    if(button)button.disabled=true;
    try{
      const response=await fetch("/api/research/status?limit=5",{headers:{Accept:"application/json"},cache:"no-store"});
      const data=await response.json();
      if(!response.ok||data.ok!==true)throw new Error(data.error||"Research status unavailable");
      const latest=data.latestRun;
      if(latest){
        $("council-latest-status").textContent=String(latest.status||"UNKNOWN").replaceAll("_"," ");
        $("council-latest-symbol").textContent=String(latest.symbol||"UNKNOWN");
        $("council-latest-time").textContent=councilTime(latest.createdAt);
      }else{
        $("council-latest-status").textContent="NO RUNS";
        $("council-latest-symbol").textContent="—";
        $("council-latest-time").textContent="No persisted run";
      }
      renderCouncilAgents(latest);
      renderCouncilRuns(data.runs);
      if(status)status.textContent="Read-only ledger connected · "+data.agentCount+" specialist roles · checked "+councilTime(data.checkedAt);
    }catch(error){
      if(status)status.textContent="Research ledger unavailable · "+(error?.message||"request failed");
      $("council-latest-status").textContent="UNAVAILABLE";
      $("council-latest-symbol").textContent="—";$("council-latest-time").textContent="Not verified";
      renderCouncilAgents(null);renderCouncilRuns([]);
    }finally{if(button)button.disabled=false;}
  }

  let lastCandidateGeneratedAt = null;
  const elapsedLabel = ms => {
    if(!Number.isFinite(ms)||ms<0)return "time unavailable";
    const minutes=Math.floor(ms/60000);
    if(minutes<1)return "just now";
    if(minutes<60)return minutes+" min ago";
    const hours=Math.floor(minutes/60);
    if(hours<24)return hours+"h "+(minutes%60)+"m ago";
    return Math.floor(hours/24)+"d "+(hours%24)+"h ago";
  };
  async function loadCandidates() {
    const status=$("scanner-state"),root=$("candidates"),button=$("refresh-candidates");
    if(button){button.disabled=true;button.textContent="Checking…";}
    try{
      const response=await fetch("/api/shortlist?check="+Date.now(),{cache:"no-store",headers:{Accept:"application/json"}});
      if(!response.ok)throw new Error("Shortlist cache unavailable (HTTP "+response.status+").");
      const data=await response.json();
      if(data.ok!==true)throw new Error(data.error||"Published shortlist unavailable.");
      const generated=Date.parse(data.completedAt||data.generatedAt||"");
      if(!Number.isFinite(generated))throw new Error("The scan timestamp is missing; shortlist freshness cannot be verified.");
      const ageMs=Date.now()-generated,ageHours=ageMs/3600000;
      const interval=Number.isFinite(Number(data.refreshIntervalHours))&&Number(data.refreshIntervalHours)>0?Number(data.refreshIntervalHours):3;
      const stale=ageMs<0||ageHours>interval+1||data.status!=="success";
      const generatedIso=new Date(generated).toISOString();
      const isNew=lastCandidateGeneratedAt!==null&&generatedIso!==lastCandidateGeneratedAt;
      lastCandidateGeneratedAt=generatedIso;
      status.textContent=stale?"SCAN OVERDUE · "+elapsedLabel(ageMs):"LAST SCAN · "+elapsedLabel(ageMs);
      status.className="state "+(stale?"warn":"good");
      root.replaceChildren();
      const rows=Array.isArray(data.stocks)?data.stocks.filter(stock=>/^[A-Z][A-Z0-9.-]{0,11}$/.test(String(stock?.ticker||"").trim().toUpperCase())).slice(0,10):[];
      if(!rows.length)throw new Error("No valid candidates were returned by the last scan.");
      rows.forEach((stock,index)=>{
        const symbol=String(stock.ticker).trim().toUpperCase();
        const card=document.createElement("article");card.className="candidate";
        const link=document.createElement("a");link.className="candidate-link";link.href="./research.html";
        link.setAttribute("aria-label","Open full Northstar research for "+symbol);
        link.addEventListener("click",()=>{try{localStorage.setItem("northstar-last-ticker-v2",symbol);}catch{}});
        const rank=document.createElement("span");rank.className="candidate-rank";rank.textContent=String(index+1).padStart(2,"0");
        const ticker=document.createElement("span");ticker.className="ticker";ticker.textContent=symbol;
        const name=document.createElement("span");name.className="candidate-name";name.textContent=String(stock.name||"Company name unavailable");
        link.append(rank,ticker,name);
        const score=document.createElement("div");score.className="candidate-score";
        const scoreValue=document.createElement("strong");
        scoreValue.textContent=Number.isFinite(Number(stock.score))&&Number(stock.score)>=0&&Number(stock.score)<=100?Number(stock.score).toFixed(1)+"/100":"—";
        const scoreLabel=document.createElement("small");scoreLabel.textContent="Research score";
        score.append(scoreValue,scoreLabel);
        const meta=document.createElement("div");meta.className="candidate-meta";
        const entry=document.createElement("span");entry.className="candidate-pill "+(stock.entryReady===true?"good":"warn");
        entry.textContent=stock.entryReady===true?"Entry checks passed":"Not entry-ready";
        meta.appendChild(entry);
        if(stock.fundamentalFreshness){
          const freshness=document.createElement("span");freshness.className="candidate-pill "+(String(stock.fundamentalFreshness).includes("STALE")?"warn":"");
          freshness.textContent=String(stock.fundamentalFreshness).replaceAll("_"," ").toLowerCase();
          meta.appendChild(freshness);
        }
        card.append(link,score,meta);
        if(stock.entryReady!==true&&stock.entryStatus){
          const note=document.createElement("p");note.className="candidate-status";
          note.textContent=String(stock.entryStatus).slice(0,150)+(String(stock.entryStatus).length>150?"…":"");
          card.appendChild(note);
        }
        root.appendChild(card);
      });
      const stamp=new Date(generated).toLocaleString();
      const nextText="Scheduled refresh interval: every "+interval+" hours.";
      const message=stale?"This cached scan is overdue or incomplete. Do not treat it as current. ":"";
      const changed=isNew?" A newer scan has been published.": " No newer scan has been published since the previous check.";
      $("cache-note").textContent=message+"Last completed scan: "+stamp+" ("+elapsedLabel(ageMs)+"). "+nextText+changed+" Scores are research-priority rankings, not live prices or BUY signals; they change only when a new scan completes and its inputs change. The shortlist is checked automatically every 5 minutes while this page is open.";
    }catch(error){
      status.textContent="SCAN UNAVAILABLE";status.className="state warn";
      root.replaceChildren();
      const message=document.createElement("p");message.className="muted small";message.textContent=error?.message||"Could not load the shortlist.";
      root.appendChild(message);
      $("cache-note").textContent="No verified shortlist is available. No candidates or scores have been invented.";
    }finally{if(button){button.disabled=false;button.textContent="Check for updates";}}
  }


  $("check-alpaca").addEventListener("click", async () => {
    const button = $("check-alpaca");
    const badge = $("alpaca-badge");
    const message = $("alpaca-message");
    const detail = $("alpaca-detail");
    button.disabled = true;
    button.textContent = "Checking…";
    badge.textContent = "CHECKING";
    message.textContent = "Checking the existing server-side read-only Alpaca Paper Trading endpoint…";
    detail.textContent = "";
    try {
      const response = await fetch("/api/alpaca/status", {headers:{Accept:"application/json"},cache:"no-store"});
      const data = await response.json();
      if (!response.ok || !data.connected || data.environment !== "paper") throw new Error(data.error || "Paper connection could not be verified.");
      badge.textContent = "PAPER CONNECTED";
      message.textContent = "Connected to Alpaca Paper Trading. The endpoint is read-only; no orders are submitted.";
      const positionCount = Array.isArray(data.positions) ? data.positions.length : 0;
      detail.textContent = "Account status: " + String(data.account?.status || "unknown") +
        " · Open positions: " + positionCount +
        " · Checked: " + new Date(data.checkedAt || Date.now()).toLocaleString();
    } catch (error) {
      badge.textContent = "NOT VERIFIED";
      message.textContent = error && error.message ? error.message : "Could not verify paper connection.";
      detail.textContent = "No order action was attempted.";
    } finally {
      button.disabled = false;
      button.textContent = "Test paper connection";
    }
  });


  async function loadLedgerReadiness() {
    const badge = $("ledger-badge");
    const message = $("ledger-message");
    const detail = $("ledger-detail");
    try {
      const response = await fetch("/api/paper/readiness", {
        headers: {Accept:"application/json"},
        cache: "no-store"
      });
      const data = await response.json();
      if (!response.ok || !data.configured || !data.policyVerified) {
        badge.textContent = "NOT VERIFIED";
        message.textContent = data.message || "Ledger readiness could not be verified.";
        detail.textContent = "Execution remains disabled.";
        return;
      }
      badge.textContent = "POLICY VERIFIED";
      message.textContent = data.message;
      detail.textContent = "Virtual capital " + money(data.limits.virtualCapitalUsd) +
        " · Default risk " + money(data.limits.defaultRiskUsd) +
        " · Max risk " + money(data.limits.maxRiskUsd) +
        " · Max position " + money(data.limits.maxPositionUsd) +
        " · Kill switch engaged";
    } catch {
      badge.textContent = "UNAVAILABLE";
      message.textContent = "Could not reach the paper ledger readiness endpoint.";
      detail.textContent = "Fail-closed: no order execution is available.";
    }
  }


  const fmtSigned = value => (value > 0 ? "+" : "") + money(value);
  async function loadPaperPerformance() {
    const status = $("performance-status");
    const positionsRoot = $("paper-positions");
    status.textContent = "Checking read-only paper account…";
    $("paper-position-count").textContent = "CHECKING";
    for (const id of ["paper-equity","paper-day-pl","paper-unrealized","paper-buying-power"]) $(id).textContent = "—";
    positionsRoot.textContent = "Loading broker positions…";
    try {
      const response = await fetch("/api/alpaca/status", {headers:{Accept:"application/json"},cache:"no-store"});
      const data = await response.json();
      if (!response.ok || !data.connected || data.environment !== "paper" || !data.account) throw new Error(data.error || "Paper account could not be verified.");
      const equity=Number(data.account.equity), prior=Number(data.account.lastEquity), buying=Number(data.account.buyingPower);
      if (![equity,prior,buying].every(Number.isFinite)) throw new Error("Broker returned incomplete account values; P&L withheld.");
      const positions=Array.isArray(data.positions)?data.positions:null;
      if (!positions || data.positionsWarning) throw new Error(data.positionsWarning || "Positions could not be reconciled; P&L withheld.");
      const unrealized=positions.reduce((sum,p)=>sum+Number(p.unrealizedPl),0);
      if (!Number.isFinite(unrealized) || positions.some(p=>!Number.isFinite(Number(p.unrealizedPl)))) throw new Error("Position P&L is incomplete; aggregate withheld.");
      $("paper-equity").textContent=money(equity);
      $("paper-day-pl").textContent=fmtSigned(equity-prior);
      $("paper-unrealized").textContent=fmtSigned(unrealized);
      $("paper-buying-power").textContent=money(buying);
      $("paper-position-count").textContent=positions.length+" OPEN";
      positionsRoot.replaceChildren();
      if (!positions.length) {
        const empty=document.createElement("p"); empty.textContent="No open paper positions reported by Alpaca."; positionsRoot.appendChild(empty);
      } else {
        for (const p of positions) {
          const row=document.createElement("div"); row.className="journal-row";
          const left=document.createElement("strong"); left.textContent=String(p.symbol||"—")+" · "+String(p.qty||"—")+" shares";
          const right=document.createElement("span"); right.textContent=Number.isFinite(Number(p.unrealizedPl))?fmtSigned(Number(p.unrealizedPl)):"P&L unavailable";
          row.append(left,right); positionsRoot.appendChild(row);
        }
      }
      status.textContent="Verified Alpaca PAPER account · refreshed "+new Date(data.checkedAt||Date.now()).toLocaleString()+". Day P&L is equity minus last account equity.";
    } catch(error) {
      status.textContent=(error&&error.message?error.message:"Paper account unavailable")+" No substitute values shown.";
      $("paper-position-count").textContent="NOT VERIFIED";
      positionsRoot.textContent="Open positions are unavailable until the paper account and positions are verified.";
    }
  }

  async function loadDurablePerformance() {
    const status=$("snapshot-status");
    try {
      const response=await fetch("/api/paper/performance",{headers:{Accept:"application/json"},cache:"no-store"});
      const data=await response.json();
      if(!response.ok||!data.ok)throw new Error(data.error||"Durable performance unavailable.");
      $("snapshot-return").textContent=fmtPct(data.observedChange?.returnPct);
      $("snapshot-drawdown").textContent=fmtPct(data.observedChange?.maxDrawdownPct);
      $("snapshot-count").textContent=String(data.snapshotCount??0);
      $("snapshot-realized").textContent=data.tradeStatistics?.grossRealizedPlUsd===null||data.tradeStatistics?.grossRealizedPlUsd===undefined?"—":fmtSigned(Number(data.tradeStatistics.grossRealizedPlUsd));
      $("snapshot-win-rate").textContent=fmtPct(data.tradeStatistics?.winRatePct);
      $("snapshot-profit-factor").textContent="Profit factor "+(typeof data.tradeStatistics?.profitFactor==="number"?data.tradeStatistics.profitFactor.toFixed(2):String(data.tradeStatistics?.profitFactor??"—"));
      $("snapshot-range").textContent=data.firstSnapshotAt&&data.lastSnapshotAt?new Date(data.firstSnapshotAt).toLocaleDateString()+" → "+new Date(data.lastSnapshotAt).toLocaleDateString():"No history yet";
      status.textContent=data.available
        ?"Stored broker snapshots · latest "+new Date(data.lastSnapshotAt).toLocaleString()+". Observed change is not strategy performance."
        :"No durable snapshots recorded. Save a snapshot after verifying the paper account.";
      const curve=$("snapshot-curve");curve.replaceChildren();
      if(!data.equityCurve?.length){curve.textContent="No historical equity curve is available yet.";return;}
      for(const point of data.equityCurve.slice(-12)){
        appendMetric(curve,new Date(point.capturedAt).toLocaleString(),money(point.equityUsd),"Drawdown "+fmtPct(point.drawdownPct)+" · cash "+money(point.cashUsd));
      }
    } catch(error) {status.textContent=error?.message||"Could not load durable paper performance.";}
  }
  $("sync-paper-snapshot").addEventListener("click",async()=>{
    const token=prompt("Enter the NORTHSTAR_OPERATOR_TOKEN configured in Cloudflare Pages. It is sent only in this request and is not saved in browser storage.");
    if(!token)return;
    const button=$("sync-paper-snapshot");button.disabled=true;button.textContent="Saving…";
    $("snapshot-status").textContent="Reading Alpaca Paper account and saving a verified snapshot…";
    try{
      const response=await fetch("/api/paper/sync",{method:"POST",headers:{Authorization:"Bearer "+token,Accept:"application/json","Content-Type":"application/json"},body:"{}"});
      const data=await response.json();
      if(!response.ok||!data.synced)throw new Error(data.error||"Snapshot sync failed.");
      $("snapshot-status").textContent="Snapshot saved at "+new Date(data.capturedAt).toLocaleString()+". Broker equity "+money(data.snapshot.equityUsd)+" · "+data.snapshot.positions+" open positions. No orders were submitted.";
      await loadDurablePerformance();
    }catch(error){$("snapshot-status").textContent=error?.message||"Snapshot sync failed. No order action was attempted.";}
    finally{button.disabled=false;button.textContent="＋ Save snapshot";}
  });

  $("sync-paper-fills").addEventListener("click",async()=>{
    const token=prompt("Enter the NORTHSTAR_OPERATOR_TOKEN configured in Cloudflare Pages. It is sent only in this request and is not saved.");
    if(!token)return;
    const button=$("sync-paper-fills");button.disabled=true;button.textContent="Importing…";
    $("snapshot-status").textContent="Fetching broker-reported fill activities and importing idempotently…";
    try{
      const response=await fetch("/api/paper/fills-sync",{method:"POST",headers:{Authorization:"Bearer "+token,Accept:"application/json","Content-Type":"application/json"},body:"{}"});
      const data=await response.json();
      if(!response.ok||!data.imported)throw new Error(data.error||"Fill import failed.");
      $("snapshot-status").textContent="Fill history checked: "+data.brokerRecords+" broker records · "+data.newRecords+" new · "+data.alreadyKnown+" already imported. No orders submitted.";
      await loadDurablePerformance();
    }catch(error){$("snapshot-status").textContent=error?.message||"Fill import failed; no order action was attempted.";}
    finally{button.disabled=false;button.textContent="Import fill history";}
  });
  $("refresh-performance").addEventListener("click",loadPaperPerformance);
  const fmtPct = value => value === null || value === undefined || value === "" || !Number.isFinite(Number(value)) ? "—" : Number(value).toFixed(2) + "%";
  function appendMetric(root,label,value,detail="") {
    const row=document.createElement("div"); row.className="journal-row";
    const left=document.createElement("div");
    const name=document.createElement("span"); name.textContent=label; left.appendChild(name);
    if(detail){const sub=document.createElement("div");sub.className="muted tiny";sub.textContent=detail;left.appendChild(sub);}
    const val=document.createElement("strong");val.textContent=value;
    row.append(left,val);root.appendChild(row);
  }
  const COUNCIL_DISPLAY_ROLES = [
    "market_scanner","technical_analyst","fundamental_analyst","news_analyst","sentiment_analyst",
    "bull_researcher","bear_researcher","portfolio_analyst","risk_committee"
  ];
  const roleTitle = role => String(role||"").replaceAll("_"," ").replace(/\b\w/g,letter=>letter.toUpperCase());
  async function parseStockBrainResponse(response) {
    let raw;
    try {
      raw = await response.text();
    } catch {
      throw new Error("Stock Brain response could not be read.");
    }
    let data;
    try {
      data = raw ? JSON.parse(raw) : null;
    } catch {
      const status = Number(response.status);
      throw new Error("Stock Brain service returned a non-JSON response" + (Number.isFinite(status) && status > 0 ? " (HTTP " + status + ")" : "") + ".");
    }
    if (!data || typeof data !== "object" || Array.isArray(data)) {
      throw new Error("Stock Brain service returned an invalid response.");
    }
    return data;
  }
  function renderCouncilResult(payload) {
    const result=payload.result||{};
    const durable=payload.traceDurable===true&&result.traceDurable===true&&result.trace&&typeof result.trace.ticker==="string";
    const handoff=$("stock-brain-handoff");
    if(handoff){
      handoff.hidden=false;
      $("use-council-ticker").disabled=!durable;
      if(durable){
        latestDurableCouncilTicker=result.trace.ticker.toUpperCase();
        $("stock-brain-handoff-summary").textContent="Durable Stock Brain review for "+latestDurableCouncilTicker+" · "+String(result.status||"NO_TRADE").replaceAll("_"," ")+" · "+councilTime(result.trace.asOf||payload.createdAt)+". This is research context, not an approved entry."; 
      }else{
        latestDurableCouncilTicker=null;
        $("stock-brain-handoff-summary").textContent="No durable trace was confirmed. Ticker handoff stays disabled until a durable Stock Brain result is available.";
      }
    }
    const summary=$("stock-brain-summary");
    summary.hidden=false;
    $("stock-brain-outcome").textContent=String(result.status||"NO_TRADE").replaceAll("_"," ");
    $("stock-brain-agent-count").textContent=(Array.isArray(result.agents)?result.agents.length:0)+" / 9";
    const collection=result.collection||{};
    $("stock-brain-evidence-count").textContent=String(Number(collection.factCount||0)+Number(collection.evidenceCount||0));
    $("stock-brain-trace").textContent=payload.traceDurable===true&&result.traceDurable===true?"CONFIRMED":"NOT CONFIRMED";

    const resourceCoverage=result.resourceCoverage||{};
    const coverage=resourceCoverage.roles||{};
    const newsQuality=resourceCoverage.newsQuality||{};
    const agentRoot=$("stock-brain-agents");
    agentRoot.replaceChildren();
    const byRole=new Map((Array.isArray(result.agents)?result.agents:[]).map(agent=>[agent.role,agent]));
    for(const role of COUNCIL_DISPLAY_ROLES){
      const agent=byRole.get(role)||{role,status:"BLOCKED",reason:"No status was returned for this role."};
      const row=document.createElement("div");row.className="journal-row";
      const left=document.createElement("div");
      const title=document.createElement("strong");title.textContent=roleTitle(role);
      const reason=document.createElement("div");reason.className="muted tiny";
      const roleCoverage=coverage[role]||{};
      const reasonParts=[
        agent.reason||(agent.status==="COMPLETE"?"Specialist report completed.":"This role did not complete."),
        roleCoverage.status?"Resources: "+roleCoverage.status:null,
        ...(Array.isArray(roleCoverage.gaps)?roleCoverage.gaps.slice(0,2):[])
      ].filter(Boolean);
      reason.textContent=reasonParts.join(" · ");
      left.append(title,reason);
      const status=document.createElement("span");
      status.className="state"+(agent.status==="COMPLETE"?" good":" bad");
      status.textContent=String(agent.status||"UNKNOWN");
      row.append(left,status);agentRoot.appendChild(row);
    }

    const vetoRoot=$("stock-brain-vetoes");vetoRoot.replaceChildren();
    const vetoes=Array.isArray(result.vetoReasons)?result.vetoReasons:[];
    if(vetoes.length){
      const heading=document.createElement("strong");heading.textContent="Why this run is blocked";
      vetoRoot.appendChild(heading);
      for(const reason of vetoes.slice(0,30)){
        const item=document.createElement("p");item.className="warning";item.textContent=String(reason);vetoRoot.appendChild(item);
      }
    }else{
      const note=document.createElement("p");note.className="muted small";
      note.textContent=result.status==="RESEARCH_REVIEW_REQUIRED"
        ?"All council stages completed and the deterministic committee accepted the candidate for separate human review. This is not a trade approval."
        :"No separate veto details were returned; the overall outcome remains "+String(result.status||"NO_TRADE")+".";
      vetoRoot.appendChild(note);
    }

    const reportRoot=$("stock-brain-reports");reportRoot.replaceChildren();
    const reports=Array.isArray(result.reports)?result.reports:[];
    if(!reports.length){
      const empty=document.createElement("p");empty.className="muted small";
      empty.textContent="No specialist reports were produced. Review the role status and blocker reasons above.";
      reportRoot.appendChild(empty);
    }
    for(const entry of reports){
      const card=document.createElement("article");card.className="card";card.style.marginTop="10px";
      const header=document.createElement("div");header.className="card-head";
      const heading=document.createElement("h2");heading.textContent=roleTitle(entry.role);
      const status=document.createElement("span");status.className="state good";status.textContent=String(entry.report?.status||"UNKNOWN");
      header.append(heading,status);card.appendChild(header);
      for(const [key,label] of [["findings","Findings"],["risks","Risks"]]){
        const items=Array.isArray(entry.report?.[key])?entry.report[key]:[];
        const group=document.createElement("div");
        const groupTitle=document.createElement("strong");groupTitle.textContent=label+" ("+items.length+")";
        group.appendChild(groupTitle);
        if(!items.length){
          const none=document.createElement("p");none.className="muted small";none.textContent="None reported.";group.appendChild(none);
        }
        for(const item of items.slice(0,30)){
          const row=document.createElement("p");row.className="small";
          row.textContent=String(item.claim||"Claim unavailable")+" · Evidence IDs: "+(Array.isArray(item.factIds)?item.factIds.join(", "):"not supplied");
          group.appendChild(row);
        }
        card.appendChild(group);
      }
      reportRoot.appendChild(card);
    }
    renderCouncilEvaluation(result.evaluation,result.agents,coverage,newsQuality);
  }
  function renderCouncilEvaluation(evaluation,agents,coverage={},newsQuality={}) {
    const summary=$("stock-brain-scorecard-summary");
    const rolesRoot=$("stock-brain-scorecard-roles");
    const limitations=$("stock-brain-scorecard-limitations");
    const scorecard=$("stock-brain-scorecard");
    scorecard.hidden=false;
    summary.replaceChildren();
    rolesRoot.replaceChildren();
    if(!evaluation||evaluation.evaluationScope!=="REPORT_CONTRACT_AND_DECLARED_TELEMETRY_ONLY"){
      const note=document.createElement("p");
      note.className="muted small";
      note.textContent="No deterministic scorecard was returned for this run. Research quality and provider telemetry are not verified.";
      summary.appendChild(note);
      limitations.textContent="A missing scorecard is not a zero score and does not imply approval.";
      return;
    }
    const totals=evaluation.totals||{};
    const percent=value=>typeof value==="number"&&Number.isFinite(value)?(value*100).toFixed(1)+"%":"Not available";
    const metricText=value=>value===null||value===undefined?"Not reported":String(value);
    const cards=[
      ["Role reports",metricText(totals.roleReports)+" / 9"],
      ["Claims",metricText(totals.claims)],
      ["Claim citation coverage",percent(totals.claimCitationCoverage)],
      ["Reference precision",percent(totals.citationPrecision)],
      ["Invalid-reference claims",metricText(totals.invalidReferenceClaims)],
      ["Measured roles",metricText(totals.telemetryRoles)+" / 9"],
      ["Failed invocations",metricText(totals.failedInvocations)],
      ["Summed role latency",totals.latencyMs===null||totals.latencyMs===undefined?"Incomplete":String(totals.latencyMs)+" ms"],
      ["Provider tokens",metricText(totals.totalTokens)],
      ["Provider cost",totals.costUsd===null||totals.costUsd===undefined?"Not measured":"$"+Number(totals.costUsd).toFixed(4)],
      ["Unique timestamped news",metricText(newsQuality.uniqueEligibleCount)],
      ["Company-specific news",metricText(newsQuality.companySpecificCount)],
      ["Macro / sector context",String(Number(newsQuality.macroCount||0)+Number(newsQuality.sectorCount||0))],
      ["Ambiguous-scope news",metricText(newsQuality.ambiguousCount)],
      ["Duplicate / syndicated",metricText(newsQuality.duplicateCount)],
      ["Unverified-source items",metricText(newsQuality.unverifiedSourceCount)]
    ];
    for(const [label,value] of cards){
      const card=document.createElement("div");card.className="stat";
      const name=document.createElement("label");name.textContent=label;
      const result=document.createElement("strong");result.textContent=value;
      card.append(name,result);summary.appendChild(card);
    }
    const roleMetrics=evaluation.roles||{};
    const agentByRole=new Map((Array.isArray(agents)?agents:[]).map(agent=>[agent.role,agent]));
    for(const role of COUNCIL_DISPLAY_ROLES){
      const metric=roleMetrics[role]||{};
      const agent=agentByRole.get(role)||{};
      const resource=coverage[role]||{};
      const status=String(metric.status||agent.status||"UNKNOWN");
      const refs=Number(metric.validReferences||0)+"/"+Number(metric.totalReferences||0)+" valid references";
      const latency=metric.latencyMs===null||metric.latencyMs===undefined?"latency not reported":String(metric.latencyMs)+" ms";
      const provider=metric.provider?String(metric.provider)+(metric.model?" / "+String(metric.model):""):"provider not reported";
      const tokens=metric.totalTokens===null||metric.totalTokens===undefined?"tokens not reported":String(metric.totalTokens)+" tokens";
      const details=[
        "Resources: "+String(metric.resourceStatus||resource.status||"NOT_REPORTED"),
        String(metric.claimCount||0)+" claims",
        refs,
        latency,
        provider,
        tokens,
        metric.failed===true?"invocation failed":null
      ].filter(Boolean);
      const row=document.createElement("div");row.className="journal-row";
      const left=document.createElement("div");
      const title=document.createElement("strong");title.textContent=roleTitle(role);
      const detail=document.createElement("div");detail.className="muted tiny";detail.textContent=details.join(" · ");
      left.append(title,detail);
      const badge=document.createElement("span");badge.className="state"+(status==="COMPLETE"?" good":" bad");badge.textContent=status;
      row.append(left,badge);rolesRoot.appendChild(row);
    }
    const scope=String(evaluation.evaluationScope||"UNKNOWN");
    const notes=Array.isArray(evaluation.limitations)?evaluation.limitations.slice(0,5):[];
    limitations.textContent="Scope: "+scope+". Valid references establish ID integrity, not factual truth or whether a source supports a claim. No investment performance, predictive accuracy or strategy approval is inferred. "+notes.join(" ");
  }
  $("use-council-ticker").addEventListener("click",()=>{
    if(!latestDurableCouncilTicker||!/^[A-Z][A-Z0-9.-]{0,9}$/.test(latestDurableCouncilTicker))return;
    $("symbol").value=latestDurableCouncilTicker;
    $("entry").value="";
    $("stop").value="";
    $("risk-pct").value="0.5";
    calculate();
    $("risk-calculator").scrollIntoView({behavior:"smooth",block:"start"});
    $("entry").focus({preventScroll:true});
  });

  $("run-stock-brain").addEventListener("click",async()=>{
    const button=$("run-stock-brain");
    const status=$("stock-brain-status");
    const ticker=String($("stock-brain-ticker").value||"").trim().toUpperCase();
    if(!/^[A-Z][A-Z0-9.-]{0,11}$/.test(ticker)){
      status.textContent="Enter a valid US equity ticker.";
      return;
    }
    const token=prompt("Enter the NORTHSTAR_OPERATOR_TOKEN configured in Cloudflare Pages. It is sent only in this request and is not saved in browser storage.");
    if(!token)return;
    const requestId="stockbrain-"+(crypto.randomUUID?crypto.randomUUID():Date.now().toString(36)+"-"+Math.random().toString(36).slice(2));
    button.disabled=true;button.textContent="Researching…";
    latestDurableCouncilTicker=null;
    $("stock-brain-handoff").hidden=false;
    $("use-council-ticker").disabled=true;
    $("stock-brain-handoff-summary").textContent="Research is running. Ticker handoff stays disabled until the server confirms a durable trace.";
    status.textContent="Collecting server-side quote, history, fundamentals, filings, news, earnings and reconciled portfolio evidence. This may take a little while.";
    $("stock-brain-summary").hidden=true;
    $("stock-brain-agents").replaceChildren();
    $("stock-brain-vetoes").replaceChildren();
    $("stock-brain-reports").replaceChildren();
    $("stock-brain-scorecard").hidden=true;
    $("stock-brain-scorecard-summary").replaceChildren();
    $("stock-brain-scorecard-roles").replaceChildren();
    $("stock-brain-scorecard-limitations").textContent="";
    try{
      const response=await fetch("/api/research/collect",{
        method:"POST",
        headers:{Authorization:"Bearer "+token,Accept:"application/json","Content-Type":"application/json"},
        body:JSON.stringify({ticker,requestId})
      });
      const data=await parseStockBrainResponse(response);
      if(!response.ok||data.ok!==true)throw new Error(typeof data.error==="string"&&data.error.trim()?data.error.trim().slice(0,300):"Stock Brain research run failed safely.");
      renderCouncilResult(data);
      status.textContent=ticker+" · "+(data.result?.status||"NO_TRADE")+" · "+(data.traceDurable===true?"Durable trace confirmed":"Trace durability not confirmed")+" · "+new Date(data.createdAt||Date.now()).toLocaleString()+". No orders were submitted.";
    }catch(error){
      $("stock-brain-handoff").hidden=false;
      $("use-council-ticker").disabled=true;
      $("stock-brain-handoff-summary").textContent="No durable trace was confirmed. Ticker handoff stays disabled.";
      status.textContent=(error?.message||"Stock Brain run unavailable.")+" No order action was attempted. If the blocker is seven-day equity history, continue the read-only snapshot schedule until the required baseline exists.";
    }finally{
      button.disabled=false;button.textContent="Run 9-agent research";
    }
  });

  async function runTimeMachine() {
    const button=$("run-backtest"), status=$("backtest-status"), root=$("backtest-results");
    const ticker=String($("backtest-symbol").value||"").trim().toUpperCase();
    if(!/^[A-Z0-9.^=-]{1,12}$/.test(ticker)){status.textContent="Enter a valid ticker.";return;}
    button.disabled=true; button.textContent="Running…"; status.textContent="Fetching historical data and calculating diagnostics…"; root.replaceChildren();
    try {
      const response=await fetch("/api/strategy-backtest?ticker="+encodeURIComponent(ticker),{headers:{Accept:"application/json"},cache:"no-store"});
      const data=await response.json();
      if(!response.ok) throw new Error(data.error||"Historical test unavailable.");
      const provider=document.createElement("div");provider.className="warning";
      provider.textContent="DATA SOURCE · "+(data.source||"Unknown")+" · "+(data.sourceStatus||"STATUS UNKNOWN")+" · SPY: "+(data.benchmarkSource||"Unknown");
      root.appendChild(provider);
      const completedTradeCount=Number(data.completedTrades)||0;
      const sampleAdequate=completedTradeCount>=20;
      const sampleNotice=document.createElement("div");
      sampleNotice.className="warning";
      sampleNotice.textContent=sampleAdequate
        ? "SAMPLE CHECK · "+completedTradeCount+" completed trades. This is still experimental historical analysis, not proof of future performance."
        : "INSUFFICIENT SAMPLE · Only "+completedTradeCount+" completed trade(s). Strategy return, annualized return, win rate and profit factor are withheld. At least 20 completed trades are required even for a preliminary sample review; this does not establish a validated strategy.";
      root.appendChild(sampleNotice);
      const metrics=[
        ["Strategy total return",sampleAdequate?fmtPct(data.strategy?.totalReturnPercent):"INSUFFICIENT SAMPLE","Historical diagnostic; not a live or paper return"],
        ["Trade-ledger compounded return",sampleAdequate?fmtPct(data.ledgerTotalReturnPercent):"INSUFFICIENT SAMPLE","Same entries, exits and assumed costs as the daily equity curve"],
        ["Equity / ledger difference",data.reconciliationDifferencePercent===null||data.reconciliationDifferencePercent===undefined?"—":Number(data.reconciliationDifferencePercent).toFixed(6)+" pp","Expected to be approximately zero"],
        ["Reconciliation status",String(data.reconciliationStatus||"NOT REPORTED"),"A mismatch means do not interpret headline performance"],
        ["Strategy annualized return",sampleAdequate?fmtPct(data.strategy?.annualizedReturnPercent):"INSUFFICIENT SAMPLE"],
        ["Strategy maximum drawdown",fmtPct(data.strategy?.maxDrawdownPercent)],
        ["Strategy annualized volatility",fmtPct(data.strategy?.volatilityPercent)],
        ["SPY buy-and-hold return",fmtPct(data.spyBuyHold?.totalReturnPercent)],
        ["SPY maximum drawdown",fmtPct(data.spyBuyHold?.maxDrawdownPercent)],
        ["Completed trades",data.completedTrades??"—","Open-at-end positions are excluded"],
        ["Open at test end",data.openAtEnd??"—"],
        ["Win rate",sampleAdequate?fmtPct(data.winRatePercent):"INSUFFICIENT SAMPLE","Requires at least 20 completed trades for preliminary review"],
        ["Profit factor",sampleAdequate&&Number.isFinite(Number(data.profitFactor))?Number(data.profitFactor).toFixed(2):"INSUFFICIENT SAMPLE"],
        ["Walk-forward positive folds",String(data.walkForward?.positiveFolds??"—")+"/"+String(data.walkForward?.totalFolds??"—")]
      ];
      const grid=document.createElement("div");grid.className="stat-grid";
      for(const [label,value,detail] of metrics){
        const tile=document.createElement("div");tile.className="stat";
        const lab=document.createElement("label");lab.textContent=label;
        const val=document.createElement("strong");val.textContent=value;
        const sub=document.createElement("small");sub.textContent=detail||"Historical diagnostic";
        tile.append(lab,val,sub);grid.appendChild(tile);
      }
      root.appendChild(grid);
      appendMetric(root,"Historical coverage",String(data.observations??"—")+" daily bars",String(data.startDate||"")+" → "+String(data.endDate||""));
      appendMetric(root,"Benchmark coverage",String(data.benchmarkStartDate||"—")+" → "+String(data.benchmarkEndDate||"—"),"SPY aligned to the same calendar window");
      const trades=document.createElement("div");trades.className="card";trades.style.marginTop="14px";
      const th=document.createElement("div");th.className="card-head";const title=document.createElement("h2");title.textContent="Trade log · last recorded positions";th.appendChild(title);trades.appendChild(th);
      const tradeRows=Array.isArray(data.tradeLog)?data.tradeLog:[];
      if(!tradeRows.length){const empty=document.createElement("p");empty.className="muted small";empty.textContent="No strategy trades were generated in this history.";trades.appendChild(empty);}
      for(const trade of tradeRows.slice(-10).reverse()){
        const detail=[trade.entryDate||"—","→",trade.exitDate||"—","·",trade.holdingSessions??"—","sessions","·",trade.exitReason||trade.status||"—"].join(" ");
        appendMetric(trades,String(trade.status||"COMPLETED").replaceAll("_"," "),fmtPct(trade.netReturnPercent),detail);
      }
      root.appendChild(trades);
      const folds=Array.isArray(data.walkForward?.folds)?data.walkForward.folds:[];
      if(folds.length){
        const foldBox=document.createElement("div");foldBox.className="card";foldBox.style.marginTop="14px";
        const head=document.createElement("div");head.className="card-head";const h=document.createElement("h2");h.textContent="Chronological walk-forward windows";head.appendChild(h);foldBox.appendChild(head);
        for(const fold of folds){
          appendMetric(foldBox,(fold.testStart||"")+" → "+(fold.testEnd||""),fmtPct(fold.returnPercent),String(fold.entries??0)+" entries · "+String(fold.exits??0)+" exits · "+String(fold.observations??0)+" sessions");
        }
        root.appendChild(foldBox);
      }
      const warning=document.createElement("p");warning.className="warning";warning.textContent=data.warning||"Experimental historical diagnostic. Not validated for live or paper execution.";root.appendChild(warning);
      if(data.walkForward?.warning){const w=document.createElement("p");w.className="muted small";w.textContent=data.walkForward.warning;root.appendChild(w);}
      status.textContent=ticker+" · "+data.startDate+" to "+data.endDate+" · "+data.observations+" daily observations · "+String(data.reconciliationStatus||"RECONCILIATION UNKNOWN")+" · refreshed "+new Date().toLocaleString();
    } catch(error) { status.textContent=error&&error.message?error.message:"Backtest unavailable."; }
    finally {button.disabled=false;button.textContent="Run historical test";}
  }
  $("run-backtest").addEventListener("click",runTimeMachine);
  calculate();
  renderJournal();
  loadPaperPerformance();
  loadDurablePerformance();
  loadCandidates();
  $("refresh-candidates").addEventListener("click",loadCandidates);
  window.setInterval(()=>{if(document.visibilityState==="visible")loadCandidates();},300000);
  loadLedgerReadiness();
  $("refresh-monitor").addEventListener("click",loadMonitor);
  loadMonitor();
  $("refresh-council").addEventListener("click",loadResearchCouncil);
  loadResearchCouncil();
  window.setInterval(loadMonitor,60000);
  window.setInterval(loadResearchCouncil,60000);
})();