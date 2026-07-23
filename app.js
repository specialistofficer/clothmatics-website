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
  collection,
  doc,
  getDoc,
  getDocs,
  getFirestore,
  query,
  where,
} from "https://www.gstatic.com/firebasejs/12.15.0/firebase-firestore.js";
import { firebaseConfig } from "./config.js";

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);
await setPersistence(auth, browserLocalPersistence);

const $ = (selector) => document.querySelector(selector);
const $$ = (selector) => [...document.querySelectorAll(selector)];
const state = { user: null, profile: null, wardrobe: [], outfits: [], wear: [], challenges: [], outfitHistory: [], todayOutfit: null, panel: "overview", calendarDate: new Date(), selectedDate: localDateKey(new Date()), outfitFilter: "all" };
const panelNames = { overview: "Good to see you", wardrobe: "My wardrobe", lookbook: "My Lookbook", outfits: "My outfits", planner: "Outfit planner", insights: "Wardrobe insights", quest: "Closet Quest", profile: "My profile", stylist: "AI Stylist" };

$("#year").textContent = new Date().getFullYear();

async function loadContent() {
  const content = await fetch("./data/content.json").then((response) => response.json());
  const demoGrid = $("#demo-grid");
  if (demoGrid) demoGrid.innerHTML = content.demoGarments.map((item) => `
    <article class="demo-item"><div><img src="${safeAssetUrl(item.image)}" alt="${escapeHtml(item.title)}" loading="lazy" /></div><p><b>${escapeHtml(item.title)}</b><span>${escapeHtml(item.category)}</span></p></article>
  `).join("");
  $("#occasion-select").innerHTML = content.occasions.map((occasion) =>
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
    return `<article class="look-card"><span>${escapeHtml(look.occasion || "Custom look")}</span><h3>${escapeHtml(look.outfit?.title || "My look")}</h3><div class="look-thumbs">${items.slice(0,4).map((item) => `<img src="${safeUrl(item.image)}" alt="" />`).join("")}</div><span>${items.length} wardrobe pieces</span></article>`;
  }).join("") : '<div class="empty-state"><b>No custom looks yet</b><span>Create looks in the mobile app.</span></div>';
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
    const items = (record.wardrobeItemIds || []).map((id)=>state.wardrobe.find((x)=>x.id===id)).filter(Boolean);
    return `<article class="plan-card"><span class="status-pill ${record.status === "worn" ? "worn" : ""}">${escapeHtml(record.status || "planned")}</span><h4>${escapeHtml(record.outfit?.title || record.occasion || "Planned look")}</h4><p>${escapeHtml(record.occasion || "General")}${record.notes ? ` · ${escapeHtml(record.notes)}` : ""}</p><div>${items.slice(0,4).map((item)=>`<button data-item-id="${escapeHtml(item.id)}"><img src="${safeUrl(item.image)}" alt="${escapeHtml(item.title)}"></button>`).join("")}</div>${record.reminderAt ? `<small>Mobile reminder: ${escapeHtml(record.reminderTiming === "evening_before" ? "evening before" : "morning of")}</small>` : ""}</article>`;
  }).join("") : emptyBlock("Nothing planned", "Use the mobile app to plan a look for this date.");
}

