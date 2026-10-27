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
  if (!TICKER_RE.test(ticker)) return Response.json({ error: "Enter a valid ticker." }, { status: 400 });
  const yahooUrl = "https://feeds.finance.yahoo.com/rss/2.0/headline?s=" + encodeURIComponent(ticker) + "&region=US&lang=en-US";
  const googleUrl = "https://news.google.com/rss/search?q=" + encodeURIComponent(ticker + " stock OR company") + "&hl=en-US&gl=US&ceid=US:en";
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
    const parsed = parseItems(await result.value.text(), source, 10);
    items.push(...parsed);
    sources.push({ name: source, status: "ok", count: parsed.length });
  }
  const unique = [...new Map(items.map(item => [item.url, item])).values()]
    .sort((a, b) => Date.parse(b.publishedAt || 0) - Date.parse(a.publishedAt || 0))
    .slice(0, 15);
  return Response.json({
    ticker, fetchedAt: new Date().toISOString(), items: unique, sources,
    note: "Headlines are discovery signals, not verified facts or buy recommendations. Confirm material claims against filings or official statements."
  }, { headers: { "Cache-Control": "public, max-age=300", "X-Content-Type-Options": "nosniff" } });
}
