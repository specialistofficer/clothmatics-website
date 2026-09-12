import { callAiGateway, ClothmaticsApiError, readAiCache, writeAiCache } from "./web-api.mjs";
import { APPEARANCE_PROMPT, normalizeVisualProfile, attachPhotoEvidence, imageFingerprint } from './garment-appearance.mjs';

export const GARMENT_FILE_TYPES = new Set(["image/jpeg", "image/png", "image/webp"]);
export const MAX_GARMENT_FILE_BYTES = 6 * 1024 * 1024;

export const GARMENT_ANALYSIS_PROMPT = `
You are the ClothMatics Style Check vision assistant and wardrobe organizer.
Analyze the single prominent clothing item visible in this image. This is
identification for background removal, not image generation or editing. Ignore
faces, identity, age, gender, body shape and the background. Never invent,
reconstruct or alter garment pixels.

Return ONLY valid JSON using this schema:
{
  "overallScore": 0,
  "fashionTips": [],
  "clothing": [{
    "title": "", "category": "", "subCategory": "", "brand": "",
    "primaryColor": "", "secondaryColors": [], "colorDetail": "", "pattern": "", "fit": "",
    "material": "", "fabricTexture": "", "sleeveType": "", "neckline": "", "season": "",
    "occasion": [], "formality": "", "aiDescription": "",
      "technical3DDetails": {
        "fabricWeave": "", "collarOrWaistband": "", "closuresAndHardware": "",
        "pocketsAndDetails": "", "garmentLengthAndHem": "", "graphicsAndLogos": "", "openingsAndHollowStructure": "",
        "waistbandAndRise": "", "flyAndClosure": "", "crotchAndInseam": "",
        "legSilhouette": "", "hemAndCuffs": "", "pocketLayout": ""
    },
    "boundingBox": [0, 0, 0, 0], "visibility": "full",
    "visibleFraction": 1, "extractionReady": true
  }]
}

Rules:
- Return exactly one clothing entry for the main physical garment. A coordinated
  traditional set may be one entry when its pieces cannot be cleanly separated.
- Do not return a person-sized entry or small accessories such as jewellery,
  watches, belts, ties, socks or sunglasses.
- Use a specific descriptive title and a familiar English colour name.
- Inspect the actual garment pixels carefully before naming colour. Charcoal,
  graphite, slate, ash and dark grey are Grey/Charcoal Grey, not Black. Use
  Black only when the fabric is truly near-black across most visible pixels;
  never infer Black from shadows, folds, low exposure or a dark background.
- Clothes hangers, plastic hangers, wall hooks, pegs, door handles and background stands are NOT part of the garment! Completely ignore them. NEVER include hanger colors (such as a blue plastic hanger) in primaryColor, secondaryColors, or colorDetail.
- Return colorDetail as a concise evidence-based description such as
  "medium charcoal grey with cool undertone" or "near-black with warm sheen".
  If uncertain, say so instead of collapsing the result to Black.
- Return fabricTexture with the visible surface description (for example
  "smooth woven", "brushed twill", "heathered knit" or "wrinkled linen").
  Keep it separate from material and never invent a texture that is not visible.
- Return technical3DDetails with deep physical construction across any garment type
  (Men, Women, Traditional, Western, Denim, Outerwear):
  * pocketsAndDetails: EXACT count, symmetry, and style of all pockets. For shirts/tops: explicitly determine whether there are TWO symmetrical chest flap pockets (both left and right chest with buttoned flaps), a single left chest pocket, or no pockets. For trousers: hip slant pockets, rear pockets, side cargo flap pockets. Specify pocket flap shapes (pointed/straight) and button closures. Never collapse two symmetrical pockets into one!
  * garmentLengthAndHem: Observed garment length, hem shape and leg opening. Preserve straight/curved/cropped hems exactly. If folded or outside the photo, report uncertainty; never invent an unseen length or default shirt-tail.
  * collarOrWaistband: exact collar points, collar buttons (e.g. button-down collar with visible point buttons), spread collar, mandarin collar, crew neck ribbing, or waistband drawstrings/loops.
  * closuresAndHardware: placket details, button count/contrast/color (e.g. center vertical front button placket with visible 4-hole buttons, button-down collar points), zipper type/color, snaps.
  * fabricWeave: visible weave/knit micro-texture, grain, surface and actual sheen. Report uncertainty for weave or fibre composition that cannot be resolved. Preserve glossy fabric when visible; never impose a matte finish.
  * graphicsAndLogos: exact transcription of visible text, embroidery subject/placement (e.g. small brown bear silhouette on chest pocket).
   * openingsAndHollowStructure: hollow openings showing inner fabric lining (collar cavity showing back neckband fabric, sleeve cuffs, hem).
  For trousers, jeans, joggers, cargo pants, leggings and shorts, ALSO return:
  * waistbandAndRise: waistband construction plus observed rise from waist to crotch.
  * flyAndClosure: fly, zipper, buttons, hooks or drawcord exactly as visible.
  * crotchAndInseam: front/back orientation, crotch seam shape and visible inseam construction.
  * legSilhouette: exact number of legs, straight/tapered/wide/bootcut shape and relative leg width.
  * hemAndCuffs: both leg openings, their length, turn-up, elastic/rib cuff or open hem.
  * pocketLayout: exact front, rear and cargo pocket count, placement and symmetry.
  Never infer these bottom-specific details from gender or a standard trouser template.
- category should be one of Top, Bottom, Skirt, Dress, Kurta, Saree, Lehenga,
  Traditional Wear, Outerwear, Shoes, Bag, Headwear, Scarf, Swimwear or Innerwear.
- boundingBox is [ymin, xmin, ymax, xmax], with integers from 0 to 1000, around
  the complete garment. Use visibility full, partial or mostly_hidden.
- extractionReady is false only when most of the garment is outside the image or hidden.
`;

