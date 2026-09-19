import { json, clean } from "../../_shared/firebase-rest.mjs";

export const SAMPLE_SHOPPING_RESULTS = [
  {
    position: 1,
    title: "KOTTY Women's Beige High Waist Wide Leg Straight Trouser for Formal and Office Wear",
    product_id: "14438293742031902146",
    product_link: "https://www.google.com/search?ibp=oshop&q=women+beige+wide+leg+trousers&prds=catalogid:14438293742031902146,productid:3738998951942479073",
    source: "Amazon.in",
    source_icon: "https://serpapi.com/images/i/iVBORw0KGgoAAAANSUhEUgAAACAAAAAgCAYAAABzenr0AAABe0lEQVRYhe2XMW7CMBSGP5uKibkXaKUwcAfoBQhzWaouVByAFVh7AESlVmIpM3AB0jswwNADlDkTEkmHl9AkEFFKwB34JCtxbOf_37MT6Ski-E9cs6IJ1IASkCMb1sAMGJGnp_oswwG1EX_gHs0LUMhINA0Xj4YaMNwYCMTfTywcx6OuBgxVkPZPTh95Epc8NzrY83OLAxRY0dTIgTNFTSOn3RQlTXaf2l_IaYPiAFwMXAzEDdid7BXsDrSm8OZLS2hsZ2DHpKOYOzDuwvMdLByotmPDV7HeOBCOTgqfHYPdFhOLD2mpBnaZqLZh0pX7uSNR7MOqiKhVkf6kK-taU8lEBOU_4qe-pFjZStmGhSPRWOX4muSccSAebmsio-kGotiddCNp5kLhPfzOQEgYYTG4WmXJwtz5ET6QwwycgH_2I7oYMGRgbVB_rZGKxRQzDYwMGhiZLUw0t1r1WeLROLM4eDTUK18aQA0Y4lEH3DNIu2FdCJHqGMyU599-1oDHJ9NWzAAAAABJRU5ErkJggg.png",
    price: "₹470",
    extracted_price: 470,
    thumbnail: "https://encrypted-tbn1.gstatic.com/shopping?q=tbn:ANd9GcTL5ATfHGZU9A89rZX2-3CF_uc2LFdvreGkZpkLGgtNe0fp3wtEOTRI8g_6vLIfA1XnF73b4oMzPpELazLABtoBHKAtLlIAMjrMtrwshunTwcdA5fiBwf_OXCo",
    delivery: "Free delivery"
  },
  {
    position: 2,
    title: "SUGNAA Women Relaxed Straight Leg Wide Leg High-Rise Linen No Fly Trousers by Myntra",
    product_id: "8196727060644688268",
    product_link: "https://www.google.com/search?ibp=oshop&q=women+beige+wide+leg+trousers&prds=catalogid:8196727060644688268,productid:3007055833705743225",
    source: "Myntra",
    source_icon: "https://serpapi.com/images/i/_9j_4AAQSkZJRgABAQAAAQABAAD_2wCEAAkGBwgHBgkIBwgKCgkLDRYPDQwMDRsUFRAWIB0iIiAdHx8kKDQsJCYxJx8fLT0tMTU3Ojo6Iys_RD84QzQ5OjcBCgoKDQwNGg8PGjclHyM3Nzc3Nzc3NzU3Nzc3Nzc3NzcyNzA3Nzc0Nzc3Nzc3Nzc1NzU3Nzc3Nzc1MSw4Nzc4Mf_AABEIACAAIAMBEQACEQEDEQH_xAAZAAADAAMAAAAAAAAAAAAAAAAAAwYCBAf_xAAnEAABAwIFBAIDAAAAAAAAAAABAgMRAAQGEiExQRNRYZEFFGJxof_EABoBAQACAwEAAAAAAAAAAAAAAAADBQECBgT_xAAsEQABAgMFBQkAAAAAAAAAAAAAAQIDBBEFITEy8BNBYXGBEiJCUZGhwdHh_9oADAMBAAIRAxEAPwDthVFAGvJ9UASeD7oACpoBYOp9VkEq1ipT2Irhhsj6FusMqMbkyCufBBH6BPIjzzkR0q6Ersr69MKF0tlKko2Iudb6cPLXI17HGLj2KPrOZR8Y-rosHLqFjZU85p24lPmZZV6TMJ72-FadKJfrcSRbH7EntEzpeqcPz7LInUeq3KEU4VdNYbMLIOU-aGW0qlcCT-Owq7aYZetFOIN86ouFQnKDEAd4j-k1HajEnW0bdTAvY9rtiTiRETuJd811uF32EHV4etre2cbTfsuF3qGQCpUSJieE6_iK3s1qSjOw6-uOvY2g2y1Jtz3ouzclKctL6llJMTvuayc-YE0AZj2oAzHtQADFAf_Z.jpeg",
    price: "₹890",
    extracted_price: 890,
    thumbnail: "https://encrypted-tbn0.gstatic.com/shopping?q=tbn:ANd9GcShNXwnmXNRQMI0BVkf7osx5wjp9EffhTmBCEJ6ILRCkvT_i30-ExcB8Nx5JIE55tLq68NrvzSXk-SaioRanQBa-MRTpX1sNG1fnEPfKkJsJHwBdRVPBFf9",
    delivery: "Free delivery by Wed"
  },
  {
    position: 3,
    title: "High-Rise Drawstring Wide Leg Pants",
    product_id: "242494846741766832",
    product_link: "https://www.google.com/search?ibp=oshop&q=women+beige+wide+leg+trousers&prds=catalogid:242494846741766832,productid:6684666590533530326",
    source: "Littlebox India",
    source_icon: "https://serpapi.com/images/i/iVBORw0KGgoAAAANSUhEUgAAACAAAAAgCAMAAABEpIrGAAAAeFBMVEVHcExJOj4AAAAAAADb19YAAAAAAAAGCAcAAAAAAACpZ3oAAAD____38u_9-fbo5ePEwcD_mLS6uLf-ka6tqajz6-l3dnZmZWTS0M5UU1Lw398tLi3Nycicm5j8vcx_fn6OjYv-0trIh5iGhYQcGhr5ydP9ssS6bIH2bH2rAAAAC3RSTlMA98co_qJLEJDo-FLAUuEAAAHcSURBVDiNbVPtgqMwCNSu3epCICbG72qr7d77v-GRpG517-aXmUwAB0iSNz7zUwFQnPLP5D-4nKE2jAI2NZwvv-9zqHCHCvLj82IOvF6b5jaGz7nYBfkAHZ-9EIJp-Hi9zpiImdUAP0g9IWwWBMpO5bdjOMC5bztZ5dNceluWtn8cBUNkQ4SnLe1z9eRecZ3Kshx9hLORLycUX7e7qvFJhK7OIgCWAFdoiHyZIQohOjaTlXfib02TdbVW1UiqAa3X2ZCuHJneTlh_JrnB3jrNHYD2P0YCA9CxcZbR5MmJkZ9txl2aAqkAgm5o3Hh_KuRTUiCaWbzqNEIfBRlg1VDGjZheJCC2Q81UwQw9sTaOWljBUFaDNAi8QCpvCTsYUEpc9YgPaJA0wMMLJEW05d6G_KS0Vu29nLwrPsWJfRcGut9fJaoxU_7kvWcpMjdZ6PC6ovoB1rfQ-0znYlQbDdbNFkLJL0UuE6MSiIcBriJwUXCD2NwWfLO6V486IzPiy-yrjap9sy6HJpO83uESB_qNG1G9O75Gu3hfszFOzdu52IZ-I2SWF5loOiTYKzTyskiPf9_7xYlFY_tnabGJ8Y_bFysdzbKYdl_fYXkFqS2DRf8ur4esf_r1lR7X_y9KWDDjhxB2vgAAAABJRU5ErkJggg.png",
    price: "₹749",
    extracted_price: 749,
    thumbnail: "https://encrypted-tbn2.gstatic.com/shopping?q=tbn:ANd9GcQRq-Wp-Hb0BJsTaHeVGaN1Z8QzSNbuDyrSPC-EI0XCY1kUvI3zeSuBRuk56yZawAYNBbVZgVYBzZg8DKti5kSKcP8amALJwmXo-AyXX7dL",
    delivery: "Free delivery"
  },
  {
    position: 4,
    title: "FIG Women Wide-Leg Flat-Front Trousers For Women",
    product_id: "10710998650056527544",
    product_link: "https://www.google.com/search?ibp=oshop&q=women+beige+wide+leg+trousers&prds=catalogid:10710998650056527544,productid:12108189216424291401",
    source: "AJIO.com",
    price: "₹560",
    extracted_price: 560,
    old_price: "49% off₹1,099",
    extracted_old_price: 1099,
    thumbnail: "https://encrypted-tbn0.gstatic.com/shopping?q=tbn:ANd9GcSM5-FgXdPs4xg5hrjqTC7ZEb7RYy4RX9glNEeckXhjOdnznD8m7ZbzCfyJYDWH-3qTD9Ztnycvwd6Tqlg8yHz6-ZmH3rJv1H5MHlRehfshfreWSgKli_byBQ",
    delivery: "Free delivery by Wed"
  },
  {
    position: 5,
    title: "The Roadster Life Co Women Wide Leg High-Rise Pleated Parallel Trousers",
    product_id: "6687162443175364746",
    product_link: "https://www.google.com/search?ibp=oshop&q=women+beige+wide+leg+trousers&prds=catalogid:6687162443175364746,productid:1687043897508883801",
    source: "Myntra",
    price: "₹599",
    extracted_price: 599,
    thumbnail: "https://encrypted-tbn3.gstatic.com/shopping?q=tbn:ANd9GcQZtbF2nQgVDbQwESIBkcjE235C35pYEx3p6cDCUjVQV1oqoH4DyCjNO27nflsYwzAAjtBxDzx5Wh8-Mg41ABHUMCHhL8qV0a5o8K2CkN3K440GoPewRSxW8A",
    delivery: "Free delivery by Wed"
  },
  {
    position: 6,
    title: "Women's High Waisted Pleated Trousers Beige Wide Leg Pant Solid Formal Pants",
    product_id: "17197061244863856029",
    product_link: "https://www.google.com/search?ibp=oshop&q=women+beige+wide+leg+trousers&prds=catalogid:17197061244863856029,productid:6004887307088687763",
    source: "Amazon.in",
    price: "₹399",
    extracted_price: 399,
    thumbnail: "https://encrypted-tbn2.gstatic.com/shopping?q=tbn:ANd9GcRluSO1sEPFGInoooeU15Z89gDptwjvub2p0ekI3vaSAidFwo2QSk6-2GGoXZt_cjXO4K92JldrPa564O2mo3z1BkqTKU4BvP-VpTJd1zrSFAmwaPgKT0pTCQ",
    delivery: "Free delivery"
  },
  {
    position: 7,
    title: "Levis Beige Wide Leg Fit Women High Rise Trousers",
    product_id: "16068879826893503948",
    product_link: "https://www.google.com/search?ibp=oshop&q=women+beige+wide+leg+trousers&prds=catalogid:16068879826893503948,productid:18421762385130267849",
    source: "Myntra",
    price: "₹1,799",
    extracted_price: 1799,
    thumbnail: "https://encrypted-tbn1.gstatic.com/shopping?q=tbn:ANd9GcQH2AtsTqWWluXkqH3uIv_w19Dq4grd_lv7HO-UZzWUx12P3-3KfYINYBAe9lU2pF9LMJsLFedeAhO6APxIw5lV5b0QF0DTbU1Arh8pNLdPWLNdl5YbBdbQpA",
    delivery: "Free delivery by Wed"
  },
  {
    position: 8,
    title: "NEWME Women's Wide Leg Trousers",
    product_id: "8245332609135372535",
    product_link: "https://www.google.com/search?ibp=oshop&q=women+beige+wide+leg+trousers&prds=catalogid:8245332609135372535,productid:8786432231933990250",
    source: "NEWME",
    price: "₹899",
    extracted_price: 899,
    thumbnail: "https://encrypted-tbn3.gstatic.com/shopping?q=tbn:ANd9GcRN7FsLasTIvO-7kjrm5ouWw1y-W-LU46LOdS25qobUvLWQ0D0mIMMuEzExGEcj8Mzqy5Wrs0uv7wKF-gn4HvnF8WjNZDYnCDTG6YCwys0",
    delivery: "Free delivery"
  },
  {
    position: 9,
    title: "OFF DUTY Pleat Persona Wide Tailored Trousers",
    product_id: "15862280371076377005",
    product_link: "https://www.google.com/search?ibp=oshop&q=women+beige+wide+leg+trousers&prds=catalogid:15862280371076377005,productid:14563188894065774056",
    source: "OffDuty India",
    price: "₹1,090",
    extracted_price: 1090,
    old_price: "₹1,490",
    extracted_old_price: 1490,
    thumbnail: "https://encrypted-tbn3.gstatic.com/shopping?q=tbn:ANd9GcSXyupRh3ZYF7c3a7JLpQilL54H4pP9vZSajWDtOzqg_vCvpP-E6cGRaQ4PWLxQ2Vqhn_FJlWjpsxC1iwD9KA7vID8eqQ7FrL2Xe7UOxTCdbpqZT0ToqNJp",
    delivery: "Free delivery"
  },
  {
    position: 10,
    title: "Sassafras Women Beige Wide Leg Trousers (36) by Myntra",
    product_id: "8976780500612007985",
    product_link: "https://www.google.com/search?ibp=oshop&q=women+beige+wide+leg+trousers&prds=catalogid:8976780500612007985,productid:2402931020767322811",
    source: "Myntra",
    price: "₹645",
    extracted_price: 645,
    old_price: "62% off₹1,699",
    extracted_old_price: 1699,
    rating: 4.5,
    reviews: 49,
    thumbnail: "https://encrypted-tbn3.gstatic.com/shopping?q=tbn:ANd9GcSI5tJhnBHePxGeIKlFq_4HRYMydZiNQu3E35NsvZpAbIY7RckPWT_Bzm2-U-taPxC-Za7ffMHuLHogxi5luUX3P6qBw7Ab3s59AIQWSz0DBrrxsI21BR6v",
    delivery: "Free delivery by Wed"
  },
  {
    position: 11,
    title: "Ladies H&M Beige Wide twill trousers",
    product_id: "12101676302706382261",
    product_link: "https://www.google.com/search?ibp=oshop&q=women+beige+wide+leg+trousers&prds=catalogid:12101676302706382261,productid:10206498947774696752",
    source: "Nykaa Fashion",
    price: "₹1,350",
    extracted_price: 1350,
    old_price: "₹1,999",
    extracted_old_price: 1999,
    rating: 4.2,
    reviews: 480,
    thumbnail: "https://encrypted-tbn2.gstatic.com/shopping?q=tbn:ANd9GcThDg9DjxQOi0UrGMKkq7ef8vrRS7B3Qlvt9FzKMMq-Z3lUN5Nn2U1DRVSfwPLZHe-EN1tGkPKcWZ5kc6DxxuFbrNyNbxNR",
    tag: "32% OFF",
    delivery: "Free delivery"
  },
  {
    position: 12,
    title: "Woman Zara Rustic Wide-Leg Trousers",
    product_id: "3218364442631501006",
    product_link: "https://www.google.com/search?ibp=oshop&q=women+beige+wide+leg+trousers&prds=catalogid:3218364442631501006,productid:4831258832558932683",
    source: "Zara IN",
    price: "₹2,050",
    extracted_price: 2050,
    thumbnail: "https://encrypted-tbn3.gstatic.com/shopping?q=tbn:ANd9GcQ_QrXb1pilDBbapb1KITMxUcD5jBgkacr7BGQyAi1krWTmqXMvC_tCsy2Fnt3qTH2iU9CngnCMXqbuFpczKg8Sv_a5AuferKJS2ejgTWTS7_BcxUcY8FGxF_I",
    delivery: "Free delivery on ₹2,990+"
  }
];

