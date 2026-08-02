import { initializeApp } from "https://www.gstatic.com/firebasejs/12.15.0/firebase-app.js";
import { browserLocalPersistence, getAuth, onAuthStateChanged, setPersistence, signOut } from "https://www.gstatic.com/firebasejs/12.15.0/firebase-auth.js";
import { collection, doc, getDoc, getDocs, getFirestore, serverTimestamp, setDoc, Timestamp } from "https://www.gstatic.com/firebasejs/12.15.0/firebase-firestore.js";
import { getFunctions, httpsCallable } from "https://www.gstatic.com/firebasejs/12.15.0/firebase-functions.js";
import { firebaseConfig } from "./config.js";

const ADMIN_EMAIL = "chiragsharma376@gmail.com";
const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);
const functions = getFunctions(app, "us-central1");
const reviewAccountDeletion = httpsCallable(functions, "reviewAccountDeletion");
const deletePushCampaign = httpsCallable(functions, "deletePushCampaign");
const UPLOAD_WORKER_URL = "https://clothmatics-upload-worker.chiragsharma376.workers.dev";
await setPersistence(auth, browserLocalPersistence);

const $ = (selector) => document.querySelector(selector);
const state = { users: [], activity: [], datasets: {}, userRows: [], visibleUsers: [], selectedUserId: null, userPage: 1, activityPage: 1 };
const USER_PAGE_SIZE = 20;
const ACTIVITY_PAGE_SIZE = 30;
installAdminEnhancements();

function installAdminEnhancements(){
  $(".admin-sidebar nav")?.insertAdjacentHTML("beforeend",'<a href="#push-campaigns">Push campaigns</a>');
  $("#overview .overview-grid")?.insertAdjacentHTML("beforeend",'<article class="admin-card"><div class="card-heading"><div><span>ATTRIBUTED SHARING</span><h2>Share performance</h2></div></div><div id="share-metrics" class="health-meta"></div></article>');
  $("#admin-content")?.insertAdjacentHTML("beforeend",`<section id="push-campaigns" class="admin-section"><div class="section-title"><div><span>MOBILE ENGAGEMENT</span><h2>Push campaigns</h2><p>All users means eligible registered mobile devices; permission, channel settings, valid tokens, and frequency rules still apply.</p></div></div><div class="push-layout"><form id="push-form" class="admin-card push-form"><label>Title<input id="push-title" maxlength="80" required></label><label>Body<textarea id="push-body" maxlength="240" required></textarea></label><label>Public HTTPS image<input id="push-image" type="url" placeholder="https://…"></label><label>Channel<select id="push-channel"><option value="announcements">Announcements</option><option value="daily_outfit">Daily outfit</option><option value="wardrobe_activity">Wardrobe activity</option><option value="style_challenges">Style challenges</option><option value="subscription">Subscription</option></select></label><label>Audience<select id="push-audience"><option value="all">All eligible users</option><option value="free">Free</option><option value="subscribed">Subscribed</option><option value="inactive">Inactive</option><option value="small_wardrobe">Small wardrobe</option><option value="daily_ready">Daily ready</option><option value="specific">Specific user</option></select></label><label>Specific UID<input id="push-specific-uid" maxlength="160"></label><label>Destination<select id="push-destination"><option value="Main">Home</option><option value="FestivalStylist">Festival Stylist</option><option value="OutfitCalendar">Outfit Calendar</option><option value="WeeklyClosetReport">Weekly Closet Report</option><option value="SmartPurchaseCheck">Smart Purchase Check</option><option value="StyleChallengeHub">Closet Quest</option><option value="TripPacking">Trip Packing</option></select></label><label>Festival campaign ID<input id="push-festival" maxlength="120"></label><label>Schedule (your browser time)<input id="push-schedule" type="datetime-local"></label><p id="push-ist">Send now. Scheduled times are stored as an absolute timestamp.</p><label class="check-row"><input id="push-bypass" type="checkbox"> Reach every eligible device (bypasses normal 24-hour suppression; channel opt-out and invalid-token checks still apply)</label><div class="card-actions"><button type="submit" class="primary-admin-button">Queue campaign</button><button id="push-test" type="button">Test to my registered device</button></div><p id="push-message" role="status"></p></form><article class="admin-card"><div class="card-heading"><div><span>DELIVERY</span><h2>Campaign history</h2></div></div><div id="push-list" class="push-list"></div></article></div></section>`);
  $("#push-form")?.addEventListener("submit",event=>savePushCampaign(event,false));
  $("#push-test")?.addEventListener("click",event=>savePushCampaign(event,true));
  $("#push-schedule")?.addEventListener("input",renderIstSchedule);
  $("#push-list")?.addEventListener("click",handlePushListAction);
}

