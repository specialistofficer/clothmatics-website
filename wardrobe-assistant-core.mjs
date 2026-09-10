export const WARDROBE_ASSISTANT_CONTRACT = Object.freeze({
  cacheVersion: "packing-v10",
  promptId: "trip_packing",
  promptVersion: 7,
  releaseTag: "balanced-multi-day-rotation-2026-08",
  maxTripDays: 31,
  maxForecastDays: 16,
  maxWardrobeItems: 120,
});

const MONTHS = Object.freeze({
  jan: 0, january: 0, feb: 1, february: 1, mar: 2, march: 2,
  apr: 3, april: 3, may: 4, jun: 5, june: 5, jul: 6, july: 6,
  aug: 7, august: 7, sep: 8, sept: 8, september: 8, oct: 9,
  october: 9, nov: 10, november: 10, dec: 11, december: 11,
});

const MONTH_PATTERN = "jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|jun(?:e)?|jul(?:y)?|aug(?:ust)?|sep(?:t(?:ember)?)?|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?";
const TRIP_WORDS = /\b(trip|travel|travelling|traveling|going|flight|flying|visit|visiting|vacation|holiday|weekend|journey|pack|packing|bag|hotel|stay|staying|wedding|event|rahunga|rahungi|rhunga|rhungi|jaunga|jaungi|jana|lekr|lekar)\b/i;
const FESTIVAL_PATTERN = /\b(rakhi|raksha\s*bandhan|diwali|deepavali|holi|navratri|garba|puja|pooja|bhai\s*dooj|janmashtami|ganesh|durga|dussehra|eid)\b/i;
const FINISHING_SLOTS = new Set(["accessory", "belt", "watch", "bag", "eyewear", "headwear", "tie", "drape"]);
const AUTHORITATIVE_DESTINATIONS = Object.freeze({
  goa: { destination: "Goa, India", latitude: 15.2993, longitude: 74.124 },
  jaipur: { destination: "Jaipur, Rajasthan, India", latitude: 26.9124, longitude: 75.7873 },
});

function calendarDate(year, month, day) {
  return new Date(Date.UTC(year, month, day, 12));
}

function dateParts(value) {
  return { year: value.getUTCFullYear(), month: value.getUTCMonth(), day: value.getUTCDate() };
}

function todayInZone(now, timeZone) {
  try {
    const parts = new Intl.DateTimeFormat("en-CA", {
      timeZone: timeZone || "Asia/Kolkata", year: "numeric", month: "2-digit", day: "2-digit",
    }).formatToParts(now).reduce((result, part) => ({ ...result, [part.type]: part.value }), {});
    return calendarDate(Number(parts.year), Number(parts.month) - 1, Number(parts.day));
  } catch {
    return calendarDate(now.getFullYear(), now.getMonth(), now.getDate());
  }
}

function addDays(value, count) {
  const next = new Date(value.getTime());
  next.setUTCDate(next.getUTCDate() + count);
  return next;
}

