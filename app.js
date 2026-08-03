import { initializeApp } from "https://www.gstatic.com/firebasejs/12.15.0/firebase-app.js";
import {
  browserLocalPersistence,
  getAuth,
  GoogleAuthProvider,
  onAuthStateChanged,
  setPersistence,
  signInWithEmailAndPassword,
  signInWithPopup,
  signInWithRedirect,
  signOut,
} from "https://www.gstatic.com/firebasejs/12.15.0/firebase-auth.js";
import {
  addDoc,
  collection,
  deleteDoc,
  doc,
  getDoc,
  getDocs,
  getFirestore,
  query,
  serverTimestamp,
  setDoc,
  updateDoc,
  where,
} from "https://www.gstatic.com/firebasejs/12.15.0/firebase-firestore.js";
import { getFunctions, httpsCallable } from "https://www.gstatic.com/firebasejs/12.15.0/firebase-functions.js";
import { firebaseConfig } from "./config.js";
import { calculateWeeklyReport, deterministicPurchaseCheck, lookbookSlotFor, matchesGarmentSearch, shiftCalendarMonth, localDateKey } from "./web-core.mjs";

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);
const firebaseFunctions = getFunctions(app, "us-central1");
const createShareLink = httpsCallable(firebaseFunctions, "createShareLink");
const logShareEvent = httpsCallable(firebaseFunctions, "logShareEvent");
await setPersistence(auth, browserLocalPersistence);

const $ = (selector) => document.querySelector(selector);
const $$ = (selector) => [...document.querySelectorAll(selector)];
const state = { user: null, profile: null, wardrobe: [], outfits: [], wear: [], challenges: [], outfitHistory: [], todayOutfit: null, panel: "overview", calendarDate: new Date(), selectedDate: localDateKey(new Date()), outfitFilter: "all", lookSlots:{}, purchaseImageData:"", purchaseRotation:0 };
const panelNames = { overview: "Good to see you", wardrobe: "My wardrobe", lookbook: "My Lookbook", outfits: "My outfits", planner: "Outfit planner", insights: "Wardrobe insights", quest: "Closet Quest", profile: "My profile", purchase:"Smart Purchase Check" };

installParityUi();

function installParityUi() {
  const nav = $(".app-sidebar nav");
  if (nav && !nav.querySelector('[data-panel="purchase"]')) {
    nav.insertAdjacentHTML("beforeend", '<button data-panel="purchase"><svg class="nav-icon" aria-hidden="true"><use href="#icon-bag"></use></svg><span>Smart Purchase</span></button>');
  }
  const appContent = $(".app-content");
  appContent?.insertAdjacentHTML("beforeend", `
    <div id="panel-purchase" class="panel hidden"><div class="section-intro"><span>BEFORE YOU BUY</span><h3>Smart Purchase Check</h3><p>Compare a store item with garments already in your wardrobe.</p></div><div class="purchase-layout"><form id="purchase-form" class="purchase-form"><div class="purchase-form-head"><div><span>SMART PURCHASE</span><h4>Describe the store item</h4></div><small>Your photo is used only for this comparison and is not added to your closet.</small></div><label class="purchase-file">Item photo <span>optional</span><input id="purchase-image" type="file" accept="image/jpeg,image/png,image/webp"></label><div class="purchase-preview"><img id="purchase-preview" alt="Selected store item preview"><span id="purchase-preview-empty">Choose a clear, complete garment photo</span></div><button id="rotate-purchase" type="button">Rotate preview</button><div class="purchase-fields"><label>Item name<input id="purchase-title" maxlength="100" placeholder="e.g. Navy linen shirt"></label><label>Category<input id="purchase-category" maxlength="50" placeholder="e.g. Shirt"></label><label>Color<input id="purchase-color" maxlength="40"></label><label>Pattern<input id="purchase-pattern" maxlength="40"></label><label>Material<input id="purchase-material" maxlength="50"></label><label>Store price (₹)<input id="purchase-price" type="number" min="0" step="1"></label></div><button class="button button-primary" type="submit">Compare with my wardrobe</button></form><div id="purchase-result" class="purchase-result"><div class="result-placeholder"><svg class="nav-icon" aria-hidden="true"><use href="#icon-bag"></use></svg><b>Your comparison will appear here</b><p>Results compare the item with garments already in your wardrobe.</p></div></div></div></div>`);
  $("#panel-planner .month-controls")?.insertAdjacentHTML("afterbegin", '<button id="month-today" type="button">Today</button>');
  $("#panel-planner .section-intro p")?.insertAdjacentHTML("afterend", '<p class="month-summary"><b id="month-plan-count">0</b> planned days in this month</p>');
  $("#selected-date-label")?.insertAdjacentHTML("afterend", '<div class="plan-actions"><select id="plan-outfit-select" aria-label="Choose a saved outfit"><option value="">Choose a saved outfit</option></select><button id="plan-existing">Plan outfit</button></div>');
  if(!$("#open-look-builder")) $("#panel-lookbook .section-intro")?.insertAdjacentHTML("beforeend", '<button id="open-look-builder" class="button button-primary">Create a look</button>');
  if(!$("#lookbook-search")) $("#panel-lookbook .section-intro")?.insertAdjacentHTML("afterend", '<div class="panel-tools"><div class="search"><span>⌕</span><input id="lookbook-search" placeholder="Search Lookbook pieces"></div></div>');
  if(!$("#weekly-report")) $("#panel-insights .section-intro")?.insertAdjacentHTML("beforebegin", '<div class="section-intro"><span>THIS WEEK</span><h3>Weekly Closet Report</h3><p>Calculated from your last seven local calendar days.</p></div><div id="weekly-report" class="weekly-report"></div>');
  document.body.insertAdjacentHTML("beforeend", `<dialog id="look-builder-dialog" class="garment-dialog look-builder-dialog"><button id="close-look-builder" class="dialog-close" aria-label="Close look builder">×</button><span class="app-kicker">LOOKBOOK BUILDER</span><h2>Create from your closet</h2><div class="builder-fields"><label>Look name<input id="look-name" maxlength="80" placeholder="My weekend look"></label><label>Occasion<input id="look-occasion" maxlength="50" placeholder="Casual"></label></div><div id="look-slots" class="look-slots"></div><label class="builder-search">Find a garment<input id="look-picker-search" type="search" placeholder="Try tee, sneakers or watch"></label><div id="look-picker" class="look-picker"></div><div class="dialog-actions"><button id="cancel-look-builder">Cancel</button><button id="save-look" class="button button-primary">Save Lookbook outfit</button></div></dialog>`);
}

$("#year").textContent = new Date().getFullYear();

async function loadContent() {
  const content = await fetch("./data/content.json").then((response) => response.json());
  const demoGrid = $("#demo-grid");
  if (demoGrid) demoGrid.innerHTML = content.demoGarments.map((item) => `
    <article class="demo-item"><div><img src="${safeAssetUrl(item.image)}" alt="${escapeHtml(item.title)}" loading="lazy" /></div><p><b>${escapeHtml(item.title)}</b><span>${escapeHtml(item.category)}</span></p></article>
  `).join("");
  const occasionSelect = $("#occasion-select");
  if (occasionSelect) occasionSelect.innerHTML = content.occasions.map((occasion) =>
    `<option value="${occasion.toLowerCase()}">${escapeHtml(occasion)}</option>`
  ).join("");
}
loadContent().catch(console.error);

const authDialog = $("#auth-dialog");
$$('[data-open-auth]').forEach((button) => button.addEventListener("click", () => authDialog.showModal()));
$("#close-auth").addEventListener("click", () => authDialog.close());

