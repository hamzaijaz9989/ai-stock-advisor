const $ = (id) => document.getElementById(id);
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
  {label:"Capital expenditures", tags:["PaymentsToAcquirePropertyPlantAndEquipment"], key:"capex"}
];
const cache = new Map();
function setMessage(text, type="") { const el=$("message"); el.textContent=text; el.className="message"+(type?" "+type:""); }
function fmtDate(s) { if(!s) return "Not reported"; const d=new Date(s+"T00:00:00Z"); return Number.isNaN(d.getTime())?s:d.toLocaleDateString(undefined,{year:"numeric",month:"short",day:"numeric",timeZone:"UTC"}); }
function fmtValue(value, unit) {
  if(typeof value!=="number" || !Number.isFinite(value)) return "Not reported";
  if(unit==="USD" || unit==="USD/shares") {
    const abs=Math.abs(value);
    if(abs>=1e12)return (value<0?"−":"")+"$"+(abs/1e12).toFixed(2)+"T";
    if(abs>=1e9)return (value<0?"−":"")+"$"+(abs/1e9).toFixed(2)+"B";
    if(abs>=1e6)return (value<0?"−":"")+"$"+(abs/1e6).toFixed(2)+"M";
    return new Intl.NumberFormat(undefined,{style:"currency",currency:"USD",maximumFractionDigits:0}).format(value);
  }
  return new Intl.NumberFormat(undefined,{maximumFractionDigits:2}).format(value)+(unit?" "+unit:"");
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
  const matches=companyRows(payload).filter(row=>String(row.ticker||row.symbol||"").trim().toUpperCase()===ticker);
  const unique=new Map();
  for(const row of matches) {
    const cik=String(row.cik??row.cik_str??"").replace(/\D/g,"");
    if(cik) unique.set(cik,{cik:cik.padStart(10,"0"),name:String(row.name||row.title||"Unknown company"),ticker,exchange:row.exchange||"Exchange not listed"});
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
    const date=document.createElement("div"); date.className="metric-date"; date.textContent=row?"Filed "+fmtDate(row.filed)+" · Period "+fmtDate(row.end):"No supported observation found";
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
    const label=document.createElement("div"); label.className="metric-label"; label.textContent=item.label;
    const value=document.createElement("div"); value.className="metric-value"; value.textContent=item.value;
    const meta=document.createElement("div"); meta.className="metric-date"; meta.textContent=item.meta;
    card.append(label,value,meta); panel.append(card);
  }
}

function renderTable(observations) {
  const body=$("facts-body"); body.innerHTML="";
  const rows=observations.filter(row=>row.value!==null).slice(0,100);
  $("fact-count").textContent=rows.length+" observations";
  if(!rows.length) { body.innerHTML='<tr><td colspan="4" class="empty">No supported financial observations were returned. Open Data connection details below for diagnostics.</td></tr>'; return; }
  for(const row of rows) {
    const tr=document.createElement("tr");
    const cells=[row.metric+" · "+row.tag,fmtValue(row.value,row.unit),fmtDate(row.end),fmtDate(row.filed)];
    for(const value of cells) { const td=document.createElement("td"); td.textContent=value; tr.append(td); }
    body.append(tr);
  }
}

