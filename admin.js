import { initializeApp } from "https://www.gstatic.com/firebasejs/12.15.0/firebase-app.js";
import { browserLocalPersistence, getAuth, onAuthStateChanged, setPersistence, signOut } from "https://www.gstatic.com/firebasejs/12.15.0/firebase-auth.js";
import { collection, doc, getDoc, getDocs, getFirestore, setDoc } from "https://www.gstatic.com/firebasejs/12.15.0/firebase-firestore.js";
import { firebaseConfig } from "./config.js";

const ADMIN_EMAIL = "chiragsharma376@gmail.com";
const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);
await setPersistence(auth, browserLocalPersistence);

const $ = (selector) => document.querySelector(selector);
const state = { users: [], activity: [], datasets: {}, userRows: [] };

onAuthStateChanged(auth, async (user) => {
  if (!user) return deny("Sign in with the administrator account before opening this page.");
  if ((user.email || "").toLowerCase() !== ADMIN_EMAIL) return deny("This account is not authorized to view the ClothMatics admin dashboard.");
  const token = await user.getIdTokenResult(true);
  if (token.claims.admin !== true) return deny("The account is correct, but its Firebase admin custom claim has not been granted yet.");
  $("#admin-email").textContent = user.email;
  $("#admin-name").textContent = user.displayName || "Chirag Sharma";
  $("#admin-initial").textContent = (user.displayName || user.email || "C").charAt(0).toUpperCase();
  $("#admin-gate").classList.add("hidden");
  $("#admin-app").classList.remove("hidden");
  await loadDashboard();
});

function deny(message) {
  $("#gate-message").textContent = message;
  $("#admin-gate h1").textContent = "Access unavailable";
  $("#gate-action").classList.remove("hidden");
}

async function loadDashboard() {
  $("#admin-loading").classList.remove("hidden");
  $("#admin-content").classList.add("hidden");
  $("#admin-error").classList.add("hidden");
  try {
    const names = ["users", "wardrobe", "savedOutfits", "outfitHistory", "outfitWear", "aiResponses", "coupons"];
    const snapshots = await Promise.all(names.map((name) => getDocs(collection(db, name))));
    state.datasets = Object.fromEntries(names.map((name, i) => [name, snapshots[i].docs.map((doc) => ({ id: doc.id, ...doc.data() }))]));
    const apiSnapshot = await getDocs(collection(db, "analytics", "apiCalls", "logs"));
    state.datasets.apiLogs = apiSnapshot.docs.map((doc) => ({ id: doc.id, ...doc.data() }));
    buildDashboard();
    $("#admin-content").classList.remove("hidden");
    $("#last-updated").textContent = `Updated ${new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}`;
  } catch (error) {
    console.error("Admin dashboard", error);
    $("#admin-error").textContent = error?.code === "permission-denied" ? "Firestore denied the admin query. Confirm this account has the Firebase custom claim admin: true, then sign out and back in." : `Dashboard could not load: ${error.message}`;
    $("#admin-error").classList.remove("hidden");
  } finally { $("#admin-loading").classList.add("hidden"); }
}

function buildDashboard() {
  const d = state.datasets;
  const weekAgo = Date.now() - 7 * 86400000;
  $("#metric-users").textContent = d.users.length;
  $("#metric-new-users").textContent = `${d.users.filter((u) => timeOf(u.createdAt) >= weekAgo).length} joined this week`;
  $("#metric-garments").textContent = d.wardrobe.length;
  $("#metric-outfits").textContent = d.savedOutfits.length;
  $("#metric-ai").textContent = d.aiResponses.length + d.outfitHistory.length;

  const engagement = [
    ["Wardrobe", d.wardrobe.length], ["Saved outfits", d.savedOutfits.length], ["Style checks", d.outfitHistory.length], ["Wears logged", d.outfitWear.length], ["AI responses", d.aiResponses.length],
  ];
  renderBars($("#engagement-bars"), engagement);
  renderHealth(d.apiLogs);
  buildUsers();
  buildActivity();
  renderServices(d.apiLogs);
  renderCoupons(d.coupons);
}

