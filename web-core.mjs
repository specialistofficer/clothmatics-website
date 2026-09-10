export const LOOKBOOK_SLOTS = ["top", "bottom", "layer", "hero", "footwear", "accessory"];

export function normalizeGarmentCategory(category = "", subCategory = "") {
  const value = `${category} ${subCategory}`.toLowerCase();
  if (/blazer|jacket|bomber|cardigan|shrug|coat|outerwear|overshirt|hoodie/.test(value)) return "Outerwear";
  if (/shirt|t[ -]?shirt|tee|top|blouse|kurta|polo|sweater|sweatshirt|tank/.test(value)) return "Top";
  if (/dress|gown|jumpsuit|romper|one.?piece|co-ord/.test(value)) return "One-piece";
  if (/saree|sari|lehenga|salwar|anarkali|sherwani|dhoti|traditional set|kurta set/.test(value)) return "Traditional set";
  if (/shoe|sneaker|trainer|loafer|heel|sandal|boot|footwear|flat/.test(value)) return "Footwear";
  if (/bag|belt|watch|jewel|scarf|hat|cap|headwear|eyewear|sunglass|accessor/.test(value)) return "Accessory";
  if (/bottom|jean|trouser|pant|chino|short|skirt|legging|palazzo|jogger|cargo/.test(value)) return "Bottom";
  return "Top";
}

export function lookbookSlotFor(item = {}) {
  const text = [item.category,item.subCategory,item.categoryRole,item.title,...(item.tags || [])].filter(Boolean).join(" ").toLowerCase();
  const category = normalizeGarmentCategory(item.category, item.subCategory);
  if (category === "Footwear" || /\b(footwear|shoes?|sneakers?|trainers?|loafers?|heels?|sandals?|boots?|flats?)\b/.test(text)) return "footwear";
  if (category === "Accessory" || /\b(accessor(?:y|ies)|watch|bag|belt|jewel(?:lery|ry)?|scarf|hat|cap|headwear|eyewear|sunglasses?)\b/.test(text)) return "accessory";
  if (category === "Outerwear" || /\b(outerwear|jacket|blazer|coat|cardigan|shrug|overshirt|shacket|bomber|hoodie|parka|trench)\b/.test(text)) return "layer";
  if (category === "Bottom" || /\b(bottom|pants?|trousers?|jeans?|skirts?|shorts?|leggings?|joggers?|cargo|chinos?|palazzo)\b/.test(text)) return "bottom";
  if (/\b(dress shirt|shirts?|t[ -]?shirts?|tees?|tops?|blouses?|kurtas?|polos?|sweaters?|sweatshirts?|tank tops?|crop tops?)\b/.test(text)) return "top";
  if (category === "One-piece" || category === "Traditional set" || /\b(dress|gown|jumpsuit|romper|one[ -]?piece|saree|sari|lehenga|anarkali|salwar suit|kurta set|sherwani|dhoti set|traditional set|co-ord set)\b/.test(text)) return "hero";
  if (item.bodyZone === "feet") return "footwear";
  if (item.bodyZone === "accessory" || item.layerRole === "accessory") return "accessory";
  if (item.layerRole === "outer") return "layer";
  if (item.bodyZone === "lower_body") return "bottom";
  if (item.bodyZone === "full_body" || item.standaloneOutfit === true || item.layerRole === "standalone") return "hero";
  if (category === "Top") return "top";
  return "top";
}

export function normalizeSearch(value = "") {
  return String(value).toLowerCase().replace(/&/g," and ").replace(/[^a-z0-9]+/g,"");
}

const SEARCH_GROUPS = [
  ["tshirt","tshirts","tee","tees","teeshirt","teeshirts"],
  ["shoe","shoes","sneaker","sneakers","trainer","trainers","footwear","sportsshoes"],
  ["watch","watches","accessory","accessories"],
  ["bag","bags","handbag","handbags","purse","purses","accessory","accessories"],
  ["belt","belts","accessory","accessories"],
  ["jewellery","jewelry","jewel","accessory","accessories"],
  ["scarf","scarves","accessory","accessories"],
  ["sunglass","sunglasses","eyewear","accessory","accessories"],
  ["trouser","trousers","pant","pants","slacks"],
  ["jacket","jackets","coat","coats","outerwear","layer"],
];

export function searchAliases(term) {
  return SEARCH_GROUPS.find((group) => group.includes(term)) || [term];
}

