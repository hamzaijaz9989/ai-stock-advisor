import test from "node:test";
import assert from "node:assert/strict";
import {webcrypto,generateKeyPairSync,sign} from "node:crypto";
import {verifyNorthstarSnapshotOidcToken} from "../web/lib/github-actions-oidc.js";
import {makeToken,publicJwk,nowSeconds} from "./helpers/github-actions-oidc-fixture.mjs";

const fetcher=async url=>{
 assert.equal(String(url),"https://token.actions.githubusercontent.com/.well-known/jwks");
 return Response.json({keys:[publicJwk]});
};
const options=()=>({fetcher,cryptoImpl:webcrypto});

test("GitHub OIDC accepts the exact scheduled Northstar workflow and immutable repository identity",async()=>{
 const result=await verifyNorthstarSnapshotOidcToken(makeToken(),options());
 assert.deepEqual(result,{runId:"123456789",runAttempt:1,commitSha:"a".repeat(40),workflowSha:"b".repeat(40),eventName:"schedule"});
 const immutable=await verifyNorthstarSnapshotOidcToken(makeToken({sub:"repo:hamzaijaz9989@114642033/ai-stock-advisor@1436259839:ref:refs/heads/main",event_name:"workflow_dispatch"}),options());
 assert.equal(immutable?.eventName,"workflow_dispatch");
});

test("GitHub OIDC does not depend on the unresolved repository visibility claim",async()=>{
 const result=await verifyNorthstarSnapshotOidcToken(makeToken({repository_visibility:"private"}),options());
 assert.ok(result);
});

test("GitHub OIDC rejects wrong repository, owner, branch, workflow, event, audience and runner",async()=>{
 const invalid=[
  {repository_id:"1"},
  {repository_owner_id:"2"},
  {repository:"someone/else"},
  {ref:"refs/heads/feature"},
  {ref_type:"tag"},
  {workflow:"Other workflow"},
  {workflow_ref:"hamzaijaz9989/ai-stock-advisor/.github/workflows/other.yml@refs/heads/main"},
  {event_name:"pull_request"},
  {aud:"https://github.com/hamzaijaz9989"},
  {runner_environment:"self-hosted"},
  {sub:"repo:someone/else:ref:refs/heads/main"}
 ];
 for(const claims of invalid) assert.equal(await verifyNorthstarSnapshotOidcToken(makeToken(claims),options()),null);
});

test("GitHub OIDC rejects expired, future-issued, not-yet-valid and over-age tokens",async()=>{
 const now=nowSeconds();
 for(const claims of [
  {iat:now-400,exp:now-60},
  {iat:now+60,exp:now+300},
  {iat:now-5,nbf:now+60,exp:now+300},
  {iat:now-700,exp:now+300}
 ]) assert.equal(await verifyNorthstarSnapshotOidcToken(makeToken(claims),options()),null);
});

test("GitHub OIDC applies only the configured 30-second clock-skew allowance",async()=>{
 const now=nowSeconds();
 const withinSkew=await verifyNorthstarSnapshotOidcToken(
  makeToken({iat:now-100,exp:now-10}),
  {...options(),now:now*1000}
 );
 assert.ok(withinSkew);
 const outsideSkew=await verifyNorthstarSnapshotOidcToken(
  makeToken({iat:now-100,exp:now-31}),
  {...options(),now:now*1000}
 );
 assert.equal(outsideSkew,null);
});

test("GitHub OIDC rejects non-numeric JWT NumericDate claims",async()=>{
 const now=nowSeconds();
 for(const claims of [
  {iat:String(now-5)},
  {exp:String(now+300)},
  {nbf:null},
  {nbf:String(now-5)}
 ]) assert.equal(await verifyNorthstarSnapshotOidcToken(makeToken(claims),options()),null);
});

test("GitHub OIDC rejects invalid algorithm, malformed token and invalid signature",async()=>{
 assert.equal(await verifyNorthstarSnapshotOidcToken(makeToken({}, {alg:"HS256"}),options()),null);
 assert.equal(await verifyNorthstarSnapshotOidcToken("not.a.jwt",options()),null);
 const wrong=generateKeyPairSync("rsa",{modulusLength:2048});
 const token=makeToken();
 const parts=token.split(".");
 const forged=parts[0]+"."+parts[1]+"."+sign("RSA-SHA256",Buffer.from(parts[0]+"."+parts[1]),wrong.privateKey).toString("base64url");
 assert.equal(await verifyNorthstarSnapshotOidcToken(forged,options()),null);
});

test("GitHub OIDC fails closed when the trusted JWKS endpoint is unavailable",async()=>{
 const result=await verifyNorthstarSnapshotOidcToken(makeToken(),{cryptoImpl:webcrypto,fetcher:async()=>new Response("unavailable",{status:503})});
 assert.equal(result,null);
});
