const HEADERS = {
  "Cache-Control": "no-store",
  "X-Content-Type-Options": "nosniff",
  "Referrer-Policy": "no-referrer"
};
const respond = (payload, status = 200) => Response.json(payload, {status, headers:HEADERS});
const hasSecret = value => typeof value === "string" && value.trim().length > 0;
const ROLES = Object.freeze([
  "Market Scanner",
  "Technical Analyst",
  "Fundamental Analyst",
  "News Analyst",
  "Sentiment Analyst",
  "Bull Researcher",
  "Bear Researcher",
  "Portfolio Analyst",
  "Deterministic Risk Committee"
]);

export async function onRequestGet({env}) {
  const db = env?.NORTHSTAR_DB;
  if (!db) {
    return respond({
      ok:false,
      status:"UNAVAILABLE",
      error:"Research Council status storage is not configured.",
      execution:false,
      automatedOrderSubmission:false
    }, 503);
  }

  try {
    const [migrationRows, control, runs, equity] = await Promise.all([
      db.prepare("SELECT name FROM d1_migrations WHERE name IN ('0002_research_decision_traces.sql','0003_research_council_runs.sql')").all(),
      db.prepare("SELECT enabled,mode,kill_switch,max_portfolio_usd FROM execution_control WHERE id=1").first(),
      db.prepare("SELECT COUNT(*) AS run_count, MAX(created_at) AS latest_at, (SELECT status FROM research_council_runs ORDER BY created_at DESC LIMIT 1) AS latest_status FROM research_council_runs").first(),
      db.prepare("SELECT COUNT(*) AS snapshot_count, MIN(captured_at) AS oldest_at, MAX(captured_at) AS latest_at FROM paper_equity_snapshots").first()
    ]);

    const names = new Set((migrationRows?.results || []).map(row => row?.name));
    const traceSchemaReady = names.has("0002_research_decision_traces.sql");
    const councilSchemaReady = names.has("0003_research_council_runs.sql");
    const controlsSafe = Boolean(control &&
      Number(control.enabled) === 0 &&
      control.mode === "paper" &&
      Number(control.kill_switch) === 1 &&
      Number(control.max_portfolio_usd) === 1000);

    const now = Date.now();
    const snapshotCount = Number(equity?.snapshot_count || 0);
    const oldestMs = Date.parse(equity?.oldest_at || "");
    const latestMs = Date.parse(equity?.latest_at || "");
    const freshEquitySnapshot = Number.isFinite(latestMs) &&
      now - latestMs <= 15 * 60 * 1000 &&
      latestMs <= now + 30000;
    const sevenDayEquityHistory = snapshotCount >= 2 &&
      Number.isFinite(oldestMs) &&
      oldestMs <= now - 7 * 86400000 &&
      freshEquitySnapshot;

    const modelProviderConfigured = hasSecret(env?.GEMINI_API_KEY) || hasSecret(env?.OPENAI_API_KEY);
    const operatorTokenConfigured = hasSecret(env?.NORTHSTAR_OPERATOR_TOKEN);
    const readOnlyBrokerCredentialsConfigured =
      hasSecret(env?.ALPACA_API_KEY_ID) && hasSecret(env?.ALPACA_API_SECRET_KEY);

    const serverCollectorConfigured = traceSchemaReady && councilSchemaReady &&
      controlsSafe && modelProviderConfigured && operatorTokenConfigured &&
      readOnlyBrokerCredentialsConfigured;
    const readyForReadOnlyPreflight = serverCollectorConfigured &&
      freshEquitySnapshot && sevenDayEquityHistory;

    const blockers = [];
    if (!traceSchemaReady || !councilSchemaReady) blockers.push("COUNCIL_SCHEMA_MISSING");
    if (!modelProviderConfigured) blockers.push("MODEL_PROVIDER_NOT_CONFIGURED");
    if (!operatorTokenConfigured) blockers.push("OPERATOR_AUTH_NOT_CONFIGURED");
    if (!readOnlyBrokerCredentialsConfigured) blockers.push("READ_ONLY_BROKER_CREDENTIALS_NOT_CONFIGURED");
    if (!controlsSafe) blockers.push("PAPER_CONTROLS_NOT_SAFE");
    if (!freshEquitySnapshot) blockers.push("FRESH_EQUITY_SNAPSHOT_MISSING");
    if (!sevenDayEquityHistory) blockers.push("SEVEN_DAY_EQUITY_HISTORY_MISSING");
    // This public endpoint intentionally does not call Alpaca. The operator workflow
    // must still verify account status, open orders and broker/ledger reconciliation.
    blockers.push("READ_ONLY_BROKER_STATE_PREFLIGHT_REQUIRED");

    return respond({
      ok:true,
      asOf:new Date(now).toISOString(),
      status:readyForReadOnlyPreflight ? "READY_FOR_READ_ONLY_PREFLIGHT" : "BLOCKED",
      council:{
        version:"1.0.1",
        roles:ROLES,
        runCount:Number(runs?.run_count || 0),
        latestRunAt:runs?.latest_at || null,
        latestRunStatus:runs?.latest_status || null,
        traceSchemaReady,
        councilSchemaReady,
        modelProviderConfigured
      },
      collector:{
        operatorTokenConfigured,
        readOnlyBrokerCredentialsConfigured,
        paperControlsSafe:controlsSafe,
        freshEquitySnapshot,
        sevenDayEquityHistory,
        serverCollectorConfigured,
        readyForReadOnlyPreflight,
        blockers
      },
      safety:{
        executionEnabled:control ? Number(control.enabled) !== 0 : null,
        killSwitchEngaged:control ? Number(control.kill_switch) === 1 : null,
        mode:control?.mode || null,
        automatedOrderSubmission:false
      },
      execution:false,
      automatedOrderSubmission:false
    });
  } catch {
    return respond({
      ok:false,
      status:"UNAVAILABLE",
      error:"Research Council status could not be verified from the audit ledger.",
      execution:false,
      automatedOrderSubmission:false
    }, 503);
  }
}
