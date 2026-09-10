import { callAiGateway, callCoreApi, aiCacheKey, readAiCache, writeAiCache } from "./web-api.mjs";
import { promptStamp } from "./web-core.mjs";
import {
  WARDROBE_ASSISTANT_CONTRACT,
  assistantFingerprint,
  buildWardrobeAssistantPrompt,
  eligibleWardrobeForAssistant,
  emptyWardrobeResponse,
  getDestinationWeatherContext,
  inferTripDateIntent,
  noEligibleWardrobeResponse,
  parsePackingResponseText,
  reconcilePackingResponse,
  stableHash,
  wardrobeItemSlot,
} from "./wardrobe-assistant-core.mjs";

const CACHE_AGE = 7 * 24 * 60 * 60 * 1000;
const LAST_RESULT_PREFIX = "clothmatics:wardrobe-assistant:last:";
const STARTERS = [
  ["Goa · 5 days", "Going to Goa for 5 days. Plan comfortable sightseeing, beach and dinner outfits."],
  ["Mumbai · business", "Business trip to Mumbai for 3 days with meetings and one relaxed dinner."],
  ["Jaipur · wedding", "Jaipur wedding weekend from tomorrow for 3 days. Include travel and wedding looks."],
  ["Closet gaps", "What am I missing in my closet?"],
];

