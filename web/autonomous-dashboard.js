import {runNorthstarAgents} from "./autonomous-engine.mjs";
const $=id=>document.getElementById(id);
const symbols=["AAPL","NVDA","MSFT","GOOGL","AMZN"];
let timer=null,lastPayload=null;
function money(n){return typeof n==="number"&&Number.isFinite(n)?"$"+n.toFixed(2):"—";}
function esc(s){return String(s??"").replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));}
function render(result,payload){
 const status=result.status.replaceAll("_"," ");
 $("auto-status").textContent=status;
 $("auto-score").textContent=result.score===null?"—":result.score+"/100";
 $("auto-price").textContent=money(result.price);
 $("auto-feed").textContent=payload.feed+" · "+payload.provider;
 $("auto-updated").textContent="Updated "+new Date(payload.asOf).toLocaleTimeString();
 $("auto-flags").innerHTML=[...result.scannerFlags,...result.blockers].map(x=>'<li>'+esc(x)+'</li>').join("")||"<li>No material scanner flags.</li>";
 $("auto-audit").innerHTML=result.audit.map(a=>'<div class="auto-audit-row"><strong>'+esc(a.agent)+'</strong><span>'+esc(a.result.replaceAll("_"," "))+'</span></div>').join("");
 const s=result.illustrativeSizing;
 $("auto-size").textContent=s? s.shares+" shares · "+money(s.estimatedNotional)+" illustrative notional":"Not available";
 $("auto-note").textContent=payload.marketDataNotice+" "+result.disclaimer;
}
async function load(keepTimer=false){
 const ticker=$("auto-ticker").value.trim().toUpperCase();
 if(!/^[A-Z][A-Z0-9.-]{0,9}$/.test(ticker)){ $("auto-status").textContent="Enter a valid ticker";return;}
 $("auto-status").textContent="Fetching authenticated IEX data…";
 try{
  const response=await fetch("/api/alpaca-equity?ticker="+encodeURIComponent(ticker),{cache:"no-store"});
  const payload=await response.json();
  if(!response.ok)throw new Error(payload.error||"Market data unavailable");
  const equity=Number($("auto-equity").value);
  const result=runNorthstarAgents({ticker,bars:payload.bars,quote:payload.quote,equity:Number.isFinite(equity)&&equity>0?equity:null,now:new Date().toISOString(),config:{maxQuoteAgeMs:120000}});
  lastPayload=payload;render(result,payload);
 }catch(error){$("auto-status").textContent="Unavailable";$("auto-flags").innerHTML="<li>"+esc(error.message)+"</li>";}
}
function stop(){if(timer)clearInterval(timer);timer=null;$("auto-poll").textContent="Start 30-second refresh";}
function start(){stop();load();timer=setInterval(load,30000);$("auto-poll").textContent="Stop auto-refresh";}
document.addEventListener("DOMContentLoaded",()=>{
 if(!$("auto-run"))return;
 $("auto-run").addEventListener("click",()=>{stop();load();});
 $("auto-poll").addEventListener("click",()=>timer?stop():start());
 $("auto-ticker").addEventListener("keydown",e=>{if(e.key==="Enter"){stop();load();}});
 $("auto-preset").innerHTML=symbols.map(s=>'<option value="'+s+'">'+s+'</option>').join("");
 $("auto-preset").addEventListener("change",()=>{$("auto-ticker").value=$("auto-preset").value;stop();load();});
});
