const MODELS = ["gemini-2.5-flash", "gemini-3.1-flash-lite"];

export async function onRequestPost(context) {
  try {
    const token = getBearer(context.request.headers.get("Authorization"));
    if (!token) return json({ error: "Please sign in again." }, 401);

    const identity = await verifyFirebaseToken(token, context.env.FIREBASE_WEB_API_KEY);
    if (!identity?.localId) return json({ error: "Your session is invalid or expired." }, 401);

    const body = await context.request.json();
    const wardrobe = sanitizeWardrobe(body.wardrobe);
    if (!wardrobe.length) return json({ error: "Your wardrobe is empty. Add items in the mobile app first." }, 400);
    if (wardrobe.length > 120) return json({ error: "Wardrobe request is too large." }, 400);

    if (!context.env.OUTFIT_LIMITS) {
      return json({ error: "Outfit generation is not configured safely yet. Please use the ClothMatics mobile app." }, 503);
    }
    const limitKey = `web-ai-used:${identity.localId}`;
    const alreadyUsed = await context.env.OUTFIT_LIMITS.get(limitKey);
    if (alreadyUsed) {
      return json({ error: "You have already used your one web outfit recommendation. Continue styling in the ClothMatics mobile app." }, 429);
    }

    const occasion = clean(body.occasion, 40) || "casual";
    const preference = clean(body.preference, 240);
    const prompt = buildPrompt({ wardrobe, occasion, preference, profile: sanitizeProfile(body.profile) });
    const outfit = await callGemini(context.env.GEMINI_API_KEY, prompt);
    outfit.wardrobeItemIds = resolveIds(outfit.wardrobeItemIds, wardrobe);
    if (!outfit.wardrobeItemIds.length) throw new Error("AI did not return usable wardrobe items.");
    // Count only a successful generation. No TTL makes this a lifetime web
    // allowance for this Firebase UID.
    await context.env.OUTFIT_LIMITS.put(limitKey, JSON.stringify({ usedAt: new Date().toISOString() }));
    return json({ outfit });
  } catch (error) {
    console.error("generate-outfit", error);
    return json({ error: error?.message || "Outfit generation is temporarily unavailable." }, 500);
  }
}

export function onRequest() { return json({ error: "Method not allowed." }, 405); }

async function verifyFirebaseToken(token, apiKey) {
  if (!apiKey) throw new Error("FIREBASE_WEB_API_KEY is not configured.");
  const response = await fetch(`https://identitytoolkit.googleapis.com/v1/accounts:lookup?key=${encodeURIComponent(apiKey)}`, { method:"POST", headers:{"Content-Type":"application/json"}, body:JSON.stringify({ idToken:token }) });
  if (!response.ok) return null;
  return (await response.json()).users?.[0] || null;
}

