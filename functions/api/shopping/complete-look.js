import { clean } from "../../_shared/firebase-rest.mjs";
import {
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

export const DIVERSE_SAMPLE_PRODUCTS = [
  // -------------------------------------------------------------
  // MEN TOPS
  // -------------------------------------------------------------
  {
    id: "m_top_street",
    position: 1,
    title: "Noberry Men Black Oversized Cotton Graphic Streetwear T-Shirt",
    product_id: "m_top_street",
    product_link: "https://www.amazon.in/s?k=Noberry+Men+Black+Oversized+Cotton+Graphic+Streetwear+T-Shirt",
    source: "Amazon.in",
    price: "₹649",
    extracted_price: 649,
    old_price: "₹1,499",
    extracted_old_price: 1499,
    thumbnail: "https://images.unsplash.com/photo-1503342217505-b0a15ec3261c?w=400&q=80",
    delivery: "Free delivery by Tomorrow",
    category: "tops",
    style: "streetwear",
    gender: "men"
  },
  {
    id: "m_top_smart",
    position: 2,
    title: "Highlander Men Navy Blue Solid Knitted Cotton Polo T-Shirt",
    product_id: "m_top_smart",
    product_link: "https://www.google.com/search?tbm=shop&q=buy+Highlander+Men+Navy+Blue+Knitted+Polo+myntra",
    source: "Myntra",
    price: "₹549",
    extracted_price: 549,
    old_price: "₹1,099",
    extracted_old_price: 1099,
    thumbnail: "https://images.unsplash.com/photo-1581655353564-df123a1eb820?w=400&q=80",
    delivery: "Free delivery",
    category: "tops",
    style: "smart_casual",
    gender: "men"
  },
  {
    id: "m_top_linen",
    position: 3,
    title: "Marks & Spencer Men Pure Linen Striped Casual Shirt",
    product_id: "m_top_linen",
    product_link: "https://www.ajio.com/search/?text=Marks+and+Spencer+Men+Pure+Linen+Shirt",
    source: "AJIO.com",
    price: "₹1,799",
    extracted_price: 1799,
    old_price: "₹2,999",
    extracted_old_price: 2999,
    thumbnail: "https://images.unsplash.com/photo-1602810318383-e386cc2a3ccf?w=400&q=80",
    delivery: "Free delivery",
    category: "tops",
    style: "smart_casual",
    gender: "men"
  },
  {
    id: "m_top_formal",
    position: 4,
    title: "Dennis Lingo Men White Slim Fit Oxford Cotton Shirt",
    product_id: "m_top_formal",
    product_link: "https://www.amazon.in/s?k=Dennis+Lingo+Mens+Slim+Fit+Casual+Cotton+Shirt+White",
    source: "Amazon.in",
    price: "₹699",
    extracted_price: 699,
    old_price: "₹1,849",
    extracted_old_price: 1849,
    thumbnail: "https://images.unsplash.com/photo-1596755094514-f87e34085b2c?w=400&q=80",
    delivery: "Free delivery",
    category: "tops",
    style: "formal",
    gender: "men"
  },
  {
    id: "m_top_rugged",
    position: 5,
    title: "Roadster Men Red & Black Checked Cotton Flannel Casual Shirt",
    product_id: "m_top_rugged",
    product_link: "https://www.google.com/search?tbm=shop&q=buy+Roadster+Men+Checked+Flannel+Shirt+myntra",
    source: "Myntra",
    price: "₹799",
    extracted_price: 799,
    old_price: "₹1,699",
    extracted_old_price: 1699,
    thumbnail: "https://images.unsplash.com/photo-1578932750294-f5075e85f44a?w=400&q=80",
    delivery: "Free delivery",
    category: "tops",
    style: "rugged",
    gender: "men"
  },

  // -------------------------------------------------------------
  // MEN BOTTOMS (for Tops / Shoes / Layering anchors)
  // -------------------------------------------------------------
  {
    id: "m_bot_cargo",
    position: 6,
    title: "Campus Sutra Men Black Baggy Relaxed Utility Cargo Pants",
    product_id: "m_bot_cargo",
    product_link: "https://www.amazon.in/s?k=Campus+Sutra+Men+Black+Baggy+Relaxed+Cargo+Pants",
    source: "Amazon.in",
    price: "₹999",
    extracted_price: 999,
    old_price: "₹2,199",
    extracted_old_price: 2199,
    thumbnail: "https://images.unsplash.com/photo-1624378439575-d8705ad7ae80?w=400&q=80",
    delivery: "Free delivery by Tomorrow",
    category: "bottoms",
    style: "streetwear",
    gender: "men"
  },
  {
    id: "m_bot_chino",
    position: 7,
    title: "Highlander Men Beige Slim Fit Stretch Chino Trousers",
    product_id: "m_bot_chino",
    product_link: "https://www.google.com/search?tbm=shop&q=buy+Highlander+Men+Beige+Slim+Fit+Chinos+myntra",
    source: "Myntra",
    price: "₹749",
    extracted_price: 749,
    old_price: "₹1,699",
    extracted_old_price: 1699,
    thumbnail: "https://images.unsplash.com/photo-1473966968600-fa801b869a1a?w=400&q=80",
    delivery: "Free delivery",
    category: "bottoms",
    style: "smart_casual",
    gender: "men"
  },
  {
    id: "m_bot_formal",
    position: 8,
    title: "Peter England Men Charcoal Grey Slim Fit Formal Trousers",
    product_id: "m_bot_formal",
    product_link: "https://www.amazon.in/s?k=Peter+England+Men+Charcoal+Grey+Formal+Trousers",
    source: "Amazon.in",
    price: "₹1,099",
    extracted_price: 1099,
    old_price: "₹2,299",
    extracted_old_price: 2299,
    thumbnail: "https://images.unsplash.com/photo-1594938298603-c8148c4dae35?w=400&q=80",
    delivery: "Free delivery",
    category: "bottoms",
    style: "formal",
    gender: "men"
  },
  {
    id: "m_bot_jean",
    position: 9,
    title: "Levi's Men 511 Slim Fit Dark Indigo Stretch Jeans",
    product_id: "m_bot_jean",
    product_link: "https://www.ajio.com/search/?text=Levis+Men+511+Slim+Fit+Dark+Indigo+Jeans",
    source: "AJIO.com",
    price: "₹1,899",
    extracted_price: 1899,
    old_price: "₹3,799",
    extracted_old_price: 3799,
    thumbnail: "https://images.unsplash.com/photo-1542272604-780c96856592?w=400&q=80",
    delivery: "Free delivery",
    category: "bottoms",
    style: "casual",
    gender: "men"
  },

  // -------------------------------------------------------------
  // MEN SHOES
  // -------------------------------------------------------------
  {
    id: "m_shoe_minimal",
    position: 10,
    title: "Puma Men White Rebound Layup Minimalist Sneakers",
    product_id: "m_shoe_minimal",
    product_link: "https://www.amazon.in/s?k=Puma+Men+White+Rebound+Layup+Sneakers",
    source: "Amazon.in",
    price: "₹1,899",
    extracted_price: 1899,
    old_price: "₹3,999",
    extracted_old_price: 3999,
    thumbnail: "https://images.unsplash.com/photo-1549298916-b41d501d3772?w=400&q=80",
    delivery: "Free delivery",
    category: "shoes",
    style: "smart_casual",
    gender: "men"
  },
  {
    id: "m_shoe_skate",
    position: 11,
    title: "Comet Men Retro Low-Top Chunky Skate Sneakers - Black & White",
    product_id: "m_shoe_skate",
    product_link: "https://www.amazon.in/s?k=Comet+Men+Retro+Low+Top+Chunky+Skate+Sneakers",
    source: "Amazon.in",
    price: "₹1,999",
    extracted_price: 1999,
    old_price: "₹3,999",
    extracted_old_price: 3999,
    thumbnail: "https://images.unsplash.com/photo-1525966222134-fcfa99b8ae77?w=400&q=80",
    delivery: "Free delivery",
    category: "shoes",
    style: "streetwear",
    gender: "men"
  },
  {
    id: "m_shoe_loafer",
    position: 12,
    title: "Red Tape Men Classic Tan Brown Leather Casual Loafers",
    product_id: "m_shoe_loafer",
    product_link: "https://www.amazon.in/s?k=Red+Tape+Men+Classic+Tan+Brown+Leather+Casual+Loafers",
    source: "Amazon.in",
    price: "₹1,499",
    extracted_price: 1499,
    old_price: "₹4,299",
    extracted_old_price: 4299,
    thumbnail: "https://images.unsplash.com/photo-1533867617858-e7b97e060509?w=400&q=80",
    delivery: "Free delivery",
    category: "shoes",
    style: "smart_casual",
    gender: "men"
  },
  {
    id: "m_shoe_boot",
    position: 13,
    title: "Woodland Men Dark Brown Leather Chelsea Ankle Boots",
    product_id: "m_shoe_boot",
    product_link: "https://www.tatacliq.com/search/?searchCategory=all&text=Woodland+Men+Dark+Brown+Leather+Chelsea+Boots",
    source: "Tata CLiQ",
    price: "₹2,995",
    extracted_price: 2995,
    old_price: "₹4,995",
    extracted_old_price: 4995,
    thumbnail: "https://images.unsplash.com/photo-1608256246200-53e635b5b65f?w=400&q=80",
    delivery: "Free delivery",
    category: "shoes",
    style: "rugged",
    gender: "men"
  },

  // -------------------------------------------------------------
  // MEN LAYERING
  // -------------------------------------------------------------
  {
    id: "m_layer_overshirt",
    position: 14,
    title: "Mast & Harbour Men Navy Blue Casual Cotton Overshirt Jacket",
    product_id: "m_layer_overshirt",
    product_link: "https://www.google.com/search?tbm=shop&q=buy+Mast+Harbour+Men+Navy+Blue+Casual+Overshirt+Jacket+myntra",
    source: "Myntra",
    price: "₹1,299",
    extracted_price: 1299,
    old_price: "₹2,799",
    extracted_old_price: 2799,
    thumbnail: "https://images.unsplash.com/photo-1551028719-00167b16eac5?w=400&q=80",
    delivery: "Free delivery",
    category: "layering",
    style: "smart_casual",
    gender: "men"
  },
  {
    id: "m_layer_bomber",
    position: 15,
    title: "Campus Sutra Men Black Lightweight Utility Bomber Jacket",
    product_id: "m_layer_bomber",
    product_link: "https://www.amazon.in/s?k=Campus+Sutra+Men+Black+Lightweight+Bomber+Jacket",
    source: "Amazon.in",
    price: "₹1,199",
    extracted_price: 1199,
    old_price: "₹2,699",
    extracted_old_price: 2699,
    thumbnail: "https://images.unsplash.com/photo-1544441893-675973e31985?w=400&q=80",
    delivery: "Free delivery",
    category: "layering",
    style: "streetwear",
    gender: "men"
  },
  {
    id: "m_layer_blazer",
    position: 16,
    title: "Van Heusen Men Navy Blue Slim Fit Structured Formal Blazer",
    product_id: "m_layer_blazer",
    product_link: "https://www.tatacliq.com/search/?searchCategory=all&text=Van+Heusen+Men+Navy+Blue+Formal+Blazer",
    source: "Tata CLiQ",
    price: "₹3,499",
    extracted_price: 3499,
    old_price: "₹6,999",
    extracted_old_price: 6999,
    thumbnail: "https://images.unsplash.com/photo-1507679799987-c73779587ccf?w=400&q=80",
    delivery: "Free delivery",
    category: "layering",
    style: "formal",
    gender: "men"
  },

  // -------------------------------------------------------------
  // MEN ACCESSORIES
  // -------------------------------------------------------------
  {
    id: "m_acc_formal",
    position: 17,
    title: "Titan Men Black Leather Analog Minimalist Watch",
    product_id: "m_acc_formal",
    product_link: "https://www.tatacliq.com/search/?searchCategory=all&text=Titan+Men+Black+Leather+Watch",
    source: "Tata CLiQ",
    price: "₹1,995",
    extracted_price: 1995,
    old_price: "₹2,495",
    extracted_old_price: 2495,
    thumbnail: "https://images.unsplash.com/photo-1524805444758-089113d48a6d?w=400&q=80",
    delivery: "Free delivery",
    category: "accessories",
    style: "formal",
    gender: "men"
  },
  {
    id: "m_acc_tactical",
    position: 18,
    title: "Fastrack Men Matte Black Digital Tactical Sports Watch",
    product_id: "m_acc_tactical",
    product_link: "https://www.amazon.in/s?k=Fastrack+Men+Matte+Black+Digital+Sports+Watch",
    source: "Amazon.in",
    price: "₹1,295",
    extracted_price: 1295,
    old_price: "₹1,795",
    extracted_old_price: 1795,
    thumbnail: "https://images.unsplash.com/photo-1522335789203-aabd1fc54bc9?w=400&q=80",
    delivery: "Free delivery",
    category: "accessories",
    style: "streetwear",
    gender: "men"
  },
  {
    id: "m_acc_belt",
    position: 19,
    title: "Tommy Hilfiger Men Tan Brown Braided Genuine Leather Belt",
    product_id: "m_acc_belt",
    product_link: "https://www.amazon.in/s?k=Tommy+Hilfiger+Men+Tan+Brown+Braided+Leather+Belt",
    source: "Amazon.in",
    price: "₹899",
    extracted_price: 899,
    old_price: "₹1,999",
    extracted_old_price: 1999,
    thumbnail: "https://images.unsplash.com/photo-1624222247344-550fb60583dc?w=400&q=80",
    delivery: "Free delivery",
    category: "accessories",
    style: "smart_casual",
    gender: "men"
  },

  // -------------------------------------------------------------
  // WOMEN TOPS
  // -------------------------------------------------------------
  {
    id: "w_top_formal",
    position: 20,
    title: "Tokyo Talkies Women White Regular Fit Solid Formal Shirt",
    product_id: "w_top_formal",
    product_link: "https://www.google.com/search?tbm=shop&q=buy+Tokyo+Talkies+Women+White+Regular+Fit+Solid+Formal+Shirt+myntra",
    source: "Myntra",
    price: "₹499",
    extracted_price: 499,
    old_price: "₹1,199",
    extracted_old_price: 1199,
    thumbnail: "https://images.unsplash.com/photo-1598554747436-c9293d6a588f?w=400&q=80",
    delivery: "Free delivery",
    category: "tops",
    style: "smart_casual",
    gender: "women"
  },
  {
    id: "w_top_rib",
    position: 21,
    title: "Zara Women Black Sleeveless Ribbed High-Neck Knit Top",
    product_id: "w_top_rib",
    product_link: "https://www.ajio.com/search/?text=Zara+Women+Black+Sleeveless+Ribbed+Top",
    source: "AJIO.com",
    price: "₹690",
    extracted_price: 690,
    old_price: "₹1,290",
    extracted_old_price: 1290,
    thumbnail: "https://images.unsplash.com/photo-1503342217505-b0a15ec3261c?w=400&q=80",
    delivery: "Free delivery",
    category: "tops",
    style: "formal",
    gender: "women"
  },
  {
    id: "w_top_crop",
    position: 22,
    title: "Bonkers Corner Women White Oversized Graphic Drop-Shoulder Crop Tee",
    product_id: "w_top_crop",
    product_link: "https://www.amazon.in/s?k=Bonkers+Corner+Women+White+Oversized+Graphic+Crop+Tee",
    source: "Amazon.in",
    price: "₹599",
    extracted_price: 599,
    old_price: "₹1,299",
    extracted_old_price: 1299,
    thumbnail: "https://images.unsplash.com/photo-1529139574466-a303027c1d8b?w=400&q=80",
    delivery: "Free delivery",
    category: "tops",
    style: "streetwear",
    gender: "women"
  },

  // -------------------------------------------------------------
  // WOMEN BOTTOMS
  // -------------------------------------------------------------
  {
    id: "w_bot_beige",
    position: 23,
    title: "KOTTY Women's Beige High Waist Wide Leg Straight Trouser",
    product_id: "w_bot_beige",
    product_link: "https://www.amazon.in/s?k=KOTTY+Womens+Beige+High+Waist+Wide+Leg+Straight+Trouser",
    source: "Amazon.in",
    price: "₹470",
    extracted_price: 470,
    old_price: "₹1,000",
    extracted_old_price: 1000,
    thumbnail: "https://images.unsplash.com/photo-1506629082955-511b1aa562c8?w=400&q=80",
    delivery: "Free delivery",
    category: "bottoms",
    style: "smart_casual",
    gender: "women"
  },
  {
    id: "w_bot_black",
    position: 24,
    title: "Kotty Women Black High-Rise Flared Stretch Trousers",
    product_id: "w_bot_black",
    product_link: "https://www.amazon.in/s?k=Kotty+Women+Black+High+Rise+Flared+Trousers",
    source: "Amazon.in",
    price: "₹599",
    extracted_price: 599,
    old_price: "₹1,499",
    extracted_old_price: 1499,
    thumbnail: "https://images.unsplash.com/photo-1551854838-212c50b4c184?w=400&q=80",
    delivery: "Free delivery",
    category: "bottoms",
    style: "formal",
    gender: "women"
  },

  // -------------------------------------------------------------
  // WOMEN SHOES
  // -------------------------------------------------------------
  {
    id: "w_shoe_sneaker",
    position: 25,
    title: "Bata Women White Chunky Casual Sneakers",
    product_id: "w_shoe_sneaker",
    product_link: "https://www.amazon.in/s?k=Bata+Women+White+Chunky+Casual+Sneakers",
    source: "Amazon.in",
    price: "₹1,299",
    extracted_price: 1299,
    old_price: "₹1,999",
    extracted_old_price: 1999,
    thumbnail: "https://images.unsplash.com/photo-1584735935682-2f2b69dff9d2?w=400&q=80",
    delivery: "Free delivery",
    category: "shoes",
    style: "streetwear",
    gender: "women"
  },
  {
    id: "w_shoe_heels",
    position: 26,
    title: "Carlton London Women Nude Pointed-Toe Block Heels",
    product_id: "w_shoe_heels",
    product_link: "https://www.google.com/search?tbm=shop&q=buy+Carlton+London+Women+Nude+Pointed+Block+Heels+myntra",
    source: "Myntra",
    price: "₹1,495",
    extracted_price: 1495,
    old_price: "₹2,995",
    extracted_old_price: 2995,
    thumbnail: "https://images.unsplash.com/photo-1543163521-1bf539c55dd2?w=400&q=80",
    delivery: "Free delivery",
    category: "shoes",
    style: "formal",
    gender: "women"
  },

  // -------------------------------------------------------------
  // WOMEN LAYERING
  // -------------------------------------------------------------
  {
    id: "w_layer_blazer",
    position: 27,
    title: "Marks & Spencer Women Beige Double-Breasted Relaxed Blazer",
    product_id: "w_layer_blazer",
    product_link: "https://www.ajio.com/search/?text=Marks+and+Spencer+Women+Beige+Relaxed+Blazer",
    source: "AJIO.com",
    price: "₹2,999",
    extracted_price: 2999,
    old_price: "₹5,999",
    extracted_old_price: 5999,
    thumbnail: "https://images.unsplash.com/photo-1591047139829-d91aecb6caea?w=400&q=80",
    delivery: "Free delivery",
    category: "layering",
    style: "formal",
    gender: "women"
  },
  {
    id: "w_layer_denim",
    position: 28,
    title: "Vero Moda Women Light Blue Cropped Washed Denim Jacket",
    product_id: "w_layer_denim",
    product_link: "https://www.amazon.in/s?k=Vero+Moda+Women+Cropped+Denim+Jacket",
    source: "Amazon.in",
    price: "₹1,599",
    extracted_price: 1599,
    old_price: "₹3,499",
    extracted_old_price: 3499,
    thumbnail: "https://images.unsplash.com/photo-1523381294911-8d3cead13475?w=400&q=80",
    delivery: "Free delivery",
    category: "layering",
    style: "casual",
    gender: "women"
  },

  // -------------------------------------------------------------
  // WOMEN ACCESSORIES & BAGS
  // -------------------------------------------------------------
  {
    id: "w_acc_tote",
    position: 29,
    title: "Lavie Women Structured Black Faux Leather Laptop Tote Bag",
    product_id: "w_acc_tote",
    product_link: "https://www.ajio.com/search/?text=Lavie+Women+Structured+Black+Tote+Bag",
    source: "AJIO.com",
    price: "₹1,499",
    extracted_price: 1499,
    old_price: "₹3,499",
    extracted_old_price: 3499,
    thumbnail: "https://images.unsplash.com/photo-1584917865442-de89df76afd3?w=400&q=80",
    delivery: "Free delivery",
    category: "accessories",
    style: "formal",
    gender: "women"
  },
  {
    id: "w_acc_gold",
    position: 30,
    title: "AccessHer Minimalist 18K Gold Plated Layered Chain & Hoop Earrings",
    product_id: "w_acc_gold",
    product_link: "https://www.amazon.in/s?k=AccessHer+Minimalist+Gold+Plated+Layered+Chain+Earrings",
    source: "Amazon.in",
    price: "₹499",
    extracted_price: 499,
    old_price: "₹1,299",
    extracted_old_price: 1299,
    thumbnail: "https://images.unsplash.com/photo-1535632066927-ab7c9ab60908?w=400&q=80",
    delivery: "Free delivery",
    category: "accessories",
    style: "smart_casual",
    gender: "women"
  }
];

export function detectAnchorStyle(item = {}) {
  const text = `${item.title || ""} ${item.category || ""} ${item.subCategory || ""} ${item.fit || ""} ${item.material || ""}`.toLowerCase();
  if (/cargo|jogger|baggy|oversize|parachute|street|skate|utility|combat|hoodie|graphic/i.test(text)) {
    return "streetwear";
  }
  if (/chino|linen|polo|knit|khaki|smart casual/i.test(text)) {
    return "smart_casual";
  }
  if (/formal|oxford|dress|suit|blazer|tuxedo|office|tailored|pleated|trouser|trousers|slack/i.test(text)) {
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

/**
 * Gemini AI Stylist: Generates intelligent, trending complete-the-look outfit pairings.
 * Produces a full coordinated 3-to-4 piece outfit around the anchor piece.
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
  const style = detectAnchorStyle(item);

  const isBottom = /bottom|pant|trouser|jean|skirt|short|chino|legging|palazzo/i.test(`${anchorCat} ${anchorSubCat} ${anchorTitle}`);
  const isTop = /top|shirt|tee|t-shirt|blouse|kurta|sweater|hoodie|polo/i.test(`${anchorCat} ${anchorSubCat} ${anchorTitle}`);
  const isDress = /dress|gown|jumpsuit|romper/i.test(`${anchorCat} ${anchorSubCat} ${anchorTitle}`);
  const isShoes = /shoe|sneaker|boot|sandal|heel|loafer/i.test(`${anchorCat} ${anchorSubCat} ${anchorTitle}`);

  const systemPrompt = `You are the lead AI Personal Fashion Stylist for ClothMatics.
Your task is to generate a COMPLETE COORDINATED OUTFIT around an anchor garment owned by the user.

USER PROFILE:
- Gender: Strictly ${gender}
- Body type: ${profile.bodyTypeSelfReported || "Normal"}

ANCHOR GARMENT:
- Title: ${anchorTitle}
- Category: ${anchorCat} (${anchorSubCat})
- Color: ${anchorColor}
- Fit: ${anchorFit}
- Material: ${anchorMaterial}
- Detected Style Vibe: ${style}

STRICT FASHION RULES:
1. GENDER MUST BE STRICTLY ${gender.toUpperCase()}: Every query, title, and recommendation must be exclusively for ${gender}. Never output unisex or opposing gender clothing.
2. NEVER RECOMMEND THE SAME CATEGORY AS THE ANCHOR:
   ${isBottom ? "- The anchor item is a PAIR OF PANTS/TROUSERS. You must NEVER recommend pants, trousers, jeans, or chinos! Recommend 1 Top, 1 Footwear, 1 Layering/Jacket, and 1 Accessory." : ""}
   ${isTop ? "- The anchor item is a TOP/SHIRT. You must NEVER recommend tops or shirts! Recommend 1 Bottom (Trousers/Chinos/Jeans), 1 Footwear, 1 Layering, and 1 Accessory." : ""}
   ${isDress ? "- The anchor item is a DRESS. Recommend 1 Footwear, 1 Layering shrug/jacket, 1 Handbag/Clutch, and 1 Jewelry/Accessory." : ""}
   ${isShoes ? "- The anchor item is FOOTWEAR. Recommend 1 Bottom, 1 Top, 1 Layering, and 1 Accessory." : ""}
3. STYLE COHESION & DIFFERENTIATION:
   - Match the specific style vibe of the anchor piece. For example, black cargo pants get streetwear graphic tees and chunky skate sneakers; light blue chinos get navy knitted polos and loafers; grey trousers get crisp white oxford shirts and dress sneakers. Do NOT recommend the same shirt for different pants!
4. INDIVIDUAL PIECE REASONING: Each piece in 'pieces' must have its own distinct, specific styling reason explaining why it works with the anchor garment.

Return pure JSON only in this exact format:
{
  "outfitTitle": "Short descriptive title for this complete look",
  "overallStylingAdvice": "2-3 sentences explaining overall aesthetic, balance, and color harmony.",
  "pieces": [
    {
      "category": "tops",
      "categoryLabel": "Tops & Shirts",
      "icon": "👕",
      "searchTerm": "${gender.toLowerCase()} ...",
      "stylingReason": "Why this specific top and color pairs with the anchor garment...",
      "recommendedColors": ["color1", "color2"]
    },
    {
      "category": "shoes",
      "categoryLabel": "Footwear",
      "icon": "👟",
      "searchTerm": "${gender.toLowerCase()} ...",
      "stylingReason": "Why this specific footwear pairs with the anchor garment...",
      "recommendedColors": ["color1"]
    },
    {
      "category": "layering",
      "categoryLabel": "Jackets & Layers",
      "icon": "🧥",
      "searchTerm": "${gender.toLowerCase()} ...",
      "stylingReason": "Why this jacket/layer pairs with the anchor garment...",
      "recommendedColors": ["color1"]
    },
    {
      "category": "accessories",
      "categoryLabel": "Accessories",
      "icon": "⌚",
      "searchTerm": "${gender.toLowerCase()} ...",
      "stylingReason": "Why this accessory finishes the look...",
      "recommendedColors": ["color1"]
    }
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
          if (parsed && Array.isArray(parsed.pieces) && parsed.pieces.length > 0) {
            const primary = parsed.pieces.find((p) => p.category === targetCategory) || parsed.pieces[0];
            return {
              outfitTitle: parsed.outfitTitle || "Coordinated Outfit Look",
              overallStylingAdvice: parsed.overallStylingAdvice || parsed.stylingAdvice || "",
              pieces: parsed.pieces,
              targetCategory: primary.category,
              searchTerm: primary.searchTerm,
              stylingReason: primary.stylingReason,
              recommendedColors: primary.recommendedColors || [],
              alternativeCategories: parsed.pieces.filter((p) => p !== primary).map((p) => ({
                targetCategory: p.category,
                searchTerm: p.searchTerm,
                stylingReason: p.stylingReason
              }))
            };
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
 * Deterministic expert fashion engine fallback if Gemini is unavailable or rate-limited.
 * Dynamic and style-vibe aware so different pants never receive identical shirts.
 */
export function getFallbackStylingPlan({ item = {}, profile = {}, targetCategory = "" }) {
  const rawGender = String(profile.gender || profile.shoppingProfile?.gender || "").toLowerCase();
  const isFemale = rawGender.includes("fem") || rawGender.includes("wom") || rawGender === "female";
  const gender = isFemale ? "women" : "men";

  const text = `${item.category || ""} ${item.subCategory || ""} ${item.title || ""}`.toLowerCase();
  const style = detectAnchorStyle(item);

  const isBottom = /bottom|pant|trouser|jean|skirt|short|chino|legging|palazzo/i.test(text);
  const isTop = /top|shirt|tee|t-shirt|blouse|kurta|sweater|hoodie|polo/i.test(text);
  const isDress = /dress|gown|jumpsuit|romper/i.test(text);
  const isShoes = /shoe|sneaker|boot|sandal|heel|loafer/i.test(text);

  let pieces = [];
  let outfitTitle = "Coordinated Outfit Look";
  let overallStylingAdvice = "";

  if (isBottom) {
    if (gender === "men") {
      if (style === "streetwear") {
        // e.g. Black Cargo Pants / Baggy Joggers
        outfitTitle = "Urban Streetwear Utility Look";
        overallStylingAdvice = `Pairing your ${item.primaryColor || "black"} cargo pants with an oversized graphic tee and chunky skate sneakers creates a balanced, modern streetwear proportion.`;
        pieces = [
          {
            category: "tops",
            categoryLabel: "Tops & Shirts",
            icon: "👕",
            searchTerm: "men black oversized graphic cotton streetwear t-shirt",
            stylingReason: `An oversized boxy graphic tee balances the heavy cargo pockets and maintains street-style proportions.`,
            recommendedColors: ["black", "charcoal", "white"]
          },
          {
            category: "shoes",
            categoryLabel: "Footwear",
            icon: "👟",
            searchTerm: "men retro chunky skate sneakers black white",
            stylingReason: `Chunky low-profile skate sneakers provide visual weight at the hem to complement the cargo cuffs.`,
            recommendedColors: ["white", "black"]
          },
          {
            category: "layering",
            categoryLabel: "Jackets & Layers",
            icon: "🧥",
            searchTerm: "men black lightweight utility bomber jacket",
            stylingReason: `A lightweight bomber adds clean structure without feeling bulky or formal.`,
            recommendedColors: ["black", "olive"]
          },
          {
            category: "accessories",
            categoryLabel: "Accessories",
            icon: "⌚",
            searchTerm: "men matte black digital tactical sports watch",
            stylingReason: `Matte tactical hardware completes the utilitarian streetwear aesthetic.`,
            recommendedColors: ["black"]
          }
        ];
      } else if (style === "formal") {
        // e.g. Grey Slim Trousers
        outfitTitle = "Modern Tailored Professional Look";
        overallStylingAdvice = `Tailored ${item.primaryColor || "grey"} trousers provide a crisp, refined base. Anchoring with a pure cotton oxford shirt and navy blazer achieves timeless corporate elegance.`;
        pieces = [
          {
            category: "tops",
            categoryLabel: "Tops & Shirts",
            icon: "👕",
            searchTerm: "men white slim fit oxford cotton shirt",
            stylingReason: `A crisp white button-down oxford shirt is the timeless foundation for tailored ${item.primaryColor || "grey"} trousers.`,
            recommendedColors: ["white", "light blue"]
          },
          {
            category: "shoes",
            categoryLabel: "Footwear",
            icon: "👟",
            searchTerm: "men minimalist white leather low top sneakers",
            stylingReason: `Clean low-profile white sneakers modernize the trousers for contemporary smart-office versatility.`,
            recommendedColors: ["white"]
          },
          {
            category: "layering",
            categoryLabel: "Jackets & Layers",
            icon: "🧥",
            searchTerm: "men navy blue slim fit formal blazer",
            stylingReason: `A tailored navy blazer creates the definitive menswear grey-and-navy power pairing.`,
            recommendedColors: ["navy", "charcoal"]
          },
          {
            category: "accessories",
            categoryLabel: "Accessories",
            icon: "⌚",
            searchTerm: "men black leather analog minimalist watch",
            stylingReason: `An understated analog dial maintains sleek executive polish.`,
            recommendedColors: ["black", "silver"]
          }
        ];
      } else if (style === "rugged") {
        // e.g. Blue Denim Jeans
        outfitTitle = "Classic Americana Rugged Look";
        overallStylingAdvice = `Denim calls for textured, durable layers. A checked flannel overshirt and leather chelsea boots deliver effortless, masculine character.`;
        pieces = [
          {
            category: "tops",
            categoryLabel: "Tops & Shirts",
            icon: "👕",
            searchTerm: "men red black checked cotton flannel casual shirt",
            stylingReason: `A checked flannel shirt adds visual texture and rugged warmth against denim.`,
            recommendedColors: ["red", "black", "navy"]
          },
          {
            category: "shoes",
            categoryLabel: "Footwear",
            icon: "🥾",
            searchTerm: "men dark brown leather chelsea ankle boots",
            stylingReason: `Sturdy leather chelsea boots seamlessly ground the jeans for all-day versatility.`,
            recommendedColors: ["brown", "tan"]
          },
          {
            category: "layering",
            categoryLabel: "Jackets & Layers",
            icon: "🧥",
            searchTerm: "men navy blue casual cotton overshirt jacket",
            stylingReason: `A solid cotton overshirt provides an easy neutral contrast over the flannel.`,
            recommendedColors: ["navy", "olive"]
          },
          {
            category: "accessories",
            categoryLabel: "Accessories",
            icon: "⌚",
            searchTerm: "men tan brown braided genuine leather belt",
            stylingReason: `Rich tan leather hardware ties together the boots and waistband.`,
            recommendedColors: ["tan", "brown"]
          }
        ];
      } else {
        // Smart Casual default, e.g. Light Blue Chinos / Khakis
        outfitTitle = "Refined Smart-Casual Look";
        overallStylingAdvice = `Your ${item.primaryColor || "chino"} trousers provide a relaxed, versatile canvas. Pairing with a rich navy knitted polo and tan loafers creates an effortlessly sophisticated color block.`;
        pieces = [
          {
            category: "tops",
            categoryLabel: "Tops & Shirts",
            icon: "👕",
            searchTerm: "men navy blue solid knitted cotton polo t-shirt",
            stylingReason: `A deep navy knitted polo creates high-contrast, polished sophistication against ${item.primaryColor || "light"} chinos.`,
            recommendedColors: ["navy", "white"]
          },
          {
            category: "shoes",
            categoryLabel: "Footwear",
            icon: "👟",
            searchTerm: "men classic tan brown leather casual loafers",
            stylingReason: `Warm tan leather loafers elevate the chinos for an Italian smart-casual aesthetic.`,
            recommendedColors: ["tan", "brown"]
          },
          {
            category: "layering",
            categoryLabel: "Jackets & Layers",
            icon: "🧥",
            searchTerm: "men mast harbour navy blue casual cotton overshirt jacket",
            stylingReason: `A neutral overshirt balances the look with relaxed, structured depth.`,
            recommendedColors: ["navy", "beige"]
          },
          {
            category: "accessories",
            categoryLabel: "Accessories",
            icon: "⌚",
            searchTerm: "men tan brown braided genuine leather belt",
            stylingReason: `Braided leather coordinates with the loafers to cleanly frame the waistband.`,
            recommendedColors: ["tan", "brown"]
          }
        ];
      }
    } else {
      // Women Bottoms
      if (style === "streetwear" || style === "casual") {
        outfitTitle = "Modern Athleisure Street Look";
        overallStylingAdvice = `Relaxed bottoms pair best with a cropped fitted top and chunky sneakers for an active, effortless urban silhouette.`;
        pieces = [
          {
            category: "tops",
            categoryLabel: "Tops & Shirts",
            icon: "👚",
            searchTerm: "women white oversized graphic drop shoulder crop tee",
            stylingReason: `A boxy cropped graphic tee highlights the waistline while complementing the casual trouser cut.`,
            recommendedColors: ["white", "black"]
          },
          {
            category: "shoes",
            categoryLabel: "Footwear",
            icon: "👟",
            searchTerm: "women bata white chunky casual sneakers",
            stylingReason: `Chunky white sneakers add sporty height and contemporary street appeal.`,
            recommendedColors: ["white"]
          },
          {
            category: "layering",
            categoryLabel: "Jackets & Layers",
            icon: "🧥",
            searchTerm: "women light blue cropped washed denim jacket",
            stylingReason: `A cropped denim jacket keeps the silhouette compact and modern.`,
            recommendedColors: ["light blue"]
          },
          {
            category: "accessories",
            categoryLabel: "Accessories",
            icon: "👜",
            searchTerm: "women structured black faux leather laptop tote bag",
            stylingReason: `A sleek faux-leather tote elevates casual street styling.`,
            recommendedColors: ["black"]
          }
        ];
      } else {
        // Women Smart / Formal / Chic (e.g. Beige Wide Leg Trousers)
        outfitTitle = "Contemporary Parisian Chic Look";
        overallStylingAdvice = `Wide-leg ${item.primaryColor || "beige"} trousers have an elegant fluid drape. Balancing them with a fitted black top and tailored blazer creates an elongated, poised silhouette.`;
        pieces = [
          {
            category: "tops",
            categoryLabel: "Tops & Shirts",
            icon: "👚",
            searchTerm: "women black sleeveless ribbed high neck knit top",
            stylingReason: `A fitted black high-neck top provides clean visual contrast and balances the voluminous trousers.`,
            recommendedColors: ["black", "white"]
          },
          {
            category: "shoes",
            categoryLabel: "Footwear",
            icon: "👠",
            searchTerm: "women carlton london nude pointed toe block heels",
            stylingReason: `Pointed-toe nude block heels elongate the leg line beneath wide-leg hems.`,
            recommendedColors: ["nude", "black"]
          },
          {
            category: "layering",
            categoryLabel: "Jackets & Layers",
            icon: "🧥",
            searchTerm: "women marks spencer beige double breasted relaxed blazer",
            stylingReason: `A relaxed double-breasted blazer creates a coordinated, power-dressing statement.`,
            recommendedColors: ["beige", "black"]
          },
          {
            category: "accessories",
            categoryLabel: "Accessories",
            icon: "✨",
            searchTerm: "women minimalist 18k gold plated layered chain hoop earrings",
            stylingReason: `Delicate gold hardware adds warm, luxurious accents near the neckline.`,
            recommendedColors: ["gold"]
          }
        ];
      }
    }
  } else if (isTop) {
    // Anchor is a TOP -> NEVER recommend tops!
    outfitTitle = "Sharp Tonal Coordinates";
    overallStylingAdvice = `Your ${item.primaryColor || ""} ${item.title || "top"} is the focal point. Balancing with neutral tailored bottoms and clean footwear creates an intentional, harmonious outfit.`;
    pieces = [
      {
        category: "bottoms",
        categoryLabel: "Pants & Trousers",
        icon: "👖",
        searchTerm: gender === "men" ? "men beige slim fit stretch chino trousers" : "women beige high waist wide leg straight trouser",
        stylingReason: `Straight-fit neutral trousers anchor your ${item.title || "top"} without competing for attention.`,
        recommendedColors: ["beige", "navy", "black"]
      },
      {
        category: "shoes",
        categoryLabel: "Footwear",
        icon: "👟",
        searchTerm: gender === "men" ? "men minimalist white leather low top sneakers" : "women bata white chunky casual sneakers",
        stylingReason: `Crisp low-profile sneakers maintain casual versatility and match the relaxed vibe.`,
        recommendedColors: ["white"]
      },
      {
        category: "layering",
        categoryLabel: "Jackets & Layers",
        icon: "🧥",
        searchTerm: gender === "men" ? "men navy blue casual cotton overshirt jacket" : "women light blue cropped washed denim jacket",
        stylingReason: `An unbuttoned lightweight layer adds dimension while keeping the top visible.`,
        recommendedColors: ["navy", "denim"]
      },
      {
        category: "accessories",
        categoryLabel: "Accessories",
        icon: "⌚",
        searchTerm: gender === "men" ? "men titan black leather analog minimalist watch" : "women structured black faux leather laptop tote bag",
        stylingReason: `Understated accessories complete the outfit with polished finesse.`,
        recommendedColors: ["black", "tan"]
      }
    ];
  } else if (isDress) {
    // Anchor is a DRESS
    outfitTitle = "Elevated Occasion Ensemble";
    overallStylingAdvice = `Your dress creates the single silhouette. Complementing it with delicate strappy heels, structured layering, and metallic accents completes a stunning look.`;
    pieces = [
      {
        category: "shoes",
        categoryLabel: "Footwear",
        icon: "👠",
        searchTerm: "women carlton london nude pointed toe block heels",
        stylingReason: `Nude block heels flatter the dress hemline and provide comfortable height.`,
        recommendedColors: ["nude", "gold", "black"]
      },
      {
        category: "layering",
        categoryLabel: "Jackets & Shrugs",
        icon: "🧥",
        searchTerm: "women marks spencer beige double breasted relaxed blazer",
        stylingReason: `A tailored blazer draped over the shoulders adds evening polish and warmth.`,
        recommendedColors: ["beige", "black"]
      },
      {
        category: "accessories",
        categoryLabel: "Handbags & Clutches",
        icon: "👛",
        searchTerm: "women structured black faux leather laptop tote bag",
        stylingReason: `A structured clutch or mini tote organizes essentials while complementing the formal drape.`,
        recommendedColors: ["black", "metallic"]
      },
      {
        category: "jewelry",
        categoryLabel: "Jewelry",
        icon: "✨",
        searchTerm: "women minimalist 18k gold plated layered chain hoop earrings",
        stylingReason: `Minimalist gold hoops frame the face and illuminate the neckline.`,
        recommendedColors: ["gold"]
      }
    ];
  } else if (isShoes) {
    // Anchor is SHOES
    outfitTitle = "Head-to-Toe Footwear Coordinates";
    overallStylingAdvice = `Building from the ground up, tailored trousers and a contrasting top ensure your footwear takes its rightful place in the look.`;
    pieces = [
      {
        category: "bottoms",
        categoryLabel: "Pants & Trousers",
        icon: "👖",
        searchTerm: gender === "men" ? "men peter england charcoal grey slim fit formal trousers" : "women beige high waist wide leg straight trouser",
        stylingReason: `Clean hemmed trousers showcase the silhouette of your shoes without bunching.`,
        recommendedColors: ["grey", "beige", "black"]
      },
      {
        category: "tops",
        categoryLabel: "Tops & Shirts",
        icon: "👕",
        searchTerm: gender === "men" ? "men white slim fit oxford cotton shirt" : "women white regular fit solid formal shirt",
        stylingReason: `A crisp white shirt provides timeless balance across the entire silhouette.`,
        recommendedColors: ["white"]
      },
      {
        category: "layering",
        categoryLabel: "Jackets & Layers",
        icon: "🧥",
        searchTerm: gender === "men" ? "men navy blue slim fit formal blazer" : "women marks spencer beige double breasted relaxed blazer",
        stylingReason: `A structured blazer ties the shoes and top into a unified outfit.`,
        recommendedColors: ["navy", "beige"]
      },
      {
        category: "accessories",
        categoryLabel: "Accessories",
        icon: "⌚",
        searchTerm: gender === "men" ? "men titan black leather analog minimalist watch" : "women structured black faux leather laptop tote bag",
        stylingReason: `Hardware color-matched to the footwear finishes the look cleanly.`,
        recommendedColors: ["black", "tan"]
      }
    ];
  } else {
    // General fallback
    outfitTitle = "Smart-Casual Coordinated Look";
    overallStylingAdvice = "A versatile, balanced pairing designed to coordinate effortlessly with your wardrobe item.";
    pieces = [
      {
        category: "tops",
        categoryLabel: "Tops & Shirts",
        icon: "👕",
        searchTerm: `${gender} white cotton casual shirt`,
        stylingReason: "A versatile white shirt completes the foundation.",
        recommendedColors: ["white"]
      },
      {
        category: "shoes",
        categoryLabel: "Footwear",
        icon: "👟",
        searchTerm: `${gender} white minimalist sneakers`,
        stylingReason: "Clean sneakers keep the outfit modern and approachable.",
        recommendedColors: ["white"]
      },
      {
        category: "layering",
        categoryLabel: "Jackets & Layers",
        icon: "🧥",
        searchTerm: `${gender} casual overshirt jacket`,
        stylingReason: "Layering adds depth and structure.",
        recommendedColors: ["navy"]
      },
      {
        category: "accessories",
        categoryLabel: "Accessories",
        icon: "⌚",
        searchTerm: `${gender} leather belt watch`,
        stylingReason: "Refined accessories complete the outfit.",
        recommendedColors: ["black"]
      }
    ];
  }

  const primary = pieces.find((p) => p.category === targetCategory) || pieces[0];

  return {
    outfitTitle,
    overallStylingAdvice,
    pieces,
    targetCategory: primary.category,
    searchTerm: primary.searchTerm,
    stylingReason: primary.stylingReason,
    recommendedColors: primary.recommendedColors || [],
    alternativeCategories: pieces.filter((p) => p !== primary).map((p) => ({
      targetCategory: p.category,
      searchTerm: p.searchTerm,
      stylingReason: p.stylingReason
    }))
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
  const isAnchorShoes = /shoe|sneaker|boot|sandal|heel|loafer/i.test(anchorLower);
  const isAnchorDress = /dress|gown|jumpsuit/i.test(anchorLower);

  const min = Number.isFinite(Number(minPrice)) && Number(minPrice) >= 0 ? Number(minPrice) : null;
  const baseMax = Number.isFinite(Number(maxPrice)) && Number(maxPrice) > 0 ? Number(maxPrice) : null;
  const max = baseMax !== null && allowAboveBudget ? baseMax * 1.15 : baseMax;

  const femaleExcludeRegex = /\b(women|woman|women's|woman's|female|girl|girls|ladies|lady|kurti|kurtis|saree|sarees|lehenga|lehengas|bra|panties|maternity)\b/i;
  const maleExcludeRegex = /\b(men|man|men's|man's|male|boy|boys|gentleman|boxer|briefs)\b/i;

  return products.filter((item) => {
    const title = (item.title || "").toLowerCase();
    const itemCat = (item.category || "").toLowerCase();

    // 1. Strict Gender Exclusion
    if (isMale && (femaleExcludeRegex.test(title) || item.gender === "women")) {
      return false;
    }
    if (isFemale && (maleExcludeRegex.test(title) || item.gender === "men")) {
      return false;
    }

    // 2. Prevent recommending same category as anchor
    if (isAnchorBottom) {
      const isPant = /\b(pant|pants|trouser|trousers|jeans|cargos|cargo|chinos|chino|joggers|shorts|skirt)\b/i.test(title) || itemCat === "bottoms";
      const isTopOrShoe = /\b(shirt|top|t-shirt|tee|jacket|overshirt|polo|shoes|sneakers|loafers|belt|watch)\b/i.test(title);
      if (isPant && !isTopOrShoe) {
        return false;
      }
    } else if (isAnchorTop) {
      const isTopItem = /\b(shirt|shirts|t-shirt|t-shirts|tee|tees|blouse|polo|kurta|top|tops)\b/i.test(title) || itemCat === "tops";
      const isBottomOrShoe = /\b(pants|trouser|trousers|jeans|skirt|shoes|sneakers|boots|belt)\b/i.test(title);
      if (isTopItem && !isBottomOrShoe) {
        return false;
      }
    } else if (isAnchorShoes) {
      const isShoe = /\b(shoe|shoes|sneaker|sneakers|loafer|boots|heels|sandals)\b/i.test(title) || itemCat === "shoes";
      if (isShoe) return false;
    } else if (isAnchorDress) {
      const isDressItem = /\b(dress|gown|jumpsuit)\b/i.test(title) || itemCat === "dresses";
      if (isDressItem) return false;
    }

    // 3. Category specificity if targetCategory is given
    if (targetLower === "tops") {
      const isTop = itemCat === "tops" || (/\b(shirt|shirts|top|tops|tee|tees|t-shirt|t-shirts|polo|blouse|kurta)\b/i.test(title) && !/\b(pants?|trousers?|jeans?|shoes?|sneakers?|boots?|jacket|blazer|overshirt|bag|watch|belt)\b/i.test(title));
      if (!isTop) return false;
    } else if (targetLower === "shoes") {
      const isShoe = itemCat === "shoes" || (/\b(shoe|shoes|sneaker|sneakers|loafer|loafers|boot|boots|sandal|sandals|footwear|slides|derby|mules|heels|flats)\b/i.test(title) && !/\b(shirt|t-shirt|pants?|jeans?)\b/i.test(title));
      if (!isShoe) return false;
    } else if (targetLower === "layering") {
      const isLayer = itemCat === "layering" || /\b(jacket|jackets|blazer|blazers|overshirt|overshirts|coat|coats|shrug|shrugs|cardigan|cardigans|vest|vests|bomber|hoodie|hoodies|windbreaker)\b/i.test(title);
      if (!isLayer) return false;
    } else if (targetLower === "accessories" || targetLower === "bags" || targetLower === "jewelry") {
      const isAccessory = itemCat === "accessories" || itemCat === "bags" || itemCat === "jewelry" || (/\b(belt|belts|watch|watches|sunglasses|shades|wallet|wallets|bracelet|bracelets|necklace|necklaces|earrings?|tie|ties|cufflinks|bag|bags|clutch|clutches|tote|totes|cap|caps|hat|hats)\b/i.test(title) && !/\b(shirt|t-shirt|pants?|trousers?|jeans?|shoes?|sneakers?|jacket|blazer)\b/i.test(title));
      if (!isAccessory) return false;
    } else if (targetLower === "bottoms") {
      const isPant = itemCat === "bottoms" || (/\b(pant|pants|trouser|trousers|jeans|chinos|chino|joggers|jogger|shorts|skirt|leggings?)\b/i.test(title) && !/\b(shirt|t-shirt|shoes?|sneakers?)\b/i.test(title));
      if (!isPant) return false;
    }

    // 4. Budget Limits
    if (min !== null && item.extractedPrice < min) return false;
    if (max !== null && item.extractedPrice > max) return false;

    return true;
  });
}

/**
 * Main handler for /api/shopping/complete-look
 * Returns a complete coordinated outfit matching the ClothMatics AI Stylist experience.
 * Strictly caps every category to maximum 3 curated suggestions.
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
  const apiKey = String(env.SERPAPI_API_KEY || env.SERPAPI_KEY || "").trim();
  const geminiKey = String(env.GEMINI_API_KEY || "").trim();

  const rawGender = String(profile.gender || profile.shoppingProfile?.gender || "").toLowerCase();
  const isFemale = rawGender.includes("fem") || rawGender.includes("wom") || rawGender === "female";
  const gender = isFemale ? "women" : "men";

  // Step 1: Call Gemini AI for trending multi-piece outfit styling plan
  let stylingPlan = null;
  if (geminiKey) {
    stylingPlan = await generateStylingPlanWithGemini({
      item,
      profile,
      targetCategory,
      apiKey: geminiKey
    });
  }

  // Fallback to deterministic style-aware fashion engine if Gemini was unavailable or returned null
  if (!stylingPlan || !Array.isArray(stylingPlan.pieces) || stylingPlan.pieces.length === 0) {
    stylingPlan = getFallbackStylingPlan({
      item,
      profile,
      targetCategory
    });
  }

  const minPrice = budget.min ?? budget.minPrice;
  const maxPrice = budget.max ?? budget.maxPrice;
  const anchorDesc = `${item.category || ""} ${item.subCategory || ""} ${item.title || ""}`;
  const pieces = stylingPlan.pieces || [];

  // Step 2: Query candidate products per category
  const sampleNormalized = DIVERSE_SAMPLE_PRODUCTS.map((p, idx) => ({
    ...normalizeProduct(p, idx),
    category: p.category,
    gender: p.gender,
    style: p.style
  }));

  // Fetch SerpApi in parallel for each piece's specific search term if apiKey is present
  let liveByPieceIndex = [];
  let isSample = false;
  let notice = "";

  if (apiKey) {
    try {
      const searchTasks = pieces.map(async (piece) => {
        const query = (piece.category === targetCategory && customQuery) ? customQuery : piece.searchTerm;
        try {
          const data = await fetchSerpApiShopping({ query, gl, hl, apiKey });
          const raw = Array.isArray(data?.shopping_results) ? data.shopping_results : [];
          return raw.map((p, idx) => ({
            ...normalizeProduct(p, idx),
            category: piece.category,
            gender
          }));
        } catch (err) {
          console.warn(`SerpApi search error for ${piece.category}:`, err.message);
          return [];
        }
      });

      const settled = await Promise.allSettled(searchTasks);
      liveByPieceIndex = settled.map((res) => (res.status === "fulfilled" ? res.value : []));

      const totalLive = liveByPieceIndex.reduce((sum, list) => sum + list.length, 0);
      if (totalLive === 0) {
        isSample = true;
        notice = "No live shopping results found for this specific query. Showing curated matches.";
      }
    } catch (error) {
      console.warn("SerpApi live request error:", error.message);
      isSample = true;
      notice = "Shopping provider is temporarily unavailable. Showing preview matches.";
    }
  } else {
    isSample = true;
    notice = "SerpApi API key not configured in Cloudflare environment yet. Displaying sample products for preview.";
  }

  // Step 3: For each piece in the outfit, pool, filter, and strictly cap at maximum 3 products
  const outfitCategories = [];

  for (let i = 0; i < pieces.length; i++) {
    const piece = pieces[i];
    const liveForPiece = liveByPieceIndex[i] || [];
    const sampleForPiece = sampleNormalized.filter((p) => p.category === piece.category && p.gender === gender);

    // Candidates for this piece ONLY contain items matching this specific category!
    const candidatePool = [...liveForPiece, ...sampleForPiece];

    let catFiltered = filterProductsStrict({
      products: candidatePool,
      minPrice,
      maxPrice,
      allowAboveBudget,
      gender,
      anchorCategory: anchorDesc,
      targetCategory: piece.category
    });

    // If budget was too strict and returned 0 products, relax budget to ensure user always gets 3 curated picks
    if (catFiltered.length === 0) {
      catFiltered = filterProductsStrict({
        products: sampleForPiece,
        minPrice: null,
        maxPrice: null,
        allowAboveBudget: true,
        gender,
        anchorCategory: anchorDesc,
        targetCategory: piece.category
      });
    }

    // Fallback: If still 0, use sampleForPiece directly
    if (catFiltered.length === 0 && sampleForPiece.length > 0) {
      catFiltered = sampleForPiece;
    }

    // STRICT CAPPING: Maximum 3 products per category!
    const capped = catFiltered.slice(0, 3).map((prod) => ({
      ...prod,
      stylingReason: piece.stylingReason,
      category: piece.category,
      categoryLabel: piece.categoryLabel,
      icon: piece.icon
    }));

    outfitCategories.push({
      id: piece.category,
      label: piece.categoryLabel,
      icon: piece.icon,
      stylingReason: piece.stylingReason,
      searchTerm: piece.searchTerm,
      recommendedColors: piece.recommendedColors || [],
      products: capped
    });
  }

  // Flatten capped products for backward compatibility
  const allProducts = outfitCategories.flatMap((c) => c.products);

  return {
    ok: true,
    outfit: {
      title: stylingPlan.outfitTitle,
      stylingAdvice: stylingPlan.overallStylingAdvice,
      pieces: stylingPlan.pieces,
      categories: outfitCategories
    },
    intent: stylingPlan,
    products: allProducts,
    total: allProducts.length,
    unfilteredTotal: allProducts.length,
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