function isoDate(value) {
  const { year, month, day } = dateParts(value);
  return `${year}-${String(month + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

function displayDate(value) {
  return new Intl.DateTimeFormat("en-IN", { weekday: "short", day: "numeric", month: "short", timeZone: "UTC" }).format(value);
}

function resolveDayOfMonth(day, anchor) {
  if (day < 1 || day > 31) return null;
  const parts = dateParts(anchor);
  let candidate = calendarDate(parts.year, parts.month, day);
  if (candidate.getUTCMonth() !== parts.month) return null;
  if (candidate < anchor) candidate = calendarDate(parts.year, parts.month + 1, day);
  return candidate.getUTCDate() === day ? candidate : null;
}

function explicitNamedDate(query, reference) {
  const dayFirst = query.match(new RegExp(`\\b(\\d{1,2})(?:st|nd|rd|th)?\\s+(${MONTH_PATTERN})(?:\\s+(\\d{4}))?\\b`, "i"));
  const monthFirst = query.match(new RegExp(`\\b(${MONTH_PATTERN})\\s+(\\d{1,2})(?:st|nd|rd|th)?(?:,?\\s+(\\d{4}))?\\b`, "i"));
  const match = dayFirst
    ? { day: dayFirst[1], month: dayFirst[2], year: dayFirst[3] }
    : monthFirst ? { day: monthFirst[2], month: monthFirst[1], year: monthFirst[3] } : null;
  if (!match) return null;
  const month = MONTHS[match.month.toLowerCase()];
  if (month === undefined) return null;
  const ref = dateParts(reference);
  let year = Number(match.year) || ref.year;
  let value = calendarDate(year, month, Number(match.day));
  if (!match.year && value < reference) value = calendarDate(year + 1, month, Number(match.day));
  return value.getUTCMonth() === month ? value : null;
}

export function inferTripDateIntent(query, now = new Date(), timeZone = "Asia/Kolkata") {
  const text = String(query || "").toLowerCase().replace(/[–—]/g, "-");
  const today = todayInZone(now, timeZone);
  const isTrip = TRIP_WORDS.test(text);
  if (!isTrip) return { isTrip: false, startDate: null, endDate: null, requestedDays: null, dateLabels: [], dateRange: "", hasCalendarRange: false };

  let start = today;
  if (/\b(day after tomorrow|parso)\b/i.test(text)) start = addDays(today, 2);
  else if (/\b(tomorrow|kal)(?:\s+(?:morning|evening|night|subah|shaam|raat))?\b/i.test(text)) start = addDays(today, 1);
  else if (/\b(today|aaj|tonight)\b/i.test(text)) start = today;

  const namedEndText = text.match(new RegExp(`\\b(?:until|till|through|upto|up\\s+to|to|tak|tk)\\s+((?:\\d{1,2}(?:st|nd|rd|th)?\\s+)?(?:${MONTH_PATTERN})(?:\\s+\\d{1,2}(?:st|nd|rd|th)?)?(?:,?\\s+\\d{4})?)`, "i"))?.[1];
  const namedEnd = namedEndText ? explicitNamedDate(namedEndText, start) : null;
  const namedStart = explicitNamedDate(text, today);
  const namedFromText = text.match(new RegExp(`\\bfrom\\s+((?:\\d{1,2}(?:st|nd|rd|th)?\\s+)?(?:${MONTH_PATTERN})(?:\\s+\\d{1,2}(?:st|nd|rd|th)?)?(?:,?\\s+\\d{4})?)`, "i"))?.[1];
  const namedFrom = namedFromText ? explicitNamedDate(namedFromText, today) : null;
  if (namedFrom) start = namedFrom;
  else if (namedStart && !namedEnd) start = namedStart;

  const fromDay = text.match(/\b(?:from\s+)?(\d{1,2})(?:st|nd|rd|th)?\s+(?:se\s+)?(?:to|until|till|through|se)\s+(\d{1,2})(?:st|nd|rd|th)?\b/i);
  if (fromDay) start = resolveDayOfMonth(Number(fromDay[1]), today) || start;

  const explicitDuration = text.match(/\b(\d{1,2})\s*(?:day|days|night|nights|din|dino)\b/i);
  const weekDuration = text.match(/\b(\d{1,2})?\s*(?:week|weeks|hafta|hafte)\b/i);
  let requestedDays = explicitDuration ? Number(explicitDuration[1]) : weekDuration ? (Number(weekDuration[1]) || 1) * 7 : null;
  let end = namedEnd;
  const endDayMatch = text.match(/\b(?:until|till|through|upto|up\s+to|to)\s+(?:the\s+)?(\d{1,2})(?:st|nd|rd|th)?\b/i)
    || text.match(/\b(\d{1,2})(?:st|nd|rd|th)?\s*(?:tak|tk)\b/i)
    || (fromDay ? ["", fromDay[2]] : null);
  if (!end && endDayMatch) end = resolveDayOfMonth(Number(endDayMatch[1]), start);

  if (end) {
    const inclusiveDays = Math.floor((end.getTime() - start.getTime()) / 86_400_000) + 1;
    if (inclusiveDays > 0) requestedDays = inclusiveDays;
  } else if (requestedDays) end = addDays(start, requestedDays - 1);

  if (!requestedDays) return { isTrip, startDate: null, endDate: null, requestedDays: null, dateLabels: [], dateRange: "", hasCalendarRange: false };
  requestedDays = Math.min(WARDROBE_ASSISTANT_CONTRACT.maxTripDays, Math.max(1, requestedDays));
  end = addDays(start, requestedDays - 1);
  const dates = Array.from({ length: requestedDays }, (_, index) => addDays(start, index));
  return {
    isTrip, startDate: isoDate(start), endDate: isoDate(end), requestedDays,
    dateLabels: dates.map(displayDate),
    dateRange: requestedDays === 1 ? displayDate(start) : `${displayDate(start)} – ${displayDate(end)}`,
    hasCalendarRange: Boolean(endDayMatch || namedStart || namedEnd || /\b(today|aaj|tonight|tomorrow|kal|parso)\b/i.test(text)),
  };
}

export function normalizePlaceName(value = "") {
  return String(value).normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-z0-9]/gi, "").toLowerCase();
}

export function extractDestination(query = "") {
  const patterns = [
    /\b(?:going|travelling|traveling|flying|trip)\s+to\s+([a-z][a-z .'-]*?)(?=\s+(?:for|from|on|next|this|tomorrow|today|kal|parso)\b|[,?!]|$)/i,
    /\b(?:going|travelling|traveling|flying)\s+([a-z][a-z .'-]*?)(?=\s+(?:for|from|on|next|this|tomorrow|today|kal|parso)\b|[,?!]|$)/i,
    /\b(?:visit|visiting)\s+([a-z][a-z .'-]*?)(?=\s+(?:for|from|on|next|this|tomorrow|today|kal|parso)\b|[,?!]|$)/i,
    /\b(?:weekend|holiday|vacation|wedding|event)\s+in\s+([a-z][a-z .'-]*?)(?=\s+(?:for|from|on|next|this|tomorrow|today|kal|parso)\b|[,?!]|$)/i,
  ];
  for (const pattern of patterns) {
    const value = String(query).match(pattern)?.[1]?.trim();
    if (value && value.length >= 2) return value;
  }
  return Object.keys(AUTHORITATIVE_DESTINATIONS).find((name) => new RegExp(`\\b${name}\\b`, "i").test(query)) || null;
}

export async function getDestinationWeatherContext(query, tripIntent, fetchImpl = fetch) {
  const requested = extractDestination(query);
  if (!requested) return null;
  const normalized = normalizePlaceName(requested);
  const alias = AUTHORITATIVE_DESTINATIONS[normalized];
  let place = alias ? { name: alias.destination, latitude: alias.latitude, longitude: alias.longitude, country_code: "IN" } : null;
  try {
    if (!place) {
      const response = await fetchImpl(`https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(requested)}&count=10&language=en&format=json`);
      if (!response.ok) return null;
      const body = await response.json();
      const exact = (body?.results || []).filter((candidate) => normalizePlaceName(candidate?.name) === normalized);
      place = exact.find((candidate) => String(candidate?.country_code || "").toUpperCase() === "IN") || exact[0] || null;
    }
    if (!Number.isFinite(Number(place?.latitude)) || !Number.isFinite(Number(place?.longitude))) return null;
    const forecastDays = Math.min(WARDROBE_ASSISTANT_CONTRACT.maxForecastDays, Math.max(1, Number(tripIntent?.requestedDays) || 5));
    const url = `https://api.open-meteo.com/v1/forecast?latitude=${place.latitude}&longitude=${place.longitude}&daily=weather_code,temperature_2m_max,temperature_2m_min,precipitation_probability_max&timezone=auto&forecast_days=${forecastDays}`;
    const response = await fetchImpl(url);
    if (!response.ok) return null;
    const body = await response.json();
    const daily = body?.daily;
    if (!Array.isArray(daily?.time) || !daily.time.length) return null;
    const rows = daily.time.map((date, index) => ({
      date: String(date),
      min: Math.round(Number(daily.temperature_2m_min?.[index])),
      max: Math.round(Number(daily.temperature_2m_max?.[index])),
      rain: Math.round(Number(daily.precipitation_probability_max?.[index])),
    }));
    const destination = alias?.destination || [place.name, place.admin1, place.country].filter(Boolean).filter((value, index, all) => all.indexOf(value) === index).join(", ");
    return {
      destination,
      forecastDate: rows[0].date,
      rows,
      forecast: rows.map((row) => `${row.date}: ${row.min}-${row.max}°C, rain probability ${row.rain}%`).join("; "),
      maxRain: Math.max(0, ...rows.map((row) => Number(row.rain) || 0)),
    };
  } catch {
    return null;
  }
}

