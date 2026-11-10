// Secure Gemini API health check: discovers models available to this key and performs
// a minimal real text-generation request. Never returns or logs the API key or generated text.
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
      "models/gemini-2.5-flash",
      "models/gemini-2.5-pro",
      "models/gemini-2.0-flash"
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
            contents:[{role:"user",parts:[{text:"Reply with exactly this text and nothing else: NORTHSTAR_GEMINI_OK"}]}],
            generationConfig:{temperature:0,maxOutputTokens:64}
          }),
          signal:AbortSignal.timeout(20000)
        }
      );
      attempted.push({model:candidate.name.replace(/^models\//,""),status:generationResponse.status});
      if(generationResponse.ok) break;
      // Continue across model-specific incompatibilities; stop for quota or authorization failures.
      if([401,403,429].includes(generationResponse.status)) break;
    }
    if(!generationResponse?.ok) return Response.json({
      available:false,configured:true,authenticated:true,generationTest:"failed",
      provider:"Google Gemini",attemptedModels:attempted,
      upstreamStatus:generationResponse?.status||502,
      reason:"Gemini model discovery succeeded, but text generation failed on the available models."
    },{status:502,headers});

    const generated=await generationResponse.json();
    const candidate=generated.candidates?.[0];
    const generatedText=(generated.candidates||[]).flatMap(c=>c.content?.parts||[])
      .map(p=>typeof p.text==="string"?p.text:"").join("").trim();
    const passed=generatedText.includes("NORTHSTAR_GEMINI_OK");
    const blockReason=generated.promptFeedback?.blockReason||null;
    return Response.json({
      available:passed,configured:true,authenticated:true,
      generationTest:passed?"passed":"no_valid_text",
      provider:"Google Gemini",model:chosen?.name?.replace(/^models\//,"")||null,
      finishReason:candidate?.finishReason||null,
      promptBlockReason:blockReason,
      responseCandidates:Array.isArray(generated.candidates)?generated.candidates.length:0,
      responseTextLength:generatedText.length,
      modelsListed:models.length,generateContentModelsAvailable:supported.length,
      checkedAt:new Date().toISOString(),
      reason:passed?undefined:"Gemini authenticated, but the generation response did not contain the expected text. Inspect finishReason and promptBlockReason."
    },{status:passed?200:502,headers});
  }catch(error){
    return Response.json({
      available:false,configured:true,provider:"Google Gemini",generationTest:"failed",
      stage, errorName:String(error?.name||"Error").slice(0,60), errorDetail:String(error?.message||error||"Unknown error").slice(0,180),
      reason:"Could not complete Gemini discovery and generation. Check network availability and retry."
    },{status:502,headers});
  }
}
