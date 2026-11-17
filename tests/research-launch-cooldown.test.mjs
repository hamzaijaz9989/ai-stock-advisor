import test from "node:test";
import assert from "node:assert/strict";
import {consumesResearchLaunchCooldown} from "../web/lib/research-launch-cooldown.js";

const roles=["market_scanner","technical_analyst","fundamental_analyst","news_analyst","sentiment_analyst","bull_researcher","bear_researcher","portfolio_analyst","risk_committee"];

test("an active provider collection reserves the public launch cooldown",()=>{
 assert.equal(consumesResearchLaunchCooldown({vetoReasons:["Research collection is in progress."],agents:roles.map(role=>({role,status:"NOT_RUN"}))}),true);
});

test("pre-agent collection failures do not consume the public launch cooldown",()=>{
 assert.equal(consumesResearchLaunchCooldown({vetoReasons:["Research collection failed before agents could run: network timeout"],agents:roles.map(role=>({role,status:"NOT_RUN"}))}),false);
});

test("a dispatched specialist launch consumes cooldown even if it failed",()=>{
 assert.equal(consumesResearchLaunchCooldown({vetoReasons:["technical_analyst failed"],agents:[{role:"technical_analyst",status:"FAILED"}]}),true);
});

test("unknown persisted states fail closed for throttling",()=>{
 assert.equal(consumesResearchLaunchCooldown(null),true);
 assert.equal(consumesResearchLaunchCooldown({}),true);
});