export function assistantOccasion(query = "") {
  const value = String(query).toLowerCase();
  if (/gym|workout|training|fitness/.test(value)) return "gym";
  if (/wedding|shaadi|reception|sangeet|mehendi/.test(value)) return "wedding";
  if (/beach|goa|seaside|coast/.test(value)) return "beach";
  if (/office|business|work trip|conference|meeting/.test(value)) return "office";
  if (/interview/.test(value)) return "interview";
  if (/party|club|concert/.test(value)) return "party";
  if (/date|romantic/.test(value)) return "date";
  if (/brunch/.test(value)) return "brunch";
  if (/college|campus/.test(value)) return "college";
  if (/formal|gala/.test(value)) return "formal";
  return "travel";
}

function itemText(item = {}) {
  return [item.title, item.category, item.subCategory, item.categoryRole, item.layerRole, ...(item.tags || [])].filter(Boolean).join(" ").toLowerCase();
}

function inferredUsage(item) {
  if (item.stylingUsage) return item.stylingUsage;
  const text = itemText(item);
  if (/bikini|swimwear|swimsuit|tankini|rash guard|swim shorts?/.test(text)) return "swimwear";
  if (/sports bra/.test(text)) return "activewear";
  if (/innerwear|underwear|lingerie|\bbra\b|briefs?|boxers?|pant(?:y|ies)|shapewear|\bslip\b|thermal inner|petticoat/.test(text)) return "private_innerwear";
  return "standard";
}

function normalizeOccasion(value = "") {
  const normalized = String(value).toLowerCase().replace(/[^a-z]/g, "");
  if (["wedding", "weddingfestive", "festive"].includes(normalized)) return "wedding";
  if (["gym", "gymworkout", "workout", "sportswear"].includes(normalized)) return "gym";
  if (normalized.includes("beach")) return "beach";
  if (["office", "businesscasual", "interview"].includes(normalized)) return "office";
  if (["formal", "formalevent"].includes(normalized)) return "formal";
  return normalized;
}

function explicitlyExcluded(item, query) {
  const request = String(query).toLowerCase();
  const text = itemText(item);
  const exclusion = "(?:avoid|skip|exclude|without|no|do not|don't|dont|not wearing)";
  const terms = ["trousers?", "jeans?", "shorts?", "skirts?", "dresses?", "blazers?", "jackets?", "shoes?", "sneakers?"];
  if (terms.some((term) => new RegExp(`${exclusion}\\s+(?:any\\s+)?(?:\\w+\\s+){0,3}${term}\\b`, "i").test(request) && new RegExp(`\\b${term}\\b`, "i").test(text))) return true;
  const colors = ["black", "white", "blue", "navy", "red", "green", "yellow", "orange", "pink", "purple", "brown", "beige", "grey", "gray", "teal", "maroon"];
  return colors.some((color) => new RegExp(`${exclusion}\\s+(?:any\\s+)?${color}\\b`, "i").test(request) && String(item.primaryColor || "").toLowerCase().includes(color));
}

export function wardrobeItemSlot(item = {}) {
  const text = itemText(item).replace(/[^a-z0-9]+/g, " ");
  if (item.layerRole === "outer") return "outerwear";
  if (/\b(loafer|shoe|sneaker|trainer|sandal|boot|heel|pump|slipper|espadrille|footwear|juti|jutti|mojari|kolhapuri)s?\b/.test(text)) return "footwear";
  if (/\bbelts?\b/.test(text)) return "belt";
  if (/\bwatches?\b/.test(text)) return "watch";
  if (/\b(bag|handbag|clutch|tote|backpack)s?\b/.test(text)) return "bag";
  if (/\b(sunglass|sunglasses|eyewear)\b/.test(text)) return "eyewear";
  if (/\b(hat|cap|beanie)s?\b/.test(text)) return "headwear";
  if (/\b(tie|bowtie)s?\b/.test(text)) return "tie";
  if (/\b(scarf|scarves|dupatta|stole|shawl)\b/.test(text)) return "drape";
  if (String(item.category || "").toLowerCase() === "traditional set") return "one-piece";
  if (/\b(bottom|jeans?|pants?|trousers?|chinos?|shorts?|skirts?|leggings?|joggers?|cargo|palazzo)\b/.test(text)) return "bottom";
  if (/\b(dress shirt|shirts?|t shirts?|tshirts?|tees?|tops?|blouses?|kurtas?|polos?|sweaters?|sweatshirts?|tank tops?|crop tops?)\b/.test(text)) return "top";
  if (/\b(dress|gown|jumpsuit|romper|one piece|saree|sari|lehenga|anarkali|salwar suit|kurta set|sherwani|dhoti set|traditional set|co ord set)\b/.test(text) || item.layerRole === "standalone" || item.standaloneOutfit) return "one-piece";
  if (/\b(outerwear|jacket|blazer|coat|cardigan|shrug|overshirt|bomber|hoodie|parka|trench)\b/.test(text)) return "outerwear";
  if (/\b(accessory|jewellery|jewelry|necklace|earring|bracelet|bangle)\b/.test(text) || item.layerRole === "accessory") return "accessory";
  return String(item.category || "").toLowerCase() === "bottom" ? "bottom" : "top";
}