// Mirrors the mobile Style Check response contract. Unlike the single-garment
// prompt above, this intentionally evaluates the complete outfit and returns
// every visible garment separately.
export const STYLE_CHECK_PROMPT = `
You are an expert celebrity fashion stylist and wardrobe organizer.

Analyze ONLY the clothing visible in the image.

IMAGE-SAFETY REQUIREMENT:
- This is identification, not image generation or image editing.
- Never reconstruct, repaint, retouch, reshape, move, or invent any pixel.
- Never alter the person's face, hair, skin, hands, limbs, pose, body shape,
  proportions, or any garment's shape, colour, texture, print, folds, or fit.
- The app will create cutouts only from pixels in the uploaded source photo.

Ignore:
- Face
- Identity
- Gender
- Age
- Background

Return ONLY valid JSON.

Schema:

{
  "overallScore": 0,
  "confidence": 0,
  "style": "",
  "occasion": "",
  "colors": [],
  "recommendations": [],
  "fashionTips": [],
  "accessories": [],
  "shoppingSuggestions": [],
  "season": "",
  "formality": "",
  "clothing": [
    {
      "title": "",
      "category": "",
      "subCategory": "",
      "brand": "",
      "primaryColor": "",
      "secondaryColors": [],
      "colorDetail": "",
      "pattern": "",
      "fit": "",
      "material": "",
      "fabricTexture": "",
      "sleeveType": "",
      "neckline": "",
      "season": "",
      "occasion": [],
      "formality": "",
      "aiDescription": "",
      "technical3DDetails": {
        "fabricWeave": "",
        "collarOrWaistband": "",
        "closuresAndHardware": "",
        "pocketsAndDetails": "",
        "garmentLengthAndHem": "",
        "graphicsAndLogos": "",
        "openingsAndHollowStructure": ""
      },
      "boundingBox": [0, 0, 0, 0],
      "visibility": "",
      "visibleFraction": 0,
      "occludedBy": "",
      "extractionReady": true,
      "extractionObstructions": []
    }
  ]
}

Rules:

1. overallScore must be between 0 and 100.
2. confidence must be between 0 and 100.
3. recommendations must contain exactly 5 strings.
4. fashionTips must contain exactly 3 strings.
5. accessories must contain exactly 3 strings.
6. shoppingSuggestions must contain exactly 3 strings.
7. Detect EVERY visible clothing item separately. Return exactly one entry and
   one bounding box per physical garment; never combine a top, bottom, belt,
   shoes, scarf, or bag into a single person-sized box.
8. Maximum 5 clothing items.
8a. A coordinated traditional outfit (for example kurta with trousers and a
    dupatta, lehenga set, saree, or anarkali) is ONE outfit entry when its
    pieces cannot be cleanly separated. Name it precisely, such as "Kurta Set"
    or "Anarkali Kurta Set"; do not call it a generic "Dress".
8b. Use categories from: Top, Bottom, Skirt, Dress, Kurta, Saree, Lehenga,
    Traditional Wear, Shoes, Bag, Headwear, Scarf. Classify
    only from the visible garment, never from the person's gender.
8d. Skip small or narrow accessories that cannot make a useful wardrobe image:
    belts, watches, bracelets, jewelry, ties, socks, and sunglasses. Do not add
    them to clothing even when clearly visible. Clothes hangers, plastic hangers,
    hooks, pegs, door handles and background props are NOT clothing: completely
    ignore them and never list hanger colors as garment colors.
8c. Give every item a specific descriptive title. Never use placeholders such
    as "Garment 1", "Clothing Item", "Unknown Garment", or "Item". For
    example use "Blue Striped Polo Shirt", "Red Silk Saree", or
    "Black Leather Tote Bag".
9. If brand is not clearly visible, return an empty string.
10. If material cannot be determined, leave it empty or mark the estimate as uncertain.
11. colors should contain only dominant clothing colors.
12. boundingBox must be [ymin, xmin, ymax, xmax], each an integer from 0 to 1000,
    and must never be a face-, head-, or full-person-sized box for a torso
    garment. Include the complete visible garment (both sleeves, collar, hem,
    and all visible fabric) with only a small margin. Body parts naturally
    overlapping a garment may be inside the rectangle; never try to erase or
    reconstruct them.
12a. A pair is ONE item and its box must include the COMPLETE pair. For trousers
     include both legs and the full visible waistband-to-hem region. For shoes
     include both shoes when both are visible; never box only one shoe or one
     trouser leg.
    normalized to the image's height and width, framing ONLY that single
    clothing item (not the person wearing it, not other garments, not
    background). When uncertain about the exact edge, err slightly
    generous rather than tight — cutting off part of the garment (a
    sleeve, collar, or hem) is worse than including a small margin of
    background around it.
13. primaryColor and secondaryColors must be familiar English colour names
    (for example "Navy Blue", "Olive Green", "White", "Black"). NEVER
    return a hex code, RGB value, CSS value, or colour code. Use an empty
    string only when a colour cannot be determined.
14. season should be one of:
   Summer
   Winter
   Monsoon
   Spring
   Autumn
15. formality should be one of:
   Casual
   Smart Casual
   Business Casual
   Formal
   Party
   Sportswear
16. visibility describes how much of THIS garment the camera can actually see,
    and must be one of:
   full          — the whole garment is visible
   partial       — some of it is behind another garment or the body
   mostly_hidden — only a small part of it can be seen
17. visibleFraction is the share of the garment that is visible, 0.0 to 1.0.
    A t-shirt 70% covered by a jacket is 0.3. Judge the garment itself, not
    the box around it. Be honest: a low number is more useful than a guess.
18. occludedBy names the garment covering it (for example
    "Black Denim Trucker Jacket"), or an empty string when nothing covers it.
    Still return the item with its box; the app decides what to do with it.
19. LAYERS. When one garment is worn over another on the same part of the body
    — a jacket over a shirt, a blazer over a tee, a cardigan over a top — the
    inner one MUST report the outer one in "occludedBy", a "visibility" of
    "partial" or "mostly_hidden", and an honest "visibleFraction". Say so even
    when the collar, a cuff or a strip of the front placket is clearly visible:
    an open jacket showing a shirt still covers most of that shirt.
20. extractionReady is false only when the garment itself is mostly outside
    the frame or mostly hidden behind another garment. Normal worn-photo
    contact is acceptable: hands, feet, neck, hair, lanyards, ID cards, belts,
    bag straps and phones may remain in the cutout and MUST NOT make the item
    unready. Put such contact objects in extractionObstructions for metadata,
    but keep extractionReady true.
21. Never ask the user to remove an ID card, lanyard, hand or other normal worn
    accessory merely to extract the garment. The app preserves those pixels to
    avoid holes through fabric.
22. Treat anything the person is holding over or directly against clothing as
    part of the worn foreground context. Flowers, bouquets, phones, bags and
    similar held objects must remain inside the relevant garment box and must
    never make extractionReady false.
23. Identification and wardrobe extraction are different. If less than about
    70% of a garment's characteristic shape is visible, set visibility to
    "partial" or "mostly_hidden", give an honest visibleFraction, and set
    extractionReady false. For example, jeans showing only the waistband and
    upper thighs are identifiable as jeans but are not extraction-ready.

Return ONLY valid JSON.

Do NOT use markdown.

Do NOT explain your reasoning.

Do NOT include any extra text.
`;