$("#auth-form").addEventListener("submit", async (event) => {
  event.preventDefault();
  setAuthBusy(true);
  try {
    await signInWithEmailAndPassword(auth, $("#auth-email").value.trim(), $("#auth-password").value);
    authDialog.close();
  } catch (error) {
    $("#auth-message").textContent = friendlyAuthError(error);
  } finally { setAuthBusy(false); }
});

$("#google-signin").addEventListener("click", async () => {
  setAuthBusy(true);
  try {
    const provider = new GoogleAuthProvider();
    provider.setCustomParameters({ prompt: "select_account" });
    await signInWithPopup(auth, provider);
    authDialog.close();
  } catch (error) {
    if (error?.code === "auth/popup-blocked") {
      await signInWithRedirect(auth, new GoogleAuthProvider());
      return;
    }
    console.error("Google sign-in failed", error?.code, error);
    $("#auth-message").textContent = friendlyAuthError(error);
  } finally { setAuthBusy(false); }
});

$("#signout-button").addEventListener("click", () => signOut(auth));

onAuthStateChanged(auth, async (user) => {
  state.user = user;
  if (!user) {
    $("#marketing-view").classList.remove("hidden");
    $("#app-view").classList.add("hidden");
    $(".site-header").classList.remove("hidden");
    $("footer").classList.remove("hidden");
    return;
  }

  $("#marketing-view").classList.add("hidden");
  $("#app-view").classList.remove("hidden");
  $(".site-header").classList.add("hidden");
  $("footer").classList.add("hidden");
  await configureAdminAccess(user);
  $("#dashboard-loading").classList.remove("hidden");
  $$(".panel").forEach((panel) => panel.classList.add("hidden"));
  await loadDashboard(user);
});

async function configureAdminAccess(user) {
  const link = $("#admin-link");
  link.classList.add("hidden");
  if ((user.email || "").toLowerCase() !== "chiragsharma376@gmail.com") return;
  try {
    const token = await user.getIdTokenResult();
    link.classList.toggle("hidden", token.claims.admin !== true);
  } catch (error) {
    console.error("Could not verify admin access", error);
  }
}

async function loadDashboard(user) {
  try {
    const [profileSnap, wardrobeSnap, outfitsSnap, wearSnap, challengeSnap, historySnap, todaySnap] = await Promise.all([
      getDoc(doc(db, "users", user.uid)),
      getDocs(query(collection(db, "wardrobe"), where("userId", "==", user.uid))),
      getDocs(query(collection(db, "savedOutfits"), where("userId", "==", user.uid))),
      getDocs(query(collection(db, "outfitWear"), where("userId", "==", user.uid))),
      getDocs(query(collection(db, "styleChallengeSubmissions"), where("userId", "==", user.uid))),
      getDocs(query(collection(db, "outfitHistory"), where("userId", "==", user.uid))),
      getDoc(doc(db, "users", user.uid, "meta", "todayOutfit")),
    ]);
    state.profile = profileSnap.exists() ? profileSnap.data() : {};
    if (!user.emailVerified) throw new Error("Verify your email in the mobile app before opening the web wardrobe.");
    if (state.profile.loginBlocked === true || state.profile.accountBlocked === true) { await signOut(auth); throw new Error("This account is currently restricted."); }
    state.wardrobe = wardrobeSnap.docs.map((entry) => ({ id: entry.id, ...entry.data() })).sort(byCreatedAt);
    state.outfits = outfitsSnap.docs.map((entry) => ({ id: entry.id, ...entry.data() })).sort(byCreatedAt);
    state.wear = wearSnap.docs.map((entry) => ({ id: entry.id, ...entry.data() })).sort((a,b) => String(b.wearDate || "").localeCompare(String(a.wearDate || "")));
    state.challenges = challengeSnap.docs.map((entry) => ({ id: entry.id, ...entry.data() })).sort(byCreatedAt);
    state.outfitHistory = historySnap.docs.map((entry) => ({ id: entry.id, ...entry.data() })).sort(byCreatedAt);
    state.todayOutfit = todaySnap.exists() ? todaySnap.data() : null;
    renderAccount(user);
    renderAll();
    openPanel("overview");
  } catch (error) {
    console.error(error);
    toast("Could not load your wardrobe. Please check your connection.");
  } finally { $("#dashboard-loading").classList.add("hidden"); }
}

function renderAccount(user) {
  const name = state.profile?.fullName || state.profile?.displayName || user.displayName || "ClothMatics user";
  $("#user-name").textContent = name;
  $("#user-email").textContent = user.email || "";
  $("#user-initial").textContent = name.charAt(0).toUpperCase();
  $("#panel-title").textContent = `Good to see you, ${name.split(" ")[0]}`;
}

function renderAll() {
  const favorites = state.wardrobe.filter((item) => item.favorite);
  const lookbookItems = state.wardrobe.filter((item) => item.inLookbook ?? item.type === "lookbook");
  const savedLooks = state.outfits;
  $("#stat-items").textContent = state.wardrobe.length;
  $("#stat-favorites").textContent = favorites.length;
  $("#stat-lookbook").textContent = lookbookItems.length + savedLooks.length;
  $("#stat-planned").textContent = state.wear.filter((entry) => entry.status === "planned" && entry.wearDate >= localDateKey(new Date())).length;
  $("#stat-wears").textContent = state.wear.filter((entry) => entry.status === "worn").length;
  $("#stat-points").textContent = state.challenges.reduce((sum, entry) => sum + Number(entry.pointsEarned || entry.score?.total || 0), 0);
  renderGarments($("#recent-grid"), state.wardrobe.slice(0, 4));
  renderGarments($("#wardrobe-grid"), state.wardrobe);
  renderGarments($("#lookbook-grid"), lookbookItems);
  renderLooks(savedLooks);
  renderOutfitLibrary();
  renderCalendar();
  renderInsights();
  renderQuest();
  renderProfile();
  renderHomeInsights();
  renderWeeklyReport();
  renderPlannerOptions();
}

function renderGarments(target, items) {
  target.innerHTML = items.map((item) => `
    <article class="closet-item" data-item-id="${escapeHtml(item.id)}" tabindex="0">
      ${item.favorite ? '<span class="item-favorite">♥</span>' : ""}
      <div class="item-image"><img src="${safeUrl(item.image)}" alt="${escapeHtml(item.title || "Wardrobe item")}" loading="lazy" /></div>
      <div class="item-info"><b title="${escapeHtml(item.title || "Untitled")}">${escapeHtml(item.title || "Untitled")}</b><small>${escapeHtml(item.category || "Clothing")} · ${escapeHtml(item.primaryColor || "")}</small></div>
    </article>
  `).join("");
}

function renderLooks(looks) {
  $("#looks-grid").innerHTML = looks.length ? looks.map((look) => {
    const ids = look.wardrobeItemIds || look.outfit?.wardrobeItemIds || [];
    const items = ids.map((id) => state.wardrobe.find((item) => item.id === id)).filter(Boolean);
    return `<article class="look-card"><span>${escapeHtml(look.occasion || "Custom look")}</span><h3>${escapeHtml(look.outfit?.title || "My look")}</h3><div class="look-thumbs">${items.slice(0,4).map((item) => `<img src="${safeUrl(item.image)}" alt="${escapeHtml(item.title||"Garment")}" />`).join("")}</div><span>${items.length} wardrobe pieces</span><div class="card-actions"><button data-view-saved="${escapeHtml(look.id)}">View</button>${look.lookbook&&look.source==="user_created"?`<button data-delete-look="${escapeHtml(look.id)}">Delete</button>`:""}<button data-share-scope="saved" data-share-id="${escapeHtml(look.id)}">Share</button></div></article>`;
  }).join("") : '<div class="empty-state"><b>No custom looks yet</b><span>Create your first look from wardrobe items.</span></div>';
}