export function normalizeProduct(raw = {}, index = 0) {
  const title = clean(raw.title || raw.name || "Shopping Product", 180);
  const productId = clean(raw.product_id || raw.productId || raw.id || `item-${index + 1}`, 100);
  const productLink = String(raw.product_link || raw.link || "").trim();
  const source = clean(raw.source || raw.merchant || "Online Retailer", 80);
  const sourceIcon = String(raw.source_icon || raw.sourceIcon || "").trim();
  const price = clean(raw.price || (raw.extracted_price ? `₹${raw.extracted_price}` : (raw.extractedPrice ? `₹${raw.extractedPrice}` : "₹0")), 40);
  const rawNumeric = raw.extracted_price ?? raw.extractedPrice;
  const parsedPrice = Number(String(price).replace(/[^\d.]/g, "") || 0);
  const extractedPrice = Number.isFinite(Number(rawNumeric)) ? Number(rawNumeric) : (Number.isFinite(parsedPrice) ? parsedPrice : 0);
  const oldPrice = clean(raw.old_price || raw.oldPrice || raw.secondPrice || "", 40);
  const rawOldNumeric = raw.extracted_old_price ?? raw.extractedOldPrice;
  const parsedOldPrice = Number(String(oldPrice).replace(/[^\d.]/g, "") || 0);
  const extractedOldPrice = Number.isFinite(Number(rawOldNumeric)) ? Number(rawOldNumeric) : (Number.isFinite(parsedOldPrice) ? parsedOldPrice : 0);
  const thumbnail = String(raw.thumbnail || raw.serpapi_thumbnail || raw.imageUrl || raw.image || "").trim();
  const rating = Number.isFinite(Number(raw.rating)) ? Number(raw.rating) : null;
  const rawReviews = raw.reviews ?? raw.ratingCount;
  const reviews = Number.isFinite(Number(rawReviews)) ? Number(rawReviews) : null;
  const delivery = clean(raw.delivery || "", 80);
  const tag = clean(raw.tag || raw.offers || (Array.isArray(raw.extensions) ? raw.extensions[0] : "") || "", 60);

  let discountPercent = 0;
  if (extractedOldPrice > extractedPrice && extractedPrice > 0) {
    discountPercent = Math.round(((extractedOldPrice - extractedPrice) / extractedOldPrice) * 100);
  } else if (/(\d+)%\s*off/i.test(price) || /(\d+)%\s*off/i.test(oldPrice)) {
    const match = (price + " " + oldPrice).match(/(\d+)%\s*off/i);
    if (match) discountPercent = Number(match[1]) || 0;
  }

  return {
    id: productId,
    position: Number(raw.position) || index + 1,
    title,
    productLink,
    source,
    sourceIcon,
    price,
    extractedPrice,
    oldPrice: oldPrice || (discountPercent > 0 && extractedOldPrice ? `₹${extractedOldPrice.toLocaleString("en-IN")}` : ""),
    extractedOldPrice,
    discountPercent,
    thumbnail,
    rating,
    reviews,
    delivery,
    tag,
    category: clean(raw.category || "", 50),
    gender: clean(raw.gender || "", 30),
    style: clean(raw.style || "", 50)
  };
}

