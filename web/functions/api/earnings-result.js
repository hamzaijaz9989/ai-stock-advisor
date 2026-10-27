const TICKER_RE = /^[A-Z][A-Z0-9.-]{0,11}$/;
const QUARTER_RE = /^Q[1-4]-20\d{2}$/;

export async function onRequestGet({ request }) {
  const url = new URL(request.url);
  const ticker = (url.searchParams.get("ticker") || "").trim().toUpperCase();
  const quarter = (url.searchParams.get("quarter") || "").trim().toUpperCase();

  if (!TICKER_RE.test(ticker)) {
    return Response.json({available:false,reason:"Enter a valid US stock ticker."},{status:400});
  }
  if (!QUARTER_RE.test(quarter)) {
    return Response.json({available:false,reason:"A valid fiscal quarter is required (for example Q3-2026)."}, {status:400});
  }

  const endpoint = "https://earningsnxt.ai/api/v1/briefs/" +
    encodeURIComponent(ticker) + "/" + encodeURIComponent(quarter);
  try {
    const response = await fetch(endpoint, {
      headers: {"Accept":"application/json"},
      signal: AbortSignal.timeout(8500)
    });

    if (response.status === 401 || response.status === 403 || response.status === 404) {
      const message = response.status === 404
        ? "No public earnings brief is available for this fiscal quarter."
        : "The third-party provider requires an API key for this ticker or brief.";
      return Response.json({
        ticker, quarter, provider:"EarningsNxt public brief",
        available:false, reason:message, httpStatus:response.status,
        fetchedAt:new Date().toISOString(),
        sourceUrl:"https://earningsnxt.ai/docs/api"
      }, {headers:{"Cache-Control":"public, max-age=300","X-Content-Type-Options":"nosniff"}});
    }
    if (!response.ok) throw new Error("Earnings brief returned HTTP " + response.status);

    const payload = await response.json();
    if (String(payload.symbol || "").toUpperCase() !== ticker ||
        String(payload.fiscalQuarter || "").toUpperCase() !== quarter) {
      throw new Error("The earnings brief did not match the requested ticker and quarter.");
    }

    const estimates = payload.estimates && typeof payload.estimates === "object" ? {
      consensusEps: Number.isFinite(payload.estimates.consensusEps) ? payload.estimates.consensusEps : null,
      consensusRevenue: Number.isFinite(payload.estimates.consensusRevenue) ? payload.estimates.consensusRevenue : null,
      numAnalysts: Number.isFinite(payload.estimates.numAnalysts) ? payload.estimates.numAnalysts : null
    } : null;
    const nullableNumber = key => Number.isFinite(payload[key]) ? payload[key] : null;
    const post = payload.postBrief && typeof payload.postBrief === "object" ? payload.postBrief : null;
    const guidance = post?.guidanceChanges && typeof post.guidanceChanges === "object"
      ? {
          summary: typeof post.guidanceChanges.summary === "string" ? post.guidanceChanges.summary : null,
          changes: Array.isArray(post.guidanceChanges.changes) ? post.guidanceChanges.changes.slice(0,8) : []
        } : null;
    const commentary = post?.managementCommentary && typeof post.managementCommentary === "object"
      ? {
          summary: typeof post.managementCommentary.summary === "string" ? post.managementCommentary.summary : null,
          tone: typeof post.managementCommentary.tone === "string" ? post.managementCommentary.tone : null,
          keyQuotes: Array.isArray(post.managementCommentary.keyQuotes) ? post.managementCommentary.keyQuotes.slice(0,5) : []
        } : null;

    return Response.json({
      ticker, quarter, provider:"EarningsNxt public brief",
      available:true,
      fetchedAt:new Date().toISOString(),
      reportDate:typeof payload.reportDate === "string" ? payload.reportDate : null,
      reportTime:["BMO","AMC"].includes(payload.reportTime) ? payload.reportTime : "unknown",
      status:typeof payload.status === "string" ? payload.status : "unknown",
      tier:typeof payload.tier === "string" ? payload.tier : "unknown",
      company:payload.company && typeof payload.company === "object" ? {
        name:typeof payload.company.name==="string" ? payload.company.name : ticker,
        sector:typeof payload.company.sector==="string" ? payload.company.sector : null,
        industry:typeof payload.company.industry==="string" ? payload.company.industry : null
      } : null,
      estimates,
      actualEps:nullableNumber("actualEps"),
      actualRevenue:nullableNumber("actualRevenue"),
      epsSurprisePct:nullableNumber("epsSurprisePct"),
      revenueSurprisePct:nullableNumber("revenueSurprisePct"),
      stockReaction1d:nullableNumber("stockReaction1d"),
      stockReaction5d:nullableNumber("stockReaction5d"),
      headline:typeof post?.headline==="string" ? post.headline : null,
      managementCommentary:commentary,
      guidanceChanges:guidance,
      whatItMeans:typeof post?.whatItMeans==="string" ? post.whatItMeans : null,
      keyTakeaways:Array.isArray(payload.keyTakeaways) ? payload.keyTakeaways.slice(0,8) : [],
      sourceUrl:typeof payload.webUrl === "string" ? payload.webUrl : "https://earningsnxt.ai/",
      warning:"Third-party secondary research. Consensus definitions and generated commentary may be incomplete or inconsistent; verify actual results against the company's earnings release and SEC filings. Missing actual values are left null."
    }, {headers:{"Cache-Control":"public, max-age=300","X-Content-Type-Options":"nosniff"}});
  } catch (error) {
    return Response.json({
      ticker,quarter,provider:"EarningsNxt public brief",
      available:false,
      reason:"The earnings brief could not be verified. No actual result or consensus number has been inferred.",
      detail:String(error?.message || error),
      fetchedAt:new Date().toISOString(),
      sourceUrl:"https://earningsnxt.ai/docs/api"
    }, {status:503,headers:{"Cache-Control":"no-store","X-Content-Type-Options":"nosniff"}});
  }
}