function renderShareMetrics(links,attribution){const cards=links.length,clicks=links.reduce((sum,x)=>sum+Number(x.clickCount||x.clicks||0),0),installs=attribution.filter(x=>x.activated===true||x.event==="activated_install").length,rate=cards?Math.round(clicks/cards*100):0;$("#share-metrics").innerHTML=`<p><b>${cards}</b><span>cards shared</span></p><p><b>${clicks}</b><span>clicks</span></p><p><b>${rate}%</b><span>click rate</span></p><p><b>${installs}</b><span>activated installs</span></p>`}
function renderIstSchedule(){const value=$("#push-schedule").value;if(!value)return $("#push-ist").textContent="Send now. Scheduled times are stored as an absolute timestamp.";const date=new Date(value);$("#push-ist").textContent=`Will run at ${date.toLocaleString("en-IN",{timeZone:"Asia/Kolkata",dateStyle:"medium",timeStyle:"short"})} IST (${date.toISOString()}).`}
function pushPayload(test=false){const scheduled=$("#push-schedule").value?new Date($("#push-schedule").value):null;const audience=$("#push-audience").value;return{title:$("#push-title").value.trim(),body:$("#push-body").value.trim(),imageUrl:$("#push-image").value.trim(),channel:$("#push-channel").value,audience:test?"specific":audience,audienceFilter:{type:test?"specific":audience,userIds:test?[auth.currentUser.uid]:audience==="specific"?[$("#push-specific-uid").value.trim()].filter(Boolean):[]},destination:$("#push-destination").value,festivalCampaignId:$("#push-festival").value.trim()||null,bypassFrequencyCap:test?true:$("#push-bypass").checked,status:scheduled&&!test?"scheduled":"queued",scheduledFor:scheduled&&!test?Timestamp.fromDate(scheduled):null,payload:{title:$("#push-title").value.trim(),body:$("#push-body").value.trim(),imageUrl:$("#push-image").value.trim()||null,route:$("#push-destination").value,festivalCampaignId:$("#push-festival").value.trim()||null},createdBy:auth.currentUser.uid,createdAt:serverTimestamp(),updatedAt:serverTimestamp()}}
async function savePushCampaign(event,test){event.preventDefault();const data=pushPayload(test);if(!data.title||!data.body)return $("#push-message").textContent="Title and body are required.";if(data.imageUrl&&!/^https:\/\//i.test(data.imageUrl))return $("#push-message").textContent="Image must use a public HTTPS URL.";if(data.audience==="specific"&&!data.audienceFilter.userIds.length)return $("#push-message").textContent="Enter the target UID.";const button=test?$("#push-test"):$("#push-form [type=submit]");button.disabled=true;try{const ref=doc(collection(db,"pushCampaigns"));await setDoc(ref,data);$("#push-message").textContent=test?"Test campaign queued for your registered mobile device.":"Campaign queued for Firebase Functions processing.";await loadDashboard()}catch(error){$("#push-message").textContent=`Could not queue campaign: ${error.message}`}finally{button.disabled=false}}
function renderPushCampaigns(campaigns){const sorted=[...campaigns].sort((a,b)=>timeOf(b.createdAt)-timeOf(a.createdAt));$("#push-list").innerHTML=sorted.length?sorted.map(c=>`<article class="push-row"><header><div><b>${escapeHtml(c.title||c.payload?.title||"Untitled campaign")}</b><span>${escapeHtml(c.status||"queued")} · ${escapeHtml(c.channel||"announcements")}</span></div><small>${c.scheduledFor?`Scheduled ${formatDateTime(timeOf(c.scheduledFor))}`:formatDateTime(timeOf(c.createdAt))}</small></header><p>${escapeHtml(c.body||c.payload?.body||"")}</p><div class="health-meta"><p><b>${Number(c.uniqueTargetedUsers||0)}</b><span>users</span></p><p><b>${Number(c.deviceTargets||c.targetedDevices||0)}</b><span>devices</span></p><p><b>${Number(c.sent||0)}</b><span>sent</span></p><p><b>${Number(c.failed||0)}</b><span>failed</span></p><p><b>${Number(c.opened||0)}</b><span>opened</span></p></div>${c.skippedReasons?`<small>Skipped: ${escapeHtml(JSON.stringify(c.skippedReasons))}</small>`:""}${c.fcmFailureReasons?`<small>FCM failures: ${escapeHtml(JSON.stringify(c.fcmFailureReasons))}</small>`:""}${c.processingError?`<small>Error: ${escapeHtml(c.processingError)}</small>`:""}<div class="card-actions"><button data-reuse-push="${escapeHtml(c.id)}">Reuse</button><button data-delete-push="${escapeHtml(c.id)}">Delete safely</button></div></article>`).join(""):'<p class="muted">No mobile push campaigns yet.</p>'}
async function handlePushListAction(event){const reuse=event.target.closest("[data-reuse-push]"),remove=event.target.closest("[data-delete-push]");if(reuse){const c=state.datasets.pushCampaigns.find(x=>x.id===reuse.dataset.reusePush);if(!c)return;$("#push-title").value=c.title||c.payload?.title||"";$("#push-body").value=c.body||c.payload?.body||"";$("#push-image").value=c.imageUrl||c.payload?.imageUrl||"";$("#push-channel").value=c.channel||"announcements";$("#push-audience").value=c.audience||c.audienceFilter?.type||"all";$("#push-destination").value=c.destination||c.payload?.route||"Main";$("#push-festival").value=c.festivalCampaignId||c.payload?.festivalCampaignId||"";$("#push-schedule").value="";$("#push-bypass").checked=false;renderIstSchedule();$("#push-message").textContent="Campaign copied. The old schedule was cleared; choose a new time or send now.";location.hash="push-campaigns"}if(remove){if(!confirm("Delete this campaign through the protected Firebase callable?"))return;try{await deletePushCampaign({campaignId:remove.dataset.deletePush});await loadDashboard()}catch(error){alert(`Could not delete campaign: ${error.message}`)}}}

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
    const names = ["users", "wardrobe", "savedOutfits", "outfitHistory", "outfitWear", "styleChallengeSubmissions", "aiResponses", "coupons", "accountDeletionRequests", "pushCampaigns", "shareLinks", "shareAttribution"];
    const snapshots = await Promise.all(names.map((name) => getDocs(collection(db, name)).catch((error)=>{console.warn(`Optional admin collection ${name} unavailable`,error.code);return{docs:[]}})));
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
    ["Wardrobe", d.wardrobe.length], ["Saved outfits", d.savedOutfits.length], ["Style checks", d.outfitHistory.length], ["Wears logged", d.outfitWear.length], ["Closet Quests", d.styleChallengeSubmissions.length], ["AI responses", d.aiResponses.length],
  ];
  renderBars($("#engagement-bars"), engagement);
  renderHealth(d.apiLogs);
  buildUsers();
  buildActivity();
  renderServices(d.apiLogs, d.aiResponses);
  renderCoupons(d.coupons);
  renderDeletionRequests(d.accountDeletionRequests, d.users);
  renderPushCampaigns(d.pushCampaigns||[]);
  renderShareMetrics(d.shareLinks||[],d.shareAttribution||[]);
}

