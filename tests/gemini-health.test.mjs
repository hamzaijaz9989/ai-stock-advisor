import assert from "node:assert/strict";
import test from "node:test";
import { onRequestGet } from "../web/functions/api/gemini-health.js";

const env={GEMINI_API_KEY:"test-gemini-key"};
const request=new Request("https://northstar.test/api/gemini-health");

async function withFetch(fetcher,run){
  const original=globalThis.fetch;
  globalThis.fetch=fetcher;
  try{return await run();}finally{globalThis.fetch=original;}
}

function mockFetch({text,finishReason="STOP"}){
  return async input=>{
    const url=String(input);
    if(url.includes("/models?pageSize="))return Response.json({models:[{
      name:"models/gemini-2.5-flash",supportedGenerationMethods:["generateContent"]
    }]});
    if(url.includes(":generateContent"))return Response.json({candidates:[{
      finishReason,content:{parts:[{text}]}
    }]});
    throw new Error("Unexpected Gemini health request");
  };
}

test("Gemini health passes only an exact untruncated probe response",async()=>{
  await withFetch(mockFetch({text:"NORTHSTAR_GEMINI_OK"}),async()=>{
    const response=await onRequestGet({request,env});
    const payload=await response.json();
    assert.equal(response.status,200);
    assert.equal(payload.available,true);
    assert.equal(payload.generationTest,"passed");
    assert.equal(payload.finishReason,"STOP");
    assert.equal(JSON.stringify(payload).includes("test-gemini-key"),false);
  });
});

test("Gemini health rejects a marker embedded in a longer truncated response",async()=>{
  await withFetch(mockFetch({text:"NORTHSTAR_GEMINI_OK"+" extra output".repeat(20),finishReason:"MAX_TOKENS"}),async()=>{
    const response=await onRequestGet({request,env});
    const payload=await response.json();
    assert.equal(response.status,502);
    assert.equal(payload.available,false);
    assert.equal(payload.generationTest,"no_valid_text");
    assert.equal(payload.finishReason,"MAX_TOKENS");
  });
});
