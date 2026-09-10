/**
 * Pure helper functions for ClothMatics Shop to Complete the Look
 */

export const COMPLETE_LOOK_BUDGETS = [
  { key: "under_1000", label: "Under ₹1,000", min: 0, max: 999 },
  { key: "1000_2000", label: "₹1,000–₹2,000", min: 1000, max: 2000 },
  { key: "2000_4000", label: "₹2,000–₹4,000", min: 2000, max: 4000 },
  { key: "4000_plus", label: "₹4,000+", min: 4000, max: null },
  { key: "any", label: "Any budget", min: null, max: null },
  { key: "custom", label: "Custom", min: null, max: null }
];

export function getAnchorCategories(item = {}) {
  const text = `${item.category || ""} ${item.subCategory || ""} ${item.title || ""}`.toLowerCase();

  if (/bottom|pant|trouser|jean|skirt|short|chino|legging|palazzo|culotte/.test(text)) {
    return [
      { id: "tops", label: "Tops & Shirts", icon: "👕", searchTerms: "shirt top blouse" },
      { id: "shoes", label: "Footwear", icon: "👟", searchTerms: "casual loafers sneakers footwear" },
      { id: "layering", label: "Jackets & Layers", icon: "🧥", searchTerms: "jacket blazer overshirt" },
      { id: "accessories", label: "Bags & Accessories", icon: "👜", searchTerms: "handbag leather belt" },
      { id: "similar", label: "Similar Garments", icon: "✨", searchTerms: "" }
    ];
  }

  if (/top|shirt|tee|t-shirt|blouse|kurta|camisole|sweater|hoodie|polo/.test(text)) {
    return [
      { id: "bottoms", label: "Pants & Bottoms", icon: "👖", searchTerms: "trousers pants jeans" },
      { id: "shoes", label: "Footwear", icon: "👟", searchTerms: "sneakers loafers shoes" },
      { id: "layering", label: "Jackets & Layers", icon: "🧥", searchTerms: "jacket blazer cardigan" },
      { id: "accessories", label: "Bags & Accessories", icon: "👜", searchTerms: "bag watch belt" },
      { id: "similar", label: "Similar Garments", icon: "✨", searchTerms: "" }
    ];
  }

  if (/dress|gown|jumpsuit|romper/.test(text)) {
    return [
      { id: "shoes", label: "Footwear", icon: "👠", searchTerms: "heels sandals flats" },
      { id: "layering", label: "Jackets & Shrugs", icon: "🧥", searchTerms: "cropped jacket blazer shrug" },
      { id: "bags", label: "Handbags & Clutches", icon: "👛", searchTerms: "handbag clutch sling bag" },
      { id: "accessories", label: "Jewelry & Accents", icon: "✨", searchTerms: "earrings necklace bracelet" },
      { id: "similar", label: "Similar Dresses", icon: "👗", searchTerms: "" }
    ];
  }

  if (/shoe|sneaker|boot|sandal|heel|loafer|flat/.test(text)) {
    return [
      { id: "bottoms", label: "Pants & Trousers", icon: "👖", searchTerms: "trousers chinos jeans" },
      { id: "tops", label: "Tops & Shirts", icon: "👕", searchTerms: "shirt t-shirt polo" },
      { id: "layering", label: "Jackets & Layers", icon: "🧥", searchTerms: "jacket overshirt blazer" },
      { id: "accessories", label: "Accessories", icon: "⌚", searchTerms: "watch belt bag" },
      { id: "similar", label: "Similar Footwear", icon: "👟", searchTerms: "" }
    ];
  }

  if (/jacket|coat|blazer|outer|cardigan|shrug|vest/.test(text)) {
    return [
      { id: "tops", label: "Inner Tops", icon: "👕", searchTerms: "crew neck t-shirt shirt blouse" },
      { id: "bottoms", label: "Trousers & Jeans", icon: "👖", searchTerms: "tailored trousers jeans pants" },
      { id: "shoes", label: "Footwear", icon: "👞", searchTerms: "shoes loafers boots" },
      { id: "accessories", label: "Accessories", icon: "🧣", searchTerms: "scarf bag belt" },
      { id: "similar", label: "Similar Outerwear", icon: "🧥", searchTerms: "" }
    ];
  }

  return [
    { id: "tops", label: "Tops & Shirts", icon: "👕", searchTerms: "shirt top" },
    { id: "bottoms", label: "Pants & Bottoms", icon: "👖", searchTerms: "trousers pants" },
    { id: "shoes", label: "Footwear", icon: "👟", searchTerms: "footwear shoes" },
    { id: "accessories", label: "Accessories", icon: "👜", searchTerms: "bag accessory" },
    { id: "similar", label: "Similar Garments", icon: "✨", searchTerms: "" }
  ];
}

export function getProfileGender(profile = {}, item = {}) {
  const profileGender = String(profile.gender || profile.shoppingProfile?.gender || "").toLowerCase();
  if (profileGender.includes("fem") || profileGender.includes("wom")) return "women";
  if (profileGender.includes("male") || profileGender.includes("men")) return "men";

  const titleText = `${item.title || ""} ${item.category || ""} ${item.subCategory || ""}`.toLowerCase();
  if (titleText.includes("women") || titleText.includes("ladies") || titleText.includes("girl")) return "women";
  if (titleText.includes("men") || titleText.includes("gent") || titleText.includes("boy")) return "men";

  return "";
}

export function getComplementaryColor(color = "") {
  const c = String(color).toLowerCase().trim();
  if (!c) return "";
  if (c.includes("beige") || c.includes("khaki") || c.includes("cream")) return "white";
  if (c.includes("black")) return "white";
  if (c.includes("white")) return "navy";
  if (c.includes("blue") || c.includes("navy")) return "white";
  if (c.includes("green") || c.includes("olive")) return "beige";
  if (c.includes("red") || c.includes("burgundy")) return "black";
  if (c.includes("brown") || c.includes("tan")) return "cream";
  if (c.includes("pink")) return "white";
  if (c.includes("grey") || c.includes("gray")) return "black";
  return "";
}

export function buildSmartShoppingQuery(item = {}, tabId = "", profile = {}) {
  const gender = getProfileGender(profile, item);
  const categories = getAnchorCategories(item);
  const matchedTab = categories.find((c) => c.id === tabId) || categories[0];

  if (matchedTab.id === "similar") {
    const parts = [
      gender,
      item.primaryColor,
      item.fit,
      item.subCategory || item.category || item.title
    ];
    return parts.filter(Boolean).join(" ").trim();
  }

  const compColor = getComplementaryColor(item.primaryColor);
  const parts = [gender, compColor, matchedTab.searchTerms];
  return parts.filter(Boolean).join(" ").trim();
}

export function getActiveBudgetRange(budgetKey = "1000_2000", customMin = "", customMax = "") {
  if (budgetKey === "custom") {
    const min = customMin !== "" && !Number.isNaN(Number(customMin)) ? Number(customMin) : null;
    const max = customMax !== "" && !Number.isNaN(Number(customMax)) ? Number(customMax) : null;
    return { min, max };
  }
  const entry = COMPLETE_LOOK_BUDGETS.find((b) => b.key === budgetKey);
  return { min: entry?.min ?? null, max: entry?.max ?? null };
}

export function calculateMatchDetails(product = {}, index = 0) {
  const isBestMatch = index === 0;
  const isGreatValue = (product.discountPercent >= 35) || (product.extractedPrice && product.extractedPrice < 900);
  const matchPercent = Math.max(88, 98 - (index * 2));
  return {
    isBestMatch,
    isGreatValue,
    matchPercent
  };
}
