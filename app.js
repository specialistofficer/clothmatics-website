import { initializeApp } from "https://www.gstatic.com/firebasejs/12.15.0/firebase-app.js";
import {
  browserLocalPersistence,
  getAuth,
  GoogleAuthProvider,
  onAuthStateChanged,
  sendEmailVerification,
  sendPasswordResetEmail,
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
  deleteField,
  doc,
  getDoc,
  getDocFromServer,
  runTransaction,
  getDocs,
  getFirestore,
  limit,
  orderBy,
  query,
  serverTimestamp,
  setDoc,
  updateDoc,
  where,
} from "https://www.gstatic.com/firebasejs/12.15.0/firebase-firestore.js";
import { firebaseConfig } from "./config.js";
import { callAiGateway, callCoreApi, callUserAi, aiCacheKey, clearUserAiCache, readAiCache, writeAiCache } from "./web-api.mjs";
import { calculateWeeklyReport, deterministicPurchaseCheck, eligibleWardrobe, embeddedNotificationOutfit, lookbookSlotFor, matchesGarmentSearch, prioritizeOutfitItems, promptStamp, safeGarmentPatch, shiftCalendarMonth, stableHash, validateGroundedOutfit, wardrobeFingerprint, localDateKey } from "./web-core.mjs";
import { createWardrobeAssistant } from "./wardrobe-assistant.js";
import { analyzeGarment, analyzeStyleCheck, checkGarmentImageBlur, cropGarmentImage, deleteGarmentUpload, extractGarmentWithOracle, isGarmentExtractionReady, normalizeGarmentImage, optimizeGarmentUpload, uploadGarmentImage, validateGarmentFile } from "./garment-upload.mjs?v=20260911-appearance";

import {activePremium,extractSingleProduction,recoverSingleProduction,extractRegionsProduction} from "./production-extraction.mjs";

import {createGhostStudio} from "./ghost-ui.mjs?v=20260912-outfit-loader-v8";
import {ghostImageForMode,ghostSavePatch,ghostDeletePatch,generateGhostFromPhoto} from "./ghost-mannequin.mjs";
import {hangerLoaderMarkup,updateHangerLoader,confirmDelete3D} from './garment-progress.mjs?v=20260912-outfit-loader-v8';
import {renderGarmentEvidence,readGarmentEvidence} from './garment-review.mjs';
import {createCompleteLookController} from './complete-look.js?v=20260912-outfit-loader-v8';

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);
await setPersistence(auth, browserLocalPersistence);

const $ = (selector) => document.querySelector(selector);
const $$ = (selector) => [...document.querySelectorAll(selector)];
const state = { user: null, profile: null, profileStyle:null, quota:null, notifications:[], wardrobe: [], outfits: [], wear: [], challenges: [], outfitHistory: [], todayOutfit: null, stylistResult:null, stylistSource:"", panel: "overview", calendarDate: new Date(), selectedDate: localDateKey(new Date()), outfitFilter: "all", lookSlots:{}, garmentImageModes:{}, garmentUpload:{}, camera:{mode:"closet",files:[],urls:[],activeIndex:0} };
const ghostStudio=createGhostStudio({
  getUser:()=>state.user,getItem:id=>state.wardrobe.find(item=>item.id===id),escapeHtml,safeUrl,
  onQuota:()=>refreshQuota().catch(()=>{}),onSaved:(item)=>{state.garmentImageModes[item.id]='3d';renderAll()},
  onRequestAdmin:requestGhostGeneration,
  onDelete:deleteGhostGeneration,
  save:async(user,item,value,{allowOverwrite=false,expectedImage,metadata}={})=>runTransaction(db,async transaction=>{
    if(state.user?.uid!==user.uid)throw new Error("Sign in again before saving.");
    const ref=doc(db,"wardrobe",item.id),snapshot=await transaction.get(ref),data=snapshot.data();
    const patch=ghostSavePatch(data,user.uid,item.image,value,serverTimestamp(),{allowOverwrite,expectedImage});
    if(metadata){
      for(const key of ['title','category','subCategory','primaryColor','secondaryColors','colorDetail','fabricTexture','material','pattern','fit','neckline','sleeveType','aiDescription','technical3DDetails','visualProfile'])if(metadata[key]!==undefined)patch[key]=metadata[key];
      if(patch.visualProfile)patch.visualProfile={...patch.visualProfile,sourceImage:item.image};
    }
    transaction.update(ref,patch);
  })
});
const completeLookController = createCompleteLookController({
  getState: () => state,
  onToast: (msg, tone) => toast(msg, tone)
});
const panelNames = { overview: "Home", camera:"Camera", wardrobe: "My wardrobe", stylist:"AI Stylist", lookbook: "My Lookbook", outfits: "My outfits", planner: "Outfit planner", trip:"Wardrobe Assistant", insights: "Wardrobe insights", quest: "Closet Quest", notifications:"Notifications", profile: "Profile & plan", purchase:"Smart Purchase Check" };
const PROFILE_SIZE_OPTIONS = {
  alpha: ["XS", "S", "M", "L", "XL", "XXL"],
  bottom: ["XS", "S", "M", "L", "XL", "XXL", "28", "30", "32", "34", "36", "38", "40"],
  shoes: ["4", "5", "6", "7", "8", "9", "10", "11", "12"],
};
const PROFILE_BODY_TYPES = {
  Male: [
    ["Trapezoid", "Shoulders slightly wider than waist"],
    ["Inverted Triangle", "Broad shoulders and narrower waist"],
    ["Rectangle", "Shoulders, waist and hips are similar"],
    ["Triangle", "Waist or hips wider than shoulders"],
    ["Oval", "Fuller around the midsection"],
  ],
  Female: [
    ["Hourglass", "Shoulders and hips balanced, defined waist"],
    ["Pear", "Hips wider than shoulders"],
    ["Apple", "Fuller around the midsection"],
    ["Rectangle", "Shoulders, waist and hips are similar"],
    ["Inverted Triangle", "Shoulders wider than hips"],
  ],
  Other: [
    ["Hourglass", "Balanced shoulders and hips, defined waist"],
    ["Triangle", "Lower body wider than shoulders"],
    ["Inverted Triangle", "Shoulders wider than lower body"],
    ["Rectangle", "Shoulders, waist and hips are similar"],
    ["Oval", "Fuller around the midsection"],
  ],
};
const GARMENT_CATEGORIES = ["Top", "Bottom", "One-piece", "Outerwear", "Swimwear", "Innerwear", "Footwear", "Accessory", "Traditional set"];

function selectOptions(values, placeholder, shoeLabels = false) {
  return `<option value="">${escapeHtml(placeholder)}</option>${values.map((value) => `<option value="${escapeHtml(value)}">${shoeLabels ? `UK / India ${escapeHtml(value)}` : escapeHtml(value)}</option>`).join("")}`;
}

installParityUi();
const wardrobeAssistant = createWardrobeAssistant({
  root: $("#panel-trip"),
  getUser: () => state.user,
  getWardrobe: () => state.wardrobe,
  getProfile: () => state.profile,
  getQuota: () => state.quota,
  refreshQuota,
});

