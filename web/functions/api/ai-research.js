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
  const provider = env?.GEMINI_API_KEY ? "gemini" : env?.OPENAI_API_KEY ? "openai" : "";
  if (!provider) {
    return respond({ available: false, reason: "AI research is not configured. Add GEMINI_API_KEY in Cloudflare Pages settings." }, 503);
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
    let response, payload, outputText, model;
    if (provider === "gemini") {
      // Discover models from this key instead of pinning the fallback to a retired
      // or unavailable model ID. Only use models the API lists for generateContent.
      const listResponse = await fetch("https://generativelanguage.googleapis.com/v1beta/models?pageSize=100", {
        headers: { "Accept": "application/json", "x-goog-api-key": env.GEMINI_API_KEY },
        signal: AbortSignal.timeout(7000)
      });
      if (!listResponse.ok) {
        return respond({ available: false, reason: "Gemini model discovery failed.", provider, providerStatus: listResponse.status }, 502);
      }
      const modelPayload = await listResponse.json();
      const listed = Array.isArray(modelPayload.models) ? modelPayload.models : [];
      const supported = listed.filter(item =>
        typeof item?.name === "string" &&
        Array.isArray(item.supportedGenerationMethods) &&
        item.supportedGenerationMethods.includes("generateContent") &&
        !/embedding|aqa|tts|image|audio|veo|live|transcri/i.test(item.name)
      );
      const preferred = [
        env.GEMINI_RESEARCH_MODEL,
        "models/gemini-3.6-flash",
        "models/gemini-3.8-flash",
        "models/gemini-3.7-flash",
        "models/gemini-3.5-flash",
        "models/gemini-3.1-flash-lite",
        "models/gemini-2.5-flash",
        "models/gemini-2.5-pro"
      ].filter(Boolean);
      const candidates = [
        ...preferred.map(name => supported.find(item => item.name === name || item.name === "models/" + name)).filter(Boolean),
        ...supported
      ].filter((item, index, all) => all.findIndex(other => other.name === item.name) === index).slice(0, 3);
      if (!candidates.length) {
        return respond({ available: false, reason: "Gemini authenticated, but no supported text-generation model was listed.", provider, modelsListed: listed.length }, 502);
      }

      let lastStatus = 502;
      let lastDetail = "";
      for (const candidate of candidates) {
        model = candidate.name.replace(/^models\//, "");
        const endpoint = "https://generativelanguage.googleapis.com/v1beta/" + candidate.name + ":generateContent";
        response = await fetch(endpoint, {
          method: "POST",
          headers: { "x-goog-api-key": env.GEMINI_API_KEY, "Content-Type": "application/json" },
          body: JSON.stringify({
            systemInstruction: { parts: [{ text: "Return valid JSON only. You are a careful financial research assistant. Never invent facts or sources." }] },
            contents: [{ role: "user", parts: [{ text: prompt }] }],
            tools: [{ google_search: {} }],
            generationConfig: { responseMimeType: "application/json", maxOutputTokens: 1800, temperature: 0.1 }
          }),
          signal: AbortSignal.timeout(20000)
        });
        if (response.ok) break;
        lastStatus = response.status;
        lastDetail = await response.text().catch(() => "");
        // A 404 can mean this key does not have access to this particular listed model;
        // continue to the next model. A 400 usually means a request/configuration issue,
        // while 429 is quota/rate limiting and will not improve by switching models.
        if ([400, 429].includes(response.status)) break;
      }
      if (!response?.ok) {
        return respond({
          available: false, reason: "Gemini research generation failed on the available models.",
          provider, providerStatus: lastStatus, modelsTried: candidates.map(item => item.name.replace(/^models\//, "")),
          detail: cleanText(lastDetail, 180)
        }, 502);
      }
    } else {
      model = env.OPENAI_RESEARCH_MODEL || "gpt-5";
      response = await fetch("https://api.openai.com/v1/responses", {
        method: "POST",
        headers: { "Authorization": "Bearer " + env.OPENAI_API_KEY, "Content-Type": "application/json" },
        body: JSON.stringify({
          model,
          tools: [{ type: "web_search" }],
          input: prompt,
          text: { format: { type: "json_object" } },
          max_output_tokens: 1800
        }),
        signal: AbortSignal.timeout(25000)
      });
    }
    if (!response.ok) {
      const detail = await response.text().catch(() => "");
      return respond({ available: false, reason: "AI research provider request failed.", provider, providerStatus: response.status, detail: cleanText(detail, 180) }, 502);
    }
    payload = await response.json();
    outputText = provider === "gemini"
      ? (payload.candidates || []).flatMap(candidate => candidate.content?.parts || []).map(part => part.text || "").join("\n")
      : (payload.output_text || (payload.output || [])
        .flatMap(item => item.content || [])
        .filter(item => item.type === "output_text")
        .map(item => item.text || "").join("\n"));
    let research;
    try { research = JSON.parse(outputText); } catch { return respond({ available: false, reason: "AI research response could not be parsed.", provider, model }, 502); }
    if (!research || typeof research !== "object" || Array.isArray(research)) {
      return respond({ available: false, reason: "AI research returned an invalid response shape.", provider, model }, 502);
    }
    const safeUrl = value => {
      try {
        const parsed = new URL(String(value || ""));
        return parsed.protocol === "https:" && parsed.hostname.includes(".") ? parsed.toString() : "";
      } catch { return ""; }
    };
    const findings = (Array.isArray(research.findings) ? research.findings : []).slice(0, MAX_FIELDS)
      .map(item => ({
        field: cleanText(item?.field, 100),
        value: cleanText(item?.value, 1200),
        sourceTitle: cleanText(item?.sourceTitle, 240),
        sourceUrl: safeUrl(item?.sourceUrl),
        publishedDate: cleanText(item?.publishedDate, 40),
        asOfDate: cleanText(item?.asOfDate, 40),
        confidence: cleanText(item?.confidence, 40),
        evidenceType: cleanText(item?.evidenceType, 100)
      }))
      .filter(item => item.field && item.value && item.sourceTitle && item.sourceUrl);
    const companyDescription = cleanText(research.companyDescription, 700);
    const notes = (Array.isArray(research.notes) ? research.notes : [])
      .map(note => cleanText(note, 400)).filter(Boolean).slice(0, 8);
    if (!findings.length) {
      return respond({ available: false, reason: "AI research returned no source-linked findings.", provider, model, notes }, 502);
    }
    return respond({
      available: true, provider, model, ticker, companyDescription, findings, notes,
      disclaimer: "Supplemental AI-assisted research only. Source links must be reviewed. These findings do not replace native market/SEC data or alter Northstar's decision, valuation, or validation gates."
    });
  } catch (error) {
    return respond({ available: false, reason: "AI research request failed.", provider, detail: cleanText(error?.message || error, 200) }, 502);
  }
}
