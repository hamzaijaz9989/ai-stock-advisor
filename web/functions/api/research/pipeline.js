import { runAgentPipeline } from "../../../lib/agent-pipeline.js";
const H={"Cache-Control":"no-store","X-Content-Type-Options":"nosniff","Referrer-Policy":"no-referrer"};
function sameSecret(a,b){if(typeof a!=="string"||typeof b!=="string"||!a||!b)return false;let d=a.length^b.length;for(let i=0;i<Math.max(a.length,b.length);i++)d|=(a.charCodeAt(i)||0)^(b.charCodeAt(i)||0);return d===0;}
export async function onRequestPost({request,env}){
 const token=env?.NORTHSTAR_OPERATOR_TOKEN;
 if(!token||!sameSecret(request.headers.get("Authorization")||"","Bearer "+token))return Response.json({ok:false,execution:false,error:"Unauthorized."},{status:401,headers:H});
 let candidate;try{candidate=await request.json();}catch{return Response.json({ok:false,execution:false,error:"Valid JSON body required."},{status:400,headers:H});}
 const result=runAgentPipeline(candidate);
 return Response.json({ok:true,execution:false,automatedOrderSubmission:false,traceDurable:false,result,checkedAt:new Date().toISOString()},{headers:H});
}