export function eligibleWardrobeForAssistant(wardrobe = [], profile = {}, query = "") {
  const occasion = assistantOccasion(query);
  const preferences = profile?.preferences || {};
  const requested = normalizeOccasion(occasion);
  const explicitUsage = /bikini|swimwear|swimsuit|pool|resort|sports bra|activewear/.test(String(query).toLowerCase());
  return wardrobe.filter((item) => {
    if (!item?.id || item.hiddenFromAI === true || item.privateItem === true) return false;
    if (String(item.laundryStatus || "").toLowerCase() === "laundry") return false;
    const usage = inferredUsage(item);
    if (usage === "private_innerwear") return false;
    if (usage === "swimwear" && !["beach", "travel"].includes(requested) && !explicitUsage) return false;
    if (usage === "activewear" && !["gym", "travel", "casual"].includes(requested) && !explicitUsage) return false;
    if (explicitlyExcluded(item, query)) return false;
    if ((preferences.avoidColors || []).some((color) => String(item.primaryColor || "").toLowerCase() === String(color).toLowerCase())) return false;
    if ((preferences.hardExclusions || []).some((blocked) => itemText(item).includes(String(blocked).toLowerCase()))) return false;
    if (preferences.avoidOpenFootwear && /sandal|open.?toe|slide|slipper/.test(itemText(item))) return false;
    if (preferences.coverageRules?.shortsAllowed === false && !["gym", "beach"].includes(requested) && /shorts?/.test(itemText(item))) return false;
    if (preferences.coverageRules?.sleevelessAllowed === false && /sleeveless|tank top/.test(itemText(item))) return false;
    if (String(item.userRestrictions || "").toLowerCase().includes(`not for ${occasion.toLowerCase()}`)) return false;
    if (item.userConfirmed && Array.isArray(item.userOccasions) && item.userOccasions.length && ["gym", "beach", "wedding", "formal", "office"].includes(requested)) {
      const allowed = requested === "office" ? ["office", "formal"] : requested === "formal" ? ["formal", "office"] : [requested];
      if (!item.userOccasions.some((value) => allowed.includes(normalizeOccasion(value)))) return false;
    }
    if (requested === "gym" && wardrobeItemSlot(item) === "footwear" && !/sports shoe|sneaker|trainer|running/.test(itemText(item))) return false;
    return true;
  }).slice(0, WARDROBE_ASSISTANT_CONTRACT.maxWardrobeItems);
}

function weatherForDate(weather, startDate, index) {
  if (!startDate) return "Weather unavailable for this date";
  const start = new Date(`${startDate}T12:00:00Z`);
  const date = isoDate(addDays(start, index));
  const row = weather?.rows?.find((entry) => entry.date === date);
  return row ? `${row.min}-${row.max}°C, rain probability ${row.rain}%` : "Forecast unavailable for this date";
}

function activityForDay(query, dateLabel, index, total, modelActivity = "") {
  const festival = String(query).match(FESTIVAL_PATTERN)?.[1];
  const weekday = String(query).match(/\b(monday|tuesday|wednesday|thursday|friday|saturday|sunday)\b/i)?.[1];
  if (festival && weekday && String(dateLabel).toLowerCase().startsWith(weekday.slice(0, 3).toLowerCase())) {
    return /rakhi|raksha/i.test(festival) ? "Rakhi celebration" : `${festival.charAt(0).toUpperCase()}${festival.slice(1)} celebration`;
  }
  if (String(modelActivity).trim()) return String(modelActivity).trim().slice(0, 100);
  if (index === 0) return "Travel and arrival";
  if (index === total - 1) return "Return travel";
  return "Local exploration";
}

function isFinishing(item) { return FINISHING_SLOTS.has(wardrobeItemSlot(item)); }
function description(item) { return itemText(item); }
function unique(values) { return [...new Set(values)]; }

function outerwearNeeded(query, activity, weather) {
  const requestText = `${query} ${activity}`.toLowerCase();
  const weatherText = String(weather || "").toLowerCase();
  const low = Number(weatherText.match(/(-?\d+)\s*[-–]\s*(-?\d+)\s*°?c/i)?.[1]);
  const rain = Number(weatherText.match(/rain probability\s+(\d{1,3})%/i)?.[1]);
  return /\b(cold|chilly|winter|snow|rain|storm)\b/.test(requestText) || (Number.isFinite(low) && low <= 20) || (Number.isFinite(rain) && rain >= 60) || /\b(formal|business|gala|interview)\b/.test(requestText);
}

