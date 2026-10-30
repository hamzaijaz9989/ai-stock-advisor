// Secure Gemini API health check: verifies auth and performs a tiny real generation.
// Never returns or logs the API key or generated text.
export async function onRequestGet({ env }) {
  const key = env?.GEMINI_API_KEY;
  const headers = {
    "Cache-Control": "no-store",
    "Content-Type": "application/json; charset=utf-8",
    "X-Content-Type-Options": "nosniff"
  };

  if (!key) {
    return Response.json({
      available: false, configured: false, provider: "Google Gemini",
      reason: "GEMINI_API_KEY is not configured in this deployment."
    }, { status: 503, headers });
  }

  try {
    const listResponse = await fetch(
      "https://generativelanguage.googleapis.com/v1beta/models",
      { method: "GET", headers: { "Accept": "application/json", "x-goog-api-key": key } }
    );

    if (!listResponse.ok) {
      const status = listResponse.status;
      const reason = status === 400 || status === 401 || status === 403
        ? "Gemini authentication or API access was rejected. Check the key, API enablement and restrictions."
        : status === 429
          ? "Gemini key was accepted, but the request was rate-limited or quota is exhausted."
          : "Gemini model-list request failed.";
      return Response.json({
        available: false, configured: true, authenticated: status === 429,
        generationTest: "not_run", provider: "Google Gemini",
        upstreamStatus: status, reason
      }, { status: status === 429 ? 429 : 502, headers });
    }

    const payload = await listResponse.json();
    const models = Array.isArray(payload.models) ? payload.models : [];
    const supported = models.filter(m =>
      Array.isArray(m.supportedGenerationMethods) &&
      m.supportedGenerationMethods.includes("generateContent")
    );
    const preferredNames = [
      "models/gemini-3.8-flash",
      "models/gemini-2.5-flash",
      "models/gemini-2.0-flash"
    ];
    const candidates = [
      ...preferredNames.map(name => supported.find(m => m.name === name)).filter(Boolean),
      ...supported.filter(m => !/embedding|aqa|tts|image|audio|veo/i.test(m.name || ""))
    ].filter((m, i, a) => a.findIndex(x => x.name === m.name) === i).slice(0, 3);

    if (!candidates.length) {
      return Response.json({
        available: false, configured: true, authenticated: true,
        generationTest: "not_run", provider: "Google Gemini",
        modelsListed: models.length, generateContentModelsAvailable: supported.length,
        reason: "Authentication passed, but no suitable text-generation model was listed."
      }, { status: 502, headers });
    }

    let generationResponse;
    let chosen;
    const attempted = [];
    for (const candidate of candidates) {
      chosen = candidate;
      generationResponse = await fetch(
        "https://generativelanguage.googleapis.com/v1beta/" + candidate.name + ":generateContent",
        {
          method: "POST",
          headers: { "Content-Type": "application/json", "x-goog-api-key": key },
          body: JSON.stringify({
            contents: [{ role: "user", parts: [{ text: "Reply with exactly: NORTHSTAR GEMINI TEST OK" }] }],
            generationConfig: { temperature: 0, maxOutputTokens: 16 }
          })
        }
      );
      attempted.push({ model: candidate.name.replace(/^models\//, ""), status: generationResponse.status });
      if (generationResponse.ok || generationResponse.status === 429) break;
    }

    if (!generationResponse?.ok) {
      const status = generationResponse?.status || 502;
      const reason = status === 400 || status === 401 || status === 403
        ? "Authentication passed for model listing, but text generation was rejected. Check model access and API restrictions."
        : status === 429
          ? "Authentication passed, but text generation quota or rate limit was reached."
          : "Text generation failed on the tested models. Google may be experiencing a temporary service issue or model access problem.";
      return Response.json({
        available: false, configured: true, authenticated: true,
        generationTest: "failed", provider: "Google Gemini",
        attemptedModels: attempted, upstreamStatus: status, reason
      }, { status: status === 429 ? 429 : 502, headers });
    }

    const generated = await generationResponse.json();
    const generatedText = (generated.candidates || [])
      .flatMap(c => c.content?.parts || [])
      .some(p => typeof p.text === "string" && p.text.trim().length > 0);

    return Response.json({
      available: generatedText, configured: true, authenticated: true,
      generationTest: generatedText ? "passed" : "no_text_returned",
      provider: "Google Gemini",
      model: chosen.name.replace(/^models\//, ""),
      modelsListed: models.length,
      generateContentModelsAvailable: supported.length,
      checkedAt: new Date().toISOString()
    }, { status: generatedText ? 200 : 502, headers });
  } catch {
    return Response.json({
      available: false, configured: true, provider: "Google Gemini",
      generationTest: "failed",
      reason: "Could not complete the Gemini API test. Check network availability and retry."
    }, { status: 502, headers });
  }
}
