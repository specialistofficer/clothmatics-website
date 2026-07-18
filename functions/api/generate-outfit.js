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

    let limitKey = null;
    let priorUsage = 0;
    if (context.env.OUTFIT_LIMITS) {
      const day = new Date().toISOString().slice(0, 10);
      limitKey = `${identity.localId}:${day}`;
      priorUsage = Number(await context.env.OUTFIT_LIMITS.get(limitKey) || 0);
      const dailyLimit = Number(context.env.WEB_DAILY_OUTFIT_LIMIT || 1);
      if (priorUsage >= dailyLimit) return json({ error: "Today’s web outfit is ready. Try again tomorrow or use Premium in the app." }, 429);
    }

    const occasion = clean(body.occasion, 40) || "casual";
    const preference = clean(body.preference, 240);
    const prompt = buildPrompt({ wardrobe, occasion, preference, profile: body.profile || {} });
    const outfit = await callGemini(context.env.GEMINI_API_KEY, prompt);
    outfit.wardrobeItemIds = resolveIds(outfit.wardrobeItemIds, wardrobe);
    if (!outfit.wardrobeItemIds.length) throw new Error("AI did not return usable wardrobe items.");
    // Count only successful generations; provider failures never consume the
    // user's daily allowance.
    if (context.env.OUTFIT_LIMITS && limitKey) {
      await context.env.OUTFIT_LIMITS.put(limitKey, String(priorUsage + 1), { expirationTtl: 172800 });
    }
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

function sanitizeWardrobe(items) { return Array.isArray(items) ? items.map((item)=>({id:clean(item.id,160),title:clean(item.title,100),category:clean(item.category,50),subCategory:clean(item.subCategory,50),primaryColor:clean(item.primaryColor,40),secondaryColors:Array.isArray(item.secondaryColors)?item.secondaryColors.slice(0,5).map((v)=>clean(v,30)):[],pattern:clean(item.pattern,40),fit:clean(item.fit,40),material:clean(item.material,50),season:item.season,occasion:Array.isArray(item.occasion)?item.occasion.slice(0,10).map((v)=>clean(v,40)):[],favorite:Boolean(item.favorite),laundryStatus:clean(item.laundryStatus,20)})).filter((item)=>item.id) : []; }
function resolveIds(ids, wardrobe) { const valid=new Set(wardrobe.map((item)=>item.id)); return [...new Set((Array.isArray(ids)?ids:[]).map(String).filter((id)=>valid.has(id)))]; }
function clean(value,max) { return String(value ?? "").replace(/[<>]/g,"").trim().slice(0,max); }
function getBearer(header="") { return header.startsWith("Bearer ") ? header.slice(7).trim() : ""; }
function json(body,status=200) { return new Response(JSON.stringify(body),{status,headers:{"Content-Type":"application/json","Cache-Control":"no-store","X-Content-Type-Options":"nosniff"}}); }