function contextScore(item, group, query, activity, weather) {
  const text = description(item);
  const context = `${query} ${activity}`.toLowerCase();
  const festival = FESTIVAL_PATTERN.test(context) || /traditional|wedding|shaadi|sangeet|mehendi/.test(context);
  const formal = /business|office|conference|meeting|interview|formal|gala|reception|wedding|shaadi|sangeet/.test(context);
  let score = item.favorite ? 2 : 0;
  if (/black|white|grey|gray|navy|beige|tan|brown|cream|ivory|khaki|denim/.test(String(item.primaryColor || "").toLowerCase())) score += 2;
  if (festival) {
    if (["one-piece", "top"].includes(group) && /kurta|kurti|saree|sari|lehenga|sherwani|anarkali|ethnic|traditional|bandhgala|nehru/.test(text)) score += 30;
    if (group === "bottom" && !/cargo|short|jogger|track/.test(text)) score += 8;
    if (group === "footwear" && /juti|jutti|mojari|kolhapuri|loafer|formal shoe|sandal|flat|heel|pump/.test(text)) score += 18;
    if (group === "accessory" && /jewel|earring|necklace|bracelet|bangle|dupatta|stole|watch|clutch/.test(text)) score += 14;
    if (/cargo|graphic t|sports sneaker|running shoe|baseball|backpack/.test(text)) score -= 30;
  } else if (!formal) {
    if (/t-?shirt|polo|casual|jean|chino|comfortable|relaxed|sneaker|walking/.test(text)) score += 10;
    if (/formal|dress shirt|dress trouser|suit|stiletto/.test(text)) score -= 12;
  } else {
    if (/formal|dress shirt|dress trouser|chino|loafer|pump|blazer/.test(text)) score += 10;
    if (/cargo|jogger|track|short/.test(text)) score -= 20;
  }
  if (group === "outerwear" && !outerwearNeeded(query, activity, weather)) score -= 100;
  return score;
}

function selectLeastUsed(items, group, useCounts, previousIds, query, activity, weather, offset = 0) {
  if (!items.length) return null;
  const notYesterday = items.filter((item) => !previousIds.has(item.id));
  const pool = notYesterday.length ? notYesterday : items;
  const minimum = Math.min(...pool.map((item) => useCounts.get(item.id) || 0));
  const best = pool.filter((item) => (useCounts.get(item.id) || 0) === minimum)
    .sort((a, b) => contextScore(b, group, query, activity, weather) - contextScore(a, group, query, activity, weather) || String(a.id).localeCompare(String(b.id)));
  return best[offset % best.length] || best[0] || null;
}

function completeDayIds(seedIds, wardrobe, context, useCounts, previousIds, offset) {
  const byId = new Map(wardrobe.map((item) => [String(item.id), item]));
  let ids = unique((seedIds || []).map(String)).filter((id) => byId.has(id));
  const grouped = () => new Map(ids.map((id) => [wardrobeItemSlot(byId.get(id)), id]));
  const candidates = (slot) => wardrobe.filter((item) => wardrobeItemSlot(item) === slot);
  const choose = (slot) => selectLeastUsed(candidates(slot), slot === "accessory" ? "accessory" : slot, useCounts, previousIds, context.query, context.activity, context.weather, offset);
  const replace = (slot, item) => {
    if (!item) return;
    ids = ids.filter((id) => wardrobeItemSlot(byId.get(id)) !== slot);
    ids.push(item.id);
  };

  const festival = FESTIVAL_PATTERN.test(`${context.query} ${context.activity}`) || /wedding|shaadi|sangeet|mehendi/.test(`${context.query} ${context.activity}`.toLowerCase());
  if (festival) {
    ids = ids.filter((id) => {
      const item = byId.get(id);
      const slot = wardrobeItemSlot(item);
      if (slot === "footwear") return /juti|jutti|mojari|kolhapuri|loafer|formal shoe|sandal|flat|heel|pump/.test(description(item));
      if (isFinishing(item)) return !/sport|baseball|backpack/.test(description(item));
      return true;
    });
    const festiveOne = candidates("one-piece").sort((a, b) => contextScore(b, "one-piece", context.query, context.activity, context.weather) - contextScore(a, "one-piece", context.query, context.activity, context.weather))[0];
    if (festiveOne && contextScore(festiveOne, "one-piece", context.query, context.activity, context.weather) > 10) {
      ids = ids.filter((id) => !["top", "bottom", "one-piece"].includes(wardrobeItemSlot(byId.get(id))));
      ids.push(festiveOne.id);
    }
  }

  let slots = grouped();
  if (slots.has("one-piece")) ids = ids.filter((id) => !["top", "bottom"].includes(wardrobeItemSlot(byId.get(id))));
  else {
    if (!slots.has("top")) { replace("top", choose("top")); slots = grouped(); }
    if (!slots.has("bottom")) { replace("bottom", choose("bottom")); slots = grouped(); }
  }

  slots = grouped();
  const top = slots.has("top") ? byId.get(slots.get("top")) : null;
  const bottom = slots.has("bottom") ? byId.get(slots.get("bottom")) : null;
  if (top && bottom && /formal|dress shirt/.test(description(top)) && /cargo/.test(description(bottom))) {
    const casualTop = candidates("top").filter((item) => !/formal|dress shirt/.test(description(item)));
    const formalBottom = candidates("bottom").filter((item) => !/cargo/.test(description(item)));
    if (/business|office|formal|conference|meeting|interview|wedding/.test(`${context.query} ${context.activity}`.toLowerCase())) replace("bottom", selectLeastUsed(formalBottom, "bottom", useCounts, previousIds, context.query, context.activity, context.weather, offset));
    else replace("top", selectLeastUsed(casualTop, "top", useCounts, previousIds, context.query, context.activity, context.weather, offset));
  }

  const currentIds = [...ids];
  const groups = currentIds.some((id) => wardrobeItemSlot(byId.get(id)) === "one-piece")
    ? ["one-piece", "footwear", "accessory"] : ["top", "bottom", "footwear", "accessory"];
  for (const group of groups) {
    const inGroup = (item) => group === "accessory" ? isFinishing(item) : wardrobeItemSlot(item) === group;
    const current = ids.map((id) => byId.get(id)).find((item) => item && inGroup(item));
    const choices = wardrobe.filter(inGroup).filter((item) => !festival || group !== "footwear" || /juti|jutti|mojari|kolhapuri|loafer|formal shoe|sandal|flat|heel|pump/.test(description(item)));
    if (!current || !previousIds.has(current.id) || choices.length <= 1) continue;
    const replacement = selectLeastUsed(choices, group, useCounts, previousIds, context.query, context.activity, context.weather, offset);
    if (!replacement) continue;
    ids = ids.filter((id) => !inGroup(byId.get(id)));
    ids.push(replacement.id);
  }

  ids = ids.filter((id) => wardrobeItemSlot(byId.get(id)) !== "outerwear" || outerwearNeeded(context.query, context.activity, context.weather));
  slots = grouped();
  if (!slots.has("footwear")) {
    const footwearChoices = candidates("footwear").filter((item) => !festival || /juti|jutti|mojari|kolhapuri|loafer|formal shoe|sandal|flat|heel|pump/.test(description(item)));
    const footwear = selectLeastUsed(footwearChoices, "footwear", useCounts, previousIds, context.query, context.activity, context.weather, offset);
    replace("footwear", footwear);
  }
  if (!ids.map((id) => byId.get(id)).some(isFinishing)) {
    const accessories = wardrobe.filter(isFinishing).filter((item) => !festival || !/sport|baseball|backpack/.test(description(item)));
    const accessory = selectLeastUsed(accessories, "accessory", useCounts, previousIds, context.query, context.activity, context.weather, offset);
    if (accessory) ids.push(accessory.id);
  }

  const occupied = new Set();
  ids = ids.filter((id) => {
    const slot = wardrobeItemSlot(byId.get(id));
    if (occupied.has(slot)) return false;
    occupied.add(slot);
    return true;
  });
  return ids;
}

