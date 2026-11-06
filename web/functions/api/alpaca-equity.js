const SYMBOL=/^[A-Z][A-Z0-9.-]{0,9}$/;
const BASE="https://data.alpaca.markets/v2";
const headers=env=>({"APCA-API-KEY-ID":env.ALPACA_API_KEY_ID,"APCA-API-SECRET-KEY":env.ALPACA_API_SECRET_KEY,"Accept":"application/json"});
function json(body,status=200,extra={}){return Response.json(body,{status,headers:{"Cache-Control":"no-store","X-Content-Type-Options":"nosniff",...extra}});}
export async function onRequestGet({request,env}){
 const url=new URL(request.url),symbol=(url.searchParams.get("ticker")||"").trim().toUpperCase();
 if(!SYMBOL.test(symbol))return json({error:"Provide one valid US equity ticker."},400);
 if(!env?.ALPACA_API_KEY_ID||!env?.ALPACA_API_SECRET_KEY)return json({error:"Alpaca credentials are not configured. Add ALPACA_API_KEY_ID and ALPACA_API_SECRET_KEY as Cloudflare Pages secrets."},503);
 const auth=headers(env);
 try{
  const [barsResponse,snapshotResponse]=await Promise.all([
   fetch(BASE+"/stocks/"+encodeURIComponent(symbol)+"/bars?timeframe=1Day&limit=65&feed=iex&adjustment=split&sort=asc",{headers:auth,signal:AbortSignal.timeout(10000)}),
   fetch(BASE+"/stocks/"+encodeURIComponent(symbol)+"/snapshot?feed=iex",{headers:auth,signal:AbortSignal.timeout(10000)})
  ]);
  if(!barsResponse.ok)throw new Error("Alpaca historical bars returned HTTP "+barsResponse.status);
  if(!snapshotResponse.ok)throw new Error("Alpaca snapshot returned HTTP "+snapshotResponse.status);
  const [barData,snapshot]=await Promise.all([barsResponse.json(),snapshotResponse.json()]);
  const bars=(barData.bars||[]).map(b=>({timestamp:b.t,open:b.o,high:b.h,low:b.l,close:b.c,volume:b.v}));
  if(bars.length<55)throw new Error("Alpaca returned fewer than 55 daily bars; refusing to score this ticker.");
  const trade=snapshot.latestTrade||null,quote=snapshot.latestQuote||null,day=snapshot.dailyBar||null;
  const quotePrice=trade?.p??quote?.ap??quote?.bp??null;
  const quoteTime=trade?.t??quote?.t??null;
  if(day&&bars.length){
   const latest=bars[bars.length-1];
   const dayTime=latest.timestamp.slice(0,10),snapTime=day.t?String(day.t).slice(0,10):dayTime;
   if(dayTime===snapTime)bars[bars.length-1]={...latest,open:day.o??latest.open,high:day.h??latest.high,low:day.l??latest.low,close:day.c??latest.close,volume:day.v??latest.volume};
  }
  return json({ticker:symbol,feed:"IEX",provider:"Alpaca Market Data",coverage:"IEX exchange only; not consolidated US market volume",bars,quote:quotePrice&&quoteTime?{price:quotePrice,timestamp:quoteTime}:null,latestTrade:trade?{price:trade.p,timestamp:trade.t,size:trade.s,exchange:trade.x}:null,latestQuote:quote?{bid:quote.bp,ask:quote.ap,timestamp:quote.t}:null,asOf:new Date().toISOString(),marketDataNotice:"IEX-only live feed. Volume and quote coverage do not represent all US exchanges. Data entitlement and display rights are subject to Alpaca terms."});
 }catch(error){return json({ticker:symbol,error:String(error?.message||error),provider:"Alpaca Market Data",feed:"IEX"},502);}
}