export function filterByBudget(products = [], { minPrice, maxPrice, allowAboveBudget = false } = {}) {
  const min = Number.isFinite(Number(minPrice)) && Number(minPrice) >= 0 ? Number(minPrice) : null;
  const baseMax = Number.isFinite(Number(maxPrice)) && Number(maxPrice) > 0 ? Number(maxPrice) : null;
  const max = baseMax !== null && allowAboveBudget ? baseMax * 1.15 : baseMax;

  return products.filter((item) => {
    if (min !== null && item.extractedPrice < min) return false;
    if (max !== null && item.extractedPrice > max) return false;
    return true;
  });
}

export async function fetchSerpApiShopping({ query, gl = "in", hl = "en", apiKey }) {
  const url = new URL("https://serpapi.com/search.json");
  url.searchParams.set("engine", "google_shopping");
  url.searchParams.set("q", query);
  url.searchParams.set("gl", gl);
  url.searchParams.set("hl", hl);
  url.searchParams.set("api_key", apiKey);

  const response = await fetch(url.toString(), {
    headers: { "Accept": "application/json" },
    signal: AbortSignal.timeout(12000)
  });

  if (!response.ok) {
    const text = await response.text().catch(() => "");
    throw new Error(`SerpApi error (${response.status}): ${text.slice(0, 200)}`);
  }

  return response.json();
}

