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
      const rows = Array.isArray(data.stocks) ? data.stocks.slice(0,5) : [];
      if (!rows.length) throw new Error("No cached research candidates were returned.");
      for (const stock of rows) {
        const row = document.createElement("div");
        row.className = "candidate";
        const ticker = document.createElement("div");
        ticker.className = "ticker";
        ticker.textContent = String(stock.ticker || "—");
        const name = document.createElement("div");
        name.className = "muted small";
        name.textContent = String(stock.name || "Company name unavailable");
        const score = document.createElement("div");
        score.className = "score";
        score.textContent = Number.isFinite(Number(stock.score)) ? Number(stock.score).toFixed(1) + "/100" : "—";
        row.append(ticker, name, score);
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

  calculate();
  renderJournal();
  loadCandidates();
})();