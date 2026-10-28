const TICKER_RE = /^[A-Z0-9.^=-]{1,12}$/;
function decodeXml(value) {
  return value.replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, "$1")
    .replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"').replace(/&#39;|&apos;/g, "'");
}
function parseItems(xml, source, limit = 10) {
  const items = [];
  for (const match of xml.matchAll(/<item\b[^>]*>([\s\S]*?)<\/item>/gi)) {
    const body = match[1];
    const field = (name) => {
      const re = new RegExp("<" + name + "(?:\\s[^>]*)?>([\\s\\S]*?)<\\/" + name + ">", "i");
      const m = body.match(re);
      return m ? decodeXml(m[1].trim()) : "";
    };
    const title = field("title").replace(/<[^>]*>/g, "").trim();
    const link = field("link").replace(/<[^>]*>/g, "").trim();
    const pubDate = field("pubDate");
    if (!title || !/^https?:\/\//i.test(link)) continue;
    items.push({ title, url: link, publishedAt: pubDate || null, source });
    if (items.length >= limit) break;
  }
  return items;
}
export async function onRequestGet({ request }) {
  const url = new URL(request.url);
  const ticker = (url.searchParams.get("ticker") || "").trim().toUpperCase();
  const companyName = (url.searchParams.get("company") || "").trim().slice(0, 120);
  if (!TICKER_RE.test(ticker)) return Response.json({ error: "Enter a valid ticker." }, { status: 400 });
  const cleanCompany = companyName.replace(/,?\s+(Inc\.?|Incorporated|Corp\.?|Corporation|Ltd\.?|Limited|PLC|LLC|Class [A-Z])\s*$/i, "").trim();
  const matchesCompany = (item) => {
    if (item.companyMatched === true) return true;
    const title = String(item.title || "").toLowerCase();
    const tickerTokens = title.toUpperCase().match(/[A-Z0-9.^=-]+/g) || [];
    const symbolMatch = tickerTokens.includes(ticker);
    const name = cleanCompany.toLowerCase();
    return symbolMatch || (name.length >= 3 && title.includes(name));
  };
  const yahooUrl = "https://feeds.finance.yahoo.com/rss/2.0/headline?s=" + encodeURIComponent(ticker) + "&region=US&lang=en-US";
  const googleTerms = [ticker, cleanCompany].filter(Boolean).map(term => '"' + term.replace(/"/g, "") + '"').join(" OR ");
  const googleUrl = "https://news.google.com/rss/search?q=" + encodeURIComponent("(" + googleTerms + ") (stock OR shares OR earnings OR company)") + "&hl=en-US&gl=US&ceid=US:en";
  const results = await Promise.allSettled([
    fetch(yahooUrl, { headers: { "Accept": "application/rss+xml, application/xml, text/xml" } }),
    fetch(googleUrl, { headers: { "Accept": "application/rss+xml, application/xml, text/xml" } })
  ]);
  const sources = [];
  const items = [];
  for (let i = 0; i < results.length; i++) {
    const result = results[i];
    const source = i === 0 ? "Yahoo Finance RSS" : "Google News RSS";
    if (result.status !== "fulfilled" || !result.value.ok) {
      sources.push({ name: source, status: "unavailable" });
      continue;
    }
    const parsed = parseItems(await result.value.text(), source, 15).filter(matchesCompany);
    items.push(...parsed);
    sources.push({ name: source, status: "ok", count: parsed.length });
  }
  if (items.length === 0) {
    try {
      const nasdaqUrl = "https://www.nasdaq.com/api/news/topic/articlebysymbol?q=" + encodeURIComponent(ticker + "|STOCKS") + "&offset=0&limit=10&fallback=true";
      const response = await fetch(nasdaqUrl, { headers: {
        "Accept": "application/json, text/plain, */*",
        "User-Agent": "Mozilla/5.0 (compatible; AIStockAdvisor/1.0)",
        "Origin": "https://www.nasdaq.com",
        "Referer": "https://www.nasdaq.com/"
      }});
      if (!response.ok) throw new Error("Nasdaq news returned HTTP " + response.status);
      const payload = await response.json();
      const rows = payload?.data?.rows || [];
      const relevant = rows.filter(row =>
        String(row.primarysymbol || "").toLowerCase() === ticker.toLowerCase() ||
        (Array.isArray(row.related_symbols) && row.related_symbols.some(symbol => String(symbol).toLowerCase().startsWith(ticker.toLowerCase() + "|")))
      );
      for (const row of relevant) {
        if (!row.title || !row.url) continue;
        items.push({
          title: String(row.title),
          url: String(row.url).startsWith("http") ? row.url : "https://www.nasdaq.com" + row.url,
          publishedAt: row.created ? new Date(row.created).toISOString() : null,
          source: row.publisher ? "Nasdaq · " + row.publisher : "Nasdaq",
          companyMatched: true
        });
      }
      sources.push({ name: "Nasdaq company news", status: items.length ? "ok" : "no matching headlines", count: items.length });
    } catch (error) {
      sources.push({ name: "Nasdaq company news", status: "unavailable" });
    }
  }
  const unique = [...new Map(items.filter(matchesCompany).map(item => [item.url, item])).values()]
    .sort((a, b) => Date.parse(b.publishedAt || 0) - Date.parse(a.publishedAt || 0))
    .slice(0, 15);
  return Response.json({
    ticker, company: companyName || null, fetchedAt: new Date().toISOString(), items: unique, sources,
    note: "Only headlines matched to the verified company/ticker are shown. Headlines are discovery signals, not verified facts or buy recommendations. Confirm material claims against filings or official statements."
  }, { headers: { "Cache-Control": "public, max-age=300", "X-Content-Type-Options": "nosniff" } });
}