function renderCoupons(coupons = []) {
  const sorted = [...coupons].sort((a, b) => String(a.code || a.id).localeCompare(String(b.code || b.id)));
  $("#coupon-count").textContent = sorted.length;
  $("#coupon-list").innerHTML = sorted.length ? sorted.map((coupon) => {
    const expires = timeOf(coupon.expiresAt), used = Number(coupon.redeemedCount || 0), cap = Number(coupon.maxRedemptions || 0);
    const status = coupon.active === false ? "Disabled" : expires && expires < Date.now() ? "Expired" : cap && used >= cap ? "Used up" : "Active";
    return `<div class="coupon-row"><div><b>${escapeHtml(coupon.code || coupon.id)}</b><span>${escapeHtml(coupon.plan || `${coupon.days || 0} days`)} · ${coupon.days || 0} days</span></div><div><b>${used}${cap ? ` / ${cap}` : ""}</b><span>redemptions</span></div><div><b>${expires ? formatDate(expires) : "No expiry"}</b><span class="coupon-status ${status.toLowerCase().replace(" ", "-")}">${status}</span></div></div>`;
  }).join("") : '<div class="table-empty">No coupons have been created yet.</div>';
}

function generateCouponCode(plan) {
  const alphabet = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";
  let body = "";
  for (let i = 0; i < 6; i += 1) body += alphabet[Math.floor(Math.random() * alphabet.length)];
  return `${plan === "yearly" ? "YEAR" : "MONTH"}-${body}`;
}

async function createCoupon(event) {
  event.preventDefault();
  const plan = $("#coupon-plan").value === "yearly" ? "yearly" : "monthly";
  const code = ($("#coupon-code").value.trim() || generateCouponCode(plan)).toUpperCase().replace(/[^A-Z0-9-]/g, "");
  const maxRedemptions = Number($("#coupon-max").value), expiresInDays = Number($("#coupon-expiry").value);
  const button = $("#create-coupon");
  if (!code || code.length < 4) return showCouponMessage("Enter a coupon code with at least four letters or numbers.", true);
  button.disabled = true; button.textContent = "Creating…"; $("#coupon-message").classList.add("hidden");
  try {
    const ref = doc(db, "coupons", code);
    if ((await getDoc(ref)).exists()) return showCouponMessage(`${code} already exists. Choose another code.`, true);
    const payload = { code, plan, days: plan === "yearly" ? 365 : 30, active: true, redeemedCount: 0, createdAt: Date.now() };
    if (Number.isInteger(maxRedemptions) && maxRedemptions > 0) payload.maxRedemptions = maxRedemptions;
    if (Number.isInteger(expiresInDays) && expiresInDays > 0) payload.expiresAt = Date.now() + expiresInDays * 86400000;
    await setDoc(ref, payload);
    $("#coupon-code").value = code;
    showCouponMessage(`Coupon ${code} was created successfully.`, false);
    await loadDashboard();
  } catch (error) {
    console.error("Create coupon", error);
    showCouponMessage(error?.code === "permission-denied" ? "Firebase denied this action. Sign out and back in after confirming your admin custom claim." : `Coupon could not be created: ${error.message}`, true);
  } finally { button.disabled = false; button.textContent = "Create coupon"; }
}

function showCouponMessage(text, isError) {
  const target = $("#coupon-message"); target.textContent = text;
  target.classList.remove("hidden", "error", "success"); target.classList.add(isError ? "error" : "success");
}

