const $ = (id) => document.getElementById(id);
let latestResearchSnapshot = null;
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
function newYorkDateOnly(date=new Date()) {
  const parts=new Intl.DateTimeFormat("en-CA",{timeZone:"America/New_York",year:"numeric",month:"2-digit",day:"2-digit"}).formatToParts(date);
  const values=Object.fromEntries(parts.map(part=>[part.type,part.value]));
  return values.year+"-"+values.month+"-"+values.day;
}
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
    const label=document.createElement("div"); label.className="metric-label"; label.textContent=item.label;
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
  panel.append(metricCard("Latest quarterly revenue",fmtValue(latestRevenue.value,latestRevenue.unit),
    revenueYoY!==null?"Year over year "+(revenueYoY>=0?"+":"")+(revenueYoY*100).toFixed(1)+"% · prior quarter end "+fmtDate(priorRevenue.end):"Same-quarter prior-year comparison unavailable"));
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
  intro.textContent="The list below ranks up to 10 research candidates from the 60-stock starter universe. It is NOT a list of validated BUY signals. Price levels are shown only when required inputs are available; all valuation levels are model scenarios, not reliable forecasts.";
  root.append(intro);
  if(!ranked.length) {
    const p=document.createElement("p"); p.className="empty"; p.textContent="No companies met the minimum data requirements. "+errors.join(" · "); root.append(p); return;
  }
  for(let i=0;i<Math.min(10,ranked.length);i++) {
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
    const planTitle=document.createElement("strong"); planTitle.textContent="Entry / exit assessment";
    const planStatus=document.createElement("p"); planStatus.className="muted"; planStatus.textContent="Checking latest quote and valuation inputs…";
    plan.append(planTitle,planStatus); card.append(plan);
    const analyzeButton=document.createElement("button"); analyzeButton.type="button"; analyzeButton.className="secondary-button"; analyzeButton.textContent="Open full analysis";
    analyzeButton.addEventListener("click",()=>{ $("ticker").value=item.ticker; analyze(item.ticker); window.scrollTo({top:0,behavior:"smooth"}); });
    card.append(analyzeButton);
    const note=document.createElement("p"); note.className="table-note"; note.textContent="Research priority only. This score excludes news/event risk and is not a validated predictive model. Do not treat these candidates as buy recommendations."; card.append(note);
    root.append(card);
  }
  if(ranked.length>10) {
    const p=document.createElement("p"); p.className="table-note"; p.textContent=(ranked.length-10)+" additional qualified stocks are omitted from the Top 10 display but remain in the downloadable audit CSV."; root.append(p);
  }
  if(errors.length) {
    const p=document.createElement("p"); p.className="table-note"; p.textContent="Excluded candidates: "+errors.join(" · "); root.append(p);
  }
}
async function enrichTopCandidates(results) {
  const candidates=[...results].sort((a,b)=>b.score-a.score).slice(0,10);
  await Promise.all(candidates.map(async item=>{
    const root=document.querySelectorAll(".candidate-plan");
    const plan=[...root].find(node=>node.dataset.ticker===item.ticker);
    if(!plan) return;
    const status=plan.querySelector("p");
    try {
      const [quoteResponse]=await Promise.all([
        fetch("/api/quote?ticker="+encodeURIComponent(item.ticker),{headers:{"Accept":"application/json"}})
      ]);
      const quote=await quoteResponse.json();
      const valuation=buildDcfEstimate(item.observations,item.facts);
      const atr=averageTrueRange(item.history);
      const quoteDate=quote?.quoteTime?new Date(quote.quoteTime):null;
      const quoteAge=quoteDate&&!Number.isNaN(quoteDate.getTime())?(Date.now()-quoteDate.getTime())/3600000:Infinity;
      const current=typeof quote?.price==="number"&&quote.price>0&&quoteAge>=-2&&quoteAge<=48&&
        String(quote?.interval||"").toLowerCase()!=="1d"&&!String(quote?.delayedOrRealtime||"").toLowerCase().includes("daily interval");
      if(!current) {
        status.textContent="No verified recent quote with a usable timestamp. Entry, target and risk levels withheld. Quote source: "+(quote?.source||"unknown")+".";
        return;
      }
      if(!valuation.available||!atr||!Number.isFinite(atr)||atr<=0) {
        status.textContent="Price: "+fmtUsd(quote.price)+". Model entry/exit levels withheld: "+(!valuation.available?valuation.reason:"historical ATR is unavailable")+".";
        return;
      }
      const entryLow=valuation.base*0.75,entryHigh=valuation.base*0.80,entryMid=(entryLow+entryHigh)/2;
      const invalidation=entryMid-2*atr;
      const target=valuation.base;
      const upside=(target/quote.price-1)*100;
      const source=quote.source||"market data provider";
      const lines=[
        "Latest provider price: "+fmtUsd(quote.price)+" ("+source+(quote.quoteTime?"; timestamp "+new Date(quote.quoteTime).toLocaleString():quote.quoteLabel?"; date "+quote.quoteLabel+"; exact time unavailable":"; timestamp unavailable")+")",
        "Model entry watch zone: "+fmtUsd(entryLow)+"–"+fmtUsd(entryHigh)+" (75–80% of base-case DCF; scenario only)",
        "Model exit / fair-value reference: "+fmtUsd(target)+" (not a promised target or a forecast)",
        "Risk reference: "+(invalidation>0?fmtUsd(invalidation):"unavailable")+" (entry midpoint minus 2×ATR; not a guaranteed stop)",
        "Price-to-model reference: "+(Number.isFinite(upside)?(upside>=0?"+":"")+upside.toFixed(1)+"%":"unavailable")+"; research horizon: review over 1–6 months, not a prediction of when price will reach target."
      ];
      status.textContent=lines.join(" ");
    } catch(error) {
      status.textContent="Could not verify entry/exit inputs: "+(error?.message||"data provider error")+". No levels shown.";
    }
  }));
}
async function runScreen() {
  const button=$("run-screen"); button.disabled=true; button.textContent="Screening…";
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
    button.disabled=false; button.textContent="Refresh 60-stock ranking";
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
  const daysBetween=(left,right)=>(Date.parse(right+"T00:00:00Z")-Date.parse(left+"T00:00:00Z"))/86400000;
  if (last3.some((row,index)=>index>0&&(daysBetween(last3[index-1].end,row.end)<300||daysBetween(last3[index-1].end,row.end)>430))) {
    return {available:false,reason:"Recent free-cash-flow observations are not spaced like consecutive annual periods."};
  }
  const latestFcf=last3[2];
  const latestRevenueForFcf=revenue[revenue.length-1];
  const previousRevenueForFcf=revenue[revenue.length-2];
  if (!latestRevenueForFcf || !previousRevenueForFcf || latestRevenueForFcf.end!==latestFcf.end ||
      previousRevenueForFcf.end!==last3[1].end) {
    return {available:false,reason:"Annual revenue and free-cash-flow periods do not match exactly; valuation is withheld."};
  }
  const currentInstantShares=latestSecValue(facts,[
    {taxonomy:"dei",tag:"EntityCommonStockSharesOutstanding"},
    {taxonomy:"us-gaap",tag:"EntityCommonStockSharesOutstanding"}
  ],"shares",180);
  // Per-share valuation needs a recent point-in-time shares-outstanding count.
  // Annual diluted weighted-average shares are a period average and can materially
  // misstate per-share value after buybacks, issuance, or stock-based compensation.
  const shares=currentInstantShares&&currentInstantShares.value>0
    ? {value:currentInstantShares.value,end:currentInstantShares.end,filed:currentInstantShares.filed,source:"Recent SEC-reported shares outstanding"}
    : null;
  if (!shares || shares.value<=0) return {available:false,reason:"No unambiguous SEC shares-outstanding fact filed within the last 180 days; per-share valuation is withheld."};
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
    shares:shares.value,sharesFiled:shares.filed,sharesSource:shares.source,baseGrowth,fcfGrowth1,fcfGrowth2,revenueGrowth,
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
  root.append(metricCard("SEC diluted EPS",typeof quarter.currentEps==="number"?fmtUsd(quarter.currentEps):"Unavailable","Diluted EPS fact from SEC companyfacts; may differ from adjusted consensus EPS"));
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
    epsVariance===null?"Actual diluted EPS or third-party estimate unavailable":"Arithmetic comparison only; definitions may differ"));
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
  const panel=$("recommendation-panel"); panel.classList.remove("hidden");
  const grid=$("decision-metrics"),checks=$("decision-checks");
  grid.innerHTML=""; checks.innerHTML="";
  const valuation=buildDcfEstimate(observations,facts);
  const atr=averageTrueRange(history);
  const quoteDate=quote?.quoteTime?new Date(quote.quoteTime):(quote?.quoteLabel?new Date(String(quote.quoteLabel).replace(/\s+ET$/,"")):null);
  const quoteAgeHours=quoteDate&&!Number.isNaN(quoteDate.getTime())?(Date.now()-quoteDate.getTime())/3600000:Infinity;
  const quoteInterval=String(quote?.interval||"").toLowerCase();
  const quoteReliabilityLabel=String(quote?.delayedOrRealtime||"").toLowerCase();
  const dailySnapshot=quoteInterval==="1d"||quoteReliabilityLabel.includes("daily interval")||
    quoteReliabilityLabel.includes("not real-time");
  const quoteCurrent=typeof quote?.price==="number"&&quote.price>0&&
    quoteAgeHours>=-2&&quoteAgeHours<=48&&!dailySnapshot;
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
  const entryLow=valuation.available?valuation.base*0.75:null;
  const entryHigh=valuation.available?valuation.base*0.80:null;
  const entryMid=entryLow!==null?(entryLow+entryHigh)/2:null;
  const invalidation=entryMid!==null&&atr!==null?entryMid-2*atr:null;
  const rewardRisk=entryMid!==null&&invalidation!==null&&entryMid>invalidation&&valuation.base>entryMid?(valuation.base-entryMid)/(entryMid-invalidation):null;
  const priceInEntryRange=quoteCurrent&&entryLow!==null&&quote.price>=entryLow&&quote.price<=entryHigh;
  const plannedShares=entryMid!==null&&invalidation!==null&&invalidation>0&&entryMid>invalidation?Math.min(Math.floor(5/(entryMid-invalidation)),Math.floor(500/entryMid)):0;
  const dataChecks=[
    {label:"Current price",ok:quoteCurrent,detail:quoteCurrent?(quote?.quoteTime?"Provider quote timestamp "+quoteDate.toLocaleString():quote?.quoteLabel?"Provider quote date "+quote.quoteLabel+"; exact trade time was not supplied":"Provider date/time "+quoteDate.toLocaleString()):(dailySnapshot?"Provider returned a daily-bar snapshot, not a current quote":"Quote unavailable, missing a usable date/time, or older than 48 hours")},
    {label:"Valuation inputs",ok:valuation.available,detail:valuation.available?"Three unambiguous annual free-cash-flow periods and recent SEC share count found":valuation.reason},
    {label:"Annual fundamentals",ok:annualFundamentalPass,detail:annualFundamentalPass?"Latest annual revenue, net income and approximate FCF are positive; annual revenue has not dropped more than 10% year over year":"Annual quality filter failed or comparable data is missing"},
    {label:"Latest quarterly trend",ok:quarterlyPass,detail:quarterlyPass?"Quarterly revenue/net income are positive and revenue is no worse than -15% year over year":"Latest quarterly net income, same-quarter revenue comparison, or quality threshold did not pass"},
    {label:"Earnings/event risk",ok:earningsVerified,detail:earningsVerified?(daysToEarnings<=7?"Earnings in "+Math.max(0,Math.round(daysToEarnings))+" day(s) — avoid new entry before this event":"Next "+(earnings?.provider||"provider-listed")+" date "+fmtDate(nextEvent.reportDate)):"Next earnings date not confirmed by this provider"},
    {label:"Recent news",ok:recentHeadlines.length>0&&!flaggedHeadlines.length,detail:recentHeadlines.length?(flaggedHeadlines.length?flaggedHeadlines.length+" recent headline(s) contain risk keywords and need source review":recentHeadlines.length+" timestamped headline(s) from the last 7 days"):"No timestamped headlines in the last 7 days"},
    {label:"Price risk level",ok:invalidation!==null&&invalidation>0,detail:invalidation!==null&&invalidation>0?"Based on 14-day average true range: "+fmtUsd(invalidation):"ATR risk level unavailable from complete daily high/low data"},
    {label:"Historical validation",ok:false,detail:"Walk-forward and untouched holdout backtests are not complete; this blocks BUY signals"}
  ];
  let state="WAIT";
  if(fundamentalAvoid) state="AVOID";
  else if(!quoteCurrent||!valuation.available||!fundamentalPass||!earningsVerified||!recentHeadlines.length||flaggedHeadlines.length||!atr||!rewardRisk) state="INSUFFICIENT EVIDENCE";
  else if(daysToEarnings<=7||!priceInEntryRange||rewardRisk<2) state="WAIT";
  $("decision-status").textContent=state+" · RESEARCH ONLY";
  $("decision-title").textContent=state==="AVOID"?"AVOID — FINANCIAL QUALITY CHECK FAILED":
    state==="INSUFFICIENT EVIDENCE"?"INSUFFICIENT EVIDENCE — DO NOT BUY FROM THIS REPORT":
    "WAIT — NO BUY SIGNAL IS ENABLED";
  const reasons=[];
  if(!quoteCurrent) reasons.push(dailySnapshot?"The available price is a daily-bar snapshot, not a verified current quote.":"A sufficiently recent timestamped quote is missing.");
  if(!valuation.available) reasons.push(valuation.reason);
  if(!annualDataAvailable) reasons.push("Comparable annual financial data is incomplete or ambiguous.");
  else if(!annualFundamentalPass) reasons.push("The annual quality screen failed: revenue, net income, free cash flow, or annual revenue trend is below the configured minimum.");
  if(!quarterlyDataAvailable) reasons.push("The latest quarterly data is incomplete or cannot be matched safely to the previous year.");
  else if(!quarterlyPass) reasons.push("The latest quarter failed the minimum quality screen: revenue/net income must be positive and revenue must be no worse than -15% year over year.");
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
      metricCard("Potential exit / fair-value reference",fmtUsd(valuation.base),"Base-case valuation reference; may take longer than six months and is not a forecast"),
      metricCard("Bear / bull value",fmtUsd(valuation.bear)+" / "+fmtUsd(valuation.bull),"Scenario sensitivity, not a prediction"),
      metricCard("Risk trigger",invalidation!==null&&invalidation>0?fmtUsd(invalidation):"Unavailable",atr!==null?"Entry midpoint minus 2 × 14-day ATR":"Complete daily high/low data is needed"),
      metricCard("Upside / downside",rewardRisk!==null?rewardRisk.toFixed(2)+":1":"Unavailable","Uses base-case DCF value and ATR risk trigger"),
      metricCard("Whole-share size",plannedShares?plannedShares+" share(s)":"0 shares fit the risk rule",plannedShares?fmtUsd(plannedShares*entryMid)+" planned allocation · approx. "+fmtUsd(plannedShares*(entryMid-invalidation))+" planned risk · "+fmtUsd(Math.max(0,500-plannedShares*entryMid))+" cash left":"No whole-share size fits the $5 planned-risk budget"),
      metricCard("Holding period","Weeks to 6 months","Your stated horizon; review the thesis after earnings and whenever fundamentals, valuation, or risk conditions change")
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
  caveats.push("The DCF uses matched-period annual diluted weighted-average shares when reported; otherwise it requires recent instant shares outstanding. Share count source: "+(valuation.sharesSource||"not available")+"; filing date: "+(valuation.sharesFiled||"not available")+".");
  caveats.push("The DCF is a simplified cash-flow-per-share proxy using five-year constant-growth scenarios and fixed 12%/10%/9% discount rates with 1.5%/2.5%/3% terminal growth.");
  caveats.push("It omits forecast consensus, debt/cash normalization, share-based compensation and business-specific adjustments; no target is guaranteed.");
  caveats.push("Earnings dates/headlines are third-party data; confirm material items from official investor relations and SEC filings.");
  caveats.push("No stop level guarantees execution. Gaps, fees, slippage and data issues can cause larger losses.");
  $("decision-caveat").textContent=caveats.join(" ");
  latestResearchSnapshot = {
    ticker, decision:state, quote:typeof quote?.price==="number"?quote.price:null,
    quoteSource:quote?.source||null, quoteTimestamp:quote?.quoteTime||quote?.quoteLabel||null,
    entryLow, entryHigh, valuationBase:valuation.available?valuation.base:null,
    invalidation, rewardRisk, explanation:reasons.join(" "),
    checks:dataChecks.map(check=>({label:check.label,passed:Boolean(check.ok),detail:check.detail})),
    disclaimer:"Research snapshot only. No BUY signal enabled; not a trade instruction."
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
    const quarter=renderQuarterlySnapshot(observations);
    renderFilings(submissions, company);
    $("sec-health").textContent="Connected; received SEC company facts";
    setMessage("SEC facts loaded. Checking price, earnings, news and preliminary valuation…");
    const [quote,history,news,earnings]=await Promise.all([
      loadQuote(ticker),loadHistory(ticker),loadNews(ticker),loadEarnings(ticker)
    ]);
    const reportedQuarter=quarter?.fiscalQuarterId||null;
    const earningsResult=await loadEarningsResult(ticker,reportedQuarter);
    renderEarningsResult(earningsResult,quarter,reportedQuarter);
    renderDecision({ticker,company,observations,facts,quote,history,news,earnings,quarter});
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
$("save-research-snapshot").addEventListener("click",saveResearchSnapshot);
renderResearchLog();
$("ui-health").textContent="Loaded";
