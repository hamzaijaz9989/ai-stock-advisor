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
      open: Number.isFinite(quote.open?.[i]) ? Number(quote.open[i].toFixed(4)) : null,
      high: Number.isFinite(quote.high?.[i]) ? Number(quote.high[i].toFixed(4)) : null,
      low: Number.isFinite(quote.low?.[i]) ? Number(quote.low[i].toFixed(4)) : null,
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
  try {
    const to=new Date();
    const from=new Date(to); from.setUTCFullYear(from.getUTCFullYear()-1);
    const iso=d=>d.toISOString().slice(0,10);
    const endpoint="https://api.nasdaq.com/api/quote/"+encodeURIComponent(ticker)+"/historical?assetclass=stocks&fromdate="+iso(from)+"&todate="+iso(to)+"&limit=500";
    const response=await fetch(endpoint,{headers:{"Accept":"application/json, text/plain, */*","User-Agent":"Mozilla/5.0 (compatible; AIStockAdvisor/1.0)","Origin":"https://www.nasdaq.com","Referer":"https://www.nasdaq.com/"}});
    if(!response.ok) throw new Error("Nasdaq historical provider returned HTTP "+response.status);
    const payload=await response.json();
    const rows=(payload?.data?.tradesTable?.rows||[]).map(row=>{
      const number=value=>{if(typeof value!=="string")return null;const n=Number(value.replace(/[$,]/g,"").trim());return Number.isFinite(n)?n:null;};
      const parts=String(row.date||"").split("/");
      const date=parts.length===3?parts[2]+"-"+parts[0].padStart(2,"0")+"-"+parts[1].padStart(2,"0"):null;
      return {date,close:number(row.close),volume:number(row.volume),open:number(row.open),high:number(row.high),low:number(row.low)};
    }).filter(row=>row.date&&row.close!==null).sort((a,b)=>a.date.localeCompare(b.date));
    if(rows.length<30) throw new Error("Nasdaq returned fewer than 30 daily observations");
    const returns=[];
    for(let i=1;i<rows.length;i++) returns.push(rows[i].close/rows[i-1].close-1);
    const mean=returns.reduce((a,b)=>a+b,0)/returns.length;
    const variance=returns.reduce((sum,value)=>sum+(value-mean)**2,0)/(returns.length-1||1);
    let peak=rows[0].close,maxDrawdown=0;
    for(const row of rows){peak=Math.max(peak,row.close);maxDrawdown=Math.min(maxDrawdown,row.close/peak-1);}
    const totalReturn=(rows[rows.length-1].close/rows[0].close-1)*100;
    return Response.json({ticker,companyName:payload?.data?.symbol||ticker,source:"Nasdaq historical API",interval:"daily",fetchedAt:new Date().toISOString(),currency:"USD",startDate:rows[0].date,endDate:rows[rows.length-1].date,observations:rows.length,totalReturnPercent:Number(totalReturn.toFixed(2)),annualizedVolatilityPercent:Number((Math.sqrt(variance)*Math.sqrt(252)*100).toFixed(2)),maxDrawdownPercent:Number((maxDrawdown*100).toFixed(2)),latestClose:rows[rows.length-1].close,latestAdjustedClose:rows[rows.length-1].close,data:rows,warning:"Nasdaq fallback provides unadjusted close prices. Return and risk metrics exclude dividends and may not reflect total shareholder return. Historical data is not a forecast."},{headers:{"Cache-Control":"public, max-age=900","X-Content-Type-Options":"nosniff"}});
  } catch(error) { failures.push(String(error?.message||error)); }
  return Response.json({ticker,error:"Historical prices are unavailable. No sample or estimated prices have been substituted.",providerErrors:failures,fetchedAt:new Date().toISOString()},{status:503,headers:{"Cache-Control":"no-store","X-Content-Type-Options":"nosniff"}});
}
