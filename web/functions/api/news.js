const TICKER_RE = /^[A-Z0-9.^=-]{1,12}$/;
function decodeXml(value) {
  return value.replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, "$1")
    .replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"').replace(/&#39;|&apos;/g, "'");
}
function parseItems(xml, source, limit = 20) {
  const items = [];
  for (const match of xml.matchAll(/<item\b[^>]*>([\s\S]*?)<\/item>/gi)) {
    const body = match[1];
    const field = name => {
      const re = new RegExp("<" + name + "(?:\\s[^>]*)?>([\\s\\S]*?)<\\/" + name + ">", "i");
      const m = body.match(re);
      return m ? decodeXml(m[1].trim()) : "";
    };
    const title = field("title").replace(/<[^>]*>/g, "").trim();
    const link = field("link").replace(/<[^>]*>/g, "").trim();
    const description = field("description").replace(/<[^>]*>/g, "").trim();
    const pubDate = field("pubDate");
    const publisher = field("source").replace(/<[^>]*>/g, "").trim();
    if (!title || !/^https?:\/\//i.test(link)) continue;
    items.push({ title, description, url: link, publishedAt: pubDate || null, source: publisher || source, publisherVerified: Boolean(publisher) });
    if (items.length >= limit) break;
  }
  return items;
}
function googlePublisherFeed(domain, ticker, company) {
  const terms = [ticker, company].filter(Boolean).map(term => '"' + term.replace(/"/g, "") + '"').join(" OR ");
  return "https://news.google.com/rss/search?q=" + encodeURIComponent("(" + terms + ") site:" + domain) + "&hl=en-US&gl=US&ceid=US:en";
}
export async function onRequestGet({ request, env }) {
  const url = new URL(request.url);
  const ticker = (url.searchParams.get("ticker") || "").trim().toUpperCase();
  const companyName = (url.searchParams.get("company") || "").trim().slice(0, 120);
  if (!TICKER_RE.test(ticker)) return Response.json({ error: "Enter a valid ticker." }, { status: 400 });
  const cleanCompany = companyName.replace(/,?\s+(Inc\.?|Incorporated|Corp\.?|Corporation|Ltd\.?|Limited|PLC|LLC|Class [A-Z])\s*$/i, "").trim();
  const companyAliases = {
    AAPL: /\b(apple|iphone|ipad|macbook|mac\b|ios|app store|apple watch|airpods|tim cook)\b/i,
    MSFT: /\b(microsoft|windows|azure|office 365|satya nadella)\b/i,
    NVDA: /\b(nvidia|geforce|cuda|jensen huang)\b/i,
    GOOGL: /\b(alphabet|google|youtube|google cloud|sundar pichai)\b/i,
    GOOG: /\b(alphabet|google|youtube|google cloud|sundar pichai)\b/i,
    AMZN: /\b(amazon|aws|prime video|andy jassy)\b/i,
    META: /\b(meta platforms|facebook|instagram|whatsapp|mark zuckerberg)\b/i,
    TSLA: /\b(tesla|cybertruck|model 3|model y|elon musk)\b/i,
    V: /\b(visa|visa inc)\b/i,
    MA: /\b(mastercard)\b/i,
    MRVL: /\b(marvell)\b/i,
    MRAM: /\b(everspin)\b/i,
    NVTS: /\b(navet?as|navitas semiconductor)\b/i
  };
  const matchesCompany = item => {
    const combined = (String(item.title || "") + " " + String(item.description || "")).toLowerCase();
    const tokens = (String(item.title || "") + " " + String(item.description || "")).toUpperCase().match(/[A-Z0-9.^=-]+/g) || [];
    const symbolMatch = tokens.includes(ticker);
    const name = cleanCompany.toLowerCase();
    const nameMatch = name.length >= 3 && combined.includes(name);
    const aliasMatch = Boolean(companyAliases[ticker] && companyAliases[ticker].test(combined));
    return symbolMatch || nameMatch || aliasMatch;
  };
  const yahooUrl = "https://feeds.finance.yahoo.com/rss/2.0/headline?s=" + encodeURIComponent(ticker) + "&region=US&lang=en-US";
  const googleCompanyUrl = "https://news.google.com/rss/search?q=" + encodeURIComponent('"' + ticker + '"' + (cleanCompany ? ' OR "' + cleanCompany.replace(/"/g, "") + '"' : "")) + "&hl=en-US&gl=US&ceid=US:en";
  // Prefer feeds scoped to each publisher; Google News is used as a discovery proxy where publishers do not provide a reliable public feed.
  const feeds = [
    { name: "Yahoo Finance", url: yahooUrl },
    { name: "Reuters", url: googlePublisherFeed("reuters.com", ticker, cleanCompany) },
    { name: "Bloomberg", url: googlePublisherFeed("bloomberg.com", ticker, cleanCompany) },
    { name: "The Wall Street Journal", url: googlePublisherFeed("wsj.com", ticker, cleanCompany) },
    { name: "CNBC", url: googlePublisherFeed("cnbc.com", ticker, cleanCompany) },
    { name: "MarketWatch", url: googlePublisherFeed("marketwatch.com", ticker, cleanCompany) },
    { name: "Associated Press", url: googlePublisherFeed("apnews.com", ticker, cleanCompany) },
    { name: "Bing News discovery", url: "https://www.bing.com/news/search?q=" + encodeURIComponent('"' + ticker + '" ' + (cleanCompany ? '"' + cleanCompany + '"' : "") ) + "&format=rss" },
    { name: "Company-wide news search", url: googleCompanyUrl }
  ];
  const results = await Promise.allSettled(feeds.map(feed => fetch(feed.url, {
    headers: { "Accept": "application/rss+xml, application/xml, text/xml" },
    signal: AbortSignal.timeout(7000)
  })));
  const sources = [];
  const items = [];
  for (let i = 0; i < results.length; i++) {
    const result = results[i];
    const feed = feeds[i];
    if (result.status !== "fulfilled" || !result.value.ok) {
      sources.push({ name: feed.name, status: "unavailable", count: 0 });
      continue;
    }
    const parsed = parseItems(await result.value.text(), feed.name, 30).filter(matchesCompany);
    items.push(...parsed.map(item => ({ ...item, source: item.publisherVerified ? item.source : (feed.name === "Company-wide news search" || feed.name === "Bing News discovery" ? item.source + " (via " + feed.name + ")" : feed.name + " (publisher not identified)") })));
    sources.push({ name: feed.name, status: parsed.length ? "ok" : "no matching headlines", count: parsed.length });
  }
  // Optional licensed/API-key news sources. These return publisher-attributed stories
  // directly and can help when public RSS feeds are blocked or sparse.
  if (typeof env !== "undefined" && env.FINNHUB_API_KEY) {
    try {
      const to = Math.floor(Date.now() / 1000);
      const from = to - 60 * 86400;
      const endpoint = "https://finnhub.io/api/v1/company-news?symbol=" + encodeURIComponent(ticker) +
        "&from=" + new Date(from * 1000).toISOString().slice(0,10) +
        "&to=" + new Date(to * 1000).toISOString().slice(0,10) +
        "&token=" + encodeURIComponent(env.FINNHUB_API_KEY);
      const response = await fetch(endpoint, {headers:{"Accept":"application/json"},signal:AbortSignal.timeout(7000)});
      if (!response.ok) throw new Error("Finnhub news returned HTTP " + response.status);
      const payload = await response.json();
      let count = 0;
      for (const row of (Array.isArray(payload) ? payload : []).slice(0,100)) {
        if (!row.headline || !row.url || !/^https?:\/\//i.test(row.url)) continue;
        items.push({title:String(row.headline),description:String(row.summary||""),
          url:String(row.url),publishedAt:Number.isFinite(row.datetime)?new Date(row.datetime*1000).toISOString():null,
          source:String(row.source||"Finnhub news feed")});
        count++;
      }
      sources.push({name:"Finnhub company news",status:count?"ok":"no matching headlines",count});
    } catch (error) {
      sources.push({name:"Finnhub company news",status:"unavailable",count:0,detail:String(error?.message||error).slice(0,160)});
    }
  }
  if (typeof env !== "undefined" && env.FMP_API_KEY && items.length < 12) {
    try {
      const endpoint = "https://financialmodelingprep.com/stable/news/stock?symbols=" + encodeURIComponent(ticker) +
        "&limit=50&apikey=" + encodeURIComponent(env.FMP_API_KEY);
      const response = await fetch(endpoint, {headers:{"Accept":"application/json"},signal:AbortSignal.timeout(7000)});
      if (!response.ok) throw new Error("FMP stock news returned HTTP " + response.status);
      const payload = await response.json();
      let count = 0;
      for (const row of (Array.isArray(payload) ? payload : []).slice(0,50)) {
        const articleUrl = row.url || row.link;
        const title = row.title || row.text;
        if (!title || !articleUrl || !/^https?:\/\//i.test(articleUrl)) continue;
        items.push({title:String(title),description:String(row.text||row.summary||""),
          url:String(articleUrl),publishedAt:row.publishedDate||row.date||null,
          source:String(row.site||row.publisher||"Financial Modeling Prep news feed")});
        count++;
      }
      sources.push({name:"Financial Modeling Prep stock news",status:count?"ok":"no matching headlines",count});
    } catch (error) {
      sources.push({name:"Financial Modeling Prep stock news",status:"unavailable",count:0,detail:String(error?.message||error).slice(0,160)});
    }
  }
  // Always query Nasdaq as one source in the combined feed, never as the only intended source.
  {
    try {
      const endpoint = "https://www.nasdaq.com/api/news/topic/articlebysymbol?q=" + encodeURIComponent(ticker + "|STOCKS") + "&offset=0&limit=20&fallback=true";
      const response = await fetch(endpoint, { headers: {
        "Accept": "application/json, text/plain, */*",
        "User-Agent": "Mozilla/5.0 (compatible; NorthstarAI/1.0)",
        "Origin": "https://www.nasdaq.com", "Referer": "https://www.nasdaq.com/"
      }, signal: AbortSignal.timeout(7000) });
      if (!response.ok) throw new Error("Nasdaq news returned HTTP " + response.status);
      const payload = await response.json();
      const rows = payload?.data?.rows || [];
      let count = 0;
      for (const row of rows) {
        if (!row.title || !row.url || (row.primarysymbol && String(row.primarysymbol).toUpperCase() !== ticker)) continue;
        items.push({
          title: String(row.title), description: "",
          url: String(row.url).startsWith("http") ? row.url : "https://www.nasdaq.com" + row.url,
          publishedAt: row.created ? new Date(row.created).toISOString() : null,
          source: row.publisher ? "Nasdaq · " + row.publisher : "Nasdaq"
        });
        count++;
      }
      sources.push({ name: "Nasdaq company news", status: count ? "ok" : "no matching headlines", count });
    } catch {
      sources.push({ name: "Nasdaq company news", status: "unavailable", count: 0 });
    }
  }
  const seen = new Set();
  const deduped = items.filter(item => matchesCompany(item) && !seen.has(item.url) && seen.add(item.url))
    .sort((a, b) => (Date.parse(b.publishedAt || "") || 0) - (Date.parse(a.publishedAt || "") || 0));
  // Avoid allowing one publisher to occupy the entire visible feed when other outlets have matching coverage.
  const publisherCounts = new Map();
  const diverse = [];
  for (const item of deduped) {
    const key = String(item.source || "Unknown publisher").trim().toLowerCase();
    const count = publisherCounts.get(key) || 0;
    if (count >= 4) continue;
    publisherCounts.set(key, count + 1);
    diverse.push(item);
    if (diverse.length >= 40) break;
  }
  const unique = diverse;
  const representedPublishers = [...new Set(unique.map(item => item.source))];
  return Response.json({
    ticker, company: companyName || null, fetchedAt: new Date().toISOString(),
    items: unique, sources, publisherCount: representedPublishers.length,
    note: "Publisher-specific Google News RSS queries are discovery proxies, not direct publisher APIs. Headlines are not verified facts or investment signals; confirm material claims against original reporting, company statements or SEC filings. Article availability and display rights vary by publisher."
  }, { headers: { "Cache-Control": "public, max-age=300", "X-Content-Type-Options": "nosniff" } });
}
