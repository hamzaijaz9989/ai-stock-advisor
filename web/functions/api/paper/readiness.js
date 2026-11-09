// Safe, read-only status for the durable paper-trading ledger.
import {evaluateStrategyApproval} from "../../../lib/strategy-validation-gate.js";
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
    const [result, strategyApproval] = await Promise.all([
      db.prepare("SELECT enabled, mode, kill_switch, max_portfolio_usd, default_risk_fraction, max_risk_fraction, max_position_fraction FROM execution_control WHERE id = 1").first(),
      db.prepare("SELECT approved,strategy_version,report_version,report_sha256,report_uri,approved_at,reviewer FROM northstar_strategy_approval WHERE id=1").first()
    ]);

    if (!result) {
      return Response.json({
        configured: false,
        executionEnabled: false,
        killSwitchEngaged: true,
        message: "Paper ledger control record is missing. Execution remains unavailable."
      }, { status: 503, headers: HEADERS });
    }

    const policyConfigurationVerified = result.mode === "paper" &&
      Number(result.max_portfolio_usd) === 1000 &&
      Number(result.default_risk_fraction) === 0.005 &&
      Number(result.max_risk_fraction) === 0.01 &&
      Number(result.max_position_fraction) === 0.25;
    const enabled = Number(result.enabled) === 1;
    const killSwitchEngaged = Number(result.kill_switch) === 1;
    const controlStateVerified = (enabled === false && killSwitchEngaged === true) ||
      (enabled === true && killSwitchEngaged === false);
    const safe = policyConfigurationVerified && controlStateVerified;
    const executionEnabled = enabled && !killSwitchEngaged;
    const strategyValidation = evaluateStrategyApproval(strategyApproval);

    return Response.json({
      configured: true,
      policyVerified: safe,
      mode: result.mode,
      executionEnabled,
      killSwitchEngaged,
      strategyValidation,
      strategyValidationApproved: strategyValidation.ok,
      controlStateVerified,
      limits: {
        virtualCapitalUsd: 1000,
        defaultRiskUsd: 5,
        maxRiskUsd: 10,
        maxPositionUsd: 250
      },
      message: !policyConfigurationVerified
        ? "Paper allocation or risk limits do not match the required policy."
        : !controlStateVerified
          ? "Execution enablement and kill-switch state are inconsistent; fail-closed."
          : !strategyValidation.ok
            ? "Paper controls are configured, but strategy validation is not approved. BUY and paper order submission remain blocked."
            : executionEnabled
              ? "Paper-only execution control is enabled. This endpoint verifies control settings only, not complete operational readiness."
              : "Paper execution is disabled and the kill switch is engaged. This endpoint verifies control settings only, not full execution readiness.",
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
