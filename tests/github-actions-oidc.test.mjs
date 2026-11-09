import test from "node:test";
import assert from "node:assert/strict";
import { webcrypto } from "node:crypto";
import { verifyGitHubActionsOidc } from "../web/lib/github-actions-oidc.js";

globalThis.crypto ||= webcrypto;

const repo = "hamzaijaz9989/ai-stock-advisor";
const workflowRef = `${repo}/.github/workflows/northstar-equity-snapshot.yml@refs/heads/main`;
const audience = "https://ai-stock-advisor.pages.dev";
const now = 1_795_000_000_000;
const encoder = new TextEncoder();
const b64url = bytes => Buffer.from(bytes).toString("base64url");
const jsonPart = value => b64url(encoder.encode(JSON.stringify(value)));

let pair;
let publicJwk;
let jwks;

async function token(overrides = {}, headerOverrides = {}) {
  const claims = {
    iss: "https://token.actions.githubusercontent.com",
    aud: audience,
    sub: `repo:hamzaijaz9989@114642033/ai-stock-advisor@1436259839:ref:refs/heads/main`,
    repository: repo,
    repository_id: "1436259839",
    repository_owner_id: "114642033",
    repository_visibility: "public",
    ref: "refs/heads/main",
    workflow_ref: workflowRef,
    job_workflow_ref: workflowRef,
    event_name: "schedule",
    run_id: "42600060799",
    run_attempt: "1",
    jti: "unit-test-token-id-0001",
    iat: Math.floor(now / 1000) - 5,
    nbf: Math.floor(now / 1000) - 5,
    exp: Math.floor(now / 1000) + 240,
    ...overrides
  };
  const header = { alg: "RS256", typ: "JWT", kid: "northstar-test-key", ...headerOverrides };
  const input = `${jsonPart(header)}.${jsonPart(claims)}`;
  const signature = await crypto.subtle.sign("RSASSA-PKCS1-v1_5", pair.privateKey, encoder.encode(input));
  return `${input}.${b64url(new Uint8Array(signature))}`;
}

test.before(async () => {
  pair = await crypto.subtle.generateKey({
    name: "RSASSA-PKCS1-v1_5",
    modulusLength: 2048,
    publicExponent: new Uint8Array([1, 0, 1]),
    hash: "SHA-256"
  }, true, ["sign", "verify"]);
  publicJwk = await crypto.subtle.exportKey("jwk", pair.publicKey);
  publicJwk.kid = "northstar-test-key";
  publicJwk.alg = "RS256";
  publicJwk.use = "sig";
  jwks = { keys: [publicJwk] };
});

test("accepts a valid signed token from the exact read-only main workflow", async () => {
  const result = await verifyGitHubActionsOidc(await token(), { audience, now, jwks });
  assert.deepEqual(result, { ok: true, runId: "42600060799", runAttempt: "1", eventName: "schedule", tokenId: "unit-test-token-id-0001" });
});

test("accepts the legacy subject format for older repositories with the same pinned immutable IDs", async () => {
  const legacy = await token({ sub: `repo:${repo}:ref:refs/heads/main` });
  assert.equal((await verifyGitHubActionsOidc(legacy, { audience, now, jwks })).ok, true);
});

test("accepts the explicitly permitted manual and main push events", async () => {
  for (const eventName of ["workflow_dispatch", "push"]) {
    const result = await verifyGitHubActionsOidc(await token({ event_name: eventName }), { audience, now, jwks });
    assert.equal(result.ok, true, eventName);
  }
});

test("rejects malformed, oversized and non-RS256 tokens", async () => {
  assert.equal((await verifyGitHubActionsOidc("x.y", { audience, now, jwks })).ok, false);
  assert.equal((await verifyGitHubActionsOidc("a".repeat(16385), { audience, now, jwks })).ok, false);
  assert.equal((await verifyGitHubActionsOidc(await token({}, { alg: "none" }), { audience, now, jwks })).reason, "JWT_ALGORITHM_INVALID");
});

test("accepts the exact pinned repository when its visibility is private or public", async () => {
  for (const repository_visibility of ["private", "public"]) {
    const result = await verifyGitHubActionsOidc(await token({ repository_visibility }), { audience, now, jwks });
    assert.equal(result.ok, true, repository_visibility);
  }
});

test("rejects wrong repository, immutable repository ID, owner ID, invalid visibility and branch", async () => {
  const cases = [
    [{ repository: "attacker/other" }, "REPOSITORY_MISMATCH"],
    [{ repository_id: "1" }, "REPOSITORY_ID_MISMATCH"],
    [{ repository_owner_id: "2" }, "OWNER_ID_MISMATCH"],
    [{ repository_visibility: "internal" }, "REPOSITORY_VISIBILITY_MISMATCH"],
    [{ ref: "refs/heads/feature" }, "REF_MISMATCH"],
    [{ sub: "repo:hamzaijaz9989/ai-stock-advisor:pull_request" }, "SUBJECT_MISMATCH"]
  ];
  for (const [override, reason] of cases) assert.equal((await verifyGitHubActionsOidc(await token(override), { audience, now, jwks })).reason, reason);
});

test("rejects other workflows and unapproved event types", async () => {
  assert.equal((await verifyGitHubActionsOidc(await token({ workflow_ref: "other.yml" }), { audience, now, jwks })).reason, "WORKFLOW_MISMATCH");
  assert.equal((await verifyGitHubActionsOidc(await token({ job_workflow_ref: "other.yml" }), { audience, now, jwks })).reason, "WORKFLOW_MISMATCH");
  assert.equal((await verifyGitHubActionsOidc(await token({ event_name: "pull_request" }), { audience, now, jwks })).reason, "EVENT_MISMATCH");
});

test("rejects wrong audience and invalid time windows", async () => {
  assert.equal((await verifyGitHubActionsOidc(await token({ aud: "https://wrong.example" }), { audience, now, jwks })).reason, "AUDIENCE_MISMATCH");
  assert.equal((await verifyGitHubActionsOidc(await token({ exp: Math.floor(now / 1000) - 120 }), { audience, now, jwks })).reason, "TOKEN_EXPIRED");
  assert.equal((await verifyGitHubActionsOidc(await token({ nbf: Math.floor(now / 1000) + 120 }), { audience, now, jwks })).reason, "TOKEN_NOT_YET_VALID");
  assert.equal((await verifyGitHubActionsOidc(await token({ exp: Math.floor(now / 1000) + 900 }), { audience, now, jwks })).reason, "TOKEN_LIFETIME_TOO_LONG");
});

test("rejects unknown signing keys and modified signatures", async () => {
  assert.equal((await verifyGitHubActionsOidc(await token({}, { kid: "unknown" }), { audience, now, jwks })).reason, "SIGNING_KEY_NOT_FOUND");
  const valid = await token();
  const parts = valid.split(".");
  const tampered = `${parts[0]}.${jsonPart({ ...JSON.parse(Buffer.from(parts[1], "base64url").toString()), actor: "attacker" })}.${parts[2]}`;
  assert.equal((await verifyGitHubActionsOidc(tampered, { audience, now, jwks })).reason, "SIGNATURE_INVALID");
});

test("loads GitHub's fixed JWKS URL and never trusts a token-supplied key URL", async () => {
  const valid = await token();
  let requested = null;
  const result = await verifyGitHubActionsOidc(valid, {
    audience,
    now,
    fetcher: async url => {
      requested = String(url);
      return { ok: true, json: async () => jwks };
    }
  });
  assert.equal(result.ok, true);
  assert.equal(requested, "https://token.actions.githubusercontent.com/.well-known/jwks");
});
