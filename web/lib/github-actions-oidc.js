const ISSUER = "https://token.actions.githubusercontent.com";
const JWKS_URL = `${ISSUER}/.well-known/jwks`;
const DEFAULT_AUDIENCE = "https://ai-stock-advisor.pages.dev";
const EXPECTED_REPOSITORY = "hamzaijaz9989/ai-stock-advisor";
const EXPECTED_REPOSITORY_ID = "1436259839";
const EXPECTED_OWNER_ID = "114642033";
const EXPECTED_REF = "refs/heads/main";
const EXPECTED_WORKFLOW_REF = `${EXPECTED_REPOSITORY}/.github/workflows/northstar-equity-snapshot.yml@${EXPECTED_REF}`;
const ALLOWED_EVENTS = new Set(["schedule", "workflow_dispatch", "push"]);
const CLOCK_SKEW_SECONDS = 60;
const MAX_TOKEN_LIFETIME_SECONDS = 600;
const JWKS_CACHE_MS = 5 * 60 * 1000;

let jwksCache = null;
let jwksCacheAt = 0;

function decodeSegment(value) {
  if (typeof value !== "string" || !/^[A-Za-z0-9_-]+$/.test(value)) throw new Error("JWT_SEGMENT_INVALID");
  const normalized = value.replace(/-/g, "+").replace(/_/g, "/");
  const padded = normalized + "=".repeat((4 - normalized.length % 4) % 4);
  const binary = atob(padded);
  const bytes = Uint8Array.from(binary, character => character.charCodeAt(0));
  return new TextDecoder().decode(bytes);
}

function parseJsonSegment(value) {
  const parsed = JSON.parse(decodeSegment(value));
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) throw new Error("JWT_OBJECT_INVALID");
  return parsed;
}

function audienceMatches(value, expected) {
  return Array.isArray(value) ? value.includes(expected) : value === expected;
}

async function loadJwks(fetcher, now, force = false) {
  if (!force && jwksCache && now - jwksCacheAt < JWKS_CACHE_MS) return jwksCache;
  const response = await fetcher(JWKS_URL, {
    method: "GET",
    headers: { Accept: "application/json" },
    signal: AbortSignal.timeout(5000)
  });
  if (!response?.ok) throw new Error("GITHUB_JWKS_UNAVAILABLE");
  const data = await response.json();
  if (!Array.isArray(data?.keys) || data.keys.length === 0) throw new Error("GITHUB_JWKS_INVALID");
  jwksCache = data;
  jwksCacheAt = now;
  return data;
}

function validateClaims(claims, { audience, nowSeconds }) {
  if (claims.iss !== ISSUER) return "ISSUER_MISMATCH";
  if (!audienceMatches(claims.aud, audience)) return "AUDIENCE_MISMATCH";
  if (claims.repository !== EXPECTED_REPOSITORY) return "REPOSITORY_MISMATCH";
  if (String(claims.repository_id || "") !== EXPECTED_REPOSITORY_ID) return "REPOSITORY_ID_MISMATCH";
  if (String(claims.repository_owner_id || "") !== EXPECTED_OWNER_ID) return "OWNER_ID_MISMATCH";
  if (claims.repository_visibility !== "public" && claims.repository_visibility !== "private") return "REPOSITORY_VISIBILITY_MISMATCH";
  if (claims.ref !== EXPECTED_REF) return "REF_MISMATCH";
  const legacySub = `repo:${EXPECTED_REPOSITORY}:ref:${EXPECTED_REF}`;
  const immutableSub = `repo:hamzaijaz9989@${EXPECTED_OWNER_ID}/ai-stock-advisor@${EXPECTED_REPOSITORY_ID}:ref:${EXPECTED_REF}`;
  if (claims.sub !== legacySub && claims.sub !== immutableSub) return "SUBJECT_MISMATCH";
  if (claims.workflow_ref !== EXPECTED_WORKFLOW_REF) return "WORKFLOW_MISMATCH";
  if (claims.job_workflow_ref && claims.job_workflow_ref !== EXPECTED_WORKFLOW_REF) return "WORKFLOW_MISMATCH";
  if (!ALLOWED_EVENTS.has(claims.event_name)) return "EVENT_MISMATCH";
  if (!/^\d+$/.test(String(claims.run_id || "")) || !/^\d+$/.test(String(claims.run_attempt || ""))) return "RUN_IDENTITY_MISSING";
  if (typeof claims.jti !== "string" || claims.jti.length < 8 || claims.jti.length > 200) return "TOKEN_ID_MISSING";

  const issued = Number(claims.iat);
  const notBefore = Number(claims.nbf);
  const expires = Number(claims.exp);
  if (![issued, notBefore, expires].every(Number.isFinite)) return "TOKEN_TIME_INVALID";
  if (issued > nowSeconds + CLOCK_SKEW_SECONDS || notBefore > nowSeconds + CLOCK_SKEW_SECONDS) return "TOKEN_NOT_YET_VALID";
  if (expires <= nowSeconds - CLOCK_SKEW_SECONDS || expires <= issued) return "TOKEN_EXPIRED";
  if (expires - issued > MAX_TOKEN_LIFETIME_SECONDS) return "TOKEN_LIFETIME_TOO_LONG";
  return null;
}