export function garmentSearchText(item = {}) {
  const category = normalizeGarmentCategory(item.category,item.subCategory);
  const values = [item.title,category,item.category,item.subCategory,item.primaryColor,item.secondaryColors,item.pattern,item.tags,item.brand];
  return [...new Set(values.flatMap((value)=>Array.isArray(value)?value:[value]).filter(Boolean).map(normalizeSearch).flatMap((value)=>[value,...searchAliases(value)]))].join(" ");
}

export function matchesGarmentSearch(item, query) {
  const terms = String(query).trim().split(/\s+/).map(normalizeSearch).filter(Boolean);
  const haystack = garmentSearchText(item);
  return !terms.length || terms.every((term)=>haystack.includes(term)||searchAliases(term).some((alias)=>haystack.includes(alias)));
}

export function localDateKey(date = new Date()) {
  const year=date.getFullYear(), month=String(date.getMonth()+1).padStart(2,"0"), day=String(date.getDate()).padStart(2,"0");
  return `${year}-${month}-${day}`;
}

export function shiftCalendarMonth(displayedMonth, selectedDate, offset) {
  const [selectedYear,selectedMonth,selectedDay]=String(selectedDate).split("-").map(Number);
  const source = Number.isFinite(selectedYear) ? new Date(selectedYear,selectedMonth-1,1) : displayedMonth;
  const target = new Date(source.getFullYear(),source.getMonth()+offset,1);
  const day = Math.min(selectedDay || 1,new Date(target.getFullYear(),target.getMonth()+1,0).getDate());
  return { displayedMonth:target, selectedDate:localDateKey(new Date(target.getFullYear(),target.getMonth(),day)) };
}

export function calculateWeeklyReport(wardrobe=[],wear=[],saved=[],today=new Date()) {
  const eligible=wardrobe.filter((item)=>item.type!=="lookbook"&&!item.hiddenFromAI);
  const since=new Date(today.getFullYear(),today.getMonth(),today.getDate()-6), sinceKey=localDateKey(since);
  const recent=wear.filter((entry)=>entry.status==="worn"&&String(entry.wearDate||"")>=sinceKey&&String(entry.wearDate||"")<=localDateKey(today));
  const counts=new Map(); recent.flatMap((entry)=>entry.wardrobeItemIds||[]).forEach((id)=>counts.set(id,(counts.get(id)||0)+1));
  const wornIds=new Set(counts.keys());
  const mostId=[...counts.entries()].sort((a,b)=>b[1]-a[1])[0]?.[0];
  const mostRepeatedItem=eligible.find((item)=>item.id===mostId)||null;
  const bestValueItem=eligible.filter((item)=>Number(item.purchasePrice)>0&&Number(item.timesWorn)>0).sort((a,b)=>a.purchasePrice/a.timesWorn-b.purchasePrice/b.timesWorn)[0]||null;
  const cutoff=new Date(today.getFullYear(),today.getMonth(),today.getDate()-45), cutoffKey=localDateKey(cutoff);
  const neglectedItems=eligible.filter((item)=>item.laundryStatus==="Clean"&&(!item.lastWorn||String(item.lastWorn)<cutoffKey)).sort((a,b)=>Number(a.timesWorn||0)-Number(b.timesWorn||0)).slice(0,6);
  const colors=new Map(); recent.flatMap((entry)=>entry.wardrobeItemIds||[]).forEach((id)=>{const color=eligible.find((item)=>item.id===id)?.primaryColor;if(color)colors.set(color,(colors.get(color)||0)+1)});
  const neglectedIds=new Set(neglectedItems.map((item)=>item.id));
  const suggestedOutfit=saved.find((outfit)=>(outfit.wardrobeItemIds||outfit.outfit?.wardrobeItemIds||[]).some((id)=>neglectedIds.has(id)))||saved[0]||null;
  return { sinceKey,untilKey:localDateKey(today),wornItemCount:wornIds.size,totalItemCount:eligible.length,outfitDays:new Set(recent.map((entry)=>entry.wearDate)).size,closetUsagePercent:eligible.length?Math.round(wornIds.size/eligible.length*100):0,mostRepeatedItem,bestValueItem,bestValueCostPerWear:bestValueItem?Math.round(bestValueItem.purchasePrice/bestValueItem.timesWorn):null,neglectedItems,usefulColors:[...colors.entries()].map(([color,wears])=>({color,wears})).sort((a,b)=>b.wears-a.wears).slice(0,4),suggestedOutfit};
}