export function requiredMissingCategories(itemIds = [], wardrobe = []) {
  const byId = new Map(wardrobe.map((item) => [String(item.id), item]));
  const selected = itemIds.map(String).map((id) => byId.get(id)).filter(Boolean);
  const slots = new Set(selected.map(wardrobeItemSlot));
  const missing = [];
  if (!slots.has("one-piece")) {
    if (!slots.has("top")) missing.push("Top");
    if (!slots.has("bottom")) missing.push("Bottom");
  }
  if (!slots.has("footwear")) missing.push("Footwear");
  if (!selected.some(isFinishing)) missing.push("Accessory");
  return missing;
}

export function parsePackingResponseText(responseText) {
  const unfenced = String(responseText || "").replace(/```(?:json)?|```/gi, "").trim();
  const start = unfenced.indexOf("{");
  const end = start >= 0 ? findRootObjectEnd(unfenced, start) : -1;
  const candidate = start >= 0 && end > start ? unfenced.slice(start, end + 1) : unfenced;
  try { return JSON.parse(candidate); }
  catch {
    try { return JSON.parse(candidate.replace(/,\s*([}\]])/g, "$1")); }
    catch { throw new Error("The wardrobe assistant returned an incomplete response. Please try again."); }
  }
}

function findRootObjectEnd(text, start) {
  let depth = 0, inString = false, escaped = false;
  for (let index = start; index < text.length; index += 1) {
    const char = text[index];
    if (inString) {
      if (escaped) escaped = false;
      else if (char === "\\") escaped = true;
      else if (char === '"') inString = false;
      continue;
    }
    if (char === '"') inString = true;
    else if (char === "{") depth += 1;
    else if (char === "}" && --depth === 0) return index;
  }
  return -1;
}

function safeText(value, fallback = "", maximum = 400) {
  const text = String(value ?? "").trim();
  return String(text || fallback).trim().slice(0, maximum);
}

export function emptyWardrobeResponse(tripIntent) {
  return {
    message: tripIntent.requestedDays
      ? `I understood your ${tripIntent.requestedDays}-day trip${tripIntent.dateRange ? ` (${tripIntent.dateRange})` : ""}, but your ClothMatics wardrobe is empty. Add or scan a few clothes in the mobile app and I’ll build complete daily outfits from what you actually own.`
      : "Your closet is empty right now. Add a few clothes in the ClothMatics mobile app and I’ll work only from what you actually own.",
    listTitle: "Getting started", packList: [],
    missing: tripIntent.isTrip ? [
      { title: "Everyday tops", category: "Top", reason: "Add your actual tops so daily combinations can be planned." },
      { title: "Comfortable bottoms", category: "Bottom", reason: "At least one suitable bottom or a one-piece is needed." },
      { title: "Walking footwear", category: "Footwear", reason: "Trip outfits should include suitable footwear." },
    ] : [],
    tips: ["Add clothes in the mobile app, then run this same request again."], tripPlan: null,
  };
}

export function noEligibleWardrobeResponse() {
  return { message: "I couldn't find any currently available garments that satisfy your saved preferences and restrictions.", listTitle: "No suitable items available", packList: [], missing: [], tips: ["Check laundry status and your garment or style restrictions in the mobile app."], tripPlan: null };
}

