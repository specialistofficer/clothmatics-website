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
  handleCompleteLook
} from "../functions/api/shopping/complete-look.js";
import {
  getAnchorCategories,
  getComplementaryColor,
  getProfileGender,
  buildSmartShoppingQuery,
  getActiveBudgetRange,
  calculateMatchDetails
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
    { id: "1", title: "Dennis Lingo Men's Slim Fit Casual Shirt", extractedPrice: 699 },
    { id: "2", title: "KOTTY Women's Beige High Waist Wide Leg Straight Trouser", extractedPrice: 470 },
    { id: "3", title: "Girls Printed Regular Cotton Top", extractedPrice: 399 },
    { id: "4", title: "Men's Solid Formal Chino Pants", extractedPrice: 899 },
    { id: "5", title: "Men's White Minimalist Leather Sneakers", extractedPrice: 1499 }
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
});
