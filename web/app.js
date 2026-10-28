const $ = (id) => document.getElementById(id);
let latestResearchSnapshot = null;
let latestDecisionContext = null;
const RESEARCH_LOG_KEY = "ai-stock-advisor-research-log-v1";
const SEC_MAP_URL = "https://www.sec.gov/files/company_tickers_exchange.json";
const SEC_DATA_URL = "https://data.sec.gov";
const SEC_API = "/api/sec?path=";
const METRICS = [
  {label:"Revenue", tags:["Revenues","RevenueFromContractWithCustomerExcludingAssessedTax","SalesRevenueNet"], key:"revenue"},
  {label:"Net income", tags:["NetIncomeLoss","ProfitLoss"], key:"netIncome"},
  {label:"Operating income", tags:["OperatingIncomeLoss"], key:"operatingIncome"},
  {label:"Total assets", tags:["Assets"], key:"assets"},
  {label:"Total liabilities", tags:["Liabilities"], key:"liabilities"},
  {label:"Stockholders' equity", tags:["StockholdersEquity","StockholdersEquityIncludingPortionAttributableToNoncontrollingInterest"], key:"equity"},
  {label:"Operating cash flow", tags:["NetCashProvidedByUsedInOperatingActivities"], key:"operatingCashFlow"},
  {label:"Capital expenditures", tags:["PaymentsToAcquirePropertyPlantAndEquipment"], key:"capex"},
  {label:"Weighted-average diluted shares", tags:["WeightedAverageNumberOfDilutedSharesOutstanding"], key:"dilutedShares"},
  {label:"Diluted earnings per share", tags:["EarningsPerShareDiluted"], key:"dilutedEps"}
];
const cache = new Map();
function setMessage(text, type="") { const el=$("message"); el.textContent=text; el.className="message"+(type?" "+type:""); }
let progressTimer=null, progressStartedAt=0;
function startLoading(title, detail) {
  const box=$("loading-progress"); if(!box)return;
  box.classList.remove("hidden"); $("loading-title").textContent=title; $("loading-detail").textContent=detail;
  progressStartedAt=Date.now(); $("loading-count").textContent="00s";
  if(progressTimer)clearInterval(progressTimer);
  progressTimer=setInterval(()=>{$("loading-count").textContent=String(Math.floor((Date.now()-progressStartedAt)/1000)).padStart(2,"0")+"s";},250);
}
function updateLoading(title, detail) { if($("loading-title"))$("loading-title").textContent=title; if($("loading-detail"))$("loading-detail").textContent=detail; }
function stopLoading() { if(progressTimer)clearInterval(progressTimer); progressTimer=null; const box=$("loading-progress"); if(box)box.classList.add("hidden"); }

function newYorkDateOnly(date=new Date()) {
  const parts=new Intl.DateTimeFormat("en-CA",{timeZone:"America/New_York",year:"numeric",month:"2-digit",day:"2-digit"}).formatToParts(date);
  const values=Object.fromEntries(parts.map(part=>[part.type,part.value]));
  return values.year+"-"+values.month+"-"+values.day;
}
function fmtDate(s) { if(!s) return "Not reported"; const d=new Date(s+"T00:00:00Z"); return Number.isNaN(d.getTime())?s:d.toLocaleDateString(undefined,{year:"numeric",month:"short",day:"numeric",timeZone:"UTC"}); }
function fmtMoney(value, {compact=true, decimals=2}={}) {
  if(typeof value!=="number" || !Number.isFinite(value)) return "Not reported";
  const abs=Math.abs(value), sign=value<0?"-":"";
  if(compact && abs>=1e12) return sign+"$"+(abs/1e12).toFixed(Math.min(decimals,2))+"T";
  if(compact && abs>=1e9) return sign+"$"+(abs/1e9).toFixed(Math.min(decimals,2))+"B";
  if(compact && abs>=1e6) return sign+"$"+(abs/1e6).toFixed(0)+"M";
  if(compact && abs>=1e3) return sign+"$"+(abs/1e3).toFixed(0)+"K";
  return sign+"$"+abs.toFixed(decimals);
}
function fmtValue(value, unit) {
  if(typeof value!=="number" || !Number.isFinite(value)) return "Not reported";
  if(unit==="USD/shares") return fmtMoney(value,{compact:false,decimals:2});
  if(unit==="USD") return fmtMoney(value);
  return new Intl.NumberFormat("en-US",{maximumFractionDigits:2}).format(value)+(unit?" "+unit:"");
}
function periodDuration(row) {
  if(!row?.start || !row?.end) return "Duration unavailable";
  const days=(Date.parse(row.end+"T00:00:00Z")-Date.parse(row.start+"T00:00:00Z"))/86400000+1;
  const period=days>=329&&days<=399?"FY":days>=250&&days<=290?"9M":days>=160&&days<=200?"6M":days>=70&&days<=110?"3M":"Period";
  return period+" · "+row.start+"–"+row.end+" · "+(row.form||"Form unavailable");
}
function titleCaseCompanyName(name) {
  const clean=String(name||"Unknown company").replace(/\.+$/,".").replace(/\.\.+/g,".").trim();
  if(clean!==clean.toUpperCase()) return clean;
  return clean.toLowerCase().replace(/\b([a-z])/g,c=>c.toUpperCase())
    .replace(/\b(Inc|Llc|Llp|L P|Ltd|Plc|Corp|Co)\b/g,m=>({"Inc":"Inc.","Llc":"LLC","Llp":"LLP","L P":"LP","Ltd":"Ltd.","Plc":"PLC","Corp":"Corp.","Co":"Co."}[m]||m))
    .replace(/\b(Usa|Nv|Ag|Sa|Se|N V)\b/g,m=>({"Usa":"USA","Nv":"N.V.","Ag":"AG","Sa":"S.A.","Se":"SE","N V":"N.V."}[m]||m))
    .replace(/\.\.+/g,".");
}
async function getJson(url) {
  if(cache.has(url)) return cache.get(url);
  const path=url.startsWith("https://www.sec.gov/")?url.slice("https://www.sec.gov/".length):url.startsWith("https://data.sec.gov/")?url.slice("https://data.sec.gov/".length):null;
  if(!path) throw new Error("Unsupported SEC data path.");
  const response=await fetch(SEC_API+encodeURIComponent(path),{headers:{"Accept":"application/json"}});
  if(!response.ok) throw new Error("SEC request returned HTTP "+response.status+".");
  const data=await response.json(); cache.set(url,data); return data;
}
function companyRows(payload) {
  if(Array.isArray(payload)) return payload;
  if(Array.isArray(payload.data)) {
    const fields=Array.isArray(payload.fields)?payload.fields:[];
    return payload.data.map(row=>{
      if(!Array.isArray(row)) return row;
      return Object.fromEntries(row.map((value,i)=>[fields[i],value]));
    });
  }
  throw new Error("SEC ticker mapping format was not recognized.");
}
async function findCompany(ticker) {
  const payload=await getJson(SEC_MAP_URL);
  const lookupTicker=(ticker==="BRK.B"||ticker==="BRK-B")?"BRK":ticker;
  const matches=companyRows(payload).filter(row=>{const symbol=String(row.ticker||row.symbol||"").trim().toUpperCase();return symbol===ticker||((lookupTicker==="BRK")&&["BRK.B","BRK-B"].includes(symbol));});
  const unique=new Map();
  for(const row of matches) {
    const cik=String(row.cik??row.cik_str??"").replace(/\D/g,"");
    if(cik) unique.set(cik,{cik:cik.padStart(10,"0"),name:titleCaseCompanyName(row.name||row.title||"Unknown company"),ticker,exchange:row.exchange||"Exchange not listed"});
  }
  if(!unique.size) throw new Error("No company was found for "+ticker+" in the SEC ticker mapping. Check the symbol.");
  if(unique.size>1) throw new Error("This ticker maps to multiple SEC issuers. Use a less ambiguous symbol.");
  return [...unique.values()][0];
}
function getObservations(payload) {
  const gaap=payload?.facts?.["us-gaap"];
  if(!gaap||typeof gaap!=="object") throw new Error("SEC company facts response has no US-GAAP facts.");
  const observations=[];
  for(const metric of METRICS) {
    let found=false;
    for(const tag of metric.tags) {
      const fact=gaap[tag];
      if(!fact?.units) continue;
      for(const [unit,values] of Object.entries(fact.units)) {
        if(!Array.isArray(values)) continue;
        for(const obs of values) {
          if(obs.val==null || !obs.end || !obs.filed) continue;
          observations.push({metric:metric.label,key:metric.key,tag,unit,value:obs.val,start:obs.start||null,end:obs.end,filed:obs.filed,form:obs.form||"—",accession:obs.accn||"—",fy:obs.fy,fp:obs.fp,frame:obs.frame||""});
        }
      }
      found=true;
      // Explicit aliases are not reconciled: keep all tags as reported.
    }
    if(!found) observations.push({metric:metric.label,key:metric.key,tag:"",unit:"",value:null,start:null,end:null,filed:null,form:"—",accession:"—"});
  }
  observations.sort((a,b)=>String(b.end||"").localeCompare(String(a.end||""))||String(b.filed||"").localeCompare(String(a.filed||"")));
  return observations;
}
function renderMetrics(observations) {
  $("metrics-grid").innerHTML="";
  for(const metric of METRICS) {
    const rows=observations.filter(row=>row.key===metric.key&&row.value!==null);
    rows.sort((a,b)=>String(b.end).localeCompare(String(a.end))||String(b.filed).localeCompare(String(a.filed)));
    const row=rows[0];
    const card=document.createElement("article"); card.className="metric-card";
    const label=document.createElement("div"); label.className="metric-label"; label.textContent=metric.label;
    const value=document.createElement("div"); value.className="metric-value"; value.textContent=row?fmtValue(row.value,row.unit):"—";
    const date=document.createElement("div"); date.className="metric-date"; date.textContent=row?"Filed "+fmtDate(row.filed)+" · "+periodDuration(row):"No supported observation found";
    card.append(label,value,date); $("metrics-grid").append(card);
  }
}

function annualSeries(observations, key) {
  const candidates = observations.filter(row => row.key === key && typeof row.value === "number" &&
    row.form === "10-K" && row.start && row.end &&
    (new Date(row.end + "T00:00:00Z") - new Date(row.start + "T00:00:00Z")) / 86400000 >= 329 &&
    (new Date(row.end + "T00:00:00Z") - new Date(row.start + "T00:00:00Z")) / 86400000 <= 399);
  const byEnd = new Map();
  for (const row of candidates) {
    if (!byEnd.has(row.end)) byEnd.set(row.end, []);
    byEnd.get(row.end).push(row);
  }
  const series = [];
  for (const [end, rows] of byEnd) {
    const distinct = new Map(rows.map(row => [String(row.value) + "|" + row.unit, row]));
    if (distinct.size !== 1) continue;
    series.push({ end, ...[...distinct.values()][0] });
  }
  return series.sort((a,b) => a.end.localeCompare(b.end));
}
function quarterlySeries(observations, key) {
  const candidates = observations.filter(row => row.key === key &&
    typeof row.value === "number" && ["10-Q","10-K"].includes(row.form) &&
    row.start && row.end &&
    (new Date(row.end + "T00:00:00Z") - new Date(row.start + "T00:00:00Z")) / 86400000 >= 70 &&
    (new Date(row.end + "T00:00:00Z") - new Date(row.start + "T00:00:00Z")) / 86400000 <= 110);
  const byEnd = new Map();
  for (const row of candidates) {
    if (!byEnd.has(row.end)) byEnd.set(row.end, []);
    byEnd.get(row.end).push(row);
  }
  const series = [];
  for (const [end, rows] of byEnd) {
    const distinct = new Map(rows.map(row => [String(row.value) + "|" + row.unit, row]));
    if (distinct.size !== 1) continue;
    series.push({end,...[...distinct.values()][0]});
  }
  return series.sort((a,b) => a.end.localeCompare(b.end));
}
function matchingPriorYear(series, current) {
  if (!current?.end) return null;
  const currentMs=Date.parse(current.end+"T00:00:00Z");
  const candidates=series.filter(row=>{
    const days=(currentMs-Date.parse(row.end+"T00:00:00Z"))/86400000;
    return days>=350&&days<=380;
  });
  return candidates.sort((a,b)=>{
    const da=Math.abs((currentMs-Date.parse(a.end+"T00:00:00Z"))/86400000-365.25);
    const db=Math.abs((currentMs-Date.parse(b.end+"T00:00:00Z"))/86400000-365.25);
    return da-db;
  })[0]||null;
}
function renderFundamentalSnapshot(observations) {
  const panel = $("fundamental-snapshot");
  panel.innerHTML = "";
  const revenue = annualSeries(observations, "revenue");
  const income = annualSeries(observations, "netIncome");
  const cash = annualSeries(observations, "operatingCashFlow");
  const capex = annualSeries(observations, "capex");
  const cards = [];
  if (revenue.length >= 2) {
    const latest = revenue[revenue.length - 1], prior = revenue[revenue.length - 2];
    if (prior.value !== 0) cards.push({label:"Annual revenue growth",value:((latest.value/prior.value-1)*100).toFixed(1)+"%",meta:fmtDate(prior.end)+" → "+fmtDate(latest.end)});
  }
  const latestRevenue = revenue[revenue.length-1];
  const latestIncome = latestRevenue && income.find(row=>row.end===latestRevenue.end);
  if (latestRevenue && latestIncome && latestRevenue.value !== 0) {
    cards.push({label:"Net profit margin",value:((latestIncome.value/latestRevenue.value)*100).toFixed(1)+"%",meta:"Matched annual period ended "+fmtDate(latestRevenue.end)});
  }
  const latestCash = cash[cash.length-1];
  const latestCapex = latestCash && capex.find(row=>row.end===latestCash.end);
  if (latestCash && latestCapex) {
    const fcf=latestCash.value-Math.abs(latestCapex.value);
    cards.push({label:"Approx. free cash flow",value:fmtValue(fcf,latestCash.unit),meta:"Operating cash flow minus absolute capex · "+fmtDate(latestCash.end)});
  }
  $("fundamental-status").textContent = cards.length ? "Annual 10-K observations" : "Insufficient comparable data";
  if (!cards.length) {
    panel.textContent = "Not enough unambiguous annual 10-K observations to calculate a comparable snapshot. Missing or conflicting observations are left blank rather than estimated.";
    return;
  }
  for (const item of cards) {
    const card=document.createElement("article"); card.className="metric-card";
    const label=document.createElement("div"); label.className="metric-label";
    const labelText=document.createElement("span"); labelText.textContent=item.label;
    const numericValue=Number.parseFloat(String(item.value).replace(/[^0-9.+-]/g,""));
    const status=Number.isFinite(numericValue)?(numericValue>0?"good":numericValue<0?"bad":"caution"):"unknown";
    const dot=document.createElement("span"); dot.className="meaning-dot "+status;
    dot.title=status==="good"?"Positive indicator":status==="bad"?"Negative indicator":status==="caution"?"Needs attention":"Status unclear";
    label.append(dot,labelText);
    const value=document.createElement("div"); value.className="metric-value"; value.textContent=item.value;
    const meta=document.createElement("div"); meta.className="metric-date"; meta.textContent=item.meta;
    card.append(label,value,meta); panel.append(card);
  }
}

