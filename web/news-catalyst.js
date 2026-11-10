(function(root){
 const positive=[
  [/\b(raises?|increases?) (full[- ]year )?(guidance|outlook|forecast)\b|\bstronger guidance\b/i,.85,"Raised guidance"],
  [/\b(beats?|tops?) (revenue|earnings|eps|estimates|expectations)\b/i,.55,"Results beat expectations"],
  [/\b(wins?|awarded?) (a )?(major )?(multi[- ]year )?(contract|deal)\b|\bmajor contract\b/i,.75,"Contract win"],
  [/\b(merger|acquisition|acquires|to acquire|takeover)\b/i,.35,"M&A announcement"],
  [/\b(regulatory|fda|faa) approval\b|\bcleared by the fda\b/i,.75,"Regulatory approval"],
  [/\b(launches?|unveils?) (a )?(new )?(product|platform|service|chip|vehicle)\b/i,.3,"Product launch"],
  [/\b(record|all[- ]time high) (revenue|sales|profit|orders)\b/i,.55,"Record operating result"],
  [/\b(raises?|increases?) dividend\b|\bshare buyback\b/i,.25,"Capital return"]
 ];
 const negative=[
  [/\b(fraud|accounting irregularit|restatement|bankruptcy|bankrupt|insolvency)\b/i,-1,"Financial integrity / solvency risk"],
  [/\b(sec (investigation|charges?)|criminal charges|regulatory investigation|probe|investigation|lawsuit|antitrust)\b/i,-.75,"Legal or regulatory risk"],
  [/\b(recall|safety defect|data breach|cyberattack|ransomware)\b/i,-.65,"Operational / safety risk"],
  [/\b(cuts?|lowers?|withdraws?) (full[- ]year )?(guidance|outlook|forecast)\b|\bweakens? outlook\b/i,-.85,"Guidance cut"],
  [/\b(misses?) (revenue|earnings|eps|estimates|expectations)\b/i,-.55,"Results miss expectations"],
  [/\b(ceo|cfo|chief executive|chief financial officer) resigns?\b|\bexecutive departure\b/i,-.35,"Senior executive departure"],
  [/\b(secondary offering|share dilution|dilutive offering|going concern)\b/i,-.55,"Dilution / financing risk"]
 ];
 const publishers=/reuters|bloomberg|wall street journal|wsj|cnbc|associated press|ap news|financial times|marketwatch|yahoo finance|nasdaq|finnhub|financial modeling prep/i;
 function sourceTier(item){
  const url=String(item?.url||"").toLowerCase(),source=String(item?.source||"");
  if(/(^|\.)sec\.gov\//.test(url)||/investor\.[a-z0-9.-]+\//.test(url)||/\b(investor relations|company newsroom|official press release)\b/i.test(source))return "primary-source";
  if(publishers.test(source)||/reuters\.com|bloomberg\.com|wsj\.com|cnbc\.com|apnews\.com|ft\.com|marketwatch\.com|finance\.yahoo\.com|nasdaq\.com/.test(url))return "reported-source";
  return "unverified-source";
 }
 function classify(item){
  const text=[item?.title,item?.description].filter(Boolean).join(" "),tier=sourceTier(item);
  for(const [re,score,label] of negative)if(re.test(text))return {category:"negative",label,score,sourceTier:tier,scoreEligible:tier!=="unverified-source"};
  for(const [re,score,label] of positive)if(re.test(text))return {category:"positive",label,score,sourceTier:tier,scoreEligible:tier!=="unverified-source"};
  return {category:"unclassified",label:"No clear catalyst classification",score:0,sourceTier:tier,scoreEligible:false};
 }
 function aggregate(items){
  const classified=(Array.isArray(items)?items:[]).map(item=>({item,...classify(item)}));
  const eligible=classified.filter(x=>x.scoreEligible&&x.category!=="unclassified");
  if(!eligible.length)return {available:false,score:null,eligibleCount:0,classified};
  const score=eligible.reduce((sum,x)=>sum+x.score,0)/eligible.length;
  return {available:true,score:Math.max(-1,Math.min(1,score)),eligibleCount:eligible.length,classified};
 }

 function normalizeHeadline(value){return String(value||"").normalize("NFKC").toLowerCase().replace(/https?:\\/\\/\\S+/g," ").replace(/&amp;/g," and ").replace(/[^a-z0-9]+/g," ").trim().replace(/\\s+/g," ");}
 function canonicalUrl(value){try{const u=new URL(String(value));u.hash="";["utm_source","utm_medium","utm_campaign","utm_term","utm_content","gclid","fbclid","ocid"].forEach(k=>u.searchParams.delete(k));u.hostname=u.hostname.toLowerCase();return u.toString().replace(/\\/$/,"");}catch{return String(value||"").trim();}}
 function deduplicate(items){const urls=new Set(),titles=new Set(),out=[];for(const item of Array.isArray(items)?items:[]){const url=canonicalUrl(item?.url),title=normalizeHeadline(item?.title);if(!title||(url&&urls.has(url))||titles.has(title))continue;if(url)urls.add(url);titles.add(title);out.push(item);}return out;}
 function assessFreshness(item,{now=Date.now(),maxAgeDays=14}={}){const raw=item?.publishedAt??item?.published_at??item?.datetime??null;if(raw===null||raw==="")return {status:"undated",eligible:false,ageDays:null};const time=typeof raw==="number"?(raw<1e12?raw*1000:raw):Date.parse(raw);if(!Number.isFinite(time))return {status:"invalid-date",eligible:false,ageDays:null};const ageDays=(now-time)/86400000;if(ageDays < -1/24)return {status:"future-dated",eligible:false,ageDays};if(ageDays>maxAgeDays)return {status:"stale",eligible:false,ageDays};return {status:"fresh",eligible:true,ageDays:Math.max(0,ageDays)};}
 function classifyScope(item,{ticker="",company=""}={}){const text=normalizeHeadline([item?.title,item?.description].filter(Boolean).join(" ")),symbol=normalizeHeadline(ticker),name=normalizeHeadline(company);const symbolMatch=!!symbol&&(" "+text+" ").includes(" "+symbol+" ");if(symbolMatch||(name.length>=3&&text.includes(name)))return {scope:"company",eligible:true};if(/\b(federal reserve|fed rate|interest rates?|inflation|cpi|pce|nonfarm payrolls|unemployment rate|treasury yields?|recession|gdp growth)\b/i.test(text))return {scope:"macro",eligible:false};if(/\b(semiconductor industry|chipmakers|cloud computing sector|banking sector|oil prices|crude prices|retail sector|automotive industry|biotech sector)\b/i.test(text))return {scope:"sector",eligible:false};return {scope:"ambiguous",eligible:false};}
 function assessNewsQuality(item,options={}){const freshness=assessFreshness(item,options),scope=classifyScope(item,options),catalyst=classify(item),eligible=freshness.eligible&&scope.eligible&&catalyst.scoreEligible&&catalyst.category!=="unclassified";return {eligible,freshness,scope,catalyst,reason:!freshness.eligible?freshness.status:!scope.eligible?"not-company-specific":!catalyst.scoreEligible?"source-unverified":catalyst.category==="unclassified"?"no-classified-catalyst":"eligible"};}
 function aggregateFreshNewsCatalysts(items,options={}){const assessed=deduplicate(items).map(item=>({item,...assessNewsQuality(item,options)})),eligible=assessed.filter(row=>row.eligible);return {available:eligible.length>0,score:eligible.length?Math.max(-1,Math.min(1,eligible.reduce((sum,row)=>sum+row.catalyst.score,0)/eligible.length)):null,eligibleCount:eligible.length,excludedCount:assessed.length-eligible.length,items:assessed};}
 root.deduplicateNewsItems=deduplicate;root.assessNewsFreshness=assessFreshness;root.classifyNewsScope=classifyScope;root.assessNewsQuality=assessNewsQuality;root.aggregateFreshNewsCatalysts=aggregateFreshNewsCatalysts;

 root.classifyNewsCatalyst=classify;root.aggregateNewsCatalysts=aggregate;
})(globalThis);