function renderOutfitLibrary() {
  const filtered = state.outfits.filter((look) => state.outfitFilter === "all"
    || (state.outfitFilter === "lookbook" && look.lookbook)
    || (state.outfitFilter === "ai" && !look.lookbook && look.source !== "style_challenge")
    || (state.outfitFilter === "challenge" && look.source === "style_challenge"));
  $("#outfit-library").innerHTML = filtered.length ? filtered.map((look) => outfitCard(look)).join("") : emptyBlock("No outfits in this category", "Create or save outfits in the mobile app.");
}

function outfitCard(look) {
  const ids = look.wardrobeItemIds || look.outfit?.wardrobeItemIds || [];
  const items = ids.map((id) => state.wardrobe.find((item) => item.id === id)).filter(Boolean);
  const source = look.lookbook ? "Created look" : look.source === "style_challenge" ? "Closet Quest" : "AI recommendation";
  return `<article class="outfit-library-card"><div class="outfit-card-head"><div><span>${escapeHtml(source)}</span><h3>${escapeHtml(look.outfit?.title || "Saved outfit")}</h3><p>${escapeHtml(look.occasion || "Any occasion")} · ${formatDateValue(look.createdAt)}</p></div>${look.outfit?.score ? `<b>${Number(look.outfit.score)}/100</b>` : ""}</div><div class="outfit-piece-grid">${items.map((item) => `<button data-item-id="${escapeHtml(item.id)}"><img src="${safeUrl(item.image)}" alt="${escapeHtml(item.title)}"><span>${escapeHtml(item.title)}</span></button>`).join("")}</div>${look.outfit?.subtitle ? `<p class="outfit-copy">${escapeHtml(look.outfit.subtitle)}</p>` : ""}</article>`;
}

function renderCalendar() {
  const view = state.calendarDate;
  const year = view.getFullYear(), month = view.getMonth();
  $("#month-label").textContent = view.toLocaleDateString(undefined, { month:"long", year:"numeric" });
  const monthPrefix=`${year}-${String(month+1).padStart(2,"0")}-`;
  if($("#month-plan-count")) $("#month-plan-count").textContent=new Set(state.wear.filter((entry)=>entry.status==="planned"&&String(entry.wearDate||"").startsWith(monthPrefix)).map((entry)=>entry.wearDate)).size;
  const cells = [...Array(new Date(year, month, 1).getDay()).fill(null), ...Array.from({length:new Date(year, month + 1, 0).getDate()}, (_,i) => new Date(year,month,i+1))];
  $("#calendar-grid").innerHTML = cells.map((date) => {
    if (!date) return '<span class="calendar-blank"></span>';
    const key = localDateKey(date), records = state.wear.filter((x) => x.wearDate === key);
    const thumbs = [...new Set(records.flatMap((x) => x.wardrobeItemIds || []))].slice(0,2).map((id) => state.wardrobe.find((x) => x.id === id)).filter(Boolean);
    return `<button class="calendar-day ${key === state.selectedDate ? "selected" : ""} ${records.length ? "has-plan" : ""}" data-date="${key}"><b>${date.getDate()}</b><span>${thumbs.map((item)=>`<img src="${safeUrl(item.image)}" alt="">`).join("")}</span>${records.length ? `<small>${records.length}</small>` : ""}</button>`;
  }).join("");
  renderSelectedDate();
}

function renderSelectedDate() {
  const records = state.wear.filter((x) => x.wearDate === state.selectedDate);
  $("#selected-date-label").textContent = new Date(`${state.selectedDate}T12:00:00`).toLocaleDateString(undefined, { weekday:"long", day:"numeric", month:"long" });
  $("#selected-date-plans").innerHTML = records.length ? records.map((record) => {
    const items = outfitItems(record);
    return `<article class="plan-card"><span class="status-pill ${record.status === "worn" ? "worn" : ""}">${escapeHtml(record.status || "planned")}</span><h4>${escapeHtml(record.outfit?.title || record.occasion || "Planned look")}</h4><p>${escapeHtml(record.occasion || "General")}${record.notes ? ` · ${escapeHtml(record.notes)}` : ""}</p><div class="plan-outfit-preview">${items.slice(0,4).map((item)=>`<img src="${safeUrl(item.image)}" alt="${escapeHtml(item.title)}">`).join("")}</div><button class="open-complete-outfit" data-outfit-scope="wear" data-outfit-id="${escapeHtml(record.id)}"><svg aria-hidden="true"><use href="#icon-outfit"></use></svg>Open complete outfit</button>${record.reminderAt ? `<small>Mobile reminder: ${escapeHtml(record.reminderTiming === "evening_before" ? "evening before" : "morning of")}</small>` : ""}</article>`;
  }).join("") : emptyBlock("Nothing planned", "Use the mobile app to plan a look for this date.");
  enhanceSelectedDateCards(records);
}

function renderInsights() {
  const worn = state.wear.filter((x)=>x.status==="worn");
  const priced = state.wardrobe.filter((x)=>Number(x.purchasePrice)>0).sort((a,b)=>(a.purchasePrice/Math.max(a.timesWorn||0,1))-(b.purchasePrice/Math.max(b.timesWorn||0,1)));
  const tracked = priced.reduce((sum,x)=>sum+Number(x.purchasePrice||0),0), wears = state.wardrobe.reduce((sum,x)=>sum+Number(x.timesWorn||0),0);
  $("#insight-summary").innerHTML = metricCards([[formatCurrency(tracked),"Tracked value"],[wears,"Garment wears"],[worn.length,"Outfits worn"],[state.wear.filter((x)=>x.status==="planned").length,"Planned looks"]]);
  $("#cpw-list").innerHTML = priced.length ? priced.map((item)=>`<button class="cpw-row" data-item-id="${escapeHtml(item.id)}"><img src="${safeUrl(item.image)}" alt=""><div><b>${escapeHtml(item.title)}</b><span>${formatCurrency(item.purchasePrice)} · ${Number(item.timesWorn||0)} wears</span></div><strong>${item.timesWorn ? formatCurrency(item.purchasePrice/item.timesWorn) : "—"}<small>per wear</small></strong></button>`).join("") : emptyBlock("No purchase prices yet", "Add prices in the mobile app to unlock cost-per-wear insights.");
  $("#wear-history").innerHTML = state.wear.length ? state.wear.slice(0,30).map((entry)=>`<article><span class="${entry.status==="worn"?"worn":""}">${escapeHtml(entry.status || "planned")}</span><div><b>${escapeHtml(entry.outfit?.title || entry.occasion || "Outfit")}</b><small>${formatIsoDate(entry.wearDate)} · ${escapeHtml(entry.occasion || "General")}</small></div></article>`).join("") : emptyBlock("No wear history", "Confirm outfit wears in the mobile app.");
}

function renderWeeklyReport() {
  const target=$("#weekly-report"); if(!target)return;
  const report=calculateWeeklyReport(state.wardrobe,state.wear,state.outfits,new Date());
  const suggested=report.suggestedOutfit, suggestedItems=outfitItems(suggested||{});
  target.innerHTML=`<div class="weekly-metrics">${metricCards([[`${report.wornItemCount}/${report.totalItemCount}`,"garments worn"],[report.outfitDays,"outfit days"],[`${report.closetUsagePercent}%`,"wardrobe rotation"],[report.neglectedItems.length,"clean pieces to rediscover"]])}</div><div class="weekly-detail"><article><span>MOST WORN</span><b>${escapeHtml(report.mostRepeatedItem?.title||"Not enough wear data yet")}</b><p>${report.mostRepeatedItem?"Based on confirmed wears during this seven-day period.":"Mark outfits worn to build this insight."}</p></article><article><span>BEST VALUE</span><b>${escapeHtml(report.bestValueItem?.title||"No priced, worn garment yet")}</b><p>${report.bestValueItem?`${formatCurrency(report.bestValueCostPerWear)} per recorded wear.`:"A purchase price plus recorded wears enables cost-per-wear."}</p></article><article><span>USEFUL COLORS</span><b>${escapeHtml(report.usefulColors.map(x=>x.color).join(", ")||"No color pattern yet")}</b><p>Colors are counted only from garments in confirmed outfits.</p></article></div>${suggested?`<article class="weekly-suggestion"><div><span>NEXT-WEEK IDEA</span><h4>${escapeHtml(suggested.outfit?.title||suggested.title||"Rotate a saved look")}</h4><p>Selected from a real saved outfit, prioritizing underused clean garments when possible.</p></div><div class="look-thumbs">${suggestedItems.slice(0,4).map(item=>`<img src="${safeUrl(item.image)}" alt="${escapeHtml(item.title)}">`).join("")}</div></article>`:""}`;
}

