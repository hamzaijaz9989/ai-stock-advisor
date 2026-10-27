const TICKER_RE = /^[A-Z][A-Z0-9.-]{0,11}$/;
const API_BASE = "https://earningsnxt.ai/api/v1/calendar";

function dateOnly(date) {
  return date.toISOString().slice(0, 10);
}

export async function onRequestGet({ request }) {
  const url = new URL(request.url);
  const ticker = (url.searchParams.get("ticker") || "").trim().toUpperCase();
  if (!TICKER_RE.test(ticker)) {
    return Response.json({ error: "Enter a valid US stock ticker." }, { status: 400 });
  }

  const from = new Date();
  from.setUTCDate(from.getUTCDate() - 1);
  const to = new Date(from);
  to.setUTCDate(to.getUTCDate() + 31);
  const windowStart = dateOnly(from);
  const windowEnd = dateOnly(to);
  const endpoint = API_BASE + "?from=" + windowStart + "&to=" + windowEnd + "&limit=500";

  try {
    const response = await fetch(endpoint, {
      headers: { "Accept": "application/json" },
      signal: AbortSignal.timeout(9000)
    });
    if (!response.ok) {
      throw new Error("Earnings calendar returned HTTP " + response.status);
    }

    const payload = await response.json();
    if (!Array.isArray(payload?.events)) {
      throw new Error("Earnings calendar response did not contain an events array");
    }

    const events = payload.events
      .filter(event => String(event.symbol || "").trim().toUpperCase() === ticker)
      .filter(event => event.reportDate && event.reportDate >= windowStart && event.reportDate <= windowEnd)
      .sort((a, b) => String(a.reportDate).localeCompare(String(b.reportDate)))
      .slice(0, 5)
      .map(event => ({
        symbol: ticker,
        company: String(event.company || ticker),
        reportDate: String(event.reportDate),
        reportTime: ["BMO", "AMC"].includes(event.reportTime) ? event.reportTime : "unknown",
        fiscalQuarter: String(event.fiscalQuarter || "not provided"),
        status: String(event.status || "unconfirmed"),
        estimates: event.estimates && typeof event.estimates === "object" ? {
          consensusEps: Number.isFinite(event.estimates.consensusEps) ? event.estimates.consensusEps : null,
          consensusRevenue: Number.isFinite(event.estimates.consensusRevenue) ? event.estimates.consensusRevenue : null,
          numAnalysts: Number.isFinite(event.estimates.numAnalysts) ? event.estimates.numAnalysts : null
        } : null,
        impliedMovePct: Number.isFinite(event.impliedMovePct) ? event.impliedMovePct : null,
        sourceUrl: typeof event.webUrl === "string" ? event.webUrl : "https://earningsnxt.ai/"
      }));

    const capped = payload.events.length >= 500;
    return Response.json({
      ticker,
      provider: "EarningsNxt public calendar",
      fetchedAt: new Date().toISOString(),
      windowStart,
      windowEnd,
      events,
      found: events.length > 0,
      calendarLimitReached: capped,
      warning: events.length
        ? "Third-party calendar estimate. Confirm the report date and time on the company's investor-relations website before trading."
        : (capped
          ? "The provider returned its 500-event limit and no matching event was found. The calendar may be incomplete; the next earnings date is not confirmed."
          : "No matching event appeared in this provider's returned 31-day window. This does not prove the company has no upcoming earnings; its investor-relations calendar must be checked."),
      sourceUrl: "https://earningsnxt.ai/docs/api"
    }, {
      headers: {
        "Cache-Control": "public, max-age=300",
        "X-Content-Type-Options": "nosniff"
      }
    });
  } catch (error) {
    return Response.json({
      ticker,
      found: false,
      provider: "EarningsNxt public calendar",
      fetchedAt: new Date().toISOString(),
      error: "Upcoming earnings could not be verified. No event date has been assumed.",
      detail: String(error?.message || error),
      sourceUrl: "https://earningsnxt.ai/docs/api"
    }, {
      status: 503,
      headers: { "Cache-Control": "no-store", "X-Content-Type-Options": "nosniff" }
    });
  }
}
