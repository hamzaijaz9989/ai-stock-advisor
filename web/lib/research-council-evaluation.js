// Deterministic Research Council observability scorecard.
// This measures report-contract hygiene and declared runtime telemetry only.
// It does NOT judge whether claims are true, predict returns, or approve strategies.
const finiteNonNegative = value => typeof value === "number" && Number.isFinite(value) && value >= 0;
const unique = values => [...new Set(values)];
const safeMetric = value => finiteNonNegative(value) ? value : null;

export function evaluateResearchCouncilRun(run, telemetry = {}) {
  if (!run || typeof run !== "object" || !Array.isArray(run.reports)) {
    throw new TypeError("A Research Council result with reports is required.");
  }
  const coverage = run.resourceCoverage?.roles || {};
  const reports = run.reports;
  const agentsByRole = new Map((Array.isArray(run.agents) ? run.agents : []).map(agent => [agent.role, agent]));
  const knownIds = new Set([
    ...(Array.isArray(telemetry.factIds) ? telemetry.factIds : []),
    ...(Array.isArray(telemetry.evidenceIds) ? telemetry.evidenceIds : [])
  ].filter(id => typeof id === "string" && id.length > 0));
  const byRole = {};
  for (const item of reports) {
    const role = item?.role;
    const report = item?.report;
    if (typeof role !== "string" || !report || typeof report !== "object") continue;
    const claims = [
      ...(Array.isArray(report.findings) ? report.findings : []),
      ...(Array.isArray(report.risks) ? report.risks : [])
    ];
    let totalReferences = 0, validReferences = 0, claimsWithValidCitation = 0, invalidReferenceClaims = 0;
    for (const claim of claims) {
      const ids = Array.isArray(claim?.factIds) ? claim.factIds : [];
      totalReferences += ids.length;
      const valid = ids.filter(id => knownIds.has(id));
      validReferences += valid.length;
      if (valid.length) claimsWithValidCitation++;
      if (ids.length === 0 || valid.length !== ids.length) invalidReferenceClaims++;
    }
    const roleTelemetry = telemetry.roles?.[role] || {};
    byRole[role] = {
      status: item.status || agentsByRole.get(role)?.status || "UNKNOWN",
      resourceStatus: coverage[role]?.status || "NOT_REPORTED",
      claimCount: claims.length,
      claimsWithValidCitation,
      claimCitationCoverage: claims.length ? claimsWithValidCitation / claims.length : null,
      totalReferences,
      validReferences,
      citationPrecision: totalReferences ? validReferences / totalReferences : null,
      invalidReferenceClaims,
      latencyMs: safeMetric(roleTelemetry.latencyMs),
      inputTokens: safeMetric(roleTelemetry.inputTokens),
      outputTokens: safeMetric(roleTelemetry.outputTokens),
      totalTokens: safeMetric(roleTelemetry.totalTokens),
      costUsd: safeMetric(roleTelemetry.costUsd),
      provider: typeof roleTelemetry.provider === "string" ? roleTelemetry.provider : null,
      model: typeof roleTelemetry.model === "string" ? roleTelemetry.model : null,
      failed: roleTelemetry.failed === true
    };
  }
  const bull = reports.find(x => x.role === "bull_researcher")?.report;
  const bear = reports.find(x => x.role === "bear_researcher")?.report;
  const idsFor = report => unique([
    ...(Array.isArray(report?.findings) ? report.findings : []),
    ...(Array.isArray(report?.risks) ? report.risks : [])
  ].flatMap(x => Array.isArray(x?.factIds) ? x.factIds.filter(id => knownIds.has(id)) : []));
  const bullIds = idsFor(bull), bearIds = idsFor(bear);
  const sharedDebateEvidenceIds = bullIds.filter(id => bearIds.includes(id));
  const allMetrics = Object.values(byRole);
  const sum = key => allMetrics.reduce((total, metric) => total + (metric[key] ?? 0), 0);
  return {
    schemaVersion: "1.0.0",
    evaluatedAt: typeof telemetry.evaluatedAt === "string" ? telemetry.evaluatedAt : null,
    requestId: run.requestId || null,
    councilVersion: run.version || null,
    councilStatus: run.status || "UNKNOWN",
    evaluationScope: "REPORT_CONTRACT_AND_DECLARED_TELEMETRY_ONLY",
    roles: byRole,
    totals: {
      roleReports: allMetrics.length,
      claims: sum("claimCount"),
      claimsWithValidCitation: sum("claimsWithValidCitation"),
      invalidReferenceClaims: sum("invalidReferenceClaims"),
      totalReferences: sum("totalReferences"),
      validReferences: sum("validReferences"),
      citationPrecision: sum("totalReferences") ? sum("validReferences") / sum("totalReferences") : null,
      claimCitationCoverage: sum("claimCount") ? sum("claimsWithValidCitation") / sum("claimCount") : null,
      telemetryRoles: allMetrics.filter(x => x.latencyMs !== null).length,
      failedInvocations: allMetrics.filter(x => x.failed).length,
      latencyMs: allMetrics.length && allMetrics.every(x => x.latencyMs !== null) ? sum("latencyMs") : null,
      inputTokens: allMetrics.length && allMetrics.every(x => x.inputTokens !== null) ? sum("inputTokens") : null,
      outputTokens: allMetrics.length && allMetrics.every(x => x.outputTokens !== null) ? sum("outputTokens") : null,
      totalTokens: allMetrics.length && allMetrics.every(x => x.totalTokens !== null) ? sum("totalTokens") : null,
      costUsd: allMetrics.length && allMetrics.every(x => x.costUsd !== null) ? sum("costUsd") : null
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
      "No investment performance, predictive accuracy or strategy approval is inferred."
    ]
  };
}
