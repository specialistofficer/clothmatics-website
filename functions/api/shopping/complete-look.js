import { clean } from "../../_shared/firebase-rest.mjs";
import {
  SAMPLE_SHOPPING_RESULTS,
  normalizeProduct,
  fetchSerpApiShopping
} from "./search.js";

function apiResponse(body, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      "Content-Type": "application/json",
      "Cache-Control": "no-store",
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type, Authorization"
    }
  });
}

export async function onRequestOptions() {
  return new Response(null, {
    status: 204,
    headers: {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type, Authorization",
      "Access-Control-Max-Age": "86400"
    }
  });
}

/**
 * Gemini AI Stylist: Generates intelligent, trending complete-the-look outfit pairings.
 * Adheres strictly to gender, complementary categories (never same category as anchor),
 * color palette harmony, and trending silhouettes.
 */
export async function generateStylingPlanWithGemini({ item = {}, profile = {}, targetCategory = "", apiKey = "" }) {
  if (!apiKey) return null;

  const rawGender = String(profile.gender || profile.shoppingProfile?.gender || "").toLowerCase();
  const isFemale = rawGender.includes("fem") || rawGender.includes("wom") || rawGender === "female";
  const gender = isFemale ? "Women" : "Men";

  const anchorTitle = clean(item.title || "Garment", 100);
  const anchorCat = clean(item.category || "", 50);
  const anchorSubCat = clean(item.subCategory || "", 50);
  const anchorColor = clean(item.primaryColor || "", 40);
  const anchorFit = clean(item.fit || "", 40);
  const anchorMaterial = clean(item.material || "", 40);

  const isBottom = /bottom|pant|trouser|jean|skirt|short|chino|legging|palazzo/i.test(`${anchorCat} ${anchorSubCat} ${anchorTitle}`);
  const isTop = /top|shirt|tee|t-shirt|blouse|kurta|sweater|hoodie|polo/i.test(`${anchorCat} ${anchorSubCat} ${anchorTitle}`);
  const isDress = /dress|gown|jumpsuit|romper/i.test(`${anchorCat} ${anchorSubCat} ${anchorTitle}`);
  const isShoes = /shoe|sneaker|boot|sandal|heel|loafer/i.test(`${anchorCat} ${anchorSubCat} ${anchorTitle}`);

  let requestedCategory = targetCategory ? targetCategory.toLowerCase() : "";
  if (isBottom && (!requestedCategory || requestedCategory.includes("pant") || requestedCategory.includes("bottom"))) {
    requestedCategory = "tops";
  } else if (isTop && (!requestedCategory || requestedCategory.includes("top"))) {
    requestedCategory = "bottoms";
  }

  const systemPrompt = `You are the lead AI Personal Fashion Stylist for ClothMatics.
Your task is to recommend a trending, highly cohesive piece to COMPLETE THE LOOK around an anchor garment owned by the user.

USER PROFILE:
- Gender: Strictly ${gender}
- Body type: ${profile.bodyTypeSelfReported || "Normal"}

ANCHOR GARMENT:
- Title: ${anchorTitle}
- Category: ${anchorCat} (${anchorSubCat})
- Color: ${anchorColor}
- Fit: ${anchorFit}
- Material: ${anchorMaterial}

TARGET CATEGORY: ${requestedCategory || "complementary outfit piece"}

STRICT FASHION RULES:
1. GENDER MUST BE STRICTLY ${gender.toUpperCase()}: Every query and product title must be specifically for ${gender}. Never output unisex or opposing gender clothing.
2. NEVER RECOMMEND THE SAME CATEGORY AS THE ANCHOR:
   ${isBottom ? "- The anchor item is a PAIR OF PANTS/TROUSERS. You must NEVER recommend pants, trousers, jeans, or chinos! Recommend a trending Shirt/T-shirt/Top, Footwear (sneakers/loafers), or a Layering jacket." : ""}
   ${isTop ? "- The anchor item is a TOP/SHIRT. You must NEVER recommend another top or shirt! Recommend trending Trousers/Pants, Footwear, or a Jacket." : ""}
   ${isDress ? "- The anchor item is a DRESS. Recommend Footwear, Layering shrug/jacket, or Handbags." : ""}
   ${isShoes ? "- The anchor item is FOOTWEAR. Recommend Trousers/Pants or Tops." : ""}
3. TRENDING & COMPLEMENTARY: Pick trending silhouettes and harmonious colors (e.g. for grey slim trousers, pick a crisp white slim/relaxed shirt, navy knitted polo, or minimalist white leather sneakers).
4. SEARCH TERMS: Provide direct, high-intent Google Shopping search queries in India (e.g. "${gender.toLowerCase()} white linen casual shirt", "${gender.toLowerCase()} white leather minimalist sneakers").

Return pure JSON only in this exact format:
{
  "targetCategory": "${requestedCategory || "tops"}",
  "searchTerm": "${gender.toLowerCase()} ...",
  "stylingReason": "Why this specific piece and color pairs with the anchor garment...",
  "recommendedColors": ["color1", "color2"],
  "alternativeCategories": [
    { "targetCategory": "shoes", "searchTerm": "${gender.toLowerCase()} ...", "stylingReason": "..." },
    { "targetCategory": "layering", "searchTerm": "${gender.toLowerCase()} ...", "stylingReason": "..." },
    { "targetCategory": "accessories", "searchTerm": "${gender.toLowerCase()} ...", "stylingReason": "..." }
  ]
}`;

  const models = ["gemini-2.5-flash", "gemini-2.0-flash"];
  for (const model of models) {
    try {
      const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          contents: [{ parts: [{ text: systemPrompt }] }],
          generationConfig: {
            responseMimeType: "application/json",
            temperature: 0.3
          }
        })
      });

      if (res.ok) {
        const data = await res.json();
        const rawText = data.candidates?.[0]?.content?.parts?.[0]?.text;
        if (rawText) {
          const parsed = JSON.parse(rawText);
          if (parsed && parsed.searchTerm) {
            return parsed;
          }
        }
      }
    } catch (err) {
      console.warn(`Gemini ${model} styling error:`, err);
    }
  }
  return null;
}