function renderQuarterlySnapshot(observations) {
  const panel=$("quarterly-snapshot");
  panel.innerHTML="";
  const revenue=quarterlySeries(observations,"revenue");
  const income=quarterlySeries(observations,"netIncome");
  const eps=quarterlySeries(observations,"dilutedEps");
  const latestRevenue=revenue[revenue.length-1]||null;
  const priorRevenue=latestRevenue?matchingPriorYear(revenue,latestRevenue):null;
  const latestIncome=latestRevenue?income.find(row=>row.end===latestRevenue.end)||null:null;
  const priorIncome=latestIncome?matchingPriorYear(income,latestIncome):null;
  const latestEps=latestRevenue?eps.find(row=>row.end===latestRevenue.end)||null:null;
  const priorEps=latestEps?matchingPriorYear(eps,latestEps):null;
  const revenueYoY=latestRevenue&&priorRevenue&&priorRevenue.value>0
    ? latestRevenue.value/priorRevenue.value-1 : null;
  $("quarterly-status").textContent=latestRevenue
    ? "Quarter ended "+fmtDate(latestRevenue.end)+" · filed "+fmtDate(latestRevenue.filed)
    : "Comparable quarterly facts unavailable";
  if(!latestRevenue) {
    panel.textContent="No unambiguous 70–110 day quarterly revenue observation was found in the available SEC facts.";
    return {available:false,reason:"Quarterly revenue facts missing",currentRevenue:null,currentIncome:null,currentEps:null,revenueYoY:null,periodEnd:null,fiscalQuarterId:null};
  }
  const dateMeta="Quarter ended "+fmtDate(latestRevenue.end)+" · SEC "+latestRevenue.form+" filed "+fmtDate(latestRevenue.filed);
  const revenueCard=metricCard("Latest quarterly revenue",fmtValue(latestRevenue.value,latestRevenue.unit),
    revenueYoY!==null?"Year over year "+(revenueYoY>=0?"+":"")+(revenueYoY*100).toFixed(1)+"% · prior quarter end "+fmtDate(priorRevenue.end):"Same-quarter prior-year comparison unavailable");
  panel.append(revenueCard);
  if(latestIncome) {
    const incomeMeta=priorIncome
      ?"Prior year: "+fmtValue(priorIncome.value,priorIncome.unit)+" · "+dateMeta
      :dateMeta+" · prior-year comparison unavailable";
    panel.append(metricCard("Quarterly net income",fmtValue(latestIncome.value,latestIncome.unit),incomeMeta));
  }
  if(latestEps) {
    const epsMeta=(priorEps?"Prior-year diluted EPS: "+fmtValue(priorEps.value,priorEps.unit)+" · ":"")+dateMeta;
    panel.append(metricCard("Quarterly diluted EPS",fmtValue(latestEps.value,latestEps.unit),epsMeta));
  }
  return {
    available:Boolean(latestRevenue&&priorRevenue&&latestIncome),
    currentRevenue:latestRevenue.value,
    currentIncome:latestIncome?.value??null,
    currentEps:latestEps?.value??null,
    revenueYoY,
    priorRevenue:priorRevenue?.value??null,
    periodEnd:latestRevenue.end,
    fiscalQuarterId:(()=>{const fp=String(latestRevenue.fp||"").toUpperCase().match(/Q([1-4])/);const fy=Number(latestRevenue.fy);return fp&&Number.isInteger(fy)&&fy>=2000?"Q"+fp[1]+"-"+fy:null;})(),
    filed:latestRevenue.filed,
    netIncomeFiled:latestIncome?.filed??null,
    reason:!priorRevenue?"Same-quarter prior-year revenue is missing":!latestIncome?"Quarterly net income observation missing":"Quarterly revenue/net income comparison available"
  };
}

function renderTable(observations) {
  const body=$("facts-body"); body.innerHTML="";
  const rows=observations.filter(row=>row.value!==null).slice(0,100);
  $("fact-count").textContent=rows.length+" observations";
  if(!rows.length) { body.innerHTML='<tr><td colspan="4" class="empty">No supported financial observations were returned. Open Data connection details below for diagnostics.</td></tr>'; return; }
  for(const row of rows) {
    const tr=document.createElement("tr");
    const cells=[row.metric+" · "+row.tag,fmtValue(row.value,row.unit),periodDuration(row),fmtDate(row.filed)];
    for(const value of cells) { const td=document.createElement("td"); td.textContent=value; tr.append(td); }
    body.append(tr);
  }
}

function renderHistory(history) {
  const panel=$("history-panel");
  panel.classList.remove("hidden");
  $("history-status").textContent=history.observations+" daily observations";
  $("history-meta").textContent=history.startDate+" to "+history.endDate+" · "+history.source+" · Retrieved "+new Date(history.fetchedAt).toLocaleString();
  $("history-warning").textContent=history.warning+" Data-quality scan: "+(history.dataQuality?.status||"NOT AVAILABLE")+". "+(history.dataQuality?.largestDailyMove?"Largest daily move "+history.dataQuality.largestDailyMove.percent+"% on "+history.dataQuality.largestDailyMove.date+". ":"")+(history.dataQuality?.suspectedBadTicks?.length?history.dataQuality.suspectedBadTicks.length+" suspected OHLC outlier(s) require source verification. ":"")+(history.dataQuality?.largeGaps?.length?history.dataQuality.largeGaps.length+" large opening gap(s) flagged. ":"")+"Thresholds: "+(history.dataQuality?.rules||"outlier scan unavailable");
  const cards=[
    {label:"1-year price return",value:(history.totalReturnPercent>=0?"+":"")+history.totalReturnPercent.toFixed(2)+"%",meta:"Close-price return · "+history.startDate+" to "+history.endDate},
    {label:"Annualized volatility",value:history.annualizedVolatilityPercent.toFixed(2)+"%",meta:"Standard deviation of daily close-price returns × √252"},
    {label:"Maximum drawdown",value:history.maxDrawdownPercent.toFixed(2)+"%",meta:"Largest peak-to-trough decline in this observed window"}
  ];
  const grid=$("history-metrics"); grid.innerHTML="";
  for(const item of cards) {
    const card=document.createElement("article"); card.className="metric-card";
    const label=document.createElement("div"); label.className="metric-label"; label.textContent=item.label;
    const value=document.createElement("div"); value.className="metric-value"; value.textContent=item.value;
    const meta=document.createElement("div"); meta.className="metric-date"; meta.textContent=item.meta;
    card.append(label,value,meta); grid.append(card);
  }
  const svg=document.createElementNS("http://www.w3.org/2000/svg","svg");
  svg.setAttribute("viewBox","0 0 800 180"); svg.setAttribute("role","img"); svg.setAttribute("aria-label","One-year adjusted closing price history");
  svg.setAttribute("class","history-chart");
  const values=history.data.map(d=>d.close);
  const min=Math.min(...values), max=Math.max(...values), range=max-min||1;
  const points=values.map((v,i)=>[(i/(values.length-1))*780+10,165-((v-min)/range)*145]);
  const path=document.createElementNS(svg.namespaceURI,"path");
  path.setAttribute("d",points.map((p,i)=>(i?"L":"M")+p[0].toFixed(2)+" "+p[1].toFixed(2)).join(" "));
  path.setAttribute("fill","none"); path.setAttribute("stroke","currentColor"); path.setAttribute("stroke-width","2.5"); path.setAttribute("vector-effect","non-scaling-stroke");
  svg.append(path); $("history-chart-wrap").innerHTML=""; $("history-chart-wrap").append(svg);
  $("history-start-label").textContent=history.startDate+" · $"+history.data[0].close.toFixed(2)+" close";
  $("history-end-label").textContent=history.endDate+" · $"+history.latestClose.toFixed(2)+" close";
}

async function loadStrategyBacktest(ticker) {
  const panel=$("strategy-backtest-panel"), grid=$("strategy-backtest-metrics"), details=$("strategy-backtest-details");
  panel.classList.remove("hidden"); grid.innerHTML=""; details.textContent="Fetching up to five years of daily prices and comparing with SPY…";
  $("strategy-backtest-status").textContent="Running";
  try {
    const response=await fetch("/api/strategy-backtest?ticker="+encodeURIComponent(ticker),{headers:{"Accept":"application/json"}});
    const result=await response.json();
    if(!response.ok) throw new Error(result.error||"Historical test unavailable");
    const fmtPct=v=>typeof v==="number"&&Number.isFinite(v)?(v>=0?"+":"")+v.toFixed(2)+"%":"Unavailable";
    const s=result.strategy||{}, b=result.spyBuyHold||{};
    const metrics=[
      metricCard("Strategy total return",fmtPct(s.totalReturnPercent),"50/200-day SMA, long-only, estimated costs included"),
      metricCard("SPY buy-and-hold",fmtPct(b.totalReturnPercent),"Benchmark adjusted-close return for the same history window"),
      metricCard("Strategy annualized",fmtPct(s.annualizedReturnPercent),"Annualized daily equity-curve return; historical, not forecast"),
      metricCard("SPY annualized",fmtPct(b.annualizedReturnPercent),"Annualized benchmark return"),
      metricCard("Strategy max drawdown",fmtPct(s.maxDrawdownPercent),"Peak-to-trough drawdown in daily strategy equity curve"),
      metricCard("Strategy volatility",fmtPct(s.volatilityPercent),"Annualized from daily strategy returns"),
      metricCard("Closed trades",String(result.completedTrades),"Open-at-end trades reported separately"),
      metricCard("Win rate",fmtPct(result.winRatePercent),"Closed trades only; small samples can be misleading"),
      metricCard("Profit factor",typeof result.profitFactor==="number"?result.profitFactor.toFixed(2):"Unavailable","Gross positive trade returns divided by absolute negative trade returns")
    ];
    for(const card of metrics) grid.append(card);
    $("strategy-backtest-status").textContent=result.observations+" sessions · "+result.startDate+" to "+result.endDate;
    $("strategy-backtest-warning").textContent=result.warning+" Data source: "+result.source+". Cost assumption: "+result.slippageAndCostBpsPerSide+" bps per side.";
    const wf=result.walkForward||{};
    const wfRoot=$("strategy-walk-forward");
    if(Array.isArray(wf.folds)&&wf.folds.length) {
      const heading=document.createElement("strong");
      heading.textContent="Chronological walk-forward diagnostic";
      const summary=document.createElement("p");
      summary.textContent=wf.positiveFolds+" of "+wf.totalFolds+" non-overlapping six-month test windows were positive; median window return "+fmtPct(wf.medianFoldReturnPercent)+".";
      const table=document.createElement("div");table.className="table-wrap";
      const tableEl=document.createElement("table");
      const thead=document.createElement("thead"),headRow=document.createElement("tr");
      for(const label of ["Test window","Return","Max drawdown","Volatility","Entries / exits"]) {const th=document.createElement("th");th.textContent=label;headRow.append(th);}
      thead.append(headRow);const tbody=document.createElement("tbody");
      for(const fold of wf.folds) {
        const tr=document.createElement("tr");
        for(const value of [fold.testStart+" – "+fold.testEnd,fmtPct(fold.returnPercent),fmtPct(fold.maxDrawdownPercent),fmtPct(fold.volatilityPercent),fold.entries+" / "+fold.exits]) {
          const td=document.createElement("td");td.textContent=value;tr.append(td);
        }
        tbody.append(tr);
      }
      tableEl.append(thead,tbody);table.append(tableEl);
      const note=document.createElement("p");note.textContent=wf.methodology+" "+wf.warning;
      wfRoot.replaceChildren(heading,summary,table,note);
    } else {
      wfRoot.textContent="Not enough history to create chronological test windows. "+(wf.warning||"No walk-forward result is available.");
    }
    details.textContent="Rules: "+result.rules+" Completed trades: "+result.completedTrades+"; open at end: "+result.openAtEnd+". Average completed trade: "+fmtPct(result.averageTradeReturnPercent)+". Average benchmark return during strategy trades: "+fmtPct(result.averageBenchmarkDuringTradesPercent)+". This is a diagnostic baseline, not the current advisor’s recommendation engine or an investable proof of edge.";
  } catch(error) {
    $("strategy-backtest-status").textContent="Unavailable";
    details.textContent=(error.message||"Historical test failed")+". No sample prices or guessed performance have been substituted.";
  }
}

async function loadHistory(ticker) {
  $("history-status").textContent="Loading…";
  $("history-meta").textContent="Requesting one year of daily price history…";
  try {
    const response=await fetch("/api/history?ticker="+encodeURIComponent(ticker),{headers:{"Accept":"application/json"}});
    const history=await response.json();
    if(!response.ok) throw new Error(history.error||"Historical price service unavailable");
    renderHistory(history);
    return history;
  } catch(error) {
    $("history-status").textContent="Unavailable";
    $("history-meta").textContent=error.message+" No prices were invented.";
    $("history-metrics").innerHTML="";
    $("history-chart-wrap").textContent="Historical chart unavailable.";
    return null;
  }
}

