export function calculateEvidenceScore(factors, options = {}) {
  const minimumCoverage = Number.isFinite(options.minimumCoverage) ? options.minimumCoverage : 85;
  const forceNeutralReason = options.forceNeutralReason || null;
  if (!Array.isArray(factors) || !factors.length) return {valid:false,totalWeight:0,observedWeight:0,coverage:0,rawWeightedPoints:0,normalizedScore:0,needleScore:0,eligible:false,reason:"No evidence factors supplied.",factors:[]};
  const ids = new Set();
  let totalWeight=0, observedWeight=0, rawWeightedPoints=0;
  const checked=[];
  for (const factor of factors) {
    if (!factor || typeof factor.id!=="string" || !factor.id || ids.has(factor.id) || !Number.isFinite(factor.weight) || factor.weight<=0)
      return {valid:false,totalWeight,observedWeight,coverage:0,rawWeightedPoints:0,normalizedScore:0,needleScore:0,eligible:false,reason:"Invalid or duplicate factor definition.",factors:[]};
    ids.add(factor.id); totalWeight+=factor.weight;
    const available=factor.available===true && Number.isFinite(factor.score);
    if (available) {
      if (factor.score < -1 || factor.score > 1)
        return {valid:false,totalWeight,observedWeight,coverage:0,rawWeightedPoints:0,normalizedScore:0,needleScore:0,eligible:false,reason:"Factor score must be between -1 and +1.",factors:[]};
      observedWeight+=factor.weight; rawWeightedPoints+=factor.weight*factor.score;
    }
    checked.push({...factor,available,contribution:available?factor.weight*factor.score:null});
  }
  const valid=Math.abs(totalWeight-100)<1e-9;
  const coverage=valid?observedWeight:0;
  const normalizedScore=observedWeight?rawWeightedPoints/observedWeight*100:0;
  const eligible=valid && coverage>=minimumCoverage && !forceNeutralReason;
  return {valid,totalWeight,observedWeight,coverage,rawWeightedPoints:Math.round(rawWeightedPoints*100)/100,
    normalizedScore:Math.round(normalizedScore),needleScore:eligible?Math.max(-100,Math.min(100,Math.round(normalizedScore))):0,
    eligible,reason:!valid?"Factor weights must total exactly 100.":forceNeutralReason||(coverage<minimumCoverage?"Evidence coverage is below the minimum.":null),factors:checked};
}