function cleanText(value, maximum = 100) {
  return String(value ?? "").replace(/[<>]/g, "").trim().slice(0, maximum);
}

function cleanStringArray(value, maximumItems = 8, maximumLength = 60) {
  return Array.isArray(value)
    ? value.map((entry) => cleanText(entry, maximumLength)).filter(Boolean).slice(0, maximumItems)
    : [];
}

function cleanJson(text) {
  return String(text || "").replace(/```json|```/gi, "").trim();
}

const NAMED_COLOURS = [
  ["Black", [18, 18, 18]], ["White", [245, 245, 245]],
  ["Grey", [128, 128, 128]], ["Silver", [192, 192, 192]],
  ["Brown", [108, 67, 38]], ["Beige", [220, 202, 166]],
  ["Cream", [250, 240, 210]], ["Tan", [190, 145, 94]],
  ["Red", [200, 42, 42]], ["Maroon", [112, 25, 38]],
  ["Pink", [230, 124, 154]], ["Orange", [233, 126, 35]],
  ["Yellow", [237, 202, 48]], ["Mustard", [183, 139, 16]],
  ["Green", [50, 132, 67]], ["Olive", [110, 112, 36]],
  ["Teal", [24, 128, 128]], ["Blue", [52, 105, 190]],
  ["Navy Blue", [25, 48, 94]], ["Purple", [116, 71, 161]],
  ["Lavender", [182, 155, 211]], ["Gold", [205, 166, 49]],
];

function nearestColour(red, green, blue) {
  let winner = "Unknown";
  let minimum = Number.POSITIVE_INFINITY;
  for (const [name, [r, g, b]] of NAMED_COLOURS) {
    const distance = (red - r) ** 2 + (green - g) ** 2 + (blue - b) ** 2;
    if (distance < minimum) {
      minimum = distance;
      winner = name;
    }
  }
  return winner;
}