function renderInsights() {
  const worn = state.wear.filter((x)=>x.status==="worn");
  const priced = state.wardrobe.filter((x)=>Number(x.purchasePrice)>0).sort((a,b)=>(a.purchasePrice/Math.max(a.timesWorn||0,1))-(b.purchasePrice/Math.max(b.timesWorn||0,1)));
  const tracked = priced.reduce((sum,x)=>sum+Number(x.purchasePrice||0),0), wears = state.wardrobe.reduce((sum,x)=>sum+Number(x.timesWorn||0),0);
  $("#insight-summary").innerHTML = metricCards([[formatCurrency(tracked),"Tracked value"],[wears,"Garment wears"],[worn.length,"Outfits worn"],[state.wear.filter((x)=>x.status==="planned").length,"Planned looks"]]);
  $("#cpw-list").innerHTML = priced.length ? priced.map((item)=>`<button class="cpw-row" data-item-id="${escapeHtml(item.id)}"><img src="${safeUrl(item.image)}" alt=""><div><b>${escapeHtml(item.title)}</b><span>${formatCurrency(item.purchasePrice)} · ${Number(item.timesWorn||0)} wears</span></div><strong>${item.timesWorn ? formatCurrency(item.purchasePrice/item.timesWorn) : "—"}<small>per wear</small></strong></button>`).join("") : emptyBlock("No purchase prices yet", "Add prices in the mobile app to unlock cost-per-wear insights.");
  $("#wear-history").innerHTML = state.wear.length ? state.wear.slice(0,30).map((entry)=>`<article><span class="${entry.status==="worn"?"worn":""}">${escapeHtml(entry.status || "planned")}</span><div><b>${escapeHtml(entry.outfit?.title || entry.occasion || "Outfit")}</b><small>${formatIsoDate(entry.wearDate)} · ${escapeHtml(entry.occasion || "General")}</small></div></article>`).join("") : emptyBlock("No wear history", "Confirm outfit wears in the mobile app.");
}

function renderQuest() {
  const history = state.challenges, points = history.reduce((sum,x)=>sum+Number(x.pointsEarned||x.score?.total||0),0);
  const best = Math.max(0,...history.map((x)=>Number(x.score?.total||0))), streak = currentStreak(history);
  $("#quest-summary").innerHTML = metricCards([[points,"Total points"],[history.length,"Quests completed"],[best,"Personal best"],[streak,"Day streak"]]);
  const badges = buildBadges(history, points, best, streak);
  $("#badge-grid").innerHTML = badges.map((badge)=>`<article class="${badge.earned?"earned":"locked"}"><span>${badge.earned?"◆":"◇"}</span><b>${badge.label}</b><small>${badge.detail}</small><em>${badge.earned?"Earned":badge.progress}</em></article>`).join("");
  $("#quest-history").innerHTML = history.length ? history.map((entry)=>`<article><div><b>${escapeHtml(entry.challengeTitle || entry.challengeSnapshot?.title || "Closet Quest")}</b><span>${formatIsoDate(entry.challengeDateKey)} · ${escapeHtml(entry.challengeSnapshot?.occasion || "")}</span></div><strong>${Number(entry.score?.total||0)}/100<small>+${Number(entry.pointsEarned||0)} points</small></strong></article>`).join("") : emptyBlock("No completed quests yet", "Play Closet Quest in the mobile app to build your history.");
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
  const cards = [
    ["Today's outfit", state.todayOutfit?.outfit?.title || state.todayOutfit?.title || "No cached outfit for today"],
    ["Next planned look", next ? `${formatIsoDate(next.wearDate)} · ${next.outfit?.title || next.occasion || "Planned outfit"}` : "Nothing upcoming"],
    ["Closet readiness", `${clean} clean garments available`],
    ["Rediscover", `${underused} garments have no recorded wears`],
    ["Style Check history", `${state.outfitHistory.length} saved analyses`],
  ];
  $("#home-insights").innerHTML = cards.map(([title,text])=>`<article><span>INSIGHT</span><b>${escapeHtml(title)}</b><p>${escapeHtml(text)}</p></article>`).join("");
}

$("#wardrobe-search").addEventListener("input", filterWardrobe);
$("#wardrobe-filter").addEventListener("change", filterWardrobe);
function filterWardrobe() {
  const term = $("#wardrobe-search").value.trim().toLowerCase();
  const filter = $("#wardrobe-filter").value;
  const filtered = state.wardrobe.filter((item) => {
    const haystack = `${item.title || ""} ${item.category || ""} ${item.primaryColor || ""}`.toLowerCase();
    return haystack.includes(term) && (filter === "all" || (filter === "favorite" && item.favorite) || (filter === "clean" && item.laundryStatus === "Clean"));
  });
  renderGarments($("#wardrobe-grid"), filtered);
  $("#wardrobe-empty").classList.toggle("hidden", filtered.length > 0);
}

