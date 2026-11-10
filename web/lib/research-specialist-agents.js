/**
 * Northstar's five evidence-first specialist agents.
 * Pure functions: no network, broker, persistence, model calls or order authority.
 * Inputs are canonical context facts/evidence; every claim cites supplied IDs.
 */
const finite = x => typeof x === "number" && Number.isFinite(x);
const unavailable = reason => ({status:"UNAVAILABLE",findings:[],risks:[],reason});
const report = (findings, risks=[]) => ({status:"COMPLETE",findings,risks});
const claim = (text, ids) => ({claim:text,factIds:ids});
const factsOf = (context, type) => (context?.facts || []).filter(x=>x.type===type);
const evidenceOf = (context, type) => (context?.evidence || []).filter(x=>x.type===type);
const tickerOf = context => String(context?.ticker||"").toUpperCase();
const exactTimestampMs = value => {
  if (typeof value !== "string") return null;
  const text = value.trim();
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(?::\d{2}(?:\.\d{1,3})?)?(?:Z|[+-]\d{2}:\d{2})$/i.test(text)) return null;
  const parsed = Date.parse(text);
  return Number.isFinite(parsed) ? parsed : null;
};

export function runMarketScanner(context) {
  const quotes=factsOf(context,"QUOTE"), histories=factsOf(context,"DAILY_OHLCV_HISTORY");
  if(!quotes.length || !histories.length) return unavailable("Timestamped quote and OHLCV history are required.");
  const q=quotes[0], h=histories[0], price=q.value?.price, rows=h.value?.rows||[];
  if(!finite(price)||price<=0||rows.length<20) return unavailable("A valid quote and at least 20 daily bars are required.");
  if(!rows.every((x,i)=>x && typeof x.date==="string" && finite(x.close)&&x.close>0 && finite(x.high)&&finite(x.low)&&finite(x.volume)&&x.high>=x.low&&x.volume>=0 && (!i || rows[i-1].date<x.date))) return unavailable("OHLCV rows must be valid, unique and chronologically ordered.");
  const prior=rows.slice(-20,-1), avgVol=prior.reduce((s,x)=>s+x.volume,0)/prior.length;
  const last=rows.at(-1), volumeRatio=avgVol>0?last.volume/avgVol:null;
  const move=finite(q.value.changePercent)?q.value.changePercent:null;
  const ids=[q.id,h.id], findings=[];
  findings.push(claim("Scanner evaluated "+tickerOf(context)+" using a timestamped quote and "+rows.length+" daily OHLCV observations.",ids));
  if(volumeRatio!==null) findings.push(claim("Latest recorded session volume is "+volumeRatio.toFixed(2)+" times the preceding 19-session average.",[h.id]));
  if(move!==null) findings.push(claim("Provider-reported quote change is "+move.toFixed(2)+" percent; this is a single-symbol observation, not a market-wide ranking.",[q.id]));
  const risks=[];
  if(q.value.quoteFreshness?.status!=="FRESH") risks.push(claim("Quote freshness is not verified as fresh; scanner output must not be treated as a live opportunity ranking.",[q.id]));
  if(q.value.delayedOrRealtime && /not real.?time|delayed|not guaranteed|daily interval/i.test(q.value.delayedOrRealtime)) risks.push(claim("Quote provider labels this observation as delayed or non-real-time; verify price independently before relying on it.",[q.id]));
  if(rows.length<60) risks.push(claim("History is shorter than the 60-session coverage target; broad momentum screening remains limited.",[h.id]));
  return report(findings,risks);
}

