const $ = (id) => document.getElementById(id);
let latestResearchSnapshot = null;
let latestDecisionContext = null;
const RESEARCH_LOG_KEY = "ai-stock-advisor-research-log-v1";
const SEC_MAP_URL = "https://www.sec.gov/files/company_tickers_exchange.json";
const SEC_DATA_URL = "https://data.sec.gov";
const SEC_API = "/api/sec?path=";
const METRICS = [
  {label:"Revenue", tags:["Revenues","RevenueFromContractWithCustomerExcludingAssessedTax","SalesRevenueNet","Revenue","RevenueFromContractsWithCustomers"], key:"revenue"},
  {label:"Net income", tags:["NetIncomeLoss","ProfitLoss"], key:"netIncome"},
  {label:"Operating income", tags:["OperatingIncomeLoss","ProfitLossFromOperatingActivities"], key:"operatingIncome"},
  {label:"Total assets", tags:["Assets"], key:"assets"},
  {label:"Total liabilities", tags:["Liabilities"], key:"liabilities"},
  {label:"Stockholders' equity", tags:["StockholdersEquity","StockholdersEquityIncludingPortionAttributableToNoncontrollingInterest","Equity"], key:"equity"},
  {label:"Operating cash flow", tags:["NetCashProvidedByUsedInOperatingActivities","CashFlowsFromUsedInOperatingActivities"], key:"operatingCashFlow"},
  {label:"Capital expenditures", tags:["PaymentsToAcquirePropertyPlantAndEquipment","PaymentsToAcquireProductiveAssets","PaymentsToAcquirePropertyPlantAndEquipmentAndIntangibleAssets","PaymentsToAcquirePropertyPlantAndEquipmentAndOtherProductiveAssets","PurchaseOfPropertyPlantAndEquipmentClassifiedAsInvestingActivities"], key:"capex"},
  {label:"Weighted-average diluted shares", tags:["WeightedAverageNumberOfDilutedSharesOutstanding"], key:"dilutedShares"},
  {label:"Diluted earnings per share (GAAP)", tags:["EarningsPerShareDiluted","DilutedEarningsPerShare"], key:"dilutedEps"},
  {label:"Cash and cash equivalents", tags:["CashAndCashEquivalentsAtCarryingValue","CashCashEquivalentsRestrictedCashAndRestrictedCashEquivalents","CashAndCashEquivalents"], key:"cash"},
  {label:"Current debt", tags:["LongTermDebtCurrent","ShortTermBorrowings","ShortTermDebtCurrent","CurrentBorrowings"], key:"currentDebt"},
  {label:"Long-term debt", tags:["LongTermDebtNoncurrent","LongTermDebt","LongTermDebtAndFinanceLeaseObligationsNoncurrent","NoncurrentBorrowings"], key:"longTermDebt"},
  {label:"Other non-operating income", tags:["NonoperatingIncomeExpense","OtherNonoperatingIncomeExpense","OtherIncome"], key:"otherIncome"},
  {label:"Income before taxes", tags:["IncomeLossFromContinuingOperationsBeforeIncomeTaxesExtraordinaryItemsNoncontrollingInterest","ProfitLossBeforeTax"], key:"pretaxIncome"},
  {label:"Shares outstanding", tags:["EntityCommonStockSharesOutstanding","CommonStockSharesOutstanding"], key:"commonShares"}
];
const cache = new Map();
function setMessage(text, type="") { const el=$("message"); el.textContent=text; el.className="message"+(type?" "+type:""); }
let activityTimer=null, activityStartedAt=0;
function beginActivity(title, stages) {
 const panel=$("activity-progress"); if(!panel)return;
 if(activityTimer)clearInterval(activityTimer);
 panel.classList.remove("hidden"); panel.classList.add("is-indeterminate");
 $("activity-title").textContent=title; $("activity-stage").textContent=stages[0]||"Preparing data…";
 $("activity-elapsed").textContent="0s"; $("activity-bar").style.width="20%"; $("activity-steps").innerHTML="";
 stages.forEach((label,i)=>{const li=document.createElement("li");li.dataset.step=String(i);li.textContent=label;$("activity-steps").append(li);});
 activityStartedAt=Date.now(); setActivityStage(0,stages[0]||"Working…");
 activityTimer=setInterval(()=>{$("activity-elapsed").textContent=Math.floor((Date.now()-activityStartedAt)/1000)+"s";},1000);
}
function setActivityStage(index,message) {
 const panel=$("activity-progress"); if(!panel||panel.classList.contains("hidden"))return;
 const items=[...$("activity-steps").querySelectorAll("li")];
 items.forEach((item,i)=>{item.classList.toggle("done",i<index);item.classList.toggle("active",i===index);});
 if(message)$("activity-stage").textContent=message;
 $("activity-bar").style.width=Math.min(92,Math.max(8,((index+1)/Math.max(items.length,1))*100))+"%";
}
function finishActivity(message,failed=false) {
 const panel=$("activity-progress"); if(!panel)return;
 if(activityTimer)clearInterval(activityTimer); activityTimer=null;
 panel.classList.remove("is-indeterminate");
 if(message)$("activity-stage").textContent=message;
 $("activity-bar").style.width="100%";
 if(!failed)[...$("activity-steps").querySelectorAll("li")].forEach(item=>{item.classList.remove("active");item.classList.add("done");});
 $("activity-title").textContent=failed?"Could not complete all checks":"Analysis finished";
 $("activity-elapsed").textContent=Math.floor((Date.now()-activityStartedAt)/1000)+"s";
 if(!failed)setTimeout(()=>panel.classList.add("hidden"),4500);
}
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
  const endpoint=SEC_API+encodeURIComponent(path);
  let lastError=null;
  for(let attempt=0;attempt<2;attempt++) {
    const controller=typeof AbortController!=="undefined"?new AbortController():null;
    const timeout=controller?setTimeout(()=>controller.abort(),12000):null;
    try {
      const response=await fetch(endpoint,{headers:{"Accept":"application/json"},signal:controller?.signal,cache:"no-store"});
      if(!response.ok) {
        const error=new Error("SEC request returned HTTP "+response.status+" for "+path+".");
        if(response.status<500&&response.status!==429) throw error;
        lastError=error;
      } else {
        const data=await response.json();
        cache.set(url,data);
        return data;
      }
    } catch(error) {
      lastError=error?.name==="AbortError"?new Error("SEC request timed out for "+path+"."):error;
      if(error?.message?.includes("HTTP ")&&!/HTTP (429|5\d\d)/.test(error.message)) throw error;
    } finally { if(timeout!==null)clearTimeout(timeout); }
    if(attempt===0) await new Promise(resolve=>setTimeout(resolve,350));
  }
  throw lastError||new Error("SEC request failed for "+path+".");
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
async function addShareCountFallback(observations,cik) {
  // Some issuers expose the latest cover-page count under DEI, while others
  // expose a standard US-GAAP shares-outstanding concept. Try both official SEC
  // companyconcept endpoints before declaring the value missing.
  const today=newYorkDateOnly();
  const ageDays=date=>date?(Date.parse(today+"T00:00:00Z")-Date.parse(date+"T00:00:00Z"))/86400000:Infinity;
  const concepts=[
    {taxonomy:"dei",tag:"EntityCommonStockSharesOutstanding"},
    {taxonomy:"us-gaap",tag:"CommonStockSharesOutstanding"}
  ];
  const candidateGroups=await Promise.all(concepts.map(async concept=>{
    const found=[];
    try {
      const payload=await getJson(SEC_DATA_URL+"/api/xbrl/companyconcept/CIK"+cik+"/"+concept.taxonomy+"/"+concept.tag+".json");
      const units=payload?.units||{};
      for(const [unit,rows] of Object.entries(units)) {
        if(!Array.isArray(rows)) continue;
        for(const row of rows) {
          if(!Number.isFinite(row?.val)||row.val<=0||!row.end||!row.filed||row.end>today||row.filed>today) continue;
          const endAge=ageDays(row.end),filedAge=ageDays(row.filed);
          if(endAge<0||endAge>180||filedAge<0||filedAge>180) continue;
          if(unit!=="shares") continue;
          found.push({...row,unit,concept});
        }
      }
    } catch (_) {
      // A missing taxonomy/concept is normal for some filers; continue with the other official SEC concept.
    }
    return found;
  }));
  const candidates=candidateGroups.flat();
  candidates.sort((a,b)=>String(b.end).localeCompare(String(a.end))||String(b.filed).localeCompare(String(a.filed)));
  const best=candidates[0];
  if(best&&!observations.some(row=>row.key==="commonShares"&&row.value===best.val&&row.end===best.end&&row.filed===best.filed)) {
    observations.push({
      metric:"Shares outstanding",key:"commonShares",tag:best.concept.tag,taxonomy:best.concept.taxonomy,
      tagRank:0,unit:"shares",value:best.val,start:null,end:best.end,filed:best.filed,
      form:best.form||"—",accession:best.accn||"—",fy:best.fy,fp:best.fp,frame:best.frame||""
    });
  }
  return observations;
}
function getObservations(payload) {
  const gaap=payload?.facts?.["us-gaap"]||{};
  const ifrs=payload?.facts?.["ifrs-full"]||{};
  if(!Object.keys(gaap).length&&!Object.keys(ifrs).length) throw new Error("SEC company facts response has no supported US-GAAP or IFRS facts.");
  const observations=[];
  for(const metric of METRICS) {
    let found=false;
    for(let tagRank=0;tagRank<metric.tags.length;tagRank++) {
      const tag=metric.tags[tagRank];
      const taxonomies=metric.taxonomy?[metric.taxonomy]:(metric.key==="commonShares"?["dei","us-gaap","ifrs-full"]:["us-gaap","ifrs-full"]);
      const selectedFact=taxonomies.map(taxonomy=>({taxonomy,fact:(payload?.facts?.[taxonomy]||{})[tag]})).find(item=>item.fact?.units);
      const fact=selectedFact?.fact;
      if(!fact?.units) continue;
      for(const [unit,values] of Object.entries(fact.units)) {
        if(!Array.isArray(values)) continue;
        for(const obs of values) {
          if(obs.val==null || !obs.end || !obs.filed || obs.filed>newYorkDateOnly() || obs.end>newYorkDateOnly()) continue;
          observations.push({metric:metric.label,key:metric.key,tag,taxonomy:selectedFact?.taxonomy||metric.taxonomy||"us-gaap",tagRank,unit,value:obs.val,start:obs.start||null,end:obs.end,filed:obs.filed,form:obs.form||"—",accession:obs.accn||"—",fy:obs.fy,fp:obs.fp,frame:obs.frame||""});
        }
      }
      found=true;
    }
    if(!found) observations.push({metric:metric.label,key:metric.key,tag:"",tagRank:999,unit:"",value:null,start:null,end:null,filed:null,form:"—",accession:"—"});
  }
  // One canonical row per metric/unit/period/form. Prefer the first documented alias in METRICS.tags.
  // If a preferred alias has duplicate submissions for the same key, use the latest filed row.
  const selected=new Map();
  for(const row of observations) {
    if(row.value===null) continue;
    const key=[row.key,row.unit,row.start||"instant",row.end,row.form].join("|");
    const prior=selected.get(key);
    if(!prior||row.tagRank<prior.tagRank||(row.tagRank===prior.tagRank&&String(row.filed)>String(prior.filed))) selected.set(key,row);
  }
  const cleaned=[...selected.values()];
  for(const metric of METRICS) {
    if(!cleaned.some(row=>row.key===metric.key)) cleaned.push({metric:metric.label,key:metric.key,tag:"",tagRank:999,unit:"",value:null,start:null,end:null,filed:null,form:"—",accession:"—"});
  }
  cleaned.sort((a,b)=>String(b.end||"").localeCompare(String(a.end||""))||String(b.filed||"").localeCompare(String(a.filed||""))||String(a.key).localeCompare(String(b.key)));
  return cleaned;
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
    const date=document.createElement("div"); date.className="metric-date"; const asOf=["assets","liabilities","equity","cash","currentDebt","longTermDebt","commonShares"].includes(metric.key); date.textContent=row?(asOf?"As of "+fmtDate(row.end)+" · filed "+fmtDate(row.filed):"Filed "+fmtDate(row.filed)+" · "+periodDuration(row)):"No supported observation found";
    card.append(label,value,date); $("metrics-grid").append(card);
  }
}