function escapeHtml(value = "") {
  return String(value).replace(/[&<>'"]/g, (character) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "'": "&#39;", '"': "&quot;" })[character]);
}

function safeImage(value = "") {
  try { const url = new URL(value); return url.protocol === "https:" ? url.href : ""; }
  catch { return ""; }
}

function compactError(error) {
  const status = Number(error?.status || error?.response?.status || 0);
  const code = String(error?.code || "").toUpperCase();
  if (error?.name === "AbortError" || code === "ABORT_ERR") return { kind: "timeout", message: "This is taking longer than expected. Please check your connection and try again." };
  if (status === 429 || code.includes("DAILY_LIMIT") || code.includes("RESOURCE-EXHAUSTED")) return { kind: "quota", message: "You have used today’s shared AI allowance. It resets at midnight IST." };
  if (status === 503) return { kind: "usage", message: "The styling service is experiencing high usage. Please try again after some time." };
  if (status === 401 || status === 403 || code.includes("PERMISSION")) return { kind: "permission", message: "You don't have permission to complete this action." };
  if (navigator.onLine === false || /network|failed to fetch|offline/i.test(String(error?.message || ""))) return { kind: "offline", message: "We couldn't connect right now. Check your internet connection and try again." };
  if (/incomplete response/i.test(String(error?.message || ""))) return { kind: "malformed", message: "The wardrobe assistant returned an incomplete response. Please try again." };
  return { kind: "generic", message: "I couldn't reach my style notes right now—please try again in a moment." };
}

function extractGatewayText(body) {
  return body?.candidates?.[0]?.content?.parts?.map((part) => part?.text || "").join("").trim() || "";
}

function identityFingerprint(wardrobe, profile) {
  return assistantFingerprint({ query: "", weather: null, wardrobe, profile });
}

function formatCategory(slot) {
  return ({ top: "Tops", bottom: "Bottoms", "one-piece": "One-pieces", footwear: "Footwear", outerwear: "Layers", accessory: "Accessories", belt: "Accessories", watch: "Accessories", bag: "Accessories", eyewear: "Accessories", headwear: "Accessories", tie: "Accessories", drape: "Accessories" })[slot] || "Other";
}

export function createWardrobeAssistant({ root, getUser, getWardrobe, getProfile, getQuota, refreshQuota }) {
  if (!root) throw new Error("Wardrobe Assistant root is missing.");
  let busy = false;
  let lastQuery = "";
  let lastResult = null;
  let lastWeather = null;
  let lastTripIntent = null;

  root.innerHTML = `
    <div class="wa-heading">
      <div><span class="app-kicker">YOUR CLOSET, IN CONTEXT</span><h3>Wardrobe Assistant</h3><p>Trip packing and closet advice</p></div>
      <div id="wa-quota" class="wa-quota" aria-live="polite"><span aria-hidden="true">AI</span><b>Checking allowance…</b></div>
    </div>
    <div class="wa-layout">
      <section class="wa-conversation" aria-label="Wardrobe Assistant conversation">
        <div class="wa-message assistant"><span class="wa-avatar" aria-hidden="true">✦</span><div><b>Ask your wardrobe</b><p>Tell me about a trip, an occasion, or what feels missing from your closet. I only work from eligible clothes you actually own.</p></div></div>
        <div class="wa-starters" aria-label="Starter questions">${STARTERS.map(([label, query]) => `<button type="button" data-wa-starter="${escapeHtml(query)}">${escapeHtml(label)}</button>`).join("")}</div>
        <div id="wa-thread" class="wa-thread" aria-live="polite"></div>
        <form id="wa-form" class="wa-composer">
          <label for="wa-query">Ask Wardrobe Assistant</label>
          <div><textarea id="wa-query" rows="3" maxlength="1000" placeholder="Try: Me kal Jaipur jaunga aur 31 tak rahunga…" required></textarea><button type="submit" aria-label="Send wardrobe question"><span>Send</span><svg class="nav-icon" aria-hidden="true"><use href="#icon-sparkles"></use></svg></button></div>
          <small>Press Enter to send · Shift + Enter for a new line</small>
        </form>
      </section>
      <section id="wa-result" class="wa-result" aria-live="polite">
        <div class="wa-placeholder"><svg class="nav-icon" aria-hidden="true"><use href="#icon-bag"></use></svg><h4>Your grounded plan will appear here</h4><p>Trips include exact dates, complete daily looks, packing math and genuine wardrobe gaps.</p></div>
      </section>
    </div>`;

  const form = root.querySelector("#wa-form");
  const queryInput = root.querySelector("#wa-query");
  const thread = root.querySelector("#wa-thread");
  const resultRoot = root.querySelector("#wa-result");
  const submitButton = form.querySelector('button[type="submit"]');

  function renderQuota() {
    const quota = getQuota();
    const target = root.querySelector("#wa-quota");
    if (!target) return;
    target.innerHTML = quota && Number.isFinite(Number(quota.remaining))
      ? `<span aria-hidden="true">AI</span><div><b>${Number(quota.remaining)} of ${Number(quota.limit)} left today</b><small>Shared with the mobile app · resets midnight IST</small></div>`
      : '<span aria-hidden="true">AI</span><div><b>Allowance unavailable</b><small>Refresh and try again</small></div>';
  }

  function setBusy(value) {
    busy = value;
    submitButton.disabled = value;
    queryInput.disabled = value;
    submitButton.querySelector("span").textContent = value ? "Working…" : "Send";
  }

  function renderThread(query, message, loading = false) {
    thread.innerHTML = `<div class="wa-message user"><div><b>You</b><p>${escapeHtml(query)}</p></div></div><div class="wa-message assistant ${loading ? "loading" : ""}"><span class="wa-avatar" aria-hidden="true">✦</span><div><b>Wardrobe Assistant</b><p>${loading ? '<span class="wa-loader" aria-hidden="true"></span>Checking your closet…' : escapeHtml(message)}</p></div></div>`;
  }

  function garmentCard(item, reason = "") {
    const image = safeImage(item?.image || item?.imageUrl);
    return `<button type="button" class="wa-garment" data-item-id="${escapeHtml(item.id)}" aria-label="Open ${escapeHtml(item.title || "wardrobe item")}">${image ? `<img src="${image}" alt="${escapeHtml(item.title || "Wardrobe garment")}">` : '<span class="wa-no-image" aria-hidden="true"><svg class="nav-icon"><use href="#icon-outfit"></use></svg></span>'}<span><b>${escapeHtml(item.title || "Wardrobe item")}</b><small>${escapeHtml(item.category || "Uncategorized")}</small>${reason ? `<em>${escapeHtml(reason)}</em>` : ""}</span></button>`;
  }

  function renderResult(response, { cacheHit = false } = {}) {
    lastResult = response;
    const wardrobe = getWardrobe();
    const byId = new Map(wardrobe.map((item) => [String(item.id), item]));
    const plan = response.tripPlan;
    const uniqueIds = plan ? [...new Set(plan.days.flatMap((day) => day.itemIds))] : [...new Set(response.packList.map((row) => row.itemId).filter(Boolean))];
    const categoryCounts = new Map();
    uniqueIds.forEach((id) => { const item = byId.get(id); if (item) { const label = formatCategory(wardrobeItemSlot(item)); categoryCounts.set(label, (categoryCounts.get(label) || 0) + 1); } });
    const hero = plan ? `<section class="wa-trip-hero"><div><span>YOUR GROUNDED TRIP PLAN</span><h3>${escapeHtml(plan.title)}</h3><p>${escapeHtml(plan.destination)}${plan.dateRange ? ` · ${escapeHtml(plan.dateRange)}` : ""}</p></div><strong>${plan.durationDays}<small>${plan.durationDays === 1 ? "day" : "days"}</small></strong></section><div class="wa-packing-math"><b>${uniqueIds.length} physical wardrobe pieces</b><span aria-hidden="true">→</span><b>${plan.durationDays} complete daily plans</b></div>${categoryCounts.size ? `<div class="wa-category-summary">${[...categoryCounts].map(([label, count]) => `<span><b>${count}</b> ${escapeHtml(label)}</span>`).join("")}</div>` : ""}` : "";
    const days = plan ? `<section class="wa-section"><div class="wa-section-title"><span>DAY BY DAY</span><h4>Complete outfits</h4></div><div class="wa-days" role="list">${plan.days.map((day) => `<article class="wa-day" role="listitem"><header><span>DAY ${day.day}</span><div><b>${escapeHtml(day.dateLabel)}</b><small>${escapeHtml(day.activity)}</small></div></header><p class="wa-weather">${escapeHtml(day.weather)}</p><div class="wa-day-items">${day.itemIds.map((id) => byId.get(id)).filter(Boolean).map((item) => garmentCard(item)).join("")}</div>${day.missingCategories?.length ? `<div class="wa-missing-pills" aria-label="Missing pieces">${day.missingCategories.map((category) => `<span>+ Add ${escapeHtml(category)}</span>`).join("")}</div>` : ""}<p class="wa-day-note">${escapeHtml(day.note)}</p></article>`).join("")}</div></section>` : "";
    const owned = response.packList.length ? `<section class="wa-section"><div class="wa-section-title"><span>OWNED PIECES</span><h4>${escapeHtml(response.listTitle)}</h4></div><div class="wa-pack-list">${response.packList.map((row) => { const item = byId.get(String(row.itemId)); return item ? garmentCard(item, row.reason) : ""; }).join("")}</div></section>` : "";
    const missing = response.missing.length ? `<section class="wa-section wa-pickup"><div class="wa-section-title"><span>NOT IN YOUR CLOSET</span><h4>Worth picking up</h4></div><div class="wa-pickup-grid">${response.missing.map((item) => `<article><span>+</span><div><b>${escapeHtml(item.title)}</b><small>${escapeHtml(item.category)}</small><p>${escapeHtml(item.reason)}</p></div></article>`).join("")}</div></section>` : "";
    const tips = response.tips.length ? `<section class="wa-section wa-tips"><div class="wa-section-title"><span>GOOD TO KNOW</span><h4>Useful notes</h4></div><ul>${response.tips.map((tip) => `<li>${escapeHtml(tip)}</li>`).join("")}</ul></section>` : "";
    resultRoot.innerHTML = `${cacheHit ? '<p class="wa-cache-note">Saved result · no new AI call used</p>' : ""}${hero}${days}${owned}${missing}${tips}<section class="wa-rerun"><div><b>🔄 Not entirely happy with these options or want to change the vibe?</b><p>Tell me what to fix! For example: “Make it more casual”, “I prefer dresses over jeans”, “Change the colors”, or “Re-run this”.</p></div><button type="button" id="wa-rerun">Re-run</button></section>`;
    renderThread(lastQuery, response.message);
    root.querySelector("#wa-rerun")?.addEventListener("click", () => run(lastQuery, { forceRefresh: true, excludedCombinations: plan?.days.map((day) => day.itemIds) || [], variationSeed: Date.now() % 997 }));
  }

  function renderFailure(query, message, retryable = true) {
    renderThread(query, message);
    resultRoot.innerHTML = `<div class="wa-error"><svg class="nav-icon" aria-hidden="true"><use href="#icon-refresh"></use></svg><h4>Wardrobe Assistant paused</h4><p>${escapeHtml(message)}</p>${retryable ? '<button type="button" id="wa-retry">Try again</button>' : ""}</div>`;
    root.querySelector("#wa-retry")?.addEventListener("click", () => run(query));
  }

  function saveLast(uid, response, query, wardrobe, profile) {
    try { localStorage.setItem(`${LAST_RESULT_PREFIX}${uid}`, JSON.stringify({ contract: WARDROBE_ASSISTANT_CONTRACT.cacheVersion, identity: identityFingerprint(wardrobe, profile), query, response, savedAt: Date.now() })); } catch {}
  }

  function restoreLast() {
    const user = getUser(); if (!user) return;
    try {
      const saved = JSON.parse(localStorage.getItem(`${LAST_RESULT_PREFIX}${user.uid}`) || "null");
      const wardrobe = getWardrobe(), profile = getProfile();
      if (saved?.contract !== WARDROBE_ASSISTANT_CONTRACT.cacheVersion || saved?.identity !== identityFingerprint(wardrobe, profile) || !saved?.response) return;
      lastQuery = String(saved.query || ""); lastResult = saved.response; renderResult(saved.response, { cacheHit: true });
    } catch {}
  }

  async function run(rawQuery, options = {}) {
    const query = String(rawQuery || "").trim();
    if (!query || busy) return;
    const user = getUser(); if (!user) return renderFailure(query, "Please sign in again to use Wardrobe Assistant.", false);
    lastQuery = query; queryInput.value = query; setBusy(true); renderThread(query, "", true);
    resultRoot.innerHTML = '<div class="wa-loading" role="status"><span class="wa-loader" aria-hidden="true"></span><h4>Checking your closet…</h4><p>Matching dates, destination context and eligible wardrobe pieces.</p></div>';
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 55_000);
    let paidCallStarted = false;
    try {
      const profilePromise = Promise.resolve(getProfile() || {});
      const wardrobePromise = Promise.resolve([...(getWardrobe() || [])]);
      const tripIntent = inferTripDateIntent(query, new Date(), getProfile()?.timeZone || getProfile()?.timezone || "Asia/Kolkata");
      lastTripIntent = tripIntent;
      if (tripIntent.isTrip && !tripIntent.requestedDays) {
        const followUp = "How many days should I plan for? Add a duration such as ‘5 days’ or an end date such as ‘31 tak’.";
        renderFailure(query, followUp, false); return;
      }
      const weatherPromise = getDestinationWeatherContext(query, tripIntent).catch(() => null);
      const [wardrobe, profile, weather] = await Promise.all([wardrobePromise, profilePromise, weatherPromise]);
      lastWeather = weather;
      if (!wardrobe.length) {
        const response = emptyWardrobeResponse(tripIntent); renderResult(response); saveLast(user.uid, response, query, wardrobe, profile); return;
      }
      const eligible = eligibleWardrobeForAssistant(wardrobe, profile, query);
      if (!eligible.length) {
        const response = noEligibleWardrobeResponse(); renderResult(response); saveLast(user.uid, response, query, wardrobe, profile); return;
      }
      const fingerprint = assistantFingerprint({ query, weather, wardrobe: eligible, profile });
      const stamp = promptStamp(WARDROBE_ASSISTANT_CONTRACT.promptId);
      const cacheKey = aiCacheKey(user.uid, "wardrobe-assistant", `${WARDROBE_ASSISTANT_CONTRACT.cacheVersion}:${stamp.promptHash}`, fingerprint, stableHash(query.trim().toLowerCase()));
      if (!options.forceRefresh) {
        const cached = readAiCache(cacheKey, CACHE_AGE);
        if (cached) { renderResult(cached, { cacheHit: true }); saveLast(user.uid, cached, query, wardrobe, profile); return; }
      }
      const prompt = buildWardrobeAssistantPrompt({ query, tripIntent, weather, profile, wardrobe: eligible, excludedCombinations: options.excludedCombinations || [], rerun: options.forceRefresh === true });
      paidCallStarted = true;
      const started = Date.now();
      const { body, response } = await callAiGateway(user, "/v1/generate", {
        contents: [{ parts: [{ text: prompt }] }],
        generationConfig: { responseMimeType: "application/json", temperature: options.forceRefresh ? 0.45 : 0.2, maxOutputTokens: tripIntent.requestedDays > 10 ? 8192 : 4096 },
      }, { signal: controller.signal });
      const text = extractGatewayText(body);
      if (!text) throw new Error("The wardrobe assistant returned an incomplete response. Please try again.");
      const raw = parsePackingResponseText(text);
      const result = reconcilePackingResponse(raw, { query, tripIntent, weather, wardrobe: eligible, variationSeed: options.variationSeed || 0, excludedCombinations: options.excludedCombinations || [] });
      if (tripIntent.isTrip && result.tripPlan?.days.length !== tripIntent.requestedDays) throw new Error("The wardrobe assistant returned an incomplete response. Please try again.");
      writeAiCache(cacheKey, result);
      saveLast(user.uid, result, query, wardrobe, profile);
      renderResult(result);
      const provider = response.headers.get("X-AI-Provider") || body?._clothmatics?.provider || "unknown";
      const model = response.headers.get("X-AI-Model") || body?._clothmatics?.model || "unknown";
      callCoreApi(user, "/v1/analytics/api-call", { type: "gemini", status: "success", responseTime: Date.now() - started, provider, model, feature: "trip_packing", promptId: WARDROBE_ASSISTANT_CONTRACT.promptId, promptVersion: WARDROBE_ASSISTANT_CONTRACT.promptVersion, releaseTag: WARDROBE_ASSISTANT_CONTRACT.releaseTag }).catch(() => {});
      await refreshQuota(); renderQuota();
    } catch (error) {
      const friendly = compactError(error); renderFailure(query, friendly.message, friendly.kind !== "quota" && friendly.kind !== "permission");
      if (paidCallStarted || friendly.kind === "quota") { await refreshQuota().catch(() => {}); renderQuota(); }
    } finally { clearTimeout(timeout); setBusy(false); }
  }

  root.querySelectorAll("[data-wa-starter]").forEach((button) => button.addEventListener("click", () => { queryInput.value = button.dataset.waStarter; queryInput.focus(); }));
  form.addEventListener("submit", (event) => { event.preventDefault(); run(queryInput.value); });
  queryInput.addEventListener("keydown", (event) => { if (event.key === "Enter" && !event.shiftKey) { event.preventDefault(); form.requestSubmit(); } });
  window.addEventListener("focus", () => { if (getUser()) refreshQuota().finally(renderQuota); });

  return {
    onEnter: async () => { renderQuota(); await refreshQuota().catch(() => {}); renderQuota(); },
    onUserLoaded: () => { renderQuota(); restoreLast(); },
    renderQuota,
    clearUser(uid) { try { localStorage.removeItem(`${LAST_RESULT_PREFIX}${uid}`); } catch {} lastResult = null; lastQuery = ""; },
    getLastResult: () => ({ query: lastQuery, result: lastResult, weather: lastWeather, tripIntent: lastTripIntent }),
  };
}
