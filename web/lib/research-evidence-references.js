// Keep only bounded provenance for canonical IDs actually cited in persisted reports.
// Provider values and the full evidence payload stay server-side and are not copied here.
export function buildResearchEvidenceReferences(context,result){
 const cited=new Set((Array.isArray(result?.agents)?result.agents:[]).flatMap(agent=>
  [...(Array.isArray(agent?.findings)?agent.findings:[]),...(Array.isArray(agent?.risks)?agent.risks:[])]
   .flatMap(item=>Array.isArray(item?.factIds)?item.factIds.filter(id=>typeof id==="string"):[])
 ));
 const seen=new Set(),references=[];
 for(const item of [...(Array.isArray(context?.facts)?context.facts:[]),...(Array.isArray(context?.evidence)?context.evidence:[])]){
  if(!item||typeof item.id!=="string"||!cited.has(item.id)||seen.has(item.id))continue;
  seen.add(item.id);const value=item.value&&typeof item.value==="object"?item.value:{};
  const label=[value.title,value.name,value.period,value.startDate,value.endDate,value.interval]
   .find(x=>typeof x==="string"&&x.trim())||null;
  references.push({factId:item.id,type:typeof item.type==="string"?item.type.slice(0,80):"",
   source:typeof item.source==="string"?item.source.slice(0,160):"",
   observedAt:typeof item.observedAt==="string"?item.observedAt:null,label:label?String(label).slice(0,240):null});
  if(references.length>=500)break;
 }
 return references;
}