export function reconcilePackingResponse(raw = {}, { query = "", tripIntent, weather = null, wardrobe = [], variationSeed = 0, excludedCombinations = [] } = {}) {
  const byId = new Map(wardrobe.map((item) => [String(item.id), item]));
  const validIds = new Set(byId.keys());
  const rawPackList = Array.isArray(raw.packList) ? raw.packList : [];
  const invalidRows = [];
  const seen = new Set();
  const packList = [];
  for (const row of rawPackList) {
    const itemId = row?.itemId ? String(row.itemId) : null;
    if (!itemId || !validIds.has(itemId)) {
      if (row?.title || row?.category) invalidRows.push({ title: safeText(row.title, "Suggested item", 100), category: safeText(row.category, "Other", 60), reason: safeText(row.reason, "This item is not currently in your wardrobe.", 240) });
      continue;
    }
    if (seen.has(itemId)) continue;
    seen.add(itemId);
    const item = byId.get(itemId);
    packList.push({ itemId, title: safeText(item?.title || row.title, "Wardrobe item", 100), category: safeText(item?.category || row.category, "Other", 60), quantity: 1, reason: safeText(row.reason, "Selected from your wardrobe.", 240) });
  }
  let missing = [...(Array.isArray(raw.missing) ? raw.missing : []), ...invalidRows].map((row) => ({ title: safeText(row?.title, "Suggested item", 100), category: safeText(row?.category, "Other", 60), reason: safeText(row?.reason, "Useful for this request.", 240) }));
  missing = missing.filter((row, index, all) => row.title && all.findIndex((other) => other.title.toLowerCase() === row.title.toLowerCase()) === index);
  if ((weather?.maxRain || 0) < 60 && !/\b(rain|monsoon|storm)\b/i.test(query)) missing = missing.filter((row) => !/rain\s*(?:coat|jacket)|waterproof\s*(?:coat|jacket)/i.test(`${row.title} ${row.reason}`));

  const rawPlan = raw?.tripPlan && typeof raw.tripPlan === "object" ? raw.tripPlan : null;
  const rawDays = Array.isArray(rawPlan?.days) ? rawPlan.days.slice(0, WARDROBE_ASSISTANT_CONTRACT.maxTripDays) : [];
  const planCount = tripIntent?.isTrip ? Number(tripIntent.requestedDays) || 0 : 0;
  const useCounts = new Map();
  const signatures = new Set();
  const excluded = new Set((excludedCombinations || []).map((ids) => unique((ids || []).map(String)).sort().join("|")));
  let previous = [];
  const days = planCount ? Array.from({ length: planCount }, (_, index) => {
    const source = rawDays[index] || rawDays[index % Math.max(rawDays.length, 1)] || {};
    const verifiedDateLabel = tripIntent.dateLabels?.[index] || "";
    const dateLabel = tripIntent.hasCalendarRange ? verifiedDateLabel : `Day ${index + 1}`;
    const activity = activityForDay(query, verifiedDateLabel || dateLabel, index, planCount, rawDays[index] ? source.activity : "");
    const dayWeather = weatherForDate(weather, tripIntent.startDate, index);
    const sourceIds = unique((Array.isArray(source.itemIds) ? source.itemIds : []).map(String)).filter((id) => validIds.has(id));
    const context = { query, activity, weather: dayWeather };
    let ids = completeDayIds(sourceIds, wardrobe, context, useCounts, new Set(previous), index + variationSeed);
    if (!ids.length || requiredMissingCategories(ids, wardrobe).length >= 3) ids = completeDayIds([], wardrobe, context, useCounts, new Set(previous), index + variationSeed);
    let signature = [...ids].sort().join("|");
    if ((signatures.has(signature) || excluded.has(signature)) && wardrobe.length > ids.length) {
      const varied = completeDayIds([], wardrobe, context, useCounts, new Set(previous), index + variationSeed + 1);
      const variedSignature = [...varied].sort().join("|");
      if (varied.length && !signatures.has(variedSignature) && !excluded.has(variedSignature)) { ids = varied; signature = variedSignature; }
    }
    if (signature) signatures.add(signature);
    ids.forEach((id) => useCounts.set(id, (useCounts.get(id) || 0) + 1));
    const prior = new Set(previous);
    previous = ids;
    const missingCategories = requiredMissingCategories(ids, wardrobe);
    const repeated = ids.some((id) => prior.has(id));
    return {
      day: index + 1, dateLabel, activity, weather: dayWeather, itemIds: ids, missingCategories,
      note: safeText(source.note, repeated ? "A practical rewear from your current wardrobe; refresh between wears where needed." : "A complete combination selected from your wardrobe.", 260),
    };
  }) : [];

  const tripPlan = planCount && days.length === planCount ? {
    title: safeText(rawPlan?.title, "Your trip wardrobe", 100),
    destination: safeText(weather?.destination || rawPlan?.destination, "Your destination", 120),
    durationDays: planCount,
    dateRange: tripIntent.hasCalendarRange ? tripIntent.dateRange : "",
    days,
  } : null;

  if (tripPlan) {
    for (const id of unique(days.flatMap((day) => day.itemIds))) {
      if (seen.has(id)) continue;
      const item = byId.get(id); if (!item) continue;
      seen.add(id); packList.push({ itemId: id, title: safeText(item.title, "Wardrobe item", 100), category: safeText(item.category, "Other", 60), quantity: 1, reason: "Used in your day-by-day capsule plan." });
    }
    const missingCategories = new Set(days.flatMap((day) => day.missingCategories || []));
    const definitions = {
      Top: ["Versatile top", "Needed to complete one or more daily looks."],
      Bottom: ["Versatile bottom", "Needed to complete one or more daily looks."],
      Footwear: ["Occasion-appropriate footwear", "Every planned outfit requires suitable footwear."],
      Accessory: ["Versatile accessory", "Every planned outfit needs an intentional finishing piece."],
    };
    for (const category of missingCategories) {
      const [title, reason] = definitions[category] || [category, "Needed to complete the plan."];
      if (!missing.some((row) => row.category.toLowerCase() === category.toLowerCase())) missing.push({ title, category, reason });
    }
  }

  return {
    message: safeText(raw.message, tripPlan ? `I’ve built ${tripPlan.durationDays} complete daily plans from your eligible wardrobe.` : "Here’s what I found in your wardrobe.", 700),
    listTitle: safeText(raw.listTitle, tripPlan ? "Your packing list" : "Wardrobe advice", 100),
    packList,
    missing,
    tips: (Array.isArray(raw.tips) ? raw.tips : []).map((value) => safeText(value, "", 240)).filter(Boolean).slice(0, 6),
    tripPlan,
  };
}

