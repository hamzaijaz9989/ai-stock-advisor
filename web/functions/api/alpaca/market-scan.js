const PAPER_API = "https://paper-api.alpaca.markets";
const DATA_API = "https://data.alpaca.markets";
const UNIVERSE = ["NVDA","AMD","MSFT","AAPL","META","AMZN","GOOGL","TSLA","AVGO","PLTR","ORCL","MU","NVTS","QQQ","SPY"];

export async function onRequestGet({ request, env }) {
  const key=env?.ALPACA_API_KEY_ID, secret=env?.ALPACA_API_SECRET_KEY;
  const headers={"APCA-API-KEY-ID":key||"","APCA-API-SECRET-KEY":secret||"","Accept":"application/json"};
  if(!key||!secret) return Response.json({ok:false,error:"Alpaca Paper Trading credentials are not configured."},{status:503,headers:{"Cache-Control":"no-store"}});
  const url=new URL(request.url);
  const requested=(url.searchParams.get("symbols")||UNIVERSE.join(",")).split(",").map(x=>x.trim().toUpperCase()).filter(Boolean);
  const symbols=[...new Set(requested)].filter(x=>UNIVERSE.includes(x)).slice(0,15);
  if(!symbols.length) return Response.json({ok:false,error:"No supported symbols were requested."},{status:400,headers:{"Cache-Control":"no-store"}});
  try {
    const response=await fetch(DATA_API+"/v2/stocks/snapshots?symbols="+encodeURIComponent(symbols.join(","))+"&feed=iex",{headers,signal:AbortSignal.timeout(10000)});
    if(!response.ok) return Response.json({ok:false,error:"Alpaca market data request failed (HTTP "+response.status+"). Check your market-data entitlement."},{status:502,headers:{"Cache-Control":"no-store"}});
    const raw=await response.json(), candidates=[];
    for(const symbol of symbols){
      const s=raw?.[symbol]; if(!s) continue;
      const last=Number(s.latestTrade?.p??s.minuteBar?.c??s.dailyBar?.c);
      const prev=Number(s.prevDailyBar?.c);
      const volume=Number(s.dailyBar?.v), prevVolume=Number(s.prevDailyBar?.v);
      const change=Number.isFinite(last)&&prev>0?(last/prev-1)*100:null;
      const volumeRatio=volume>0&&prevVolume>0?volume/prevVolume:null;
      const timestamp=s.latestTrade?.t||s.minuteBar?.t||s.dailyBar?.t||null;
      const ageMinutes=timestamp?Math.max(0,(Date.now()-Date.parse(timestamp))/60000):null;
      const priceValid=Number.isFinite(last)&&last>0;
      const liquid=Number.isFinite(volume)&&volume>=500000;
      const volumeConfirmed=Number.isFinite(volumeRatio)&&volumeRatio>=1.15;
      const positive=Number.isFinite(change)&&change>0;
      const score=Math.max(0,Math.min(100,Math.round((positive?35:0)+(volumeConfirmed?30:0)+(liquid?20:0)+(Number.isFinite(change)?Math.min(15,Math.max(0,change*3)):0))));
      const checks={priceValid,liquid,volumeConfirmed,positive};
      const passed=Object.values(checks).every(Boolean);
      candidates.push({symbol,price:last,previousClose:prev,changePct:change,volume,previousVolume:prevVolume,volumeRatio,timestamp,ageMinutes,score,checks,passed,reason:!priceValid?"No reliable last price":!liquid?"Daily volume below 500k shares":!volumeConfirmed?"Relative volume below 1.15×":!positive?"No positive daily momentum":"Momentum and liquidity checks passed"});
    }
    candidates.sort((a,b)=>b.score-a.score);
    return Response.json({ok:true,source:"Alpaca IEX snapshots",feed:"iex",asOf:new Date().toISOString(),universe:symbols.length,candidates},{headers:{"Cache-Control":"no-store","X-Content-Type-Options":"nosniff"}});
  } catch {
    return Response.json({ok:false,error:"Market scan timed out or Alpaca data is temporarily unavailable."},{status:502,headers:{"Cache-Control":"no-store"}});
  }
}
