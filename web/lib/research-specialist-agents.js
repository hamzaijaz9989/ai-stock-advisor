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
  const sec=factsOf(context,"SEC_REPORTED_FACT"), fmp=factsOf(context,"FMP_REPORTED_FUNDAMENTALS_CROSSCHECK").concat(factsOf(context,"FMP_STATEMENT_PERIOD"));
  if(!sec.length && !fmp.length) return unavailable("SEC-reported facts or provider fundamentals are required.");
  const ids=[...sec,...fmp].map(x=>x.id);
  const metrics=[...sec,...fmp].map(x=>({id:x.id,...(x.value||{})}));
  const labels=metrics.map(x=>String(x.metric||x.key||x.tag||"").toLowerCase());
  const categories=[
    ["revenue",/revenue|sales/],["earnings",/net.?income|profit|earnings/],
    ["cash flow",/operating.?cash.?flow|free.?cash.?flow/],["debt",/long.?term.?debt|short.?term.?debt|total.?debt/]
  ];
  const covered=categories.filter(([,re])=>labels.some(x=>re.test(x))).map(x=>x[0]);
  const findings=[claim("Fundamental evidence contains "+sec.length+" SEC observations and "+fmp.length+" provider cross-check/statement observations; identified metric groups: "+(covered.join(", ")||"none clearly labelled")+".",ids.slice(0,10))];
  const risks=[];
  if(!sec.length) risks.push(claim("SEC company-facts observations are absent; provider-only metrics require independent filing verification.",ids.slice(0,10)));
  if(!fmp.length) risks.push(claim("Independent provider cross-checks are absent; reported fundamentals have not been cross-validated.",ids.slice(0,10)));
  if(metrics.some(x=>x.availabilityTimestampVerified===false)) risks.push(claim("At least one SEC fact lacks an exact verified public-availability timestamp; point-in-time use is restricted.",ids.slice(0,10)));
  if(covered.length<4) risks.push(claim("Revenue, earnings, cash-flow and debt coverage is incomplete; business quality cannot be fully assessed.",ids.slice(0,10)));
  return report(findings,risks);
}

export function runNewsAnalyst(context) {
  const items=evidenceOf(context,"NEWS_DISCOVERY");
  if(!items.length) return unavailable("No news discovery evidence was supplied.");
  const usable=items.filter(x=>x.value?.timestampStatus==="PRESENT" && x.value?.title);
  const ids=items.map(x=>x.id).slice(0,10);
  const findings=[claim("News review received "+items.length+" discovery item(s); "+usable.length+" have a present publication timestamp. Discovery items are not automatically verified issuer announcements.",ids)];
  const risks=[];
  if(!usable.length) risks.push(claim("No news item has a usable publication timestamp; catalyst chronology cannot be established.",ids));
  if(items.some(x=>x.value?.sourceTier==="unverified-source" || !x.value?.sourceTier)) risks.push(claim("Some news discovery sources are unverified; corroboration against issuer or regulator originals is required.",ids));
  return report(findings,risks);
}

export function runSentimentAnalyst(context) {
  const feeds=evidenceOf(context,"SENTIMENT_OBSERVATION").concat(evidenceOf(context,"ANALYST_SENTIMENT"),evidenceOf(context,"POSITIONING_SENTIMENT"));
  if(!feeds.length) return unavailable("No dedicated timestamped sentiment or positioning feed is connected.");
  const valid=feeds.filter(x=>x.value && x.value.timestampStatus==="PRESENT" &&
    typeof x.value.source==="string" && x.value.source.trim() &&
    finite(x.value.sampleCount) && x.value.sampleCount>0 &&
    finite(x.value.score) && x.value.score>=-1 && x.value.score<=1);
  if(!valid.length) return unavailable("Sentiment observations lack verified timestamps, source identity, sample counts or bounded scores.");
  const ids=valid.map(x=>x.id).slice(0,10), score=valid.reduce((s,x)=>s+x.value.score,0)/valid.length;
  return report([claim("Mean supplied sentiment score across "+valid.length+" valid feed observation(s) is "+score.toFixed(3)+" on the provider-normalized -1 to +1 scale; this is not a standalone trading signal.",ids)],
    [claim("Sentiment sample coverage and provider methodology require independent review before interpretation.",ids)]);
}

export const SPECIALIST_AGENTS = Object.freeze({
  market_scanner:runMarketScanner,
  technical_analyst:runTechnicalAnalyst,
  fundamental_analyst:runFundamentalAnalyst,
  news_analyst:runNewsAnalyst,
  sentiment_analyst:runSentimentAnalyst
});
