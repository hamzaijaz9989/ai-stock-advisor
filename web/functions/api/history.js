const ALLOWED = /^[A-Z0-9.^=-]{1,12}$/;
async function fetchHistory(host, ticker) {
  const endpoint = "https://" + host + "/v8/finance/chart/" + encodeURIComponent(ticker) + "?range=1y&interval=1d&events=div%2Csplits";
  const response = await fetch(endpoint, {headers: {"Accept":"application/json"}});
  if (!response.ok) throw new Error("Historical-price provider returned HTTP " + response.status);
  const raw = await response.json();
  const result = raw?.chart?.result?.[0];
  if (!result) throw new Error("No historical series returned");
  const timestamps = result.timestamp || [];
  const quote = result.indicators?.quote?.[0] || {};
  const adjusted = result.indicators?.adjclose?.[0]?.adjclose || [];
  const rows = [];
  for (let i=0; i<timestamps.length; i++) {
    const close = quote.close?.[i];
    const adjClose = typeof adjusted[i] === "number" ? adjusted[i] : close;
    if (typeof close !== "number" || !Number.isFinite(close) || typeof adjClose !== "number" || !Number.isFinite(adjClose)) continue;
    rows.push({
      date: new Date(timestamps[i]*1000).toISOString().slice(0,10),
      close: Number(close.toFixed(4)),
      adjustedClose: Number(adjClose.toFixed(4)),
      volume: Number.isFinite(quote.volume?.[i]) ? quote.volume[i] : null
    });
  }
  if (rows.length < 30) throw new Error("Insufficient daily observations for a one-year risk summary");
  const first=rows[0], last=rows[rows.length-1];
  const returns=[];
  for(let i=1;i<rows.length;i++) returns.push(rows[i].adjustedClose/rows[i-1].adjustedClose-1);
  const mean=returns.reduce((a,b)=>a+b,0)/returns.length;
  const variance=returns.reduce((sum,r)=>sum+(r-mean)**2,0)/(returns.length-1 || 1);
  let peak=rows[0].adjustedClose, maxDrawdown=0;
  for(const row of rows) {
    peak=Math.max(peak,row.adjustedClose);
    maxDrawdown=Math.min(maxDrawdown,row.adjustedClose/peak-1);
  }
  const volatility=Math.sqrt(variance)*Math.sqrt(252)*100;
  const totalReturn=(last.adjustedClose/first.adjustedClose-1)*100;
  return {
    ticker, companyName:result.meta?.longName || result.meta?.shortName || ticker,
    source:"Yahoo Finance chart endpoint", interval:"daily", fetchedAt:new Date().toISOString(),
    currency:result.meta?.currency || "USD", exchange:result.meta?.exchangeName || "Unknown",
    startDate:first.date,endDate:last.date,observations:rows.length,
    totalReturnPercent:Number(totalReturn.toFixed(2)),
    annualizedVolatilityPercent:Number(volatility.toFixed(2)),
    maxDrawdownPercent:Number((maxDrawdown*100).toFixed(2)),
    latestClose:last.close, latestAdjustedClose:last.adjustedClose,
    data:rows,
    warning:"Historical price series may be incomplete or revised by the provider. Adjusted closes are used for return and drawdown calculations; these are historical descriptions, not forecasts."
  };
}
export async function onRequestGet({request}) {
  const url=new URL(request.url);
  const ticker=(url.searchParams.get("ticker")||"").trim().toUpperCase();
  if(!ALLOWED.test(ticker)) return Response.json({error:"Enter a valid ticker."},{status:400});
  const failures=[];
  for(const host of ["query1.finance.yahoo.com","query2.finance.yahoo.com"]) {
    try {
      const result=await fetchHistory(host,ticker);
      return Response.json(result,{headers:{"Cache-Control":"public, max-age=900","X-Content-Type-Options":"nosniff"}});
    } catch(error) { failures.push(String(error?.message||error)); }
  }
  return Response.json({ticker,error:"Historical prices are unavailable. No sample or estimated prices have been substituted.",providerErrors:failures,fetchedAt:new Date().toISOString()},{status:503,headers:{"Cache-Control":"no-store","X-Content-Type-Options":"nosniff"}});
}