async function callGemini(apiKey, prompt) {
  if (!apiKey) throw new Error("GEMINI_API_KEY is not configured.");
  let lastError = "AI service unavailable.";
  for (const model of MODELS) {
    const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${encodeURIComponent(apiKey)}`, { method:"POST", headers:{"Content-Type":"application/json"}, body:JSON.stringify({ contents:[{parts:[{text:prompt}]}], generationConfig:{responseMimeType:"application/json",temperature:.55} }) });
    const data = await response.json();
    if (response.ok) {
      const text = data?.candidates?.[0]?.content?.parts?.[0]?.text;
      if (!text) throw new Error("AI returned an empty response.");
      return JSON.parse(text.replace(/```json|```/g, "").trim());
    }
    lastError = data?.error?.message || lastError;
    if (![404,429].includes(response.status)) break;
  }
  throw new Error(lastError);
}

function buildPrompt({ wardrobe, occasion, preference, profile }) {
  return `You are ClothMatics, a precise personal fashion stylist. Create ONE complete, wearable outfit strictly from the supplied wardrobe. Never invent an item. Use exact item IDs. Do not select two items for the same role (for example two belts or two pairs of shoes). Avoid items with laundryStatus "Laundry".\n\nOccasion: ${occasion}\nPreference: ${preference || "None"}\nProfile: ${JSON.stringify(profile)}\nWardrobe: ${JSON.stringify(wardrobe)}\n\nReturn strict JSON only in this shape: {"score":88,"title":"Short outfit name","subtitle":"One-line description","wardrobeItemIds":["exact-id"],"reasoning":["reason 1","reason 2","reason 3"],"shoppingSuggestions":[]}. Score must be 0-100. Choose either a one-piece OR a compatible top and bottom, then at most one item per accessory role.`;
}

function sanitizeWardrobe(items) { return Array.isArray(items) ? items.map((item)=>({id:clean(item.id,160),title:clean(item.title,100),category:clean(item.category,50),subCategory:clean(item.subCategory,50),categoryRole:clean(item.categoryRole,40),layerRole:clean(item.layerRole,30),requiresBaseLayer:Boolean(item.requiresBaseLayer),standaloneOutfit:Boolean(item.standaloneOutfit),userOccasions:cleanArray(item.userOccasions,10,40),activitySuitability:cleanArray(item.activitySuitability,10,40),userRestrictions:clean(item.userRestrictions,160),setType:clean(item.setType,40),includedComponents:cleanArray(item.includedComponents,10,50),requiredComponents:cleanArray(item.requiredComponents,10,50),primaryColor:clean(item.primaryColor,40),secondaryColors:cleanArray(item.secondaryColors,5,30),pattern:clean(item.pattern,40),fit:clean(item.fit,40),material:clean(item.material,50),season:item.season,occasion:cleanArray(item.occasion,10,40),formality:clean(item.formality,30),tags:cleanArray(item.tags,12,40),favorite:Boolean(item.favorite),laundryStatus:clean(item.laundryStatus,20),hiddenFromAI:Boolean(item.hiddenFromAI)})).filter((item)=>item.id&&!item.hiddenFromAI) : []; }
function sanitizeProfile(profile={}) { const p=profile?.preferences||{}; return {gender:clean(profile.gender,30),dateOfBirth:clean(profile.dateOfBirth,20),profession:clean(profile.profession,60),city:clean(profile.city,60),bodyType:clean(profile.bodyType,40),skinTone:clean(profile.skinTone,40),hairColor:clean(profile.hairColor,40),preferences:{styleLean:cleanArray(p.styleLean,10,40),favoriteColors:cleanArray(p.favoriteColors,10,30),avoidColors:cleanArray(p.avoidColors,10,30),hardExclusions:cleanArray(p.hardExclusions,12,60),fitPreference:clean(p.fitPreference,30),stylingPriority:clean(p.stylingPriority,40),tempSensitivity:clean(p.tempSensitivity,20),environment:clean(p.environment,30),commute:clean(p.commute,30),footwearComfort:clean(p.footwearComfort,30),womensWardrobeDirection:clean(p.womensWardrobeDirection,30),mensShirtStyling:clean(p.mensShirtStyling,30),mensSilhouette:clean(p.mensSilhouette,30),styleExpression:clean(p.styleExpression,30),coverageRules:{sleevelessAllowed:Boolean(p.coverageRules?.sleevelessAllowed),shortsAllowed:Boolean(p.coverageRules?.shortsAllowed),fittedAllowed:Boolean(p.coverageRules?.fittedAllowed)}}}; }
function resolveIds(ids, wardrobe) { const valid=new Set(wardrobe.map((item)=>item.id)); return [...new Set((Array.isArray(ids)?ids:[]).map(String).filter((id)=>valid.has(id)))]; }
function clean(value,max) { return String(value ?? "").replace(/[<>]/g,"").trim().slice(0,max); }
function cleanArray(value,count,max) { return Array.isArray(value) ? value.slice(0,count).map((entry)=>clean(entry,max)).filter(Boolean) : []; }
function getBearer(header="") { return header.startsWith("Bearer ") ? header.slice(7).trim() : ""; }
function json(body,status=200) { return new Response(JSON.stringify(body),{status,headers:{"Content-Type":"application/json","Cache-Control":"no-store","X-Content-Type-Options":"nosniff"}}); }