function annualSeries(observations, key) {
  const candidates = observations.filter(row => row.key === key && typeof row.value === "number" &&
    ["10-K","20-F","40-F"].includes(row.form) && row.start && row.end &&
    (new Date(row.end + "T00:00:00Z") - new Date(row.start + "T00:00:00Z")) / 86400000 >= 329 &&
    (new Date(row.end + "T00:00:00Z") - new Date(row.start + "T00:00:00Z")) / 86400000 <= 399);
  // SEC companyfacts can include the same fiscal period in multiple filings,
  // including later comparative disclosures or amendments. Do not discard an
  // entire year just because those filings disagree: select the latest-filed
  // official annual observation for the same period and unit.
  const byPeriod = new Map();
  for (const row of candidates) {
    const periodKey = [row.start, row.end, row.unit].join("|");
    const prior = byPeriod.get(periodKey);
    if (!prior || String(row.filed || "") > String(prior.filed || "")) byPeriod.set(periodKey, row);
  }
  const byEnd = new Map();
  for (const row of byPeriod.values()) {
    const prior = byEnd.get(row.end);
    const duration = (Date.parse(row.end + "T00:00:00Z") - Date.parse(row.start + "T00:00:00Z")) / 86400000;
    const priorDuration = prior ? (Date.parse(prior.end + "T00:00:00Z") - Date.parse(prior.start + "T00:00:00Z")) / 86400000 : -1;
    if (!prior || duration > priorDuration || (duration === priorDuration && String(row.filed || "") > String(prior.filed || ""))) byEnd.set(row.end, row);
  }
  return [...byEnd.values()].sort((a,b) => a.end.localeCompare(b.end));
}
function quarterlySeries(observations, key) {
  const candidates = observations.filter(row => row.key === key &&
    typeof row.value === "number" && ["10-Q","10-K","6-K","40-F"].includes(row.form) &&
    row.start && row.end &&
    (new Date(row.end + "T00:00:00Z") - new Date(row.start + "T00:00:00Z")) / 86400000 >= 70 &&
    (new Date(row.end + "T00:00:00Z") - new Date(row.start + "T00:00:00Z")) / 86400000 <= 110);
  // Resolve repeated quarterly facts using the latest filing for each exact
  // period/unit, instead of suppressing that quarter when a later filing
  // reports a revised comparative value.
  const byPeriod = new Map();
  for (const row of candidates) {
    const periodKey = [row.start, row.end, row.unit].join("|");
    const prior = byPeriod.get(periodKey);
    if (!prior || String(row.filed || "") > String(prior.filed || "")) byPeriod.set(periodKey, row);
  }
  const byEnd = new Map();
  for (const row of byPeriod.values()) {
    const prior = byEnd.get(row.end);
    const duration = (Date.parse(row.end + "T00:00:00Z") - Date.parse(row.start + "T00:00:00Z")) / 86400000;
    const priorDuration = prior ? (Date.parse(prior.end + "T00:00:00Z") - Date.parse(prior.start + "T00:00:00Z")) / 86400000 : -1;
    if (!prior || duration < priorDuration || (duration === priorDuration && String(row.filed || "") > String(prior.filed || ""))) byEnd.set(row.end, row);
  }
  return [...byEnd.values()].sort((a,b) => a.end.localeCompare(b.end));
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
  const latestIncome = latestRevenue && income.find(row=>row.end===latestRevenue.end&&row.start===latestRevenue.start&&row.unit===latestRevenue.unit);
  if (latestRevenue && latestIncome && latestRevenue.value !== 0) {
    cards.push({label:"Net profit margin",value:((latestIncome.value/latestRevenue.value)*100).toFixed(1)+"%",meta:"Matched annual period ended "+fmtDate(latestRevenue.end)});
  }
  const latestCash = cash[cash.length-1];
  const latestCapex = latestCash && capex.find(row=>row.end===latestCash.end&&row.start===latestCash.start&&row.unit===latestCash.unit);
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
  const latestIncome=latestRevenue?income.find(row=>row.end===latestRevenue.end&&row.start===latestRevenue.start&&row.unit===latestRevenue.unit)||null:null;
  const priorIncome=latestIncome?matchingPriorYear(income,latestIncome):null;
  const latestEps=latestRevenue?eps.find(row=>row.end===latestRevenue.end&&row.start===latestRevenue.start)||null:null;
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
  const trendStatus=revenueYoY===null?"unknown":revenueYoY>0?"good":revenueYoY<0?"bad":"caution";
  revenueCard.classList.add("trend-"+trendStatus);
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

async function loadBenchmarkHistory() {
  // Retry the benchmark through broad-market index histories when SPY is
  // temporarily rate-limited. The chosen benchmark is returned with its data
  // so the report can label the comparison honestly.
  const candidates=[
    {ticker:"SPY",label:"S&P 500 ETF (SPY)"},
    {ticker:"^GSPC",label:"S&P 500 Index (^GSPC)"},
    {ticker:"^IXIC",label:"Nasdaq Composite (^IXIC)"}
  ];
  for(const candidate of candidates) {
    try {
      const response=await fetch("/api/history?ticker="+encodeURIComponent(candidate.ticker),{headers:{"Accept":"application/json"}});
      const payload=await response.json();
      if(response.ok&&Array.isArray(payload.data)&&payload.data.length>=30) {
        return {...payload,benchmarkLabel:candidate.label,benchmarkFallback:candidate.ticker!=="SPY"};
      }
    } catch (_) { /* Try the next benchmark source. */ }
  }
  return null;
}

function clamp(value,min,max){return Math.max(min,Math.min(max,value));}
function scoreRange(value,min,max,points){return clamp((value-min)/(max-min)*points,0,points);}
async function scoreTicker(ticker) {
  const company=await findCompany(ticker);
  const facts=await getJson(SEC_DATA_URL+"/api/xbrl/companyfacts/CIK"+company.cik+".json");
  const observations=await addShareCountFallback(getObservations(facts),company.cik);
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
      const valuation=buildDcfEstimate(item.observations);
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

async function loadCachedScreen() {
 const button=$("run-screen"); button.disabled=true; button.textContent="Loading latest shortlist…";
 const status=$("screen-status"); const root=$("screen-results");
 try {
   const response=await fetch("/data/top-stocks-cache.json?ts="+Date.now(),{cache:"no-store",headers:{"Accept":"application/json"}});
   if(!response.ok) throw new Error("No refreshed shortlist is available yet.");
   const data=await response.json();
   if(!Array.isArray(data.stocks)||!data.stocks.length) throw new Error("The latest scan did not produce qualified candidates.");
   renderCachedScreen(data);
   const stamp=data.generatedAt?new Date(data.generatedAt):null;
   status.textContent="Updated "+(stamp&&!Number.isNaN(stamp.getTime())?stamp.toLocaleString():"time unavailable")+" · cached results";
 } catch(error) {
   status.textContent="Latest shortlist unavailable";
   root.innerHTML="";
   const p=document.createElement("p"); p.className="empty"; p.textContent="The scheduled shortlist is not available yet. You can run a live scan instead."; root.append(p);
 } finally {button.disabled=false; button.textContent="Show latest top 5";}
}
function renderCachedScreen(data) {
 const root=$("screen-results"); root.innerHTML="";
 const note=document.createElement("p"); note.className="table-note";
 note.textContent="Precomputed shortlist from the latest scheduled 60-stock scan. Results load quickly; prices and event details can change between refreshes. Research candidates only — not validated BUY signals.";
 root.append(note);
 const stamp=document.createElement("p"); stamp.className="cache-timestamp";
 const when=data.generatedAt?new Date(data.generatedAt):null;
 stamp.textContent="Last full scan: "+(when&&!Number.isNaN(when.getTime())?when.toLocaleString():"timestamp unavailable")+" · Scheduled refresh every 3 hours";
 root.append(stamp);
 data.stocks.slice(0,5).forEach((item,index)=>{
   const card=document.createElement("article"); card.className="screen-card cached-screen-card";
   const head=document.createElement("div"); head.className="screen-card-header";
   const identity=document.createElement("div");
   const name=document.createElement("strong"); name.textContent=(index+1)+". "+item.ticker+" · "+item.name;
   const period=document.createElement("p"); period.className="muted"; period.textContent="Financial period: "+(item.financialPeriod||"Not available")+" · History: "+(item.historyPeriod||"Not available");
   identity.append(name,period);
   const score=document.createElement("div"); score.className="screen-score"; score.textContent=Number.isFinite(item.score)?item.score.toFixed(1)+"/100":"Score unavailable";
   head.append(identity,score); card.append(head);
   if(Array.isArray(item.components)) {
     const grid=document.createElement("div"); grid.className="screen-components";
     item.components.forEach(part=>{
       const cell=document.createElement("div"); cell.className="screen-component";
       const label=document.createElement("span"); label.textContent=part.name;
       const value=document.createElement("strong"); value.textContent=part.display;
       cell.append(label,value); grid.append(cell);
     }); card.append(grid);
   }
   const state=document.createElement("p"); state.className="cached-status";
   state.textContent=item.entryStatus||"Research priority only. Current entry eligibility must be checked in full analysis.";
   card.append(state);
   const open=document.createElement("button"); open.type="button"; open.className="secondary-button"; open.textContent="Analyze "+item.ticker;
   open.addEventListener("click",()=>{$("ticker").value=item.ticker;analyze(item.ticker);window.scrollTo({top:0,behavior:"smooth"});});
   card.append(open); root.append(card);
 });
 const disclaimer=document.createElement("p"); disclaimer.className="table-note"; disclaimer.textContent="Cached rankings are refreshed on a schedule and may be up to 3 hours old. Always open full analysis to check current quote, earnings, news, valuation and risk. If the scheduled scan fails, the last successful cache should remain available and its age should be shown.";
 root.append(disclaimer);
}
async function runScreen() {
  const button=$("run-live-screen")||$("run-screen"); const cachedButton=$("run-screen"); const suggestButton=$("suggest-stocks-button"); button.disabled=true; cachedButton.disabled=true; suggestButton.disabled=true; button.textContent="Screening…"; (suggestButton.querySelector("strong")||suggestButton).textContent="Screening stocks…"; beginActivity("Finding research candidates",["Scan company fundamentals","Check price history and risk","Rank available candidates","Verify top results"]);
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
      setActivityStage(0,"Screening companies "+Math.min(i+batch.length,universe.length)+" of "+universe.length+"…");
      const settled=await Promise.allSettled(batch.map(ticker=>scoreTicker(ticker)));
      for(let j=0;j<settled.length;j++) {
        const outcome=settled[j],ticker=batch[j];
        if(outcome.status==="fulfilled") results.push(outcome.value);
        else errors.push(ticker+": "+(outcome.reason?.message||"Insufficient data"));
      }
    }
    renderScreenResults(results,errors);
    $("screen-status").textContent=results.length+" ranked · "+errors.length+" excluded from "+universe.length;
    setActivityStage(2,"Ranking candidates. "+results.length+" qualified; "+errors.length+" excluded for insufficient data.");
    await enrichTopCandidates(results);
    setActivityStage(3,"Top candidates checked. Open a ticker for complete analysis.");
    finishActivity("Screening finished. Review the evidence behind each candidate.");
  } catch(error) {
    $("screen-status").textContent="Screen interrupted · "+results.length+" ranked so far";
    setMessage("Screen stopped safely: "+(error?.message||"Unexpected error"),"error");
    finishActivity("Screen interrupted. Partial results are shown.",true);
    renderScreenResults(results,errors);
  } finally {
    button.disabled=false; cachedButton.disabled=false; suggestButton.disabled=false; button.textContent="Run live 60-stock scan"; (suggestButton.querySelector("strong")||suggestButton).textContent="Suggest me stocks";
  }
}

