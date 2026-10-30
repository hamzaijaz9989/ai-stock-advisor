// Secure Gemini API connectivity check. Never returns or logs the API key.
export async function onRequestGet({ env }) {
  const key = env?.GEMINI_API_KEY;
  const headers = {
    "Cache-Control": "no-store",
    "Content-Type": "application/json; charset=utf-8",
    "X-Content-Type-Options": "nosniff"
  };

  if (!key) {
    return Response.json({
      available: false,
      configured: false,
      provider: "Google Gemini",
      reason: "GEMINI_API_KEY is not configured in this deployment."
    }, { status: 503, headers });
  }

  try {
    const response = await fetch(
      "https://generativelanguage.googleapis.com/v1beta/models?key=" + encodeURIComponent(key),
      { method: "GET", headers: { "Accept": "application/json" } }
    );

    if (!response.ok) {
      // Do not forward upstream body: it may contain request metadata.
      const status = response.status;
      let reason = "Gemini rejected the request.";
      if (status === 400 || status === 401 || status === 403) reason = "Gemini authentication or API access was rejected. Check the key, API enablement and restrictions.";
      else if (status === 429) reason = "Gemini key was accepted, but the request was rate-limited or quota is exhausted.";
      else if (status >= 500) reason = "Google Gemini is temporarily unavailable.";
      return Response.json({
        available: false,
        configured: true,
        authenticated: status === 429,
        provider: "Google Gemini",
        upstreamStatus: status,
        reason
      }, { status: status === 429 ? 429 : 502, headers });
    }

    const payload = await response.json();
    const models = Array.isArray(payload.models) ? payload.models : [];
    const usable = models.filter(m => Array.isArray(m.supportedGenerationMethods) && m.supportedGenerationMethods.includes("generateContent"));
    return Response.json({
      available: true,
      configured: true,
      authenticated: true,
      provider: "Google Gemini",
      modelsListed: models.length,
      generateContentModelsAvailable: usable.length,
      checkedAt: new Date().toISOString()
    }, { status: 200, headers });
  } catch {
    return Response.json({
      available: false,
      configured: true,
      provider: "Google Gemini",
      reason: "Could not reach the Gemini API. Check network availability and retry."
    }, { status: 502, headers });
  }
}
