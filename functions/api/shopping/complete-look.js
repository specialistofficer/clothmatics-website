import { clean } from "../../_shared/firebase-rest.mjs";
import {
  normalizeProduct,
  fetchSerpApiShopping,
  fetchSerperShopping,
  fetchShoppingWithFallback
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

export function hasValidImage(product = {}) {
  const thumb = String(product?.thumbnail || product?.image || "").trim();
  if (!thumb) return false;
  if (!thumb.startsWith("https://") && !thumb.startsWith("http://") && !thumb.startsWith("data:image/")) return false;
  if (thumb.includes("clothmatics-logo.png")) return false;
  if (thumb.length < 16) return false;
  return true;
}

export function getCategoryFallbackImage(category = "", gender = "men") {
  const isFemale = String(gender).toLowerCase().includes("fem") || String(gender).toLowerCase().includes("wom");
  const cat = String(category).toLowerCase();

  if (isFemale) {
    if (cat === "tops") return "https://images.unsplash.com/photo-1503342217505-b0a15ec3261c?w=500&q=80";
    if (cat === "bottoms") return "https://images.unsplash.com/photo-1551854838-212c50b4c184?w=500&q=80";
    if (cat === "shoes") return "https://images.unsplash.com/photo-1543163521-1bf539c55dd2?w=500&q=80";
    if (cat === "layering") return "https://images.unsplash.com/photo-1591047139829-d91aecb6caea?w=500&q=80";
    if (cat === "accessories" || cat === "bags") return "https://images.unsplash.com/photo-1584917865442-de89df76afd3?w=500&q=80";
    if (cat === "jewelry") return "https://images.unsplash.com/photo-1535632066927-ab7c9ab60908?w=500&q=80";
    return "https://images.unsplash.com/photo-1503342217505-b0a15ec3261c?w=500&q=80";
  }

  // Men
  if (cat === "tops") return "https://images.unsplash.com/photo-1521572267360-ee0c2909d518?w=500&q=80";
  if (cat === "bottoms") return "https://images.unsplash.com/photo-1624378439575-d8705ad7ae80?w=500&q=80";
  if (cat === "shoes") return "https://images.unsplash.com/photo-1549298916-b41d501d3772?w=500&q=80";
  if (cat === "layering") return "https://images.unsplash.com/photo-1544441893-675973e31985?w=500&q=80";
  if (cat === "accessories") return "https://images.unsplash.com/photo-1524805444758-089113d48a6d?w=500&q=80";
  return "https://images.unsplash.com/photo-1521572267360-ee0c2909d518?w=500&q=80";
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
  {
    id: "m_layer_denim",
    position: 17,
    title: "Roadster Men Blue Washed Denim Trucker Jacket",
    product_id: "m_layer_denim",
    product_link: "https://www.google.com/search?tbm=shop&q=buy+Roadster+Men+Blue+Washed+Denim+Trucker+Jacket+myntra",
    source: "Myntra",
    price: "₹1,499",
    extracted_price: 1499,
    old_price: "₹2,999",
    extracted_old_price: 2999,
    thumbnail: "https://images.unsplash.com/photo-1576995853123-5a10305d93c0?w=500&q=80",
    delivery: "Free delivery",
    category: "layering",
    style: "rugged",
    gender: "men"
  },

  // -------------------------------------------------------------
  // MEN ACCESSORIES
  // -------------------------------------------------------------
  {
    id: "m_acc_formal",
    position: 18,
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
    position: 19,
    title: "Fastrack Men Matte Black Digital Tactical Sports Watch",
    product_id: "m_acc_tactical",
    product_link: "https://www.amazon.in/s?k=Fastrack+Men+Matte+Black+Digital+Sports+Watch",
    source: "Amazon.in",
    price: "₹1,295",
    extracted_price: 1295,
    old_price: "₹1,795",
    extracted_old_price: 1795,
    thumbnail: "https://images.unsplash.com/photo-1508685096489-7aacd43bd3b1?w=400&q=80",
    delivery: "Free delivery",
    category: "accessories",
    style: "streetwear",
    gender: "men"
  },
  {
    id: "m_acc_belt",
    position: 20,
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
  {
    id: "m_acc_shades",
    position: 21,
    title: "Vincent Chase Men Polarized Classic Aviator Sunglasses",
    product_id: "m_acc_shades",
    product_link: "https://www.amazon.in/s?k=Vincent+Chase+Men+Polarized+Classic+Aviator+Sunglasses",
    source: "Amazon.in",
    price: "₹999",
    extracted_price: 999,
    old_price: "₹1,999",
    extracted_old_price: 1999,
    thumbnail: "https://images.unsplash.com/photo-1511499767150-a48a237f0083?w=500&q=80",
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
  {
    id: "w_top_wrap",
    position: 23,
    title: "ONLY Women Beige Ribbed Long Sleeve Fitted Knit Top",
    product_id: "w_top_wrap",
    product_link: "https://www.ajio.com/search/?text=ONLY+Women+Beige+Ribbed+Long+Sleeve+Top",
    source: "AJIO.com",
    price: "₹799",
    extracted_price: 799,
    old_price: "₹1,699",
    extracted_old_price: 1699,
    thumbnail: "https://images.unsplash.com/photo-1515886657613-9f3515b0c78f?w=500&q=80",
    delivery: "Free delivery",
    category: "tops",
    style: "smart_casual",
    gender: "women"
  },

  // -------------------------------------------------------------
  // WOMEN BOTTOMS
  // -------------------------------------------------------------
  {
    id: "w_bot_beige",
    position: 24,
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
    position: 25,
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
  {
    id: "w_bot_denim",
    position: 26,
    title: "Levi's Women 721 High Rise Dark Wash Skinny Stretch Jeans",
    product_id: "w_bot_denim",
    product_link: "https://www.amazon.in/s?k=Levis+Women+721+High+Rise+Dark+Wash+Jeans",
    source: "Amazon.in",
    price: "₹1,899",
    extracted_price: 1899,
    old_price: "₹3,999",
    extracted_old_price: 3999,
    thumbnail: "https://images.unsplash.com/photo-1541099649105-f69ad21f3246?w=500&q=80",
    delivery: "Free delivery",
    category: "bottoms",
    style: "casual",
    gender: "women"
  },
  {
    id: "w_bot_skirt",
    position: 27,
    title: "H&M Women Black Pleated A-Line High Waist Midi Skirt",
    product_id: "w_bot_skirt",
    product_link: "https://www.google.com/search?tbm=shop&q=buy+HM+Women+Black+Pleated+Midi+Skirt",
    source: "Myntra",
    price: "₹1,299",
    extracted_price: 1299,
    old_price: "₹2,299",
    extracted_old_price: 2299,
    thumbnail: "https://images.unsplash.com/photo-1583496661160-fb5886a0aaaa?w=500&q=80",
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
    position: 28,
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
    position: 29,
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
  {
    id: "w_shoe_loafer",
    position: 30,
    title: "Carlton London Women Black Chunky Lug-Sole Loafers",
    product_id: "w_shoe_loafer",
    product_link: "https://www.ajio.com/search/?text=Carlton+London+Women+Black+Chunky+Lug+Sole+Loafers",
    source: "AJIO.com",
    price: "₹1,695",
    extracted_price: 1695,
    old_price: "₹3,295",
    extracted_old_price: 3295,
    thumbnail: "https://images.unsplash.com/photo-1595950653106-6c9ebd614d3a?w=500&q=80",
    delivery: "Free delivery",
    category: "shoes",
    style: "smart_casual",
    gender: "women"
  },
  {
    id: "w_shoe_pumps",
    position: 31,
    title: "DressBerry Women Classic Black Pointed-Toe Stiletto Pumps",
    product_id: "w_shoe_pumps",
    product_link: "https://www.amazon.in/s?k=DressBerry+Women+Classic+Black+Pointed+Toe+Pumps",
    source: "Amazon.in",
    price: "₹1,399",
    extracted_price: 1399,
    old_price: "₹2,799",
    extracted_old_price: 2799,
    thumbnail: "https://images.unsplash.com/photo-1543163521-1bf539c55dd2?w=500&q=80",
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
    position: 32,
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
    position: 33,
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
  {
    id: "w_layer_cardigan",
    position: 34,
    title: "Marks & Spencer Women Cream Ribbed Soft Knit Cardigan",
    product_id: "w_layer_cardigan",
    product_link: "https://www.ajio.com/search/?text=Marks+and+Spencer+Women+Cream+Ribbed+Knit+Cardigan",
    source: "AJIO.com",
    price: "₹1,999",
    extracted_price: 1999,
    old_price: "₹3,999",
    extracted_old_price: 3999,
    thumbnail: "https://images.unsplash.com/photo-1434389677669-e08b4cac3105?w=500&q=80",
    delivery: "Free delivery",
    category: "layering",
    style: "smart_casual",
    gender: "women"
  },
  {
    id: "w_layer_trench",
    position: 35,
    title: "Mango Women Classic Double-Breasted Tailored Crepe Shrug",
    product_id: "w_layer_trench",
    product_link: "https://www.google.com/search?tbm=shop&q=buy+Mango+Women+Tailored+Crepe+Shrug+myntra",
    source: "Myntra",
    price: "₹2,490",
    extracted_price: 2490,
    old_price: "₹4,990",
    extracted_old_price: 4990,
    thumbnail: "https://images.unsplash.com/photo-1539571696357-5a69c17a67c6?w=500&q=80",
    delivery: "Free delivery",
    category: "layering",
    style: "formal",
    gender: "women"
  },

  // -------------------------------------------------------------
  // WOMEN ACCESSORIES & BAGS
  // -------------------------------------------------------------
  {
    id: "w_acc_tote",
    position: 36,
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
    position: 37,
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
  },
  {
    id: "w_acc_clutch",
    position: 38,
    title: "Baggit Women Rose Gold Metallic Evening Box Clutch",
    product_id: "w_acc_clutch",
    product_link: "https://www.amazon.in/s?k=Baggit+Women+Rose+Gold+Metallic+Evening+Box+Clutch",
    source: "Amazon.in",
    price: "₹990",
    extracted_price: 990,
    old_price: "₹1,990",
    extracted_old_price: 1990,
    thumbnail: "https://images.unsplash.com/photo-1566150905458-1bf1fc113f0d?w=500&q=80",
    delivery: "Free delivery",
    category: "accessories",
    style: "formal",
    gender: "women"
  },
  {
    id: "w_acc_belt",
    position: 39,
    title: "Ginger by Lifestyle Women Tan Brown Classic Faux Leather Belt",
    product_id: "w_acc_belt",
    product_link: "https://www.amazon.in/s?k=Ginger+by+Lifestyle+Women+Tan+Brown+Classic+Belt",
    source: "Amazon.in",
    price: "₹399",
    extracted_price: 399,
    old_price: "₹799",
    extracted_old_price: 799,
    thumbnail: "https://images.unsplash.com/photo-1553062407-98eeb64c6a62?w=500&q=80",
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

export function getUserProfileSizes(profile = {}) {
  const sp = profile.shoppingProfile || {};
  const sizes = sp.sizes || profile.shoppingSizes || profile.sizes || {};

  const top = sizes.top?.alphaSize || (typeof sizes.top === "string" || typeof sizes.top === "number" ? String(sizes.top) : null) || null;
  const bottom = sizes.bottom?.alphaSize || (sizes.bottom?.waistInches != null ? String(sizes.bottom.waistInches) : null) || (typeof sizes.bottom === "string" || typeof sizes.bottom === "number" ? String(sizes.bottom) : null) || null;
  const shoes = (sizes.shoes?.uk != null ? String(sizes.shoes.uk) : null) || (sizes.shoes?.india != null ? String(sizes.shoes.india) : null) || (sizes.shoes?.eu != null ? String(sizes.shoes.eu) : null) || (typeof sizes.shoes === "string" || typeof sizes.shoes === "number" ? String(sizes.shoes) : null) || null;
  const dress = sizes.dress?.alphaSize || (typeof sizes.dress === "string" ? String(sizes.dress) : null) || null;

  return { top, bottom, shoes, dress };
}

export function getUserProfilePreferences(profile = {}) {
  const prefs = profile.preferences || {};
  const sp = profile.shoppingProfile || {};

  const fitPreference = prefs.fitPreference || sp.preferredFits?.[0] || null;
  const preferredFits = Array.from(new Set([...(sp.preferredFits || []), ...(prefs.fitPreference ? [prefs.fitPreference] : [])].filter(Boolean)));
  const avoidedFits = Array.from(new Set([...(sp.avoidedFits || [])].filter(Boolean)));

  const favoriteColors = Array.from(new Set([...(prefs.favoriteColors || []), ...(sp.preferredColors || [])].filter(Boolean)));
  const avoidColors = Array.from(new Set([...(prefs.avoidColors || []), ...(sp.avoidedColors || [])].filter(Boolean)));

  const preferredBrands = Array.from(new Set([...(sp.preferredBrands || [])].filter(Boolean)));
  const avoidedBrands = Array.from(new Set([...(sp.avoidedBrands || [])].filter(Boolean)));

  const preferredStyles = Array.from(new Set([...(prefs.styleLean || []), ...(sp.preferredStyles || [])].filter(Boolean)));
  const hardExclusions = Array.from(new Set([...(prefs.hardExclusions || [])].filter(Boolean)));
  const stylingPriority = prefs.stylingPriority || null;

  return {
    fitPreference,
    preferredFits,
    avoidedFits,
    favoriteColors,
    avoidColors,
    preferredBrands,
    avoidedBrands,
    preferredStyles,
    hardExclusions,
    stylingPriority
  };
}

export function extractProductSize(title = "") {
  const t = String(title || "");
  const bracketMatch = t.match(/\((XS|S|M|L|XL|XXL|\d{1,2})\)/i);
  if (bracketMatch) return bracketMatch[1].toUpperCase();

  const sizeWordMatch = t.match(/\b(?:size|uk|india)\s*[:-]?\s*(XS|S|M|L|XL|XXL|\d{1,2})\b/i);
  if (sizeWordMatch) return sizeWordMatch[1].toUpperCase();

  const trailingNumber = t.match(/\b(\d{1,2})\s+by\s+myntra\b/i);
  if (trailingNumber) return trailingNumber[1];

  return null;
}

export function normalizeProductTitleForDeduplication(title = "") {
  return String(title || "")
    .toLowerCase()
    .replace(/\((xs|s|m|l|xl|xxl|\d{1,2})\)/gi, "")
    .replace(/\b(?:size|uk|india)\s*[:-]?\s*(xs|s|m|l|xl|xxl|\d{1,2})\b/gi, "")
    .replace(/\bby\s+myntra\b/gi, "")
    .replace(/\s+-\s+.*$/i, "")
    .replace(/[^a-z0-9\s]/gi, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export function deduplicateAndRankProducts(products = [], { userSizes = {}, userPrefs = {}, category = "", anchorItem = {} } = {}) {
  const targetUserSize = (category === "tops" ? userSizes.top
    : category === "bottoms" ? userSizes.bottom
    : category === "shoes" ? userSizes.shoes
    : category === "dresses" ? userSizes.dress
    : null);

  const targetSizeStr = targetUserSize ? String(targetUserSize).trim().toUpperCase() : null;

  const avoidColors = (userPrefs.avoidColors || []).map((c) => String(c).toLowerCase());
  const hardExclusions = (userPrefs.hardExclusions || []).map((e) => String(e).toLowerCase());

  const filtered = products.filter((p) => {
    const t = String(p.title || "").toLowerCase();
    for (const ac of avoidColors) {
      if (ac && new RegExp(`\\b${ac}\\b`, "i").test(t)) return false;
    }
    for (const ex of hardExclusions) {
      if (ex && new RegExp(`\\b${ex}\\b`, "i").test(t)) return false;
    }
    return true;
  });

  const groups = new Map();
  for (const prod of filtered) {
    const normTitle = normalizeProductTitleForDeduplication(prod.title);
    const brand = String(prod.source || "").toLowerCase();
    const key = `${normTitle}__${brand}`;

    if (!groups.has(key)) {
      groups.set(key, []);
    }
    groups.get(key).push(prod);
  }

  const deduplicated = [];
  for (const [, group] of groups.entries()) {
    if (group.length === 1) {
      const prod = group[0];
      const prodSize = extractProductSize(prod.title);
      const isSizeMatch = Boolean(targetSizeStr && prodSize && prodSize === targetSizeStr);
      deduplicated.push({
        ...prod,
        extractedSize: prodSize,
        userSizeMatch: isSizeMatch
      });
      continue;
    }

    // Multiple listings of the same product with different sizes (e.g. size 46 vs 42)
    let chosen = null;
    if (targetSizeStr) {
      chosen = group.find((p) => {
        const sz = extractProductSize(p.title);
        return sz && sz === targetSizeStr;
      });
    }

    if (!chosen) {
      chosen = group[0];
    }

    const prodSize = extractProductSize(chosen.title);
    const isSizeMatch = Boolean(targetSizeStr && prodSize && prodSize === targetSizeStr);
    deduplicated.push({
      ...chosen,
      extractedSize: prodSize,
      userSizeMatch: isSizeMatch
    });
  }

  deduplicated.sort((a, b) => {
    if (a.userSizeMatch && !b.userSizeMatch) return -1;
    if (!a.userSizeMatch && b.userSizeMatch) return 1;
    return 0;
  });

  return deduplicated;
}

export function detectProductSubtype(product = {}, category = "") {
  const title = String(product?.title || "").toLowerCase();
  const cat = String(category || product?.category || "").toLowerCase();

  if (cat === "accessories" || cat === "bags" || cat === "jewelry") {
    if (/watch|chronograph|dial|horolog/i.test(title)) return "watch";
    if (/belt|buckle/i.test(title)) return "belt";
    if (/sunglass|glass|shades|eyewear|aviator|wayfarer/i.test(title)) return "eyewear";
    if (/bag|backpack|tote|messenger|crossbody|duffle|briefcase|clutch/i.test(title)) return "bag";
    if (/wallet|card holder|cardholder|money clip/i.test(title)) return "wallet";
    if (/bracelet|cuff|necklace|chain|ring|earring|pendant/i.test(title)) return "jewelry";
    if (/cap|hat|beanie|fedora/i.test(title)) return "headwear";
    if (/scarf|muffler|bandana|stole/i.test(title)) return "scarf";
    return "accessory_item";
  }

  if (cat === "shoes") {
    if (/sneaker|trainer|runner|skate/i.test(title)) return "sneaker";
    if (/loafer|penny|moccasin|boat shoe/i.test(title)) return "loafer";
    if (/boot|chelsea|chukka|ankle boot/i.test(title)) return "boot";
    if (/derby|oxford|brogue|monk|formal shoe/i.test(title)) return "formal_shoe";
    if (/sandal|slide|slip-on|espadrille|clog|flip flop/i.test(title)) return "slipon";
    if (/heel|pump|stiletto|wedge/i.test(title)) return "heels";
    if (/flat|ballerina/i.test(title)) return "flats";
    return "shoes_item";
  }

  if (cat === "tops") {
    if (/polo/i.test(title)) return "polo";
    if (/t-shirt|tee\b|graphic tee|crew neck tee/i.test(title)) return "tshirt";
    if (/shirt|oxford|button-down|flannel|linen shirt|dress shirt/i.test(title)) return "shirt";
    if (/overshirt|shacket/i.test(title)) return "overshirt";
    if (/sweater|knit|pullover|cardigan|jumper/i.test(title)) return "knitwear";
    if (/hoodie|sweatshirt/i.test(title)) return "sweatshirt";
    if (/blouse|top\b|tunic/i.test(title)) return "blouse";
    return "tops_item";
  }

  if (cat === "bottoms") {
    if (/jean|denim/i.test(title)) return "jeans";
    if (/chino|trouser|pant|slack|dress pant/i.test(title)) return "trouser";
    if (/cargo/i.test(title)) return "cargo";
    if (/short/i.test(title)) return "shorts";
    if (/jogger|sweatpant|track pant/i.test(title)) return "jogger";
    if (/skirt/i.test(title)) return "skirt";
    return "bottoms_item";
  }

  if (cat === "layering") {
    if (/blazer|suit jacket/i.test(title)) return "blazer";
    if (/bomber/i.test(title)) return "bomber";
    if (/denim jacket|trucker/i.test(title)) return "denim_jacket";
    if (/leather jacket|biker/i.test(title)) return "leather_jacket";
    if (/cardigan|sweater|pullover/i.test(title)) return "knit_layer";
    if (/overcoat|trench|coat|parka/i.test(title)) return "coat";
    if (/overshirt|shacket/i.test(title)) return "overshirt";
    if (/windbreaker|vest|gilet/i.test(title)) return "vest";
    return "layering_item";
  }

  return "general_item";
}

export function pickDiverseProductSet(products = [], category = "", limit = 3) {
  if (!Array.isArray(products) || products.length === 0) return [];
  if (products.length <= 1) return products.slice(0, limit);

  const selected = [];
  const seenSubtypes = new Set();
  const seenBrands = new Set();

  // Pass 1: Strict diversity - Pick distinct subtype AND distinct brand/retailer
  for (const prod of products) {
    if (selected.length >= limit) break;
    const subtype = detectProductSubtype(prod, category);
    const brand = String(prod.source || prod.brand || "").toLowerCase().trim();

    if (!seenSubtypes.has(subtype) && (!brand || !seenBrands.has(brand))) {
      selected.push(prod);
      seenSubtypes.add(subtype);
      if (brand) seenBrands.add(brand);
    }
  }

  // Pass 2: Distinct subtype, allow brand repeat if necessary
  if (selected.length < limit) {
    for (const prod of products) {
      if (selected.length >= limit) break;
      const id = prod.id || prod.product_id;
      if (selected.some((p) => (p.id || p.product_id) === id)) continue;
      const subtype = detectProductSubtype(prod, category);

      if (!seenSubtypes.has(subtype)) {
        selected.push(prod);
        seenSubtypes.add(subtype);
      }
    }
  }

  // Pass 3: Distinct brand, allow subtype repeat if variety was limited
  if (selected.length < limit) {
    for (const prod of products) {
      if (selected.length >= limit) break;
      const id = prod.id || prod.product_id;
      if (selected.some((p) => (p.id || p.product_id) === id)) continue;
      const brand = String(prod.source || prod.brand || "").toLowerCase().trim();

      if (!brand || !seenBrands.has(brand)) {
        selected.push(prod);
        if (brand) seenBrands.add(brand);
      }
    }
  }

  // Pass 4: Fill remaining slots with remaining valid products
  if (selected.length < limit) {
    for (const prod of products) {
      if (selected.length >= limit) break;
      const id = prod.id || prod.product_id;
      if (selected.some((p) => (p.id || p.product_id) === id)) continue;
      selected.push(prod);
    }
  }

  return selected;
}

export function createItemStylingReason(product = {}, piece = {}, anchorItem = {}, profile = {}) {
  const title = String(product.title || "").toLowerCase();
  const cat = String(piece.category || product.category || "").toLowerCase();
  const anchorDesc = [anchorItem.primaryColor, anchorItem.subCategory || anchorItem.category || "garment"].filter(Boolean).join(" ");
  const userSizes = getUserProfileSizes(profile);
  const sizeNote = (cat === "tops" && userSizes.top) ? ` (curated for size ${userSizes.top})`
    : (cat === "bottoms" && userSizes.bottom) ? ` (curated for waist ${userSizes.bottom})`
    : (cat === "shoes" && userSizes.shoes) ? ` (curated for UK ${userSizes.shoes})`
    : "";

  // 1. Watches
  if (/watch|chronograph/i.test(title)) {
    if (/tactical|digital|sports|shock/i.test(title)) {
      return `A matte black tactical sports watch introduces a sharp, contemporary edge that complements the relaxed lines of your ${anchorDesc}${sizeNote}.`;
    }
    return `A minimalist analog watch adds an understated, sophisticated finishing touch that refines your ${anchorDesc} without competing for attention${sizeNote}.`;
  }

  // 2. Belts
  if (/belt/i.test(title)) {
    const isBraided = /braid|woven/i.test(title);
    const color = /tan|brown/i.test(title) ? "tan brown" : /black/i.test(title) ? "black" : "leather";
    return `A ${color} ${isBraided ? "braided " : ""}leather belt cleanly structures the waistline, providing a tailored transition with your ${anchorDesc}.`;
  }

  // 3. Sunglasses
  if (/sunglass|shades|aviator|wayfarer/i.test(title)) {
    return `Polarized classic sunglasses add modern styling and an outdoor-ready silhouette that sharpens your ${anchorDesc} look.`;
  }

  // 4. Bags & Wallets
  if (/tote|handbag|clutch|bag|backpack/i.test(title)) {
    return `A structured bag offers sleek practical utility while maintaining the clean, proportioned lines of your ${anchorDesc}.`;
  }

  // 5. Jewelry
  if (/earring|necklace|bracelet|chain|ring/i.test(title)) {
    return `Minimalist jewelry provides an elegant metallic accent that elevates your ${anchorDesc} ensemble.`;
  }

  // 6. Footwear
  if (/loafer|moccasin/i.test(title)) {
    return `Classic leather loafers anchor the outfit with smart-casual sophistication, pairing effortlessly with your ${anchorDesc}${sizeNote}.`;
  }
  if (/sneaker|skate|trainer/i.test(title)) {
    return `Clean low-profile sneakers provide effortless modern balance and comfortable proportions alongside your ${anchorDesc}${sizeNote}.`;
  }
  if (/boot|chelsea/i.test(title)) {
    return `Leather boots deliver grounded structure and subtle textural contrast to complement your ${anchorDesc}${sizeNote}.`;
  }
  if (/heel|pump|stiletto/i.test(title)) {
    return `Pointed-toe heels lengthen the silhouette and elevate your ${anchorDesc} with feminine polish${sizeNote}.`;
  }

  // 7. Layering & Jackets
  if (/overshirt|shacket/i.test(title)) {
    const isOlive = /olive|green/i.test(title);
    const isCheck = /check|plaid|textured/i.test(title);
    const isNeutral = /beige|ecru|cream|navy|khaki|grey/i.test(title);
    const colorDesc = isOlive ? "An olive green" : isNeutral ? "A neutral-toned" : "A casual";
    return `${colorDesc} ${isCheck ? "textured check " : ""}overshirt creates relaxed depth and structured volume that balances your ${anchorDesc}${sizeNote}.`;
  }
  if (/blazer|suit jacket/i.test(title)) {
    return `A tailored structured blazer sharpens the shoulder line and brings formal refinement to your ${anchorDesc}${sizeNote}.`;
  }
  if (/bomber/i.test(title)) {
    return `A lightweight utility bomber jacket adds modern volume and clean silhouette contrast against your ${anchorDesc}${sizeNote}.`;
  }
  if (/denim jacket|trucker/i.test(title)) {
    return `A classic denim jacket introduces durable texture and casual versatility over your ${anchorDesc}${sizeNote}.`;
  }
  if (/cardigan|shrug/i.test(title)) {
    return `A soft knit layer provides tactile softness and fluid drape to complement your ${anchorDesc}${sizeNote}.`;
  }

  // 8. Tops
  if (/polo/i.test(title)) {
    return `A breathable knitted cotton polo adds tailored texture and crisp collar structure above your ${anchorDesc}${sizeNote}.`;
  }
  if (/oxford|button-down|formal shirt/i.test(title)) {
    return `A crisp pure cotton shirt frames the torso cleanly and ensures sharp, tailored proportions with your ${anchorDesc}${sizeNote}.`;
  }
  if (/tee|t-shirt/i.test(title)) {
    return `A premium heavyweight cotton tee keeps the foundation clean, minimalist, and perfectly proportioned with your ${anchorDesc}${sizeNote}.`;
  }

  // 9. Bottoms
  if (/chino|trouser|pant/i.test(title)) {
    return `Tailored stretch chinos ground the lower body with clean, elongated drape beneath your ${anchorDesc}${sizeNote}.`;
  }
  if (/jean/i.test(title)) {
    return `Classic slim-straight denim provides timeless casual contrast that highlights your ${anchorDesc}${sizeNote}.`;
  }

  if (piece.stylingReason && piece.stylingReason.length > 20) {
    return `${piece.stylingReason}${sizeNote}`;
  }

  return `Curated to pair with your ${anchorDesc} for a balanced, stylish outfit${sizeNote}.`;
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

  const skinTone = clean(profile.skinTone || profile.aiAnalysis?.skinTone || "Medium / Wheatish", 50);
  const bodyType = clean(profile.bodyTypeSelfReported || profile.aiAnalysis?.bodyType || "Regular / Proportional", 50);
  const city = clean(profile.city || "Metropolitan India", 50);
  const userSizes = getUserProfileSizes(profile);
  const userPrefs = getUserProfilePreferences(profile);

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

USER PROFILE & SIZES:
- Gender: Strictly ${gender}
- Skin Tone: ${skinTone}
- Body Type & Silhouette: ${bodyType}
- Location / City: ${city}
- Top Size: ${userSizes.top || "Not specified (use standard fit)"}
- Bottom Size: ${userSizes.bottom || "Not specified (use standard waist/inseam)"}
- Footwear Size: ${userSizes.shoes ? `UK/India ${userSizes.shoes}` : "Not specified"}
- Dress Size: ${userSizes.dress || "Not specified"}
- Fit Preference: ${userPrefs.fitPreference || "Regular / Volume balanced"}
- Preferred Styles: ${userPrefs.preferredStyles.length ? userPrefs.preferredStyles.join(", ") : "Modern Versatile"}
- Preferred Colors: ${userPrefs.favoriteColors.length ? userPrefs.favoriteColors.join(", ") : "Earthy / Balanced"}
- Colors to STRICTLY AVOID: ${userPrefs.avoidColors.length ? userPrefs.avoidColors.join(", ") : "None"}
- Hard Exclusions to NEVER recommend: ${userPrefs.hardExclusions.length ? userPrefs.hardExclusions.join(", ") : "None"}
- Preferred Brands: ${userPrefs.preferredBrands.length ? userPrefs.preferredBrands.join(", ") : "Zara, H&M, Snitch, Puma, Marks & Spencer"}
- Avoided Brands: ${userPrefs.avoidedBrands.length ? userPrefs.avoidedBrands.join(", ") : "None"}

ANCHOR GARMENT:
- Title: ${anchorTitle}
- Category: ${anchorCat} (${anchorSubCat})
- Color: ${anchorColor}
- Fit: ${anchorFit}
- Material: ${anchorMaterial}
- Detected Style Archetype: ${style}

CLOTHMATICS AI STYLIST CORE RULES:
1. GENDER PURITY: Must be strictly ${gender.toUpperCase()}. Every piece, title, and query must be designed exclusively for ${gender}. Never output unisex or opposing gender clothing.
2. NEVER RECOMMEND THE SAME CATEGORY AS THE ANCHOR:
   ${isBottom ? "- The anchor item is a PAIR OF PANTS/TROUSERS. You must NEVER recommend pants, trousers, jeans, or chinos! Recommend 1 Top, 1 Footwear, 1 Layering/Jacket, and 1 Accessory." : ""}
   ${isTop ? "- The anchor item is a TOP/SHIRT. You must NEVER recommend tops or shirts! Recommend 1 Bottom (Trousers/Chinos/Jeans), 1 Footwear, 1 Layering, and 1 Accessory." : ""}
   ${isDress ? "- The anchor item is a DRESS. Recommend 1 Footwear, 1 Layering shrug/jacket, 1 Handbag/Clutch, and 1 Jewelry/Accessory." : ""}
   ${isShoes ? "- The anchor item is FOOTWEAR. Recommend 1 Bottom, 1 Top, 1 Layering, and 1 Accessory." : ""}
3. SKIN TONE & COLOR HARMONY:
   - Skin Tone Harmony: Complement the user's skin tone (${skinTone}). Warm/wheatish/dusky skin pairs with rich earthy tones (olive, warm navy, mustard, terracotta, camel, ecru); cool/fair skin pairs with crisp contrast (deep navy, emerald, charcoal, cobalt, pure white).
   - Ground bold/distinctive colors with clean neutrals (crisp white, deep navy, rich black, beige).
4. BODY TYPE & SILHOUETTE BALANCING:
   - Balance volume: Wide-leg/baggy/relaxed bottoms require fitted, structured, or cropped tops. Slim/tapered bottoms can take relaxed/oversized layers or boxy tees.
5. STYLE ARCHETYPE COHESION:
   - Streetwear: Heavyweight oversized boxy graphic tees (240 GSM), chunky low-profile skate sneakers (Puma, Nike, Comet), utility bombers, tactical digital watch / crossbody bag.
   - Smart Casual: Knitted cotton polos, tan/brown leather penny loafers, unstructured overshirts, braided leather belts.
   - Formal: Pure cotton oxford/poplin button-downs, minimalist clean leather dress sneakers or black derbies, navy/charcoal blazers, analog dress watches.
   - Parisian Chic: Ribbed knit high-neck tops, pointed-toe nude/black block heels, double-breasted blazers, structured faux-leather tote bags.
6. BRAND-TARGETED SEARCH QUERIES:
   - In each piece's 'searchTerm', append top reputable fashion brands for crisp, studio-grade Google Shopping results:
     * For Men: e.g., 'men black oversized graphic cotton streetwear t-shirt (Zara OR H&M OR Snitch OR Puma)'
     * For Women: e.g., 'women black ribbed high neck knit top (Zara OR H&M OR Vero Moda OR Marks & Spencer)'
7. INDIVIDUAL PIECE REASONING: Each piece in 'pieces' must have its own distinct, specific styling reason explaining why its silhouette, color, and fabric balance with the anchor garment.
8. STRICT USER PROFILE & SIZE ADHERENCE:
   - NEVER recommend colors listed under 'Colors to STRICTLY AVOID' (${userPrefs.avoidColors.join(', ') || 'none'}).
   - NEVER recommend garments matching 'Hard Exclusions' (${userPrefs.hardExclusions.join(', ') || 'none'}).
   - If user has fit preference (${userPrefs.fitPreference || 'balanced'}), integrate it into the top/layering style.
   - If user has shoe size (UK/India ${userSizes.shoes || 'standard'}), recommend footwear styles suited to that profile.

Return pure JSON only in this exact format:
{
  "outfitTitle": "Short descriptive title for this complete look",
  "overallStylingAdvice": "2-3 sentences explaining overall aesthetic, silhouette balance, and color harmony.",
  "styleArchetype": "e.g. Urban Streetwear / Smart Casual / Tailored Formal / Contemporary Parisian Chic",
  "colorHarmony": "e.g. High-Contrast Monotone / Complementary Contrast / Neutral Grounding",
  "silhouetteBalance": "e.g. Volume-Balanced Proportion / Elongated Tailored Line",
  "pieces": [
    {
      "category": "tops",
      "categoryLabel": "Tops & Shirts",
      "icon": "👕",
      "searchTerm": "${gender.toLowerCase()} ...",
      "stylingReason": "Why this specific top, color, and fit pairs with the anchor garment...",
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
              styleArchetype: parsed.styleArchetype || (style === "streetwear" ? "Urban Streetwear" : style === "formal" ? "Tailored Formal" : "Smart Casual"),
              colorHarmony: parsed.colorHarmony || "Harmonious Complementary Contrast",
              silhouetteBalance: parsed.silhouetteBalance || "Volume-Balanced Proportion",
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
  let styleArchetype = "Smart Casual";
  let colorHarmony = "Harmonious Complementary Contrast";
  let silhouetteBalance = "Volume-Balanced Proportion";

  if (isBottom) {
    if (gender === "men") {
      if (style === "streetwear") {
        // e.g. Black Cargo Pants / Baggy Joggers
        outfitTitle = "Urban Streetwear Utility Look";
        overallStylingAdvice = `Pairing your ${item.primaryColor || "black"} cargo pants with an oversized graphic tee and chunky skate sneakers creates a balanced, modern streetwear proportion.`;
        styleArchetype = "Urban Streetwear";
        colorHarmony = "High-Contrast Monotone";
        silhouetteBalance = "Volume-Balanced Boxy Proportion";
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
        styleArchetype = "Tailored Formal";
        colorHarmony = "Timeless Executive Palette (White & Navy)";
        silhouetteBalance = "Clean Elongated Line";
        pieces = [
          {
            category: "tops",
            categoryLabel: "Tops & Shirts",
            icon: "👕",
            searchTerm: "men white slim fit oxford cotton shirt (Zara OR Marks & Spencer OR Dennis Lingo)",
            stylingReason: `A crisp white button-down oxford shirt is the timeless foundation for tailored ${item.primaryColor || "grey"} trousers.`,
            recommendedColors: ["white", "light blue"]
          },
          {
            category: "shoes",
            categoryLabel: "Footwear",
            icon: "👟",
            searchTerm: "men minimalist white leather low top sneakers (Puma OR Comet OR Zara)",
            stylingReason: `Clean low-profile white sneakers modernize the trousers for contemporary smart-office versatility.`,
            recommendedColors: ["white"]
          },
          {
            category: "layering",
            categoryLabel: "Jackets & Layers",
            icon: "🧥",
            searchTerm: "men navy blue slim fit formal blazer (Van Heusen OR Raymond OR Zara)",
            stylingReason: `A tailored navy blazer creates the definitive menswear grey-and-navy power pairing.`,
            recommendedColors: ["navy", "charcoal"]
          },
          {
            category: "accessories",
            categoryLabel: "Accessories",
            icon: "⌚",
            searchTerm: "men black leather analog minimalist watch (Titan OR Fossil)",
            stylingReason: `An understated analog dial maintains sleek executive polish.`,
            recommendedColors: ["black", "silver"]
          }
        ];
      } else if (style === "rugged") {
        // e.g. Blue Denim Jeans
        outfitTitle = "Classic Americana Rugged Look";
        overallStylingAdvice = `Denim calls for textured, durable layers. A checked flannel overshirt and leather chelsea boots deliver effortless, masculine character.`;
        styleArchetype = "Rugged Americana";
        colorHarmony = "Earthy Textured Contrast";
        silhouetteBalance = "Durable Structured Layering";
        pieces = [
          {
            category: "tops",
            categoryLabel: "Tops & Shirts",
            icon: "👕",
            searchTerm: "men red black checked cotton flannel casual shirt (Roadster OR Wrangler)",
            stylingReason: `A checked flannel shirt adds visual texture and rugged warmth against denim.`,
            recommendedColors: ["red", "black", "navy"]
          },
          {
            category: "shoes",
            categoryLabel: "Footwear",
            icon: "🥾",
            searchTerm: "men dark brown leather chelsea ankle boots (Woodland OR Red Tape)",
            stylingReason: `Sturdy leather chelsea boots seamlessly ground the jeans for all-day versatility.`,
            recommendedColors: ["brown", "tan"]
          },
          {
            category: "layering",
            categoryLabel: "Jackets & Layers",
            icon: "🧥",
            searchTerm: "men navy blue casual cotton overshirt jacket (Mast & Harbour OR H&M)",
            stylingReason: `A solid cotton overshirt provides an easy neutral contrast over the flannel.`,
            recommendedColors: ["navy", "olive"]
          },
          {
            category: "accessories",
            categoryLabel: "Accessories",
            icon: "⌚",
            searchTerm: "men tan brown braided genuine leather belt (Tommy Hilfiger OR Woodland)",
            stylingReason: `Rich tan leather hardware ties together the boots and waistband.`,
            recommendedColors: ["tan", "brown"]
          }
        ];
      } else {
        // Smart Casual default, e.g. Light Blue Chinos / Khakis
        outfitTitle = "Refined Smart-Casual Look";
        overallStylingAdvice = `Your ${item.primaryColor || "chino"} trousers provide a relaxed, versatile canvas. Pairing with a rich navy knitted polo and tan loafers creates an effortlessly sophisticated color block.`;
        styleArchetype = "Smart Casual";
        colorHarmony = "Complementary Contrast (Navy & Tan)";
        silhouetteBalance = "Refined Tapered Silhouette";
        pieces = [
          {
            category: "tops",
            categoryLabel: "Tops & Shirts",
            icon: "👕",
            searchTerm: "men navy blue solid knitted cotton polo t-shirt (Highlander OR Rare Rabbit OR H&M)",
            stylingReason: `A deep navy knitted polo creates high-contrast, polished sophistication against ${item.primaryColor || "light"} chinos.`,
            recommendedColors: ["navy", "white"]
          },
          {
            category: "shoes",
            categoryLabel: "Footwear",
            icon: "👟",
            searchTerm: "men classic tan brown leather casual loafers (Red Tape OR Hush Puppies)",
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
            searchTerm: "men tan brown braided genuine leather belt (Tommy Hilfiger OR H&M)",
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
        styleArchetype = "Modern Athleisure";
        colorHarmony = "Sporty Clean Neutrals";
        silhouetteBalance = "Cropped Waist with Relaxed Hem";
        pieces = [
          {
            category: "tops",
            categoryLabel: "Tops & Shirts",
            icon: "👚",
            searchTerm: "women white oversized graphic drop shoulder crop tee (Bonkers Corner OR H&M)",
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
            searchTerm: "women light blue cropped washed denim jacket (Vero Moda OR Levi's)",
            stylingReason: `A cropped denim jacket keeps the silhouette compact and modern.`,
            recommendedColors: ["light blue"]
          },
          {
            category: "accessories",
            categoryLabel: "Accessories",
            icon: "👜",
            searchTerm: "women structured black faux leather laptop tote bag (Lavie OR Baggit)",
            stylingReason: `A sleek faux-leather tote elevates casual street styling.`,
            recommendedColors: ["black"]
          }
        ];
      } else {
        // Women Smart / Formal / Chic (e.g. Beige Wide Leg Trousers)
        outfitTitle = "Contemporary Parisian Chic Look";
        overallStylingAdvice = `Wide-leg ${item.primaryColor || "beige"} trousers have an elegant fluid drape. Balancing them with a fitted black top and tailored blazer creates an elongated, poised silhouette.`;
        styleArchetype = "Contemporary Parisian Chic";
        colorHarmony = "Monochrome Grounding (Black & Nude)";
        silhouetteBalance = "Fluid Flared Drape with Fitted Top";
        pieces = [
          {
            category: "tops",
            categoryLabel: "Tops & Shirts",
            icon: "👚",
            searchTerm: "women black sleeveless ribbed high neck knit top (Zara OR H&M)",
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
            searchTerm: "women minimalist 18k gold plated layered chain hoop earrings (AccessHer OR Zaveri)",
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
    styleArchetype = "Refined Casual";
    colorHarmony = "Neutral Anchoring";
    silhouetteBalance = "Proportional Separates";
    pieces = [
      {
        category: "bottoms",
        categoryLabel: "Pants & Trousers",
        icon: "👖",
        searchTerm: gender === "men" ? "men beige slim fit stretch chino trousers (Highlander OR Zara)" : "women beige high waist wide leg straight trouser (Kotty OR Zara)",
        stylingReason: `Straight-fit neutral trousers anchor your ${item.title || "top"} without competing for attention.`,
        recommendedColors: ["beige", "navy", "black"]
      },
      {
        category: "shoes",
        categoryLabel: "Footwear",
        icon: "👟",
        searchTerm: gender === "men" ? "men minimalist white leather low top sneakers (Puma OR Comet)" : "women bata white chunky casual sneakers",
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
    styleArchetype = "Evening Occasion";
    colorHarmony = "Metallic Accents on Neutral Base";
    silhouetteBalance = "Elongated Single-Piece Line";
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
    styleArchetype = "Footwear-Anchored Style";
    colorHarmony = "Tonal Contrast";
    silhouetteBalance = "Clean Break Tailored Hem";
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
    styleArchetype = "Smart Casual";
    colorHarmony = "Harmonious Complementary Contrast";
    silhouetteBalance = "Volume-Balanced Proportion";
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
    styleArchetype,
    colorHarmony,
    silhouetteBalance,
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
  targetCategory = "",
  userPrefs = {}
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
    // 0. Mandatory Valid Image Guarantee:
    // Any product without an accessible, verified HTTPS thumbnail is excluded
    if (!hasValidImage(item)) {
      return false;
    }

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

    // 5. User Preferences: Avoided colors, hard exclusions, and avoided brands
    if (userPrefs.avoidColors && Array.isArray(userPrefs.avoidColors) && userPrefs.avoidColors.length > 0) {
      for (const color of userPrefs.avoidColors) {
        if (color && new RegExp(`\\b${color}\\b`, "i").test(title)) return false;
      }
    }
    if (userPrefs.hardExclusions && Array.isArray(userPrefs.hardExclusions) && userPrefs.hardExclusions.length > 0) {
      for (const excl of userPrefs.hardExclusions) {
        if (excl && new RegExp(`\\b${excl}\\b`, "i").test(title)) return false;
      }
    }
    if (userPrefs.avoidedBrands && Array.isArray(userPrefs.avoidedBrands) && userPrefs.avoidedBrands.length > 0) {
      const source = (item.source || "").toLowerCase();
      for (const brand of userPrefs.avoidedBrands) {
        if (brand && (title.includes(brand.toLowerCase()) || source.includes(brand.toLowerCase()))) return false;
      }
    }

    return true;
  });
}

/**
 * Main handler for /api/shopping/complete-look
 * Returns a complete coordinated outfit matching the ClothMatics AI Stylist experience.
 * Strictly caps every category to maximum 3 curated suggestions with guaranteed valid images.
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
  const serperApiKey = String(
    env.SERPER_API_KEY ||
    env.SERPER_KEY ||
    env.SERVER_DEV_API_KEY ||
    env.SERVER_API_KEY ||
    env.SERPER_DEV_API_KEY ||
    ""
  ).trim();
  const hasShoppingKey = Boolean(apiKey || serperApiKey);
  const geminiKey = String(env.GEMINI_API_KEY || "").trim();

  const rawGender = String(profile.gender || profile.shoppingProfile?.gender || "").toLowerCase();
  const isFemale = rawGender.includes("fem") || rawGender.includes("wom") || rawGender === "female";
  const gender = isFemale ? "women" : "men";
  const userSizes = getUserProfileSizes(profile);
  const userPrefs = getUserProfilePreferences(profile);

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

  // Fetch SerpApi / Serper in parallel for each piece's specific search term if shopping key is present
  let liveByPieceIndex = [];
  let isSample = false;
  let notice = "";

  if (hasShoppingKey) {
    try {
      const searchTasks = pieces.map(async (piece) => {
        const query = (piece.category === targetCategory && customQuery) ? customQuery : piece.searchTerm;
        try {
          const { items } = await fetchShoppingWithFallback({ query, gl, hl, env });
          return items
            .map((p, idx) => ({
              ...normalizeProduct(p, idx),
              category: piece.category,
              gender
            }))
            .filter(hasValidImage);
        } catch (err) {
          console.warn(`Shopping search error for ${piece.category}:`, err.message);
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
      console.warn("Shopping live request error:", error.message);
      isSample = true;
      notice = "Shopping provider is temporarily unavailable. Showing preview matches.";
    }
  } else {
    isSample = true;
    notice = "SerpApi API key not configured in Cloudflare environment yet (Serper.dev supported as fallback). Displaying sample products for preview.";
  }

  // Step 3: For each piece in the outfit, pool, filter, deduplicate, and strictly cap at maximum 3 products
  const outfitCategories = [];

  for (let i = 0; i < pieces.length; i++) {
    const piece = pieces[i];
    const liveForPiece = (liveByPieceIndex[i] || []).filter(hasValidImage);
    const sampleForPiece = sampleNormalized.filter((p) => p.category === piece.category && p.gender === gender && hasValidImage(p));

    // Candidates for this piece ONLY contain items matching this specific category with verified images!
    const candidatePool = [...liveForPiece, ...sampleForPiece];

    let catFiltered = filterProductsStrict({
      products: candidatePool,
      minPrice,
      maxPrice,
      allowAboveBudget,
      gender,
      anchorCategory: anchorDesc,
      targetCategory: piece.category,
      userPrefs
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
        targetCategory: piece.category,
        userPrefs
      });
    }

    // Deduplicate duplicate listings (e.g. size 46 vs 42) and prioritize user's size
    let deduplicated = deduplicateAndRankProducts(catFiltered, {
      userSizes,
      userPrefs,
      category: piece.category,
      anchorItem: item
    });

    // If budget or live search yielded fewer than 3 items, backfill from sampleForPiece
    if (deduplicated.length < 3) {
      const existingIds = new Set(deduplicated.map((p) => p.id || p.product_id));
      const needed = 3 - deduplicated.length;
      const backfills = sampleForPiece.filter((p) => !existingIds.has(p.id || p.product_id) && hasValidImage(p)).slice(0, needed);
      deduplicated = deduplicateAndRankProducts([...deduplicated, ...backfills], {
        userSizes,
        userPrefs,
        category: piece.category,
        anchorItem: item
      });
    }

    // Fallback: If still 0, use sampleForPiece directly
    if (deduplicated.length === 0 && sampleForPiece.length > 0) {
      deduplicated = deduplicateAndRankProducts(sampleForPiece, {
        userSizes,
        userPrefs,
        category: piece.category,
        anchorItem: item
      });
    }

    // STRICT CAPPING: Maximum 3 diverse products per category with item-specific styling rationale & guaranteed images!
    const diversePicks = pickDiverseProductSet(deduplicated, piece.category, 3);
    const capped = diversePicks.map((prod) => {
      const fallbackImg = getCategoryFallbackImage(piece.category, gender);
      const thumb = hasValidImage(prod) ? prod.thumbnail : fallbackImg;
      return {
        ...prod,
        thumbnail: thumb,
        image: thumb,
        stylingReason: createItemStylingReason(prod, piece, item, profile),
        category: piece.category,
        categoryLabel: piece.categoryLabel,
        icon: piece.icon
      };
    });

    outfitCategories.push({
      id: piece.category,
      label: piece.categoryLabel,
      icon: piece.icon,
      stylingReason: piece.stylingReason,
      searchTerm: piece.searchTerm,
      recommendedColors: piece.recommendedColors || [],
      targetSize: (piece.category === "tops" ? userSizes.top : piece.category === "bottoms" ? userSizes.bottom : piece.category === "shoes" ? userSizes.shoes : piece.category === "dresses" ? userSizes.dress : null),
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
      styleArchetype: stylingPlan.styleArchetype || "Smart Casual",
      colorHarmony: stylingPlan.colorHarmony || "Complementary Contrast",
      silhouetteBalance: stylingPlan.silhouetteBalance || "Volume-Balanced Proportion",
      userProfile: {
        sizes: userSizes,
        preferences: userPrefs
      },
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