/**
 * Deterministic fashion engine fallback if Gemini is unavailable or rate-limited.
 * Enforces strict gender, complementary categories, and trend-aligned queries.
 */
export function getFallbackStylingPlan({ item = {}, profile = {}, targetCategory = "" }) {
  const rawGender = String(profile.gender || profile.shoppingProfile?.gender || "").toLowerCase();
  const isFemale = rawGender.includes("fem") || rawGender.includes("wom") || rawGender === "female";
  const gender = isFemale ? "women" : "men";

  const text = `${item.category || ""} ${item.subCategory || ""} ${item.title || ""}`.toLowerCase();
  const color = (item.primaryColor || "").toLowerCase();

  const isBottom = /bottom|pant|trouser|jean|skirt|short|chino|legging|palazzo/i.test(text);
  const isTop = /top|shirt|tee|t-shirt|blouse|kurta|sweater|hoodie|polo/i.test(text);
  const isDress = /dress|gown|jumpsuit|romper/i.test(text);

  let complementaryColor = "white";
  if (color.includes("grey") || color.includes("gray")) complementaryColor = "white";
  else if (color.includes("black")) complementaryColor = "white";
  else if (color.includes("beige") || color.includes("khaki") || color.includes("cream")) complementaryColor = "white";
  else if (color.includes("blue") || color.includes("navy")) complementaryColor = "white";
  else if (color.includes("white")) complementaryColor = "navy";
  else if (color.includes("green") || color.includes("olive")) complementaryColor = "beige";
  else if (color.includes("brown") || color.includes("tan")) complementaryColor = "cream";

  if (isBottom) {
    // ANCHOR IS A BOTTOM (PANT) -> MUST NEVER RECOMMEND A PANT!
    const requested = (targetCategory || "tops").toLowerCase();
    if (requested === "shoes") {
      return {
        targetCategory: "shoes",
        searchTerm: `${gender} ${complementaryColor} casual sneakers loafers`,
        stylingReason: `Clean ${complementaryColor} footwear balances your ${item.primaryColor || ""} trousers with modern, effortless contrast.`,
        recommendedColors: [complementaryColor, "black"],
        alternativeCategories: [
          { targetCategory: "tops", searchTerm: `${gender} ${complementaryColor} relaxed cotton shirt`, stylingReason: `A ${complementaryColor} shirt creates an elevated silhouette with your ${item.primaryColor || ""} trousers.` },
          { targetCategory: "layering", searchTerm: `${gender} navy casual overshirt jacket`, stylingReason: `An overshirt adds a modern third layer for structure.` },
          { targetCategory: "accessories", searchTerm: `${gender} leather belt watch`, stylingReason: `Essential leather accessories to tie the look together.` }
        ]
      };
    }

    if (requested === "layering") {
      return {
        targetCategory: "layering",
        searchTerm: `${gender} casual overshirt jacket blazer`,
        stylingReason: `A tailored jacket or relaxed overshirt completes your trousers for a smart-casual presence.`,
        recommendedColors: ["navy", "black", "olive"],
        alternativeCategories: [
          { targetCategory: "tops", searchTerm: `${gender} ${complementaryColor} relaxed cotton shirt`, stylingReason: `A crisp ${complementaryColor} top is the foundation piece.` },
          { targetCategory: "shoes", searchTerm: `${gender} ${complementaryColor} casual sneakers loafers`, stylingReason: `Footwear that pulls the entire outfit together.` }
        ]
      };
    }

    if (requested === "accessories") {
      return {
        targetCategory: "accessories",
        searchTerm: `${gender} leather belt watch minimalist`,
        stylingReason: `Cohesive leather accessories refine the waistline and finish the look.`,
        recommendedColors: ["black", "tan"],
        alternativeCategories: [
          { targetCategory: "tops", searchTerm: `${gender} ${complementaryColor} relaxed cotton shirt`, stylingReason: `A matching top to anchor the outfit.` },
          { targetCategory: "shoes", searchTerm: `${gender} ${complementaryColor} casual sneakers`, stylingReason: `Footwear matching the trousers.` }
        ]
      };
    }

    // Default: Tops & Shirts
    return {
      targetCategory: "tops",
      searchTerm: `${gender} ${complementaryColor} cotton shirt polo`,
      stylingReason: `A crisp ${complementaryColor} shirt provides classic, balanced contrast with your ${item.primaryColor || ""} trousers.`,
      recommendedColors: [complementaryColor, "navy", "black"],
      alternativeCategories: [
        { targetCategory: "shoes", searchTerm: `${gender} ${complementaryColor} casual sneakers loafers`, stylingReason: `Clean footwear that keeps your trousers sharp.` },
        { targetCategory: "layering", searchTerm: `${gender} navy casual overshirt jacket`, stylingReason: `An overshirt to add depth and layering.` },
        { targetCategory: "accessories", searchTerm: `${gender} leather belt watch`, stylingReason: `Refined accessories to complete the waistline.` }
      ]
    };
  }

  if (isTop) {
    // ANCHOR IS A TOP -> MUST NEVER RECOMMEND A TOP!
    return {
      targetCategory: "bottoms",
      searchTerm: `${gender} ${complementaryColor} straight fit trousers chinos`,
      stylingReason: `Straight-fit ${complementaryColor} trousers create a clean, versatile base for your ${item.title || "top"}.`,
      recommendedColors: [complementaryColor, "beige", "navy"],
      alternativeCategories: [
        { targetCategory: "shoes", searchTerm: `${gender} minimalist sneakers loafers`, stylingReason: `Versatile footwear to complement the top.` },
        { targetCategory: "layering", searchTerm: `${gender} casual jacket blazer`, stylingReason: `Layering outerwear that leaves the top visible.` },
        { targetCategory: "accessories", searchTerm: `${gender} casual watch belt`, stylingReason: `Understated accessories.` }
      ]
    };
  }

  if (isDress) {
    return {
      targetCategory: "shoes",
      searchTerm: `${gender} occasion footwear heels sandals flats`,
      stylingReason: `Footwear that complements the dress silhouette and occasion.`,
      recommendedColors: ["neutral", "metallic", "black"],
      alternativeCategories: [
        { targetCategory: "layering", searchTerm: `${gender} cropped jacket shrug`, stylingReason: `Light cropped layering that keeps the dress in focus.` },
        { targetCategory: "accessories", searchTerm: `${gender} clutch mini handbag`, stylingReason: `Structured bag to add contrast.` }
      ]
    };
  }

  // Default fallback
  return {
    targetCategory: "tops",
    searchTerm: `${gender} ${complementaryColor} casual shirt`,
    stylingReason: `A versatile pairing designed to complete your outfit.`,
    recommendedColors: [complementaryColor],
    alternativeCategories: []
  };
}

