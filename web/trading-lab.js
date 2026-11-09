(() => {
  "use strict";
  const $ = id => document.getElementById(id);
  const CAPITAL = 1000;
  const RISK_PCT_MAX = 1;
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
  $("capital").textContent = money(CAPITAL);
  $("risk-budget").textContent = money(CAPITAL * 0.005);
  $("max-position").textContent = money(CAPITAL * 0.25);

  function calculate() {
    const symbol = String($("symbol").value || "").trim().toUpperCase();
    const entry = Number($("entry").value);
    const stop = Number($("stop").value);
    const riskPct = Number($("risk-pct").value);
    const riskBudget = CAPITAL * Math.min(Math.max(riskPct, 0), RISK_PCT_MAX) / 100;
    const valid = /^[A-Z][A-Z0-9.-]{0,9}$/.test(symbol) &&
      Number.isFinite(entry) && Number.isFinite(stop) && entry > stop && stop > 0 &&
      Number.isFinite(riskPct) && riskPct > 0 && riskPct <= RISK_PCT_MAX;
    if (!valid) {
      $("quantity").textContent = "NO TRADE";
      $("risk-result").textContent = "Enter a valid ticker, an entry above a positive stop, and a risk budget from 0.1% to 1%.";
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
        " · risk budget " + money(riskBudget) + ". Whole-share sizing; gaps can cause larger losses."
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
      });
      row.append(detail, remove);
      root.appendChild(row);
    }
  }

  ["symbol","entry","stop","risk-pct"].forEach(id => $(id).addEventListener("input", calculate));
  $("save-plan").addEventListener("click", () => {
    const result = calculate();
    if (!result) return;
    const plan = {...result, id: (crypto.randomUUID ? crypto.randomUUID() : String(Date.now()) + Math.random().toString(16).slice(2)), createdAt: new Date().toISOString(), status:"PLANNED_NOT_EXECUTED"};
    plans.push(plan);
    if (!savePlans(plans)) {
      plans.pop();
      alert("Browser storage is unavailable. No plan was saved.");
      return;
    }
    renderJournal();
  });
  $("reset-calc").addEventListener("click", () => {
    $("symbol").value = "NVDA";
    $("entry").value = "180";
    $("stop").value = "175";
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
      renderMonitorEvents(data.events);
      if(status)status.textContent="Ledger connected · checked "+monitorTime(data.checkedAt)+" · "+String(data.cadence||"scheduled cadence");
    }catch(error){
      if(status)status.textContent="Monitor unavailable · "+(error?.message||"request failed");
      renderMonitorEvents([]);
      monitorMetric("monitor-run-status","UNAVAILABLE");
      monitorMetric("monitor-run-time","No verified status");
      monitorMetric("monitor-symbols","—");monitorMetric("monitor-errors","—");monitorMetric("monitor-alert-count","—");
    }finally{if(button)button.disabled=false;}
  }
  async function loadCandidates() {
    const status = $("scanner-state");
    const root = $("candidates");
    try {
      const response = await fetch("./data/top-stocks-cache.json", {cache:"no-store", headers:{Accept:"application/json"}});
      if (!response.ok) throw new Error("Cached shortlist unavailable (HTTP " + response.status + ").");
      const data = await response.json();
      const generated = Date.parse(data.generatedAt || "");
      const ageHours = Number.isFinite(generated) ? (Date.now() - generated) / 3600000 : Infinity;
      const stale = ageHours < 0 || ageHours > 4 || data.status !== "success";
      status.textContent = stale ? "Cached data stale / verify" : "Cached screen loaded · verify live";
      root.replaceChildren();
      const rows = Array.isArray(data.stocks)
        ? data.stocks.filter(stock => /^[A-Z][A-Z0-9.-]{0,11}$/.test(String(stock?.ticker || "").trim().toUpperCase())).slice(0,10)
        : [];
      if (!rows.length) throw new Error("No valid cached research candidates were returned.");
      for (const stock of rows) {
        const row = document.createElement("div");
        row.className = "candidate";
        const symbol = String(stock.ticker || "").trim().toUpperCase();
        const openResearch = document.createElement("a");
        openResearch.className = "candidate-link";
        openResearch.href = "./research.html";
        openResearch.setAttribute("aria-label", "Open full Northstar research for " + symbol);
        openResearch.addEventListener("click", () => {
          try { localStorage.setItem("northstar-last-ticker-v2", symbol); } catch {}
        });
        const ticker = document.createElement("span");
        ticker.className = "ticker";
        ticker.textContent = symbol;
        const name = document.createElement("span");
        name.className = "muted small";
        name.textContent = String(stock.name || "Company name unavailable");
        openResearch.append(ticker, name);
        const score = document.createElement("div");
        score.className = "score";
        score.textContent = Number.isFinite(Number(stock.score)) && Number(stock.score) >= 0 && Number(stock.score) <= 100
          ? Number(stock.score).toFixed(1) + "/100" : "—";
        row.append(openResearch, score);
        root.appendChild(row);
      }
      $("cache-note").textContent = (stale ? "WARNING: " : "") +
        "Screen generated " + (Number.isFinite(generated) ? new Date(generated).toLocaleString() : "at an unknown time") +
        ". This is a cached research-priority ranking, not an entry signal. " +
        (stale ? "Do not rely on it for a current decision; run the full live analysis." : "Verify quote, valuation, earnings, news and risk in full analysis.");
    } catch (error) {
      status.textContent = "Scanner unavailable";
      root.replaceChildren();
      const message = document.createElement("p");
      message.className = "muted small";
      message.textContent = error && error.message ? error.message : "Could not load cached candidates.";
      root.appendChild(message);
      $("cache-note").textContent = "No scanner data is available. No candidates have been inferred or fabricated.";
    }
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
      const metrics=[
        ["Strategy total return",fmtPct(data.strategy?.totalReturnPercent),"Daily equity curve; compare with the compounded trade ledger below"],
        ["Trade-ledger compounded return",fmtPct(data.ledgerTotalReturnPercent),"Same entries, exits and assumed costs as the daily equity curve"],
        ["Equity / ledger difference",data.reconciliationDifferencePercent===null||data.reconciliationDifferencePercent===undefined?"—":Number(data.reconciliationDifferencePercent).toFixed(6)+" pp","Expected to be approximately zero"],
        ["Reconciliation status",String(data.reconciliationStatus||"NOT REPORTED"),"A mismatch means do not interpret headline performance"],
        ["Strategy annualized return",fmtPct(data.strategy?.annualizedReturnPercent)],
        ["Strategy maximum drawdown",fmtPct(data.strategy?.maxDrawdownPercent)],
        ["Strategy annualized volatility",fmtPct(data.strategy?.volatilityPercent)],
        ["SPY buy-and-hold return",fmtPct(data.spyBuyHold?.totalReturnPercent)],
        ["SPY maximum drawdown",fmtPct(data.spyBuyHold?.maxDrawdownPercent)],
        ["Completed trades",data.completedTrades??"—","Open-at-end positions are excluded"],
        ["Open at test end",data.openAtEnd??"—"],
        ["Win rate",fmtPct(data.winRatePercent),"Completed trades only"],
        ["Profit factor",Number.isFinite(Number(data.profitFactor))?Number(data.profitFactor).toFixed(2):"INSUFFICIENT DATA"],
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
  loadLedgerReadiness();
  $("refresh-monitor").addEventListener("click",loadMonitor);
  loadMonitor();
  window.setInterval(loadMonitor,60000);
})();