function fmtUsd(value) {
  if (typeof value !== "number" || !Number.isFinite(value)) return "Unavailable";
  return new Intl.NumberFormat("en-US", {style:"currency",currency:"USD",maximumFractionDigits:2}).format(value);
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
function buildDcfEstimate(observations) {
  const today=newYorkDateOnly();
  const filedByToday=rows=>rows.filter(row=>row.filed&&row.filed<=today);
  const cash=filedByToday(annualSeries(observations,"operatingCashFlow"));
  const capex=filedByToday(annualSeries(observations,"capex"));
  const revenue=filedByToday(annualSeries(observations,"revenue"));
  const isUsd=row=>String(row?.unit||"").trim().toUpperCase()==="USD";
  const flows=[];
  for (const row of cash) {
    const cap=capex.find(item=>item.end===row.end&&item.start===row.start&&item.unit===row.unit);
    if (cap) {
      flows.push({
        start:row.start,
        end:row.end,
        value:row.value-Math.abs(cap.value),
        unit:row.unit,
        capexUnit:cap.unit
      });
    }
  }
  flows.sort((a,b)=>a.end.localeCompare(b.end));
  if (flows.length<3) return {available:false,reason:"Not enough reliable data: fewer than three annual free-cash-flow periods with matching operating-cash-flow and capex start/end dates and units (non-USD, mixed-unit, or unmatched periods are excluded)."};
  const last3=flows.slice(-3);
  if (last3.some(row=>!Number.isFinite(row.value)||!isUsd(row)||!isUsd({unit:row.capexUnit}))) {
    return {available:false,reason:"Not enough reliable data: latest free-cash-flow inputs contain non-USD, mixed-unit, or non-finite observations."};
  }
  if (last3.some(row=>row.value<=0)) return {available:false,reason:"Not enough reliable data for this DCF: free cash flow is not positive in all three matched annual periods."};
  const daysBetween=(left,right)=>(Date.parse(right+"T00:00:00Z")-Date.parse(left+"T00:00:00Z"))/86400000;
  if (last3.some((row,index)=>index>0&&(daysBetween(last3[index-1].end,row.end)<300||daysBetween(last3[index-1].end,row.end)>400))) {
    return {available:false,reason:"Not enough reliable data: annual free-cash-flow periods are stale or are not spaced within the 400-day matching limit."};
  }
  const matchedRevenue=last3.map(row=>revenue.find(item=>item.end===row.end&&item.start===row.start&&item.unit===row.unit)||null);
  if (matchedRevenue.some(row=>!row)) {
    return {available:false,reason:"Not enough reliable data: each of the latest three annual free-cash-flow periods must match an unambiguous annual revenue period with the same start/end dates and unit."};
  }
  if (matchedRevenue.some(row=>!isUsd(row)||!Number.isFinite(row.value)||row.value<=0)) {
    return {available:false,reason:"Not enough reliable data: matched annual revenue inputs are non-USD, non-finite, or non-positive."};
  }
  const latestFcf=last3[2];
  const latestRevenue=matchedRevenue[2], previousRevenue=matchedRevenue[1];
  const currentInstantShares=observations.filter(row=>row.key==="commonShares"&&!row.start&&String(row.unit).toLowerCase()==="shares"&&row.value>0&&row.end&&row.filed&&
    (Date.parse(today+"T00:00:00Z")-Date.parse(row.end+"T00:00:00Z"))/86400000>=0&&
    (Date.parse(today+"T00:00:00Z")-Date.parse(row.end+"T00:00:00Z"))/86400000<=180&&
    (Date.parse(today+"T00:00:00Z")-Date.parse(row.filed+"T00:00:00Z"))/86400000>=0&&
    (Date.parse(today+"T00:00:00Z")-Date.parse(row.filed+"T00:00:00Z"))/86400000<=180)
    .sort((a,b)=>b.end.localeCompare(a.end)||b.filed.localeCompare(a.filed))[0]||null;
  const shares=currentInstantShares&&currentInstantShares.value>0
    ? {value:currentInstantShares.value,end:currentInstantShares.end,filed:currentInstantShares.filed,source:"Recent SEC-reported instant shares outstanding"}
    : null;
  if (!shares || shares.value<=0) return {available:false,reason:"Share-count verification needed: the latest SEC-reported shares outstanding is missing or older than 180 days. Northstar can still provide company and financial research, but it will withhold the per-share valuation rather than estimate an unverified share count"};
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
    return {available:false,reason:"Not enough reliable data: DCF bear/base/bull scenarios could not be calculated from the matched cash-flow, revenue and share-count inputs."};
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
  const epsVariance=consensusEpsBasis==="GAAP"&&typeof actualEps==="number"&&typeof consensusEps==="number"&&Math.abs(consensusEps)>0
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
  root.append(metricCard("Provider consensus EPS ("+(epsBasisKnown?consensusEpsBasis:"basis unverified")+")",epsBasisKnown&&typeof consensusEps==="number"?fmtUsd(consensusEps):"Not shown",
    epsBasisKnown?"Provider estimate explicitly identifies its "+consensusEpsBasis+" basis.":"Estimate withheld because its GAAP/non-GAAP basis is not verified."));
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
        typeof event.consensusEps==="number"&&["GAAP","NON-GAAP"].includes(String(event.epsBasis||"").toUpperCase())?"EPS estimate ("+String(event.epsBasis).toUpperCase()+") "+fmtUsd(event.consensusEps):"",
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

function latestFact(observations,key,instant=false) {
  return observations.filter(row=>row.key===key&&typeof row.value==="number"&&Number.isFinite(row.value)&&row.end&&(!instant||!row.start))
    .sort((a,b)=>String(b.end).localeCompare(String(a.end))||String(b.filed).localeCompare(String(a.filed)))[0]||null;
}
function ytdRows(observations,key) {
  return observations.filter(row=>row.key===key&&typeof row.value==="number"&&row.start&&row.end&&["10-Q","6-K"].includes(row.form)&&
    ["USD","SHARES","USD/SHARES"].includes(String(row.unit).toUpperCase())&&
    periodDurationDays(row)>=150&&periodDurationDays(row)<=300)
    .sort((a,b)=>a.end.localeCompare(b.end));
}
function periodDurationDays(row) {
  return row?.start&&row?.end?(Date.parse(row.end+"T00:00:00Z")-Date.parse(row.start+"T00:00:00Z"))/86400000:0;
}
function ttmValue(observations,key) {
  const ytd=ytdRows(observations,key), current=ytd[ytd.length-1];
  if(current) {
    const duration=periodDurationDays(current);
    const prior=ytd.filter(row=>row.unit===current.unit&&Math.abs(periodDurationDays(row)-duration)<=20&&
      (Date.parse(current.end+"T00:00:00Z")-Date.parse(row.end+"T00:00:00Z"))/86400000>=350&&
      (Date.parse(current.end+"T00:00:00Z")-Date.parse(row.end+"T00:00:00Z"))/86400000<=380)
      .sort((a,b)=>Math.abs((Date.parse(current.end+"T00:00:00Z")-Date.parse(a.end+"T00:00:00Z"))/86400000-365.25)-Math.abs((Date.parse(current.end+"T00:00:00Z")-Date.parse(b.end+"T00:00:00Z"))/86400000-365.25))[0];
    const annual=annualSeries(observations,key).filter(row=>row.unit===current.unit&&row.end<current.start)
      .sort((a,b)=>b.end.localeCompare(a.end))[0];
    if(prior&&annual&&Math.abs((Date.parse(current.start+"T00:00:00Z")-Date.parse(annual.end+"T00:00:00Z"))/86400000)<=180)
      return {value:annual.value+current.value-prior.value,end:current.end,start:current.start,method:"Annual + current YTD − prior-year YTD",unit:current.unit};
  }
  const quarters=quarterlySeries(observations,key).filter(row=>row.unit==="USD").slice(-4);
  if(quarters.length===4) {
    const gaps=quarters.slice(1).map((row,i)=>periodDurationDays({start:quarters[i].end,end:row.end}));
    if(gaps.every(days=>days>=70&&days<=110)&&
       (Date.parse(quarters[3].end+"T00:00:00Z")-Date.parse(quarters[0].end+"T00:00:00Z"))/86400000>=250&&
       (Date.parse(quarters[3].end+"T00:00:00Z")-Date.parse(quarters[0].end+"T00:00:00Z"))/86400000<=400)
      return {value:quarters.reduce((sum,row)=>sum+row.value,0),end:quarters[3].end,start:quarters[0].start,method:"Sum of four matched reported quarters",unit:quarters[3].unit};
  }
  const annual=annualSeries(observations,key).filter(row=>row.unit==="USD").at(-1);
  const newestEnd=observations.filter(row=>row.key===key&&row.end).map(row=>row.end).sort().at(-1);
  if(annual&&newestEnd&&(Date.parse(newestEnd+"T00:00:00Z")-Date.parse(annual.end+"T00:00:00Z"))/86400000<=400)
    return {value:annual.value,end:annual.end,start:annual.start,method:"Latest annual report (TTM proxy; no newer matched YTD data)",unit:annual.unit};
  return null;
}
function ttmFreeCashFlow(observations) {
  const cashYtd=ytdRows(observations,"operatingCashFlow"),capYtd=ytdRows(observations,"capex");
  const current=cashYtd[cashYtd.length-1];
  if(current) {
    const cap=capYtd.find(row=>row.start===current.start&&row.end===current.end&&row.unit===current.unit);
    const prior=cashYtd.filter(row=>row.unit===current.unit&&Math.abs(periodDurationDays(row)-periodDurationDays(current))<=20&&
      (Date.parse(current.end+"T00:00:00Z")-Date.parse(row.end+"T00:00:00Z"))/86400000>=350&&
      (Date.parse(current.end+"T00:00:00Z")-Date.parse(row.end+"T00:00:00Z"))/86400000<=380)
      .sort((a,b)=>Math.abs((Date.parse(current.end+"T00:00:00Z")-Date.parse(a.end+"T00:00:00Z"))/86400000-365.25)-Math.abs((Date.parse(current.end+"T00:00:00Z")-Date.parse(b.end+"T00:00:00Z"))/86400000-365.25))[0];
    const priorCap=prior&&capYtd.find(row=>row.start===prior.start&&row.end===prior.end&&row.unit===prior.unit);
    const annualCash=annualSeries(observations,"operatingCashFlow").filter(row=>row.unit===current.unit&&row.end<current.start).sort((a,b)=>b.end.localeCompare(a.end))[0];
    const annualCap=annualCash&&annualSeries(observations,"capex").find(row=>row.start===annualCash.start&&row.end===annualCash.end&&row.unit===annualCash.unit);
    if(cap&&prior&&priorCap&&annualCash&&annualCap&&Math.abs((Date.parse(current.start+"T00:00:00Z")-Date.parse(annualCash.end+"T00:00:00Z"))/86400000)<=180) {
      const currentFcf=current.value-Math.abs(cap.value), priorFcf=prior.value-Math.abs(priorCap.value), annualFcf=annualCash.value-Math.abs(annualCap.value);
      return {value:annualFcf+currentFcf-priorFcf,end:current.end,method:"Annual FCF + current YTD FCF − prior-year YTD FCF"};
    }
  }
  const cash=quarterlySeries(observations,"operatingCashFlow"),cap=quarterlySeries(observations,"capex");
  const matched=cash.map(row=>{const x=cap.find(item=>item.start===row.start&&item.end===row.end&&item.unit===row.unit);return x?{row,cap:x,value:row.value-Math.abs(x.value)}:null;}).filter(Boolean).slice(-4);
  if(matched.length===4) {
    const gaps=matched.slice(1).map((item,i)=>periodDurationDays({start:matched[i].row.end,end:item.row.end}));
    if(gaps.every(days=>days>=70&&days<=110)) return {value:matched.reduce((sum,item)=>sum+item.value,0),end:matched[3].row.end,method:"Four quarters with exactly matched operating cash flow and capex periods"};
  }
  return null;
}
function companyDescription(ticker) {
  const known={
    AAPL:"Designs consumer devices, software and digital services.",
    NVDA:"Designs GPUs, AI computing chips and related software platforms.",
    INTC:"Designs and manufactures processors and other semiconductor chips for PCs, servers and AI systems. It also develops chip-manufacturing technology and provides foundry services to other chip designers.",
    AMD:"Designs CPUs, GPUs and adaptive computing chips for PCs, gaming consoles, data centers and AI systems.",
    AVGO:"Develops semiconductors and infrastructure software used in networking, broadband, wireless devices, data centers and enterprise IT.",
    ORCL:"Sells database software, cloud infrastructure and enterprise applications used to manage business data and operations.",
    NFLX:"Operates a subscription streaming service offering films, series, documentaries and games.",
    CRM:"Sells cloud-based customer relationship management software for sales, customer service, marketing and business operations.",
    PLTR:"Builds data integration, analytics and AI software used by businesses and government organizations.",
    COST:"Operates membership warehouses selling groceries, household goods, electronics and other products at bulk-oriented prices.",
    WMT:"Operates retail stores and e-commerce platforms selling groceries, household essentials, general merchandise and related services.",
    MRAM:"Develops and supplies magnetoresistive random-access memory products.",
    MU:"Designs and manufactures memory and storage semiconductors, including DRAM and NAND products used in data centers, computers, mobile devices and AI systems.",
    JPM:"Provides banking, lending, payments and financial services.",
    TSM:"Manufactures semiconductors for chip designers and technology companies.",
    "BRK.B":"A diversified holding company with insurance, rail, energy and other businesses.",
    MSFT:"Develops software, cloud services, devices and business productivity tools.",
    AMZN:"Operates online retail, cloud computing and digital services.",
    V:"Operates a global payments network connecting consumers, merchants, financial institutions and governments.",
    MA:"Operates a global payments network and provides payment technology and related services.",
    GOOGL:"Parent company of Google, with businesses in online search, advertising, cloud computing and digital services.",
    GOOG:"Parent company of Google, with businesses in online search, advertising, cloud computing and digital services.",
    META:"Operates social and messaging platforms including Facebook, Instagram and WhatsApp, and develops virtual-reality technologies.",
    TSLA:"Designs and sells electric vehicles, energy storage systems and related software.",
    MRVL:"Designs semiconductor solutions for data infrastructure, networking, storage and compute.",
    NVTS:"Develops gallium nitride and silicon carbide power semiconductors."
  };
  return known[ticker]||"A concise business description is not available in Northstar's verified local descriptions. Check the company's official investor-relations profile.";
}
async function loadAiResearchFallback({ticker,company,observations,quote,news,earnings,history,quarter,benchmarkHistory}) {
  const descriptionMissing=companyDescription(ticker).includes("not available");
  const missingFields=[];
  const coreGaps=[];
  const quoteDate=quote?.quoteTime?new Date(quote.quoteTime):null;
  const quoteAgeHours=quoteDate&&!Number.isNaN(quoteDate.getTime())?(Date.now()-quoteDate.getTime())/3600000:Infinity;
  const quoteInterval=String(quote?.interval||"").toLowerCase();
  const quoteLabel=String(quote?.delayedOrRealtime||"").toLowerCase();
  const quoteLooksDaily=quoteInterval==="1d"||quoteLabel.includes("daily interval")||quoteLabel.includes("not real-time");
  const quoteIsUsable=typeof quote?.price==="number"&&quote.price>0&&quoteAgeHours>=-2&&quoteAgeHours<=48&&!quoteLooksDaily;
  if(!quoteIsUsable) {
    const reason=typeof quote?.price==="number"&&quote.price>0?"current quote is stale or not sufficiently current":"current market quote is unavailable";
    missingFields.push(reason+"; recover only from a reliable market-data source");
    coreGaps.push("quote");
  }
  if(!annualSeries(observations,"revenue").length) { missingFields.push("latest reported annual revenue"); coreGaps.push("revenue"); }
  if(!annualSeries(observations,"netIncome").length) { missingFields.push("latest reported annual net income"); coreGaps.push("netIncome"); }
  if(!annualSeries(observations,"operatingCashFlow").length) { missingFields.push("latest reported annual operating cash flow"); coreGaps.push("operatingCashFlow"); }
  if(!quarter||typeof quarter.currentRevenue!=="number"||typeof quarter.currentIncome!=="number") {
    missingFields.push("latest reported quarterly revenue and net income, with fiscal period and filing date");
    coreGaps.push("quarterly financial report");
  }
  if(!history||!Array.isArray(history.data)||history.data.length<60) {
    missingFields.push("sufficient daily price history for trend and risk checks");
    coreGaps.push("price history");
  }
  if(!benchmarkHistory||!Array.isArray(benchmarkHistory.data)||benchmarkHistory.data.length<30) {
    missingFields.push("benchmark market history for market-relative context");
    coreGaps.push("benchmark history");
  }
  // Any detected gap can justify fallback, but only after the native providers above have been queried.
  if(descriptionMissing) { missingFields.push("plain-English company business description and products/services"); coreGaps.push("company description"); }
  if(!news||!Array.isArray(news.items)||news.items.length===0) { missingFields.push("recent company-specific news from reputable publishers"); coreGaps.push("news"); }
  if(!earnings||!earnings.available) { missingFields.push("upcoming earnings date or consensus expectations from a reliable source"); coreGaps.push("earnings"); }
  // Preserve credits: only call AI when at least one concrete native-data gap has been detected.
  if(!coreGaps.length) return null;
  const nativeContext={
    availableAnnualMetrics:["revenue","netIncome","operatingCashFlow","capex","dilutedShares"].map(key=>({field:key,available:annualSeries(observations,key).length>0})),
    quote:{available:Boolean(quote&&typeof quote.price==="number"&&quote.price>0),price:quote?.price??null,quoteTime:quote?.quoteTime??null,source:quote?.source??null},
    newsCount:Array.isArray(news?.items)?news.items.length:0,
    note:"Native data are authoritative. AI findings are supplemental research and must not silently overwrite numeric inputs or change the decision without validation."
  };
  try {
    const response=await fetch("/api/ai-research",{
      method:"POST",headers:{"Accept":"application/json","Content-Type":"application/json"},
      body:JSON.stringify({ticker,companyName:company?.name||ticker,missingFields,nativeContext}),
      signal:AbortSignal.timeout(45000)
    });
    const payload=await response.json().catch(()=>null);
    if(!response.ok||!payload?.available) return null;
    const panel=$("ai-research-panel"),root=$("ai-research-findings");
    if(!panel||!root) return payload;
    root.innerHTML="";
    const description=String(payload.companyDescription||"").trim();
    // Do not replace the authoritative company description with unverified model prose.
    // Only source-linked findings below are displayed as supplemental research.
    const findings=Array.isArray(payload.findings)?payload.findings:[];
    for(const item of findings) {
      const article=document.createElement("article");article.className="beginner-list-item";
      const heading=document.createElement("strong");heading.textContent=String(item.field||"Research finding");
      const value=document.createElement("p");value.textContent=String(item.value||"");
      const meta=document.createElement("p");meta.className="muted";
      meta.textContent=[item.sourceTitle,item.publishedDate?"Published "+item.publishedDate:"",item.asOfDate?"As of "+item.asOfDate:"","Confidence: "+(item.confidence||"unrated"),item.evidenceType?"Evidence: "+item.evidenceType:""].filter(Boolean).join(" · ");
      article.append(heading,value,meta);
      if(/^https?:\/\//i.test(String(item.sourceUrl||""))) { const link=document.createElement("a");link.href=item.sourceUrl;link.target="_blank";link.rel="noopener noreferrer";link.textContent="Open source";article.append(link); }
      root.append(article);
    }
    // Surface an AI-discovered earnings-date candidate in the earnings panel, but
    // never promote it to a confirmed event or use it to alter the decision.
    // Only exact ISO dates paired with an explicit source URL are eligible.
    if(earnings&&!earnings.available) {
      const candidate=findings.find(item =>
        /earnings.{0,24}(date|report)|(?:date|report).{0,24}earnings/i.test(String(item.field||"")) &&
        /\b20\d{2}-\d{2}-\d{2}\b/.test(String(item.value||"")) &&
        /^https?:\/\//i.test(String(item.sourceUrl||""))
      );
      if(candidate) {
        const panel=$("earnings-panel"),target=$("earnings-content");
        if(panel&&target) {
          panel.classList.remove("hidden");
          const article=document.createElement("article");article.className="news-item";
          const heading=document.createElement("strong");heading.textContent="AI-researched earnings-date candidate · unconfirmed";
          const dateMatch=String(candidate.value).match(/\b20\d{2}-\d{2}-\d{2}\b/);
          const detail=document.createElement("p");detail.textContent="Candidate date: "+dateMatch[0]+". This was found through AI-assisted web research and has not been verified by Northstar's calendar provider. Do not treat it as confirmed.";
          const link=document.createElement("a");link.href=candidate.sourceUrl;link.target="_blank";link.rel="noopener noreferrer";link.textContent="Check original source";
          article.append(heading,detail,link);target.prepend(article);
        }
      }
    }
    for(const note of (Array.isArray(payload.notes)?payload.notes:[])) { const p=document.createElement("p");p.className="muted";p.textContent=String(note);root.append(p); }
    if(!findings.length) return null;
    setText("ai-research-status",findings.length+" sourced finding"+(findings.length===1?"":"s"));
    setText("ai-research-intro","Northstar found additional source-linked context. Numerical inputs are not replaced by AI; the native engine remains responsible for calculations and decision rules.");
    panel.classList.remove("hidden");
    return payload;
  } catch { return null; }
}
function renderNorthstarQualityAudit({ticker,quote,history,benchmarkHistory,observations,news,earnings,quarter}) {
  const panel=$("northstar-quality-panel"),root=$("northstar-quality-findings");
  if(!panel||!root) return;
  root.innerHTML="";
  const issues=[];
  const quoteDate=quote?.quoteTime?new Date(quote.quoteTime):null;
  const quoteAgeHours=quoteDate&&!Number.isNaN(quoteDate.getTime())?(Date.now()-quoteDate.getTime())/3600000:Infinity;
  const quoteInterval=String(quote?.interval||"").toLowerCase();
  const quoteLabel=String(quote?.delayedOrRealtime||"").toLowerCase();
  const quoteIsDaily=quoteInterval==="1d"||quoteLabel.includes("daily interval")||quoteLabel.includes("not real-time");
  if(!(typeof quote?.price==="number"&&quote.price>0)) issues.push("Current quote is unavailable or invalid.");
  else if(quoteAgeHours>48||quoteAgeHours < -2||quoteIsDaily) issues.push("Quote may be stale, daily-only, or not suitable as a current intraday price.");
  if(!annualSeries(observations,"revenue").length) issues.push("Annual revenue is missing from native SEC-derived observations.");
  if(!annualSeries(observations,"netIncome").length) issues.push("Annual net income is missing from native SEC-derived observations.");
  if(!annualSeries(observations,"operatingCashFlow").length) issues.push("Annual operating cash flow is missing from native SEC-derived observations.");
  if(!quarter||typeof quarter.currentRevenue!=="number"||typeof quarter.currentIncome!=="number") issues.push("Comparable quarterly revenue and net income are not both available.");
  if(!Array.isArray(history?.data)||history.data.length<60) issues.push("Price-history coverage is limited; technical/risk checks may be withheld.");
  if(!Array.isArray(benchmarkHistory?.data)||benchmarkHistory.data.length<30) issues.push("Benchmark history is limited; market-relative context may be incomplete.");
  if(!Array.isArray(news?.items)||news.items.length===0) issues.push("No recent company-specific headlines were returned by native news feeds.");
  if(!earnings||!earnings.available) issues.push("Native earnings calendar or consensus data is unavailable or not verified.");
  const status=issues.length===0?"Core checks passed":" "+issues.length+" issue"+(issues.length===1?"":"s")+" detected";
  setText("northstar-quality-status",issues.length===0?"Core checks passed":issues.length+" issue"+(issues.length===1?"":"s"));
  setText("northstar-quality-summary",issues.length===0
    ?"Core completeness checks passed for "+ticker+". This is not a guarantee that every source is exhaustive or every figure is error-free."
    :"Northstar found "+issues.length+" data-quality limitation"+(issues.length===1?"":"s")+" for "+ticker+". Missing information is shown rather than silently guessed. AI fallback may be considered only after native checks.");
  for(const issue of issues){const p=document.createElement("p");p.className="muted";p.textContent="• "+issue;root.append(p);}
  if(!issues.length){const p=document.createElement("p");p.textContent="No core data gaps detected by these automated checks. Continue to review source dates and filing periods.";root.append(p);}
  panel.classList.remove("hidden");
  try {
    const key="northstar-quality-audit-v1";
    const prior=JSON.parse(localStorage.getItem(key)||"[]");
    const record={ticker,checkedAt:new Date().toISOString(),issueCount:issues.length,issues:issues.slice(0,12)};
    localStorage.setItem(key,JSON.stringify([record,...(Array.isArray(prior)?prior:[])].slice(0,50)));
  } catch {}
}
function setText(id,value) { const el=$(id); if(el)el.textContent=value; }
function addBeginnerNumber(root,{label,value,trend,explain,meta=""}) {
  const tile=document.createElement("article");tile.className="beginner-number-tile";
  const h=document.createElement("h4");h.textContent=label;
  const v=document.createElement("strong");v.textContent=value;
  const p=document.createElement("p");p.textContent=(trend?trend+" · ":"")+meta;
  const details=document.createElement("details");const summary=document.createElement("summary");summary.textContent="What is this?";
  const explanation=document.createElement("p");explanation.textContent=explain;details.append(summary,explanation);
  tile.append(h,v,p,details);root.append(tile);
}
function renderBeginnerOverview(data) {
  const root=$("beginner-overview");root.classList.remove("hidden");
  const {ticker,company,quote,history,benchmarkHistory,observations,earnings,news,state,reasonRule,valuation,valuationDecisionReady,gapCheck,annualDataAvailable,annualFundamentalPass,annualRevenueGrowth,quarterlyDataAvailable,quarterlyPass,quarter,annualIncome,annualFcf,missingInputs,flaggedHeadlines,daysToEarnings}=data;
  const fundamentalPass=annualFundamentalPass&&quarterlyPass;
  setText("beginner-company-name",titleCaseCompanyName(company?.name||ticker)+" ("+ticker+")");
  setText("beginner-company-description","“"+companyDescription(ticker)+"”");
  const quoteValid=typeof quote?.price==="number"&&quote.price>0;
  const quoteDate=quote?.quoteTime?new Date(quote.quoteTime):null;
  const quoteAgeHours=quoteDate&&!Number.isNaN(quoteDate.getTime())?(Date.now()-quoteDate.getTime())/3600000:Infinity;
  const quoteInterval=String(quote?.interval||"").toLowerCase();
  const quoteReliabilityLabel=String(quote?.delayedOrRealtime||"").toLowerCase();
  const dailySnapshot=quoteInterval==="1d"||quoteReliabilityLabel.includes("daily interval")||quoteReliabilityLabel.includes("not real-time");
  const quoteCurrent=quoteValid&&quoteAgeHours>=-2&&quoteAgeHours<=48&&!dailySnapshot;
  setText("beginner-price",quoteValid?fmtUsd(quote.price):"Price unavailable");
  const marketState=String(quote?.marketState||"").toUpperCase().replace(/[ _]/g,"-");
  const marketClosed=["CLOSED","POST","POSTPOST","PRE","PREPRE","AFTER-HOURS","AFTERMARKET","PRE-MARKET","PREMARKET"].includes(marketState);
  const market=$( "beginner-market-state" );market.className="market-state "+(marketState==="REGULAR"?"market-open":marketClosed?"market-closed":"");
  market.textContent=marketState==="REGULAR"?"Market open":marketClosed?"Market closed / outside regular hours":"Market status unknown";
  let verdict="WAIT — no validated entry yet",verdictClass="caution",why="Northstar should still provide the company, financial, earnings, price-history and news evidence below. A WAIT is the actionable decision when evidence does not support a validated entry; it is not a claim that the company has no useful data.";
  if(state==="AVOID"){verdict="AVOID — company-quality warning";verdictClass="bad";why="The company's reported financial checks failed. "+reasonRule+" Review the failed metrics and original SEC filings before reconsidering.";}
  else if(state==="INSUFFICIENT DATA"){verdict="PRELIMINARY — only "+(data.researchCoverageCount??0)+"/5 core checks verified";verdictClass="unknown";why="The available evidence is limited, so Northstar cannot make a dependable valuation call. It should still show every verified metric, available headline and the exact missing checks rather than stop at this label. Missing: "+(missingInputs.length?missingInputs.join("; "):"no specific missing-input list was returned")+".";
  } else if(gapCheck?.blocked){verdict="WAIT — valuation not verified";verdictClass="caution";why="Northstar could not confidently verify the stock’s estimated value, so it is withholding a buy recommendation and price targets. Review the company’s financial results, upcoming earnings and recent news before deciding.";}
  else if(!quoteValid||!annualDataAvailable||!quarterlyDataAvailable){verdict="WAIT — preliminary analysis";verdictClass="caution";why="Some inputs are missing or unmatched, but the available company, financial, earnings and news evidence should still be reviewed. "+reasonRule+". The missing checks limit valuation confidence; they do not erase the available research.";}
  else if(!valuationDecisionReady){
    verdict=fundamentalPass?"WAIT — valuation unverified":"WAIT — business/valuation checks incomplete";
    verdictClass="caution";
    why=fundamentalPass?"Business fundamentals pass the basic screen, but a reliable per-share valuation is missing. Do not buy solely on business quality; reassess when valuation is verified.":"The available evidence does not yet support a buy decision. Review the available financials and risks; reassess when the missing checks are verified.";
  }
  else if(flaggedHeadlines.length||(daysToEarnings!==null&&daysToEarnings<=7)){verdict="WAIT — review event/news risk";verdictClass="caution";why=flaggedHeadlines.length?"Recent headlines contain possible risk terms. Open the original sources below and check what actually happened before opening a new position.":"Earnings are expected within "+Math.max(0,Math.round(daysToEarnings))+" day(s). Review the report and market reaction before opening a new position.";}
  else if(quote.price/valuation.base<0.8){verdict="POTENTIAL VALUE — not a validated BUY";verdictClass="good";why="The quote is below the illustrative model value and the configured basic checks passed. This is a research lead, not an approved BUY signal; review growth, cash flow, valuation assumptions and risks before acting.";}
  else if(quote.price/valuation.base<=1.2){verdict="HOLD / WAIT — near model value";verdictClass="caution";why="The quote is within 20% of the illustrative model value. The model is not a price target; compare growth, margins, free cash flow, balance-sheet risk and upcoming events before deciding.";}
  else {verdict="WAIT — price above model estimate";verdictClass="bad";why="The quote is more than 20% above the illustrative model value. That simplified model is not a price target, but the premium argues against chasing; review growth, margins, cash generation, risks and the assumptions driving the estimate.";}
  // Keep the plain-English valuation summary consistent with the stricter decision engine.
  // A low model estimate alone must never produce a green/attractive verdict when core evidence is missing.
  if(state==="INSUFFICIENT DATA") {
    verdict="Insufficient data — no valuation conclusion";
    verdictClass="unknown";
    why="The model may calculate an illustrative value, but Northstar has not verified every required input. Do not treat the price/model comparison as an attractive setup.";
  } else if(state==="WAIT" || state==="AVOID" || state==="SELL REVIEW") {
    if(verdict==="Looks attractive") {
      verdict="Potential value — not cleared";
      verdictClass="caution";
      why="The illustrative model value is above the quote, but Northstar's decision checks do not clear this stock for an entry. Review the missing data and risk warnings first.";
    }
  }
  // One canonical decision drives the overview, meter and advisor card.
  if(state==="AVOID"){verdict="AVOID — company-quality warning";verdictClass="bad";why="One or more configured company-quality checks failed. Review the failed metrics and original filings before reconsidering.";}
  else if(state==="SELL REVIEW"){verdict="SELL REVIEW — verify risk";verdictClass="bad";why="Potential risk headlines require checking the original sources. This is a review flag, not an automatic sell instruction.";}
  else if(state==="INSUFFICIENT DATA"){verdict="WAIT — insufficient verified data";verdictClass="unknown";why="Northstar cannot make a dependable decision until the required missing data is verified.";}
  else if(state==="BUY SETUP — UNVALIDATED"){verdict="WAIT — buy setup not validated";verdictClass="caution";why="Some configured checks passed, but historical strategy validation is incomplete. This is not an approved BUY.";}
  else if(state==="BUY"){verdict="BUY — validation checks passed";verdictClass="good";why="The configured checks and historical validation passed. Review risk and source data independently; this remains research, not a guarantee.";}
  else if(state==="HOLD"){verdict="WAIT — no new buy signal";verdictClass="caution";why="The current evidence does not support a new entry. Reassess when the relevant price, valuation or risk conditions change.";}
  else if(state==="WAIT"){
    verdict="WAIT — no validated entry";verdictClass="caution";
    if(gapCheck?.blocked){verdict="WAIT — valuation not verified";why="Northstar could not confidently verify the stock’s estimated value. It is withholding a buy recommendation and estimated entry price to avoid misleading you.";}
    else if(!quoteCurrent){why=dailySnapshot?"The available price is a daily snapshot, not a verified current quote.":"A recent timestamped quote is not verified.";}
    else if(!valuationDecisionReady){why="Valuation is not verified, so Northstar withholds fair value and entry levels.";}
    else if(flaggedHeadlines.length){why="Potential risk headlines need source review before considering a new entry.";}
    else if(daysToEarnings!==null&&daysToEarnings<=7){why="Earnings are expected within "+Math.max(0,Math.round(daysToEarnings))+" day(s); review the report and market reaction before entering.";}
  }
  setText("beginner-verdict-title",verdict);setText("beginner-verdict-reason",why);
  const verdictBox=$("beginner-verdict");verdictBox.className="beginner-verdict verdict-"+verdictClass;
  const dot=$("beginner-verdict-dot");dot.className="meaning-dot "+verdictClass;
  const quoteFresh=quoteValid&&quoteAgeHours>=-2&&quoteAgeHours<=48&&!["1d","daily"].includes(String(quote?.interval||"").toLowerCase());
  const confidenceInputs=[quoteFresh,annualDataAvailable,quarterlyDataAvailable,Boolean(earnings?.verified),Boolean(history?.data?.length)];
  const coreCount=confidenceInputs.filter(Boolean).length;
  const decisionConfidenceBlocked=!valuationDecisionReady||Boolean(gapCheck?.blocked)||!quoteFresh||!annualDataAvailable||!quarterlyDataAvailable;
  const confidence=decisionConfidenceBlocked?"low":coreCount>=5?"high":coreCount>=3?"medium":"low";
  const confidenceReasons=[];
  if(!quoteFresh)confidenceReasons.push("quote is stale or has no exact timestamp");
  if(!annualDataAvailable)confidenceReasons.push("annual facts are not fully matched");
  if(!quarterlyDataAvailable)confidenceReasons.push("latest-quarter facts are incomplete");
  if(!earnings?.verified)confidenceReasons.push("earnings date is not verified");
  if(!history?.data?.length)confidenceReasons.push("price history is unavailable");
  const confidenceBadge=$("beginner-confidence");confidenceBadge.className="confidence-badge confidence-"+confidence;
  confidenceBadge.textContent="Research coverage: "+coreCount+"/5 core checks · Valuation confidence: "+(decisionConfidenceBlocked?"Limited":confidence[0].toUpperCase()+confidence.slice(1))+(gapCheck?.blocked?" · estimated value not verified":confidenceReasons.length?" · "+confidenceReasons.slice(0,2).join(", "):"");
  const health=annualFundamentalPass&&quarterlyPass?"Strong":(annualDataAvailable&&quarterlyDataAvailable&&(annualFundamentalPass||quarterlyPass)?"OK":annualDataAvailable&&quarterlyDataAvailable?"Weak":"Unknown");
  setText("score-business",health);
  setText("score-business-detail",annualDataAvailable&&quarterlyDataAvailable?"Annual revenue growth "+(annualRevenueGrowth*100).toFixed(1)+"%; latest quarter "+(quarter.revenueYoY===null?"YoY comparison unavailable":(quarter.revenueYoY*100).toFixed(1)+" YoY")+".":"Not enough matched annual and quarterly facts to score business health.");
  const other=latestFact(observations,"otherIncome"),pretax=latestFact(observations,"pretaxIncome");
  const oneOffFlag=Boolean(other&&pretax&&other.end===pretax.end&&pretax.value!==0&&Math.abs(other.value/pretax.value)>0.05);
  const riskCount=(flaggedHeadlines?.length||0)+(missingInputs?.length||0)+(daysToEarnings!==null&&daysToEarnings<=7?1:0)+(gapCheck?.blocked?1:0)+(oneOffFlag?1:0);
  const riskLevel=riskCount>=4?"High":riskCount>=2?"Medium":riskCount===0?"Low":"Medium";
  setText("score-risk",riskLevel);setText("score-risk-detail",riskCount+" detected warning(s). Missing data lowers confidence; no risk scan can identify every risk.");
  const riskRoot=$("beginner-risks");riskRoot.innerHTML="";
  const risks=[];
  for(const item of flaggedHeadlines||[]) risks.push({text:"Potential risk headline: "+item.title,meta:(item.source||"Source unavailable")+(item.publishedAt?" · "+new Date(item.publishedAt).toLocaleString():"")});
  if(daysToEarnings!==null&&daysToEarnings<=7) risks.push({text:"Earnings are expected within "+Math.max(0,Math.round(daysToEarnings))+" day(s). Price swings may be larger than usual.",meta:"Event risk · "+((earnings?.events||[]).filter(event=>event.reportDate>=newYorkDateOnly()).sort((a,b)=>a.reportDate.localeCompare(b.reportDate))[0]?.reportDate||"date not verified")});
  if(gapCheck?.blocked) risks.push({text:"The current quote and simplified valuation are outside the comparison band; a price conclusion is withheld.",meta:"Valuation reliability risk"});
  if(oneOffFlag) risks.push({text:"Other non-operating income is more than 5% of pre-tax income; reported profit may include one-off or non-core items.",meta:"Same reported period ended "+fmtDate(other.end)});
  for(const item of missingInputs||[]) {
    const raw=String(item||"");
    let title="Additional data required";
    let detail=raw;
    if(/free cash flow|dcf|discounted cash flow/i.test(raw)) {
      title="DCF valuation unavailable";
      detail="Free-cash-flow history does not meet the model's validation criteria. No DCF estimate is presented.";
    } else if(/earnings|reporting date|calendar/i.test(raw)) {
      title="Earnings date unconfirmed";
      detail="The next reporting date could not be confirmed from the available calendar sources.";
    } else if(/share.?count|shares outstanding/i.test(raw)) {
      title="Share count needs confirmation";
      detail="A sufficiently current, source-backed share count was not available for valuation.";
    } else if(/benchmark|history|historical price/i.test(raw)) {
      title="Market benchmark data incomplete";
      detail="There is not enough validated benchmark history for a reliable market-relative comparison.";
    } else if(/revenue|income|cash flow|financial/i.test(raw)) {
      title="Financial data incomplete";
      detail="Required financial inputs are missing or do not meet the report's validation criteria.";
    }
    const dataLimitation=/unconfirmed|unavailable|incomplete|needs confirmation|could not|insufficient|missing/i.test(title+" "+detail);
    risks.push({text:title,meta:detail,severity:dataLimitation?"caution":"bad"});
  }
  if(!risks.length) risks.push({text:"No high-priority automated warning was identified in the available inputs. This does not mean the stock is risk-free.",meta:"Limited automated screen",severity:"caution"});
  for(const item of risks.slice(0,3)){const card=document.createElement("article");card.className="beginner-list-item";const title=document.createElement("strong");const dot=document.createElement("span");dot.className="meaning-dot "+(item.severity==="caution"?"caution":"bad");title.textContent=item.text;title.append(dot);const meta=document.createElement("p");meta.textContent=item.meta;card.append(title,meta);riskRoot.append(card);}
  const headlineRoot=$("beginner-headlines");headlineRoot.innerHTML="";
  const allHeadlines=(news?.items||[]).filter(item=>item.title&&isRecentHeadline(item));
  const importantTerms=/\b(earnings|revenue|profit|loss|guidance|forecast|outlook|acquisition|merger|deal|lawsuit|investigation|regulator|approval|recall|dividend|buyback|downgrade|upgrade|price target|breach|outage|layoff|contract|partnership|CEO|CFO|resign|misses|beats|record)\b/i;
  const riskTerms=/\b(misses|loss|lawsuit|investigation|probe|recall|downgrade|fraud|breach|outage|layoff|decline|warning|fine|ban|weak demand|disappoint)\b/i;
  const positiveTerms=/\b(beats|raises guidance|upgrade|approval|record revenue|profit rises|growth accelerates|buyback|dividend increase|major contract|wins contract|strong demand)\b/i;
  const rankNews=item=>(importantTerms.test(item.title)?3:0)+(riskTerms.test(item.title)||positiveTerms.test(item.title)?2:0)+(item.publishedAt&&Number.isFinite(Date.parse(item.publishedAt))?1:0);
  const headlines=[...allHeadlines].sort((a,b)=>rankNews(b)-rankNews(a)||String(b.publishedAt||"").localeCompare(String(a.publishedAt||""))).slice(0,3);
  if(!headlines.length){const empty=document.createElement("p");empty.className="muted";empty.textContent="No company-specific headlines were returned. The absence of headlines is not evidence that nothing happened.";headlineRoot.append(empty);}
  for(const item of headlines){const card=document.createElement("article");card.className="beginner-list-item";const link=document.createElement("a");link.href=item.url;link.target="_blank";link.rel="noopener noreferrer";link.textContent=item.title;const meta=document.createElement("p");const date=item.publishedAt?new Date(item.publishedAt):null;meta.textContent=(item.source||"Source unavailable")+(date&&!Number.isNaN(date.getTime())?" · "+date.toLocaleString():" · Time unavailable");card.append(link,meta);headlineRoot.append(card);}
}

function renderPriceGauge(decision, evidenceScore, evidenceConfidence, evidenceSummary, hardQualityFailure=false, scoreDetails={}) {
  const priceRow=$("beginner-price")?.parentElement;
  if(!priceRow)return;
  let gauge=$("beginner-price-gauge");
  if(!gauge){
    gauge=document.createElement("section");
    gauge.id="beginner-price-gauge";
    gauge.className="price-gauge";
    gauge.setAttribute("aria-label","Northstar five-zone evidence and risk gauge");
    const top=document.createElement("div");top.className="price-gauge-top";
    const label=document.createElement("p");label.className="eyebrow";label.textContent="NORTHSTAR EVIDENCE GAUGE";
    const status=document.createElement("span");status.className="price-gauge-status";status.textContent="Research only";
    top.append(label,status);
    const arc=document.createElement("div");arc.className="price-gauge-arc";
    const needle=document.createElement("div");needle.id="price-gauge-needle";needle.className="price-gauge-needle";
    const hub=document.createElement("div");hub.className="price-gauge-hub";
    arc.append(needle,hub);
    const labels=document.createElement("div");labels.className="price-gauge-labels";
    for(const [word,cls] of [["HIGH RISK","sell"],["CAUTION","orange"],["MIXED","wait"],["IMPROVING","lime"],["POSITIVE","buy"]]){
      const span=document.createElement("span");span.className=cls;span.textContent=word;labels.append(span);
    }
    const message=document.createElement("p");message.id="price-gauge-message";message.className="price-gauge-message";
    gauge.append(top,arc,labels,message);
    priceRow.insertAdjacentElement("afterend",gauge);
  }
  // Score is the weighted evidence balance (-100 to +100), not a probability.
  const rawScore=Math.max(-100,Math.min(100,Number.isFinite(evidenceScore)?evidenceScore:0));
  const confidence=Math.max(0,Math.min(100,Number.isFinite(evidenceConfidence)?evidenceConfidence:0));
  const insufficientCoverage=confidence<85 || scoreDetails.scoreEligible===false;
  // This is an evidence-direction gauge, not the company-quality or trade-decision badge.
  // Keep the needle neutral when coverage is insufficient; show hard quality decisions separately.
  const score=insufficientCoverage?0:rawScore;
  // Five equal zones across the semicircle: -100..-60 red, -60..-25 orange,
  // -25..+25 yellow, +25..+60 lime, +60..+100 green.
  const angle=score*0.9;
  let tone="wait",label="YELLOW · MIXED / WAIT";
  if(insufficientCoverage) {
    tone="wait";label=scoreDetails.sectorModelBlock?"YELLOW · SECTOR MODEL NOT VERIFIED":"YELLOW · INSUFFICIENT EVIDENCE";
  } else if(score<=-60) {
    tone="sell";label="RED · HIGH RISK";
  } else if(score<=-25) {
    tone="orange";label="ORANGE · CAUTION";
  } else if(score<25) {
    tone="wait";label="YELLOW · MIXED / WAIT";
  } else if(score<60) {
    tone="lime";label="LIME · IMPROVING";
  } else if(decision==="BUY") {
    tone="buy";label="GREEN · STRONG POSITIVE";
  } else {
    tone="lime";label="LIME · POSITIVE, NOT CLEARED";
  }
  const needle=$("price-gauge-needle");
  needle.style.transform="translateX(-50%) rotate("+angle+"deg)";
  needle.dataset.tone=tone;
  const status=gauge.querySelector(".price-gauge-status");status.textContent=label;status.dataset.tone=tone;
  const decisionNote=decision==="BUY"
    ?"Official decision: BUY; historical validation remains a separate hard approval gate."
    :"Official decision: "+decision+"; this decision is separate from the evidence gauge.";
  const missingFactors=Array.isArray(scoreDetails.missingFactors)?scoreDetails.missingFactors:[];
  const qualityGateStatus=scoreDetails.qualityGateStatus||
    (hardQualityFailure?"FAILED":scoreDetails.qualityGatePassed===true?"PASSED":"NOT VERIFIED");
  const qualityNote=qualityGateStatus==="FAILED"
    ?" Company-quality gate: FAILED. "+(scoreDetails.qualityFailureReason||"Review the failed financial checks in the decision details.")
    :" Company-quality gate: "+qualityGateStatus+".";
  const coverageNote=insufficientCoverage
    ?(scoreDetails.sectorModelBlock||"Evidence coverage is below the required 85%.")+" The needle is intentionally neutral."
    :"Evidence coverage meets the minimum required for a directional reading.";
  $("price-gauge-message").textContent=
    "Evidence balance: "+Math.round(score)+"/100 · raw contribution: "+Number(scoreDetails.rawWeightedPoints||0).toFixed(1)+"/100 · coverage: "+Math.round(confidence)+"% ("+Number(scoreDetails.observedWeight||0)+"/100 weight). "+
    coverageNote+
    (missingFactors.length?" Missing / unverified: "+missingFactors.join("; ")+".":"")+
    qualityNote+" "+evidenceSummary+" "+decisionNote+
    " This is an evidence balance, not a probability or expected return. Historical validation is separate and must pass before BUY can be enabled.";
  gauge.dataset.tone=tone;
}
function reconcileFmpWithSec(fmpFundamentals, observations) {
  const checks = [];
  if (!fmpFundamentals?.available) return { status: "unavailable", checks, matched: 0, passed: 0, summary: "FMP data unavailable; SEC remains primary." };
  const mappings = [
    ["Revenue", "income", "revenue", "revenue"],
    ["Net income", "income", "netIncome", "netIncome"],
    ["Total assets", "balance", "totalAssets", "assets"],
    ["Total liabilities", "balance", "totalLiabilities", "liabilities"],
    ["Operating cash flow", "cashflow", "operatingCashFlow", "operatingCashFlow"]
  ];
  for (const [label, group, field, secKey] of mappings) {
    const rows = fmpFundamentals.history?.[group] || [];
    const fmp = rows.find(row => row?.date === fmpFundamentals.latest?.fiscalDate && Number.isFinite(row?.[field]));
    if (!fmp) { checks.push({label, status:"not_comparable", detail:"No matching FMP value for the latest reported period."}); continue; }
    if (fmp.reportedCurrency && fmp.reportedCurrency !== "USD") {
      checks.push({label,status:"not_comparable",detail:"FMP reports "+fmp.reportedCurrency+"; currency conversion is not applied."}); continue;
    }
    const secRows = annualSeries(observations, secKey).filter(row => row.end === fmp.date && row.unit === "USD");
    if (!secRows.length) { checks.push({label,status:"not_comparable",detail:"No SEC annual USD observation for fiscal year ending "+fmp.date+"."}); continue; }
    const sec = secRows[secRows.length - 1];
    const diff = Math.abs(fmp[field] - sec.value) / Math.max(Math.abs(sec.value), 1);
    const passed = diff <= 0.02;
    checks.push({label,status:passed?"match":"mismatch",differencePercent:diff*100,detail:passed?"FMP and SEC agree within 2% for "+fmp.date+".":"FMP and SEC differ by "+(diff*100).toFixed(2)+"% for "+fmp.date+"; review filing tags, period and accounting treatment."});
  }
  const matched = checks.filter(x => x.status === "match" || x.status === "mismatch").length;
  const passed = checks.filter(x => x.status === "match").length;
  const status = checks.some(x => x.status === "mismatch") ? "mismatch" : matched >= 3 && passed === matched ? "matched" : "partial";
  return {status,checks,matched,passed,summary:passed+"/"+matched+" comparable SEC/FMP metrics agree within 2%; "+checks.filter(x=>x.status==="not_comparable").length+" are not comparable."};
}
function renderDecision({ticker,company,observations,facts,quote,history,benchmarkHistory,news,earnings,quarter,fmpFundamentals}) {
  latestDecisionContext = null;
  const panel=$("recommendation-panel"); panel.classList.remove("hidden");
  const grid=$("decision-metrics"),checks=$("decision-checks");
  grid.innerHTML=""; checks.innerHTML="";
  const sicCode=Number(company?.sic);
  const isFinancialInstitution=Number.isFinite(sicCode)&&sicCode>=6000&&sicCode<=6799;
  const valuation=isFinancialInstitution?{available:false,reason:"Not applicable: SEC classifies this issuer as a financial institution. Northstar does not apply its industrial-company free-cash-flow DCF to banks, insurers or investment firms; a sector-specific model and capital/credit-quality inputs are required."}:buildDcfEstimate(observations);
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
  const newsCatalystResult=aggregateNewsCatalysts(recentHeadlines);
  const flaggedHeadlines=recentHeadlines.filter(item=>{const c=classifyNewsCatalyst(item);return c.category==="negative"&&c.scoreEligible;});
  const rev=annualSeries(observations,"revenue");
  const income=annualSeries(observations,"netIncome");
  const fcf=(()=>{const c=annualSeries(observations,"operatingCashFlow"),x=annualSeries(observations,"capex");return c.map(row=>{const cap=x.find(item=>item.end===row.end&&item.start===row.start&&item.unit===row.unit);return cap?{end:row.end,start:row.start,value:row.value-Math.abs(cap.value)}:null;}).filter(Boolean).sort((a,b)=>a.end.localeCompare(b.end));})();
  const latestRevenue=rev[rev.length-1],priorRevenue=rev[rev.length-2];
  const latestIncome=latestRevenue?income.find(item=>item.end===latestRevenue.end&&item.start===latestRevenue.start&&item.unit===latestRevenue.unit):null;
  const latestFcf=latestRevenue?fcf.find(item=>item.end===latestRevenue.end&&item.start===latestRevenue.start):null;
  const annualCoreAvailable=Boolean(latestRevenue&&priorRevenue&&priorRevenue.value>0&&
    typeof latestRevenue.value==="number"&&Number.isFinite(latestRevenue.value)&&
    latestIncome&&Number.isFinite(latestIncome.value));
  const annualDataAvailable=Boolean(annualCoreAvailable&&
    (isFinancialInstitution||(latestFcf&&Number.isFinite(latestFcf.value))));
  const annualRevenueGrowth=annualDataAvailable?latestRevenue.value/priorRevenue.value-1:null;
  const annualFundamentalPass=Boolean(annualDataAvailable&&latestRevenue.value>0&&
    latestIncome.value>0&&(isFinancialInstitution||latestFcf.value>0)&&annualRevenueGrowth>=-0.10);
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
    {label:"Current price",ok:quoteCurrent,detail:quoteCurrent?(quote?.quoteTime?"Provider quote timestamp "+quoteDate.toLocaleString():quote?.quoteLabel?"Provider quote date: "+quote.quoteLabel+"; exact trade time was not supplied":"Provider date/time "+quoteDate.toLocaleString()):(dailySnapshot?"Provider returned a daily-bar snapshot, not a current quote":"Quote unavailable, missing a usable date/time, or older than 48 hours")},
    {label:"Valuation inputs / market-gap review",ok:valuationDecisionReady,detail:!valuation.available?valuation.reason:!quoteCurrent?"Raw DCF inputs exist, but no reliable recent timestamped quote is available; entry/exit levels are withheld.":gapCheck.blocked?gapCheck.reason:"Matched annual USD inputs and recent SEC share count passed basic checks; this remains an illustrative, unvalidated DCF."},
    {label:"Annual fundamentals",ok:annualFundamentalPass,detail:annualFundamentalPass?"Latest annual revenue, net income and approximate FCF are positive; annual revenue has not dropped more than 10% year over year":"Annual quality filter failed or comparable data is missing"},
    {label:"Latest quarterly trend",ok:quarterlyPass,detail:quarterlyPass?"Quarterly revenue/net income are positive and revenue is no worse than -15% year over year":"Latest quarterly net income, same-quarter revenue comparison, or quality threshold did not pass"},
    {label:"Earnings/event risk",ok:earningsVerified,detail:earningsVerified?(daysToEarnings<=7?"Earnings in "+Math.max(0,Math.round(daysToEarnings))+" day(s) — avoid new entry before this event":"Next "+(earnings?.provider||"provider-listed")+" date "+fmtDate(nextEvent.reportDate)):"Next earnings date not confirmed by this provider"},
    {label:"Recent news",ok:recentHeadlines.length>0&&!flaggedHeadlines.length,detail:recentHeadlines.length?(flaggedHeadlines.length?flaggedHeadlines.length+" recent headline(s) contain risk keywords and need source review":recentHeadlines.length+" timestamped headline(s) from the last 7 days"):"No timestamped headlines in the last 7 days"},
    {label:"Price risk level",ok:invalidation!==null&&invalidation>0,detail:invalidation!==null&&invalidation>0?"Based on 14-day average true range: "+fmtUsd(invalidation):"ATR risk level unavailable from complete daily high/low data"},
    {label:"Historical validation",ok:false,detail:"Complete walk-forward and untouched holdout validation is not finished; any BUY shown remains provisional and unvalidated."}
  ];
  const fmpReconciliation = reconcileFmpWithSec(fmpFundamentals, observations);
  dataChecks.push({
    label: "FMP vs SEC period-matched reconciliation",
    ok: fmpReconciliation.status === "matched",
    detail: fmpReconciliation.summary + " This is a data-quality cross-check only; it does not increase the BUY score or bypass historical validation."
  });
  const latestAssets=latestRevenue?annualSeries(observations,"assets").find(item=>item.end===latestRevenue.end):null;
  const latestLiabilities=latestRevenue?annualSeries(observations,"liabilities").find(item=>item.end===latestRevenue.end):null;
  const liquidityAvailable=Boolean(latestAssets&&latestLiabilities&&Number.isFinite(latestAssets.value)&&Number.isFinite(latestLiabilities.value));
  const liquidityRatio=liquidityAvailable&&latestLiabilities.value>0?latestAssets.value/latestLiabilities.value:null;
  const growthScreen={label:"Growth screen",ok:annualDataAvailable&&annualRevenueGrowth>=0&&quarterlyDataAvailable&&quarter.revenueYoY>=0,
    detail:!annualDataAvailable||!quarterlyDataAvailable?"WARN — comparable annual or quarterly revenue is missing.": "Annual revenue growth "+(annualRevenueGrowth*100).toFixed(1)+"% (period ending "+latestRevenue.end+"); latest-quarter revenue YoY "+(quarter.revenueYoY*100).toFixed(1)+"% (period ending "+quarter.periodEnd+"). Rule: both must be >= 0%."};
  const profitabilityScreen={label:"Profitability screen",ok:annualDataAvailable&&latestIncome.value>0&&(isFinancialInstitution||latestFcf.value>0)&&quarterlyDataAvailable&&quarter.currentIncome>0,
    detail:!annualDataAvailable||!quarterlyDataAvailable?"WARN — comparable annual/quarterly profitability facts are missing.":isFinancialInstitution?"Annual net income "+fmtMoney(latestIncome.value)+" and latest-quarter net income "+fmtMoney(quarter.currentIncome)+" are positive. Bank cash-flow/FCF is excluded from this industrial-company profitability test; bank-specific credit and capital quality remain unassessed.":"Annual net income "+fmtMoney(latestIncome.value)+" and approximate annual FCF "+fmtMoney(latestFcf.value)+" (period ending "+latestRevenue.end+"); latest-quarter net income "+fmtMoney(quarter.currentIncome)+". Rule: all reported values must be positive."};
  const liquidityScreen=isFinancialInstitution?{label:"Liquidity / capital screen",ok:false,notApplicable:true,detail:"Not applicable: a simple assets-to-liabilities test is not a bank capital or liquidity adequacy measure. CET1, risk-weighted assets, liquidity coverage and regulatory capital disclosures require a dedicated sector model."}:{label:"Liquidity screen",ok:liquidityAvailable&&latestAssets.value>=latestLiabilities.value,
    detail:!liquidityAvailable?"WARN — matched annual assets/liabilities are unavailable.":"Assets "+fmtMoney(latestAssets.value)+"; liabilities "+fmtMoney(latestLiabilities.value)+" (period ending "+latestRevenue.end+"); assets/liabilities "+(liquidityRatio===null?"not calculable":liquidityRatio.toFixed(2)+"x")+". Rule: assets must be >= liabilities. This is a broad balance-sheet check, not a current ratio."};
  const cashFlowScreen=isFinancialInstitution?{label:"Free-cash-flow screen",ok:false,notApplicable:true,detail:"Not applicable: operating cash flow and capex do not provide a comparable industrial-company FCF signal for this financial institution. No FCF penalty or DCF valuation is applied."}:{label:"Cash-flow screen",ok:annualDataAvailable&&latestFcf.value>0,
    detail:!annualDataAvailable?"WARN — matched annual operating cash flow and capex are unavailable.":"Approximate FCF = operating cash flow minus absolute capex = "+fmtMoney(latestFcf.value)+" (period ending "+latestFcf.end+"). Rule: positive latest annual FCF; no TTM substitution is claimed."};
  const eventRiskScreen={label:"Event-risk screen",ok:earningsVerified&&daysToEarnings>3&&flaggedHeadlines.length===0,
    detail:!earningsVerified?"WARN — next earnings date is not verified.":daysToEarnings<=3?"FAIL — earnings expected within "+Math.max(0,Math.round(daysToEarnings))+" days.":flaggedHeadlines.length?"WARN — "+flaggedHeadlines.length+" recent headline(s) match risk keywords.":"No keyword-triggered risk headline found in recent timestamped coverage; this is not proof that no material event exists."};
  dataChecks.push(growthScreen,profitabilityScreen,liquidityScreen,cashFlowScreen,eventRiskScreen);
  // Explicit decision states are shown for every research run. BUY remains locked until
  // point-in-time walk-forward and untouched holdout validation demonstrate a credible edge.
  // Missing third-party news or earnings coverage is disclosed as uncertainty,
  // not silently treated as positive evidence or made a permanent hard blocker.
  // Verified near-term earnings and identified material-risk headlines still block.
  const eventWindowClear = daysToEarnings===null || daysToEarnings>7;
  const coreEvidencePass = quoteCurrent && valuationDecisionReady && annualFundamentalPass &&
    quarterlyPass && flaggedHeadlines.length===0 && atr!==null && Number.isFinite(atr) &&
    rewardRisk!==null && Number.isFinite(rewardRisk);
  const buySetupPass = coreEvidencePass && eventWindowClear && priceInEntryRange &&
    rewardRisk>=2 && invalidation!==null && invalidation>0 && invalidation<entryLow && plannedShares>0;
  const historicalValidationPass = false; // Fail closed until a real validation report is reviewed and approved.
  const missingInputs=[];
  if(!quoteCurrent) missingInputs.push(dailySnapshot?"a verified current quote (the available price is a daily snapshot)":"a recent timestamped market quote");
  if(!valuation.available) missingInputs.push(valuation.reason||"matched, fresh DCF inputs");
  if(!annualDataAvailable) missingInputs.push("comparable annual financial statements");
  if(!quarterlyDataAvailable) missingInputs.push("a comparable latest-quarter financial report");
  if(!earningsVerified) missingInputs.push("earnings date unavailable (event-risk warning)");
  if(!recentHeadlines.length) missingInputs.push("recent news coverage unavailable (news-risk warning)");
  if(atr===null||!Number.isFinite(atr)) missingInputs.push("complete daily high/low price history for risk measurement");
  // Overall research coverage uses five core checks. Three or more supports a
  // useful, caveated overview; trade/valuation gates below remain independently strict.
  const researchCoverageCount=[quoteCurrent,annualDataAvailable,quarterlyDataAvailable,earningsVerified,Boolean(history?.data?.length)].filter(Boolean).length;
  const decisionInputsIncomplete=missingInputs.length>0;
  const insufficientData=researchCoverageCount<=2;
  let state;
  if (fundamentalAvoid) state="AVOID";
  else if (dailySnapshot) state="WAIT";
  else if (gapCheck.blocked) state="WAIT";
  else if (insufficientData) state="INSUFFICIENT DATA";
  else if (decisionInputsIncomplete && (!quoteCurrent || !annualDataAvailable || !quarterlyDataAvailable || !Number.isFinite(atr))) state="WAIT";
  else if (!valuationDecisionReady || (daysToEarnings!==null && daysToEarnings<=7)) state="WAIT";
  else if (flaggedHeadlines.length) state="WAIT";
  else if (buySetupPass && !historicalValidationPass) state="BUY SETUP — UNVALIDATED";
  else if (buySetupPass && historicalValidationPass) state="BUY";
  else state="WAIT";
  const fundamentalFailureReasons=[];
  if(annualDataAvailable) {
    if(latestRevenue.value<=0) fundamentalFailureReasons.push("annual revenue is not positive");
    if(latestIncome.value<=0) fundamentalFailureReasons.push("annual net income is not positive");
    if(latestFcf.value<=0) fundamentalFailureReasons.push("latest annual free cash flow is not positive");
    if(annualRevenueGrowth< -0.10) fundamentalFailureReasons.push("annual revenue declined more than the 10% quality threshold");
  }
  if(quarterlyDataAvailable) {
    if(quarter.currentRevenue<=0) fundamentalFailureReasons.push("latest quarterly revenue is not positive");
    if(quarter.currentIncome<=0) fundamentalFailureReasons.push("latest quarterly net income is not positive");
    if(quarter.revenueYoY< -0.15) fundamentalFailureReasons.push("quarterly revenue declined more than the 15% quality threshold year over year");
  }
  const reasonRule=fundamentalAvoid
    ?"Fundamental quality checks failed: "+(fundamentalFailureReasons.join("; ")||"one or more configured financial thresholds were not met")
    :dailySnapshot?"Provider supplied a daily-bar snapshot, not a verified current quote":
    gapCheck.blocked?"Estimated value could not be verified"+(missingInputs.length?"; additional checks unavailable: "+missingInputs.join("; "):""):
    insufficientData?"Only "+researchCoverageCount+"/5 core research checks passed; missing: "+missingInputs.join("; "):
    decisionInputsIncomplete?"Analysis available with "+researchCoverageCount+"/5 core checks; decision-specific inputs still need verification: "+missingInputs.join("; "):
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
    ? "WAIT — Northstar could not confidently verify the stock’s estimated value. It is withholding estimated value and entry levels rather than risk giving you a misleading price target."+(missingInputs.length?" Additional checks unavailable: "+missingInputs.join("; ")+".":"")
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
    "WAIT":{symbol:"Ⅱ",label:fundamentalPass&&!valuationDecisionReady?"BUSINESS QUALITY PASSES":"WAIT — NO NEW BUY",title:dailySnapshot?"WAIT — price data is not current":gapCheck.blocked?"WAIT — valuation needs review":!valuationDecisionReady?(fundamentalPass?"BUSINESS PASSES — PRICE CHECK PENDING":"BUSINESS REVIEW — PRICE CHECK PENDING"):"WAIT — no validated entry",summary:dailySnapshot?"Price is available only as a daily snapshot, so the current entry price cannot be verified. Review the fundamentals, earnings and news below, but do not treat the quote as live.":gapCheck.blocked?"The company research may still be useful, but Northstar could not confidently verify the estimated stock value. It is withholding the value estimate and entry price while showing the available financial, earnings and news evidence.":!valuationDecisionReady?(fundamentalPass?"The available annual and quarterly results pass the basic business-quality screen. This is a positive business signal, not yet a Strong Buy: price-to-value still needs verification.":"The business evidence is mixed or incomplete. Review the available financial trends and risks below; price-to-value still needs verification."):"The current checks do not justify a validated new entry. Review the specific financial trends, risks, earnings and headlines below before deciding.",action:dailySnapshot?"Action: review the available evidence now, then refresh when a timestamped quote is available.":"Action: review the complete financial and risk evidence below. Do not treat a business-quality pass as a price-based buy signal."},
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
  else if(gapCheck.blocked) reasons.push("Estimated value not verified: Northstar’s valuation checks did not establish a dependable price estimate. The stock may still be a good or poor business, but the app cannot responsibly give you an estimated entry price until the underlying financial inputs and assumptions are checked. No valuation-based buy recommendation is provided.");
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
    const gapLabel=!gapCheck.checked?"Not checked":gapCheck.blocked?"Needs review":"Passed basic check";
    const gapMeta=gapCheck.checked
      ? "Exact quote / simplified DCF ratio: "+gapCheck.ratio.toFixed(2)+"×. "+(gapCheck.blocked?"This model is not suitable for a valuation conclusion until its inputs and assumptions are reviewed.":"This is only a broad sanity check; it does not validate the DCF.")
      : "A recent timestamped quote is required before this comparison can be made.";
    const withheldReason=gapCheck.blocked
      ? "Estimated value is unavailable because Northstar could not verify the valuation reliably. Review the financial inputs before using a price target."
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
  const legend=document.createElement("div"); legend.className="meaning-legend";
  legend.innerHTML='<span class="legend-good">Positive check passed</span><span class="legend-bad">Risk / failed check</span><span class="legend-caution">Needs attention / missing data</span><span class="legend-unknown">Status unavailable</span>';
  checks.append(legend);
  for(const item of dataChecks) {
    const row=document.createElement("div");row.className="decision-check";
    const detailText=String(item.detail||"").toLowerCase();
    const missing=/missing|unavailable|not confirmed|not finished|incomplete|no timestamped|not available|withheld|not supplied|cannot be validated|not eligible/.test(detailText);
    const status=item.notApplicable?"caution":item.ok?"good":missing?"caution":"bad";
    const indicator=document.createElement("span");indicator.className="decision-indicator "+status;
    indicator.textContent=item.notApplicable?"N/A":item.ok?"CHECKED":missing?"REVIEW":"RISK";
    indicator.title=item.notApplicable?"Not applicable to this issuer type":item.ok?"Positive check":missing?"Needs attention":"Risk check failed";
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
    fmpSecReconciliation:fmpReconciliation,
    disclaimer:"Research only. BUY setup is provisional and not validated by full point-in-time walk-forward/holdout testing; not a guarantee or automatic trade instruction."
  };
  renderBeginnerOverview({ticker,company,quote,history,benchmarkHistory,observations,earnings,news,state,reasonRule,valuation,valuationDecisionReady,gapCheck,annualDataAvailable,annualFundamentalPass,annualRevenueGrowth,quarterlyDataAvailable,quarterlyPass,quarter,annualIncome:latestIncome,annualFcf:latestFcf,missingInputs,flaggedHeadlines,daysToEarnings});
  // Deterministic evidence score. Missing factor weights remain visible in raw contribution.
  const gaugeFactors=[];
  const addGaugeEvidence=(id,name,weight,value,available)=>{
    const ok=Boolean(available&&Number.isFinite(value));
    gaugeFactors.push({id,label:name,weight,score:ok?Math.max(-1,Math.min(1,value)):null,available:ok});
  };
  addGaugeEvidence("annual","Annual fundamentals",20,annualFundamentalPass?1:-1,annualDataAvailable);
  const annualGrowthScore=annualRevenueGrowth>=0.10?1:annualRevenueGrowth>=0?0.35:annualRevenueGrowth>=-0.10?-0.35:-1;
  addGaugeEvidence("revenue-growth","Annual revenue trend",10,annualGrowthScore,annualDataAvailable&&Number.isFinite(annualRevenueGrowth));
  if(isFinancialInstitution) addGaugeEvidence("bank-capital-credit","Bank capital and credit quality",10,0,false);
  else addGaugeEvidence("cashflow","Annual cash-flow quality",10,latestFcf?.value>0?1:-1,Boolean(annualDataAvailable&&latestFcf&&Number.isFinite(latestFcf.value)));
  const quarterlyTrendScore=quarterlyDataAvailable?(quarter.revenueYoY>=0.10?1:quarter.revenueYoY>=0?0.35:quarter.revenueYoY>=-0.15?-0.35:-1):0;
  addGaugeEvidence("quarterly","Quarterly fundamentals",15,quarterlyPass?quarterlyTrendScore:-1,quarterlyDataAvailable);
  addGaugeEvidence("news-risk","News and material risk",15,newsCatalystResult.score,newsCatalystResult.available);
  addGaugeEvidence("valuation","Valuation",10,valuationDecisionReady?0.5:-0.25,valuation.available&&quoteCurrent);
  const eventScore=daysToEarnings!==null&&daysToEarnings<=3?-1:daysToEarnings!==null&&daysToEarnings<=7?-0.6:0;
  addGaugeEvidence("earnings","Earnings timing",5,eventScore,earningsVerified);
  const setupScore=priceInEntryRange&&rewardRisk!==null&&rewardRisk>=2?1:!priceInEntryRange&&rewardRisk!==null&&rewardRisk>=2?-0.35:-1;
  addGaugeEvidence("setup","Entry / reward-risk setup",15,setupScore,quoteCurrent&&valuationDecisionReady&&rewardRisk!==null);
  const sectorModelBlock=isFinancialInstitution?"Bank capital and credit-quality metrics are not yet implemented; directional gauge withheld.":null;
  const evidenceResult=calculateEvidenceScore(gaugeFactors,{minimumCoverage:85,forceNeutralReason:sectorModelBlock});
  const catalystDisclosure=newsCatalystResult.classified.length
    ? " News catalyst review: "+newsCatalystResult.classified.slice(0,5).map(x=>x.label+" ["+x.sourceTier+"]").join("; ")+"."
    : " No recent timestamped news to classify.";
  const evidenceSummary=evidenceResult.factors.map(f=>f.available
    ? f.label+": "+(f.score>0?"+":"")+Math.round(f.score*100)+"/100 (weight "+f.weight+")"
    : f.label+": NOT VERIFIED (weight "+f.weight+")").join(" · ")+catalystDisclosure;
  renderPriceGauge(state,evidenceResult.normalizedScore,evidenceResult.coverage,evidenceSummary,fundamentalAvoid,{
    rawWeightedPoints:evidenceResult.rawWeightedPoints,observedWeight:evidenceResult.observedWeight,
    sectorModelBlock,scoreEligible:evidenceResult.eligible,
    missingFactors:evidenceResult.factors.filter(f=>!f.available).map(f=>f.label),
    qualityGateStatus:fundamentalAvoid?"FAILED":annualDataAvailable&&quarterlyDataAvailable?"PASSED":"NOT VERIFIED",
    qualityFailureReason:fundamentalFailureReasons.length?fundamentalFailureReasons.join("; "):null
  });
  const currentPrice=typeof quote?.price==="number"&&quote.price>0?quote.price:null;
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
    function renderSignalIndicatorSelfTest() {
  const panel = $("signal-self-test-panel");
  const button = $("signal-self-test-button");
  if (!panel || !button) return false;
  panel.classList.toggle("hidden");
  const expanded = !panel.classList.contains("hidden");
  button.textContent = expanded ? "Hide indicator preview" : "Preview BUY / WAIT / SELL indicators";
  button.setAttribute?.("aria-expanded", String(expanded));
  return expanded;
}
$("signal-self-test-button")?.addEventListener("click", renderSignalIndicatorSelfTest);

renderResearchLog();
    setMessage("Research snapshot saved on this device. It is a record of the report, not a trade or a BUY signal.", "success");
  } catch {
    setMessage("Could not save locally. Check browser storage/privacy settings and try again.", "error");
  }
}
function renderQuote(quote) {
  // The main overview renders the price. If a quote-time field is present in a
  // layout or test harness, preserve the provider's timestamp precision honestly.
  const price = $("beginner-price");
  if (price && typeof quote?.price === "number" && quote.price > 0) {
    price.textContent = new Intl.NumberFormat(undefined, {style:"currency",currency:quote.currency||"USD",maximumFractionDigits:2}).format(quote.price);
  }
  const time=$("quote-time");
  if(time) {
    if(quote?.quoteTime) {
      const parsed=new Date(quote.quoteTime);
      time.textContent=!Number.isNaN(parsed.getTime())?"Quote timestamp: "+parsed.toLocaleString():"Quote timestamp unavailable.";
    } else if(quote?.quoteLabel) {
      time.textContent="Provider quote date: "+quote.quoteLabel+"; exact trade time not supplied.";
    } else {
      time.textContent="Quote timestamp unavailable.";
    }
  }
}
async function loadQuote(ticker) {
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
function isRecentHeadline(item, maxAgeDays=30) {
  const published=Date.parse(item?.publishedAt||"");
  if(!Number.isFinite(published)) return false;
  const age=Date.now()-published;
  return age>=-24*60*60*1000 && age<=maxAgeDays*24*60*60*1000;
}

function renderNews(payload) {
  const list = $("news-list");
  const impactRoot = $("stock-news-impact-list");
  const impactPanel = $("stock-news-impact");
  const impactStatus = $("stock-news-impact-status");
  if (!list) return;
  list.innerHTML = "";
  if (impactRoot) impactRoot.innerHTML = "";
  if (impactPanel) impactPanel.classList.remove("hidden");
  const allValidItems = (payload && Array.isArray(payload.items) ? payload.items : [])
    .filter(item => item && item.title && item.url && /^https?:\/\//i.test(item.url))
    .filter((item, index, all) => all.findIndex(other => other.url === item.url) === index);
  const items = allValidItems.filter(isRecentHeadline).sort((a, b) => {
      const da = Date.parse(a.publishedAt || "") || 0;
      const db = Date.parse(b.publishedAt || "") || 0;
      return db - da;
    });
  const formatMeta = item => {
    const date = item.publishedAt ? new Date(item.publishedAt) : null;
    const validDate = date && !Number.isNaN(date.getTime());
    return (item.source || "Source unavailable") + (validDate ? " · " + date.toLocaleString() : " · Date unavailable");
  };
  $("news-status").textContent = items.length ? Math.min(items.length, 8) + " recent stories" : "No recent news";
  const makeCard = (item, className) => {
    const card = document.createElement("article");
    card.className = className;
    const link = document.createElement("a");
    link.href = item.url; link.target = "_blank"; link.rel = "noopener noreferrer"; link.textContent = item.title;
    const meta = document.createElement("p"); meta.className = "muted"; meta.textContent = formatMeta(item);
    const catalyst = classifyNewsCatalyst(item);
    const impact = document.createElement("p"); impact.className = "news-availability-note";
    impact.textContent = catalyst.label + " · " +
      (catalyst.sourceTier === "primary-source" ? "Primary source" :
       catalyst.sourceTier === "reported-source" ? "Established reporting; verify material claims" :
       "Unverified source; excluded from gauge") +
      (catalyst.scoreEligible ? " · Included in news evidence" : " · Not scored");
    card.append(link, meta, impact);
    return card;
  };
  // Pick a publisher-diverse set before rendering either news panel; don't let one outlet dominate the visible headlines.
  const selected = [];
  const seenSources = new Set();
  for (const item of items) {
    const source = String(item.source || "").trim().toLowerCase();
    if (source && !seenSources.has(source)) {
      selected.push(item); seenSources.add(source);
      if (selected.length === 8) break;
    }
  }
  for (const item of items) {
    if (selected.length >= 8) break;
    if (!selected.some(existing => existing.url === item.url)) selected.push(item);
  }
  for (const item of selected.slice(0, 3)) list.append(makeCard(item, "news-item"));
  if (!items.length) {
    const empty = document.createElement("p");
    empty.className = "empty";
    empty.textContent = allValidItems.length
      ? "No company-specific stories were published in the last 30 days in the available feeds. Older stories are excluded from the latest-headlines view."
      : "No company-specific news was returned by the available feeds. This does not mean there is no news.";
    list.append(empty);
    if (impactRoot) impactRoot.append(empty.cloneNode(true));
    if (impactStatus) impactStatus.textContent = "News unavailable";
    return;
  }
  if (impactRoot) {
    if (selected.length < 5) {
      const note = document.createElement("p");
      note.className = "news-availability-note";
      note.textContent = "Only " + selected.length + " distinct stories were returned by the available feeds. Northstar won't invent articles to reach five.";
      impactRoot.append(note);
    }
    for (const item of selected) impactRoot.append(makeCard(item, "stock-news-impact-item"));
  }
  if (impactStatus) impactStatus.textContent = selected.length + " stories · " + new Set(selected.map(item => String(item.source || "").trim()).filter(Boolean)).size + " sources";
  const feedStatuses = Array.isArray(payload?.sources) ? payload.sources : [];
  // Source diagnostics remain in the API response for debugging, but the
  // personal-use UI displays only the actual news stories.
}
async function loadNews(ticker, companyName="") {
  $("news-status").textContent="Loading…";
  const impactPanel=$("stock-news-impact");
  const impactRoot=$("stock-news-impact-list");
  const impactStatus=$("stock-news-impact-status");
  if (impactPanel) impactPanel.classList.remove("hidden");
  if (impactRoot) impactRoot.innerHTML="<p class=\"empty\">Loading company-specific news and reviewing possible impact…</p>";
  if (impactStatus) impactStatus.textContent="Loading news…";
  try {
    const response=await fetch("/api/news?ticker="+encodeURIComponent(ticker)+"&company="+encodeURIComponent(companyName),{headers:{"Accept":"application/json"}});
    if(!response.ok) throw new Error("News feeds unavailable");
    const payload=await response.json();
    renderNews(payload);
    return payload;
  } catch(error) {
    $("news-status").textContent="Unavailable";
    $("news-list").textContent="News could not be loaded right now. Try again later; no news-based conclusion has been made.";
    if (impactPanel) impactPanel.classList.remove("hidden");
    if (impactStatus) impactStatus.textContent="News unavailable";
    if (impactRoot) impactRoot.textContent="Company-specific news could not be loaded right now. Try analyzing again later. No positive or negative conclusion has been inferred.";
    return null;
  }
}
function renderFmpFundamentals(payload) {
  const panel = $("fmp-fundamentals");
  const status = $("fmp-fundamentals-status");
  if (!panel || !status) return;
  panel.innerHTML = "";
  if (!payload?.available) {
    status.textContent = payload?.configured === false ? "API key required" : "Unavailable";
    const note = document.createElement("p"); note.className = "empty";
    note.textContent = payload?.reason || "FMP fundamentals unavailable. Existing SEC analysis remains available.";
    panel.append(note); return;
  }
  const latest = payload.latest || {};
  const items = [
    ["FMP revenue", latest.revenue, "latest annual reported period", "money"],
    ["FMP net income", latest.netIncome, "latest annual reported period", "money"],
    ["Approx. free cash flow", latest.approximateFreeCashFlow, "operating cash flow less absolute capex", "money"],
    ["Current ratio", latest.currentRatio, "FMP reported ratio", "ratio"],
    ["Quick ratio", latest.quickRatio, "FMP reported ratio", "ratio"],
    ["P/E ratio", latest.peRatio, "FMP reported metric", "ratio"],
    ["EV / EBITDA", latest.evToEBITDA, "FMP reported metric", "ratio"],
    ["ROE", latest.returnOnEquity, "FMP reported ratio", "ratio"],
    ["Net debt / EBITDA", latest.netDebtToEBITDA, "FMP reported metric", "ratio"],
    ["Analyst EPS estimate", latest.analystEpsAverage, (latest.analystCountEps ?? "Unknown") + " analysts · forecast, not reported", "eps"]
  ];
  const money = value => new Intl.NumberFormat("en-US", { style: "currency", currency: latest.currency || "USD", maximumFractionDigits: 0 }).format(value);
  for (const [label, value, meta, type] of items) {
    if (typeof value !== "number" || !Number.isFinite(value)) continue;
    const card = document.createElement("article"); card.className = "metric-card";
    const name = document.createElement("div"); name.className = "metric-label"; name.textContent = label;
    const val = document.createElement("div"); val.className = "metric-value";
    val.textContent = type === "ratio" ? value.toFixed(2) + "x" : type === "eps" ? "$" + value.toFixed(2) : money(value);
    const detail = document.createElement("div"); detail.className = "metric-date"; detail.textContent = meta;
    card.append(name, val, detail); panel.append(card);
  }
  const note = document.createElement("p"); note.className = "table-note";
  note.textContent = "Source: Financial Modeling Prep · latest period " + (latest.fiscalDate || "not supplied") + " · " + (payload.datasetCoverage?.available ?? 0) + "/5 core datasets available. " + (payload.errors?.length ? payload.errors.length + " dataset request(s) failed. " : "") + "Reconcile against SEC filings before relying on this cross-check.";
  panel.append(note);
  status.textContent = payload.datasetCoverage?.available >= 4 ? "Cross-check loaded" : "Partial data";
}
async function loadFmpFundamentals(ticker) {
  try {
    const response = await fetch("/api/fmp-fundamentals?ticker=" + encodeURIComponent(ticker), { headers: { "Accept": "application/json" }, cache: "no-store" });
    const payload = await response.json();
    if (!response.ok && response.status !== 503) throw new Error(payload.reason || payload.error || "FMP request failed");
    renderFmpFundamentals(payload); return payload;
  } catch (error) {
    const payload = { available: false, reason: "FMP cross-check unavailable: " + (error?.message || "request failed") };
    renderFmpFundamentals(payload); return payload;
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
  const button=$("analyze-button"); button.disabled=true; button.textContent="Analyzing…";
  const stages=["Find company and official filings","Check price and history","Review news and earnings risk","Check financial health and valuation","Prepare plain-English decision"];
  beginActivity("Analyzing "+ticker,stages);
  const results=$("stock-results"); results.classList.remove("hidden"); results.dataset.ticker=ticker;
  $("last-request").textContent=new Date().toLocaleString();
  setMessage("Checking SEC filings, prices, earnings risk and recent news for "+ticker+"…");
  $("sec-health").textContent="Request in progress";
  $("recommendation-panel").classList.add("hidden");
  $("earnings-panel").classList.add("hidden");
  let analysisPhase="initialization";
  try {
    analysisPhase="SEC ticker verification";
    setActivityStage(0,"Finding company and reading official SEC filings…");
    const company=await findCompany(ticker);
    analysisPhase="SEC company facts";
    const facts=await getJson(SEC_DATA_URL+"/api/xbrl/companyfacts/CIK"+company.cik+".json");
    analysisPhase="SEC submissions and financial rendering";
    const submissions=await getJson(SEC_DATA_URL+"/submissions/CIK"+company.cik+".json").catch(()=>null);
    const recentForms=submissions?.filings?.recent?.form||[];
    const supportedIndex=recentForms.findIndex(form=>["10-K","10-Q","8-K","20-F","6-K","40-F"].includes(form));
    const usDomesticIndex=recentForms.findIndex(form=>["10-K","10-Q","8-K"].includes(form));
    const foreignFiler=usDomesticIndex<0&&recentForms.some(form=>["20-F","6-K","40-F"].includes(form));
    company.sic=Number(submissions?.sic)||null;
    company.sicDescription=submissions?.sicDescription||"";
    const observations=await addShareCountFallback(getObservations(facts),company.cik);
    $("company-name").textContent=titleCaseCompanyName(company.name);
    const recentDate=supportedIndex>=0?submissions.filings.recent.filingDate?.[supportedIndex]:null;
    const recentForm=supportedIndex>=0?recentForms[supportedIndex]:null;
    $("company-meta").textContent=ticker+" · CIK "+company.cik+" · "+company.exchange+(recentDate?" · Most recent supported filing "+recentForm+" · "+fmtDate(recentDate):"")+(foreignFiler?" · Foreign filer; scores require matching IFRS/SEC periods":"");
    // Company name and identity are already shown in the plain-English overview; avoid duplicating them in Full details.
    renderMetrics(observations); renderFundamentalSnapshot(observations);
    const quarter=renderQuarterlySnapshot(observations);
    renderFilings(submissions, company);
    $("sec-health").textContent="Connected; received SEC company facts";
    setActivityStage(1,"Company facts loaded. Fetching quote and historical prices…");
    setMessage("SEC facts loaded. Checking price, earnings, news and preliminary valuation…");
    analysisPhase="market data, history, news and earnings";
    const [quote,history,news,earnings,benchmarkHistory,fmpFundamentals]=await Promise.all([
      loadQuote(ticker),loadHistory(ticker),loadNews(ticker,company.name),loadEarnings(ticker),
      loadBenchmarkHistory(),loadFmpFundamentals(ticker),
    ]);
    loadStrategyBacktest(ticker).catch(error=>{const status=$("strategy-backtest-status");const details=$("strategy-backtest-details");if(status)status.textContent="Unavailable";if(details)details.textContent=(error?.message||"Historical backtest unavailable")+". The main research report is unaffected.";});
    setActivityStage(2,"Price, news and earnings responses received. Reviewing event risk…");
    const reportedQuarter=quarter?.fiscalQuarterId||null;
    analysisPhase="earnings verification and final decision";
    const earningsResult=await loadEarningsResult(ticker,reportedQuarter);
    renderEarningsResult(earningsResult,quarter,reportedQuarter);
    setActivityStage(3,"Checking any remaining research gaps against additional sources…");
    await loadAiResearchFallback({ticker,company,observations,quote,news,earnings:earningsResult,history,quarter,benchmarkHistory});
    setActivityStage(3,"Assessing financial health and valuation limits…");
    renderDecision({ticker,company,observations,facts,quote,history,benchmarkHistory,news,earnings,quarter,fmpFundamentals});
    renderNorthstarQualityAudit({ticker,quote,history,benchmarkHistory,observations,news,earnings,quarter});
    setActivityStage(4,"Preparing the decision explanation and next steps…");
    setMessage("Research checks complete for "+company.name+". Read the Bottom line for the decision and next step; model-based levels appear only when input and quote checks pass.","success");
    finishActivity("All available checks finished. Review the evidence and any warnings.");
    requestAnimationFrame(()=>results.scrollIntoView({behavior:"smooth",block:"start"}));
  } catch(error) {
    $("sec-health").textContent="Analysis interrupted";
    const errorName=error?.name||"Error";
    const errorMessage=error?.message||"Unknown analysis error";
    const reason="Failed during "+analysisPhase+" — "+errorName+": "+errorMessage;
    setText("developer-error",reason);
    setMessage("Northstar stopped during "+analysisPhase+". "+errorName+": "+errorMessage+". No sample data or guessed prices were substituted.","error");
    finishActivity("Analysis stopped safely. Technical detail: "+errorMessage,true);
    requestAnimationFrame(()=>results.scrollIntoView({behavior:"smooth",block:"start"}));
  } finally { button.disabled=false; button.innerHTML='Analyze stock <span aria-hidden="true">↗</span>'; }
}
$("analyze-form").addEventListener("submit",event=>{event.preventDefault();analyze($("ticker").value);});
document.querySelectorAll("[data-ticker]").forEach(button=>button.addEventListener("click",()=>{$("ticker").value=button.dataset.ticker;analyze(button.dataset.ticker);}));
$("run-screen").addEventListener("click",loadCachedScreen);
$("run-live-screen")?.addEventListener("click",runScreen);

$("market-scan-link")?.addEventListener("click",()=>{const panel=$("ranking-disclosure");if(panel)panel.open=true;});
$("suggest-stocks-button").addEventListener("click",()=>{
  $("ranking").scrollIntoView({behavior:"smooth",block:"start"});
  runScreen();
});
$("refresh-quote")?.addEventListener("click",()=>loadQuote($("ticker").value.trim().toUpperCase()));
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

async function testAlpacaConnection() {
  const button = $("alpaca-connect-button");
  const status = $("alpaca-status");
  const accountBox = $("alpaca-account");
  const positionsBox = $("alpaca-positions");
  if (!button || !status) return;
  button.disabled = true;
  button.textContent = "Connecting…";
  status.textContent = "Checking secure Paper Trading connection…";
  accountBox?.classList.add("hidden");
  positionsBox?.classList.add("hidden");
  try {
    const response = await fetch("/api/alpaca/status", { headers: { "Accept": "application/json" }, cache: "no-store" });
    const data = await response.json();
    if (!response.ok || !data.connected) throw new Error(data.error || "Alpaca connection failed.");
    status.textContent = "Connected · Paper account";
    const money = value => {
      const number = Number(value);
      return Number.isFinite(number) ? new Intl.NumberFormat("en-US", { style: "currency", currency: data.account.currency || "USD" }).format(number) : "Not available";
    };
    accountBox.replaceChildren();
    const summary = document.createElement("p");
    summary.style.cssText = "line-height:1.8;margin:0";
    summary.textContent = "Account: " + (data.account.status || "Unknown") +
      " · Cash: " + money(data.account.cash) +
      " · Buying power: " + money(data.account.buyingPower) +
      " · Equity: " + money(data.account.equity);
    accountBox.appendChild(summary);
    const note = document.createElement("p");
    note.className = "muted";
    note.style.margin = "8px 0 0";
    note.textContent = data.mode || "Read-only connection.";
    accountBox.appendChild(note);
    accountBox.classList.remove("hidden");

    positionsBox.replaceChildren();
    const heading = document.createElement("strong");
    heading.textContent = "Open positions (" + data.positions.length + ")";
    positionsBox.appendChild(heading);
    if (data.positions.length) {
      const list = document.createElement("ul");
      list.style.cssText = "padding-left:20px;line-height:1.8";
      for (const position of data.positions) {
        const item = document.createElement("li");
        item.textContent = position.symbol + " · " + position.qty + " shares · Market value " + money(position.marketValue) + " · Unrealized P/L " + money(position.unrealizedPl);
        list.appendChild(item);
      }
      positionsBox.appendChild(list);
    } else {
      const empty = document.createElement("p");
      empty.className = "muted";
      empty.textContent = "No open positions in this paper account.";
      positionsBox.appendChild(empty);
    }
    if (data.positionsWarning) {
      const warning = document.createElement("p");
      warning.className = "muted";
      warning.textContent = data.positionsWarning;
      positionsBox.appendChild(warning);
    }
    positionsBox.classList.remove("hidden");
  } catch (error) {
    status.textContent = "Not connected";
    accountBox.replaceChildren();
    const message = document.createElement("p");
    message.textContent = error?.message || "Could not connect to Alpaca.";
    accountBox.appendChild(message);
    accountBox.classList.remove("hidden");
  } finally {
    button.disabled = false;
    button.textContent = "Test Alpaca connection";
  }
}
$("alpaca-connect-button")?.addEventListener("click", testAlpacaConnection);

renderResearchLog();
$("ui-health").textContent="Loaded";