/**
 * Filters products ensuring strict gender matching, category purity, and budget limits.
 */
export function filterProductsStrict({
  products = [],
  minPrice,
  maxPrice,
  allowAboveBudget = false,
  gender = "men",
  anchorCategory = "",
  targetCategory = ""
}) {
  const isMale = gender === "men";
  const isFemale = gender === "women";
  const anchorLower = String(anchorCategory).toLowerCase();
  const targetLower = String(targetCategory).toLowerCase();

  const isAnchorBottom = /bottom|pant|trouser|jean|skirt|short|chino|legging|palazzo/i.test(anchorLower);
  const isAnchorTop = /top|shirt|tee|t-shirt|blouse|kurta|sweater|hoodie|polo/i.test(anchorLower);

  const min = Number.isFinite(Number(minPrice)) && Number(minPrice) >= 0 ? Number(minPrice) : null;
  const baseMax = Number.isFinite(Number(maxPrice)) && Number(maxPrice) > 0 ? Number(maxPrice) : null;
  const max = baseMax !== null && allowAboveBudget ? baseMax * 1.15 : baseMax;

  const femaleExcludeRegex = /\b(women|woman|women's|woman's|female|girl|girls|ladies|lady|kurti|kurtis|saree|sarees|lehenga|lehengas|bra|panties|maternity)\b/i;
  const maleExcludeRegex = /\b(men|man|men's|man's|male|boy|boys|gentleman|boxer|briefs)\b/i;

  return products.filter((item) => {
    const title = (item.title || "").toLowerCase();

    // 1. Strict Gender Exclusion
    if (isMale && femaleExcludeRegex.test(title)) {
      return false;
    }
    if (isFemale && maleExcludeRegex.test(title)) {
      return false;
    }

    // 2. Prevent recommending same category as anchor
    if (isAnchorBottom) {
      // Anchor is a bottom/pant -> NEVER allow pants, trousers, jeans, chinos!
      const isPant = /\b(pant|pants|trouser|trousers|jeans|cargos|cargo|chinos|chino|joggers|shorts|skirt)\b/i.test(title);
      const isTopOrShoe = /\b(shirt|top|t-shirt|tee|jacket|overshirt|polo|shoes|sneakers|loafers|belt|watch)\b/i.test(title);
      if (isPant && !isTopOrShoe) {
        return false;
      }
    } else if (isAnchorTop) {
      // Anchor is a top -> NEVER allow shirts or tops!
      const isTopItem = /\b(shirt|shirts|t-shirt|t-shirts|tee|tees|blouse|polo|kurta|top|tops)\b/i.test(title);
      const isBottomOrShoe = /\b(pants|trouser|trousers|jeans|skirt|shoes|sneakers|boots|belt)\b/i.test(title);
      if (isTopItem && !isBottomOrShoe) {
        return false;
      }
    }

    // 3. Category specificity if targetCategory is given
    if (targetLower === "tops") {
      const isShoe = /\b(shoes|sneakers|loafers|boots|sandals|footwear)\b/i.test(title);
      const isPant = /\b(pants|trouser|trousers|jeans|chinos|joggers|shorts)\b/i.test(title);
      const isTop = /\b(shirt|top|tee|t-shirt|polo|kurta|sweater|hoodie|jacket|overshirt)\b/i.test(title);
      if ((isShoe || isPant) && !isTop) return false;
    } else if (targetLower === "shoes") {
      const isShoe = /\b(shoe|shoes|sneaker|sneakers|loafer|loafers|boot|boots|sandal|sandals|footwear|slides|derby|oxford|mules|heels|flats)\b/i.test(title);
      const isShirtOrPant = /\b(shirt|t-shirt|pant|trouser|jeans|chinos)\b/i.test(title);
      if (!isShoe && isShirtOrPant) return false;
    } else if (targetLower === "layering") {
      const isLayer = /\b(jacket|blazer|overshirt|coat|shrug|cardigan|vest|bomber|hoodie|windbreaker)\b/i.test(title);
      const isPantOrShoe = /\b(pant|trouser|jeans|chinos|shoe|sneakers)\b/i.test(title);
      if (!isLayer && isPantOrShoe) return false;
    } else if (targetLower === "accessories") {
      const isAccessory = /\b(belt|watch|sunglasses|shades|wallet|bracelet|necklace|tie|cufflinks|bag|clutch|cap|hat)\b/i.test(title);
      const isClothing = /\b(shirt|pant|trouser|jeans|shoes|jacket)\b/i.test(title);
      if (!isAccessory && isClothing) return false;
    }

    // 4. Budget Limits
    if (min !== null && item.extractedPrice < min) return false;
    if (max !== null && item.extractedPrice > max) return false;

    return true;
  });
}

