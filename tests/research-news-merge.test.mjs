import assert from "node:assert/strict";
import test from "node:test";
import {mergeFinnhubCompanyNews} from "../web/lib/research-news-merge.js";
test("Finnhub articles join Council news when Massive news succeeds",()=>{
 const massive=[{title:"Massive headline",url:"https://wire.example/a",publishedAt:"2026-11-17T10:00:00Z",source:"Massive"}];
 const finn=[{headline:"Finnhub headline",url:"https://publisher.example/story",publishedAt:"2026-11-17T10:30:00Z",source:"Publisher One"}];
 const merged=mergeFinnhubCompanyNews(massive,finn);
 assert.equal(merged.added,1);assert.equal(merged.items.length,2);
 assert.equal(merged.items[1].provider,"Finnhub company-news");
 assert.equal(merged.items[1].publisher,"Publisher One");
 assert.equal(merged.items[1].publishedAt,finn[0].publishedAt);
});
test("Finnhub articles are deduplicated by canonical URL against Massive news",()=>{
 const massive=[{title:"Existing",url:"https://publisher.example/story?utm=massive"}];
 const finn=[{headline:"Duplicate",url:"https://publisher.example/story?utm=finn",publishedAt:"2026-11-17T10:30:00Z",source:"Publisher"}];
 const merged=mergeFinnhubCompanyNews(massive,finn);
 assert.equal(merged.added,0);assert.equal(merged.items.length,1);
});
