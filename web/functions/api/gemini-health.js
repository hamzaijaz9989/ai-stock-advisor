// Secure Gemini API health check: discovers models available to this key and performs
// a real generation request. Never returns or logs the API key or generated text.
export async function onRequestGet({ env }) {
  const key = env?.GEMINI_API_KEY;
  const headers = {
    "Cache-Control": "no-store",
    "Content-Type": "application/json; charset=utf-8",
    "X-Content-Type-Options": "nosniff"
  };
  if (!key) return Response.json({
    available:false,configured:false,provider:"Google Gemini",
    reason:"GEMINI_API_KEY is not configured in this deployment."
  },{status:503,headers});

  let stage="model discovery";
  try {
    const listResponse=await fetch("https://generativelanguage.googleapis.com/v1beta/models?pageSize=100",{
      headers:{"Accept":"application/json","x-goog-api-key":key},
      signal:AbortSignal.timeout(7000)
    });
    if(!listResponse.ok) return Response.json({
      available:false,configured:true,authenticated:[429,503].includes(listResponse.status),
      generationTest:"not_run",provider:"Google Gemini",upstreamStatus:listResponse.status,
      reason:"Gemini model discovery failed. Check API access, key restrictions or quota."
    },{status:502,headers});

    const payload=await listResponse.json();
    const models=Array.isArray(payload.models)?payload.models:[];
    const supported=models.filter(m=>typeof m?.name==="string"&&
      Array.isArray(m.supportedGenerationMethods)&&
      m.supportedGenerationMethods.includes("generateContent")&&
      !/embedding|aqa|tts|image|audio|veo|live|transcri/i.test(m.name));
    const preferred=[
      env.GEMINI_RESEARCH_MODEL,
      "models/gemini-3.6-flash",
      "models/gemini-3.8-flash",
      "models/gemini-3.7-flash",
      "models/gemini-3.5-flash",
      "models/gemini-3.1-flash-lite",
      "models/gemini-2.5-flash",
      "models/gemini-2.5-pro"
    ].filter(Boolean);
    const candidates=[
      ...preferred.map(name=>supported.find(m=>m.name===name||m.name==="models/"+name)).filter(Boolean),
      ...supported
    ].filter((m,i,a)=>a.findIndex(x=>x.name===m.name)===i).slice(0,3);
    if(!candidates.length) return Response.json({
      available:false,configured:true,authenticated:true,generationTest:"not_run",
      provider:"Google Gemini",modelsListed:models.length,generateContentModelsAvailable:supported.length,
      reason:"Authentication passed, but no suitable text-generation model was listed."
    },{status:502,headers});

    const attempted=[];
    let generationResponse=null,chosen=null;
    stage="text generation";
    for(const candidate of candidates){
      chosen=candidate;
      generationResponse=await fetch(
        "https://generativelanguage.googleapis.com/v1beta/"+candidate.name+":generateContent",
        {
          method:"POST",
          headers:{"Content-Type":"application/json","x-goog-api-key":key},
          body:JSON.stringify({
            systemInstruction:{parts:[{text:"Return valid JSON only."}]},
            contents:[{role:"user",parts:[{text:'Return exactly this JSON: {"status":"NORTHSTAR_GEMINI_OK"}'}]}],
            generationConfig:{responseMimeType:"application/json",temperature:0,maxOutputTokens:32}
          }),
          signal:AbortSignal.timeout(20000)
        }
      );
      attempted.push({model:candidate.name.replace(/^models\//,""),status:generationResponse.status});
      if(generationResponse.ok) break;
      // Model-specific 404s can occur when a model is listed but unavailable to this key.
      // Continue to the next listed model; stop only for request errors or quota limits.
      if([400,429].includes(generationResponse.status)) break;
    }
    if(!generationResponse?.ok) return Response.json({
      available:false,configured:true,authenticated:true,generationTest:"failed",
      provider:"Google Gemini",attemptedModels:attempted,
      upstreamStatus:generationResponse?.status||502,
      reason:"Gemini model discovery succeeded, but text generation failed on the available models."
    },{status:502,headers});

    const generated=await generationResponse.json();
    const generatedText=(generated.candidates||[]).flatMap(c=>c.content?.parts||[])
      .some(p=>typeof p.text==="string"&&p.text.trim().length>0);
    return Response.json({
      available:generatedText,configured:true,authenticated:true,
      generationTest:generatedText?"passed":"no_text_returned",
      provider:"Google Gemini",model:chosen?.name?.replace(/^models\//,"")||null,
      modelsListed:models.length,generateContentModelsAvailable:supported.length,
      checkedAt:new Date().toISOString()
    },{status:generatedText?200:502,headers});
  }catch(error){
    return Response.json({
      available:false,configured:true,provider:"Google Gemini",generationTest:"failed",
      stage, errorName:String(error?.name||"Error").slice(0,60), errorDetail:String(error?.message||error||"Unknown error").slice(0,180),
      reason:"Could not complete Gemini discovery and generation. Check network availability and retry."
    },{status:502,headers});
  }
}