/**
 * Main handler for /api/shopping/complete-look
 */
export async function handleCompleteLook({
  item = {},
  profile = {},
  budget = {},
  allowAboveBudget = false,
  targetCategory = "",
  customQuery = "",
  gl = "in",
  hl = "en",
  env = {}
}) {
  const apiKey = env.SERPAPI_API_KEY || env.SERPAPI_KEY;
  const geminiKey = env.GEMINI_API_KEY;

  const rawGender = String(profile.gender || profile.shoppingProfile?.gender || "").toLowerCase();
  const isFemale = rawGender.includes("fem") || rawGender.includes("wom") || rawGender === "female";
  const gender = isFemale ? "women" : "men";

  // Step 1: Call Gemini AI for trending outfit styling plan
  let stylingPlan = null;
  if (geminiKey) {
    stylingPlan = await generateStylingPlanWithGemini({
      item,
      profile,
      targetCategory,
      apiKey: geminiKey
    });
  }

  // Fallback to deterministic expert fashion engine if Gemini was unavailable or returned null
  if (!stylingPlan || !stylingPlan.searchTerm) {
    stylingPlan = getFallbackStylingPlan({
      item,
      profile,
      targetCategory
    });
  }

  const searchInputQuery = (customQuery || "").trim();
  const query = searchInputQuery || stylingPlan.searchTerm;
  const minPrice = budget.min ?? budget.minPrice;
  const maxPrice = budget.max ?? budget.maxPrice;

  // Step 2: Query Google Shopping (via SerpApi) with the AI-styled search query
  let rawResults = [];
  let isSample = false;
  let notice = "";

  if (apiKey) {
    try {
      rawResults = await fetchSerpApiShopping({ query, gl, hl, apiKey });
      if (!rawResults.length) {
        // Broaden search terms slightly if exact query had no results
        const broadened = query.split(" ").slice(0, 3).join(" ");
        rawResults = await fetchSerpApiShopping({ query: broadened, gl, hl, apiKey });
      }
    } catch (error) {
      console.warn("SerpApi live request error:", error.message);
      rawResults = SAMPLE_SHOPPING_RESULTS;
      isSample = true;
      notice = "Shopping provider is temporarily unavailable. Showing preview matches.";
    }
  } else {
    rawResults = SAMPLE_SHOPPING_RESULTS;
    isSample = true;
    notice = "SerpApi API key not configured in Cloudflare environment yet. Displaying sample products for preview.";
  }

  // Step 3: Normalize and filter products strictly by gender, non-anchor category, and budget
  const normalized = rawResults.map((p, idx) => normalizeProduct(p, idx));

  let filtered = filterProductsStrict({
    products: normalized,
    minPrice,
    maxPrice,
    allowAboveBudget,
    gender,
    anchorCategory: `${item.category || ""} ${item.subCategory || ""} ${item.title || ""}`,
    targetCategory
  });

  // If strict target category matched 0 products, try without the narrow targetCategory filter
  // while STILL strictly preserving gender exclusion, anchor category exclusion, and budget limits!
  if (filtered.length === 0 && targetCategory) {
    filtered = filterProductsStrict({
      products: normalized,
      minPrice,
      maxPrice,
      allowAboveBudget,
      gender,
      anchorCategory: `${item.category || ""} ${item.subCategory || ""} ${item.title || ""}`,
      targetCategory: ""
    });
  }

  return {
    ok: true,
    intent: stylingPlan,
    products: filtered,
    total: filtered.length,
    unfilteredTotal: normalized.length,
    isSample,
    notice,
    status: 200
  };
}

