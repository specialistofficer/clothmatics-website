import { clean } from "../../_shared/firebase-rest.mjs";
import {
  normalizeProduct,
  fetchSerpApiShopping,
  fetchSerperShopping,
  fetchShoppingWithFallback,
  buildQueryLatticeFromIntent,
  fetchShoppingLattice
} from "./search.js";

function apiResponse(body, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      "Content-Type": "application/json",
      "Cache-Control": "no-store, no-cache, must-revalidate, proxy-revalidate, max-age=0",
      "Pragma": "no-cache",
      "Expires": "0",
      "Surrogate-Control": "no-store",
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
    rating: 4.4,
    reviews: 680,
    thumbnail: "https://images.unsplash.com/photo-1618354691373-d851c5c3a990?w=500&q=80",
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
    rating: 4.5,
    reviews: 1140,
    thumbnail: "https://images.unsplash.com/photo-1581655353564-df123a1eb820?w=500&q=80",
    delivery: "Free delivery",
    category: "tops",
    style: "smart_casual",
    gender: "men"
  },
  {
    id: "m_top_linen",
    position: 3,
    title: "Marks & Spencer Men Pure Linen Regular Fit Casual Shirt",
    product_id: "m_top_linen",
    product_link: "https://www.ajio.com/search/?text=Marks+and+Spencer+Men+Pure+Linen+Shirt",
    source: "AJIO.com",
    price: "₹1,799",
    extracted_price: 1799,
    old_price: "₹2,999",
    extracted_old_price: 2999,
    rating: 4.6,
    reviews: 840,
    thumbnail: "https://images.unsplash.com/photo-1603252109303-2751441dd157?w=500&q=80",
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
    rating: 4.3,
    reviews: 920,
    thumbnail: "https://images.unsplash.com/photo-1596755094514-f87e34085b2c?w=500&q=80",
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
    rating: 4.4,
    reviews: 510,
    thumbnail: "https://images.unsplash.com/photo-1578932750294-f5075e85f44a?w=500&q=80",
    delivery: "Free delivery",
    category: "tops",
    style: "rugged",
    gender: "men"
  },
  {
    id: "m_top_ecru_tee",
    position: 6,
    title: "Snitch Men Ecru Off-White Boxy Heavyweight Cotton T-Shirt",
    product_id: "m_top_ecru_tee",
    product_link: "https://www.amazon.in/s?k=Snitch+Men+Ecru+Boxy+Heavyweight+Tee",
    source: "Amazon.in",
    price: "₹799",
    extracted_price: 799,
    old_price: "₹1,499",
    extracted_old_price: 1499,
    rating: 4.6,
    reviews: 730,
    thumbnail: "https://images.unsplash.com/photo-1583743814966-8936f5b7be1a?w=500&q=80",
    delivery: "Free delivery",
    category: "tops",
    style: "streetwear",
    gender: "men"
  },
  {
    id: "m_top_crew_white",
    position: 7,
    title: "Puma Men Pure White Performance Crew Neck Athletic T-Shirt",
    product_id: "m_top_crew_white",
    product_link: "https://www.amazon.in/s?k=Puma+Men+White+Crew+Neck+Athletic+T-Shirt",
    source: "Amazon.in",
    price: "₹1,199",
    extracted_price: 1199,
    old_price: "₹1,999",
    extracted_old_price: 1999,
    rating: 4.5,
    reviews: 1240,
    thumbnail: "https://images.unsplash.com/photo-1521572267360-ee0c2909d518?w=500&q=80",
    delivery: "Free delivery",
    category: "tops",
    style: "athletic",
    gender: "men"
  },
  {
    id: "m_top_supima",
    position: 8,
    title: "Marks & Spencer Men Charcoal Grey Premium Supima Cotton T-Shirt",
    product_id: "m_top_supima",
    product_link: "https://www.ajio.com/search/?text=Marks+Spencer+Men+Charcoal+Supima+T-Shirt",
    source: "AJIO.com",
    price: "₹1,299",
    extracted_price: 1299,
    old_price: "₹1,999",
    extracted_old_price: 1999,
    rating: 4.6,
    reviews: 890,
    thumbnail: "https://images.unsplash.com/photo-1503342217505-b0a15ec3261c?w=501&q=80",
    delivery: "Free delivery",
    category: "tops",
    style: "smart_casual",
    gender: "men"
  },

  // -------------------------------------------------------------
  // MEN BOTTOMS (for Tops / Shoes / Layering anchors)
  // -------------------------------------------------------------
  {
    id: "m_bot_cargo",
    position: 7,
    title: "Campus Sutra Men Black Baggy Relaxed Utility Cargo Pants",
    product_id: "m_bot_cargo",
    product_link: "https://www.amazon.in/s?k=Campus+Sutra+Men+Black+Baggy+Relaxed+Cargo+Pants",
    source: "Amazon.in",
    price: "₹999",
    extracted_price: 999,
    old_price: "₹2,199",
    extracted_old_price: 2199,
    rating: 4.3,
    reviews: 490,
    thumbnail: "https://images.unsplash.com/photo-1624378439575-d8705ad7ae80?w=500&q=80",
    delivery: "Free delivery by Tomorrow",
    category: "bottoms",
    style: "streetwear",
    gender: "men"
  },
  {
    id: "m_bot_olive_cargo",
    position: 8,
    title: "Snitch Men Dark Olive Relaxed Utility Cargo Trousers",
    product_id: "m_bot_olive_cargo",
    product_link: "https://www.amazon.in/s?k=Snitch+Men+Olive+Relaxed+Cargo+Trousers",
    source: "Amazon.in",
    price: "₹1,199",
    extracted_price: 1199,
    old_price: "₹2,499",
    extracted_old_price: 2499,
    rating: 4.5,
    reviews: 820,
    thumbnail: "https://images.unsplash.com/photo-1517445312882-bc9910d016b7?w=500&q=80",
    delivery: "Free delivery",
    category: "bottoms",
    style: "streetwear",
    gender: "men"
  },
  {
    id: "m_bot_chino",
    position: 9,
    title: "Highlander Men Beige Slim Fit Stretch Chino Trousers",
    product_id: "m_bot_chino",
    product_link: "https://www.google.com/search?tbm=shop&q=buy+Highlander+Men+Beige+Slim+Fit+Chinos+myntra",
    source: "Myntra",
    price: "₹749",
    extracted_price: 749,
    old_price: "₹1,699",
    extracted_old_price: 1699,
    rating: 4.4,
    reviews: 1350,
    thumbnail: "https://images.unsplash.com/photo-1473966968600-fa801b869a1a?w=500&q=80",
    delivery: "Free delivery",
    category: "bottoms",
    style: "smart_casual",
    gender: "men"
  },
  {
    id: "m_bot_formal",
    position: 10,
    title: "Peter England Men Charcoal Grey Slim Fit Formal Trousers",
    product_id: "m_bot_formal",
    product_link: "https://www.amazon.in/s?k=Peter+England+Men+Charcoal+Grey+Formal+Trousers",
    source: "Amazon.in",
    price: "₹1,099",
    extracted_price: 1099,
    old_price: "₹2,299",
    extracted_old_price: 2299,
    rating: 4.5,
    reviews: 780,
    thumbnail: "https://images.unsplash.com/photo-1594938298603-c8148c4dae35?w=500&q=80",
    delivery: "Free delivery",
    category: "bottoms",
    style: "formal",
    gender: "men"
  },
  {
    id: "m_bot_jean",
    position: 11,
    title: "Levi's Men 511 Slim Fit Dark Indigo Stretch Jeans",
    product_id: "m_bot_jean",
    product_link: "https://www.ajio.com/search/?text=Levis+Men+511+Slim+Fit+Dark+Indigo+Jeans",
    source: "AJIO.com",
    price: "₹1,899",
    extracted_price: 1899,
    old_price: "₹3,799",
    extracted_old_price: 3799,
    rating: 4.6,
    reviews: 1420,
    thumbnail: "https://images.unsplash.com/photo-1541099649105-f69ad21f3246?w=500&q=80",
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
    position: 12,
    title: "Puma Men White Rebound Layup Minimalist Sneakers",
    product_id: "m_shoe_minimal",
    product_link: "https://www.amazon.in/s?k=Puma+Men+White+Rebound+Layup+Sneakers",
    source: "Amazon.in",
    price: "₹1,899",
    extracted_price: 1899,
    old_price: "₹3,999",
    extracted_old_price: 3999,
    rating: 4.5,
    reviews: 1680,
    thumbnail: "https://images.unsplash.com/photo-1549298916-b41d501d3772?w=500&q=80",
    delivery: "Free delivery",
    category: "shoes",
    style: "smart_casual",
    gender: "men"
  },
  {
    id: "m_shoe_skate",
    position: 13,
    title: "Comet Men Retro Low-Top Chunky Skate Sneakers - Black & White",
    product_id: "m_shoe_skate",
    product_link: "https://www.amazon.in/s?k=Comet+Men+Retro+Low+Top+Chunky+Skate+Sneakers",
    source: "Amazon.in",
    price: "₹1,999",
    extracted_price: 1999,
    old_price: "₹3,999",
    extracted_old_price: 3999,
    rating: 4.6,
    reviews: 940,
    thumbnail: "https://images.unsplash.com/photo-1525966222134-fcfa99b8ae77?w=500&q=80",
    delivery: "Free delivery",
    category: "shoes",
    style: "streetwear",
    gender: "men"
  },
  {
    id: "m_shoe_loafer",
    position: 14,
    title: "Red Tape Men Classic Tan Brown Leather Casual Loafers",
    product_id: "m_shoe_loafer",
    product_link: "https://www.amazon.in/s?k=Red+Tape+Men+Classic+Tan+Brown+Leather+Casual+Loafers",
    source: "Amazon.in",
    price: "₹1,499",
    extracted_price: 1499,
    old_price: "₹4,299",
    extracted_old_price: 4299,
    rating: 4.3,
    reviews: 620,
    thumbnail: "https://images.unsplash.com/photo-1533867617858-e7b97e060509?w=500&q=80",
    delivery: "Free delivery",
    category: "shoes",
    style: "smart_casual",
    gender: "men"
  },
  {
    id: "m_shoe_boot",
    position: 15,
    title: "Woodland Men Dark Brown Leather Chelsea Ankle Boots",
    product_id: "m_shoe_boot",
    product_link: "https://www.tatacliq.com/search/?searchCategory=all&text=Woodland+Men+Dark+Brown+Leather+Chelsea+Boots",
    source: "Tata CLiQ",
    price: "₹2,995",
    extracted_price: 2995,
    old_price: "₹4,995",
    extracted_old_price: 4995,
    rating: 4.7,
    reviews: 1180,
    thumbnail: "https://images.unsplash.com/photo-1608256246200-53e635b5b65f?w=500&q=80",
    delivery: "Free delivery",
    category: "shoes",
    style: "rugged",
    gender: "men"
  },
  {
    id: "m_shoe_runner",
    position: 16,
    title: "Asics Men Black & White Lightweight Gel Running Sneakers",
    product_id: "m_shoe_runner",
    product_link: "https://www.amazon.in/s?k=Asics+Men+Black+Lightweight+Running+Sneakers",
    source: "Amazon.in",
    price: "₹1,799",
    extracted_price: 1799,
    old_price: "₹3,499",
    extracted_old_price: 3499,
    rating: 4.6,
    reviews: 1420,
    thumbnail: "https://images.unsplash.com/photo-1542291026-7eec264c27ff?w=500&q=80",
    delivery: "Free delivery",
    category: "shoes",
    style: "athletic",
    gender: "men"
  },
  {
    id: "m_shoe_court",
    position: 17,
    title: "Adidas Men Advantage Clean White Low Court Sneakers",
    product_id: "m_shoe_court",
    product_link: "https://www.amazon.in/s?k=Adidas+Men+Advantage+Clean+White+Court+Sneakers",
    source: "Amazon.in",
    price: "₹1,899",
    extracted_price: 1899,
    old_price: "₹3,999",
    extracted_old_price: 3999,
    rating: 4.5,
    reviews: 1980,
    thumbnail: "https://images.unsplash.com/photo-1600185365926-3a2ce3cdb9eb?w=500&q=80",
    delivery: "Free delivery",
    category: "shoes",
    style: "smart_casual",
    gender: "men"
  },

  // -------------------------------------------------------------
  // MEN LAYERING
  // -------------------------------------------------------------
  {
    id: "m_layer_overshirt",
    position: 16,
    title: "Mast & Harbour Men Navy Blue Casual Cotton Overshirt Jacket",
    product_id: "m_layer_overshirt",
    product_link: "https://www.google.com/search?tbm=shop&q=buy+Mast+Harbour+Men+Navy+Blue+Casual+Overshirt+Jacket+myntra",
    source: "Myntra",
    price: "₹1,299",
    extracted_price: 1299,
    old_price: "₹2,799",
    extracted_old_price: 2799,
    rating: 4.4,
    reviews: 580,
    thumbnail: "https://images.unsplash.com/photo-1617137984095-74e4e5e3613f?w=500&q=80",
    delivery: "Free delivery",
    category: "layering",
    style: "smart_casual",
    gender: "men"
  },
  {
    id: "m_layer_bomber",
    position: 17,
    title: "Campus Sutra Men Black Lightweight Utility Bomber Jacket",
    product_id: "m_layer_bomber",
    product_link: "https://www.amazon.in/s?k=Campus+Sutra+Men+Black+Lightweight+Bomber+Jacket",
    source: "Amazon.in",
    price: "₹1,199",
    extracted_price: 1199,
    old_price: "₹2,699",
    extracted_old_price: 2699,
    rating: 4.3,
    reviews: 430,
    thumbnail: "https://images.unsplash.com/photo-1544441893-675973e31985?w=500&q=80",
    delivery: "Free delivery",
    category: "layering",
    style: "streetwear",
    gender: "men"
  },
  {
    id: "m_layer_blazer",
    position: 18,
    title: "Van Heusen Men Navy Blue Slim Fit Structured Formal Blazer",
    product_id: "m_layer_blazer",
    product_link: "https://www.tatacliq.com/search/?searchCategory=all&text=Van+Heusen+Men+Navy+Blue+Formal+Blazer",
    source: "Tata CLiQ",
    price: "₹3,499",
    extracted_price: 3499,
    old_price: "₹6,999",
    extracted_old_price: 6999,
    rating: 4.6,
    reviews: 860,
    thumbnail: "https://images.unsplash.com/photo-1507679799987-c73779587ccf?w=500&q=80",
    delivery: "Free delivery",
    category: "layering",
    style: "formal",
    gender: "men"
  },
  {
    id: "m_layer_beige_chore",
    position: 19,
    title: "Zara Men Beige Relaxed Fit Cotton Chore Overshirt",
    product_id: "m_layer_beige_chore",
    product_link: "https://www.amazon.in/s?k=Zara+Men+Beige+Relaxed+Cotton+Chore+Overshirt",
    source: "Amazon.in",
    price: "₹2,290",
    extracted_price: 2290,
    old_price: "₹4,590",
    extracted_old_price: 4590,
    rating: 4.5,
    reviews: 410,
    thumbnail: "https://images.unsplash.com/photo-1591047139829-d91aecb6caea?w=500&q=80",
    delivery: "Free delivery",
    category: "layering",
    style: "smart_casual",
    gender: "men"
  },

  // -------------------------------------------------------------
  // MEN ACCESSORIES
  // -------------------------------------------------------------
  {
    id: "m_acc_formal",
    position: 20,
    title: "Titan Men Black Leather Analog Minimalist Watch",
    product_id: "m_acc_formal",
    product_link: "https://www.tatacliq.com/search/?searchCategory=all&text=Titan+Men+Black+Leather+Watch",
    source: "Tata CLiQ",
    price: "₹1,995",
    extracted_price: 1995,
    old_price: "₹2,495",
    extracted_old_price: 2495,
    rating: 4.6,
    reviews: 1450,
    thumbnail: "https://images.unsplash.com/photo-1524805444758-089113d48a6d?w=500&q=80",
    delivery: "Free delivery",
    category: "accessories",
    style: "formal",
    gender: "men"
  },
  {
    id: "m_acc_tactical",
    position: 21,
    title: "Fastrack Men Matte Black Digital Tactical Sports Watch",
    product_id: "m_acc_tactical",
    product_link: "https://www.amazon.in/s?k=Fastrack+Men+Matte+Black+Digital+Sports+Watch",
    source: "Amazon.in",
    price: "₹1,295",
    extracted_price: 1295,
    old_price: "₹1,795",
    extracted_old_price: 1795,
    rating: 4.4,
    reviews: 890,
    thumbnail: "https://images.unsplash.com/photo-1508685096489-7aacd43bd3b1?w=500&q=80",
    delivery: "Free delivery",
    category: "accessories",
    style: "streetwear",
    gender: "men"
  },
  {
    id: "m_acc_belt",
    position: 22,
    title: "Tommy Hilfiger Men Tan Brown Braided Genuine Leather Belt",
    product_id: "m_acc_belt",
    product_link: "https://www.amazon.in/s?k=Tommy+Hilfiger+Men+Tan+Brown+Braided+Leather+Belt",
    source: "Amazon.in",
    price: "₹1,199",
    extracted_price: 1199,
    old_price: "₹1,999",
    extracted_old_price: 1999,
    rating: 4.5,
    reviews: 640,
    thumbnail: "https://images.unsplash.com/photo-1624222247344-550fb60583dc?w=500&q=80",
    delivery: "Free delivery",
    category: "accessories",
    style: "smart_casual",
    gender: "men"
  },
  {
    id: "m_acc_shades",
    position: 23,
    title: "Vincent Chase Men Polarized Classic Aviator Sunglasses",
    product_id: "m_acc_shades",
    product_link: "https://www.amazon.in/s?k=Vincent+Chase+Men+Polarized+Classic+Aviator+Sunglasses",
    source: "Amazon.in",
    price: "₹1,199",
    extracted_price: 1199,
    old_price: "₹1,999",
    extracted_old_price: 1999,
    rating: 4.4,
    reviews: 950,
    thumbnail: "https://images.unsplash.com/photo-1511499767150-a48a237f0083?w=500&q=80",
    delivery: "Free delivery",
    category: "accessories",
    style: "smart_casual",
    gender: "men"
  },
  {
    id: "m_acc_bag",
    position: 24,
    title: "Wildcraft Men Black Urban Utility Crossbody Sling Bag",
    product_id: "m_acc_bag",
    product_link: "https://www.amazon.in/s?k=Wildcraft+Men+Black+Crossbody+Sling+Bag",
    source: "Amazon.in",
    price: "₹1,149",
    extracted_price: 1149,
    old_price: "₹1,899",
    extracted_old_price: 1899,
    rating: 4.5,
    reviews: 780,
    thumbnail: "https://images.unsplash.com/photo-1553062407-98eeb64c6a62?w=501&q=80",
    delivery: "Free delivery",
    category: "accessories",
    style: "streetwear",
    gender: "men"
  },
  {
    id: "m_acc_leather_belt",
    position: 25,
    title: "Woodland Men Dark Brown Genuine Leather Rugged Casual Belt",
    product_id: "m_acc_leather_belt",
    product_link: "https://www.tatacliq.com/search/?searchCategory=all&text=Woodland+Men+Dark+Brown+Leather+Belt",
    source: "Tata CLiQ",
    price: "₹1,299",
    extracted_price: 1299,
    old_price: "₹2,495",
    extracted_old_price: 2495,
    rating: 4.6,
    reviews: 820,
    thumbnail: "https://images.unsplash.com/photo-1624222247344-550fb60583dc?w=501&q=80",
    delivery: "Free delivery",
    category: "accessories",
    style: "rugged",
    gender: "men"
  },
  {
    id: "m_acc_sports_cap",
    position: 26,
    title: "Puma Men Black Adjustable Moisture-Wicking Running Sports Cap",
    product_id: "m_acc_sports_cap",
    product_link: "https://www.amazon.in/s?k=Puma+Men+Black+Adjustable+Running+Sports+Cap",
    source: "Amazon.in",
    price: "₹899",
    extracted_price: 899,
    old_price: "₹1,499",
    extracted_old_price: 1499,
    rating: 4.4,
    reviews: 610,
    thumbnail: "https://images.unsplash.com/photo-1588850561407-ed78c282e89b?w=500&q=80",
    delivery: "Free delivery",
    category: "accessories",
    style: "athletic",
    gender: "men"
  },

  // -------------------------------------------------------------
  // WOMEN TOPS
  // -------------------------------------------------------------
  {
    id: "w_top_formal",
    position: 24,
    title: "Tokyo Talkies Women White Regular Fit Solid Formal Shirt",
    product_id: "w_top_formal",
    product_link: "https://www.google.com/search?tbm=shop&q=buy+Tokyo+Talkies+Women+White+Regular+Fit+Solid+Formal+Shirt+myntra",
    source: "Myntra",
    price: "₹499",
    extracted_price: 499,
    old_price: "₹1,199",
    extracted_old_price: 1199,
    rating: 4.4,
    reviews: 720,
    thumbnail: "https://images.unsplash.com/photo-1598554747436-c9293d6a588f?w=500&q=80",
    delivery: "Free delivery",
    category: "tops",
    style: "smart_casual",
    gender: "women"
  },
  {
    id: "w_top_rib",
    position: 25,
    title: "Zara Women Black Sleeveless Ribbed High-Neck Knit Top",
    product_id: "w_top_rib",
    product_link: "https://www.ajio.com/search/?text=Zara+Women+Black+Sleeveless+Ribbed+Top",
    source: "AJIO.com",
    price: "₹690",
    extracted_price: 690,
    old_price: "₹1,290",
    extracted_old_price: 1290,
    rating: 4.6,
    reviews: 980,
    thumbnail: "https://images.unsplash.com/photo-1503342217505-b0a15ec3261c?w=500&q=80",
    delivery: "Free delivery",
    category: "tops",
    style: "formal",
    gender: "women"
  },
  {
    id: "w_top_crop",
    position: 26,
    title: "Bonkers Corner Women White Oversized Graphic Drop-Shoulder Crop Tee",
    product_id: "w_top_crop",
    product_link: "https://www.amazon.in/s?k=Bonkers+Corner+Women+White+Oversized+Graphic+Crop+Tee",
    source: "Amazon.in",
    price: "₹599",
    extracted_price: 599,
    old_price: "₹1,299",
    extracted_old_price: 1299,
    rating: 4.5,
    reviews: 840,
    thumbnail: "https://images.unsplash.com/photo-1529139574466-a303027c1d8b?w=500&q=80",
    delivery: "Free delivery",
    category: "tops",
    style: "streetwear",
    gender: "women"
  },
  {
    id: "w_top_wrap",
    position: 27,
    title: "ONLY Women Beige Ribbed Long Sleeve Fitted Knit Top",
    product_id: "w_top_wrap",
    product_link: "https://www.ajio.com/search/?text=ONLY+Women+Beige+Ribbed+Long+Sleeve+Top",
    source: "AJIO.com",
    price: "₹799",
    extracted_price: 799,
    old_price: "₹1,699",
    extracted_old_price: 1699,
    rating: 4.3,
    reviews: 490,
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
    position: 28,
    title: "KOTTY Women's Beige High Waist Wide Leg Straight Trouser",
    product_id: "w_bot_beige",
    product_link: "https://www.amazon.in/s?k=KOTTY+Womens+Beige+High+Waist+Wide+Leg+Straight+Trouser",
    source: "Amazon.in",
    price: "₹470",
    extracted_price: 470,
    old_price: "₹1,000",
    extracted_old_price: 1000,
    rating: 4.4,
    reviews: 1560,
    thumbnail: "https://images.unsplash.com/photo-1506629082955-511b1aa562c8?w=500&q=80",
    delivery: "Free delivery",
    category: "bottoms",
    style: "smart_casual",
    gender: "women"
  },
  {
    id: "w_bot_black",
    position: 29,
    title: "Kotty Women Black High-Rise Flared Stretch Trousers",
    product_id: "w_bot_black",
    product_link: "https://www.amazon.in/s?k=Kotty+Women+Black+High+Rise+Flared+Trousers",
    source: "Amazon.in",
    price: "₹599",
    extracted_price: 599,
    old_price: "₹1,499",
    extracted_old_price: 1499,
    rating: 4.5,
    reviews: 1220,
    thumbnail: "https://images.unsplash.com/photo-1551854838-212c50b4c184?w=500&q=80",
    delivery: "Free delivery",
    category: "bottoms",
    style: "formal",
    gender: "women"
  },
  {
    id: "w_bot_denim",
    position: 30,
    title: "Levi's Women 721 High Rise Dark Wash Skinny Stretch Jeans",
    product_id: "w_bot_denim",
    product_link: "https://www.amazon.in/s?k=Levis+Women+721+High+Rise+Dark+Wash+Jeans",
    source: "Amazon.in",
    price: "₹1,899",
    extracted_price: 1899,
    old_price: "₹3,999",
    extracted_old_price: 3999,
    rating: 4.6,
    reviews: 1740,
    thumbnail: "https://images.unsplash.com/photo-1582418702059-97ebafb35d09?w=500&q=80",
    delivery: "Free delivery",
    category: "bottoms",
    style: "casual",
    gender: "women"
  },
  {
    id: "w_bot_skirt",
    position: 31,
    title: "H&M Women Black Pleated A-Line High Waist Midi Skirt",
    product_id: "w_bot_skirt",
    product_link: "https://www.google.com/search?tbm=shop&q=buy+HM+Women+Black+Pleated+Midi+Skirt",
    source: "Myntra",
    price: "₹1,299",
    extracted_price: 1299,
    old_price: "₹2,299",
    extracted_old_price: 2299,
    rating: 4.4,
    reviews: 630,
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
    position: 32,
    title: "Bata Women White Chunky Casual Sneakers",
    product_id: "w_shoe_sneaker",
    product_link: "https://www.amazon.in/s?k=Bata+Women+White+Chunky+Casual+Sneakers",
    source: "Amazon.in",
    price: "₹1,299",
    extracted_price: 1299,
    old_price: "₹1,999",
    extracted_old_price: 1999,
    rating: 4.5,
    reviews: 1380,
    thumbnail: "https://images.unsplash.com/photo-1584735935682-2f2b69dff9d2?w=500&q=80",
    delivery: "Free delivery",
    category: "shoes",
    style: "streetwear",
    gender: "women"
  },
  {
    id: "w_shoe_heels",
    position: 33,
    title: "Carlton London Women Nude Pointed-Toe Block Heels",
    product_id: "w_shoe_heels",
    product_link: "https://www.google.com/search?tbm=shop&q=buy+Carlton+London+Women+Nude+Pointed+Block+Heels+myntra",
    source: "Myntra",
    price: "₹1,495",
    extracted_price: 1495,
    old_price: "₹2,995",
    extracted_old_price: 2995,
    rating: 4.6,
    reviews: 890,
    thumbnail: "https://images.unsplash.com/photo-1543163521-1bf539c55dd2?w=500&q=80",
    delivery: "Free delivery",
    category: "shoes",
    style: "formal",
    gender: "women"
  },
  {
    id: "w_shoe_loafer",
    position: 34,
    title: "Carlton London Women Black Chunky Lug-Sole Loafers",
    product_id: "w_shoe_loafer",
    product_link: "https://www.ajio.com/search/?text=Carlton+London+Women+Black+Chunky+Lug+Sole+Loafers",
    source: "AJIO.com",
    price: "₹1,695",
    extracted_price: 1695,
    old_price: "₹3,295",
    extracted_old_price: 3295,
    rating: 4.4,
    reviews: 540,
    thumbnail: "https://images.unsplash.com/photo-1595950653106-6c9ebd614d3a?w=500&q=80",
    delivery: "Free delivery",
    category: "shoes",
    style: "smart_casual",
    gender: "women"
  },
  {
    id: "w_shoe_pumps",
    position: 35,
    title: "DressBerry Women Classic Black Pointed-Toe Stiletto Pumps",
    product_id: "w_shoe_pumps",
    product_link: "https://www.amazon.in/s?k=DressBerry+Women+Classic+Black+Pointed+Toe+Pumps",
    source: "Amazon.in",
    price: "₹1,399",
    extracted_price: 1399,
    old_price: "₹2,799",
    extracted_old_price: 2799,
    rating: 4.3,
    reviews: 710,
    thumbnail: "https://images.unsplash.com/photo-1535043934128-cf0b28d52f95?w=500&q=80",
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
    position: 36,
    title: "Marks & Spencer Women Beige Double-Breasted Relaxed Blazer",
    product_id: "w_layer_blazer",
    product_link: "https://www.ajio.com/search/?text=Marks+and+Spencer+Women+Beige+Relaxed+Blazer",
    source: "AJIO.com",
    price: "₹2,999",
    extracted_price: 2999,
    old_price: "₹5,999",
    extracted_old_price: 5999,
    rating: 4.7,
    reviews: 920,
    thumbnail: "https://images.unsplash.com/photo-1554412933-514a83d2f3c8?w=500&q=80",
    delivery: "Free delivery",
    category: "layering",
    style: "formal",
    gender: "women"
  },
  {
    id: "w_layer_denim",
    position: 37,
    title: "Vero Moda Women Light Blue Cropped Washed Denim Jacket",
    product_id: "w_layer_denim",
    product_link: "https://www.amazon.in/s?k=Vero+Moda+Women+Cropped+Denim+Jacket",
    source: "Amazon.in",
    price: "₹1,599",
    extracted_price: 1599,
    old_price: "₹3,499",
    extracted_old_price: 3499,
    rating: 4.4,
    reviews: 810,
    thumbnail: "https://images.unsplash.com/photo-1523381294911-8d3cead13475?w=500&q=80",
    delivery: "Free delivery",
    category: "layering",
    style: "casual",
    gender: "women"
  },
  {
    id: "w_layer_cardigan",
    position: 38,
    title: "Marks & Spencer Women Cream Ribbed Soft Knit Cardigan",
    product_id: "w_layer_cardigan",
    product_link: "https://www.ajio.com/search/?text=Marks+and+Spencer+Women+Cream+Ribbed+Knit+Cardigan",
    source: "AJIO.com",
    price: "₹1,999",
    extracted_price: 1999,
    old_price: "₹3,999",
    extracted_old_price: 3999,
    rating: 4.5,
    reviews: 640,
    thumbnail: "https://images.unsplash.com/photo-1434389677669-e08b4cac3105?w=500&q=80",
    delivery: "Free delivery",
    category: "layering",
    style: "smart_casual",
    gender: "women"
  },
  {
    id: "w_layer_trench",
    position: 39,
    title: "Mango Women Classic Double-Breasted Tailored Crepe Shrug",
    product_id: "w_layer_trench",
    product_link: "https://www.google.com/search?tbm=shop&q=buy+Mango+Women+Tailored+Crepe+Shrug+myntra",
    source: "Myntra",
    price: "₹2,490",
    extracted_price: 2490,
    old_price: "₹4,990",
    extracted_old_price: 4990,
    rating: 4.5,
    reviews: 580,
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
    position: 40,
    title: "Lavie Women Structured Black Faux Leather Laptop Tote Bag",
    product_id: "w_acc_tote",
    product_link: "https://www.ajio.com/search/?text=Lavie+Women+Structured+Black+Tote+Bag",
    source: "AJIO.com",
    price: "₹1,499",
    extracted_price: 1499,
    old_price: "₹3,499",
    extracted_old_price: 3499,
    rating: 4.6,
    reviews: 1840,
    thumbnail: "https://images.unsplash.com/photo-1584917865442-de89df76afd3?w=500&q=80",
    delivery: "Free delivery",
    category: "accessories",
    style: "formal",
    gender: "women"
  },
  {
    id: "w_acc_gold",
    position: 41,
    title: "AccessHer Minimalist 18K Gold Plated Layered Chain & Hoop Earrings",
    product_id: "w_acc_gold",
    product_link: "https://www.amazon.in/s?k=AccessHer+Minimalist+Gold+Plated+Layered+Chain+Earrings",
    source: "Amazon.in",
    price: "₹499",
    extracted_price: 499,
    old_price: "₹1,299",
    extracted_old_price: 1299,
    rating: 4.4,
    reviews: 970,
    thumbnail: "https://images.unsplash.com/photo-1535632066927-ab7c9ab60908?w=500&q=80",
    delivery: "Free delivery",
    category: "accessories",
    style: "smart_casual",
    gender: "women"
  },
  {
    id: "w_acc_clutch",
    position: 42,
    title: "Baggit Women Rose Gold Metallic Evening Box Clutch",
    product_id: "w_acc_clutch",
    product_link: "https://www.amazon.in/s?k=Baggit+Women+Rose+Gold+Metallic+Evening+Box+Clutch",
    source: "Amazon.in",
    price: "₹990",
    extracted_price: 990,
    old_price: "₹1,990",
    extracted_old_price: 1990,
    rating: 4.5,
    reviews: 730,
    thumbnail: "https://images.unsplash.com/photo-1566150905458-1bf1fc113f0d?w=500&q=80",
    delivery: "Free delivery",
    category: "accessories",
    style: "formal",
    gender: "women"
  },
  {
    id: "w_acc_belt",
    position: 43,
    title: "Ginger by Lifestyle Women Tan Brown Classic Faux Leather Belt",
    product_id: "w_acc_belt",
    product_link: "https://www.amazon.in/s?k=Ginger+by+Lifestyle+Women+Tan+Brown+Classic+Belt",
    source: "Amazon.in",
    price: "₹399",
    extracted_price: 399,
    old_price: "₹799",
    extracted_old_price: 799,
    rating: 4.3,
    reviews: 520,
    thumbnail: "https://images.unsplash.com/photo-1553062407-98eeb64c6a62?w=500&q=80",
    delivery: "Free delivery",
    category: "accessories",
    style: "smart_casual",
    gender: "women"
  },
  {
    id: "w_acc_watch",
    position: 44,
    title: "Titan Raga Women Rose Gold Mother of Pearl Dial Analog Watch",
    product_id: "w_acc_watch",
    product_link: "https://www.tatacliq.com/search/?searchCategory=all&text=Titan+Raga+Women+Rose+Gold+Watch",
    source: "Tata CLiQ",
    price: "₹1,995",
    extracted_price: 1995,
    old_price: "₹2,995",
    extracted_old_price: 2995,
    rating: 4.7,
    reviews: 1350,
    thumbnail: "https://images.unsplash.com/photo-1524805444758-089113d48a6d?w=502&q=80",
    delivery: "Free delivery",
    category: "accessories",
    style: "formal",
    gender: "women"
  },
  {
    id: "w_acc_shades",
    position: 45,
    title: "Vincent Chase Women Oversized Gradient UV Protected Sunglasses",
    product_id: "w_acc_shades",
    product_link: "https://www.amazon.in/s?k=Vincent+Chase+Women+Oversized+Gradient+Sunglasses",
    source: "Amazon.in",
    price: "₹1,199",
    extracted_price: 1199,
    old_price: "₹1,999",
    extracted_old_price: 1999,
    rating: 4.5,
    reviews: 860,
    thumbnail: "https://images.unsplash.com/photo-1511499767150-a48a237f0083?w=502&q=80",
    delivery: "Free delivery",
    category: "accessories",
    style: "smart_casual",
    gender: "women"
  }
];

