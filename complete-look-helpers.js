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

  // Bottoms (pants, trousers, jeans, chinos) -> NEVER recommend pants!
  if (/bottom|pant|trouser|jean|skirt|short|chino|legging|palazzo|culotte/.test(text)) {
    return [
      { id: "tops", label: "Tops & Shirts", icon: "👕", searchTerms: "shirt polo t-shirt top" },
      { id: "shoes", label: "Footwear", icon: "👟", searchTerms: "casual sneakers loafers shoes" },
      { id: "layering", label: "Jackets & Layers", icon: "🧥", searchTerms: "casual jacket overshirt blazer" },
      { id: "accessories", label: "Accessories", icon: "👜", searchTerms: "leather belt watch" }
    ];
  }

  // Tops (shirts, tees, kurtas) -> NEVER recommend tops!
  if (/top|shirt|tee|t-shirt|blouse|kurta|camisole|sweater|hoodie|polo/.test(text)) {
    return [
      { id: "bottoms", label: "Pants & Trousers", icon: "👖", searchTerms: "trousers chinos pants jeans" },
      { id: "shoes", label: "Footwear", icon: "👟", searchTerms: "sneakers loafers shoes" },
      { id: "layering", label: "Jackets & Layers", icon: "🧥", searchTerms: "casual jacket blazer cardigan" },
      { id: "accessories", label: "Accessories", icon: "⌚", searchTerms: "watch leather belt" }
    ];
  }

  // Dresses & Gowns -> NEVER recommend dresses!
  if (/dress|gown|jumpsuit|romper/.test(text)) {
    return [
      { id: "shoes", label: "Footwear", icon: "👠", searchTerms: "heels sandals occasion flats" },
      { id: "layering", label: "Jackets & Shrugs", icon: "🧥", searchTerms: "cropped jacket blazer shrug" },
      { id: "bags", label: "Handbags & Clutches", icon: "👛", searchTerms: "clutch handbag sling bag" },
      { id: "accessories", label: "Jewelry & Accents", icon: "✨", searchTerms: "earrings bracelet necklace" }
    ];
  }

  // Shoes -> NEVER recommend shoes!
  if (/shoe|sneaker|boot|sandal|heel|loafer|flat/.test(text)) {
    return [
      { id: "bottoms", label: "Pants & Trousers", icon: "👖", searchTerms: "straight fit trousers chinos jeans" },
      { id: "tops", label: "Tops & Shirts", icon: "👕", searchTerms: "cotton shirt polo t-shirt" },
      { id: "layering", label: "Jackets & Layers", icon: "🧥", searchTerms: "overshirt jacket blazer" },
      { id: "accessories", label: "Accessories", icon: "⌚", searchTerms: "watch belt" }
    ];
  }

  // Outerwear / Jackets -> NEVER recommend jackets!
  if (/jacket|coat|blazer|outer|cardigan|shrug|vest/.test(text)) {
    return [
      { id: "tops", label: "Inner Tops", icon: "👕", searchTerms: "crew neck t-shirt shirt polo" },
      { id: "bottoms", label: "Trousers & Jeans", icon: "👖", searchTerms: "tailored trousers pants jeans" },
      { id: "shoes", label: "Footwear", icon: "👞", searchTerms: "shoes loafers sneakers" },
      { id: "accessories", label: "Accessories", icon: "🧣", searchTerms: "scarf leather belt watch" }
    ];
  }

  return [
    { id: "tops", label: "Tops & Shirts", icon: "👕", searchTerms: "casual shirt polo" },
    { id: "bottoms", label: "Pants & Bottoms", icon: "👖", searchTerms: "trousers pants" },
    { id: "shoes", label: "Footwear", icon: "👟", searchTerms: "casual sneakers loafers" },
    { id: "accessories", label: "Accessories", icon: "👜", searchTerms: "watch belt" }
  ];
}