function renderQuest() {
  const history = state.challenges, points = history.reduce((sum,x)=>sum+Number(x.pointsEarned||x.score?.total||0),0);
  const best = Math.max(0,...history.map((x)=>Number(x.score?.total||0))), streak = currentStreak(history);
  $("#quest-summary").innerHTML = metricCards([[points,"Total points"],[history.length,"Quests completed"],[best,"Personal best"],[streak,"Day streak"]]);
  const badges = buildBadges(history, points, best, streak);
  $("#badge-grid").innerHTML = badges.map((badge)=>`<article class="${badge.earned?"earned":"locked"}"><span><svg aria-hidden="true"><use href="#icon-${badge.icon}"></use></svg></span><b>${badge.label}</b><small>${badge.detail}</small><em>${badge.earned?"Earned":badge.progress}</em></article>`).join("");
  $("#quest-history").innerHTML = history.length ? history.map((entry)=>{
    const items = outfitItems(entry);
    return `<article class="quest-history-card"><div class="quest-look-preview">${items.slice(0,4).map((item)=>`<img src="${safeUrl(item.image)}" alt="${escapeHtml(item.title)}">`).join("") || '<span class="no-preview">No image</span>'}</div><div class="quest-copy"><b>${escapeHtml(entry.challengeTitle || entry.challengeSnapshot?.title || "Closet Quest")}</b><span>${formatIsoDate(entry.challengeDateKey)} · ${escapeHtml(entry.challengeSnapshot?.occasion || "")}</span><button class="quest-open-look" data-outfit-scope="quest" data-outfit-id="${escapeHtml(entry.id)}">View complete outfit</button></div><strong>${Number(entry.score?.total||0)}/100<small>+${Number(entry.pointsEarned||0)} points</small></strong></article>`;
  }).join("") : emptyBlock("No completed quests yet", "Play Closet Quest in the mobile app to build your history.");
}

function renderProfile() {
  const p = state.profile || {}, ai = p.aiAnalysis || {};
  const fields = [["Name",p.fullName||p.displayName],["Gender",p.gender],["Date of birth",p.dateOfBirth],["Height",p.height?`${p.height} cm`:""],["Weight",p.weight?`${p.weight} kg`:""],["Profession",p.profession],["City",p.city],["Body type",p.bodyTypeSelfReported||ai.bodyType],["Skin tone",ai.skinTone],["Hair color",ai.hairColor],["Profile completion",p.profileCompletion!=null?`${p.profileCompletion}%`:""]];
  $("#profile-card").innerHTML = fields.map(([label,value])=>`<p><span>${escapeHtml(label)}</span><b>${escapeHtml(value||"Not provided")}</b></p>`).join("");
  const pref = p.preferences || {};
  const preferences = [["Style direction",listText(pref.styleLean)],["Favorite colors",listText(pref.favoriteColors)],["Colors to avoid",listText(pref.avoidColors)],["Fit",pretty(pref.fitPreference)],["Priority",pretty(pref.stylingPriority)],["Temperature",pretty(pref.tempSensitivity)],["Environment",pretty(pref.environment)],["Commute",pretty(pref.commute)],["Footwear",pretty(pref.footwearComfort)],["Hard exclusions",listText(pref.hardExclusions)],["Coverage",coverageText(pref.coverageRules)]];
  $("#preference-grid").innerHTML = preferences.map(([label,value])=>`<article><span>${escapeHtml(label)}</span><b>${escapeHtml(value||"Not specified")}</b></article>`).join("");
}

function renderHomeInsights() {
  const next = state.wear.filter((x)=>x.status==="planned"&&x.wearDate>=localDateKey(new Date())).sort((a,b)=>a.wearDate.localeCompare(b.wearDate))[0];
  const underused = state.wardrobe.filter((x)=>Number(x.timesWorn||0)===0).length;
  const clean = state.wardrobe.filter((x)=>x.laundryStatus==="Clean").length;
  const todayItems = outfitItems(state.todayOutfit || {});
  const nextItems = outfitItems(next || {});
  const cards = [
    { title:"Today's outfit", text:state.todayOutfit?.outfit?.title || state.todayOutfit?.title || "No cached outfit for today", icon:"sparkles", items:todayItems, panel:"outfits" },
    { title:"Next planned look", text:next ? `${formatIsoDate(next.wearDate)} · ${next.outfit?.title || next.occasion || "Planned outfit"}` : "Nothing upcoming", icon:"calendar", items:nextItems, panel:"planner" },
    { title:"Closet readiness", text:`${clean} clean garments available`, icon:"wardrobe", panel:"wardrobe" },
    { title:"Rediscover", text:`${underused} garments have no recorded wears`, icon:"chart", panel:"wardrobe" },
    { title:"Style Check history", text:`${state.outfitHistory.length} saved analyses`, icon:"outfit", panel:"outfits" },
  ];
  $("#home-insights").innerHTML = cards.map((card)=>`<button type="button" class="home-insight-card" data-go-panel="${card.panel}" aria-label="${escapeHtml(card.title)}: ${escapeHtml(card.text)}"><div class="insight-visual">${card.items?.length ? card.items.slice(0,3).map((item)=>`<img src="${safeUrl(item.image)}" alt="">`).join("") : `<svg aria-hidden="true"><use href="#icon-${card.icon}"></use></svg>`}</div><div><span>INSIGHT</span><b>${escapeHtml(card.title)}</b><p>${escapeHtml(card.text)}</p></div><span class="insight-arrow" aria-hidden="true">→</span></button>`).join("");
}

$("#wardrobe-search").addEventListener("input", filterWardrobe);
$("#wardrobe-filter").addEventListener("change", filterWardrobe);
function filterWardrobe() {
  const filter = $("#wardrobe-filter").value;
  const filtered = state.wardrobe.filter((item) => {
    return matchesGarmentSearch(item,$("#wardrobe-search").value) && (filter === "all" || (filter === "favorite" && item.favorite) || (filter === "clean" && item.laundryStatus === "Clean"));
  });
  renderGarments($("#wardrobe-grid"), filtered);
  $("#wardrobe-empty").classList.toggle("hidden", filtered.length > 0);
}

$("#lookbook-search").addEventListener("input",()=>renderGarments($("#lookbook-grid"),state.wardrobe.filter(item=>(item.inLookbook??item.type==="lookbook")&&matchesGarmentSearch(item,$("#lookbook-search").value))));
$("#open-look-builder").addEventListener("click",openLookBuilder);
$("#close-look-builder").addEventListener("click",()=>$("#look-builder-dialog").close());
$("#cancel-look-builder").addEventListener("click",()=>$("#look-builder-dialog").close());
$("#look-picker-search").addEventListener("input",renderLookPicker);
$("#save-look").addEventListener("click",saveLook);
$("#look-picker").addEventListener("click",event=>{const button=event.target.closest("[data-pick-item]");if(button)selectLookItem(button.dataset.pickItem)});
$("#look-slots").addEventListener("click",event=>{const button=event.target.closest("[data-clear-slot]");if(button){delete state.lookSlots[button.dataset.clearSlot];renderLookBuilder()}});
$("#plan-existing").addEventListener("click",planExistingOutfit);
$("#purchase-image").addEventListener("change",loadPurchaseImage);
$("#rotate-purchase").addEventListener("click",()=>{state.purchaseRotation=(state.purchaseRotation+90)%360;$("#purchase-preview").style.transform=`rotate(${state.purchaseRotation}deg)`});
$("#purchase-form").addEventListener("submit",runPurchaseCheck);

