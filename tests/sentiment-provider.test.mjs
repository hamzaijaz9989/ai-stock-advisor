import test from "node:test";
import assert from "node:assert/strict";
import {normalizeSentimentProviderPayload,createSentimentProviderAdapter} from "../web/lib/sentiment-provider.js";
import {buildResearchCouncilContext} from "../web/lib/research-council-facts.js";

const good={symbol:"NVDA",observations:[{id:"s-1",timestamp:"2026-11-12T08:00:00Z",population:"retail",metric:"bullish_share",methodology:"Survey responses mapped to a vendor normalized scale.",normalizedScale:"minus1_to_plus1",normalizedScore:0.25,sampleCount:500}]};
test("sentiment adapter accepts only explicit normalized, timestamped, population-specific observations",()=>{
 const result=normalizeSentimentProviderPayload({ticker:"NVDA",asOf:"2026-11-12T09:00:00Z",providerId:"approved-vendor",payload:good});
 assert.equal(result.status,"AVAILABLE");assert.equal(result.observations.length,1);assert.equal(result.observations[0].score,0.25);
 const bad=normalizeSentimentProviderPayload({ticker:"NVDA",asOf:"2026-11-12T09:00:00Z",providerId:"approved-vendor",payload:{symbol:"NVDA",observations:[
  {...good.observations[0],timestamp:"2026-11-12"},{...good.observations[0],timestamp:"2026-11-12T10:00:00Z"},
  {...good.observations[0],normalizedScale:"raw-provider-scale"},{...good.observations[0],population:"all-investors"},
  {...good.observations[0],sampleCount:0}
 ]}});
 assert.equal(bad.status,"UNAVAILABLE");assert.equal(bad.rejectedCount,5);
});

test("provider adapter has a fail-closed no-provider state and calls only an injected approved adapter",async()=>{
 const missing=createSentimentProviderAdapter();
 assert.equal((await missing({ticker:"NVDA",asOf:"2026-11-12T09:00:00Z"})).status,"UNAVAILABLE");
 let calls=0;const adapter=createSentimentProviderAdapter({providerId:"approved-vendor",fetchObservations:async()=>{calls++;return good;}});
 const result=await adapter({ticker:"NVDA",asOf:"2026-11-12T09:00:00Z"});
 assert.equal(result.status,"AVAILABLE");assert.equal(calls,1);
});

test("canonical Council facts retain normalized sentiment provenance and population",()=>{
 const normalized=normalizeSentimentProviderPayload({ticker:"NVDA",asOf:"2026-11-12T09:00:00Z",providerId:"approved-vendor",payload:good});
 const out=buildResearchCouncilContext({ticker:"NVDA",asOf:"2026-11-12T09:00:00Z",portfolio:{verified:true,source:"synthetic-paper-snapshot",asOf:"2026-11-12T09:00:00Z",equityUsd:1000,virtualAllocationUsd:1000,actualAccountEquityUsd:10000,openRiskUsd:0,grossExposureUsd:0,dailyLossFraction:0,weeklyLossFraction:0,drawdownFraction:0,sectorExposureUsd:0,concurrentPositions:0,riskMetricBasis:"actual_alpaca_paper_account_equity"},sentimentObservations:normalized.observations});
 const item=out.evidence.find(x=>x.type==="SENTIMENT_OBSERVATION");
 assert.equal(item.value.population,"retail");assert.equal(item.source,"approved-vendor");
 assert.equal(out.resourceCoverage.roles.sentiment_analyst.status,"PARTIAL");
});