function colorNameFromValue(value) {
  const raw = String(value ?? "").trim();
  if (!raw) return "";
  const hex = raw.match(/^#?([0-9a-f]{6}|[0-9a-f]{3})$/i);
  if (hex) {
    const code = hex[1].length === 3
      ? hex[1].split("").map((part) => part + part).join("")
      : hex[1];
    return nearestColour(
      Number.parseInt(code.slice(0, 2), 16),
      Number.parseInt(code.slice(2, 4), 16),
      Number.parseInt(code.slice(4, 6), 16),
    );
  }
  if (raw.startsWith("#") || /^(rgb|hsl|lab)\(/i.test(raw)) return "";
  return cleanText(raw, 40);
}

function usableBox(value) {
  if (!Array.isArray(value) || value.length !== 4) return undefined;
  const box = value.map(Number);
  if (!box.every(Number.isFinite)) return undefined;
  const [y0, x0, y1, x1] = box;
  if (y0 < 0 || x0 < 0 || y1 > 1000 || x1 > 1000 || y1 <= y0 || x1 <= x0) return undefined;
  return box.map((entry) => Math.round(entry));
}

export function normalizeGarmentMetadata(value = {}) {
  const title = cleanText(value.title, 100);
  const category = cleanText(value.category, 60);
  if (!title || !category) throw new Error("The photo did not contain one clearly identifiable garment.");
  const rawTech = value.technical3DDetails && typeof value.technical3DDetails === "object" ? value.technical3DDetails : {};
  const fabricWeave = cleanText(rawTech.fabricWeave || value.fabricTexture, 200);
  const collarOrWaistband = cleanText(rawTech.collarOrWaistband || value.neckline, 200);
  const closuresAndHardware = cleanText(rawTech.closuresAndHardware, 200);
  const pocketsAndDetails = cleanText(rawTech.pocketsAndDetails, 200);
  const garmentLengthAndHem = cleanText(rawTech.garmentLengthAndHem, 200);
  const graphicsAndLogos = cleanText(rawTech.graphicsAndLogos, 300);
  const openingsAndHollowStructure = cleanText(rawTech.openingsAndHollowStructure, 200);
  const waistbandAndRise = cleanText(rawTech.waistbandAndRise, 200);
  const flyAndClosure = cleanText(rawTech.flyAndClosure, 200);
  const crotchAndInseam = cleanText(rawTech.crotchAndInseam, 220);
  const legSilhouette = cleanText(rawTech.legSilhouette, 200);
  const hemAndCuffs = cleanText(rawTech.hemAndCuffs, 180);
  const pocketLayout = cleanText(rawTech.pocketLayout, 220);
  const hasTech = Boolean(fabricWeave || collarOrWaistband || closuresAndHardware || pocketsAndDetails || garmentLengthAndHem || graphicsAndLogos || openingsAndHollowStructure || waistbandAndRise || flyAndClosure || crotchAndInseam || legSilhouette || hemAndCuffs || pocketLayout);
  const technical3DDetails = hasTech ? {
    fabricWeave,
    collarOrWaistband,
    closuresAndHardware,
    pocketsAndDetails,
    garmentLengthAndHem,
    graphicsAndLogos,
    openingsAndHollowStructure,
    waistbandAndRise,
    flyAndClosure,
    crotchAndInseam,
    legSilhouette,
    hemAndCuffs,
    pocketLayout,
  } : undefined;

  return {
    title,
    category,
    subCategory: cleanText(value.subCategory, 60),
    brand: cleanText(value.brand, 80),
    primaryColor: colorNameFromValue(value.primaryColor),
    secondaryColors: Array.isArray(value.secondaryColors)
      ? value.secondaryColors.map(colorNameFromValue).filter(Boolean).slice(0, 5)
      : [],
    colorDetail: cleanText(value.colorDetail, 300),
    pattern: cleanText(value.pattern, 40) || "Solid",
    fit: cleanText(value.fit, 40),
    material: cleanText(value.material, 60),
    fabricTexture: cleanText(value.fabricTexture, 300),
    sleeveType: cleanText(value.sleeveType, 50),
    neckline: cleanText(value.neckline, 50),
    season: cleanText(value.season, 30),
    occasion: cleanStringArray(value.occasion, 8, 50),
    formality: cleanText(value.formality, 40),
    aiDescription: cleanText(value.aiDescription, 500),
    technical3DDetails,
    visualProfile: normalizeVisualProfile(value.visualProfile),
    boundingBox: usableBox(value.boundingBox),
    visibility: ["full", "partial", "mostly_hidden"].includes(String(value.visibility))
      ? String(value.visibility)
      : "",
    visibleFraction: Number.isFinite(Number(value.visibleFraction))
      ? Math.max(0, Math.min(1, Number(value.visibleFraction)))
      : undefined,
    occludedBy: cleanText(value.occludedBy, 100),
    extractionReady: value.extractionReady !== false,
    extractionObstructions: cleanStringArray(value.extractionObstructions, 5, 100),
  };
}

export function parseGarmentAnalysis(body) {
  const text = body?.candidates?.[0]?.content?.parts
    ?.map((part) => typeof part?.text === "string" ? part.text : "")
    .join("")
    .trim();
  if (!text) throw new Error("The garment analyzer returned an empty response.");
  let parsed;
  try { parsed = JSON.parse(cleanJson(text)); }
  catch { throw new Error("The garment analyzer returned an invalid response. Please try again."); }
  const clothing = Array.isArray(parsed?.clothing) ? parsed.clothing : [];
  if (!clothing.length) throw new Error("No garment was identified. Use a clear photo of one complete item.");
  const ranked = [...clothing].sort((left, right) => {
    const area = (item) => {
      const box = usableBox(item?.boundingBox);
      return box ? (box[2] - box[0]) * (box[3] - box[1]) : 0;
    };
    return area(right) - area(left);
  });
  const garment = normalizeGarmentMetadata(ranked.find((item) => item?.extractionReady !== false) || ranked[0]);
  if (garment.extractionReady === false || garment.visibility === "mostly_hidden") {
    throw new Error("Most of the garment is hidden. Use a photo with the complete item visible.");
  }
  return garment;
}

function boundedNumber(value) {
  const number = Number(value);
  return Number.isFinite(number) ? Math.max(0, Math.min(100, Math.round(number))) : 0;
}

export function parseStyleCheckAnalysis(body) {
  const text = body?.candidates?.[0]?.content?.parts
    ?.map((part) => typeof part?.text === "string" ? part.text : "")
    .join("")
    .trim();
  if (!text) throw new Error("The Style Check returned an empty response.");
  let parsed;
  try { parsed = JSON.parse(cleanJson(text)); }
  catch { throw new Error("The Style Check returned an invalid response. Please try again."); }
  return {
    id: String(Date.now()),
    overallScore: boundedNumber(parsed?.overallScore),
    confidence: boundedNumber(parsed?.confidence),
    style: cleanText(parsed?.style, 80) || "Outfit analysis",
    occasion: cleanText(parsed?.occasion, 80) || "General",
    colors: cleanStringArray(parsed?.colors, 8, 40),
    recommendations: cleanStringArray(parsed?.recommendations, 5, 240),
    fashionTips: cleanStringArray(parsed?.fashionTips, 3, 240),
    accessories: cleanStringArray(parsed?.accessories, 3, 160),
    shoppingSuggestions: cleanStringArray(parsed?.shoppingSuggestions, 3, 200),
    season: cleanText(parsed?.season, 40),
    formality: cleanText(parsed?.formality, 40),
    clothing: Array.isArray(parsed?.clothing)
      ? parsed.clothing.filter((item) => {
          const category = String(item?.category ?? "").trim().toLowerCase();
          const title = String(item?.title ?? "").trim().toLowerCase();
          const skipped = ["belt", "watch", "bracelet", "jewelry", "jewellery", "tie", "socks", "sunglasses"];
          return !skipped.some((name) => category === name || title.includes(name));
        }).slice(0, 5).map((item) => {
          try { return normalizeGarmentMetadata(item); }
          catch { return null; }
        }).filter(Boolean)
      : [],
    createdAt: new Date().toISOString(),
  };
}

// Keep the website's Auto Extract gate identical to the mobile app. A model may
// set extractionReady=false because of a hand, strap, or other harmless contact;
// that alone must not hide an otherwise useful garment from the review queue.
export function isGarmentExtractionReady(item = {}) {
  const fraction = Number.isFinite(Number(item.visibleFraction))
    ? Math.max(0, Math.min(1, Number(item.visibleFraction)))
    : item.visibility === "full" ? 1 : 0;
  if (item.visibility === "mostly_hidden") return false;
  if (item.visibility === "partial" && fraction < 0.72) return false;
  return !(item.extractionReady === false && fraction < 0.72);
}

export function validateGarmentFile(file) {
  if (!file || !GARMENT_FILE_TYPES.has(String(file.type || "").toLowerCase())) {
    throw new Error("Choose a JPEG, PNG or WebP image.");
  }
  if (file.size < 500) throw new Error("This image is empty or too small to process.");
  if (file.size > MAX_GARMENT_FILE_BYTES) throw new Error("Choose an image smaller than 6 MB.");
  return file;
}

function imageElementFromFile(file) {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const image = new Image();
    image.onload = () => { URL.revokeObjectURL(url); resolve(image); };
    image.onerror = () => { URL.revokeObjectURL(url); reject(new Error("This image could not be opened.")); };
    image.src = url;
  });
}

