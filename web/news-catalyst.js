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
 root.classifyNewsCatalyst=classify;root.aggregateNewsCatalysts=aggregate;
})(globalThis);
