/**
 * Northstar Research Council: specialist orchestration contract.
 * Provider-neutral: injected workers may be deterministic functions or server-side model adapters.
 * No LLM calls, data fetching, persistence, broker access, or order execution here.
 * Every factual claim must cite supplied fact IDs.
 */
export const COUNCIL_VERSION = "1.0.0";
export const COUNCIL_ROLES = Object.freeze({
  independent: ["market_scanner", "technical_analyst", "fundamental_analyst", "news_analyst", "sentiment_analyst"],
  debate: ["bull_researcher", "bear_researcher"],
  synthesis: ["portfolio_analyst"],
  veto: ["risk_committee"]
});
const validText = value => typeof value === "string" && value.trim().length >= 12;
function freezeDeep(value) {
  if (!value || typeof value !== "object" || Object.isFrozen(value)) return value;
  Object.freeze(value);
  for (const child of Object.values(value)) freezeDeep(child);
  return value;
}
function validateReport(report, validFactIds, role) {
  if (!report || !["COMPLETE", "UNAVAILABLE"].includes(report.status) ||
      !Array.isArray(report.findings) || !Array.isArray(report.risks)) {
    return {ok:false, reason:role+" returned an invalid report contract."};
  }
  if (report.status === "UNAVAILABLE") {
    return {ok:report.findings.length===0, reason:role+" is unavailable."};
  }
  for (const item of [...report.findings, ...report.risks]) {
    if (!validText(item?.claim) || !Array.isArray(item.factIds) || item.factIds.length===0 ||
        item.factIds.some(id => typeof id!=="string" || !validFactIds.has(id))) {
      return {ok:false, reason:role+" emitted an unsupported claim or invalid fact reference."};
    }
  }
  return {ok:true};
}
async function invoke(role, worker, payload, factIds) {
  if (typeof worker !== "function") return {role, status:"UNAVAILABLE", reason:role+" worker not configured."};
  try {
    const report = await worker(freezeDeep(structuredClone(payload)));
    const checked = validateReport(report, factIds, role);
    if (!checked.ok) return {role, status:"BLOCKED", reason:checked.reason};
    return {role, status:report.status, report};
  } catch {
    return {role, status:"UNAVAILABLE", reason:role+" worker failed; details withheld from the public decision."};
  }
}
export async function runResearchCouncil({requestId, context, workers}) {
  if (typeof requestId!=="string" || !/^[a-zA-Z0-9._:-]{8,100}$/.test(requestId)) {
    throw new TypeError("A stable requestId (8–100 safe characters) is required.");
  }
  if (!context || typeof context!=="object" || !Array.isArray(context.facts) ||
      !Array.isArray(context.evidence) || !context.portfolio || typeof context.portfolio!=="object") {
    throw new TypeError("Facts, evidence, and portfolio context are mandatory.");
  }
  const factIds = new Set([...context.facts.map(x=>x?.id), ...context.evidence.map(x=>x?.id)]
    .filter(x=>typeof x==="string" && x.length>0));
  if (!factIds.size || context.facts.some(x=>!x?.id) || context.evidence.some(x=>!x?.id)) {
    throw new TypeError("Every supplied fact and evidence item requires a stable ID.");
  }
  const safeWorkers = workers || {};
  const base = {requestId, ticker:context.ticker, asOf:context.asOf, facts:context.facts,
    evidence:context.evidence, portfolio:context.portfolio};
  const independent = await Promise.all(COUNCIL_ROLES.independent.map(role =>
    invoke(role, safeWorkers[role], base, factIds)));
  const analystReady = independent.every(x=>x.status==="COMPLETE");
  let debate=[], synthesis=null, risk=null;
  if (analystReady) {
    const debatePayload={...base, analystReports:independent.map(x=>({role:x.role,report:x.report}))};
    debate=await Promise.all(COUNCIL_ROLES.debate.map(role =>
      invoke(role,safeWorkers[role],debatePayload,factIds)));
    if (debate.every(x=>x.status==="COMPLETE")) {
      synthesis=await invoke("portfolio_analyst",safeWorkers.portfolio_analyst,
        {...debatePayload,debateReports:debate.map(x=>({role:x.role,report:x.report}))},factIds);
      if (synthesis.status==="COMPLETE") {
        risk=await invoke("risk_committee",safeWorkers.risk_committee,
          {...base,analystReports:independent.map(x=>({role:x.role,report:x.report})),
            debateReports:debate.map(x=>({role:x.role,report:x.report})),portfolioReport:synthesis.report},factIds);
      }
    }
  }
  const all = [...independent,...debate,...(synthesis?[synthesis]:[]),...(risk?[risk]:[])];
  const riskDecision = risk?.report?.decision;
  const approvedForReview = analystReady && debate.length===2 &&
    debate.every(x=>x.status==="COMPLETE") && synthesis?.status==="COMPLETE" &&
    risk?.status==="COMPLETE" && riskDecision==="ACCEPT_FOR_REVIEW" &&
    Array.isArray(risk.report.vetoReasons) && risk.report.vetoReasons.length===0;
  return {
    version:COUNCIL_VERSION, requestId, ticker:context.ticker||null, asOf:context.asOf||null,
    status:approvedForReview?"RESEARCH_REVIEW_REQUIRED":"NO_TRADE",
    execution:false, automatedOrderSubmission:false,
    decisionAuthority:"Deterministic Northstar risk and validation gates remain authoritative; council output is advisory only.",
    agents:all.map(x=>({role:x.role,status:x.status,reason:x.reason||null})),
    reports:all.filter(x=>x.report).map(x=>({role:x.role,report:x.report})),
    vetoReasons:approvedForReview?[]:[
      ...all.filter(x=>x.status!=="COMPLETE").map(x=>x.reason||x.role+" did not complete."),
      ...(risk && riskDecision!=="ACCEPT_FOR_REVIEW"?["Risk committee did not explicitly accept the candidate for human review."]:[]),
      ...(risk?.report?.vetoReasons||[])
    ],
    traceDurable:false,
    warning:"Specialist reports are not proof of truth. Every claim must cite supplied fact IDs. NO_TRADE is the default. An accepted council result is only eligible for separate deterministic validation and human review; it is never an order."
  };
}
