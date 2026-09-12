import test from "node:test";
import assert from "node:assert/strict";
import {
  SAMPLE_SHOPPING_RESULTS,
  normalizeProduct,
  filterByBudget,
  handleShoppingSearch,
  fetchSerperShopping,
  fetchShoppingWithFallback
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
  createItemStylingReason
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