/**
 * Serper.dev (server.dev) Google Shopping API endpoint.
 * Acts as high-performance alternative/fallback to SerpApi.
 */
export async function fetchSerperShopping({ query, gl = "in", hl = "en", apiKey }) {
  const url = "https://google.serper.dev/shopping";
  const response = await fetch(url, {
    method: "POST",
    headers: {
      "X-API-KEY": apiKey,
      "Content-Type": "application/json",
      "Accept": "application/json"
    },
    body: JSON.stringify({
      q: query,
      gl,
      hl
    }),
    signal: AbortSignal.timeout(5000)
  });

  if (!response.ok) {
    const text = await response.text().catch(() => "");
    throw new Error(`Serper error (${response.status}): ${text.slice(0, 200)}`);
  }

  return response.json();
}

/**
 * Seamlessly queries SerpApi or Serper.dev with automatic fallback:
 * 1. If SerpApi key is present, tries SerpApi first.
 * 2. If SerpApi fails or quota runs out, automatically falls back to Serper.dev.
 * 3. If only Serper key is present, queries Serper.dev directly.
 */
export async function fetchShoppingWithFallback({
  query,
  gl = "in",
  hl = "en",
  env = {},
  providerPreference = ""
}) {
  const serpApiKey = String(env.SERPAPI_API_KEY || env.SERPAPI_KEY || "").trim();
  const serperApiKey = String(
    env.SERPER_API_KEY ||
    env.SERPER_KEY ||
    env.SERVER_DEV_API_KEY ||
    env.SERVER_API_KEY ||
    env.SERPER_DEV_API_KEY ||
    ""
  ).trim();
  const preferredProvider = String(
    providerPreference ||
    env.SHOPPING_PROVIDER ||
    ""
  ).toLowerCase().trim();

  let primaryError = null;
  let fallbackError = null;

  const shouldTrySerperFirst = (
    preferredProvider === "serper" ||
    preferredProvider === "server.dev" ||
    (!serpApiKey && Boolean(serperApiKey))
  );

  if (shouldTrySerperFirst) {
    if (serperApiKey) {
      try {
        const data = await fetchSerperShopping({ query, gl, hl, apiKey: serperApiKey });
        const items = Array.isArray(data?.shopping) ? data.shopping : [];
        if (items.length > 0) {
          return { items, provider: "serper", hasKey: true };
        }
      } catch (err) {
        console.warn("[shopping] Serper primary search error:", err?.message);
        primaryError = err;
      }
    }

    if (serpApiKey) {
      try {
        const data = await fetchSerpApiShopping({ query, gl, hl, apiKey: serpApiKey });
        const items = Array.isArray(data?.shopping_results) ? data.shopping_results : [];
        if (items.length > 0) {
          return { items, provider: "serpapi", hasKey: true };
        }
        return { items: [], provider: "serpapi", hasKey: true };
      } catch (err) {
        console.warn("[shopping] SerpApi fallback search error:", err?.message);
        fallbackError = err;
      }
    }
  } else {
    // Default: try SerpApi first
    if (serpApiKey) {
      try {
        const data = await fetchSerpApiShopping({ query, gl, hl, apiKey: serpApiKey });
        const items = Array.isArray(data?.shopping_results) ? data.shopping_results : [];
        if (items.length > 0) {
          return { items, provider: "serpapi", hasKey: true };
        }
        if (!serperApiKey) {
          return { items: [], provider: "serpapi", hasKey: true };
        }
      } catch (err) {
        console.warn("[shopping] SerpApi search error:", err?.message);
        primaryError = err;
      }
    }

    // Fallback to Serper.dev
    if (serperApiKey) {
      try {
        const data = await fetchSerperShopping({ query, gl, hl, apiKey: serperApiKey });
        const items = Array.isArray(data?.shopping) ? data.shopping : [];
        if (items.length > 0) {
          return { items, provider: "serper", hasKey: true };
        }
        return { items: [], provider: "serper", hasKey: true };
      } catch (err) {
        console.warn("[shopping] Serper.dev fallback search error:", err?.message);
        fallbackError = err;
      }
    }
  }

  return {
    items: [],
    provider: null,
    error: fallbackError || primaryError,
    hasKey: Boolean(serpApiKey || serperApiKey)
  };
}

