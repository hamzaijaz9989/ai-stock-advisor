const PAPER_API="https://paper-api.alpaca.markets";
export async function onRequestGet({env}){
 const key=env?.ALPACA_API_KEY_ID,secret=env?.ALPACA_API_SECRET_KEY;
 if(!key||!secret)return Response.json({ok:false,error:"Alpaca Paper Trading credentials are not configured."},{status:503,headers:{"Cache-Control":"no-store"}});
 try{
  const response=await fetch(PAPER_API+"/v2/orders?status=all&limit=30&direction=desc&nested=false",{headers:{"APCA-API-KEY-ID":key,"APCA-API-SECRET-KEY":secret,"Accept":"application/json"},signal:AbortSignal.timeout(8000)});
  if(!response.ok)return Response.json({ok:false,error:"Could not retrieve Alpaca paper order history."},{status:502,headers:{"Cache-Control":"no-store"}});
  const rows=await response.json();
  const orders=Array.isArray(rows)?rows.map(o=>({id:o.id,symbol:o.symbol,qty:o.qty,side:o.side,status:o.status,filledAvgPrice:o.filled_avg_price,createdAt:o.created_at,filledAt:o.filled_at})): [];
  return Response.json({ok:true,environment:"paper",orders},{headers:{"Cache-Control":"no-store","X-Content-Type-Options":"nosniff"}});
 }catch{return Response.json({ok:false,error:"Alpaca paper order history timed out."},{status:502,headers:{"Cache-Control":"no-store"}})}
}