function canvasBlob(canvas, type, quality) {
  return new Promise((resolve, reject) => canvas.toBlob(
    (blob) => blob ? resolve(blob) : reject(new Error("This browser could not prepare the image.")),
    type,
    quality,
  ));
}

async function imageSourceFromBlob(blob) {
  try { return await createImageBitmap(blob, { imageOrientation: "from-image" }); }
  catch { return imageElementFromFile(blob); }
}

function sourceDimensions(source) {
  return {
    width: Number(source.width || source.naturalWidth || 0),
    height: Number(source.height || source.naturalHeight || 0),
  };
}

export async function checkGarmentImageBlur(file, { threshold = 60 } = {}) {
  validateGarmentFile(file);
  const source = await imageSourceFromBlob(file);
  const dimensions = sourceDimensions(source);
  if (!dimensions.width || !dimensions.height) {
    source.close?.();
    return { blurry: false, score: -1 };
  }
  const scale = Math.min(1, 120 / dimensions.width);
  const width = Math.max(3, Math.round(dimensions.width * scale));
  const height = Math.max(3, Math.round(dimensions.height * scale));
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const context = canvas.getContext("2d", { willReadFrequently: true });
  context.drawImage(source, 0, 0, width, height);
  source.close?.();
  const pixels = context.getImageData(0, 0, width, height).data;
  const grey = new Float32Array(width * height);
  for (let index = 0; index < grey.length; index += 1) {
    const offset = index * 4;
    grey[index] = pixels[offset] * 0.299 + pixels[offset + 1] * 0.587 + pixels[offset + 2] * 0.114;
  }
  let count = 0;
  let sum = 0;
  let squared = 0;
  for (let y = 1; y < height - 1; y += 1) {
    for (let x = 1; x < width - 1; x += 1) {
      const index = y * width + x;
      const laplacian = grey[index - 1] + grey[index + 1] + grey[index - width] + grey[index + width] - 4 * grey[index];
      count += 1;
      sum += laplacian;
      squared += laplacian * laplacian;
    }
  }
  const mean = count ? sum / count : 0;
  const score = count ? Math.max(0, squared / count - mean * mean) : -1;
  return { blurry: score >= 0 && score < threshold, score };
}

