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
const state = { user: null, profile: null, wardrobe: [], outfits: [], panel: "overview" };
const panelNames = { overview: "Good to see you", wardrobe: "My wardrobe", lookbook: "My Lookbook", stylist: "AI Stylist" };

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
    const [profileSnap, wardrobeSnap, outfitsSnap] = await Promise.all([
      getDoc(doc(db, "users", user.uid)),
      getDocs(query(collection(db, "wardrobe"), where("userId", "==", user.uid))),
      getDocs(query(collection(db, "savedOutfits"), where("userId", "==", user.uid))),
    ]);
    state.profile = profileSnap.exists() ? profileSnap.data() : {};
    state.wardrobe = wardrobeSnap.docs.map((entry) => ({ id: entry.id, ...entry.data() })).sort(byCreatedAt);
    state.outfits = outfitsSnap.docs.map((entry) => ({ id: entry.id, ...entry.data() })).sort(byCreatedAt);
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
  renderGarments($("#recent-grid"), state.wardrobe.slice(0, 4));
  renderGarments($("#wardrobe-grid"), state.wardrobe);
  renderGarments($("#lookbook-grid"), lookbookItems);
  renderLooks(savedLooks);
}

function renderGarments(target, items) {
  target.innerHTML = items.map((item) => `
    <article class="closet-item">
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

function publicGarment(item) { return { id:item.id,title:item.title,category:item.category,subCategory:item.subCategory,primaryColor:item.primaryColor,secondaryColors:item.secondaryColors,pattern:item.pattern,fit:item.fit,material:item.material,season:item.season,occasion:item.occasion,favorite:item.favorite,laundryStatus:item.laundryStatus }; }
function publicProfile(profile={}) { return { gender:profile.gender,profession:profile.profession,city:profile.city,bodyType:profile.aiAnalysis?.bodyType,skinTone:profile.aiAnalysis?.skinTone }; }
function byCreatedAt(a,b) { return (b.createdAt?.seconds || 0) - (a.createdAt?.seconds || 0); }
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
