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
  $("quote-time").textContent = "Quote time: " + (quote.quoteTime ? new Date(quote.quoteTime).toLocaleString() : "unavailable") + " · Retrieved: " + new Date(quote.fetchedAt || Date.now()).toLocaleTimeString();
  $("quote-source").textContent = (quote.source || "Yahoo Finance") + " · May be delayed";
}
async function loadQuote(ticker) {
  $("quote-panel").classList.remove("hidden");
  $("quote-price").textContent = "Loading…";
  try {
    const response = await fetch("/api/quote?ticker=" + encodeURIComponent(ticker), {headers: {"Accept":"application/json"}});
    const quote = await response.json();
    if (!response.ok) throw new Error(quote.error || "Quote service unavailable");
    renderQuote(quote);
  } catch (error) {
    renderQuote({error:error.message,price:null,fetchedAt:new Date().toISOString(),source:"Yahoo Finance"});
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
  $("news-status").textContent = "Loading…";
  try {
    const response = await fetch("/api/news?ticker=" + encodeURIComponent(ticker), {headers: {"Accept":"application/json"}});
    if (!response.ok) throw new Error("News feeds unavailable");
    renderNews(await response.json());
  } catch (error) {
    $("news-status").textContent = "Unavailable";
    $("news-list").textContent = "News could not be loaded right now. Try again later; no news-based conclusion has been made.";
  }
}
async function analyze(ticker) {
  ticker=ticker.trim().toUpperCase();
  if(!/^[A-Z0-9.-]{1,12}$/.test(ticker)) { setMessage("Enter a valid US stock ticker, such as AAPL or MSFT.","error"); return; }
  const button=$("analyze-button"); button.disabled=true; button.textContent="Loading SEC data…";
  $("last-request").textContent=new Date().toLocaleString();
  setMessage("Looking up "+ticker+" and requesting company-reported financial facts…");
  $("sec-health").textContent="Request in progress";
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
    loadNews(ticker);
    loadQuote(ticker);
    $("sec-health").textContent="Connected; received SEC company facts";
    setMessage("Loaded SEC financial observations for "+company.name+". Check each filing date and period before comparing metrics.","success");
  } catch(error) {
    $("sec-health").textContent="Request failed";
    const reason=error instanceof TypeError?"Could not reach the SEC data service. Check your connection and try again.":error.message||"The SEC data request failed.";
    setMessage(reason+" No sample data has been substituted.","error");
  } finally { button.disabled=false; button.innerHTML='Analyze company <span aria-hidden="true">↗</span>'; }
}
$("analyze-form").addEventListener("submit",event=>{event.preventDefault();analyze($("ticker").value);});
document.querySelectorAll("[data-ticker]").forEach(button=>button.addEventListener("click",()=>{$("ticker").value=button.dataset.ticker;analyze(button.dataset.ticker);}));
$("refresh-quote").addEventListener("click",()=>loadQuote($("ticker").value.trim().toUpperCase()));
$("ui-health").textContent="Loaded";