export function runTechnicalAnalyst(context) {
  const histories=factsOf(context,"DAILY_OHLCV_HISTORY"), h=histories[0], rows=h?.value?.rows||[];
  if(!h || rows.length<60) return unavailable("At least 60 valid daily OHLCV observations are required.");
  if(!rows.every((x,i)=>x && typeof x.date==="string" && finite(x.close)&&x.close>0 && finite(x.high)&&finite(x.low)&&x.high>=x.low && (!i || rows[i-1].date<x.date))) return unavailable("OHLCV rows must be valid, unique and chronologically ordered.");
  const closes=rows.map(x=>x.close);
  const mean=a=>a.reduce((s,x)=>s+x,0)/a.length;
  const sma20=mean(closes.slice(-20)), sma50=mean(closes.slice(-50));
  let gains=0,losses=0;
  for(let i=closes.length-14;i<closes.length;i++){const d=closes[i]-closes[i-1];if(d>0)gains+=d;else losses-=d;}
  const avgGain=gains/14, avgLoss=losses/14;
  const rsi=avgLoss===0?100:100-(100/(1+avgGain/avgLoss));
  const ema=(values,period)=>{const k=2/(period+1);let v=mean(values.slice(0,period));for(let i=period;i<values.length;i++)v=values[i]*k+v*(1-k);return v;};
  const macdLine=ema(closes,12)-ema(closes,26);
  const macdSeries=[];for(let i=25;i<closes.length;i++){const slice=closes.slice(0,i+1);macdSeries.push(ema(slice,12)-ema(slice,26));}
  const signal=macdSeries.length>=9?ema(macdSeries,9):null;
  const recent=rows.slice(-20), support=Math.min(...recent.map(x=>x.low)), resistance=Math.max(...recent.map(x=>x.high));
  const ids=[h.id], findings=[
    claim("The 20-session simple moving average is "+sma20.toFixed(4)+" and the 50-session simple moving average is "+sma50.toFixed(4)+".",[h.id]),
    claim("The 14-session RSI calculated from the supplied closes is "+rsi.toFixed(2)+".",[h.id]),
    claim("MACD (12,26) is "+macdLine.toFixed(4)+(signal===null?"; signal line unavailable because fewer than nine MACD observations exist.":" and its 9-period signal line is "+signal.toFixed(4)+".")+"",[h.id]),
    claim("The latest close is "+closes.at(-1).toFixed(4)+"; 20-session observed support is "+support.toFixed(4)+" and resistance is "+resistance.toFixed(4)+".",[h.id]),
    claim("Moving-average positioning is "+(sma20>sma50?"20-session above 50-session":sma20<sma50?"20-session below 50-session":"approximately aligned")+".",[h.id])
  ];
  const risks=[];
  if(h.value?.dataQuality!=="verified-adjusted") risks.push(claim("Corporate-action adjustment and price-series continuity are not independently attested; technical levels may be distorted by splits or distributions.",ids));
  return report(findings,risks);
}

