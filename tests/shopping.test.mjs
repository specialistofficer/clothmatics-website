import test from "node:test";
import assert from "node:assert/strict";
import {
  SAMPLE_SHOPPING_RESULTS,
  normalizeProduct,
  filterByBudget,
  handleShoppingSearch,
  fetchSerperShopping,
  fetchShoppingWithFallback,
  buildQueryLatticeFromIntent,
  fetchShoppingLattice
} from "../functions/api/shopping/search.js";
import {
  getFallbackStylingPlan,
  filterProductsStrict,
  handleCompleteLook,
  hasValidImage,
  DIVERSE_SAMPLE_PRODUCTS,
  getUserProfileSizes,
  getUserProfilePreferences,
  extractProductSize,
  normalizeProductTitleForDeduplication,
  deduplicateAndRankProducts,
  detectProductSubtype,
  pickDiverseProductSet,
  createItemStylingReason,
  normalizePieceIntent,
  validateProduct,
  scoreProductRelevance,
  hashString
} from "../functions/api/shopping/complete-look.js";
import {
  getAnchorCategories,
  getComplementaryColor,
  getProfileGender,
  buildSmartShoppingQuery,
  getActiveBudgetRange,
  calculateMatchDetails,
  resolveBuyLink,
  getCategoryFallbackImage,
  getUserProfileSizes as getHelperSizes,
  getUserProfilePreferences as getHelperPrefs
} from "../complete-look-helpers.js";

test("normalizeProduct correctly maps SerpApi shopping_results format", () => {
  const raw = {
    position: 1,
    title: "KOTTY Women's Beige High Waist Wide Leg Straight Trouser for Formal and Office Wear",
    product_id: "14438293742031902146",
    product_link: "https://www.google.com/search?ibp=oshop&q=women+beige+wide+leg+trousers",
    source: "Amazon.in",
    price: "₹470",
    extracted_price: 470,
    old_price: "₹1,000",
    extracted_old_price: 1000,
    thumbnail: "https://encrypted-tbn1.gstatic.com/shopping?q=tbn:sample",
    delivery: "Free delivery"
  };

  const product = normalizeProduct(raw, 0);
  assert.equal(product.id, "14438293742031902146");
  assert.equal(product.position, 1);
  assert.equal(product.source, "Amazon.in");
  assert.equal(product.extractedPrice, 470);
  assert.equal(product.extractedOldPrice, 1000);
  assert.equal(product.discountPercent, 53); // (1000 - 470) / 1000 = 53%
  assert.equal(product.thumbnail, "https://encrypted-tbn1.gstatic.com/shopping?q=tbn:sample");
  assert.equal(product.delivery, "Free delivery");
});

test("normalizeProduct correctly maps Serper.dev (server.dev) shopping format", () => {
  const serperItem = {
    title: "Highlander Men Olive Green Slim Fit Casual Shirt",
    source: "Myntra",
    link: "https://www.myntra.com/shirts/highlander/olive-shirt/123",
    price: "₹699",
    delivery: "Free delivery",
    imageUrl: "https://encrypted-tbn0.gstatic.com/shopping?q=tbn:serper-sample",
    rating: 4.3,
    ratingCount: 215,
    productId: "serper-item-998",
    oldPrice: "₹1,399",
    offers: "50% off",
    position: 2
  };

  const product = normalizeProduct(serperItem, 1);
  assert.equal(product.id, "serper-item-998");
  assert.equal(product.position, 2);
  assert.equal(product.source, "Myntra");
  assert.equal(product.extractedPrice, 699);
  assert.equal(product.extractedOldPrice, 1399);
  assert.equal(product.discountPercent, 50);
  assert.equal(product.thumbnail, "https://encrypted-tbn0.gstatic.com/shopping?q=tbn:serper-sample");
  assert.equal(product.rating, 4.3);
  assert.equal(product.reviews, 215);
  assert.equal(product.delivery, "Free delivery");
});

