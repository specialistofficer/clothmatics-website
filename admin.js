import { initializeApp } from "https://www.gstatic.com/firebasejs/12.15.0/firebase-app.js";
import { browserLocalPersistence, getAuth, onAuthStateChanged, setPersistence, signOut } from "https://www.gstatic.com/firebasejs/12.15.0/firebase-auth.js";
import { collection, deleteDoc, doc, getDoc, getDocs, getFirestore, serverTimestamp, setDoc, Timestamp, updateDoc } from "https://www.gstatic.com/firebasejs/12.15.0/firebase-firestore.js";
import { getFunctions, httpsCallable } from "https://www.gstatic.com/firebasejs/12.15.0/firebase-functions.js";
import { firebaseConfig } from "./config.js";

const ADMIN_EMAIL = "chiragsharma376@gmail.com";
const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);
const functions = getFunctions(app, "us-central1");
const reviewAccountDeletion = httpsCallable(functions, "reviewAccountDeletion");
const deletePushCampaign = httpsCallable(functions, "deletePushCampaign");
const estimatePushCampaignReach = httpsCallable(functions, "estimatePushCampaignReach");
const setUserSecurityControls = httpsCallable(functions, "setUserSecurityControls");
const UPLOAD_WORKER_URL = "https://clothmatics-upload-worker.chiragsharma376.workers.dev";
await setPersistence(auth, browserLocalPersistence);

const $ = (selector) => document.querySelector(selector);
const state = { users: [], activity: [], datasets: {}, userRows: [], visibleUsers: [], selectedUserId: null, userPage: 1, activityPage: 1, pushAi: { image:null, provenance:null, alternatives:[], rationale:"", imageObjectKey:"" } };
const USER_PAGE_SIZE = 20;
const ACTIVITY_PAGE_SIZE = 30;
installAdminEnhancements();