export function buildWardrobeAssistantPrompt({ query, tripIntent, weather, profile, wardrobe, excludedCombinations = [], rerun = false }) {
  const compact = wardrobe.slice(0, WARDROBE_ASSISTANT_CONTRACT.maxWardrobeItems).map((item) => ({
    id: item.id, title: item.title, category: item.category, subCategory: item.subCategory || "", color: item.primaryColor || "",
    season: item.season || "", occasion: item.occasion || [], userOccasions: item.userOccasions || [], formality: item.formality || "",
    fit: item.fit || "", layerRole: item.layerRole || "", requiresBaseLayer: item.requiresBaseLayer === true,
    requiredComponents: item.requiredComponents || [], restrictions: item.userRestrictions || "",
  }));
  return `You are ClothMatics' professional Wardrobe Assistant for trip packing and closet advice. Be concise, warm, culturally aware, and grounded only in clothes the user owns.

USER PROFILE: ${JSON.stringify({ gender: profile?.gender || "Unspecified", bodyType: profile?.bodyTypeSelfReported || profile?.aiAnalysis?.bodyType || "", preferences: profile?.preferences || null })}
ELIGIBLE OWNED WARDROBE: ${JSON.stringify(compact)}
ORIGINAL REQUEST: ${JSON.stringify(query)}
DETERMINISTIC TRIP FACTS (source of truth): ${JSON.stringify(tripIntent)}
AUTHORITATIVE DESTINATION WEATHER: ${weather ? JSON.stringify({ destination: weather.destination, forecast: weather.forecast }) : "Unavailable. Do not invent weather or substitute the user's location."}
${rerun ? `RERUN: Preserve every fact and date but avoid these previous daily combinations where valid alternatives exist: ${JSON.stringify(excludedCombinations)}` : ""}

RULES:
1. Use only exact item IDs supplied above. Never invent ownership or use filtered-out clothes.
2. Each wardrobe row is one physical item. An owned packList item appears once with quantity 1. Rewear across days is allowed; never imply duplicate copies.
3. If this is a trip and requestedDays is present, durationDays and days.length must equal it exactly. Copy supplied date labels. Never shorten the plan.
4. Separates require Top + Bottom + Footwear + Accessory. A one-piece or complete traditional set requires Footwear + Accessory and no forced Bottom.
5. Never pair a formal shirt with cargo pants. Never pair sports sneakers with a ceremonial silk/traditional outfit unless fusion was requested.
6. Travel days prioritize breathable smart-casual comfort and practical footwear. Add outerwear only for <=20°C, >=60% rain, explicit cold/rain, or genuine formal layering.
7. Treat Indian festivals and weddings as culturally meaningful. Prefer coherent ethnic/Indo-Western pieces actually owned when suitable.
8. For longer trips use capsule wardrobe rewear, vary adjacent Top/Bottom choices when alternatives exist, and never omit a day.
9. When a required category is not owned, keep the day, list it in missingCategories and missing, and explain it. Do not invent a replacement.
10. For non-trip closet questions tripPlan must be null. Begin the message by acknowledging the user's context.

Return only this JSON shape:
{"message":"","listTitle":"","packList":[{"itemId":null,"title":"","category":"","quantity":1,"reason":""}],"missing":[{"title":"","category":"","reason":""}],"tips":[],"tripPlan":null}
For a trip, tripPlan is {"title":"","destination":"","durationDays":0,"dateRange":"","days":[{"day":1,"dateLabel":"","activity":"","weather":"","itemIds":[],"missingCategories":[],"note":""}]}.`;
}

export function assistantFingerprint({ query, weather, wardrobe, profile }) {
  const payload = {
    contract: WARDROBE_ASSISTANT_CONTRACT,
    query: String(query || "").trim().toLowerCase().replace(/\s+/g, " "),
    destination: weather?.destination || "none", forecastDate: weather?.forecastDate || "none",
    wardrobe: wardrobe.map((item) => ({ id: item.id, updatedAt: item.updatedAt?.seconds || item.updatedAt || "", laundryStatus: item.laundryStatus || "", hiddenFromAI: item.hiddenFromAI === true, userOccasions: item.userOccasions || [], restrictions: item.userRestrictions || "" })).sort((a, b) => String(a.id).localeCompare(String(b.id))),
    profile: { updatedAt: profile?.updatedAt?.seconds || profile?.updatedAt || "", preferencesVersion: profile?.preferencesVersion || 0, preferences: profile?.preferences || null },
  };
  return stableHash(JSON.stringify(payload));
}

export function stableHash(value = "") {
  let hash = 2166136261;
  for (const character of String(value)) { hash ^= character.charCodeAt(0); hash = Math.imul(hash, 16777619); }
  return (hash >>> 0).toString(36);
}
