import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import {
  WARDROBE_ASSISTANT_CONTRACT,
  assistantFingerprint,
  eligibleWardrobeForAssistant,
  emptyWardrobeResponse,
  getDestinationWeatherContext,
  inferTripDateIntent,
  noEligibleWardrobeResponse,
  parsePackingResponseText,
  reconcilePackingResponse,
  requiredMissingCategories,
  wardrobeItemSlot,
} from "../wardrobe-assistant-core.mjs";

const root = new URL("../", import.meta.url);
const clock = new Date("2026-08-24T20:30:00+05:30");

function item(id, title, category, extras = {}) {
  return { id, title, category, laundryStatus: "Clean", primaryColor: "Navy", ...extras };
}

const completeWardrobe = [
  item("top-a", "Relaxed Cotton T-Shirt", "Top"),
  item("top-b", "Blue Polo T-Shirt", "Top", { primaryColor: "Blue" }),
  item("bottom-a", "Black Chinos", "Bottom", { primaryColor: "Black" }),
  item("bottom-b", "Blue Jeans", "Bottom", { primaryColor: "Blue" }),
  item("shoes-a", "White Walking Sneakers", "Footwear", { primaryColor: "White" }),
  item("shoes-b", "Brown Loafers", "Footwear", { primaryColor: "Brown" }),
  item("watch-a", "Classic Watch", "Accessory", { primaryColor: "Silver" }),
  item("bag-a", "Travel Sling Bag", "Accessory", { primaryColor: "Black" }),
];

function rawTrip(days, ids = ["top-a", "bottom-a", "shoes-a", "watch-a"]) {
  return {
    message: "Your trip plan is ready.", listTitle: "Your packing list", packList: [], missing: [], tips: ["Use a capsule wardrobe."],
    tripPlan: { title: "Your trip wardrobe", destination: "Model city", durationDays: days.length, dateRange: "", days: days.map((day) => ({ day, dateLabel: "Wrong", activity: "", weather: "", itemIds: ids, note: "" })) },
  };
}

test("trip parser preserves Hinglish inclusive Jaipur dates", () => {
  const result = inferTripDateIntent("Me kal raat ko jaipur ki flight lekr 31 tk jaipur hi rhunga rakhi ka festival bhi hai Friday ko", clock);
  assert.equal(result.startDate, "2026-08-25");
  assert.equal(result.endDate, "2026-08-31");
  assert.equal(result.requestedDays, 7);
  assert.equal(result.dateLabels.length, 7);
});

test("trip parser resolves a bare end day into the following month", () => {
  const result = inferTripDateIntent("Kal Goa jaunga 2 tak stay hai", new Date("2026-08-30T20:30:00+05:30"));
  assert.deepEqual([result.startDate, result.endDate, result.requestedDays], ["2026-08-31", "2026-09-02", 3]);
});

test("trip parser handles durations, weeks, ranges and non-trip questions", () => {
  assert.equal(inferTripDateIntent("Business trip to Mumbai for 5 days", clock).requestedDays, 5);
  assert.equal(inferTripDateIntent("Manali travel for 2 weeks", clock).requestedDays, 14);
  const range = inferTripDateIntent("Trip from 28 August to 31 August", clock);
  assert.deepEqual([range.startDate, range.endDate, range.requestedDays], ["2026-08-28", "2026-08-31", 4]);
  const gap = inferTripDateIntent("What am I missing in my closet?", clock);
  assert.equal(gap.isTrip, false); assert.equal(gap.requestedDays, null);
});

test("exact requested duration repairs a shorter AI response", () => {
  const intent = inferTripDateIntent("Jaipur trip for 7 days", clock);
  const result = reconcilePackingResponse(rawTrip([1, 2]), { query: "Jaipur trip for 7 days", tripIntent: intent, wardrobe: completeWardrobe });
  assert.equal(result.tripPlan.durationDays, 7);
  assert.equal(result.tripPlan.days.length, 7);
  assert.deepEqual(result.tripPlan.days.map((day) => day.day), [1, 2, 3, 4, 5, 6, 7]);
});

