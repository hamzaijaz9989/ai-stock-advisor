(() => {
  "use strict";
  const $ = id => document.getElementById(id);
  const agents = [
    {id:"market-scanner",role:"market_scanner",name:"Market Scanner",purpose:"Scans the configured stock universe and records candidates or screening results. It does not create a buy signal by itself."},
    {id:"technical-analyst",role:"technical_analyst",name:"Technical Analyst",purpose:"Reviews price history and technical evidence when an actual research run supplies those inputs."},
    {id:"fundamental-analyst",role:"fundamental_analyst",name:"Fundamental Analyst",purpose:"Reviews company fundamentals and valuation evidence when supplied by the research pipeline."},
    {id:"news-analyst",role:"news_analyst",name:"News Analyst",purpose:"Reviews recorded company and market news evidence for a research run."},
    {id:"sentiment-analyst",role:"sentiment_analyst",name:"Sentiment Analyst",purpose:"Reviews sentiment inputs that are actually available to the research pipeline."},
    {id:"bull-researcher",role:"bull_researcher",name:"Bull Researcher",purpose:"Builds the evidence-based positive case from the research run inputs."},
    {id:"bear-researcher",role:"bear_researcher",name:"Bear Researcher",purpose:"Challenges the thesis and records downside risks from the research run inputs."},
    {id:"portfolio-analyst",role:"portfolio_analyst",name:"Portfolio Analyst",purpose:"Reviews portfolio context and exposure when verified portfolio data is available."},
    {id:"risk-committee",role:"risk_committee",name:"Risk Committee",purpose:"Reviews risk controls and whether a proposed paper action satisfies the configured safeguards."}
  ];
  let council = null;
  let runs = [];
  const safeTime = value => { const d=new Date(value||""); return Number.isFinite(d.getTime())?d.toLocaleString():"Not recorded"; };
  const clean = value => {
    if(value===null||value===undefined||value==="") return "Not recorded";
    if(typeof value==="object") return JSON.stringify(value,null,2);
    return String(value);
  };
  function addDataRow(root,key,value){
    const row=document.createElement("div");row.className="agent-data-row";
    const label=document.createElement("b");label.textContent=key.replaceAll(/([A-Z])/g," $1").replaceAll("_"," ").toUpperCase();
    const content=document.createElement("span");content.textContent=clean(value);
    row.append(label,content);root.appendChild(row);
  }
  function findAgentRecord(run,role){return Array.isArray(run?.agents)?run.agents.find(item=>item?.role===role):null;}
  function showAgent(agent){
    const dashboard=document.querySelector(".main > .pagehead");
    const stats=document.getElementById("overview");
    const layout=document.querySelector(".main > .layout");
    const lower=document.querySelector(".main > .lower");
    const footer=document.querySelector(".main > .footer");
    [dashboard,stats,layout,lower,footer].forEach(node=>{if(node)node.hidden=true;});
    $("agent-detail-view").hidden=false;
    $("agent-detail-title").textContent=agent.name;
    $("agent-detail-purpose").textContent=agent.purpose;
    const record=findAgentRecord(council?.latestRun,agent.role);
    const status=record?.status || (council?.latestRun ? "NOT RUN" : "NOT VERIFIED");
    $("agent-detail-status").textContent=String(status).replaceAll("_"," ").toUpperCase();
    const summary=$("agent-detail-summary");summary.replaceChildren();
    addDataRow(summary,"Current status",status);
    addDataRow(summary,"Ticker",council?.latestRun?.symbol||"Not recorded");
    addDataRow(summary,"Council run status",council?.latestRun?.status||"No persisted run");
    addDataRow(summary,"Run created",safeTime(council?.latestRun?.createdAt));
    const data=$("agent-detail-data");data.replaceChildren();
    if(record){
      const safeEntries=Object.entries(record).filter(([key])=>!/(secret|token|password|authorization|api.?key|credential)/i.test(key));
      if(safeEntries.length) safeEntries.forEach(([key,value])=>addDataRow(data,key,value));
      else data.textContent="The persisted agent record contains no additional displayable fields.";
    } else data.textContent="No persisted execution record for this agent. The agent is not shown as running.";
    const history=$("agent-detail-history");history.replaceChildren();
    const matches=(Array.isArray(runs)?runs:[]).map(run=>({run,record:findAgentRecord(run,agent.role)})).filter(item=>item.record);
    if(!matches.length) history.textContent="No historical execution records found for this agent.";
    else matches.slice(0,12).forEach(({run,record})=>{
      const row=document.createElement("div");row.className="agent-data-row";
      const label=document.createElement("b");label.textContent=String(record.status||"UNKNOWN").replaceAll("_"," ")+" · "+String(run.symbol||"UNKNOWN");
      const detail=document.createElement("span");detail.textContent=safeTime(run.createdAt);
      row.append(label,detail);history.appendChild(row);
    });
    history.scrollTop=0;
    history.dataset.back="dashboard";
    history.setAttribute("aria-label",agent.name+" execution history");
    $("agent-detail-view").scrollIntoView({behavior:"smooth",block:"start"});
    history.dataset.role=agent.role;
  }
  async function refreshCouncil(){
    try{
      const response=await fetch("/api/research/status?limit=20",{headers:{Accept:"application/json"},cache:"no-store"});
      const data=await response.json();
      if(!response.ok||data.ok!==true)throw new Error(data.error||"Research ledger unavailable");
      council=data;runs=Array.isArray(data.runs)?data.runs:[];
      return true;
    }catch(error){council=null;runs=[];return false;}
  }
  agents.forEach(agent=>{
    document.querySelectorAll('[data-agent="'+agent.id+'"]').forEach(button=>{
      button.addEventListener("click",async()=>{
        button.disabled=true;
        const ok=await refreshCouncil();
        showAgent(agent);
        if(!ok){$("agent-detail-summary").textContent="Research status endpoint unavailable. No execution status can be verified.";}
        button.disabled=false;
      });
    });
  });
  $("agent-detail-back").addEventListener("click",()=>{
    $("agent-detail-view").hidden=true;
    [".main > .pagehead","#overview",".main > .layout",".main > .lower",".main > .footer"].forEach(selector=>{
      const node=document.querySelector(selector);if(node)node.hidden=false;
    });
    window.scrollTo({top:0,behavior:"smooth"});
  });

  const chat=$("northstar-chat"),launch=$("northstar-chat-launch"),messages=$("chat-messages");
  launch.addEventListener("click",()=>{chat.hidden=false;$("chat-input").focus();});
  $("chat-close").addEventListener("click",()=>{chat.hidden=true;});
  function bubble(text,kind){
    const node=document.createElement("div");node.className="chat-msg "+kind;node.textContent=text;messages.appendChild(node);messages.scrollTop=messages.scrollHeight;
  }
  async function jsonGet(path){
    const response=await fetch(path,{headers:{Accept:"application/json"},cache:"no-store"});
    const data=await response.json();
    if(!response.ok)throw new Error(data.error||path+" unavailable");
    return data;
  }
  async function answerQuestion(question){
    const q=question.toLowerCase();
    const needsCouncil=/agent|council|scanner|analyst|researcher|risk committee/.test(q);
    const needsMarket=/market|quote|price|scanner|stock/.test(q);
    const needsPortfolio=/portfolio|position|cash|equity|profit|loss|p&l|account/.test(q);
    const needsSafety=/risk|safety|kill switch|execution|trade|order|ready/.test(q);
    const requestsAll=!needsCouncil&&!needsMarket&&!needsPortfolio&&!needsSafety;
    const jobs=[];
    if(needsCouncil||requestsAll)jobs.push(["council",jsonGet("/api/research/status?limit=20")]);
    if(needsMarket||requestsAll)jobs.push(["monitor",jsonGet("/api/monitor?limit=20")]);
    if(needsPortfolio||requestsAll)jobs.push(["paper",jsonGet("/api/alpaca/status")]);
    if(needsSafety||requestsAll)jobs.push(["readiness",jsonGet("/api/paper/readiness")]);
    const settled=await Promise.all(jobs.map(async ([key,promise])=>{try{return [key,await promise,null];}catch(error){return [key,null,error];}}));
    const state=Object.fromEntries(settled.map(([key,data,error])=>[key,{data,error}]));
    const lines=[];
    if(state.council){
      if(state.council.data){
        const d=state.council.data,latest=d.latestRun;
        lines.push("RESEARCH COUNCIL: "+(latest?String(latest.status||"UNKNOWN").replaceAll("_"," "):"No persisted runs"));
        lines.push("Latest ticker: "+(latest?.symbol||"Not recorded")+" · created: "+safeTime(latest?.createdAt));
        const records=Array.isArray(latest?.agents)?latest.agents:[];
        lines.push("Agent records: "+records.length+" returned for latest run.");
        if(records.length) lines.push(records.map(a=>String(a.role||"unknown").replaceAll("_"," ")+": "+String(a.status||"UNKNOWN").replaceAll("_"," ")).join("; "));
        else lines.push("No agent execution records are present in the latest run.");
      }else lines.push("RESEARCH COUNCIL: unavailable ("+state.council.error.message+").");
    }
    if(state.monitor){
      if(state.monitor.data){
        const d=state.monitor.data,r=d.latestRun||{};
        lines.push("MARKET MONITOR: "+String(r.status||"NO RUN").replaceAll("_"," ")+" · last completed: "+safeTime(r.completed_at));
        lines.push("Symbols checked: "+(r.symbols_checked??"Not recorded")+" · errors: "+(r.errors??"Not recorded")+" · unacknowledged events: "+(d.unacknowledgedEvents??"Not recorded"));
        lines.push("Verified quotes returned: "+(Array.isArray(d.quotes)?d.quotes.length:0)+" · events returned: "+(Array.isArray(d.events)?d.events.length:0));
      }else lines.push("MARKET MONITOR: unavailable ("+state.monitor.error.message+").");
    }
    if(state.paper){
      if(state.paper.data){
        const d=state.paper.data,a=d.account;
        lines.push("PAPER ACCOUNT: "+(d.connected&&d.environment==="paper"?"connected to paper environment":"not verified"));
        if(a)lines.push("Broker status: "+(a.status||"not recorded")+" · equity: "+(a.equity??"not returned")+" · buying power: "+(a.buyingPower??"not returned")+" · positions: "+(Array.isArray(d.positions)?d.positions.length:"not reconciled"));
        else lines.push("Account values were not returned.");
      }else lines.push("PAPER ACCOUNT: unavailable ("+state.paper.error.message+").");
    }
    if(state.readiness){
      if(state.readiness.data){
        const d=state.readiness.data;
        lines.push("PAPER SAFETY: "+(d.configured&&d.policyVerified?"policy verified":"NOT VERIFIED")+" · "+(d.message||"No readiness message"));
        lines.push("This endpoint is a readiness check, not permission to place an order. Execution remains separately locked.");
      }else lines.push("PAPER SAFETY: unavailable ("+state.readiness.error.message+").");
    }
    lines.push("Coverage note: I can report only records exposed by these connected Northstar endpoints. I cannot inspect secrets, undocumented configuration, source-code internals, or invent missing agent work. This assistant is currently a read-only status helper, not a connected generative AI model.");
    return lines.join("\n");
  }
  $("chat-form").addEventListener("submit",async event=>{
    event.preventDefault();
    const input=$("chat-input"),question=input.value.trim();if(!question)return;
    bubble(question,"user");input.value="";input.disabled=true;
    const send=$("chat-form").querySelector("button");send.disabled=true;send.textContent="…";
    try{bubble(await answerQuestion(question),"assistant");}
    catch(error){bubble("I couldn't retrieve verified system data: "+(error.message||"unknown error")+". No assumptions were made.","assistant");}
    finally{input.disabled=false;send.disabled=false;send.textContent="Send";input.focus();}
  });
})();