export async function normalizeGarmentImage(file) {
  validateGarmentFile(file);
  let source;
  try { source = await createImageBitmap(file, { imageOrientation: "from-image" }); }
  catch { source = await imageElementFromFile(file); }
  const sourceWidth = Number(source.width || source.naturalWidth);
  const sourceHeight = Number(source.height || source.naturalHeight);
  if (!sourceWidth || !sourceHeight) throw new Error("This image has invalid dimensions.");
  // Mobile analysis normalizes every photo to a 1024px width. Use the same
  // bitmap here so detection boxes and the extraction request share identical
  // orientation and resolution in both clients, especially for portrait shots.
  const scale = 1024 / sourceWidth;
  const width = 1024;
  const height = Math.max(1, Math.round(sourceHeight * scale));
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const context = canvas.getContext("2d", { alpha: false });
  context.fillStyle = "#ffffff";
  context.fillRect(0, 0, width, height);
  context.drawImage(source, 0, 0, width, height);
  source.close?.();
  const blob = await canvasBlob(canvas, "image/jpeg", 0.8);
  if (blob.size < 500 || blob.size > MAX_GARMENT_FILE_BYTES) {
    throw new Error("The prepared image is outside the supported size range.");
  }
  return { blob, width, height };
}

export async function cropGarmentImage(imageBlob, boundingBox, padding = 0.22) {
  const box = usableBox(boundingBox);
  if (!box) throw new Error("A reliable garment outline was not available.");
  const source = await imageSourceFromBlob(imageBlob);
  const { width: sourceWidth, height: sourceHeight } = sourceDimensions(source);
  if (!sourceWidth || !sourceHeight) {
    source.close?.();
    throw new Error("This image has invalid dimensions.");
  }
  const [y0, x0, y1, x1] = box;
  const left = x0 / 1000 * sourceWidth;
  const top = y0 / 1000 * sourceHeight;
  const boxWidth = (x1 - x0) / 1000 * sourceWidth;
  const boxHeight = (y1 - y0) / 1000 * sourceHeight;
  const padX = boxWidth * Math.max(0, padding);
  const padY = boxHeight * Math.max(0, padding);
  const cropLeft = Math.max(0, Math.floor(left - padX));
  const cropTop = Math.max(0, Math.floor(top - padY));
  const cropRight = Math.min(sourceWidth, Math.ceil(left + boxWidth + padX));
  const cropBottom = Math.min(sourceHeight, Math.ceil(top + boxHeight + padY));
  const width = Math.max(1, cropRight - cropLeft);
  const height = Math.max(1, cropBottom - cropTop);
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const context = canvas.getContext("2d", { alpha: false });
  context.fillStyle = "#ffffff";
  context.fillRect(0, 0, width, height);
  context.drawImage(source, cropLeft, cropTop, width, height, 0, 0, width, height);
  source.close?.();
  return { blob: await canvasBlob(canvas, "image/jpeg", 0.8), width, height };
}

export async function optimizeGarmentUpload(imageBlob, { backgroundRemoved = true } = {}) {
  const source = await imageSourceFromBlob(imageBlob);
  const dimensions = sourceDimensions(source);
  if (dimensions.width < 16 || dimensions.height < 16) {
    source.close?.();
    throw new Error("The prepared garment image is unreadable.");
  }
  const maximumEdge = backgroundRemoved ? 1000 : 1200;
  const scale = Math.min(1, maximumEdge / Math.max(dimensions.width, dimensions.height));
  const width = Math.max(1, Math.round(dimensions.width * scale));
  const height = Math.max(1, Math.round(dimensions.height * scale));
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const context = canvas.getContext("2d", { alpha: backgroundRemoved });
  if (!backgroundRemoved) {
    context.fillStyle = "#ffffff";
    context.fillRect(0, 0, width, height);
  }
  context.drawImage(source, 0, 0, width, height);
  source.close?.();
  let blob = await canvasBlob(canvas, backgroundRemoved ? "image/webp" : "image/jpeg", backgroundRemoved ? 0.88 : 0.82);
  if (blob.size > 1024 * 1024) {
    const firstPass = await imageSourceFromBlob(blob);
    context.clearRect(0, 0, width, height);
    context.drawImage(firstPass, 0, 0, width, height);
    firstPass.close?.();
    blob = await canvasBlob(canvas, backgroundRemoved ? "image/webp" : "image/jpeg", backgroundRemoved ? 0.8 : 0.74);
  }
  if (!GARMENT_FILE_TYPES.has(String(blob.type || "").toLowerCase())) {
    blob = await canvasBlob(canvas, backgroundRemoved ? "image/png" : "image/jpeg", backgroundRemoved ? undefined : 0.82);
  }
  if (blob.size < 500 || blob.size > MAX_GARMENT_FILE_BYTES) {
    throw new Error("The prepared image is outside the supported upload range.");
  }
  return { blob, width, height, contentType: blob.type };
}

