import assert from "node:assert/strict";
import test from "node:test";
import { onRequestPost } from "../web/functions/api/ai-research.js";

test("Gemini fallback discovers available models and retries unavailable model IDs", async () => {
  const originalFetch=globalThis.fetch;
  const calls=[];
  globalThis.fetch=async (input,init={})=>{
    const url=String(input);
    calls.push({url,body:init.body?JSON.parse(init.body):null});
    if(url.includes("/v1beta/models?")) return Response.json({models:[
      {name:"models/gemini-3.8-flash",supportedGenerationMethods:["generateContent"]},
      {name:"models/gemini-3.7-flash",supportedGenerationMethods:["generateContent"]},
      {name:"models/gemini-3.6-flash",supportedGenerationMethods:["generateContent"]},
      {name:"models/gemini-embedding-2",supportedGenerationMethods:["embedContent"]}
    ]});
    if(url.endsWith("/models/gemini-3.8-flash:generateContent")) return Response.json({error:{message:"temporary unavailable"}},{status:503});
    if(url.endsWith("/models/gemini-3.7-flash:generateContent")) return Response.json({error:{message:"model not found for this key"}},{status:404});
    if(url.endsWith("/models/gemini-3.6-flash:generateContent")) return Response.json({candidates:[{content:{parts:[{text:JSON.stringify({
      companyDescription:"A diversified bank.",
      findings:[{field:"Annual report",value:"Latest filing is available.",sourceTitle:"SEC filing",sourceUrl:"https://www.sec.gov/Archives/example",publishedDate:"2026-02-20",asOfDate:"2025-12-31",confidence:"high",evidenceType:"reported filing"}],
      notes:[]
    })}]}}]});
    throw new Error("Unexpected URL "+url);
  };
  try{
    const request=new Request("https://northstar.test/api/ai-research",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({
      ticker:"JPM",companyName:"JPMorgan Chase & Co.",missingFields:["latest reported quarterly revenue"],nativeContext:{}
    })});
    const response=await onRequestPost({request,env:{GEMINI_API_KEY:"test-key"}});
    assert.equal(response.status,200);
    const payload=await response.json();
    assert.equal(payload.available,true);
    assert.equal(payload.provider,"gemini");
    assert.equal(payload.model,"gemini-3.6-flash");
    assert.equal(payload.findings.length,1);
    assert.ok(calls.some(call=>call.body?.tools?.[0]?.google_search));
    assert.equal(calls.filter(call=>call.url.includes(":generateContent")).length,3);
  }finally{globalThis.fetch=originalFetch;}
});

test("AI fallback fails closed when no provider key is configured", async()=>{
  const request=new Request("https://northstar.test/api/ai-research",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({ticker:"JPM"})});
  const response=await onRequestPost({request,env:{}});
  assert.equal(response.status,503);
  const payload=await response.json();
  assert.equal(payload.available,false);
});
