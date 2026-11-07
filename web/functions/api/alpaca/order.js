// Paper-only order endpoint. The brokerage host is intentionally hard-coded to Alpaca Paper Trading.
const PAPER_API="https://paper-api.alpaca.markets";
const ALLOWED=new Set(["NVDA","AMD","MSFT","AAPL","META","AMZN","GOOGL","TSLA","AVGO","PLTR","ORCL","MU","NVTS","QQQ","SPY"]);
export async function onRequestPost({request,env}){
 const key=env?.ALPACA_API_KEY_ID,secret=env?.ALPACA_API_SECRET_KEY;
 if(!key||!secret)return Response.json({ok:false,error:"Alpaca Paper Trading credentials are not configured."},{status:503,headers:{"Cache-Control":"no-store"}});
 let body;try{body=await request.json()}catch{return Response.json({ok:false,error:"Invalid JSON body."},{status:400})}
 const symbol=String(body?.symbol||"").trim().toUpperCase(),side=String(body?.side||"").toLowerCase(),qty=Number(body?.qty);
 if(!ALLOWED.has(symbol))return Response.json({ok:false,error:"This symbol is outside the approved Northstar paper-trading universe."},{status:400});
 if(!["buy","sell"].includes(side))return Response.json({ok:false,error:"Only long-only buy and position-reducing sell orders are supported."},{status:400});
 if(!Number.isInteger(qty)||qty<1||qty>100)return Response.json({ok:false,error:"Quantity must be a whole number from 1 to 100."},{status:400});
 const headers={"APCA-API-KEY-ID":key,"APCA-API-SECRET-KEY":secret,"Accept":"application/json","Content-Type":"application/json"};
 try{
  const accountRes=await fetch(PAPER_API+"/v2/account",{headers,signal:AbortSignal.timeout(8000)});
  if(!accountRes.ok)return Response.json({ok:false,error:"Could not verify the Alpaca paper account."},{status:502});
  const account=await accountRes.json();
  if(account.trading_blocked||account.account_blocked)return Response.json({ok:false,error:"Alpaca reports that this account is blocked from trading."},{status:403});
  const positionRes=await fetch(PAPER_API+"/v2/positions/"+encodeURIComponent(symbol),{headers,signal:AbortSignal.timeout(8000)});
  const hasPosition=positionRes.ok;
  const existingPosition=hasPosition?await positionRes.json():null;
  if(side==="sell"){
   if(!hasPosition)return Response.json({ok:false,error:"No sellable paper position was found for "+symbol+"."},{status:400});
   const available=Math.floor(Number(existingPosition.qty));
   if(!Number.isFinite(available)||qty>available)return Response.json({ok:false,error:"Sell quantity exceeds the available long position ("+available+" shares). Short selling is disabled."},{status:400});
  }else{
   const dataRes=await fetch("https://data.alpaca.markets/v2/stocks/"+encodeURIComponent(symbol)+"/trades/latest?feed=iex",{headers,signal:AbortSignal.timeout(8000)});
   if(!dataRes.ok)return Response.json({ok:false,error:"Could not verify a current market reference price; order blocked."},{status:502});
   const trade=await dataRes.json(),price=Number(trade?.trade?.p);
   const notional=price*qty,equity=Number(account.equity),existingValue=Number(existingPosition?.market_value||0);
   if(!Number.isFinite(price)||price<=0||!Number.isFinite(equity)||existingValue+notional>equity*.10)return Response.json({ok:false,error:"Order blocked: price unavailable or total position would exceed the 10% paper-equity allocation cap."},{status:400});
   if(notional>Number(account.buying_power))return Response.json({ok:false,error:"Order exceeds available paper buying power."},{status:400});
  }
  const payload={symbol,qty:String(qty),side,type:"market",time_in_force:"day",client_order_id:"northstar-"+Date.now()+"-"+crypto.randomUUID().slice(0,8)};
  const placed=await fetch(PAPER_API+"/v2/orders",{method:"POST",headers,body:JSON.stringify(payload),signal:AbortSignal.timeout(10000)});
  const result=await placed.json().catch(()=>({}));
  if(!placed.ok)return Response.json({ok:false,error:result?.message||"Alpaca rejected the paper order (HTTP "+placed.status+")."},{status:502,headers:{"Cache-Control":"no-store"}});
  return Response.json({ok:true,environment:"paper",order:{id:result.id,clientOrderId:result.client_order_id,symbol:result.symbol,qty:result.qty,side:result.side,type:result.type,status:result.status,submittedAt:result.submitted_at},message:"Paper order submitted to Alpaca. Check order status and fill; submission does not guarantee a fill."},{headers:{"Cache-Control":"no-store","X-Content-Type-Options":"nosniff"}});
 }catch{return Response.json({ok:false,error:"Alpaca paper order request timed out. Check the account before retrying to avoid duplicate orders."},{status:502,headers:{"Cache-Control":"no-store"}})}
}
