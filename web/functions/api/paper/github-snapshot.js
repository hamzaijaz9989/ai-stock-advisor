// GitHub Actions OIDC bridge for read-only production maintenance.
// It runs only the existing sync -> fill-import -> reconcile handlers. It never
// submits, amends, cancels, or flattens broker orders and cannot change controls.
import { verifyGitHubActionsOidc } from "../../../lib/github-actions-oidc.js";

const H = { "Cache-Control": "no-store", "X-Content-Type-Options": "nosniff", "Referrer-Policy": "no-referrer" };
const EXPECTED_AUDIENCE = "https://ai-stock-advisor.pages.dev";

function response(error, status = 503, extra = {}) {
  return Response.json({ ok: false, execution: false, error, ...extra }, { status, headers: H });
}

function makeInternalRequest(path, token, requestId) {
  return new Request(`https://northstar.internal/api/paper/${path}`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "X-Request-ID": requestId,
      Accept: "application/json"
    }
  });
}

async function invoke(handler, path, env, operatorToken, requestId, successField) {
  const result = await handler({ request: makeInternalRequest(path, operatorToken, requestId), env });
  let body;
  try { body = await result.json(); } catch { return { ok: false, error: "INVALID_HANDLER_RESPONSE" }; }
  if (!result.ok || body?.ok !== true || body?.execution !== false || body?.[successField] !== true) {
    const fallback = body?.[successField] !== true ? `${path.toUpperCase()}_INCOMPLETE` : `${path.toUpperCase()}_FAILED`;
    return { ok: false, error: String(body?.error || fallback).slice(0, 240), status: result.status };
  }
  return { ok: true, body };
}

/** Exported for deterministic tests with injected verification and handlers. */
export async function runReadOnlySnapshotChain({ request, env, verify = verifyGitHubActionsOidc, handlers = null }) {
  if (request?.method !== "POST") return response("POST is required.", 405);
  const authorization = request.headers.get("Authorization") || "";
  if (!authorization.startsWith("Bearer ")) return response("A short-lived GitHub Actions OIDC token is required.", 401);
  const token = authorization.slice(7);
  const identity = await verify(token, { audience: EXPECTED_AUDIENCE });
  if (!identity?.ok) return response("GitHub Actions workflow identity was not verified.", 401);

  const operatorToken = env?.NORTHSTAR_OPERATOR_TOKEN;
  if (typeof operatorToken !== "string" || operatorToken.length < 16) return response("Internal operator credential is unavailable; read-only sync is blocked.", 503);
  const expectedRequestId = `northstar-equity-${identity.runId}-${identity.runAttempt}`;
  const suppliedRequestId = request.headers.get("X-Request-ID") || expectedRequestId;
  if (suppliedRequestId !== expectedRequestId || !/^[A-Za-z0-9._:-]{8,160}$/.test(suppliedRequestId)) return response("Request identifier does not match the verified GitHub Actions run.", 400);
  const db = env?.NORTHSTAR_DB;
  if (!db || typeof db.prepare !== "function") return response("Northstar D1 ledger is unavailable; read-only sync is blocked.", 503);
  // Atomically claim this workflow run/attempt before any internal handler runs.
  // A SELECT followed by handler invocation is race-prone: two replayed requests
  // could both pass the read. INSERT ... SELECT WHERE NOT EXISTS is one SQLite
  // write statement, so D1 serializes competing claims and only one can proceed.
  try {
    const claim = await db.prepare(`
      INSERT INTO execution_audit_log(actor,action,outcome,request_id,details_json)
      SELECT ?,?,?,?,?
      WHERE NOT EXISTS (
        SELECT 1 FROM execution_audit_log WHERE action=? AND request_id=?
      )
    `).bind(
      "github-actions",
      "GITHUB_OIDC_SNAPSHOT_CLAIMED",
      "STARTED",
      suppliedRequestId,
      JSON.stringify({
        runId: identity.runId,
        runAttempt: identity.runAttempt,
        eventName: identity.eventName,
        tokenId: identity.tokenId,
        scope: "read-only-paper-snapshot"
      }),
      "GITHUB_OIDC_SNAPSHOT_CLAIMED",
      suppliedRequestId
    ).run();
    if (Number(claim?.meta?.changes) !== 1) {
      return response("This GitHub Actions run attempt has already been claimed; use a new workflow attempt for a retry.", 409, { stage: "idempotency" });
    }
  } catch {
    return response("Could not atomically claim this scheduled run; read-only sync is blocked.", 503);
  }

  const activeHandlers = handlers || await loadHandlers();
  const sync = await invoke(activeHandlers.syncAccount, "sync", env, operatorToken, `${suppliedRequestId}-sync`, "synced");
  if (!sync.ok) return response("Read-only account snapshot failed; later stages were not run.", 503, { stage: "sync", detail: sync.error });

  const fills = await invoke(activeHandlers.importFills, "fills-sync", env, operatorToken, `${suppliedRequestId}-fills`, "imported");
  if (!fills.ok) return response("Read-only fill import failed; reconciliation was not claimed.", 503, { stage: "fills-sync", detail: fills.error, snapshotCapturedAt: sync.body.capturedAt || null });

  const reconciliation = await invoke(activeHandlers.reconcileAccount, "reconcile", env, operatorToken, `${suppliedRequestId}-reconcile`, "reconciled");
  if (!reconciliation.ok || reconciliation.body.reconciled !== true || reconciliation.body.status !== "RECONCILIATION_PASSED_READ_ONLY") {
    return response("Read-only broker reconciliation did not pass.", 409, { stage: "reconcile", detail: reconciliation.error || "RECONCILIATION_NOT_PASSED", snapshotCapturedAt: sync.body.capturedAt || null });
  }

  return Response.json({
    ok: true,
    execution: false,
    mode: "paper",
    workflow: { runId: identity.runId, runAttempt: identity.runAttempt, eventName: identity.eventName },
    sync: {
      synced: sync.body.synced === true,
      capturedAt: sync.body.capturedAt || null,
      positions: sync.body.snapshot?.positions ?? null
    },
    fills: {
      imported: fills.body.imported === true,
      brokerRecords: fills.body.brokerRecords ?? null,
      newRecords: fills.body.newRecords ?? null,
      alreadyKnown: fills.body.alreadyKnown ?? null,
      pages: fills.body.pages ?? null
    },
    reconciliation: {
      reconciled: true,
      status: reconciliation.body.status,
      counts: reconciliation.body.counts || null,
      checkedAt: reconciliation.body.checkedAt || null
    },
    warnings: [
      "GitHub Actions OIDC authorizes only this exact main-branch read-only workflow.",
      "The internal operator token remains server-side and is never returned.",
      "No broker order was submitted, amended, cancelled, or flattened; execution controls were not changed."
    ]
  }, { headers: H });
}

async function loadHandlers() {
  const [sync, fills, reconcile] = await Promise.all([import("./sync.js"), import("./fills-sync.js"), import("./reconcile.js")]);
  return { syncAccount: sync.onRequestPost, importFills: fills.onRequestPost, reconcileAccount: reconcile.onRequestPost };
}

export async function onRequestPost({ request, env }) {
  return runReadOnlySnapshotChain({ request, env });
}
