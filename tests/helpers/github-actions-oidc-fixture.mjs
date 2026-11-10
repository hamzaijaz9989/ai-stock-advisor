import {generateKeyPairSync,sign} from "node:crypto";

const pair=generateKeyPairSync("rsa",{modulusLength:2048});
export const privateKey=pair.privateKey;
export const publicJwk={...pair.publicKey.export({format:"jwk"}),kid:"northstar-test-kid",alg:"RS256",use:"sig",key_ops:["verify"]};
export const nowSeconds=()=>Math.floor(Date.now()/1000);
export function validClaims(overrides={}) {
 const now=nowSeconds();
 return {
  iss:"https://token.actions.githubusercontent.com",
  aud:"northstar-paper-snapshot",
  sub:"repo:hamzaijaz9989/ai-stock-advisor:ref:refs/heads/main",
  repository:"hamzaijaz9989/ai-stock-advisor",
  repository_id:"1436259839",
  repository_owner:"hamzaijaz9989",
  repository_owner_id:"114642033",
  repository_visibility:"public",
  ref:"refs/heads/main",
  ref_type:"branch",
  event_name:"schedule",
  workflow:"Northstar read-only paper equity snapshots",
  workflow_ref:"hamzaijaz9989/ai-stock-advisor/.github/workflows/northstar-equity-snapshot.yml@refs/heads/main",
  runner_environment:"github-hosted",
  run_id:"123456789",
  run_attempt:"1",
  sha:"a".repeat(40),
  workflow_sha:"b".repeat(40),
  iat:now-5,
  nbf:now-5,
  exp:now+300,
  ...overrides
 };
}
export function makeToken(overrides={},headerOverrides={}) {
 const header={alg:"RS256",kid:publicJwk.kid,typ:"JWT",...headerOverrides};
 const encodedHeader=Buffer.from(JSON.stringify(header)).toString("base64url");
 const encodedPayload=Buffer.from(JSON.stringify(validClaims(overrides))).toString("base64url");
 const signingInput=encodedHeader+"."+encodedPayload;
 const signature=sign("RSA-SHA256",Buffer.from(signingInput),privateKey).toString("base64url");
 return signingInput+"."+signature;
}