document.addEventListener("click", (event) => {
  const deleteLook=event.target.closest("[data-delete-look]"); if(deleteLook){deleteSavedLook(deleteLook.dataset.deleteLook);return}
  const viewSaved=event.target.closest("[data-view-saved]"); if(viewSaved){openSavedOutfit(viewSaved.dataset.viewSaved);return}
  const removePlan=event.target.closest("[data-remove-plan]"); if(removePlan){removePlanRecord(removePlan.dataset.removePlan);return}
  const markWorn=event.target.closest("[data-mark-worn]"); if(markWorn){markPlanWorn(markWorn.dataset.markWorn);return}
  const goPanel=event.target.closest("[data-go-panel]"); if(goPanel){openPanel(goPanel.dataset.goPanel);return}
  const share=event.target.closest("[data-share-scope]");if(share){shareOutfit(share.dataset.shareScope,share.dataset.shareId);return}
  const outfitTarget = event.target.closest("[data-outfit-scope][data-outfit-id]");
  if (outfitTarget) {
    openOutfitDetail(outfitTarget.dataset.outfitScope, outfitTarget.dataset.outfitId);
    return;
  }
  const itemTarget = event.target.closest("[data-item-id]");
  if (itemTarget) openGarmentDetail(itemTarget.dataset.itemId);
  const dateTarget = event.target.closest("[data-date]");
  if (dateTarget) { state.selectedDate = dateTarget.dataset.date; renderCalendar(); }
});
document.addEventListener("keydown", (event) => {
  if ((event.key === "Enter" || event.key === " ") && event.target.matches(".closet-item[data-item-id]")) openGarmentDetail(event.target.dataset.itemId);
});
$$("[data-outfit-filter]").forEach((button)=>button.addEventListener("click",()=>{
  state.outfitFilter=button.dataset.outfitFilter;
  $$("[data-outfit-filter]").forEach((x)=>x.classList.toggle("active",x===button));
  renderOutfitLibrary();
}));
$("#month-prev").addEventListener("click",()=>shiftPlanner(-1));
$("#month-next").addEventListener("click",()=>shiftPlanner(1));
$("#month-today").addEventListener("click",()=>{state.calendarDate=new Date();state.selectedDate=localDateKey(new Date());renderCalendar()});
$("#close-garment").addEventListener("click",()=>$("#garment-dialog").close());
$("#close-outfit").addEventListener("click",()=>$("#outfit-dialog").close());

function shiftPlanner(offset){const next=shiftCalendarMonth(state.calendarDate,state.selectedDate,offset);state.calendarDate=next.displayedMonth;state.selectedDate=next.selectedDate;renderCalendar()}
function renderPlannerOptions(){const select=$("#plan-outfit-select");if(!select)return;select.innerHTML='<option value="">Choose a saved outfit</option>'+state.outfits.map(look=>`<option value="${escapeHtml(look.id)}">${escapeHtml(look.outfit?.title||look.title||look.occasion||"Saved outfit")}</option>`).join("")}
function enhanceSelectedDateCards(records){
  $("#selected-date-plans")?.querySelectorAll(".plan-card").forEach((card,index)=>{const record=records[index];if(!record)return;const actions=document.createElement("div");actions.className="card-actions";actions.innerHTML=`${record.status!=="worn"&&record.wearDate<=localDateKey(new Date())?`<button data-mark-worn="${escapeHtml(record.id)}">Mark worn</button>`:""}<button data-remove-plan="${escapeHtml(record.id)}">Remove</button><button data-share-scope="wear" data-share-id="${escapeHtml(record.id)}">Share</button>`;card.append(actions)});
}
async function planExistingOutfit(){const id=$("#plan-outfit-select").value,look=state.outfits.find(x=>x.id===id);if(!look)return toast("Choose a saved outfit first.");const ids=outfitIds(look);if(!ids.length)return toast("That saved outfit no longer has wardrobe pieces.");const key=`web_${state.user.uid}_${state.selectedDate}_${id}`;const ref=doc(db,"outfitWear",key);try{await runTransaction(db,async tx=>{if((await tx.get(ref)).exists())return;tx.set(ref,{userId:state.user.uid,wearDate:state.selectedDate,status:"planned",outfitId:id,wardrobeItemIds:ids,occasion:look.occasion||"General",outfit:look.outfit||{title:look.title||"Saved outfit",wardrobeItemIds:ids},source:"web_planner",createdAt:serverTimestamp(),updatedAt:serverTimestamp()})});await reloadWear();toast("Outfit planned once for this date.")}catch(error){toast(`Could not plan outfit: ${error.message}`)}}
async function removePlanRecord(id){const record=state.wear.find(x=>x.id===id);if(!record||record.userId!==state.user.uid)return;if(!confirm("Remove this outfit plan?"))return;try{await deleteDoc(doc(db,"outfitWear",id));await reloadWear();toast("Plan removed.")}catch(error){toast(`Could not remove plan: ${error.message}`)}}
async function markPlanWorn(id){const record=state.wear.find(x=>x.id===id);if(!record||record.userId!==state.user.uid||record.wearDate>localDateKey(new Date()))return;try{await updateDoc(doc(db,"outfitWear",id),{status:"worn",wornAt:serverTimestamp(),updatedAt:serverTimestamp()});await reloadWear();toast("Outfit marked worn.")}catch(error){toast(`Could not update plan: ${error.message}`)}}
async function reloadWear(){const snap=await getDocs(query(collection(db,"outfitWear"),where("userId","==",state.user.uid)));state.wear=snap.docs.map(x=>({id:x.id,...x.data()})).sort((a,b)=>String(b.wearDate||"").localeCompare(String(a.wearDate||"")));renderCalendar();renderInsights();renderWeeklyReport()}

