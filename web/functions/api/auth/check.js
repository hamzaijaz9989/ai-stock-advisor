const HEADERS={"Cache-Control":"no-store","X-Content-Type-Options":"nosniff"};
export async function onRequestGet({request,env}){
 const token=typeof env?.NORTHSTAR_OPERATOR_TOKEN==="string"?env.NORTHSTAR_OPERATOR_TOKEN:"";
 const expected=token?"Bearer "+token:""; const actual=request.headers.get("Authorization")||"";
 if(!expected||actual.length!==expected.length)return Response.json({ok:false},{status:401,headers:HEADERS});
 let diff=0; for(let i=0;i<expected.length;i++)diff|=expected.charCodeAt(i)^actual.charCodeAt(i);
 return diff===0?Response.json({ok:true,headers:HEADERS}):Response.json({ok:false},{status:401,headers:HEADERS});
}