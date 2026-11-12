// Deterministic Research Council observability scorecard.
// This measures report-contract hygiene and declared runtime telemetry only.
// It does NOT judge whether claims are true, predict returns, or approve strategies.
const ROLE_ORDER = Object.freeze([
  "market_scanner","technical_analyst","fundamental_analyst","news_analyst",
  "sentiment_analyst","bull_researcher","bear_researcher","portfolio_analyst","risk_committee"
]);
// Only Bull, Bear and Portfolio use model providers. The other six roles are deterministic;
// their latency/provider/model telemetry is retained, but token/cost metrics must remain null.
const MODEL_ROLES = Object.freeze(["bull_researcher","bear_researcher","portfolio_analyst"]);
const finiteNonNegative = value => typeof value === "number" && Number.isFinite(value) && value >= 0;
const unique = values => [...new Set(values)];
const safeMetric = value => finiteNonNegative(value) ? value : null;

export function evaluateResearchCouncilRun(run, telemetry = {}) {
  if (!run || typeof run !== "object" || !Array.isArray(run.reports)) {
    throw new TypeError("A Research Council result with reports is required.");
  }
  const coverage = run.resourceCoverage?.roles || {};
  const reports = run.reports;
  const reportByRole = new Map(reports.filter(x => typeof x?.role === "string" && x?.report && typeof x.report === "object").map(x => [x.role,x]));
  const agentsByRole = new Map((Array.isArray(run.agents) ? run.agents : []).map(agent => [agent.role, agent]));
  const roleTelemetryMap = telemetry.roles && typeof telemetry.roles === "object" ? telemetry.roles : {};
  const roleNames = unique([
    ...ROLE_ORDER,
    ...reports.map(x => x?.role).filter(x => typeof x === "string"),
    ...Object.keys(coverage),
    ...Object.keys(roleTelemetryMap)
  ]);
  const knownIds = new Set([
    ...(Array.isArray(telemetry.factIds) ? telemetry.factIds : []),
    ...(Array.isArray(telemetry.evidenceIds) ? telemetry.evidenceIds : [])
  ].filter(id => typeof id === "string" && id.length > 0));
  const byRole = {};
  for (const role of roleNames) {
    const item = reportByRole.get(role);
    const report = item?.report || null;
    const claims = report ? [
      ...(Array.isArray(report.findings) ? report.findings : []),
      ...(Array.isArray(report.risks) ? report.risks : [])
    ] : [];
    let totalReferences = 0, validReferences = 0, claimsWithValidCitation = 0, invalidReferenceClaims = 0;
    for (const claim of claims) {
      const ids = Array.isArray(claim?.factIds) ? claim.factIds : [];
      totalReferences += ids.length;
      const valid = ids.filter(id => knownIds.has(id));
      validReferences += valid.length;
      if (valid.length) claimsWithValidCitation++;
      if (ids.length === 0 || valid.length !== ids.length) invalidReferenceClaims++;
    }
    const roleTelemetry = roleTelemetryMap[role] || {};
    const agent = agentsByRole.get(role);
    byRole[role] = {
      status: item?.status || agent?.status || "NOT_REPORTED",
      reportPresent: !!report,
      resourceStatus: coverage[role]?.status || "NOT_REPORTED",
      claimCount: claims.length,
      claimsWithValidCitation,
      claimCitationCoverage: claims.length ? claimsWithValidCitation / claims.length : null,
      totalReferences,
      validReferences,
      citationPrecision: totalReferences ? validReferences / totalReferences : null,
      invalidReferenceClaims,
      latencyMs: safeMetric(roleTelemetry.latencyMs),
      inputTokens: MODEL_ROLES.includes(role) ? safeMetric(roleTelemetry.inputTokens) : null,
      outputTokens: MODEL_ROLES.includes(role) ? safeMetric(roleTelemetry.outputTokens) : null,
      totalTokens: MODEL_ROLES.includes(role) ? safeMetric(roleTelemetry.totalTokens) : null,
      costUsd: MODEL_ROLES.includes(role) ? safeMetric(roleTelemetry.costUsd) : null,
      provider: typeof roleTelemetry.provider === "string" ? roleTelemetry.provider : null,
      model: typeof roleTelemetry.model === "string" ? roleTelemetry.model : null,
      failed: roleTelemetry.failed === true
    };
  }
  const bull = reportByRole.get("bull_researcher")?.report;
  const bear = reportByRole.get("bear_researcher")?.report;
  const idsFor = report => unique([
    ...(Array.isArray(report?.findings) ? report.findings : []),
    ...(Array.isArray(report?.risks) ? report.risks : [])
  ].flatMap(x => Array.isArray(x?.factIds) ? x.factIds.filter(id => knownIds.has(id)) : []));
  const bullIds = idsFor(bull), bearIds = idsFor(bear);
  const sharedDebateEvidenceIds = bullIds.filter(id => bearIds.includes(id));
  const allMetrics = Object.values(byRole);
  const reportedMetrics = allMetrics.filter(metric => metric.reportPresent);
  const modelMetrics = MODEL_ROLES.map(role => byRole[role]);
  const sum = (metrics,key) => metrics.reduce((total,metric) => total + (metric[key] ?? 0),0);
  const allMeasured = (metrics,key) => metrics.length > 0 && metrics.every(metric => metric[key] !== null);
  const claims = sum(reportedMetrics,"claimCount");
  const citedClaims = sum(reportedMetrics,"claimsWithValidCitation");
  const references = sum(reportedMetrics,"totalReferences");
  const validReferences = sum(reportedMetrics,"validReferences");
  return {
    schemaVersion: "1.0.0",
    evaluatedAt: typeof telemetry.evaluatedAt === "string" ? telemetry.evaluatedAt : null,
    requestId: run.requestId || null,
    councilVersion: run.version || null,
    councilStatus: run.status || "UNKNOWN",
    evaluationScope: "REPORT_CONTRACT_AND_DECLARED_TELEMETRY_ONLY",
    roles: byRole,
    totals: {
      roleCount: allMetrics.length,
      roleReports: reportedMetrics.length,
      rolesComplete: allMetrics.filter(x => x.status === "COMPLETE").length,
      rolesBlocked: allMetrics.filter(x => x.status === "BLOCKED").length,
      rolesUnavailable: allMetrics.filter(x => x.status === "UNAVAILABLE").length,
      claims,
      claimsWithValidCitation: citedClaims,
      invalidReferenceClaims: sum(reportedMetrics,"invalidReferenceClaims"),
      totalReferences: references,
      validReferences,
      citationPrecision: references ? validReferences / references : null,
      claimCitationCoverage: claims ? citedClaims / claims : null,
      telemetryRoles: allMetrics.filter(x => x.latencyMs !== null).length,
      failedInvocations: allMetrics.filter(x => x.failed).length,
      latencyMs: allMeasured(allMetrics,"latencyMs") ? sum(allMetrics,"latencyMs") : null,
      inputTokens: allMeasured(modelMetrics,"inputTokens") ? sum(modelMetrics,"inputTokens") : null,
      outputTokens: allMeasured(modelMetrics,"outputTokens") ? sum(modelMetrics,"outputTokens") : null,
      totalTokens: allMeasured(modelMetrics,"totalTokens") ? sum(modelMetrics,"totalTokens") : null,
      costUsd: allMeasured(modelMetrics,"costUsd") ? sum(modelMetrics,"costUsd") : null
    },
    debate: {
      bullCitedEvidenceCount: bullIds.length,
      bearCitedEvidenceCount: bearIds.length,
      sharedCitedEvidenceCount: sharedDebateEvidenceIds.length,
      sharedEvidenceIds: sharedDebateEvidenceIds
    },
    limitations: [
      "Valid fact IDs prove reference integrity, not factual truth or source correctness.",
      "Citation coverage does not measure whether a citation actually supports the associated claim.",
      "Bull/bear shared-evidence counts do not measure reasoning quality, independence or meaningful disagreement.",
      "Latency, token and cost values are null unless explicitly supplied by trusted runtime telemetry.",
      "Aggregate latency is the sum of measured role invocation durations, not end-to-end wall-clock time; independent stages may run in parallel.",
      "Provider token totals cover the eight model specialists only; deterministic risk-committee work has no model-token usage.",
      "No investment performance, predictive accuracy or strategy approval is inferred."
    ]
  };
}
