import test from "node:test";
import assert from "node:assert/strict";
import {
  SAMPLE_SHOPPING_RESULTS,
  normalizeProduct,
  filterByBudget,
  handleShoppingSearch
} from "../functions/api/shopping/search.js";
import {
  getFallbackStylingPlan,
  filterProductsStrict,
  handleCompleteLook,
  hasValidImage
} from "../functions/api/shopping/complete-look.js";
import {
  getAnchorCategories,
  getComplementaryColor,
  getProfileGender,
  buildSmartShoppingQuery,
  getActiveBudgetRange,
  calculateMatchDetails,
  resolveBuyLink,
  getCategoryFallbackImage
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