test("hard-grounded destinations keep Goa and Jaipur in India", async () => {
  const calls = [];
  const mockFetch = async (url) => {
    calls.push(String(url));
    return { ok: true, async json() { return { daily: { time: ["2026-08-25"], temperature_2m_min: [23], temperature_2m_max: [32], precipitation_probability_max: [20] } }; } };
  };
  const goa = await getDestinationWeatherContext("Going to Goa for 5 days", inferTripDateIntent("Going to Goa for 5 days", clock), mockFetch);
  const jaipur = await getDestinationWeatherContext("Trip to Jaipur for 3 days", inferTripDateIntent("Trip to Jaipur for 3 days", clock), mockFetch);
  assert.equal(goa.destination, "Goa, India");
  assert.equal(jaipur.destination, "Jaipur, Rajasthan, India");
  assert.equal(calls.some((url) => url.includes("geocoding-api")), false);
  assert.equal(JSON.stringify([goa, jaipur]).includes("Genoa"), false);
});

test("weather failure is non-blocking and later dates never invent forecasts", () => {
  const intent = inferTripDateIntent("Trip to Jaipur for 17 days", clock);
  const weather = { destination: "Jaipur, Rajasthan, India", rows: Array.from({ length: 16 }, (_, index) => { const value = new Date(Date.UTC(2026, 7, 24 + index, 12)); return { date: value.toISOString().slice(0, 10), min: 20, max: 30, rain: 10 }; }), maxRain: 10 };
  const result = reconcilePackingResponse(rawTrip([1]), { query: "Trip to Jaipur for 17 days", tripIntent: intent, weather, wardrobe: completeWardrobe });
  assert.equal(result.tripPlan.days.length, 17);
  assert.equal(result.tripPlan.days.at(-1).weather, "Forecast unavailable for this date");
  const withoutWeather = reconcilePackingResponse(rawTrip([1]), { query: "Trip to Jaipur for 17 days", tripIntent: intent, weather: null, wardrobe: completeWardrobe });
  assert.match(withoutWeather.tripPlan.days[0].weather, /unavailable/i);
});

test("empty and fully filtered wardrobes return local responses", () => {
  const intent = inferTripDateIntent("Goa trip for 3 days", clock);
  assert.equal(emptyWardrobeResponse(intent).tripPlan, null);
  const filtered = eligibleWardrobeForAssistant([
    item("laundry", "Cotton Shirt", "Top", { laundryStatus: "Laundry" }),
    item("hidden", "Jeans", "Bottom", { hiddenFromAI: true }),
    item("private", "Private Innerwear", "Innerwear", { privateItem: true }),
  ], {}, "Goa trip for 3 days");
  assert.equal(filtered.length, 0);
  assert.equal(noEligibleWardrobeResponse().packList.length, 0);
});

test("unknown model IDs become missing and owned quantities stay one", () => {
  const intent = inferTripDateIntent("Trip to Mumbai for 2 days", clock);
  const raw = rawTrip([1], ["top-a", "unknown-id", "bottom-a", "shoes-a", "watch-a"]);
  raw.packList = [
    { itemId: "top-a", title: "Top", quantity: 4 },
    { itemId: "top-a", title: "Duplicate", quantity: 2 },
    { itemId: "invented", title: "Imaginary jacket", category: "Outerwear" },
  ];
  const result = reconcilePackingResponse(raw, { query: "Trip to Mumbai for 2 days", tripIntent: intent, wardrobe: completeWardrobe });
  assert.ok(result.packList.every((row) => row.quantity === 1));
  assert.equal(result.packList.filter((row) => row.itemId === "top-a").length, 1);
  assert.ok(result.missing.some((row) => row.title === "Imaginary jacket"));
  assert.equal(result.tripPlan.days.some((day) => day.itemIds.includes("unknown-id")), false);
});

test("slot classifier supports separates, one-piece and traditional structures", () => {
  assert.equal(wardrobeItemSlot(item("dress", "Summer Dress", "One-piece")), "one-piece");
  assert.equal(wardrobeItemSlot(item("saree", "Silk Saree", "Traditional set")), "one-piece");
  assert.deepEqual(requiredMissingCategories(["top-a", "bottom-a", "shoes-a", "watch-a"], completeWardrobe), []);
  const onePieceWardrobe = [item("dress", "Summer Dress", "One-piece"), item("heel", "Block Heels", "Footwear"), item("bag", "Clutch Bag", "Accessory")];
  assert.deepEqual(requiredMissingCategories(["dress", "heel", "bag"], onePieceWardrobe), []);
});

