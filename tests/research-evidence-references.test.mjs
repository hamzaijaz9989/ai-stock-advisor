import test from "node:test";
import assert from "node:assert/strict";
import {buildResearchEvidenceReferences} from "../web/lib/research-evidence-references.js";
test("durable provenance contains only cited IDs and bounded attribution metadata",()=>{
 const context={facts:[
  {id:"f1",type:"QUOTE",source:"Finnhub",observedAt:"2026-11-17T10:00:00Z",value:{price:123.45,title:"Should not persist raw value"}},
  {id:"f2",type:"FINANCIAL_FACT",source:"SEC EDGAR",observedAt:"2026-11-01T00:00:00Z",value:{period:"FY2025",revenue:999999}},
  {id:"unused",type:"QUOTE",source:"Unused",observedAt:null,value:{price:1}}
 ],evidence:[{id:"n1",type:"NEWS_DISCOVERY",source:"Reuters",observedAt:"2026-11-17T09:30:00Z",value:{title:"Attributed headline",body:"private raw article"}}]};
 const result={agents:[{findings:[{factIds:["f1","n1","unknown"]}],risks:[{factIds:["f2","f1"]}]}]};
 const refs=buildResearchEvidenceReferences(context,result);
 assert.deepEqual(refs.map(x=>x.factId),["f1","f2","n1"]);
 assert.equal(refs[0].source,"Finnhub");assert.equal(refs[0].observedAt,"2026-11-17T10:00:00Z");
 assert.equal(refs[1].label,"FY2025");assert.equal(refs[2].label,"Attributed headline");
 assert.equal(JSON.stringify(refs).includes("123.45"),false);
 assert.equal(JSON.stringify(refs).includes("999999"),false);
 assert.equal(JSON.stringify(refs).includes("private raw article"),false);
});
test("unsupported or uncited provenance is omitted",()=>{
 assert.deepEqual(buildResearchEvidenceReferences({facts:[{id:"f",type:"QUOTE",source:"",value:{}}]}, {agents:[{findings:[],risks:[]}]}),[]);
});
