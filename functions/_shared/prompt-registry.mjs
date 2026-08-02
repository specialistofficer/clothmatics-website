export const PROMPT_REGISTRY = Object.freeze({
  outfit_stylist:{version:4,releaseTag:"wardrobe-grounded-2026-08"},
  style_this:{version:4,releaseTag:"anchor-rules-2026-08"},
  smart_purchase:{version:2,releaseTag:"verified-combinations-2026-08"},
  style_check:{version:4,releaseTag:"structured-photo-review-2026-08"},
  selfie_analysis:{version:2,releaseTag:"profile-signals-2026-08"},
  garment_analysis:{version:4,releaseTag:"taxonomy-2026-08"},
  trip_packing:{version:2,releaseTag:"owned-items-only-2026-08"},
  festival_stylist:{version:1,releaseTag:"festival-launch-2026-08"},
  weekly_report:{version:2,releaseTag:"meaningful-insights-2026-08"},
  unknown:{version:1,releaseTag:"unclassified"},
});

export function stablePromptHash(input="") { let hash=2166136261; for(let i=0;i<input.length;i+=1){hash^=input.charCodeAt(i);hash=Math.imul(hash,16777619)} return (hash>>>0).toString(36); }
export function promptStamp(promptId,requestPrompt="") { const id=PROMPT_REGISTRY[promptId]?promptId:"unknown",definition=PROMPT_REGISTRY[id]; return {promptId:id,promptVersion:definition.version,promptHash:stablePromptHash(`${id}:${definition.version}:${definition.releaseTag}`),requestPromptHash:requestPrompt?stablePromptHash(requestPrompt):""}; }
export function promptCacheKey(promptId,rawKey) { return `${promptStamp(promptId).promptHash}:${rawKey}`; }