function openLookBuilder(){state.lookSlots={};$("#look-name").value="";$("#look-occasion").value="";$("#look-picker-search").value="";renderLookBuilder();$("#look-builder-dialog").showModal()}
function renderLookBuilder(){const labels={top:"Top",bottom:"Bottom",layer:"Layer",hero:"One-piece",footwear:"Footwear",accessory:"Accessory"};$("#look-slots").innerHTML=Object.entries(labels).map(([slot,label])=>{const item=state.wardrobe.find(x=>x.id===state.lookSlots[slot]);return`<article class="look-slot"><span>${label}</span>${item?`<img src="${safeUrl(item.image)}" alt="${escapeHtml(item.title)}"><b>${escapeHtml(item.title)}</b><button data-clear-slot="${slot}" aria-label="Remove ${label}">×</button>`:'<p>Choose an item</p>'}</article>`}).join("");renderLookPicker()}
function renderLookPicker(){const queryText=$("#look-picker-search").value;const items=state.wardrobe.filter(item=>matchesGarmentSearch(item,queryText));$("#look-picker").innerHTML=items.length?items.map(item=>`<button data-pick-item="${escapeHtml(item.id)}"><img src="${safeUrl(item.image)}" alt="${escapeHtml(item.title)}"><span><b>${escapeHtml(item.title||"Garment")}</b><small>${escapeHtml(pretty(lookbookSlotFor(item)))}</small></span></button>`).join(""):emptyBlock("No matches","Try a category, color, brand, or garment name.")}
function selectLookItem(id){const item=state.wardrobe.find(x=>x.id===id);if(!item)return;const slot=lookbookSlotFor(item);if(slot==="hero"){delete state.lookSlots.top;delete state.lookSlots.bottom;delete state.lookSlots.layer}else if(["top","bottom","layer"].includes(slot)){delete state.lookSlots.hero}state.lookSlots[slot]=id;renderLookBuilder()}
async function saveLook(){const ids=Object.values(state.lookSlots);if(ids.length<2)return toast("Choose at least two pieces.");const button=$("#save-look");button.disabled=true;try{const title=$("#look-name").value.trim()||"My Lookbook outfit",occasion=$("#look-occasion").value.trim()||"Any occasion";const ref=await addDoc(collection(db,"savedOutfits"),{userId:state.user.uid,lookbook:true,source:"user_created",occasion,wardrobeItemIds:ids,outfit:{score:100,title,subtitle:"Styled by you in Lookbook.",wardrobeItemIds:ids,reasoning:["Styled by you in Lookbook."],shoppingSuggestions:[]},createdAt:serverTimestamp(),updatedAt:serverTimestamp()});state.outfits.unshift({id:ref.id,userId:state.user.uid,lookbook:true,source:"user_created",occasion,wardrobeItemIds:ids,outfit:{score:100,title,subtitle:"Styled by you in Lookbook.",wardrobeItemIds:ids}});$("#look-builder-dialog").close();renderLooks(state.outfits);renderOutfitLibrary();renderPlannerOptions();toast("Lookbook outfit saved.")}catch(error){toast(`Could not save look: ${error.message}`)}finally{button.disabled=false}}
async function deleteSavedLook(id){const look=state.outfits.find(x=>x.id===id);if(!look||look.userId!==state.user.uid||!look.lookbook||look.source!=="user_created")return;if(!confirm("Delete this saved Lookbook outfit? Your wardrobe garments will not be changed."))return;try{await deleteDoc(doc(db,"savedOutfits",id));state.outfits=state.outfits.filter(x=>x.id!==id);renderLooks(state.outfits);renderOutfitLibrary();renderPlannerOptions();toast("Saved look deleted. Wardrobe items were untouched.")}catch(error){toast(`Could not delete look: ${error.message}`)}}
function openSavedOutfit(id){const source=state.outfits.find(x=>x.id===id);if(!source)return;showOutfitDialog(source,"SAVED OUTFIT")}

function openGarmentDetail(id) {
  const item=state.wardrobe.find((x)=>x.id===id);
  if (!item) return;
  const fields=[["Category",item.category],["Subcategory",item.subCategory],["Brand",item.brand],["Primary color",item.primaryColor],["Secondary colors",listText(item.secondaryColors)],["Pattern",item.pattern],["Fit",item.fit],["Material",item.material||item.fabric],["Sleeves",item.sleeveType],["Neckline",item.neckline],["Season",listText(item.season)],["Occasions",listText(item.userOccasions||item.occasion)],["Formality",item.formality],["Laundry",item.laundryStatus],["Times worn",item.timesWorn??0],["Last worn",item.lastWorn?formatIsoDate(item.lastWorn):"Never"],["Purchase year",item.purchaseYear],["Purchase price",item.purchasePrice?formatCurrency(item.purchasePrice):""],["Rating",item.rating?`${item.rating}/5`:""],["AI visibility",item.hiddenFromAI?"Hidden":"Available"],["Background prepared",item.bgRemoved===true?"Yes":item.bgRemoved===false?"No":""],["Tags",listText(item.tags)]];
  $("#garment-detail").innerHTML=`<div class="garment-hero"><img src="${safeUrl(item.image)}" alt="${escapeHtml(item.title||"Garment")}"><div><span class="app-kicker">GARMENT INTELLIGENCE</span><h2>${escapeHtml(item.title||"Untitled garment")}</h2><p>${escapeHtml(item.aiDescription||item.remarks||"Saved in your ClothMatics wardrobe.")}</p><div class="garment-flags">${item.favorite?"<span>Favorite</span>":""}${item.inLookbook||item.type==="lookbook"?"<span>Lookbook</span>":""}${item.userConfirmed?"<span>Confirmed</span>":""}</div></div></div><div class="garment-fields">${fields.filter(([,v])=>v!==""&&v!=null).map(([label,value])=>`<p><span>${escapeHtml(label)}</span><b>${escapeHtml(value)}</b></p>`).join("")}</div><div class="mobile-action-note"><b>Want to change these details?</b><span>Open this garment in the ClothMatics mobile app.</span></div>`;
  $("#garment-detail").insertAdjacentHTML("beforeend",`<div class="card-actions"><button data-share-scope="garment" data-share-id="${escapeHtml(item.id)}">Share garment</button></div>`);
  $("#garment-dialog").showModal();
}

function outfitIds(source = {}) {
  const candidate = source.wardrobeItemIds || source.outfit?.wardrobeItemIds || source.recommendation?.wardrobeItemIds;
  const direct = Array.isArray(candidate) ? candidate : [];
  if (direct.length) return direct;
  const saved = source.outfitId ? state.outfits.find((outfit) => outfit.id === source.outfitId) : null;
  const savedIds = saved?.wardrobeItemIds || saved?.outfit?.wardrobeItemIds;
  return Array.isArray(savedIds) ? savedIds : [];
}

function outfitItems(source = {}) {
  return outfitIds(source).map((id) => state.wardrobe.find((item) => item.id === id)).filter(Boolean);
}

function openOutfitDetail(scope, id) {
  const source = scope === "quest" ? state.challenges.find((entry) => entry.id === id) : state.wear.find((entry) => entry.id === id);
  if (!source) return;
  const items = outfitItems(source);
  const title = source.outfit?.title || source.challengeTitle || source.challengeSnapshot?.title || source.occasion || "Complete outfit";
  const context = scope === "quest"
    ? [source.challengeSnapshot?.occasion, source.challengeSnapshot?.mood, `${Number(source.score?.total || 0)}/100`].filter(Boolean).join(" · ")
    : [formatIsoDate(source.wearDate), source.occasion, pretty(source.status)].filter(Boolean).join(" · ");
  $("#outfit-detail").innerHTML = `<div class="complete-outfit-head"><span class="app-kicker">${scope === "quest" ? "CLOSET QUEST LOOK" : "PLANNED COMPLETE LOOK"}</span><h2>${escapeHtml(title)}</h2><p>${escapeHtml(context)}</p></div>${items.length ? `<div class="complete-outfit-grid">${items.map((item) => `<article><img src="${safeUrl(item.image)}" alt="${escapeHtml(item.title || "Outfit garment")}"><div><b>${escapeHtml(item.title || "Garment")}</b><span>${escapeHtml([item.primaryColor,item.category].filter(Boolean).join(" · "))}</span></div></article>`).join("")}</div>` : emptyBlock("Outfit images unavailable", "The garment references for this older outfit are no longer in the wardrobe.")}<div class="mobile-action-note"><b>View-only complete outfit</b><span>Use the ClothMatics mobile app to edit this look or change its plan.</span></div>`;
  $("#outfit-dialog").showModal();
}

function showOutfitDialog(source,label="COMPLETE OUTFIT"){
  const items=outfitItems(source),title=source.outfit?.title||source.title||source.occasion||"Complete outfit";
  $("#outfit-detail").innerHTML=`<div class="complete-outfit-head"><span class="app-kicker">${escapeHtml(label)}</span><h2>${escapeHtml(title)}</h2><p>${escapeHtml(source.outfit?.subtitle||source.occasion||"")}</p></div>${items.length?`<div class="complete-outfit-grid">${items.map(item=>`<article><img src="${safeUrl(item.image)}" alt="${escapeHtml(item.title||"Outfit garment")}"><div><b>${escapeHtml(item.title||"Garment")}</b><span>${escapeHtml([item.primaryColor,item.category].filter(Boolean).join(" · "))}</span></div></article>`).join("")}</div>`:emptyBlock("Outfit images unavailable","These garment references are no longer in the wardrobe.")}`;
  $("#outfit-dialog").showModal();
}