/**
 * Converts a structured fashion intent into a 3-4 query search lattice.
 * Avoids single brittle parenthetical search terms.
 */
export function buildQueryLatticeFromIntent(intent = {}, gender = "men", customQuery = "") {
  const g = String(gender || "men").toLowerCase() === "women" ? "women" : "men";
  const queries = [];

  if (customQuery && typeof customQuery === "string" && customQuery.trim()) {
    queries.push(customQuery.trim());
  }

  const subtypes = Array.isArray(intent.subtypes) && intent.subtypes.length > 0 ? intent.subtypes : [intent.category || "item"];
  const allowedColors = Array.isArray(intent.allowedColors) && intent.allowedColors.length > 0 ? intent.allowedColors : [];
  const materials = Array.isArray(intent.materials) && intent.materials.length > 0 ? intent.materials : [];
  const styleTags = Array.isArray(intent.styleTags) && intent.styleTags.length > 0 ? intent.styleTags : [];
  const brandPrefs = Array.isArray(intent.brandPreferences) && intent.brandPreferences.length > 0 ? intent.brandPreferences : [];

  const sub = subtypes[0] || "";
  const color = allowedColors[0] || "";
  const mat = materials[0] || "";
  const style = styleTags[0] || "";
  const brand = brandPrefs[0] || "";

  const cleanQ = (parts) => parts.filter(Boolean).map((p) => String(p).trim()).filter(Boolean).join(" ").replace(/\s+/g, " ").trim();

  // Q1: Specific subtype + color + material
  const q1 = cleanQ([g, color, mat, sub]);
  if (q1) queries.push(q1);

  // Q2: Subtype + color + style tag
  const q2 = cleanQ([g, color, style, sub]);
  if (q2) queries.push(q2);

  // Q3: Brand-targeted (subtype + gender + brand)
  if (brand) {
    const q3 = cleanQ([g, brand, color, sub]);
    if (q3) queries.push(q3);
  }

  // Q4: Clean broad fallback (gender + color + subtype)
  const q4 = cleanQ([g, color, sub]);
  if (q4) queries.push(q4);

  // Q5: Broader color fallback if color was compound (e.g. "slate grey" -> "grey")
  const baseColor = color.includes(" ") ? color.split(/\s+/).pop() : "";
  if (baseColor && baseColor !== color) {
    const qBase = cleanQ([g, baseColor, sub]);
    if (qBase) queries.push(qBase);
  }

  // If we have a second subtype or second color, add an alternative variation
  if (subtypes.length > 1) {
    const qAlt = cleanQ([g, color, subtypes[1]]);
    if (qAlt) queries.push(qAlt);
  } else if (allowedColors.length > 1) {
    const qAlt = cleanQ([g, allowedColors[1], sub]);
    if (qAlt) queries.push(qAlt);
  }

  // Deduplicate and cap at 4 queries
  const seen = new Set();
  const result = [];
  for (const q of queries) {
    const lower = q.toLowerCase();
    if (!seen.has(lower) && lower.length >= 3) {
      seen.add(lower);
      result.push(q);
      if (result.length >= 4) break;
    }
  }

  return result.length > 0 ? result : [cleanQ([g, sub]) || `${g} clothing`];
}

