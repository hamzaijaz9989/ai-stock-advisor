// A database-backed, fail-closed strategy approval gate.
// Approval is an evidence attestation, not a runtime toggle. The initial migration
// seeds the strategy as NOT APPROVED. No BUY path may proceed without a reviewed,
// versioned report whose SHA-256 and reviewer are recorded in D1.
export const REQUIRED_STRATEGY_VERSION = "northstar-provisional-gates-v1";

export function evaluateStrategyApproval(row) {
  const issues = [];
  if (!row) {
    issues.push("STRATEGY_APPROVAL_RECORD_MISSING");
  } else {
    if (Number(row.approved) !== 1) issues.push("STRATEGY_VALIDATION_NOT_APPROVED");
    if (String(row.strategy_version || "") !== REQUIRED_STRATEGY_VERSION) {
      issues.push("STRATEGY_VERSION_MISMATCH");
    }
    const reportVersion = Number(row.report_version);
    if (!Number.isInteger(reportVersion) || reportVersion < 1) {
      issues.push("VALIDATION_REPORT_VERSION_MISSING");
    }
    if (!/^[a-f0-9]{64}$/i.test(String(row.report_sha256 || ""))) {
      issues.push("VALIDATION_REPORT_HASH_MISSING_OR_INVALID");
    }
    if (!/^https:\/\//i.test(String(row.report_uri || ""))) {
      issues.push("VALIDATION_REPORT_URI_MISSING_OR_INVALID");
    }
    if (!Number.isFinite(Date.parse(String(row.approved_at || "")))) {
      issues.push("VALIDATION_APPROVAL_TIMESTAMP_MISSING_OR_INVALID");
    }
    if (!String(row.reviewer || "").trim()) {
      issues.push("INDEPENDENT_REVIEWER_MISSING");
    }
  }
  const ok = issues.length === 0;
  return {
    ok,
    approved: ok,
    execution: false,
    status: ok ? "STRATEGY_VALIDATION_APPROVED" : "STRATEGY_VALIDATION_NOT_APPROVED",
    strategyVersion: REQUIRED_STRATEGY_VERSION,
    reportVersion: row?.report_version == null ? null : Number(row.report_version),
    reportSha256: row?.report_sha256 || null,
    reportUri: row?.report_uri || null,
    approvedAt: row?.approved_at || null,
    reviewer: row?.reviewer || null,
    issues
  };
}