test("every trip day has footwear/accessory or explicit missing categories", () => {
  const wardrobe = [item("top", "T-Shirt", "Top"), item("bottom", "Chinos", "Bottom")];
  const intent = inferTripDateIntent("Trip to Mumbai for 3 days", clock);
  const result = reconcilePackingResponse(rawTrip([1]), { query: "Trip to Mumbai for 3 days", tripIntent: intent, wardrobe });
  for (const day of result.tripPlan.days) assert.deepEqual(new Set(day.missingCategories), new Set(["Footwear", "Accessory"]));
});

test("formal-shirt cargo and ceremonial sports-shoe combinations are repaired", () => {
  const wardrobe = [
    item("formal-top", "White Formal Dress Shirt", "Top"), item("casual-top", "Cotton Polo T-Shirt", "Top"),
    item("cargo", "Utility Cargo Pants", "Bottom"), item("chino", "Tailored Chinos", "Bottom"),
    item("sports", "Running Sports Sneakers", "Footwear"), item("loafer", "Brown Loafers", "Footwear"), item("watch", "Classic Watch", "Accessory"),
    item("kurta", "Festive Silk Kurta Set", "Traditional set"), item("mojari", "Traditional Mojari", "Footwear"), item("bracelet", "Festive Bracelet", "Accessory"),
  ];
  const business = inferTripDateIntent("Business trip to Mumbai for 2 days", clock);
  const businessResult = reconcilePackingResponse(rawTrip([1, 2], ["formal-top", "cargo", "loafer", "watch"]), { query: "Business trip to Mumbai for 2 days", tripIntent: business, wardrobe });
  assert.equal(businessResult.tripPlan.days.some((day) => day.itemIds.includes("formal-top") && day.itemIds.includes("cargo")), false);
  const wedding = inferTripDateIntent("Jaipur wedding trip for 2 days", clock);
  const weddingResult = reconcilePackingResponse(rawTrip([1, 2], ["kurta", "sports", "bracelet"]), { query: "Jaipur wedding trip for 2 days", tripIntent: wedding, wardrobe });
  assert.equal(weddingResult.tripPlan.days.some((day) => day.itemIds.includes("kurta") && day.itemIds.includes("sports")), false);
  assert.ok(weddingResult.tripPlan.days.every((day) => day.itemIds.includes("mojari") || day.itemIds.includes("loafer")));
});

test("warm dry trips do not retain routine jackets or raincoat suggestions", () => {
  const wardrobe = [...completeWardrobe, item("jacket", "Winter Jacket", "Outerwear")];
  const intent = inferTripDateIntent("Goa trip for 2 days", clock);
  const raw = rawTrip([1, 2], ["top-a", "bottom-a", "shoes-a", "watch-a", "jacket"]);
  raw.missing = [{ title: "Raincoat", category: "Outerwear", reason: "Maybe useful" }];
  const weather = { destination: "Goa, India", maxRain: 15, rows: [{ date: "2026-08-24", min: 26, max: 33, rain: 15 }] };
  const result = reconcilePackingResponse(raw, { query: "Goa trip for 2 days", tripIntent: intent, weather, wardrobe });
  assert.equal(result.tripPlan.days.some((day) => day.itemIds.includes("jacket")), false);
  assert.equal(result.missing.some((row) => /raincoat/i.test(row.title)), false);
});

test("Indian festival days prefer available ethnic pieces", () => {
  const wardrobe = [...completeWardrobe, item("ethnic", "Festive Kurta Set", "Traditional set"), item("mojari", "Traditional Mojari", "Footwear"), item("bracelet", "Festive Bracelet", "Accessory")];
  const query = "Jaipur trip for 3 days and Rakhi celebration on Wednesday";
  const intent = inferTripDateIntent(query, clock);
  const result = reconcilePackingResponse(rawTrip([1, 2, 3]), { query, tripIntent: intent, wardrobe });
  const festivalDay = result.tripPlan.days.find((day) => /Rakhi celebration/i.test(day.activity));
  assert.ok(festivalDay);
  assert.ok(festivalDay.itemIds.includes("ethnic"));
});