function installAdminEnhancements(){
  if (!$('.admin-sidebar nav a[href="#push-campaigns"]')) $(".admin-sidebar nav")?.insertAdjacentHTML("beforeend",'<a href="#push-campaigns">Push notifications</a>');
  $("#overview .overview-grid")?.insertAdjacentHTML("beforeend",'<article class="admin-card"><div class="card-heading"><div><span>ATTRIBUTED SHARING</span><h2>Share performance</h2></div></div><div id="share-metrics" class="health-meta"></div></article>');
  $("#admin-content")?.insertAdjacentHTML("beforeend",`<section id="push-campaigns" class="admin-section"><div class="section-title"><div><span>MOBILE ENGAGEMENT</span><h2>Push campaigns</h2><p>Draft with Gemini only when you choose. Generation never queues, schedules, sends, or changes the audience.</p></div></div><div class="push-layout"><form id="push-form" class="admin-card push-form"><div class="push-copy-grid"><label>Title <span id="push-title-count">0/55</span><input id="push-title" maxlength="55" required></label><label>Body <span id="push-body-count">0/140</span><textarea id="push-body" maxlength="140" required></textarea></label></div><label>Public HTTPS image<input id="push-image" type="url" placeholder="https://…"></label><details class="push-ai-assistant"><summary>Gemini draft assistant <span>Admin only</span></summary><div class="push-ai-body"><label>Campaign brief<textarea id="push-ai-brief" maxlength="1200" placeholder="Describe the goal, offer, tone, and any wording to avoid."></textarea></label><div class="push-ai-options"><label>Language<select id="push-ai-language"><option>English</option><option>Hinglish</option><option>Hindi</option></select></label><label class="check-row"><input id="push-ai-image" type="checkbox"> Create optional notification art</label></div><button id="push-ai-generate" type="button" class="primary-admin-button">Generate draft only</button><p id="push-ai-message" role="status"></p><div id="push-ai-results" class="push-ai-results hidden"><div id="push-ai-alternatives"></div><p id="push-ai-rationale"></p><figure id="push-ai-art" class="hidden"><img id="push-ai-preview" alt="Generated garment-only notification artwork preview"><figcaption>Preview only. The image uploads only when you explicitly test or queue this campaign.</figcaption><button id="push-ai-remove-image" type="button">Remove image</button></figure></div></div></details><div class="push-notification-preview"><span>PREVIEW</span><img id="push-live-image" class="hidden" alt="Notification artwork preview"><div><b id="push-live-title">Notification title</b><p id="push-live-body">Notification body</p></div></div><label>Channel<select id="push-channel"><option value="announcements">Announcements</option><option value="daily_outfit">Daily outfit</option><option value="wardrobe_activity">Wardrobe activity</option><option value="style_challenges">Style challenges</option><option value="subscription">Subscription</option></select></label><label>Audience<select id="push-audience"><option value="all">All eligible users</option><option value="free">Free</option><option value="subscribed">Subscribed</option><option value="inactive">Inactive</option><option value="small_wardrobe">Small wardrobe</option><option value="daily_ready">Daily ready</option><option value="specific">Specific user</option></select></label><label>Specific UID<input id="push-specific-uid" maxlength="160"></label><label>Destination<select id="push-destination"><option value="Main">Home</option><option value="OutfitCalendar">Outfit Calendar</option><option value="WeeklyClosetReport">Weekly Closet Report</option><option value="SmartPurchaseCheck">Smart Purchase Check</option><option value="StyleChallengeHub">Closet Quest</option><option value="TripPacking">Trip Packing</option></select></label><label>Festival campaign ID <span>admin campaign data only</span><input id="push-festival" maxlength="120"></label><label>Festival name<input id="push-festival-name" maxlength="80"></label><label>Festival mode ID<input id="push-festival-mode" maxlength="80"></label><label>Festival delivery<select id="push-festival-delivery"><option value="notification">Notification only — opens Home</option><option value="personal_outfit">Personal outfit on open — opens mobile AI Stylist</option></select></label><label>Schedule (your browser time)<input id="push-schedule" type="datetime-local"></label><p id="push-ist">Send now. Scheduled times are stored as an absolute timestamp.</p><label class="check-row"><input id="push-bypass" type="checkbox"> Bypass the normal frequency cap</label><div class="reach-row"><button id="push-reach" type="button">Preview eligible reach</button><div id="push-reach-result" role="status"></div></div><div class="card-actions"><button type="submit" class="primary-admin-button">Queue campaign</button><button id="push-test" type="button">Test on my device</button></div><p id="push-message" role="status"></p></form><article class="admin-card"><details open><summary><span>DELIVERY</span> Campaign history</summary><div id="push-list" class="push-list"></div></details></article></div></section>`);
  $("#push-form")?.addEventListener("submit",event=>savePushCampaign(event,false));
  $("#push-test")?.addEventListener("click",event=>savePushCampaign(event,true));
  $("#push-schedule")?.addEventListener("input",renderIstSchedule);
  $("#push-list")?.addEventListener("click",handlePushListAction);
  $("#push-ai-generate")?.addEventListener("click",generateAdminPushDraft);
  $("#push-ai-alternatives")?.addEventListener("click",applyPushAlternative);
  $("#push-ai-remove-image")?.addEventListener("click",removePushAiImage);
  $("#push-reach")?.addEventListener("click",previewPushReach);
  ["push-title","push-body","push-image"].forEach(id=>$("#"+id)?.addEventListener("input",renderPushPreview));
}

