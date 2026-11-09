import assert from "node:assert/strict";
import test from "node:test";
import {onRequestGet} from "../web/functions/api/fmp-universe.js";

test("FMP universe adapter returns current index lists and historical changes with source dates",async()=>{
 const original=globalThis.fetch,paths=[];
 globalThis.fetch=async input=>{
  const u=new URL(String(input)),name=u.pathname.split("/").pop();paths.push(name);
  return Response.json(name==="delisted-companies"
   ?[{symbol:"OLD",companyName:"Old Company"}]
   :name.startsWith("historical-")
    ?[{date:"2019-06-01",symbol:"OLD",addedTicker:"OLD",removedTicker:"OUT"},{date:"2024-06-01",symbol:"NEW",addedTicker:"NEW",removedTicker:"OLD"}]
    :[{symbol:"NEW",name:"New Company"}]);
 };
 try{
  const response=await onRequestGet({request:new Request("https://northstar.test/api/fmp-universe?from=2020-01-01"),env:{FMP_API_KEY:"test"}});
  assert.equal(response.status,200);const body=await response.json();
  assert.equal(body.provider,"Financial Modeling Prep");
  assert.equal(body.indexes.sp500.currentCount,1);
  assert.equal(body.indexes.sp500.historicalChangeCount,1);
  assert.equal(body.indexes.sp500.historicalChangesSince,"2020-01-01");
  assert.equal(paths.length,7);\n  assert.equal(body.delistedCompanyCount,1);\n  assert.equal(body.delistedCompanies[0].symbol,"OLD");
  assert.equal(body.reconstructionRules.applyHistoricalChangesInReverseChronologicalOrderToReconstructEarlierMembership,true);
 }finally{globalThis.fetch=original;}
});

test("FMP universe adapter rejects invalid dates",async()=>{
 const response=await onRequestGet({request:new Request("https://northstar.test/api/fmp-universe?from=2025-02-30"),env:{FMP_API_KEY:"test"}});
 assert.equal(response.status,400);
});