/**
 * Fetches products across a multi-query lattice in parallel.
 * Merges, deduplicates, and annotates candidates with query provenance.
 */
export async function fetchShoppingLattice({
  queries = [],
  gl = "in",
  hl = "en",
  env = {},
  providerPreference = "",
  maxCandidates = 30
}) {
  if (!Array.isArray(queries) || queries.length === 0) {
    return { items: [], queriesExecuted: [], provider: null, error: null, hasKey: false };
  }

  const queriesExecuted = [];
  const allItems = [];
  const seenIds = new Set();
  let activeProvider = null;
  let lastError = null;
  let hasKey = false;

  const tasks = queries.map(async (q) => {
    try {
      const res = await fetchShoppingWithFallback({
        query: q,
        gl,
        hl,
        env,
        providerPreference
      });
      return { query: q, ...res };
    } catch (err) {
      return { query: q, items: [], provider: null, error: err, hasKey: false };
    }
  });

  const settled = await Promise.allSettled(tasks);

  for (const s of settled) {
    if (s.status !== "fulfilled") continue;
    const { query, items, provider, error, hasKey: qHasKey } = s.value;
    queriesExecuted.push(query);
    if (qHasKey) hasKey = true;
    if (provider) activeProvider = provider;
    if (error) lastError = error;

    for (const raw of items || []) {
      const id = String(raw.product_id || raw.productId || raw.link || raw.title || "");
      if (id && !seenIds.has(id)) {
        seenIds.add(id);
        allItems.push({
          ...raw,
          _originQuery: query,
          _originProvider: provider || "unknown"
        });
        if (allItems.length >= maxCandidates) break;
      }
    }
    if (allItems.length >= maxCandidates) break;
  }

  return {
    items: allItems,
    queriesExecuted,
    provider: activeProvider,
    error: lastError,
    hasKey
  };
}