function blobToBase64(blob) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || "").split(",", 2)[1] || "");
    reader.onerror = () => reject(new Error("This image could not be read."));
    reader.readAsDataURL(blob);
  });
}

function waitForRetry(milliseconds, signal) {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) {
      reject(new DOMException("Aborted", "AbortError"));
      return;
    }
    const timer = setTimeout(resolve, milliseconds);
    signal?.addEventListener("abort", () => {
      clearTimeout(timer);
      reject(new DOMException("Aborted", "AbortError"));
    }, { once: true });
  });
}

async function callVisionGateway(user, payload, { signal } = {}) {
  let lastError;
  for (let attempt = 0; attempt < 2; attempt += 1) {
    try {
      return await callAiGateway(user, "/v1/generate", payload, { signal });
    } catch (error) {
      lastError = error;
      if (!(error instanceof ClothmaticsApiError) || error.status !== 503 || attempt === 1) throw error;
      await waitForRetry(900, signal);
    }
  }
  throw lastError;
}

export async function analyzeGarment(user,imageBlob,options={}) {
  if (!user) throw new ClothmaticsApiError('Sign in required.', {status:401, code:'unauthenticated'});
  const {signal, fresh=false} = options;
  if (signal?.aborted) throw new DOMException('Aborted','AbortError');
  const key = `clothmatics:web-ai:${user.uid}:single:v11:${await imageFingerprint(imageBlob)}`;
  const cached = fresh ? null : readAiCache(key);
  if (cached?.metadata) return cached;
  const {body,response} = await callVisionGateway(user, {
    contents:[{parts:[{text:GARMENT_ANALYSIS_PROMPT + APPEARANCE_PROMPT}, {inlineData:{mimeType:imageBlob.type || 'image/jpeg',data:await blobToBase64(imageBlob)}}]}],
    generationConfig:{temperature:0.1,topP:0.9,maxOutputTokens:8192,responseMimeType:'application/json'},
  }, {signal});
  const metadata = parseGarmentAnalysis(body);
  await attachPhotoEvidence(imageBlob,[metadata]);
  const result = {metadata,provider:response.headers.get('X-AI-Provider') || 'unknown',model:response.headers.get('X-AI-Model') || 'unknown'};
  writeAiCache(key,result);
  return result;
}

export async function analyzeStyleCheck(user, imageBlob, { signal, fresh = false } = {}) {
  if (!user) throw new ClothmaticsApiError("Sign in required.", {status:401, code:"unauthenticated"});
  if (signal?.aborted) throw new DOMException("Aborted", "AbortError");
  const digest = new Uint8Array(await crypto.subtle.digest("SHA-256", await imageBlob.arrayBuffer()));
  const fingerprint = Array.from(digest, byte => byte.toString(16).padStart(2, "0")).join("");
  if (signal?.aborted) throw new DOMException("Aborted", "AbortError");
  const cacheKey = `clothmatics:web-ai:${user.uid}:style_check:v11:${fingerprint}`;
  const cached = fresh ? null : readAiCache(cacheKey);
  if (cached?.analysis) return cached;
  const data = await blobToBase64(imageBlob);
  const { body, response } = await callVisionGateway(user, {
    contents: [{ parts: [
      { text: STYLE_CHECK_PROMPT + APPEARANCE_PROMPT },
      { inlineData: { mimeType: imageBlob.type || "image/jpeg", data } },
    ] }],
    generationConfig: {
      temperature: 0.2,
      topP: 0.9,
      maxOutputTokens: 8192,
      responseMimeType: "application/json",
    },
  }, { signal });
  const result = {
    analysis: parseStyleCheckAnalysis(body),
    provider: response.headers.get("X-AI-Provider") || body?._clothmatics?.provider || "unknown",
    model: response.headers.get("X-AI-Model") || body?._clothmatics?.model || "unknown",
  };
  await attachPhotoEvidence(imageBlob,result.analysis.clothing);
  writeAiCache(cacheKey, result);
  return result;
}

async function authenticatedSameOriginFetch(user, url, options, { forceFreshToken = false, reloadOn401 = false } = {}) {
  if (!user) throw new ClothmaticsApiError("Sign in required.", { status: 401, code: "unauthenticated" });
  const send = async (refresh) => fetch(url, {
    ...options,
    headers: { ...(options.headers || {}), Authorization: `Bearer ${await user.getIdToken(refresh)}` },
  });
  let response = await send(forceFreshToken);
  if (response.status === 401) {
    if (reloadOn401 && typeof user.reload === "function") await user.reload().catch(() => undefined);
    response = await send(true);
  }
  return response;
}