function renderDeletionRequests(requests = [], users = []) {
  const usersById = new Map(users.map((user) => [user.id, user]));
  const pending = requests
    .filter((request) => request.status === "pending")
    .sort((a, b) => timeOf(b.requestedAt) - timeOf(a.requestedAt));
  $("#deletion-request-count").textContent = `${pending.length} pending`;
  $("#deletion-requests-body").innerHTML = pending.map((request) => {
    const user = usersById.get(request.userId) || {};
    const name = user.fullName || user.displayName || "Unknown user";
    return `<tr>
      <td><div class="user-cell"><span class="user-avatar">${escapeHtml(name.charAt(0).toUpperCase())}</span><div><b>${escapeHtml(name)}</b><small>${escapeHtml(user.email || request.userId)}</small></div></div></td>
      <td>${escapeHtml(formatDateTime(timeOf(request.requestedAt)))}</td>
      <td><span class="request-status">Pending</span></td>
      <td><div class="request-actions"><button type="button" class="reject-deletion" data-reject-deletion="${escapeHtml(request.userId)}">Reject</button><button type="button" class="approve-deletion" data-approve-deletion="${escapeHtml(request.userId)}">Delete account &amp; data</button></div></td>
    </tr>`;
  }).join("");
  $("#deletion-requests-empty").classList.toggle("hidden", pending.length > 0);
}