function compatibilityScore(candidate,item) {
  let score=0;
  if (normalizeGarmentCategory(candidate.category,candidate.subCategory)===normalizeGarmentCategory(item.category,item.subCategory)) score+=40;
  if (normalizeSearch(candidate.subCategory)===normalizeSearch(item.subCategory)) score+=25;
  if (normalizeSearch(candidate.primaryColor)===normalizeSearch(item.primaryColor)) score+=15;
  if (normalizeSearch(candidate.pattern)===normalizeSearch(item.pattern)) score+=10;
  if (normalizeSearch(candidate.material)===normalizeSearch(item.material)) score+=10;
  return score;
}

export function deterministicPurchaseCheck(candidate,wardrobe=[],price) {
  const usable=wardrobe.filter((item)=>!item.hiddenFromAI&&item.laundryStatus!=="Laundry");
  const similar=usable.map((item)=>({item,score:compatibilityScore(candidate,item)})).filter((entry)=>entry.score>=65).sort((a,b)=>b.score-a.score).slice(0,6);
  const candidateSlot=lookbookSlotFor(candidate), bySlot=Object.fromEntries(LOOKBOOK_SLOTS.map((slot)=>[slot,usable.filter((item)=>lookbookSlotFor(item)===slot)]));
  const combinations=[];
  const bases=candidateSlot==="hero"?["footwear","accessory"]:candidateSlot==="top"?["bottom","layer","footwear","accessory"]:candidateSlot==="bottom"?["top","layer","footwear","accessory"]:["top","bottom","footwear","accessory"];
  for(let index=0;index<12;index+=1){const ids=bases.map((slot)=>bySlot[slot]?.[index%Math.max(1,bySlot[slot]?.length||1)]?.id).filter(Boolean);const key=[...new Set(ids)].sort().join("|");if(ids.length>=2&&!combinations.some((entry)=>entry.key===key))combinations.push({key,itemIds:[...new Set(ids)],explanation:"A grounded combination using compatible pieces already in your wardrobe."})}
  const expectedWears=Math.max(5,Math.min(30,combinations.length*2||5));
  return {similarItems:similar.map((entry)=>entry.item),similarityMatches:similar,possibleOutfits:combinations.length,compatiblePieceCount:new Set(combinations.flatMap((entry)=>entry.itemIds)).size,calculationNote:`${combinations.length} concrete combinations were built from compatible owned garment IDs. Similarity requires a score of at least 65.`,estimatedCostPerWear:Number(price)>0?Math.round(Number(price)/expectedWears):null,verdict:similar.length>=2?"duplicate":combinations.length>=4?"strong_buy":"consider",reasons:[similar.length?`${similar.length} genuinely similar owned item${similar.length===1?"":"s"} found.`:"No close duplicate was found from the available metadata.",`${combinations.length} wearable combinations use pieces already in your closet.`],outfitExamples:combinations.map(({itemIds,explanation})=>({itemIds,explanation}))};
}

export function onlyKnownIds(combinations,wardrobe) { const valid=new Set(wardrobe.map((item)=>item.id)); return combinations.every((entry)=>(entry.itemIds||[]).every((id)=>valid.has(id))); }

export const PROMPT_REGISTRY = {
  outfit_stylist: { version: 6, releaseTag: "privacy-aware-usage-2026-08" },
  style_this: { version: 6, releaseTag: "privacy-aware-usage-2026-08" },
  smart_purchase: { version: 2, releaseTag: "verified-combinations-2026-08" },
  trip_packing: { version: 7, releaseTag: "balanced-multi-day-rotation-2026-08" },
  festival_stylist: { version: 3, releaseTag: "privacy-aware-usage-2026-08" },
  push_notification: { version: 1, releaseTag: "admin-campaign-drafts-2026-08" },
};

export function stableHash(value="") {
  let hash=2166136261;
  for(const character of String(value)){hash^=character.charCodeAt(0);hash=Math.imul(hash,16777619);}
  return (hash>>>0).toString(36);
}

export function promptStamp(promptId, requestPrompt="") {
  const definition=PROMPT_REGISTRY[promptId]||{version:1,releaseTag:"unclassified"};
  return { promptId, promptVersion:definition.version, promptHash:stableHash(`${promptId}:${definition.version}:${definition.releaseTag}`), requestPromptHash:requestPrompt?stableHash(requestPrompt):"" };
}

