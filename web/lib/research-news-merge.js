// Merge Finnhub's timestamped free company-news feed into the normal Council news set.
export function mergeFinnhubCompanyNews(existingItems=[],articles=[]){
 const items=[...(Array.isArray(existingItems)?existingItems:[])];
 const canonical=url=>String(url||"").trim().toLowerCase().replace(/[?#].*$/,"");
 const seen=new Set(items.map(item=>canonical(item?.url)).filter(Boolean));
 let added=0;
 for(const article of Array.isArray(articles)?articles:[]){
  const url=String(article?.url||"").trim(),key=canonical(url),headline=String(article?.headline||"").trim();
  if(!key||!headline||seen.has(key)||!/^https?:\/\//i.test(url))continue;
  const publishedAt=typeof article.publishedAt==="string"&&Number.isFinite(Date.parse(article.publishedAt))?article.publishedAt:null;
  seen.add(key);added++;
  items.push({title:headline,description:String(article.summary||"").trim(),url,publishedAt,source:String(article.source||"Finnhub company news"),publisher:String(article.source||"Finnhub company news"),publisherVerified:Boolean(article.source),provider:"Finnhub company-news"});
 }
 return {items,added};
}
