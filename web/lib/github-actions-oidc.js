const JWKS_URL="https://token.actions.githubusercontent.com/.well-known/jwks";
const EXPECTED=Object.freeze({
  issuer:"https://token.actions.githubusercontent.com",
  audience:"northstar-paper-snapshot",
  repository:"hamzaijaz9989/ai-stock-advisor",
  repositoryId:"1436259839",
  owner:"hamzaijaz9989",
  ownerId:"114642033",
  ref:"refs/heads/main",
  workflow:"Northstar read-only paper equity snapshots",
  workflowRef:"hamzaijaz9989/ai-stock-advisor/.github/workflows/northstar-equity-snapshot.yml@refs/heads/main"
});

function decodeBase64Url(value) {
  if(typeof value!=="string"||!value||!/^[A-Za-z0-9_-]+$/.test(value)) throw new TypeError("Invalid base64url.");
  const normalized=value.replace(/-/g,"+").replace(/_/g,"/");
  const padded=normalized+"=".repeat((4-normalized.length%4)%4);
  const binary=atob(padded);
  return Uint8Array.from(binary,character=>character.charCodeAt(0));
}
function decodeJsonPart(value) {
  return JSON.parse(new TextDecoder().decode(decodeBase64Url(value)));
}
function validTimeClaims(claims,nowSeconds) {
  const issuedAt=Number(claims.iat),expiresAt=Number(claims.exp);
  if(!Number.isSafeInteger(issuedAt)||!Number.isSafeInteger(expiresAt)) return false;
  const skew=30;
  if(expiresAt<=nowSeconds-skew||issuedAt>nowSeconds+skew||nowSeconds-issuedAt>600||expiresAt-issuedAt>900) return false;
  if(claims.nbf!==undefined) {
    const notBefore=Number(claims.nbf);
    if(!Number.isSafeInteger(notBefore)||notBefore>nowSeconds+skew) return false;
  }
  return true;
}
function validSubject(subject) {
  return subject==="repo:hamzaijaz9989/ai-stock-advisor:ref:refs/heads/main" ||
    subject==="repo:hamzaijaz9989@114642033/ai-stock-advisor@1436259839:ref:refs/heads/main";
}

/**
 * Verify a short-lived GitHub Actions OIDC token for the one Northstar snapshot workflow.
 * Repository visibility is intentionally not part of the trust decision; the repository
 * visibility discrepancy is separately tracked and must not be silently resolved here.
 */
export async function verifyNorthstarSnapshotOidcToken(token,{fetcher=fetch,now=Date.now(),cryptoImpl=globalThis.crypto}={}) {
  try {
    if(typeof token!=="string"||token.length<100||token.length>16384||!cryptoImpl?.subtle) return null;
    const parts=token.split(".");
    if(parts.length!==3) return null;
    const header=decodeJsonPart(parts[0]);
    const claims=decodeJsonPart(parts[1]);
    if(header?.alg!=="RS256"||typeof header.kid!=="string"||!header.kid) return null;
    const jwksResponse=await fetcher(JWKS_URL,{
      method:"GET",
      headers:{"Accept":"application/json"},
      signal:AbortSignal.timeout(8000)
    });
    if(!jwksResponse?.ok) return null;
    const jwks=await jwksResponse.json();
    const jwk=(Array.isArray(jwks?.keys)?jwks.keys:[]).find(key=>
      key?.kid===header.kid&&key?.kty==="RSA"&&
      (key.alg===undefined||key.alg==="RS256")&&
      (key.use===undefined||key.use==="sig")&&
      (!Array.isArray(key.key_ops)||key.key_ops.includes("verify"))
    );
    if(!jwk) return null;
    const publicKey=await cryptoImpl.subtle.importKey(
      "jwk",jwk,{name:"RSASSA-PKCS1-v1_5",hash:"SHA-256"},false,["verify"]
    );
    const verified=await cryptoImpl.subtle.verify(
      "RSASSA-PKCS1-v1_5",publicKey,decodeBase64Url(parts[2]),
      new TextEncoder().encode(parts[0]+"."+parts[1])
    );
    if(!verified) return null;
    const nowSeconds=Math.floor(now/1000);
    if(claims?.iss!==EXPECTED.issuer||claims?.aud!==EXPECTED.audience||!validTimeClaims(claims,nowSeconds)) return null;
    if(!validSubject(claims.sub)) return null;
    if(claims.repository!==EXPECTED.repository||String(claims.repository_id)!==EXPECTED.repositoryId||
       claims.repository_owner!==EXPECTED.owner||String(claims.repository_owner_id)!==EXPECTED.ownerId) return null;
    if(claims.ref!==EXPECTED.ref||claims.ref_type!=="branch"||claims.workflow!==EXPECTED.workflow||
       claims.workflow_ref!==EXPECTED.workflowRef||claims.runner_environment!=="github-hosted") return null;
    if(!["schedule","workflow_dispatch","push"].includes(claims.event_name)) return null;
    const runId=String(claims.run_id||"");
    const runAttempt=Number(claims.run_attempt);
    if(!/^\d{1,20}$/.test(runId)||!Number.isSafeInteger(runAttempt)||runAttempt<1||runAttempt>1000) return null;
    if(!/^[a-f0-9]{40}$/i.test(String(claims.sha||""))||! /^[a-f0-9]{40}$/i.test(String(claims.workflow_sha||""))) return null;
    return {
      runId,runAttempt,commitSha:String(claims.sha).toLowerCase(),
      workflowSha:String(claims.workflow_sha).toLowerCase(),eventName:claims.event_name
    };
  } catch {
    return null;
  }
}
