const ALLOWED = /^[A-Z0-9.^=-]{1,12}$/;
async function fetchQuote(host, ticker, range, interval) {
  const endpoint = "https://" + host + "/v8/finance/chart/" + encodeURIComponent(ticker) + "?range=" + range + "&interval=" + interval;
  const response = await fetch(endpoint, { headers: { "Accept": "application/json" } });
  if (!response.ok) throw new Error("Quote provider returned HTTP " + response.status);
  const raw = await response.json();
  const result = raw?.chart?.result?.[0];
  if (!result) throw new Error("No quote returned");
  const meta = result.meta || {};
  const prices = result.indicators?.quote?.[0]?.close || [];
  const timestamps = result.timestamp || [];
  let lastIndex = -1;
  for (let i = prices.length - 1; i >= 0; i--) {
    if (typeof prices[i] === "number" && Number.isFinite(prices[i])) { lastIndex = i; break; }
  }
  const price = lastIndex >= 0 ? prices[lastIndex] : meta.regularMarketPrice ?? null;
  if (typeof price !== "number") throw new Error("No usable price returned");
  const previousClose = meta.chartPreviousClose ?? meta.previousClose ?? null;
  const quoteTime = lastIndex >= 0 && timestamps[lastIndex] ? timestamps[lastIndex] * 1000 : (meta.regularMarketTime ? meta.regularMarketTime * 1000 : null);
  return {
    ticker, companyName: meta.longName || meta.shortName || ticker,
    currency: meta.currency || "USD", exchange: meta.exchangeName || meta.fullExchangeName || "Unknown",
    price, previousClose,
    change: typeof previousClose === "number" ? price - previousClose : null,
    changePercent: typeof previousClose === "number" && previousClose !== 0 ? (price / previousClose - 1) * 100 : null,
    quoteTime: quoteTime ? new Date(quoteTime).toISOString() : null,
    fetchedAt: new Date().toISOString(), marketState: meta.marketState || "unknown",
    delayedOrRealtime: interval === "1m" ? "Provider-dependent; real-time not guaranteed" : "Daily interval; not real-time",
    source: "Yahoo Finance chart endpoint", interval
  };
}
export async function onRequestGet({ request }) {
  const url = new URL(request.url);
  const ticker = (url.searchParams.get("ticker") || "").trim().toUpperCase();
  if (!ALLOWED.test(ticker)) return Response.json({ error: "Enter a valid ticker." }, { status: 400 });
  const attempts = [
    ["query1.finance.yahoo.com", "1d", "1m"],
    ["query2.finance.yahoo.com", "1d", "1m"],
    ["query1.finance.yahoo.com", "5d", "1d"],
    ["query2.finance.yahoo.com", "5d", "1d"]
  ];
  const failures = [];
  for (const [host, range, interval] of attempts) {
    try {
      const quote = await fetchQuote(host, ticker, range, interval);
      return Response.json({ ...quote, warning: interval === "1m" ? "Indicative quote; provider may delay or restrict access. Verify with your broker." : "Intraday quote unavailable; showing latest available daily observation. This is not live pricing. Verify with your broker." }, {
        headers: { "Cache-Control": "public, max-age=15", "X-Content-Type-Options": "nosniff" }
      });
    } catch (error) { failures.push(String(error?.message || error)); }
  }
  try {
    const response = await fetch("https://api.nasdaq.com/api/quote/" + encodeURIComponent(ticker) + "/info?assetclass=stocks", {headers: {"Accept":"application/json, text/plain, */*", "User-Agent":"Mozilla/5.0 (compatible; AIStockAdvisor/1.0)", "Origin":"https://www.nasdaq.com", "Referer":"https://www.nasdaq.com/"}});
    if (!response.ok) throw new Error("Nasdaq quote provider returned HTTP " + response.status);
    const raw = await response.json();
    const data = raw?.data;
    const primary = data?.primaryData || {};
    const secondary = data?.secondaryData || {};
    const parseMoney = value => { if (typeof value !== "string") return null; const n = Number(value.replace(/[$,%+,]/g, "").trim()); return Number.isFinite(n) ? n : null; };
    const price = parseMoney(primary.lastSalePrice) ?? parseMoney(secondary.lastSalePrice);
    if (!data?.symbol || price === null) throw new Error("Nasdaq returned no usable quote");
    return Response.json({ticker, companyName:data.companyName || ticker, currency:primary.currency || "USD", exchange:data.exchange || "Unknown", price, previousClose:null, change:parseMoney(primary.netChange) ?? parseMoney(secondary.netChange), changePercent:parseMoney(primary.percentageChange) ?? parseMoney(secondary.percentageChange), quoteTime:null, quoteLabel:primary.lastTradeTimestamp || secondary.lastTradeTimestamp || null, fetchedAt:new Date().toISOString(), marketState:data.marketStatus || "unknown", delayedOrRealtime:primary.isRealTime ? "Provider-labelled real-time; verify independently" : "Latest available quote; may be delayed", source:"Nasdaq quote API", interval:primary.isRealTime ? "provider-labelled real-time" : "latest available", warning:"Provider timing and availability may vary. Verify the price with your broker before acting."}, {headers:{"Cache-Control":"public, max-age=15","X-Content-Type-Options":"nosniff"}});
  } catch (error) { failures.push(String(error?.message || error)); }
  return Response.json({ticker, error:"Current quote unavailable from all configured providers. Do not rely on a cached or guessed price.", fetchedAt:new Date().toISOString(), source:"Yahoo Finance / Nasdaq", providerErrors:failures}, {status:503, headers:{"Cache-Control":"no-store","X-Content-Type-Options":"nosniff"}});
}