function renderShareMetrics(links,attribution){const cards=links.length,clicks=links.reduce((sum,x)=>sum+Number(x.clickCount||x.clicks||0),0),installs=attribution.filter(x=>x.activated===true||x.event==="activated_install").length,rate=cards?Math.round(clicks/cards*100):0;$("#share-metrics").innerHTML=`<p><b>${cards}</b><span>cards shared</span></p><p><b>${clicks}</b><span>clicks</span></p><p><b>${rate}%</b><span>click rate</span></p><p><b>${installs}</b><span>activated installs</span></p>`}
function renderIstSchedule(){const value=$("#push-schedule").value;if(!value)return $("#push-ist").textContent="Send now. Scheduled times are stored as an absolute timestamp.";const date=new Date(value);$("#push-ist").textContent=`Will run at ${date.toLocaleString("en-IN",{timeZone:"Asia/Kolkata",dateStyle:"medium",timeStyle:"short"})} IST (${date.toISOString()}).`}
function currentAudienceFilter(test=false){const audience=$("#push-audience").value;return{type:test?"specific":audience,inactiveDays:audience==="inactive"?30:null,garmentThreshold:audience==="small_wardrobe"?10:null,specificUids:test?[auth.currentUser.uid]:audience==="specific"?[$("#push-specific-uid").value.trim()].filter(Boolean):[]}}
function pushPayload(test=false){const scheduled=$("#push-schedule").value?new Date($("#push-schedule").value):null;const festivalId=$("#push-festival").value.trim(),delivery=$("#push-festival-delivery").value;const route=festivalId?(delivery==="personal_outfit"?"AIStylist":"Main"):$("#push-destination").value;const festival=festivalId?{campaignId:festivalId,festivalName:$("#push-festival-name").value.trim()||festivalId,modeId:$("#push-festival-mode").value.trim()||"default",delivery,eventDate:""}:null;const params=festival&&delivery==="personal_outfit"?{festivalCampaignId:festival.campaignId,festivalName:festival.festivalName,festivalModeId:festival.modeId,presetOccasion:"festival",presetMood:festival.modeId,presetPrompt:`Create a ${festival.festivalName} ${festival.modeId} outfit using only my wardrobe.`}:{};return{createdBy:auth.currentUser.uid,audienceFilter:currentAudienceFilter(test),payload:{title:$("#push-title").value.trim().slice(0,55),body:$("#push-body").value.trim().slice(0,140),imageUrl:$("#push-image").value.trim()||null,channel:$("#push-channel").value,route,params},campaignKind:festival?"festival":"general",festival,aiDraft:state.pushAi.provenance?{...state.pushAi.provenance,imageObjectKey:state.pushAi.imageObjectKey||undefined}:null,scheduledFor:scheduled&&!test?Timestamp.fromDate(scheduled):null,bypassFrequencyCap:test||$("#push-bypass").checked,status:scheduled&&!test?"scheduled":"queued",sentCount:0,failedCount:0,openedCount:0,createdAt:serverTimestamp(),updatedAt:serverTimestamp()}}
async function savePushCampaign(event,test){event.preventDefault();let data=pushPayload(test);if(!data.payload.title||!data.payload.body)return $("#push-message").textContent="Title and body are required.";if(data.payload.imageUrl&&!/^https:\/\//i.test(data.payload.imageUrl))return $("#push-message").textContent="Image must use a public HTTPS URL.";if(data.audienceFilter.type==="specific"&&!data.audienceFilter.specificUids.length)return $("#push-message").textContent="Enter the target UID.";const button=test?$("#push-test"):$("#push-form [type=submit]");button.disabled=true;try{if(state.pushAi.image){const uploaded=await uploadGeneratedPushImage(state.pushAi.image);state.pushAi.imageObjectKey=uploaded.objectKey||"";$("#push-image").value=uploaded.url;data=pushPayload(test)}const ref=doc(collection(db,"pushCampaigns"));await setDoc(ref,data);$("#push-message").textContent=test?"Test campaign queued for your registered mobile device.":"Campaign queued for Firebase Functions processing.";await loadDashboard()}catch(error){$("#push-message").textContent=`Could not queue campaign: ${error.message}`}finally{button.disabled=false}}

function renderPushPreview(){const title=$("#push-title").value,body=$("#push-body").value,image=$("#push-image").value;$("#push-title-count").textContent=`${title.length}/55`;$("#push-body-count").textContent=`${body.length}/140`;$("#push-live-title").textContent=title||"Notification title";$("#push-live-body").textContent=body||"Notification body";const target=$("#push-live-image"),generated=state.pushAi.image?`data:${state.pushAi.image.mimeType};base64,${state.pushAi.image.base64}`:"";target.src=generated||image;target.classList.toggle("hidden",!(generated||image))}
async function generateAdminPushDraft(){const brief=$("#push-ai-brief").value.trim(),button=$("#push-ai-generate"),message=$("#push-ai-message");if(brief.length<8)return message.textContent="Describe the campaign in at least 8 characters.";button.disabled=true;message.textContent="Generating a draft only — nothing will be sent or queued.";try{const token=await auth.currentUser.getIdToken(true);const response=await fetch("/api/admin/push-draft",{method:"POST",headers:{"Content-Type":"application/json",Authorization:`Bearer ${token}`},body:JSON.stringify({brief,language:$("#push-ai-language").value,includeImage:$("#push-ai-image").checked,audience:$("#push-audience").value,channel:$("#push-channel").value,destination:$("#push-destination").value,occasion:$("#push-festival-name").value.trim()})});const data=await response.json();if(!response.ok)throw new Error(data.error?.message||data.error||"Draft generation failed.");const draft=data.draft||{};state.pushAi={image:data.image?.base64?data.image:null,provenance:{provider:data.provenance?.provider||"gemini",textModel:data.provenance?.textModel||"unknown",imageModel:data.provenance?.imageModel||undefined,promptId:"push_notification",promptVersion:1,promptHash:"admin-campaign-drafts-2026-08",requestPromptHash:stableHash(brief)},alternatives:Array.isArray(draft.alternatives)?draft.alternatives.slice(0,2):[],rationale:String(draft.rationale||""),imageObjectKey:""};applyDraftMessage(draft);renderPushAiResults();message.textContent=data.imageError?`Copy generated. Artwork was unavailable: ${data.imageError}`:"Draft generated. Review and edit it before any delivery action."}catch(error){message.textContent=`Could not generate draft: ${error.message}`}finally{button.disabled=false}}
function applyDraftMessage(draft){$("#push-title").value=String(draft.title||"").slice(0,55);$("#push-body").value=String(draft.body||"").slice(0,140);renderPushPreview()}
function renderPushAiResults(){const target=$("#push-ai-results");target.classList.remove("hidden");$("#push-ai-alternatives").innerHTML=state.pushAi.alternatives.map((item,index)=>`<button type="button" data-apply-ai="${index}"><b>${escapeHtml(item.title||"")}</b><span>${escapeHtml(item.body||"")}</span><em>Apply alternative ${index+1}</em></button>`).join("");$("#push-ai-rationale").textContent=state.pushAi.rationale;const figure=$("#push-ai-art");figure.classList.toggle("hidden",!state.pushAi.image);if(state.pushAi.image)$("#push-ai-preview").src=`data:${state.pushAi.image.mimeType};base64,${state.pushAi.image.base64}`;renderPushPreview()}
function applyPushAlternative(event){const button=event.target.closest("[data-apply-ai]");if(button)applyDraftMessage(state.pushAi.alternatives[Number(button.dataset.applyAi)]||{})}
function removePushAiImage(){state.pushAi.image=null;state.pushAi.imageObjectKey="";$("#push-ai-art").classList.add("hidden");renderPushPreview()}
async function previewPushReach(){const button=$("#push-reach"),target=$("#push-reach-result");button.disabled=true;target.textContent="Estimating…";try{const result=await estimatePushCampaignReach({...currentAudienceFilter(false),channel:$("#push-channel").value,bypassFrequencyCap:$("#push-bypass").checked});const data=result.data||{};target.innerHTML=`<b>${Number(data.users||0)} users · ${Number(data.devices||0)} devices</b><span>${Number(data.preferenceExcluded||0)} preference-excluded · ${Number(data.frequencyExcluded||0)} frequency-excluded · ${Number(data.invalidDevices||0)} invalid devices</span>`}catch(error){target.textContent=`Reach unavailable: ${error.message}`}finally{button.disabled=false}}
async function uploadGeneratedPushImage(image){if(!/^image\/(png|jpeg|webp)$/i.test(image.mimeType))throw new Error("Generated artwork uses an unsupported format.");const bytes=Uint8Array.from(atob(image.base64),character=>character.charCodeAt(0)),extension=image.mimeType.split("/")[1].replace("jpeg","jpg"),filename=`${crypto.randomUUID()}.${extension}`,token=await auth.currentUser.getIdToken(true);const response=await fetch(`${UPLOAD_WORKER_URL}/upload/users/${encodeURIComponent(auth.currentUser.uid)}/notification-campaigns/${filename}`,{method:"PUT",headers:{Authorization:`Bearer ${token}`,"Content-Type":image.mimeType},body:new Blob([bytes],{type:image.mimeType})});const data=await response.json();if(!response.ok)throw new Error(data.error||"Artwork upload failed.");const url=data.imageUrl||data.url||data.publicUrl;if(!url)throw new Error("Artwork uploaded but no public URL was returned.");return{url,objectKey:data.objectKey||data.key||""}}
function stableHash(value){let hash=2166136261;for(const character of String(value)){hash^=character.charCodeAt(0);hash=Math.imul(hash,16777619)}return(hash>>>0).toString(36)}
function renderPushCampaigns(campaigns){const sorted=[...campaigns].sort((a,b)=>timeOf(b.createdAt)-timeOf(a.createdAt));$("#push-list").innerHTML=sorted.length?sorted.map(c=>`<article class="push-row"><header><div><b>${escapeHtml(c.title||c.payload?.title||"Untitled campaign")}</b><span>${escapeHtml(c.status||"queued")} · ${escapeHtml(c.channel||"announcements")}</span></div><small>${c.scheduledFor?`Scheduled ${formatDateTime(timeOf(c.scheduledFor))}`:formatDateTime(timeOf(c.createdAt))}</small></header><p>${escapeHtml(c.body||c.payload?.body||"")}</p><div class="health-meta"><p><b>${Number(c.uniqueTargetedUsers||0)}</b><span>users</span></p><p><b>${Number(c.deviceTargets||c.targetedDevices||0)}</b><span>devices</span></p><p><b>${Number(c.sent||0)}</b><span>sent</span></p><p><b>${Number(c.failed||0)}</b><span>failed</span></p><p><b>${Number(c.opened||0)}</b><span>opened</span></p></div>${c.skippedReasons?`<small>Skipped: ${escapeHtml(JSON.stringify(c.skippedReasons))}</small>`:""}${c.fcmFailureReasons?`<small>FCM failures: ${escapeHtml(JSON.stringify(c.fcmFailureReasons))}</small>`:""}${c.processingError?`<small>Error: ${escapeHtml(c.processingError)}</small>`:""}<div class="card-actions"><button data-reuse-push="${escapeHtml(c.id)}">Reuse</button><button data-delete-push="${escapeHtml(c.id)}">Delete safely</button></div></article>`).join(""):'<p class="muted">No mobile push campaigns yet.</p>'}
async function handlePushListAction(event){const reuse=event.target.closest("[data-reuse-push]"),remove=event.target.closest("[data-delete-push]");if(reuse){const c=state.datasets.pushCampaigns.find(x=>x.id===reuse.dataset.reusePush);if(!c)return;$("#push-title").value=c.payload?.title||c.title||"";$("#push-body").value=c.payload?.body||c.body||"";$("#push-image").value=c.payload?.imageUrl||c.imageUrl||"";$("#push-channel").value=c.payload?.channel||c.channel||"announcements";$("#push-audience").value=c.audienceFilter?.type||c.audience||"all";$("#push-destination").value=c.payload?.route==="AIStylist"?"Main":c.payload?.route||c.destination||"Main";$("#push-festival").value=c.festival?.campaignId||c.festivalCampaignId||"";$("#push-festival-name").value=c.festival?.festivalName||"";$("#push-festival-mode").value=c.festival?.modeId||"";$("#push-festival-delivery").value=c.festival?.delivery||"notification";$("#push-schedule").value="";$("#push-bypass").checked=false;state.pushAi={image:null,provenance:c.aiDraft||null,alternatives:[],rationale:"",imageObjectKey:c.aiDraft?.imageObjectKey||""};renderIstSchedule();renderPushPreview();$("#push-message").textContent="Campaign copied. The old schedule was cleared; review it before sending.";location.hash="push-campaigns"}if(remove){if(!confirm("Delete this campaign through the protected Firebase callable?"))return;try{await deletePushCampaign({campaignId:remove.dataset.deletePush});await loadDashboard()}catch(error){alert(`Could not delete campaign: ${error.message}`)}}}

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
    const names = ["users", "wardrobe", "savedOutfits", "outfitHistory", "outfitWear", "styleChallengeSubmissions", "aiResponses", "coupons", "accountDeletionRequests", "pushCampaigns", "festivalCampaigns", "shareLinks", "shareAttribution", "appConfig"];
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
  renderAiControls(d.appConfig?.find((entry) => entry.id === "aiControls") || {});
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
    return `<div class="coupon-row"><div><b>${escapeHtml(coupon.code || coupon.id)}</b><span>${escapeHtml(coupon.plan || "custom")} · ${coupon.days || 0} premium days${coupon.campaignLabel ? ` · ${escapeHtml(coupon.campaignLabel)}` : ""}</span></div><div><b>${used}${cap ? ` / ${cap}` : ""}</b><span>redemptions</span></div><div><b>${expires ? formatDate(expires) : "No expiry"}</b><span class="coupon-status ${status.toLowerCase().replace(" ", "-")}">${status}</span></div><div class="coupon-actions"><button type="button" data-toggle-coupon="${escapeHtml(coupon.id)}" data-coupon-active="${coupon.active !== false}">${coupon.active === false ? "Enable" : "Disable"}</button><button type="button" class="delete-coupon" data-delete-coupon="${escapeHtml(coupon.id)}">Delete</button></div></div>`;
  }).join("") : '<div class="table-empty">No coupons have been created yet.</div>';
}