export function detectAnchorStyle(item = {}) {
  const text = `${item.title || ""} ${item.category || ""} ${item.subCategory || ""} ${item.fit || ""} ${item.material || ""}`.toLowerCase();
  if (/cargo|jogger|baggy|oversize|parachute|street|skate|utility|combat|hoodie|graphic|track|athlet|sport|gym|workout|windbreak|performance/i.test(text)) {
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

export function getGarmentSeed(item = {}) {
  const str = `${item.id || ""}_${item.title || ""}_${item.primaryColor || ""}_${item.category || ""}_${item.subCategory || ""}`;
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    hash = ((hash << 5) - hash) + str.charCodeAt(i);
    hash |= 0;
  }
  return Math.abs(hash);
}

/**
 * Normalizes styling piece intent to a guaranteed structured object.
 */
export function normalizePieceIntent(piece = {}, gender = "men") {
  const g = String(gender || "men").toLowerCase() === "women" ? "women" : "men";
  const cat = String(piece.category || "").toLowerCase();
  const rawIntent = piece.intent && typeof piece.intent === "object" ? piece.intent : {};

  let subtypes = Array.isArray(rawIntent.subtypes) && rawIntent.subtypes.length > 0
    ? rawIntent.subtypes.map((s) => String(s).trim()).filter(Boolean)
    : [];

  if (subtypes.length === 0) {
    if (piece.searchTerm) {
      const lower = String(piece.searchTerm).toLowerCase();
      if (/sneaker/i.test(lower)) subtypes.push("sneaker");
      else if (/loafer/i.test(lower)) subtypes.push("loafer");
      else if (/boot/i.test(lower)) subtypes.push("boot");
      else if (/polo/i.test(lower)) subtypes.push("polo");
      else if (/shirt/i.test(lower)) subtypes.push("shirt");
      else if (/t-shirt|tee/i.test(lower)) subtypes.push("t-shirt");
      else if (/cargo/i.test(lower)) subtypes.push("cargo pants");
      else if (/chino/i.test(lower)) subtypes.push("chino pants");
      else if (/trouser/i.test(lower)) subtypes.push("trousers");
      else if (/jean/i.test(lower)) subtypes.push("jeans");
      else if (/watch/i.test(lower)) subtypes.push("watch");
      else if (/belt/i.test(lower)) subtypes.push("belt");
      else if (/sunglass|aviator|shades/i.test(lower)) subtypes.push("sunglasses");
      else if (/bag|sling/i.test(lower)) subtypes.push("bag");
      else subtypes.push(cat || "item");
    } else {
      subtypes.push(cat || "item");
    }
  }

  const allowedColors = Array.isArray(rawIntent.allowedColors) && rawIntent.allowedColors.length > 0
    ? rawIntent.allowedColors.map((c) => String(c).trim()).filter(Boolean)
    : (Array.isArray(piece.recommendedColors) && piece.recommendedColors.length > 0
        ? piece.recommendedColors.map((c) => String(c).trim()).filter(Boolean)
        : []);

  const excludedColors = Array.isArray(rawIntent.excludedColors)
    ? rawIntent.excludedColors.map((c) => String(c).trim()).filter(Boolean)
    : [];

  const fitOrShape = Array.isArray(rawIntent.fitOrShape)
    ? rawIntent.fitOrShape.map((f) => String(f).trim()).filter(Boolean)
    : [];

  const materials = Array.isArray(rawIntent.materials)
    ? rawIntent.materials.map((m) => String(m).trim()).filter(Boolean)
    : [];

  const styleTags = Array.isArray(rawIntent.styleTags)
    ? rawIntent.styleTags.map((s) => String(s).trim()).filter(Boolean)
    : [];

  const mustHaveTerms = Array.isArray(rawIntent.mustHaveTerms) && rawIntent.mustHaveTerms.length > 0
    ? rawIntent.mustHaveTerms.map((t) => String(t).trim()).filter(Boolean)
    : [g, subtypes[0] || cat];

  const excludeTerms = Array.isArray(rawIntent.excludeTerms)
    ? rawIntent.excludeTerms.map((t) => String(t).trim()).filter(Boolean)
    : [];

  const brandPreferences = Array.isArray(rawIntent.brandPreferences)
    ? rawIntent.brandPreferences.map((b) => String(b).trim()).filter(Boolean)
    : [];

  const reason = String(rawIntent.reason || piece.stylingReason || "").trim();

  return {
    category: cat,
    categoryLabel: piece.categoryLabel || cat,
    subtypes,
    allowedColors,
    excludedColors,
    fitOrShape,
    materials,
    styleTags,
    mustHaveTerms,
    excludeTerms,
    brandPreferences,
    reason
  };
}

/**
 * Hard Pre-Ranking Product Validator.
 * Strictly rejects items that violate budget lower bounds, gender, anchor exclusions,
 * or explicit intent-excluded terms before ranking occurs.
 */
export function validateProduct(product = {}, {
  intent = {},
  anchorItem = {},
  gender = "men",
  minPrice = null,
  maxPrice = null,
  allowAboveBudget = false,
  userPrefs = {}
} = {}) {
  const title = String(product.title || "").toLowerCase();
  const rawPrice = product.extractedPrice ?? product.extracted_price;
  const price = Number(rawPrice);
  const targetCategory = String(product.category || intent.category || "").toLowerCase();

  // 1. Record integrity: Must have non-empty title, image, price
  if (!product.title || title.length < 3) {
    return { valid: false, reason: "missing_title" };
  }
  if (!hasValidImage(product)) {
    return { valid: false, reason: "invalid_or_missing_image" };
  }
  if (!Number.isFinite(price) || price <= 0) {
    return { valid: false, reason: "invalid_price" };
  }

  // 2. Strict Budget Checks: NEVER relax minPrice!
  if (minPrice !== null && minPrice > 0 && price < minPrice) {
    return { valid: false, reason: `price_below_min_${price}_lt_${minPrice}` };
  }
  if (maxPrice !== null && maxPrice > 0) {
    const effectiveMax = allowAboveBudget ? Math.round(maxPrice * 1.15) : maxPrice;
    if (price > effectiveMax) {
      return { valid: false, reason: `price_above_max_${price}_gt_${effectiveMax}` };
    }
  }

  // 3. Gender Purity
  const isMenTarget = String(gender).toLowerCase() !== "women";
  if (isMenTarget) {
    if (/\b(women|woman|women's|woman's|female|girl|girls|ladies|lady|kurti|kurtis|saree|sarees|lehenga|bra|panties|maternity)\b/i.test(title)) {
      if (!/\b(men|man|men's|man's)\b/i.test(title)) {
        return { valid: false, reason: "gender_mismatch_women_item" };
      }
    }
  } else {
    if (/\b(men|man|men's|man's|male|boy|boys|gentleman|boxer|briefs)\b/i.test(title)) {
      if (!/\b(women|woman|ladies)\b/i.test(title)) {
        return { valid: false, reason: "gender_mismatch_men_item" };
      }
    }
  }

  // 4. Anchor Category Leakage: if anchor is an outerwear piece, drop any jacket/coat/blazer/bomber/overshirt
  const anchorDesc = `${anchorItem.category || ""} ${anchorItem.subCategory || ""} ${anchorItem.title || ""}`.toLowerCase();
  const isAnchorJacket = /jacket|coat|blazer|cardigan|shrug|vest|bomber|parka|windbreaker|anorak|trench|overcoat/i.test(anchorDesc);
  if (isAnchorJacket) {
    if (targetCategory === "layering") {
      return { valid: false, reason: "anchor_jacket_forbids_layering" };
    }
    if (/\b(jacket|coat|blazer|bomber|overshirt|cardigan|shrug|vest|parka|windbreaker)\b/i.test(title)) {
      return { valid: false, reason: "anchor_jacket_leakage_outerwear_title" };
    }
  }

  // 5. Excluded terms and subtypes from Intent
  const excludeTerms = Array.isArray(intent.excludeTerms) ? intent.excludeTerms : [];
  for (const term of excludeTerms) {
    if (term && term.length >= 3) {
      const baseTerm = term.replace(/s$/, "");
      const reg = new RegExp(`\\b${baseTerm}(?:s|es)?\\b`, "i");
      if (reg.test(title)) {
        return { valid: false, reason: `excluded_term_match_${term}` };
      }
    }
  }

  // 6. Forbidden Colors from Intent and userPrefs
  const avoidColors = [
    ...(Array.isArray(intent.excludedColors) ? intent.excludedColors : []),
    ...(Array.isArray(userPrefs.avoidColors) ? userPrefs.avoidColors : [])
  ].filter(Boolean);

  for (const ac of avoidColors) {
    if (ac && ac.length >= 3) {
      const reg = new RegExp(`\\b${ac}\\b`, "i");
      if (reg.test(title)) {
        return { valid: false, reason: `avoided_color_match_${ac}` };
      }
    }
  }

  // 7. Hard Exclusions from user preferences
  const hardExclusions = Array.isArray(userPrefs.hardExclusions) ? userPrefs.hardExclusions : [];
  for (const he of hardExclusions) {
    if (he && he.length >= 3) {
      const reg = new RegExp(`\\b${he}\\b`, "i");
      if (reg.test(title)) {
        return { valid: false, reason: `hard_exclusion_match_${he}` };
      }
    }
  }

  return { valid: true };
}

/**
 * Relevance-First Product Scoring.
 * Subtype, color, material, and fashion intent strictly dominate brand/rating.
 */
export function scoreProductRelevance(product = {}, {
  intent = {},
  anchorItem = {},
  userPrefs = {},
  targetSize = null,
  minPrice = null,
  maxPrice = null
} = {}) {
  let score = 0;
  const breakdown = {};
  const title = String(product.title || "").toLowerCase();
  const source = String(product.source || "").toLowerCase();
  const price = Number(product.extractedPrice ?? product.extracted_price ?? 0);

  // 1. Subtype / Must-Have terms match (+45 max)
  const subtypes = Array.isArray(intent.subtypes) ? intent.subtypes : [];
  const mustHave = Array.isArray(intent.mustHaveTerms) ? intent.mustHaveTerms : [];
  let subtypeMatched = false;

  for (const sub of subtypes) {
    if (sub && sub.length >= 3 && title.includes(sub.toLowerCase())) {
      score += 45;
      breakdown.subtypeMatch = 45;
      subtypeMatched = true;
      break;
    }
  }
  if (!subtypeMatched) {
    let partialMatches = 0;
    for (const term of [...subtypes, ...mustHave]) {
      const words = String(term || "").toLowerCase().split(/\s+/);
      for (const w of words) {
        if (w.length >= 4 && title.includes(w)) {
          partialMatches++;
        }
      }
    }
    if (partialMatches > 0) {
      const pts = Math.min(30, partialMatches * 15);
      score += pts;
      breakdown.partialSubtypeMatch = pts;
    }
  }

  // 2. Allowed Color match (+25 max)
  const allowedColors = Array.isArray(intent.allowedColors) ? intent.allowedColors : [];
  for (const col of allowedColors) {
    if (col && col.length >= 3 && title.includes(col.toLowerCase())) {
      score += 25;
      breakdown.colorMatch = 25;
      break;
    }
  }

  // 3. Style / Material / Fit terms (+15 max)
  const styleTerms = [
    ...(Array.isArray(intent.materials) ? intent.materials : []),
    ...(Array.isArray(intent.styleTags) ? intent.styleTags : []),
    ...(Array.isArray(intent.fitOrShape) ? intent.fitOrShape : [])
  ];
  for (const st of styleTerms) {
    if (st && st.length >= 3 && title.includes(st.toLowerCase())) {
      score += 15;
      breakdown.styleMaterialFitMatch = 15;
      break;
    }
  }

  // 4. Preferred Brand match (+10)
  const preferredBrands = [
    ...(Array.isArray(userPrefs.preferredBrands) ? userPrefs.preferredBrands : []),
    ...(Array.isArray(intent.brandPreferences) ? intent.brandPreferences : [])
  ];
  for (const pb of preferredBrands) {
    if (pb && pb.length >= 3 && (title.includes(pb.toLowerCase()) || source.includes(pb.toLowerCase()))) {
      score += 10;
      breakdown.preferredBrand = 10;
      break;
    }
  }

  // 5. Price Proximity to Budget Midpoint (+8 max)
  if (minPrice != null && maxPrice != null && maxPrice > minPrice) {
    const mid = (minPrice + maxPrice) / 2;
    const diffRatio = Math.abs(price - mid) / (maxPrice - minPrice);
    const pts = Math.max(0, Math.round(8 * (1 - Math.min(1, diffRatio))));
    score += pts;
    breakdown.budgetProximity = pts;
  }

  // 6. Rating & Review Quality (+7 max as tie-breaker)
  const rating = Number(product.rating || 0);
  const reviews = Number(product.reviews || 0);
  if (rating >= 4.5 && reviews >= 50) {
    score += 7;
    breakdown.ratingQuality = 7;
  } else if (rating >= 4.0 && reviews >= 20) {
    score += 4;
    breakdown.ratingQuality = 4;
  }

  // 7. Size Match Bonus (+10)
  if (targetSize && product.extractedSize === targetSize) {
    score += 10;
    breakdown.sizeMatch = 10;
  }

  // 8. Anchor color repetition penalty (-15)
  const anchorColor = String(anchorItem.primaryColor || "").toLowerCase();
  const category = String(product.category || intent.category || "").toLowerCase();
  if (anchorColor && (category === "tops" || category === "bottoms") && title.includes(anchorColor)) {
    score -= 15;
    breakdown.anchorColorDuplicatePenalty = -15;
  }

  return { score, breakdown };
}

export function deduplicateAndRankProducts(products = [], {
  userSizes = {},
  userPrefs = {},
  category = "",
  anchorItem = {},
  recommendedColors = [],
  intent = null,
  minPrice = null,
  maxPrice = null
} = {}) {
  const targetUserSize = (category === "tops" ? userSizes.top
    : category === "bottoms" ? userSizes.bottom
    : category === "shoes" ? userSizes.shoes
    : category === "dresses" ? userSizes.dress
    : null);

  const targetSizeStr = targetUserSize ? String(targetUserSize).trim().toUpperCase() : null;
  const effectiveIntent = intent || normalizePieceIntent({ category, recommendedColors });

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
    let chosen = group[0];
    if (targetSizeStr && group.length > 1) {
      const match = group.find((p) => {
        const sz = extractProductSize(p.title);
        return sz && sz === targetSizeStr;
      });
      if (match) chosen = match;
    }

    const prodSize = extractProductSize(chosen.title);
    const isSizeMatch = Boolean(targetSizeStr && prodSize && prodSize === targetSizeStr);
    const relevance = scoreProductRelevance(chosen, {
      intent: effectiveIntent,
      anchorItem,
      userPrefs,
      targetSize: targetSizeStr,
      minPrice,
      maxPrice
    });

    deduplicated.push({
      ...chosen,
      extractedSize: prodSize,
      userSizeMatch: isSizeMatch,
      _relevanceScore: relevance.score,
      _scoreBreakdown: relevance.breakdown
    });
  }

  deduplicated.sort((a, b) => {
    if (a.userSizeMatch && !b.userSizeMatch) return -1;
    if (!a.userSizeMatch && b.userSizeMatch) return 1;
    const diff = (b._relevanceScore || 0) - (a._relevanceScore || 0);
    if (diff !== 0) return diff;
    return (Number(b.rating || 0) * 10 + (b.reviews || 0)) - (Number(a.rating || 0) * 10 + (a.reviews || 0));
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

export function pickDiverseProductSet(products = [], category = "", limit = 3, offset = 0) {
  if (!Array.isArray(products) || products.length === 0) return [];
  if (products.length <= 1) return products.slice(0, limit);

  const start = (offset && products.length > limit) ? (Math.abs(Number(offset)) % products.length) : 0;
  const pool = start > 0 ? [...products.slice(start), ...products.slice(0, start)] : products;

  const isAccessory = category === "accessories" || category === "bags" || category === "jewelry";
  const selected = [];
  const seenSubtypes = new Set();
  const subtypeCounts = {};
  const seenBrands = new Set();

  const canAddSubtype = (subtype) => {
    const currentCount = subtypeCounts[subtype] || 0;
    if (currentCount === 0) return true;
    if (isAccessory) {
      // For accessories, check if there's any candidate in pool with a subtype not yet picked
      const hasUnseenSubtypeInPool = pool.some((p) => {
        const id = p.id || p.product_id;
        if (selected.some((s) => (s.id || s.product_id) === id)) return false;
        const st = detectProductSubtype(p, category);
        return (subtypeCounts[st] || 0) === 0;
      });
      if (hasUnseenSubtypeInPool) return false;
    }
    return currentCount < 2; // Never more than 2 of any subtype in a 3-item list
  };

  const addProduct = (prod, subtype, brand) => {
    selected.push(prod);
    seenSubtypes.add(subtype);
    subtypeCounts[subtype] = (subtypeCounts[subtype] || 0) + 1;
    if (brand) seenBrands.add(brand);
  };

  // Pass 1: Strict diversity - Pick distinct subtype AND distinct brand/retailer
  for (const prod of pool) {
    if (selected.length >= limit) break;
    const subtype = detectProductSubtype(prod, category);
    const brand = String(prod.source || prod.brand || "").toLowerCase().trim();

    if (!seenSubtypes.has(subtype) && (!brand || !seenBrands.has(brand))) {
      addProduct(prod, subtype, brand);
    }
  }

  // Pass 2: Distinct subtype, allow brand repeat if necessary
  if (selected.length < limit) {
    for (const prod of pool) {
      if (selected.length >= limit) break;
      const id = prod.id || prod.product_id;
      if (selected.some((p) => (p.id || p.product_id) === id)) continue;
      const subtype = detectProductSubtype(prod, category);
      const brand = String(prod.source || prod.brand || "").toLowerCase().trim();

      if (!seenSubtypes.has(subtype)) {
        addProduct(prod, subtype, brand);
      }
    }
  }

  // Pass 3: Distinct brand, respecting canAddSubtype
  if (selected.length < limit) {
    for (const prod of pool) {
      if (selected.length >= limit) break;
      const id = prod.id || prod.product_id;
      if (selected.some((p) => (p.id || p.product_id) === id)) continue;
      const subtype = detectProductSubtype(prod, category);
      const brand = String(prod.source || prod.brand || "").toLowerCase().trim();

      if (canAddSubtype(subtype) && (!brand || !seenBrands.has(brand))) {
        addProduct(prod, subtype, brand);
      }
    }
  }

  // Pass 4: Fill remaining slots with remaining valid products respecting canAddSubtype
  if (selected.length < limit) {
    for (const prod of pool) {
      if (selected.length >= limit) break;
      const id = prod.id || prod.product_id;
      if (selected.some((p) => (p.id || p.product_id) === id)) continue;
      const subtype = detectProductSubtype(prod, category);
      const brand = String(prod.source || prod.brand || "").toLowerCase().trim();

      if (canAddSubtype(subtype)) {
        addProduct(prod, subtype, brand);
      }
    }
  }

  // Pass 5: Fallback if pool only had 1 subtype
  if (selected.length < limit) {
    for (const prod of pool) {
      if (selected.length >= limit) break;
      const id = prod.id || prod.product_id;
      if (selected.some((p) => (p.id || p.product_id) === id)) continue;
      const subtype = detectProductSubtype(prod, category);
      const brand = String(prod.source || prod.brand || "").toLowerCase().trim();
      addProduct(prod, subtype, brand);
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
export async function generateStylingPlanWithGemini({ item = {}, profile = {}, targetCategory = "", apiKey = "", shuffleIndex = 0 }) {
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

  const anchorFullText = `${anchorCat} ${anchorSubCat} ${anchorTitle}`.toLowerCase();
  const isJacket = /jacket|coat|blazer|cardigan|shrug|vest|bomber|parka|windbreaker|anorak|trench|overcoat/i.test(anchorFullText);
  const isBottom = !isJacket && /bottom|pant|trouser|jean|skirt|short|chino|legging|palazzo/i.test(anchorFullText);
  const isShoes = !isJacket && /shoe|sneaker|boot|sandal|heel|loafer/i.test(anchorFullText);
  const isDress = !isJacket && !isShoes && /dress|gown|jumpsuit|romper/i.test(anchorFullText);
  const isTop = !isJacket && !isShoes && !isBottom && !isDress && /top|shirt|tee|t-shirt|blouse|kurta|sweater|hoodie|polo/i.test(anchorFullText);

  const variationPrompts = [
    "LOOK AESTHETIC DIRECTION: Modern Smart Casual — Crisp refined foundation, structured silhouettes, and high-contrast color harmony.",
    "LOOK AESTHETIC DIRECTION: Urban Utility & Streetwear — Relaxed boxy silhouettes, tactile layering (utility overshirt, chore jacket, or bomber), and contemporary street footwear.",
    "LOOK AESTHETIC DIRECTION: Minimalist European Chic — Clean, understated lines, premium supima cotton or poplin, neutral earthy tones, and sophisticated accessories.",
    "LOOK AESTHETIC DIRECTION: Casual Weekend & Relaxed Layers — Effortless comfort, textured fabrics (waffle, denim, canvas), and approachable weekend styling.",
    "LOOK AESTHETIC DIRECTION: Elevated Evening / Statement — Sharp, confident tailoring, subtle rich dark tones, polished leather accents, and standout accessories."
  ];
  const variationIndex = Math.abs(Number(shuffleIndex || 0));
  const activeVariation = variationPrompts[variationIndex % variationPrompts.length];

  const systemPrompt = `You are the lead AI Personal Fashion Stylist for ClothMatics.
Your task is to generate a COMPLETE, HIGHLY INDIVIDUALIZED COORDINATED OUTFIT around an anchor garment owned by the user.

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

CURRENT VARIATION MANDATE (#${variationIndex + 1}):
- ${activeVariation}
- FRESHNESS REQUIREMENT: Avoid standard boilerplate or repetitive clothing. Give this look a distinct signature identity, specific cut, and fresh color harmony.

CLOTHMATICS AI STYLIST CORE RULES:
1. GENDER PURITY: Must be strictly ${gender.toUpperCase()}. Every piece, title, and query must be designed exclusively for ${gender}. Never output unisex or opposing gender clothing.
2. NEVER RECOMMEND THE SAME CATEGORY AS THE ANCHOR:
   ${isJacket ? `- The anchor item is an OUTERWEAR / JACKET / BLAZER ('${anchorTitle}'). You must NEVER recommend jackets, coats, blazers, overshirts, or layering pieces! The user is already wearing this jacket as their outer layer. You must recommend: 1 Inner Top (crew neck t-shirt, casual shirt, or polo that layers cleanly underneath), 1 Bottom (Pants/Chinos/Trousers/Jeans), 1 Footwear, and 1 Accessory.` : ""}
   ${isBottom ? "- The anchor item is a PAIR OF PANTS/TROUSERS. You must NEVER recommend pants, trousers, jeans, or chinos! Recommend 1 Top, 1 Footwear, 1 Layering/Jacket, and 1 Accessory." : ""}
   ${isTop ? "- The anchor item is a TOP/SHIRT. You must NEVER recommend tops or shirts! Recommend 1 Bottom (Trousers/Chinos/Jeans), 1 Footwear, 1 Layering, and 1 Accessory." : ""}
   ${isDress ? "- The anchor item is a DRESS. Recommend 1 Footwear, 1 Layering shrug/jacket, 1 Handbag/Clutch, and 1 Jewelry/Accessory." : ""}
   ${isShoes ? "- The anchor item is FOOTWEAR. Recommend 1 Bottom, 1 Top, 1 Layering, and 1 Accessory." : ""}
3. DYNAMIC ANCHOR COLOR CONTRAST & HARMONY:
   - Base all color decisions on the anchor color ('${anchorColor || "neutral"}').
   - If the anchor is dark (Black, Charcoal, Deep Navy): Strongly contrast with lighter or earthy neutral coordinates (Crisp White, Off-White, Ecru, Light Grey, Camel, Sage Green, Dusty Blue). Never build an all-dark muddy outfit.
   - If the anchor is light (White, Beige, Cream, Light Blue, Ecru): Ground with deep, rich contrasting coordinates (Deep Navy Blue, Olive Green, Rich Dark Brown, Slate Grey, Charcoal).
   - If the anchor is saturated or colored (Olive, Rust, Maroon, Mustard, Pink, Yellow): Pair with sophisticated grounding neutrals (Ecru, Cream, Black, Dark Denim, Warm Beige, Heather Grey) that elevate rather than clash.
   - NEVER recommend the anchor garment's exact primary color for other main pieces unless intentional monochrome.
4. FABRIC & TEXTURAL SYNERGY:
   - Complement the anchor fabric ('${anchorMaterial || "standard"}'). Linen anchors pair with textured waffle cotton, slub knit, or espadrilles/suede loafers. Denim anchors pair with brushed flannel, clean 240+ GSM cotton, or rugged leather boots/overshirts. Formal trousers pair with poplin or derbies.
5. SILHOUETTE & PROPORTION BALANCING:
   - Wide-leg / baggy / relaxed cuts demand structured, tailored, or cropped tops.
   - Slim / tapered cuts allow boxy, relaxed, or layered tops for volume contrast.
6. DIVERSE, BESPOKE GOOGLE SHOPPING SEARCH QUERIES:
   - CRITICAL ANTI-REPETITION MANDATE: Every wardrobe item is distinct. NEVER use cookie-cutter, repetitive, or generic search terms. Tailor every piece's color, cut, fabric, and search term specifically to this individual garment (${anchorTitle}).
   - In each piece's 'searchTerm', generate a highly specific, studio-grade shopping query containing:
     * Gender: '${gender.toLowerCase()}'
     * Complementary Color: (e.g. 'off white', 'olive green', 'tan brown', 'slate grey')
     * Specific Cut/Fabric: (e.g. 'textured waffle cotton', 'relaxed linen', 'chunky court', 'suede penny')
     * Target Garment Type: (e.g. 'polo shirt', 'casual loafers', 'unstructured blazer', 'braided belt')
     * Diversified Retailer/Brand Targeting: Rotate reputable brands appropriate to the style:
       - For Men: (Uniqlo OR Rare Rabbit OR Snitch OR Zara OR Marks & Spencer OR Levi's OR Puma OR Comet OR Red Tape OR Woodland OR Flying Machine OR Roadster)
       - For Women: (Zara OR H&M OR Mango OR Vero Moda OR Marks & Spencer OR Forever New OR Levi's OR Carlton London OR Lavie OR Baggit OR ONLY)
7. INDIVIDUAL PIECE REASONING: Each piece in 'pieces' must have its own distinct, specific styling reason explaining why its specific silhouette, complementary color, and fabric texture balance with the anchor garment ('${anchorTitle}').
8. STRICT USER PROFILE & SIZE ADHERENCE:
   - NEVER recommend colors listed under 'Colors to STRICTLY AVOID' (${userPrefs.avoidColors.join(', ') || 'none'}).
   - NEVER recommend garments matching 'Hard Exclusions' (${userPrefs.hardExclusions.join(', ') || 'none'}).
   - Top size: ${userSizes.top || "standard fit"}. Bottom size: ${userSizes.bottom || "standard"}. Shoe size: UK ${userSizes.shoes || "standard"}.
9. ACCESSORY DIVERSITY & ANTI-REPETITION:
   - NEVER default blindly to a watch for accessories. Intentionally rotate between Belts, Sunglasses/Eyewear, Crossbody/Shoulder Bags, and Watches to give users a fresh, diverse styling experience.

Return pure JSON only in this exact format:
{
  "outfitTitle": "Short descriptive title for this complete look",
  "overallStylingAdvice": "2-3 sentences explaining overall aesthetic, silhouette balance, and color harmony.",
  "styleArchetype": "e.g. Urban Streetwear / Smart Casual / Tailored Formal / Contemporary Parisian Chic",
  "colorHarmony": "e.g. High-Contrast Monotone / Complementary Contrast / Neutral Grounding",
  "silhouetteBalance": "e.g. Volume-Balanced Proportion / Elongated Tailored Line",
  "pieces": ${isJacket ? `[
    {
      "category": "tops",
      "categoryLabel": "Tops & Shirts",
      "icon": "👕",
      "searchTerm": "${gender.toLowerCase()} crisp white heavyweight crew neck t-shirt",
      "stylingReason": "Why this specific inner top layers under ${anchorTitle}...",
      "recommendedColors": ["white"],
      "intent": {
        "subtypes": ["crew neck t-shirt", "t-shirt"],
        "allowedColors": ["white", "off-white"],
        "excludedColors": ["black"],
        "fitOrShape": ["regular fit"],
        "materials": ["cotton"],
        "styleTags": ["clean", "minimalist"],
        "mustHaveTerms": ["${gender.toLowerCase()}", "white", "crew neck"],
        "excludeTerms": ["jacket", "blazer", "overshirt"],
        "brandPreferences": ["Uniqlo", "Zara", "Snitch"],
        "reason": "Crisp white base provides high-contrast framing under ${anchorTitle}."
      }
    },
    {
      "category": "bottoms",
      "categoryLabel": "Pants & Trousers",
      "icon": "👖",
      "searchTerm": "${gender.toLowerCase()} slim fit beige stretch chinos",
      "stylingReason": "Why these bottoms ground the jacket...",
      "recommendedColors": ["beige"],
      "intent": {
        "subtypes": ["chino pants", "trousers"],
        "allowedColors": ["beige", "tan"],
        "excludedColors": ["black"],
        "fitOrShape": ["slim fit"],
        "materials": ["stretch cotton"],
        "styleTags": ["smart casual"],
        "mustHaveTerms": ["${gender.toLowerCase()}", "chinos"],
        "excludeTerms": ["sweatpants", "track pants"],
        "brandPreferences": ["Highlander", "Zara", "Dennis Lingo"],
        "reason": "Tailored chinos provide clean structure beneath the jacket."
      }
    },
    {
      "category": "shoes",
      "categoryLabel": "Footwear",
      "icon": "👟",
      "searchTerm": "${gender.toLowerCase()} minimalist clean white leather court sneakers",
      "stylingReason": "Why this footwear balances the silhouette...",
      "recommendedColors": ["white"],
      "intent": {
        "subtypes": ["sneakers", "court sneakers", "low top sneakers"],
        "allowedColors": ["white", "off-white"],
        "excludedColors": ["black", "brown", "red"],
        "fitOrShape": ["low top", "clean profile"],
        "materials": ["leather", "canvas"],
        "styleTags": ["minimalist", "court"],
        "mustHaveTerms": ["${gender.toLowerCase()}", "white", "sneakers"],
        "excludeTerms": ["loafer", "boot", "derby", "skate", "running"],
        "brandPreferences": ["Puma", "Comet", "Adidas"],
        "reason": "Clean low-profile court sneakers keep the look crisp and modern."
      }
    },
    {
      "category": "accessories",
      "categoryLabel": "Accessories",
      "icon": "👜",
      "searchTerm": "${gender.toLowerCase()} tan brown genuine leather braided belt",
      "stylingReason": "Why this accessory elevates the look...",
      "recommendedColors": ["tan", "brown"],
      "intent": {
        "subtypes": ["belt", "leather belt"],
        "allowedColors": ["tan", "brown"],
        "excludedColors": [],
        "fitOrShape": ["standard width"],
        "materials": ["genuine leather"],
        "styleTags": ["classic", "refined"],
        "mustHaveTerms": ["${gender.toLowerCase()}", "leather", "belt"],
        "excludeTerms": ["wallet", "cap"],
        "brandPreferences": ["Tommy Hilfiger", "Woodland"],
        "reason": "Tan leather belt frames the waistline cleanly."
      }
    }
  ]` : `[
    {
      "category": "tops",
      "categoryLabel": "Tops & Shirts",
      "icon": "👕",
      "searchTerm": "${gender.toLowerCase()} ...",
      "stylingReason": "Why this specific top, color, and fit pairs with the anchor garment...",
      "recommendedColors": ["color1", "color2"],
      "intent": {
        "subtypes": ["polo", "shirt", "t-shirt"],
        "allowedColors": ["color1"],
        "excludedColors": [],
        "fitOrShape": ["regular"],
        "materials": ["cotton"],
        "styleTags": ["smart casual"],
        "mustHaveTerms": ["${gender.toLowerCase()}", "color1"],
        "excludeTerms": [],
        "brandPreferences": [],
        "reason": "Styling reason..."
      }
    },
    {
      "category": "shoes",
      "categoryLabel": "Footwear",
      "icon": "👟",
      "searchTerm": "${gender.toLowerCase()} ...",
      "stylingReason": "Why this specific footwear pairs with the anchor garment...",
      "recommendedColors": ["color1"],
      "intent": {
        "subtypes": ["sneakers", "loafers"],
        "allowedColors": ["color1"],
        "excludedColors": [],
        "fitOrShape": ["low top"],
        "materials": ["leather"],
        "styleTags": ["casual"],
        "mustHaveTerms": ["${gender.toLowerCase()}"],
        "excludeTerms": [],
        "brandPreferences": [],
        "reason": "Styling reason..."
      }
    },
    {
      "category": "layering",
      "categoryLabel": "Jackets & Layers",
      "icon": "🧥",
      "searchTerm": "${gender.toLowerCase()} ...",
      "stylingReason": "Why this jacket/layer pairs with the anchor garment...",
      "recommendedColors": ["color1"],
      "intent": {
        "subtypes": ["overshirt", "bomber", "blazer"],
        "allowedColors": ["color1"],
        "excludedColors": [],
        "fitOrShape": ["relaxed"],
        "materials": ["cotton"],
        "styleTags": ["layering"],
        "mustHaveTerms": ["${gender.toLowerCase()}"],
        "excludeTerms": [],
        "brandPreferences": [],
        "reason": "Styling reason..."
      }
    },
    {
      "category": "accessories",
      "categoryLabel": "Accessories",
      "icon": "⌚",
      "searchTerm": "${gender.toLowerCase()} ...",
      "stylingReason": "Why this accessory finishes the look...",
      "recommendedColors": ["color1"],
      "intent": {
        "subtypes": ["watch", "belt", "sunglasses", "bag"],
        "allowedColors": ["color1"],
        "excludedColors": [],
        "fitOrShape": [],
        "materials": [],
        "styleTags": [],
        "mustHaveTerms": ["${gender.toLowerCase()}"],
        "excludeTerms": [],
        "brandPreferences": [],
        "reason": "Styling reason..."
      }
    }
  ]`}
}`;

  const models = [
    "gemini-2.5-flash",
    "gemini-flash-latest",
    "gemini-3.1-flash-lite",
    "gemini-2.5-flash-lite"
  ];
  for (const model of models) {
    try {
      const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        signal: AbortSignal.timeout(6000),
        body: JSON.stringify({
          contents: [{ parts: [{ text: systemPrompt }] }],
          generationConfig: {
            responseMimeType: "application/json",
            temperature: 0.85
          }
        })
      });

      if (res.ok) {
        const data = await res.json();
        const rawText = data.candidates?.[0]?.content?.parts?.[0]?.text;
        if (rawText) {
          const parsed = JSON.parse(rawText);
          if (parsed && Array.isArray(parsed.pieces) && parsed.pieces.length > 0) {
            const normalizedPieces = parsed.pieces.map((p) => {
              const normIntent = normalizePieceIntent(p, gender);
              return {
                ...p,
                intent: normIntent,
                searchTerm: p.searchTerm || buildQueryLatticeFromIntent(normIntent, gender)[0],
                recommendedColors: (Array.isArray(p.recommendedColors) && p.recommendedColors.length > 0) ? p.recommendedColors : normIntent.allowedColors,
                stylingReason: p.stylingReason || normIntent.reason
              };
            });
            const primary = normalizedPieces.find((p) => p.category === targetCategory) || normalizedPieces[0];
            return {
              _geminiModelUsed: model,
              outfitTitle: parsed.outfitTitle || "Coordinated Outfit Look",
              overallStylingAdvice: parsed.overallStylingAdvice || parsed.stylingAdvice || "",
              styleArchetype: parsed.styleArchetype || (style === "streetwear" ? "Urban Streetwear" : style === "formal" ? "Tailored Formal" : "Smart Casual"),
              colorHarmony: parsed.colorHarmony || "Harmonious Complementary Contrast",
              silhouetteBalance: parsed.silhouetteBalance || "Volume-Balanced Proportion",
              pieces: normalizedPieces,
              targetCategory: primary.category,
              searchTerm: primary.searchTerm,
              stylingReason: primary.stylingReason,
              recommendedColors: primary.recommendedColors || [],
              alternativeCategories: normalizedPieces.filter((p) => p !== primary).map((p) => ({
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
export function getFallbackStylingPlan({ item = {}, profile = {}, targetCategory = "", shuffleIndex = 0 }) {
  const rawGender = String(profile.gender || profile.shoppingProfile?.gender || "").toLowerCase();
  const isFemale = rawGender.includes("fem") || rawGender.includes("wom") || rawGender === "female";
  const gender = isFemale ? "women" : "men";

  const text = `${item.category || ""} ${item.subCategory || ""} ${item.title || ""}`.toLowerCase();
  const style = detectAnchorStyle(item);
  const anchorColor = String(item.primaryColor || "").toLowerCase().trim();
  const baseSeed = getGarmentSeed(item);
  const seed = baseSeed + Math.abs(Number(shuffleIndex || 0));

  const isJacket = /jacket|coat|blazer|cardigan|shrug|vest|bomber|parka|windbreaker|anorak|trench|overcoat/i.test(text);
  const isShoes = !isJacket && ((item.category && /shoe|footwear/i.test(item.category)) || (/shoe|footwear|sneaker|boot|sandal|heel|loafer|derby|oxford/i.test(text) && !/bootcut/i.test(text)));
  const isDress = !isJacket && !isShoes && /dress|gown|jumpsuit|romper/i.test(text);
  const isBottom = !isJacket && !isShoes && /bottom|pant|trouser|jean|skirt|short|chino|legging|palazzo/i.test(text);
  const isTop = !isJacket && !isShoes && !isBottom && !isDress && /(?:^|[^\w-])(?:tops?|shirts?|tees?|t-shirts?|blouse|kurta|sweater|hoodie|polo)\b/i.test(text);

  let pieces = [];
  let outfitTitle = "Coordinated Outfit Look";
  let overallStylingAdvice = "";
  let styleArchetype = "Smart Casual";
  let colorHarmony = "Harmonious Complementary Contrast";
  let silhouetteBalance = "Volume-Balanced Proportion";

  if (isJacket) {
    if (gender === "men") {
      const isAthletic = /track|performance|running|sport|athlet|gym|windbreak/i.test(text);
      const isBlazer = /blazer|suit|formal|coat/i.test(text);

      if (isAthletic) {
        outfitTitle = "Modern Athleisure Performance Look";
        overallStylingAdvice = `A lightweight performance jacket demands clean, breathable base layers and tapered active bottoms for a streamlined, functional athletic silhouette.`;
        styleArchetype = "Performance Athleisure";
        colorHarmony = "High-Contrast Monochrome & Neutrals";
        silhouetteBalance = "Streamlined Tapered Athletic Proportion";

        const topOptions = [
          { term: "men crisp white heavyweight cotton crew neck t-shirt (Puma OR Snitch OR Zara)", colors: ["white"], reason: "Crisp white crew-neck tee provides a clean, breathable foundation that layers smoothly under the track jacket." },
          { term: "men black relaxed fit crew neck graphic t-shirt (Bonkers Corner OR Puma)", colors: ["black"], reason: "Solid black crew neck creates high-contrast framing under the light track jacket." },
          { term: "men charcoal grey breathable cotton crew neck t-shirt (Marks & Spencer OR Rare Rabbit)", colors: ["charcoal", "grey"], reason: "Charcoal tee delivers tonal athletic depth beneath the jacket." }
        ];
        const topPick = topOptions[seed % topOptions.length];

        const botOptions = [
          { term: "men deep navy blue slim fit stretch chino trousers (Highlander OR Zara)", colors: ["navy"], reason: "Deep navy chinos ground the athletic jacket with smart, versatile structure." },
          { term: "men black tapered utility cargo joggers (Snitch OR Bonkers Corner)", colors: ["black"], reason: "Tapered utility joggers echo the performance feel of the track jacket." },
          { term: "men dark grey slim fit stretch trousers (Kotty OR Rare Rabbit)", colors: ["grey", "dark grey"], reason: "Dark grey trousers create an understated, streamlined athletic silhouette." }
        ];
        const botPick = botOptions[seed % botOptions.length];

        const shoeOptions = [
          { term: "men minimalist clean white leather low top sneakers (Puma OR Comet)", colors: ["white"], reason: "Clean low-profile court sneakers keep the athleisure look crisp and intentional." },
          { term: "men retro chunky skate sneakers black white (Puma OR Comet)", colors: ["black", "white"], reason: "Chunky skate sneakers add modern street volume beneath the tapered joggers." },
          { term: "men navy blue lightweight casual running sneakers (Asics OR Puma)", colors: ["navy"], reason: "Responsive lightweight sneakers reinforce authentic athletic performance." }
        ];
        const shoePick = shoeOptions[seed % shoeOptions.length];

        const accOptions = [
          { term: "men matte black digital tactical sports watch (Casio OR Fastrack)", colors: ["black"], reason: "Matte tactical hardware completes the sporty performance aesthetic." },
          { term: "men black polarized sport aviator sunglasses (Vincent Chase OR Fastrack)", colors: ["black"], reason: "Polarized eyewear provides sleek outdoor functionality." },
          { term: "men black nylon utility crossbody sling bag (Wildcraft OR Puma)", colors: ["black"], reason: "A compact crossbody bag keeps essentials secure and complements the active lifestyle." }
        ];
        const accPick = accOptions[seed % accOptions.length];

        pieces = [
          { category: "tops", categoryLabel: "Tops & Shirts", icon: "👕", searchTerm: topPick.term, stylingReason: topPick.reason, recommendedColors: topPick.colors },
          { category: "bottoms", categoryLabel: "Pants & Trousers", icon: "👖", searchTerm: botPick.term, stylingReason: botPick.reason, recommendedColors: botPick.colors },
          { category: "shoes", categoryLabel: "Footwear", icon: "👟", searchTerm: shoePick.term, stylingReason: shoePick.reason, recommendedColors: shoePick.colors },
          { category: "accessories", categoryLabel: "Accessories", icon: "👜", searchTerm: accPick.term, stylingReason: accPick.reason, recommendedColors: accPick.colors }
        ];
      } else if (isBlazer) {
        outfitTitle = "Modern Tailored Sartorial Look";
        overallStylingAdvice = `A structured blazer sets the tone for refined tailoring. Anchoring with a crisp button-down, formal trousers, and leather dress shoes completes executive sophistication.`;
        styleArchetype = "Tailored Formal";
        colorHarmony = "Timeless Executive Contrast";
        silhouetteBalance = "Elongated Structured Line";

        const topOptions = [
          { term: "men white slim fit oxford cotton shirt (Zara OR Marks & Spencer OR Dennis Lingo)", colors: ["white"], reason: "A crisp white oxford shirt is the timeless foundation under a tailored blazer." },
          { term: "men light blue slim fit oxford cotton shirt (Raymond OR Van Heusen)", colors: ["light blue"], reason: "Soft light blue adds executive depth beneath dark tailoring." }
        ];
        const topPick = topOptions[seed % topOptions.length];

        const botOptions = [
          { term: "men charcoal grey tailored slim fit trousers (Raymond OR Van Heusen)", colors: ["charcoal", "grey"], reason: "Charcoal tailored trousers create classic tonal balance." },
          { term: "men beige slim fit stretch chino trousers (Highlander OR Zara)", colors: ["beige", "tan"], reason: "Beige chinos bring Riviera-inspired smart casual to the blazer." }
        ];
        const botPick = botOptions[seed % botOptions.length];

        const shoeOptions = [
          { term: "men classic tan brown leather casual loafers (Red Tape OR Hush Puppies)", colors: ["tan", "brown"], reason: "Tan leather loafers elevate the tailored separates." },
          { term: "men black genuine leather derby dress shoes (Bata OR Red Tape)", colors: ["black"], reason: "Polished leather derbies ensure immaculate business presentation." }
        ];
        const shoePick = shoeOptions[seed % shoeOptions.length];

        const accOptions = [
          { term: "men tan brown braided genuine leather belt (Tommy Hilfiger OR Woodland)", colors: ["tan", "brown"], reason: "Braided leather coordinates cleanly with the loafers." },
          { term: "men black leather analog minimalist watch (Titan OR Fossil)", colors: ["black", "silver"], reason: "Understated analog dial adds refined polish without distraction." }
        ];
        const accPick = accOptions[seed % accOptions.length];

        pieces = [
          { category: "tops", categoryLabel: "Tops & Shirts", icon: "👕", searchTerm: topPick.term, stylingReason: topPick.reason, recommendedColors: topPick.colors },
          { category: "bottoms", categoryLabel: "Pants & Trousers", icon: "👖", searchTerm: botPick.term, stylingReason: botPick.reason, recommendedColors: botPick.colors },
          { category: "shoes", categoryLabel: "Footwear", icon: "👞", searchTerm: shoePick.term, stylingReason: shoePick.reason, recommendedColors: shoePick.colors },
          { category: "accessories", categoryLabel: "Accessories", icon: "⌚", searchTerm: accPick.term, stylingReason: accPick.reason, recommendedColors: accPick.colors }
        ];
      } else {
        // Casual / Denim / Utility / Chore Jacket
        outfitTitle = "Contemporary Casual Layered Look";
        overallStylingAdvice = `Your ${item.primaryColor || ""} casual jacket acts as the signature outer piece. Grounding with a neutral base tee, straight-fit bottoms, and casual footwear balances texture and warmth.`;
        styleArchetype = "Contemporary Casual";
        colorHarmony = "Textured Earthy Neutrals";
        silhouetteBalance = "Structured Outer Layer with Relaxed Base";

        const topOptions = [
          { term: "men ecru off white boxy heavyweight cotton t-shirt (Snitch OR Zara)", colors: ["ecru", "white"], reason: "Heavyweight ecru cotton provides a rich neutral base under the jacket." },
          { term: "men navy blue solid knitted cotton polo t-shirt (Highlander OR Rare Rabbit)", colors: ["navy"], reason: "Knitted polo adds collar structure beneath the jacket neckline." }
        ];
        const topPick = topOptions[seed % topOptions.length];

        const botOptions = [
          { term: "men dark indigo raw denim jeans (Levi's OR Flying Machine)", colors: ["indigo", "dark blue"], reason: "Raw dark indigo denim pairs naturally with casual jackets." },
          { term: "men beige slim fit stretch chino trousers (Highlander OR Zara)", colors: ["beige", "tan"], reason: "Beige chinos create effortless, earthy color blocking." }
        ];
        const botPick = botOptions[seed % botOptions.length];

        const shoeOptions = [
          { term: "men minimalist clean white leather low top sneakers (Puma OR Comet)", colors: ["white"], reason: "Crisp white sneakers keep the casual outerwear outfit modern." },
          { term: "men dark brown leather chelsea ankle boots (Woodland OR Red Tape)", colors: ["brown"], reason: "Chelsea boots ground the casual jacket with rugged heritage character." }
        ];
        const shoePick = shoeOptions[seed % shoeOptions.length];

        const accOptions = [
          { term: "men tan brown braided genuine leather belt (Tommy Hilfiger OR Woodland)", colors: ["tan", "brown"], reason: "Tan leather frames the waistline cleanly." },
          { term: "men polarized classic aviator sunglasses (Vincent Chase OR Fastrack)", colors: ["black", "gold"], reason: "Classic aviators add effortless weekend cool." }
        ];
        const accPick = accOptions[seed % accOptions.length];

        pieces = [
          { category: "tops", categoryLabel: "Tops & Shirts", icon: "👕", searchTerm: topPick.term, stylingReason: topPick.reason, recommendedColors: topPick.colors },
          { category: "bottoms", categoryLabel: "Pants & Trousers", icon: "👖", searchTerm: botPick.term, stylingReason: botPick.reason, recommendedColors: botPick.colors },
          { category: "shoes", categoryLabel: "Footwear", icon: "👟", searchTerm: shoePick.term, stylingReason: shoePick.reason, recommendedColors: shoePick.colors },
          { category: "accessories", categoryLabel: "Accessories", icon: "🕶️", searchTerm: accPick.term, stylingReason: accPick.reason, recommendedColors: accPick.colors }
        ];
      }
    } else {
      // Women Outerwear / Jacket / Blazer
      outfitTitle = "Contemporary Parisian Layered Look";
      overallStylingAdvice = `Your ${item.primaryColor || ""} jacket provides the key outer layer. Layering over a sleek knit top with wide-leg trousers and versatile footwear delivers effortless chic.`;
      styleArchetype = "Contemporary Chic";
      colorHarmony = "Refined Tonal Balance";
      silhouetteBalance = "Tailored Upper with Fluid Lower Line";

      const topOptions = [
        { term: "women white ribbed high neck fitted top (Zara OR H&M)", colors: ["white"], reason: "A fitted high-neck top provides clean contrast beneath the jacket lapels." },
        { term: "women black sleeveless scoop neck knit top (H&M OR Mango)", colors: ["black"], reason: "Sleek black knitwear creates a minimalist slimming base layer." }
      ];
      const topPick = topOptions[seed % topOptions.length];

      const botOptions = [
        { term: "women beige high waist wide leg straight trouser (Kotty OR Zara)", colors: ["beige"], reason: "Wide-leg trousers elongate the lower body and balance the jacket cut." },
        { term: "women black high waist wide leg straight trouser (Kotty OR Zara)", colors: ["black"], reason: "Black tailored trousers ensure sleek, versatile proportions." }
      ];
      const botPick = botOptions[seed % botOptions.length];

      const shoeOptions = [
        { term: "women bata white chunky casual sneakers", colors: ["white"], reason: "Chunky sneakers keep the layered jacket look modern and city-ready." },
        { term: "women carlton london nude pointed toe block heels", colors: ["nude", "black"], reason: "Pointed block heels elevate the jacket ensemble for formal occasions." }
      ];
      const shoePick = shoeOptions[seed % shoeOptions.length];

      const accOptions = [
        { term: "women structured black faux leather laptop tote bag (Lavie OR Baggit)", colors: ["black"], reason: "A structured tote bag delivers polished everyday utility." },
        { term: "women minimalist 18k gold plated layered chain hoop earrings (AccessHer OR Zaveri)", colors: ["gold"], reason: "Delicate gold accents brighten the neckline beneath the jacket collar." }
      ];
      const accPick = accOptions[seed % accOptions.length];

      pieces = [
        { category: "tops", categoryLabel: "Tops & Shirts", icon: "👚", searchTerm: topPick.term, stylingReason: topPick.reason, recommendedColors: topPick.colors },
        { category: "bottoms", categoryLabel: "Pants & Trousers", icon: "👖", searchTerm: botPick.term, stylingReason: botPick.reason, recommendedColors: botPick.colors },
        { category: "shoes", categoryLabel: "Footwear", icon: "👠", searchTerm: shoePick.term, stylingReason: shoePick.reason, recommendedColors: shoePick.colors },
        { category: "accessories", categoryLabel: "Accessories", icon: "👜", searchTerm: accPick.term, stylingReason: accPick.reason, recommendedColors: accPick.colors }
      ];
    }
  } else if (isBottom) {
    if (gender === "men") {
      if (style === "streetwear") {
        outfitTitle = "Urban Streetwear Utility Look";
        overallStylingAdvice = `Pairing your ${item.primaryColor || "streetwear"} bottoms with an oversized graphic tee and chunky skate sneakers creates a balanced, modern streetwear proportion.`;
        styleArchetype = "Urban Streetwear";
        colorHarmony = "High-Contrast Street Palettes";
        silhouetteBalance = "Volume-Balanced Boxy Proportion";

        let topOptions = [];
        if (anchorColor.includes("black") || anchorColor.includes("dark")) {
          topOptions = [
            { term: "men white oversized graphic cotton streetwear t-shirt (Snitch OR Bonkers Corner OR Puma)", colors: ["white", "cream"], reason: "A crisp white oversized graphic tee creates classic high-contrast monochrome balance against black bottoms." },
            { term: "men sage green oversized heavyweight graphic streetwear t-shirt (Bonkers Corner OR H&M OR Puma)", colors: ["sage", "olive"], reason: "Sage green adds subtle earthy color that balances the dark utility bottom." },
            { term: "men heather grey oversized graphic streetwear t-shirt (Snitch OR Zara OR Puma)", colors: ["grey", "charcoal"], reason: "Heather grey offers an understated athletic streetwear vibe with black." }
          ];
        } else if (anchorColor.includes("olive") || anchorColor.includes("green")) {
          topOptions = [
            { term: "men black oversized graphic cotton streetwear t-shirt (Snitch OR Bonkers Corner OR Puma)", colors: ["black"], reason: "Black grounds the olive tone with an authentic military-streetwear aesthetic." },
            { term: "men crisp white oversized graphic streetwear t-shirt (Bonkers Corner OR Puma)", colors: ["white"], reason: "Crisp white provides high-energy contrast against rich olive bottoms." },
            { term: "men ecru off white oversized boxy graphic t-shirt (Zara OR Snitch)", colors: ["ecru", "cream"], reason: "Warm ecru provides an effortless organic contrast with olive." }
          ];
        } else if (anchorColor.includes("beige") || anchorColor.includes("khaki") || anchorColor.includes("tan")) {
          topOptions = [
            { term: "men charcoal black oversized graphic cotton streetwear t-shirt (Snitch OR Bonkers Corner)", colors: ["black", "charcoal"], reason: "Charcoal black brings clean grounding contrast to light khaki bottoms." },
            { term: "men deep navy oversized graphic streetwear t-shirt (Puma OR Bonkers Corner)", colors: ["navy"], reason: "Deep navy provides rich complementary depth against neutral khaki." }
          ];
        } else {
          topOptions = [
            { term: "men black oversized graphic cotton streetwear t-shirt (Bonkers Corner OR Snitch OR Puma)", colors: ["black", "white"], reason: "An oversized boxy graphic tee balances the heavy cargo pockets and maintains street-style proportions." },
            { term: "men white oversized graphic cotton streetwear t-shirt (Snitch OR Puma OR Bonkers Corner)", colors: ["white"], reason: "A clean graphic tee keeps the focal point balanced with the utility silhouette." },
            { term: "men slate grey oversized boxy graphic t-shirt (Bonkers Corner OR H&M)", colors: ["grey"], reason: "Slate grey provides a cool neutral bridge for casual street styling." }
          ];
        }
        const topPick = topOptions[seed % topOptions.length];

        const shoeOptions = [
          { term: "men retro chunky skate sneakers black white (Puma OR Comet OR Converse)", colors: ["white", "black"], reason: "Chunky low-profile skate sneakers provide visual weight at the hem to complement the cuffs." },
          { term: "men minimalist clean white leather low top sneakers (Puma OR Comet)", colors: ["white"], reason: "Clean white court sneakers keep the streetwear silhouette crisp and intentional." },
          { term: "men vintage gum sole retro skate sneakers (Adidas OR Comet OR Puma)", colors: ["white", "gum"], reason: "Gum sole detailing introduces a vintage skate aesthetic." }
        ];
        const shoePick = shoeOptions[seed % shoeOptions.length];

        const layerOptions = [
          { term: "men black lightweight utility bomber jacket (Zara OR Snitch)", colors: ["black", "olive"], reason: "A lightweight bomber adds clean structure without feeling bulky or formal." },
          { term: "men olive green casual utility bomber jacket (H&M OR Snitch)", colors: ["olive"], reason: "Utility bomber brings authentic street volume to frame the graphic tee." },
          { term: "men washed black denim trucker jacket (Levi's OR Flying Machine)", colors: ["black", "grey"], reason: "Denim trucker adds tactile durability over the relaxed tee." }
        ];
        const layerPick = layerOptions[seed % layerOptions.length];

        const accOptions = [
          { term: "men matte black digital tactical sports watch (Casio OR Fastrack)", colors: ["black"], reason: "Matte tactical hardware completes the utilitarian streetwear aesthetic." },
          { term: "men black nylon utility crossbody chest bag (Wildcraft OR Puma)", colors: ["black"], reason: "A compact crossbody bag reinforces practical street utility." }
        ];
        const accPick = accOptions[seed % accOptions.length];

        pieces = [
          { category: "tops", categoryLabel: "Tops & Shirts", icon: "👕", searchTerm: topPick.term, stylingReason: topPick.reason, recommendedColors: topPick.colors },
          { category: "shoes", categoryLabel: "Footwear", icon: "👟", searchTerm: shoePick.term, stylingReason: shoePick.reason, recommendedColors: shoePick.colors },
          { category: "layering", categoryLabel: "Jackets & Layers", icon: "🧥", searchTerm: layerPick.term, stylingReason: layerPick.reason, recommendedColors: layerPick.colors },
          { category: "accessories", categoryLabel: "Accessories", icon: "⌚", searchTerm: accPick.term, stylingReason: accPick.reason, recommendedColors: accPick.colors }
        ];
      } else if (style === "formal") {
        outfitTitle = "Modern Tailored Professional Look";
        overallStylingAdvice = `Tailored ${item.primaryColor || "grey"} trousers provide a crisp, refined base. Anchoring with a pure cotton oxford shirt and navy blazer achieves timeless corporate elegance.`;
        styleArchetype = "Tailored Formal";
        colorHarmony = "Timeless Executive Palette";
        silhouetteBalance = "Clean Elongated Line";

        let topOptions = [];
        if (anchorColor.includes("grey") || anchorColor.includes("gray")) {
          topOptions = [
            { term: "men white slim fit oxford cotton shirt (Zara OR Marks & Spencer OR Dennis Lingo)", colors: ["white", "light blue"], reason: `A crisp white button-down oxford shirt is the timeless foundation for tailored ${item.primaryColor || "grey"} trousers.` },
            { term: "men crisp white formal button down oxford shirt (Raymond OR Van Heusen OR Marks & Spencer)", colors: ["white"], reason: `High-thread-count white oxford cotton creates an authoritative executive finish.` }
          ];
        } else if (anchorColor.includes("black")) {
          topOptions = [
            { term: "men light blue slim fit oxford cotton shirt (Zara OR Marks & Spencer OR Van Heusen)", colors: ["light blue"], reason: "Light blue introduces soft executive contrast against sharp black trousers." },
            { term: "men white slim fit oxford cotton shirt (Raymond OR Dennis Lingo OR Zara)", colors: ["white"], reason: "Crisp white creates stark, high-contrast monochrome polish." }
          ];
        } else if (anchorColor.includes("navy") || anchorColor.includes("blue")) {
          topOptions = [
            { term: "men crisp white formal button down oxford shirt (Raymond OR Van Heusen OR Zara)", colors: ["white"], reason: "Pure white is the definitive sartorial companion for navy trousers." },
            { term: "men light pink textured oxford cotton shirt (Marks & Spencer OR Zara)", colors: ["pink"], reason: "Subtle pastel pink warms up deep navy tailored fabric." }
          ];
        } else {
          topOptions = [
            { term: "men white slim fit oxford cotton shirt (Zara OR Marks & Spencer OR Dennis Lingo)", colors: ["white"], reason: "A crisp white button-down oxford shirt provides a clean foundation." },
            { term: "men light blue slim fit oxford cotton shirt (Raymond OR Van Heusen OR Zara)", colors: ["light blue"], reason: "Light blue brings timeless corporate versatility." }
          ];
        }
        const topPick = topOptions[seed % topOptions.length];

        const shoeOptions = [
          { term: "men minimalist white leather low top sneakers (Puma OR Comet OR Zara)", colors: ["white"], reason: "Clean low-profile white sneakers modernize the trousers for contemporary smart-office versatility." },
          { term: "men black genuine leather derby dress shoes (Bata OR Red Tape)", colors: ["black"], reason: "Polished leather derbies ensure formal business meetings remain immaculate." }
        ];
        const shoePick = shoeOptions[seed % shoeOptions.length];

        const blazerOptions = [
          { term: "men navy blue slim fit formal blazer (Van Heusen OR Raymond OR Zara)", colors: ["navy", "charcoal"], reason: "A tailored navy blazer creates the definitive menswear grey-and-navy power pairing." },
          { term: "men charcoal grey tailored slim blazer (Raymond OR Van Heusen)", colors: ["charcoal"], reason: "Charcoal adds tonal executive depth over the white shirt." }
        ];
        const layerPick = blazerOptions[seed % blazerOptions.length];

        const accOptions = [
          { term: "men black leather analog minimalist watch (Titan OR Fossil)", colors: ["black", "silver"], reason: "An understated analog dial maintains sleek executive polish." },
          { term: "men classic black genuine leather formal belt (Woodland OR Tommy Hilfiger)", colors: ["black"], reason: "Polished formal leather matches the footwear and frames the waistband." }
        ];
        const accPick = accOptions[seed % accOptions.length];

        pieces = [
          { category: "tops", categoryLabel: "Tops & Shirts", icon: "👕", searchTerm: topPick.term, stylingReason: topPick.reason, recommendedColors: topPick.colors },
          { category: "shoes", categoryLabel: "Footwear", icon: "👟", searchTerm: shoePick.term, stylingReason: shoePick.reason, recommendedColors: shoePick.colors },
          { category: "layering", categoryLabel: "Jackets & Layers", icon: "🧥", searchTerm: layerPick.term, stylingReason: layerPick.reason, recommendedColors: layerPick.colors },
          { category: "accessories", categoryLabel: "Accessories", icon: "⌚", searchTerm: accPick.term, stylingReason: accPick.reason, recommendedColors: accPick.colors }
        ];
      } else if (style === "rugged") {
        outfitTitle = "Classic Americana Rugged Look";
        overallStylingAdvice = "Denim calls for textured, durable layers. A checked flannel overshirt and leather chelsea boots deliver effortless, masculine character.";
        styleArchetype = "Rugged Americana";
        colorHarmony = "Earthy Textured Contrast";
        silhouetteBalance = "Durable Structured Layering";

        let topOptions = [];
        if (anchorColor.includes("blue") || anchorColor.includes("denim")) {
          topOptions = [
            { term: "men red black checked cotton flannel casual shirt (Roadster OR Wrangler)", colors: ["red", "black", "navy"], reason: "A checked flannel shirt adds visual texture and rugged warmth against denim." },
            { term: "men navy blue and white checked cotton flannel shirt (Wrangler OR Levi's OR Roadster)", colors: ["navy", "white"], reason: "Navy-white check creates tonal texture with rugged durability." }
          ];
        } else if (anchorColor.includes("black")) {
          topOptions = [
            { term: "men grey and black checked cotton flannel casual shirt (Roadster OR Wrangler)", colors: ["grey", "black"], reason: "Monochrome flannel checks add rugged visual depth over dark denim." },
            { term: "men white and red checked cotton flannel casual shirt (Wrangler OR Levi's)", colors: ["red", "white"], reason: "Warm red flannel check pops cleanly against black jeans." }
          ];
        } else {
          topOptions = [
            { term: "men red black checked cotton flannel casual shirt (Roadster OR Wrangler)", colors: ["red", "black"], reason: "A checked flannel shirt adds visual texture and rugged warmth." },
            { term: "men green navy checked cotton flannel casual shirt (Wrangler OR Roadster)", colors: ["green", "navy"], reason: "Forest green and navy flannel complements rugged earth tones." }
          ];
        }
        const topPick = topOptions[seed % topOptions.length];

        const shoeOptions = [
          { term: "men dark brown leather chelsea ankle boots (Woodland OR Red Tape)", colors: ["brown", "tan"], reason: "Sturdy leather chelsea boots seamlessly ground the jeans for all-day versatility." },
          { term: "men tan nubuck leather lace-up casual boots (Woodland OR Red Tape)", colors: ["tan"], reason: "Tan nubuck boots bring authentic outdoor character to the hemline." }
        ];
        const shoePick = shoeOptions[seed % shoeOptions.length];

        const layerOptions = [
          { term: "men navy blue casual cotton overshirt jacket (Mast & Harbour OR H&M)", colors: ["navy", "olive"], reason: "A solid cotton overshirt provides an easy neutral contrast over the flannel." },
          { term: "men olive green casual utility field jacket (Marks & Spencer OR Snitch)", colors: ["olive"], reason: "Field jacket introduces military utility over durable denim." }
        ];
        const layerPick = layerOptions[seed % layerOptions.length];

        const accOptions = [
          { term: "men tan brown braided genuine leather belt (Tommy Hilfiger OR Woodland)", colors: ["tan", "brown"], reason: "Rich tan leather hardware ties together the boots and waistband." },
          { term: "men dark brown full grain leather belt (Woodland OR Levi's)", colors: ["brown"], reason: "Heavyweight full grain leather ensures durable everyday functionality." }
        ];
        const accPick = accOptions[seed % accOptions.length];

        pieces = [
          { category: "tops", categoryLabel: "Tops & Shirts", icon: "👕", searchTerm: topPick.term, stylingReason: topPick.reason, recommendedColors: topPick.colors },
          { category: "shoes", categoryLabel: "Footwear", icon: "🥾", searchTerm: shoePick.term, stylingReason: shoePick.reason, recommendedColors: shoePick.colors },
          { category: "layering", categoryLabel: "Jackets & Layers", icon: "🧥", searchTerm: layerPick.term, stylingReason: layerPick.reason, recommendedColors: layerPick.colors },
          { category: "accessories", categoryLabel: "Accessories", icon: "⌚", searchTerm: accPick.term, stylingReason: accPick.reason, recommendedColors: accPick.colors }
        ];
      } else {
        // Smart Casual default
        outfitTitle = "Refined Smart-Casual Look";
        overallStylingAdvice = `Your ${item.primaryColor || "chino"} trousers provide a relaxed, versatile canvas. Pairing with a knitted polo and casual loafers creates an effortlessly sophisticated color block.`;
        styleArchetype = "Smart Casual";
        colorHarmony = "Complementary Tonal Balance";
        silhouetteBalance = "Refined Tapered Silhouette";

        let topOptions = [];
        if (anchorColor.includes("navy") || anchorColor.includes("blue")) {
          topOptions = [
            { term: "men off white solid knitted cotton polo t-shirt (Rare Rabbit OR Highlander OR Marks & Spencer)", colors: ["off white", "cream"], reason: "An off-white knitted polo creates high-contrast, polished sophistication against navy trousers." },
            { term: "men camel tan textured knitted cotton polo t-shirt (Highlander OR Rare Rabbit OR Zara)", colors: ["camel", "tan"], reason: "Camel tan warms up navy bottoms with Italian smart-casual flair." },
            { term: "men sage green knitted cotton polo t-shirt (Rare Rabbit OR Marks & Spencer)", colors: ["sage", "olive"], reason: "Muted sage green offers contemporary earthy contrast with navy." }
          ];
        } else if (anchorColor.includes("beige") || anchorColor.includes("khaki") || anchorColor.includes("tan")) {
          topOptions = [
            { term: "men navy blue solid knitted cotton polo t-shirt (Highlander OR Rare Rabbit OR H&M)", colors: ["navy", "white"], reason: `A deep navy knitted polo creates high-contrast, polished sophistication against ${item.primaryColor || "light"} chinos.` },
            { term: "men forest green solid knitted cotton polo t-shirt (Rare Rabbit OR Highlander OR H&M)", colors: ["green", "olive"], reason: "Deep forest green provides an earthy, distinguished polo contrast." },
            { term: "men rich black knitted cotton polo t-shirt (Highlander OR Snitch OR Zara)", colors: ["black"], reason: "Crisp black knits bring modern minimalist edge to neutral chinos." }
          ];
        } else if (anchorColor.includes("olive") || anchorColor.includes("green")) {
          topOptions = [
            { term: "men crisp white solid knitted cotton polo t-shirt (Highlander OR Rare Rabbit OR H&M)", colors: ["white"], reason: "Pure white offers crisp, bright contrast that makes olive trousers stand out." },
            { term: "men rich black textured knitted cotton polo t-shirt (Rare Rabbit OR Zara OR H&M)", colors: ["black"], reason: "Solid black creates a modern, sleek pairing with olive bottoms." },
            { term: "men ecru cream knitted cotton polo t-shirt (Marks & Spencer OR Rare Rabbit)", colors: ["ecru", "cream"], reason: "Ecru knit delivers relaxed, warm European smart casual." }
          ];
        } else if (anchorColor.includes("black") || anchorColor.includes("charcoal")) {
          topOptions = [
            { term: "men crisp white solid knitted cotton polo t-shirt (Highlander OR Rare Rabbit OR H&M)", colors: ["white"], reason: "Crisp white polo is the definitive monochrome contrast against black trousers." },
            { term: "men camel tan solid knitted cotton polo t-shirt (Rare Rabbit OR Zara OR H&M)", colors: ["camel", "tan"], reason: "Camel tan introduces sophisticated warmth over dark trousers." }
          ];
        } else {
          topOptions = [
            { term: "men navy blue solid knitted cotton polo t-shirt (Highlander OR Rare Rabbit OR H&M)", colors: ["navy", "white"], reason: "A deep navy knitted polo creates versatile smart-casual balance." },
            { term: "men crisp white solid knitted cotton polo t-shirt (Rare Rabbit OR Marks & Spencer)", colors: ["white"], reason: "A crisp white polo keeps the look clean and intentional." }
          ];
        }
        const topPick = topOptions[seed % topOptions.length];

        const shoeOptions = [
          { term: "men classic tan brown leather casual loafers (Red Tape OR Hush Puppies)", colors: ["tan", "brown"], reason: "Warm tan leather loafers elevate the chinos for an Italian smart-casual aesthetic." },
          { term: "men minimalist clean white leather sneakers (Puma OR Comet)", colors: ["white"], reason: "Clean leather low tops keep the look modern, relaxed, and office-ready." },
          { term: "men dark brown suede penny loafers (Red Tape OR Hush Puppies)", colors: ["brown"], reason: "Soft suede texture adds refined luxury beneath the hem." }
        ];
        const shoePick = shoeOptions[seed % shoeOptions.length];

        const layerOptions = [
          { term: "men navy blue casual cotton overshirt jacket (Mast & Harbour OR H&M)", colors: ["navy", "beige"], reason: "A neutral overshirt balances the look with relaxed, structured depth." },
          { term: "men beige relaxed cotton chore overshirt (Marks & Spencer OR Zara)", colors: ["beige"], reason: "Beige cotton adds warm neutral dimension over the polo." }
        ];
        const layerPick = layerOptions[seed % layerOptions.length];

        const accOptions = [
          { term: "men tan brown braided genuine leather belt (Tommy Hilfiger OR H&M)", colors: ["tan", "brown"], reason: "Braided leather coordinates with the loafers to cleanly frame the waistband." },
          { term: "men black leather analog minimalist watch (Titan OR Fossil)", colors: ["black", "silver"], reason: "Understated analog dial adds refined polish without distraction." }
        ];
        const accPick = accOptions[seed % accOptions.length];

        pieces = [
          { category: "tops", categoryLabel: "Tops & Shirts", icon: "👕", searchTerm: topPick.term, stylingReason: topPick.reason, recommendedColors: topPick.colors },
          { category: "shoes", categoryLabel: "Footwear", icon: "👟", searchTerm: shoePick.term, stylingReason: shoePick.reason, recommendedColors: shoePick.colors },
          { category: "layering", categoryLabel: "Jackets & Layers", icon: "🧥", searchTerm: layerPick.term, stylingReason: layerPick.reason, recommendedColors: layerPick.colors },
          { category: "accessories", categoryLabel: "Accessories", icon: "⌚", searchTerm: accPick.term, stylingReason: accPick.reason, recommendedColors: accPick.colors }
        ];
      }
    } else {
      // Women Bottoms
      if (style === "streetwear" || style === "casual") {
        outfitTitle = "Modern Athleisure Street Look";
        overallStylingAdvice = "Relaxed bottoms pair best with a cropped fitted top and chunky sneakers for an active, effortless urban silhouette.";
        styleArchetype = "Modern Athleisure";
        colorHarmony = "Sporty Clean Neutrals";
        silhouetteBalance = "Cropped Waist with Relaxed Hem";

        const topOptions = [
          { term: "women white oversized graphic drop shoulder crop tee (Bonkers Corner OR H&M)", colors: ["white"], reason: "A boxy cropped graphic tee highlights the waistline while complementing the casual trouser cut." },
          { term: "women black boxy graphic streetwear crop t-shirt (Bonkers Corner OR Zara)", colors: ["black"], reason: "Black crop tee provides clean, modern contrast." },
          { term: "women sage green ribbed scoop neck crop top (H&M OR Vero Moda)", colors: ["sage"], reason: "Soft sage green adds a fresh, muted natural pop." }
        ];
        const topPick = topOptions[seed % topOptions.length];

        pieces = [
          { category: "tops", categoryLabel: "Tops & Shirts", icon: "👚", searchTerm: topPick.term, stylingReason: topPick.reason, recommendedColors: topPick.colors },
          { category: "shoes", categoryLabel: "Footwear", icon: "👟", searchTerm: "women bata white chunky casual sneakers", stylingReason: "Chunky white sneakers add sporty height and contemporary street appeal.", recommendedColors: ["white"] },
          { category: "layering", categoryLabel: "Jackets & Layers", icon: "🧥", searchTerm: "women light blue cropped washed denim jacket (Vero Moda OR Levi's)", stylingReason: "A cropped denim jacket keeps the silhouette compact and modern.", recommendedColors: ["light blue"] },
          { category: "accessories", categoryLabel: "Accessories", icon: "👜", searchTerm: "women structured black faux leather laptop tote bag (Lavie OR Baggit)", stylingReason: "A sleek faux-leather tote elevates casual street styling.", recommendedColors: ["black"] }
        ];
      } else {
        outfitTitle = "Contemporary Parisian Chic Look";
        overallStylingAdvice = `Wide-leg ${item.primaryColor || "beige"} trousers have an elegant fluid drape. Balancing them with a fitted top and tailored blazer creates an elongated, poised silhouette.`;
        styleArchetype = "Contemporary Parisian Chic";
        colorHarmony = "Monochrome Grounding (Black & Nude)";
        silhouetteBalance = "Fluid Flared Drape with Fitted Top";

        const topOptions = [
          { term: "women black sleeveless ribbed high neck knit top (Zara OR H&M)", colors: ["black", "white"], reason: "A fitted black high-neck top provides clean visual contrast and balances the voluminous trousers." },
          { term: "women crisp white cowl neck satin blouse (Mango OR Vero Moda)", colors: ["white"], reason: "Lustrous white satin brings elegant texture and fluid elegance." },
          { term: "women beige ribbed sweetheart neck knit top (Marks & Spencer OR Zara)", colors: ["beige"], reason: "Soft beige ribbing maintains tonal sophistication." }
        ];
        const topPick = topOptions[seed % topOptions.length];

        pieces = [
          { category: "tops", categoryLabel: "Tops & Shirts", icon: "👚", searchTerm: topPick.term, stylingReason: topPick.reason, recommendedColors: topPick.colors },
          { category: "shoes", categoryLabel: "Footwear", icon: "👠", searchTerm: "women carlton london nude pointed toe block heels", stylingReason: "Pointed-toe nude block heels elongate the leg line beneath wide-leg hems.", recommendedColors: ["nude", "black"] },
          { category: "layering", categoryLabel: "Jackets & Layers", icon: "🧥", searchTerm: "women marks spencer beige double breasted relaxed blazer", stylingReason: "A relaxed double-breasted blazer creates a coordinated, power-dressing statement.", recommendedColors: ["beige", "black"] },
          { category: "accessories", categoryLabel: "Accessories", icon: "✨", searchTerm: "women minimalist 18k gold plated layered chain hoop earrings (AccessHer OR Zaveri)", stylingReason: "Delicate gold hardware adds warm, luxurious accents near the neckline.", recommendedColors: ["gold"] }
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

    if (gender === "men") {
      let botOptions = [];
      if (anchorColor.includes("black") || anchorColor.includes("dark")) {
        botOptions = [
          { term: "men light grey slim fit stretch chino trousers (Highlander OR Zara)", colors: ["grey", "light grey"], reason: "Light grey chinos provide high-contrast separation against the dark top." },
          { term: "men off white relaxed fit cotton chino trousers (Marks & Spencer OR Zara)", colors: ["off white", "cream"], reason: "Off-white pants create an effortless, high-contrast monochrome look." },
          { term: "men vintage light wash relaxed denim jeans (Levi's OR Flying Machine)", colors: ["light blue", "denim"], reason: "Washed blue denim softens the black top with casual texture." }
        ];
      } else if (anchorColor.includes("white") || anchorColor.includes("cream") || anchorColor.includes("ecru")) {
        botOptions = [
          { term: "men deep navy blue slim fit stretch chino trousers (Highlander OR Zara)", colors: ["navy"], reason: "Deep navy trousers provide the classic grounding contrast for a clean white top." },
          { term: "men dark olive utility cargo joggers (Snitch OR Bonkers Corner)", colors: ["olive"], reason: "Dark olive brings earthy street dimension beneath a crisp top." },
          { term: "men charcoal grey tailored pleated formal trousers (Raymond OR Van Heusen)", colors: ["charcoal", "grey"], reason: "Charcoal pleats deliver sharp, elongated proportions with a white top." }
        ];
      } else if (anchorColor.includes("navy") || anchorColor.includes("blue")) {
        botOptions = [
          { term: "men beige slim fit stretch chino trousers (Highlander OR Zara)", colors: ["beige", "tan"], reason: "Beige chinos are the premier complementary partner to rich navy tops." },
          { term: "men ecru off white relaxed cotton chino trousers (Marks & Spencer OR H&M)", colors: ["ecru", "white"], reason: "Ecru pants create Riviera-inspired elegance with navy." },
          { term: "men light grey textured casual chinos (Snitch OR Rare Rabbit)", colors: ["grey"], reason: "Cool light grey balances navy with modern corporate polish." }
        ];
      } else if (anchorColor.includes("olive") || anchorColor.includes("green")) {
        botOptions = [
          { term: "men black slim fit stretch cargo pants (Bonkers Corner OR Snitch)", colors: ["black"], reason: "Black cargo pants ground the olive top with authentic utility character." },
          { term: "men dark indigo raw denim jeans (Levi's OR Flying Machine)", colors: ["indigo", "dark blue"], reason: "Raw dark indigo denim pairs naturally with olive tones." },
          { term: "men beige cotton chino trousers (Highlander OR Rare Rabbit)", colors: ["beige"], reason: "Warm beige chinos create an earthy safari aesthetic with olive." }
        ];
      } else {
        botOptions = [
          { term: "men beige slim fit stretch chino trousers (Highlander OR Zara)", colors: ["beige", "navy", "black"], reason: `Straight-fit neutral trousers anchor your ${item.title || "top"} without competing for attention.` },
          { term: "men deep navy blue slim fit stretch chino trousers (Highlander OR Zara)", colors: ["navy"], reason: "Deep navy chinos provide balanced anchoring for your top." }
        ];
      }
      const botPick = botOptions[seed % botOptions.length];

      const shoeOptions = [
        { term: "men minimalist white leather low top sneakers (Puma OR Comet)", colors: ["white"], reason: "Crisp low-profile sneakers maintain casual versatility and match the relaxed vibe." },
        { term: "men classic tan brown leather casual loafers (Red Tape OR Hush Puppies)", colors: ["tan", "brown"], reason: "Tan loafers bring refined smart-casual character beneath the hem." }
      ];
      const shoePick = shoeOptions[seed % shoeOptions.length];

      const layerOptions = [
        { term: "men navy blue casual cotton overshirt jacket (Mast & Harbour OR H&M)", colors: ["navy", "denim"], reason: "An unbuttoned lightweight layer adds dimension while keeping the top visible." },
        { term: "men olive green casual utility overshirt jacket (Snitch OR Zara)", colors: ["olive"], reason: "Olive overshirt introduces contemporary texture." }
      ];
      const layerPick = layerOptions[seed % layerOptions.length];

      pieces = [
        { category: "bottoms", categoryLabel: "Pants & Trousers", icon: "👖", searchTerm: botPick.term, stylingReason: botPick.reason, recommendedColors: botPick.colors },
        { category: "shoes", categoryLabel: "Footwear", icon: "👟", searchTerm: shoePick.term, stylingReason: shoePick.reason, recommendedColors: shoePick.colors },
        { category: "layering", categoryLabel: "Jackets & Layers", icon: "🧥", searchTerm: layerPick.term, stylingReason: layerPick.reason, recommendedColors: layerPick.colors },
        { category: "accessories", categoryLabel: "Accessories", icon: "⌚", searchTerm: "men titan black leather analog minimalist watch", stylingReason: "Understated accessories complete the outfit with polished finesse.", recommendedColors: ["black", "tan"] }
      ];
    } else {
      // Women Top
      const botOptions = [
        { term: "women beige high waist wide leg straight trouser (Kotty OR Zara)", colors: ["beige"], reason: "High-waist wide-leg beige trousers create an elongated, poised line." },
        { term: "women black high waist wide leg straight trouser (Kotty OR Zara)", colors: ["black"], reason: "Crisp black trousers provide sharp neutral framing." }
      ];
      const botPick = botOptions[seed % botOptions.length];

      pieces = [
        { category: "bottoms", categoryLabel: "Pants & Trousers", icon: "👖", searchTerm: botPick.term, stylingReason: botPick.reason, recommendedColors: botPick.colors },
        { category: "shoes", categoryLabel: "Footwear", icon: "👟", searchTerm: "women bata white chunky casual sneakers", stylingReason: "Crisp white sneakers keep the outfit active and approachable.", recommendedColors: ["white"] },
        { category: "layering", categoryLabel: "Jackets & Layers", icon: "🧥", searchTerm: "women light blue cropped washed denim jacket", stylingReason: "Cropped denim jacket adds casual structure without overwhelming.", recommendedColors: ["light blue"] },
        { category: "accessories", categoryLabel: "Accessories", icon: "👜", searchTerm: "women structured black faux leather laptop tote bag", stylingReason: "Structured tote delivers sleek everyday polish.", recommendedColors: ["black"] }
      ];
    }
  } else if (isDress) {
    outfitTitle = "Elevated Occasion Ensemble";
    overallStylingAdvice = "Your dress creates the single silhouette. Complementing it with delicate strappy heels, structured layering, and metallic accents completes a stunning look.";
    styleArchetype = "Evening Occasion";
    colorHarmony = "Metallic Accents on Neutral Base";
    silhouetteBalance = "Elongated Single-Piece Line";
    pieces = [
      { category: "shoes", categoryLabel: "Footwear", icon: "👠", searchTerm: "women carlton london nude pointed toe block heels", stylingReason: "Nude block heels flatter the dress hemline and provide comfortable height.", recommendedColors: ["nude", "gold", "black"] },
      { category: "layering", categoryLabel: "Jackets & Shrugs", icon: "🧥", searchTerm: "women marks spencer beige double breasted relaxed blazer", stylingReason: "A tailored blazer draped over the shoulders adds evening polish and warmth.", recommendedColors: ["beige", "black"] },
      { category: "accessories", categoryLabel: "Handbags & Clutches", icon: "👛", searchTerm: "women structured black faux leather laptop tote bag", stylingReason: "A structured clutch or mini tote organizes essentials while complementing the formal drape.", recommendedColors: ["black", "metallic"] },
      { category: "jewelry", categoryLabel: "Jewelry", icon: "✨", searchTerm: "women minimalist 18k gold plated layered chain hoop earrings", stylingReason: "Minimalist gold hoops frame the face and illuminate the neckline.", recommendedColors: ["gold"] }
    ];
  } else if (isShoes) {
    const isSneaker = /sneaker|skate|court|runner|trainer|running|casual|low top|chunky/i.test(text);
    const isBoot = /boot|chelsea|hiking|workwear/i.test(text);

    if (gender === "men") {
      if (isSneaker) {
        outfitTitle = "Clean Contemporary Street Coordinates";
        overallStylingAdvice = `Starting from your ${item.title || "sneakers"}, relaxed proportions and clean modern separates provide effortless street-ready balance.`;
        styleArchetype = "Contemporary Street Casual";
        colorHarmony = "Earthy Grounded Neutrals";
        silhouetteBalance = "Volume-Balanced Street Proportion";

        const botOptions = [
          { term: "men beige slim fit stretch chino trousers (Highlander OR Zara)", colors: ["beige", "tan"], reason: "Beige chinos dress up casual sneakers with a sharp smart-casual edge." },
          { term: "men black relaxed utility cargo pants (Snitch OR Bonkers Corner)", colors: ["black"], reason: "Black utility cargos bring street-style volume to frame the footwear." },
          { term: "men light blue relaxed tapered denim jeans (Levi's OR Flying Machine)", colors: ["light blue"], reason: "Light wash relaxed denim complements low-profile sneakers effortlessly." }
        ];
        const botPick = botOptions[seed % botOptions.length];

        const topOptions = [
          { term: "men white oversized graphic cotton streetwear t-shirt (Snitch OR Puma)", colors: ["white"], reason: "A crisp graphic tee echoes the clean sporty vibe of the sneakers." },
          { term: "men ecru off white boxy heavyweight cotton t-shirt (Snitch OR Zara)", colors: ["ecru", "white"], reason: "Ecru heavyweight cotton creates modern, understated neutral harmony." },
          { term: "men navy blue solid knitted cotton polo t-shirt (Highlander OR Rare Rabbit)", colors: ["navy"], reason: "Knitted navy polo adds refined texture above the casual footwear." }
        ];
        const topPick = topOptions[seed % topOptions.length];

        const layerOptions = [
          { term: "men navy blue casual cotton overshirt jacket (Mast & Harbour OR H&M)", colors: ["navy", "denim"], reason: "A lightweight overshirt adds effortless layering over the tee." },
          { term: "men olive green casual utility field jacket (Snitch OR Zara)", colors: ["olive"], reason: "Utility field jacket introduces rugged outdoor character." },
          { term: "men beige relaxed fit cotton chore overshirt (Zara OR Marks & Spencer)", colors: ["beige"], reason: "Beige chore overshirt provides refined casual structure." }
        ];
        const layerPick = layerOptions[seed % layerOptions.length];

        const accOptions = [
          { term: "men matte black digital tactical sports watch (Casio OR Fastrack)", colors: ["black"], reason: "Sporty matte tactical hardware pairs naturally with athletic footwear." },
          { term: "men tan brown braided genuine leather belt (Tommy Hilfiger OR H&M)", colors: ["tan", "brown"], reason: "Braided leather provides a refined, textured transition at the waist." }
        ];
        const accPick = accOptions[seed % accOptions.length];

        pieces = [
          { category: "bottoms", categoryLabel: "Pants & Trousers", icon: "👖", searchTerm: botPick.term, stylingReason: botPick.reason, recommendedColors: botPick.colors },
          { category: "tops", categoryLabel: "Tops & Shirts", icon: "👕", searchTerm: topPick.term, stylingReason: topPick.reason, recommendedColors: topPick.colors },
          { category: "layering", categoryLabel: "Jackets & Layers", icon: "🧥", searchTerm: layerPick.term, stylingReason: layerPick.reason, recommendedColors: layerPick.colors },
          { category: "accessories", categoryLabel: "Accessories", icon: "⌚", searchTerm: accPick.term, stylingReason: accPick.reason, recommendedColors: accPick.colors }
        ];
      } else if (isBoot) {
        outfitTitle = "Rugged Heritage Coordinated Look";
        overallStylingAdvice = "Sturdy boots anchor the outfit with rugged weight. Pairing with durable denim, a flannel shirt, and structured utility layering completes the masculine look.";
        styleArchetype = "Rugged Americana";
        colorHarmony = "Earthy Textured Palette";
        silhouetteBalance = "Grounded Structured Hem";

        const botPick = { term: "men dark indigo raw denim jeans (Levi's OR Flying Machine)", colors: ["indigo", "dark blue"], reason: "Heavyweight dark denim stacks naturally over sturdy boot collars." };
        const topPick = { term: "men red black checked cotton flannel casual shirt (Roadster OR Wrangler)", colors: ["red", "black"], reason: "Flannel check brings timeless workwear texture above the boots." };
        const layerPick = { term: "men olive green casual utility field jacket (Snitch OR Marks & Spencer)", colors: ["olive"], reason: "A military utility field jacket complements the durable footwear." };
        const accPick = { term: "men dark brown full grain leather belt (Woodland OR Levi's)", colors: ["brown"], reason: "Full grain leather hardware matches the rugged boot finish." };

        pieces = [
          { category: "bottoms", categoryLabel: "Pants & Trousers", icon: "👖", searchTerm: botPick.term, stylingReason: botPick.reason, recommendedColors: botPick.colors },
          { category: "tops", categoryLabel: "Tops & Shirts", icon: "👕", searchTerm: topPick.term, stylingReason: topPick.reason, recommendedColors: topPick.colors },
          { category: "layering", categoryLabel: "Jackets & Layers", icon: "🧥", searchTerm: layerPick.term, stylingReason: layerPick.reason, recommendedColors: layerPick.colors },
          { category: "accessories", categoryLabel: "Accessories", icon: "⌚", searchTerm: accPick.term, stylingReason: accPick.reason, recommendedColors: accPick.colors }
        ];
      } else {
        // Loafers / Formal / Dress Shoes
        outfitTitle = "Refined Sartorial Footwear Coordinates";
        overallStylingAdvice = "Dress shoes demand tailored hemlines and crisp collar lines. Tailored trousers with no break allow the footwear silhouette to shine.";
        styleArchetype = "Sartorial Smart Casual";
        colorHarmony = "Classic Executive Contrast";
        silhouetteBalance = "Clean No-Break Tailored Line";

        const botOptions = [
          { term: "men peter england charcoal grey slim fit formal trousers (Peter England OR Raymond)", colors: ["charcoal", "grey"], reason: "Tailored charcoal trousers showcase the shoe silhouette with immaculate drape." },
          { term: "men beige slim fit stretch chino trousers (Highlander OR Zara)", colors: ["beige", "tan"], reason: "Beige chinos bring European smart-casual flair alongside dress loafers." }
        ];
        const botPick = botOptions[seed % botOptions.length];

        const topOptions = [
          { term: "men white slim fit oxford cotton shirt (Dennis Lingo OR Marks & Spencer)", colors: ["white"], reason: "A crisp white button-down provides timeless sartorial elegance." },
          { term: "men navy blue solid knitted cotton polo t-shirt (Highlander OR Rare Rabbit)", colors: ["navy"], reason: "A knitted polo softens formal shoes into elevated business casual." }
        ];
        const topPick = topOptions[seed % topOptions.length];

        const layerPick = { term: "men navy blue slim fit structured formal blazer (Van Heusen OR Raymond)", colors: ["navy"], reason: "A tailored navy blazer elevates the look into authoritative smart-office elegance." };
        const accPick = { term: "men titan black leather analog minimalist watch (Titan OR Fossil)", colors: ["black"], reason: "A clean analog dial mirrors the refined craftsmanship of the footwear." };

        pieces = [
          { category: "bottoms", categoryLabel: "Pants & Trousers", icon: "👖", searchTerm: botPick.term, stylingReason: botPick.reason, recommendedColors: botPick.colors },
          { category: "tops", categoryLabel: "Tops & Shirts", icon: "👕", searchTerm: topPick.term, stylingReason: topPick.reason, recommendedColors: topPick.colors },
          { category: "layering", categoryLabel: "Jackets & Layers", icon: "🧥", searchTerm: layerPick.term, stylingReason: layerPick.reason, recommendedColors: layerPick.colors },
          { category: "accessories", categoryLabel: "Accessories", icon: "⌚", searchTerm: accPick.term, stylingReason: accPick.reason, recommendedColors: accPick.colors }
        ];
      }
    } else {
      // Women Shoes
      if (isSneaker) {
        outfitTitle = "Sporty Chic Daily Coordinates";
        overallStylingAdvice = "Clean sneakers call for easy, flowing bottom silhouettes and structured casual layers.";
        styleArchetype = "Sporty Chic";
        colorHarmony = "Crisp Fresh Neutrals";
        silhouetteBalance = "Fluid Leg with Cropped Upper";

        pieces = [
          { category: "bottoms", categoryLabel: "Pants & Trousers", icon: "👖", searchTerm: "women beige high waist wide leg straight trouser (Kotty OR Zara)", stylingReason: "Wide-leg trousers pooling slightly over chunky sneakers creates a contemporary street proportion.", recommendedColors: ["beige", "white"] },
          { category: "tops", categoryLabel: "Tops & Shirts", icon: "👚", searchTerm: "women white oversized graphic drop shoulder crop tee (Bonkers Corner OR H&M)", stylingReason: "A cropped tee balances the high waistband and sneaker volume.", recommendedColors: ["white"] },
          { category: "layering", categoryLabel: "Jackets & Layers", icon: "🧥", searchTerm: "women light blue cropped washed denim jacket (Vero Moda OR Levi's)", stylingReason: "A denim jacket delivers effortless casual layering.", recommendedColors: ["light blue"] },
          { category: "accessories", categoryLabel: "Accessories", icon: "👜", searchTerm: "women structured black faux leather laptop tote bag (Lavie OR Baggit)", stylingReason: "A sleek tote elevates the sporty aesthetic for city errands.", recommendedColors: ["black"] }
        ];
      } else {
        // Heels / Loafers / Flats
        outfitTitle = "Polished Feminine Footwear Coordinates";
        overallStylingAdvice = "Elegant heels or loafers elevate tailored separates with poised sophistication.";
        styleArchetype = "Contemporary Feminine";
        colorHarmony = "Refined Tonal Palette";
        silhouetteBalance = "Elongated Drape";

        pieces = [
          { category: "bottoms", categoryLabel: "Pants & Trousers", icon: "👖", searchTerm: "women black high rise flared stretch trousers (Kotty OR Zara)", stylingReason: "Flared trousers break gracefully over heels to elongate the silhouette.", recommendedColors: ["black"] },
          { category: "tops", categoryLabel: "Tops & Shirts", icon: "👚", searchTerm: "women white regular fit solid formal shirt (Tokyo Talkies OR Zara)", stylingReason: "A crisp formal shirt anchors the sophisticated footwear.", recommendedColors: ["white"] },
          { category: "layering", categoryLabel: "Jackets & Layers", icon: "🧥", searchTerm: "women marks spencer beige double breasted relaxed blazer", stylingReason: "A structured blazer ties the tailored outfit together.", recommendedColors: ["beige"] },
          { category: "accessories", categoryLabel: "Accessories", icon: "✨", searchTerm: "women minimalist 18k gold plated layered chain hoop earrings (AccessHer OR Zaveri)", stylingReason: "Warm metallic accents match the formal tone of the footwear.", recommendedColors: ["gold"] }
        ];
      }
    }
  } else {
    outfitTitle = "Smart-Casual Coordinated Look";
    overallStylingAdvice = "A versatile, balanced pairing designed to coordinate effortlessly with your wardrobe item.";
    styleArchetype = "Smart Casual";
    colorHarmony = "Harmonious Complementary Contrast";
    silhouetteBalance = "Volume-Balanced Proportion";
    pieces = [
      { category: "tops", categoryLabel: "Tops & Shirts", icon: "👕", searchTerm: `${gender} white cotton casual shirt`, stylingReason: "A versatile white shirt completes the foundation.", recommendedColors: ["white"] },
      { category: "shoes", categoryLabel: "Footwear", icon: "👟", searchTerm: `${gender} white minimalist sneakers`, stylingReason: "Clean sneakers keep the outfit modern and approachable.", recommendedColors: ["white"] },
      { category: "layering", categoryLabel: "Jackets & Layers", icon: "🧥", searchTerm: `${gender} casual overshirt jacket`, stylingReason: "Layering adds depth and structure.", recommendedColors: ["navy"] },
      { category: "accessories", categoryLabel: "Accessories", icon: "⌚", searchTerm: `${gender} leather belt watch`, stylingReason: "Refined accessories complete the outfit.", recommendedColors: ["black"] }
    ];
  }

  const normalizedPieces = pieces.map((p) => {
    const normIntent = normalizePieceIntent(p, gender);
    return {
      ...p,
      intent: normIntent,
      searchTerm: p.searchTerm || buildQueryLatticeFromIntent(normIntent, gender)[0],
      recommendedColors: (Array.isArray(p.recommendedColors) && p.recommendedColors.length > 0) ? p.recommendedColors : normIntent.allowedColors,
      stylingReason: p.stylingReason || normIntent.reason
    };
  });

  const primary = normalizedPieces.find((p) => p.category === targetCategory) || normalizedPieces[0];

  return {
    _geminiModelUsed: null,
    outfitTitle,
    overallStylingAdvice,
    styleArchetype,
    colorHarmony,
    silhouetteBalance,
    pieces: normalizedPieces,
    targetCategory: primary.category,
    searchTerm: primary.searchTerm,
    stylingReason: primary.stylingReason,
    recommendedColors: primary.recommendedColors || [],
    alternativeCategories: normalizedPieces.filter((p) => p !== primary).map((p) => ({
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

  const isAnchorJacket = /jacket|coat|blazer|cardigan|shrug|vest|bomber|parka|windbreaker|anorak|trench|overcoat/i.test(anchorLower);
  const isAnchorBottom = !isAnchorJacket && /bottom|pant|trouser|jean|skirt|short|chino|legging|palazzo/i.test(anchorLower);
  const isAnchorTop = !isAnchorJacket && /top|shirt|tee|t-shirt|blouse|kurta|sweater|hoodie|polo/i.test(anchorLower);
  const isAnchorShoes = !isAnchorJacket && /shoe|sneaker|boot|sandal|heel|loafer/i.test(anchorLower);
  const isAnchorDress = !isAnchorJacket && /dress|gown|jumpsuit/i.test(anchorLower);

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
    if (isAnchorJacket) {
      const isLayer = /\b(jacket|jackets|blazer|blazers|overshirt|overshirts|coat|coats|shrug|cardigan|vest|bomber|parka|windbreaker)\b/i.test(title) || itemCat === "layering";
      if (isLayer) {
        return false;
      }
    } else if (isAnchorBottom) {
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
      if (isAnchorJacket) return false;
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

export function hashString(str = "") {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    hash = ((hash << 5) - hash) + str.charCodeAt(i);
    hash |= 0;
  }
  return Math.abs(hash);
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
  shuffleIndex = 0,
  sessionSeed = "",
  providerPreference = "",
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

  // Request ID and dynamic session-seeded variation index
  const requestId = "req_" + Date.now().toString(36) + "_" + Math.random().toString(36).slice(2, 8);
  const activeSessionSeed = String(sessionSeed || "").trim() || (Math.random().toString(36).substring(2, 10) + Date.now().toString(36));
  const rawSeed = String(item.id || item.title || "") + "_" + activeSessionSeed + "_" + String(shuffleIndex || 0);
  const variationIndex = Math.abs(hashString(rawSeed)) % 5;

  // Step 1: Call Gemini AI for trending multi-piece outfit styling plan
  let stylingPlan = null;
  if (geminiKey) {
    stylingPlan = await generateStylingPlanWithGemini({
      item,
      profile,
      targetCategory,
      apiKey: geminiKey,
      shuffleIndex: variationIndex
    });
  }

  // Fallback to deterministic style-aware fashion engine if Gemini was unavailable or returned null
  if (!stylingPlan || !Array.isArray(stylingPlan.pieces) || stylingPlan.pieces.length === 0) {
    stylingPlan = getFallbackStylingPlan({
      item,
      profile,
      targetCategory,
      shuffleIndex: variationIndex
    });
  }

  const geminiModelUsed = stylingPlan?._geminiModelUsed || null;
  const minPrice = budget.min ?? budget.minPrice;
  const maxPrice = budget.max ?? budget.maxPrice;
  const pieces = stylingPlan.pieces || [];

  // Prepare normalized diverse samples for potential fallback
  const sampleNormalized = DIVERSE_SAMPLE_PRODUCTS.map((p, idx) => ({
    ...normalizeProduct(p, idx),
    category: p.category,
    gender: p.gender,
    style: p.style
  }));

  const debugSearches = [];
  const outfitCategories = [];
  let isSample = false;
  let notice = "";
  let totalLiveFound = 0;

  for (let i = 0; i < pieces.length; i++) {
    const piece = pieces[i];
    const pieceIntent = piece.intent || normalizePieceIntent(piece, gender);
    const pieceCustomQ = (piece.category === targetCategory && customQuery) ? customQuery : "";
    const queries = buildQueryLatticeFromIntent(pieceIntent, gender, pieceCustomQ);

    let rawLiveItems = [];
    let queryProvider = null;

    if (hasShoppingKey) {
      try {
        const latticeRes = await fetchShoppingLattice({
          queries,
          gl,
          hl,
          env,
          providerPreference,
          maxCandidates: 30
        });
        rawLiveItems = latticeRes.items || [];
        queryProvider = latticeRes.provider;
        if (latticeRes.hasKey && rawLiveItems.length > 0) {
          totalLiveFound += rawLiveItems.length;
        }
      } catch (err) {
        console.warn(`Lattice fetch error for ${piece.category}:`, err.message);
      }
    }

    debugSearches.push({
      category: piece.category,
      queries,
      totalRawCandidates: rawLiveItems.length,
      provider: queryProvider || (hasShoppingKey ? "shopping_api" : "sample")
    });

    // Step 2A: Validate live candidates with strict gates
    const liveValid = rawLiveItems
      .map((p, idx) => ({
        ...normalizeProduct(p, idx),
        category: piece.category,
        gender,
        _originQuery: p._originQuery || queries[0],
        _originProvider: p._originProvider || queryProvider || "unknown",
        _sourceType: "live"
      }))
      .filter(hasValidImage)
      .filter((p) => {
        const check = validateProduct(p, {
          intent: pieceIntent,
          anchorItem: item,
          gender,
          minPrice,
          maxPrice,
          allowAboveBudget,
          userPrefs
        });
        return check.valid;
      });

    let candidatePool = [...liveValid];

    // Step 2B: If fewer than 3 live items survived validation, fallback/backfill from sample catalog with STRICT validation
    if (candidatePool.length < 3) {
      const validSamples = sampleNormalized
        .filter((p) => p.category === piece.category && p.gender === gender && hasValidImage(p))
        .map((p) => ({
          ...p,
          _originQuery: "curated_sample",
          _originProvider: "sample",
          _sourceType: "sample"
        }))
        .filter((p) => {
          const check = validateProduct(p, {
            intent: pieceIntent,
            anchorItem: item,
            gender,
            minPrice,
            maxPrice,
            allowAboveBudget,
            userPrefs
          });
          return check.valid;
        });

      const existingIds = new Set(candidatePool.map((c) => c.id || c.product_id));
      for (const s of validSamples) {
        const sId = s.id || s.product_id;
        if (!existingIds.has(sId)) {
          candidatePool.push(s);
          existingIds.add(sId);
          if (candidatePool.length >= 6) break;
        }
      }
    }

    // Step 3: Deduplicate and rank products by relevance
    let deduplicated = deduplicateAndRankProducts(candidatePool, {
      userSizes,
      userPrefs,
      category: piece.category,
      anchorItem: item,
      recommendedColors: piece.recommendedColors || [],
      intent: pieceIntent,
      minPrice,
      maxPrice
    });

    // Step 4: Strict capping: Curate 3 diverse products per category with rotation offset
    const catOffset = (variationIndex * 3);
    const diversePicks = pickDiverseProductSet(deduplicated, piece.category, 3, catOffset);

    const capped = diversePicks.map((prod) => {
      const fallbackImg = getCategoryFallbackImage(piece.category, gender);
      const thumb = hasValidImage(prod) ? prod.thumbnail : fallbackImg;
      const isFallback = prod._sourceType === "sample";
      return {
        ...prod,
        thumbnail: thumb,
        image: thumb,
        stylingReason: createItemStylingReason(prod, piece, item, profile),
        category: piece.category,
        categoryLabel: piece.categoryLabel,
        icon: piece.icon,
        meta: {
          fallbackUsed: isFallback,
          source: prod._sourceType || "live",
          query: prod._originQuery || queries[0],
          provider: prod._originProvider || "unknown",
          relevanceScore: prod._relevanceScore ?? 0
        }
      };
    });

    const allAvailable = deduplicated.slice(0, 15).map((prod) => {
      const fallbackImg = getCategoryFallbackImage(piece.category, gender);
      const thumb = hasValidImage(prod) ? prod.thumbnail : fallbackImg;
      const isFallback = prod._sourceType === "sample";
      return {
        ...prod,
        thumbnail: thumb,
        image: thumb,
        stylingReason: createItemStylingReason(prod, piece, item, profile),
        category: piece.category,
        categoryLabel: piece.categoryLabel,
        icon: piece.icon,
        meta: {
          fallbackUsed: isFallback,
          source: prod._sourceType || "live",
          query: prod._originQuery || queries[0],
          provider: prod._originProvider || "unknown",
          relevanceScore: prod._relevanceScore ?? 0
        }
      };
    });

    outfitCategories.push({
      id: piece.category,
      label: piece.categoryLabel,
      icon: piece.icon,
      stylingReason: piece.stylingReason,
      searchTerm: piece.searchTerm,
      recommendedColors: piece.recommendedColors || [],
      intent: pieceIntent,
      targetSize: (piece.category === "tops" ? userSizes.top : piece.category === "bottoms" ? userSizes.bottom : piece.category === "shoes" ? userSizes.shoes : piece.category === "dresses" ? userSizes.dress : null),
      products: capped,
      allAvailableProducts: allAvailable,
      totalAvailable: deduplicated.length
    });
  }

  if (!hasShoppingKey) {
    isSample = true;
    notice = "SerpApi API key not configured in Cloudflare environment yet (Serper.dev supported as fallback). Displaying sample products for preview.";
  } else if (totalLiveFound === 0) {
    isSample = true;
    notice = "No live shopping results found for this specific query. Showing curated matches.";
  }

  const allProducts = outfitCategories.flatMap((c) => c.products);

  return {
    ok: true,
    requestId,
    sessionSeed: activeSessionSeed,
    variationIndex,
    shuffleIndex: Math.abs(Number(shuffleIndex || 0)),
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
    debug: {
      requestId,
      sessionSeed: activeSessionSeed,
      variationIndex,
      geminiModelUsed,
      searches: debugSearches
    },
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
  const shuffleIndex = Number(body.shuffleIndex ?? body.shuffle ?? 0);
  const sessionSeed = String(body.sessionSeed ?? body.seed ?? "").trim();
  const providerPreference = String(body.providerPreference || body.shoppingProvider || body.provider || "").trim();
  const gl = body.gl || "in";
  const hl = body.hl || "en";

  const result = await handleCompleteLook({
    item,
    profile,
    budget,
    allowAboveBudget,
    targetCategory,
    customQuery,
    shuffleIndex,
    sessionSeed,
    providerPreference,
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
  const shuffleIndex = Number(url.searchParams.get("shuffle") || url.searchParams.get("shuffleIndex") || 0);
  const sessionSeed = String(url.searchParams.get("sessionSeed") || url.searchParams.get("seed") || "").trim();
  const providerPreference = String(url.searchParams.get("provider") || url.searchParams.get("providerPreference") || "").trim();

  const result = await handleCompleteLook({
    item: { title, category, subCategory, primaryColor },
    profile: { gender },
    budget: { min: minPrice, max: maxPrice },
    allowAboveBudget,
    targetCategory,
    customQuery,
    shuffleIndex,
    sessionSeed,
    providerPreference,
    env
  });

  return apiResponse(result, result.status || 200);
}
