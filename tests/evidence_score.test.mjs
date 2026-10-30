import assert from "node:assert/strict";
import test from "node:test";
import { calculateEvidenceScore } from "../web/evidence-score.mjs";
const full=[
{id:"annual",weight:20,score:1,available:true},{id:"growth",weight:10,score:0.5,available:true},
{id:"cashflow",weight:10,score:1,available:true},{id:"quarter",weight:15,score:0.5,available:true},
{id:"news",weight:15,score:0,available:true},{id:"valuation",weight:10,score:0.5,available:true},
{id:"earnings",weight:5,score:0,available:true},{id:"setup",weight:15,score:1,available:true}];
test("all eight factors produce reproducible 100-point score",()=>{
 const r=calculateEvidenceScore(full); assert.equal(r.valid,true); assert.equal(r.coverage,100);
 assert.equal(r.rawWeightedPoints,62.5); assert.equal(r.normalizedScore,63); assert.equal(r.needleScore,63);
});
test("missing factor weight remains visible in raw contribution and coverage",()=>{
 const r=calculateEvidenceScore(full.map((f,i)=>i===4?{...f,available:false,score:null}:f));
 assert.equal(r.coverage,85); assert.equal(r.rawWeightedPoints,62.5); assert.equal(r.normalizedScore,74);
});
test("critical sector model forces neutral needle",()=>{
 const r=calculateEvidenceScore(full,{forceNeutralReason:"Bank capital and credit-quality model is not implemented."});
 assert.equal(r.coverage,100); assert.equal(r.needleScore,0); assert.equal(r.eligible,false);
});
test("coverage below threshold forces neutral needle",()=>{
 const r=calculateEvidenceScore(full.map((f,i)=>i>=2?{...f,available:false,score:null}:f));
 assert.equal(r.coverage,30); assert.equal(r.needleScore,0); assert.equal(r.eligible,false);
});
test("invalid weights and out-of-range factor scores fail closed",()=>{
 assert.equal(calculateEvidenceScore(full.slice(1)).valid,false);
 assert.equal(calculateEvidenceScore(full.map((f,i)=>i===0?{...f,score:2}:f)).valid,false);
});
