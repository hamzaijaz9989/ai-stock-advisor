import test from "node:test";
import assert from "node:assert/strict";
import {onRequestPost} from "../web/functions/api/research/fundamentals-news.js";
const env={NORTHSTAR_OPERATOR_TOKEN:"test-operator"};
const request=(body,token="test-operator")=>new Request("https://northstar.test/api/research/fundamentals-news",{method:"POST",headers:{"Content-Type":"application/json","Authorization":"Bearer "+token},body:JSON.stringify(body)});
test("fundamentals/news endpoint rejects missing operator authentication",async()=>{
 const response=await onRequestPost({request:request({ticker:"NVDA"},"wrong"),env});
 assert.equal(response.status,401);
 const body=await response.json();assert.equal(body.execution,false);
});
test("fundamentals/news endpoint validates ticker before provider access",async()=>{
 const response=await onRequestPost({request:request({ticker:"<script>"}),env});
 assert.equal(response.status,400);
});
test("fundamentals/news endpoint rejects malformed JSON",async()=>{
 const req=new Request("https://northstar.test/api/research/fundamentals-news",{method:"POST",headers:{"Authorization":"Bearer test-operator"},body:"{"});
 const response=await onRequestPost({request:req,env});
 assert.equal(response.status,400);
});
