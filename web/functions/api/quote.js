const ALLOWED = /^[A-Z0-9.^=-]{1,12}$/;
export async function onRequestGet({ request }) {
  const url = new URL(request.url);
  const ticker = (url.searchParams.get("ticker") || "").trim().toUpperCase();
  if (!ALLOWED.test(ticker)) return Response.json({ error: "Enter a valid ticker." }, { status: 400 });
  const endpoint = "https://query1.finance.yahoo.com/v8/finance/chart/" + encodeURIComponent(ticker) + "?range=1d&interval=1m";
  try {
    const upstream = await fetch(endpoint, { headers: { "Accept": "application/json" } });
    if (!upstream.ok) return Response.json({ error: "Quote provider returned HTTP " + upstream.status, ticker }, { status: 502 });
    const raw = await upstream.json();
    const result = raw?.chart?.result?.[0];
    if (!result) return Response.json({ error: "No quote returned for this ticker.", ticker }, { status: 404 });
    const meta = result.meta || {};
    const prices = result.indicators?.quote?.[0]?.close || [];
    const timestamps = result.timestamp || [];
    let lastIndex = -1;
    for (let i = prices.length - 1; i >= 0; i--) {
      if (typeof prices[i] === "number" && Number.isFinite(prices[i])) { lastIndex = i; break; }
    }
    const price = lastIndex >= 0 ? prices[lastIndex] : meta.regularMarketPrice ?? null;
    const previousClose = meta.chartPreviousClose ?? meta.previousClose ?? null;
    const quoteTime = lastIndex >= 0 && timestamps[lastIndex] ? timestamps[lastIndex] * 1000 : (meta.regularMarketTime ? meta.regularMarketTime * 1000 : null);
    return Response.json({
      ticker,
      companyName: meta.longName || meta.shortName || ticker,
      currency: meta.currency || "USD",
      exchange: meta.exchangeName || meta.fullExchangeName || "Unknown",
      price,
      previousClose,
      change: typeof price === "number" && typeof previousClose === "number" ? price - previousClose : null,
      changePercent: typeof price === "number" && typeof previousClose === "number" && previousClose !== 0 ? (price / previousClose - 1) * 100 : null,
      quoteTime: quoteTime ? new Date(quoteTime).toISOString() : null,
      fetchedAt: new Date().toISOString(),
      marketState: meta.marketState || "unknown",
      delayedOrRealtime: "Provider-dependent; not guaranteed real-time",
      source: "Yahoo Finance chart endpoint",
      note: "Indicative market data. May be delayed or unavailable; verify with your broker before acting."
    }, { headers: { "Cache-Control": "public, max-age=30", "X-Content-Type-Options": "nosniff" } });
  } catch (error) {
    return Response.json({ error: "Quote service temporarily unavailable.", ticker }, { status: 502 });
  }
}