test("least-used rotation avoids unnecessary adjacent duplicate combinations", () => {
  const intent = inferTripDateIntent("Mumbai travel for 4 days", clock);
  const result = reconcilePackingResponse(rawTrip([1, 2, 3, 4]), { query: "Mumbai travel for 4 days", tripIntent: intent, wardrobe: completeWardrobe });
  const signatures = result.tripPlan.days.map((day) => [...day.itemIds].sort().join("|"));
  assert.ok(new Set(signatures).size > 1);
  assert.equal(signatures.some((signature, index) => index > 0 && signature === signatures[index - 1]), false);
});

test("limited wardrobes keep every requested day and explain rewear", () => {
  const wardrobe = [item("top", "Only T-Shirt", "Top"), item("bottom", "Only Chinos", "Bottom"), item("shoe", "Only Sneakers", "Footwear"), item("watch", "Only Watch", "Accessory")];
  const intent = inferTripDateIntent("Trip to Goa for 5 days", clock);
  const result = reconcilePackingResponse(rawTrip([1]), { query: "Trip to Goa for 5 days", tripIntent: intent, wardrobe });
  assert.equal(result.tripPlan.days.length, 5);
  assert.ok(result.tripPlan.days.slice(1).every((day) => /rewear/i.test(day.note)));
});

test("rerun keeps dates and avoids excluded combinations when alternatives exist", () => {
  const query = "Mumbai travel for 3 days";
  const intent = inferTripDateIntent(query, clock);
  const first = reconcilePackingResponse(rawTrip([1, 2, 3]), { query, tripIntent: intent, wardrobe: completeWardrobe });
  const excluded = first.tripPlan.days.map((day) => day.itemIds);
  const second = reconcilePackingResponse(rawTrip([1, 2, 3]), { query, tripIntent: intent, wardrobe: completeWardrobe, excludedCombinations: excluded, variationSeed: 5 });
  assert.deepEqual(second.tripPlan.days.map((day) => day.dateLabel), first.tripPlan.days.map((day) => day.dateLabel));
  assert.ok(second.tripPlan.days.some((day, index) => [...day.itemIds].sort().join("|") !== [...excluded[index]].sort().join("|")));
});

test("cache fingerprint is UID-ready and changes with wardrobe/profile mutations", () => {
  const input = { query: "Goa 5 days", weather: { destination: "Goa, India", forecastDate: "2026-08-25" }, wardrobe: completeWardrobe, profile: { preferencesVersion: 1 } };
  const first = assistantFingerprint(input);
  const changedWardrobe = assistantFingerprint({ ...input, wardrobe: completeWardrobe.map((entry, index) => index ? entry : { ...entry, laundryStatus: "Laundry" }) });
  const changedProfile = assistantFingerprint({ ...input, profile: { preferencesVersion: 2 } });
  assert.notEqual(first, changedWardrobe); assert.notEqual(first, changedProfile);
  assert.equal(WARDROBE_ASSISTANT_CONTRACT.promptVersion, 7);
});

test("JSON parser isolates one object and performs only trailing-comma repair", () => {
  assert.deepEqual(parsePackingResponseText('note```json\n{"message":"ok",}\n```tail'), { message: "ok" });
  assert.throws(() => parsePackingResponseText("{broken"), /incomplete response/);
});

test("web integration uses shared gateway, cache, accessible states and no client consume", async () => {
  const [app, assistant, css, api] = await Promise.all([
    readFile(new URL("index.html", root), "utf8"), readFile(new URL("wardrobe-assistant.js", root), "utf8"),
    readFile(new URL("wardrobe-assistant.css", root), "utf8"), readFile(new URL("web-api.mjs", root), "utf8"),
  ]);
  assert.match(app, /wardrobe-assistant\.css/);
  assert.match(assistant, /callAiGateway\(user, "\/v1\/generate"/);
  assert.match(assistant, /Checking your closet…/);
  assert.match(assistant, /Shared with the mobile app/);
  assert.match(assistant, /data-item-id/);
  assert.match(assistant, /forceRefresh: true/);
  assert.doesNotMatch(`${assistant}\n${api}`, /\/v1\/ai\/quota\/consume/);
  assert.match(css, /prefers-reduced-motion/);
  assert.match(css, /scroll-snap-type/);
});