function renderHistory(history) {
  const panel=$("history-panel");
  panel.classList.remove("hidden");
  $("history-status").textContent=history.observations+" daily observations";
  $("history-meta").textContent=history.startDate+" to "+history.endDate+" · "+history.source+" · Retrieved "+new Date(history.fetchedAt).toLocaleString();
  $("history-warning").textContent=history.warning;
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
  const growth=(latest.value/prior.value-1)*100;
  const margin=matchedIncome.value/latest.value*100;
  const fcf=matchedCash.value-Math.abs(matchedCapex.value);
  const fcfMargin=fcf/latest.value*100;
  const components=[
    {name:"Revenue growth",value:growth,display:growth.toFixed(1)+"%",score:scoreRange(growth,-10,30,25),max:25},
    {name:"Net profit margin",value:margin,display:margin.toFixed(1)+"%",score:scoreRange(margin,-5,20,15),max:15},
    {name:"Approx. FCF margin",value:fcfMargin,display:fcfMargin.toFixed(1)+"%",score:scoreRange(fcfMargin,-10,20,20),max:20},
    {name:"1-year price return",value:history.totalReturnPercent,display:(history.totalReturnPercent>=0?"+":"")+history.totalReturnPercent.toFixed(1)+"%",score:scoreRange(history.totalReturnPercent,-20,30,20),max:20},
    {name:"Maximum drawdown",value:history.maxDrawdownPercent,display:history.maxDrawdownPercent.toFixed(1)+"%",score:scoreRange(history.maxDrawdownPercent,-50,-10,20),max:20}
  ];
  return {ticker,name:company.name,cik:company.cik,score:components.reduce((sum,item)=>sum+item.score,0),components,financialPeriod:latest.end,historyPeriod:history.startDate+" to "+history.endDate,source:history.source};
}
function renderScreenResults(results,errors) {
  const root=$("screen-results"); root.innerHTML="";
  const ranked=results.sort((a,b)=>b.score-a.score);
  if(!ranked.length) {
    const p=document.createElement("p"); p.className="empty"; p.textContent="No companies met the minimum data requirements. "+errors.join(" · "); root.append(p); return;
  }
  for(let i=0;i<ranked.length;i++) {
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
    const note=document.createElement("p"); note.className="table-note"; note.textContent="Research-priority score only. Does not include valuation, forward estimates, news/event risk, or validated predictive power."; card.append(note);
    root.append(card);
  }
  if(errors.length) {
    const p=document.createElement("p"); p.className="table-note"; p.textContent="Excluded candidates: "+errors.join(" · "); root.append(p);
  }
}
async function runScreen() {
  const button=$("run-screen"); button.disabled=true; button.textContent="Screening…";
  $("screen-status").textContent="Fetching SEC filings and daily prices";
  const results=[],errors=[];
  for(const ticker of ["AAPL","MSFT","NVDA","AMZN"]) {
    try { results.push(await scoreTicker(ticker)); }
    catch(error) { errors.push(ticker+": "+(error.message||"Insufficient data")); }
  }
  renderScreenResults(results,errors);
  $("screen-status").textContent=results.length+" ranked · "+errors.length+" excluded";
  button.disabled=false; button.textContent="Refresh ranking";
}