function buildUsers() {
  const d = state.datasets;
  const latestByUser = new Map();
  [...d.wardrobe, ...d.savedOutfits, ...d.outfitHistory, ...d.outfitWear, ...d.aiResponses, ...d.apiLogs].forEach((item) => {
    if (!item.userId) return;
    const timestamp = activityTime(item);
    if (timestamp > (latestByUser.get(item.userId) || 0)) latestByUser.set(item.userId, timestamp);
  });
  state.userRows = d.users.map((user) => ({
    ...user,
    uid: user.id,
    name: user.fullName || user.displayName || "Unnamed user",
    garmentCount: d.wardrobe.filter((x) => x.userId === user.id).length,
    outfitCount: d.savedOutfits.filter((x) => x.userId === user.id).length,
    aiCount: d.aiResponses.filter((x) => x.userId === user.id).length + d.outfitHistory.filter((x) => x.userId === user.id).length,
    lastActivity: Math.max(latestByUser.get(user.id) || 0, activityTime(user)),
  })).sort((a, b) => timeOf(b.createdAt) - timeOf(a.createdAt));
  renderUsers(state.userRows);
}

function renderUsers(users) {
  $("#users-body").innerHTML = users.map((user) => `<tr><td><div class="user-cell"><span class="user-avatar">${escapeHtml(user.name.charAt(0).toUpperCase())}</span><div><b>${escapeHtml(user.name)}</b><small>${escapeHtml(user.email || "No email")}</small><small title="${escapeHtml(user.uid)}">${escapeHtml(user.uid.slice(0, 12))}…</small></div></div></td><td>${formatDate(timeOf(user.createdAt))}</td><td>${user.garmentCount}</td><td>${user.outfitCount}</td><td>${user.aiCount}</td><td>${formatRelative(user.lastActivity)}</td></tr>`).join("");
  $("#users-empty").classList.toggle("hidden", users.length > 0);
}

function buildActivity() {
  const d = state.datasets;
  const users = new Map(d.users.map((u) => [u.id, u]));
  const events = [];
  d.users.forEach((x) => events.push(eventOf("account", "User joined", x, x.createdAt)));
  d.wardrobe.forEach((x) => events.push(eventOf("wardrobe", `Added ${x.title || "a garment"}`, x, x.createdAt)));
  d.savedOutfits.forEach((x) => events.push(eventOf("outfit", `Saved ${x.outfit?.title || x.occasion || "an outfit"}`, x, x.createdAt)));
  d.outfitHistory.forEach((x) => events.push(eventOf("ai", "Completed a style check", x, x.createdAt || x.timestamp)));
  d.outfitWear.forEach((x) => events.push(eventOf("outfit", "Logged an outfit wear", x, x.createdAt || x.wornAt || x.date)));
  d.aiResponses.forEach((x) => events.push(eventOf("ai", `Generated ${x.feature || x.type || "an AI response"}`, x, x.createdAt || x.timestamp)));
  d.apiLogs.forEach((x) => events.push(eventOf("ai", `${x.type || "API"} request ${x.status || "logged"}`, x, x.timestamp)));
  state.activity = events.filter((x) => x.time).map((x) => { const u = users.get(x.userId) || {}; return { ...x, user: u.fullName || u.displayName || u.email || x.userId || "System" }; }).sort((a, b) => b.time - a.time);
  renderActivity("all");
}

function eventOf(type, label, source, timestamp) { return { type, label, userId: source.userId || source.uid || source.id, time: timeOf(timestamp), detail: source.status === "failure" ? source.errorMessage || "Failed request" : "" }; }
function renderActivity(filter) {
  const items = state.activity.filter((x) => filter === "all" || x.type === filter).slice(0, 75);
  const icons = { account: "U", wardrobe: "W", outfit: "O", ai: "AI" };
  $("#activity-feed").innerHTML = items.length ? items.map((item) => `<article class="activity-item"><span class="activity-icon">${icons[item.type]}</span><div><b>${escapeHtml(item.label)}</b><small>${escapeHtml(item.user)}${item.detail ? ` · ${escapeHtml(item.detail)}` : ""}</small></div><time>${formatRelative(item.time)}</time></article>`).join("") : '<div class="table-empty">No activity is available for this filter.</div>';
}