export function runFundamentalAnalyst(context) {
  const sec=factsOf(context,"SEC_REPORTED_FACT");
  const fmp=[...factsOf(context,"FMP_REPORTED_FUNDAMENTALS_CROSSCHECK"),...factsOf(context,"FMP_STATEMENT_PERIOD"),...factsOf(context,"FMP_PROVIDER_METRIC"),...factsOf(context,"FMP_ANALYST_ESTIMATE")];
  if(!sec.length&&!fmp.length) return unavailable("SEC-reported facts or provider fundamentals are required.");
  const observations=[...sec,...fmp];
  const ids=observations.map(x=>x.id).filter(Boolean);
  const rows=observations.map(x=>({id:x.id,type:x.type,value:x.value||{}}));
  const metricPairs=[];
  for(const row of rows){
    const v=row.value;
    if(typeof v.metric==="string"&&finite(v.value)) metricPairs.push({name:v.metric.toLowerCase(),value:v.value,id:row.id,period:v.end||v.fiscalDate||v.period||null,currency:v.unit||v.currency||null});
    const values=v.values&&typeof v.values==="object"?v.values:v.metrics&&typeof v.metrics==="object"?v.metrics:null;
    if(values) for(const [name,value] of Object.entries(values)) if(finite(value)) metricPairs.push({name:name.toLowerCase(),value,id:row.id,period:v.period||v.date||null,currency:v.reportedCurrency||null});
    if(v.metrics&&typeof v.metrics==="object"&&!v.values) for(const [name,value] of Object.entries(v.metrics)) if(finite(value)) metricPairs.push({name:name.toLowerCase(),value,id:row.id,period:v.fiscalDate||v.period||null,currency:v.currency||null});
  }
  const groups=[
    ["revenue",/revenue|sales/],
    ["gross profit",/grossprofit|gross_profit/],
    ["operating income",/operatingincome|operating_income/],
    ["net income",/netincome|net_income/],
    ["operating cash flow",/operatingcashflow|operating_cash_flow/],
    ["free cash flow",/freecashflow|free_cash_flow/],
    ["total debt",/totaldebt|total_debt|longtermdebt|long_term_debt/],
    ["cash",/cashandcashequivalents|cash_and_cash_equivalents|cashandequivalents/]
  ];
  const coverage=groups.map(([label,re])=>({label,items:metricPairs.filter(x=>re.test(x.name))}));
  const covered=coverage.filter(x=>x.items.length).map(x=>x.label);
  const findings=[claim("Fundamental review includes "+sec.length+" SEC fact observation(s) and "+fmp.length+" FMP statement, metric or estimate observation(s). Metric groups found: "+(covered.join(", ")||"none clearly labelled")+".",ids.slice(0,20))];
  for(const group of coverage){
    const series=group.items.filter(x=>x.period).sort((a,b)=>String(a.period).localeCompare(String(b.period)));
    if(series.length>=2){
      const first=series[0],last=series.at(-1);
      if(first.value!==0){
        const change=((last.value-first.value)/Math.abs(first.value))*100;
        findings.push(claim(group.label+" changed "+change.toFixed(2)+"% between supplied periods "+first.period+" and "+last.period+"; periods and units must be comparable.",[first.id,last.id]));
      }
    }
  }
  const risks=[];
  if(!sec.length) risks.push(claim("SEC company-facts observations are absent; provider-only metrics require filing-level verification.",ids.slice(0,20)));
  if(!fmp.length) risks.push(claim("FMP statement/provider cross-check observations are absent; SEC facts have no independent provider comparison.",ids.slice(0,20)));
  if(rows.some(x=>x.type==="SEC_REPORTED_FACT"&&x.value.availabilityTimestampVerified!==true))
    risks.push(claim("SEC filed dates are not exact public-availability timestamps; historical point-in-time backtests must not treat these observations as proven available at the as-of time.",rows.filter(x=>x.type==="SEC_REPORTED_FACT").map(x=>x.id).slice(0,20)));
  if(covered.length<6) risks.push(claim("Financial statement coverage is incomplete across revenue, profitability, cash flow, debt and liquidity; business quality cannot be fully assessed.",ids.slice(0,20)));
  const periods=new Set(metricPairs.map(x=>x.period).filter(Boolean));
  if(periods.size>1&&metricPairs.some(x=>!x.period)) risks.push(claim("Some reported metrics lack fiscal-period labels; mixed-period comparisons are unsafe.",ids.slice(0,20)));
  const currencies=new Set(metricPairs.map(x=>x.currency).filter(Boolean));
  if(currencies.size>1) risks.push(claim("Evidence contains multiple units or currencies; values must not be combined without normalization.",ids.slice(0,20)));
  if(rows.some(x=>x.type==="FMP_ANALYST_ESTIMATE"||/estimate/i.test(x.type))) risks.push(claim("Analyst estimates are forecasts, not reported results; they must remain separate from historical financial performance.",rows.filter(x=>x.type==="FMP_ANALYST_ESTIMATE"||/estimate/i.test(x.type)).map(x=>x.id).slice(0,20)));
  return report(findings,risks);
}

