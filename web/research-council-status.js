(() => {
  "use strict";
  const $ = id => document.getElementById(id);
  const panel = $("research-council-status-panel");
  if (!panel) return;

  const friendly = {
    COUNCIL_SCHEMA_MISSING:"Research Council audit tables are not fully applied.",
    MODEL_PROVIDER_NOT_CONFIGURED:"A server-side AI model provider is not configured.",
    OPERATOR_AUTH_NOT_CONFIGURED:"Protected operator authentication is not configured.",
    READ_ONLY_BROKER_CREDENTIALS_NOT_CONFIGURED:"Read-only Alpaca Paper credentials are not configured.",
    PAPER_CONTROLS_NOT_SAFE:"Paper controls are not in the required disabled and kill-switched state.",
    FRESH_EQUITY_SNAPSHOT_MISSING:"A fresh reconciled equity snapshot (within 15 minutes) is missing.",
    SEVEN_DAY_EQUITY_HISTORY_MISSING:"A fresh snapshot and at least seven days of equity history are required.",
    READ_ONLY_BROKER_STATE_PREFLIGHT_REQUIRED:"An authenticated operator must still verify broker status, open orders and reconciliation."
  };

  async function readJsonResponse(response) {
    const contentType = String(response.headers?.get("content-type") || "").toLowerCase();
    if (!contentType.includes("application/json") && !contentType.includes("+json")) {
      try { await response.text(); } catch {}
      throw new Error("Research Council status endpoint is unavailable in this deployment.");
    }
    try { return await response.json(); }
    catch { throw new Error("Research Council status response was invalid; readiness is not verified."); }
  }

  function set(id, value) {
    const node = $(id);
    if (node) node.textContent = value;
  }

  function dateLabel(value) {
    const date = value ? new Date(value) : null;
    return date && Number.isFinite(date.getTime())
      ? date.toLocaleString()
      : "No production run recorded";
  }

  async function load() {
    set("research-council-status-badge", "CHECKING");
    set("research-council-status-summary", "Checking the nine-agent service and its production audit trail.");
    try {
      const response = await fetch("/api/research/council-status", {
        headers:{Accept:"application/json"},
        cache:"no-store",
        signal:AbortSignal.timeout(8000)
      });
      const data = await readJsonResponse(response);
      if (!response.ok || !data?.ok) throw new Error(data?.error || "Status unavailable.");

      const council = data.council || {};
      const collector = data.collector || {};
      const safety = data.safety || {};
      const ready = collector.readyForReadOnlyPreflight === true;
      const runCount = Number(council.runCount || 0);

      set("research-council-status-badge", ready ? "PREFLIGHT READY" : "GATES BLOCKED");
      set("research-council-status-summary",
        "Nine specialist roles are implemented. " +
        (runCount
          ? runCount + " durable production council run(s) recorded; latest status: " + (council.latestRunStatus || "unknown") + "."
          : "No production council run has been recorded yet.") +
        " This panel reports readiness only; it does not launch a run.");
      set("research-council-run-count", String(runCount));
      set("research-council-run-latest", dateLabel(council.latestRunAt));
      set("research-council-collector-state", ready ? "READY" : "BLOCKED");

      const blockers = Array.isArray(collector.blockers) ? collector.blockers : [];
      const visibleBlockers = blockers.map(code => friendly[code] || code).slice(0, 5);
      set("research-council-blockers", visibleBlockers.length
        ? visibleBlockers.join(" ")
        : "Known configuration and history gates are satisfied; operator preflight is still required.");

      set("research-council-safety",
        "Execution " + (safety.executionEnabled === false ? "disabled" : "not verified") +
        " · kill switch " + (safety.killSwitchEngaged === true ? "engaged" : "not verified") +
        " · automated order submission unavailable.");

      const roles = $("research-council-roles");
      if (roles) {
        roles.replaceChildren();
        for (const role of Array.isArray(council.roles) ? council.roles : []) {
          const item = document.createElement("span");
          item.className = "source-pill";
          item.textContent = role;
          roles.append(item);
        }
      }
      panel.dataset.status = data.status || "UNKNOWN";
    } catch (error) {
      set("research-council-status-badge", "STATUS UNAVAILABLE");
      set("research-council-status-summary", error?.message || "Could not verify the production Research Council status.");
      set("research-council-run-count", "—");
      set("research-council-run-latest", "Audit ledger not verified");
      set("research-council-collector-state", "UNKNOWN");
      set("research-council-blockers", "No readiness claim can be made until the audit ledger responds.");
      set("research-council-safety", "Execution state not verified by this status request.");
      panel.dataset.status = "UNAVAILABLE";
    }
  }

  load();
})();