function installParityUi() {
  const nav = $(".app-sidebar nav");
  const wardrobeNav=nav?.querySelector('[data-panel="wardrobe"]');
  if (wardrobeNav && !nav.querySelector('[data-panel="camera"]')) wardrobeNav.insertAdjacentHTML("beforebegin", '<button data-panel="camera"><svg class="nav-icon" aria-hidden="true"><use href="#icon-camera"></use></svg><span>Camera</span></button>');
  if (wardrobeNav && !nav.querySelector('[data-panel="stylist"]')) wardrobeNav.insertAdjacentHTML("afterend", '<button data-panel="stylist"><svg class="nav-icon" aria-hidden="true"><use href="#icon-sparkles"></use></svg><span>AI Stylist</span></button>');
  const plannerNav=nav?.querySelector('[data-panel="planner"]');
  if (plannerNav && !nav.querySelector('[data-panel="trip"]')) plannerNav.insertAdjacentHTML("afterend", '<button data-panel="trip"><svg class="nav-icon" aria-hidden="true"><use href="#icon-bag"></use></svg><span>Wardrobe Assistant</span></button>');
  const profileNav=nav?.querySelector('[data-panel="profile"]');
  if (profileNav && !nav.querySelector('[data-panel="notifications"]')) profileNav.insertAdjacentHTML("beforebegin", '<button data-panel="notifications"><svg class="nav-icon" aria-hidden="true"><use href="#icon-bell"></use></svg><span>Notifications <em id="nav-unread" class="nav-count hidden">0</em></span></button>');
  const appContent = $(".app-content");
  if(!$("#panel-camera")) appContent?.insertAdjacentHTML("beforeend", `
    <div id="panel-camera" class="panel hidden">
      <div class="camera-page-heading"><div><span class="app-kicker">CLOTHMATICS PHOTO</span><h3>Add clothes or check your complete look</h3><p>Choose up to five clear photos for Auto Extract, or one photo for Single Garment and Style Check.</p></div></div>
      <div class="camera-mode-grid" role="tablist" aria-label="Camera mode">
        <button class="camera-mode-card active" type="button" data-camera-mode="closet" role="tab" aria-selected="true"><span><svg class="nav-icon" aria-hidden="true"><use href="#icon-wardrobe"></use></svg></span><b>Add to Closet</b><small>Auto Extract an outfit or prepare one garment</small><em>✓</em></button>
        <button class="camera-mode-card" type="button" data-camera-mode="style" role="tab" aria-selected="false"><span><svg class="nav-icon" aria-hidden="true"><use href="#icon-sparkles"></use></svg></span><b>Style Check</b><small>Score your complete outfit and receive recommendations</small><em>✓</em></button>
      </div>
      <div id="camera-mode-guide" class="camera-mode-guide"><svg class="nav-icon" aria-hidden="true"><use href="#icon-info"></use></svg><p><b>Auto Extract</b> is for selfies and worn outfits. <b>Single Garment</b> is for one item on a flat surface or hanger.</p></div>
      <div class="camera-workspace">
        <section class="camera-capture-card">
          <div id="camera-preview" class="camera-preview"><div class="camera-placeholder"><span><svg class="nav-icon" aria-hidden="true"><use href="#icon-image"></use></svg></span><b id="camera-placeholder-title">Add up to five photos</b><small>Keep every garment fully visible</small></div></div>
          <div id="camera-thumbnail-strip" class="camera-thumbnail-strip hidden" aria-label="Selected photos"></div>
          <div class="camera-source-actions"><label class="button button-primary camera-gallery-button" for="camera-gallery-input"><svg class="nav-icon" aria-hidden="true"><use href="#icon-image"></use></svg><span id="camera-gallery-label">Choose photos from gallery</span><input id="camera-gallery-input" type="file" accept="image/jpeg,image/png,image/webp" multiple></label></div>
          <button id="camera-remove-photo" class="camera-remove-photo hidden" type="button">Clear selected photos</button>
          <p id="camera-message" class="form-message" role="status"></p>
          <div id="camera-extract-choices" class="camera-extract-choices">
            <button id="camera-auto-extract" class="camera-choice camera-choice-primary" type="button" disabled><svg class="nav-icon" aria-hidden="true"><use href="#icon-frame"></use></svg><span><b>Auto Extract</b><small>Selfies and worn outfits · up to 5 photos</small></span></button>
            <button id="camera-single-garment" class="camera-choice" type="button" disabled><svg class="nav-icon" aria-hidden="true"><use href="#icon-wardrobe"></use></svg><span><b>Single Garment</b><small>Flat surface or hanger · 1 photo</small></span></button>
          </div><label id="camera-generate-3d-option" class="camera-generate-3d-option"><input id="camera-generate-3d" type="checkbox"> Generate 3D ghost-mannequin output <span>Generate 3D while processing. If unavailable, prepare a basic wardrobe image instead.</span></label>
          <button id="camera-action" class="button button-primary camera-action hidden" type="button" disabled><svg class="nav-icon" aria-hidden="true"><use href="#icon-sparkles"></use></svg><span>Analyze outfit</span></button>
        </section>
        <aside id="camera-tips" class="camera-tips"><span class="app-kicker">PHOTO CHECKLIST</span><h4>Help the result look its best</h4><p><svg class="nav-icon" aria-hidden="true"><use href="#icon-sun"></use></svg><span><b>Bright, even light</b><small>Avoid strong shadows and backlight.</small></span></p><p><svg class="nav-icon" aria-hidden="true"><use href="#icon-frame"></use></svg><span><b>Complete framing</b><small>Keep every garment edge inside the photo.</small></span></p><p><svg class="nav-icon" aria-hidden="true"><use href="#icon-image"></use></svg><span><b>Simple background</b><small>Plain surroundings improve extraction quality.</small></span></p><div class="upload-privacy-note"><b>Shared quota</b><span>Each fresh analysis uses one call from the allowance shown in Profile &amp; plan.</span></div></aside>
      </div>
      <section id="style-check-result" class="style-check-result hidden" aria-live="polite"></section>
    </div>`);
  if(!$("#panel-stylist")) appContent?.insertAdjacentHTML("beforeend", `
    <div id="panel-stylist" class="panel hidden"><div class="section-intro"><span>SHARED DAILY ALLOWANCE</span><h3>AI Stylist</h3><p>Create a complete outfit from clean, available pieces already in your wardrobe.</p></div><div class="ai-workspace"><form id="stylist-form" class="ai-form"><label>Occasion<select id="stylist-occasion"><option>Casual</option><option>Office</option><option>Party</option><option>Wedding</option><option>Date</option><option>Travel</option><option>Brunch</option><option>Formal</option></select></label><label>Mood<select id="stylist-mood"><option>Confident</option><option>Relaxed</option><option>Elegant</option><option>Playful</option><option>Minimal</option></select></label><label class="full">Anything specific? <span>optional</span><textarea id="stylist-request" maxlength="300" placeholder="For example: comfortable for an evening dinner"></textarea></label><button class="button button-primary full" type="submit">Generate my outfit</button><p id="stylist-message" class="form-message full" role="status"></p></form><div id="stylist-result" class="ai-result">${emptyBlock("Ready when you are","Choose an occasion and mood. Only eligible wardrobe metadata is sent for styling.")}</div></div></div>
    <div id="panel-trip" class="panel hidden"></div>
    <div id="panel-notifications" class="panel hidden"><div class="section-intro panel-heading-row"><div><span>INBOX</span><h3>Your notifications</h3><p>Messages sent to your ClothMatics account appear here.</p></div><button id="mark-all-notifications" class="mark-all-notifications" type="button">Mark all as read</button></div><div id="notification-list" class="notification-list"></div></div>`);
  if(!$("#panel-purchase")) appContent?.insertAdjacentHTML("beforeend",'<div id="panel-purchase" class="panel hidden"></div>');
  const purchasePanel=$("#panel-purchase");
  if(purchasePanel) purchasePanel.innerHTML=`<div class="section-intro purchase-intro"><span>BEFORE YOU BUY</span><h3>Smart Purchase Check</h3><p>Describe a store item and compare it with the clothes you already own. To analyze a clothing photo, open Camera → Style Check.</p></div><div class="purchase-layout"><form id="purchase-form" class="purchase-form"><div class="purchase-form-head"><div class="purchase-heading-icon" aria-hidden="true"><svg class="nav-icon"><use href="#icon-bag"></use></svg></div><div><span>SMART PURCHASE</span><h4>Describe the store item</h4><small>Use the product details you can see on the store page.</small></div></div><div class="purchase-fields"><label class="full-field">Product URL <span>optional</span><input id="purchase-url" type="url" maxlength="500" placeholder="https://store.example/item"></label><label class="full-field">Start from a similar closet item <span>optional</span><select id="purchase-owned"><option value="">Choose an item</option></select></label><div id="purchase-owned-preview" class="purchase-owned-preview hidden" aria-live="polite"></div><label>Item name<input id="purchase-title" maxlength="100" placeholder="e.g. Navy linen shirt" required></label><label>Category<select id="purchase-category" required>${selectOptions(GARMENT_CATEGORIES,"Select category")}</select></label><label>Color<input id="purchase-color" maxlength="40" list="purchase-colors" placeholder="e.g. Navy blue"><datalist id="purchase-colors"><option value="Black"><option value="White"><option value="Blue"><option value="Navy"><option value="Grey"><option value="Brown"><option value="Beige"><option value="Green"><option value="Red"><option value="Pink"><option value="Purple"></datalist></label><label>Pattern<input id="purchase-pattern" maxlength="40" list="purchase-patterns" placeholder="e.g. Solid"><datalist id="purchase-patterns"><option value="Solid"><option value="Striped"><option value="Checked"><option value="Printed"><option value="Floral"><option value="Textured"></datalist></label><label>Material<input id="purchase-material" maxlength="50" list="purchase-materials" placeholder="e.g. Cotton"><datalist id="purchase-materials"><option value="Cotton"><option value="Linen"><option value="Denim"><option value="Wool"><option value="Silk"><option value="Polyester"><option value="Leather"></datalist></label><label>Store price (₹)<input id="purchase-price" type="number" min="0" step="1" inputmode="numeric" placeholder="Optional"></label></div><button class="button button-primary purchase-submit" type="submit"><svg class="nav-icon" aria-hidden="true"><use href="#icon-bag"></use></svg>Compare with my wardrobe</button></form><div id="purchase-result" class="purchase-result"><div class="result-placeholder purchase-placeholder"><div class="purchase-empty-icon" aria-hidden="true"><svg class="nav-icon"><use href="#icon-bag"></use></svg></div><h4>See if it earns a place in your closet</h4><p>ClothMatics will look for duplicates and build combinations using your actual wardrobe.</p><ol class="purchase-guide"><li><b>Describe</b><span>Add the item name and category.</span></li><li><b>Compare</b><span>Check overlap with pieces you own.</span></li><li><b>Decide</b><span>Review useful outfit combinations.</span></li></ol></div></div></div>`;
  if (!$("#notification-bell")) $(".app-topbar .user-chip")?.insertAdjacentHTML("beforebegin",'<button id="notification-bell" class="notification-bell" type="button" aria-label="Open notifications"><svg class="nav-icon" aria-hidden="true"><use href="#icon-bell"></use></svg><span id="bell-unread" class="hidden">0</span></button>');
  if (!$("#quota-chip")) $(".app-topbar .user-chip")?.insertAdjacentHTML("beforebegin",'<button id="quota-chip" class="quota-chip" type="button" data-go-panel="profile" aria-label="Open plan and AI allowance"><b aria-hidden="true">AI</b><span>Loading…</span></button>');
  $("#panel-overview .companion-stats")?.insertAdjacentHTML("beforebegin",'<section id="today-pick" class="today-pick"></section><div class="quick-actions"><button data-go-panel="camera"><svg class="nav-icon" aria-hidden="true"><use href="#icon-camera"></use></svg><span><b>Camera</b><small>Add garment or Style Check</small></span></button><button data-go-panel="stylist"><svg class="nav-icon" aria-hidden="true"><use href="#icon-sparkles"></use></svg><span><b>AI outfit</b><small>Style clean pieces</small></span></button><button data-go-panel="planner"><svg class="nav-icon" aria-hidden="true"><use href="#icon-calendar"></use></svg><span><b>Planner</b><small>Choose a date</small></span></button><button data-go-panel="purchase"><svg class="nav-icon" aria-hidden="true"><use href="#icon-bag"></use></svg><span><b>Smart Purchase</b><small>Compare before buying</small></span></button></div>');
  $("#panel-profile .section-intro p")?.replaceWith(Object.assign(document.createElement("p"),{textContent:"Keep your personal details, shopping sizes, style preferences and plan status in sync with the mobile app."}));
  $("#panel-profile .profile-layout")?.insertAdjacentHTML("afterend",`<div class="profile-manage-grid"><form id="profile-form" class="profile-edit-card"><div class="profile-edit-heading"><div class="profile-heading-icon" aria-hidden="true"><svg class="nav-icon"><use href="#icon-user"></use></svg></div><div><span class="app-kicker">PERSONAL DETAILS</span><h3>Edit profile</h3><p>These details stay in sync with your ClothMatics mobile account.</p></div></div><fieldset class="profile-fieldset"><legend>About you</legend><div class="profile-form-grid"><label>Full name<input id="profile-name" maxlength="100" autocomplete="name"></label><label>Gender<select id="profile-gender"><option value="">Select gender</option><option>Male</option><option>Female</option><option>Other</option></select></label><label>Date of birth<input id="profile-dob" type="date"></label><label>Profession<input id="profile-profession" maxlength="100" autocomplete="organization-title"></label><label>Height (cm)<input id="profile-height" type="number" min="0" max="260" inputmode="decimal"></label><label>Weight (kg)<input id="profile-weight" type="number" min="0" max="400" inputmode="decimal"></label><label>City<input id="profile-city" maxlength="100" autocomplete="address-level2"></label><label><span class="field-label-row">Body type <button class="info-button" type="button" title="Choose the same self-reported body type used by the mobile profile." aria-label="About body type choices">i</button></span><select id="profile-body-type" aria-describedby="body-type-help"><option value="">Select gender first</option></select><small id="body-type-help">The choices match the mobile profile.</small></label></div></fieldset><fieldset class="profile-fieldset size-fieldset"><legend>Shopping sizes</legend><p>Use the same optional sizes available in the app. They help filter unsuitable product matches.</p><div class="profile-form-grid"><label>Top size<select id="size-top">${selectOptions(PROFILE_SIZE_OPTIONS.alpha,"Select top size")}</select></label><label>Bottom size<select id="size-bottom">${selectOptions(PROFILE_SIZE_OPTIONS.bottom,"Select bottom size")}</select></label><label id="profile-dress-field">Dress size<select id="size-dress">${selectOptions(PROFILE_SIZE_OPTIONS.alpha,"Select dress size")}</select></label><label>Shoe size<select id="size-shoes">${selectOptions(PROFILE_SIZE_OPTIONS.shoes,"Select UK / India size",true)}</select></label></div></fieldset><div class="profile-save-row"><button class="button button-primary" type="submit">Save profile</button><p id="profile-message" role="status"></p></div></form><section class="plan-card-web"><div class="plan-card-heading"><div class="plan-ai-mark" aria-hidden="true">AI</div><div class="section-intro"><span>PLAN &amp; AI</span><h3>Your allowance</h3></div></div><div id="quota-detail"></div><form id="coupon-redeem-form" class="coupon-redeem-form"><label>Coupon code<input id="coupon-redeem-code" maxlength="64" autocomplete="off" placeholder="Enter code"></label><button type="submit">Apply coupon</button><p id="coupon-redeem-message" role="status"></p></form><div class="account-actions"><button id="send-verification" type="button">Send verification email</button><button id="send-password-reset" type="button">Send password reset</button><a href="https://play.google.com/store/account/subscriptions" target="_blank" rel="noopener">Manage Google Play plan</a></div></section></div>`);
  $("#wardrobe-filter")?.insertAdjacentHTML("beforeend",'<option value="lookbook">Lookbook</option><option value="laundry">Laundry</option><option value="hidden">Hidden from AI</option>');
  if(!$("#open-camera-from-wardrobe")) $("#panel-wardrobe .panel-tools")?.insertAdjacentHTML("beforeend",'<button id="open-camera-from-wardrobe" class="button button-primary" type="button" data-go-panel="camera"><svg class="nav-icon" aria-hidden="true"><use href="#icon-camera"></use></svg>Add garment</button>');
  const wardrobeEmpty=$("#wardrobe-empty span");if(wardrobeEmpty)wardrobeEmpty.textContent="Add a clear photo of one garment to start your wardrobe.";
  $("#panel-planner .month-controls")?.insertAdjacentHTML("afterbegin", '<button id="month-today" type="button">Today</button>');
  $("#panel-planner .section-intro p")?.insertAdjacentHTML("afterend", '<p class="month-summary"><b id="month-plan-count">0</b> planned days in this month</p>');
  $("#selected-date-label")?.insertAdjacentHTML("afterend", '<div class="plan-actions"><select id="plan-outfit-select" aria-label="Choose a saved outfit"><option value="">Choose a saved outfit</option></select><button id="plan-existing">Plan outfit</button></div>');
  if(!$("#open-look-builder")) $("#panel-lookbook .section-intro")?.insertAdjacentHTML("beforeend", '<button id="open-look-builder" class="button button-primary">Create a look</button>');
  if(!$("#lookbook-search")) $("#panel-lookbook .section-intro")?.insertAdjacentHTML("afterend", '<div class="panel-tools"><div class="search"><span>⌕</span><input id="lookbook-search" placeholder="Search Lookbook pieces"></div></div>');
  if(!$("#weekly-report")) $("#panel-insights .section-intro")?.insertAdjacentHTML("beforebegin", '<div class="section-intro"><span>THIS WEEK</span><h3>Weekly Closet Report</h3><p>Calculated from your last seven local calendar days.</p></div><div id="weekly-report" class="weekly-report"></div>');
  document.body.insertAdjacentHTML("beforeend", `<dialog id="look-builder-dialog" class="garment-dialog look-builder-dialog"><button id="close-look-builder" class="dialog-close" aria-label="Close look builder">×</button><span class="app-kicker">LOOKBOOK BUILDER</span><h2>Create from your closet</h2><div class="builder-fields"><label>Look name<input id="look-name" maxlength="80" placeholder="My weekend look"></label><label>Occasion<input id="look-occasion" maxlength="50" placeholder="Casual"></label></div><div id="look-slots" class="look-slots"></div><label class="builder-search">Find a garment<input id="look-picker-search" type="search" placeholder="Try tee, sneakers or watch"></label><div id="look-picker" class="look-picker"></div><div class="dialog-actions"><button id="cancel-look-builder">Cancel</button><button id="save-look" class="button button-primary">Save Lookbook outfit</button></div></dialog><dialog id="confirm-dialog" class="confirm-dialog"><span class="app-kicker">PLEASE CONFIRM</span><h2 id="confirm-title">Confirm action</h2><p id="confirm-copy"></p><div class="dialog-actions"><button id="confirm-cancel" type="button">Cancel</button><button id="confirm-accept" class="danger-button" type="button">Confirm</button></div></dialog>`);
  document.body.insertAdjacentHTML("beforeend", `<dialog id="garment-upload-dialog" class="garment-dialog garment-upload-dialog"><button id="close-garment-upload" class="dialog-close" aria-label="Close garment upload">×</button><div class="upload-dialog-heading"><span class="app-kicker">ADD TO WARDROBE</span><h2>Single Garment</h2><p>Choose one clear item photo, then review its prepared image and details before saving.</p></div><form id="garment-upload-form"><label id="garment-dropzone" class="garment-dropzone" for="garment-photo"><svg class="nav-icon" aria-hidden="true"><use href="#icon-plus"></use></svg><b>Choose a garment photo</b><span>One complete item · JPEG, PNG or WebP · up to 6 MB</span><input id="garment-photo" type="file" accept="image/jpeg,image/png,image/webp" required></label><div id="garment-source-preview" class="garment-source-preview hidden"></div><div class="upload-privacy-note"><b>Photo preparation</b><span>Single Garment is available on your free plan. AI scans use the same daily allowance as the mobile app.</span></div><ol id="garment-process-steps" class="garment-process-steps"><li data-upload-step="gemini">Scan photo</li><li data-upload-step="oracle">Single Garment</li><li data-upload-step="review">Review &amp; save</li></ol><p id="garment-upload-message" class="form-message" role="status"></p><button id="process-garment" class="button button-primary" type="submit" disabled>Single Garment</button></form><section id="auto-extract-results" class="auto-extract-results hidden" aria-live="polite"></section><form id="garment-review-form" class="garment-review-form hidden"><div class="garment-review-preview"><span id="garment-review-count" class="garment-review-count hidden"></span><img id="garment-cutout-preview" alt="Prepared garment preview"></div><div class="garment-review-fields"><label class="full">Name<input id="upload-title" maxlength="100" required></label><label>Category<input id="upload-category" maxlength="60" list="upload-categories" required><datalist id="upload-categories">${GARMENT_CATEGORIES.map((value)=>`<option value="${value}">`).join("")}<option value="Saree"><option value="Kurta"><option value="Lehenga"><option value="Shoes"><option value="Bag"></datalist></label><label>Subcategory<input id="upload-subcategory" maxlength="60"></label><label>Primary color<input id="upload-color" maxlength="40"></label><label>Brand<input id="upload-brand" maxlength="80"></label><label>Pattern<input id="upload-pattern" maxlength="40"></label><label>Material<input id="upload-material" maxlength="60"></label><label>Fit<input id="upload-fit" maxlength="40"></label><label>Styling use<select id="upload-styling-usage"><option value="standard">Standard</option><option value="wear_as_top">Wear as a top</option><option value="swimwear">Swimwear</option><option value="activewear">Activewear</option><option value="private_innerwear">Private innerwear</option></select></label><label class="full">Occasions <span>comma separated</span><input id="upload-occasions" maxlength="240" placeholder="Everyday, Office, Travel"></label><label class="full">Activities <span>comma separated</span><input id="upload-activities" maxlength="180" placeholder="Extended walking, Travel"></label><label class="check-label full"><input id="upload-hidden-ai" type="checkbox"> Hide this item from styling</label><p id="garment-save-message" class="form-message full" role="status"></p><div class="dialog-actions full"><button id="retry-garment" type="button">Skip this item</button><button id="toggle-garment-image" type="button">Use original photo</button><button id="save-uploaded-garment" class="button button-primary" type="submit">Save &amp; continue</button></div></div></form></dialog>`);
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
  const previousUid=state.user?.uid;
  state.user = user;
  if (!user) {
    if(previousUid)clearUserAiCache(previousUid);
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

function startDashboardLoader() {
  const steps = [
    { img: "./assets/loader/outfit-build-step-1.png", msg: "Connecting to your wardrobe…" },
    { img: "./assets/loader/outfit-build-step-2.png", msg: "Retrieving garments & outfits…" },
    { img: "./assets/loader/outfit-build-step-3.png", msg: "Organizing closet & analytics…" },
    { img: "./assets/loader/outfit-build-step-4.png", msg: "Wardrobe ready!" }
  ];
  let cur = 0;
  const imgEl = $("#dashboard-loader-img");
  const msgEl = $("#dashboard-loader-msg");

  const applyStep = (idx) => {
    const s = steps[idx];
    if (!s || !imgEl) return;
    if (!imgEl.src.endsWith(s.img.replace(/^\.\//, ""))) {
      imgEl.src = s.img;
      imgEl.style.animation = "none";
      void imgEl.offsetHeight;
      imgEl.style.animation = "outfit-morph-enter 0.5s cubic-bezier(0.34, 1.56, 0.64, 1)";
    }
    if (msgEl) msgEl.textContent = s.msg;
  };

  applyStep(0);
  const interval = setInterval(() => {
    cur = (cur + 1) % steps.length;
    applyStep(cur);
  }, 600);

  return {
    finish() {
      clearInterval(interval);
      applyStep(3);
    },
    stop() {
      clearInterval(interval);
    }
  };
}

async function loadDashboard(user) {
  const loader = startDashboardLoader();
  try {
    const profileSnap=await getDoc(doc(db,"users",user.uid));
    state.profile = profileSnap.exists() ? profileSnap.data() : {};
    if (!user.emailVerified) throw new Error("Verify your email before opening your web wardrobe.");
    if (state.profile.loginBlocked === true || state.profile.accountBlocked === true) { await signOut(auth); throw new Error("This account is currently restricted."); }
    const [wardrobeSnap, outfitsSnap, wearSnap, challengeSnap, historySnap, todaySnap, styleSnap, notificationSnap, quota] = await Promise.all([
      getDocs(query(collection(db, "wardrobe"), where("userId", "==", user.uid))),
      getDocs(query(collection(db, "savedOutfits"), where("userId", "==", user.uid))),
      getDocs(query(collection(db, "outfitWear"), where("userId", "==", user.uid))),
      getDocs(query(collection(db, "styleChallengeSubmissions"), where("userId", "==", user.uid))),
      getDocs(query(collection(db, "outfitHistory"), where("userId", "==", user.uid))),
      getDoc(doc(db, "users", user.uid, "meta", "todayOutfit")),
      getDoc(doc(db,"users",user.uid,"profile","style")).catch(()=>null),
      getDocs(query(collection(db,"users",user.uid,"notifications"),orderBy("receivedAt","desc"),limit(100))).catch((error)=>{console.warn("[notifications] inbox unavailable",error?.code||error);return{docs:[]}}),
      callCoreApi(user,"/v1/ai/quota/status",{}, {method:"GET"}).catch((error)=>({error:error.message})),
    ]);
    state.wardrobe = wardrobeSnap.docs.map((entry) => ({ id: entry.id, ...entry.data() })).sort(byCreatedAt);
    state.outfits = outfitsSnap.docs.map((entry) => ({ id: entry.id, ...entry.data() })).sort(byCreatedAt);
    state.wear = wearSnap.docs.map((entry) => ({ id: entry.id, ...entry.data() })).sort((a,b) => String(b.wearDate || "").localeCompare(String(a.wearDate || "")));
    state.challenges = challengeSnap.docs.map((entry) => ({ id: entry.id, ...entry.data() })).sort(byCreatedAt);
    state.outfitHistory = historySnap.docs.map((entry) => ({ id: entry.id, ...entry.data() })).sort(byCreatedAt);
    state.todayOutfit = todaySnap.exists() ? todaySnap.data() : null;
    state.profileStyle=styleSnap?.exists?.()?styleSnap.data():null;
    const cutoff=Date.now()-7*86400000;
    state.notifications=notificationSnap.docs.map((entry)=>({id:entry.id,...entry.data()})).filter((entry)=>timeValue(entry.receivedAt||entry.createdAt||entry.timestamp)>=cutoff).sort((a,b)=>timeValue(b.receivedAt||b.createdAt||b.timestamp)-timeValue(a.receivedAt||a.createdAt||a.timestamp));
    state.quota=quota?.error?null:quota;
    renderAccount(user);
    renderAll();
    wardrobeAssistant.onUserLoaded();
    openPanel(new URLSearchParams(location.search).get("panel")==="camera"?"camera":"overview");
    loader.finish();
    await new Promise((resolve) => setTimeout(resolve, 200));
  } catch (error) {
    console.error(error);
    toast("Could not load your wardrobe. Please check your connection.");
  } finally {
    loader.stop();
    $("#dashboard-loading").classList.add("hidden");
  }
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
  renderTodayPick();
  renderNotifications();
  renderQuota();
  renderProfileForm();
  renderWeeklyReport();
  renderPlannerOptions();
  renderPurchaseOwnedOptions();
}

function renderGarments(target, items) {
  target.innerHTML = items.map((item) => {
    const has3d=Boolean(item.ghostMannequin?.image),mode=has3d&&state.garmentImageModes[item.id]==='3d'?'3d':'normal';
    return `
    <article class="closet-item" data-item-id="${escapeHtml(item.id)}" tabindex="0">
      ${item.favorite ? '<span class="item-favorite">♥</span>' : ""}
      <div class="item-image"><img src="${safeUrl(ghostImageForMode(item,mode))}" alt="${escapeHtml(`${item.title||'Wardrobe item'} ${mode==='3d'?'3D':'normal'} view`)}" loading="lazy" /></div>
      ${has3d?garmentViewToggle(item.id,mode,'card'):`<button type="button" class="ghost-card-button" data-ghost-item="${escapeHtml(item.id)}">3D Ghost Mannequin</button>`}
      <div class="item-info"><b title="${escapeHtml(item.title || "Untitled")}">${escapeHtml(item.title || "Untitled")}</b><small>${escapeHtml(item.category || "Clothing")} · ${escapeHtml(item.primaryColor || "")}</small></div>
    </article>
  `}).join("");
}

function garmentViewToggle(id,mode,scope){return `<div class="garment-view-toggle" role="group" aria-label="Choose garment image"><button type="button" data-garment-view="normal" data-garment-view-id="${escapeHtml(id)}" data-garment-view-scope="${scope}" aria-pressed="${mode==='normal'}" class="${mode==='normal'?'active':''}">Normal</button><button type="button" data-garment-view="3d" data-garment-view-id="${escapeHtml(id)}" data-garment-view-scope="${scope}" aria-pressed="${mode==='3d'}" class="${mode==='3d'?'active':''}">3D</button></div>`}

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
  $("#outfit-library").innerHTML = filtered.length ? filtered.map((look) => outfitCard(look)).join("") : emptyBlock("No outfits in this category", "Create a Lookbook combination or generate an AI outfit here.");
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
  }).join("") : emptyBlock("Nothing planned", "Choose a saved outfit above to plan this date.");
  enhanceSelectedDateCards(records);
}

function renderInsights() {
  const worn = state.wear.filter((x)=>x.status==="worn");
  const priced = state.wardrobe.filter((x)=>Number(x.purchasePrice)>0).sort((a,b)=>(a.purchasePrice/Math.max(a.timesWorn||0,1))-(b.purchasePrice/Math.max(b.timesWorn||0,1)));
  const tracked = priced.reduce((sum,x)=>sum+Number(x.purchasePrice||0),0), wears = state.wardrobe.reduce((sum,x)=>sum+Number(x.timesWorn||0),0);
  $("#insight-summary").innerHTML = metricCards([[formatCurrency(tracked),"Tracked value"],[wears,"Garment wears"],[worn.length,"Outfits worn"],[state.wear.filter((x)=>x.status==="planned").length,"Planned looks"]]);
  $("#cpw-list").innerHTML = priced.length ? priced.map((item)=>`<button class="cpw-row" data-item-id="${escapeHtml(item.id)}"><img src="${safeUrl(item.image)}" alt=""><div><b>${escapeHtml(item.title)}</b><span>${formatCurrency(item.purchasePrice)} · ${Number(item.timesWorn||0)} wears</span></div><strong>${item.timesWorn ? formatCurrency(item.purchasePrice/item.timesWorn) : "—"}<small>per wear</small></strong></button>`).join("") : emptyBlock("No purchase prices yet", "Add prices in the mobile app to unlock cost-per-wear insights.");
  $("#wear-history").innerHTML = state.wear.length ? state.wear.slice(0,30).map((entry)=>`<article><span class="${entry.status==="worn"?"worn":""}">${escapeHtml(entry.status || "planned")}</span><div><b>${escapeHtml(entry.outfit?.title || entry.occasion || "Outfit")}</b><small>${formatIsoDate(entry.wearDate)} · ${escapeHtml(entry.occasion || "General")}</small></div></article>`).join("") : emptyBlock("No wear history", "Plan an outfit, then mark it worn after the date arrives.");
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
  const fields = [["Name",p.fullName||p.displayName],["Gender",p.gender],["Date of birth",p.dateOfBirth],["Height",p.height?`${p.height} cm`:""],["Weight",p.weight?`${p.weight} kg`:""],["Profession",p.profession],["City",p.city],["Body type",p.bodyTypeSelfReported||ai.bodyType],["Profile completion",p.profileCompletion!=null?`${p.profileCompletion}%`:""]];
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

function renderTodayPick(){
  const target=$("#today-pick");if(!target)return;
  const outfit=state.todayOutfit?.outfit||state.todayOutfit;
  const items=prioritizeOutfitItems(outfitItems(state.todayOutfit||{}));
  if(!outfit||!items.length){target.innerHTML=`<div class="today-copy"><span>TODAY’S PICK</span><h3>Your wardrobe is ready</h3><p>Generate a complete look from clean pieces you own.</p><button class="button button-primary" data-go-panel="stylist">Create today’s look</button></div>${emptyBlock("No pick yet","Your next accepted outfit will appear here.")}`;return;}
  const main=items[0],support=items.slice(1,3);
  target.innerHTML=`<div class="today-copy"><span>TODAY’S PICK</span><h3>${escapeHtml(outfit.title||"Your outfit")}</h3><p>${escapeHtml([state.todayOutfit?.occasion,outfit.subtitle].filter(Boolean).join(" · "))}</p>${outfit.score?`<b class="today-score">${Number(outfit.score)}/100 style score</b>`:""}<button class="button button-primary" data-open-today>View full outfit</button></div><div class="today-editorial"><figure class="today-main"><img src="${safeUrl(main.image)}" alt="${escapeHtml(main.title||"Main garment")}"><figcaption>${escapeHtml(main.title||"Main garment")}</figcaption></figure><div>${support.map((item)=>`<figure><img src="${safeUrl(item.image)}" alt="${escapeHtml(item.title||"Supporting garment")}"><figcaption>${escapeHtml(item.title||"Supporting garment")}</figcaption></figure>`).join("")}</div></div>`;
}

async function refreshQuota(){
  if(!state.user)return;
  try{state.quota=await callCoreApi(state.user,"/v1/ai/quota/status",{}, {method:"GET"});renderQuota();}
  catch(error){state.quota=null;renderQuota(error.message);}
  wardrobeAssistant?.renderQuota();
}
function renderQuota(error=""){
  const q=state.quota,chip=$("#quota-chip");
  if(chip)chip.querySelector("span").textContent=q?`${q.remaining}/${q.limit} today`:"Usage unavailable";
  const target=$("#quota-detail");if(!target)return;
  if(!q){
    const message=navigator.onLine===false
      ? "You appear to be offline. Reconnect and try again."
      : /failed to fetch|network/i.test(String(error))
      ? "We couldn’t reach your allowance right now. Your plan and saved usage are unchanged."
      : error||"Try refreshing this page.";
    target.innerHTML=`<div class="quota-unavailable"><div class="quota-unavailable-icon" aria-hidden="true">AI</div><b>Allowance temporarily unavailable</b><p>${escapeHtml(message)}</p><button type="button" data-retry-quota><svg class="nav-icon" aria-hidden="true"><use href="#icon-refresh"></use></svg>Try again</button></div>`;
    return;
  }
  const reset="Resets at midnight IST";
  target.innerHTML=`<div class="quota-meter"><div style="width:${q.limit?Math.min(100,q.used/q.limit*100):100}%"></div></div><div class="quota-numbers"><p><b>${Number(q.remaining)}</b><span>remaining</span></p><p><b>${Number(q.used)}</b><span>used today</span></p><p><b>${Number(q.limit)}</b><span>daily total</span></p></div><p>${escapeHtml(pretty(q.plan))} plan${Number(state.profile?.subscription?.aiDailyBonus||0)>0?` · +${Number(state.profile.subscription.aiDailyBonus)} booster`:""} · ${reset}</p>${q.coupon?`<p>Coupon ${escapeHtml(q.coupon.code)} is ${escapeHtml(q.coupon.status)}.</p>`:""}${q.aiAvailable===false?`<div class="error-box"><b>AI is temporarily paused</b><p>${escapeHtml(q.unavailableMessage||"")}</p></div>`:""}`;
}

function stylistWardrobe(){return eligibleWardrobe(state.wardrobe).map((item)=>({id:item.id,title:item.title,category:item.category,subCategory:item.subCategory,primaryColor:item.primaryColor,secondaryColors:item.secondaryColors,pattern:item.pattern,material:item.material||item.fabric,fit:item.fit,season:item.season,occasion:item.userOccasions||item.occasion,layerRole:item.layerRole,bodyZone:item.bodyZone,standaloneOutfit:item.standaloneOutfit}));}
function buildStylistPrompt({occasion,mood,request,anchorId=""}){
  const wardrobe=stylistWardrobe();
  return `You are the ClothMatics wardrobe stylist. Use only wardrobeItemIds from the supplied wardrobe. Create complete, wearable outfits; a one-piece needs suitable support, otherwise include a top and bottom. Never use duplicate IDs. Respect hidden/private/laundry filtering already applied. ${anchorId?`The outfit must include anchor item ${anchorId}.`:""}\nOccasion: ${occasion}. Mood: ${mood}. Request: ${request||"None"}.\nStyle profile: ${JSON.stringify({preferences:state.profile?.preferences||{},learned:state.profileStyle||null})}\nWardrobe: ${JSON.stringify(wardrobe)}\nReturn JSON only: {"best":{"score":0,"title":"","subtitle":"","wardrobeItemIds":[],"reasoning":[]},"alternatives":[same shape, same shape]}.`;
}

async function runStylist(event,anchorId=""){
  event?.preventDefault?.();const button=$("#stylist-form [type=submit]"),message=$("#stylist-message");
  const occasion=$("#stylist-occasion").value,mood=$("#stylist-mood").value,request=$("#stylist-request").value.trim();
  const wardrobe=eligibleWardrobe(state.wardrobe);if(wardrobe.length<2)return message.textContent="Add at least two clean wardrobe pieces through Camera first.";
  const prompt=buildStylistPrompt({occasion,mood,request,anchorId}),stamp=promptStamp(anchorId?"style_this":"outfit_stylist",prompt),key=aiCacheKey(state.user.uid,anchorId?"style-this":"stylist",stamp.promptHash,wardrobeFingerprint(wardrobe),stableHash(`${occasion}|${mood}|${request}|${anchorId}`));
  button.disabled=true;message.textContent="Styling your wardrobe…";
  try{
    let result=readAiCache(key),cacheHit=Boolean(result);
    if(!result){
      const response=await callUserAi(state.user,{contents:[{parts:[{text:prompt}]}],generationConfig:{temperature:.3,topP:.9,maxOutputTokens:4096,responseMimeType:"application/json"}});
      const candidates=[response.data?.best,...(Array.isArray(response.data?.alternatives)?response.data.alternatives:[])].filter(Boolean).map((outfit)=>validateGroundedOutfit(outfit,state.wardrobe));
      if(anchorId&&!candidates[0].wardrobeItemIds.includes(anchorId))throw new Error("The result did not include the selected garment.");
      result={best:candidates[0],alternatives:candidates.slice(1),provider:response.provider,model:response.model,occasion,mood};writeAiCache(key,result);
      callCoreApi(state.user,"/v1/analytics/api-call",{type:"gemini",status:"success",responseTime:0,provider:response.provider,model:response.model,feature:anchorId?"style_this":"outfit_stylist",...stamp}).catch(()=>{});
    }
    state.stylistResult=result;state.stylistSource=anchorId?"style_this":"ai_stylist_web";renderStylistResult();message.textContent=cacheHit?"Loaded your saved result without using another AI call.":"Fresh outfit generated. One shared AI call was used.";if(!cacheHit)await refreshQuota();
  }catch(error){message.textContent=error.message;callCoreApi(state.user,"/v1/client-errors",{title:"Web AI Stylist",message:error.message,context:"stylist",platform:"web",appVersion:"2026.08"}).catch(()=>{});}
  finally{button.disabled=false;}
}

function renderStylistResult(){
  const target=$("#stylist-result"),result=state.stylistResult;if(!target||!result)return;
  const all=[result.best,...(result.alternatives||[])];
  target.innerHTML=all.map((outfit,index)=>{const items=prioritizeOutfitItems(outfit.wardrobeItemIds.map((id)=>state.wardrobe.find((item)=>item.id===id)).filter(Boolean));return`<article class="generated-outfit ${index===0?"best":""}"><header><div><span>${index===0?"BEST MATCH":"ALTERNATIVE"}</span><h3>${escapeHtml(outfit.title)}</h3><p>${escapeHtml(outfit.subtitle)}</p></div><b>${outfit.score}/100</b></header><div class="generated-piece-grid">${items.map((item)=>`<button data-item-id="${escapeHtml(item.id)}"><img src="${safeUrl(item.image)}" alt="${escapeHtml(item.title)}"><span>${escapeHtml(item.title)}</span></button>`).join("")}</div><ul>${outfit.reasoning.map((reason)=>`<li>${escapeHtml(reason)}</li>`).join("")}</ul>${index===0?`<div class="card-actions"><button data-save-generated>Save outfit</button><button data-plan-generated>Plan for ${escapeHtml(formatIsoDate(state.selectedDate))}</button><button data-today-generated>Use as Today’s Pick</button><button data-share-generated>Share</button></div>`:""}</article>`}).join("");
}

async function saveGeneratedOutfit(){const result=state.stylistResult;if(!result)return;const data=await callCoreApi(state.user,"/v1/outfits/save",{outfit:result.best,source:state.stylistSource,occasion:result.occasion});state.outfits.unshift({id:data.id,userId:state.user.uid,source:state.stylistSource,occasion:result.occasion,outfit:result.best,wardrobeItemIds:result.best.wardrobeItemIds,createdAt:Date.now()});renderLooks(state.outfits);renderOutfitLibrary();renderPlannerOptions();toast("Outfit saved to your shared library.");}
async function planGeneratedOutfit(){const result=state.stylistResult;if(!result)return;await callCoreApi(state.user,"/v1/outfits/plan",{wearDate:state.selectedDate,occasion:result.occasion,outfit:result.best});await reloadWear();toast(`Outfit planned for ${formatIsoDate(state.selectedDate)}.`);}
async function useGeneratedToday(){const result=state.stylistResult;if(!result)return;await callCoreApi(state.user,"/v1/outfits/today",{occasion:result.occasion,outfit:result.best});state.todayOutfit={date:localDateKey(new Date()),occasion:result.occasion,outfit:result.best,savedAt:Date.now()};renderTodayPick();renderHomeInsights();toast("Today’s Pick updated on web and mobile.");}

function renderNotifications(){
  const unread=state.notifications.filter((item)=>!item.readAt).length;for(const id of ["#nav-unread","#bell-unread"]){const el=$(id);if(el){el.textContent=unread;el.classList.toggle("hidden",!unread);}}
  const markAll=$("#mark-all-notifications");if(markAll){markAll.disabled=!unread;markAll.classList.toggle("hidden",!unread);}
  const target=$("#notification-list");if(!target)return;
  target.innerHTML=state.notifications.length?state.notifications.map((item)=>{const outfit=embeddedNotificationOutfit(item),images=(item.outfitImages||item.params?.outfitImages||item.payload?.params?.outfitImages||[]).filter((url)=>safeUrl(url)).slice(0,4),icon=notificationIcon(item);return`<button type="button" class="notification-card ${item.readAt?"":"unread"}" data-notification-id="${escapeHtml(item.id)}"><div class="notification-copy"><div class="notification-meta"><span class="notification-kind-icon" aria-hidden="true"><svg class="nav-icon"><use href="#icon-${icon}"></use></svg></span><span>${escapeHtml(pretty(item.channel||"update"))}</span>${item.readAt?"":'<em>New</em>'}</div>${safeUrl(item.imageUrl||item.image)?`<img class="notification-art" src="${safeUrl(item.imageUrl||item.image)}" alt="Notification artwork">`:""}<h4>${escapeHtml(item.title||"ClothMatics update")}</h4><p>${escapeHtml(item.body||"")}</p><time>${escapeHtml(formatDateValue(item.receivedAt||item.createdAt||item.timestamp))}</time></div>${images.length?`<div class="notification-outfit">${images.map((url)=>`<img src="${url}" alt="Generated outfit garment">`).join("")}</div>`:outfit?`<div class="notification-outfit">${outfit.wardrobeItemIds.map((id)=>state.wardrobe.find((entry)=>entry.id===id)).filter(Boolean).slice(0,4).map((entry)=>`<img src="${safeUrl(entry.image)}" alt="${escapeHtml(entry.title)}">`).join("")}</div>`:""}<span class="notification-open" aria-hidden="true">Open →</span></button>`;}).join(""):emptyBlock("No notifications yet","Wardrobe reminders, offers and account updates will appear here after they are sent.");
}
function notificationIcon(item={}){const route=String(item.route||item.target?.route||item.payload?.route||"").toLowerCase(),channel=String(item.channel||item.type||"").toLowerCase();if(embeddedNotificationOutfit(item)||/outfit|style|festival/.test(`${route} ${channel}`))return"sparkles";if(/calendar|planner|reminder/.test(`${route} ${channel}`))return"calendar";if(/quest|challenge|award/.test(`${route} ${channel}`))return"award";if(/purchase|shopping/.test(`${route} ${channel}`))return"bag";return"bell";}
async function markAllNotificationsRead(){const unread=state.notifications.filter((item)=>!item.readAt);await Promise.all(unread.map((item)=>updateDoc(doc(db,"users",state.user.uid,"notifications",item.id),{readAt:serverTimestamp()}).catch(()=>null)));const now=Date.now();unread.forEach((item)=>{item.readAt=now});renderNotifications();toast("Notifications marked as read.")}
async function openNotification(id){const item=state.notifications.find((entry)=>entry.id===id);if(!item)return;if(!item.readAt){await updateDoc(doc(db,"users",state.user.uid,"notifications",id),{readAt:serverTimestamp()}).catch(()=>{});item.readAt=Date.now();renderNotifications();}await callCoreApi(state.user,"/v1/notifications/open",{campaignId:item.campaignId||id}).catch(()=>{});const outfit=embeddedNotificationOutfit(item);if(outfit){showNotificationOutfit(item,outfit);return;}const route=String(item.route||item.target?.route||item.payload?.route||"");const panels={Main:"overview",OutfitCalendar:"planner",WeeklyClosetReport:"insights",SmartPurchaseCheck:"purchase",StyleChallengeHub:"quest",TripPacking:"trip",Wardrobe:"wardrobe",SavedOutfits:"outfits"};openPanel(panels[route]||"overview");}
function showNotificationOutfit(notification,outfit){const images=(notification.outfitImages||notification.params?.outfitImages||notification.payload?.params?.outfitImages||[]).filter((url)=>safeUrl(url));const items=outfit.wardrobeItemIds.map((id)=>state.wardrobe.find((item)=>item.id===id)).filter(Boolean);$("#outfit-detail").innerHTML=`<div class="complete-outfit-head"><span class="app-kicker">NOTIFICATION OUTFIT</span><h2>${escapeHtml(outfit.title||notification.title||"Generated outfit")}</h2><p>${escapeHtml(outfit.subtitle||notification.body||"")}</p></div><div class="complete-outfit-grid">${(items.length?items:images.map((image,index)=>({title:`Outfit piece ${index+1}`,image}))).map((item)=>`<article><img src="${safeUrl(item.image)}" alt="${escapeHtml(item.title)}"><div><b>${escapeHtml(item.title)}</b></div></article>`).join("")}</div>`;$("#outfit-dialog").showModal();}

function syncProfileChoiceFields(bodyType=""){
  const gender=$("#profile-gender")?.value||"",bodySelect=$("#profile-body-type"),options=PROFILE_BODY_TYPES[gender]||[];
  if(bodySelect){const known=options.some(([value])=>value===bodyType);bodySelect.innerHTML=`<option value="">${gender?"Select body type":"Select gender first"}</option>${options.map(([value,detail])=>`<option value="${escapeHtml(value)}">${escapeHtml(value)} — ${escapeHtml(detail)}</option>`).join("")}${bodyType&&!known?`<option value="${escapeHtml(bodyType)}">${escapeHtml(bodyType)}</option>`:""}`;bodySelect.value=bodyType;bodySelect.disabled=!gender;}
  $("#profile-dress-field")?.classList.toggle("hidden",gender==="Male");
}
function renderProfileForm(){const p=state.profile||{},sizes=p.shoppingProfile?.sizes||p.shoppingSizes||{};const value=(id,v)=>{const el=$(id);if(el)el.value=v??"";};value("#profile-name",p.fullName||p.displayName);value("#profile-gender",p.gender);syncProfileChoiceFields(p.bodyTypeSelfReported||"");value("#profile-dob",normalizeProfileDate(p.dateOfBirth));value("#profile-height",p.height);value("#profile-weight",p.weight);value("#profile-profession",p.profession);value("#profile-city",p.city);value("#size-top",sizes.top?.alphaSize||sizes.top);value("#size-bottom",sizes.bottom?.alphaSize||sizes.bottom);value("#size-dress",sizes.dress?.alphaSize||sizes.dress);value("#size-shoes",sizes.shoes?.uk||sizes.shoes?.india||sizes.shoes);}
function normalizeProfileDate(value){const text=String(value||"").trim();if(/^\d{4}-\d{2}-\d{2}$/.test(text))return text;const match=text.match(/^(\d{2})[-/](\d{2})[-/](\d{4})$/);return match?`${match[3]}-${match[2]}-${match[1]}`:"";}
async function saveProfile(event){event.preventDefault();const button=event.currentTarget.querySelector("[type=submit]"),message=$("#profile-message"),shoe=$("#size-shoes").value;const profile={fullName:$("#profile-name").value.trim(),gender:$("#profile-gender").value,dateOfBirth:$("#profile-dob").value,height:Number($("#profile-height").value)||0,weight:Number($("#profile-weight").value)||0,profession:$("#profile-profession").value.trim(),city:$("#profile-city").value.trim(),bodyTypeSelfReported:$("#profile-body-type").value,shoppingProfile:{gender:$("#profile-gender").value,sizes:{top:{alphaSize:$("#size-top").value},bottom:{alphaSize:$("#size-bottom").value},dress:{alphaSize:$("#size-dress").value},shoes:{uk:shoe?Number(shoe):null,india:shoe?Number(shoe):null}}}};if(!profile.gender){message.textContent="Choose a gender before saving.";$("#profile-gender").focus();return;}button.disabled=true;message.textContent="Saving…";try{const response=await callCoreApi(state.user,"/v1/profile/update",{profile});state.profile={...state.profile,...response.profile};renderAccount(state.user);renderProfile();message.textContent="Profile saved. The same details are now available in the mobile app.";}catch(error){message.textContent=error.message;}finally{button.disabled=false;}}
async function redeemCoupon(event){event.preventDefault();const code=$("#coupon-redeem-code").value.trim(),message=$("#coupon-redeem-message");if(!code)return;try{await callCoreApi(state.user,"/v1/coupons/redeem",{code});message.textContent="Coupon applied. Your shared plan and allowance are updating.";await refreshQuota();}catch(error){message.textContent=error.message;}}

$("#wardrobe-search").addEventListener("input", filterWardrobe);
$("#wardrobe-filter").addEventListener("change", filterWardrobe);
function filterWardrobe() {
  const filter = $("#wardrobe-filter").value;
  const filtered = state.wardrobe.filter((item) => {
    return matchesGarmentSearch(item,$("#wardrobe-search").value) && (filter === "all" || (filter === "favorite" && item.favorite) || (filter === "clean" && item.laundryStatus === "Clean") || (filter === "lookbook" && (item.inLookbook||item.type==="lookbook")) || (filter === "laundry" && item.laundryStatus!=="Clean") || (filter === "hidden" && item.hiddenFromAI));
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
$("#purchase-form").addEventListener("submit",runPurchaseCheck);
$("#stylist-form").addEventListener("submit",runStylist);
$("#profile-form").addEventListener("submit",saveProfile);
$("#coupon-redeem-form").addEventListener("submit",redeemCoupon);
$("#profile-gender").addEventListener("change",()=>syncProfileChoiceFields(""));
$("#purchase-owned").addEventListener("change",useOwnedPurchaseExample);
$("#notification-bell").addEventListener("click",()=>openPanel("notifications"));
$("#mark-all-notifications").addEventListener("click",markAllNotificationsRead);
$("#send-verification").addEventListener("click",async()=>{try{await sendEmailVerification(state.user);toast("Verification email sent.")}catch(error){toast(error.message)}});
$("#send-password-reset").addEventListener("click",async()=>{try{await sendPasswordResetEmail(auth,state.user.email);toast("Password reset email sent.")}catch(error){toast(error.message)}});
$("#close-garment-upload").addEventListener("click",closeGarmentUpload);
$("#garment-photo").addEventListener("change",(event)=>selectGarmentFile(event.target.files?.[0]));
$("#garment-upload-form").addEventListener("submit",processGarmentUpload);
$("#garment-review-form").addEventListener("submit",saveGarmentUpload);
$("#retry-garment").addEventListener("click",handleGarmentReviewSecondaryAction);
$("#toggle-garment-image").addEventListener("click",toggleGarmentImageChoice);
$("#upload-styling-usage").addEventListener("change",()=>{const usage=$("#upload-styling-usage").value;if(usage==="private_innerwear"){$("#upload-category").value="Innerwear";$("#upload-hidden-ai").checked=true;$("#upload-occasions").value="";$("#upload-activities").value=""}else if(usage==="swimwear"){$("#upload-category").value="Swimwear";$("#upload-occasions").value="Beach, Travel";$("#upload-activities").value="Beach, Travel"}else if(usage==="activewear"){$("#upload-category").value="Top";$("#upload-occasions").value="Gym";$("#upload-activities").value="Gym/workout"}else if(usage==="wear_as_top"){$("#upload-category").value="Top";$("#upload-occasions").value="Everyday, Party, Beach, Date"}});
$$('[data-camera-mode]').forEach((button)=>button.addEventListener("click",()=>setCameraMode(button.dataset.cameraMode)));
$("#camera-gallery-input").addEventListener("change",(event)=>selectCameraFiles(event.target.files));
$("#camera-remove-photo").addEventListener("click",resetCameraPhoto);
$("#camera-action").addEventListener("click",runCameraAction);
$("#camera-auto-extract").addEventListener("click",runAutoExtract);
$("#camera-single-garment").addEventListener("click",runSingleGarment);
$("#camera-thumbnail-strip").addEventListener("click",(event)=>{const button=event.target.closest("[data-camera-photo]");if(button){state.camera.activeIndex=Number(button.dataset.cameraPhoto)||0;renderCameraSelection()}});
const garmentDropzone=$("#garment-dropzone");
garmentDropzone.addEventListener("dragover",(event)=>{event.preventDefault();garmentDropzone.classList.add("dragging")});
garmentDropzone.addEventListener("dragleave",()=>garmentDropzone.classList.remove("dragging"));
garmentDropzone.addEventListener("drop",(event)=>{event.preventDefault();garmentDropzone.classList.remove("dragging");selectGarmentFile(event.dataTransfer?.files?.[0])});

document.addEventListener("click", (event) => {
  const garmentView=event.target.closest("[data-garment-view]");if(garmentView){event.preventDefault();event.stopPropagation();const id=garmentView.dataset.garmentViewId,item=state.wardrobe.find(entry=>entry.id===id);if(!item?.ghostMannequin?.image)return;state.garmentImageModes[id]=garmentView.dataset.garmentView==='3d'?'3d':'normal';if(garmentView.dataset.garmentViewScope==='detail')openGarmentDetail(id);else renderAll();return}
  const reviewItem=event.target.closest("[data-review-extracted]");if(reviewItem){openExtractedReview(Number(reviewItem.dataset.reviewExtracted));return}
  if(event.target.closest("[data-retry-quota]")){refreshQuota();return}
  if(event.target.closest("[data-camera-another]")){resetCameraPhoto();openPanel("camera");return}
  if(event.target.closest("[data-camera-add]")){setCameraMode("closet");resetCameraPhoto();openPanel("camera");return}
  const deleteLook=event.target.closest("[data-delete-look]"); if(deleteLook){deleteSavedLook(deleteLook.dataset.deleteLook);return}
  const viewSaved=event.target.closest("[data-view-saved]"); if(viewSaved){openSavedOutfit(viewSaved.dataset.viewSaved);return}
  const removePlan=event.target.closest("[data-remove-plan]"); if(removePlan){removePlanRecord(removePlan.dataset.removePlan);return}
  const markWorn=event.target.closest("[data-mark-worn]"); if(markWorn){markPlanWorn(markWorn.dataset.markWorn);return}
  const goPanel=event.target.closest("[data-go-panel]"); if(goPanel){openPanel(goPanel.dataset.goPanel);return}
  const notification=event.target.closest("[data-notification-id]");if(notification){openNotification(notification.dataset.notificationId);return}
  if(event.target.closest("[data-open-today]")){showOutfitDialog(state.todayOutfit,"TODAY'S PICK");return}
  if(event.target.closest("[data-save-generated]")){saveGeneratedOutfit();return}
  if(event.target.closest("[data-plan-generated]")){planGeneratedOutfit();return}
  if(event.target.closest("[data-today-generated]")){useGeneratedToday();return}
  if(event.target.closest("[data-share-generated]")){shareGeneratedOutfit();return}
  const deleteGhost=event.target.closest("[data-delete-ghost]");if(deleteGhost){event.preventDefault();void deleteGhostGeneration(deleteGhost.dataset.deleteGhost);return}
  const ghostItem=event.target.closest("[data-ghost-item]");if(ghostItem){event.preventDefault();ghostStudio.open(ghostItem.dataset.ghostItem);return}
  const styleItem=event.target.closest("[data-style-item]");if(styleItem){styleGarment(styleItem.dataset.styleItem);return}
  const completeItem=event.target.closest("[data-complete-item]");if(completeItem){completeGarmentLook(completeItem.dataset.completeItem);return}
  const saveItem=event.target.closest("[data-save-garment]");if(saveItem){saveGarmentMetadata(saveItem.dataset.saveGarment);return}
  const deleteItem=event.target.closest("[data-delete-garment]");if(deleteItem){deleteGarment(deleteItem.dataset.deleteGarment);return}
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
async function planExistingOutfit(){const id=$("#plan-outfit-select").value,look=state.outfits.find(x=>x.id===id);if(!look)return toast("Choose a saved outfit first.");const ids=outfitIds(look),outfit=look.outfit||{title:look.title||"Saved outfit",subtitle:look.occasion||"",wardrobeItemIds:ids,reasoning:[]};try{await callCoreApi(state.user,"/v1/outfits/plan",{wearDate:state.selectedDate,outfitId:id,occasion:look.occasion||"General",outfit});await reloadWear();toast("Outfit planned for this date.")}catch(error){toast(`Could not plan outfit: ${error.message}`)}}
async function removePlanRecord(id){const record=state.wear.find(x=>x.id===id);if(!record||record.userId!==state.user.uid)return;if(!await confirmAction("Remove this plan?","The saved outfit and wardrobe pieces will stay available."))return;try{await callCoreApi(state.user,"/v1/outfits/remove-plan",{recordId:id});await reloadWear();toast("Plan removed.")}catch(error){toast(`Could not remove plan: ${error.message}`)}}
async function markPlanWorn(id){const record=state.wear.find(x=>x.id===id);if(!record||record.userId!==state.user.uid||record.wearDate>localDateKey(new Date()))return;try{await callCoreApi(state.user,"/v1/outfits/mark-worn",{recordId:id});await reloadWear();toast("Outfit and garment wear counts updated.")}catch(error){toast(`Could not update plan: ${error.message}`)}}
async function reloadWear(){const snap=await getDocs(query(collection(db,"outfitWear"),where("userId","==",state.user.uid)));state.wear=snap.docs.map(x=>({id:x.id,...x.data()})).sort((a,b)=>String(b.wearDate||"").localeCompare(String(a.wearDate||"")));renderCalendar();renderInsights();renderWeeklyReport()}

function setCameraMode(mode){
  const next=mode==="style"?"style":"closet";
  if(next==="style"&&(state.camera.files||[]).length>1){$("#camera-message").textContent="Style Check uses one photo. Clear the selection and choose one photo.";return}
  state.camera.mode=next;
  $$('[data-camera-mode]').forEach((button)=>{const active=button.dataset.cameraMode===state.camera.mode;button.classList.toggle("active",active);button.setAttribute("aria-selected",String(active))});
  const style=state.camera.mode==="style";
  $("#camera-mode-guide").innerHTML=style?'<svg class="nav-icon" aria-hidden="true"><use href="#icon-info"></use></svg><p><b>Style Check</b> uses one complete outfit photo and returns a score, detected clothing and recommendations.</p>':'<svg class="nav-icon" aria-hidden="true"><use href="#icon-info"></use></svg><p><b>Auto Extract</b> is for selfies and worn outfits. <b>Single Garment</b> is for one item on a flat surface or hanger.</p>';
  $("#camera-gallery-input").multiple=!style;
  $("#camera-gallery-label").textContent=style?"Choose photo from gallery":((state.camera.files||[]).length?"Add more photos":"Choose photos from gallery");
  $("#camera-extract-choices").classList.toggle("hidden",style);
  $("#camera-generate-3d-option").classList.toggle("hidden",style);
  $("#camera-action").classList.toggle("hidden",!style);
  $("#style-check-result").classList.add("hidden");
  $("#camera-tips .camera-tips-mode")?.remove();
  renderCameraSelection();
}
function setCameraBusy(busy){
  const count=(state.camera.files||[]).length;state.camera.busy=busy;
  $("#camera-action").disabled=busy||count!==1;$("#camera-auto-extract").disabled=busy||count<1;$("#camera-single-garment").disabled=busy||count!==1;
  $("#camera-gallery-input").disabled=busy;$$('[data-camera-mode]').forEach((button)=>button.disabled=busy);$("#camera-remove-photo").disabled=busy;
}
function selectCameraFiles(fileList){
  const selected=[...(fileList||[])];
  try{
    if(!selected.length)return;selected.forEach(validateGarmentFile);
    const current=state.camera.files||[],limit=state.camera.mode==="style"?1:5;
    if(current.length+selected.length>limit)throw new Error(limit===1?"Style Check uses one photo.":"You can select up to 5 photos.");
    const known=new Set(current.map((file)=>`${file.name}:${file.size}:${file.lastModified}`));
    const additions=selected.filter((file)=>!known.has(`${file.name}:${file.size}:${file.lastModified}`));
    state.camera.files=[...current,...additions].slice(0,limit);state.camera.urls=[...(state.camera.urls||[]),...additions.map((file)=>URL.createObjectURL(file))].slice(0,limit);state.camera.activeIndex=Math.max(0,state.camera.files.length-1);state.camera.analysis=null;
    $("#camera-message").textContent=state.camera.files.length===limit&&limit===5?"5 photos selected. Ready for Auto Extract.":"";
    $("#style-check-result").classList.add("hidden");renderCameraSelection();
  }catch(error){$("#camera-message").textContent=error.message}
  $("#camera-gallery-input").value="";
}
function renderCameraSelection(){
  const files=state.camera.files||[],urls=state.camera.urls||[],style=state.camera.mode==="style";
  if(!files.length){
    $("#camera-preview").innerHTML=`<div class="camera-placeholder"><span><svg class="nav-icon" aria-hidden="true"><use href="#icon-image"></use></svg></span><b id="camera-placeholder-title">${style?"Add one outfit photo":"Add up to five photos"}</b><small>${style?"Keep your complete outfit visible":"Use Auto Extract for worn outfits or Single Garment for one item"}</small></div>`;
    $("#camera-thumbnail-strip").classList.add("hidden");$("#camera-thumbnail-strip").innerHTML="";$("#camera-remove-photo").classList.add("hidden");
  }else{
    const active=Math.min(state.camera.activeIndex||0,files.length-1);state.camera.activeIndex=active;
    $("#camera-preview").innerHTML=`<img src="${urls[active]}" alt="Selected ${style?"outfit":"clothing"} preview"><span class="camera-preview-badge">${files.length} PHOTO${files.length===1?"":"S"} SELECTED</span>`;
    $("#camera-thumbnail-strip").innerHTML=files.map((file,index)=>`<button type="button" data-camera-photo="${index}" class="${index===active?"active":""}" aria-label="View ${escapeHtml(file.name||`photo ${index+1}`)}"><img src="${urls[index]}" alt=""><span>${index+1}</span></button>`).join("");
    $("#camera-thumbnail-strip").classList.toggle("hidden",files.length<2);$("#camera-remove-photo").classList.remove("hidden");
  }
  $("#camera-gallery-label").textContent=style?"Choose photo from gallery":(files.length?"Add more photos":"Choose photos from gallery");setCameraBusy(Boolean(state.camera.busy));
}
function resetCameraPhoto(){
  if(state.camera.busy)return;(state.camera.urls||[]).forEach((url)=>URL.revokeObjectURL(url));state.camera={mode:state.camera.mode||"closet",files:[],urls:[],activeIndex:0,generate3d:false};
  $("#camera-generate-3d").checked=false;
  $("#camera-message").textContent="";$("#style-check-result").classList.add("hidden");$("#style-check-result").innerHTML="";renderCameraSelection();
}
function runSingleGarment(){
  const files=state.camera.files||[];if(state.camera.busy||!files.length)return;
  if(files.length!==1){$("#camera-message").textContent="Single Garment uses one photo. Clear the selection and choose one photo.";return}
  state.camera.generate3d=$("#camera-generate-3d").checked===true;
  openGarmentUpload(files[0],{autoProcess:true});
}
function runAutoExtract(){
  const files=state.camera.files||[];if(state.camera.busy||!files.length)return;
  if(files.length>5){$("#camera-message").textContent="You can select up to 5 photos.";return}
  state.camera.generate3d=$("#camera-generate-3d").checked===true;
  openAutoExtract(files);
}
async function runCameraAction(){
  const file=(state.camera.files||[])[0];if(!file||state.camera.busy)return;if(state.quota&&Number(state.quota.remaining)<=0){$("#camera-message").textContent="You have used today’s AI allowance. Your calls reset at midnight IST.";return}
  const controller=new AbortController();state.camera.controller=controller;setCameraBusy(true);$("#camera-message").textContent="Checking your complete outfit…";
  try{
    const normalized=await normalizeGarmentImage(file);const result=await analyzeStyleCheck(state.user,normalized.blob,{signal:controller.signal});state.camera.analysis=result.analysis;state.camera.provider=result.provider;state.camera.model=result.model;
    const persisted={...result.analysis,userId:state.user.uid,image:"",analyzedImageUri:"",sourceImageUrl:"",createdAt:serverTimestamp()};
    const ref=await addDoc(collection(db,"outfitHistory"),persisted).catch(()=>null);if(ref)state.outfitHistory.unshift({id:ref.id,...result.analysis,userId:state.user.uid,createdAt:new Date()});
    renderStyleCheckResult(result.analysis);$("#camera-message").textContent="Style Check complete.";
  }catch(error){if(error.name!=="AbortError")$("#camera-message").textContent=error.message}
  finally{state.camera.controller=null;setCameraBusy(false);await refreshQuota().catch(()=>{})}
}
function renderStyleCheckList(title,items,icon="check"){
  const values=Array.isArray(items)?items.filter(Boolean):[];if(!values.length)return"";
  return `<article class="style-result-card"><h4>${escapeHtml(title)}</h4><ul>${values.map((item)=>`<li><svg class="nav-icon" aria-hidden="true"><use href="#icon-${icon}"></use></svg><span>${escapeHtml(item)}</span></li>`).join("")}</ul></article>`;
}
function renderStyleCheckResult(analysis){
  const target=$("#style-check-result"),clothing=analysis.clothing||[],colors=analysis.colors||[];
  const previewUrl=(state.camera.urls||[])[state.camera.activeIndex||0]||"";
  target.innerHTML=`<div class="style-result-hero"><div class="style-result-image"><img src="${previewUrl}" alt="Analyzed outfit"><span>STYLE CHECK COMPLETE</span></div><div class="style-score-card"><small>AI STYLE SCORE</small><b>${Number(analysis.overallScore)||0}<em>%</em></b><h3>${escapeHtml(analysis.style||"Outfit analysis")}</h3><p>${escapeHtml(analysis.season||"")}${analysis.season&&analysis.formality?" · ":""}${escapeHtml(analysis.formality||"")}</p></div></div><div class="style-result-summary"><article><span>OCCASION</span><b>${escapeHtml(analysis.occasion||"General")}</b></article><article><span>AI CONFIDENCE</span><b>${Number(analysis.confidence)||0}% Accurate</b></article></div><article class="style-result-card"><h4>Detected Colors</h4><div class="style-color-chips">${colors.map((color)=>`<span>${escapeHtml(color)}</span>`).join("")||"<span>No dominant colors returned</span>"}</div></article><article class="style-result-card"><h4>Detected Clothing (${clothing.length})</h4><div class="style-clothing-list">${clothing.map((item)=>`<article><b>${escapeHtml(item.title)}</b><span>${escapeHtml(item.category)}${item.primaryColor?` · ${escapeHtml(item.primaryColor)}`:""}</span><small>${escapeHtml([item.material,item.fit,item.pattern].filter(Boolean).join(" · "))}</small></article>`).join("")||"<p>No clothing detected.</p>"}</div></article><div class="style-result-lists">${renderStyleCheckList("AI Recommendations",analysis.recommendations)}${renderStyleCheckList("Fashion Tips",analysis.fashionTips,"sparkles")}${renderStyleCheckList("Accessory Ideas",analysis.accessories,"plus")}${renderStyleCheckList("Shopping Suggestions",analysis.shoppingSuggestions,"bag")}</div><div class="style-result-actions"><button type="button" data-camera-another>Analyze another outfit</button><button class="button button-primary" type="button" data-camera-add>Add a garment to closet</button></div>`;
  target.classList.remove("hidden");target.scrollIntoView({behavior:"smooth",block:"start"});
}

function setUploadStep(name,status){const step=$(`[data-upload-step="${name}"]`);if(!step)return;step.classList.remove("active","done","error");if(status)step.classList.add(status)}
function setGarmentUploadBusy(busy){
  state.garmentUpload.busy=busy;const ready=state.garmentUpload.autoExtract?(state.garmentUpload.files||[]).length>0:Boolean(state.garmentUpload.file);
  $("#process-garment").disabled=busy||!ready;$("#close-garment-upload").disabled=busy;$("#garment-photo").disabled=busy;
  if($("#generate-garment-3d"))$("#generate-garment-3d").disabled=busy;
  const dialog=$("#garment-upload-dialog");dialog.setAttribute('aria-busy',String(busy));
  if(!dialog.querySelector('.hanger-loader')){
    dialog.querySelector('.upload-dialog-heading').insertAdjacentHTML('afterend',hangerLoaderMarkup());
    for(const id of ['garment-upload-message','garment-save-message'])new MutationObserver(()=>updateHangerLoader(dialog,$(`#${id}`).textContent,state.garmentUpload.busy)).observe($(`#${id}`),{childList:true,characterData:true,subtree:true});
  }
  updateHangerLoader(dialog,$('#garment-upload-message').textContent,busy);
}
function ensureGenerate3dOption(){
  if($("#generate-garment-3d"))return;
  const form=$("#garment-upload-form"),process=$("#process-garment");
  if(!form||!process)return;
  process.insertAdjacentHTML("beforebegin",'<label class="generate-3d-option"><input id="generate-garment-3d" type="checkbox"> Generate 3D while processing <span>If unavailable, continue with basic photo preparation.</span></label>');
}
function openGarmentUpload(file,{autoProcess=false,generate3d}={}){resetGarmentUpload({keepDialog:true});ensureGenerate3dOption();$("#generate-garment-3d").checked=generate3d===undefined?state.camera.generate3d===true:generate3d;$("#garment-upload-dialog").showModal();if(file){selectGarmentFile(file);if(autoProcess){$("#garment-upload-dialog").classList.add("camera-prefilled");void processGarmentUpload()}}}
function showAutoExtractSource(file,index,total){
  if(state.garmentUpload.sourceUrl)URL.revokeObjectURL(state.garmentUpload.sourceUrl);
  state.garmentUpload.sourceUrl=URL.createObjectURL(file);
  $("#garment-source-preview").innerHTML=`<img src="${state.garmentUpload.sourceUrl}" alt="Selected outfit preview"><div><b>${escapeHtml(file.name||`Photo ${index}`)}</b><span>Photo ${index} of ${total}</span></div>`;
  $("#garment-source-preview").classList.remove("hidden");
}
function openAutoExtract(files,{generate3d}={}){
  resetGarmentUpload({keepDialog:true});
  ensureGenerate3dOption();
  $("#generate-garment-3d").checked=generate3d===undefined?state.camera.generate3d===true:generate3d;
  $("#garment-upload-dialog").showModal();$("#garment-upload-dialog").classList.add("camera-prefilled","auto-extract-processing");
  state.garmentUpload={autoExtract:true,files:[...files],savedCount:0,detectedItems:[],preparedItems:[]};
  $(".upload-dialog-heading h2").textContent="Auto Extract your clothes";
  $(".upload-dialog-heading p").textContent="Every detected piece will appear below. Review the prepared items and save the ones you want.";
  $(".upload-privacy-note b").textContent=`${files.length} shared AI call${files.length===1?"":"s"}`;
  $("[data-upload-step=\"gemini\"]").textContent="Scan photos";$("[data-upload-step=\"oracle\"]").textContent="Auto Extract";$("[data-upload-step=\"review\"]").textContent="Review & save";
  void processAutoExtractBatch();
}
function extractionRegion(item){
  return {type:String(item.category||"garment").toLowerCase(),label:item.title||"Garment",boundingBox:item.boundingBox||[],visibility:item.visibility||"",visibleFraction:item.visibleFraction,occludedBy:item.occludedBy||"",extractionReady:item.extractionReady!==false,extractionObstructions:item.extractionObstructions||[]};
}
function splitReviewList(value,maximum=10){return String(value||"").split(",").map((item)=>item.trim()).filter(Boolean).slice(0,maximum)}
function manualGarmentMetadata(){return{title:"Garment",category:"",subCategory:"",brand:"",primaryColor:"",secondaryColors:[],colorDetail:"",pattern:"Solid",fit:"",material:"",fabricTexture:"",sleeveType:"",neckline:"",season:"",occasion:[],formality:"",aiDescription:""}}
async function approveImageQuality(file,approvedFiles){
  if(approvedFiles?.has(file))return true;
  const quality=await checkGarmentImageBlur(file).catch(()=>({blurry:false,score:-1}));
  if(quality.blurry&&!confirm("This photo might be too blurry to prepare well. Choose Cancel to use another photo, or OK to use it anyway."))return false;
  approvedFiles?.add(file);return true;
}
async function verifiedExtractionPremium(){
  const user=state.user;if(!user)return false;
  try{const snap=await getDocFromServer(doc(db,"users",user.uid));return state.user?.uid===user.uid&&activePremium(snap.data()?.subscription);}
  catch{return false;}
}
async function extractSingleGarmentWithRecovery(normalized,metadata,signal){
  return recoverSingleProduction(normalized.blob,metadata,{signal,onProgress:message=>{$("#garment-upload-message").textContent=message;}});
}
function autoExtractStatus(entry){
  if(entry.status==="saved")return["Saved","saved"];
  if(entry.status==="ready")return["Ready to review","ready"];
  if(entry.status==="extracting")return["Preparing…","working"];
  if(entry.status==="skipped")return["Not prepared","skipped"];
  return["Detected","detected"];
}
function renderAutoExtractResults(){
  const target=$("#auto-extract-results"),items=state.garmentUpload.detectedItems||[];if(!state.garmentUpload.autoExtract||!items.length){target.classList.add("hidden");target.innerHTML="";return}
  const ready=items.filter((item)=>item.status==="ready"||item.status==="saved").length,saved=items.filter((item)=>item.status==="saved").length,current=state.garmentUpload.currentEntry;
  target.innerHTML=`<div class="auto-extract-results-head"><div><span>YOUR DETECTED CLOTHES</span><h3>${items.length} piece${items.length===1?"":"s"} found</h3></div><p>${saved?`${saved} saved · `:""}${ready-saved} ready to review</p></div><div class="auto-extract-results-grid">${items.map((entry,index)=>{const [label,tone]=autoExtractStatus(entry),active=entry===current;const content=`${entry.previewUrl?`<img src="${entry.previewUrl}" alt="${escapeHtml(entry.metadata.title||"Prepared clothing")}">`:'<span class="auto-extract-placeholder"><svg class="nav-icon" aria-hidden="true"><use href="#icon-wardrobe"></use></svg></span>'}<div><b>${escapeHtml(entry.metadata.title||"Detected clothing")}</b><small>${escapeHtml([entry.metadata.primaryColor,entry.metadata.category].filter(Boolean).join(" · "))}</small><em class="${tone}">${label}</em>${entry.message?`<p>${escapeHtml(entry.message)}</p>`:""}</div>`;return entry.status==="ready"?`<button type="button" class="auto-extract-result ${active?"active":""}" data-review-extracted="${index}">${content}</button>`:`<article class="auto-extract-result ${active?"active":""}">${content}</article>`}).join("")}</div>`;
  target.classList.remove("hidden");
}
async function processAutoExtractBatch(){
  const files=state.garmentUpload.files||[];if(!files.length)return;
  $("#garment-upload-dialog").classList.remove("processing-failed");$("#process-garment").textContent="Try Auto Extract again";
  const controller=new AbortController();state.garmentUpload.controller=controller;state.garmentUpload.detectedItems=[];state.garmentUpload.preparedItems=[];state.garmentUpload.approvedBlurFiles??=new Set();setGarmentUploadBusy(true);const prepared=[];let skipped=0;
  try{
    const premium=await verifiedExtractionPremium();
    for(let photoIndex=0;photoIndex<files.length;photoIndex+=1){
      try{
      const file=files[photoIndex];showAutoExtractSource(file,photoIndex+1,files.length);
      $("#garment-upload-message").textContent=`Checking photo ${photoIndex+1} of ${files.length}…`;setUploadStep("gemini","active");
      if(!await approveImageQuality(file,state.garmentUpload.approvedBlurFiles)){skipped+=1;continue}
      const normalized=await normalizeGarmentImage(file);let result;
      try{result=await analyzeStyleCheck(state.user,normalized.blob,{signal:controller.signal})}
      finally{await refreshQuota().catch(()=>{})}
      const clothing=result.analysis.clothing||[];
      console.info("[auto-extract] analysis_ready", {
        photo: photoIndex+1,
        provider: result.provider,
        model: result.model,
        detected: clothing.length,
        extractionReady: clothing.filter(isGarmentExtractionReady).length,
        regions: clothing.map((item)=>({title:item.title,category:item.category,boundingBox:item.boundingBox,visibility:item.visibility,visibleFraction:item.visibleFraction})),
      });
      if(!clothing.length){
        // A clear flat-lay can be rejected by the outfit detector even though it is
        // perfectly usable for wardrobe/3D processing. Keep the source reviewable
        // and ask the single-garment analyzer for the detailed conditioning data.
        let fallbackAnalysis=null;
        if(premium||$('#generate-garment-3d')?.checked){
          try{fallbackAnalysis=await analyzeGarment(state.user,normalized.blob,{signal:controller.signal});await refreshQuota().catch(()=>{});}catch(error){if(error.name==="AbortError")throw error;console.warn("[auto-extract] single_garment_fallback_analysis_failed",{message:error?.message||"unknown"});}
        }
        const metadata=fallbackAnalysis?.metadata||manualGarmentMetadata();
        const sourceGroup={blob:normalized.blob,analysisId:`${Date.now()}-${photoIndex}-fallback`,uploadPromise:null};
        const entry={metadata,sourceName:file.name||`Photo ${photoIndex+1}`,sourceGroup,status:"ready",message:"The outfit detector found no worn regions. Review this clear garment photo as a single item."};
        entry.cutoutBlob=normalized.blob;entry.previewUrl=URL.createObjectURL(normalized.blob);entry.diagnostics={engine:"original_fallback",mode:"single_garment_review"};
        if($('#generate-garment-3d')?.checked&&fallbackAnalysis)try{
          const value=await generateGhostFromPhoto(state.user,normalized.blob,metadata,{signal:controller.signal,onProgress:message=>{$('#garment-upload-message').textContent=message;},onQuota:()=>refreshQuota().catch(()=>{})});
          URL.revokeObjectURL(entry.previewUrl);Object.assign(entry,{ghostPrepared:value,originalBlob:normalized.blob,cutoutBlob:value.blob,previewUrl:URL.createObjectURL(value.blob),message:'3D image passed the photo comparison.'});
        }catch(error){if(error.name==='AbortError')throw error;entry.message=error.message;}
        state.garmentUpload.detectedItems.push(entry);prepared.push(entry);renderAutoExtractResults();continue;
      }
      setUploadStep("gemini","done");setUploadStep("oracle","active");
      const sourceGroup={blob:normalized.blob,analysisId:result.analysis.id||`${Date.now()}-${photoIndex}`,uploadPromise:null};
      const regions=clothing.map(extractionRegion),entries=clothing.map((metadata)=>({metadata,sourceName:file.name||`Photo ${photoIndex+1}`,sourceGroup,status:"detected",message:""}));
      state.garmentUpload.detectedItems.push(...entries);renderAutoExtractResults();
      const ghostRequested=$("#generate-garment-3d")?.checked===true;
      const generated=[];
      if(ghostRequested)for(let index=0;index<entries.length;index++){
        if(!isGarmentExtractionReady(entries[index].metadata))continue;
        try{
          const source=(await cropGarmentImage(normalized.blob,regions[index].boundingBox,.05)).blob;
          $("#garment-upload-message").textContent=`Generating 3D garment ${index+1} of ${entries.length}…`;
          const value=await generateGhostFromPhoto(state.user,source,entries[index].metadata,{signal:controller.signal,onProgress:message=>{$('#garment-upload-message').textContent=message;},onQuota:()=>refreshQuota().catch(()=>{})});
          Object.assign(entries[index],{ghostPrepared:value,originalBlob:source,cutoutBlob:value.blob,previewUrl:URL.createObjectURL(value.blob),status:"ready"});generated.push(index);renderAutoExtractResults();
        }catch(error){if(error.name==='AbortError')throw error;entries[index].message=error.message;$('#garment-upload-message').textContent='Using basic photo preparation for this garment.';if(error.status>=500)break;}
      }
      const extraction=generated.length===entries.length?{items:[],skipped:[]}:await extractRegionsProduction(state.user,normalized.blob,regions.map((region,index)=>generated.includes(index)?{...region,extractionReady:false}:region),{
        premium:premium||ghostRequested,signal:controller.signal,
        onProgress:message=>{$("#garment-upload-message").textContent=message;},
        onItem:item=>{const entry=entries[item.index];entry.cutoutBlob=item.blob;entry.diagnostics=item.diagnostics;entry.previewUrl=URL.createObjectURL(item.blob);entry.status="ready";renderAutoExtractResults();}
      });
      for(const index of generated)prepared.push(entries[index]);
      for(const item of extraction.items)prepared.push(entries[item.index]);
      for(const failure of extraction.skipped){if(generated.includes(failure.index))continue;const entry=entries[failure.index];entry.status="skipped";entry.message=failure.message;skipped+=1;}
      renderAutoExtractResults();
      }catch(error){if(error.name==="AbortError")throw error;skipped+=1;console.warn("[web-extraction] photo_failed",{photo:photoIndex+1,status:error?.status||0,message:error?.message||"unknown"});continue}
    }
    if(!prepared.length)throw new Error("No clear garments could be extracted. Try a brighter photo with each item fully visible.");
    setUploadStep("oracle","done");state.garmentUpload.preparedItems=prepared;state.garmentUpload.reviewTotal=prepared.length;state.garmentUpload.reviewIndex=1;
    showPreparedGarment(prepared[0],0);$("#garment-upload-message").textContent=skipped?`${prepared.length} item${prepared.length===1?" is":"s are"} ready. ${skipped} other detected piece${skipped===1?" was":"s were"} not clean enough to prepare.`:`All ${prepared.length} detected item${prepared.length===1?" is":"s are"} ready to review.`;
  }catch(error){
    if(error.name!=="AbortError"){$("#garment-upload-message").textContent=error.message;$("#garment-upload-dialog").classList.add("processing-failed");const active=$("#garment-process-steps .active");active?.classList.replace("active","error")}
  }finally{state.garmentUpload.controller=null;setGarmentUploadBusy(false)}
}
function captureGarmentReviewEdits(){
  state.garmentUpload.generate3d=$("#generate-garment-3d")?.checked===true;
  if(state.garmentUpload.metadata)readGarmentEvidence($('#garment-review-form'),state.garmentUpload.metadata);
  const entry=state.garmentUpload.currentEntry;if(!entry)return;
  Object.assign(entry.metadata,{title:$("#upload-title").value.trim(),category:$("#upload-category").value.trim(),subCategory:$("#upload-subcategory").value.trim(),primaryColor:$("#upload-color").value.trim(),colorDetail:$("#upload-color-detail")?.value.trim()||entry.metadata.colorDetail||"",brand:$("#upload-brand").value.trim(),pattern:$("#upload-pattern").value.trim(),material:$("#upload-material").value.trim(),fabricTexture:$("#upload-fabric-texture")?.value.trim()||entry.metadata.fabricTexture||"",fit:$("#upload-fit").value.trim(),stylingUsage:$("#upload-styling-usage").value,userOccasions:splitReviewList($("#upload-occasions").value),activitySuitability:splitReviewList($("#upload-activities").value)});
  entry.hiddenFromAI=$("#upload-hidden-ai").checked;
}
function openExtractedReview(detectedIndex){
  if(state.garmentUpload.busy)return;const entry=(state.garmentUpload.detectedItems||[])[detectedIndex];if(!entry||entry.status!=="ready")return;
  captureGarmentReviewEdits();const index=(state.garmentUpload.preparedItems||[]).indexOf(entry);if(index>=0)showPreparedGarment(entry,index);
}
function showPreparedGarment(entry,index=(state.garmentUpload.preparedItems||[]).indexOf(entry)){
  if(state.garmentUpload.cutoutUrl&&!state.garmentUpload.autoExtract)URL.revokeObjectURL(state.garmentUpload.cutoutUrl);
  state.garmentUpload.generate3d=$("#generate-garment-3d")?.checked===true||state.garmentUpload.generate3d===true;
  state.garmentUpload.currentEntry=entry;state.garmentUpload.currentPreparedIndex=Math.max(0,index);state.garmentUpload.reviewIndex=Math.max(0,index)+1;state.garmentUpload.metadata=entry.metadata;state.garmentUpload.cutoutBlob=entry.cutoutBlob;state.garmentUpload.extractedBlob=entry.cutoutBlob;state.garmentUpload.useOriginal=false;state.garmentUpload.diagnostics=entry.diagnostics;state.garmentUpload.cutoutUrl=entry.previewUrl||URL.createObjectURL(entry.cutoutBlob);
  populateGarmentReview(entry.metadata);$("#upload-hidden-ai").checked=Boolean(entry.hiddenFromAI);$("#garment-cutout-preview").src=state.garmentUpload.cutoutUrl;$("#garment-upload-form").classList.add("hidden");$("#garment-review-form").classList.remove("hidden");setUploadStep("review","active");
  const auto=Boolean(state.garmentUpload.autoExtract),remaining=(state.garmentUpload.preparedItems||[]).filter((item)=>item.status==="ready").length;
  $("#garment-review-count").textContent=auto?`ITEM ${state.garmentUpload.reviewIndex} OF ${state.garmentUpload.reviewTotal}`:"";$("#garment-review-count").classList.toggle("hidden",!auto);
  $("#retry-garment").textContent=auto?"Skip this item":"Choose another photo";$("#toggle-garment-image").classList.toggle("hidden",auto||!state.garmentUpload.originalBlob);$("#toggle-garment-image").textContent="Use original photo";$("#save-uploaded-garment").textContent=state.garmentUpload.generate3d?"Save & generate 3D":(auto&&remaining>1?"Save & continue":"Save to wardrobe");
  $(".upload-dialog-heading h2").textContent=auto?`Review your extracted clothes`:"Review your closet item";
  $("#save-uploaded-garment").textContent=auto&&remaining>1?"Save & continue":"Save to wardrobe";
  $(".upload-dialog-heading p").textContent=auto?"All detected pieces are shown below. Select any ready item to review its details.":"Check the prepared image and details before saving.";renderAutoExtractResults();
}
function nextReadyExtracted(exclude){return(state.garmentUpload.preparedItems||[]).find((entry)=>entry!==exclude&&entry.status==="ready")||null}
function launchGhostGeneration(id){if(!id)return;toast("3D generation started. Your original image is already saved.");setTimeout(()=>ghostStudio.open(id),80)}
function finishAutoExtractReview(){const saved=state.garmentUpload.savedCount||0,generate3dId=state.garmentUpload.generated3dIds?.[0]||"";resetGarmentUpload();$("#garment-upload-dialog").close();resetCameraPhoto();toast(saved?`${saved} item${saved===1?"":"s"} added to your wardrobe.`:"No items were saved.");launchGhostGeneration(generate3dId)}
function handleGarmentReviewSecondaryAction(){
  if(!state.garmentUpload.autoExtract){resetGarmentUpload({keepDialog:true});return}
  const current=state.garmentUpload.currentEntry;if(current&&current.status==="ready"){current.status="skipped";current.message="Skipped by you."}
  const next=nextReadyExtracted(current);if(next)showPreparedGarment(next);else finishAutoExtractReview();
}
function closeGarmentUpload(){if(state.garmentUpload.busy)return;resetGarmentUpload();$("#garment-upload-dialog").close()}
function resetGarmentUpload({keepDialog=false}={}){
  state.garmentUpload.controller?.abort();
  if(state.garmentUpload.sourceUrl)URL.revokeObjectURL(state.garmentUpload.sourceUrl);
  const previewUrls=new Set((state.garmentUpload.detectedItems||[]).map((item)=>item.previewUrl).filter(Boolean));
  previewUrls.forEach((url)=>URL.revokeObjectURL(url));
  if(state.garmentUpload.cutoutUrl&&!previewUrls.has(state.garmentUpload.cutoutUrl))URL.revokeObjectURL(state.garmentUpload.cutoutUrl);
  state.garmentUpload={};
  $("#garment-upload-dialog").classList.remove("camera-prefilled","processing-failed","auto-extract-processing");
  $(".upload-dialog-heading h2").textContent="Single Garment";$(".upload-dialog-heading p").textContent="Choose one clear item photo, then review its prepared image and details before saving.";
  $(".upload-privacy-note b").textContent="Photo preparation";$("[data-upload-step=\"gemini\"]").textContent="Scan photo";$("[data-upload-step=\"oracle\"]").textContent="Single Garment";$("[data-upload-step=\"review\"]").textContent="Review & save";$("#process-garment").textContent="Single Garment";
  $("#garment-photo").value="";$("#garment-upload-message").textContent="";$("#garment-save-message").textContent="";
  if($("#generate-garment-3d"))$("#generate-garment-3d").checked=false;
  $("#garment-source-preview").classList.add("hidden");$("#garment-source-preview").innerHTML="";
  $("#auto-extract-results").classList.add("hidden");$("#auto-extract-results").innerHTML="";$("#garment-review-count").classList.add("hidden");
  $("#toggle-garment-image").classList.add("hidden");
  $("#garment-review-form").classList.add("hidden");$("#garment-upload-form").classList.remove("hidden");
  ["gemini","oracle","review"].forEach((name)=>setUploadStep(name,""));
  setGarmentUploadBusy(false);
  if(!keepDialog&&$("#garment-upload-dialog").open)$("#garment-upload-dialog").close();
}
function selectGarmentFile(file){
  try{
    validateGarmentFile(file);
    if(state.garmentUpload.sourceUrl)URL.revokeObjectURL(state.garmentUpload.sourceUrl);
    state.garmentUpload.file=file;state.garmentUpload.sourceUrl=URL.createObjectURL(file);
    $("#garment-source-preview").innerHTML=`<img src="${state.garmentUpload.sourceUrl}" alt="Selected garment preview"><div><b>${escapeHtml(file.name||"Garment photo")}</b><span>${(file.size/1024/1024).toFixed(2)} MB · Ready to process</span></div>`;
    $("#garment-source-preview").classList.remove("hidden");$("#garment-upload-message").textContent="";$("#process-garment").disabled=false;
  }catch(error){state.garmentUpload.file=null;$("#process-garment").disabled=true;$("#garment-upload-message").textContent=error.message}
}
async function processGarmentUpload(event){
  event?.preventDefault();if(state.garmentUpload.autoExtract){await processAutoExtractBatch();return}const file=state.garmentUpload.file;if(!file)return;
  const controller=new AbortController();state.garmentUpload.controller=controller;setGarmentUploadBusy(true);$("#garment-upload-dialog").classList.remove("processing-failed");$("#process-garment").textContent="Single Garment";$("#garment-upload-message").textContent="Preparing your photo…";
  try{
    state.garmentUpload.approvedBlurFiles??=new Set();if(!await approveImageQuality(file,state.garmentUpload.approvedBlurFiles))throw new Error("Choose a sharper photo with the complete garment visible.");
    const normalized=await normalizeGarmentImage(file);state.garmentUpload.normalizedBlob=normalized.blob;state.garmentUpload.originalBlob=file;
    setUploadStep("gemini","active");setUploadStep("oracle","active");$("#garment-upload-message").textContent="Identifying and preparing the garment…";
    const premium=await verifiedExtractionPremium();
    const ghostRequested=$("#generate-garment-3d")?.checked===true;
    const analysisPromise=analyzeGarment(state.user,normalized.blob,{signal:controller.signal}).finally(()=>refreshQuota().catch(()=>{}));
    const directPromise=(async()=>{
      if(ghostRequested)try{
        const details=await analysisPromise;
        if(!details?.metadata)throw Error('Garment details unavailable');
        $("#garment-upload-message").textContent="Generating your 3D garment…";
        const value=await generateGhostFromPhoto(state.user,normalized.blob,details.metadata,{signal:controller.signal,onProgress:message=>{$('#garment-upload-message').textContent=message;},onQuota:()=>refreshQuota().catch(()=>{})});
        state.garmentUpload.ghostPrepared=value;
        return {blob:value.blob,diagnostics:{engine:'ghost_3d'}};
      }catch(error){if(error.name==='AbortError')throw error;state.garmentUpload.ghostFailure=error.message;$("#garment-upload-message").textContent="Using basic photo preparation for this garment…";}
      return extractSingleProduction(state.user,file,{premium:premium||ghostRequested,signal:controller.signal,onProgress:message=>{$("#garment-upload-message").textContent=message;}});
    })();
    const [analysisResult,directResult]=await Promise.allSettled([analysisPromise,directPromise]);
    if(analysisResult.status==="rejected"&&analysisResult.reason?.name==="AbortError")throw analysisResult.reason;
    if(directResult.status==="rejected"&&directResult.reason?.name==="AbortError")throw directResult.reason;
    const analysis=analysisResult.status==="fulfilled"?analysisResult.value:null;
    const metadata=analysis?.metadata||manualGarmentMetadata();state.garmentUpload.metadata=metadata;state.garmentUpload.provider=analysis?.provider||"unavailable";state.garmentUpload.model=analysis?.model||"unavailable";
    if(analysis)setUploadStep("gemini","done");else {$("[data-upload-step=\"gemini\"]").textContent="Add details";setUploadStep("gemini",premium?"error":"done");}
    let extraction=directResult.status==="fulfilled"?{...directResult.value,inputBlob:normalized.blob,strategy:"direct"}:null;
    let extractionError=directResult.status==="rejected"?directResult.reason:null;
    if(!extraction){
      try{extraction=await extractSingleGarmentWithRecovery(normalized,metadata,controller.signal,extractionError)}catch(error){if(error.name==="AbortError")throw error;extractionError=error}
    }
    if(extraction){
      state.garmentUpload.cutoutBlob=extraction.blob;state.garmentUpload.extractedBlob=extraction.blob;state.garmentUpload.useOriginal=false;state.garmentUpload.diagnostics=extraction.diagnostics;state.garmentUpload.cutoutUrl=URL.createObjectURL(extraction.blob);setUploadStep("oracle","done");console.info("[web-extraction] engine_selected",{engine:extraction.diagnostics?.engine||"on_device",mode:"single_garment",strategy:extraction.strategy||"direct",requestId:extraction.diagnostics?.requestId||"unavailable"});
    }else{
      state.garmentUpload.cutoutBlob=file;state.garmentUpload.extractedBlob=null;state.garmentUpload.useOriginal=true;state.garmentUpload.cutoutUrl=URL.createObjectURL(file);setUploadStep("oracle","error");console.warn("[web-extraction] original_fallback",{mode:"single_garment",reason:extractionError?.message||"oracle_unavailable"});
    }
    state.garmentUpload.generate3d=$("#generate-garment-3d")?.checked===true;
    setUploadStep("review","active");populateGarmentReview(metadata);$("#garment-cutout-preview").src=state.garmentUpload.cutoutUrl;$("#toggle-garment-image").classList.toggle("hidden",!state.garmentUpload.extractedBlob);$("#toggle-garment-image").textContent=state.garmentUpload.useOriginal?"Use prepared cutout":"Use original photo";$("#garment-upload-message").textContent=[extraction?"Your garment image is ready.":"A clean cutout could not be prepared, so the original photo is selected.",analysis?"":"Enter the garment name and category to continue."].filter(Boolean).join(" ");$("#garment-upload-form").classList.add("hidden");$("#garment-review-form").classList.remove("hidden");
    $("#save-uploaded-garment").textContent="Save to wardrobe";
    const notices=[];if(state.garmentUpload.ghostFailure)notices.push(state.garmentUpload.ghostFailure);if(!analysis)notices.push('Photo analysis was unavailable. Enter color, fabric and garment details before saving');if(!extraction)notices.push("The original photo is selected because a clean cutout could not be prepared");$("#garment-save-message").textContent=notices.length?`${notices.join(". ")}.`:"";
  }catch(error){if(error.name!=="AbortError"){$("#garment-upload-message").textContent=error.message;$("#garment-upload-dialog").classList.add("processing-failed");$("#process-garment").textContent="Try again";const active=$("#garment-process-steps .active");active?.classList.replace("active","error")}}
  finally{state.garmentUpload.controller=null;setGarmentUploadBusy(false)}
}
function populateGarmentReview(item){
  renderGarmentEvidence($('#garment-review-form'),item);
  $("#upload-title").value=item.title||"";$("#upload-category").value=item.category||"";$("#upload-subcategory").value=item.subCategory||"";$("#upload-color").value=item.primaryColor||"";$("#upload-brand").value=item.brand||"";$("#upload-pattern").value=item.pattern||"";$("#upload-material").value=item.material||"";$("#upload-fit").value=item.fit||"";$("#upload-styling-usage").value=item.stylingUsage||"standard";$("#upload-occasions").value=(item.userOccasions||item.occasion||[]).join(", ");$("#upload-activities").value=(item.activitySuitability||[]).join(", ");$("#upload-hidden-ai").checked=Boolean(item.hiddenFromAI);
}
function toggleGarmentImageChoice(){
  if(state.garmentUpload.autoExtract||!state.garmentUpload.originalBlob)return;
  state.garmentUpload.useOriginal=!state.garmentUpload.useOriginal;
  const blob=state.garmentUpload.useOriginal?state.garmentUpload.originalBlob:state.garmentUpload.extractedBlob;
  if(!blob)return;URL.revokeObjectURL(state.garmentUpload.cutoutUrl);state.garmentUpload.cutoutBlob=blob;state.garmentUpload.cutoutUrl=URL.createObjectURL(blob);$("#garment-cutout-preview").src=state.garmentUpload.cutoutUrl;$("#toggle-garment-image").textContent=state.garmentUpload.useOriginal?"Use prepared cutout":"Use original photo";$("#garment-save-message").textContent=state.garmentUpload.useOriginal?"The original photo will be saved.":"The prepared cutout will be saved.";
}
function uploadCategoryStructure(category,stylingUsage="standard"){const text=String(category||"").toLowerCase();if(stylingUsage==="private_innerwear"||text==="innerwear")return{layerRole:"base"};if(text==="one-piece"||text==="traditional set"||/dress|saree|lehenga|anarkali|jumpsuit|romper/.test(text))return{layerRole:"standalone",standaloneOutfit:true};if(text==="outerwear"||/outer|jacket|coat|blazer|cardigan/.test(text))return{layerRole:"outer",requiresBaseLayer:true};if(text==="footwear"||text==="accessory"||/shoe|footwear|bag|headwear|scarf|accessor/.test(text))return{layerRole:"accessory"};return{layerRole:"regular"}}
async function ensureAutoExtractSourceUpload(entry){
  const group=entry?.sourceGroup;if(!group)return null;
  if(!group.uploadPromise)group.uploadPromise=(async()=>{try{const prepared=await optimizeGarmentUpload(group.blob,{backgroundRemoved:false});return await uploadGarmentImage(state.user,prepared.blob)}catch(error){console.warn("[web-extraction] source_upload_failed",{message:error?.message||"unknown"});return null}})();
  return group.uploadPromise;
}
async function saveGarmentUpload(event){
  event.preventDefault();captureGarmentReviewEdits();const selectedBlob=state.garmentUpload.cutoutBlob,metadata=state.garmentUpload.metadata;if(!selectedBlob||!metadata)return;
  const autoExtract=Boolean(state.garmentUpload.autoExtract);
  const category=$("#upload-category").value.trim(),title=$("#upload-title").value.trim();if(!title||!category){$("#garment-save-message").textContent="Name and category are required.";return}
  const button=$("#save-uploaded-garment");setGarmentUploadBusy(true);button.disabled=true;$("#close-garment-upload").disabled=true;$("#retry-garment").disabled=true;$("#toggle-garment-image").disabled=true;$("#garment-save-message").textContent="Uploading the finished garment…";let upload;const createdUploads=[];
  try{
    const current=state.garmentUpload.currentEntry,sourceUpload=autoExtract?await ensureAutoExtractSourceUpload(current):null;
    const bgRemoved=autoExtract||!state.garmentUpload.useOriginal,prepared=await optimizeGarmentUpload(selectedBlob,{backgroundRemoved:bgRemoved});
    upload=await uploadGarmentImage(state.user,prepared.blob);createdUploads.push(upload);
    const stylingUsage=$("#upload-styling-usage").value||"standard",privateItem=stylingUsage==="private_innerwear",structure=uploadCategoryStructure(category,stylingUsage),hiddenFromAI=$("#upload-hidden-ai").checked||privateItem,userOccasions=splitReviewList($("#upload-occasions").value),activitySuitability=splitReviewList($("#upload-activities").value);
    const record={userId:state.user.uid,type:"wardrobe",image:upload.imageUrl,imageObjectKey:upload.objectKey,bgRemoved,title,category,subCategory:$("#upload-subcategory").value.trim(),categoryRole:category,...structure,userOccasions,activitySuitability,userRestrictions:"",stylingUsage,privateItem,userConfirmed:true,brand:$("#upload-brand").value.trim(),primaryColor:$("#upload-color").value.trim(),secondaryColors:metadata.secondaryColors||[],pattern:$("#upload-pattern").value.trim()||"Solid",fit:$("#upload-fit").value.trim(),material:$("#upload-material").value.trim(),sleeveType:metadata.sleeveType||"",neckline:metadata.neckline||"",season:metadata.season||"",occasion:metadata.occasion||[],formality:metadata.formality||"",favorite:false,laundryStatus:"Clean",remarks:"",tags:[autoExtract?"auto-extract":"single-garment",bgRemoved?"background-removed":"original-photo","web-upload"],aiDescription:metadata.aiDescription||"",rating:0,timesWorn:0,hiddenFromAI,processingFlow:autoExtract?"auto_extract":"single_garment",createdAt:serverTimestamp()};
    record.colorDetail=$("#upload-color-detail")?.value.trim()||metadata.colorDetail||"";
    record.fabricTexture=$("#upload-fabric-texture")?.value.trim()||metadata.fabricTexture||"";
    if(metadata.technical3DDetails)record.technical3DDetails=metadata.technical3DDetails;
    if(metadata.visualProfile)record.visualProfile=metadata.visualProfile;
    const ghostPrepared=state.garmentUpload.useOriginal?null:(autoExtract?current?.ghostPrepared:state.garmentUpload.ghostPrepared);
    if(ghostPrepared){
      const source=autoExtract?current.originalBlob:state.garmentUpload.normalizedBlob;
      const original=await uploadGarmentImage(state.user,(await optimizeGarmentUpload(source,{backgroundRemoved:false})).blob);
      createdUploads.push(original);record.image=original.imageUrl;record.imageObjectKey=original.objectKey;record.bgRemoved=false;
      record.ghostMannequin={image:upload.imageUrl,imageObjectKey:upload.objectKey,sourceImage:original.imageUrl,...ghostPrepared.analysis,quality:ghostPrepared.quality,kind:'ai_generated',createdAt:serverTimestamp()};
    }
    if(autoExtract)record.extractionMethod="person-box";else if(!bgRemoved)record.extractionMethod="original";
    if(sourceUpload?.imageUrl)record.sourceImageUrl=sourceUpload.imageUrl;if(current?.sourceGroup?.analysisId)record.sourceAnalysisId=current.sourceGroup.analysisId;
    if(record.visualProfile)record.visualProfile={...record.visualProfile,sourceImage:record.image};
    const ref=await addDoc(collection(db,"wardrobe"),record);createdUploads.length=0;state.wardrobe.unshift({id:ref.id,...record,createdAt:new Date()});
    void setDoc(doc(db,"users",state.user.uid),{wardrobeCount:state.wardrobe.length,lastActive:serverTimestamp()},{merge:true}).catch(()=>{});
    if(ghostPrepared)state.garmentImageModes[ref.id]='3d';
    renderAll();
    if(autoExtract){
      current.status="saved";current.hiddenFromAI=hiddenFromAI;Object.assign(current.metadata,{title,category,subCategory:$("#upload-subcategory").value.trim(),primaryColor:$("#upload-color").value.trim(),brand:$("#upload-brand").value.trim(),pattern:$("#upload-pattern").value.trim(),material:$("#upload-material").value.trim(),fit:$("#upload-fit").value.trim(),stylingUsage,userOccasions,activitySuitability});state.garmentUpload.savedCount=(state.garmentUpload.savedCount||0)+1;renderAutoExtractResults();
      const next=nextReadyExtracted(current);if(next){$("#garment-save-message").textContent="";showPreparedGarment(next);toast(`${title} was added. Review another detected item.`)}else{setUploadStep("review","done");finishAutoExtractReview()}
    }else{
      setUploadStep("review","done");resetGarmentUpload();$("#garment-upload-dialog").close();toast(`${title} was added to your wardrobe.`);
    }
  }catch(error){for(const pending of createdUploads)await deleteGarmentUpload(state.user,pending.objectKey).catch(()=>{});$("#garment-save-message").textContent=error.message}
  finally{setGarmentUploadBusy(false);button.disabled=false;$("#close-garment-upload").disabled=false;$("#retry-garment").disabled=false;$("#toggle-garment-image").disabled=false}
}

function openLookBuilder(){state.lookSlots={};$("#look-name").value="";$("#look-occasion").value="";$("#look-picker-search").value="";renderLookBuilder();$("#look-builder-dialog").showModal()}
function renderLookBuilder(){const labels={top:"Top",bottom:"Bottom",layer:"Layer",hero:"One-piece",footwear:"Footwear",accessory:"Accessory"};$("#look-slots").innerHTML=Object.entries(labels).map(([slot,label])=>{const item=state.wardrobe.find(x=>x.id===state.lookSlots[slot]);return`<article class="look-slot"><span>${label}</span>${item?`<img src="${safeUrl(item.image)}" alt="${escapeHtml(item.title)}"><b>${escapeHtml(item.title)}</b><button data-clear-slot="${slot}" aria-label="Remove ${label}">×</button>`:'<p>Choose an item</p>'}</article>`}).join("");renderLookPicker()}
function renderLookPicker(){const queryText=$("#look-picker-search").value;const items=state.wardrobe.filter(item=>matchesGarmentSearch(item,queryText));$("#look-picker").innerHTML=items.length?items.map(item=>`<button data-pick-item="${escapeHtml(item.id)}"><img src="${safeUrl(item.image)}" alt="${escapeHtml(item.title)}"><span><b>${escapeHtml(item.title||"Garment")}</b><small>${escapeHtml(pretty(lookbookSlotFor(item)))}</small></span></button>`).join(""):emptyBlock("No matches","Try a category, color, brand, or garment name.")}
function selectLookItem(id){const item=state.wardrobe.find(x=>x.id===id);if(!item)return;const slot=lookbookSlotFor(item);if(slot==="hero"){delete state.lookSlots.top;delete state.lookSlots.bottom;delete state.lookSlots.layer}else if(["top","bottom","layer"].includes(slot)){delete state.lookSlots.hero}state.lookSlots[slot]=id;renderLookBuilder()}
async function saveLook(){const ids=Object.values(state.lookSlots);if(ids.length<2)return toast("Choose at least two pieces.");const button=$("#save-look");button.disabled=true;try{const title=$("#look-name").value.trim()||"My Lookbook outfit",occasion=$("#look-occasion").value.trim()||"Any occasion";const ref=await addDoc(collection(db,"savedOutfits"),{userId:state.user.uid,lookbook:true,source:"user_created",occasion,wardrobeItemIds:ids,outfit:{score:100,title,subtitle:"Styled by you in Lookbook.",wardrobeItemIds:ids,reasoning:["Styled by you in Lookbook."],shoppingSuggestions:[]},createdAt:serverTimestamp(),updatedAt:serverTimestamp()});state.outfits.unshift({id:ref.id,userId:state.user.uid,lookbook:true,source:"user_created",occasion,wardrobeItemIds:ids,outfit:{score:100,title,subtitle:"Styled by you in Lookbook.",wardrobeItemIds:ids}});$("#look-builder-dialog").close();renderLooks(state.outfits);renderOutfitLibrary();renderPlannerOptions();toast("Lookbook outfit saved.")}catch(error){toast(`Could not save look: ${error.message}`)}finally{button.disabled=false}}
async function deleteSavedLook(id){const look=state.outfits.find(x=>x.id===id);if(!look||look.userId!==state.user.uid||!look.lookbook||look.source!=="user_created")return;if(!confirm("Delete this saved Lookbook outfit? Your wardrobe garments will not be changed."))return;try{await deleteDoc(doc(db,"savedOutfits",id));state.outfits=state.outfits.filter(x=>x.id!==id);renderLooks(state.outfits);renderOutfitLibrary();renderPlannerOptions();toast("Saved look deleted. Wardrobe items were untouched.")}catch(error){toast(`Could not delete look: ${error.message}`)}}
function openSavedOutfit(id){const source=state.outfits.find(x=>x.id===id);if(!source)return;showOutfitDialog(source,"SAVED OUTFIT")}

async function requestGhostGeneration(item){
  if(!item||!state.user)return;
  const existing=await getDocs(query(collection(db,"ghostGenerationRequests"),where("userId","==",state.user.uid),where("garmentId","==",item.id),where("status","==","pending"))).catch(()=>({empty:true}));
  if(!existing.empty)return;
  await addDoc(collection(db,"ghostGenerationRequests"),{userId:state.user.uid,garmentId:item.id,title:item.title||"Garment",sourceImage:item.image,status:"pending",requestedAt:serverTimestamp()});
}

async function deleteGhostGeneration(id){
  const item=state.wardrobe.find((entry)=>entry.id===id),user=state.user;if(!user||!item?.ghostMannequin?.image)return false;
  const expectedImage=item.ghostMannequin.image,oldKey=item.ghostMannequin.imageObjectKey;
  if(!await confirmDelete3D({title:item.title}))return false;
  try{
    await runTransaction(db,async transaction=>{
      if(state.user?.uid!==user.uid)throw Error('Sign in again before deleting.');
      const ref=doc(db,'wardrobe',id),snapshot=await transaction.get(ref);
      transaction.update(ref,ghostDeletePatch(snapshot.data(),user.uid,expectedImage,deleteField()));
    });
    if(oldKey)await deleteGarmentUpload(user,oldKey).catch(()=>{});
    delete item.ghostMannequin;delete state.garmentImageModes[id];renderAll();$("#garment-dialog").close();toast("3D image deleted. Your original garment remains saved.");
    return true;
  }catch(error){toast(`Could not delete the 3D image: ${error.message}`);return false;}
}

function openGarmentDetail(id) {
  const item=state.wardrobe.find((x)=>x.id===id);
  if (!item) return;
  const has3d=Boolean(item.ghostMannequin?.image),mode=has3d&&state.garmentImageModes[id]==='3d'?'3d':'normal';
  $("#garment-detail").innerHTML=`<div class="garment-hero"><div class="garment-detail-image"><img src="${safeUrl(ghostImageForMode(item,mode))}" alt="${escapeHtml(`${item.title||'Garment'} ${mode==='3d'?'3D':'normal'} view`)}">${has3d?garmentViewToggle(item.id,mode,'detail'):''}</div><div><span class="app-kicker">GARMENT DETAILS</span><h2>${escapeHtml(item.title||"Untitled garment")}</h2><p>${escapeHtml(item.aiDescription||item.remarks||"Saved in your ClothMatics wardrobe.")}</p><div class="garment-flags">${item.favorite?"<span>Favorite</span>":""}${item.inLookbook||item.type==="lookbook"?"<span>Lookbook</span>":""}${has3d?"<span>3D saved</span>":""}</div></div></div>
  <form id="garment-edit-form" class="garment-edit-form"><label>Name<input name="title" maxlength="100" value="${escapeHtml(item.title||"")}"></label><label>Category<input name="category" maxlength="60" value="${escapeHtml(item.category||"")}"></label><label>Subcategory<input name="subCategory" maxlength="60" value="${escapeHtml(item.subCategory||"")}"></label><label>Brand<input name="brand" maxlength="80" value="${escapeHtml(item.brand||"")}"></label><label>Primary color<input name="primaryColor" maxlength="40" value="${escapeHtml(item.primaryColor||"")}"></label><label>Pattern<input name="pattern" maxlength="40" value="${escapeHtml(item.pattern||"")}"></label><label>Material<input name="material" maxlength="60" value="${escapeHtml(item.material||item.fabric||"")}"></label><label>Fit<input name="fit" maxlength="40" value="${escapeHtml(item.fit||"")}"></label><label>Laundry status<select name="laundryStatus"><option ${item.laundryStatus==="Clean"?"selected":""}>Clean</option><option ${item.laundryStatus==="Laundry"?"selected":""}>Laundry</option></select></label><label>Purchase price<input name="purchasePrice" type="number" min="0" value="${Number(item.purchasePrice)||""}"></label><label class="check-label"><input name="favorite" type="checkbox" ${item.favorite?"checked":""}> Favorite</label><label class="check-label"><input name="hiddenFromAI" type="checkbox" ${item.hiddenFromAI?"checked":""}> Hide from AI styling</label></form>
  <div class="mobile-action-note"><b>Need a new processed image?</b><span>Use Add to Closet with a new gallery photo, review it, then remove this older item.</span></div><div class="card-actions"><button type="button" data-ghost-item="${escapeHtml(item.id)}">${has3d?"Open 3D studio":"3D Ghost Mannequin"}</button><button data-save-garment="${escapeHtml(item.id)}">Save details</button><button data-style-item="${escapeHtml(item.id)}">Style this</button><button data-complete-item="${escapeHtml(item.id)}">Complete the look</button><button data-share-scope="garment" data-share-id="${escapeHtml(item.id)}">Share</button><button class="danger-button" data-delete-garment="${escapeHtml(item.id)}">Delete garment</button></div>`;
  if(has3d)$("#garment-detail .card-actions")?.insertAdjacentHTML("afterbegin",`<button type="button" data-delete-ghost="${escapeHtml(item.id)}">Delete 3D image</button>`);
  renderGarmentEvidence($('#garment-edit-form'),item,{editable:false});
  if(!$("#garment-dialog").open)$("#garment-dialog").showModal();
}

async function saveGarmentMetadata(id){
  const item=state.wardrobe.find((entry)=>entry.id===id),form=$("#garment-edit-form");if(!item||!form)return;
  const data=Object.fromEntries(new FormData(form));data.favorite=form.elements.favorite.checked;data.hiddenFromAI=form.elements.hiddenFromAI.checked;data.purchasePrice=Number(data.purchasePrice)||0;
  const patch=safeGarmentPatch(data);try{await callCoreApi(state.user,"/v1/wardrobe/update",{garmentId:id,patch});Object.assign(item,patch);renderAll();$("#garment-dialog").close();toast("Garment details saved.")}catch(error){toast(`Could not save: ${error.message}`)}
}
function wardrobeImageObjectKey(item){
  const direct=String(item?.imageObjectKey||"").trim();
  if(direct.startsWith(`users/${state.user.uid}/wardrobe/`)&&!direct.includes(".."))return direct;
  try{
    const path=decodeURIComponent(new URL(String(item?.image||"")).pathname.replace(/^\//,""));
    return path.startsWith(`users/${state.user.uid}/wardrobe/`)&&!path.includes("..")?path:"";
  }catch{return ""}
}
async function deleteGarmentWithOwnerFallback(item){
  const dependentOutfitIds=state.outfits.filter((look)=>look.userId===state.user.uid&&outfitIds(look).includes(item.id)).map((look)=>look.id);
  const dependentWearIds=state.wear.filter((record)=>record.userId===state.user.uid&&outfitIds(record).includes(item.id)).map((record)=>record.id);
  const deletions=[
    ...dependentOutfitIds.map((id)=>deleteDoc(doc(db,"savedOutfits",id))),
    ...dependentWearIds.map((id)=>deleteDoc(doc(db,"outfitWear",id))),
  ];
  const settled=await Promise.allSettled(deletions);
  const dependencyFailure=settled.find((entry)=>entry.status==="rejected");
  if(dependencyFailure)throw dependencyFailure.reason;
  await deleteDoc(doc(db,"wardrobe",item.id));
  const objectKey=wardrobeImageObjectKey(item);let imageDeleted=false;
  if(objectKey){
    try{await deleteGarmentUpload(state.user,objectKey);imageDeleted=true}
    catch(error){console.warn("[wardrobe-delete] image_cleanup_failed",error)}
  }
  return {ok:true,deletedDependencies:dependentOutfitIds.length+dependentWearIds.length,imageCleanupRequired:Boolean(objectKey),imageDeleted,fallbackUsed:true};
}
async function deleteGarment(id){
  const item=state.wardrobe.find((entry)=>entry.id===id);if(!item)return;
  const dependentOutfits=state.outfits.filter((look)=>outfitIds(look).includes(id)).length,dependentPlans=state.wear.filter((look)=>outfitIds(look).includes(id)).length;
  if(!await confirmAction(`Delete ${item.title||"this garment"}?`,`This also removes ${dependentOutfits} saved outfit reference${dependentOutfits===1?"":"s"} and ${dependentPlans} planner record${dependentPlans===1?"":"s"}. This cannot be undone.`))return;
  try{
    let result;
    try{result=await callCoreApi(state.user,"/v1/wardrobe/delete",{garmentId:id})}
    catch(coreError){console.warn("[wardrobe-delete] core_delete_failed_using_owner_fallback",coreError);result=await deleteGarmentWithOwnerFallback(item)}
    if(item.ghostMannequin?.imageObjectKey)await deleteGarmentUpload(state.user,item.ghostMannequin.imageObjectKey).catch(()=>{});
    state.wardrobe=state.wardrobe.filter((entry)=>entry.id!==id);state.outfits=state.outfits.filter((look)=>!outfitIds(look).includes(id));state.wear=state.wear.filter((look)=>!outfitIds(look).includes(id));renderAll();$("#garment-dialog").close();
    toast("Garment deleted successfully.","success");
  }catch(error){toast("We couldn’t delete this garment. Please try again.","error")}
}
function styleGarment(id){$("#garment-dialog").close();openPanel("stylist");$("#stylist-request").value="Build a polished outfit around my selected garment.";runStylist(null,id)}
function completeGarmentLook(id) {
  if ($("#garment-dialog")?.open) $("#garment-dialog").close();
  completeLookController.open(id);
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

function renderPurchaseOwnedOptions(){const select=$("#purchase-owned");if(!select)return;select.innerHTML='<option value="">Choose an item</option>'+state.wardrobe.filter((item)=>item.privateItem!==true&&item.stylingUsage!=="private_innerwear").map((item)=>`<option value="${escapeHtml(item.id)}">${escapeHtml(item.title||"Garment")} · ${escapeHtml(item.category||"Uncategorized")}</option>`).join("");renderPurchaseOwnedPreview(null);}
function renderPurchaseOwnedPreview(item){const target=$("#purchase-owned-preview");if(!target)return;target.classList.toggle("hidden",!item);target.innerHTML=item?`<img src="${safeUrl(item.image)}" alt="${escapeHtml(item.title||"Closet item")}"><div><span>STARTING POINT</span><b>${escapeHtml(item.title||"Garment")}</b><small>${escapeHtml([item.primaryColor,item.category,item.material||item.fabric].filter(Boolean).join(" · "))}</small></div>`:"";}
function useOwnedPurchaseExample(){const item=state.wardrobe.find((entry)=>entry.id===$("#purchase-owned").value);renderPurchaseOwnedPreview(item||null);if(!item)return;$("#purchase-title").value=item.title||"";$("#purchase-category").value=GARMENT_CATEGORIES.includes(item.category)?item.category:"";$("#purchase-color").value=item.primaryColor||"";$("#purchase-pattern").value=item.pattern||"";$("#purchase-material").value=item.material||item.fabric||"";$("#purchase-title").focus();}
async function runPurchaseCheck(event){event.preventDefault();const button=event.currentTarget.querySelector('[type="submit"]'),owned=state.wardrobe.find((item)=>item.id===$("#purchase-owned").value);const candidate={title:$("#purchase-title").value.trim()||owned?.title||"",category:$("#purchase-category").value.trim()||owned?.category||"",primaryColor:$("#purchase-color").value.trim()||owned?.primaryColor||"",pattern:$("#purchase-pattern").value.trim()||owned?.pattern||"",material:$("#purchase-material").value.trim()||owned?.material||owned?.fabric||"",productUrl:$("#purchase-url").value.trim()},price=Number($("#purchase-price").value)||0;if(!candidate.title&&!candidate.category)return toast("Describe the item or choose an owned garment.");button.disabled=true;$("#purchase-result").innerHTML='<div class="result-placeholder" style="display:flex;flex-direction:column;align-items:center;gap:12px;padding:24px 10px;"><div style="width:110px;height:110px;position:relative;display:flex;align-items:center;justify-content:center;"><img src="./assets/loader/outfit-build-step-2.png" alt="Comparing items" style="width:100%;height:100%;object-fit:contain;animation:outfit-morph-enter 0.5s ease-out;" /></div><b style="font-size:13px;color:var(--text, #1e1b4b);">Comparing with your wardrobe…</b></div>';try{renderPurchaseResult(deterministicPurchaseCheck(candidate,state.wardrobe,price))}catch(error){$("#purchase-result").innerHTML=`<div class="error-box"><b>Could not compare this purchase</b><p>${escapeHtml(error.message)}</p></div>`}finally{button.disabled=false}}
function renderPurchaseResult(result){const similar=(result.similarityMatches||[]).map(match=>state.wardrobe.find(x=>x.id===(match.wardrobeItemId||match.item?.id))).filter(Boolean);const looks=(result.outfitExamples||[]).map(x=>({...x,itemIds:x.itemIds||[]}));$("#purchase-result").innerHTML=`<div class="purchase-verdict"><span>WARDROBE MATCH</span><h3>${escapeHtml(pretty(result.verdict||"consider"))}</h3><p>${escapeHtml(result.summary||(result.reasons||[])[0]||"")}</p></div><div class="purchase-counts">${metricCards([[similar.length,"similar owned items"],[looks.length,"wardrobe combinations"],[result.compatiblePieceCount||new Set(looks.flatMap(x=>x.itemIds)).size,"compatible pieces"]])}</div>${similar.length?`<h4>Similar pieces you own</h4><div class="look-thumbs purchase-similar">${similar.map(item=>`<img src="${safeUrl(item.image)}" alt="${escapeHtml(item.title)}">`).join("")}</div>`:""}<h4>Ways to wear it</h4><div class="purchase-looks">${looks.slice(0,4).map((look,index)=>`<article><b>Outfit ${index+1}</b><div class="look-thumbs">${look.itemIds.map(id=>state.wardrobe.find(x=>x.id===id)).filter(Boolean).map(item=>`<img src="${safeUrl(item.image)}" alt="${escapeHtml(item.title)}">`).join("")}</div><p>${escapeHtml(look.explanation||"")}</p></article>`).join("")||emptyBlock("No complete combination found","Add more wardrobe categories through Camera.")}</div>`}

async function shareGeneratedOutfit(){const outfit=state.stylistResult?.best;if(!outfit)return;try{const saved=await callCoreApi(state.user,"/v1/outfits/save",{outfit,source:state.stylistSource||"ai_stylist_web",occasion:state.stylistResult.occasion});state.outfits.unshift({id:saved.id,userId:state.user.uid,outfit,wardrobeItemIds:outfit.wardrobeItemIds,occasion:state.stylistResult.occasion});await shareOutfit("saved",saved.id)}catch(error){toast(`Could not share: ${error.message}`)}}

async function shareOutfit(scope,id){
  let source=scope==="saved"?state.outfits.find(x=>x.id===id):state.wear.find(x=>x.id===id);
  if(scope==="garment"){const item=state.wardrobe.find(x=>x.id===id);source=item?{title:item.title,wardrobeItemIds:[item.id]}:null}
  if(!source)return;
  const ids=outfitIds(source),items=ids.map(itemId=>state.wardrobe.find(x=>x.id===itemId)).filter(Boolean);
  try{
    const payload=await callCoreApi(state.user,"/v1/share/create",{source:scope,outfitId:id||null,wardrobeItemIds:ids});
    const link=payload.url||payload.shareUrl||(payload.code?`${location.origin}/r?c=${encodeURIComponent(payload.code)}`:"");
    if(!link)throw new Error("Share link was not returned.");
    await callCoreApi(state.user,"/v1/share/log",{code:payload.code,event:"share",source:scope}).catch(()=>{});
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
  if(name==="trip")wardrobeAssistant.onEnter();
  else if(name==="profile"||name==="stylist")refreshQuota();
  window.scrollTo({ top: 0, behavior: "smooth" });
}

function confirmAction(title,copy){return new Promise((resolve)=>{const dialog=$("#confirm-dialog"),accept=$("#confirm-accept"),cancel=$("#confirm-cancel");$("#confirm-title").textContent=title;$("#confirm-copy").textContent=copy;const finish=(value)=>{accept.removeEventListener("click",yes);cancel.removeEventListener("click",no);dialog.removeEventListener("cancel",onCancel);dialog.close();resolve(value)},yes=()=>finish(true),no=()=>finish(false),onCancel=(event)=>{event.preventDefault();finish(false)};accept.addEventListener("click",yes);cancel.addEventListener("click",no);dialog.addEventListener("cancel",onCancel);dialog.showModal();accept.focus()})}

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
function safeUrl(value="") { try { const url=new URL(value); return url.protocol==="https:" ? url.href : ""; } catch { return ""; } }
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
function toast(message,tone="") { const el=$("#toast"); el.textContent=message; if(tone)el.dataset.tone=tone;else delete el.dataset.tone;el.classList.add("show"); setTimeout(()=>el.classList.remove("show"),2800); }

