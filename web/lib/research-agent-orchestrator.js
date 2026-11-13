/**
 * Northstar nine-agent orchestration graph.
 * Pure orchestration only: no network, persistence, broker or order authority.
 */
export const NORTHSTAR_AGENT_ORDER = Object.freeze([
  "market_scanner", "technical_analyst", "fundamental_analyst",
  "news_analyst", "sentiment_analyst", "bull_researcher",
  "bear_researcher", "portfolio_analyst", "risk_committee"
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

const unavailable = reason => ({ status: "UNAVAILABLE", findings: [], risks: [], reason });

/**
 * Run enabled specialists in parallel dependency tiers. A worker receives the
 * same canonical evidence plus immutable upstream reports for its dependencies.
 * Disabled roles remain NOT_RUN; missing implementations become UNAVAILABLE.
 */
export async function runNorthstarAgentGraph({
  handlers = {},
  enabledRoles = NORTHSTAR_AGENT_ORDER,
  context = {},
  validate = report => report
} = {}) {
  const enabled = new Set(enabledRoles);
  const results = new Map();
  const pending = new Set(NORTHSTAR_AGENT_ORDER);

  for (const role of NORTHSTAR_AGENT_ORDER) {
    if (!enabled.has(role)) {
      results.set(role, { role, status: "NOT_RUN", reason: "Not enabled for this run." });
      pending.delete(role);
    }
  }

  while (pending.size) {
    const ready = [...pending].filter(role =>
      (NORTHSTAR_AGENT_DEPENDENCIES[role] || []).every(dep => results.has(dep))
    );
    if (!ready.length) {
      for (const role of pending) results.set(role, {
        role, status: "BLOCKED", reason: "Dependency graph contains an unresolved cycle.",
        findings: [], risks: []
      });
      break;
    }

    await Promise.all(ready.map(async role => {
      pending.delete(role);
      const dependencies = NORTHSTAR_AGENT_DEPENDENCIES[role] || [];
      const failed = dependencies.filter(dep => results.get(dep)?.status !== "COMPLETE");
      if (failed.length) {
        results.set(role, {
          role, status: "BLOCKED",
          reason: "Required upstream agents did not complete: " + failed.join(", "),
          findings: [], risks: []
        });
        return;
      }
      const worker = handlers[role];
      if (typeof worker !== "function") {
        results.set(role, { role, ...unavailable("No implementation is registered for this agent.") });
        return;
      }
      try {
        const upstream = Object.fromEntries(dependencies.map(dep => [dep, results.get(dep)]));
        const report = validate(await worker(Object.freeze({
          ...context,
          upstream: Object.freeze(upstream)
        })), role);
        if (!report || !["COMPLETE", "UNAVAILABLE"].includes(report.status) ||
            !Array.isArray(report.findings) || !Array.isArray(report.risks)) {
          throw new Error("Agent report status or contract is invalid.");
        }
        if (report.status === "UNAVAILABLE" && (report.findings.length || report.risks.length)) {
          throw new Error("Unavailable agent reports cannot contain claims.");
        }
        results.set(role, { role, ...report });
      } catch (error) {
        results.set(role, {
          role, status: "BLOCKED",
          reason: String(error?.message || "Agent execution failed.").slice(0, 250),
          findings: [], risks: []
        });
      }
    }));
  }

  const agents = NORTHSTAR_AGENT_ORDER.map(role =>
    results.get(role) || { role, status: "NOT_RUN", reason: "Not scheduled." }
  );
  return Object.freeze({
    agents,
    reports: agents.filter(agent => agent.status === "COMPLETE")
      .map(({ role, ...report }) => ({ role, report })),
    summary: {
      complete: agents.filter(x => x.status === "COMPLETE").length,
      unavailable: agents.filter(x => x.status === "UNAVAILABLE").length,
      blocked: agents.filter(x => x.status === "BLOCKED").length,
      notRun: agents.filter(x => x.status === "NOT_RUN").length
    },
    dependencies: NORTHSTAR_AGENT_DEPENDENCIES
  });
}
