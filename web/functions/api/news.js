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
    items.push({ title, description, url: link, publishedAt: pubDate || null, source: publisher || source });
    if (items.length >= limit) break;
  }
  return items;
}
function googlePublisherFeed(domain, ticker, company) {
  const terms = [ticker, company].filter(Boolean).map(term => '"' + term.replace(/"/g, "") + '"').join(" OR ");
  return "https://news.google.com/rss/search?q=" + encodeURIComponent("(" + terms + ") site:" + domain) + "&hl=en-US&gl=US&ceid=US:en";
}
export async function onRequestGet({ request }) {
  const url = new URL(request.url);
  const ticker = (url.searchParams.get("ticker") || "").trim().toUpperCase();
  const companyName = (url.searchParams.get("company") || "").trim().slice(0, 120);
  if (!TICKER_RE.test(ticker)) return Response.json({ error: "Enter a valid ticker." }, { status: 400 });
  const cleanCompany = companyName.replace(/,?\s+(Inc\\.?|Incorporated|Corp\\.?|Corporation|Ltd\\.?|Limited|PLC|LLC|Class [A-Z])\s*$/i, "").trim();
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
    items.push(...parsed.map(item => ({ ...item, source: feed.name === "Company-wide news search" ? (item.source || "Google News") : feed.name })));
    sources.push({ name: feed.name, status: parsed.length ? "ok" : "no matching headlines", count: parsed.length });
  }
  // Nasdaq is an additional fallback, not a requirement for a successful response.
  if (items.length < 5) {
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
  const unique = items.filter(item => matchesCompany(item) && !seen.has(item.url) && seen.add(item.url))
    .sort((a, b) => (Date.parse(b.publishedAt || "") || 0) - (Date.parse(a.publishedAt || "") || 0))
    .slice(0, 40);
  const representedPublishers = [...new Set(unique.map(item => item.source))];
  return Response.json({
    ticker, company: companyName || null, fetchedAt: new Date().toISOString(),
    items: unique, sources, publisherCount: representedPublishers.length,
    note: "Publisher-specific Google News RSS queries are discovery proxies, not direct publisher APIs. Headlines are not verified facts or investment signals; confirm material claims against original reporting, company statements or SEC filings. Article availability and display rights vary by publisher."
  }, { headers: { "Cache-Control": "public, max-age=300", "X-Content-Type-Options": "nosniff" } });
}
