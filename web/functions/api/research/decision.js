import { runAgentPipeline } from "../../../lib/agent-pipeline.js";

const HEADERS = {
  "Cache-Control": "no-store",
  "X-Content-Type-Options": "nosniff",
  "Referrer-Policy": "no-referrer"
};
const MAX_BODY_BYTES = 32768;
const respond = (payload, status = 200) => Response.json(payload, {status, headers: HEADERS});

function authorized(request, token) {
  const expected = typeof token === "string" && token ? "Bearer " + token : "";
  const actual = request.headers.get("Authorization") || "";
  if (!expected || actual.length !== expected.length) return false;
  let mismatch = 0;
  for (let i = 0; i < expected.length; i++) mismatch |= actual.charCodeAt(i) ^ expected.charCodeAt(i);
  return mismatch === 0;
}

function stable(value) {
  if (Array.isArray(value)) return "[" + value.map(stable).join(",") + "]";
  if (value && typeof value === "object") {
    return "{" + Object.keys(value).sort().map(key => JSON.stringify(key) + ":" + stable(value[key])).join(",") + "}";
  }
  return JSON.stringify(value);
}

async function sha256(value) {
  const bytes = new TextEncoder().encode(value);
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return Array.from(new Uint8Array(digest), byte => byte.toString(16).padStart(2, "0")).join("");
}

export async function onRequestPost({request, env}) {
  if (!authorized(request, env?.NORTHSTAR_OPERATOR_TOKEN)) {
    return respond({ok:false, execution:false, error:"Unauthorized."}, 401);
  }
  if (!env?.NORTHSTAR_DB) {
    return respond({ok:false, execution:false, traceDurable:false, error:"Decision ledger unavailable; request not accepted."}, 503);
  }
  const declaredLength = Number(request.headers.get("Content-Length") || 0);
  if (declaredLength > MAX_BODY_BYTES) return respond({ok:false, execution:false, error:"Request body too large."}, 413);
  const raw = await request.text();
  if (new TextEncoder().encode(raw).byteLength > MAX_BODY_BYTES) return respond({ok:false, execution:false, error:"Request body too large."}, 413);
  let body;
  try { body = JSON.parse(raw); } catch { return respond({ok:false, execution:false, error:"Valid JSON body required."}, 400); }
  const requestId = typeof body?.requestId === "string" ? body.requestId.trim() : "";
  if (!/^[A-Za-z0-9._:-]{8,128}$/.test(requestId)) {
    return respond({ok:false, execution:false, error:"A stable requestId (8-128 safe characters) is required."}, 400);
  }
  if (!body?.candidate || typeof body.candidate !== "object" || Array.isArray(body.candidate)) {
    return respond({ok:false, execution:false, error:"Candidate object required."}, 400);
  }

  try {
    const input = stable(body.candidate);
    const inputHash = await sha256(input);
    const result = runAgentPipeline(body.candidate);
    const symbol = /^[A-Z][A-Z0-9.]{0,9}$/.test(String(body.candidate.symbol || "").trim().toUpperCase())
      ? String(body.candidate.symbol).trim().toUpperCase() : "INVALID";
    const trace = {
      schemaVersion: 1,
      requestId,
      symbol,
      status: result.status,
      decision: result.decision,
      failedStage: result.failedStage || null,
      reason: result.reason || null,
      result,
      execution: false,
      automatedOrderSubmission: false
    };
    const traceJson = JSON.stringify(trace);
    await env.NORTHSTAR_DB.prepare(
      "INSERT INTO research_decision_traces (request_id, input_sha256, symbol, status, decision, failed_stage, reason, trace_json) VALUES (?, ?, ?, ?, ?, ?, ?, ?) ON CONFLICT(request_id) DO NOTHING"
    ).bind(requestId, inputHash, symbol, result.status, result.decision, result.failedStage || null, result.reason || null, traceJson).run();

    const stored = await env.NORTHSTAR_DB.prepare(
      "SELECT input_sha256, trace_json, created_at FROM research_decision_traces WHERE request_id = ?"
    ).bind(requestId).first();
    if (!stored) return respond({ok:false, execution:false, traceDurable:false, error:"Decision trace could not be confirmed in the ledger."}, 503);
    if (stored.input_sha256 !== inputHash) {
      return respond({ok:false, execution:false, traceDurable:true, error:"requestId was already used for a different candidate."}, 409);
    }
    let persistedTrace;
    try { persistedTrace = JSON.parse(stored.trace_json); } catch {
      return respond({ok:false, execution:false, traceDurable:false, error:"Stored decision trace failed integrity parsing."}, 503);
    }
    return respond({
      ok:true,
      execution:false,
      automatedOrderSubmission:false,
      traceDurable:true,
      replayed: persistedTrace.requestId === requestId && persistedTrace !== trace,
      createdAt: stored.created_at,
      trace: persistedTrace
    });
  } catch {
    return respond({ok:false, execution:false, traceDurable:false, error:"Decision trace persistence failed; no order action was taken."}, 503);
  }
}