function renderHealth(logs) {
  const successes = logs.filter((x) => x.status === "success").length;
  const failures = logs.filter((x) => x.status === "failure").length;
  const rate = successes + failures ? Math.round(successes / (successes + failures) * 100) : 100;
  const latencies = logs.map((x) => Number(x.responseTime)).filter(Number.isFinite);
  const today = new Date(); today.setHours(0, 0, 0, 0);
  $("#health-rate").textContent = `${rate}%`;
  $("#health-today").textContent = logs.filter((x) => activityTime(x) >= today.getTime()).length;
  $("#health-latency").textContent = latencies.length ? `${Math.round(latencies.reduce((a, b) => a + b, 0) / latencies.length)} ms` : "—";
  $("#health-failures").textContent = failures;
}

function renderServices(logs) {
  const providerCounts = countBy(logs, (x) => x.type || x.provider || "unknown");
  const modelCounts = countBy(logs.filter((x) => x.model), (x) => `${x.provider || "ai"}/${x.model}`);
  renderBars($("#provider-bars"), Object.entries(providerCounts));
  $("#model-list").innerHTML = Object.entries(modelCounts).sort((a, b) => b[1] - a[1]).map(([name, count]) => `<div class="model-row"><span title="${escapeHtml(name)}">${escapeHtml(name)}</span><b>${count}</b></div>`).join("") || '<p class="muted">No model-specific logs yet.</p>';
}

function renderBars(target, entries) { const max = Math.max(1, ...entries.map((x) => x[1])); target.innerHTML = entries.map(([label, value]) => `<div class="bar-row"><span title="${escapeHtml(label)}">${escapeHtml(label)}</span><div class="bar-track"><i style="width:${Math.max(value ? 4 : 0, value / max * 100)}%"></i></div><b>${value}</b></div>`).join(""); }
function countBy(items, keyFn) { return items.reduce((acc, item) => { const key = keyFn(item); acc[key] = (acc[key] || 0) + 1; return acc; }, {}); }
function timeOf(value) { if (!value) return 0; if (typeof value.toMillis === "function") return value.toMillis(); if (typeof value.seconds === "number") return value.seconds * 1000; const parsed = new Date(value).getTime(); return Number.isFinite(parsed) ? parsed : 0; }
function activityTime(item) { return timeOf(item.timestamp || item.createdAt || item.updatedAt || item.wornAt || item.date); }
function formatDate(ms) { return ms ? new Intl.DateTimeFormat(undefined, { dateStyle: "medium" }).format(ms) : "—"; }
function formatRelative(ms) { if (!ms) return "No activity"; const diff = Date.now() - ms; if (diff < 60000) return "Just now"; if (diff < 3600000) return `${Math.floor(diff / 60000)}m ago`; if (diff < 86400000) return `${Math.floor(diff / 3600000)}h ago`; if (diff < 604800000) return `${Math.floor(diff / 86400000)}d ago`; return formatDate(ms); }
function escapeHtml(value = "") { const div = document.createElement("div"); div.textContent = String(value); return div.innerHTML; }

$("#refresh-admin").addEventListener("click", loadDashboard);
$("#admin-signout").addEventListener("click", async () => { await signOut(auth); location.href = "./"; });
$("#user-search").addEventListener("input", (event) => { const term = event.target.value.trim().toLowerCase(); renderUsers(state.userRows.filter((u) => `${u.name} ${u.email || ""} ${u.uid}`.toLowerCase().includes(term))); });
$("#activity-filter").addEventListener("change", (event) => renderActivity(event.target.value));
$("#coupon-form").addEventListener("submit", createCoupon);
$("#generate-coupon-code").addEventListener("click", () => { $("#coupon-code").value = generateCouponCode($("#coupon-plan").value); });