function clamp(value,min,max){return Math.max(min,Math.min(max,value));}
function scoreRange(value,min,max,points){return clamp((value-min)/(max-min)*points,0,points);}
async function scoreTicker(ticker) {
  const company=await findCompany(ticker);
  const facts=await getJson(SEC_DATA_URL+"/api/xbrl/companyfacts/CIK"+company.cik+".json");
  const observations=getObservations(facts);
  const revenue=annualSeries(observations,"revenue");
  const income=annualSeries(observations,"netIncome");
  const cash=annualSeries(observations,"operatingCashFlow");
  const capex=annualSeries(observations,"capex");
  if(revenue.length<2) throw new Error("Insufficient comparable annual revenue data");
  const latest=revenue[revenue.length-1], prior=revenue[revenue.length-2];
  if(!prior.value || prior.value<=0) throw new Error("Prior annual revenue is zero or negative");
  const matchedIncome=income.find(row=>row.end===latest.end);
  const matchedCash=cash.find(row=>row.end===latest.end);
  const matchedCapex=capex.find(row=>row.end===latest.end);
  if(!matchedIncome || !matchedCash || !matchedCapex) throw new Error("Missing matched-period income or cash-flow data");
  const historyResponse=await fetch("/api/history?ticker="+encodeURIComponent(ticker),{headers:{"Accept":"application/json"}});
  const history=await historyResponse.json();
  if(!historyResponse.ok) throw new Error(history.error||"Price history unavailable");
  if(!Number.isFinite(history.totalReturnPercent)||!Number.isFinite(history.maxDrawdownPercent)||
     !history.startDate||!history.endDate||!Array.isArray(history.data)||history.data.length<200) {
    throw new Error("Historical price data is incomplete or lacks a full trading-year sample");
  }
  if(!Number.isFinite(latest.value)||latest.value<=0||
     !Number.isFinite(prior.value)||prior.value<=0||
     !Number.isFinite(matchedIncome.value)||!Number.isFinite(matchedCash.value)||!Number.isFinite(matchedCapex.value)) {
    throw new Error("Financial inputs are non-finite or non-positive where positive revenue is required");
  }
  const growth=(latest.value/prior.value-1)*100;
  const margin=matchedIncome.value/latest.value*100;
  const fcf=matchedCash.value-Math.abs(matchedCapex.value);
  const fcfMargin=fcf/latest.value*100;
  if(![growth,margin,fcf,fcfMargin].every(Number.isFinite)) throw new Error("Financial ratios could not be calculated safely");
  const components=[
    {name:"Revenue growth",value:growth,display:growth.toFixed(1)+"%",score:scoreRange(growth,-10,30,25),max:25},
    {name:"Net profit margin",value:margin,display:margin.toFixed(1)+"%",score:scoreRange(margin,-5,20,15),max:15},
    {name:"Approx. FCF margin",value:fcfMargin,display:fcfMargin.toFixed(1)+"%",score:scoreRange(fcfMargin,-10,20,20),max:20},
    {name:"1-year price return",value:history.totalReturnPercent,display:(history.totalReturnPercent>=0?"+":"")+history.totalReturnPercent.toFixed(1)+"%",score:scoreRange(history.totalReturnPercent,-20,30,20),max:20},
    {name:"Maximum drawdown",value:history.maxDrawdownPercent,display:history.maxDrawdownPercent.toFixed(1)+"%",score:scoreRange(history.maxDrawdownPercent,-50,-10,20),max:20}
  ];
  return {ticker,name:company.name,cik:company.cik,score:components.reduce((sum,item)=>sum+item.score,0),components,financialPeriod:latest.end,historyPeriod:history.startDate+" to "+history.endDate,source:history.source,observations,facts,history};
}
function csvCell(value) {
  const textValue=value===null||value===undefined?"":String(value);
  return /[",\n\r]/.test(textValue) ? '"'+textValue.replace(/"/g,'""')+'"' : textValue;
}
function buildScreenCsv(results,errors,generatedAt=new Date().toISOString()) {
  const headers=["generated_at_utc","ticker","company","rank","research_score","financial_period_end","history_period","price_source","metric","metric_value","metric_display","component_points","component_max_points","status","reason"];
  const rows=[headers];
  const ranked=[...results].sort((a,b)=>b.score-a.score);
  ranked.forEach((item,index)=>{
    for(const part of item.components||[]) rows.push([
      generatedAt,item.ticker,item.name,index+1,item.score,item.financialPeriod,item.historyPeriod,item.source,
      part.name,part.value,part.display,part.score,part.max,"qualified",
      "Research-priority score only; not a validated investment signal"
    ]);
  });
  for(const error of errors||[]) {
    const split=String(error).match(/^([^:]+):\s*(.*)$/);
    rows.push([generatedAt,split?.[1]||"", "", "", "", "", "", "", "", "", "", "", "", "excluded", split?.[2]||String(error)]);
  }
  return rows.map(row=>row.map(csvCell).join(",")).join("\r\n")+"\r\n";
}
function downloadScreenCsv(results,errors) {
  const csv=buildScreenCsv(results,errors);
  const blob=new Blob([csv],{type:"text/csv;charset=utf-8"});
  const url=URL.createObjectURL(blob);
  const link=document.createElement("a");
  link.href=url;
  link.download="stock-advisor-screen-"+new Date().toISOString().replace(/[:.]/g,"-")+".csv";
  link.textContent="Download CSV audit";
  document.body.append(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}
function renderScreenResults(results,errors) {
  const root=$("screen-results"); root.innerHTML="";
  const ranked=[...results].sort((a,b)=>b.score-a.score);
  const exportButton=document.createElement("button");
  exportButton.type="button"; exportButton.className="secondary-button";
  exportButton.textContent="Download screen audit CSV";
  exportButton.addEventListener("click",()=>downloadScreenCsv(ranked,errors));
  root.append(exportButton);
  const intro=document.createElement("p"); intro.className="table-note";
  intro.textContent="These five companies rank highest on the available screening score within the 60-stock starter universe. They are research candidates, NOT validated BUY signals or forecasts. Price levels are shown only when required inputs are available; all valuation levels are model scenarios, not reliable forecasts.";
  root.append(intro);
  const bestPick=document.createElement("article");
  bestPick.className="screen-card screen-best-pick";
  bestPick.id="screen-best-pick";
  bestPick.textContent="Strongest current setup: checking price, valuation, earnings, news and risk gates. This is a provisional research ranking, not a validated BUY or a promise of profit.";
  root.append(bestPick);
  if(!ranked.length) {
    const p=document.createElement("p"); p.className="empty"; p.textContent="No companies met the minimum data requirements. "+errors.join(" · "); root.append(p); return;
  }
  for(let i=0;i<Math.min(5,ranked.length);i++) {
    const item=ranked[i],card=document.createElement("article"); card.className="screen-card";
    const header=document.createElement("div"); header.className="screen-card-header";
    const identity=document.createElement("div");
    const name=document.createElement("strong"); name.textContent=(i+1)+". "+item.ticker+" · "+item.name;
    const period=document.createElement("p"); period.className="muted"; period.textContent="Annual financial period: "+item.financialPeriod+" · Price data: "+item.historyPeriod+" · "+item.source;
    identity.append(name,period);
    const score=document.createElement("div"); score.className="screen-score"; score.textContent=item.score.toFixed(1)+"/100";
    header.append(identity,score); card.append(header);
    const grid=document.createElement("div"); grid.className="screen-components";
    for(const part of item.components) {
      const cell=document.createElement("div"); cell.className="screen-component";
      const label=document.createElement("span"); label.textContent=part.name;
      const value=document.createElement("strong"); value.textContent=part.display;
      const scoreLine=document.createElement("small"); scoreLine.textContent=part.score.toFixed(1)+" / "+part.max+" points";
      cell.append(label,value,scoreLine); grid.append(cell);
    }
    card.append(grid);
    const plan=document.createElement("div"); plan.className="candidate-plan";
    plan.dataset.ticker=item.ticker;
    plan.dataset.score=String(item.score);
    plan.dataset.ready="false";
    const planTitle=document.createElement("strong"); planTitle.textContent="Entry / exit assessment";
    const planStatus=document.createElement("p"); planStatus.className="muted"; planStatus.textContent="Checking latest quote and valuation inputs…";
    plan.append(planTitle,planStatus); card.append(plan);
    const analyzeButton=document.createElement("button"); analyzeButton.type="button"; analyzeButton.className="secondary-button"; analyzeButton.textContent="Open full analysis";
    analyzeButton.addEventListener("click",()=>{ $("ticker").value=item.ticker; analyze(item.ticker); window.scrollTo({top:0,behavior:"smooth"}); });
    card.append(analyzeButton);
    const note=document.createElement("p"); note.className="table-note"; note.textContent="Research priority only. This score excludes news/event risk and is not a validated predictive model. Do not treat these candidates as buy recommendations."; card.append(note);
    root.append(card);
  }
  if(ranked.length>5) {
    const p=document.createElement("p"); p.className="table-note"; p.textContent=(ranked.length-5)+" additional qualified stocks are omitted from the Top 5 display but remain in the downloadable audit CSV."; root.append(p);
  }
  if(errors.length) {
    const p=document.createElement("p"); p.className="table-note"; p.textContent="Excluded candidates: "+errors.join(" · "); root.append(p);
  }
}
function assessResearchQuoteEligibility(quote, nowMs=Date.now()) {
  const price=quote?.price;
  const quoteDate=quote?.quoteTime?new Date(quote.quoteTime):null;
  const ageHours=quoteDate&&!Number.isNaN(quoteDate.getTime())?(nowMs-quoteDate.getTime())/3600000:Infinity;
  if(typeof price!=="number"||!Number.isFinite(price)||price<=0) {
    return {eligible:false,reason:"quote price is missing or invalid",ageHours};
  }
  if(ageHours<-(5/60)) {
    return {eligible:false,reason:"quote timestamp is unexpectedly in the future",ageHours};
  }
  if(!Number.isFinite(ageHours)||ageHours>48) {
    return {eligible:false,reason:"no recent timestamped intraday quote",ageHours};
  }
  if(String(quote?.interval||"").toLowerCase()==="1d"||
     String(quote?.delayedOrRealtime||"").toLowerCase().includes("daily interval")) {
    return {eligible:false,reason:"daily-only quote is not eligible for entry readiness",ageHours};
  }
  return {eligible:true,reason:null,ageHours};
}

async function enrichTopCandidates(results) {
  const candidates=[...results].sort((a,b)=>b.score-a.score).slice(0,5);
  await Promise.all(candidates.map(async item=>{
    const plan=[...document.querySelectorAll(".candidate-plan")].find(node=>node.dataset.ticker===item.ticker);
    if(!plan) return;
    const status=plan.querySelector("p");
    const gateNotes=[];
    try {
      const [quoteResponse,newsResponse,earningsResponse]=await Promise.all([
        fetch("/api/quote?ticker="+encodeURIComponent(item.ticker),{headers:{"Accept":"application/json"}}),
        fetch("/api/news?ticker="+encodeURIComponent(item.ticker),{headers:{"Accept":"application/json"}}),
        fetch("/api/earnings?ticker="+encodeURIComponent(item.ticker),{headers:{"Accept":"application/json"}})
      ]);
      const quote=quoteResponse.ok?await quoteResponse.json():null;
      const news=newsResponse.ok?await newsResponse.json():null;
      const earnings=earningsResponse.ok?await earningsResponse.json():null;
      const valuation=buildDcfEstimate(item.observations,item.facts);
      const atr=averageTrueRange(item.history);
      const quoteGate=assessResearchQuoteEligibility(quote);
      const current=quoteGate.eligible;
      if(!current) gateNotes.push(quoteGate.reason);
      if(!valuation.available||!atr||!Number.isFinite(atr)||atr<=0) {
        gateNotes.push(!valuation.available?"valuation unavailable":"ATR risk data unavailable");
      }
      let entryLow=null,entryHigh=null,entryMid=null,invalidation=null,target=null,rewardRisk=null,gap=null,insideEntry=false;
      if(current&&valuation.available&&atr>0) {
        gap=assessQuoteValuationGap(quote.price,valuation.base);
        if(gap.blocked) gateNotes.push("market/model ratio outside 0.40×–2.50× review band");
        entryLow=valuation.base*0.75; entryHigh=valuation.base*0.80;
        entryMid=(entryLow+entryHigh)/2; invalidation=entryMid-2*atr; target=valuation.base;
        insideEntry=quote.price>=entryLow&&quote.price<=entryHigh;
        rewardRisk=invalidation>0&&entryMid>invalidation?(target-entryMid)/(entryMid-invalidation):null;
        if(!insideEntry) gateNotes.push("price outside model watch zone");
        if(!(invalidation>0)) gateNotes.push("risk reference is non-positive");
        if(!(typeof rewardRisk==="number"&&Number.isFinite(rewardRisk)&&rewardRisk>=2)) gateNotes.push("estimated reward/risk below 2:1 or unavailable");
      }
      const component=(name)=>item.components.find(part=>part.name===name)?.value;
      const growth=component("Revenue growth"),margin=component("Net profit margin"),fcfMargin=component("Approx. FCF margin");
      if(!(typeof growth==="number"&&growth>=-10)) gateNotes.push("revenue trend fails or is missing");
      if(!(typeof margin==="number"&&margin>0)) gateNotes.push("net profit margin is not positive");
      if(!(typeof fcfMargin==="number"&&fcfMargin>0)) gateNotes.push("approximate free-cash-flow margin is not positive");
      const today=newYorkDateOnly();
      const futureEvents=Array.isArray(earnings?.events)?earnings.events.filter(event=>event.reportDate>=today).sort((a,b)=>a.reportDate.localeCompare(b.reportDate)):[];
      const nextEvent=futureEvents[0]||null;
      const earningsVerified=Boolean(nextEvent&&earnings?.verified);
      const daysToEarnings=nextEvent?(Date.parse(nextEvent.reportDate+"T00:00:00Z")-Date.parse(today+"T00:00:00Z"))/86400000:null;
      if(!earningsVerified) gateNotes.push("upcoming earnings date not verified");
      else if(daysToEarnings<=7) gateNotes.push("earnings event within 7 days");
      const headlines=Array.isArray(news?.items)?news.items:[];
      const recent=headlines.filter(headline=>headline.publishedAt&&Number.isFinite(Date.parse(headline.publishedAt))&&
        (Date.now()-Date.parse(headline.publishedAt))/86400000<=7&&(Date.now()-Date.parse(headline.publishedAt))/86400000>=-0.1);
      const riskWords=/fraud|investigation|probe|restatement|bankrupt|accounting irregular|recall|antitrust|guidance cut|cuts outlook|data breach|ceo resign|secondary offering|dilution|sec charge|criminal charges|regulatory action|lawsuit|misses estimates/i;
      const riskHeadlines=recent.filter(headline=>riskWords.test(headline.title||""));
      if(!recent.length) gateNotes.push("no timestamped news in the last 7 days");
      if(riskHeadlines.length) gateNotes.push("potential material-risk headline needs review");
      const ready=gateNotes.length===0;
      plan.dataset.ready=ready?"true":"false";
      plan.dataset.reason=gateNotes.join("; ");
      const lines=[];
      lines.push(ready?"PROVISIONAL TOP WATCH — all current checklist gates passed; not a validated BUY.":"NOT ENTRY-READY — "+gateNotes.join("; ")+".");
      if(current) lines.push("Latest provider price: "+fmtUsd(quote.price)+" ("+(quote.source||"market data provider")+"; "+new Date(quote.quoteTime).toLocaleString()+").");
      if(valuation.available&&current&&!gap?.blocked&&atr>0) {
        lines.push("Model entry watch zone: "+fmtUsd(entryLow)+"–"+fmtUsd(entryHigh)+"; base-case reference: "+fmtUsd(target)+"; risk reference: "+(invalidation>0?fmtUsd(invalidation):"unavailable")+".");
        lines.push("Estimated reward/risk from entry midpoint: "+(typeof rewardRisk==="number"&&Number.isFinite(rewardRisk)?rewardRisk.toFixed(2)+":1":"unavailable")+"; illustrative model gap: "+(Number.isFinite(gap?.ratio)?gap.ratio.toFixed(2)+"×":"unavailable")+".");
      } else {
        lines.push("Entry, target and risk levels withheld until quote, valuation and risk inputs pass checks.");
      }
      if(earningsVerified) lines.push("Next provider-listed earnings: "+fmtDate(nextEvent.reportDate)+"; confirm with issuer investor relations.");
      lines.push("Historical validation remains incomplete; no profit probability is claimed.");
      status.textContent=lines.join(" ");
    } catch(error) {
      plan.dataset.ready="false";
      plan.dataset.reason="required live data check failed";
      status.textContent="NOT ENTRY-READY — could not verify all current inputs ("+(error?.message||"provider error")+"). Entry, target and risk levels withheld.";
    }
  }));
  const bestPick=document.getElementById("screen-best-pick");
  if(bestPick) {
    const readyPlans=[...document.querySelectorAll(".candidate-plan[data-ready='true']")]
      .sort((a,b)=>Number(b.dataset.score||0)-Number(a.dataset.score||0));
    if(readyPlans.length) {
      const best=readyPlans[0];
      const candidate=candidates.find(item=>item.ticker===best.dataset.ticker);
      bestPick.textContent="Strongest current research setup (provisional): "+best.dataset.ticker+" · research score "+Number(best.dataset.score||0).toFixed(1)+"/100. It passed the app's current quote, valuation sanity, risk/reward, fundamentals, earnings and news checklist. This is not a validated BUY, does not guarantee profit, and may change as data updates.";
      bestPick.setAttribute("aria-live","polite");
    } else {
      bestPick.textContent="No current candidate passed every entry checklist gate. Best decision for now: WAIT and keep cash available rather than force a trade. This does not mean the screened stocks are bad businesses.";
      bestPick.setAttribute("aria-live","polite");
    }
  }
}

async function runScreen() {
  const button=$("run-screen"); const suggestButton=$("suggest-stocks-button"); button.disabled=true; suggestButton.disabled=true; button.textContent="Screening…"; suggestButton.querySelector("strong").textContent="Screening stocks…";
  $("screen-status").textContent="Fetching SEC filings and daily prices";
  const results=[],errors=[];
  // A 60-stock, cross-sector starter universe. This is not the full US market.
  // Process in small batches to reduce provider rate-limit pressure and report progress.
  const universe=["AAPL","MSFT","NVDA","AMZN","GOOGL","META","AVGO","ORCL","CRM","AMD","QCOM","TXN","MU","AMAT","LRCX","KLAC","INTC","ANET","NOW","ADBE","JPM","BAC","WFC","GS","MS","V","MA","AXP","C","BLK","LLY","JNJ","ABBV","MRK","UNH","ISRG","ABT","TMO","AMGN","PFE","COST","WMT","HD","LOW","PG","KO","PEP","MCD","NKE","CL","XOM","CVX","COP","CAT","GE","HON","RTX","UBER","NFLX","TSLA"];
  const batchSize=3;
  try {
    for(let i=0;i<universe.length;i+=batchSize) {
      const batch=universe.slice(i,i+batchSize);
      $("screen-status").textContent="Screening "+Math.min(i+batch.length,universe.length)+"/"+universe.length+" · "+results.length+" qualified";
      const settled=await Promise.allSettled(batch.map(ticker=>scoreTicker(ticker)));
      for(let j=0;j<settled.length;j++) {
        const outcome=settled[j],ticker=batch[j];
        if(outcome.status==="fulfilled") results.push(outcome.value);
        else errors.push(ticker+": "+(outcome.reason?.message||"Insufficient data"));
      }
    }
    renderScreenResults(results,errors);
    $("screen-status").textContent=results.length+" ranked · "+errors.length+" excluded from "+universe.length;
    await enrichTopCandidates(results);
  } catch(error) {
    $("screen-status").textContent="Screen interrupted · "+results.length+" ranked so far";
    setMessage("Screen stopped safely: "+(error?.message||"Unexpected error"),"error");
    renderScreenResults(results,errors);
  } finally {
    button.disabled=false; suggestButton.disabled=false; button.textContent="Refresh 60-stock ranking"; suggestButton.querySelector("strong").textContent="Suggest me stocks";
  }
}

function fmtUsd(value) {
  if (typeof value !== "number" || !Number.isFinite(value)) return "Unavailable";
  return new Intl.NumberFormat("en-US", {style:"currency",currency:"USD",maximumFractionDigits:2}).format(value);
}
function latestSecValue(facts, candidates, unit, maxAgeDays=180) {
  const rows=[];
  const today=newYorkDateOnly();
  for (const candidate of candidates) {
    const fact=facts?.facts?.[candidate.taxonomy]?.[candidate.tag];
    const values=fact?.units?.[unit];
    if (!Array.isArray(values)) continue;
    for (const row of values) {
      if (typeof row.val!=="number" || !Number.isFinite(row.val) || !row.end || !row.filed) continue;
      if (row.filed>today || !["10-K","10-Q","20-F","40-F","6-K"].includes(row.form)) continue;
      const filedAgeDays=(Date.parse(today+"T00:00:00Z")-Date.parse(row.filed+"T00:00:00Z"))/86400000;
      const factAgeDays=(Date.parse(today+"T00:00:00Z")-Date.parse(row.end+"T00:00:00Z"))/86400000;
      if (filedAgeDays<0 || filedAgeDays>maxAgeDays || factAgeDays<0 || factAgeDays>maxAgeDays) continue;
      rows.push({value:row.val,end:row.end,filed:row.filed,form:row.form,tag:candidate.tag,taxonomy:candidate.taxonomy,unit});
    }
  }
  rows.sort((a,b)=>b.filed.localeCompare(a.filed)||b.end.localeCompare(a.end));
  if (!rows.length) return null;
  const latest=rows[0];
  const sameFiling=rows.filter(row=>row.filed===latest.filed&&row.end===latest.end);
  if (new Set(sameFiling.map(row=>String(row.value))).size>1) return null;
  return latest;
}
function assessQuoteValuationGap(price, base) {
  if (!(typeof price==="number"&&Number.isFinite(price)&&price>0&&
        typeof base==="number"&&Number.isFinite(base)&&base>0)) {
    return {checked:false,blocked:false,ratio:null,reason:"A valid current quote and positive model estimate are required for a market/model gap check."};
  }
  const ratio=price/base;
  const blocked=ratio>2.5||ratio<0.4;
  return {
    checked:true,blocked,ratio,
    reason:blocked
      ? "Valuation withheld: the current quote is "+ratio.toFixed(2)+"× the simplified base-case DCF estimate. This may reflect real market expectations, weak model assumptions, or a data/corporate-action issue; it does not prove either price is wrong."
      : "The market/model ratio is within the app's broad 0.40×–2.50× review band. This sanity check does not validate the DCF."
  };
}
function buildDcfEstimate(observations, facts) {
  const today=newYorkDateOnly();
  const filedByToday=rows=>rows.filter(row=>row.filed&&row.filed<=today);
  const cash=filedByToday(annualSeries(observations,"operatingCashFlow"));
  const capex=filedByToday(annualSeries(observations,"capex"));
  const revenue=filedByToday(annualSeries(observations,"revenue"));
  const isUsd=row=>String(row?.unit||"").trim().toUpperCase()==="USD";
  const flows=[];
  for (const row of cash) {
    const cap=capex.find(item=>item.end===row.end);
    if (cap) {
      flows.push({
        end:row.end,
        value:row.value-Math.abs(cap.value),
        unit:row.unit,
        capexUnit:cap.unit
      });
    }
  }
  flows.sort((a,b)=>a.end.localeCompare(b.end));
  if (flows.length<3) return {available:false,reason:"Fewer than three unambiguous annual free-cash-flow observations."};
  const last3=flows.slice(-3);
  if (last3.some(row=>!Number.isFinite(row.value)||!isUsd(row)||!isUsd({unit:row.capexUnit}))) {
    return {available:false,reason:"Valuation withheld: the latest three cash-flow periods contain non-USD, mixed-unit, or non-finite observations."};
  }
  if (last3.some(row=>row.value<=0)) return {available:false,reason:"Recent annual free cash flow is not positive in all three comparable periods."};
  const daysBetween=(left,right)=>(Date.parse(right+"T00:00:00Z")-Date.parse(left+"T00:00:00Z"))/86400000;
  if (last3.some((row,index)=>index>0&&(daysBetween(last3[index-1].end,row.end)<300||daysBetween(last3[index-1].end,row.end)>430))) {
    return {available:false,reason:"Recent free-cash-flow observations are not spaced like consecutive annual periods."};
  }
  const matchedRevenue=last3.map(row=>revenue.find(item=>item.end===row.end)||null);
  if (matchedRevenue.some(row=>!row)) {
    return {available:false,reason:"Valuation withheld: each of the latest three annual free-cash-flow periods must match an unambiguous annual revenue period."};
  }
  if (matchedRevenue.some(row=>!isUsd(row)||!Number.isFinite(row.value)||row.value<=0)) {
    return {available:false,reason:"Valuation withheld: annual revenue inputs must be positive, finite USD values across all three matched periods."};
  }
  const latestFcf=last3[2];
  const latestRevenue=matchedRevenue[2], previousRevenue=matchedRevenue[1];
  const currentInstantShares=latestSecValue(facts,[
    {taxonomy:"dei",tag:"EntityCommonStockSharesOutstanding"},
    {taxonomy:"us-gaap",tag:"EntityCommonStockSharesOutstanding"}
  ],"shares",180);
  const shares=currentInstantShares&&currentInstantShares.value>0
    ? {value:currentInstantShares.value,end:currentInstantShares.end,filed:currentInstantShares.filed,source:"Recent SEC-reported instant shares outstanding"}
    : null;
  if (!shares || shares.value<=0) return {available:false,reason:"No unambiguous SEC shares-outstanding fact whose fact date and filing date are both within the last 180 days; per-share valuation is withheld."};
  const fcfGrowth1=last3[2].value/last3[1].value-1;
  const fcfGrowth2=last3[1].value/last3[0].value-1;
  const revenueGrowth=latestRevenue.value/previousRevenue.value-1;
  const clamp=(n,min,max)=>Math.max(min,Math.min(max,n));
  const baseGrowth=clamp((clamp((fcfGrowth1+fcfGrowth2)/2,-0.20,0.25)+clamp(revenueGrowth,-0.20,0.25))/2,-0.05,0.15);
  function perShare(fcf,growth,discount,terminal) {
    if (!(fcf>0&&shares.value>0&&discount>terminal&&terminal>=0)) return null;
    let cashFlow=fcf,pv=0;
    for(let year=1;year<=5;year++) {
      cashFlow*=1+growth;
      pv+=cashFlow/Math.pow(1+discount,year);
    }
    const terminalValue=cashFlow*(1+terminal)/(discount-terminal);
    const value=(pv+terminalValue/Math.pow(1+discount,5))/shares.value;
    return Number.isFinite(value)&&value>0?value:null;
  }
  const bearGrowth=clamp(baseGrowth-0.10,-0.20,0.05);
  const bullGrowth=clamp(baseGrowth+0.10,-0.05,0.25);
  const bear=perShare(latestFcf.value,bearGrowth,0.12,0.015);
  const base=perShare(latestFcf.value,baseGrowth,0.10,0.025);
  const bull=perShare(latestFcf.value,bullGrowth,0.09,0.03);
  if (![bear,base,bull].every(value=>typeof value==="number"&&Number.isFinite(value))||!(bear<=base&&base<=bull)) {
    return {available:false,reason:"The DCF scenarios did not produce a valid ordered range."};
  }
  return {
    available:true,bear,base,bull,latestFcf:latestFcf.value,fcfPeriod:latestFcf.end,
    shares:shares.value,sharesFiled:shares.filed,sharesFactDate:shares.end,sharesSource:shares.source,
    baseGrowth,fcfGrowth1,fcfGrowth2,revenueGrowth,
    assumptions:"Illustrative five-year equity-cash-flow proxy (operating cash flow minus capex); bear/base/bull growth "+(bearGrowth*100).toFixed(1)+"/"+(baseGrowth*100).toFixed(1)+"/"+(bullGrowth*100).toFixed(1)+"%; discount rates 12%/10%/9%; terminal growth 1.5%/2.5%/3.0%. These generic assumptions are not company-specific or validated."
  };
}
function averageTrueRange(history,period=14) {
  const rows=history?.data;
  if(!Array.isArray(rows)||rows.length<period+1) return null;
  const ranges=[];
  for(let i=rows.length-period;i<rows.length;i++) {
    const row=rows[i], previous=rows[i-1];
    if (![row.high,row.low,previous.close].every(value=>typeof value==="number"&&Number.isFinite(value))) return null;
    ranges.push(Math.max(row.high-row.low,Math.abs(row.high-previous.close),Math.abs(row.low-previous.close)));
  }
  const atr=ranges.reduce((sum,value)=>sum+value,0)/ranges.length;
  return Number.isFinite(atr)&&atr>0?atr:null;
}
function metricCard(label,value,meta) {
  const card=document.createElement("article"); card.className="metric-card";
  const title=document.createElement("div"); title.className="metric-label"; title.textContent=label;
  const main=document.createElement("div"); main.className="metric-value"; main.textContent=value;
  const detail=document.createElement("div"); detail.className="metric-date"; detail.textContent=meta;
  card.append(title,main,detail); return card;
}
function previousFiscalQuarter(value) {
  const match=String(value||"").match(/^Q([1-4])-(20\d{2})$/i);
  if(!match) return null;
  const quarter=Number(match[1]), year=Number(match[2]);
  return quarter===1?"Q4-"+(year-1):"Q"+(quarter-1)+"-"+year;
}
function loadEarningsResult(ticker,quarter) {
  if(!quarter) return Promise.resolve({
    available:false,
    reason:"The earnings-calendar source did not supply an unambiguous fiscal quarter, so the previous quarter could not be matched safely."
  });
  return fetch("/api/earnings-result?ticker="+encodeURIComponent(ticker)+"&quarter="+encodeURIComponent(quarter),{
    headers:{"Accept":"application/json"}
  }).then(async response=>{
    const payload=await response.json();
    if(!response.ok && payload?.available!==false) throw new Error(payload?.reason||"Earnings brief unavailable");
    return payload;
  }).catch(error=>({available:false,reason:"The earnings brief could not be loaded. "+(error.message||"No estimate or result has been assumed.")}));
}
function renderEarningsResult(payload,quarter,expectedQuarter) {
  const panel=$("earnings-results-panel"),root=$("earnings-results-content");
  panel.classList.remove("hidden");root.innerHTML="";
  if(!quarter||!quarter.periodEnd) {
    $("earnings-results-status").textContent="SEC data unavailable";
    root.textContent="The latest reported SEC quarter could not be reconciled, so actual-versus-consensus comparisons are withheld.";
    return;
  }
  $("earnings-results-status").textContent="SEC period ended "+fmtDate(quarter.periodEnd);
  root.append(metricCard("SEC quarterly revenue",typeof quarter.currentRevenue==="number"?fmtValue(quarter.currentRevenue,"USD"):"Unavailable","Reported quarter ended "+fmtDate(quarter.periodEnd)+(quarter.filed?" · filing "+fmtDate(quarter.filed):"")));
  root.append(metricCard("SEC quarterly net income",typeof quarter.currentIncome==="number"?fmtValue(quarter.currentIncome,"USD"):"Unavailable","Company-reported quarterly fact; see SEC filings"));
  root.append(metricCard("SEC diluted EPS (GAAP tag)",typeof quarter.currentEps==="number"?fmtValue(quarter.currentEps,"USD/shares"):"Unavailable","SEC us-gaap EarningsPerShareDiluted fact; source period and filing shown above"));
  if(!payload||!payload.available) {
    const note=document.createElement("p");note.className="table-note";note.textContent=(payload?.reason||"A public earnings brief is not available for the matched quarter.")+" No third-party estimate has been invented.";
    root.append(note);
    return;
  }
  const reported=String(payload.status||"").toLowerCase()==="reported";
  const estimates=payload.estimates||{};
  const actualRevenue=quarter.currentRevenue;
  const consensusRevenue=typeof estimates.consensusRevenue==="number"?estimates.consensusRevenue*1e6:null;
  const actualEps=quarter.currentEps;
  const consensusEps=typeof estimates.consensusEps==="number"?estimates.consensusEps:null;
  const consensusEpsBasis=String(estimates.epsBasis||"").toUpperCase();
  const epsBasisKnown=["GAAP","NON-GAAP"].includes(consensusEpsBasis);
  const revenueVariance=typeof actualRevenue==="number"&&typeof consensusRevenue==="number"&&consensusRevenue>0
    ?actualRevenue/consensusRevenue-1:null;
  const epsVariance=typeof actualEps==="number"&&typeof consensusEps==="number"&&Math.abs(consensusEps)>0
    ?actualEps/consensusEps-1:null;
  if(!reported) {
    const note=document.createElement("p");note.className="table-note";note.textContent="The third-party brief is not marked reported, so it is not used to characterize an earnings beat or miss.";
    root.append(note);
    return;
  }
  root.append(metricCard("Provider consensus revenue",typeof consensusRevenue==="number"?fmtValue(consensusRevenue,"USD"):"Unavailable",
    "EarningsNxt third-party estimate"+(typeof estimates.consensusRevenue==="number"?" · source units converted from USD millions":"")));
  root.append(metricCard("Revenue vs consensus",
    revenueVariance===null?"Not comparable":(revenueVariance>=0?"+":"")+(revenueVariance*100).toFixed(2)+"%",
    revenueVariance===null?"Actual period or consensus estimate unavailable":"Calculated from SEC-reported revenue and third-party consensus"));
  root.append(metricCard("Provider consensus EPS",typeof consensusEps==="number"?fmtUsd(consensusEps):"Unavailable",
    "May use an adjusted EPS definition; not guaranteed comparable with SEC GAAP diluted EPS"));
  root.append(metricCard("Diluted EPS vs consensus",
    epsVariance===null?"Not comparable":(epsVariance>=0?"+":"")+(epsVariance*100).toFixed(2)+"%",
    epsVariance===null?"Not compared: estimate basis is unverified or EPS values are unavailable":"SEC actual is labelled GAAP-tag diluted EPS; provider estimate basis is "+consensusEpsBasis));
  const providerActualsAvailable=typeof payload.actualEps==="number"&&Number.isFinite(payload.actualEps)&&
    typeof payload.actualRevenue==="number"&&Number.isFinite(payload.actualRevenue);
  const article=document.createElement("article");article.className="news-item";
  const h=document.createElement("strong");
  h.textContent=providerActualsAvailable&&payload.headline
    ?"Third-party provider summary (not independently verified): "+payload.headline
    :"Secondary provider narrative omitted from the decision";
  article.append(h);
  const context=document.createElement("p");
  context.className="muted";
  context.textContent=providerActualsAvailable
    ?"The brief includes its own actual-result fields; this system still calculates the displayed comparisons from SEC facts and clearly labelled consensus estimates."
    :"The provider API did not include its own raw actual EPS/revenue and surprise values. Its generated headline/commentary is not used to classify the quarter; displayed comparisons above are computed from SEC-reported results and the provider's consensus estimates.";
  article.append(context);
  if(providerActualsAvailable&&payload.whatItMeans) {
    const p=document.createElement("p");p.textContent=payload.whatItMeans;article.append(p);
  }
  if(payload.sourceUrl) {
    const link=document.createElement("a");link.href=payload.sourceUrl;link.target="_blank";link.rel="noopener noreferrer";
    link.textContent="Open third-party earnings brief";article.append(link);
  }
  root.append(article);
  const note=document.createElement("p");note.className="table-note";
  note.textContent="Matched fiscal-quarter request: "+(expectedQuarter||payload.quarter||"unknown")+". SEC reported values above are primary-source facts. Consensus is third-party secondary data and may be adjusted or use a different EPS definition. Confirm material figures against the original company earnings release.";
  root.append(note);
}
function renderEarnings(payload) {
  const panel=$("earnings-panel"),root=$("earnings-content");
  panel.classList.remove("hidden"); root.innerHTML="";
  if(!payload||!Array.isArray(payload.events)) {
    $("earnings-status").textContent="Unverified";
    root.textContent=payload?.error||"Could not verify the upcoming earnings calendar. Treat the event date as unknown.";
    return;
  }
  const now=new Date().toISOString().slice(0,10);
  const events=payload.events.filter(event=>event.reportDate>=now).sort((a,b)=>a.reportDate.localeCompare(b.reportDate));
  $("earnings-status").textContent=events.length?(payload.verified?"Event found":"Event found · coverage incomplete"):"Date unconfirmed";
  if(events.length) {
    for(const event of events) {
      const item=document.createElement("article"); item.className="news-item";
      const heading=document.createElement("strong"); heading.textContent=event.company+" · "+(event.fiscalQuarterEnding||event.fiscalQuarter||"Earnings");
      const detail=document.createElement("p"); detail.className="muted";
      const estimates=[
        typeof event.consensusEps==="number"?"EPS est. "+fmtUsd(event.consensusEps):"",
        typeof event.consensusRevenue==="number"?"Revenue est. "+fmtUsd(event.consensusRevenue*1e6):"",
        typeof event.impliedMovePct==="number"?"Implied move "+event.impliedMovePct.toFixed(1)+"%":""
      ].filter(Boolean).join(" · ");
      detail.textContent=fmtDate(event.reportDate)+" · "+(event.reportTime==="BMO"?"Before market open":event.reportTime==="AMC"?"After market close":"Time not confirmed")+(estimates?" · "+estimates:"");
      const link=document.createElement("a"); link.href=event.sourceUrl; link.target="_blank"; link.rel="noopener noreferrer"; link.textContent="Open calendar entry";
      item.append(heading,detail,link); root.append(item);
    }
  } else {
    const p=document.createElement("p"); p.className="empty"; p.textContent="No matching upcoming event was found in the provider's returned calendar window; this does not prove that no earnings report is scheduled."; root.append(p);
  }
  const note=document.createElement("p"); note.className="table-note"; note.textContent=(payload.warning||"")+" Source: "+(payload.provider||"public earnings calendar")+" · Retrieved "+new Date(payload.fetchedAt||Date.now()).toLocaleString()+". Confirm dates with official investor relations.";
  root.append(note);
}
function renderDecision({ticker,observations,facts,quote,history,news,earnings,quarter}) {
  latestDecisionContext = null;
  const panel=$("recommendation-panel"); panel.classList.remove("hidden");
  const grid=$("decision-metrics"),checks=$("decision-checks");
  grid.innerHTML=""; checks.innerHTML="";
  const valuation=buildDcfEstimate(observations,facts);
  const atr=averageTrueRange(history);
  const quoteDate=quote?.quoteTime?new Date(quote.quoteTime):null;
  const quoteAgeHours=quoteDate&&!Number.isNaN(quoteDate.getTime())?(Date.now()-quoteDate.getTime())/3600000:Infinity;
  const quoteInterval=String(quote?.interval||"").toLowerCase();
  const quoteReliabilityLabel=String(quote?.delayedOrRealtime||"").toLowerCase();
  const dailySnapshot=quoteInterval==="1d"||quoteReliabilityLabel.includes("daily interval")||
    quoteReliabilityLabel.includes("not real-time");
  const quoteCurrent=typeof quote?.price==="number"&&quote.price>0&&
    quoteAgeHours>=-2&&quoteAgeHours<=48&&!dailySnapshot;
  // A large market/model gap can be real, not necessarily a data error.
  // Keep raw DCF outputs for auditability, but do not derive trade levels from them.
  const gapCheck = valuation.available && quoteCurrent
    ? assessQuoteValuationGap(quote.price,valuation.base)
    : {checked:false,blocked:false,ratio:null,reason:null};
  const valuationDecisionReady = Boolean(valuation.available && quoteCurrent && gapCheck.checked && !gapCheck.blocked);
  const today=newYorkDateOnly();
  const nextEvent=(earnings?.events||[]).filter(event=>event.reportDate>=today).sort((a,b)=>a.reportDate.localeCompare(b.reportDate))[0]||null;
  const daysToEarnings=nextEvent?(Date.parse(nextEvent.reportDate+"T00:00:00Z")-Date.parse(today+"T00:00:00Z"))/86400000:null;
  const earningsVerified=Boolean(nextEvent&&earnings?.verified);
  const headlines=Array.isArray(news?.items)?news.items:[];
  const recentHeadlines=headlines.filter(item=>item.publishedAt&&Number.isFinite(Date.parse(item.publishedAt))&&(Date.now()-Date.parse(item.publishedAt))/86400000<=7&&(Date.now()-Date.parse(item.publishedAt))/86400000>=-0.1);
  const riskWords=/fraud|investigation|probe|restatement|bankrupt|accounting irregular|recall|antitrust|guidance cut|cuts outlook|data breach|ceo resign|secondary offering|dilution|sec charge|criminal charges|regulatory action|lawsuit|misses estimates/i;
  const flaggedHeadlines=recentHeadlines.filter(item=>riskWords.test(item.title||""));
  const rev=annualSeries(observations,"revenue");
  const income=annualSeries(observations,"netIncome");
  const fcf=(()=>{const c=annualSeries(observations,"operatingCashFlow"),x=annualSeries(observations,"capex");return c.map(row=>{const cap=x.find(item=>item.end===row.end);return cap?{end:row.end,value:row.value-Math.abs(cap.value)}:null;}).filter(Boolean).sort((a,b)=>a.end.localeCompare(b.end));})();
  const latestRevenue=rev[rev.length-1],priorRevenue=rev[rev.length-2];
  const latestIncome=latestRevenue?income.find(item=>item.end===latestRevenue.end):null;
  const latestFcf=latestRevenue?fcf.find(item=>item.end===latestRevenue.end):null;
  const annualDataAvailable=Boolean(
    latestRevenue&&priorRevenue&&priorRevenue.value>0&&
    typeof latestRevenue.value==="number"&&Number.isFinite(latestRevenue.value)&&
    latestIncome&&Number.isFinite(latestIncome.value)&&
    latestFcf&&Number.isFinite(latestFcf.value)
  );
  const annualRevenueGrowth=annualDataAvailable?latestRevenue.value/priorRevenue.value-1:null;
  const annualFundamentalPass=Boolean(annualDataAvailable&&latestRevenue.value>0&&
    latestIncome.value>0&&latestFcf.value>0&&annualRevenueGrowth>=-0.10);
  const quarterlyDataAvailable=Boolean(
    quarter&&typeof quarter.currentRevenue==="number"&&Number.isFinite(quarter.currentRevenue)&&
    typeof quarter.currentIncome==="number"&&Number.isFinite(quarter.currentIncome)&&
    typeof quarter.revenueYoY==="number"&&Number.isFinite(quarter.revenueYoY)
  );
  const quarterlyPass=Boolean(quarterlyDataAvailable&&quarter.currentRevenue>0&&
    quarter.currentIncome>0&&quarter.revenueYoY>=-0.15);
  const fundamentalPass=annualFundamentalPass&&quarterlyPass;
  const fundamentalAvoid=(annualDataAvailable&&!annualFundamentalPass)||
    (quarterlyDataAvailable&&!quarterlyPass);
  const entryLow=valuationDecisionReady?valuation.base*0.75:null;
  const entryHigh=valuationDecisionReady?valuation.base*0.80:null;
  const entryMid=entryLow!==null?(entryLow+entryHigh)/2:null;
  const invalidation=entryMid!==null&&atr!==null?entryMid-2*atr:null;
  const rewardRisk=entryMid!==null&&invalidation!==null&&entryMid>invalidation&&valuation.base>entryMid?(valuation.base-entryMid)/(entryMid-invalidation):null;
  const priceInEntryRange=quoteCurrent&&entryLow!==null&&quote.price>=entryLow&&quote.price<=entryHigh;
  const plannedShares=valuationDecisionReady&&entryMid!==null&&invalidation!==null&&invalidation>0&&entryMid>invalidation?Math.min(Math.floor(5/(entryMid-invalidation)),Math.floor(500/entryMid)):0;
  const dataChecks=[
    {label:"Current price",ok:quoteCurrent,detail:quoteCurrent?(quote?.quoteTime?"Provider quote timestamp "+quoteDate.toLocaleString():quote?.quoteLabel?"Provider quote date "+quote.quoteLabel+"; exact trade time was not supplied":"Provider date/time "+quoteDate.toLocaleString()):(dailySnapshot?"Provider returned a daily-bar snapshot, not a current quote":"Quote unavailable, missing a usable date/time, or older than 48 hours")},
    {label:"Valuation inputs / market-gap review",ok:valuationDecisionReady,detail:!valuation.available?valuation.reason:!quoteCurrent?"Raw DCF inputs exist, but no reliable recent timestamped quote is available; entry/exit levels are withheld.":gapCheck.blocked?gapCheck.reason:"Matched annual USD inputs and recent SEC share count passed basic checks; this remains an illustrative, unvalidated DCF."},
    {label:"Annual fundamentals",ok:annualFundamentalPass,detail:annualFundamentalPass?"Latest annual revenue, net income and approximate FCF are positive; annual revenue has not dropped more than 10% year over year":"Annual quality filter failed or comparable data is missing"},
    {label:"Latest quarterly trend",ok:quarterlyPass,detail:quarterlyPass?"Quarterly revenue/net income are positive and revenue is no worse than -15% year over year":"Latest quarterly net income, same-quarter revenue comparison, or quality threshold did not pass"},
    {label:"Earnings/event risk",ok:earningsVerified,detail:earningsVerified?(daysToEarnings<=7?"Earnings in "+Math.max(0,Math.round(daysToEarnings))+" day(s) — avoid new entry before this event":"Next "+(earnings?.provider||"provider-listed")+" date "+fmtDate(nextEvent.reportDate)):"Next earnings date not confirmed by this provider"},
    {label:"Recent news",ok:recentHeadlines.length>0&&!flaggedHeadlines.length,detail:recentHeadlines.length?(flaggedHeadlines.length?flaggedHeadlines.length+" recent headline(s) contain risk keywords and need source review":recentHeadlines.length+" timestamped headline(s) from the last 7 days"):"No timestamped headlines in the last 7 days"},
    {label:"Price risk level",ok:invalidation!==null&&invalidation>0,detail:invalidation!==null&&invalidation>0?"Based on 14-day average true range: "+fmtUsd(invalidation):"ATR risk level unavailable from complete daily high/low data"},
    {label:"Historical validation",ok:false,detail:"Complete walk-forward and untouched holdout validation is not finished; any BUY shown remains provisional and unvalidated."}
  ];
  const latestAssets=latestRevenue?annualSeries(observations,"assets").find(item=>item.end===latestRevenue.end):null;
  const latestLiabilities=latestRevenue?annualSeries(observations,"liabilities").find(item=>item.end===latestRevenue.end):null;
  const liquidityAvailable=Boolean(latestAssets&&latestLiabilities&&Number.isFinite(latestAssets.value)&&Number.isFinite(latestLiabilities.value));
  const liquidityRatio=liquidityAvailable&&latestLiabilities.value>0?latestAssets.value/latestLiabilities.value:null;
  const growthScreen={label:"Growth screen",ok:annualDataAvailable&&annualRevenueGrowth>=0&&quarterlyDataAvailable&&quarter.revenueYoY>=0,
    detail:!annualDataAvailable||!quarterlyDataAvailable?"WARN — comparable annual or quarterly revenue is missing.": "Annual revenue growth "+(annualRevenueGrowth*100).toFixed(1)+"% (period ending "+latestRevenue.end+"); latest-quarter revenue YoY "+(quarter.revenueYoY*100).toFixed(1)+"% (period ending "+quarter.periodEnd+"). Rule: both must be >= 0%."};
  const profitabilityScreen={label:"Profitability screen",ok:annualDataAvailable&&latestIncome.value>0&&latestFcf.value>0&&quarterlyDataAvailable&&quarter.currentIncome>0,
    detail:!annualDataAvailable||!quarterlyDataAvailable?"WARN — comparable net income or FCF is missing.":"Annual net income "+fmtMoney(latestIncome.value)+" and approximate annual FCF "+fmtMoney(latestFcf.value)+" (period ending "+latestRevenue.end+"); latest-quarter net income "+fmtMoney(quarter.currentIncome)+". Rule: all reported values must be positive."};
  const liquidityScreen={label:"Liquidity screen",ok:liquidityAvailable&&latestAssets.value>=latestLiabilities.value,
    detail:!liquidityAvailable?"WARN — matched annual assets/liabilities are unavailable.":"Assets "+fmtMoney(latestAssets.value)+"; liabilities "+fmtMoney(latestLiabilities.value)+" (period ending "+latestRevenue.end+"); assets/liabilities "+(liquidityRatio===null?"not calculable":liquidityRatio.toFixed(2)+"x")+". Rule: assets must be >= liabilities. This is a broad balance-sheet check, not a current ratio."};
  const cashFlowScreen={label:"Cash-flow screen",ok:annualDataAvailable&&latestFcf.value>0,
    detail:!annualDataAvailable?"WARN — matched annual operating cash flow and capex are unavailable.":"Approximate FCF = operating cash flow minus absolute capex = "+fmtMoney(latestFcf.value)+" (period ending "+latestFcf.end+"). Rule: positive latest annual FCF; no TTM substitution is claimed."};
  const eventRiskScreen={label:"Event-risk screen",ok:earningsVerified&&daysToEarnings>3&&flaggedHeadlines.length===0,
    detail:!earningsVerified?"WARN — next earnings date is not verified.":daysToEarnings<=3?"FAIL — earnings expected within "+Math.max(0,Math.round(daysToEarnings))+" days.":flaggedHeadlines.length?"WARN — "+flaggedHeadlines.length+" recent headline(s) match risk keywords.":"No keyword-triggered risk headline found in recent timestamped coverage; this is not proof that no material event exists."};
  dataChecks.push(growthScreen,profitabilityScreen,liquidityScreen,cashFlowScreen,eventRiskScreen);
  // Explicit decision states are shown for every research run. BUY remains locked until
  // point-in-time walk-forward and untouched holdout validation demonstrate a credible edge.
  const coreEvidencePass = quoteCurrent && valuationDecisionReady && annualFundamentalPass &&
    quarterlyPass && earningsVerified && recentHeadlines.length>0 && flaggedHeadlines.length===0 &&
    atr!==null && Number.isFinite(atr) && rewardRisk!==null && Number.isFinite(rewardRisk);
  const buySetupPass = coreEvidencePass && daysToEarnings>7 && priceInEntryRange &&
    rewardRisk>=2 && invalidation!==null && invalidation>0 && invalidation<entryLow && plannedShares>0;
  const historicalValidationPass = false; // Fail closed until a real validation report is reviewed and approved.
  const missingInputs=[];
  if(!quoteCurrent) missingInputs.push(dailySnapshot?"a verified current quote (the available price is a daily snapshot)":"a recent timestamped market quote");
  if(!annualDataAvailable) missingInputs.push("comparable annual financial statements");
  if(!quarterlyDataAvailable) missingInputs.push("a comparable latest-quarter financial report");
  if(!earningsVerified) missingInputs.push("a verified upcoming earnings date");
  if(!recentHeadlines.length) missingInputs.push("recent timestamped news coverage");
  if(atr===null||!Number.isFinite(atr)) missingInputs.push("complete daily high/low price history for risk measurement");
  const insufficientData=missingInputs.length>0;
  let state;
  if (fundamentalAvoid) state="AVOID";
  else if (dailySnapshot) state="WAIT";
  else if (gapCheck.blocked) state="WAIT";
  else if (insufficientData) state="INSUFFICIENT DATA";
  else if (!valuationDecisionReady || (daysToEarnings!==null && daysToEarnings<=3)) state="WAIT";
  else if (flaggedHeadlines.length) state="WAIT";
  else if (buySetupPass && !historicalValidationPass) state="BUY SETUP — UNVALIDATED";
  else if (buySetupPass && historicalValidationPass) state="BUY";
  else state="WAIT";
  const reasonRule=fundamentalAvoid?"Fundamental quality rule failed":
    dailySnapshot?"Provider supplied a daily-bar snapshot, not a verified current quote":
    gapCheck.blocked?"Valuation model outside the 0.40×–2.50× review band"+(missingInputs.length?"; also missing: "+missingInputs.join("; "):""):
    insufficientData?"Missing required inputs: "+missingInputs.join("; "):
    daysToEarnings!==null&&daysToEarnings<=3?"Earnings event is within 3 calendar days":
    !valuationDecisionReady?"Valuation decision gate is not satisfied":
    flaggedHeadlines.length?"Potential material-risk headline requires primary-source review":
    buySetupPass&&!historicalValidationPass?"Entry checks passed, but strategy validation is not complete":
    state==="BUY"?"Validated entry criteria passed":"No new entry trigger";
  $("decision-status").textContent=state+" · RESEARCH ONLY";
  const bottomLine = state==="AVOID"
    ? "AVOID — "+reasonRule+". Review the failed financial evidence and original sources before reconsidering."
    : state==="INSUFFICIENT DATA"
    ? "INSUFFICIENT DATA — Northstar could not verify: "+missingInputs.join("; ")+". No trade-like conclusion is supported until these inputs are available."
    : state==="WAIT" && gapCheck.blocked
    ? "WAIT — the simplified valuation is outside the 0.40×–2.50× review band (quote/model ratio "+gapCheck.ratio.toFixed(2)+"×). This does not by itself prove the stock is overvalued. Valuation levels are withheld."+(missingInputs.length?" Additional missing inputs: "+missingInputs.join("; ")+".":"")
    : state==="BUY SETUP — UNVALIDATED"
    ? "BUY SETUP — UNVALIDATED. All current entry checks passed, but historical strategy validation is not approved. Research only; this is not a validated BUY and no order will be placed."
    : state==="WAIT"
    ? "WAIT — "+reasonRule+". Do not force a trade while this rule remains unresolved."
    : state==="SELL REVIEW"
    ? "SELL REVIEW — recent headlines contain potential material-risk terms. Verify the primary sources and your position thesis; this is not an automatic sell order."
    : state==="BUY"
    ? "BUY — validated entry criteria passed. Research only; no order will be placed."
    : "HOLD — available evidence does not justify a validated entry and there is no clear new-entry setup.";
  $("decision-bottom-line").textContent=bottomLine;
  const nextStep = state==="AVOID"
    ? "Next: inspect the specific failed financial screen, the cited SEC period and the original filing."
    : state==="INSUFFICIENT DATA"
    ? "Next: "+missingInputs.map(item=>"verify "+item).join("; ")+". Re-run the analysis after the missing inputs are available. Do not substitute estimates for missing facts."
    : state==="BUY SETUP — UNVALIDATED"
    ? "Next: review the reproducible point-in-time walk-forward and untouched-holdout report. Keep the validated BUY gate closed until it passes."
    : state==="WAIT"
    ? "Next: do not buy yet. Resolve the named warning above, then run the analysis again. If valuation is withheld, the app needs better price or financial data."
    : state==="SELL REVIEW"
    ? "Next: open the original news and SEC filing, confirm materiality, and review your own position and thesis before deciding."
    : state==="BUY"
    ? "Next: independently review the evidence, sizing and downside risks. This research app does not place orders."
    : "Next: hold off on adding shares; reassess after new filings, earnings, material news or major price changes.";
  $("decision-next-step").textContent=nextStep;
  const decisionHero=$("decision-hero");
  const heroCopy={
    "BUY":{symbol:"✓",label:"VALIDATED SETUP",title:"BUY CANDIDATE — review before acting",summary:"The configured entry checks and historical validation passed. This is still research, not a guarantee that the price will rise.",action:"Before buying: review the risk, price timestamp and downside plan. Northstar never places orders."},
    "BUY SETUP — UNVALIDATED":{symbol:"!",label:"NOT APPROVED TO BUY",title:"BUY SETUP — UNVALIDATED: do not buy based on this result",summary:"Some checks look promising, but the strategy has not passed full historical validation.",action:"Do not buy based on this result. Wait and treat this as a research lead only; it is not a validated BUY signal."},
    "WAIT":{symbol:"Ⅱ",label:"WAIT — NO NEW BUY",title:dailySnapshot?"WAIT — price data is not current":gapCheck.blocked?"WAIT — valuation needs review":"WAIT — NO NEW ENTRY TRIGGER",summary:dailySnapshot?"The provider supplied a daily price snapshot, not a verified current quote. The system cannot safely judge the price to buy at.":"At least one important entry check is not satisfied. Buying now would mean ignoring an unresolved warning.",action:dailySnapshot?"Action: wait for a reliable timestamped quote, then analyze the stock again.":"Action: do not open a new position yet. Read the reason below and re-run the analysis when the issue is resolved."},
    "AVOID":{symbol:"×",label:"IMPORTANT RISK FOUND",title:"AVOID — review the failed company-quality check",summary:"The stock failed one or more configured company-quality checks. That does not predict the future, but it is a reason not to rush in.",action:"Action: do not buy based on this analysis. Review the failed checks and official filings before reconsidering."},
    "INSUFFICIENT DATA":{symbol:"?",label:"NOT ENOUGH RELIABLE DATA",title:"No safe decision yet",summary:"Northstar could not verify all the information needed for a dependable assessment.",action:"Action: do not buy or sell based on this result. Refresh the missing data and analyze again."},
    "SELL REVIEW":{symbol:"!",label:"REVIEW YOUR POSITION",title:"A warning needs your attention",summary:"Recent headlines contain possible risk terms. A headline scan alone does not prove the company is in trouble.",action:"Action: if you own this stock, check the original news and SEC filing before deciding. This is not an automatic sell instruction."},
    "HOLD":{symbol:"Ⅱ",label:"NO NEW BUY SIGNAL",title:"Hold off on adding shares",summary:"The available evidence does not support a new validated entry, and the configured sell-review trigger has not fired.",action:"Action: if you already own it, review your original reason for buying. If you do not own it, wait for stronger evidence."}
  };
  const copy=heroCopy[state]||heroCopy["INSUFFICIENT DATA"];
  decisionHero.className="decision-hero state-"+(state==="BUY SETUP — UNVALIDATED"?"unvalidated":state.toLowerCase().replace(/[^a-z]+/g,"-"));
  $("decision-symbol").textContent=copy.symbol;
  $("decision-plain-label").textContent=copy.label;
  $("decision-title").textContent=copy.title;
  $("decision-plain-summary").textContent=copy.summary;
  $("decision-action").textContent=copy.action;
  const reasons=[];
  if(!quoteCurrent) reasons.push(dailySnapshot?"The available price is a daily-bar snapshot, not a verified current quote.":"A sufficiently recent timestamped quote is missing.");
  if(!valuation.available) reasons.push(valuation.reason);
  else if(!quoteCurrent) reasons.push("The raw DCF calculation is available for inspection, but no reliable current timestamped quote is available. Entry and exit levels are withheld.");
  else if(gapCheck.blocked) reasons.push("Valuation withheld: the valuation model check failed because the market quote is "+gapCheck.ratio.toFixed(2)+"× the simplified DCF estimate, outside the permitted 0.40×–2.50× review band. Treat the DCF as unreliable for this decision until its cash-flow, share-count, corporate-action and growth assumptions are independently checked. This ratio alone does not mean the stock is overpriced or underpriced. Entry/exit levels are withheld.");
  if(!annualDataAvailable) reasons.push("Comparable annual financial data is incomplete or ambiguous.");
  else if(!annualFundamentalPass) reasons.push("The annual quality screen failed: revenue, net income, free cash flow, or annual revenue trend is below the configured minimum.");
  if(!quarterlyDataAvailable) reasons.push("The latest quarterly data is incomplete or cannot be matched safely to the previous year.");
  else if(!quarterlyPass) reasons.push("The latest quarter failed the minimum quality screen: revenue/net income must be positive and revenue must be no worse than -15% year over year.");
  if(!earningsVerified) reasons.push("The next earnings date is not reliably confirmed.");
  if(daysToEarnings!==null&&daysToEarnings<=7) reasons.push("An earnings report is due within 7 days, so event risk is high.");
  if(!recentHeadlines.length) reasons.push("Recent timestamped news coverage is missing.");
  if(flaggedHeadlines.length) reasons.push("Recent headlines contain potential risk keywords and need checking against original sources.");
  if(valuationDecisionReady&&!priceInEntryRange) reasons.push(quote.price>entryHigh?"The quote is above the illustrative entry watch zone; do not chase.":"The quote is below the illustrative zone; reassess whether this is a value trap or a data/event shock.");
  if(rewardRisk!==null&&rewardRisk<2) reasons.push("The provisional reward-to-risk ratio is below 2:1.");
  if(invalidation!==null&&entryLow!==null&&invalidation>=entryLow) reasons.push("The ATR-based invalidation is not below the full entry watch zone, so the risk setup is rejected.");
  if(state==="BUY") reasons.push("BUY criteria passed and historical validation is approved. This is research only; no order is placed.");
  else if(state==="SELL REVIEW") reasons.push("SELL REVIEW is active because recent headlines contain potential material-risk keywords. Verify the original filing/news and your position-specific facts; this is not an automatic sell order.");
  else if(state==="HOLD") reasons.push("HOLD means the available evidence did not justify a validated entry and did not trigger the configured sell-review rule. Reassess after material filings, earnings, news, or price changes.");
  else if(state==="BUY SETUP — UNVALIDATED") reasons.push("The configured quote, valuation, fundamental, event, price-zone, reward/risk, and share-sizing checks passed. The historical strategy validation gate remains closed; this is not a validated BUY.");
  else reasons.push("WAIT means one or more required data-quality, event-risk, fundamental, valuation, or price-entry checks did not pass. Do not force a trade from incomplete evidence.");
  $("decision-explanation").textContent=reasons.join(" ");
  if(valuationDecisionReady) {
    grid.append(
      metricCard("Illustrative entry watch zone",fmtUsd(entryLow)+" – "+fmtUsd(entryHigh),"75–80% of a simplified DCF scenario; not an instruction or validated level"),
      metricCard("DCF base-case scenario",fmtUsd(valuation.base),"Illustrative model output only; not a forecast or promised exit price"),
      metricCard("Bear / bull scenarios",fmtUsd(valuation.bear)+" / "+fmtUsd(valuation.bull),"Assumption sensitivity only; not probability-weighted targets"),
      metricCard("Risk reference",invalidation!==null&&invalidation>0?fmtUsd(invalidation):"Unavailable",atr!==null?"Entry midpoint minus 2 × 14-day ATR; not a guaranteed stop":"Complete daily high/low data is needed"),
      metricCard("Model upside / ATR risk",rewardRisk!==null?rewardRisk.toFixed(2)+":1":"Unavailable","Scenario-based ratio; does not estimate probability of success"),
      metricCard("Whole-share size",plannedShares?plannedShares+" share(s)":"0 shares fit the risk rule",plannedShares?fmtUsd(plannedShares*entryMid)+" planned allocation · approx. "+fmtUsd(plannedShares*(entryMid-invalidation))+" planned risk · "+fmtUsd(Math.max(0,500-plannedShares*entryMid))+" cash left":"No whole-share size fits the $5 planned-risk budget"),
      metricCard("Review horizon","Weeks to 6 months","Your stated horizon; reassess after earnings, filings, material news, or major price changes")
    );
  } else if(valuation.available) {
    const gapLabel=!gapCheck.checked?"Not checked":gapCheck.blocked?"Outside review band":gapCheck.ratio.toFixed(2)+"×";
    const gapMeta=gapCheck.checked
      ? "Exact quote / simplified DCF ratio: "+gapCheck.ratio.toFixed(2)+"×. "+(gapCheck.blocked?"This model is not suitable for a valuation conclusion until its inputs and assumptions are reviewed.":"This is only a broad sanity check; it does not validate the DCF.")
      : "A recent timestamped quote is required before this comparison can be made.";
    const withheldReason=gapCheck.blocked
      ? "Valuation withheld: market/model gap is outside the 0.40×–2.50× review band. Check assumptions and source inputs first."
      : "Entry, exit, ATR risk, and position-size levels require a reliable current quote and a passing market/model review.";
    grid.append(
      metricCard("Illustrative DCF base case",fmtUsd(valuation.base),"Raw simplified model output only — not a price target"),
      metricCard("Market / model ratio",gapLabel,gapMeta),
      metricCard("Entry / exit levels","WITHHELD",withheldReason),
      metricCard("Position size","Not calculated","Do not size a trade using a model value that has not passed the review gate")
    );
  } else {
    grid.append(metricCard("Illustrative DCF value","Not available",valuation.reason),metricCard("Entry / exit levels","WITHHELD","No price levels will be guessed without defensible valuation inputs"));
  }
  for(const item of dataChecks) {
    const row=document.createElement("div");row.className="decision-check";
    const detailText=String(item.detail||"").toLowerCase();
    const missing=/missing|unavailable|not confirmed|not finished|incomplete|no timestamped|not available|withheld|not supplied/.test(detailText);
    const status=item.ok?"good":missing?"caution":"bad";
    const indicator=document.createElement("span");indicator.className="decision-indicator "+status;
    indicator.textContent=item.ok?"CHECKED":missing?"REVIEW":"RISK";
    const indicatorDot=document.createElement("i");indicatorDot.className="meaning-dot "+status;
    indicator.append(indicatorDot);
    indicator.title=item.ok?"Positive check":missing?"Needs attention":"Risk check failed";
    const text=document.createElement("div");const title=document.createElement("strong");title.textContent=item.label;const detail=document.createElement("p");detail.textContent=item.detail;detail.className="muted";
    text.append(title,detail);row.append(indicator,text);checks.append(row);
  }
  const caveats=[];
  caveats.push("The model uses USD operating cash flow minus USD capital expenditures, divided by recent SEC-reported instant shares outstanding; it does not use weighted-average shares for this per-share calculation. Share-count source: "+(valuation.sharesSource||"not available")+"; fact date: "+(valuation.sharesFactDate||"not available")+"; filing date: "+(valuation.sharesFiled||"not available")+".");
  caveats.push("DCF input audit: latest matched annual FCF "+(valuation.available?fmtUsd(valuation.latestFcf):"unavailable")+" for period ending "+(valuation.fcfPeriod||"unavailable")+"; share count "+(valuation.available?Math.round(valuation.shares).toLocaleString():"unavailable")+".");
  caveats.push("The DCF is an illustrative five-year equity-cash-flow proxy; base growth is inferred from clipped historical FCF and revenue growth, with fixed scenario discount rates 12%/10%/9% and terminal growth 1.5%/2.5%/3%. These are not company-specific cost-of-equity estimates.");
  caveats.push("The model does not normalize unusual working-capital/capex years or forecast consensus, and it omits detailed stock-based compensation, dilution forecasts and business-specific adjustments; no target is guaranteed.");
  caveats.push("Earnings dates/headlines are third-party data; confirm material items from official investor relations and SEC filings.");
  caveats.push("No stop level guarantees execution. Gaps, fees, slippage and data issues can cause larger losses.");
  $("decision-caveat").textContent=caveats.join(" ");
  latestDecisionContext = {
    ticker, quotePrice:typeof quote?.price==="number"?quote.price:null,
    quoteCurrent, atr, valuationAvailable:valuationDecisionReady, valuationGapBlocked:Boolean(gapCheck.blocked), valuationGapRatio:gapCheck.ratio,
    valuationBase:valuationDecisionReady?valuation.base:null,
    annualFundamentalPass, quarterlyPass, fundamentalAvoid,
    eventVerified:earningsVerified, riskFlags:flaggedHeadlines.length,
    hasRecentNews:recentHeadlines.length>0
  };
  latestResearchSnapshot = {
    ticker, decision:state, quote:typeof quote?.price==="number"?quote.price:null,
    quoteSource:quote?.source||null, quoteTimestamp:quote?.quoteTime||quote?.quoteLabel||null,
    entryLow, entryHigh, valuationBase:valuationDecisionReady?valuation.base:null, illustrativeModelBase:valuation.available?valuation.base:null,
    valuationReady:valuationDecisionReady, valuationGapBlocked:Boolean(gapCheck.blocked), valuationGapRatio:gapCheck.ratio,
    invalidation, rewardRisk, explanation:reasons.join(" "),
    checks:dataChecks.map(check=>({label:check.label,passed:Boolean(check.ok),detail:check.detail})),
    disclaimer:"Research only. BUY setup is provisional and not validated by full point-in-time walk-forward/holdout testing; not a guarantee or automatic trade instruction."
  };
}
function readResearchLog() {
  try {
    const parsed = JSON.parse(localStorage.getItem(RESEARCH_LOG_KEY) || "[]");
    return Array.isArray(parsed) ? parsed : [];
  } catch { return []; }
}
function renderResearchLog() {
  const root = $("research-log-list");
  if (!root) return;
  root.innerHTML = "";
  const records = readResearchLog();
  $("research-log-status").textContent = records.length + " saved snapshot(s)";
  if (!records.length) {
    const empty = document.createElement("p");
    empty.className = "empty";
    empty.textContent = "No research snapshots saved on this device yet.";
    root.append(empty);
    return;
  }
  for (const record of [...records].reverse()) {
    const card = document.createElement("article");
    card.className = "news-item";
    const title = document.createElement("strong");
    title.textContent = record.ticker + " · " + record.decision;
    const detail = document.createElement("p");
    detail.className = "muted";
    detail.textContent = new Date(record.savedAt).toLocaleString() + " · Quote: " +
      (typeof record.quote === "number" ? fmtUsd(record.quote) : "unavailable") +
      " · Entry zone: " + (record.entryLow !== null && record.entryHigh !== null ?
        fmtUsd(record.entryLow) + "–" + fmtUsd(record.entryHigh) : "unavailable");
    const explanation = document.createElement("p");
    explanation.textContent = record.explanation || "No explanation recorded.";
    card.append(title, detail, explanation);
    root.append(card);
  }
}
function csvCell(value) {
  const text= value===null||value===undefined ? "" : typeof value==="object" ? JSON.stringify(value) : String(value);
  return '"' + text.replace(/"/g,'""') + '"';
}
function exportResearchCsv() {
  const records=readResearchLog();
  if(!records.length) { setMessage("No saved snapshots to export yet.", "error"); return; }
  const columns=["savedAt","id","ticker","company","decision","reasonRule","quote","quoteTime","source","valuationBase","valuationReady","valuationGapBlocked","valuationGapRatio","entryLow","entryHigh","invalidation","rewardRisk","explanation","checks","disclaimer"];
  const lines=[columns.map(csvCell).join(",")];
  for(const record of records) lines.push(columns.map(key=>csvCell(record[key])).join(","));
  const blob=new Blob(["\\uFEFF"+lines.join("\\r\\n")],{type:"text/csv;charset=utf-8"});
  const url=URL.createObjectURL(blob);
  const link=document.createElement("a");
  link.href=url; link.download="northstar-research-snapshots.csv"; link.hidden=true;
  document.body.append(link); link.click(); link.remove(); URL.revokeObjectURL(url);
  setMessage("Exported "+records.length+" browser-local research snapshot(s) to CSV. This export does not include server-side records.", "success");
}
function saveResearchSnapshot() {
  if (!latestResearchSnapshot) {
    setMessage("Analyze a company first, then save its research snapshot.", "error");
    return;
  }
  try {
    const records = readResearchLog();
    records.push({...latestResearchSnapshot, savedAt:new Date().toISOString(), id:
      (typeof crypto !== "undefined" && crypto.randomUUID ? crypto.randomUUID() :
        String(Date.now()) + "-" + Math.random().toString(36).slice(2))});
    localStorage.setItem(RESEARCH_LOG_KEY, JSON.stringify(records.slice(-200)));
    renderResearchLog();
    setMessage("Research snapshot saved on this device. It is a record of the report, not a trade or a BUY signal.", "success");
  } catch {
    setMessage("Could not save locally. Check browser storage/privacy settings and try again.", "error");
  }
}
function renderQuote(quote) {
  $("quote-panel").classList.remove("hidden");
  if (typeof quote.price !== "number") {
    $("quote-price").textContent = "Price unavailable";
    $("quote-change").textContent = quote.error || "No reliable quote returned.";
  } else {
    $("quote-price").textContent = new Intl.NumberFormat(undefined, {style:"currency",currency:quote.currency||"USD",maximumFractionDigits:2}).format(quote.price);
    const change = typeof quote.changePercent === "number" ? (quote.changePercent >= 0 ? "+" : "") + quote.changePercent.toFixed(2) + "% vs previous close" : "Change unavailable";
    $("quote-change").textContent = change + " · " + (quote.marketState || "market state unknown");
  }
  $("quote-time").textContent = (quote.quoteTime ? "Quote timestamp: " + new Date(quote.quoteTime).toLocaleString() : quote.quoteLabel ? "Provider quote date: " + quote.quoteLabel + " (time not supplied)" : "Provider timestamp unavailable") + " · Retrieved: " + new Date(quote.fetchedAt || Date.now()).toLocaleTimeString();
  $("quote-source").textContent = (quote.source || "Market data provider") + (quote.warning ? " · " + quote.warning : " · May be delayed");
}
async function loadQuote(ticker) {
  $("quote-panel").classList.remove("hidden");
  $("quote-price").textContent="Loading…";
  try {
    const response=await fetch("/api/quote?ticker="+encodeURIComponent(ticker),{headers:{"Accept":"application/json"}});
    const quote=await response.json();
    if(!response.ok) throw new Error(quote.error||"Quote service unavailable");
    renderQuote(quote);
    return quote;
  } catch(error) {
    renderQuote({error:error.message,price:null,fetchedAt:new Date().toISOString(),source:"Yahoo Finance"});
    return null;
  }
}
function renderFilings(submissions, company) {
  const list = $("filings-list");
  list.innerHTML = "";
  const recent = submissions?.filings?.recent;
  const count = Array.isArray(recent?.form) ? recent.form.length : 0;
  if (!count) {
    $("filings-status").textContent = "Unavailable";
    list.textContent = "Official filing data could not be loaded for this company.";
    return;
  }
  const allowedForms = new Set(["10-K", "10-Q", "8-K", "20-F", "6-K", "40-F"]);
  const entries = [];
  for (let i = 0; i < count && entries.length < 8; i++) {
    const form = recent.form[i];
    const accession = recent.accessionNumber?.[i];
    const document = recent.primaryDocument?.[i];
    const filed = recent.filingDate?.[i];
    if (!allowedForms.has(form) || !accession || !document || !filed) continue;
    const cik = String(company.cik).replace(/^0+/, "");
    const accessionPath = accession.replace(/-/g, "");
    const href = "https://www.sec.gov/Archives/edgar/data/" + cik + "/" + accessionPath + "/" + document;
    entries.push({form, filed, href, items:recent.items?.[i]||"", description: recent.primaryDocDescription?.[i] || document, reportDate: recent.reportDate?.[i] || ""});
  }
  $("filings-status").textContent = entries.length ? entries.length + " filings" : "No recent matches";
  if (!entries.length) {
    list.textContent = "No recent 10-K, 10-Q, 8-K, 20-F, 6-K, or 40-F filings were found in the SEC submissions data.";
    return;
  }
  for (const entry of entries) {
    const card = document.createElement("article");
    card.className = "news-item";
    const link = document.createElement("a");
    link.href = entry.href;
    link.target = "_blank";
    link.rel = "noopener noreferrer";
    const description=String(entry.description||"").trim();
    link.textContent = description.toUpperCase().startsWith(entry.form) ? description : entry.form+" · "+description;
    const meta = document.createElement("p");
    meta.className = "muted";
    meta.textContent = "Filed " + fmtDate(entry.filed) + (entry.reportDate ? " · Reporting period " + fmtDate(entry.reportDate) : "") + " · SEC EDGAR";
    card.append(link, meta);
    list.append(card);
  }
}
function renderNews(payload) {
  const list = $("news-list");
  list.innerHTML = "";
  const items = payload?.items || [];
  $("news-status").textContent = items.length ? items.length + " headlines" : "No headlines";
  if (!items.length) {
    const empty = document.createElement("p");
    empty.className = "empty";
    empty.textContent = "No headlines returned. One or more news feeds may be unavailable.";
    list.append(empty);
    return;
  }
  for (const item of items) {
    const card = document.createElement("article");
    card.className = "news-item";
    const link = document.createElement("a");
    link.href = item.url;
    link.target = "_blank";
    link.rel = "noopener noreferrer";
    link.textContent = item.title;
    const meta = document.createElement("p");
    meta.className = "muted";
    const date = item.publishedAt ? new Date(item.publishedAt) : null;
    meta.textContent = item.source + (date && !Number.isNaN(date.getTime()) ? " · " + date.toLocaleString() : " · Date unavailable");
    card.append(link, meta);
    list.append(card);
  }
}
async function loadNews(ticker) {
  $("news-status").textContent="Loading…";
  try {
    const response=await fetch("/api/news?ticker="+encodeURIComponent(ticker),{headers:{"Accept":"application/json"}});
    if(!response.ok) throw new Error("News feeds unavailable");
    const payload=await response.json();
    renderNews(payload);
    return payload;
  } catch(error) {
    $("news-status").textContent="Unavailable";
    $("news-list").textContent="News could not be loaded right now. Try again later; no news-based conclusion has been made.";
    return null;
  }
}
async function loadEarnings(ticker) {
  $("earnings-status").textContent="Checking…";
  try {
    const response=await fetch("/api/earnings?ticker="+encodeURIComponent(ticker),{headers:{"Accept":"application/json"}});
    const payload=await response.json();
    if(!response.ok) throw new Error(payload.error||"Earnings calendar unavailable");
    renderEarnings(payload);
    return payload;
  } catch(error) {
    const payload={error:"Upcoming earnings could not be verified. "+error.message};
    renderEarnings(payload);
    return null;
  }
}
async function analyze(ticker) {
  ticker=String(ticker||"").trim().toUpperCase().replace(/\s+/g,"");
  if(!/^[A-Z0-9.-]{1,12}$/.test(ticker)) { setMessage("Enter a valid US stock ticker, such as AAPL or MSFT.","error"); return; }
  const button=$("analyze-button"); button.disabled=true; button.textContent="Analyzing…"; startLoading("Analyzing "+ticker,"Step 1 of 5 · Finding the company and official filings.");
  const results=$("stock-results"); results.classList.remove("hidden"); results.dataset.ticker=ticker;
  $("last-request").textContent=new Date().toLocaleString();
  setMessage("Checking SEC filings, prices, earnings risk and recent news for "+ticker+"…");
  $("sec-health").textContent="Request in progress";
  $("recommendation-panel").classList.add("hidden");
  $("earnings-panel").classList.add("hidden");
  try {
    const company=await findCompany(ticker);
    updateLoading("Reading company financials","Step 2 of 5 · Loading reported revenue, earnings, assets and cash flow.");
    const facts=await getJson(SEC_DATA_URL+"/api/xbrl/companyfacts/CIK"+company.cik+".json");
    updateLoading("Checking official filings","Step 3 of 5 · Confirming filing dates and reporting periods.");
    const submissions=await getJson(SEC_DATA_URL+"/submissions/CIK"+company.cik+".json").catch(()=>null);
    const recentForms=submissions?.filings?.recent?.form||[];
    const supportedIndex=recentForms.findIndex(form=>["10-K","10-Q","8-K","20-F","6-K","40-F"].includes(form));
    const usDomesticIndex=recentForms.findIndex(form=>["10-K","10-Q","8-K"].includes(form));
    if(usDomesticIndex<0&&recentForms.some(form=>["20-F","6-K"].includes(form))) throw new Error("UNSUPPORTED FOREIGN FILER: this version supports domestic SEC 10-K/10-Q/8-K workflows only. TSM and other foreign-filer reporting formats are not scored.");
    const observations=getObservations(facts);
    $("company-name").textContent=titleCaseCompanyName(company.name);
    const recentDate=supportedIndex>=0?submissions.filings.recent.filingDate?.[supportedIndex]:null;
    const recentForm=supportedIndex>=0?recentForms[supportedIndex]:null;
    $("company-meta").textContent=ticker+" · CIK "+company.cik+" · "+company.exchange+(recentDate?" · Most recent supported filing "+recentForm+" · "+fmtDate(recentDate):"");
    $("company-panel").classList.remove("hidden");
    updateLoading("Building the stock assessment","Step 4 of 5 · Comparing financial health and available market data.");
    renderMetrics(observations); renderFundamentalSnapshot(observations);
    const quarter=renderQuarterlySnapshot(observations);
    renderFilings(submissions, company);
    $("sec-health").textContent="Connected; received SEC company facts";
    setMessage("SEC facts loaded. Checking price, earnings, news and preliminary valuation…");
    const [quote,history,news,earnings]=await Promise.all([
      loadQuote(ticker),loadHistory(ticker),loadNews(ticker),loadEarnings(ticker),loadStrategyBacktest(ticker)
    ]);
    const reportedQuarter=quarter?.fiscalQuarterId||null;
    const earningsResult=await loadEarningsResult(ticker,reportedQuarter);
    renderEarningsResult(earningsResult,quarter,reportedQuarter);
    renderDecision({ticker,company,observations,facts,quote,history,news,earnings,quarter});
    updateLoading("Finishing your report","Step 5 of 5 · Organizing risks, news and the plain-English verdict.");
    setMessage("Research checks complete for "+company.name+". Read the Bottom line for the decision and next step; model-based levels appear only when input and quote checks pass.","success");
    requestAnimationFrame(()=>results.scrollIntoView({behavior:"smooth",block:"start"}));
  } catch(error) {
    $("sec-health").textContent="Request failed";
    const reason=error instanceof TypeError?"Could not reach the SEC data service. Check your connection and try again.":error.message||"The SEC data request failed.";
    setMessage(reason+" No sample data has been substituted.","error");
    requestAnimationFrame(()=>results.scrollIntoView({behavior:"smooth",block:"start"}));
  } finally { button.disabled=false; button.innerHTML='Analyze company <span aria-hidden="true">↗</span>'; }
}
$("analyze-form").addEventListener("submit",event=>{event.preventDefault();analyze($("ticker").value);});
document.querySelectorAll("[data-ticker]").forEach(button=>button.addEventListener("click",()=>{$("ticker").value=button.dataset.ticker;analyze(button.dataset.ticker);}));
$("run-screen").addEventListener("click",runScreen);
$("suggest-stocks-button").addEventListener("click",()=>{
  $("ranking").scrollIntoView({behavior:"smooth",block:"start"});
  runScreen();
});
$("refresh-quote").addEventListener("click",()=>loadQuote($("ticker").value.trim().toUpperCase()));
$("save-research-snapshot").addEventListener("click",saveResearchSnapshot);
$("export-research-csv").addEventListener("click",exportResearchCsv);
function reviewHolding() {
  const output=$("holding-result"); output.className="holding-result"; output.innerHTML="";
  const shares=Number($("holding-shares").value), cost=Number($("holding-cost").value), ctx=latestDecisionContext;
  const show=(title,detail,cls="")=>{output.className="holding-result "+cls;const h=document.createElement("strong");h.textContent=title;const p=document.createElement("div");p.textContent=detail;output.append(h,p);};
  if(!ctx){show("Analyze a stock first","Load the latest available research before reviewing an existing position.");return;}
  if(!Number.isFinite(shares)||shares<=0||!Number.isFinite(cost)||cost<=0){show("Position details needed","Enter a positive number of shares and your average cost per share.");return;}
  if(!ctx.quoteCurrent||typeof ctx.quotePrice!=="number"){show("INSUFFICIENT EVIDENCE","A reliable current timestamped quote is missing. Do not make a sell/hold decision from a stale or unverified price.");return;}
  const marketValue=shares*ctx.quotePrice, basis=shares*cost, pnl=marketValue-basis, pct=(ctx.quotePrice/cost-1)*100;
  const stats="Estimated market value "+fmtUsd(marketValue)+"; cost basis "+fmtUsd(basis)+"; unrealized "+(pnl>=0?"+":"−")+fmtUsd(Math.abs(pnl))+" ("+(pct>=0?"+":"")+pct.toFixed(2)+"%).";
  const stop=ctx.atr!==null&&Number.isFinite(ctx.atr)?cost-2*ctx.atr:null;
  if(ctx.fundamentalAvoid||ctx.riskFlags>0||(stop!==null&&stop>0&&ctx.quotePrice<=stop)){
    const why=ctx.fundamentalAvoid?"The available annual/quarterly quality screen failed.":ctx.riskFlags>0?"Recent headlines contain potential material-risk keywords that need primary-source verification.":"The quote is at or below the illustrative cost-based 2×ATR risk reference ("+fmtUsd(stop)+").";
    show("SELL REVIEW — INVESTIGATE PROMPTLY",why+" "+stats+" This is a review flag, not an automatic sell order. Confirm the filing/news, your tax situation and whether the original thesis is broken before acting.","review");return;
  }
  if(!ctx.annualFundamentalPass||!ctx.quarterlyPass||!ctx.eventVerified||!ctx.hasRecentNews||!ctx.valuationAvailable){
    show("HOLD — EVIDENCE INCOMPLETE","No sell trigger was confirmed, but important evidence is incomplete or the valuation is not decision-ready. "+(ctx.valuationGapBlocked?"The quote/model gap needs review before using valuation levels. ":"")+stats+" Re-check verified filings, quote and news; do not add shares solely because this review says HOLD.");return;
  }
  if(ctx.valuationAvailable&&ctx.valuationBase&&ctx.quotePrice>=ctx.valuationBase){
    show("HOLD — VALUATION REVIEW","The quote is at or above the simplified base-case valuation reference ("+fmtUsd(ctx.valuationBase)+"). Upside may be limited under this model. "+stats+" The valuation is approximate, so verify assumptions before trimming.","hold");return;
  }
  show("HOLD — NO RULE-BASED EXIT TRIGGER","The available checks did not identify the configured risk-review trigger. "+stats+" This is not a BUY signal and does not mean losses are unlikely; reassess after new filings, earnings, material news or a major price move.","hold");
}
$("review-holding").addEventListener("click",reviewHolding);

renderResearchLog();
$("ui-health").textContent="Loaded";