export async function handleShoppingSearch({
  q,
  minPrice,
  maxPrice,
  allowAboveBudget,
  gl = "in",
  hl = "en",
  env = {},
  providerPreference = ""
}) {
  const cleanedQuery = clean(q, 200);
  if (!cleanedQuery) {
    return { ok: false, error: "A search query (q) is required.", status: 400 };
  }

  const { items, provider, error, hasKey } = await fetchShoppingWithFallback({
    query: cleanedQuery,
    gl,
    hl,
    env,
    providerPreference
  });

  let rawResults = [];
  let isSample = false;
  let notice = "";

  if (items.length > 0) {
    rawResults = items;
  } else if (hasKey) {
    rawResults = SAMPLE_SHOPPING_RESULTS;
    isSample = true;
    notice = `Shopping search live request encountered an issue (${error?.message || "no live products found"}). Showing sample results.`;
  } else {
    rawResults = SAMPLE_SHOPPING_RESULTS;
    isSample = true;
    notice = "SerpApi API key not configured in Cloudflare environment yet (or configure Serper.dev / server.dev fallback). Displaying sample products for preview.";
  }

  const normalized = rawResults.map((item, index) => normalizeProduct(item, index));
  const filtered = filterByBudget(normalized, { minPrice, maxPrice, allowAboveBudget });

  return {
    ok: true,
    query: cleanedQuery,
    products: filtered,
    total: filtered.length,
    unfilteredTotal: normalized.length,
    isSample,
    notice,
    provider: provider || (isSample ? "sample" : "unknown"),
    status: 200
  };
}