async function loadPurchaseImage(event){const file=event.target.files?.[0];if(!file){state.purchaseImageData="";return}if(file.size>4*1024*1024)return toast("Choose an image under 4 MB.");state.purchaseImageData=await new Promise((resolve,reject)=>{const reader=new FileReader();reader.onload=()=>resolve(String(reader.result));reader.onerror=reject;reader.readAsDataURL(file)});$("#purchase-preview").src=state.purchaseImageData;$("#purchase-preview").style.transform="rotate(0deg)";$("#purchase-preview-empty").classList.add("hidden");state.purchaseRotation=0}
async function runPurchaseCheck(event){event.preventDefault();const form=event.currentTarget,button=form.querySelector('[type="submit"]');const candidate={title:$("#purchase-title").value.trim(),category:$("#purchase-category").value.trim(),primaryColor:$("#purchase-color").value.trim(),pattern:$("#purchase-pattern").value.trim(),material:$("#purchase-material").value.trim()},price=Number($("#purchase-price").value)||0;if(!candidate.title&&!candidate.category&&!state.purchaseImageData)return toast("Choose a photo or describe the item.");button.disabled=true;$("#purchase-result").innerHTML='<div class="result-placeholder"><span class="spinner"></span><b>Comparing with your wardrobe…</b></div>';try{renderPurchaseResult(deterministicPurchaseCheck(candidate,state.wardrobe,price))}catch(error){$("#purchase-result").innerHTML=`<div class="error-box"><b>Could not compare this purchase</b><p>${escapeHtml(error.message)}</p></div>`}finally{button.disabled=false}}
function renderPurchaseResult(result){const similar=(result.similarityMatches||[]).map(match=>state.wardrobe.find(x=>x.id===(match.wardrobeItemId||match.item?.id))).filter(Boolean);const looks=(result.outfitExamples||[]).map(x=>({...x,itemIds:x.itemIds||[]}));$("#purchase-result").innerHTML=`<div class="purchase-verdict"><span>WARDROBE MATCH</span><h3>${escapeHtml(pretty(result.verdict||"consider"))}</h3><p>${escapeHtml(result.summary||(result.reasons||[])[0]||"")}</p></div><div class="purchase-counts">${metricCards([[similar.length,"similar owned items"],[looks.length,"wardrobe combinations"],[result.compatiblePieceCount||new Set(looks.flatMap(x=>x.itemIds)).size,"compatible pieces"]])}</div>${similar.length?`<h4>Similar pieces you own</h4><div class="look-thumbs purchase-similar">${similar.map(item=>`<img src="${safeUrl(item.image)}" alt="${escapeHtml(item.title)}">`).join("")}</div>`:""}<h4>Ways to wear it</h4><div class="purchase-looks">${looks.slice(0,4).map((look,index)=>`<article><b>Outfit ${index+1}</b><div class="look-thumbs">${look.itemIds.map(id=>state.wardrobe.find(x=>x.id===id)).filter(Boolean).map(item=>`<img src="${safeUrl(item.image)}" alt="${escapeHtml(item.title)}">`).join("")}</div><p>${escapeHtml(look.explanation||"")}</p></article>`).join("")||emptyBlock("No complete combination found","Add more wardrobe categories in the mobile app.")}</div>`}

async function shareOutfit(scope,id){
  let source=scope==="saved"?state.outfits.find(x=>x.id===id):state.wear.find(x=>x.id===id);
  if(scope==="garment"){const item=state.wardrobe.find(x=>x.id===id);source=item?{title:item.title,wardrobeItemIds:[item.id]}:null}
  if(!source)return;
  const ids=outfitIds(source),items=ids.map(itemId=>state.wardrobe.find(x=>x.id===itemId)).filter(Boolean);
  try{
    const response=await createShareLink({source:scope,outfitId:id||null,wardrobeItemIds:ids});
    const payload=response.data||response,link=payload.url||payload.shareUrl||(payload.code?`${location.origin}/r?c=${encodeURIComponent(payload.code)}`:"");
    if(!link)throw new Error("Share link was not returned.");
    await logShareEvent({code:payload.code,event:"share",source:scope}).catch(()=>{});
    const title=source.outfit?.title||source.title||"My ClothMatics outfit",blob=await createShareCardBlob(title,items,link);
    const file=blob?new File([blob],"clothmatics-outfit.png",{type:"image/png"}):null;
    if(navigator.share&&(!file||!navigator.canShare||navigator.canShare({files:[file]}))) await navigator.share(file?{title,text:"Styled with ClothMatics",url:link,files:[file]}:{title,text:"Styled with ClothMatics",url:link});
    else {if(blob){const url=URL.createObjectURL(blob),anchor=document.createElement("a");anchor.href=url;anchor.download="clothmatics-outfit.png";anchor.click();setTimeout(()=>URL.revokeObjectURL(url),1000)}await navigator.clipboard.writeText(link);toast(blob?"Share card downloaded and link copied.":"Share link copied.")}
  }catch(error){if(error.name!=="AbortError")toast(`Could not share: ${error.message}`)}
}
async function createShareCardBlob(title,items,link){
  const canvas=document.createElement("canvas");canvas.width=1080;canvas.height=1350;const ctx=canvas.getContext("2d");
  const gradient=ctx.createLinearGradient(0,0,1080,1350);gradient.addColorStop(0,"#17122f");gradient.addColorStop(.55,"#49309c");gradient.addColorStop(1,"#f047a0");ctx.fillStyle=gradient;ctx.fillRect(0,0,1080,1350);
  ctx.fillStyle="#fff";ctx.font="800 54px Manrope, sans-serif";ctx.fillText("ClothMatics",70,105);ctx.font="800 64px Manrope, sans-serif";wrapCanvasText(ctx,title,70,215,930,76);ctx.fillStyle="#ffffffd9";ctx.font="28px sans-serif";ctx.fillText("Styled from pieces already in my wardrobe",70,380);
  const slots=[[70,455],[370,455],[670,455],[220,790],[520,790]];
  for(let index=0;index<Math.min(items.length,5);index++){const [x,y]=slots[index];ctx.fillStyle="#ffffffef";roundRect(ctx,x,y,290,290,28);ctx.fill();try{const image=await loadShareImage(safeUrl(items[index].image));ctx.drawImage(image,x+20,y+20,250,250)}catch{ctx.fillStyle="#6c63ff22";ctx.fillRect(x+20,y+20,250,250)}ctx.fillStyle="#fff";ctx.font="700 22px sans-serif";ctx.fillText(String(items[index].title||"Garment").slice(0,24),x,y+325)}
  ctx.fillStyle="#fff";ctx.font="700 28px sans-serif";ctx.fillText("Open this look",70,1230);ctx.font="23px sans-serif";ctx.fillText(link.slice(0,72),70,1275);
  try{return await new Promise(resolve=>canvas.toBlob(resolve,"image/png",.94))}catch{return null}
}
function loadShareImage(url){return new Promise((resolve,reject)=>{if(!url)return reject(new Error("No image"));const image=new Image();image.crossOrigin="anonymous";image.onload=()=>resolve(image);image.onerror=reject;image.src=url})}
function wrapCanvasText(ctx,text,x,y,maxWidth,lineHeight){const words=String(text).split(/\s+/);let line="",row=0;for(const word of words){const test=`${line}${word} `;if(ctx.measureText(test).width>maxWidth&&line){ctx.fillText(line,x,y+row*lineHeight);line=`${word} `;row++}else line=test}ctx.fillText(line,x,y+row*lineHeight)}
function roundRect(ctx,x,y,width,height,radius){ctx.beginPath();ctx.roundRect(x,y,width,height,radius)}

