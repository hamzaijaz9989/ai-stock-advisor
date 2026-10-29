const TICKER_RE = /^[A-Z0-9.^=-]{1,12}$/;
const MAX_FIELDS = 16;
const ALLOWED_FIELD = /^[a-zA-Z0-9 _().,/:-]{1,100}$/;

function cleanText(value, max = 500) {
  return String(value ?? "").replace(/[\u0000-\u001f\u007f]/g, " ").trim().slice(0, max);
}

export async function onRequestPost({ request, env }) {
  const origin = new URL(request.url).origin;
  const headers = {
    "Content-Type": "application/json; charset=utf-8",
    "Cache-Control": "no-store",
    "Access-Control-Allow-Origin": origin,
    "X-Content-Type-Options": "nosniff"
  };
  const respond = (payload, status = 200) => Response.json(payload, { status, headers });
  if (!env?.OPENAI_API_KEY) {
    return respond({ available: false, reason: "AI research service is not configured." }, 503);
  }
  let body;
  try { body = await request.json(); } catch { return respond({ error: "Invalid JSON body." }, 400); }
  const ticker = cleanText(body?.ticker, 12).toUpperCase();
  if (!TICKER_RE.test(ticker)) return respond({ error: "Invalid ticker." }, 400);

  const companyName = cleanText(body?.companyName, 160);
  const missingFields = Array.isArray(body?.missingFields)
    ? body.missingFields.filter(x => typeof x === "string" && ALLOWED_FIELD.test(x)).slice(0, MAX_FIELDS)
    : [];
  const nativeContext = cleanText(JSON.stringify(body?.nativeContext || {}), 5000);
  const prompt = [
    "You are the source-research fallback for Northstar AI, a research-only US stock research application.",
    "Northstar's native SEC, quote, history, earnings, and news systems remain authoritative for calculations.",
    "Research the company and each requested gap using web search. Prefer SEC filings, official investor-relations pages, exchange/provider primary sources, then reputable publishers.",
    "Return JSON only with keys: companyDescription (string), findings (array of objects with field, value, sourceTitle, sourceUrl, publishedDate, asOfDate, confidence, evidenceType), notes (array of strings).",
    "Every finding must include a direct source URL and a date if available. Never invent a fact, number, date, source, or URL. If a requested item cannot be verified, omit it and explain in notes.",
    "Do not treat an AI estimate as reported company data. Never fabricate a stock price, financial metric, analyst estimate, earnings date, or valuation input.",
    "For numeric financial facts, only return values explicitly reported by a cited source and preserve units, period, currency, and whether reported or estimated in the value/evidenceType.",
    "companyDescription must be concise plain English and based on reliable sources. Do not provide a BUY/SELL recommendation.",
    "Ticker: " + ticker,
    "Company name from SEC mapping: " + (companyName || "not supplied"),
    "Gaps Northstar identified: " + (missingFields.length ? missingFields.join("; ") : "verify plain-English company description and any obvious context gaps"),
    "Existing native-system context (untrusted hints; verify independently): " + nativeContext
  ].join("\n\n");

  try {
    const response = await fetch("https://api.openai.com/v1/responses", {
      method: "POST",
      headers: { "Authorization": "Bearer " + env.OPENAI_API_KEY, "Content-Type": "application/json" },
      body: JSON.stringify({
        model: env.OPENAI_RESEARCH_MODEL || "gpt-5",
        tools: [{ type: "web_search" }],
        input: prompt,
        text: { format: { type: "json_object" } },
        max_output_tokens: 1800
      }),
      signal: AbortSignal.timeout(25000)
    });
    if (!response.ok) {
      const detail = await response.text().catch(() => "");
      return respond({ available: false, reason: "AI research provider request failed.", providerStatus: response.status, detail: detail.slice(0, 240) }, 502);
    }
    const payload = await response.json();
    const outputText = payload.output_text || (payload.output || [])
      .flatMap(item => item.content || [])
      .filter(item => item.type === "output_text")
      .map(item => item.text || "").join("\n");
    let research;
    try { research = JSON.parse(outputText); } catch { return respond({ available: false, reason: "AI research response could not be parsed." }, 502); }
    const findings = Array.isArray(research.findings) ? research.findings.slice(0, 12).filter(item =>
      item && typeof item.field === "string" && typeof item.value === "string" &&
      typeof item.sourceUrl === "string" && /^https?:\/\//i.test(item.sourceUrl) &&
      typeof item.sourceTitle === "string"
    ).map(item => ({
      field: cleanText(item.field, 100),
      value: cleanText(item.value, 1200),
      sourceTitle: cleanText(item.sourceTitle, 180),
      sourceUrl: cleanText(item.sourceUrl, 1000),
      publishedDate: cleanText(item.publishedDate, 40),
      asOfDate: cleanText(item.asOfDate, 40),
      confidence: ["high", "medium", "low"].includes(String(item.confidence).toLowerCase()) ? String(item.confidence).toLowerCase() : "unrated",
      evidenceType: cleanText(item.evidenceType, 80)
    })) : [];
    return respond({
      available: true,
      ticker,
      companyDescription: cleanText(research.companyDescription, 900),
      findings,
      notes: Array.isArray(research.notes) ? research.notes.slice(0, 8).map(x => cleanText(x, 300)) : [],
      retrievedAt: new Date().toISOString(),
      model: env.OPENAI_RESEARCH_MODEL || "gpt-5"
    });
  } catch (error) {
    return respond({ available: false, reason: "AI research request failed.", detail: cleanText(error?.message || error, 200) }, 502);
  }
}