export function runNewsAnalyst(context) {
  const items=evidenceOf(context,"NEWS_DISCOVERY");
  if(!items.length) return unavailable("No news discovery evidence was supplied.");
  const asOf=exactTimestampMs(context?.asOf);
  const seen=new Set(), usable=[], duplicateIds=[], futureIds=[], undatedIds=[], unverifiedIds=[];
  for(const item of items){
    const v=item.value||{}, url=String(v.url||"").trim(), title=String(v.title||"").trim();
    const key=url.toLowerCase()||title.toLowerCase();
    if(key&&seen.has(key)){duplicateIds.push(item.id);continue;}
    if(key)seen.add(key);
    const published=exactTimestampMs(v.publishedAt);
    if(!title||!url||!/^https?:\/\//i.test(url)) continue;
    if(published===null||asOf===null){undatedIds.push(item.id);continue;}
    if(published>asOf){futureIds.push(item.id);continue;}
    usable.push(item);
    if(v.sourceTier==="unverified-source"||v.publisherVerified!==true||!v.publisher)unverifiedIds.push(item.id);
  }
  const primary=usable.filter(x=>x.value?.sourceTier==="primary-source"||x.value?.publisherVerified===true&&/issuer|investor relations|sec\.gov/i.test(String(x.value?.publisher||""))).length;
  const reported=usable.filter(x=>x.value?.sourceTier==="reported-source").length;
  const findings=[claim("News review received "+items.length+" discovery item(s), with "+usable.length+" unique, dated items at or before the research as-of time; "+primary+" primary-source and "+reported+" reported-source items are identified. Discovery headlines are not automatically verified issuer catalysts.",items.map(x=>x.id).slice(0,20))];
  const risks=[];
  if(!usable.length) risks.push(claim("No usable dated news item remains after chronology and URL checks; event chronology cannot be established.",items.map(x=>x.id).slice(0,20)));
  if(undatedIds.length) risks.push(claim(undatedIds.length+" news item(s) have missing or invalid publication timestamps and cannot establish event chronology.",undatedIds.slice(0,20)));
  if(futureIds.length) risks.push(claim(futureIds.length+" news item(s) are dated after the research as-of time and were excluded from historical catalyst assessment.",futureIds.slice(0,20)));
  if(duplicateIds.length) risks.push(claim(duplicateIds.length+" duplicate news item(s) were excluded from unique-item counts.",duplicateIds.slice(0,20)));
  if(unverifiedIds.length) risks.push(claim(unverifiedIds.length+" dated item(s) have unverified publisher attribution; corroborate material claims against issuer or regulator originals.",unverifiedIds.slice(0,20)));
  if(primary===0) risks.push(claim("No issuer/regulator primary source is identified; material announcements remain uncorroborated.",usable.map(x=>x.id).slice(0,20)));
  return report(findings,risks);
}

export function runSentimentAnalyst(context) {
  const feeds=evidenceOf(context,"SENTIMENT_OBSERVATION").concat(evidenceOf(context,"ANALYST_SENTIMENT"),evidenceOf(context,"POSITIONING_SENTIMENT"));
  if(!feeds.length) return unavailable("No dedicated timestamped sentiment or positioning feed is connected.");
  const asOf=Date.parse(context?.asOf||"");
  const valid=feeds.filter(x=>{
    const v=x.value||{}, observed=Date.parse(v.timestamp||"");
    return v.timestampStatus==="PRESENT" && Number.isFinite(observed) &&
      (!Number.isFinite(asOf)||observed<=asOf) &&
      typeof v.source==="string" && v.source.trim() &&
      finite(v.sampleCount) && v.sampleCount>0 &&
      finite(v.score) && v.score>=-1 && v.score<=1;
  });
  if(!valid.length) return unavailable("Sentiment observations lack a parseable as-of-safe timestamp, source identity, positive sample count or bounded normalized score.");
  const ids=valid.map(x=>x.id).slice(0,10), totalSamples=valid.reduce((s,x)=>s+x.value.sampleCount,0);
  const weighted=valid.reduce((s,x)=>s+x.value.score*x.value.sampleCount,0)/totalSamples;
  const sources=new Set(valid.map(x=>x.value.source.trim().toLowerCase())), risks=[];
  if(sources.size<2) risks.push(claim("Sentiment relies on only one distinct source; source concentration and provider methodology require independent review.",ids));
  else risks.push(claim("Sentiment scores use provider-normalized scales and sample-count weighting; cross-provider comparability is not independently verified.",ids));
  const excluded=feeds.length-valid.length;
  if(excluded>0) risks.push(claim(excluded+" sentiment observation(s) were excluded because timestamp, source, sample count or score validation failed.",feeds.map(x=>x.id).slice(0,10)));
  return report([claim("Sample-count-weighted sentiment score across "+valid.length+" valid observation(s) and "+totalSamples+" samples is "+weighted.toFixed(3)+" on the provider-normalized -1 to +1 scale; this is descriptive context, not a standalone trading signal.",ids)],risks);
}

export const SPECIALIST_AGENTS = Object.freeze({
  market_scanner:runMarketScanner,
  technical_analyst:runTechnicalAnalyst,
  fundamental_analyst:runFundamentalAnalyst,
  news_analyst:runNewsAnalyst,
  sentiment_analyst:runSentimentAnalyst
});
