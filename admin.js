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
const state = { users: [], activity: [], datasets: {}, userRows: [], visibleUsers: [], selectedUserId: null };

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
  state.visibleUsers = users;
  $("#users-body").innerHTML = users.map((user) => {
    const subscription = user.subscription || {};
    const profile = [user.gender, user.city, user.profession].filter(Boolean).slice(0, 2).join(" · ") || "Profile incomplete";
    return `<tr><td><div class="user-cell"><span class="user-avatar">${escapeHtml(user.name.charAt(0).toUpperCase())}</span><div><b>${escapeHtml(user.name)}</b><small>${escapeHtml(user.email || "No email")}</small><small title="${escapeHtml(user.uid)}">${escapeHtml(user.uid.slice(0, 12))}…</small></div></div></td><td>${escapeHtml(profile)}</td><td><b>${escapeHtml(subscription.plan || "free")}</b><br><small>${escapeHtml(subscription.lastCoupon || "No code")}</small></td><td>${formatDate(timeOf(user.createdAt))}</td><td>${user.garmentCount}</td><td>${user.outfitCount}</td><td>${user.aiCount}</td><td>${formatRelative(user.lastActivity)}</td><td><button class="view-user" data-user-id="${escapeHtml(user.uid)}">View details</button></td></tr>`;
  }).join("");
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
  renderActivity();
}