/**
 * Verifies a short-lived GitHub Actions OIDC token for one exact read-only
 * production workflow. It intentionally does not authorize paper submission,
 * recovery, kill-switch control, or any other operator endpoint.
 */
export async function verifyGitHubActionsOidc(token, {
  audience = DEFAULT_AUDIENCE,
  now = Date.now(),
  fetcher = fetch,
  jwks = null
} = {}) {
  try {
    if (typeof token !== "string" || token.length < 100 || token.length > 16384) return { ok: false, reason: "TOKEN_SIZE_INVALID" };
    const parts = token.split(".");
    if (parts.length !== 3) return { ok: false, reason: "JWT_FORMAT_INVALID" };
    const header = parseJsonSegment(parts[0]);
    const claims = parseJsonSegment(parts[1]);
    if (header.alg !== "RS256" || typeof header.kid !== "string" || !header.kid) return { ok: false, reason: "JWT_ALGORITHM_INVALID" };

    const nowSeconds = Math.floor(now / 1000);
    const claimError = validateClaims(claims, { audience, nowSeconds });
    if (claimError) return { ok: false, reason: claimError };

    let keySet = jwks || await loadJwks(fetcher, now);
    let jwk = keySet.keys.find(key => key?.kid === header.kid && key?.kty === "RSA" && key?.use === "sig" && (!key?.alg || key.alg === "RS256"));
    if (!jwk && !jwks) {
      keySet = await loadJwks(fetcher, now, true);
      jwk = keySet.keys.find(key => key?.kid === header.kid && key?.kty === "RSA" && key?.use === "sig" && (!key?.alg || key.alg === "RS256"));
    }
    if (!jwk) return { ok: false, reason: "SIGNING_KEY_NOT_FOUND" };

    const publicKey = await crypto.subtle.importKey(
      "jwk",
      jwk,
      { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" },
      false,
      ["verify"]
    );
    const signature = Uint8Array.from(atob(parts[2].replace(/-/g, "+").replace(/_/g, "/") + "=".repeat((4 - parts[2].length % 4) % 4)), c => c.charCodeAt(0));
    const signingInput = new TextEncoder().encode(`${parts[0]}.${parts[1]}`);
    const valid = await crypto.subtle.verify("RSASSA-PKCS1-v1_5", publicKey, signature, signingInput);
    if (!valid) return { ok: false, reason: "SIGNATURE_INVALID" };

    return {
      ok: true,
      runId: String(claims.run_id),
      runAttempt: String(claims.run_attempt),
      eventName: claims.event_name,
      tokenId: claims.jti
    };
  } catch {
    return { ok: false, reason: "TOKEN_VERIFICATION_FAILED" };
  }
}

export function resetGitHubActionsOidcCacheForTests() {
  jwksCache = null;
  jwksCacheAt = 0;
}
