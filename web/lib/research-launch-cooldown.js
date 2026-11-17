// Count only launches that are actively collecting or dispatched to at least one
// specialist. A durable pre-agent collection failure remains retryable immediately.
export function consumesResearchLaunchCooldown(result) {
  if (!result || typeof result !== "object") return true;
  const reasons = Array.isArray(result.vetoReasons) ? result.vetoReasons : [];
  if (reasons.some(reason => typeof reason === "string" &&
      /research collection is in progress|awaiting provider collection/i.test(reason))) return true;
  if (!Array.isArray(result.agents)) return true; // Unknown durable state fails closed.
  return result.agents.some(agent => agent &&
    !["NOT_RUN", "PENDING", "SKIPPED"].includes(agent.status));
}