function showDeletionMessage(text, isError) {
  const target = $("#deletion-request-message");
  target.textContent = text;
  target.classList.remove("hidden", "error", "success");
  target.classList.add(isError ? "error" : "success");
}

async function processDeletionRequest(userId, action, button) {
  const user = state.datasets.users.find((entry) => entry.id === userId);
  const label = user?.email || user?.fullName || userId;
  const prompt = action === "approve"
    ? `Permanently delete ${label}, all associated Firestore data, and all uploaded images? This cannot be undone.`
    : `Reject the deletion request for ${label}?`;
  if (!window.confirm(prompt)) return;

  const rowButtons = button.closest("tr").querySelectorAll("button");
  rowButtons.forEach((item) => { item.disabled = true; });
  button.textContent = action === "approve" ? "Deleting…" : "Rejecting…";
  try {
    if (action === "approve") {
      const token = await auth.currentUser.getIdToken(true);
      const uploadResponse = await fetch(`${UPLOAD_WORKER_URL}/admin/users/${encodeURIComponent(userId)}`, {
        method: "DELETE",
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!uploadResponse.ok) {
        let details = "";
        try { details = (await uploadResponse.json()).error || ""; } catch {}
        throw new Error(details || `Image deletion failed (${uploadResponse.status}).`);
      }
    }
    await reviewAccountDeletion({
      userId,
      action,
      uploadsDeleted: action === "approve",
    });
    showDeletionMessage(
      action === "approve"
        ? `The account and all associated data for ${label} were permanently deleted.`
        : `The deletion request for ${label} was rejected.`,
      false
    );
    await loadDashboard();
  } catch (error) {
    console.error("Deletion review", error);
    showDeletionMessage(`Request could not be processed: ${error.message}`, true);
    rowButtons.forEach((item) => { item.disabled = false; });
    button.textContent = action === "approve" ? "Delete account & data" : "Reject";
  }
}

function renderCoupons(coupons = []) {
  const sorted = [...coupons].sort((a, b) => String(a.code || a.id).localeCompare(String(b.code || b.id)));
  $("#coupon-count").textContent = sorted.length;
  $("#coupon-list").innerHTML = sorted.length ? sorted.map((coupon) => {
    const expires = timeOf(coupon.expiresAt), used = Number(coupon.redeemedCount || 0), cap = Number(coupon.maxRedemptions || 0);
    const status = coupon.active === false ? "Disabled" : expires && expires < Date.now() ? "Expired" : cap && used >= cap ? "Used up" : "Active";
    return `<div class="coupon-row"><div><b>${escapeHtml(coupon.code || coupon.id)}</b><span>${escapeHtml(coupon.plan || "custom")} · ${coupon.days || 0} premium days${coupon.campaignLabel ? ` · ${escapeHtml(coupon.campaignLabel)}` : ""}</span></div><div><b>${used}${cap ? ` / ${cap}` : ""}</b><span>redemptions</span></div><div><b>${expires ? formatDate(expires) : "No expiry"}</b><span class="coupon-status ${status.toLowerCase().replace(" ", "-")}">${status}</span></div></div>`;
  }).join("") : '<div class="table-empty">No coupons have been created yet.</div>';
}

function generateCouponCode(plan) {
  const alphabet = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";
  let body = "";
  for (let i = 0; i < 6; i += 1) body += alphabet[Math.floor(Math.random() * alphabet.length)];
  return `${plan === "yearly" ? "YEAR" : plan === "custom" ? "CUSTOM" : "MONTH"}-${body}`;
}

async function createCoupon(event) {
  event.preventDefault();
  const plan = ["monthly", "yearly", "custom"].includes($("#coupon-plan").value) ? $("#coupon-plan").value : "monthly";
  const code = ($("#coupon-code").value.trim() || generateCouponCode(plan)).toUpperCase().replace(/[^A-Z0-9-]/g, "");
  const days = Number($("#coupon-days").value), maxRedemptions = Number($("#coupon-max").value), expiresInDays = Number($("#coupon-expiry").value);
  const campaignLabel = $("#coupon-label").value.trim();
  const button = $("#create-coupon");
  if (!code || code.length < 4) return showCouponMessage("Enter a coupon code with at least four letters or numbers.", true);
  if (!Number.isInteger(days) || days < 1 || days > 3650) return showCouponMessage("Premium access must be between 1 and 3650 days.", true);
  button.disabled = true; button.textContent = "Creating…"; $("#coupon-message").classList.add("hidden");
  try {
    const ref = doc(db, "coupons", code);
    if ((await getDoc(ref)).exists()) return showCouponMessage(`${code} already exists. Choose another code.`, true);
    const payload = { code, plan, days, active: true, redeemedCount: 0, createdAt: serverTimestamp() };
    if (Number.isInteger(maxRedemptions) && maxRedemptions > 0) payload.maxRedemptions = maxRedemptions;
    if (Number.isInteger(expiresInDays) && expiresInDays > 0) payload.expiresAt = Timestamp.fromMillis(Date.now() + expiresInDays * 86400000);
    if (campaignLabel) payload.campaignLabel = campaignLabel;
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
  [...d.wardrobe, ...d.savedOutfits, ...d.outfitHistory, ...d.outfitWear, ...d.styleChallengeSubmissions, ...d.aiResponses, ...d.apiLogs].forEach((item) => {
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
  const pageCount = Math.max(1, Math.ceil(users.length / USER_PAGE_SIZE));
  state.userPage = Math.min(Math.max(1, state.userPage), pageCount);
  const start = (state.userPage - 1) * USER_PAGE_SIZE;
  const pageUsers = users.slice(start, start + USER_PAGE_SIZE);
  $("#users-body").innerHTML = pageUsers.map((user) => {
    const subscription = user.subscription || {};
    const profile = [user.gender, user.city, user.profession].filter(Boolean).slice(0, 2).join(" · ") || "Profile incomplete";
    return `<tr><td><div class="user-cell"><span class="user-avatar">${escapeHtml(user.name.charAt(0).toUpperCase())}</span><div><b>${escapeHtml(user.name)}</b><small>${escapeHtml(user.email || "No email")}</small><small title="${escapeHtml(user.uid)}">${escapeHtml(user.uid.slice(0, 12))}…</small></div></div></td><td>${escapeHtml(profile)}</td><td><b>${escapeHtml(subscription.plan || "free")}</b><br><small>${escapeHtml(subscription.lastCoupon || "No code")}</small></td><td>${formatDate(timeOf(user.createdAt))}</td><td>${user.garmentCount}</td><td>${user.outfitCount}</td><td>${user.aiCount}</td><td>${formatRelative(user.lastActivity)}</td><td><button class="view-user" data-user-id="${escapeHtml(user.uid)}">View details</button></td></tr>`;
  }).join("");
  $("#users-empty").classList.toggle("hidden", users.length > 0);
  $("#users-page-info").textContent = users.length ? `Page ${state.userPage} of ${pageCount} · ${users.length} users` : "No users";
  $("#users-prev").disabled = state.userPage <= 1;
  $("#users-next").disabled = state.userPage >= pageCount;
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
  d.styleChallengeSubmissions.forEach((x) => events.push(eventOf("outfit", `Completed ${x.challengeTitle || "a Closet Quest"}`, x, x.createdAt)));
  d.aiResponses.forEach((x) => events.push(eventOf("ai", `Generated ${x.feature || x.type || "an AI response"}`, x, x.createdAt || x.timestamp)));
  d.apiLogs.forEach((x) => events.push(eventOf("ai", `${x.type || "API"} request ${x.status || "logged"}`, x, x.timestamp)));
  state.activity = events.filter((x) => x.time).map((x) => { const u = users.get(x.userId) || {}; return { ...x, user: u.fullName || u.displayName || u.email || x.userId || "System" }; }).sort((a, b) => b.time - a.time);
  renderActivity();
}

function eventOf(type, label, source, timestamp) {
  const metadata = [source.feature, source.model, source.provider].filter(Boolean).join(" · ");
  const failure = source.status === "failure" ? source.errorMessage || "Failed request" : "";
  return { type, label, userId: source.userId || source.uid || source.id, time: timeOf(timestamp), detail: [metadata, failure].filter(Boolean).join(" · ") };
}
function renderActivity() {
  const filter = $("#activity-filter").value;
  const from = startOfDate($("#activity-from").value), to = endOfDate($("#activity-to").value);
  const filtered = state.activity.filter((x) => (filter === "all" || x.type === filter) && (!from || x.time >= from) && (!to || x.time <= to));
  const pageCount = Math.max(1, Math.ceil(filtered.length / ACTIVITY_PAGE_SIZE));
  state.activityPage = Math.min(Math.max(1, state.activityPage), pageCount);
  const start = (state.activityPage - 1) * ACTIVITY_PAGE_SIZE;
  const items = filtered.slice(start, start + ACTIVITY_PAGE_SIZE);
  $("#activity-summary").innerHTML = `<article><b>${filtered.length}</b><span>events</span></article><article><b>${new Set(filtered.map((x) => x.userId).filter(Boolean)).size}</b><span>active users</span></article><article><b>${new Set(filtered.map((x) => dateKey(x.time))).size}</b><span>active dates</span></article>`;
  const icons = { account: "U", wardrobe: "W", outfit: "O", ai: "AI" };
  let previousDate = "";
  $("#activity-feed").innerHTML = items.length ? items.map((item) => {
    const day = dateKey(item.time);
    const heading = day !== previousDate ? `<div class="activity-day"><b>${escapeHtml(formatActivityDay(item.time))}</b><span>${filtered.filter((event) => dateKey(event.time) === day).length} events</span></div>` : "";
    previousDate = day;
    return `${heading}<article class="activity-item"><span class="activity-icon">${icons[item.type]}</span><div><b>${escapeHtml(item.label)}</b><small>${escapeHtml(item.user)}${item.detail ? ` · ${escapeHtml(item.detail)}` : ""}</small></div><time title="${escapeHtml(formatDateTime(item.time))}">${formatRelative(item.time)}</time></article>`;
  }).join("") : '<div class="table-empty">No activity is available for this filter.</div>';
  $("#activity-page-info").textContent = filtered.length ? `Page ${state.activityPage} of ${pageCount} · ${filtered.length} events` : "No events";
  $("#activity-prev").disabled = state.activityPage <= 1;
  $("#activity-next").disabled = state.activityPage >= pageCount;
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

function renderServices(logs, responses = []) {
  const providerCounts = countBy(logs, (x) => x.provider || x.type || "unknown");
  renderBars($("#provider-bars"), Object.entries(providerCounts).sort((a,b) => b[1] - a[1]));
  const featureCounts = countBy(responses, (x) => prettyLabel(x.feature || x.type || "Other AI response"));
  renderBars($("#feature-bars"), Object.entries(featureCounts).sort((a,b) => b[1] - a[1]));
  const configuredModels = [
    "primary-gemini/gemini-3.1-flash-lite",
    "groq/openai/gpt-oss-20b",
    "groq/qwen/qwen3.6-27b",
    "groq/openai/gpt-oss-120b",
    "secondary-gemini/gemini-3.1-flash-lite",
  ];
  const modelGroups = new Map(configuredModels.map((name) => [name, []]));
  logs.forEach((log) => {
    const model = log.model || "Unspecified model";
    const provider = log.provider || log.type || "AI service";
    const key = `${provider}/${model}`;
    if (!modelGroups.has(key)) modelGroups.set(key, []);
    modelGroups.get(key).push(log);
  });
  $("#model-list").innerHTML = [...modelGroups.entries()].sort((a,b) => b[1].length - a[1].length).map(([name, entries]) => {
    const success = entries.filter((x) => x.status === "success").length;
    const failures = entries.filter((x) => x.status === "failure").length;
    const measured = success + failures;
    const rate = measured ? `${Math.round(success / measured * 100)}%` : "No data";
    const latencies = entries.map((x) => Number(x.responseTime ?? x.durationMs ?? x.latencyMs)).filter(Number.isFinite);
    const average = latencies.length ? `${Math.round(latencies.reduce((sum,value)=>sum+value,0)/latencies.length)} ms` : "Not recorded";
    const features = [...new Set(entries.map((x)=>x.feature || x.operation || x.endpoint || x.type).filter(Boolean))].slice(0,3).join(", ") || "General AI";
    const latest = entries.length ? Math.max(...entries.map(activityTime)) : 0;
    return `<article class="model-performance"><header><div><b>${escapeHtml(name)}</b><span>${escapeHtml(features)}</span></div><strong>${entries.length} calls</strong></header><div><p><b>${escapeHtml(rate)}</b><span>success</span></p><p><b>${failures}</b><span>failures</span></p><p><b>${escapeHtml(average)}</b><span>average response</span></p><p><b>${escapeHtml(latest ? formatRelative(latest) : "Never")}</b><span>last used</span></p></div></article>`;
  }).join("") || '<p class="muted">No model-specific logs yet. New logs will appear here when they include a model or service name.</p>';
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
function formatActivityDay(ms) {
  const date = new Date(ms);
  const today = new Date(), yesterday = new Date(); yesterday.setDate(today.getDate() - 1);
  if (dateKey(date.getTime()) === dateKey(today.getTime())) return `Today · ${date.toLocaleDateString(undefined, { day:"numeric", month:"long", year:"numeric" })}`;
  if (dateKey(date.getTime()) === dateKey(yesterday.getTime())) return `Yesterday · ${date.toLocaleDateString(undefined, { day:"numeric", month:"long", year:"numeric" })}`;
  return date.toLocaleDateString(undefined, { weekday:"long", day:"numeric", month:"long", year:"numeric" });
}

function renderBars(target, entries) { const max = Math.max(1, ...entries.map((x) => x[1])); target.innerHTML = entries.length ? entries.map(([label, value]) => `<div class="bar-row"><span title="${escapeHtml(label)}">${escapeHtml(label)}</span><div class="bar-track"><i style="width:${Math.max(value ? 4 : 0, value / max * 100)}%"></i></div><b>${value}</b></div>`).join("") : '<p class="muted">No activity recorded yet.</p>'; }
function prettyLabel(value) { return String(value || "").replace(/[_-]+/g, " ").replace(/\b\w/g, (letter) => letter.toUpperCase()); }
function countBy(items, keyFn) { return items.reduce((acc, item) => { const key = keyFn(item); acc[key] = (acc[key] || 0) + 1; return acc; }, {}); }
function timeOf(value) { if (!value) return 0; if (typeof value.toMillis === "function") return value.toMillis(); if (typeof value.seconds === "number") return value.seconds * 1000; const parsed = new Date(value).getTime(); return Number.isFinite(parsed) ? parsed : 0; }
function activityTime(item) { return timeOf(item.timestamp || item.createdAt || item.updatedAt || item.wornAt || item.date); }
function formatDate(ms) { return ms ? new Intl.DateTimeFormat(undefined, { dateStyle: "medium" }).format(ms) : "—"; }
function formatRelative(ms) { if (!ms) return "No activity"; const diff = Date.now() - ms; if (diff < 60000) return "Just now"; if (diff < 3600000) return `${Math.floor(diff / 60000)}m ago`; if (diff < 86400000) return `${Math.floor(diff / 3600000)}h ago`; if (diff < 604800000) return `${Math.floor(diff / 86400000)}d ago`; return formatDate(ms); }
function escapeHtml(value = "") { const div = document.createElement("div"); div.textContent = String(value); return div.innerHTML; }

$("#refresh-admin").addEventListener("click", loadDashboard);
$("#admin-signout").addEventListener("click", async () => { await signOut(auth); location.href = "./"; });
$("#user-search").addEventListener("input", (event) => { state.userPage = 1; const term = event.target.value.trim().toLowerCase(); renderUsers(state.userRows.filter((u) => `${u.name} ${u.email || ""} ${u.uid}`.toLowerCase().includes(term))); });
$("#users-prev").addEventListener("click", () => { state.userPage -= 1; renderUsers(state.visibleUsers); });
$("#users-next").addEventListener("click", () => { state.userPage += 1; renderUsers(state.visibleUsers); });
$("#activity-filter").addEventListener("change", () => { state.activityPage = 1; renderActivity(); });
$("#activity-from").addEventListener("change", () => { state.activityPage = 1; renderActivity(); });
$("#activity-to").addEventListener("change", () => { state.activityPage = 1; renderActivity(); });
$("#activity-prev").addEventListener("click", () => { state.activityPage -= 1; renderActivity(); });
$("#activity-next").addEventListener("click", () => { state.activityPage += 1; renderActivity(); });
$("#clear-activity-dates").addEventListener("click", () => { $("#activity-from").value = ""; $("#activity-to").value = ""; state.activityPage = 1; renderActivity(); });
$("#users-body").addEventListener("click", (event) => { const button = event.target.closest("[data-user-id]"); if (button) openUserDetail(button.dataset.userId); });
$("#deletion-requests-body").addEventListener("click", (event) => {
  const approve = event.target.closest("[data-approve-deletion]");
  const reject = event.target.closest("[data-reject-deletion]");
  if (approve) processDeletionRequest(approve.dataset.approveDeletion, "approve", approve);
  if (reject) processDeletionRequest(reject.dataset.rejectDeletion, "reject", reject);
});
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
$("#coupon-plan").addEventListener("change", () => {
  const plan = $("#coupon-plan").value;
  if (plan === "monthly") $("#coupon-days").value = "30";
  if (plan === "yearly") $("#coupon-days").value = "365";
});
