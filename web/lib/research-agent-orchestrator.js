/**
 * Northstar nine-agent orchestration graph.
 *
 * Agents are independent specialists coordinated through a shared, immutable
 * evidence context. Dependencies are explicit; a failed or missing specialist
 * never fabricates a result and never prevents unrelated specialists running.
 * This module has no network, persistence, broker or order capabilities.
 */
export const NORTHSTAR_AGENT_ORDER = Object.freeze([
  "market_scanner",
  "technical_analyst",
  "fundamental_analyst",
  "news_analyst",
  "sentiment_analyst",
  "bull_researcher",
  "bear_researcher",
  "portfolio_analyst",
  "risk_committee"
]);

export const NORTHSTAR_AGENT_DEPENDENCIES = Object.freeze({
  market_scanner: [],
  technical_analyst: [],
  fundamental_analyst: [],
  news_analyst: [],
  sentiment_analyst: [],
  bull_researcher: ["market_scanner", "technical_analyst", "fundamental_analyst", "news_analyst", "sentiment_analyst"],
  bear_researcher: ["market_scanner", "technical_analyst", "fundamental_analyst", "news_analyst", "sentiment_analyst"],
  portfolio_analyst: ["bull_researcher", "bear_researcher", "fundamental_analyst", "technical_analyst"],
  risk_committee: ["portfolio_analyst", "bull_researcher", "bear_researcher"]
});

const TERMINAL = new Set(["COMPLETE", "UNAVAILABLE", "BLOCKED", "NOT_RUN"]);

function unavailable(reason) {
  return { status: "UNAVAILABLE", findings: [], risks: [], reason };
}

/**
 * Run the requested subset of the graph.
 *
 * handlers: role -> async/sync pure specialist
 * enabledRoles: explicit allow-list; every other role remains NOT_RUN
 * context: canonical evidence bundle shared read-only with each worker
 * validate: optional report contract/evidence validator
 */
export async function runNorthstarAgentGraph({
  handlers = {},
  enabledRoles = NORTHSTAR_AGENT_ORDER,
  context = {},
  validate = report => report
} = {}) {
  const enabled = new Set(enabledRoles);
  const results = new Map();

  // Execute independent research specialists concurrently in dependency tiers.
  for (const role of NORTHSTAR_AGENT_ORDER) {
    if (!enabled.has(role)) {
      results.set(role, { role, status: "NOT_RUN", reason: "Not enabled for this run." });
      continue;
    }
    const dependencies = NORTHSTAR_AGENT_DEPENDENCIES[role] || [];
    const missingDependencies = dependencies.filter(dep => {
      const outcome = results.get(dep);
      return !outcome || outcome.status !== "COMPLETE";
    });
    if (missingDependencies.length) {
      results.set(role, {
        role,
        status: "BLOCKED",
        reason: "Required upstream agents did not complete: " + missingDependencies.join(", "),
        findings: [],
        risks: []
      });
      continue;
    }
    const worker = handlers[role];
    if (typeof worker !== "function") {
      results.set(role, { role, ...unavailable("No implementation is registered for this agent.") });
      continue;
    }
    try {
      const upstream = Object.fromEntries(dependencies.map(dep => [dep, results.get(dep)]));
      const report = validate(await worker(Object.freeze({
        ...context,
        upstream: Object.freeze(upstream)
      })), role);
      if (!report || !TERMINAL.has(report.status) || !["COMPLETE", "UNAVAILABLE"].includes(report.status)) {
        throw new Error("Agent report status or contract is invalid.");
      }
      if (!Array.isArray(report.findings) || !Array.isArray(report.risks)) {
        throw new Error("Agent report must contain findings and risks arrays.");
      }
      if (report.status === "UNAVAILABLE" && (report.findings.length || report.risks.length)) {
        throw new Error("Unavailable agent reports cannot contain claims.");
      }
      results.set(role, { role, ...report });
    } catch (error) {
      results.set(role, {
        role,
        status: "BLOCKED",
        reason: String(error?.message || "Agent execution failed.").slice(0, 250),
        findings: [],
        risks: []
      });
    }
  }

  const agents = NORTHSTAR_AGENT_ORDER.map(role =>
    results.get(role) || { role, status: "NOT_RUN", reason: "Not scheduled." }
  );
  return Object.freeze({
    agents,
    reports: agents.filter(agent => agent.status === "COMPLETE").map(({ role, ...report }) => ({ role, report })),
    summary: {
      complete: agents.filter(x => x.status === "COMPLETE").length,
      unavailable: agents.filter(x => x.status === "UNAVAILABLE").length,
      blocked: agents.filter(x => x.status === "BLOCKED").length,
      notRun: agents.filter(x => x.status === "NOT_RUN").length
    },
    dependencies: NORTHSTAR_AGENT_DEPENDENCIES
  });
}
