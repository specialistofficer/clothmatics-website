import { bearer, clean, getOwnedWardrobe, getUserProfile, json, logApiCall, verifyFirebaseToken } from "../_shared/firebase-rest.mjs";
import { promptCacheKey, promptStamp } from "../_shared/prompt-registry.mjs";

const MODELS = ["gemini-2.5-flash", "gemini-3.1-flash-lite"];
const ALLOWED_PROMPTS = new Set(["outfit_stylist", "style_this", "festival_stylist"]);

export async function onRequestPost(context) {
  const startedAt = Date.now();
  let token = "";
  let identity;
  let stamp = promptStamp("unknown");
  try {
    token = bearer(context.request.headers.get("Authorization"));
    if (!token) return json({ error: "Please sign in again." }, 401);
    identity = await verifyFirebaseToken(token, context.env.FIREBASE_WEB_API_KEY);
    if (!identity?.localId) return json({ error: "Your session is invalid or expired." }, 401);
    if (!identity.emailVerified) return json({ error: "Verify your email before using web AI." }, 403);

    const body = await context.request.json();
    const promptId = ALLOWED_PROMPTS.has(body.promptId) ? body.promptId : "outfit_stylist";
    const [profile, rawWardrobe] = await Promise.all([
      getUserProfile(token, identity.localId),
      getOwnedWardrobe(token, identity.localId),
    ]);
    if (profile.loginBlocked === true || profile.accountBlocked === true) return json({ error: "This account is currently restricted." }, 403);
    const wardrobe = sanitizeWardrobe(rawWardrobe);
    if (!wardrobe.length) return json({ error: "Your wardrobe is empty. Add items in the mobile app first." }, 400);

    if (!context.env.OUTFIT_LIMITS) return json({ error: "Outfit generation is not configured safely yet. Please use the ClothMatics mobile app." }, 503);
    const limitKey = `web-ai-used:${identity.localId}`;
    if (await context.env.OUTFIT_LIMITS.get(limitKey)) return json({ error: "You have already used your one web outfit recommendation. Continue styling in the ClothMatics mobile app." }, 429);

    const occasion = clean(body.occasion, 60) || "casual";
    const preference = clean(body.preference, 300);
    const anchorItemId = clean(body.anchorItemId, 160);
    const festivalCampaignId = clean(body.festivalCampaignId, 120);
    if (promptId === "style_this" && !wardrobe.some((item) => item.id === anchorItemId)) return json({ error: "The selected garment is no longer in your wardrobe." }, 400);
    const prompt = buildPrompt({ wardrobe, occasion, preference, profile: sanitizeProfile(profile), promptId, anchorItemId, festivalCampaignId });
    stamp = promptStamp(promptId, prompt);
    const generated = await callGemini(context.env.GEMINI_API_KEY, prompt);
    const outfit = generated.outfit;
    outfit.wardrobeItemIds = resolveIds(outfit.wardrobeItemIds, wardrobe);
    if (!outfit.wardrobeItemIds.length) throw new Error("AI did not return usable wardrobe items.");
    if (anchorItemId && !outfit.wardrobeItemIds.includes(anchorItemId)) throw new Error("AI did not preserve the selected garment.");
    Object.assign(outfit, stamp, { provider: "google-gemini", model: generated.model, festivalCampaignId: festivalCampaignId || null });

    await context.env.OUTFIT_LIMITS.put(limitKey, JSON.stringify({ usedAt: new Date().toISOString(), ...stamp, cacheNamespace: promptCacheKey(promptId, identity.localId) }));
    await logApiCall(token, { userId: identity.localId, feature: promptId, type: "web_ai", provider: "google-gemini", model: generated.model, status: "success", responseTime: Date.now() - startedAt, ...stamp, festivalCampaignId: festivalCampaignId || null });
    const fixtureId=clean(body.fixtureId,80);
    return json({ outfit, candidate:fixtureId?{[fixtureId]:outfit.wardrobeItemIds}:undefined });
  } catch (error) {
    console.error("generate-outfit", error);
    if (token && identity?.localId) await logApiCall(token, { userId: identity.localId, feature: stamp.promptId, type: "web_ai", status: "failure", responseTime: Date.now() - startedAt, errorMessage: clean(error?.message, 180), ...stamp });
    return json({ error: error?.message || "Outfit generation is temporarily unavailable." }, 500);
  }
}

export function onRequest() { return json({ error: "Method not allowed." }, 405); }