export function getProfileGender(profile = {}, item = {}) {
  const profileGender = String(profile.gender || profile.shoppingProfile?.gender || "").toLowerCase();
  if (profileGender.includes("fem") || profileGender.includes("wom") || profileGender === "female") return "women";
  if (profileGender.includes("male") || profileGender.includes("men") || profileGender === "male") return "men";

  const titleText = `${item.title || ""} ${item.category || ""} ${item.subCategory || ""}`.toLowerCase();
  if (/\b(women|women's|female|girl|girls|ladies)\b/i.test(titleText)) return "women";
  if (/\b(men|men's|male|boy|boys|gentleman)\b/i.test(titleText)) return "men";

  return "men";
}

export function getComplementaryColor(color = "") {
  const c = String(color).toLowerCase().trim();
  if (!c) return "";
  if (c.includes("grey") || c.includes("gray")) return "white";
  if (c.includes("beige") || c.includes("khaki") || c.includes("cream")) return "white";
  if (c.includes("black")) return "white";
  if (c.includes("white")) return "navy";
  if (c.includes("blue") || c.includes("navy")) return "white";
  if (c.includes("green") || c.includes("olive")) return "beige";
  if (c.includes("red") || c.includes("burgundy")) return "black";
  if (c.includes("brown") || c.includes("tan")) return "cream";
  if (c.includes("pink")) return "white";
  return "white";
}

export function detectGarmentStyle(item = {}) {
  const text = `${item.title || ""} ${item.category || ""} ${item.subCategory || ""} ${item.fit || ""} ${item.material || ""}`.toLowerCase();
  if (/cargo|jogger|baggy|oversize|parachute|street|skate|utility|combat|hoodie|graphic/i.test(text)) {
    return "streetwear";
  }
  if (/chino|linen|polo|knit|khaki|smart casual/i.test(text)) {
    return "smart_casual";
  }
  if (/formal|oxford|dress|suit|blazer|tuxedo|office|tailored|pleated/i.test(text)) {
    return "formal";
  }
  if (/jean|denim|rugged|flannel|workwear/i.test(text)) {
    return "rugged";
  }
  if (/dress|gown|saree|lehenga|cocktail|evening|party/i.test(text)) {
    return "occasion";
  }
  if (/kurta|kurti|ethnic|nehru|sherwani|anarkali/i.test(text)) {
    return "ethnic";
  }
  return "smart_casual";
}

export function buildSmartShoppingQuery(item = {}, tabId = "", profile = {}) {
  const gender = getProfileGender(profile, item);
  const categories = getAnchorCategories(item);
  const matchedTab = categories.find((c) => c.id === tabId) || categories[0];
  const style = detectGarmentStyle(item);
  const compColor = getComplementaryColor(item.primaryColor);

  // Style-specific search queries tailored to anchor garment
  if (style === "streetwear" && matchedTab.id === "tops") {
    return `${gender} oversized graphic t-shirt`;
  }
  if (style === "streetwear" && matchedTab.id === "shoes") {
    return `${gender} chunky skate sneakers`;
  }
  if (style === "smart_casual" && matchedTab.id === "tops") {
    return `${gender} ${compColor} knitted polo shirt`;
  }
  if (style === "formal" && matchedTab.id === "tops") {
    return `${gender} ${compColor} pure cotton oxford shirt`;
  }
  if (style === "rugged" && matchedTab.id === "tops") {
    return `${gender} heavyweight crewneck t-shirt`;
  }

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

export function resolveBuyLink(product = {}) {
  const rawLink = String(product.productLink || product.link || "").trim();
  const source = String(product.source || "").toLowerCase();
  const title = String(product.title || "").trim();

  // If rawLink is a live Google Shopping link with valid catalogid, it is a real Google Shopping offer
  if (rawLink.startsWith("https://www.google.com/search") && rawLink.includes("prds=catalogid:")) {
    return encodeURI(rawLink);
  }

  // If source is Amazon: send directly to Amazon search so it never 404s
  if (source.includes("amazon")) {
    return `https://www.amazon.in/s?k=${encodeURIComponent(title)}`;
  }

  // If source is AJIO: send directly to AJIO search so it never 404s
  if (source.includes("ajio")) {
    return `https://www.ajio.com/search/?text=${encodeURIComponent(title)}`;
  }

  // If source is Tata CLiQ:
  if (source.includes("tata") || source.includes("cliq")) {
    return `https://www.tatacliq.com/search/?searchCategory=all&text=${encodeURIComponent(title)}`;
  }

  // If source is Puma:
  if (source.includes("puma")) {
    return `https://in.puma.com/in/en/search?q=${encodeURIComponent(title)}`;
  }

  // If source is Bata:
  if (source.includes("bata")) {
    return `https://www.bata.in/search?q=${encodeURIComponent(title)}`;
  }

  // If source is Zara:
  if (source.includes("zara")) {
    return `https://www.zara.com/in/en/search?searchTerm=${encodeURIComponent(title)}`;
  }

  // If source is Myntra:
  if (source.includes("myntra")) {
    return `https://www.google.com/search?tbm=shop&q=buy+${encodeURIComponent(title)}+myntra`;
  }

  // Universal Google Shopping fallback:
  return `https://www.google.com/search?tbm=shop&q=${encodeURIComponent(title)}`;
}

