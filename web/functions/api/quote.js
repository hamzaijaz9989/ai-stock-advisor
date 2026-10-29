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
function parseEasternQuoteLabel(label) {
  if (typeof label !== "string") return null;
  const match = label.trim().match(/^([A-Za-z]{3})\s+(\d{1,2}),\s+(\d{4})\s+(\d{1,2}):(\d{2})\s*(AM|PM)\s+ET$/i);
  if (!match) return null;
  const months = {Jan:0,Feb:1,Mar:2,Apr:3,May:4,Jun:5,Jul:6,Aug:7,Sep:8,Oct:9,Nov:10,Dec:11};
  const month = months[match[1][0].toUpperCase()+match[1].slice(1,3).toLowerCase()];
  if (month === undefined) return null;
  const year = Number(match[3]);
  const day = Number(match[2]);
  let hour = Number(match[4]);
  const minute = Number(match[5]);
  const meridiem = match[6].toUpperCase();
  if (hour < 1 || hour > 12 || minute > 59 || day < 1 || day > 31) return null;
  hour = hour % 12 + (meridiem === "PM" ? 12 : 0);
  const wallClockAsUtc = Date.UTC(year, month, day, hour, minute);
  const parts = Object.fromEntries(new Intl.DateTimeFormat("en-US", {
    timeZone: "America/New_York",
    year: "numeric", month: "2-digit", day: "2-digit",
    hour: "2-digit", minute: "2-digit", hourCycle: "h23"
  }).formatToParts(new Date(wallClockAsUtc)).map(part => [part.type, part.value]));
  const localizedAsUtc = Date.UTC(
    Number(parts.year), Number(parts.month)-1, Number(parts.day),
    Number(parts.hour), Number(parts.minute)
  );
  const easternOffsetMs = localizedAsUtc - wallClockAsUtc;
  const timestamp = wallClockAsUtc - easternOffsetMs;
  const check = new Date(timestamp);
  const checkParts = Object.fromEntries(new Intl.DateTimeFormat("en-US", {
    timeZone: "America/New_York",
    year: "numeric", month: "2-digit", day: "2-digit",
    hour: "2-digit", minute: "2-digit", hourCycle: "h23"
  }).formatToParts(check).map(part => [part.type, part.value]));
  if (Number(checkParts.year) !== year || Number(checkParts.month)-1 !== month ||
      Number(checkParts.day) !== day || Number(checkParts.hour) !== hour ||
      Number(checkParts.minute) !== minute) return null;
  return check.toISOString();
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
    const quoteLabel = primary.lastTradeTimestamp || secondary.lastTradeTimestamp || null;
    const quoteTime = parseEasternQuoteLabel(quoteLabel);
    return Response.json({ticker, companyName:data.companyName || ticker, currency:primary.currency || "USD", exchange:data.exchange || "Unknown", price, previousClose:null, change:parseMoney(primary.netChange) ?? parseMoney(secondary.netChange), changePercent:parseMoney(primary.percentageChange) ?? parseMoney(secondary.percentageChange), quoteTime, quoteLabel, fetchedAt:new Date().toISOString(), marketState:data.marketStatus || "unknown", delayedOrRealtime:primary.isRealTime ? "Provider-labelled real-time; verify independently" : "Latest available quote; may be delayed", source:"Nasdaq quote API", interval:primary.isRealTime ? "provider-labelled real-time" : "latest available", warning:quoteTime ? "Quote timestamp interpreted from Nasdaq's Eastern Time label; verify price with your broker." : "Provider timestamp could not be normalized. Verify the price with your broker before acting."}, {headers:{"Cache-Control":"public, max-age=15","X-Content-Type-Options":"nosniff"}});
  } catch (error) { failures.push(String(error?.message || error)); }
  // Optional licensed providers: configure FINNHUB_API_KEY and/or FMP_API_KEY
  // as Cloudflare Pages secrets. Never claim real-time unless the provider contract
  // and response explicitly support it; timestamps are required for decision gating.
  if (typeof env !== "undefined" && env.FINNHUB_API_KEY) {
    try {
      const response = await fetch("https://finnhub.io/api/v1/quote?symbol=" + encodeURIComponent(ticker) + "&token=" + encodeURIComponent(env.FINNHUB_API_KEY), {
        headers: {"Accept":"application/json"}, signal: AbortSignal.timeout(7000)
      });
      if (!response.ok) throw new Error("Finnhub returned HTTP " + response.status);
      const raw = await response.json();
      if (!(typeof raw?.c === "number" && raw.c > 0 && Number.isFinite(raw.t) && raw.t > 0)) throw new Error("Finnhub returned no timestamped current quote");
      const quoteTime = new Date(raw.t * 1000).toISOString();
      return Response.json({
        ticker, companyName:ticker, currency:"USD", exchange:"Unknown",
        price:raw.c, previousClose:typeof raw.pc === "number" ? raw.pc : null,
        change:typeof raw.d === "number" ? raw.d : null,
        changePercent:typeof raw.dp === "number" ? raw.dp : null,
        quoteTime, fetchedAt:new Date().toISOString(), marketState:"unknown",
        delayedOrRealtime:"Finnhub provider quote; entitlement-dependent, verify independently",
        source:"Finnhub", interval:"provider quote",
        warning:"Finnhub quote timestamp supplied by provider. Feed delay and display rights depend on your account plan; verify with your broker."
      }, {headers:{"Cache-Control":"public, max-age=15","X-Content-Type-Options":"nosniff"}});
    } catch (error) { failures.push("Finnhub: " + String(error?.message || error)); }
  }
  if (typeof env !== "undefined" && env.FMP_API_KEY) {
    try {
      const response = await fetch("https://financialmodelingprep.com/stable/quote?symbol=" + encodeURIComponent(ticker) + "&apikey=" + encodeURIComponent(env.FMP_API_KEY), {
        headers: {"Accept":"application/json"}, signal: AbortSignal.timeout(7000)
      });
      if (!response.ok) throw new Error("Financial Modeling Prep returned HTTP " + response.status);
      const raw = await response.json();
      const item = Array.isArray(raw) ? raw[0] : null;
      if (!(typeof item?.price === "number" && item.price > 0 && Number.isFinite(item.timestamp) && item.timestamp > 0)) throw new Error("FMP returned no timestamped quote");
      const quoteTime = new Date(item.timestamp * 1000).toISOString();
      return Response.json({
        ticker, companyName:item.name || ticker, currency:"USD", exchange:item.exchange || "Unknown",
        price:item.price, previousClose:typeof item.previousClose === "number" ? item.previousClose : null,
        change:typeof item.change === "number" ? item.change : null,
        changePercent:typeof item.changePercentage === "number" ? item.changePercentage : null,
        quoteTime, fetchedAt:new Date().toISOString(), marketState:"unknown",
        delayedOrRealtime:"FMP provider quote; plan-dependent, verify independently",
        source:"Financial Modeling Prep", interval:"provider quote",
        warning:"FMP quote timestamp supplied by provider. Market-data freshness and display rights depend on your account plan; verify with your broker."
      }, {headers:{"Cache-Control":"public, max-age=15","X-Content-Type-Options":"nosniff"}});
    } catch (error) { failures.push("Financial Modeling Prep: " + String(error?.message || error)); }
  }
  return Response.json({ticker, error:"Current quote unavailable from all configured providers. Do not rely on a cached or guessed price.", fetchedAt:new Date().toISOString(), source:"Yahoo Finance / Nasdaq / optional Finnhub / optional Financial Modeling Prep", providerErrors:failures}, {status:503, headers:{"Cache-Control":"no-store","X-Content-Type-Options":"nosniff"}});
}