async function callGemini(apiKey, prompt) {
  if (!apiKey) throw new Error("GEMINI_API_KEY is not configured.");
  let lastError = "AI service unavailable.";
  for (const model of MODELS) {
    const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${encodeURIComponent(apiKey)}`, { method:"POST", headers:{"Content-Type":"application/json"}, body:JSON.stringify({ contents:[{parts:[{text:prompt}]}], generationConfig:{responseMimeType:"application/json",temperature:.45} }) });
    const data = await response.json();
    if (response.ok) {
      const text = data?.candidates?.[0]?.content?.parts?.[0]?.text;
      if (!text) throw new Error("AI returned an empty response.");
      return { outfit: JSON.parse(text.replace(/```json|```/g, "").trim()), model };
    }
    lastError = data?.error?.message || lastError;
    if (![404,429].includes(response.status)) break;
  }
  throw new Error(lastError);
}

function buildPrompt({ wardrobe, occasion, preference, profile, promptId, anchorItemId, festivalCampaignId }) {
  const mode = promptId === "style_this" ? `The outfit MUST include anchor item ID ${anchorItemId}.` : promptId === "festival_stylist" ? `This is a festival request for campaign ${festivalCampaignId || "unspecified"}. Keep it culturally suitable and never claim a look was pre-generated.` : "";
  return `You are ClothMatics, a precise personal fashion stylist. Create ONE complete wearable outfit strictly from the supplied owned wardrobe. Never invent an item and use exact IDs. Avoid Laundry or hidden items. Do not choose duplicate garment roles. ${mode}\nOccasion: ${occasion}\nPreference: ${preference || "None"}\nProfile: ${JSON.stringify(profile)}\nWardrobe: ${JSON.stringify(wardrobe)}\nReturn strict JSON only: {"score":88,"title":"Short outfit name","subtitle":"One-line description","wardrobeItemIds":["exact-id"],"reasoning":["reason 1","reason 2","reason 3"],"shoppingSuggestions":[]}. Choose either a one-piece or a compatible top and bottom, plus at most one item per optional role.`;
}

function sanitizeWardrobe(items) { return Array.isArray(items) ? items.map((item)=>({id:clean(item.id),title:clean(item.title,100),category:clean(item.category,50),subCategory:clean(item.subCategory,50),categoryRole:clean(item.categoryRole,40),layerRole:clean(item.layerRole,30),requiresBaseLayer:Boolean(item.requiresBaseLayer),standaloneOutfit:Boolean(item.standaloneOutfit),userOccasions:cleanArray(item.userOccasions,10,40),activitySuitability:cleanArray(item.activitySuitability,10,40),userRestrictions:clean(item.userRestrictions,160),setType:clean(item.setType,40),includedComponents:cleanArray(item.includedComponents,10,50),requiredComponents:cleanArray(item.requiredComponents,10,50),primaryColor:clean(item.primaryColor,40),secondaryColors:cleanArray(item.secondaryColors,5,30),pattern:clean(item.pattern,40),fit:clean(item.fit,40),material:clean(item.material,50),season:item.season,occasion:cleanArray(item.occasion,10,40),formality:clean(item.formality,30),tags:cleanArray(item.tags,12,40),favorite:Boolean(item.favorite),laundryStatus:clean(item.laundryStatus,20),hiddenFromAI:Boolean(item.hiddenFromAI)})).filter((item)=>item.id&&!item.hiddenFromAI) : []; }
function sanitizeProfile(profile={}) { const p=profile?.preferences||{}; return {gender:clean(profile.gender,30),profession:clean(profile.profession,60),bodyType:clean(profile.bodyTypeSelfReported||profile.aiAnalysis?.bodyType,40),preferences:{styleLean:cleanArray(p.styleLean,10,40),favoriteColors:cleanArray(p.favoriteColors,10,30),avoidColors:cleanArray(p.avoidColors,10,30),hardExclusions:cleanArray(p.hardExclusions,12,60),fitPreference:clean(p.fitPreference,30),stylingPriority:clean(p.stylingPriority,40),footwearComfort:clean(p.footwearComfort,30),coverageRules:p.coverageRules||{}}}; }
function resolveIds(ids, wardrobe) { const valid=new Set(wardrobe.map((item)=>item.id)); return [...new Set((Array.isArray(ids)?ids:[]).map(String).filter((id)=>valid.has(id)))]; }
function cleanArray(value,count,max) { return Array.isArray(value) ? value.slice(0,count).map((entry)=>clean(entry,max)).filter(Boolean) : []; }