export async function onRequestGet(context) {
  const { request, env } = context;
  const url = new URL(request.url);
  const q = url.searchParams.get("q") || "";
  const provider = url.searchParams.get("provider") || "";
  const minPrice = url.searchParams.get("minPrice") || url.searchParams.get("min_price");
  const maxPrice = url.searchParams.get("maxPrice") || url.searchParams.get("max_price");
  const allowAboveBudget = url.searchParams.get("allowAboveBudget") === "true";
  const gl = url.searchParams.get("gl") || "in";
  const hl = url.searchParams.get("hl") || "en";

  const result = await handleShoppingSearch({
    q,
    minPrice,
    maxPrice,
    allowAboveBudget,
    gl,
    hl,
    env,
    providerPreference: provider
  });
  return json(result, result.status || 200);
}

export async function onRequestPost(context) {
  const { request, env } = context;
  let body = {};
  try {
    body = await request.json();
  } catch {
    return json({ ok: false, error: "A valid JSON payload is required." }, 400);
  }

  const q = body.q || body.query || "";
  const provider = body.provider || "";
  const minPrice = body.minPrice ?? body.min_price;
  const maxPrice = body.maxPrice ?? body.max_price;
  const allowAboveBudget = body.allowAboveBudget === true;
  const gl = body.gl || "in";
  const hl = body.hl || "en";

  const result = await handleShoppingSearch({
    q,
    minPrice,
    maxPrice,
    allowAboveBudget,
    gl,
    hl,
    env,
    providerPreference: provider
  });
  return json(result, result.status || 200);
}