document.addEventListener("click", (event) => {
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
$("#month-prev").addEventListener("click",()=>{ state.calendarDate=new Date(state.calendarDate.getFullYear(),state.calendarDate.getMonth()-1,1); renderCalendar(); });
$("#month-next").addEventListener("click",()=>{ state.calendarDate=new Date(state.calendarDate.getFullYear(),state.calendarDate.getMonth()+1,1); renderCalendar(); });
$("#close-garment").addEventListener("click",()=>$("#garment-dialog").close());

function openGarmentDetail(id) {
  const item=state.wardrobe.find((x)=>x.id===id);
  if (!item) return;
  const fields=[["Category",item.category],["Subcategory",item.subCategory],["Brand",item.brand],["Primary color",item.primaryColor],["Secondary colors",listText(item.secondaryColors)],["Pattern",item.pattern],["Fit",item.fit],["Material",item.material||item.fabric],["Sleeves",item.sleeveType],["Neckline",item.neckline],["Season",listText(item.season)],["Occasions",listText(item.userOccasions||item.occasion)],["Formality",item.formality],["Laundry",item.laundryStatus],["Times worn",item.timesWorn??0],["Last worn",item.lastWorn?formatIsoDate(item.lastWorn):"Never"],["Purchase year",item.purchaseYear],["Purchase price",item.purchasePrice?formatCurrency(item.purchasePrice):""],["Rating",item.rating?`${item.rating}/5`:""],["AI visibility",item.hiddenFromAI?"Hidden":"Available"],["Background prepared",item.bgRemoved===true?"Yes":item.bgRemoved===false?"No":""],["Tags",listText(item.tags)]];
  $("#garment-detail").innerHTML=`<div class="garment-hero"><img src="${safeUrl(item.image)}" alt="${escapeHtml(item.title||"Garment")}"><div><span class="app-kicker">GARMENT INTELLIGENCE</span><h2>${escapeHtml(item.title||"Untitled garment")}</h2><p>${escapeHtml(item.aiDescription||item.remarks||"Saved in your ClothMatics wardrobe.")}</p><div class="garment-flags">${item.favorite?"<span>Favorite</span>":""}${item.inLookbook||item.type==="lookbook"?"<span>Lookbook</span>":""}${item.userConfirmed?"<span>Confirmed</span>":""}</div></div></div><div class="garment-fields">${fields.filter(([,v])=>v!==""&&v!=null).map(([label,value])=>`<p><span>${escapeHtml(label)}</span><b>${escapeHtml(value)}</b></p>`).join("")}</div><div class="mobile-action-note"><b>Want to change these details?</b><span>Open this garment in the ClothMatics mobile app.</span></div>`;
  $("#garment-dialog").showModal();
}

$$('[data-panel]').forEach((button) => button.addEventListener("click", () => openPanel(button.dataset.panel)));
$$('[data-go-panel]').forEach((button) => button.addEventListener("click", () => openPanel(button.dataset.goPanel)));
function openPanel(name) {
  state.panel = name;
  $$(".panel").forEach((panel) => panel.classList.add("hidden"));
  $(`#panel-${name}`).classList.remove("hidden");
  $$('[data-panel]').forEach((button) => button.classList.toggle("active", button.dataset.panel === name));
  const firstName = (state.profile?.fullName || state.profile?.displayName || state.user?.displayName || "").split(" ")[0];
  $("#panel-title").textContent = name === "overview" && firstName ? `Good to see you, ${firstName}` : panelNames[name];
  window.scrollTo({ top: 0, behavior: "smooth" });
}

$("#generate-button").addEventListener("click", async () => {
  if (state.wardrobe.length < 1) return toast("Add garments in the mobile app first.");
  const button = $("#generate-button");
  button.disabled = true;
  button.textContent = "Creating your outfit…";
  $("#outfit-result").innerHTML = '<div class="result-placeholder"><span class="spinner"></span><b>Styling your wardrobe…</b><p>Considering colors, occasion, and garment roles.</p></div>';
  try {
    const token = await state.user.getIdToken();
    const response = await fetch("/api/generate-outfit", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
      body: JSON.stringify({ occasion: $("#occasion-select").value, preference: $("#preference-input").value.trim(), profile: publicProfile(state.profile), wardrobe: state.wardrobe.map(publicGarment) }),
    });
    const data = await response.json();
    if (!response.ok) throw new Error(data.error || "Outfit generation failed.");
    renderGeneratedOutfit(data.outfit);
  } catch (error) {
    $("#outfit-result").innerHTML = `<div class="error-box"><b>Couldn’t create this outfit</b><p>${escapeHtml(error.message)}</p></div>`;
  } finally {
    button.disabled = false;
    button.textContent = "✦ Generate my outfit";
  }
});

function renderGeneratedOutfit(outfit) {
  const items = (outfit.wardrobeItemIds || []).map((id) => state.wardrobe.find((item) => item.id === id)).filter(Boolean);
  $("#outfit-result").innerHTML = `<div class="generated-head"><div><span class="app-kicker">YOUR COMPLETE LOOK</span><h3>${escapeHtml(outfit.title)}</h3><p>${escapeHtml(outfit.subtitle || "")}</p></div><div class="generated-score">★ ${Number(outfit.score || 0)}/100</div></div><div class="generated-items">${items.map((item) => `<div><img src="${safeUrl(item.image)}" alt="${escapeHtml(item.title)}" /><b>${escapeHtml(item.title)}</b></div>`).join("")}</div><h4>Why it works</h4><ul class="reason-list">${(outfit.reasoning || []).map((reason) => `<li>${escapeHtml(reason)}</li>`).join("")}</ul>`;
}

function publicGarment(item) { return { id:item.id,title:item.title,category:item.category,subCategory:item.subCategory,categoryRole:item.categoryRole,layerRole:item.layerRole,requiresBaseLayer:item.requiresBaseLayer,standaloneOutfit:item.standaloneOutfit,userOccasions:item.userOccasions,activitySuitability:item.activitySuitability,userRestrictions:item.userRestrictions,setType:item.setType,includedComponents:item.includedComponents,requiredComponents:item.requiredComponents,primaryColor:item.primaryColor,secondaryColors:item.secondaryColors,pattern:item.pattern,fit:item.fit,material:item.material,season:item.season,occasion:item.occasion,formality:item.formality,tags:item.tags,favorite:item.favorite,laundryStatus:item.laundryStatus,hiddenFromAI:item.hiddenFromAI }; }
function publicProfile(profile={}) { return { gender:profile.gender,dateOfBirth:profile.dateOfBirth,profession:profile.profession,city:profile.city,bodyType:profile.bodyTypeSelfReported||profile.aiAnalysis?.bodyType,skinTone:profile.aiAnalysis?.skinTone,hairColor:profile.aiAnalysis?.hairColor,preferences:profile.preferences||null }; }
function byCreatedAt(a,b) { return timeValue(b.createdAt) - timeValue(a.createdAt); }
function timeValue(value) { if (!value) return 0; if (typeof value.toMillis==="function") return value.toMillis(); if (typeof value.seconds==="number") return value.seconds*1000; if (typeof value==="number") return value; return new Date(value).getTime()||0; }
function formatDateValue(value) { const time=timeValue(value); return time?new Intl.DateTimeFormat(undefined,{dateStyle:"medium"}).format(time):"Date unavailable"; }
function formatIsoDate(value) { if(!value)return "Date unavailable"; const date=new Date(`${String(value).slice(0,10)}T12:00:00`); return Number.isNaN(date.getTime())?String(value):date.toLocaleDateString(undefined,{day:"numeric",month:"short",year:"numeric"}); }
function localDateKey(date) { const year=date.getFullYear(),month=String(date.getMonth()+1).padStart(2,"0"),day=String(date.getDate()).padStart(2,"0"); return `${year}-${month}-${day}`; }
function formatCurrency(value) { return new Intl.NumberFormat("en-IN",{style:"currency",currency:"INR",maximumFractionDigits:0}).format(Number(value)||0); }
function metricCards(entries) { return entries.map(([value,label])=>`<article><b>${escapeHtml(value)}</b><span>${escapeHtml(label)}</span></article>`).join(""); }
function emptyBlock(title,text) { return `<div class="companion-empty"><b>${escapeHtml(title)}</b><span>${escapeHtml(text)}</span></div>`; }
function listText(value) { return Array.isArray(value)?value.map(pretty).join(", "):pretty(value); }
function pretty(value) { return value?String(value).replace(/_/g," ").replace(/\b\w/g,(x)=>x.toUpperCase()):""; }
function coverageText(rules) { if(!rules)return ""; return [rules.sleevelessAllowed?"Sleeveless allowed":"No sleeveless",rules.shortsAllowed?"Shorts allowed":"No shorts",rules.fittedAllowed?"Fitted allowed":"No fitted"].join(", "); }
function currentStreak(history) { const dates=[...new Set(history.map((x)=>x.challengeDateKey).filter(Boolean))].sort().reverse(); if(!dates.length)return 0; const day=(v)=>{const [y,m,d]=v.split("-").map(Number);return Math.floor(Date.UTC(y,m-1,d)/86400000)}; const today=new Date(),now=Math.floor(Date.UTC(today.getFullYear(),today.getMonth(),today.getDate())/86400000); if(now-day(dates[0])>1)return 0; let streak=1; for(let i=1;i<dates.length;i++){if(day(dates[i-1])-day(dates[i])!==1)break;streak++;} return streak; }
function buildBadges(history,points,best,streak) { return [
  {label:"First Quest",detail:"Complete your first quest",earned:history.length>=1,progress:`${Math.min(history.length,1)}/1`},
  {label:"Style Spark",detail:"Earn 250 style points",earned:points>=250,progress:`${Math.min(points,250)}/250`},
  {label:"On Fire",detail:"Build a 3-day streak",earned:streak>=3,progress:`${Math.min(streak,3)}/3`},
  {label:"Perfect Week",detail:"Complete seven days",earned:streak>=7,progress:`${Math.min(streak,7)}/7`},
  {label:"Style Master",detail:"Score 90 or higher",earned:best>=90,progress:`${Math.min(best,90)}/90`},
  {label:"Quest Legend",detail:"Complete 25 quests",earned:history.length>=25,progress:`${Math.min(history.length,25)}/25`}
]; }
function safeUrl(value="") { try { const url=new URL(value); return ["https:","http:"].includes(url.protocol) ? url.href : ""; } catch { return ""; } }
function safeAssetUrl(value="") { return /^\.\/assets\/[a-z0-9._-]+$/i.test(value) ? value : ""; }
function escapeHtml(value="") { const div=document.createElement("div"); div.textContent=String(value); return div.innerHTML; }
function setAuthBusy(busy) { $("#email-signin").disabled=busy; $("#google-signin").disabled=busy; $("#email-signin").textContent=busy?"Signing in…":"Sign in"; $("#auth-message").textContent=""; }
function friendlyAuthError(error) {
  const messages = {
    "auth/invalid-credential": "The email or password is incorrect.",
    "auth/unauthorized-domain": "This website domain is not authorized in Firebase Authentication.",
    "auth/operation-not-allowed": "This sign-in method is not enabled in Firebase Authentication.",
    "auth/popup-blocked": "Your browser blocked the Google sign-in window. Please allow pop-ups and try again.",
    "auth/popup-closed-by-user": "The Google sign-in window was closed before sign-in finished.",
    "auth/cancelled-popup-request": "Another sign-in window is already open.",
    "auth/api-key-not-valid.-please-pass-a-valid-api-key.": "The Firebase Web API key is not valid for this website.",
    "auth/network-request-failed": "The sign-in request could not reach Firebase. Check your connection and try again.",
  };
  return messages[error?.code] || `Google sign-in failed${error?.code ? ` (${error.code})` : ""}.`;
}
function toast(message) { const el=$("#toast"); el.textContent=message; el.classList.add("show"); setTimeout(()=>el.classList.remove("show"),2800); }
