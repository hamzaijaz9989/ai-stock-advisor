(() => {
  "use strict";
  const $ = id => document.getElementById(id);
  const STORE = "northstar-paper-operations-v1";
  const START_CAPITAL = 500, RISK_PER_TRADE = 5, MAX_POSITIONS = 3, MAX_ALLOC = 0.35;
  const DEFAULT_UNIVERSE = ["AAPL","MSFT","NVDA","AMZN","GOOGL","META","AVGO","ORCL","AMD","JPM","LLY","COST","TSLA","NFLX"];
  let latest = new Map(), scanning = false;
  const money = n => Number.isFinite(n) ? new Intl.NumberFormat("en-US",{style:"currency",currency:"USD",maximumFractionDigits:2}).format(n) : "Unavailable";
  const pct = n => Number.isFinite(n) ? (n>=0?"+":"")+n.toFixed(2)+"%" : "n/a";
  const safeNum = (v,d=0) => Number.isFinite(v)?v:d;
  function loadState(){
    try {
      const s=JSON.parse(localStorage.getItem(STORE)||"{}");
      return {cash:Number.isFinite(s.cash)?s.cash:START_CAPITAL,positions:Array.isArray(s.positions)?s.positions:[],events:Array.isArray(s.events)?s.events:[],realized:safeNum(s.realized)};
    } catch { return {cash:START_CAPITAL,positions:[],events:[],realized:0}; }
  }
  let state=loadState();
  function persist(){ try{localStorage.setItem(STORE,JSON.stringify({...state,updatedAt:new Date().toISOString()}));}catch{status("Browser storage is unavailable; paper changes may not persist.");} }
  function log(type,message,ticker=""){
    state.events.push({at:new Date().toISOString(),type,ticker,message});
    state.events=state.events.slice(-300);persist();renderLog();
  }
  function status(message){$("ops-status").textContent=message;}
  function agent(id,message,active=false){const el=$(id);if(el){el.textContent=message;el.parentElement.classList.toggle("active",active);}}
  function historyStats(rows){
    if(!Array.isArray(rows)||rows.length<65) throw new Error("At least 65 daily bars are required.");
    const close=rows.map(r=>r.adjustedClose??r.close);
    const last=close.length-1, sma=n=>close.slice(last-n+1,last+1).reduce((a,b)=>a+b,0)/n;
    const sma20=sma(20),sma50=sma(50);
    const ret=n=>(close[last]/close[last-n]-1)*100;
    const volumes=rows.slice(-21,-1).map(r=>r.volume).filter(Number.isFinite);
    const avgVol=volumes.length?volumes.reduce((a,b)=>a+b,0)/volumes.length:null;
    const avgDollarVol=avgVol===null?null:avgVol*rows[last].close;
    const tr=[];
    for(let i=rows.length-14;i<rows.length;i++){
      const r=rows[i],p=rows[i-1];
      if(![r.high,r.low,p.close].every(Number.isFinite)) throw new Error("Missing high/low data; ATR unavailable.");
      tr.push(Math.max(r.high-r.low,Math.abs(r.high-p.close),Math.abs(r.low-p.close)));
    }
    const atr=tr.reduce((a,b)=>a+b,0)/tr.length;
    const currentVol=rows[last].volume;
    const relVol=avgVol>0&&Number.isFinite(currentVol)?currentVol/avgVol:null;
    const dataAge=(Date.now()-Date.parse(rows[last].date+"T23:59:59Z"))/86400000;
    return {price:rows[last].close,sma20,sma50,mom20:ret(20),mom60:ret(60),avgDollarVol,relVol,atr,atrPct:atr/rows[last].close*100,date:rows[last].date,dataAge};
  }
  function scoreSetup(s,quality){
    const trend=s.price>s.sma20&&s.sma20>s.sma50;
    const momentum=s.mom20>0&&s.mom60>0;
    const liquid=s.avgDollarVol!==null&&s.avgDollarVol>=5000000;
    const volatility=s.atrPct>0&&s.atrPct<=8;
    const volume=s.relVol===null||s.relVol>=0.8;
    const fresh=s.dataAge>=-0.1&&s.dataAge<=3;
    const clean=quality?.status==="NO_RULE_TRIGGERED";
    const checks=[["Trend",trend],["Momentum",momentum],["Liquidity",liquid],["Volatility",volatility],["Volume",volume],["Fresh data",fresh],["OHLC quality",clean]];
    const score=Math.round((trend?25:0)+(momentum?20:0)+(liquid?15:0)+(volatility?10:0)+(volume?10:0)+(fresh?10:0)+(clean?10:0));
    return {score,eligible:checks.every(x=>x[1]),checks,trend,momentum,liquid,volatility,volume,fresh,clean};
  }
  async function getJson(url){
    const r=await fetch(url,{headers:{"Accept":"application/json"}});
    const p=await r.json();
    if(!r.ok) throw new Error(p.error||"Provider request failed (HTTP "+r.status+").");
    return p;
  }
  async function scanOne(ticker){
    const [history,quote]=await Promise.all([
      getJson("/api/history?ticker="+encodeURIComponent(ticker)),
      getJson("/api/quote?ticker="+encodeURIComponent(ticker))
    ]);
    const s=historyStats(history.data||[]);
    const qPrice=Number.isFinite(quote.price)?quote.price:s.price;
    const quoteDate=quote.quoteTime?Date.parse(quote.quoteTime):Date.parse(history.endDate+"T23:59:59Z");
    const quoteAge=(Date.now()-quoteDate)/3600000;
    const quoteUsable=Number.isFinite(qPrice)&&qPrice>0&&quoteAge>=-2&&quoteAge<=72&&
      !String(quote.delayedOrRealtime||"").toLowerCase().includes("daily interval");
    const quality=history.dataQuality||{status:"UNKNOWN"};
    const setup=scoreSetup(s,quality);
    return {ticker,price:qPrice,quoteAgeHours:quoteAge,quoteUsable,quoteSource:quote.source||history.source,historyDate:history.endDate,quality,stats:s,...setup,sourceWarning:quote.warning||history.warning||""};
  }
  function renderResults(results,errors){
    const root=$("ops-results");root.innerHTML="";
    if(!results.length){const p=document.createElement("p");p.className="empty";p.textContent="No symbols returned enough reliable daily data. "+errors.slice(0,5).join(" · ");root.append(p);return;}
    for(const r of results){
      const card=document.createElement("article");card.className="ops-result";
      const head=document.createElement("div");head.className="ops-result-head";
      const title=document.createElement("strong");title.textContent=r.ticker;
      const score=document.createElement("span");score.className="ops-score";score.textContent=r.score+"/100";
      head.append(title,score);
      const tags=document.createElement("div");tags.className="ops-tags";
      [[r.trend?"UPTREND":"TREND FAIL",r.trend],[r.momentum?"MOMENTUM":"NO MOMENTUM",r.momentum],[r.liquid?"LIQUID":"LOW LIQUIDITY",r.liquid],[r.clean?"OHLC CLEAN":"QUALITY REVIEW",r.clean]].forEach(([label,ok])=>{const x=document.createElement("span");x.className="ops-tag";x.textContent=label+(ok?" · PASS":" · CHECK");tags.append(x);});
      const detail=document.createElement("p");detail.textContent="Last close "+money(r.stats.price)+" · 20D "+pct(r.stats.mom20)+" · 60D "+pct(r.stats.mom60)+" · ATR "+r.stats.atrPct.toFixed(2)+"% · Avg $ volume "+money(r.stats.avgDollarVol);
      const extra=document.createElement("p");extra.textContent="Data "+r.historyDate+" · "+r.quoteSource+" · "+(r.quoteUsable?"quote age "+r.quoteAgeHours.toFixed(1)+"h":"quote timestamp not suitable for paper entry")+". "+(r.quality.rules||"Quality rules unavailable");
      const actions=document.createElement("div");actions.className="ops-actions";
      const paper=document.createElement("button");paper.type="button";paper.className="secondary-button";paper.textContent="Simulate paper entry";
      paper.disabled=!r.eligible||!r.quoteUsable||state.positions.length>=MAX_POSITIONS||state.cash<5;
      paper.addEventListener("click",()=>openPaper(r));
      actions.append(paper);
      card.append(head,tags,detail,extra,actions);root.append(card);
    }
    if(errors.length){const note=document.createElement("p");note.className="table-note";note.textContent=errors.length+" excluded: "+errors.join(" · ");root.append(note);}
  }
  async function runScan(){
    if(scanning)return;scanning=true;const button=$("ops-scan");button.disabled=true;button.textContent="Scanning…";
    const tickers=[...new Set($("ops-tickers").value.toUpperCase().split(/[\s,;]+/).map(x=>x.trim()).filter(x=>/^[A-Z][A-Z0-9.-]{0,9}$/.test(x)))].slice(0,30);
    if(!tickers.length){status("Enter at least one valid ticker.");scanning=false;button.disabled=false;button.textContent="Run opportunity scan";return;}
    latest.clear();const results=[],errors=[];
    agent("ops-agent-scan","Scanning "+tickers.length+" symbols",true);agent("ops-agent-risk","Checking liquidity, volatility and OHLC quality",true);
    try{
      for(let i=0;i<tickers.length;i+=3){
        const batch=tickers.slice(i,i+3);status("Scanning "+Math.min(i+3,tickers.length)+"/"+tickers.length+" · "+results.length+" complete");
        const settled=await Promise.allSettled(batch.map(scanOne));
        settled.forEach((x,j)=>{if(x.status==="fulfilled"){results.push(x.value);latest.set(x.value.ticker,x.value);}else errors.push(batch[j]+": "+(x.reason?.message||"Unavailable"));});
      }
      results.sort((a,b)=>b.score-a.score||b.stats.mom20-a.stats.mom20);
      renderResults(results,errors);$("ops-radar-count").textContent=results.length+" scanned · "+results.filter(x=>x.eligible).length+" pass all filters";
      $("ops-agent-scan").textContent=results.length+" symbols ranked";$("ops-agent-risk").textContent=errors.length+" data exclusions · quality filters applied";
      log("SCAN","Scanned "+tickers.length+" symbols; "+results.filter(x=>x.eligible).length+" passed all filters.");
      status("Scan complete · "+results.length+" results · "+errors.length+" excluded");
      markPositions();
    }catch(e){status("Scan stopped: "+e.message);log("ERROR",e.message);}
    finally{scanning=false;button.disabled=false;button.textContent="Run opportunity scan";agent("ops-agent-scan","Idle · scan complete");agent("ops-agent-risk","Risk checks complete");}
  }
  function openPaper(r){
    if(!r.eligible||!r.quoteUsable)return;
    if(state.positions.length>=MAX_POSITIONS){status("Maximum of three open paper positions reached.");return;}
    const entry=r.price*1.001,stop=entry-2*r.stats.atr,riskPerShare=entry-stop;
    if(!(stop>0&&riskPerShare>0)){status("Invalid stop calculation; entry rejected.");return;}
    const riskShares=Math.floor(RISK_PER_TRADE/riskPerShare);
    const allocationShares=Math.floor((state.cash*MAX_ALLOC)/entry);
    const cashShares=Math.floor(state.cash/entry);
    const shares=Math.min(riskShares,allocationShares,cashShares);
    if(shares<1){status("Position rejected: one share exceeds risk or allocation limits.");return;}
    const cost=shares*entry;
    if(cost>state.cash){status("Insufficient virtual cash.");return;}
    const position={id:Date.now()+"-"+r.ticker,ticker:r.ticker,shares,entry,stop,target:entry+2*riskPerShare,initialRisk:shares*riskPerShare,openedAt:new Date().toISOString(),mark:r.price,source:r.quoteSource,historyDate:r.historyDate,slippagePct:0.1,quality:"Passed scanner filters"};
    state.cash-=cost;state.positions.push(position);
    log("PAPER OPEN",r.ticker+" "+shares+" shares @ "+money(entry)+" incl. 0.10% adverse slippage; stop "+money(stop)+", target "+money(position.target)+". Risk budget ≤ "+money(RISK_PER_TRADE)+".",r.ticker);
    renderPortfolio();renderResults([...latest.values()].sort((a,b)=>b.score-a.score),[]);
  }
  function markPositions(){
    state.positions=state.positions.map(p=>{const r=latest.get(p.ticker);return r?{...p,mark:r.price,markAt:new Date().toISOString(),lastScanQuality:r.quality?.status||"UNKNOWN"}:p;});
    persist();renderPortfolio();
  }
  function closePosition(id){
    const p=state.positions.find(x=>x.id===id);if(!p)return;
    const exit=p.mark*0.999;const proceeds=p.shares*exit;const pnl=proceeds-p.shares*p.entry;
    state.cash+=proceeds;state.realized+=pnl;state.positions=state.positions.filter(x=>x.id!==id);
    log("PAPER CLOSE",p.ticker+" "+p.shares+" shares @ "+money(exit)+" incl. 0.10% adverse slippage; P&L "+money(pnl)+".",p.ticker);
    renderPortfolio();renderResults([...latest.values()].sort((a,b)=>b.score-a.score),[]);
  }
  function renderPortfolio(){
    const open=state.positions.reduce((a,p)=>a+p.shares*p.mark,0);
    const unreal=state.positions.reduce((a,p)=>a+p.shares*(p.mark-p.entry),0);
    $("ops-equity").textContent=money(state.cash+open);$("ops-cash").textContent=money(state.cash);
    $("ops-open-count").textContent=state.positions.length+" / "+MAX_POSITIONS;
    $("ops-realized").textContent=money(state.realized);
    $("ops-realized").className="metric-value "+(state.realized>=0?"ops-positive":"ops-negative");
    $("ops-agent-size").textContent="$"+RISK_PER_TRADE+" max planned risk · 35% max allocation";
    $("ops-agent-log").textContent=state.events.length+" local events · saved in this browser";
    const root=$("ops-positions");root.innerHTML="";
    if(!state.positions.length){const p=document.createElement("p");p.className="empty";p.textContent="No open paper positions. Only fully qualified scanner results can be simulated.";root.append(p);}
    state.positions.forEach(p=>{
      const card=document.createElement("article");card.className="ops-result";
      const head=document.createElement("div");head.className="ops-result-head";
      const name=document.createElement("strong");name.textContent=p.ticker+" · "+p.shares+" shares";
      const value=document.createElement("span");const pnl=p.shares*(p.mark-p.entry);value.className="ops-score "+(pnl>=0?"ops-positive":"ops-negative");value.textContent=money(pnl);
      head.append(name,value);
      const detail=document.createElement("p");detail.textContent="Entry "+money(p.entry)+" · Mark "+money(p.mark)+" · Stop "+money(p.stop)+" · 2R target "+money(p.target);
      const risk=document.createElement("p");risk.textContent="Opened "+new Date(p.openedAt).toLocaleString()+" · Initial planned risk "+money(p.initialRisk)+" · "+(p.lastScanQuality||"Awaiting fresh scan");
      const actions=document.createElement("div");actions.className="ops-actions";
      const close=document.createElement("button");close.type="button";close.className="secondary-button";close.textContent="Close simulated position";close.addEventListener("click",()=>closePosition(p.id));
      actions.append(close);card.append(head,detail,risk,actions);root.append(card);
    });
    if(unreal!==0){$("ops-agent-log").textContent+=" · Unrealized "+money(unreal);}
  }
  function renderLog(){
    const root=$("ops-log");root.innerHTML="";$("ops-log-count").textContent=state.events.length+" events";
    if(!state.events.length){const p=document.createElement("p");p.className="empty";p.textContent="No events recorded.";root.append(p);return;}
    state.events.slice().reverse().slice(0,80).forEach(e=>{const row=document.createElement("div");row.className="ops-log-row";const time=document.createElement("time");time.textContent=new Date(e.at).toLocaleString();const type=document.createElement("strong");type.textContent=e.type+(e.ticker?" · "+e.ticker:"");const message=document.createElement("span");message.textContent=e.message;row.append(time,type,message);root.append(row);});
  }
  function exportCsv(){
    const rows=[["timestamp","event","ticker","message"],...state.events.map(e=>[e.at,e.type,e.ticker,e.message])];
    const csv=rows.map(row=>row.map(v=>'"'+String(v??"").replace(/"/g,'""')+'"').join(",")).join("\r\n");
    const url=URL.createObjectURL(new Blob(["\uFEFF"+csv],{type:"text/csv;charset=utf-8"}));
    const a=document.createElement("a");a.href=url;a.download="northstar-paper-operations.csv";a.click();URL.revokeObjectURL(url);
    status("Paper activity CSV exported.");
  }
  $("ops-scan").addEventListener("click",runScan);
  $("ops-export").addEventListener("click",exportCsv);
  renderPortfolio();renderLog();
  window.addEventListener("storage",e=>{if(e.key===STORE){state=loadState();renderPortfolio();renderLog();}});
})();