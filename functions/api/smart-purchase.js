import { bearer, clean, getOwnedWardrobe, getUserProfile, isPremiumProfile, json, logApiCall, verifyFirebaseToken } from "../_shared/firebase-rest.mjs";
import { promptCacheKey, promptStamp } from "../_shared/prompt-registry.mjs";

const MODELS = ["gemini-2.5-flash", "gemini-3.1-flash-lite"];

export async function onRequestPost(context) {
  const startedAt = Date.now();
  let token = "", identity, stamp = promptStamp("smart_purchase");
  try {
    token = bearer(context.request.headers.get("Authorization"));
    if (!token) return json({ error:"Please sign in again." },401);
    identity = await verifyFirebaseToken(token,context.env.FIREBASE_WEB_API_KEY);
    if (!identity?.localId) return json({ error:"Your session is invalid or expired." },401);
    if (!identity.emailVerified) return json({ error:"Verify your email before using web AI." },403);
    const [profile,rawWardrobe] = await Promise.all([getUserProfile(token,identity.localId),getOwnedWardrobe(token,identity.localId)]);
    if (profile.loginBlocked===true || profile.accountBlocked===true) return json({ error:"This account is currently restricted." },403);
    if (!isPremiumProfile(profile)) return json({ error:"Premium Smart Purchase is unavailable for this account. The free on-device comparison is still available." },403);
    const body=await context.request.json();
    const imageData=String(body.imageData||"");
    if (imageData && (!/^data:image\/(jpeg|png|webp);base64,/i.test(imageData)||imageData.length>5_500_000)) return json({ error:"Choose a JPEG, PNG, or WebP image under 4 MB." },400);
    const candidate=sanitizeCandidate(body.candidate||{}), wardrobe=sanitizeWardrobe(rawWardrobe);
    if (!candidate.title&&!candidate.category&&!imageData) return json({ error:"Describe the item or choose a photo." },400);
    if (!wardrobe.length) return json({ error:"Your wardrobe is empty." },400);
    const prompt=buildPrompt(candidate,wardrobe,body.price);
    stamp=promptStamp("smart_purchase",prompt);
    const generated=await callGemini(context.env.GEMINI_API_KEY,prompt,imageData);
    const result=sanitizeResult(generated.result,wardrobe);
    Object.assign(result,stamp,{provider:"google-gemini",model:generated.model,cacheNamespace:promptCacheKey("smart_purchase",identity.localId)});
    await logApiCall(token,{userId:identity.localId,feature:"smart_purchase",type:"web_ai",provider:"google-gemini",model:generated.model,status:"success",responseTime:Date.now()-startedAt,...stamp});
    return json({result});
  } catch(error) {
    console.error("smart-purchase",error);
    if(token&&identity?.localId) await logApiCall(token,{userId:identity.localId,feature:"smart_purchase",type:"web_ai",status:"failure",responseTime:Date.now()-startedAt,errorMessage:clean(error?.message,180),...stamp});
    return json({error:error?.message||"Smart Purchase is temporarily unavailable."},500);
  }
}
export function onRequest(){return json({error:"Method not allowed."},405)}

async function callGemini(apiKey,prompt,imageData){
  if(!apiKey)throw new Error("GEMINI_API_KEY is not configured.");
  let lastError="AI service unavailable.";
  for(const model of MODELS){
    const parts=[{text:prompt}];
    if(imageData){const [header,data]=imageData.split(",",2);parts.push({inlineData:{mimeType:header.match(/^data:([^;]+)/)?.[1]||"image/jpeg",data}})}
    const response=await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${encodeURIComponent(apiKey)}`,{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({contents:[{parts}],generationConfig:{responseMimeType:"application/json",temperature:.25}})});
    const data=await response.json();
    if(response.ok){const text=data?.candidates?.[0]?.content?.parts?.[0]?.text;if(!text)throw new Error("AI returned an empty response.");return{result:JSON.parse(text.replace(/```json|```/g,"").trim()),model}}
    lastError=data?.error?.message||lastError;if(![404,429].includes(response.status))break;
  }
  throw new Error(lastError);
}
function buildPrompt(candidate,wardrobe,price){return `You are the ClothMatics AI stylist performing a conservative purchase check. Compare the candidate against owned wardrobe metadata and the supplied photo when present. Never invent wardrobe IDs or counts. A similar item must score at least 65/100 based on category, subtype, color, pattern and material. Build at most 12 useful combinations containing owned IDs only. Candidate: ${JSON.stringify(candidate)}. Store price INR: ${Number(price)||"not supplied"}. Owned wardrobe: ${JSON.stringify(wardrobe)}. Return JSON only: {"verdict":"strong_buy|consider|duplicate","summary":"...","similarityMatches":[{"wardrobeItemId":"exact-id","score":70,"reason":"..."}],"outfitExamples":[{"itemIds":["exact-id"],"explanation":"..."}],"reasons":["..."]}.`;}
function sanitizeResult(raw={},wardrobe){const valid=new Set(wardrobe.map(x=>x.id));const similarityMatches=(Array.isArray(raw.similarityMatches)?raw.similarityMatches:[]).map(x=>({wardrobeItemId:clean(x.wardrobeItemId),score:Math.max(0,Math.min(100,Number(x.score)||0)),reason:clean(x.reason,180)})).filter(x=>valid.has(x.wardrobeItemId)&&x.score>=65).slice(0,6);const outfitExamples=(Array.isArray(raw.outfitExamples)?raw.outfitExamples:[]).map(x=>({itemIds:[...new Set((x.itemIds||[]).map(String).filter(id=>valid.has(id)))],explanation:clean(x.explanation,180)})).filter(x=>x.itemIds.length>=2).slice(0,12);return{verdict:["strong_buy","consider","duplicate"].includes(raw.verdict)?raw.verdict:"consider",summary:clean(raw.summary,260),similarityMatches,outfitExamples,reasons:(Array.isArray(raw.reasons)?raw.reasons:[]).map(x=>clean(x,180)).filter(Boolean).slice(0,5),possibleOutfits:outfitExamples.length,compatiblePieceCount:new Set(outfitExamples.flatMap(x=>x.itemIds)).size}}
function sanitizeCandidate(x){return{title:clean(x.title,100),category:clean(x.category,50),subCategory:clean(x.subCategory,50),primaryColor:clean(x.primaryColor,40),pattern:clean(x.pattern,40),material:clean(x.material,50),brand:clean(x.brand,50)}}
function sanitizeWardrobe(items){return items.map(x=>({id:clean(x.id),title:clean(x.title,100),category:clean(x.category,50),subCategory:clean(x.subCategory,50),primaryColor:clean(x.primaryColor,40),pattern:clean(x.pattern,40),material:clean(x.material||x.fabric,50),tags:Array.isArray(x.tags)?x.tags.slice(0,10).map(v=>clean(v,30)):[],laundryStatus:clean(x.laundryStatus,20),hiddenFromAI:Boolean(x.hiddenFromAI)})).filter(x=>x.id&&!x.hiddenFromAI&&x.laundryStatus!=="Laundry")}
