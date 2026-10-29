const TICKER_RE = /^[A-Z][A-Z0-9.-]{0,11}$/;
const NASDAQ_API = "https://api.nasdaq.com/api/calendar/earnings";
const EARNINGSNXT_API = "https://earningsnxt.ai/api/v1/calendar";

function newYorkDateOnly(date) {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: "America/New_York", year: "numeric", month: "2-digit", day: "2-digit"
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

async function queryNasdaqDate(date) {
  const response = await fetch(NASDAQ_API + "?date=" + date, {
    headers: {
      "Accept": "application/json, text/plain, */*",
      "User-Agent": "Mozilla/5.0 (compatible; AIStockAdvisor/1.0)",
      "Origin": "https://www.nasdaq.com",
      "Referer": "https://www.nasdaq.com/market-activity/earnings"
    },
    signal: AbortSignal.timeout(7000)
  });
  if (!response.ok) throw new Error("Nasdaq earnings calendar returned HTTP " + response.status + " for " + date);
  const payload = await response.json();
  if (Array.isArray(payload?.data?.rows)) return payload.data.rows;
  // Nasdaq represents closed-market/empty calendar dates as rows:null with HTTP 200.
  if (payload?.data && payload?.status?.rCode === 200 && payload.data.rows == null) return [];
  throw new Error("Nasdaq earnings response was incomplete for " + date);
}

function mapNasdaqEvent(row, date) {
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

async function queryEarningsNxtWindow(from, to) {
  const endpoint = EARNINGSNXT_API + "?from=" + from + "&to=" + to + "&limit=500";
  const response = await fetch(endpoint, {
    headers: {"Accept":"application/json"},
    signal: AbortSignal.timeout(8000)
  });
  if (!response.ok) throw new Error("EarningsNxt calendar returned HTTP " + response.status);
  const payload = await response.json();
  if (!Array.isArray(payload?.events)) throw new Error("EarningsNxt calendar response had no events array");
  return {
    from, to,
    events: payload.events,
    capped: payload.events.length >= 500 || Number(payload.count) >= 500
  };
}

function mapEarningsNxtEvent(event) {
  return {
    symbol: String(event.symbol || "").toUpperCase(),
    company: String(event.company || event.symbol || ""),
    reportDate: String(event.reportDate || ""),
    reportTime: ["BMO","AMC"].includes(event.reportTime) ? event.reportTime : "unknown",
    fiscalQuarter: String(event.fiscalQuarter || "not provided"),
    status: String(event.status || "unconfirmed"),
    consensusEps: Number.isFinite(event.estimates?.consensusEps) ? event.estimates.consensusEps : null,
    consensusRevenue: Number.isFinite(event.estimates?.consensusRevenue) ? event.estimates.consensusRevenue : null,
    impliedMovePct: Number.isFinite(event.impliedMovePct) ? event.impliedMovePct : null,
    sourceUrl: typeof event.webUrl === "string" ? event.webUrl : "https://earningsnxt.ai/",
    briefUrl: typeof event.briefUrl === "string" ? event.briefUrl : null
  };
}

function responseHeaders(cache = "public, max-age=300") {
  return {"Cache-Control":cache,"X-Content-Type-Options":"nosniff"};
}

export async function onRequestGet({ request }) {
  const url = new URL(request.url);
  const ticker = (url.searchParams.get("ticker") || "").trim().toUpperCase();
  if (!TICKER_RE.test(ticker)) {
    return Response.json({error:"Enter a valid US stock ticker."},{status:400});
  }

  const today = newYorkDateOnly(new Date());
  const nearTermEnd = dateAdd(today,31);
  const throughDate = dateAdd(today,180);
  const nearTermDates = weekdaysInWindow(today,31);
  const checkedDates = [];
  const failedDates = [];
  let nearTermMatch = null;

  // Prefer Nasdaq's daily earnings calendar for the next month.
  for (let i=0; i<nearTermDates.length; i+=5) {
    const batch=nearTermDates.slice(i,i+5);
    const results=await Promise.allSettled(batch.map(queryNasdaqDate));
    for (let j=0;j<results.length;j++) {
      const date=batch[j];
      checkedDates.push(date);
      const result=results[j];
      if (result.status!=="fulfilled") {
        failedDates.push(date);
        continue;
      }
      const row=result.value.find(item=>String(item.symbol||"").trim().toUpperCase()===ticker);
      if (row && !nearTermMatch) nearTermMatch=mapNasdaqEvent(row,date);
    }
    if (nearTermMatch) {
      const incompleteBeforeMatch=failedDates.some(date=>date<=nearTermMatch.reportDate);
      // Enrich the Nasdaq event with its fiscal-quarter ID when the public Nxt calendar has it.
      // Failure to enrich does not invalidate the Nasdaq event date itself.
      try {
        const enrichment=await queryEarningsNxtWindow(nearTermMatch.reportDate,nearTermMatch.reportDate);
        if(!enrichment.capped) {
          const secondary=enrichment.events.find(event=>
            String(event.symbol||"").trim().toUpperCase()===ticker &&
            String(event.reportDate||"")===nearTermMatch.reportDate
          );
          if(secondary) {
            nearTermMatch.fiscalQuarter=String(secondary.fiscalQuarter||"");
            nearTermMatch.briefUrl=typeof secondary.briefUrl==="string"?secondary.briefUrl:null;
            nearTermMatch.webUrl=typeof secondary.webUrl==="string"?secondary.webUrl:null;
            nearTermMatch.consensusRevenue=Number.isFinite(secondary.estimates?.consensusRevenue)?secondary.estimates.consensusRevenue:null;
            nearTermMatch.impliedMovePct=Number.isFinite(secondary.impliedMovePct)?secondary.impliedMovePct:null;
            nearTermMatch.nxtProvider="EarningsNxt public calendar";
          }
        }
      } catch (_) {
        // Keep the primary Nasdaq event and explicitly note third-party enrichment was unavailable.
      }
      return Response.json({
        ticker, provider:"Nasdaq public earnings calendar", fetchedAt:new Date().toISOString(),
        windowStart:today, windowEnd:nearTermEnd, throughDate, checkedDates:checkedDates.length,
        events:[nearTermMatch], found:true, verified:!incompleteBeforeMatch,
        failedDates, calendarLimitReached:false,
        warning:incompleteBeforeMatch
          ? "A Nasdaq calendar event was found, but one or more earlier dates failed to load. Confirm the earliest upcoming event with company investor relations."
          : "A date was found in Nasdaq's public calendar. Verify the report date and time on the company's investor-relations website before trading.",
        sourceUrl:"https://www.nasdaq.com/market-activity/earnings"
      },{headers:responseHeaders()});
    }
  }

  // If Nasdaq's near-term calendar had any failed dates, cross-check the same
  // window against the independent EarningsNxt calendar before declaring the date unverified.
  // Only accept an exact-symbol, in-window event when the response is not capped.
  if (failedDates.length) {
    try {
      const secondary=await queryEarningsNxtWindow(today,nearTermEnd);
      if(!secondary.capped) {
        const match=secondary.events
          .filter(event=>String(event.symbol||"").trim().toUpperCase()===ticker)
          .filter(event=>String(event.reportDate||"")>=today&&String(event.reportDate||"")<=nearTermEnd)
          .sort((a,b)=>String(a.reportDate).localeCompare(String(b.reportDate)))[0];
        if(match) {
          const event=mapEarningsNxtEvent(match);
          return Response.json({
            ticker,provider:"EarningsNxt public calendar (cross-check)",fetchedAt:new Date().toISOString(),
            windowStart:today,windowEnd:nearTermEnd,throughDate,checkedDates:checkedDates.length,
            checkedWindows:1,failedDates,events:[event],found:true,verified:true,calendarLimitReached:false,
            warning:"The next event was found in an independent third-party calendar because some Nasdaq dates failed to load. Confirm the date and time on company investor relations before trading.",
            sourceUrl:"https://earningsnxt.ai/docs/api"
          },{headers:responseHeaders()});
        }
      }
    } catch (_) {
      // Preserve the explicit unverified state if the independent source cannot confirm an event.
    }
  }

  // A missing event in the first 31 days triggers a wider, date-windowed discovery.
  // If Nasdaq calls failed in that period and the independent near-term check did not
  // confirm an event, do not claim that a later event is the next one.
  if (failedDates.length) {
    return Response.json({
      ticker, provider:"Nasdaq public earnings calendar", fetchedAt:new Date().toISOString(),
      windowStart:today, windowEnd:nearTermEnd, throughDate, checkedDates:checkedDates.length,
      failedDates, events:[], found:false, verified:false, calendarLimitReached:false,
      warning:"Some Nasdaq earnings dates in the next month could not be checked. The next earnings date remains unconfirmed.",
      sourceUrl:"https://www.nasdaq.com/market-activity/earnings"
    },{headers:responseHeaders("no-store")});
  }

  // EarningsNxt's public calendar is split into seven-day windows to avoid its 500-row cap.
  // Four windows are fetched concurrently; results are examined in chronological order.
  const fallbackStart=dateAdd(nearTermEnd,1);
  const windows=[];
  for (let start=fallbackStart; start<=throughDate; start=dateAdd(start,7)) {
    const end=[dateAdd(start,6),throughDate].sort()[0];
    windows.push({from:start,to:end});
  }
  const failedWindows=[];
  const cappedWindows=[];
  let fallbackMatch=null;
  let checkedWindows=0;

  for (let i=0;i<windows.length;i+=4) {
    const batch=windows.slice(i,i+4);
    const results=await Promise.allSettled(batch.map(window=>queryEarningsNxtWindow(window.from,window.to)));
    for (let j=0;j<results.length;j++) {
      const window=batch[j];
      const result=results[j];
      checkedWindows++;
      if (result.status!=="fulfilled") {
        failedWindows.push(window.from+"–"+window.to);
        return Response.json({
          ticker, provider:"EarningsNxt public calendar", fetchedAt:new Date().toISOString(),
          windowStart:today, windowEnd:nearTermEnd, throughDate, checkedDates:checkedDates.length,
          checkedWindows, failedDates, failedWindows, events:[], found:false, verified:false,
          warning:"A calendar request failed before the next event could be established. Verify the next earnings date on company investor relations.",
          sourceUrl:"https://earningsnxt.ai/docs/api"
        },{headers:responseHeaders("no-store")});
      }
      const data=result.value;
      if(data.capped) {
        cappedWindows.push(window.from+"–"+window.to);
        return Response.json({
          ticker, provider:"EarningsNxt public calendar", fetchedAt:new Date().toISOString(),
          windowStart:today, windowEnd:nearTermEnd, throughDate, checkedDates:checkedDates.length,
          checkedWindows, failedDates, cappedWindows, events:[], found:false, verified:false,
          warning:"The provider returned its event limit for a date window, so the earliest upcoming earnings date cannot be confirmed from this result. Verify the company's investor-relations calendar.",
          sourceUrl:"https://earningsnxt.ai/docs/api"
        },{headers:responseHeaders("no-store")});
      }
      const row=data.events
        .filter(event=>String(event.symbol||"").trim().toUpperCase()===ticker)
        .filter(event=>event.reportDate>=window.from&&event.reportDate<=window.to)
        .sort((a,b)=>String(a.reportDate).localeCompare(String(b.reportDate)))[0];
      if(row) {
        fallbackMatch=mapEarningsNxtEvent(row);
        return Response.json({
          ticker, provider:"EarningsNxt public calendar", fetchedAt:new Date().toISOString(),
          windowStart:today, windowEnd:nearTermEnd, throughDate, checkedDates:checkedDates.length,
          checkedWindows, failedDates, events:[fallbackMatch], found:true,
          verified:true, calendarLimitReached:false,
          warning:"The next event was found in EarningsNxt's third-party calendar beyond Nasdaq's checked one-month window. Confirm it on the company's investor-relations website before trading.",
          sourceUrl:"https://earningsnxt.ai/docs/api"
        },{headers:responseHeaders()});
      }
    }
  }

  return Response.json({
    ticker, provider:"Nasdaq + EarningsNxt public earnings calendars",
    fetchedAt:new Date().toISOString(), windowStart:today, windowEnd:nearTermEnd,
    throughDate, checkedDates:checkedDates.length, checkedWindows,
    failedDates, events:[], found:false, verified:false, calendarLimitReached:false,
    warning:"No upcoming event was found in the checked calendar windows through "+throughDate+". This does not prove that the company has no earnings date; confirm directly with company investor relations.",
    sourceUrl:"https://www.nasdaq.com/market-activity/earnings"
  },{headers:responseHeaders("no-store")});
}
