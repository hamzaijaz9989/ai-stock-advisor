const TICKER_RE = /^[A-Z][A-Z0-9.-]{0,11}$/;
const NASDAQ_API = "https://api.nasdaq.com/api/calendar/earnings";

function newYorkDateOnly(date) {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: "America/New_York",
    year: "numeric",
    month: "2-digit",
    day: "2-digit"
  }).formatToParts(date);
  const values = Object.fromEntries(parts.map(part => [part.type, part.value]));
  return values.year + "-" + values.month + "-" + values.day;
}

function dateAdd(dateString, days) {
  const date = new Date(dateString + "T12:00:00Z");
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

function weekdaysInWindow(start, days) {
  const out = [];
  for (let n = 0; n <= days; n++) {
    const date = dateAdd(start, n);
    const day = new Date(date + "T12:00:00Z").getUTCDay();
    if (day !== 0 && day !== 6) out.push(date);
  }
  return out;
}

function parseDollar(value) {
  if (typeof value !== "string") return null;
  const number = Number(value.replace(/[$,]/g, "").trim());
  return Number.isFinite(number) ? number : null;
}

async function queryEarningsDate(date) {
  const response = await fetch(NASDAQ_API + "?date=" + date, {
    headers: {
      "Accept": "application/json, text/plain, */*",
      "User-Agent": "Mozilla/5.0 (compatible; AIStockAdvisor/1.0)",
      "Origin": "https://www.nasdaq.com",
      "Referer": "https://www.nasdaq.com/market-activity/earnings"
    },
    signal: AbortSignal.timeout(7000)
  });
  if (!response.ok) throw new Error("Nasdaq calendar returned HTTP " + response.status + " for " + date);
  const payload = await response.json();
  if (!Array.isArray(payload?.data?.rows)) {
    throw new Error("Nasdaq calendar response did not contain a rows array for " + date);
  }
  return { date, rows: payload.data.rows };
}

function mapEvent(row, date) {
  const time = String(row.time || "").toLowerCase();
  return {
    symbol: String(row.symbol || "").toUpperCase(),
    company: String(row.name || row.symbol || ""),
    reportDate: date,
    reportTime: time.includes("pre-market") ? "BMO" : time.includes("after-hours") ? "AMC" : "unknown",
    fiscalQuarterEnding: String(row.fiscalQuarterEnding || "not provided"),
    consensusEps: parseDollar(row.epsForecast),
    estimateCount: Number.isFinite(Number(row.noOfEsts)) ? Number(row.noOfEsts) : null,
    priorYearReportDate: String(row.lastYearRptDt || ""),
    sourceUrl: "https://www.nasdaq.com/market-activity/earnings/" + date
  };
}

export async function onRequestGet({ request }) {
  const url = new URL(request.url);
  const ticker = (url.searchParams.get("ticker") || "").trim().toUpperCase();
  if (!TICKER_RE.test(ticker)) {
    return Response.json({ error: "Enter a valid US stock ticker." }, { status: 400 });
  }

  const start = newYorkDateOnly(new Date());
  const dates = weekdaysInWindow(start, 31);
  const failedDates = [];
  const searched = [];
  let match = null;
  let matchDate = null;

  try {
    for (let i = 0; i < dates.length; i += 5) {
      const batch = dates.slice(i, i + 5);
      const results = await Promise.allSettled(batch.map(queryEarningsDate));
      for (let j = 0; j < results.length; j++) {
        const result = results[j];
        const date = batch[j];
        searched.push(date);
        if (result.status !== "fulfilled") {
          failedDates.push(date);
          continue;
        }
        const row = result.value.rows.find(item => String(item.symbol || "").trim().toUpperCase() === ticker);
        if (row && !match) {
          match = mapEvent(row, date);
          matchDate = date;
        }
      }
      if (match) break;
    }

    const incompleteBeforeMatch = Boolean(match && failedDates.some(date => date <= matchDate));
    const verified = Boolean(match && !incompleteBeforeMatch);
    return Response.json({
      ticker,
      provider: "Nasdaq public earnings calendar",
      fetchedAt: new Date().toISOString(),
      windowStart: start,
      windowEnd: dateAdd(start, 31),
      checkedDates: searched.length,
      failedDates,
      events: match ? [match] : [],
      found: Boolean(match),
      verified,
      calendarLimitReached: false,
      warning: match
        ? "A date was found in Nasdaq's public calendar. Verify the event on the company's investor-relations website before trading."
        : "No matching event was found in the returned Nasdaq calendar dates. This does not prove that no earnings report is scheduled; the next date remains unconfirmed.",
      sourceUrl: "https://www.nasdaq.com/market-activity/earnings"
    }, {
      headers: {
        "Cache-Control": "public, max-age=300",
        "X-Content-Type-Options": "nosniff"
      }
    });
  } catch (error) {
    return Response.json({
      ticker,
      provider: "Nasdaq public earnings calendar",
      fetchedAt: new Date().toISOString(),
      events: [],
      found: false,
      verified: false,
      error: "Upcoming earnings could not be verified. No event date has been assumed.",
      detail: String(error?.message || error),
      sourceUrl: "https://www.nasdaq.com/market-activity/earnings"
    }, {
      status: 503,
      headers: { "Cache-Control": "no-store", "X-Content-Type-Options": "nosniff" }
    });
  }
}