export function wardrobeFingerprint(wardrobe=[]) {
  return stableHash(wardrobe.map((item)=>[item.id,item.updatedAt?.seconds||item.updatedAt||"",item.hiddenFromAI,item.privateItem,item.laundryStatus].join(":")).sort().join("|"));
}

export function eligibleWardrobe(wardrobe=[]) {
  return wardrobe.filter((item)=>item?.id && item.hiddenFromAI!==true && item.privateItem!==true && item.stylingUsage!=="private_innerwear" && String(item.laundryStatus||"").toLowerCase()!=="laundry");
}

export function validateGroundedOutfit(raw={},wardrobe=[]) {
  const eligible=eligibleWardrobe(wardrobe),byId=new Map(eligible.map((item)=>[String(item.id),item]));
  const ids=Array.isArray(raw.wardrobeItemIds)?raw.wardrobeItemIds.map(String):[];
  if(ids.length<2||ids.length>6)throw new Error("The result is not a complete wardrobe outfit.");
  if(new Set(ids).size!==ids.length)throw new Error("The result repeated the same garment.");
  if(ids.some((id)=>!byId.has(id)))throw new Error("The result referenced an unavailable garment.");
  const slots=ids.map((id)=>lookbookSlotFor(byId.get(id)));
  const wearable=slots.includes("hero")?slots.some((slot)=>["footwear","layer","accessory"].includes(slot)):slots.includes("top")&&slots.includes("bottom");
  if(!wearable)throw new Error("The result did not contain the main pieces needed for a wearable outfit.");
  return {
    score:Math.max(0,Math.min(100,Math.round(Number(raw.score)||80))),
    title:String(raw.title||"Your ClothMatics look").trim().slice(0,80),
    subtitle:String(raw.subtitle||"Styled from clothes you already own.").trim().slice(0,240),
    wardrobeItemIds:ids,
    reasoning:(Array.isArray(raw.reasoning)?raw.reasoning:[]).map((value)=>String(value).replace(/\s*\([A-Za-z0-9_-]{10,}\)/g,"").trim()).filter(Boolean).slice(0,5),
    shoppingSuggestions:[],
  };
}

export function prioritizeOutfitItems(items=[]) {
  const weight={hero:0,top:1,layer:2,bottom:3,footwear:4,accessory:5};
  return [...items].sort((a,b)=>(weight[lookbookSlotFor(a)]??9)-(weight[lookbookSlotFor(b)]??9));
}

const SAFE_GARMENT_FIELDS = new Set(["title","category","subCategory","primaryColor","secondaryColors","colorDetail","pattern","material","fabric","fabricTexture","fit","season","occasion","userOccasions","brand","purchasePrice","purchaseYear","remarks","notes","tags","userConfirmed","favorite","inLookbook","hiddenFromAI","laundryStatus"]);
export function safeGarmentPatch(input={}) {
  const output={};
  for(const [key,value] of Object.entries(input)){
    if(!SAFE_GARMENT_FIELDS.has(key))continue;
    if(["favorite","inLookbook","hiddenFromAI","userConfirmed"].includes(key))output[key]=value===true;
    else if(["purchasePrice","purchaseYear"].includes(key))output[key]=Math.max(0,Number(value)||0);
    else if(["secondaryColors","season","userOccasions","tags"].includes(key))output[key]=(Array.isArray(value)?value:String(value||"").split(",")).map((item)=>String(item).trim().slice(0,60)).filter(Boolean).slice(0,20);
    else output[key]=String(value??"").trim().slice(0,key==="notes"||key==="remarks"?500:key==='colorDetail'||key==='fabricTexture'?300:120);
  }
  return output;
}

export function validHttpsImages(items=[],minimum=3) {
  const urls=items.map((item)=>String(item?.image||item?.imageUrl||"").trim()).filter((url)=>/^https:\/\//i.test(url));
  if(urls.length<minimum)throw new Error(`At least ${minimum} existing HTTPS garment images are required.`);
  return urls;
}

export function embeddedNotificationOutfit(notification={}) {
  const outfit=notification?.outfit||notification?.params?.outfit||notification?.payload?.params?.outfit||notification?.target?.params?.outfit;
  return outfit&&Array.isArray(outfit.wardrobeItemIds)?outfit:null;
}