test("fetchSerperShopping issues POST with X-API-KEY and JSON query", async () => {
  const originalFetch = globalThis.fetch;
  let requestedUrl = "";
  let requestHeaders = {};
  let requestBody = null;

  globalThis.fetch = async (url, options = {}) => {
    requestedUrl = String(url);
    requestHeaders = options.headers || {};
    requestBody = JSON.parse(options.body || "{}");
    return {
      ok: true,
      status: 200,
      json: async () => ({
        shopping: [
          {
            title: "Test Serper Shirt",
            source: "Amazon",
            link: "https://amazon.in/test",
            price: "₹499",
            imageUrl: "https://image.example.com/test.jpg",
            productId: "test-1"
          }
        ]
      })
    };
  };

  try {
    const res = await fetchSerperShopping({
      query: "men black shirt",
      gl: "in",
      hl: "en",
      apiKey: "test-serper-key-xyz"
    });

    assert.equal(requestedUrl, "https://google.serper.dev/shopping");
    assert.equal(requestHeaders["X-API-KEY"], "test-serper-key-xyz");
    assert.equal(requestHeaders["Content-Type"], "application/json");
    assert.equal(requestBody.q, "men black shirt");
    assert.equal(requestBody.gl, "in");
    assert.equal(requestBody.hl, "en");
    assert.equal(res.shopping.length, 1);
    assert.equal(res.shopping[0].title, "Test Serper Shirt");
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("fetchShoppingWithFallback queries Serper.dev directly when only SERPER_API_KEY is configured", async () => {
  const originalFetch = globalThis.fetch;
  let calledUrl = "";

  globalThis.fetch = async (url) => {
    calledUrl = String(url);
    return {
      ok: true,
      status: 200,
      json: async () => ({
        shopping: [{ title: "Serper Direct", price: "₹999", productId: "s1", imageUrl: "https://img.com/1.jpg" }]
      })
    };
  };

  try {
    const res = await fetchShoppingWithFallback({
      query: "navy chinos",
      env: { SERPER_API_KEY: "serper-key-123" }
    });

    assert.equal(calledUrl, "https://google.serper.dev/shopping");
    assert.equal(res.provider, "serper");
    assert.equal(res.hasKey, true);
    assert.equal(res.items.length, 1);
    assert.equal(res.items[0].title, "Serper Direct");
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("fetchShoppingWithFallback recognizes SERVER_DEV_API_KEY and SERPER_KEY aliases", async () => {
  const originalFetch = globalThis.fetch;
  let calledCount = 0;

  globalThis.fetch = async () => {
    calledCount++;
    return {
      ok: true,
      status: 200,
      json: async () => ({
        shopping: [{ title: "Alias Product", price: "₹850", productId: "alias-1", imageUrl: "https://img.com/a.jpg" }]
      })
    };
  };

  try {
    const res = await fetchShoppingWithFallback({
      query: "white sneakers",
      env: { SERVER_DEV_API_KEY: "my-server-dev-key" }
    });
    assert.equal(calledCount, 1);
    assert.equal(res.provider, "serper");
    assert.equal(res.items[0].title, "Alias Product");
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("fetchShoppingWithFallback falls back to Serper.dev when SerpApi errors", async () => {
  const originalFetch = globalThis.fetch;
  const attemptedUrls = [];

  globalThis.fetch = async (url) => {
    const urlStr = String(url);
    attemptedUrls.push(urlStr);

    if (urlStr.includes("serpapi.com")) {
      return {
        ok: false,
        status: 429,
        text: async () => "Rate limit exceeded / Quota exhausted"
      };
    }

    if (urlStr.includes("serper.dev")) {
      return {
        ok: true,
        status: 200,
        json: async () => ({
          shopping: [
            { title: "Fallback Serper Item", price: "₹1,200", productId: "fb-1", imageUrl: "https://img.com/fb.jpg" }
          ]
        })
      };
    }

    return { ok: false, status: 404, text: async () => "Not found" };
  };

  try {
    const res = await fetchShoppingWithFallback({
      query: "black blazer",
      env: {
        SERPAPI_API_KEY: "failing-serpapi-key",
        SERPER_API_KEY: "working-serper-key"
      }
    });

    assert.equal(attemptedUrls.length, 2);
    assert(attemptedUrls[0].includes("serpapi.com"));
    assert(attemptedUrls[1].includes("serper.dev"));
    assert.equal(res.provider, "serper");
    assert.equal(res.items[0].title, "Fallback Serper Item");
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("filterByBudget respects minPrice and maxPrice limits", () => {
  const products = [
    { id: "1", extractedPrice: 470 },
    { id: "2", extractedPrice: 749 },
    { id: "3", extractedPrice: 1350 },
    { id: "4", extractedPrice: 2050 }
  ];

  // Under ₹1,000 (maxPrice: 999)
  const under1k = filterByBudget(products, { maxPrice: 999 });
  assert.deepEqual(under1k.map(p => p.id), ["1", "2"]);

  // ₹1,000 - ₹2,000
  const range1k2k = filterByBudget(products, { minPrice: 1000, maxPrice: 2000 });
  assert.deepEqual(range1k2k.map(p => p.id), ["3"]);

  // Allow above budget (+15% of maxPrice: 1000 * 1.15 = 1150)
  const productsWithBorder = [
    { id: "a", extractedPrice: 800 },
    { id: "b", extractedPrice: 1100 },
    { id: "c", extractedPrice: 1200 }
  ];
  const withAbove = filterByBudget(productsWithBorder, { maxPrice: 1000, allowAboveBudget: true });
  assert.deepEqual(withAbove.map(p => p.id), ["a", "b"]);
});

test("handleShoppingSearch falls back to sample data when no API key is provided", async () => {
  const result = await handleShoppingSearch({
    q: "women beige wide leg trousers",
    minPrice: 500,
    maxPrice: 1500,
    env: {}
  });

  assert.equal(result.ok, true);
  assert.equal(result.isSample, true);
  assert(result.notice.includes("SerpApi API key not configured"));
  assert(result.products.length > 0);
  for (const product of result.products) {
    assert(product.extractedPrice >= 500 && product.extractedPrice <= 1500);
  }
});

test("handleShoppingSearch returns 400 when query is blank", async () => {
  const result = await handleShoppingSearch({ q: "   ", env: {} });
  assert.equal(result.ok, false);
  assert.equal(result.status, 400);
});

test("getAnchorCategories returns complementary categories based on garment type (no same category)", () => {
  const bottomItem = { category: "Bottoms", subCategory: "Trousers", title: "Beige Wide Leg Trousers" };
  const categories = getAnchorCategories(bottomItem);
  const ids = categories.map(c => c.id);
  // Bottoms must strictly recommend tops, shoes, layering, accessories - NEVER bottoms!
  assert.deepEqual(ids, ["tops", "shoes", "layering", "accessories"]);
  assert(!ids.includes("bottoms"));

  const topItem = { category: "Tops", subCategory: "Shirt", title: "White Oxford Shirt" };
  const topCategories = getAnchorCategories(topItem);
  assert.equal(topCategories[0].id, "bottoms");
  const topIds = topCategories.map(c => c.id);
  assert(!topIds.includes("tops"));
});

test("buildSmartShoppingQuery constructs intelligent shopping queries", () => {
  const item = {
    title: "Men Grey Slim Fit Trousers",
    category: "Bottoms",
    subCategory: "Trousers",
    primaryColor: "Grey",
    fit: "Slim Fit"
  };
  const profile = { gender: "Male" };

  const topQuery = buildSmartShoppingQuery(item, "tops", profile);
  assert(topQuery.includes("men"));
  assert(topQuery.includes("white")); // Complementary color for grey is white
  assert(topQuery.includes("shirt") || topQuery.includes("polo"));
});

test("getActiveBudgetRange computes correct min and max bounds", () => {
  assert.deepEqual(getActiveBudgetRange("under_1000"), { min: 0, max: 999 });
  assert.deepEqual(getActiveBudgetRange("1000_2000"), { min: 1000, max: 2000 });
  assert.deepEqual(getActiveBudgetRange("any"), { min: null, max: null });
  assert.deepEqual(getActiveBudgetRange("custom", "1200", "2500"), { min: 1200, max: 2500 });
});

test("calculateMatchDetails determines ranking and badge information", () => {
  const bestMatch = calculateMatchDetails({ discountPercent: 10, extractedPrice: 1500 }, 0);
  assert.equal(bestMatch.isBestMatch, true);
  assert.equal(bestMatch.matchPercent, 98);

  const greatValue = calculateMatchDetails({ discountPercent: 40, extractedPrice: 599 }, 1);
  assert.equal(greatValue.isBestMatch, false);
  assert.equal(greatValue.isGreatValue, true);
  assert.equal(greatValue.matchPercent, 96);
});

test("getFallbackStylingPlan generates gender-appropriate and complementary plans", () => {
  const maleBottom = {
    title: "Grey Slim Fit Trousers",
    category: "Bottoms",
    subCategory: "Trousers",
    primaryColor: "Grey"
  };
  const maleProfile = { gender: "male" };

  const plan = getFallbackStylingPlan({ item: maleBottom, profile: maleProfile, targetCategory: "tops" });
  assert.equal(plan.targetCategory, "tops");
  assert(plan.searchTerm.startsWith("men"));
  assert(plan.searchTerm.includes("white"));
  assert(plan.stylingReason.length > 10);
  assert(plan.alternativeCategories.length > 0);
  // Ensure alternative categories do NOT contain bottoms
  assert(!plan.alternativeCategories.some(c => c.targetCategory === "bottoms"));
});

test("filterProductsStrict enforces strict gender and complementary category exclusion", () => {
  const testProducts = [
    { id: "1", title: "Dennis Lingo Men's Slim Fit Casual Shirt", extractedPrice: 699, thumbnail: "https://images.unsplash.com/photo-1596755094514-f87e34085b2c?w=400" },
    { id: "2", title: "KOTTY Women's Beige High Waist Wide Leg Straight Trouser", extractedPrice: 470, thumbnail: "https://images.unsplash.com/photo-1506629082955-511b1aa562c8?w=400" },
    { id: "3", title: "Girls Printed Regular Cotton Top", extractedPrice: 399, thumbnail: "https://images.unsplash.com/photo-1529139574466-a303027c1d8b?w=400" },
    { id: "4", title: "Men's Solid Formal Chino Pants", extractedPrice: 899, thumbnail: "https://images.unsplash.com/photo-1473966968600-fa801b869a1a?w=400" },
    { id: "5", title: "Men's White Minimalist Leather Sneakers", extractedPrice: 1499, thumbnail: "https://images.unsplash.com/photo-1549298916-b41d501d3772?w=400" }
  ];

  // User is Male, Anchor item is a pair of Trousers (Bottoms)
  const filteredForMale = filterProductsStrict({
    products: testProducts,
    gender: "men",
    anchorCategory: "Bottoms Trousers",
    targetCategory: "tops"
  });

  const ids = filteredForMale.map(p => p.id);
  // Must include the men's shirt
  assert(ids.includes("1"));
  // Must EXCLUDE women's trousers (wrong gender and same category!)
  assert(!ids.includes("2"));
  // Must EXCLUDE girls top (wrong gender!)
  assert(!ids.includes("3"));
  // Must EXCLUDE men's pants (anchor is already trousers!)
  assert(!ids.includes("4"));
});

test("handleCompleteLook returns valid outfit plan and filtered products", async () => {
  const result = await handleCompleteLook({
    item: {
      title: "Grey Slim Fit Trousers",
      category: "Bottoms",
      subCategory: "Trousers",
      primaryColor: "Grey"
    },
    profile: { gender: "male" },
    budget: { min: 500, max: 2000 },
    targetCategory: "tops",
    env: {}
  });

  assert.equal(result.ok, true);
  assert(result.intent != null);
  assert(result.intent.searchTerm.includes("men"));
  assert.equal(typeof result.total, "number");
  assert.equal(Array.isArray(result.products), true);

  // Verify multi-piece outfit coordination
  assert(result.outfit != null, "outfit object must be returned");
  assert(Array.isArray(result.outfit.categories), "outfit.categories must be an array");
  assert(result.outfit.categories.length >= 3, "outfit must contain at least 3 complementary categories");

  // Verify strict limit of max 3 products per category
  for (const cat of result.outfit.categories) {
    assert(cat.products.length <= 3, `Category ${cat.id} has ${cat.products.length} products, must be <= 3`);
    for (const prod of cat.products) {
      assert.equal(prod.category, cat.id, `Product ${prod.id} in ${cat.id} must match category`);
      assert(prod.stylingReason.length > 5, "Product must carry piece-specific styling rationale");
    }
  }
});

test("different pants receive distinct, style-matched recommendations (no repeated static shirt)", () => {
  const profile = { gender: "men" };

  const cargoPant = {
    title: "Black Relaxed Fit Utility Cargo Pants",
    category: "Bottoms",
    subCategory: "Cargos",
    primaryColor: "Black"
  };
  const chinoPant = {
    title: "Light Blue Cotton Stretch Chinos",
    category: "Bottoms",
    subCategory: "Chinos",
    primaryColor: "Light Blue"
  };
  const formalTrouser = {
    title: "Grey Slim Fit Formal Trousers",
    category: "Bottoms",
    subCategory: "Trousers",
    primaryColor: "Grey"
  };
  const denimJean = {
    title: "Dark Indigo Straight Fit Denim Jeans",
    category: "Bottoms",
    subCategory: "Jeans",
    primaryColor: "Blue"
  };

  const planCargo = getFallbackStylingPlan({ item: cargoPant, profile, targetCategory: "tops" });
  const planChino = getFallbackStylingPlan({ item: chinoPant, profile, targetCategory: "tops" });
  const planTrouser = getFallbackStylingPlan({ item: formalTrouser, profile, targetCategory: "tops" });
  const planJean = getFallbackStylingPlan({ item: denimJean, profile, targetCategory: "tops" });

  // 1. Cargo pants must receive streetwear tops
  assert(planCargo.searchTerm.includes("graphic") || planCargo.searchTerm.includes("oversized"));
  assert(planCargo.outfitTitle.toLowerCase().includes("streetwear"));

  // 2. Chinos must receive smart-casual polo or linen tops
  assert(planChino.searchTerm.includes("polo"));
  assert(planChino.outfitTitle.toLowerCase().includes("smart-casual"));

  // 3. Formal trousers must receive pure cotton oxford shirt
  assert(planTrouser.searchTerm.includes("oxford"));
  assert(planTrouser.outfitTitle.toLowerCase().includes("tailored") || planTrouser.outfitTitle.toLowerCase().includes("professional"));

  // 4. Jeans must receive rugged flannel or casual tops
  assert(planJean.searchTerm.includes("flannel") || planJean.searchTerm.includes("checked"));
  assert(planJean.outfitTitle.toLowerCase().includes("rugged"));

  // 5. Crucially: ALL search terms must be different!
  assert.notEqual(planCargo.searchTerm, planChino.searchTerm);
  assert.notEqual(planCargo.searchTerm, planTrouser.searchTerm);
  assert.notEqual(planChino.searchTerm, planTrouser.searchTerm);
  assert.notEqual(planChino.searchTerm, planJean.searchTerm);
});

test("each outfit category product carries its own piece-specific styling rationale", async () => {
  const result = await handleCompleteLook({
    item: {
      title: "Black Relaxed Fit Utility Cargo Pants",
      category: "Bottoms",
      subCategory: "Cargos",
      primaryColor: "Black"
    },
    profile: { gender: "men" },
    env: {}
  });

  assert.equal(result.ok, true);
  const categories = result.outfit.categories;

  const topCategory = categories.find(c => c.id === "tops");
  const shoeCategory = categories.find(c => c.id === "shoes");
  const accCategory = categories.find(c => c.id === "accessories");

  assert(topCategory && topCategory.products.length > 0);
  assert(shoeCategory && shoeCategory.products.length > 0);
  assert(accCategory && accCategory.products.length > 0);

  // Verify the shoe product does NOT receive the top's styling description
  assert.notEqual(topCategory.products[0].stylingReason, shoeCategory.products[0].stylingReason);
  assert.notEqual(shoeCategory.products[0].stylingReason, accCategory.products[0].stylingReason);
});

test("resolveBuyLink always returns non-empty, valid store destinations (no 404s)", () => {
  const amazonProduct = { source: "Amazon.in", title: "Dennis Lingo Men Shirt" };
  assert(resolveBuyLink(amazonProduct).includes("amazon.in/s?k="));

  const ajioProduct = { source: "AJIO.com", title: "Marks & Spencer Linen Shirt" };
  assert(resolveBuyLink(ajioProduct).includes("ajio.com/search/?text="));

  const myntraProduct = { source: "Myntra", title: "Highlander Polo" };
  assert(resolveBuyLink(myntraProduct).includes("google.com/search"));

  const catalogProduct = {
    source: "Myntra",
    title: "Men Hoodie",
    productLink: "https://www.google.com/search?ibp=oshop&q=men+hoodie&prds=catalogid:123456"
  };
  assert(resolveBuyLink(catalogProduct).includes("prds=catalogid:123456"));
});

test("hasValidImage validator correctly rejects empty, non-https, or logo URLs", () => {
  assert.equal(hasValidImage({ thumbnail: "https://images.unsplash.com/photo-1?w=400" }), true);
  assert.equal(hasValidImage({ thumbnail: "" }), false);
  assert.equal(hasValidImage({}), false);
  assert.equal(hasValidImage({ thumbnail: "http://insecure.com/pic.jpg" }), true);
  assert.equal(hasValidImage({ thumbnail: "ftp://files.com/pic.jpg" }), false);
  assert.equal(hasValidImage({ thumbnail: "./assets/clothmatics-logo.png" }), false);
  assert.equal(hasValidImage({ thumbnail: "https://clothmatics.pages.dev/assets/clothmatics-logo.png" }), false);
  assert.equal(hasValidImage({ thumbnail: "https://abc.com" }), false); // too short (< 15 chars)
});

test("every product returned by handleCompleteLook has a valid non-empty HTTPS thumbnail", async () => {
  const result = await handleCompleteLook({
    item: {
      title: "Black Relaxed Utility Cargo Pants",
      category: "Bottoms",
      subCategory: "Cargos",
      primaryColor: "Black"
    },
    profile: { gender: "men" },
    env: {}
  });

  assert.equal(result.ok, true);
  assert(result.products.length > 0);

  // Every single product across all categories must have a valid non-empty thumbnail!
  for (const product of result.products) {
    assert.equal(hasValidImage(product), true, `Product ${product.id || product.title} must have a valid thumbnail`);
    assert(product.thumbnail.startsWith("https://") || product.thumbnail.startsWith("http://"));
    assert(!product.thumbnail.includes("clothmatics-logo.png"), "No product should have website logo as thumbnail");
  }

  for (const category of result.outfit.categories) {
    for (const product of category.products) {
      assert.equal(hasValidImage(product), true, `Category product ${product.id} must have a valid thumbnail`);
    }
  }
});

test("handleCompleteLook includes AI Stylist styleArchetype, colorHarmony, and silhouetteBalance", async () => {
  const result = await handleCompleteLook({
    item: {
      title: "Light Blue Cotton Stretch Chinos",
      category: "Bottoms",
      subCategory: "Chinos",
      primaryColor: "Light Blue"
    },
    profile: {
      gender: "men",
      skinTone: "Wheatish / Warm",
      bodyTypeSelfReported: "Athletic"
    },
    env: {}
  });

  assert.equal(result.ok, true);
  assert(result.outfit.styleArchetype != null && result.outfit.styleArchetype.length > 0);
  assert(result.outfit.colorHarmony != null && result.outfit.colorHarmony.length > 0);
  assert(result.outfit.silhouetteBalance != null && result.outfit.silhouetteBalance.length > 0);

  assert.equal(result.intent.styleArchetype, result.outfit.styleArchetype);
});

test("women complete look guarantees at least 3 items in every category with working images", async () => {
  const result = await handleCompleteLook({
    item: {
      title: "Beige High Waist Wide Leg Trousers",
      category: "Bottoms",
      subCategory: "Trousers",
      primaryColor: "Beige"
    },
    profile: { gender: "women" },
    env: {}
  });

  assert.equal(result.ok, true);
  assert(result.outfit.categories.length >= 3);

  for (const category of result.outfit.categories) {
    assert(category.products.length <= 3, "Never exceeds 3 products per category");
    assert(category.products.length >= 2, `Expected at least 2-3 products in ${category.id}`);
    for (const prod of category.products) {
      assert.equal(hasValidImage(prod), true);
      assert.equal(prod.gender, "women");
    }
  }
});

test("getCategoryFallbackImage provides distinct, valid fashion studio URLs for each category and gender", () => {
  const menTop = getCategoryFallbackImage("tops", "men");
  const menShoes = getCategoryFallbackImage("shoes", "men");
  const womenTop = getCategoryFallbackImage("tops", "women");
  const womenShoes = getCategoryFallbackImage("shoes", "women");

  assert(menTop.startsWith("https://images.unsplash.com"));
  assert(menShoes.startsWith("https://images.unsplash.com"));
  assert(womenTop.startsWith("https://images.unsplash.com"));
  assert(womenShoes.startsWith("https://images.unsplash.com"));

  assert.notEqual(menTop, menShoes);
  assert.notEqual(womenTop, womenShoes);
  assert.notEqual(menTop, womenTop);
});

test("m_acc_tactical and category fallback images do NOT contain cosmetic/makeup photography", () => {
  const tacticalWatch = DIVERSE_SAMPLE_PRODUCTS.find(p => p.id === "m_acc_tactical");
  assert(tacticalWatch != null, "m_acc_tactical sample product must exist");
  assert(!tacticalWatch.thumbnail.includes("photo-1522335789203-aabd1fc54bc9"), "Must not use cosmetics flatlay URL");
  assert(tacticalWatch.thumbnail.startsWith("https://images.unsplash.com/"), "Must be valid studio photography");

  // Fallback for men's accessories must also not use cosmetics flatlay
  const menAccFallback = getCategoryFallbackImage("accessories", "men");
  assert(!menAccFallback.includes("photo-1522335789203-aabd1fc54bc9"), "Men accessories fallback must not be cosmetics");

  // Verify none of the diverse sample products use the old cosmetics photo
  for (const prod of DIVERSE_SAMPLE_PRODUCTS) {
    assert(!prod.thumbnail.includes("photo-1522335789203-aabd1fc54bc9"), `Product ${prod.id} must not use cosmetics photo`);
  }
});

test("getUserProfileSizes extracts sizes from both nested shoppingProfile and flat structures", () => {
  const profileNested = {
    shoppingProfile: {
      sizes: {
        top: { alphaSize: "42" },
        bottom: { waistInches: 32 },
        shoes: { uk: "9" },
        dress: { alphaSize: "M" }
      }
    }
  };

  const sizes = getUserProfileSizes(profileNested);
  assert.equal(sizes.top, "42");
  assert.equal(sizes.bottom, "32");
  assert.equal(sizes.shoes, "9");
  assert.equal(sizes.dress, "M");

  const helperSizes = getHelperSizes(profileNested);
  assert.deepEqual(sizes, helperSizes);

  const profileFlat = {
    sizes: {
      top: "L",
      bottom: 34,
      shoes: 10
    }
  };
  const flatSizes = getUserProfileSizes(profileFlat);
  assert.equal(flatSizes.top, "L");
  assert.equal(flatSizes.bottom, "34");
  assert.equal(flatSizes.shoes, "10");
  assert.equal(flatSizes.dress, null);

  const emptySizes = getUserProfileSizes({});
  assert.deepEqual(emptySizes, { top: null, bottom: null, shoes: null, dress: null });
});

test("getUserProfilePreferences extracts user style preferences and exclusions", () => {
  const profile = {
    preferences: {
      fitPreference: "Slim Fit",
      favoriteColors: ["Navy", "Olive"],
      avoidColors: ["Mustard", "Yellow"],
      hardExclusions: ["leather"],
      styleLean: ["Minimalist"]
    },
    shoppingProfile: {
      preferredBrands: ["H&M", "Zara"],
      avoidedBrands: ["FastFashion"],
      preferredFits: ["Relaxed Fit"]
    }
  };

  const prefs = getUserProfilePreferences(profile);
  assert.equal(prefs.fitPreference, "Slim Fit");
  assert(prefs.preferredFits.includes("Relaxed Fit") && prefs.preferredFits.includes("Slim Fit"));
  assert(prefs.favoriteColors.includes("Navy") && prefs.favoriteColors.includes("Olive"));
  assert(prefs.avoidColors.includes("Mustard") && prefs.avoidColors.includes("Yellow"));
  assert(prefs.hardExclusions.includes("leather"));
  assert(prefs.preferredBrands.includes("H&M") && prefs.preferredBrands.includes("Zara"));
  assert(prefs.avoidedBrands.includes("FastFashion"));

  const helperPrefs = getHelperPrefs(profile);
  assert.deepEqual(prefs, helperPrefs);
});

test("extractProductSize and normalizeProductTitleForDeduplication handle retailer title variations", () => {
  const title1 = "Mast & Harbour Men Olive Green Solid Casual Overshirt (46) by Myntra";
  const title2 = "Mast & Harbour Men Olive Green Solid Casual Overshirt (42) by Myntra";
  const title3 = "Men Navy Blue Slim Fit Chinos Size: 32";
  const title4 = "Puma Men White Leather Court Sneakers UK 9";

  assert.equal(extractProductSize(title1), "46");
  assert.equal(extractProductSize(title2), "42");
  assert.equal(extractProductSize(title3), "32");
  assert.equal(extractProductSize(title4), "9");

  const norm1 = normalizeProductTitleForDeduplication(title1);
  const norm2 = normalizeProductTitleForDeduplication(title2);

  // After normalization, size tags and retailer suffixes are stripped
  assert.equal(norm1, norm2);
  assert(!norm1.includes("46"));
  assert(!norm1.includes("42"));
  assert(!norm1.includes("myntra"));
});

test("deduplicateAndRankProducts drops duplicate size variants and prioritizes user's size", () => {
  const products = [
    {
      id: "prod_46",
      title: "Mast & Harbour Men Olive Green Solid Casual Overshirt (46) by Myntra",
      source: "Myntra",
      extractedPrice: 1299
    },
    {
      id: "prod_42",
      title: "Mast & Harbour Men Olive Green Solid Casual Overshirt (42) by Myntra",
      source: "Myntra",
      extractedPrice: 1299
    },
    {
      id: "prod_other",
      title: "H&M Men Regular Fit Cotton Worker Jacket",
      source: "H&M",
      extractedPrice: 2499
    }
  ];

  // User wears size 42 in tops
  const result = deduplicateAndRankProducts(products, {
    userSizes: { top: "42" },
    category: "tops"
  });

  // Only 2 products should remain: the user-matched size 42 overshirt and the H&M jacket
  assert.equal(result.length, 2);

  const overshirt = result.find(p => p.title.includes("Mast & Harbour"));
  assert(overshirt != null);
  assert.equal(overshirt.id, "prod_42", "Must pick size 42 variant instead of size 46");
  assert.equal(overshirt.extractedSize, "42");
  assert.equal(overshirt.userSizeMatch, true);

  // The size matching product should be ranked first
  assert.equal(result[0].id, "prod_42");
});

test("deduplicateAndRankProducts filters out avoided colors and hard exclusions", () => {
  const products = [
    { id: "1", title: "Dennis Lingo Men Navy Blue Oxford Shirt", source: "Amazon.in" },
    { id: "2", title: "Men Mustard Yellow Graphic Cotton T-Shirt", source: "Myntra" },
    { id: "3", title: "Men Real Leather Biker Jacket", source: "AJIO.com" }
  ];

  const result = deduplicateAndRankProducts(products, {
    userPrefs: {
      avoidColors: ["Yellow", "Mustard"],
      hardExclusions: ["Leather"]
    },
    category: "tops"
  });

  assert.equal(result.length, 1);
  assert.equal(result[0].id, "1");
});

test("createItemStylingReason produces distinct, accurate rationales for watches, belts, shoes, and overshirts", () => {
  const anchorPant = { category: "Bottoms", subCategory: "Trousers", primaryColor: "Grey" };
  const profile = {
    shoppingProfile: {
      sizes: {
        top: { alphaSize: "42" },
        bottom: { waistInches: 32 },
        shoes: { uk: "9" }
      }
    }
  };

  const watchProduct = {
    title: "Fastrack Men Matte Black Digital Tactical Sports Watch",
    category: "accessories"
  };
  const beltProduct = {
    title: "Tommy Hilfiger Men Tan Brown Braided Genuine Leather Belt",
    category: "accessories"
  };
  const overshirtProduct = {
    title: "Mast & Harbour Men Olive Green Casual Overshirt",
    category: "layering"
  };
  const shoeProduct = {
    title: "Red Tape Men Tan Brown Leather Loafers",
    category: "shoes"
  };

  const watchReason = createItemStylingReason(watchProduct, { category: "accessories" }, anchorPant, profile);
  const beltReason = createItemStylingReason(beltProduct, { category: "accessories" }, anchorPant, profile);
  const overshirtReason = createItemStylingReason(overshirtProduct, { category: "layering" }, anchorPant, profile);
  const shoeReason = createItemStylingReason(shoeProduct, { category: "shoes" }, anchorPant, profile);

  // Watch rationale must describe watch, not belt
  assert(watchReason.toLowerCase().includes("watch"));
  assert(!watchReason.toLowerCase().includes("belt"));

  // Belt rationale must describe belt, not watch
  assert(beltReason.toLowerCase().includes("belt"));
  assert(beltReason.toLowerCase().includes("waistline"));
  assert(!beltReason.toLowerCase().includes("watch"));

  // Overshirt rationale must describe overshirt and olive color
  assert(overshirtReason.toLowerCase().includes("overshirt"));
  assert(overshirtReason.toLowerCase().includes("olive"));

  // Shoe rationale must describe loafers
  assert(shoeReason.toLowerCase().includes("loafers"));
  assert(shoeReason.includes("curated for UK 9"));
});

test("filterProductsStrict rejects products matching user avoidColors or hardExclusions", () => {
  const testProducts = [
    { id: "1", title: "Men White Oxford Casual Shirt", extractedPrice: 899, thumbnail: "https://images.unsplash.com/photo-1596755094514-f87e34085b2c?w=400" },
    { id: "2", title: "Men Bright Mustard Yellow Linen Shirt", extractedPrice: 999, thumbnail: "https://images.unsplash.com/photo-1596755094514-f87e34085b2c?w=400" },
    { id: "3", title: "Men Polyester Gym Running T-Shirt", extractedPrice: 499, thumbnail: "https://images.unsplash.com/photo-1596755094514-f87e34085b2c?w=400" }
  ];

  const filtered = filterProductsStrict({
    products: testProducts,
    gender: "men",
    anchorCategory: "Bottoms Trousers",
    targetCategory: "tops",
    userPrefs: {
      avoidColors: ["Mustard", "Yellow"],
      hardExclusions: ["Polyester"]
    }
  });

  const ids = filtered.map(p => p.id);
  assert(ids.includes("1"));
  assert(!ids.includes("2"), "Must exclude mustard yellow");
  assert(!ids.includes("3"), "Must exclude polyester hard exclusion");
});

test("detectProductSubtype correctly categorizes fashion pieces across categories", () => {
  assert.equal(detectProductSubtype({ title: "Highlander Men Navy Knitted Polo T-Shirt" }, "tops"), "polo");
  assert.equal(detectProductSubtype({ title: "Dennis Lingo Men White Oxford Cotton Shirt" }, "tops"), "shirt");
  assert.equal(detectProductSubtype({ title: "Noberry Men Graphic Streetwear T-Shirt" }, "tops"), "tshirt");

  assert.equal(detectProductSubtype({ title: "Fastrack Men Matte Black Tactical Sports Watch" }, "accessories"), "watch");
  assert.equal(detectProductSubtype({ title: "Tommy Hilfiger Men Tan Brown Leather Belt" }, "accessories"), "belt");
  assert.equal(detectProductSubtype({ title: "Ray-Ban Classic Aviator Sunglasses" }, "accessories"), "eyewear");
  assert.equal(detectProductSubtype({ title: "Wildhorn Men Leather Crossbody Bag" }, "accessories"), "bag");

  assert.equal(detectProductSubtype({ title: "Puma White Leather Sneakers" }, "shoes"), "sneaker");
  assert.equal(detectProductSubtype({ title: "Red Tape Men Tan Brown Loafers" }, "shoes"), "loafer");
  assert.equal(detectProductSubtype({ title: "Woodland Men Chelsea Boots" }, "shoes"), "boot");
});

test("pickDiverseProductSet prioritizes distinct subtypes and avoids homogeneous 3-of-a-kind output", () => {
  const accessoryCandidates = [
    { id: "w1", title: "Casio Vintage Digital Watch", source: "Amazon" },
    { id: "w2", title: "Fossil Minimalist Leather Watch", source: "Myntra" },
    { id: "w3", title: "Titan Smart Watch", source: "Tata Cliq" },
    { id: "b1", title: "Tommy Hilfiger Men Tan Leather Belt", source: "Amazon" },
    { id: "e1", title: "Ray-Ban Aviator Sunglasses", source: "AJIO" }
  ];

  const picked = pickDiverseProductSet(accessoryCandidates, "accessories", 3);
  assert.equal(picked.length, 3);

  const subtypes = picked.map(p => detectProductSubtype(p, "accessories"));
  // Must NOT be 3 watches!
  const watchCount = subtypes.filter(s => s === "watch").length;
  assert(watchCount <= 1, "Must contain at most 1 watch in the top 3 curated accessories");
  assert(subtypes.includes("belt"), "Must include a belt");
  assert(subtypes.includes("eyewear"), "Must include eyewear");
});

test("handleCompleteLook returns diverse suggestions for tops when primary garment is pants", async () => {
  const result = await handleCompleteLook({
    item: {
      category: "Bottoms",
      subCategory: "Jeans",
      title: "Slim Fit Indigo Denim Jeans",
      primaryColor: "Blue"
    },
    profile: { gender: "men" },
    env: {}
  });

  assert.equal(result.ok, true);
  const topsCategory = result.outfit.categories.find(c => c.id === "tops");
  assert(topsCategory != null, "Tops category must be present");
  assert(topsCategory.products.length >= 2, "Must return at least 2 top recommendations");

  // Check that all top products have valid thumbnails (never missing or broken)
  for (const prod of topsCategory.products) {
    assert(prod.thumbnail && prod.thumbnail.length > 15, "Product thumbnail must be valid non-empty string");
    assert(hasValidImage(prod), "Must pass hasValidImage check");
  }

  // Check diversity: Not all products in tops should be of the same subtype
  const topSubtypes = topsCategory.products.map(p => detectProductSubtype(p, "tops"));
  const uniqueSubtypes = new Set(topSubtypes);
  assert(uniqueSubtypes.size > 1, "Top recommendations must offer diverse silhouettes, not 3 identical styles");
});

test("fetchShoppingWithFallback prioritizes Serper when providerPreference is set to serper", async () => {
  const originalFetch = globalThis.fetch;
  const attemptedUrls = [];

  globalThis.fetch = async (url) => {
    const urlStr = String(url);
    attemptedUrls.push(urlStr);
    if (urlStr.includes("serper.dev")) {
      return {
        ok: true,
        status: 200,
        json: async () => ({
          shopping: [
            { title: "Direct Serper Result", price: "₹999", productId: "direct-1", imageUrl: "https://img.com/d1.jpg" }
          ]
        })
      };
    }
    return { ok: false, status: 500 };
  };

  try {
    const res = await fetchShoppingWithFallback({
      query: "white linen shirt",
      providerPreference: "serper",
      env: {
        SERPAPI_API_KEY: "serpapi-key",
        SERPER_API_KEY: "serper-key"
      }
    });

    assert.equal(res.provider, "serper");
    assert.equal(res.items[0].title, "Direct Serper Result");
    // With providerPreference: "serper", SerpApi should not have been called first
    assert(attemptedUrls[0].includes("serper.dev"));
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("shopping status endpoint accurately reports provider configuration and strategy", async () => {
  const { onRequestGet } = await import("../functions/api/shopping/status.js");

  // Case 1: Dual Active
  const dualRes = await onRequestGet({
    env: {
      SERPAPI_API_KEY: "secret-serpapi",
      SERPER_API_KEY: "secret-serper",
      GEMINI_API_KEY: "secret-gemini"
    }
  });
  const dualData = await dualRes.json();
  assert.equal(dualData.ok, true);
  assert.equal(dualData.providers.serpapi.configured, true);
  assert.equal(dualData.providers.serpapi.role, "Primary");
  assert.equal(dualData.providers.serper.configured, true);
  assert.equal(dualData.providers.serper.role, "Fallback");
  assert.equal(dualData.providers.gemini.configured, true);
  assert(dualData.activeStrategy.includes("Dual Provider"));

  // Case 2: Only Serper configured
  const serperOnlyRes = await onRequestGet({
    env: {
      SERPER_API_KEY: "secret-serper"
    }
  });
  const serperOnlyData = await serperOnlyRes.json();
  assert.equal(serperOnlyData.providers.serper.configured, true);
  assert.equal(serperOnlyData.providers.serper.role, "Primary");
  assert.equal(serperOnlyData.providers.serpapi.configured, false);
  assert.equal(serperOnlyData.providers.serpapi.role, "Inactive");
  assert(serperOnlyData.activeStrategy.includes("Serper.dev"));

  // Case 3: No keys configured (sample mode)
  const emptyRes = await onRequestGet({ env: {} });
  const emptyData = await emptyRes.json();
  assert.equal(emptyData.providers.serper.configured, false);
  assert.equal(emptyData.providers.serpapi.configured, false);
  assert(emptyData.activeStrategy.includes("Sample Data"));
});

test("getFallbackStylingPlan dynamically creates individualized search queries for different garments in same category", () => {
  // Test 1: Black Cargos vs Olive Cargos
  const blackCargoPlan = getFallbackStylingPlan({
    item: { title: "Men Black Relaxed Utility Cargo Pants", category: "Bottoms", subCategory: "Cargo", primaryColor: "Black" },
    profile: { gender: "men" }
  });
  const oliveCargoPlan = getFallbackStylingPlan({
    item: { title: "Men Olive Green Heavyweight Tactical Cargo Pants", category: "Bottoms", subCategory: "Cargo", primaryColor: "Olive" },
    profile: { gender: "men" }
  });

  assert(blackCargoPlan.pieces.length > 0);
  assert(oliveCargoPlan.pieces.length > 0);

  const blackTopPiece = blackCargoPlan.pieces.find(p => p.category === "tops");
  const oliveTopPiece = oliveCargoPlan.pieces.find(p => p.category === "tops");

  assert(blackTopPiece && oliveTopPiece);
  // Black cargos should never recommend a black top; olive cargos should never recommend an olive top.
  // And the two distinct cargo garments must receive completely distinct search terms.
  assert.notEqual(blackTopPiece.searchTerm, oliveTopPiece.searchTerm);
  assert(!blackTopPiece.searchTerm.toLowerCase().includes("black"));
  assert(!oliveTopPiece.searchTerm.toLowerCase().includes("olive"));

  // Test 2: Navy Chinos vs Beige Chinos
  const navyChinoPlan = getFallbackStylingPlan({
    item: { title: "Men Navy Blue Slim Fit Stretch Chinos", category: "Bottoms", subCategory: "Chinos", primaryColor: "Navy Blue" },
    profile: { gender: "men" }
  });
  const beigeChinoPlan = getFallbackStylingPlan({
    item: { title: "Men Beige Khaki Cotton Chino Trousers", category: "Bottoms", subCategory: "Chinos", primaryColor: "Beige" },
    profile: { gender: "men" }
  });

  const navyTopPiece = navyChinoPlan.pieces.find(p => p.category === "tops");
  const beigeTopPiece = beigeChinoPlan.pieces.find(p => p.category === "tops");

  assert(navyTopPiece && beigeTopPiece);
  // Navy chinos must never recommend navy tops; beige chinos must never recommend beige tops.
  // And both garments must receive distinct tailored search queries.
  assert.notEqual(navyTopPiece.searchTerm, beigeTopPiece.searchTerm);
  assert(!navyTopPiece.searchTerm.toLowerCase().includes("navy"));
  assert(!beigeTopPiece.searchTerm.toLowerCase().includes("beige"));
});

test("deduplicateAndRankProducts prioritizes contrasting items and recommended colors", () => {
  const mockCandidates = [
    { id: "1", title: "Men Pure White Knitted Regular Fit Polo T-Shirt", extractedPrice: 899, source: "Zara", thumbnail: "https://example.com/1.jpg" },
    { id: "2", title: "Men Dark Navy Blue Solid Knitted Cotton Polo T-Shirt", extractedPrice: 899, source: "Highlander", thumbnail: "https://example.com/2.jpg" },
    { id: "3", title: "Men Jet Black Heavyweight Oversized T-Shirt", extractedPrice: 799, source: "Snitch", thumbnail: "https://example.com/3.jpg" }
  ];

  // When anchor is Navy Pants and recommended color is "white"
  const rankedForNavy = deduplicateAndRankProducts(mockCandidates, {
    anchorItem: { title: "Navy Chinos", primaryColor: "Navy Blue", category: "Bottoms" },
    recommendedColors: ["white"],
    category: "tops"
  });

  // White polo should be ranked #1
  assert.equal(rankedForNavy[0].id, "1");

  // When anchor is White Linen Pants and recommended color is "navy"
  const rankedForWhite = deduplicateAndRankProducts(mockCandidates, {
    anchorItem: { title: "White Linen Trousers", primaryColor: "White", category: "Bottoms" },
    recommendedColors: ["navy", "black"],
    category: "tops"
  });

  // Navy polo or black t-shirt should be ranked above white polo
  assert.notEqual(rankedForWhite[0].id, "1");
  assert(rankedForWhite[0].id === "2" || rankedForWhite[0].id === "3");
});

test("deduplicateAndRankProducts prioritizes high user ratings and review volumes over low-rated items", () => {
  const mockCandidates = [
    {
      id: "low-rated",
      title: "Men Casual Cotton Crew Neck T-Shirt White",
      extractedPrice: 499,
      source: "UnknownBrand",
      thumbnail: "https://example.com/low.jpg",
      rating: 3.4,
      reviews: 12
    },
    {
      id: "top-rated",
      title: "Men Premium Supima Cotton Crew Neck T-Shirt Off-White",
      extractedPrice: 699,
      source: "Marks & Spencer",
      thumbnail: "https://example.com/top.jpg",
      rating: 4.7,
      reviews: 820
    },
    {
      id: "moderate-rated",
      title: "Men Regular Fit Cotton T-Shirt Beige",
      extractedPrice: 599,
      source: "Zara",
      thumbnail: "https://example.com/mod.jpg",
      rating: 4.1,
      reviews: 45
    }
  ];

  const ranked = deduplicateAndRankProducts(mockCandidates, {
    anchorItem: { title: "Navy Chinos", primaryColor: "Navy Blue", category: "Bottoms" },
    recommendedColors: ["white", "off-white", "beige"],
    category: "tops"
  });

  // Top rated (4.7 rating, 820 reviews) must be ranked #1
  assert.equal(ranked[0].id, "top-rated", "Highest rated product with substantial reviews should rank first");
  assert.equal(ranked[ranked.length - 1].id, "low-rated", "Low rated product (<3.8) should be penalized and ranked last");
});

test("getFallbackStylingPlan dynamically creates individualized coordinates for shoes (sneakers vs boots vs dress shoes)", () => {
  const sneakerPlan = getFallbackStylingPlan({
    item: { title: "Men White Minimal Leather Low-Top Sneakers", category: "Shoes", subCategory: "Sneakers", primaryColor: "White" },
    profile: { gender: "men" }
  });

  const bootPlan = getFallbackStylingPlan({
    item: { title: "Men Rugged Brown Leather Chelsea Boots", category: "Shoes", subCategory: "Boots", primaryColor: "Brown" },
    profile: { gender: "men" }
  });

  const dressShoePlan = getFallbackStylingPlan({
    item: { title: "Men Formal Black Leather Oxford Dress Shoes", category: "Shoes", subCategory: "Dress Shoes", primaryColor: "Black" },
    profile: { gender: "men" }
  });

  // All 3 shoe types must produce coordinate pieces
  assert(sneakerPlan.pieces.length >= 2, "Sneakers plan has complementary pieces");
  assert(bootPlan.pieces.length >= 2, "Boots plan has complementary pieces");
  assert(dressShoePlan.pieces.length >= 2, "Dress shoes plan has complementary pieces");

  const sneakerBottom = sneakerPlan.pieces.find(p => p.category === "bottoms");
  const bootBottom = bootPlan.pieces.find(p => p.category === "bottoms");
  const dressBottom = dressShoePlan.pieces.find(p => p.category === "bottoms");

  assert(sneakerBottom && bootBottom && dressBottom);

  // Sneaker bottoms, boot bottoms, and dress shoe bottoms should be tailored to their style
  assert.notEqual(sneakerBottom.searchTerm, bootBottom.searchTerm, "Sneakers and boots must recommend distinct bottoms");
  assert.notEqual(sneakerBottom.searchTerm, dressBottom.searchTerm, "Sneakers and dress shoes must recommend distinct bottoms");

  // Dress shoe bottom should recommend formal/tailored trousers
  assert(dressBottom.searchTerm.toLowerCase().includes("trouser") || dressBottom.searchTerm.toLowerCase().includes("formal") || dressBottom.searchTerm.toLowerCase().includes("chinos"));

  // Boot bottom should recommend rugged denim or chinos
  assert(bootBottom.searchTerm.toLowerCase().includes("jean") || bootBottom.searchTerm.toLowerCase().includes("denim") || bootBottom.searchTerm.toLowerCase().includes("chino"));
});

test("DIVERSE_SAMPLE_PRODUCTS includes authentic ratings and verified image URLs without repetition", () => {
  assert(DIVERSE_SAMPLE_PRODUCTS.length >= 40, "DIVERSE_SAMPLE_PRODUCTS must have at least 40 products");

  const ids = new Set();
  const urls = new Set();

  for (const product of DIVERSE_SAMPLE_PRODUCTS) {
    // Unique IDs
    assert(!ids.has(product.id), `Product ID must be unique: ${product.id}`);
    ids.add(product.id);

    // Valid HTTPS images
    assert(product.thumbnail && product.thumbnail.startsWith("https://"), `Thumbnail must be valid HTTPS URL: ${product.id}`);
    assert(!urls.has(product.thumbnail), `Thumbnail image URL must not be duplicated: ${product.thumbnail}`);
    urls.add(product.thumbnail);

    // Customer ratings and reviews
    assert(typeof product.rating === "number" && product.rating >= 4.0, `Rating must be >= 4.0 for high quality: ${product.id}`);
    assert(typeof product.reviews === "number" && product.reviews >= 50, `Reviews must be >= 50: ${product.id}`);

    // Valid price
    assert((product.extractedPrice || product.extracted_price) > 0, `extractedPrice must be positive: ${product.id}`);
  }
});

test("getFallbackStylingPlan with shuffleIndex produces varied styling plans and distinct pieces", () => {
  const item = { title: "Men Navy Blue Slim Fit Stretch Chinos", category: "Bottoms", subCategory: "Chinos", primaryColor: "Navy Blue" };
  const profile = { gender: "men" };

  const plan0 = getFallbackStylingPlan({ item, profile, shuffleIndex: 0 });
  const plan1 = getFallbackStylingPlan({ item, profile, shuffleIndex: 1 });
  const plan2 = getFallbackStylingPlan({ item, profile, shuffleIndex: 2 });

  assert(plan0.pieces.length > 0);
  assert(plan1.pieces.length > 0);
  assert(plan2.pieces.length > 0);

  // At least one piece's searchTerm should differ between shuffleIndex 0 and 1
  const searchTerms0 = plan0.pieces.map(p => p.searchTerm).join(" | ");
  const searchTerms1 = plan1.pieces.map(p => p.searchTerm).join(" | ");
  const searchTerms2 = plan2.pieces.map(p => p.searchTerm).join(" | ");

  assert.notEqual(searchTerms0, searchTerms1, "shuffleIndex 0 and 1 should produce different styling plan search terms");
  assert.notEqual(searchTerms1, searchTerms2, "shuffleIndex 1 and 2 should produce different styling plan search terms");
});

test("pickDiverseProductSet with offset parameter rotates product selection", () => {
  const products = [
    { id: "p1", title: "White Linen Button-Down Casual Shirt", category: "tops", extractedPrice: 899 },
    { id: "p2", title: "Beige Knit Polo Shirt", category: "tops", extractedPrice: 799 },
    { id: "p3", title: "Black Oversized Crew T-Shirt", category: "tops", extractedPrice: 599 },
    { id: "p4", title: "Navy Oxford Long Sleeve Shirt", category: "tops", extractedPrice: 999 },
    { id: "p5", title: "Grey Ribbed Henley Shirt", category: "tops", extractedPrice: 699 },
    { id: "p6", title: "Olive Green Textured Overshirt", category: "tops", extractedPrice: 1199 }
  ];

  const set0 = pickDiverseProductSet(products, "tops", 3, 0);
  const set3 = pickDiverseProductSet(products, "tops", 3, 3);

  assert.equal(set0.length, 3);
  assert.equal(set3.length, 3);

  // The first item of set3 should come from the rotated offset
  assert.equal(set0[0].id, "p1");
  assert.equal(set3[0].id, "p4");
  assert.notEqual(set0[0].id, set3[0].id);
});

test("handleCompleteLook returns shuffleIndex and attaches allAvailableProducts for on-demand rotation", async () => {
  const mockItem = {
    id: "wardrobe-chino-1",
    title: "Men Beige Chino Trousers",
    category: "Bottoms",
    subCategory: "Chinos",
    primaryColor: "Beige"
  };

  const res = await handleCompleteLook({
    item: mockItem,
    profile: { gender: "men" },
    budget: { min: 0, max: 5000 },
    shuffleIndex: 1
  });

  assert.equal(res.ok, true);
  assert.equal(res.shuffleIndex, 1);
  assert(res.outfit && Array.isArray(res.outfit.categories));

  for (const cat of res.outfit.categories) {
    if (cat.products && cat.products.length > 0) {
      assert(Array.isArray(cat.allAvailableProducts), `Category ${cat.id} should have allAvailableProducts array`);
      assert(typeof cat.totalAvailable === "number", `Category ${cat.id} should have totalAvailable count`);
      assert(cat.allAvailableProducts.length >= cat.products.length, `allAvailableProducts should have at least as many items as cat.products`);
    }
  }
});

test("getAnchorCategories recognizes jackets even when category is Tops and never recommends layering", () => {
  const trackJacket = {
    category: "Tops",
    subCategory: "Jackets",
    title: "Light Grey Performance Track Jacket"
  };
  const categories = getAnchorCategories(trackJacket);
  const ids = categories.map((c) => c.id);

  assert.deepEqual(ids, ["tops", "bottoms", "shoes", "accessories"]);
  assert(!ids.includes("layering"), "Jacket anchor must NEVER recommend layering/jackets");
});

test("getFallbackStylingPlan for jacket anchors produces inner tops, bottoms, shoes, and accessories without layering", () => {
  const trackJacket = {
    category: "Tops",
    subCategory: "Jackets",
    title: "Light Grey Performance Track Jacket",
    primaryColor: "Light Grey",
    fit: "Regular"
  };

  const plan = getFallbackStylingPlan({
    item: trackJacket,
    profile: { gender: "men" },
    shuffleIndex: 0
  });

  assert(plan && Array.isArray(plan.pieces));
  const pieceCats = plan.pieces.map((p) => p.category);

  assert(pieceCats.includes("tops"), "Plan must include an inner top for the jacket");
  assert(pieceCats.includes("bottoms"), "Plan must include bottoms");
  assert(pieceCats.includes("shoes"), "Plan must include footwear");
  assert(pieceCats.includes("accessories"), "Plan must include accessories");
  assert(!pieceCats.includes("layering"), "Plan must NEVER include layering when styling a jacket");
});

test("filterProductsStrict excludes all jackets/layering pieces when anchor is a jacket", () => {
  const candidateProducts = [
    {
      id: "prod_tee",
      title: "Puma Men Pure White Performance Crew Neck Athletic T-Shirt",
      category: "tops",
      gender: "men",
      extractedPrice: 1199,
      thumbnail: "https://images.unsplash.com/photo-1521572267360-ee0c2909d518?w=500&q=80"
    },
    {
      id: "prod_bomber",
      title: "Campus Sutra Men Black Lightweight Utility Bomber Jacket",
      category: "layering",
      gender: "men",
      extractedPrice: 1199,
      thumbnail: "https://images.unsplash.com/photo-1544441893-675973e31985?w=500&q=80"
    },
    {
      id: "prod_overshirt",
      title: "Mast & Harbour Men Navy Blue Casual Cotton Overshirt Jacket",
      category: "layering",
      gender: "men",
      extractedPrice: 1299,
      thumbnail: "https://images.unsplash.com/photo-1617137984095-74e4e5e3613f?w=500&q=80"
    },
    {
      id: "prod_chinos",
      title: "Highlander Men Beige Slim Fit Stretch Chino Trousers",
      category: "bottoms",
      gender: "men",
      extractedPrice: 1199,
      thumbnail: "https://images.unsplash.com/photo-1473966968600-fa801b869a1a?w=500&q=80"
    }
  ];

  const filtered = filterProductsStrict({
    products: candidateProducts,
    minPrice: 1000,
    maxPrice: 2000,
    gender: "men",
    anchorCategory: "Light Grey Performance Track Jacket"
  });

  const ids = filtered.map((p) => p.id);
  assert(ids.includes("prod_tee"), "Inner tee should be allowed");
  assert(ids.includes("prod_chinos"), "Chinos should be allowed");
  assert(!ids.includes("prod_bomber"), "Bomber jacket must be strictly excluded for a jacket anchor");
  assert(!ids.includes("prod_overshirt"), "Overshirt must be strictly excluded for a jacket anchor");
});

test("pickDiverseProductSet ensures accessory subtype diversity (never 3 watches)", () => {
  const accessoriesWithManyWatches = [
    {
      id: "watch_1",
      title: "Fastrack Men Matte Black Digital Tactical Sports Watch",
      source: "Amazon.in",
      category: "accessories",
      extractedPrice: 1295
    },
    {
      id: "watch_2",
      title: "Titan Men Black Leather Analog Minimalist Watch",
      source: "Tata CLiQ",
      category: "accessories",
      extractedPrice: 1995
    },
    {
      id: "watch_3",
      title: "Men Fastrack Stunners Dial Metal Strap Watch",
      source: "LifestyleStores.com",
      category: "accessories",
      extractedPrice: 1495
    },
    {
      id: "belt_1",
      title: "Tommy Hilfiger Men Tan Brown Braided Genuine Leather Belt",
      source: "Amazon.in",
      category: "accessories",
      extractedPrice: 1199
    },
    {
      id: "shades_1",
      title: "Vincent Chase Men Polarized Classic Aviator Sunglasses",
      source: "Amazon.in",
      category: "accessories",
      extractedPrice: 1199
    }
  ];

  const diversePicks = pickDiverseProductSet(accessoriesWithManyWatches, "accessories", 3, 0);
  assert.equal(diversePicks.length, 3);

  const watchCount = diversePicks.filter((p) => /watch/i.test(p.title)).length;
  assert.equal(watchCount, 1, "There should be at most 1 watch when other accessory subtypes are available");

  const subtypes = diversePicks.map((p) => detectProductSubtype(p, "accessories"));
  const uniqueSubtypes = new Set(subtypes);
  assert.equal(uniqueSubtypes.size, 3, "All 3 accessory picks must belong to distinct subtypes");
});

test("buildQueryLatticeFromIntent generates 3 to 4 clean, deduplicated search queries", () => {
  const intent = {
    category: "shoes",
    subtypes: ["court sneakers", "low top sneakers"],
    allowedColors: ["white", "off-white"],
    materials: ["leather"],
    styleTags: ["minimalist", "clean"],
    brandPreferences: ["Puma", "Comet"],
    mustHaveTerms: ["men", "white", "sneakers"],
    excludeTerms: ["loafer", "boot"]
  };

  const queries = buildQueryLatticeFromIntent(intent, "men");
  assert(Array.isArray(queries), "Must return an array of queries");
  assert(queries.length >= 2 && queries.length <= 4, `Expected 2-4 queries, got ${queries.length}`);

  for (const q of queries) {
    assert(typeof q === "string" && q.length > 5, `Query must be non-empty string: ${q}`);
    assert(!q.includes("(") && !q.includes(")"), `Query should not contain parentheses: ${q}`);
    assert(!q.includes(" OR "), `Query should not contain boolean OR operators: ${q}`);
    assert(q.toLowerCase().includes("men"), `Men's query must include gender prefix: ${q}`);
  }

  // Q1 should target specific color + material + subtype
  assert(queries.some((q) => q.toLowerCase().includes("white") && q.toLowerCase().includes("court sneakers")), "Should include specific subtype query");
});

test("validateProduct strictly enforces budget lower-bound invariance (NEVER allows price < minPrice)", () => {
  const cheapItem = {
    id: "cheap_1",
    title: "Highlander Men Navy Blue Solid Knitted Cotton Polo T-Shirt",
    extractedPrice: 549,
    thumbnail: "https://images.unsplash.com/photo-1581655353564-df123a1eb820?w=500&q=80",
    category: "tops"
  };

  const validItem = {
    id: "valid_1",
    title: "Marks & Spencer Men Pure Linen Regular Fit Casual Shirt",
    extractedPrice: 1799,
    thumbnail: "https://images.unsplash.com/photo-1596755094514-f87e34085b2c?w=500&q=80",
    category: "tops"
  };

  const cheapCheck = validateProduct(cheapItem, {
    minPrice: 1000,
    maxPrice: 2000,
    gender: "men"
  });
  assert.equal(cheapCheck.valid, false, "Product priced at 549 must be rejected when minPrice is 1000");
  assert(cheapCheck.reason.includes("price_below_min"), "Reason should indicate price is below minimum");

  const validCheck = validateProduct(validItem, {
    minPrice: 1000,
    maxPrice: 2000,
    gender: "men"
  });
  assert.equal(validCheck.valid, true, "Product priced at 1799 should pass within 1000-2000 budget");
});

test("validateProduct rejects anchor jacket leakage, wrong gender, and excluded subtypes", () => {
  const jacketAnchor = {
    title: "Light Grey Performance Track Jacket",
    category: "Tops",
    subCategory: "Jackets"
  };

  const overshirtItem = {
    id: "leak_1",
    title: "Mast & Harbour Men Olive Casual Cotton Overshirt Jacket",
    category: "layering",
    extractedPrice: 1499,
    thumbnail: "https://images.unsplash.com/photo-1617137984095-74e4e5e3613f?w=500&q=80"
  };

  const leakCheck = validateProduct(overshirtItem, {
    anchorItem: jacketAnchor,
    gender: "men"
  });
  assert.equal(leakCheck.valid, false, "Outerwear/overshirt must be rejected when anchor is already a jacket");

  const womenItem = {
    id: "w_1",
    title: "Women Floral Printed Cotton Top",
    category: "tops",
    extractedPrice: 1299,
    thumbnail: "https://images.unsplash.com/photo-1503342217505-b0a15ec3261c?w=500&q=80"
  };
  const genderCheck = validateProduct(womenItem, {
    gender: "men"
  });
  assert.equal(genderCheck.valid, false, "Women's item must be rejected when target gender is men");

  const loaferItem = {
    id: "loafer_1",
    title: "Red Tape Men Classic Tan Leather Casual Loafers",
    category: "shoes",
    extractedPrice: 1699,
    thumbnail: "https://images.unsplash.com/photo-1549298916-b41d501d3772?w=500&q=80"
  };
  const excludeCheck = validateProduct(loaferItem, {
    intent: {
      category: "shoes",
      subtypes: ["sneakers"],
      excludeTerms: ["loafer", "boot"]
    },
    gender: "men"
  });
  assert.equal(excludeCheck.valid, false, "Loafers must be rejected when intent excludes 'loafer'");
});

test("scoreProductRelevance ensures intended sneaker subtype outranks higher-rated skate or loafer", () => {
  const intent = {
    category: "shoes",
    subtypes: ["court sneakers", "low top sneakers"],
    allowedColors: ["white", "off-white"],
    materials: ["leather"],
    styleTags: ["minimalist", "clean"]
  };

  const whiteCourtSneaker = {
    id: "court_1",
    title: "Puma Men Clean Minimalist White Leather Court Sneakers",
    category: "shoes",
    rating: 4.2,
    reviews: 65,
    extractedPrice: 1899
  };

  const skateShoe = {
    id: "skate_1",
    title: "Comet Men Retro Red Brown Chunky Skate Sneakers",
    category: "shoes",
    rating: 4.6,
    reviews: 940,
    extractedPrice: 1899
  };

  const scoreCourt = scoreProductRelevance(whiteCourtSneaker, { intent });
  const scoreSkate = scoreProductRelevance(skateShoe, { intent });

  assert(scoreCourt.score > scoreSkate.score, `White court sneaker score (${scoreCourt.score}) must exceed skate shoe score (${scoreSkate.score})`);
  assert(scoreCourt.breakdown.colorMatch === 25, "White sneaker should receive color match bonus");
});

test("handleCompleteLook returns requestId, sessionSeed, variationIndex, and debug telemetry without budget leaks", async () => {
  const trackJacket = {
    id: "track_jacket_123",
    title: "Light Grey Performance Track Jacket",
    category: "Tops",
    subCategory: "Jackets",
    primaryColor: "Light Grey"
  };

  const res = await handleCompleteLook({
    item: trackJacket,
    profile: { gender: "men" },
    budget: { min: 1000, max: 2000 },
    sessionSeed: "test_seed_abc",
    shuffleIndex: 0
  });

  assert.equal(res.ok, true);
  assert(typeof res.requestId === "string" && res.requestId.startsWith("req_"), "Must return a unique requestId");
  assert.equal(res.sessionSeed, "test_seed_abc", "Must preserve sessionSeed");
  assert(typeof res.variationIndex === "number", "Must return numeric variationIndex");
  assert(res.debug && Array.isArray(res.debug.searches), "Must return debug.searches array");

  // Verify all returned products strictly obey budget >= 1000 and <= 2300 (or max)
  for (const cat of res.outfit.categories) {
    for (const prod of cat.products) {
      const price = Number(prod.extractedPrice ?? prod.extracted_price ?? 0);
      if (price > 0) {
        assert(price >= 1000, `Product '${prod.title}' priced at ₹${price} violates lower bound minPrice of 1000!`);
      }
      assert(prod.meta, `Product '${prod.title}' must contain provenance meta`);
      assert(typeof prod.meta.fallbackUsed === "boolean", "meta.fallbackUsed must be boolean");
      assert(typeof prod.meta.source === "string", "meta.source must be string ('live' or 'sample')");
    }
  }
});