function normalizeSearch(value = "") {
  return String(value).toLowerCase().replace(/&/g, " and ").replace(/[^a-z0-9]+/g, "");
}

function searchTokens(value = "") {
  return String(value).trim().split(/\s+/).map(normalizeSearch).filter(Boolean);
}

function searchAliases(term) {
  const groups = [
    ["tshirt","tshirts","tee","tees","teeshirt","teeshirts"],
    ["shirt","shirts","buttondown","buttondowns","buttonup"],
    ["hoodie","hoodies","sweatshirt","sweatshirts"],
    ["trousers","trouser","pants","pant","slacks"],
    ["jeans","denim"],
    ["sneakers","sneaker","trainers","trainer","sportsshoes"],
    ["footwear","shoes","shoe","sandals","sandal"],
    ["outerwear","jacket","coat","blazer"],
    ["onepiece","dress","dresses","jumpsuit","romper"],
    ["traditionalset","ethnicwear","kurta","kurti","saree","lehenga"],
  ];
  const group = groups.find((values) => values.includes(term));
  return group || [term];
}

function garmentSearchText(item) {
  const values = [item.title,item.category,item.subCategory,item.categoryRole,item.layerRole,item.primaryColor,item.secondaryColors,item.pattern,item.fit,item.material,item.fabric,item.sleeveType,item.neckline,item.season,item.occasion,item.userOccasions,item.activitySuitability,item.tags,item.brand,item.aiDescription,item.remarks];
  const normalized = values.flatMap((value) => Array.isArray(value) ? value : [value]).filter(Boolean).map(normalizeSearch);
  const expanded = normalized.flatMap((value) => [value, ...searchAliases(value)]);
  return [...new Set(expanded)].join(" ");
}

$$('[data-panel]').forEach((button) => button.addEventListener("click", () => openPanel(button.dataset.panel)));
function openPanel(name) {
  const target = $(`#panel-${name}`);
  if (!target) return;
  state.panel = name;
  $$(".panel").forEach((panel) => panel.classList.add("hidden"));
  target.classList.remove("hidden");
  $$('[data-panel]').forEach((button) => button.classList.toggle("active", button.dataset.panel === name));
  const firstName = (state.profile?.fullName || state.profile?.displayName || state.user?.displayName || "").split(" ")[0];
  $("#panel-title").textContent = name === "overview" && firstName ? `Good to see you, ${firstName}` : panelNames[name];
  window.scrollTo({ top: 0, behavior: "smooth" });
}

function byCreatedAt(a,b) { return timeValue(b.createdAt) - timeValue(a.createdAt); }
function timeValue(value) { if (!value) return 0; if (typeof value.toMillis==="function") return value.toMillis(); if (typeof value.seconds==="number") return value.seconds*1000; if (typeof value==="number") return value; return new Date(value).getTime()||0; }
function formatDateValue(value) { const time=timeValue(value); return time?new Intl.DateTimeFormat(undefined,{dateStyle:"medium"}).format(time):"Date unavailable"; }
function formatIsoDate(value) { if(!value)return "Date unavailable"; const date=new Date(`${String(value).slice(0,10)}T12:00:00`); return Number.isNaN(date.getTime())?String(value):date.toLocaleDateString(undefined,{day:"numeric",month:"short",year:"numeric"}); }
function formatCurrency(value) { return new Intl.NumberFormat("en-IN",{style:"currency",currency:"INR",maximumFractionDigits:0}).format(Number(value)||0); }
function metricCards(entries) { return entries.map(([value,label])=>`<article><b>${escapeHtml(value)}</b><span>${escapeHtml(label)}</span></article>`).join(""); }
function emptyBlock(title,text) { return `<div class="companion-empty"><b>${escapeHtml(title)}</b><span>${escapeHtml(text)}</span></div>`; }
function listText(value) { return Array.isArray(value)?value.map(pretty).join(", "):pretty(value); }
function pretty(value) { return value?String(value).replace(/_/g," ").replace(/\b\w/g,(x)=>x.toUpperCase()):""; }
function coverageText(rules) { if(!rules)return ""; return [rules.sleevelessAllowed?"Sleeveless allowed":"No sleeveless",rules.shortsAllowed?"Shorts allowed":"No shorts",rules.fittedAllowed?"Fitted allowed":"No fitted"].join(", "); }
function currentStreak(history) { const dates=[...new Set(history.map((x)=>x.challengeDateKey).filter(Boolean))].sort().reverse(); if(!dates.length)return 0; const day=(v)=>{const [y,m,d]=v.split("-").map(Number);return Math.floor(Date.UTC(y,m-1,d)/86400000)}; const today=new Date(),now=Math.floor(Date.UTC(today.getFullYear(),today.getMonth(),today.getDate())/86400000); if(now-day(dates[0])>1)return 0; let streak=1; for(let i=1;i<dates.length;i++){if(day(dates[i-1])-day(dates[i])!==1)break;streak++;} return streak; }
function buildBadges(history,points,best,streak) { return [
  {label:"First Quest",icon:"outfit",detail:"Complete your first quest",earned:history.length>=1,progress:`${Math.min(history.length,1)}/1`},
  {label:"Style Spark",icon:"sparkles",detail:"Earn 250 style points",earned:points>=250,progress:`${Math.min(points,250)}/250`},
  {label:"On Fire",icon:"chart",detail:"Build a 3-day streak",earned:streak>=3,progress:`${Math.min(streak,3)}/3`},
  {label:"Perfect Week",icon:"calendar",detail:"Complete seven days",earned:streak>=7,progress:`${Math.min(streak,7)}/7`},
  {label:"Style Master",icon:"award",detail:"Score 90 or higher",earned:best>=90,progress:`${Math.min(best,90)}/90`},
  {label:"Quest Legend",icon:"shield",detail:"Complete 25 quests",earned:history.length>=25,progress:`${Math.min(history.length,25)}/25`}
]; }
function safeUrl(value="") { try { const url=new URL(value); return ["https:","http:"].includes(url.protocol) ? url.href : ""; } catch { return ""; } }
function safeAssetUrl(value="") { return /^\.\/assets\/[a-z0-9._-]+$/i.test(value) ? value : ""; }
function escapeHtml(value="") { const div=document.createElement("div"); div.textContent=String(value); return div.innerHTML; }
function setAuthBusy(busy) { $("#email-signin").disabled=busy; $("#google-signin").disabled=busy; $("#email-signin").textContent=busy?"Signing in…":"Sign in"; $("#auth-message").textContent=""; }
function friendlyAuthError(error) {
  const messages = {
    "auth/invalid-credential": "The email or password is incorrect.",
    "auth/unauthorized-domain": "Google sign-in is temporarily unavailable here. Please use email sign-in or contact support.",
    "auth/operation-not-allowed": "This sign-in option is not available right now. Please try another option.",
    "auth/popup-blocked": "Your browser blocked the Google sign-in window. Please allow pop-ups and try again.",
    "auth/popup-closed-by-user": "The Google sign-in window was closed before sign-in finished.",
    "auth/cancelled-popup-request": "Another sign-in window is already open.",
    "auth/api-key-not-valid.-please-pass-a-valid-api-key.": "Sign-in is temporarily unavailable. Please try again later.",
    "auth/network-request-failed": "We could not connect. Check your internet connection and try again.",
  };
  return messages[error?.code] || "Google sign-in could not be completed. Please try again or contact support.";
}
function toast(message) { const el=$("#toast"); el.textContent=message; el.classList.add("show"); setTimeout(()=>el.classList.remove("show"),2800); }