function fmtUsd(value) {
  if (typeof value !== "number" || !Number.isFinite(value)) return "Unavailable";
  return new Intl.NumberFormat("en-US", {style:"currency",currency:"USD",maximumFractionDigits:2}).format(value);
}
function latestSecValue(facts, candidates, unit, maxAgeDays=180) {
  const rows=[];
  const today=new Date().toISOString().slice(0,10);
  for (const candidate of candidates) {
    const fact=facts?.facts?.[candidate.taxonomy]?.[candidate.tag];
    const values=fact?.units?.[unit];
    if (!Array.isArray(values)) continue;
    for (const row of values) {
      if (typeof row.val!=="number" || !Number.isFinite(row.val) || !row.end || !row.filed) continue;
      if (row.filed>today || !["10-K","10-Q","20-F","40-F","6-K"].includes(row.form)) continue;
      const ageDays=(Date.parse(today+"T00:00:00Z")-Date.parse(row.filed+"T00:00:00Z"))/86400000;
      if (ageDays<0 || ageDays>maxAgeDays) continue;
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
function buildDcfEstimate(observations, facts) {
  const cash=annualSeries(observations,"operatingCashFlow");
  const capex=annualSeries(observations,"capex");
  const revenue=annualSeries(observations,"revenue");
  const flows=[];
  for (const row of cash) {
    const cap=capex.find(item=>item.end===row.end);
    if (cap) flows.push({end:row.end,value:row.value-Math.abs(cap.value)});
  }
  flows.sort((a,b)=>a.end.localeCompare(b.end));
  if (flows.length<3) return {available:false,reason:"Fewer than three unambiguous annual free-cash-flow observations."};
  const last3=flows.slice(-3);
  if (last3.some(row=>!Number.isFinite(row.value)||row.value<=0)) return {available:false,reason:"Recent annual free cash flow is not positive in three comparable periods."};
  const shares=latestSecValue(facts,[
    {taxonomy:"dei",tag:"EntityCommonStockSharesOutstanding"},
    {taxonomy:"us-gaap",tag:"EntityCommonStockSharesOutstanding"}
  ],"shares",180);
  if (!shares || shares.value<=0) return {available:false,reason:"A recent, unambiguous SEC shares-outstanding fact was not found."};
  const latestRevenue=revenue[revenue.length-1], previousRevenue=revenue[revenue.length-2];
  if (!latestRevenue || !previousRevenue || previousRevenue.value<=0) return {available:false,reason:"Comparable annual revenue growth is unavailable."};
  const fcfGrowth1=last3[2].value/last3[1].value-1;
  const fcfGrowth2=last3[1].value/last3[0].value-1;
  const revenueGrowth=latestRevenue.value/previousRevenue.value-1;
  const clamp=(n,min,max)=>Math.max(min,Math.min(max,n));
  const baseGrowth=clamp((clamp((fcfGrowth1+fcfGrowth2)/2,-0.20,0.25)+clamp(revenueGrowth,-0.20,0.25))/2,-0.05,0.15);
  function perShare(fcf,growth,discount,terminal) {
    if (!(fcf>0&&shares.value>0&&discount>terminal&&terminal>=0)) return null;
    let cashFlow=fcf,pv=0;
    for(let year=1;year<=5;year++) { cashFlow*=1+growth; pv+=cashFlow/Math.pow(1+discount,year); }
    const terminalValue=cashFlow*(1+terminal)/(discount-terminal);
    const value=(pv+terminalValue/Math.pow(1+discount,5))/shares.value;
    return Number.isFinite(value)&&value>0?value:null;
  }
  const latestFcf=last3[2];
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
    shares:shares.value,sharesFiled:shares.filed,baseGrowth,fcfGrowth1,fcfGrowth2,revenueGrowth,
    assumptions:"Five-year simplified equity-cash-flow proxy; bear/base/bull growth "+(bearGrowth*100).toFixed(1)+"/"+(baseGrowth*100).toFixed(1)+"/"+(bullGrowth*100).toFixed(1)+"%; discount rates 12/10/9%; terminal growth 1.5/2.5/3.0%."
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
  $("earnings-status").textContent=events.length?"Event found":"Date unconfirmed";
  if(events.length) {
    for(const event of events) {
      const item=document.createElement("article"); item.className="news-item";
      const heading=document.createElement("strong"); heading.textContent=event.company+" · "+(event.fiscalQuarterEnding||event.fiscalQuarter||"Earnings");
      const detail=document.createElement("p"); detail.className="muted";
      const estimate=typeof event.consensusEps==="number"?" · Consensus EPS "+fmtUsd(event.consensusEps):"";
      detail.textContent=fmtDate(event.reportDate)+" · "+(event.reportTime==="BMO"?"Before market open":event.reportTime==="AMC"?"After market close":"Time not confirmed")+estimate;
      const link=document.createElement("a"); link.href=event.sourceUrl; link.target="_blank"; link.rel="noopener noreferrer"; link.textContent="Open calendar entry";
      item.append(heading,detail,link); root.append(item);
    }
  } else {
    const p=document.createElement("p"); p.className="empty"; p.textContent="No matching upcoming event was found in the provider's returned calendar window; this does not prove that no earnings report is scheduled."; root.append(p);
  }
  const note=document.createElement("p"); note.className="table-note"; note.textContent=(payload.warning||"")+" Source: EarningsNxt public calendar · Retrieved "+new Date(payload.fetchedAt||Date.now()).toLocaleString()+". Confirm dates with official investor relations.";
  root.append(note);
}
function renderDecision({ticker,observations,facts,quote,history,news,earnings}) {
  const panel=$("recommendation-panel"); panel.classList.remove("hidden");
  const grid=$("decision-metrics"),checks=$("decision-checks");
  grid.innerHTML=""; checks.innerHTML="";
  const valuation=buildDcfEstimate(observations,facts);
  const atr=averageTrueRange(history);
  const quoteDate=quote?.quoteTime?new Date(quote.quoteTime):(quote?.quoteLabel?new Date(String(quote.quoteLabel).replace(/\s+ET$/,"")):null);
  const quoteAgeHours=quoteDate&&!Number.isNaN(quoteDate.getTime())?(Date.now()-quoteDate.getTime())/3600000:Infinity;
  const quoteCurrent=typeof quote?.price==="number"&&quote.price>0&&quoteAgeHours>=-2&&quoteAgeHours<=96;
  const today=new Date().toISOString().slice(0,10);
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
  const fundamentalPass=Boolean(latestRevenue&&priorRevenue&&priorRevenue.value>0&&latestRevenue.value>0&&latestIncome&&latestIncome.value>0&&latestFcf&&latestFcf.value>0&&(latestRevenue.value/priorRevenue.value-1)>=-0.10);
  const entryLow=valuation.available?valuation.base*0.75:null;
  const entryHigh=valuation.available?valuation.base*0.80:null;
  const entryMid=entryLow!==null?(entryLow+entryHigh)/2:null;
  const invalidation=entryMid!==null&&atr!==null?entryMid-2*atr:null;
  const rewardRisk=entryMid!==null&&invalidation!==null&&entryMid>invalidation&&valuation.base>entryMid?(valuation.base-entryMid)/(entryMid-invalidation):null;
  const priceInEntryRange=quoteCurrent&&entryLow!==null&&quote.price>=entryLow&&quote.price<=entryHigh;
  const plannedShares=entryMid!==null&&invalidation!==null&&invalidation>0&&entryMid>invalidation?Math.min(Math.floor(5/(entryMid-invalidation)),Math.floor(500/entryMid)):0;
  const dataChecks=[
    {label:"Current price",ok:quoteCurrent,detail:quoteCurrent?"Quote timestamp "+quoteDate.toLocaleString():"Quote unavailable or older than 96 hours"},
    {label:"Valuation inputs",ok:valuation.available,detail:valuation.available?"Three unambiguous annual free-cash-flow periods and recent SEC share count found":valuation.reason},
    {label:"Fundamentals",ok:fundamentalPass,detail:fundamentalPass?"Latest annual revenue, net income and approximate FCF are positive; revenue has not dropped more than 10% year over year":"Basic quality filter did not pass or comparable data is missing"},
    {label:"Earnings/event risk",ok:earningsVerified,detail:earningsVerified?(daysToEarnings<=7?"Earnings in "+Math.max(0,Math.round(daysToEarnings))+" day(s) — avoid new entry before this event":"Next Nasdaq-listed earnings date "+fmtDate(nextEvent.reportDate)):"Next earnings date not confirmed by this provider"},
    {label:"Recent news",ok:recentHeadlines.length>0&&!flaggedHeadlines.length,detail:recentHeadlines.length?(flaggedHeadlines.length?flaggedHeadlines.length+" recent headline(s) contain risk keywords and need source review":recentHeadlines.length+" timestamped headline(s) from the last 7 days"):"No timestamped headlines in the last 7 days"},
    {label:"Price risk level",ok:invalidation!==null&&invalidation>0,detail:invalidation!==null&&invalidation>0?"Based on 14-day average true range: "+fmtUsd(invalidation):"ATR risk level unavailable from complete daily high/low data"},
    {label:"Historical validation",ok:false,detail:"Walk-forward and untouched holdout backtests are not complete; this blocks BUY signals"}
  ];
  let state="WAIT";
  if(!quoteCurrent||!valuation.available||!fundamentalPass||!earningsVerified||!recentHeadlines.length||flaggedHeadlines.length||!atr||!rewardRisk) state="INSUFFICIENT EVIDENCE";
  else if(daysToEarnings<=7||!priceInEntryRange||rewardRisk<2) state="WAIT";
  $("decision-status").textContent=state+" · RESEARCH ONLY";
  $("decision-title").textContent=state==="INSUFFICIENT EVIDENCE"?"INSUFFICIENT EVIDENCE — DO NOT BUY FROM THIS REPORT":"WAIT — NO BUY SIGNAL IS ENABLED";
  const reasons=[];
  if(!quoteCurrent) reasons.push("A sufficiently recent quote is missing.");
  if(!valuation.available) reasons.push(valuation.reason);
  if(!fundamentalPass) reasons.push("The basic financial-quality screen did not pass.");
  if(!earningsVerified) reasons.push("The next earnings date is not reliably confirmed.");
  if(daysToEarnings!==null&&daysToEarnings<=7) reasons.push("An earnings report is due within 7 days, so event risk is high.");
  if(!recentHeadlines.length) reasons.push("Recent timestamped news coverage is missing.");
  if(flaggedHeadlines.length) reasons.push("Recent headlines contain potential risk keywords and need checking against original sources.");
  if(valuation.available&&!priceInEntryRange) reasons.push(quoteCurrent?(quote.price>entryHigh?"The quote is above the provisional entry zone; do not chase.":"The quote is below the provisional zone; a sharp drop needs review."):"Current price cannot be compared with the model range.");
  if(rewardRisk!==null&&rewardRisk<2) reasons.push("The provisional reward-to-risk ratio is below 2:1.");
  reasons.push("The model has not passed walk-forward and out-of-sample validation; this version cannot issue a BUY.");
  $("decision-explanation").textContent=reasons.join(" ");
  if(valuation.available) {
    grid.append(
      metricCard("Provisional entry zone",fmtUsd(entryLow)+" – "+fmtUsd(entryHigh),"75–80% of base-case DCF value; watch levels only, not actionable"),
      metricCard("Base-case value",fmtUsd(valuation.base),"Simplified five-year cash-flow estimate; not a six-month price forecast"),
      metricCard("Bear / bull value",fmtUsd(valuation.bear)+" / "+fmtUsd(valuation.bull),"Scenario sensitivity, not a prediction"),
      metricCard("Risk trigger",invalidation!==null&&invalidation>0?fmtUsd(invalidation):"Unavailable",atr!==null?"Entry midpoint minus 2 × 14-day ATR":"Complete daily high/low data is needed"),
      metricCard("Upside / downside",rewardRisk!==null?rewardRisk.toFixed(2)+":1":"Unavailable","Uses base-case DCF value and ATR risk trigger"),
      metricCard("Whole-share size",plannedShares?plannedShares+" share(s)":"0 shares fit the risk rule",plannedShares?fmtUsd(plannedShares*entryMid)+" planned allocation · approx. "+fmtUsd(plannedShares*(entryMid-invalidation))+" risk":"No whole-share size fits the $5 planned-risk budget")
    );
  } else {
    grid.append(metricCard("Entry price","Not available",valuation.reason),metricCard("Exit / target","Not available","A price level will not be guessed without defensible valuation inputs"));
  }
  for(const item of dataChecks) {
    const row=document.createElement("div");row.className="decision-check";
    const indicator=document.createElement("span");indicator.className="decision-indicator "+(item.ok?"pass":"hold");indicator.textContent=item.ok?"CHECKED":"REVIEW";
    const text=document.createElement("div");const title=document.createElement("strong");title.textContent=item.label;const detail=document.createElement("p");detail.textContent=item.detail;detail.className="muted";
    text.append(title,detail);row.append(indicator,text);checks.append(row);
  }
  const caveats=[];
  caveats.push("The DCF is a simplified cash-flow-per-share proxy using five-year constant-growth scenarios and fixed 12%/10%/9% discount rates with 1.5%/2.5%/3% terminal growth.");
  caveats.push("It omits forecast consensus, debt/cash normalization, share-based compensation and business-specific adjustments; no target is guaranteed.");
  caveats.push("Earnings dates/headlines are third-party data; confirm material items from official investor relations and SEC filings.");
  caveats.push("No stop level guarantees execution. Gaps, fees, slippage and data issues can cause larger losses.");
  $("decision-caveat").textContent=caveats.join(" ");
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
  $("quote-time").textContent = "Quote time: " + (quote.quoteTime ? new Date(quote.quoteTime).toLocaleString() : (quote.quoteLabel || "provider timestamp unavailable")) + " · Retrieved: " + new Date(quote.fetchedAt || Date.now()).toLocaleTimeString();
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
    entries.push({form, filed, href, description: recent.primaryDocDescription?.[i] || document, reportDate: recent.reportDate?.[i] || ""});
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
    link.textContent = entry.form + " · " + entry.description;
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
  ticker=ticker.trim().toUpperCase();
  if(!/^[A-Z0-9.-]{1,12}$/.test(ticker)) { setMessage("Enter a valid US stock ticker, such as AAPL or MSFT.","error"); return; }
  const button=$("analyze-button"); button.disabled=true; button.textContent="Loading analysis…";
  $("last-request").textContent=new Date().toLocaleString();
  setMessage("Checking SEC filings, prices, earnings risk and recent news for "+ticker+"…");
  $("sec-health").textContent="Request in progress";
  $("recommendation-panel").classList.add("hidden");
  $("earnings-panel").classList.add("hidden");
  try {
    const company=await findCompany(ticker);
    const facts=await getJson(SEC_DATA_URL+"/api/xbrl/companyfacts/CIK"+company.cik+".json");
    const submissions=await getJson(SEC_DATA_URL+"/submissions/CIK"+company.cik+".json").catch(()=>null);
    const observations=getObservations(facts);
    $("company-name").textContent=company.name;
    $("company-meta").textContent=ticker+" · CIK "+company.cik+" · "+company.exchange+(submissions?.filings?.recent?.filingDate?.[0]?" · Most recent filing "+fmtDate(submissions.filings.recent.filingDate[0]):"");
    $("company-panel").classList.remove("hidden");
    renderMetrics(observations); renderFundamentalSnapshot(observations); renderTable(observations);
    renderFilings(submissions, company);
    $("sec-health").textContent="Connected; received SEC company facts";
    setMessage("SEC facts loaded. Checking price, earnings, news and preliminary valuation…");
    const [quote,history,news,earnings]=await Promise.all([
      loadQuote(ticker),loadHistory(ticker),loadNews(ticker),loadEarnings(ticker)
    ]);
    renderDecision({ticker,company,observations,facts,quote,history,news,earnings});
    setMessage("Research checks completed for "+company.name+". The advisor will not issue a BUY while its model remains unvalidated.","success");
  } catch(error) {
    $("sec-health").textContent="Request failed";
    const reason=error instanceof TypeError?"Could not reach the SEC data service. Check your connection and try again.":error.message||"The SEC data request failed.";
    setMessage(reason+" No sample data has been substituted.","error");
  } finally { button.disabled=false; button.innerHTML='Analyze company <span aria-hidden="true">↗</span>'; }
}
$("analyze-form").addEventListener("submit",event=>{event.preventDefault();analyze($("ticker").value);});
document.querySelectorAll("[data-ticker]").forEach(button=>button.addEventListener("click",()=>{$("ticker").value=button.dataset.ticker;analyze(button.dataset.ticker);}));
$("run-screen").addEventListener("click",runScreen);
$("refresh-quote").addEventListener("click",()=>loadQuote($("ticker").value.trim().toUpperCase()));
$("ui-health").textContent="Loaded";