function eventOf(type, label, source, timestamp) { return { type, label, userId: source.userId || source.uid || source.id, time: timeOf(timestamp), detail: source.status === "failure" ? source.errorMessage || "Failed request" : "" }; }
function renderActivity() {
  const filter = $("#activity-filter").value;
  const from = startOfDate($("#activity-from").value), to = endOfDate($("#activity-to").value);
  const filtered = state.activity.filter((x) => (filter === "all" || x.type === filter) && (!from || x.time >= from) && (!to || x.time <= to));
  const items = filtered.slice(0, 100);
  $("#activity-summary").innerHTML = `<article><b>${filtered.length}</b><span>events</span></article><article><b>${new Set(filtered.map((x) => x.userId).filter(Boolean)).size}</b><span>active users</span></article><article><b>${new Set(filtered.map((x) => dateKey(x.time))).size}</b><span>active dates</span></article>`;
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

function openUserDetail(userId) {
  const user = state.userRows.find((x) => x.uid === userId);
  if (!user) return;
  state.selectedUserId = userId;
  $("#detail-user-name").textContent = user.name;
  $("#detail-user-email").textContent = `${user.email || "No email"} · ${user.uid}`;
  const analysis = user.aiAnalysis || {};
  const subscription = user.subscription || {};
  const fields = [
    ["Gender", user.gender], ["City", user.city], ["Profession", user.profession], ["Height", user.height ? `${user.height} cm` : ""],
    ["Body type", user.bodyType || analysis.bodyType], ["Skin tone", user.skinTone || analysis.skinTone], ["Hair color", analysis.hairColor],
    ["Plan", subscription.plan || "free"], ["Coupon used", subscription.lastCoupon || "No coupon"], ["Premium until", formatDate(timeOf(subscription.premiumUntil))], ["Joined", formatDate(timeOf(user.createdAt))], ["Last activity", formatDate(user.lastActivity)],
  ];
  $("#detail-profile").innerHTML = fields.map(([label, value]) => `<p><span>${escapeHtml(label)}</span><b>${escapeHtml(value || "—")}</b></p>`).join("");
  renderUserDetail();
  $("#user-detail").classList.remove("hidden");
  document.body.classList.add("modal-open");
}

function renderUserDetail() {
  const id = state.selectedUserId;
  if (!id) return;
  const d = state.datasets;
  const from = startOfDate($("#detail-from").value), to = endOfDate($("#detail-to").value);
  const events = state.activity.filter((x) => x.userId === id && (!from || x.time >= from) && (!to || x.time <= to));
  const closet = d.wardrobe.filter((x) => x.userId === id && dateWithin(activityTime(x), from, to));
  const outfits = d.savedOutfits.filter((x) => x.userId === id && dateWithin(activityTime(x), from, to));
  const ai = events.filter((x) => x.type === "ai").length;
  $("#detail-stats").innerHTML = [[events.length,"Events"],[new Set(events.map((x)=>dateKey(x.time))).size,"Active days"],[closet.length,"Closet items"],[outfits.length,"Saved outfits"],[ai,"AI actions"]].map(([value,label])=>`<article><b>${value}</b><span>${label}</span></article>`).join("");
  $("#detail-activity").innerHTML = events.length ? events.map((item) => `<article class="detail-event"><span>${escapeHtml(item.type.toUpperCase())}</span><div><b>${escapeHtml(item.label)}</b><small>${formatDateTime(item.time)}</small></div></article>`).join("") : '<div class="detail-empty">No activity in this period.</div>';
  $("#detail-closet").innerHTML = closet.length ? `<div class="detail-closet-grid">${closet.map((item) => `<article><img src="${escapeHtml(item.image || item.imageUrl || "")}" alt="" loading="lazy" /><div><b>${escapeHtml(item.title || "Garment")}</b><span>${escapeHtml([item.category,item.primaryColor,item.laundryStatus].filter(Boolean).join(" · "))}</span><small>Added ${formatDate(activityTime(item))}</small></div></article>`).join("")}</div>` : '<div class="detail-empty">No closet items in this period.</div>';
  $("#detail-outfits").innerHTML = outfits.length ? outfits.map((outfit) => `<article class="detail-outfit"><div><b>${escapeHtml(outfit.outfit?.title || outfit.title || "Saved outfit")}</b><span>${escapeHtml(outfit.occasion || "No occasion")}</span></div><small>${formatDate(activityTime(outfit))}</small></article>`).join("") : '<div class="detail-empty">No saved outfits in this period.</div>';
}

function closeUserDetail() { $("#user-detail").classList.add("hidden"); document.body.classList.remove("modal-open"); state.selectedUserId = null; }

function exportUsersCsv() {
  const columns = ["UID","Name","Email","Gender","City","Profession","Plan","Coupon used","Premium until","Joined","Last activity","Garments","Saved outfits","AI actions"];
  const rows = state.visibleUsers.map((u) => [u.uid,u.name,u.email,u.gender,u.city,u.profession,u.subscription?.plan || "free",u.subscription?.lastCoupon || "",formatDate(timeOf(u.subscription?.premiumUntil)),formatDate(timeOf(u.createdAt)),formatDate(u.lastActivity),u.garmentCount,u.outfitCount,u.aiCount]);
  const csv = [columns, ...rows].map((row) => row.map(csvCell).join(",")).join("\r\n");
  const url = URL.createObjectURL(new Blob(["\ufeff", csv], { type: "text/csv;charset=utf-8" }));
  const link = document.createElement("a"); link.href = url; link.download = `clothmatics-users-${dateKey(Date.now())}.csv`; link.click(); URL.revokeObjectURL(url);
}

function csvCell(value) { return `"${String(value ?? "").replace(/"/g, '""')}"`; }
function startOfDate(value) { return value ? new Date(`${value}T00:00:00`).getTime() : 0; }
function endOfDate(value) { return value ? new Date(`${value}T23:59:59.999`).getTime() : 0; }
function dateWithin(time, from, to) { return (!from || time >= from) && (!to || time <= to); }
function dateKey(ms) { return new Date(ms).toLocaleDateString("en-CA"); }
function formatDateTime(ms) { return ms ? new Intl.DateTimeFormat(undefined, { dateStyle:"medium", timeStyle:"short" }).format(ms) : "—"; }

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
$("#activity-filter").addEventListener("change", renderActivity);
$("#activity-from").addEventListener("change", renderActivity);
$("#activity-to").addEventListener("change", renderActivity);
$("#clear-activity-dates").addEventListener("click", () => { $("#activity-from").value = ""; $("#activity-to").value = ""; renderActivity(); });
$("#users-body").addEventListener("click", (event) => { const button = event.target.closest("[data-user-id]"); if (button) openUserDetail(button.dataset.userId); });
$("#export-users").addEventListener("click", exportUsersCsv);
$("#close-user-detail").addEventListener("click", closeUserDetail);
$("#detail-close-button").addEventListener("click", closeUserDetail);
$("#detail-from").addEventListener("change", renderUserDetail);
$("#detail-to").addEventListener("change", renderUserDetail);
$("#detail-clear-dates").addEventListener("click", () => { $("#detail-from").value = ""; $("#detail-to").value = ""; renderUserDetail(); });
document.addEventListener("keydown", (event) => { if (event.key === "Escape") closeUserDetail(); });
document.querySelectorAll("[data-detail-tab]").forEach((button) => button.addEventListener("click", () => { document.querySelectorAll("[data-detail-tab]").forEach((x) => x.classList.toggle("active", x === button)); document.querySelectorAll(".detail-view").forEach((x) => x.classList.add("hidden")); $(`#detail-${button.dataset.detailTab}`).classList.remove("hidden"); }));
$("#coupon-form").addEventListener("submit", createCoupon);
$("#generate-coupon-code").addEventListener("click", () => { $("#coupon-code").value = generateCouponCode($("#coupon-plan").value); });
