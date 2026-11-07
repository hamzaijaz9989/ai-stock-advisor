(function(root){
  "use strict";
  function assessSeries(history, now = Date.now()) {
    const rows=history&&Array.isArray(history.data)?history.data:[];
    if(rows.length<200) return {valid:false,reason:"At least 200 daily observations are required."};
    const dates=rows.map(r=>Date.parse(String(r.date||"")+"T00:00:00Z"));
    const closes=rows.map(r=>Number(r.adjustedClose??r.close));
    if(dates.some((d,i)=>!Number.isFinite(d)||(i>0&&d<=dates[i-1])) ||
       closes.some(v=>!Number.isFinite(v)||v<=0))
      return {valid:false,reason:"Price history contains invalid dates or closing prices."};
    const ageDays=(now-dates[dates.length-1])/86400000;
    if(ageDays < -1 || ageDays > 5) return {valid:false,reason:"Latest market history is stale or dated in the future."};
    const sma=n=>closes.slice(-n).reduce((a,b)=>a+b,0)/n;
    const latest=closes[closes.length-1], sma50=sma(50), sma200=sma(200);
    const recent=closes.slice(-21);
    const returns=[];
    for(let i=1;i<recent.length;i++) returns.push(recent[i]/recent[i-1]-1);
    const mean=returns.reduce((a,b)=>a+b,0)/returns.length;
    const variance=returns.reduce((sum,v)=>sum+(v-mean)**2,0)/(returns.length-1||1);
    const annualizedVolatility=Math.sqrt(variance)*Math.sqrt(252)*100;
    return {valid:true,latest,sma50,sma200,above50:latest>sma50,above200:latest>sma200,
      sma50Above200:sma50>sma200,return20d:(latest/recent[0]-1)*100,
      annualizedVolatility,asOf:history.endDate||rows[rows.length-1].date,ageDays};
  }
  function assessMarketRegime(spyHistory,qqqHistory,now=Date.now()) {
    const spy=assessSeries(spyHistory,now), qqq=assessSeries(qqqHistory,now);
    if(!spy.valid||!qqq.valid) return {state:"UNKNOWN",entryGate:"BLOCK_NEW_ENTRIES",
      summary:"Market regime cannot be verified. Treat conditions as unknown and do not open a new position based on this module.",
      reasons:[!spy.valid?"SPY: "+spy.reason:null,!qqq.valid?"QQQ: "+qqq.reason:null].filter(Boolean),spy,qqq};
    const reasons=[];
    if(!spy.above200) reasons.push("SPY is below its 200-day average.");
    if(!spy.above50) reasons.push("SPY is below its 50-day average.");
    if(!qqq.above200) reasons.push("QQQ is below its 200-day average.");
    if(spy.annualizedVolatility>=40||qqq.annualizedVolatility>=45) reasons.push("Recent realized volatility is elevated.");
    const riskOff=(!spy.above200&&!spy.above50)||(spy.annualizedVolatility>=40)||(qqq.annualizedVolatility>=45);
    const riskOn=spy.above50&&spy.above200&&spy.sma50Above200&&qqq.above200&&
      qqq.above50&&spy.annualizedVolatility<30&&qqq.annualizedVolatility<35;
    const state=riskOff?"RISK-OFF":riskOn?"RISK-ON":"MIXED";
    return {state,entryGate:state==="RISK-OFF"?"BLOCK_NEW_ENTRIES":state==="MIXED"?"CAUTION_REQUIRES_FULL_VALIDATION":"NORMAL_RESEARCH_REVIEW",
      summary:state==="RISK-ON"?"Broad-market trend conditions are supportive; individual stocks still require every company, valuation, event and risk check.":
        state==="RISK-OFF"?"Broad-market conditions are defensive. Do not treat individual positive signals as sufficient for a new entry.":
        "Market signals are mixed. Require full individual-stock validation; this module does not authorize a trade.",
      reasons:reasons.length?reasons:["SPY and QQQ trend and volatility checks meet this module's supportive thresholds."],
      spy,qqq,asOf:spy.asOf};
  }
  root.assessMarketRegime=assessMarketRegime;
  if(typeof module!=="undefined"&&module.exports) module.exports={assessMarketRegime,assessSeries};
})(typeof globalThis!=="undefined"?globalThis:this);