export async function onRequestPost(context) {
  const { request, env } = context;
  let body = {};
  try {
    body = await request.json();
  } catch {
    return apiResponse({ ok: false, error: "A valid JSON payload is required." }, 400);
  }

  const item = body.item || {};
  const profile = body.profile || {};
  const budget = body.budget || {};
  const allowAboveBudget = body.allowAboveBudget === true;
  const targetCategory = body.targetCategory || "";
  const customQuery = body.customQuery || body.query || "";
  const gl = body.gl || "in";
  const hl = body.hl || "en";

  const result = await handleCompleteLook({
    item,
    profile,
    budget,
    allowAboveBudget,
    targetCategory,
    customQuery,
    gl,
    hl,
    env
  });

  return apiResponse(result, result.status || 200);
}

export async function onRequestGet(context) {
  const { request, env } = context;
  const url = new URL(request.url);

  const title = url.searchParams.get("title") || "Garment";
  const category = url.searchParams.get("category") || "Bottoms";
  const subCategory = url.searchParams.get("subCategory") || "Trousers";
  const primaryColor = url.searchParams.get("primaryColor") || "Grey";
  const gender = url.searchParams.get("gender") || "men";
  const targetCategory = url.searchParams.get("targetCategory") || "tops";
  const minPrice = url.searchParams.get("minPrice");
  const maxPrice = url.searchParams.get("maxPrice");
  const allowAboveBudget = url.searchParams.get("allowAboveBudget") === "true";
  const customQuery = url.searchParams.get("q") || "";

  const result = await handleCompleteLook({
    item: { title, category, subCategory, primaryColor },
    profile: { gender },
    budget: { min: minPrice, max: maxPrice },
    allowAboveBudget,
    targetCategory,
    customQuery,
    env
  });

  return apiResponse(result, result.status || 200);
}