async function responseError(response, fallback) {
  const body = await response.clone().json().catch(() => ({}));
  return String(body?.error?.message || body?.detail?.message || body?.detail || fallback);
}

export async function extractGarmentWithOracle(user, imageBlob, {
  signal,
  mode = "single_garment",
  region,
  regions,
  candidateIndex,
  preserveLightFabric = false,
} = {}) {
  const requestController = new AbortController();
  let timedOut = false;
  const abortFromCaller = () => requestController.abort(signal?.reason);
  if (signal?.aborted) abortFromCaller();
  else signal?.addEventListener("abort", abortFromCaller, { once: true });
  const timeout = setTimeout(() => { timedOut = true; requestController.abort(); }, 60_000);
  const requestSignal = requestController.signal;
  try {
  const makeForm = () => {
    const form = new FormData();
    form.append("image", imageBlob, "clothmatics-garment.jpg");
    form.append("mode", mode === "portrait_region" ? "portrait_region" : "single_garment");
    form.append("preserveLightFabric", preserveLightFabric ? "true" : "false");
    if (Array.isArray(region)) form.append("region", JSON.stringify(region));
    if (Array.isArray(regions)) form.append("regions", JSON.stringify(regions));
    if (Number.isInteger(candidateIndex)) form.append("candidateIndex", String(candidateIndex));
    return form;
  };
  let response = await authenticatedSameOriginFetch(user, "/api/wardrobe/extract", {
    method: "POST",
    body: makeForm(),
    signal: requestSignal,
  }, { forceFreshToken: true, reloadOn401: true });
  if ([502, 503].includes(response.status)) {
    await waitForRetry(900, requestSignal);
    response = await authenticatedSameOriginFetch(user, "/api/wardrobe/extract", {
      method: "POST",
      body: makeForm(),
      signal: requestSignal,
    }, { forceFreshToken: true, reloadOn401: true });
  }
  if (!response.ok) {
    const error = new Error(await responseError(response, `The image could not be prepared (${response.status}).`));
    error.status = response.status;
    throw error;
  }
  const blob = await response.blob();
  const bytes = new Uint8Array(await blob.slice(0, 8).arrayBuffer());
  const png = [137, 80, 78, 71, 13, 10, 26, 10];
  if (!String(blob.type).toLowerCase().startsWith("image/png") || !png.every((value, index) => bytes[index] === value)) {
    const error = new Error("The prepared image was invalid. Please try again.");
    error.code = "invalid_output";
    throw error;
  }
  const source = await imageSourceFromBlob(blob);
  const dimensions = sourceDimensions(source);
  source.close?.();
  if (dimensions.width < 16 || dimensions.height < 16) {
    const error = new Error("The prepared image was unreadable. Please try again.");
    error.code = "invalid_output";
    throw error;
  }
  return {
    blob,
    diagnostics: {
      requestId: response.headers.get("X-Request-Id") || "",
      processingMs: Number(response.headers.get("X-Processing-Ms") || 0),
      modelId: response.headers.get("X-Model-Id") || "",
      outputWidth: Number(response.headers.get("X-Output-Width") || dimensions.width),
      outputHeight: Number(response.headers.get("X-Output-Height") || dimensions.height),
      maskCoverage: Number(response.headers.get("X-Mask-Coverage") || 0),
      transparentFraction: Number(response.headers.get("X-Transparent-Fraction") || 0),
      opaqueFraction: Number(response.headers.get("X-Opaque-Fraction") || 0),
      edgeFraction: Number(response.headers.get("X-Edge-Fraction") || 0),
      postprocessVersion: response.headers.get("X-Postprocess-Version") || "",
    },
  };
  } catch (error) {
    if (timedOut && !signal?.aborted) {
      const timeoutError = new Error("Oracle extraction timed out after 60 seconds.");
      timeoutError.status = 408;
      timeoutError.code = "timeout";
      throw timeoutError;
    }
    throw error;
  } finally {
    clearTimeout(timeout);
    signal?.removeEventListener("abort", abortFromCaller);
  }
}

export async function uploadGarmentImage(user, imageBlob, { signal } = {}) {
  const contentType = String(imageBlob?.type || "").toLowerCase();
  if (!GARMENT_FILE_TYPES.has(contentType)) throw new Error("The prepared upload is not a supported image.");
  const response = await authenticatedSameOriginFetch(user, "/api/wardrobe/upload", {
    method: "POST",
    headers: { "Content-Type": contentType },
    body: imageBlob,
    signal,
  });
  const body = await response.json().catch(() => ({}));
  if (!response.ok || !body?.success || !body?.imageUrl || !body?.objectKey) {
    throw new Error(String(body?.error?.message || `Image upload failed (${response.status}).`));
  }
  return body;
}

export const uploadGarmentCutout = uploadGarmentImage;

export async function deleteGarmentUpload(user, objectKey) {
  if (!objectKey) return;
  const response = await authenticatedSameOriginFetch(
    user,
    `/api/wardrobe/upload?objectKey=${encodeURIComponent(objectKey)}`,
    { method: "DELETE" },
  );
  if (!response.ok && response.status !== 404) throw new Error("Could not clean up the uploaded image.");
}
