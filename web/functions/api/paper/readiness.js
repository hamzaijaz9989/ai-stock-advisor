// Safe, read-only status for the durable paper-trading ledger.
// This endpoint never submits, cancels, or modifies broker orders.
const HEADERS = {
  "Cache-Control": "no-store",
  "X-Content-Type-Options": "nosniff",
  "Referrer-Policy": "no-referrer"
};

export async function onRequestGet({ env }) {
  const db = env?.NORTHSTAR_DB;
  if (!db || typeof db.prepare !== "function") {
    return Response.json({
      configured: false,
      executionEnabled: false,
      killSwitchEngaged: true,
      message: "Paper ledger binding is not available in this deployment. No orders can be submitted."
    }, { status: 503, headers: HEADERS });
  }

  try {
    const result = await db.prepare(
      "SELECT enabled, mode, kill_switch, max_portfolio_usd, default_risk_fraction, max_risk_fraction, max_position_fraction FROM execution_control WHERE id = 1"
    ).first();

    if (!result) {
      return Response.json({
        configured: false,
        executionEnabled: false,
        killSwitchEngaged: true,
        message: "Paper ledger control record is missing. Execution remains unavailable."
      }, { status: 503, headers: HEADERS });
    }

    const safe = result.mode === "paper" &&
      Number(result.enabled) === 0 &&
      Number(result.kill_switch) === 1 &&
      Number(result.max_portfolio_usd) === 1000 &&
      Number(result.default_risk_fraction) === 0.005 &&
      Number(result.max_risk_fraction) === 0.01 &&
      Number(result.max_position_fraction) === 0.25;

    return Response.json({
      configured: true,
      policyVerified: safe,
      mode: "paper",
      executionEnabled: false,
      killSwitchEngaged: true,
      limits: {
        virtualCapitalUsd: 1000,
        defaultRiskUsd: 5,
        maxRiskUsd: 10,
        maxPositionUsd: 250
      },
      message: safe
        ? "Ledger is configured. Order execution is deliberately disabled while authentication, risk enforcement, reconciliation and validation are incomplete."
        : "Ledger policy does not match the required fail-closed settings. Execution is unavailable.",
      checkedAt: new Date().toISOString()
    }, { status: safe ? 200 : 503, headers: HEADERS });
  } catch {
    return Response.json({
      configured: false,
      executionEnabled: false,
      killSwitchEngaged: true,
      message: "Paper ledger could not be verified. Execution remains unavailable."
    }, { status: 503, headers: HEADERS });
  }
}
