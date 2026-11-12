// Temporary single-purpose owner launch for the first NVDA council run.
// The launch ticket is separate from the operator token; no operator secret reaches the browser.
const headers={"Cache-Control":"no-store","X-Content-Type-Options":"nosniff","Referrer-Policy":"no-referrer"};
function equal(a,b){if(typeof a!=="string"||typeof b!=="string"||!a||!b)return false;let d=a.length^b.length;for(let i=0;i<Math.max(a.length,b.length);i++)d|=(a.charCodeAt(i)||0)^(b.charCodeAt(i)||0);return d===0;}
export async function onRequestGet({request,env}){
 const url=new URL(request.url),ticket=url.searchParams.get("ticket")||"";
 if(!equal(ticket,env?.NORTHSTAR_RESEARCH_LAUNCH_TICKET||""))return Response.json({ok:false,error:"Invalid or expired launch link."},{status:404,headers});
 if(!env?.NORTHSTAR_OPERATOR_TOKEN)return Response.json({ok:false,error:"Operator authorization is not configured."},{status:503,headers});
 const response=await fetch(new URL("/api/research/collect",url.origin),{
  method:"POST",headers:{"Authorization":"Bearer "+env.NORTHSTAR_OPERATOR_TOKEN,"Content-Type":"application/json","Accept":"application/json"},
  body:JSON.stringify({ticker:"NVDA",requestId:"northstar-nvda-first-council-20261113-01"})
 });
 const body=await response.text();
 return new Response(body,{status:response.status,headers:{"Content-Type":"application/json",...headers}});
}