async function handleCouponAction(event) {
  const toggle = event.target.closest("[data-toggle-coupon]");
  const remove = event.target.closest("[data-delete-coupon]");
  if (!toggle && !remove) return;
  const button = toggle || remove, code = toggle?.dataset.toggleCoupon || remove.dataset.deleteCoupon;
  const coupon = state.datasets.coupons.find((entry) => entry.id === code);
  if (!coupon) return;
  button.disabled = true;
  try {
    if (toggle) {
      const active = toggle.dataset.couponActive !== "true";
      await updateDoc(doc(db, "coupons", code), { active, updatedAt:serverTimestamp(), updatedBy:auth.currentUser.uid });
      showCouponMessage(`${code} is now ${active ? "enabled" : "disabled"}.`, false);
    } else {
      const used = Number(coupon.redeemedCount || 0);
      const warning = used > 0
        ? `${code} has ${used} redemption${used === 1 ? "" : "s"}. Deleting it will not revoke premium time already granted. Delete the code permanently?`
        : `Delete coupon ${code} permanently? This cannot be undone.`;
      if (!confirm(warning)) return;
      await deleteDoc(doc(db, "coupons", code));
      showCouponMessage(`Coupon ${code} was permanently deleted.`, false);
    }
    await loadDashboard();
  } catch (error) {
    showCouponMessage(`Coupon could not be updated: ${error.message}`, true);
  } finally { button.disabled = false; }
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
    return `<tr><td><div class="user-cell"><span class="user-avatar">${escapeHtml(user.name.charAt(0).toUpperCase())}</span><div><b>${escapeHtml(user.name)}</b><small>${escapeHtml(user.email || "No email")}</small><small title="${escapeHtml(user.uid)}">${escapeHtml(user.uid.slice(0, 12))}…</small></div></div></td><td>${escapeHtml(profile)}<br><span class="user-security-pill ${user.loginBlocked === true ? "blocked" : "enabled"}">${user.loginBlocked === true ? "Login blocked" : "Login enabled"}</span></td><td><b>${escapeHtml(subscription.plan || "free")}</b><br><small>${escapeHtml(subscription.lastCoupon || "No code")}</small><br><small>AI/day: ${Number.isFinite(Number(user.aiDailyLimit)) ? Number(user.aiDailyLimit) : "global"}</small></td><td>${formatDate(timeOf(user.createdAt))}</td><td>${user.garmentCount}</td><td>${user.outfitCount}</td><td>${user.aiCount}</td><td>${formatRelative(user.lastActivity)}</td><td><button class="view-user" data-user-id="${escapeHtml(user.uid)}">Manage</button></td></tr>`;
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
  return { type, label, userId: source.userId || source.uid || (type === "account" ? source.id : ""), time: timeOf(timestamp), detail: [metadata, failure].filter(Boolean).join(" · ") };
}
function renderActivity() {
  const filter = $("#activity-filter").value;
  const from = startOfDate($("#activity-from").value), to = endOfDate($("#activity-to").value);
  const filtered = state.activity.filter((x) => (filter === "all" || x.type === filter) && (!from || x.time >= from) && (!to || x.time <= to));
  const pageCount = Math.max(1, Math.ceil(filtered.length / ACTIVITY_PAGE_SIZE));
  state.activityPage = Math.min(Math.max(1, state.activityPage), pageCount);
  const start = (state.activityPage - 1) * ACTIVITY_PAGE_SIZE;
  const items = filtered.slice(start, start + ACTIVITY_PAGE_SIZE);
  const knownUserIds = new Set(state.datasets.users.map((user) => user.id));
  const activeUsers = new Set(filtered.map((item) => item.userId).filter((userId) => knownUserIds.has(userId))).size;
  $("#activity-summary").innerHTML = `<article><b>${filtered.length}</b><span>events</span></article><article><b>${activeUsers}</b><span>active registered users</span></article><article><b>${new Set(filtered.map((x) => dateKey(x.time))).size}</b><span>active dates</span></article>`;
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

function renderAiControls(controls = {}) {
  const killSwitch = controls.killSwitch === true;
  $("#global-ai-limit").value = String(Math.max(0, Math.floor(Number(controls.defaultDailyLimit ?? 5))));
  $("#global-ai-message").value = String(controls.message || "AI features are temporarily unavailable. Please try again later.");
  const status = $("#ai-control-status");
  status.textContent = killSwitch ? "AI disabled globally" : "AI enabled";
  status.className = killSwitch ? "disabled" : "enabled";
}

async function saveAiControls(killSwitch) {
  const limit = Math.floor(Number($("#global-ai-limit").value));
  const message = $("#global-ai-message").value.trim() || "AI features are temporarily unavailable. Please try again later.";
  const target = $("#ai-control-message");
  if (!Number.isFinite(limit) || limit < 0 || limit > 10000) {
    target.textContent = "The global daily limit must be between 0 and 10,000.";
    target.className = "error";
    return;
  }
  if (killSwitch && !confirm("Disable every server-enforced AI call in the ClothMatics app? Existing saved data is not affected.")) return;
  const buttons = [$('button#save-enable-ai'), $('button#kill-all-ai')];
  buttons.forEach((button) => { button.disabled = true; });
  try {
    await setDoc(doc(db, "appConfig", "aiControls"), { killSwitch, defaultDailyLimit:limit, message, updatedAt:serverTimestamp(), updatedBy:auth.currentUser.uid }, { merge:true });
    const existing = state.datasets.appConfig || [];
    const index = existing.findIndex((entry) => entry.id === "aiControls");
    const next = { id:"aiControls", killSwitch, defaultDailyLimit:limit, message };
    if (index >= 0) existing[index] = { ...existing[index], ...next }; else existing.push(next);
    renderAiControls(next);
    target.textContent = killSwitch ? "All app AI calls are now disabled by the shared server control." : `AI is enabled with a default limit of ${limit} calls per user per day.`;
    target.className = "success";
  } catch (error) {
    target.textContent = `AI controls could not be updated: ${error.message}`;
    target.className = "error";
  } finally { buttons.forEach((button) => { button.disabled = false; }); }
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
    ["Plan", subscription.plan || "free"], ["Coupon used", subscription.lastCoupon || "No coupon"], ["Premium until", formatDate(timeOf(subscription.premiumUntil))], ["Login", user.loginBlocked === true ? "Blocked" : "Enabled"], ["AI daily limit", Number.isFinite(Number(user.aiDailyLimit)) ? String(user.aiDailyLimit) : "Global default"], ["Joined", formatDate(timeOf(user.createdAt))], ["Last activity", formatDate(user.lastActivity)],
  ];
  $("#detail-profile").innerHTML = fields.map(([label, value]) => `<p><span>${escapeHtml(label)}</span><b>${escapeHtml(value || "—")}</b></p>`).join("");
  $("#detail-ai-limit").value = Number.isFinite(Number(user.aiDailyLimit)) ? String(user.aiDailyLimit) : "";
  const loginButton = $("#toggle-user-login");
  loginButton.textContent = user.loginBlocked === true ? "Unblock user login" : "Block user login";
  loginButton.classList.toggle("restore", user.loginBlocked === true);
  loginButton.disabled = user.uid === auth.currentUser?.uid;
  $("#save-user-security").disabled = user.uid === auth.currentUser?.uid;
  $("#detail-security-status").textContent = user.uid === auth.currentUser?.uid ? "The current administrator account cannot be blocked from this screen." : "";
  $("#detail-security-status").className = "";
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

async function saveSelectedUserSecurity(event, forcedLoginBlocked) {
  event?.preventDefault();
  const user = state.userRows.find((entry) => entry.uid === state.selectedUserId);
  if (!user) return;
  if (user.uid === auth.currentUser?.uid) return;
  const rawLimit = $("#detail-ai-limit").value.trim();
  const aiDailyLimit = rawLimit === "" ? null : Math.floor(Number(rawLimit));
  if (rawLimit !== "" && (!Number.isFinite(aiDailyLimit) || aiDailyLimit < 0 || aiDailyLimit > 10000)) {
    $("#detail-security-status").textContent = "Daily AI calls must be blank or between 0 and 10,000.";
    $("#detail-security-status").className = "error";
    return;
  }
  const loginBlocked = typeof forcedLoginBlocked === "boolean" ? forcedLoginBlocked : user.loginBlocked === true;
  if (loginBlocked !== (user.loginBlocked === true) && !confirm(loginBlocked
    ? `Block login for ${user.email || user.name}? Firebase sessions will be revoked immediately.`
    : `Restore login access for ${user.email || user.name}?`)) return;
  const buttons = [$("#save-user-security"), $("#toggle-user-login")];
  buttons.forEach((button) => { button.disabled = true; });
  try {
    await setUserSecurityControls({ userId:user.uid, loginBlocked, aiDailyLimit });
    user.loginBlocked = loginBlocked;
    if (aiDailyLimit === null) delete user.aiDailyLimit; else user.aiDailyLimit = aiDailyLimit;
    const datasetUser = state.datasets.users.find((entry) => entry.id === user.uid);
    if (datasetUser) { datasetUser.loginBlocked = loginBlocked; if (aiDailyLimit === null) delete datasetUser.aiDailyLimit; else datasetUser.aiDailyLimit = aiDailyLimit; }
    renderUsers(state.visibleUsers);
    openUserDetail(user.uid);
    $("#detail-security-status").textContent = loginBlocked
      ? "Login blocked and existing Firebase sessions revoked."
      : aiDailyLimit === null ? "Login enabled. This user now follows the global AI limit." : `Login enabled. Daily AI limit set to ${aiDailyLimit}.`;
    $("#detail-security-status").className = "success";
  } catch (error) {
    $("#detail-security-status").textContent = `User controls could not be saved: ${error.message}`;
    $("#detail-security-status").className = "error";
  } finally { buttons.forEach((button) => { button.disabled = false; }); }
}

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
$("#detail-security").addEventListener("submit", (event) => saveSelectedUserSecurity(event));
$("#toggle-user-login").addEventListener("click", () => { const user=state.userRows.find((entry)=>entry.uid===state.selectedUserId); if(user) saveSelectedUserSecurity(null, user.loginBlocked !== true); });
document.addEventListener("keydown", (event) => { if (event.key === "Escape") closeUserDetail(); });
document.querySelectorAll("[data-detail-tab]").forEach((button) => button.addEventListener("click", () => { document.querySelectorAll("[data-detail-tab]").forEach((x) => x.classList.toggle("active", x === button)); document.querySelectorAll(".detail-view").forEach((x) => x.classList.add("hidden")); $(`#detail-${button.dataset.detailTab}`).classList.remove("hidden"); }));
$("#coupon-form").addEventListener("submit", createCoupon);
$("#coupon-list").addEventListener("click", handleCouponAction);
$("#save-enable-ai").addEventListener("click", () => saveAiControls(false));
$("#kill-all-ai").addEventListener("click", () => saveAiControls(true));
$("#generate-coupon-code").addEventListener("click", () => { $("#coupon-code").value = generateCouponCode($("#coupon-plan").value); });
$("#coupon-plan").addEventListener("change", () => {
  const plan = $("#coupon-plan").value;
  if (plan === "monthly") $("#coupon-days").value = "30";
  if (plan === "yearly") $("#coupon-days").value = "365";
});
