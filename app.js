import { initializeApp } from "https://www.gstatic.com/firebasejs/12.15.0/firebase-app.js";
import {
  browserLocalPersistence,
  getAuth,
  GoogleAuthProvider,
  onAuthStateChanged,
  setPersistence,
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
import { calculateWeeklyReport, createGroundedFallbackLook, deterministicPurchaseCheck, eligibleWardrobe, embeddedNotificationOutfit, lookbookSlotFor, matchesGarmentSearch, prioritizeOutfitItems, promptStamp, safeGarmentPatch, shiftCalendarMonth, stableHash, validateGroundedOutfit, wardrobeFingerprint, localDateKey, normalizeOutfitScore } from "./web-core.mjs";
import { createWardrobeAssistant } from "./wardrobe-assistant.js";
import { analyzeGarment, analyzeStyleCheck, checkGarmentImageBlur, cropGarmentImage, deleteGarmentUpload, extractGarmentWithOracle, isGarmentExtractionReady, normalizeGarmentImage, optimizeGarmentUpload, uploadGarmentImage, validateGarmentFile } from "./garment-upload.mjs?v=20260911-appearance";

import {activePremium,extractSingleProduction,recoverSingleProduction,extractRegionsProduction} from "./production-extraction.mjs";

import {createGhostStudio} from "./ghost-ui.mjs?v=20260912-site-orbit-loader-v1";
import {ghostCategory,ghostImageForMode,ghostSavePatch,ghostDeletePatch,generateGhostFromPhoto,generateGhostOutfitFromPhoto} from "./ghost-mannequin.mjs";
import {LOWER_CATEGORIES} from './garment-taxonomy.mjs';
import {prepareWornOutfit,usesWornOutfitPreparation,outfitGhostCategory} from './outfit-intake.mjs';
import {hangerLoaderMarkup,updateHangerLoader,confirmDelete3D,outfitOrbitLoaderMarkup} from './garment-progress.mjs?v=20260912-site-orbit-loader-v1';
import {renderGarmentEvidence,readGarmentEvidence} from './garment-review.mjs';
import {createCompleteLookController} from './complete-look.js?v=20260912-site-orbit-loader-v1';
import {generateFullLook,fullLookImageUrl} from './full-look.mjs?v=20260920-flux-v2';

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);
await setPersistence(auth, browserLocalPersistence);

const $ = (selector) => document.querySelector(selector);
const $$ = (selector) => [...document.querySelectorAll(selector)];
function closeAllDialogs(except = null) {
  document.querySelectorAll("dialog[open]").forEach((d) => {
    if (d !== except) {
      try { d.close(); } catch {}
    }
  });
}
const state = { user: null, profile: null, profileStyle:null, quota:null, notifications:[], wardrobe: [], outfits: [], wear: [], challenges: [], outfitHistory: [], todayOutfit: null, stylistResult:null, stylistSource:"", stylistFullLookController:null, panel: "overview", calendarDate: new Date(), selectedDate: localDateKey(new Date()), outfitFilter: "all", lookSlots:{}, garmentImageModes:{}, garmentUpload:{}, camera:{mode:"closet",files:[],urls:[],activeIndex:0} };
const ghostStudio=createGhostStudio({
  getUser:()=>state.user,getItem:id=>state.wardrobe.find(item=>item.id===id),escapeHtml,safeUrl,
  onQuota:()=>refreshQuota().catch(()=>{}),onSaved:(item)=>{state.garmentImageModes[item.id]='3d';renderAll()},
  onRequestAdmin:requestGhostGeneration,
  onDelete:deleteGhostGeneration,
  onOpenGarment:(id)=>openGarmentDetail(id),
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
  if (wardrobeNav && !nav.querySelector('[data-panel="camera"]')) wardrobeNav.insertAdjacentHTML("beforebegin", '<button data-panel="camera" title="Camera" aria-label="Camera"><svg class="nav-icon" aria-hidden="true"><use href="#icon-camera"></use></svg><span>Camera</span></button>');
  if (wardrobeNav && !nav.querySelector('[data-panel="stylist"]')) wardrobeNav.insertAdjacentHTML("afterend", '<button data-panel="stylist" title="AI Stylist" aria-label="AI Stylist"><svg class="nav-icon" aria-hidden="true"><use href="#icon-sparkles"></use></svg><span>AI Stylist</span></button>');
  const plannerNav=nav?.querySelector('[data-panel="planner"]');
  if (plannerNav && !nav.querySelector('[data-panel="trip"]')) plannerNav.insertAdjacentHTML("afterend", '<button data-panel="trip" title="Wardrobe Assistant" aria-label="Wardrobe Assistant"><svg class="nav-icon" aria-hidden="true"><use href="#icon-bag"></use></svg><span>Wardrobe Assistant</span></button>');
  const profileNav=nav?.querySelector('[data-panel="profile"]');
  if (profileNav && !nav.querySelector('[data-panel="notifications"]')) profileNav.insertAdjacentHTML("beforebegin", '<button data-panel="notifications" title="Notifications" aria-label="Notifications"><svg class="nav-icon" aria-hidden="true"><use href="#icon-bell"></use></svg><span>Notifications <em id="nav-unread" class="nav-count hidden">0</em></span></button>');
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
          <div class="camera-photo-actions"><button id="camera-remove-photo" class="camera-remove-photo hidden" type="button">Remove photo</button><button id="camera-clear-all" class="camera-clear-all hidden" type="button">Clear all photos</button></div>
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
    <div id="panel-stylist" class="panel hidden"><div class="section-intro"><span>SHARED DAILY ALLOWANCE</span><h3>AI Stylist</h3><p>Create a complete outfit from clean, available pieces already in your wardrobe.</p></div><div class="ai-workspace"><form id="stylist-form" class="ai-form"><label>Occasion<select id="stylist-occasion"><option>Casual</option><option>Office</option><option>Party</option><option>Wedding</option><option>Date</option><option>Travel</option><option>Brunch</option><option>Formal</option></select></label><label>Mood<select id="stylist-mood"><option>Confident</option><option>Relaxed</option><option>Elegant</option><option>Playful</option><option>Minimal</option></select></label><label class="full">Anything specific? <span>optional</span><textarea id="stylist-request" maxlength="300" placeholder="For example: comfortable for an evening dinner"></textarea></label><div class="stylist-generation-actions full"><button id="stylist-standard" class="button button-primary" data-stylist-mode="standard" type="submit">Generate my outfit</button><button id="stylist-kaggle" class="button button-ghost" data-stylist-mode="kaggle" type="button">Generate with Kaggle</button></div><p id="stylist-message" class="form-message full" role="status"></p></form><div id="stylist-result" class="ai-result">${emptyBlock("Ready when you are","Use the first button for the existing outfit cards, or Kaggle for a complete mannequin presentation.")}</div></div></div>
    <div id="panel-trip" class="panel hidden"></div>
    <div id="panel-notifications" class="panel hidden"><div class="section-intro panel-heading-row"><div><span>INBOX</span><h3>Your notifications</h3><p>Messages sent to your ClothMatics account appear here.</p></div><button id="mark-all-notifications" class="mark-all-notifications" type="button">Mark all as read</button></div><div id="notification-list" class="notification-list"></div></div>`);
  if(!$("#panel-purchase")) appContent?.insertAdjacentHTML("beforeend",'<div id="panel-purchase" class="panel hidden"></div>');
  const purchasePanel=$("#panel-purchase");
  if(purchasePanel) purchasePanel.innerHTML=`<div class="section-intro purchase-intro"><span>BEFORE YOU BUY</span><h3>Smart Purchase Check</h3><p>Describe a store item and compare it with the clothes you already own. To analyze a clothing photo, open Camera → Style Check.</p></div><div class="purchase-layout"><form id="purchase-form" class="purchase-form"><div class="purchase-form-head"><div class="purchase-heading-icon" aria-hidden="true"><svg class="nav-icon"><use href="#icon-bag"></use></svg></div><div><span>SMART PURCHASE</span><h4>Describe the store item</h4><small>Use the product details you can see on the store page.</small></div></div><div class="purchase-fields"><label class="full-field">Product URL <span>optional</span><input id="purchase-url" type="url" maxlength="500" placeholder="https://store.example/item"></label><label class="full-field">Start from a similar closet item <span>optional</span><select id="purchase-owned"><option value="">Choose an item</option></select></label><div id="purchase-owned-preview" class="purchase-owned-preview hidden" aria-live="polite"></div><label>Item name<input id="purchase-title" maxlength="100" placeholder="e.g. Navy linen shirt" required></label><label>Category<select id="purchase-category" required>${selectOptions(GARMENT_CATEGORIES,"Select category")}</select></label><label>Color<input id="purchase-color" maxlength="40" list="purchase-colors" placeholder="e.g. Navy blue"><datalist id="purchase-colors"><option value="Black"><option value="White"><option value="Blue"><option value="Navy"><option value="Grey"><option value="Brown"><option value="Beige"><option value="Green"><option value="Red"><option value="Pink"><option value="Purple"></datalist></label><label>Pattern<input id="purchase-pattern" maxlength="40" list="purchase-patterns" placeholder="e.g. Solid"><datalist id="purchase-patterns"><option value="Solid"><option value="Striped"><option value="Checked"><option value="Printed"><option value="Floral"><option value="Textured"></datalist></label><label>Material<input id="purchase-material" maxlength="50" list="purchase-materials" placeholder="e.g. Cotton"><datalist id="purchase-materials"><option value="Cotton"><option value="Linen"><option value="Denim"><option value="Wool"><option value="Silk"><option value="Polyester"><option value="Leather"></datalist></label><label>Store price (₹)<input id="purchase-price" type="number" min="0" step="1" inputmode="numeric" placeholder="Optional"></label></div><button class="button button-primary purchase-submit" type="submit"><svg class="nav-icon" aria-hidden="true"><use href="#icon-bag"></use></svg>Compare with my wardrobe</button></form><div id="purchase-result" class="purchase-result"><div class="result-placeholder purchase-placeholder"><div class="purchase-empty-icon" aria-hidden="true"><svg class="nav-icon"><use href="#icon-bag"></use></svg></div><h4>See if it earns a place in your closet</h4><p>ClothMatics will look for duplicates and build combinations using your actual wardrobe.</p><ol class="purchase-guide"><li><b>Describe</b><span>Add the item name and category.</span></li><li><b>Compare</b><span>Check overlap with pieces you own.</span></li><li><b>Decide</b><span>Review useful outfit combinations.</span></li></ol></div></div></div>`;
  if (!$("#notification-bell")) $(".app-topbar .user-chip")?.insertAdjacentHTML("beforebegin",'<button id="notification-bell" class="notification-bell" type="button" aria-label="Open notifications"><svg class="nav-icon" aria-hidden="true"><use href="#icon-bell"></use></svg><span id="bell-unread" class="hidden">0</span></button>');
  if (!$("#quota-chip")) $(".app-topbar .user-chip")?.insertAdjacentHTML("beforebegin",'<button id="quota-chip" class="quota-chip" type="button" data-go-panel="profile" aria-label="Open plan and AI allowance"><b aria-hidden="true">AI</b><span>Loading…</span></button>');
  $("#panel-overview .companion-stats")?.insertAdjacentHTML("beforebegin",'<section id="today-pick" class="today-pick"></section><div class="quick-actions"><button data-go-panel="camera"><svg class="nav-icon" aria-hidden="true"><use href="#icon-camera"></use></svg><span><b>Camera</b><small>Add garment or Style Check</small></span></button><button data-go-panel="stylist"><svg class="nav-icon" aria-hidden="true"><use href="#icon-sparkles"></use></svg><span><b>AI outfit</b><small>Style clean pieces</small></span></button><button data-go-panel="planner"><svg class="nav-icon" aria-hidden="true"><use href="#icon-calendar"></use></svg><span><b>Planner</b><small>Choose a date</small></span></button><button data-go-panel="purchase"><svg class="nav-icon" aria-hidden="true"><use href="#icon-bag"></use></svg><span><b>Smart Purchase</b><small>Compare before buying</small></span></button></div>');
  $("#panel-profile .section-intro p")?.replaceWith(Object.assign(document.createElement("p"),{textContent:"Keep your personal details, shopping sizes, style preferences and plan status in sync with the mobile app."}));
  $("#panel-profile .profile-layout")?.insertAdjacentHTML("afterend",`<div class="profile-manage-grid"><form id="profile-form" class="profile-edit-card"><div class="profile-edit-heading"><div class="profile-heading-icon" aria-hidden="true"><svg class="nav-icon"><use href="#icon-user"></use></svg></div><div><span class="app-kicker">PERSONAL DETAILS</span><h3>Edit profile</h3><p>These details stay in sync with your ClothMatics mobile account.</p></div></div><fieldset class="profile-fieldset"><legend>About you</legend><div class="profile-form-grid"><label>Full name<input id="profile-name" maxlength="100" autocomplete="name"></label><label>Gender<select id="profile-gender"><option value="">Select gender</option><option>Male</option><option>Female</option><option>Other</option></select></label><label>Date of birth<input id="profile-dob" type="date"></label><label>Profession<input id="profile-profession" maxlength="100" autocomplete="organization-title"></label><label>Height (cm)<input id="profile-height" type="number" min="0" max="260" inputmode="decimal"></label><label>Weight (kg)<input id="profile-weight" type="number" min="0" max="400" inputmode="decimal"></label><label>City<input id="profile-city" maxlength="100" autocomplete="address-level2"></label><label><span class="field-label-row">Body type <button class="info-button" type="button" title="Choose the same self-reported body type used by the mobile profile." aria-label="About body type choices">i</button></span><select id="profile-body-type" aria-describedby="body-type-help"><option value="">Select gender first</option></select><small id="body-type-help">The choices match the mobile profile.</small></label></div></fieldset><fieldset class="profile-fieldset size-fieldset"><legend>Shopping sizes</legend><p>Use the same optional sizes available in the app. They help filter unsuitable product matches.</p><div class="profile-form-grid"><label>Top size<select id="size-top">${selectOptions(PROFILE_SIZE_OPTIONS.alpha,"Select top size")}</select></label><label>Bottom size<select id="size-bottom">${selectOptions(PROFILE_SIZE_OPTIONS.bottom,"Select bottom size")}</select></label><label id="profile-dress-field">Dress size<select id="size-dress">${selectOptions(PROFILE_SIZE_OPTIONS.alpha,"Select dress size")}</select></label><label>Shoe size<select id="size-shoes">${selectOptions(PROFILE_SIZE_OPTIONS.shoes,"Select UK / India size",true)}</select></label></div></fieldset><div class="profile-save-row"><button class="button button-primary" type="submit">Save profile</button><p id="profile-message" role="status"></p></div></form><section class="plan-card-web"><div class="plan-card-heading"><div class="plan-ai-mark" aria-hidden="true">AI</div><div class="section-intro"><span>PLAN &amp; AI</span><h3>Your allowance</h3></div></div><div id="quota-detail"></div><form id="coupon-redeem-form" class="coupon-redeem-form"><label>Coupon code<input id="coupon-redeem-code" maxlength="64" autocomplete="off" placeholder="Enter code"></label><button type="submit">Apply coupon</button><p id="coupon-redeem-message" role="status"></p></form><div class="account-actions"><a href="https://play.google.com/store/account/subscriptions" target="_blank" rel="noopener">Manage Google Play plan</a></div></section></div>`);
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
    document.body.classList.remove("app-authenticated");
    document.body.classList.add("marketing-active");
    $("#marketing-view").classList.remove("hidden");
    $("#app-view").classList.add("hidden");
    $(".site-header").classList.remove("hidden");
    $("footer").classList.remove("hidden");
    return;
  }

  document.body.classList.remove("marketing-active");
  document.body.classList.add("app-authenticated");
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
    { phase: "prepare", msg: "Connecting to your wardrobe…" },
    { phase: "inspect", msg: "Retrieving garments & outfits…" },
    { phase: "check", msg: "Organizing closet & analytics…" },
    { phase: "save", msg: "Wardrobe ready!" }
  ];
  let cur = 0;
  const msgEl = $("#dashboard-loader-msg");
  const loaderEl = $("#dashboard-loading .hanger-loader") || $("#dashboard-loading");

  const applyStep = (idx) => {
    const s = steps[idx];
    if (!s) return;
    if (msgEl) msgEl.textContent = s.msg;
    if (loaderEl?.matches?.(".hanger-loader")) {
      loaderEl.dataset.phase = s.phase;
      loaderEl.dataset.activeStep = String(idx + 1);
    }
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
      loadOptionalDashboardData("saved outfits",getDocs(query(collection(db, "savedOutfits"), where("userId", "==", user.uid)))),
      loadOptionalDashboardData("wear history",getDocs(query(collection(db, "outfitWear"), where("userId", "==", user.uid)))),
      loadOptionalDashboardData("challenge history",getDocs(query(collection(db, "styleChallengeSubmissions"), where("userId", "==", user.uid)))),
      loadOptionalDashboardData("style history",getDocs(query(collection(db, "outfitHistory"), where("userId", "==", user.uid)))),
      loadOptionalDashboardData("today's outfit",getDoc(doc(db, "users", user.uid, "meta", "todayOutfit")),{exists:()=>false}),
      loadOptionalDashboardData("style profile",getDoc(doc(db,"users",user.uid,"profile","style")),null),
      loadOptionalDashboardData("notifications",getDocs(query(collection(db,"users",user.uid,"notifications"),orderBy("receivedAt","desc"),limit(100))),{docs:[]}),
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
    const message=error?.message==="Verify your email before opening your web wardrobe."
      ? error.message
      : error?.code==="permission-denied"
        ? "Your wardrobe access could not be verified. Please sign out and sign in again."
        : "Could not load your wardrobe. Please check your connection and retry.";
    toast(message);
  } finally {
    loader.stop();
    $("#dashboard-loading").classList.add("hidden");
  }
}

async function loadOptionalDashboardData(label,promise,fallback={docs:[]}){
  try{return await promise}
  catch(error){console.warn(`[dashboard] ${label} unavailable`,error?.code||error?.message||"unknown_error");return fallback}
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
    const has3d=Boolean(item.ghostMannequin?.image),mode=has3d?(state.garmentImageModes[item.id]==='normal'?'normal':'3d'):'normal';
    const hasDistinctNormal=has3d&&Boolean(item.image)&&item.image!==item.ghostMannequin?.image;
    return `
    <article class="closet-item" data-item-id="${escapeHtml(item.id)}" tabindex="0">
      ${item.favorite ? '<span class="item-favorite">♥</span>' : ""}
      <div class="item-image"><img src="${safeUrl(ghostImageForMode(item,mode))}" alt="${escapeHtml(`${item.title||'Wardrobe item'} ${mode==='3d'?'3D':'normal'} view`)}" loading="lazy" /></div>
      ${hasDistinctNormal?garmentViewToggle(item.id,mode,'card'):(has3d?'<button type="button" class="ghost-card-button active" data-ghost-item="'+escapeHtml(item.id)+'">3D Model</button>':`<button type="button" class="ghost-card-button" data-ghost-item="${escapeHtml(item.id)}">3D Ghost Mannequin</button>`)}
      <div class="item-info"><b title="${escapeHtml(item.title || "Untitled")}">${escapeHtml(item.title || "Untitled")}</b><small>${escapeHtml(item.category || "Clothing")} · ${escapeHtml(item.primaryColor || "")}</small></div>
    </article>
  `}).join("");
}

function garmentViewToggle(id,mode,scope){return `<div class="garment-view-toggle" role="group" aria-label="Choose garment image"><button type="button" data-garment-view="3d" data-garment-view-id="${escapeHtml(id)}" data-garment-view-scope="${scope}" aria-pressed="${mode==='3d'}" class="${mode==='3d'?'active':''}">3D</button><button type="button" data-garment-view="normal" data-garment-view-id="${escapeHtml(id)}" data-garment-view-scope="${scope}" aria-pressed="${mode==='normal'}" class="${mode==='normal'?'active':''}">Normal</button></div>`}

function renderLooks(looks) {
  $("#looks-grid").innerHTML = looks.length ? looks.map((look) => {
    const ids = look.wardrobeItemIds || look.outfit?.wardrobeItemIds || [];
    const items = ids.map((id) => state.wardrobe.find((item) => item.id === id)).filter(Boolean);
    const renderUrl=fullLookImageUrl(outfitRenderFor(look));
    return `<article class="look-card"><span>${escapeHtml(look.occasion || "Custom look")}</span><h3>${escapeHtml(look.outfit?.title || "My look")}</h3>${renderUrl?`<button type="button" class="outfit-card-full-render" data-view-saved="${escapeHtml(look.id)}"><img src="${renderUrl}" alt="${escapeHtml(`${look.outfit?.title||'Saved outfit'} on a studio mannequin`)}"><span>View complete mannequin look</span></button>`:`<div class="look-thumbs">${items.slice(0,4).map((item) => `<img src="${safeUrl(ghostImageForMode(item))}" alt="${escapeHtml(item.title||"Garment")}" />`).join("")}</div>`}<span>${items.length} wardrobe pieces</span><div class="card-actions"><button data-view-saved="${escapeHtml(look.id)}">View</button>${look.lookbook&&look.source==="user_created"?`<button data-delete-look="${escapeHtml(look.id)}">Delete</button>`:""}<button data-share-scope="saved" data-share-id="${escapeHtml(look.id)}">Share</button></div></article>`;
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
  const renderUrl=fullLookImageUrl(outfitRenderFor(look));
  return `<article class="outfit-library-card"><div class="outfit-card-head"><div><span>${escapeHtml(source)}</span><h3>${escapeHtml(look.outfit?.title || "Saved outfit")}</h3><p>${escapeHtml(look.occasion || "Any occasion")} · ${formatDateValue(look.createdAt)}</p></div>${look.outfit?.score ? `<b>${normalizeOutfitScore(look.outfit.score)}/100</b>` : ""}</div>${renderUrl?`<button type="button" class="outfit-card-full-render" data-view-saved="${escapeHtml(look.id)}"><img src="${renderUrl}" alt="${escapeHtml(`${look.outfit?.title||'Saved outfit'} on a studio mannequin`)}"><span>Complete mannequin look</span></button>`:`<div class="outfit-piece-grid">${items.map((item) => `<button data-item-id="${escapeHtml(item.id)}"><img src="${safeUrl(ghostImageForMode(item))}" alt="${escapeHtml(item.title)}"><span>${escapeHtml(item.title)}</span></button>`).join("")}</div>`}${look.outfit?.subtitle ? `<p class="outfit-copy">${escapeHtml(look.outfit.subtitle)}</p>` : ""}</article>`;
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
    return `<button class="calendar-day ${key === state.selectedDate ? "selected" : ""} ${records.length ? "has-plan" : ""}" data-date="${key}"><b>${date.getDate()}</b><span>${thumbs.map((item)=>`<img src="${safeUrl(ghostImageForMode(item))}" alt="">`).join("")}</span>${records.length ? `<small>${records.length}</small>` : ""}</button>`;
  }).join("");
  renderSelectedDate();
}

function renderSelectedDate() {
  const records = state.wear.filter((x) => x.wearDate === state.selectedDate);
  $("#selected-date-label").textContent = new Date(`${state.selectedDate}T12:00:00`).toLocaleDateString(undefined, { weekday:"long", day:"numeric", month:"long" });
  $("#selected-date-plans").innerHTML = records.length ? records.map((record) => {
    const items = outfitItems(record);
    return `<article class="plan-card"><span class="status-pill ${record.status === "worn" ? "worn" : ""}">${escapeHtml(record.status || "planned")}</span><h4>${escapeHtml(record.outfit?.title || record.occasion || "Planned look")}</h4><p>${escapeHtml(record.occasion || "General")}${record.notes ? ` · ${escapeHtml(record.notes)}` : ""}</p><div class="plan-outfit-preview">${items.slice(0,4).map((item)=>`<img src="${safeUrl(ghostImageForMode(item))}" alt="${escapeHtml(item.title)}">`).join("")}</div><button class="open-complete-outfit" data-outfit-scope="wear" data-outfit-id="${escapeHtml(record.id)}"><svg aria-hidden="true"><use href="#icon-outfit"></use></svg>Open complete outfit</button>${record.reminderAt ? `<small>Mobile reminder: ${escapeHtml(record.reminderTiming === "evening_before" ? "evening before" : "morning of")}</small>` : ""}</article>`;
  }).join("") : emptyBlock("Nothing planned", "Choose a saved outfit above to plan this date.");
  enhanceSelectedDateCards(records);
}

function renderInsights() {
  const worn = state.wear.filter((x)=>x.status==="worn");
  const priced = state.wardrobe.filter((x)=>Number(x.purchasePrice)>0).sort((a,b)=>(a.purchasePrice/Math.max(a.timesWorn||0,1))-(b.purchasePrice/Math.max(b.timesWorn||0,1)));
  const tracked = priced.reduce((sum,x)=>sum+Number(x.purchasePrice||0),0), wears = state.wardrobe.reduce((sum,x)=>sum+Number(x.timesWorn||0),0);
  $("#insight-summary").innerHTML = metricCards([[formatCurrency(tracked),"Tracked value"],[wears,"Garment wears"],[worn.length,"Outfits worn"],[state.wear.filter((x)=>x.status==="planned").length,"Planned looks"]]);
  $("#cpw-list").innerHTML = priced.length ? priced.map((item)=>`<button class="cpw-row" data-item-id="${escapeHtml(item.id)}"><img src="${safeUrl(ghostImageForMode(item))}" alt=""><div><b>${escapeHtml(item.title)}</b><span>${formatCurrency(item.purchasePrice)} · ${Number(item.timesWorn||0)} wears</span></div><strong>${item.timesWorn ? formatCurrency(item.purchasePrice/item.timesWorn) : "—"}<small>per wear</small></strong></button>`).join("") : emptyBlock("No purchase prices yet", "Add prices in the mobile app to unlock cost-per-wear insights.");
  $("#wear-history").innerHTML = state.wear.length ? state.wear.slice(0,30).map((entry)=>`<article><span class="${entry.status==="worn"?"worn":""}">${escapeHtml(entry.status || "planned")}</span><div><b>${escapeHtml(entry.outfit?.title || entry.occasion || "Outfit")}</b><small>${formatIsoDate(entry.wearDate)} · ${escapeHtml(entry.occasion || "General")}</small></div></article>`).join("") : emptyBlock("No wear history", "Plan an outfit, then mark it worn after the date arrives.");
}

function renderWeeklyReport() {
  const target=$("#weekly-report"); if(!target)return;
  const report=calculateWeeklyReport(state.wardrobe,state.wear,state.outfits,new Date());
  const suggested=report.suggestedOutfit, suggestedItems=outfitItems(suggested||{});
  target.innerHTML=`<div class="weekly-metrics">${metricCards([[`${report.wornItemCount}/${report.totalItemCount}`,"garments worn"],[report.outfitDays,"outfit days"],[`${report.closetUsagePercent}%`,"wardrobe rotation"],[report.neglectedItems.length,"clean pieces to rediscover"]])}</div><div class="weekly-detail"><article><span>MOST WORN</span><b>${escapeHtml(report.mostRepeatedItem?.title||"Not enough wear data yet")}</b><p>${report.mostRepeatedItem?"Based on confirmed wears during this seven-day period.":"Mark outfits worn to build this insight."}</p></article><article><span>BEST VALUE</span><b>${escapeHtml(report.bestValueItem?.title||"No priced, worn garment yet")}</b><p>${report.bestValueItem?`${formatCurrency(report.bestValueCostPerWear)} per recorded wear.`:"A purchase price plus recorded wears enables cost-per-wear."}</p></article><article><span>USEFUL COLORS</span><b>${escapeHtml(report.usefulColors.map(x=>x.color).join(", ")||"No color pattern yet")}</b><p>Colors are counted only from garments in confirmed outfits.</p></article></div>${suggested?`<article class="weekly-suggestion"><div><span>NEXT-WEEK IDEA</span><h4>${escapeHtml(suggested.outfit?.title||suggested.title||"Rotate a saved look")}</h4><p>Selected from a real saved outfit, prioritizing underused clean garments when possible.</p></div><div class="look-thumbs">${suggestedItems.slice(0,4).map(item=>`<img src="${safeUrl(ghostImageForMode(item))}" alt="${escapeHtml(item.title)}">`).join("")}</div></article>`:""}`;
}

function renderQuest() {
  const history = state.challenges, points = history.reduce((sum,x)=>sum+Number(x.pointsEarned||x.score?.total||0),0);
  const best = Math.max(0,...history.map((x)=>Number(x.score?.total||0))), streak = currentStreak(history);
  $("#quest-summary").innerHTML = metricCards([[points,"Total points"],[history.length,"Quests completed"],[best,"Personal best"],[streak,"Day streak"]]);
  const badges = buildBadges(history, points, best, streak);
  $("#badge-grid").innerHTML = badges.map((badge)=>`<article class="${badge.earned?"earned":"locked"}"><span><svg aria-hidden="true"><use href="#icon-${badge.icon}"></use></svg></span><b>${badge.label}</b><small>${badge.detail}</small><em>${badge.earned?"Earned":badge.progress}</em></article>`).join("");
  $("#quest-history").innerHTML = history.length ? history.map((entry)=>{
    const items = outfitItems(entry);
    return `<article class="quest-history-card"><div class="quest-look-preview">${items.slice(0,4).map((item)=>`<img src="${safeUrl(ghostImageForMode(item))}" alt="${escapeHtml(item.title)}">`).join("") || '<span class="no-preview">No image</span>'}</div><div class="quest-copy"><b>${escapeHtml(entry.challengeTitle || entry.challengeSnapshot?.title || "Closet Quest")}</b><span>${formatIsoDate(entry.challengeDateKey)} · ${escapeHtml(entry.challengeSnapshot?.occasion || "")}</span><button class="quest-open-look" data-outfit-scope="quest" data-outfit-id="${escapeHtml(entry.id)}">View complete outfit</button></div><strong>${Number(entry.score?.total||0)}/100<small>+${Number(entry.pointsEarned||0)} points</small></strong></article>`;
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
  $("#home-insights").innerHTML = cards.map((card)=>`<button type="button" class="home-insight-card" data-go-panel="${card.panel}" aria-label="${escapeHtml(card.title)}: ${escapeHtml(card.text)}"><div class="insight-visual">${card.items?.length ? card.items.slice(0,3).map((item)=>`<img src="${safeUrl(ghostImageForMode(item))}" alt="">`).join("") : `<svg aria-hidden="true"><use href="#icon-${card.icon}"></use></svg>`}</div><div><span>INSIGHT</span><b>${escapeHtml(card.title)}</b><p>${escapeHtml(card.text)}</p></div><span class="insight-arrow" aria-hidden="true">→</span></button>`).join("");
}

function renderTodayPick(){
  const target=$("#today-pick");if(!target)return;
  const outfit=state.todayOutfit?.outfit||state.todayOutfit;
  const items=prioritizeOutfitItems(outfitItems(state.todayOutfit||{}));
  if(!outfit||!items.length){target.innerHTML=`<div class="today-copy"><span>TODAY’S PICK</span><h3>Your wardrobe is ready</h3><p>Generate a complete look from clean pieces you own.</p><button class="button button-primary" data-go-panel="stylist">Create today’s look</button></div>${emptyBlock("No pick yet","Your next accepted outfit will appear here.")}`;return;}
  const main=items[0],support=items.slice(1,3),renderUrl=fullLookImageUrl(outfitRenderFor(state.todayOutfit)||outfitRenderFor(outfit));
  target.innerHTML=`<div class="today-copy"><span>TODAY’S PICK</span><h3>${escapeHtml(outfit.title||"Your outfit")}</h3><p>${escapeHtml([state.todayOutfit?.occasion,outfit.subtitle].filter(Boolean).join(" · "))}</p>${outfit.score?`<b class="today-score">${normalizeOutfitScore(outfit.score)}/100 style score</b>`:""}<button class="button button-primary" data-open-today>View full outfit</button></div>${renderUrl?`<div class="today-editorial today-full-look"><figure class="today-main"><img src="${renderUrl}" alt="${escapeHtml(`${outfit.title||'Outfit'} on a mannequin`)}"><figcaption>Complete mannequin look</figcaption></figure></div>`:`<div class="today-editorial"><figure class="today-main"><img src="${safeUrl(ghostImageForMode(main))}" alt="${escapeHtml(main.title||"Main garment")}"><figcaption>${escapeHtml(main.title||"Main garment")}</figcaption></figure><div>${support.map((item)=>`<figure><img src="${safeUrl(ghostImageForMode(item))}" alt="${escapeHtml(item.title||"Supporting garment")}"><figcaption>${escapeHtml(item.title||"Supporting garment")}</figcaption></figure>`).join("")}</div></div>`}`;
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
  return `You are the ClothMatics wardrobe stylist. Use ONLY wardrobeItemIds from the supplied wardrobe. Create complete, wearable outfits; a one-piece needs suitable support, otherwise include a top and bottom (optionally layer/footwear/accessory). Never use duplicate IDs. Respect hidden/private/laundry filtering already applied. ${anchorId?`The outfit must include anchor item ${anchorId}.`:""}
Occasion: ${occasion}. Mood: ${mood}. Request: ${request||"None"}.
Style profile: ${JSON.stringify({preferences:state.profile?.preferences||{},learned:state.profileStyle||null})}
Wardrobe: ${JSON.stringify(wardrobe)}
Score each outfit on a 0-100 scale (e.g. 90-98 for high quality matching looks, 85-92 for alternatives). Never score on a 1-10 scale.
MANDATORY RULES:
1. You MUST ALWAYS return a valid JSON object matching the exact schema. Even if the wardrobe is missing ideal pieces for "${occasion}", select the best, cleanest, most adaptable combination available from the wardrobe and explain your styling adaptation in the reasoning.
2. NEVER refuse, apologize, or return conversational text.
3. Return strict JSON only without explanation outside the JSON:
{"best":{"score":95,"title":"Look Title","subtitle":"Short description","wardrobeItemIds":[],"reasoning":["Reason 1","Reason 2"]},"alternatives":[{"score":91,"title":"Alternative Title","subtitle":"Short description","wardrobeItemIds":[],"reasoning":["Reason"]}]}`;
}

async function runStylist(event,anchorId="",options={}){
  event?.preventDefault?.();const generateKaggle=options.generateKaggle===true,buttons=$$("#stylist-form [data-stylist-mode]"),message=$("#stylist-message"),target=$("#stylist-result");
  state.stylistFullLookController?.abort();state.stylistFullLookController=null;
  if(state.stylistResult?.best?.fullLook?.url)URL.revokeObjectURL(state.stylistResult.best.fullLook.url);
  const occasion=$("#stylist-occasion").value,mood=$("#stylist-mood").value,request=$("#stylist-request").value.trim();
  const wardrobe=eligibleWardrobe(state.wardrobe);if(wardrobe.length<2)return message.textContent="Add at least two clean wardrobe pieces through Camera first.";
  const prompt=buildStylistPrompt({occasion,mood,request,anchorId}),stamp=promptStamp(anchorId?"style_this":"outfit_stylist",prompt),key=aiCacheKey(state.user.uid,anchorId?"style-this":"stylist",stamp.promptHash,wardrobeFingerprint(wardrobe),stableHash(`${occasion}|${mood}|${request}|${anchorId}`));
  buttons.forEach(button=>{button.disabled=true});message.textContent=generateKaggle?"Selecting pieces before Kaggle generation…":"Styling your wardrobe…";
  if(target){
    target.innerHTML=outfitOrbitLoaderMarkup({
      kicker:"CLOTHMATICS AI STYLIST",
      title:"Curating Your Outfit",
      subtitle:"AI IS COORDINATING YOUR PERFECT PIECES…",
      statusMessage:"Coordinating pieces from your wardrobe…",
      hidden:false
    });
  }
  const stylistSteps=[
    "Coordinating pieces from your wardrobe…",
    "Finding best matching tops and bottoms…",
    "Harmonizing occasion and mood styling…",
    "Curating your best match outfit…"
  ];
  let currentStep=0;
  const stylistTimer=setInterval(()=>{
    currentStep=(currentStep+1)%stylistSteps.length;
    const loader=target?.querySelector(".hanger-loader");
    if(loader)updateHangerLoader(loader,stylistSteps[currentStep],true,currentStep+1);
  },1800);
  try{
    let result=readAiCache(key),cacheHit=Boolean(result);
    if(!result){
      let response = null;
      try {
        response = await callUserAi(state.user, {
          contents: [{ parts: [{ text: prompt }] }],
          generationConfig: {
            temperature: 0.3,
            topP: 0.9,
            maxOutputTokens: 8192,
            responseMimeType: "application/json",
            thinkingConfig: { thinkingBudget: 0 }
          }
        });
      } catch (aiErr) {
        console.warn("[ClothMatics AI Stylist] AI gateway generation failed, using grounded fallback:", aiErr.message);
      }

      const rawBest = response?.data?.best || response?.data?.outfit || response?.data?.outfits?.[0] || (Array.isArray(response?.data?.recommendations) ? response.data.recommendations[0] : null);
      const rawAlts = Array.isArray(response?.data?.alternatives) ? response.data.alternatives : (Array.isArray(response?.data?.outfits) ? response.data.outfits.slice(1) : []);

      let candidates = [rawBest, ...rawAlts].filter(Boolean).map((outfit) => {
        try { return validateGroundedOutfit(outfit, state.wardrobe); } catch { return null; }
      }).filter(Boolean);

      if (!candidates.length) {
        candidates = [createGroundedFallbackLook(state.wardrobe, occasion, mood)];
      }

      if(anchorId&&!candidates[0].wardrobeItemIds.includes(anchorId))throw new Error("The result did not include the selected garment.");
      result={best:candidates[0],alternatives:candidates.slice(1),provider:response?.provider||"grounded_rules",model:response?.model||"wardrobe_matcher",occasion,mood};writeAiCache(key,result);
      callCoreApi(state.user,"/v1/analytics/api-call",{type:"gemini",status:"success",responseTime:0,provider:result.provider,model:result.model,feature:anchorId?"style_this":"outfit_stylist",...stamp}).catch(()=>{});
    }
    clearInterval(stylistTimer);
    if (result?.best) {
      result.best.score = normalizeOutfitScore(result.best.score);
    }
    if (Array.isArray(result?.alternatives)) {
      result.alternatives.forEach((alt) => {
        alt.score = normalizeOutfitScore(alt.score);
      });
    }
    state.stylistResult=result;state.stylistSource=anchorId?"style_this":"ai_stylist_web";renderStylistResult();message.textContent=cacheHit?"Outfit loaded from your recent results.":"Outfit selected from your wardrobe.";if(!cacheHit)await refreshQuota();if(generateKaggle)await generateBestFullLook();
  }catch(error){
    clearInterval(stylistTimer);
    if(target)target.innerHTML=emptyBlock("Styling problem",error.message);
    message.textContent=error.message;callCoreApi(state.user,"/v1/client-errors",{title:"Web AI Stylist",message:error.message,context:"stylist",platform:"web",appVersion:"2026.08"}).catch(()=>{});
  }
  finally{clearInterval(stylistTimer);buttons.forEach(button=>{button.disabled=false});}
}

function outfitForIndex(index=0){
  const result=state.stylistResult;if(!result)return null;
  const idx=Number(index)||0;
  if(idx===0)return result.best;
  return (result.alternatives||[])[idx-1]||null;
}

async function generateOutfitFullLook(index=0){
  const result=state.stylistResult,outfit=outfitForIndex(index),message=$("#stylist-message");if(!outfit||!state.user)return;
  state.stylistFullLookController?.abort();const controller=new AbortController();state.stylistFullLookController=controller;
  if(outfit.fullLook?.url)URL.revokeObjectURL(outfit.fullLook.url);
  outfit.fullLook=null;outfit.fullLookStatus='generating';outfit.fullLookMessage='Creating one complete mannequin look…';renderStylistResult();
  try{
    const generated=await generateFullLook(state.user,outfit,state.wardrobe,state.profile,{signal:controller.signal,onProgress:text=>{outfit.fullLookMessage=text;renderStylistResult()},onQuota:()=>refreshQuota().catch(()=>{})});
    if(controller.signal.aborted)return;
    outfit.fullLook={...generated,url:URL.createObjectURL(generated.blob)};
    outfit.fullLookStatus='ready';
    if(generated.verified!==false && !generated.isAdvisory){
      outfit.fullLookMessage='Complete look verified against every selected piece.';
      message.textContent=`Your complete mannequin look for "${outfit.title}" is ready.`;
    }else{
      outfit.fullLookMessage=generated.quality?.advisoryNote
        ? `Complete look generated on Kaggle (${generated.quality.advisoryNote}).`
        : 'Complete look generated on Kaggle (some styling details may be approximate).';
      message.textContent=`Your complete mannequin look for "${outfit.title}" is ready.`;
    }
  }catch(error){
    if(error.name==='AbortError'||controller.signal.aborted)return;
    if(error.candidate?.blob){
      const candidate=error.candidate;
      outfit.fullLook={...candidate,url:URL.createObjectURL(candidate.blob),quality:candidate.quality||error.quality};
      outfit.fullLookStatus='ready';
      outfit.fullLookMessage=error.message||'Complete look generated on Kaggle (styling details may be approximate).';
      message.textContent=`Your complete mannequin look for "${outfit.title}" is ready (some details are approximate).`;
      return;
    }
    outfit.fullLookStatus='failed';outfit.fullLookMessage=error.message;message.textContent=`The mannequin view for "${outfit.title}" needs another try.`;
  }finally{if(state.stylistFullLookController===controller)state.stylistFullLookController=null;renderStylistResult();}
}

async function generateBestFullLook(){
  return generateOutfitFullLook(0);
}

function outfitRenderFor(source){return source&&typeof source==='object'?(source.outfitRender||source.outfit?.outfitRender||source.fullLook||null):null;}
function portableOutfit(outfit={}){const {fullLook,fullLookStatus,fullLookMessage,...portable}=outfit;return portable;}

function renderStylistResult(){
  const target=$("#stylist-result"),result=state.stylistResult;if(!target||!result)return;
  const all=[result.best,...(result.alternatives||[])].map((outfit) => ({
    ...outfit,
    score: normalizeOutfitScore(outfit.score)
  }));
  target.innerHTML=all.map((outfit,index)=>{
    const items=prioritizeOutfitItems(outfit.wardrobeItemIds.map((id)=>state.wardrobe.find((item)=>item.id===id)).filter(Boolean));
    const render=outfitRenderFor(outfit),renderUrl=fullLookImageUrl(render),status=outfit.fullLookStatus||'';
    const kagglePanel=status?`<section class="full-look-experience manual ${status}">${renderUrl?`<div class="full-look-hero"><img src="${renderUrl}" alt="${escapeHtml(`${outfit.title} shown together on a studio mannequin`)}"><span>KAGGLE-GENERATED COMPLETE LOOK</span></div>`:status==='generating'?outfitOrbitLoaderMarkup({kicker:'KAGGLE OUTFIT STUDIO',title:'Dressing Your Mannequin',subtitle:'COMBINING YOUR SELECTED PIECES…',statusMessage:outfit.fullLookMessage||'Creating one complete mannequin look…',hidden:false}):`<div class="full-look-unavailable compact"><b>Kaggle outfit was not generated</b><p>${escapeHtml(outfit.fullLookMessage||'The selected outfit remains available. Retry when the Kaggle backend is ready.')}</p></div>`}</section>`:'';
    const kaggleLabel=status==='generating'?'Generating on Kaggle…':renderUrl?'Regenerate outfit on Kaggle':status==='failed'?'Retry outfit on Kaggle':'Generate outfit on Kaggle';
    return `<article class="generated-outfit ${index===0?"best":""}"><header><div><span>${index===0?"BEST MATCH":"ALTERNATIVE"}</span><h3>${escapeHtml(outfit.title)}</h3><p>${escapeHtml(outfit.subtitle)}</p></div><b>${outfit.score}/100</b></header><div class="generated-piece-grid">${items.map((item)=>`<button data-item-id="${escapeHtml(item.id)}"><img src="${safeUrl(ghostImageForMode(item))}" alt="${escapeHtml(item.title)}"><span>${escapeHtml(item.title)}</span></button>`).join("")}</div>${kagglePanel}<ul>${outfit.reasoning.map((reason)=>`<li>${escapeHtml(reason)}</li>`).join("")}</ul><div class="card-actions"><button class="kaggle-outfit-action" data-generate-full-look="${index}" ${status==='generating'?'disabled aria-busy="true"':''}>${kaggleLabel}</button><button data-save-generated="${index}">Save outfit</button><button data-plan-generated="${index}">Plan for ${escapeHtml(formatIsoDate(state.selectedDate))}</button><button data-today-generated="${index}">Use as Today’s Pick</button><button data-share-generated="${index}">Share</button></div></article>`;
  }).join("");
}

async function saveGeneratedOutfit(index=0){
  const result=state.stylistResult;if(!result)return;let uploaded=null;
  const outfit=outfitForIndex(index);if(!outfit)return;
  try{
    if(outfit.fullLook?.blob&&!outfit.fullLook.image){const prepared=await optimizeGarmentUpload(outfit.fullLook.blob,{backgroundRemoved:false});uploaded=await uploadGarmentImage(state.user,prepared.blob);outfit.fullLook.image=uploaded.imageUrl;outfit.fullLook.imageObjectKey=uploaded.objectKey;}
    const data=await callCoreApi(state.user,"/v1/outfits/save",{outfit:portableOutfit(outfit),source:state.stylistSource,occasion:result.occasion});
    const outfitRender=outfit.fullLook?.image?{image:outfit.fullLook.image,imageObjectKey:outfit.fullLook.imageObjectKey,kind:'ai_full_look',wardrobeItemIds:outfit.wardrobeItemIds,presentation:outfit.fullLook.presentation,pipelineVersion:outfit.fullLook.diagnostics?.pipelineVersion||'1',seed:outfit.fullLook.diagnostics?.seed||'',verification:outfit.fullLook.quality,createdAt:serverTimestamp()}:null;
    if(outfitRender)await updateDoc(doc(db,'savedOutfits',data.id),{outfitRender});
    state.outfits.unshift({id:data.id,userId:state.user.uid,source:state.stylistSource,occasion:result.occasion,outfit,wardrobeItemIds:outfit.wardrobeItemIds,outfitRender,createdAt:Date.now()});renderLooks(state.outfits);renderOutfitLibrary();renderPlannerOptions();toast(outfitRender?`"${outfit.title}" and mannequin view saved.`:`"${outfit.title}" saved to your shared library.`);
  }catch(error){if(uploaded)await deleteGarmentUpload(state.user,uploaded.objectKey).catch(()=>{});toast(`Could not save outfit: ${error.message}`);}
}
async function planGeneratedOutfit(index=0){const result=state.stylistResult;if(!result)return;const outfit=outfitForIndex(index);if(!outfit)return;await callCoreApi(state.user,"/v1/outfits/plan",{wearDate:state.selectedDate,occasion:result.occasion,outfit:portableOutfit(outfit)});await reloadWear();toast(`"${outfit.title}" planned for ${formatIsoDate(state.selectedDate)}.`);}
async function useGeneratedToday(index=0){const result=state.stylistResult;if(!result)return;const outfit=outfitForIndex(index);if(!outfit)return;await callCoreApi(state.user,"/v1/outfits/today",{occasion:result.occasion,outfit:portableOutfit(outfit)});state.todayOutfit={date:localDateKey(new Date()),occasion:result.occasion,outfit,savedAt:Date.now()};renderTodayPick();renderHomeInsights();toast(`"${outfit.title}" updated as Today’s Pick on web and mobile.`);}

function renderNotifications(){
  const unread=state.notifications.filter((item)=>!item.readAt).length;for(const id of ["#nav-unread","#bell-unread"]){const el=$(id);if(el){el.textContent=unread;el.classList.toggle("hidden",!unread);}}
  const markAll=$("#mark-all-notifications");if(markAll){markAll.disabled=!unread;markAll.classList.toggle("hidden",!unread);}
  const target=$("#notification-list");if(!target)return;
  target.innerHTML=state.notifications.length?state.notifications.map((item)=>{const outfit=embeddedNotificationOutfit(item),images=(item.outfitImages||item.params?.outfitImages||item.payload?.params?.outfitImages||[]).filter((url)=>safeUrl(url)).slice(0,4),icon=notificationIcon(item);return`<button type="button" class="notification-card ${item.readAt?"":"unread"}" data-notification-id="${escapeHtml(item.id)}"><div class="notification-copy"><div class="notification-meta"><span class="notification-kind-icon" aria-hidden="true"><svg class="nav-icon"><use href="#icon-${icon}"></use></svg></span><span>${escapeHtml(pretty(item.channel||"update"))}</span>${item.readAt?"":'<em>New</em>'}</div>${safeUrl(item.imageUrl||item.image)?`<img class="notification-art" src="${safeUrl(item.imageUrl||item.image)}" alt="Notification artwork">`:""}<h4>${escapeHtml(item.title||"ClothMatics update")}</h4><p>${escapeHtml(item.body||"")}</p><time>${escapeHtml(formatDateValue(item.receivedAt||item.createdAt||item.timestamp))}</time></div>${images.length?`<div class="notification-outfit">${images.map((url)=>`<img src="${url}" alt="Generated outfit garment">`).join("")}</div>`:outfit?`<div class="notification-outfit">${outfit.wardrobeItemIds.map((id)=>state.wardrobe.find((entry)=>entry.id===id)).filter(Boolean).slice(0,4).map((entry)=>`<img src="${safeUrl(ghostImageForMode(entry))}" alt="${escapeHtml(entry.title)}">`).join("")}</div>`:""}<span class="notification-open" aria-hidden="true">Open →</span></button>`;}).join(""):emptyBlock("No notifications yet","Wardrobe reminders, offers and account updates will appear here after they are sent.");
}
function notificationIcon(item={}){const route=String(item.route||item.target?.route||item.payload?.route||"").toLowerCase(),channel=String(item.channel||item.type||"").toLowerCase();if(embeddedNotificationOutfit(item)||/outfit|style|festival/.test(`${route} ${channel}`))return"sparkles";if(/calendar|planner|reminder/.test(`${route} ${channel}`))return"calendar";if(/quest|challenge|award/.test(`${route} ${channel}`))return"award";if(/purchase|shopping/.test(`${route} ${channel}`))return"bag";return"bell";}
async function markAllNotificationsRead(){const unread=state.notifications.filter((item)=>!item.readAt);await Promise.all(unread.map((item)=>updateDoc(doc(db,"users",state.user.uid,"notifications",item.id),{readAt:serverTimestamp()}).catch(()=>null)));const now=Date.now();unread.forEach((item)=>{item.readAt=now});renderNotifications();toast("Notifications marked as read.")}
async function openNotification(id){const item=state.notifications.find((entry)=>entry.id===id);if(!item)return;if(!item.readAt){await updateDoc(doc(db,"users",state.user.uid,"notifications",id),{readAt:serverTimestamp()}).catch(()=>{});item.readAt=Date.now();renderNotifications();}await callCoreApi(state.user,"/v1/notifications/open",{campaignId:item.campaignId||id}).catch(()=>{});const outfit=embeddedNotificationOutfit(item);if(outfit){showNotificationOutfit(item,outfit);return;}const route=String(item.route||item.target?.route||item.payload?.route||"");const panels={Main:"overview",OutfitCalendar:"planner",WeeklyClosetReport:"insights",SmartPurchaseCheck:"purchase",StyleChallengeHub:"quest",TripPacking:"trip",Wardrobe:"wardrobe",SavedOutfits:"outfits"};openPanel(panels[route]||"overview");}
function showNotificationOutfit(notification,outfit){const images=(notification.outfitImages||notification.params?.outfitImages||notification.payload?.params?.outfitImages||[]).filter((url)=>safeUrl(url));const items=outfit.wardrobeItemIds.map((id)=>state.wardrobe.find((item)=>item.id===id)).filter(Boolean);$("#outfit-detail").innerHTML=`<div class="complete-outfit-head"><span class="app-kicker">NOTIFICATION OUTFIT</span><h2>${escapeHtml(outfit.title||notification.title||"Generated outfit")}</h2><p>${escapeHtml(outfit.subtitle||notification.body||"")}</p></div><div class="complete-outfit-grid">${(items.length?items:images.map((image,index)=>({title:`Outfit piece ${index+1}`,image}))).map((item)=>`<article><img src="${safeUrl(ghostImageForMode(item))}" alt="${escapeHtml(item.title)}"><div><b>${escapeHtml(item.title)}</b></div></article>`).join("")}</div>`;closeAllDialogs($("#outfit-dialog"));$("#outfit-dialog").showModal();}

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
$("#stylist-kaggle").addEventListener("click",event=>runStylist(event,"",{generateKaggle:true}));
$("#profile-form").addEventListener("submit",saveProfile);
$("#coupon-redeem-form").addEventListener("submit",redeemCoupon);
$("#profile-gender").addEventListener("change",()=>syncProfileChoiceFields(""));
$("#purchase-owned").addEventListener("change",useOwnedPurchaseExample);
$("#notification-bell").addEventListener("click",()=>openPanel("notifications"));
$("#mark-all-notifications").addEventListener("click",markAllNotificationsRead);
$("#close-garment-upload").addEventListener("click",closeGarmentUpload);
$("#garment-photo").addEventListener("change",(event)=>selectGarmentFile(event.target.files?.[0]));
$("#garment-upload-form").addEventListener("submit",processGarmentUpload);
$("#garment-review-form").addEventListener("submit",saveGarmentUpload);
$("#retry-garment").addEventListener("click",handleGarmentReviewSecondaryAction);
$("#toggle-garment-image").addEventListener("click",toggleGarmentImageChoice);
$("#upload-styling-usage").addEventListener("change",()=>{const usage=$("#upload-styling-usage").value;if(usage==="private_innerwear"){$("#upload-category").value="Innerwear";$("#upload-hidden-ai").checked=true;$("#upload-occasions").value="";$("#upload-activities").value=""}else if(usage==="swimwear"){$("#upload-category").value="Swimwear";$("#upload-occasions").value="Beach, Travel";$("#upload-activities").value="Beach, Travel"}else if(usage==="activewear"){$("#upload-category").value="Top";$("#upload-occasions").value="Gym";$("#upload-activities").value="Gym/workout"}else if(usage==="wear_as_top"){$("#upload-category").value="Top";$("#upload-occasions").value="Everyday, Party, Beach, Date"}});
$$('[data-camera-mode]').forEach((button)=>button.addEventListener("click",()=>setCameraMode(button.dataset.cameraMode)));
$("#camera-gallery-input").addEventListener("change",(event)=>selectCameraFiles(event.target.files));
$("#camera-remove-photo").addEventListener("click",()=>{if((state.camera.files||[]).length>1)removeCameraPhoto(state.camera.activeIndex||0);else resetCameraPhoto()});
$("#camera-clear-all")?.addEventListener("click",resetCameraPhoto);
$("#camera-action").addEventListener("click",runCameraAction);
$("#camera-auto-extract").addEventListener("click",runAutoExtract);
$("#camera-single-garment").addEventListener("click",runSingleGarment);
$("#camera-thumbnail-strip").addEventListener("click",(event)=>{const remove=event.target.closest("[data-camera-remove]");if(remove){event.preventDefault();event.stopPropagation();removeCameraPhoto(Number(remove.dataset.cameraRemove));return}const button=event.target.closest("[data-camera-photo]");if(button){state.camera.activeIndex=Number(button.dataset.cameraPhoto)||0;renderCameraSelection()}});
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
  const generateBtn=event.target.closest("[data-generate-full-look]");if(generateBtn){generateOutfitFullLook(Number(generateBtn.dataset.generateFullLook||0));return}
  const saveBtn=event.target.closest("[data-save-generated]");if(saveBtn){saveGeneratedOutfit(Number(saveBtn.dataset.saveGenerated||0));return}
  const planBtn=event.target.closest("[data-plan-generated]");if(planBtn){planGeneratedOutfit(Number(planBtn.dataset.planGenerated||0));return}
  const todayBtn=event.target.closest("[data-today-generated]");if(todayBtn){useGeneratedToday(Number(todayBtn.dataset.todayGenerated||0));return}
  const shareBtn=event.target.closest("[data-share-generated]");if(shareBtn){shareGeneratedOutfit(Number(shareBtn.dataset.shareGenerated||0));return}
  const deleteGhost=event.target.closest("[data-delete-ghost]");if(deleteGhost){event.preventDefault();void deleteGhostGeneration(deleteGhost.dataset.deleteGhost);return}
  const ghostItem=event.target.closest("[data-ghost-item]");if(ghostItem){event.preventDefault();closeAllDialogs();ghostStudio.open(ghostItem.dataset.ghostItem);return}
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
$("#close-garment").addEventListener("click",()=>closeAllDialogs());
$("#close-outfit").addEventListener("click",()=>closeAllDialogs());

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
  if($("#camera-clear-all"))$("#camera-clear-all").disabled=busy;
  $$("[data-camera-remove]").forEach((button)=>button.disabled=busy);
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
function removeCameraPhoto(index){
  if(state.camera.busy)return;
  const files=state.camera.files||[],urls=state.camera.urls||[];
  if(index<0||index>=files.length)return;
  if(urls[index])URL.revokeObjectURL(urls[index]);
  files.splice(index,1);
  urls.splice(index,1);
  if(!files.length){
    resetCameraPhoto();
    return;
  }
  state.camera.activeIndex=Math.min(state.camera.activeIndex||0,files.length-1);
  state.camera.analysis=null;
  $("#camera-message").textContent="";
  $("#style-check-result").classList.add("hidden");
  renderCameraSelection();
}
function renderCameraSelection(){
  const files=state.camera.files||[],urls=state.camera.urls||[],style=state.camera.mode==="style";
  if(!files.length){
    $("#camera-preview").innerHTML=`<div class="camera-placeholder"><span><svg class="nav-icon" aria-hidden="true"><use href="#icon-image"></use></svg></span><b id="camera-placeholder-title">${style?"Add one outfit photo":"Add up to five photos"}</b><small>${style?"Keep your complete outfit visible":"Use Auto Extract for worn outfits or Single Garment for one item"}</small></div>`;
    $("#camera-thumbnail-strip").classList.add("hidden");$("#camera-thumbnail-strip").innerHTML="";$("#camera-remove-photo").classList.add("hidden");
    if($("#camera-clear-all"))$("#camera-clear-all").classList.add("hidden");
  }else{
    const active=Math.min(state.camera.activeIndex||0,files.length-1);state.camera.activeIndex=active;
    $("#camera-preview").innerHTML=`<img src="${urls[active]}" alt="Selected ${style?"outfit":"clothing"} preview"><span class="camera-preview-badge">${files.length} PHOTO${files.length===1?"":"S"} SELECTED</span>`;
    $("#camera-thumbnail-strip").innerHTML=files.map((file,index)=>`<div class="camera-thumb-item ${index===active?"active":""}"><button type="button" class="camera-thumb-select" data-camera-photo="${index}" aria-label="View ${escapeHtml(file.name||`photo ${index+1}`)}"><img src="${urls[index]}" alt=""><span class="camera-thumb-num">${index+1}</span></button><button type="button" class="camera-thumb-remove" data-camera-remove="${index}" aria-label="Remove ${escapeHtml(file.name||`photo ${index+1}`)}" title="Remove this photo">×</button></div>`).join("");
    $("#camera-thumbnail-strip").classList.toggle("hidden",files.length<2);
    $("#camera-remove-photo").classList.remove("hidden");
    $("#camera-remove-photo").textContent=files.length>1?`Remove photo ${active+1}`:"Clear photo";
    if($("#camera-clear-all")){
      $("#camera-clear-all").classList.toggle("hidden",files.length<2);
      $("#camera-clear-all").textContent="Clear all photos";
    }
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
  const styleCheckTarget = $("#style-check-result");
  if (styleCheckTarget) {
    styleCheckTarget.innerHTML = outfitOrbitLoaderMarkup({
      kicker: "CLOTHMATICS AI",
      title: "AI Style Check",
      subtitle: "INSPECTING OUTFIT COORDINATION",
      statusMessage: "Checking colors, harmony & garments…",
      hidden: false
    });
    styleCheckTarget.classList.remove("hidden");
    styleCheckTarget.scrollIntoView({ behavior: "smooth", block: "nearest" });
  }
  try{
    const normalized=await normalizeGarmentImage(file);const result=await analyzeStyleCheck(state.user,normalized.blob,{signal:controller.signal});state.camera.analysis=result.analysis;state.camera.provider=result.provider;state.camera.model=result.model;
    const persisted={...result.analysis,userId:state.user.uid,image:"",analyzedImageUri:"",sourceImageUrl:"",createdAt:serverTimestamp()};
    const ref=await addDoc(collection(db,"outfitHistory"),persisted).catch(()=>null);if(ref)state.outfitHistory.unshift({id:ref.id,...result.analysis,userId:state.user.uid,createdAt:new Date()});
    renderStyleCheckResult(result.analysis);$("#camera-message").textContent="Style Check complete.";
  }catch(error){
    if(error.name!=="AbortError"){
      $("#camera-message").textContent=error.message;
      if (styleCheckTarget) {
        styleCheckTarget.innerHTML = `<div class="error-box"><b>Could not complete Style Check</b><p>${escapeHtml(error.message)}</p></div>`;
      }
    }
  }
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
    dialog.querySelector('.upload-dialog-heading').insertAdjacentHTML('afterend',hangerLoaderMarkup({type:'orbit',hidden:true}));
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
function openGarmentUpload(file,{autoProcess=false,generate3d}={}){resetGarmentUpload({keepDialog:true});ensureGenerate3dOption();$("#generate-garment-3d").checked=generate3d===undefined?state.camera.generate3d===true:generate3d;closeAllDialogs($("#garment-upload-dialog"));$("#garment-upload-dialog").showModal();if(file){selectGarmentFile(file);if(autoProcess){$("#garment-upload-dialog").classList.add("camera-prefilled");void processGarmentUpload()}}}
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
  closeAllDialogs($("#garment-upload-dialog"));
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
  const ghostRequested=$("#generate-garment-3d")?.checked===true;
  $("#garment-upload-dialog").classList.remove("processing-failed");$("#process-garment").textContent="Try Auto Extract again";
  const controller=new AbortController();state.garmentUpload.controller=controller;state.garmentUpload.detectedItems=[];state.garmentUpload.preparedItems=[];state.garmentUpload.approvedBlurFiles??=new Set();setGarmentUploadBusy(true);const prepared=[],photoErrors=[];let skipped=0;
  try{
    const premium=await verifiedExtractionPremium();
    for(let photoIndex=0;photoIndex<files.length;photoIndex+=1){
      try{
      const file=files[photoIndex];showAutoExtractSource(file,photoIndex+1,files.length);
      $("#garment-upload-message").textContent=`Checking photo ${photoIndex+1} of ${files.length}…`;setUploadStep("gemini","active");
      if(!await approveImageQuality(file,state.garmentUpload.approvedBlurFiles)){skipped+=1;continue}
      const normalized=await normalizeGarmentImage(file);let result;
      try{result=await analyzeStyleCheck(state.user,normalized.blob,{signal:controller.signal,intake:true})}
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
        if(!['flat_lay','hanging'].includes(result.analysis.photoContext)){
          skipped+=1;$('#garment-upload-message').textContent='No clear clothing regions were found. Try a brighter full-outfit photo.';continue;
        }
        // A clear flat-lay can be rejected by the outfit detector even though it is
        // perfectly usable for wardrobe/3D processing. Keep the source reviewable
        // and ask the single-garment analyzer for the detailed conditioning data.
        let fallbackAnalysis=null;
        if(premium||$('#generate-garment-3d')?.checked){
          try{fallbackAnalysis=await analyzeGarment(state.user,normalized.blob,{signal:controller.signal});await refreshQuota().catch(()=>{});}catch(error){if(error.name==="AbortError")throw error;console.warn("[auto-extract] single_garment_fallback_analysis_failed",{message:error?.message||"unknown"});}
        }
        const metadata=fallbackAnalysis?.metadata||manualGarmentMetadata();
        const sourceGroup={blob:normalized.blob,analysisId:`${Date.now()}-${photoIndex}-fallback`,photoContext:result.analysis.photoContext,uploadPromise:null};
        const entry={metadata,sourceName:file.name||`Photo ${photoIndex+1}`,sourceGroup,status:"ready",message:"The outfit detector found no worn regions. Review this clear garment photo as a single item."};
        entry.cutoutBlob=normalized.blob;entry.previewUrl=URL.createObjectURL(normalized.blob);entry.diagnostics={engine:"original_fallback",mode:"single_garment_review"};
        if($('#generate-garment-3d')?.checked&&fallbackAnalysis&&outfitGhostCategory(metadata))try{
          const value=await generateGhostFromPhoto(state.user,normalized.blob,metadata,{signal:controller.signal,onProgress:message=>{$('#garment-upload-message').textContent=message;},onQuota:()=>refreshQuota().catch(()=>{})});
          URL.revokeObjectURL(entry.previewUrl);Object.assign(entry,{ghostPrepared:value,originalBlob:normalized.blob,cutoutBlob:value.blob,previewUrl:URL.createObjectURL(value.blob),message:'3D image passed the photo comparison.'});
        }catch(error){if(error.name==='AbortError')throw error;entry.message=error.message;}
        state.garmentUpload.detectedItems.push(entry);prepared.push(entry);renderAutoExtractResults();continue;
      }
      setUploadStep("gemini","done");setUploadStep("oracle","active");
      const sourceGroup={blob:normalized.blob,analysisId:result.analysis.id||`${Date.now()}-${photoIndex}`,photoContext:result.analysis.photoContext,uploadPromise:null};
      const regions=clothing.map(extractionRegion),entries=clothing.map((metadata)=>({metadata,sourceName:file.name||`Photo ${photoIndex+1}`,sourceGroup,status:"detected",message:""}));
      state.garmentUpload.detectedItems.push(...entries);renderAutoExtractResults();
      if(usesWornOutfitPreparation(result.analysis.photoContext)){
        const outfit=ghostRequested?await generateGhostOutfitFromPhoto(state.user,normalized.blob,clothing,{
          signal:controller.signal,
          onProgress:message=>{$('#garment-upload-message').textContent=message;},
          onQuota:()=>refreshQuota().catch(()=>{}),
          onItem:item=>{
            const entry=entries[item.index];
            Object.assign(entry,{metadata:item.metadata,originalBlob:item.originalBlob,cutoutBlob:item.blob,ghostPrepared:item.ghostPrepared,diagnostics:item.diagnostics,message:item.message,previewUrl:URL.createObjectURL(item.blob),status:'ready'});
            prepared.push(entry);renderAutoExtractResults();
          },
        }):await prepareWornOutfit(state.user,normalized.blob,clothing,regions,{
          generate3d:ghostRequested,premium:premium||ghostRequested,signal:controller.signal,
          onProgress:message=>{$('#garment-upload-message').textContent=message;},
          onQuota:()=>refreshQuota().catch(()=>{}),
          onItem:item=>{
            const entry=entries[item.index];
            Object.assign(entry,{metadata:item.metadata,originalBlob:item.originalBlob,cutoutBlob:item.blob,ghostPrepared:item.ghostPrepared,diagnostics:item.diagnostics,message:item.message,previewUrl:URL.createObjectURL(item.blob),status:'ready'});
            prepared.push(entry);renderAutoExtractResults();
          },
        });
        for(const failure of outfit.skipped){const entry=entries[failure.index];entry.status='skipped';entry.message=failure.message;skipped+=1;}
        renderAutoExtractResults();continue;
      }
      const generated=[];
      if(ghostRequested)for(let index=0;index<entries.length;index++){
        if(!isGarmentExtractionReady(entries[index].metadata)||!outfitGhostCategory(entries[index].metadata))continue;
        try{
          const source=(await cropGarmentImage(normalized.blob,regions[index].boundingBox,LOWER_CATEGORIES.includes(ghostCategory(entries[index].metadata))?0.14:0.05)).blob;
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
      }catch(error){if(error.name==="AbortError")throw error;skipped+=1;photoErrors.push(error?.message||'Kaggle could not prepare this photo.');console.warn("[web-extraction] photo_failed",{photo:photoIndex+1,status:error?.status||0,code:error?.code||'',message:error?.message||"unknown"});continue}
    }
    if(!prepared.length)throw new Error(photoErrors.at(-1)||"No clear garments could be extracted. Try a brighter photo with each item fully visible.");
    setUploadStep("oracle","done");
    if(ghostRequested && state.camera.generate3d && prepared.every(entry => entry.ghostPrepared&&!usesWornOutfitPreparation(entry.sourceGroup?.photoContext))){
      $("#garment-upload-message").textContent = `Saving ${prepared.length} 3D garments directly to your wardrobe…`;
      let savedCount = 0;
      for(const entry of prepared){
        try{
          const title = entry.metadata?.title || "Garment";
          const category = entry.metadata?.category || "Top";
          const opt = await optimizeGarmentUpload(entry.ghostPrepared.blob, { backgroundRemoved: true });
          const up = await uploadGarmentImage(state.user, opt.blob);
          const struct = uploadCategoryStructure(category, "standard");
          const rec = {
            userId: state.user.uid,
            type: "wardrobe",
            image: up.imageUrl,
            imageObjectKey: up.objectKey,
            bgRemoved: true,
            title,
            category,
            subCategory: entry.metadata?.subCategory || "",
            categoryRole: category,
            ...struct,
            userOccasions: entry.metadata?.userOccasions || entry.metadata?.occasion || [],
            activitySuitability: entry.metadata?.activitySuitability || [],
            userRestrictions: "",
            stylingUsage: "standard",
            privateItem: false,
            userConfirmed: true,
            brand: entry.metadata?.brand || "",
            primaryColor: entry.metadata?.primaryColor || "",
            secondaryColors: entry.metadata?.secondaryColors || [],
            pattern: entry.metadata?.pattern || "Solid",
            fit: entry.metadata?.fit || "",
            material: entry.metadata?.material || "",
            sleeveType: entry.metadata?.sleeveType || "",
            neckline: entry.metadata?.neckline || "",
            season: entry.metadata?.season || "",
            occasion: entry.metadata?.occasion || [],
            formality: entry.metadata?.formality || "",
            favorite: false,
            laundryStatus: "Clean",
            remarks: "",
            tags: ["camera-3d", "auto-extract", "3d-ghost", "background-removed", "web-upload"],
            aiDescription: entry.metadata?.aiDescription || "",
            rating: 0,
            timesWorn: 0,
            hiddenFromAI: false,
            processingFlow: "camera_direct_3d_batch",
            colorDetail: entry.metadata?.colorDetail || "",
            fabricTexture: entry.metadata?.fabricTexture || "",
            ghostMannequin: {
              image: up.imageUrl,
              imageObjectKey: up.objectKey,
              ...entry.ghostPrepared.analysis,
              quality: entry.ghostPrepared.quality,
              kind: 'ai_generated',
              createdAt: serverTimestamp()
            },
            createdAt: serverTimestamp()
          };
          if(entry.metadata?.technical3DDetails) rec.technical3DDetails = entry.metadata.technical3DDetails;
          if(entry.metadata?.visualProfile) rec.visualProfile = { ...entry.metadata.visualProfile, sourceImage: up.imageUrl };
          const ref = await addDoc(collection(db, "wardrobe"), rec);
          state.wardrobe.unshift({ id: ref.id, ...rec, createdAt: new Date() });
          state.garmentImageModes[ref.id] = '3d';
          savedCount++;
        }catch(e){
          console.warn("[auto-extract-3d-save] error", e);
        }
      }
      void setDoc(doc(db, "users", state.user.uid), { wardrobeCount: state.wardrobe.length, lastActive: serverTimestamp() }, { merge: true }).catch(() => {});
      resetGarmentUpload();
      $("#garment-upload-dialog").close();
      resetCameraPhoto();
      openPanel("wardrobe");
      renderAll();
      toast(`✨ ${savedCount} 3D garment${savedCount === 1 ? "" : "s"} added to your wardrobe.`);
      return;
    }
    state.garmentUpload.preparedItems=prepared;state.garmentUpload.reviewTotal=prepared.length;state.garmentUpload.reviewIndex=1;
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
  const is3dReady=Boolean(entry.ghostPrepared||state.garmentUpload.ghostPrepared);
  $("#garment-review-count").textContent=auto?`ITEM ${state.garmentUpload.reviewIndex} OF ${state.garmentUpload.reviewTotal}`:"";$("#garment-review-count").classList.toggle("hidden",!auto);
  $("#retry-garment").textContent=auto?"Skip this item":"Choose another photo";
  $("#toggle-garment-image").classList.toggle("hidden",auto||is3dReady||!state.garmentUpload.originalBlob);
  $("#toggle-garment-image").textContent="Use original photo";
  $(".upload-dialog-heading h2").textContent=auto?`Review your extracted clothes`:(is3dReady?"Review your 3D garment":"Review your closet item");
  $("#save-uploaded-garment").textContent=is3dReady?(auto&&remaining>1?"Save 3D & continue":"Save 3D to wardrobe"):(auto&&remaining>1?"Save & continue":"Save to wardrobe");
  $(".upload-dialog-heading p").textContent=auto?"All detected pieces are shown below. Select any ready item to review its details.":"Check the prepared image and details before saving.";renderAutoExtractResults();
}
function nextReadyExtracted(exclude){return(state.garmentUpload.preparedItems||[]).find((entry)=>entry!==exclude&&entry.status==="ready")||null}
function launchGhostGeneration(id){if(!id)return;closeAllDialogs();toast("3D generation started. Your original image is already saved.");setTimeout(()=>ghostStudio.open(id),80)}
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
    if(ghostRequested && state.garmentUpload.ghostPrepared && state.camera.generate3d){
      setUploadStep("oracle","done");
      setUploadStep("review","active");
      populateGarmentReview(metadata);
      $("#garment-upload-message").textContent="3D garment ready! Saving to wardrobe…";
      const fakeEvent={preventDefault:()=>{}};
      await saveGarmentUpload(fakeEvent);
      return;
    }
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
    const cameraDirect3D=state.camera.generate3d && ghostPrepared && !(autoExtract&&usesWornOutfitPreparation(current?.sourceGroup?.photoContext));
    if(ghostPrepared && cameraDirect3D){
      record.image=upload.imageUrl;record.imageObjectKey=upload.objectKey;record.bgRemoved=true;
      record.ghostMannequin={image:upload.imageUrl,imageObjectKey:upload.objectKey,...ghostPrepared.analysis,quality:ghostPrepared.quality,kind:'ai_generated',createdAt:serverTimestamp()};
    }else if(ghostPrepared){
      const source=autoExtract?current.originalBlob:state.garmentUpload.normalizedBlob;
      const original=await uploadGarmentImage(state.user,(await optimizeGarmentUpload(source,{backgroundRemoved:false})).blob);
      createdUploads.push(original);record.image=original.imageUrl;record.imageObjectKey=original.objectKey;record.bgRemoved=false;
      record.ghostMannequin={image:upload.imageUrl,imageObjectKey:upload.objectKey,sourceImage:original.imageUrl,...ghostPrepared.analysis,quality:ghostPrepared.quality,kind:'ai_generated',createdAt:serverTimestamp()};
    }
    if(autoExtract)record.extractionMethod=current?.diagnostics?.engine==='kaggle_segformer'?'kaggle-semantic':'person-box';else if(!bgRemoved)record.extractionMethod="original";
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
      setUploadStep("review","done");resetGarmentUpload();resetCameraPhoto();$("#garment-upload-dialog").close();openPanel("wardrobe");toast(ghostPrepared?`✨ 3D ${title} was added to your wardrobe.`:`${title} was added to your wardrobe.`);
    }
  }catch(error){for(const pending of createdUploads)await deleteGarmentUpload(state.user,pending.objectKey).catch(()=>{});$("#garment-save-message").textContent=error.message}
  finally{setGarmentUploadBusy(false);button.disabled=false;$("#close-garment-upload").disabled=false;$("#retry-garment").disabled=false;$("#toggle-garment-image").disabled=false}
}

function openLookBuilder(){closeAllDialogs($("#look-builder-dialog"));state.lookSlots={};$("#look-name").value="";$("#look-occasion").value="";$("#look-picker-search").value="";renderLookBuilder();$("#look-builder-dialog").showModal()}
function renderLookBuilder(){const labels={top:"Top",bottom:"Bottom",layer:"Layer",hero:"One-piece",footwear:"Footwear",accessory:"Accessory"};$("#look-slots").innerHTML=Object.entries(labels).map(([slot,label])=>{const item=state.wardrobe.find(x=>x.id===state.lookSlots[slot]);return`<article class="look-slot"><span>${label}</span>${item?`<img src="${safeUrl(ghostImageForMode(item))}" alt="${escapeHtml(item.title)}"><b>${escapeHtml(item.title)}</b><button data-clear-slot="${slot}" aria-label="Remove ${label}">×</button>`:'<p>Choose an item</p>'}</article>`}).join("");renderLookPicker()}
function renderLookPicker(){const queryText=$("#look-picker-search").value;const items=state.wardrobe.filter(item=>matchesGarmentSearch(item,queryText));$("#look-picker").innerHTML=items.length?items.map(item=>`<button data-pick-item="${escapeHtml(item.id)}"><img src="${safeUrl(ghostImageForMode(item))}" alt="${escapeHtml(item.title)}"><span><b>${escapeHtml(item.title||"Garment")}</b><small>${escapeHtml(pretty(lookbookSlotFor(item)))}</small></span></button>`).join(""):emptyBlock("No matches","Try a category, color, brand, or garment name.")}
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
  const has3d=Boolean(item.ghostMannequin?.image),mode=has3d?(state.garmentImageModes[id]==='normal'?'normal':'3d'):'normal';
  const hasDistinctNormal=has3d&&Boolean(item.image)&&item.image!==item.ghostMannequin?.image;
  $("#garment-detail").innerHTML=`<div class="garment-hero"><div class="garment-detail-image"><img src="${safeUrl(ghostImageForMode(item,mode))}" alt="${escapeHtml(`${item.title||'Garment'} ${mode==='3d'?'3D':'normal'} view`)}">${hasDistinctNormal?garmentViewToggle(item.id,mode,'detail'):''}</div><div><span class="app-kicker">GARMENT DETAILS</span><h2>${escapeHtml(item.title||"Untitled garment")}</h2><p>${escapeHtml(item.aiDescription||item.remarks||"Saved in your ClothMatics wardrobe.")}</p><div class="garment-flags">${item.favorite?"<span>Favorite</span>":""}${item.inLookbook||item.type==="lookbook"?"<span>Lookbook</span>":""}${has3d?"<span>3D saved</span>":""}</div></div></div>
  <form id="garment-edit-form" class="garment-edit-form"><label>Name<input name="title" maxlength="100" value="${escapeHtml(item.title||"")}"></label><label>Category<input name="category" maxlength="60" value="${escapeHtml(item.category||"")}"></label><label>Subcategory<input name="subCategory" maxlength="60" value="${escapeHtml(item.subCategory||"")}"></label><label>Brand<input name="brand" maxlength="80" value="${escapeHtml(item.brand||"")}"></label><label>Primary color<input name="primaryColor" maxlength="40" value="${escapeHtml(item.primaryColor||"")}"></label><label>Pattern<input name="pattern" maxlength="40" value="${escapeHtml(item.pattern||"")}"></label><label>Material<input name="material" maxlength="60" value="${escapeHtml(item.material||item.fabric||"")}"></label><label>Fit<input name="fit" maxlength="40" value="${escapeHtml(item.fit||"")}"></label><label>Laundry status<select name="laundryStatus"><option ${item.laundryStatus==="Clean"?"selected":""}>Clean</option><option ${item.laundryStatus==="Laundry"?"selected":""}>Laundry</option></select></label><label>Purchase price<input name="purchasePrice" type="number" min="0" value="${Number(item.purchasePrice)||""}"></label><label class="check-label"><input name="favorite" type="checkbox" ${item.favorite?"checked":""}> Favorite</label><label class="check-label"><input name="hiddenFromAI" type="checkbox" ${item.hiddenFromAI?"checked":""}> Hide from AI styling</label></form>
  <div class="mobile-action-note"><b>Need a new processed image?</b><span>Use Add to Closet with a new gallery photo, review it, then remove this older item.</span></div><div class="card-actions"><button type="button" data-ghost-item="${escapeHtml(item.id)}">${has3d?"Open 3D studio":"3D Ghost Mannequin"}</button><button data-save-garment="${escapeHtml(item.id)}">Save details</button><button data-style-item="${escapeHtml(item.id)}">Style this</button><button data-complete-item="${escapeHtml(item.id)}">Complete the look</button><button data-share-scope="garment" data-share-id="${escapeHtml(item.id)}">Share</button><button class="danger-button" data-delete-garment="${escapeHtml(item.id)}">Delete garment</button></div>`;
  if(has3d)$("#garment-detail .card-actions")?.insertAdjacentHTML("afterbegin",`<button type="button" data-delete-ghost="${escapeHtml(item.id)}">Delete 3D image</button>`);
  renderGarmentEvidence($('#garment-edit-form'),item,{editable:false});
  closeAllDialogs($("#garment-dialog"));
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
  $("#outfit-detail").innerHTML = `<div class="complete-outfit-head"><span class="app-kicker">${scope === "quest" ? "CLOSET QUEST LOOK" : "PLANNED COMPLETE LOOK"}</span><h2>${escapeHtml(title)}</h2><p>${escapeHtml(context)}</p></div>${items.length ? `<div class="complete-outfit-grid">${items.map((item) => `<article><img src="${safeUrl(ghostImageForMode(item))}" alt="${escapeHtml(item.title || "Outfit garment")}"><div><b>${escapeHtml(item.title || "Garment")}</b><span>${escapeHtml([item.primaryColor,item.category].filter(Boolean).join(" · "))}</span></div></article>`).join("")}</div>` : emptyBlock("Outfit images unavailable", "The garment references for this older outfit are no longer in the wardrobe.")}<div class="mobile-action-note"><b>View-only complete outfit</b><span>Use the ClothMatics mobile app to edit this look or change its plan.</span></div>`;
  closeAllDialogs($("#outfit-dialog"));
  $("#outfit-dialog").showModal();
}

function showOutfitDialog(source,label="COMPLETE OUTFIT"){
  const items=outfitItems(source),title=source.outfit?.title||source.title||source.occasion||"Complete outfit";
  const renderUrl=fullLookImageUrl(outfitRenderFor(source)||outfitRenderFor(source.outfit||{}));
  $("#outfit-detail").innerHTML=`<div class="complete-outfit-head"><span class="app-kicker">${escapeHtml(label)}</span><h2>${escapeHtml(title)}</h2><p>${escapeHtml(source.outfit?.subtitle||source.occasion||"")}</p></div>${renderUrl?`<div class="complete-look-dialog-hero"><img src="${renderUrl}" alt="${escapeHtml(`${title} on a studio mannequin`)}"><span>AI-GENERATED COMPLETE LOOK</span></div>`:''}${items.length?`<div class="complete-outfit-grid">${items.map(item=>`<article><img src="${safeUrl(ghostImageForMode(item))}" alt="${escapeHtml(item.title||"Outfit garment")}"><div><b>${escapeHtml(item.title||"Garment")}</b><span>${escapeHtml([item.primaryColor,item.category].filter(Boolean).join(" · "))}</span></div></article>`).join("")}</div>`:emptyBlock("Outfit images unavailable","These garment references are no longer in the wardrobe.")}`;
  closeAllDialogs($("#outfit-dialog"));
  $("#outfit-dialog").showModal();
}

function renderPurchaseOwnedOptions(){const select=$("#purchase-owned");if(!select)return;select.innerHTML='<option value="">Choose an item</option>'+state.wardrobe.filter((item)=>item.privateItem!==true&&item.stylingUsage!=="private_innerwear").map((item)=>`<option value="${escapeHtml(item.id)}">${escapeHtml(item.title||"Garment")} · ${escapeHtml(item.category||"Uncategorized")}</option>`).join("");renderPurchaseOwnedPreview(null);}
function renderPurchaseOwnedPreview(item){const target=$("#purchase-owned-preview");if(!target)return;target.classList.toggle("hidden",!item);target.innerHTML=item?`<img src="${safeUrl(ghostImageForMode(item))}" alt="${escapeHtml(item.title||"Closet item")}"><div><span>STARTING POINT</span><b>${escapeHtml(item.title||"Garment")}</b><small>${escapeHtml([item.primaryColor,item.category,item.material||item.fabric].filter(Boolean).join(" · "))}</small></div>`:"";}
function useOwnedPurchaseExample(){const item=state.wardrobe.find((entry)=>entry.id===$("#purchase-owned").value);renderPurchaseOwnedPreview(item||null);if(!item)return;$("#purchase-title").value=item.title||"";$("#purchase-category").value=GARMENT_CATEGORIES.includes(item.category)?item.category:"";$("#purchase-color").value=item.primaryColor||"";$("#purchase-pattern").value=item.pattern||"";$("#purchase-material").value=item.material||item.fabric||"";$("#purchase-title").focus();}
async function runPurchaseCheck(event){event.preventDefault();const button=event.currentTarget.querySelector('[type="submit"]'),owned=state.wardrobe.find((item)=>item.id===$("#purchase-owned").value);const candidate={title:$("#purchase-title").value.trim()||owned?.title||"",category:$("#purchase-category").value.trim()||owned?.category||"",primaryColor:$("#purchase-color").value.trim()||owned?.primaryColor||"",pattern:$("#purchase-pattern").value.trim()||owned?.pattern||"",material:$("#purchase-material").value.trim()||owned?.material||owned?.fabric||"",productUrl:$("#purchase-url").value.trim()},price=Number($("#purchase-price").value)||0;if(!candidate.title&&!candidate.category)return toast("Describe the item or choose an owned garment.");button.disabled=true;$("#purchase-result").innerHTML=outfitOrbitLoaderMarkup({kicker:"SMART PURCHASE",title:"Wardrobe Comparison",subtitle:"ANALYZING CLOSET MATCH",statusMessage:"Comparing with your wardrobe…",hidden:false});try{renderPurchaseResult(deterministicPurchaseCheck(candidate,state.wardrobe,price))}catch(error){$("#purchase-result").innerHTML=`<div class="error-box"><b>Could not compare this purchase</b><p>${escapeHtml(error.message)}</p></div>`}finally{button.disabled=false}}
function renderPurchaseResult(result){const similar=(result.similarityMatches||[]).map(match=>state.wardrobe.find(x=>x.id===(match.wardrobeItemId||match.item?.id))).filter(Boolean);const looks=(result.outfitExamples||[]).map(x=>({...x,itemIds:x.itemIds||[]}));$("#purchase-result").innerHTML=`<div class="purchase-verdict"><span>WARDROBE MATCH</span><h3>${escapeHtml(pretty(result.verdict||"consider"))}</h3><p>${escapeHtml(result.summary||(result.reasons||[])[0]||"")}</p></div><div class="purchase-counts">${metricCards([[similar.length,"similar owned items"],[looks.length,"wardrobe combinations"],[result.compatiblePieceCount||new Set(looks.flatMap(x=>x.itemIds)).size,"compatible pieces"]])}</div>${similar.length?`<h4>Similar pieces you own</h4><div class="look-thumbs purchase-similar">${similar.map(item=>`<img src="${safeUrl(ghostImageForMode(item))}" alt="${escapeHtml(item.title)}">`).join("")}</div>`:""}<h4>Ways to wear it</h4><div class="purchase-looks">${looks.slice(0,4).map((look,index)=>`<article><b>Outfit ${index+1}</b><div class="look-thumbs">${look.itemIds.map(id=>state.wardrobe.find(x=>x.id===id)).filter(Boolean).map(item=>`<img src="${safeUrl(ghostImageForMode(item))}" alt="${escapeHtml(item.title)}">`).join("")}</div><p>${escapeHtml(look.explanation||"")}</p></article>`).join("")||emptyBlock("No complete combination found","Add more wardrobe categories through Camera.")}</div>`}

async function shareGeneratedOutfit(index=0){const outfit=outfitForIndex(index);if(!outfit)return;try{const saved=await callCoreApi(state.user,"/v1/outfits/save",{outfit:portableOutfit(outfit),source:state.stylistSource||"ai_stylist_web",occasion:state.stylistResult?.occasion});state.outfits.unshift({id:saved.id,userId:state.user.uid,outfit:portableOutfit(outfit),wardrobeItemIds:outfit.wardrobeItemIds,occasion:state.stylistResult?.occasion});await shareOutfit("saved",saved.id)}catch(error){toast(`Could not share: ${error.message}`)}}

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
  for(let index=0;index<Math.min(items.length,5);index++){const [x,y]=slots[index];ctx.fillStyle="#ffffffef";roundRect(ctx,x,y,290,290,28);ctx.fill();try{const image=await loadShareImage(safeUrl(ghostImageForMode(items[index])));ctx.drawImage(image,x+20,y+20,250,250)}catch{ctx.fillStyle="#6c63ff22";ctx.fillRect(x+20,y+20,250,250)}ctx.fillStyle="#fff";ctx.font="700 22px sans-serif";ctx.fillText(String(items[index].title||"Garment").slice(0,24),x,y+325)}
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
function setAuthBusy(busy) { const googleBtn=$("#google-signin"); if(googleBtn){googleBtn.disabled=busy;} const msg=$("#auth-message"); if(msg)msg.textContent=""; }
function friendlyAuthError(error) {
  const messages = {
    "auth/unauthorized-domain": "Google sign-in is temporarily unavailable on this domain. Please contact support.",
    "auth/operation-not-allowed": "Google sign-in is not enabled for this project right now.",
    "auth/popup-blocked": "Your browser blocked the Google sign-in window. Please allow pop-ups and try again.",
    "auth/popup-closed-by-user": "The Google sign-in window was closed before sign-in finished.",
    "auth/cancelled-popup-request": "Another sign-in window is already open.",
    "auth/api-key-not-valid.-please-pass-a-valid-api-key.": "Sign-in is temporarily unavailable. Please try again later.",
    "auth/network-request-failed": "We could not connect. Check your internet connection and try again.",
  };
  return messages[error?.code] || "Google sign-in could not be completed. Please try again or contact support.";
}
function toast(message,tone="") { const el=$("#toast"); el.textContent=message; if(tone)el.dataset.tone=tone;else delete el.dataset.tone;el.classList.add("show"); setTimeout(()=>el.classList.remove("show"),2800); }
/*__CLOTHMATICS_KAGGLE_SOURCE_BASE64_START__IyA9PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT0NCiMgQ0xPVEhNQVRJQ1MgM0QgR0hPU1QgTUFOTkVRVUlOIC0gQVBQRUFSQU5DRSBWMiBQSVBFTElORSAodjkuMi4wKQ0KIyA9PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT0NCiMgQXJjaGl0ZWN0dXJlOg0KIyAxLiDwn5uh77iPIFNhZmUgQmFzZWxpbmU6IE5vbi1kZXN0cnVjdGl2ZSByYXcgRkxVWCBnZW5lcmF0aW9uLCBoaWdoLXNwZWVkIEZQMTYgY29tcHV0ZS4NCiMgMi4g8J+OqCBDb2xvci1NYW5hZ2VkIElucHV0IERlY29kaW5nOiBzUkdCIElDQyBwcm9maWxlIG5vcm1hbGl6YXRpb24gdmlhIEltYWdlQ21zLA0KIyAgICBFWElGIHRyYW5zcG9zaXRpb24sIGFuZCBhbHBoYSBjaGFubmVsIHByZXNlcnZhdGlvbiBvbnRvIHB1cmUgd2hpdGUgKCNGRkZGRkYpLg0KIyAzLiDwn5OdIFByZXNlcnZhdGlvbi1GaXJzdCBQcm9tcHRpbmc6IFN1Ym9yZGluYXRlIGNhdGVnb3J5ICYgb2JzZXJ2YXRpb24gaGludHMuDQojIDQuIPCfmoAgV2FybSBEdWFsLUdQVSAoUXdlbjMgb24gR1BVIDAsIEZMVVguMiBUcmFuc2Zvcm1lciAmIEZQMzIgVGlsZWQgVkFFIG9uIEdQVSAxKS4NCiMgNS4g8J+ToSBQZXJzaXN0ZW50IEtlZXAtQWxpdmUgU2VydmVyIExvb3Agd2l0aCBSZWFsLVRpbWUgUmVxdWVzdCBTdHJlYW1pbmcuDQojID09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PQ0KDQppbXBvcnQgb3MsIHN5cywganNvbiwgdGltZSwgcmUsIHNvY2tldCwgc3VicHJvY2VzcywgdGV4dHdyYXAsIHVybGxpYi5yZXF1ZXN0LCBzaHV0aWwNCmZyb20gcGF0aGxpYiBpbXBvcnQgUGF0aA0KDQpwcmludCgiU3RhcnRpbmcgQ2xvdGhNYXRpY3MgYXBwZWFyYW5jZSB2MiBlbmdpbmUgKHY5LjIuMCkuLi5cbiIpDQoNCmRlZiByZWFkX2thZ2dsZV9zZWNyZXQobmFtZSk6DQogICAgdmFsdWUgPSBvcy5lbnZpcm9uLmdldChuYW1lLCAnJykuc3RyaXAoKQ0KICAgIGlmIG5vdCB2YWx1ZToNCiAgICAgICAgdHJ5Og0KICAgICAgICAgICAgZnJvbSBrYWdnbGVfc2VjcmV0cyBpbXBvcnQgVXNlclNlY3JldHNDbGllbnQNCiAgICAgICAgICAgIHZhbHVlID0gVXNlclNlY3JldHNDbGllbnQoKS5nZXRfc2VjcmV0KG5hbWUpLnN0cmlwKCkNCiAgICAgICAgZXhjZXB0IEV4Y2VwdGlvbjoNCiAgICAgICAgICAgIHBhc3MNCiAgICBpZiBub3QgdmFsdWU6DQogICAgICAgIHJhaXNlIFJ1bnRpbWVFcnJvcihmJ0FkZCB7bmFtZX0gdG8gS2FnZ2xlIFNlY3JldHMgYW5kIGVuYWJsZSBpdCBmb3IgdGhpcyBub3RlYm9vayBiZWZvcmUgcnVubmluZy4nKQ0KICAgIHJldHVybiB2YWx1ZQ0KDQojIFZhbGlkYXRlIGNvbmZpZ3VyYXRpb24gYmVmb3JlIGRvd25sb2FkaW5nIHdlaWdodHMgb3IgdGFraW5nIEdQVSBtZW1vcnkuDQpTWU5DX1RPS0VOID0gcmVhZF9rYWdnbGVfc2VjcmV0KCdDTE9USE1BVElDU19TWU5DX1RPS0VOJykNCg0KIyAtLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0NCiMgU1RFUCAxOiBDbGVhbiBTdGFydHVwIChUZXJtaW5hdGUgYW55IG9sZCBzZXJ2ZXIsIHR1bm5lbCwgb3IgZmlsZSBoYW5kbGVzKQ0KIyAtLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0NCmZvciBmaF9uYW1lIGluIFsnQVBJX0xPR19GSUxFJywgJ1RVTk5FTF9MT0dfRklMRSddOg0KICAgIGlmIGZoX25hbWUgaW4gZ2xvYmFscygpOg0KICAgICAgICB0cnk6DQogICAgICAgICAgICBnbG9iYWxzKClbZmhfbmFtZV0uY2xvc2UoKQ0KICAgICAgICBleGNlcHQgRXhjZXB0aW9uOg0KICAgICAgICAgICAgcGFzcw0KDQpmb3IgcHJvY19uYW1lIGluIFsnQVBJX1BST0NFU1MnLCAnVFVOTkVMX1BST0NFU1MnXToNCiAgICBpZiBwcm9jX25hbWUgaW4gZ2xvYmFscygpIGFuZCBnbG9iYWxzKClbcHJvY19uYW1lXS5wb2xsKCkgaXMgTm9uZToNCiAgICAgICAgdHJ5Og0KICAgICAgICAgICAgcHJpbnQoZiJTdG9wcGluZyBwcmV2aW91cyB7cHJvY19uYW1lfS4uLiIpDQogICAgICAgICAgICBnbG9iYWxzKClbcHJvY19uYW1lXS50ZXJtaW5hdGUoKQ0KICAgICAgICAgICAgZ2xvYmFscygpW3Byb2NfbmFtZV0ud2FpdCh0aW1lb3V0PTMpDQogICAgICAgIGV4Y2VwdCBFeGNlcHRpb246DQogICAgICAgICAgICBwYXNzDQoNCiMgU3RvcCBvbmx5IHN1YnByb2Nlc3NlcyBjcmVhdGVkIGJ5IHRoaXMgbm90ZWJvb2suIERvIG5vdCBraWxsIG90aGVyIG5vdGVib29rcy4NCg0KIyAtLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0NCiMgU1RFUCAyOiBEZWRpY2F0ZWQgUHJvamVjdCBFbnZpcm9ubWVudCAmIERlcGVuZGVuY2llcw0KIyAtLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0NClBST0pFQ1QgPSBQYXRoKCcva2FnZ2xlL3dvcmtpbmcvY2xvdGhtYXRpY3NfZ2hvc3RfZW52JykNClBST0pFQ1QubWtkaXIocGFyZW50cz1UcnVlLCBleGlzdF9vaz1UcnVlKQ0KRU5WID0gUFJPSkVDVCAvICcudmVudicNClBZVEhPTiA9IHN5cy5leGVjdXRhYmxlDQoNCiMgU2VsZi1oZWFsaW5nIGVudmlyb25tZW50IGNyZWF0aW9uOiBhdm9pZCBlbnN1cmVwaXAgY3Jhc2hlcyBvbiBEZWJpYW4vVWJ1bnR1DQp0cnk6DQogICAgaW1wb3J0IHZlbnYNCiAgICBpZiBub3QgRU5WLmV4aXN0cygpOg0KICAgICAgICB2ZW52LkVudkJ1aWxkZXIod2l0aF9waXA9RmFsc2UsIHN5c3RlbV9zaXRlX3BhY2thZ2VzPVRydWUpLmNyZWF0ZShFTlYpDQoNCiAgICBjYW5kID0gc3RyKEVOViAvICdiaW4nIC8gJ3B5dGhvbicpDQogICAgaWYgKEVOViAvICdiaW4nIC8gJ3B5dGhvbicpLmV4aXN0cygpOg0KICAgICAgICBwcm9iZSA9IHN1YnByb2Nlc3MucnVuKFtjYW5kLCAnLWMnLCAnaW1wb3J0IHN5czsgcHJpbnQoc3lzLnZlcnNpb24pJ10sIGNhcHR1cmVfb3V0cHV0PVRydWUpDQogICAgICAgIGlmIHByb2JlLnJldHVybmNvZGUgPT0gMDoNCiAgICAgICAgICAgIFBZVEhPTiA9IGNhbmQNCmV4Y2VwdCBFeGNlcHRpb24gYXMgZToNCiAgICBwcmludChmIk5vdGUgb24gZW52aXJvbm1lbnQgKHtlfSksIHVzaW5nIEthZ2dsZSBydW50aW1lIFB5dGhvbiBkaXJlY3RseS4iKQ0KICAgIFBZVEhPTiA9IHN5cy5leGVjdXRhYmxlDQoNClBLR1MgPSBbDQogICAgImZhc3RhcGkiLCAidXZpY29ybltzdGFuZGFyZF0iLCAicHl0aG9uLW11bHRpcGFydCIsICJvcGVuY3YtcHl0aG9uLWhlYWRsZXNzIiwNCiAgICAiZGlmZnVzZXJzPT0wLjQwLjAiLCAidHJhbnNmb3JtZXJzPT01LjE2LjEiLCAiYWNjZWxlcmF0ZT09MS4xNC4wIiwNCiAgICAiYml0c2FuZGJ5dGVzPT0wLjUwLjIiLCAicGVmdD09MC4yMC4wIiwgInNhZmV0ZW5zb3JzPT0wLjguMCIsDQogICAgImh1Z2dpbmdmYWNlLWh1YiIsICJQaWxsb3c+PTEwLjQuMCIsICJzY2lweT09MS4xNC4xIiwNCiAgICAiZ29vZ2xlLWNsb3VkLWJpZ3F1ZXJ5LXN0b3JhZ2U+PTIuMC4wIg0KXQ0KDQpwcmludCgiSW5zdGFsbGluZyAmIHZlcmlmeWluZyByZXF1aXJlZCBwYWNrYWdlcy4uLiIpDQpwaXBfZmxhZ3MgPSBbImluc3RhbGwiLCAiLXEiLCAiLS1uby13YXJuLWNvbmZsaWN0cyJdDQppbnN0YWxsX3N1Y2Nlc3MgPSBGYWxzZQ0KaWYgUFlUSE9OICE9IHN5cy5leGVjdXRhYmxlOg0KICAgIHRyeToNCiAgICAgICAgc3VicHJvY2Vzcy5ydW4oW3N5cy5leGVjdXRhYmxlLCAiLW0iLCAicGlwIiwgIi0tcHl0aG9uIiwgUFlUSE9OXSArIHBpcF9mbGFncyArIFBLR1MsIGNoZWNrPVRydWUpDQogICAgICAgIGluc3RhbGxfc3VjY2VzcyA9IFRydWUNCiAgICBleGNlcHQgRXhjZXB0aW9uOg0KICAgICAgICBwcmludCgiVmVudiBpbnN0YWxsIGZhaWxlZCwgc3dpdGNoaW5nIHRvIEthZ2dsZSBydW50aW1lIFB5dGhvbi4uLiIpDQogICAgICAgIFBZVEhPTiA9IHN5cy5leGVjdXRhYmxlDQoNCmlmIG5vdCBpbnN0YWxsX3N1Y2Nlc3M6DQogICAgc3VicHJvY2Vzcy5ydW4oW3N5cy5leGVjdXRhYmxlLCAiLW0iLCAicGlwIl0gKyBwaXBfZmxhZ3MgKyBQS0dTLCBjaGVjaz1UcnVlKQ0KDQojIEdQVSBIYXJkd2FyZSBDb25maXJtYXRpb24NCnByb2JlID0gdGV4dHdyYXAuZGVkZW50KCIiIg0KICAgIGltcG9ydCB0b3JjaA0KICAgIGlmIG5vdCB0b3JjaC5jdWRhLmlzX2F2YWlsYWJsZSgpOg0KICAgICAgICByYWlzZSBSdW50aW1lRXJyb3IoJ0thZ2dsZSBHUFUgbm90IGFjdGl2ZSEgUmlnaHQgc2lkZWJhciBtZSBBY2NlbGVyYXRvciAtPiBHUFUgVDQgeDIgc2VsZWN0IGthcmVpbi4nKQ0KICAgIGNvdW50ID0gdG9yY2guY3VkYS5kZXZpY2VfY291bnQoKQ0KICAgIHByaW50KGYiRGV0ZWN0ZWQge2NvdW50fSBHUFUocyk6IikNCiAgICBmb3IgaSBpbiByYW5nZShjb3VudCk6DQogICAgICAgIGZyZWUsIHRvdGFsID0gdG9yY2guY3VkYS5tZW1fZ2V0X2luZm8oaSkNCiAgICAgICAgcHJpbnQoZiIgIEdQVSB7aX06IHt0b3JjaC5jdWRhLmdldF9kZXZpY2VfbmFtZShpKX0gKHtyb3VuZChmcmVlLzIqKjMwLCAyKX0gR0IgLyB7cm91bmQodG90YWwvMioqMzAsIDIpfSBHQiBmcmVlKSIpDQoiIiIpDQpzdWJwcm9jZXNzLnJ1bihbUFlUSE9OLCAiLXUiLCAiLWMiLCBwcm9iZV0sIGNoZWNrPVRydWUpDQpwcmludCgi4pyFIEdQVSBoYXJkd2FyZSBjb25maXJtZWQuIikNCg0KIyAtLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0NCiMgU1RFUCAzOiBQcmUtY2FjaGUgRkxVWC4yLWtsZWluLTRCICYgUXdlbjMgTW9kZWwgV2VpZ2h0cw0KIyAtLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0NCnByaW50KCJcbiIgKyAiPSIqODApDQpwcmludCgi8J+TpSBTVEVQIDM6IERvd25sb2FkaW5nICYgUHJlLWNhY2hpbmcgRkxVWC4yLWtsZWluLTRCIFdlaWdodHMgdG8gTG9jYWwgU1NELi4uIikNCnByaW50KCI9Iio4MCkNCmNhY2hlX3Byb2JlID0gdGV4dHdyYXAuZGVkZW50KCIiIg0KICAgIGltcG9ydCBvcywgc3lzDQogICAgZnJvbSBodWdnaW5nZmFjZV9odWIgaW1wb3J0IHNuYXBzaG90X2Rvd25sb2FkDQoNCiAgICBhcnRpZmFjdF9pZCA9ICJibGFjay1mb3Jlc3QtbGFicy9GTFVYLjIta2xlaW4tNEIiDQogICAgcmV2aXNpb24gPSAiZTdiN2RjMjdmOTFkZWFjYWQzOGU3ODk3NmQxZjJiNDk5ZDc2YTI5NCINCiAgICBwcmludChmIkRvd25sb2FkaW5nL3ZlcmlmeWluZyB3ZWlnaHRzIGZvciB7YXJ0aWZhY3RfaWR9Li4uIikNCiAgICBwcmludChmIlVzaW5nIDggcGFyYWxsZWwgZG93bmxvYWQgd29ya2VycyAocHJvZ3Jlc3MgYmFyIGRpc3BsYXllZCBiZWxvdyk6IikNCiAgICBwYXRoID0gc25hcHNob3RfZG93bmxvYWQoDQogICAgICAgIHJlcG9faWQ9YXJ0aWZhY3RfaWQsDQogICAgICAgIHJldmlzaW9uPXJldmlzaW9uLA0KICAgICAgICBpZ25vcmVfcGF0dGVybnM9WyIqLm1zZ3BhY2siLCAiKi5vbm54Il0sDQogICAgICAgIG1heF93b3JrZXJzPTgNCiAgICApDQogICAgcHJpbnQoZiLinIUgQWxsIG1vZGVsIHdlaWdodHMgcmVhZHkgaW4gbG9jYWwgU1NEIGNhY2hlISIpDQoiIiIpDQpzdWJwcm9jZXNzLnJ1bihbUFlUSE9OLCAiLXUiLCAiLWMiLCBjYWNoZV9wcm9iZV0sIGNoZWNrPVRydWUpDQoNCiMgLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tDQojIFNURVAgNDogSGlnaC1TcGVlZCBXYXJtIEluLU1lbW9yeSBGYXN0QVBJIFNlcnZlciArIENvbG9yIENhbGlicmF0aW9uDQojIC0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLQ0KV0FSTV9TRVJWRVJfQ09ERSA9ICdpbXBvcnQgaW8sIGpzb24sIG9zLCBzdWJwcm9jZXNzLCBzeXMsIHRlbXBmaWxlLCB0aHJlYWRpbmcsIHRpbWUsIHV1aWQsIHJlLCB3YXJuaW5nc1xuaW1wb3J0IGltcG9ydGxpYi5tZXRhZGF0YVxuaW1wb3J0IGFzeW5jaW8sIGhhc2hsaWJcbmZyb20gY29sbGVjdGlvbnMgaW1wb3J0IE9yZGVyZWREaWN0XG5mcm9tIHByb21wdF9jb250cmFjdCBpbXBvcnQgbm9ybWFsaXplX2NhdGVnb3J5LCBub3JtYWxpemVfbWFuaWZlc3QsIHBhY2tfcHJvbXB0LCBjYXRlZ29yeV9kaW1lbnNpb25zLCBDT05UUkFDVF9WRVJTSU9OXG5mcm9tIGRhdGFjbGFzc2VzIGltcG9ydCBkYXRhY2xhc3NcbmZyb20gdHlwaW5nIGltcG9ydCBPcHRpb25hbCwgRGljdCwgQW55LCBUdXBsZSwgTGlzdFxuZnJvbSBwYXRobGliIGltcG9ydCBQYXRoXG5pbXBvcnQgY3YyXG5pbXBvcnQgbnVtcHkgYXMgbnBcbmZyb20gUElMIGltcG9ydCBJbWFnZSwgSW1hZ2VPcHMsIEltYWdlQ21zLCBVbmlkZW50aWZpZWRJbWFnZUVycm9yXG5pbXBvcnQgdG9yY2hcbmZyb20gZmFzdGFwaSBpbXBvcnQgRmFzdEFQSSwgRmlsZSwgRm9ybSwgSFRUUEV4Y2VwdGlvbiwgVXBsb2FkRmlsZSwgUmVxdWVzdFxuZnJvbSBmYXN0YXBpLm1pZGRsZXdhcmUuY29ycyBpbXBvcnQgQ09SU01pZGRsZXdhcmVcbmZyb20gZmFzdGFwaS5yZXNwb25zZXMgaW1wb3J0IFJlc3BvbnNlXG5cbiMgPT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09XG4jIDEuIENPTlNUQU5UUywgUFJPRklMRVMgJiBDT0xPUiBNQU5BR0VNRU5UXG4jID09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PVxuUElQRUxJTkVfVkVSU0lPTiA9ICI5LjIuMC1tdWx0aWNvbG9yIlxuTUFYX1VQTE9BRF9CWVRFUyA9IDIwICogMTAyNCAqIDEwMjQgICMgMjAgTUJcbk1BWF9JTlBVVF9QSVhFTFMgPSAyNF8wMDBfMDAwICAgICAgICAjIDI0IE1weFxuU1JHQl9QUk9GSUxFID0gSW1hZ2VDbXMuSW1hZ2VDbXNQcm9maWxlKEltYWdlQ21zLmNyZWF0ZVByb2ZpbGUoInNSR0IiKSlcblNSR0JfSUNDID0gU1JHQl9QUk9GSUxFLnRvYnl0ZXMoKVxuXG5jbGFzcyBJbnB1dEltYWdlRXJyb3IoVmFsdWVFcnJvcik6XG4gICAgIiIiUmFpc2VkIHdoZW4gYW4gdXBsb2FkZWQgaW5wdXQgaW1hZ2UgdmlvbGF0ZXMgc2l6ZSwgbW9kZSBvciBmb3JtYXQgY29uc3RyYWludHMuIiIiXG4gICAgcGFzc1xuXG5AZGF0YWNsYXNzXG5jbGFzcyBEZWNvZGVkR2FybWVudDpcbiAgICByZ2I6IEltYWdlLkltYWdlXG4gICAgYWxwaGE6IE9wdGlvbmFsW0ltYWdlLkltYWdlXVxuICAgIGNvbmRpdGlvbmluZ19yZ2I6IEltYWdlLkltYWdlXG4gICAgbm90aWNlczogdHVwbGVcblxuZGVmIGRlY29kZV9nYXJtZW50KGRhdGE6IGJ5dGVzKSAtPiBEZWNvZGVkR2FybWVudDpcbiAgICBpZiBub3QgZGF0YSBvciBsZW4oZGF0YSkgPiBNQVhfVVBMT0FEX0JZVEVTOlxuICAgICAgICByYWlzZSBJbnB1dEltYWdlRXJyb3IoIkltYWdlIGlzIGVtcHR5IG9yIGV4Y2VlZHMgdGhlIHVwbG9hZCBsaW1pdCAoMjBNQikiKVxuICAgIG5vdGljZXMgPSBbXVxuICAgIHRyeTpcbiAgICAgICAgd2l0aCB3YXJuaW5ncy5jYXRjaF93YXJuaW5ncygpOlxuICAgICAgICAgICAgd2FybmluZ3Muc2ltcGxlZmlsdGVyKCJlcnJvciIsIEltYWdlLkRlY29tcHJlc3Npb25Cb21iV2FybmluZylcbiAgICAgICAgICAgIHdpdGggSW1hZ2Uub3Blbihpby5CeXRlc0lPKGRhdGEpKSBhcyBvcGVuZWQ6XG4gICAgICAgICAgICAgICAgaWYgZ2V0YXR0cihvcGVuZWQsICJuX2ZyYW1lcyIsIDEpICE9IDE6XG4gICAgICAgICAgICAgICAgICAgIHJhaXNlIElucHV0SW1hZ2VFcnJvcigiVXBsb2FkIG9uZSBzdGlsbCBpbWFnZSIpXG4gICAgICAgICAgICAgICAgaWYgb3BlbmVkLndpZHRoICogb3BlbmVkLmhlaWdodCA+IE1BWF9JTlBVVF9QSVhFTFM6XG4gICAgICAgICAgICAgICAgICAgIHJhaXNlIElucHV0SW1hZ2VFcnJvcigiSW1hZ2UgZXhjZWVkcyB0aGUgcGl4ZWwgbGltaXQgKDI0TSBwaXhlbHMpIilcbiAgICAgICAgICAgICAgICBvcGVuZWQubG9hZCgpXG4gICAgICAgICAgICAgICAgaWNjID0gb3BlbmVkLmluZm8uZ2V0KCJpY2NfcHJvZmlsZSIpXG4gICAgICAgICAgICAgICAgb3JpZW50ZWQgPSBJbWFnZU9wcy5leGlmX3RyYW5zcG9zZShvcGVuZWQpXG4gICAgICAgICAgICAgICAgaGFzX2FscGhhID0gKFxuICAgICAgICAgICAgICAgICAgICAiQSIgaW4gb3JpZW50ZWQuZ2V0YmFuZHMoKSBvciAidHJhbnNwYXJlbmN5IiBpbiBvcmllbnRlZC5pbmZvXG4gICAgICAgICAgICAgICAgKVxuICAgICAgICAgICAgICAgIGFscGhhID0gb3JpZW50ZWQuY29udmVydCgiUkdCQSIpLmdldGNoYW5uZWwoIkEiKSBpZiBoYXNfYWxwaGEgZWxzZSBOb25lXG4gICAgICAgICAgICAgICAgaWYgYWxwaGEgaXMgbm90IE5vbmU6XG4gICAgICAgICAgICAgICAgICAgIGV4dHJlbWEgPSBhbHBoYS5nZXRleHRyZW1hKClcbiAgICAgICAgICAgICAgICAgICAgaWYgZXh0cmVtYVsxXSA9PSAwOlxuICAgICAgICAgICAgICAgICAgICAgICAgcmFpc2UgSW5wdXRJbWFnZUVycm9yKCJJbWFnZSBpcyBmdWxseSB0cmFuc3BhcmVudCIpXG4gICAgICAgICAgICAgICAgICAgIGlmIGV4dHJlbWEgPT0gKDI1NSwgMjU1KTpcbiAgICAgICAgICAgICAgICAgICAgICAgIGFscGhhID0gTm9uZVxuICAgICAgICAgICAgICAgIGlmIG9yaWVudGVkLm1vZGUgPT0gIkxBIjpcbiAgICAgICAgICAgICAgICAgICAgYmFzZSA9IG9yaWVudGVkLmdldGNoYW5uZWwoIkwiKVxuICAgICAgICAgICAgICAgIGVsc2U6XG4gICAgICAgICAgICAgICAgICAgIGJhc2UgPSBvcmllbnRlZCBpZiBvcmllbnRlZC5tb2RlIGluICgiUkdCIiwgIkNNWUsiLCAiTCIsICJMQUIiKSBlbHNlIG9yaWVudGVkLmNvbnZlcnQoIlJHQiIpXG4gICAgICAgICAgICAgICAgaWYgaWNjOlxuICAgICAgICAgICAgICAgICAgICB0cnk6XG4gICAgICAgICAgICAgICAgICAgICAgICBzcmNfcHJvZmlsZSA9IEltYWdlQ21zLkltYWdlQ21zUHJvZmlsZShpby5CeXRlc0lPKGljYykpXG4gICAgICAgICAgICAgICAgICAgICAgICByZ2IgPSBJbWFnZUNtcy5wcm9maWxlVG9Qcm9maWxlKFxuICAgICAgICAgICAgICAgICAgICAgICAgICAgIGJhc2UsIHNyY19wcm9maWxlLCBTUkdCX1BST0ZJTEUsIG91dHB1dE1vZGU9IlJHQiJcbiAgICAgICAgICAgICAgICAgICAgICAgIClcbiAgICAgICAgICAgICAgICAgICAgZXhjZXB0IChJbWFnZUNtcy5QeUNNU0Vycm9yLCBPU0Vycm9yLCBWYWx1ZUVycm9yKSBhcyBleGM6XG4gICAgICAgICAgICAgICAgICAgICAgICByYWlzZSBJbnB1dEltYWdlRXJyb3IoIkVtYmVkZGVkIGNvbG9yIHByb2ZpbGUgY2Fubm90IGJlIGNvbnZlcnRlZCIpIGZyb20gZXhjXG4gICAgICAgICAgICAgICAgZWxzZTpcbiAgICAgICAgICAgICAgICAgICAgaWYgYmFzZS5tb2RlIG5vdCBpbiAoIlJHQiIsICJMIik6XG4gICAgICAgICAgICAgICAgICAgICAgICByYWlzZSBJbnB1dEltYWdlRXJyb3IoIlRoaXMgY29sb3IgbW9kZSByZXF1aXJlcyBhIHZhbGlkIGVtYmVkZGVkIHByb2ZpbGUiKVxuICAgICAgICAgICAgICAgICAgICByZ2IgPSBiYXNlLmNvbnZlcnQoIlJHQiIpXG4gICAgICAgICAgICAgICAgICAgIG5vdGljZXMuYXBwZW5kKCJ1bnRhZ2dlZF9pbnB1dF9hc3N1bWVkX3NyZ2IiKVxuICAgICAgICAgICAgICAgIHJnYiA9IHJnYi5jb3B5KClcbiAgICAgICAgICAgICAgICBpZiBhbHBoYSBpcyBub3QgTm9uZTpcbiAgICAgICAgICAgICAgICAgICAgYWxwaGEgPSBhbHBoYS5jb3B5KClcbiAgICAgICAgICAgICAgICAgICAgcmdiYSA9IHJnYi5jb252ZXJ0KCJSR0JBIilcbiAgICAgICAgICAgICAgICAgICAgcmdiYS5wdXRhbHBoYShhbHBoYSlcbiAgICAgICAgICAgICAgICAgICAgd2hpdGUgPSBJbWFnZS5uZXcoIlJHQkEiLCByZ2Iuc2l6ZSwgKDI1NSwgMjU1LCAyNTUsIDI1NSkpXG4gICAgICAgICAgICAgICAgICAgIGNvbmRpdGlvbmluZyA9IEltYWdlLmFscGhhX2NvbXBvc2l0ZSh3aGl0ZSwgcmdiYSkuY29udmVydCgiUkdCIilcbiAgICAgICAgICAgICAgICBlbHNlOlxuICAgICAgICAgICAgICAgICAgICBjb25kaXRpb25pbmcgPSByZ2IuY29weSgpXG4gICAgICAgICAgICAgICAgcmdiLmluZm8uY2xlYXIoKVxuICAgICAgICAgICAgICAgIGNvbmRpdGlvbmluZy5pbmZvLmNsZWFyKClcbiAgICAgICAgICAgICAgICByZXR1cm4gRGVjb2RlZEdhcm1lbnQocmdiLCBhbHBoYSwgY29uZGl0aW9uaW5nLCB0dXBsZShub3RpY2VzKSlcbiAgICBleGNlcHQgSW5wdXRJbWFnZUVycm9yOlxuICAgICAgICByYWlzZVxuICAgIGV4Y2VwdCAoVW5pZGVudGlmaWVkSW1hZ2VFcnJvciwgT1NFcnJvciwgVmFsdWVFcnJvciwgSW1hZ2UuRGVjb21wcmVzc2lvbkJvbWJXYXJuaW5nLCBnZXRhdHRyKEltYWdlLCAiRGVjb21wcmVzc2lvbkJvbWJFcnJvciIsIEV4Y2VwdGlvbikpIGFzIGV4YzpcbiAgICAgICAgcmFpc2UgSW5wdXRJbWFnZUVycm9yKCJVbnN1cHBvcnRlZCBvciBpbnZhbGlkIGltYWdlIikgZnJvbSBleGNcblxuZGVmIGNvbmRpdGlvbmluZ190aHVtYm5haWwoZGVjb2RlZDogRGVjb2RlZEdhcm1lbnQsIG1heF9zaXplPSg3NjgsIDEwMjQpKSAtPiBJbWFnZS5JbWFnZTpcbiAgICByZXN1bHQgPSBkZWNvZGVkLmNvbmRpdGlvbmluZ19yZ2IuY29weSgpXG4gICAgcmVzdWx0LnRodW1ibmFpbChtYXhfc2l6ZSwgSW1hZ2UuUmVzYW1wbGluZy5MQU5DWk9TKVxuICAgIHJldHVybiByZXN1bHRcblxuIyA9PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT1cbiMgMi4gQ0FURUdPUlkgTk9STUFMSVpBVElPTiAmIFBSRVNFUlZBVElPTiBQUk9NUFRTXG4jID09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PVxuIyBDYXRlZ29yeSBoYW5kbGluZyBhbmQgdG9rZW4tYXdhcmUgcHJvbXB0cyBsaXZlIGluIHByb21wdF9jb250cmFjdC5weS5cblxuY2xhc3MgV2FybUR1YWxHcHVFbmdpbmU6XG4gICAgZGVmIF9faW5pdF9fKHNlbGYpOlxuICAgICAgICB0cnk6XG4gICAgICAgICAgICBmcm9tIHRyYW5zZm9ybWVycyBpbXBvcnQgUXdlbjNGb3JDYXVzYWxMTSBhcyBUZXh0RW5jb2Rlck1vZGVsXG4gICAgICAgIGV4Y2VwdCAoSW1wb3J0RXJyb3IsIEF0dHJpYnV0ZUVycm9yKTpcbiAgICAgICAgICAgIGZyb20gdHJhbnNmb3JtZXJzIGltcG9ydCBBdXRvTW9kZWxGb3JDYXVzYWxMTSBhcyBUZXh0RW5jb2Rlck1vZGVsXG4gICAgICAgIGZyb20gdHJhbnNmb3JtZXJzIGltcG9ydCBCaXRzQW5kQnl0ZXNDb25maWcgYXMgVGV4dFF1YW50XG4gICAgICAgIGZyb20gZGlmZnVzZXJzIGltcG9ydCBGbHV4MktsZWluUGlwZWxpbmUsIEZsdXgyVHJhbnNmb3JtZXIyRE1vZGVsLCBCaXRzQW5kQnl0ZXNDb25maWcgYXMgSW1hZ2VRdWFudFxuICAgICAgICBcbiAgICAgICAgc2VsZi5udW1fZ3B1cyA9IHRvcmNoLmN1ZGEuZGV2aWNlX2NvdW50KClcbiAgICAgICAgaWYgc2VsZi5udW1fZ3B1cyA9PSAwOlxuICAgICAgICAgICAgcmFpc2UgUnVudGltZUVycm9yKFwnRW5hYmxlIGEgS2FnZ2xlIEdQVSBhY2NlbGVyYXRvciBiZWZvcmUgc3RhcnRpbmcgdGhlIGVuZ2luZS5cJylcbiAgICAgICAgaWYgc2VsZi5udW1fZ3B1cyA+PSAyOlxuICAgICAgICAgICAgc2VsZi50ZXh0X2RldmljZSA9IHRvcmNoLmRldmljZSgiY3VkYTowIilcbiAgICAgICAgICAgIHNlbGYuaW1hZ2VfZGV2aWNlID0gdG9yY2guZGV2aWNlKCJjdWRhOjEiKVxuICAgICAgICAgICAgcHJpbnQoIvCfmoAgRFVBTC1HUFUgUElQRUxJTkU6IEdQVSAwIChRd2VuMyBUZXh0KSB8IEdQVSAxIChGTFVYIFRyYW5zZm9ybWVyKSIsIGZsdXNoPVRydWUpXG4gICAgICAgIGVsaWYgc2VsZi5udW1fZ3B1cyA9PSAxOlxuICAgICAgICAgICAgc2VsZi50ZXh0X2RldmljZSA9IHRvcmNoLmRldmljZSgiY3VkYTowIilcbiAgICAgICAgICAgIHNlbGYuaW1hZ2VfZGV2aWNlID0gdG9yY2guZGV2aWNlKCJjdWRhOjAiKVxuICAgICAgICAgICAgcHJpbnQoIuKaoSBTSU5HTEUtR1BVIFBJUEVMSU5FOiBHUFUgMCAoU2hhcmVkKSIsIGZsdXNoPVRydWUpXG4gICAgICAgIGVsc2U6XG4gICAgICAgICAgICBzZWxmLnRleHRfZGV2aWNlID0gdG9yY2guZGV2aWNlKCJjcHUiKVxuICAgICAgICAgICAgc2VsZi5pbWFnZV9kZXZpY2UgPSB0b3JjaC5kZXZpY2UoImNwdSIpXG5cbiAgICAgICAgYXJ0aWZhY3RfaWQgPSAiYmxhY2stZm9yZXN0LWxhYnMvRkxVWC4yLWtsZWluLTRCIlxuICAgICAgICBzZWxmLnJldmlzaW9uID0gImU3YjdkYzI3ZjkxZGVhY2FkMzhlNzg5NzZkMWYyYjQ5OWQ3NmEyOTQiXG4gICAgICAgIHNlbGYuY29tcHV0ZV9kdHlwZSA9IHRvcmNoLmZsb2F0MTZcblxuICAgICAgICBxdWFudCA9IGRpY3QoXG4gICAgICAgICAgICBsb2FkX2luXzRiaXQ9VHJ1ZSxcbiAgICAgICAgICAgIGJuYl80Yml0X3F1YW50X3R5cGU9Im5mNCIsXG4gICAgICAgICAgICBibmJfNGJpdF91c2VfZG91YmxlX3F1YW50PVRydWUsXG4gICAgICAgICAgICBibmJfNGJpdF9jb21wdXRlX2R0eXBlPXNlbGYuY29tcHV0ZV9kdHlwZVxuICAgICAgICApXG4gICAgICAgIHBpbm5lZCA9IGRpY3QocmV2aXNpb249c2VsZi5yZXZpc2lvbiwgdHJ1c3RfcmVtb3RlX2NvZGU9RmFsc2UpXG5cbiAgICAgICAgcHJpbnQoZiLimqEgWzEvMl0gTG9hZGluZyBRd2VuMyBUZXh0IEVuY29kZXIgaW50byB7c2VsZi50ZXh0X2RldmljZX0gKGNvbXB1dGU6IHtzZWxmLmNvbXB1dGVfZHR5cGV9KS4uLiIsIGZsdXNoPVRydWUpXG4gICAgICAgIGVuY29kZXIgPSBUZXh0RW5jb2Rlck1vZGVsLmZyb21fcHJldHJhaW5lZChcbiAgICAgICAgICAgIGFydGlmYWN0X2lkLCBzdWJmb2xkZXI9InRleHRfZW5jb2RlciIsXG4gICAgICAgICAgICBxdWFudGl6YXRpb25fY29uZmlnPVRleHRRdWFudCgqKnF1YW50KSwgdG9yY2hfZHR5cGU9c2VsZi5jb21wdXRlX2R0eXBlLFxuICAgICAgICAgICAgZGV2aWNlX21hcD17XCdcJzogc3RyKHNlbGYudGV4dF9kZXZpY2UpfSBpZiB0b3JjaC5jdWRhLmlzX2F2YWlsYWJsZSgpIGVsc2UgTm9uZSwgKipwaW5uZWRcbiAgICAgICAgKVxuICAgICAgICBzZWxmLnRleHRfcGlwZSA9IEZsdXgyS2xlaW5QaXBlbGluZS5mcm9tX3ByZXRyYWluZWQoXG4gICAgICAgICAgICBhcnRpZmFjdF9pZCwgdGV4dF9lbmNvZGVyPWVuY29kZXIsIHRyYW5zZm9ybWVyPU5vbmUsXG4gICAgICAgICAgICB2YWU9Tm9uZSwgdG9yY2hfZHR5cGU9c2VsZi5jb21wdXRlX2R0eXBlLCAqKnBpbm5lZFxuICAgICAgICApXG5cbiAgICAgICAgcHJpbnQoZiLimqEgWzIvMl0gTG9hZGluZyBGTFVYLjIgVHJhbnNmb3JtZXIgaW50byB7c2VsZi5pbWFnZV9kZXZpY2V9Li4uIiwgZmx1c2g9VHJ1ZSlcbiAgICAgICAgdHJhbnNmb3JtZXIgPSBGbHV4MlRyYW5zZm9ybWVyMkRNb2RlbC5mcm9tX3ByZXRyYWluZWQoXG4gICAgICAgICAgICBhcnRpZmFjdF9pZCwgc3ViZm9sZGVyPSJ0cmFuc2Zvcm1lciIsXG4gICAgICAgICAgICBxdWFudGl6YXRpb25fY29uZmlnPUltYWdlUXVhbnQoKipxdWFudCksIHRvcmNoX2R0eXBlPXNlbGYuY29tcHV0ZV9kdHlwZSxcbiAgICAgICAgICAgIGRldmljZV9tYXA9e1wnXCc6IHN0cihzZWxmLmltYWdlX2RldmljZSl9IGlmIHRvcmNoLmN1ZGEuaXNfYXZhaWxhYmxlKCkgZWxzZSBOb25lLCAqKnBpbm5lZFxuICAgICAgICApXG5cbiAgICAgICAgcHJpbnQoZiLimqEgWzMvM10gQXNzZW1ibGluZyBGTFVYLjIgUGlwZWxpbmUgJiBWQUUgaW50byB7c2VsZi5pbWFnZV9kZXZpY2V9Li4uIiwgZmx1c2g9VHJ1ZSlcbiAgICAgICAgc2VsZi5pbWFnZV9waXBlID0gRmx1eDJLbGVpblBpcGVsaW5lLmZyb21fcHJldHJhaW5lZChcbiAgICAgICAgICAgIGFydGlmYWN0X2lkLCB0cmFuc2Zvcm1lcj10cmFuc2Zvcm1lcixcbiAgICAgICAgICAgIHRleHRfZW5jb2Rlcj1Ob25lLCB0b2tlbml6ZXI9Tm9uZSwgdG9yY2hfZHR5cGU9c2VsZi5jb21wdXRlX2R0eXBlLCAqKnBpbm5lZFxuICAgICAgICApXG4gICAgICAgIHNlbGYuaW1hZ2VfcGlwZS52YWUudG8oZGV2aWNlPXNlbGYuaW1hZ2VfZGV2aWNlLCBkdHlwZT10b3JjaC5mbG9hdDMyKVxuICAgICAgICBpZiBoYXNhdHRyKHNlbGYuaW1hZ2VfcGlwZS52YWUsIFwnZW5hYmxlX3RpbGluZ1wnKTpcbiAgICAgICAgICAgIHRyeTpcbiAgICAgICAgICAgICAgICBzZWxmLmltYWdlX3BpcGUudmFlLmVuYWJsZV90aWxpbmcoKVxuICAgICAgICAgICAgZXhjZXB0IEV4Y2VwdGlvbjpcbiAgICAgICAgICAgICAgICBwYXNzXG5cbiAgICAgICAgIyBWQUUgUHJlY2lzaW9uIEJyaWRnZTogYXV0b21hdGljYWxseSBjYXN0IGluY29taW5nIGxhdGVudHMgdG8gVkFFXCdzIEZQMzIgcHJlY2lzaW9uXG4gICAgICAgIHRhcmdldF92YWVfZGV2ID0gc2VsZi5pbWFnZV9kZXZpY2VcbiAgICAgICAgdGFyZ2V0X3ZhZV9kdHlwZSA9IHRvcmNoLmZsb2F0MzJcblxuICAgICAgICBvcmlnX3ZhZV9kZWNvZGUgPSBzZWxmLmltYWdlX3BpcGUudmFlLmRlY29kZVxuICAgICAgICBkZWYgc2FmZV92YWVfZGVjb2RlKGxhdGVudHMsICphcmdzLCAqKmt3YXJncyk6XG4gICAgICAgICAgICBpZiB0b3JjaC5pc190ZW5zb3IobGF0ZW50cyk6XG4gICAgICAgICAgICAgICAgbGF0ZW50cyA9IGxhdGVudHMudG8oZGV2aWNlPXRhcmdldF92YWVfZGV2LCBkdHlwZT10YXJnZXRfdmFlX2R0eXBlKVxuICAgICAgICAgICAgcmV0dXJuIG9yaWdfdmFlX2RlY29kZShsYXRlbnRzLCAqYXJncywgKiprd2FyZ3MpXG4gICAgICAgIHNlbGYuaW1hZ2VfcGlwZS52YWUuZGVjb2RlID0gc2FmZV92YWVfZGVjb2RlXG5cbiAgICAgICAgaWYgaGFzYXR0cihzZWxmLmltYWdlX3BpcGUudmFlLCBcJ19kZWNvZGVcJyk6XG4gICAgICAgICAgICBvcmlnX3ZhZV9pbnRlcm5hbF9kZWNvZGUgPSBzZWxmLmltYWdlX3BpcGUudmFlLl9kZWNvZGVcbiAgICAgICAgICAgIGRlZiBzYWZlX3ZhZV9pbnRlcm5hbF9kZWNvZGUoeiwgKmFyZ3MsICoqa3dhcmdzKTpcbiAgICAgICAgICAgICAgICBpZiB0b3JjaC5pc190ZW5zb3Ioeik6XG4gICAgICAgICAgICAgICAgICAgIHogPSB6LnRvKGRldmljZT10YXJnZXRfdmFlX2RldiwgZHR5cGU9dGFyZ2V0X3ZhZV9kdHlwZSlcbiAgICAgICAgICAgICAgICByZXR1cm4gb3JpZ192YWVfaW50ZXJuYWxfZGVjb2RlKHosICphcmdzLCAqKmt3YXJncylcbiAgICAgICAgICAgIHNlbGYuaW1hZ2VfcGlwZS52YWUuX2RlY29kZSA9IHNhZmVfdmFlX2ludGVybmFsX2RlY29kZVxuXG4gICAgICAgIGlmIGhhc2F0dHIoc2VsZi5pbWFnZV9waXBlLnZhZSwgXCdlbmNvZGVcJyk6XG4gICAgICAgICAgICBvcmlnX3ZhZV9lbmNvZGUgPSBzZWxmLmltYWdlX3BpcGUudmFlLmVuY29kZVxuICAgICAgICAgICAgZGVmIHNhZmVfdmFlX2VuY29kZSh4LCAqYXJncywgKiprd2FyZ3MpOlxuICAgICAgICAgICAgICAgIGlmIHRvcmNoLmlzX3RlbnNvcih4KTpcbiAgICAgICAgICAgICAgICAgICAgeCA9IHgudG8oZGV2aWNlPXRhcmdldF92YWVfZGV2LCBkdHlwZT10YXJnZXRfdmFlX2R0eXBlKVxuICAgICAgICAgICAgICAgIHJldHVybiBvcmlnX3ZhZV9lbmNvZGUoeCwgKmFyZ3MsICoqa3dhcmdzKVxuICAgICAgICAgICAgc2VsZi5pbWFnZV9waXBlLnZhZS5lbmNvZGUgPSBzYWZlX3ZhZV9lbmNvZGVcblxuICAgICAgICB2YWVfc2NhbGUgPSA4XG4gICAgICAgIGlmIGhhc2F0dHIoc2VsZi5pbWFnZV9waXBlLCBcJ3ZhZV9zY2FsZV9mYWN0b3JcJyk6XG4gICAgICAgICAgICB2YWVfc2NhbGUgPSBzZWxmLmltYWdlX3BpcGUudmFlX3NjYWxlX2ZhY3RvclxuXG4gICAgICAgIHBrZ192ZXJzaW9ucyA9IHt9XG4gICAgICAgIGZvciBwa2cgaW4gKFwndG9yY2hcJywgXCdkaWZmdXNlcnNcJywgXCd0cmFuc2Zvcm1lcnNcJywgXCdhY2NlbGVyYXRlXCcsIFwnYml0c2FuZGJ5dGVzXCcsIFwncGVmdFwnKTpcbiAgICAgICAgICAgIHRyeTpcbiAgICAgICAgICAgICAgICBwa2dfdmVyc2lvbnNbcGtnXSA9IGltcG9ydGxpYi5tZXRhZGF0YS52ZXJzaW9uKHBrZylcbiAgICAgICAgICAgIGV4Y2VwdCBFeGNlcHRpb246XG4gICAgICAgICAgICAgICAgcGtnX3ZlcnNpb25zW3BrZ10gPSAidW5rbm93biJcblxuICAgICAgICBzZWxmLm1ldGFkYXRhID0ge1xuICAgICAgICAgICAgIm1vZGVsX2lkIjogYXJ0aWZhY3RfaWQsXG4gICAgICAgICAgICAicmV2aXNpb24iOiBzZWxmLnJldmlzaW9uLFxuICAgICAgICAgICAgImlzX2Rpc3RpbGxlZCI6IFRydWUsXG4gICAgICAgICAgICAicGlwZWxpbmVfY2xhc3MiOiAiRmx1eDJLbGVpblBpcGVsaW5lIixcbiAgICAgICAgICAgICJ0ZXh0X2RldmljZSI6IHN0cihzZWxmLnRleHRfZGV2aWNlKSxcbiAgICAgICAgICAgICJpbWFnZV9kZXZpY2UiOiBzdHIoc2VsZi5pbWFnZV9kZXZpY2UpLFxuICAgICAgICAgICAgImNvbXB1dGVfZHR5cGUiOiBzdHIoc2VsZi5jb21wdXRlX2R0eXBlKSxcbiAgICAgICAgICAgICJ2YWVfc2NhbGVfZmFjdG9yIjogdmFlX3NjYWxlLFxuICAgICAgICAgICAgInBvc3Rwcm9jZXNzX21vZGUiOiAic2FmZV9iYXNlbGluZSIsXG4gICAgICAgICAgICAiZGVzdHJ1Y3RpdmVfcG9zdHByb2Nlc3NpbmciOiBGYWxzZSxcbiAgICAgICAgICAgICJwYWNrYWdlcyI6IHBrZ192ZXJzaW9ucyxcbiAgICAgICAgfVxuICAgICAgICBwcmludChmIvCfk4ogRW5naW5lIE1ldGFkYXRhOiB7anNvbi5kdW1wcyhzZWxmLm1ldGFkYXRhKX0iLCBmbHVzaD1UcnVlKVxuICAgICAgICBzZWxmLmlzX3dhcm0gPSBGYWxzZVxuICAgICAgICBwcmludChmIuKchSBNb2RlbHMgbG9hZGVkIGluIFZSQU0gKEdQVSAwOiBUZXh0LCBHUFUgMTogVHJhbnNmb3JtZXIgJiBWQUUpLiBSZWFkeSBmb3IgcHJlZmxpZ2h0IHdhcm0tdXAgcGFzcy4iLCBmbHVzaD1UcnVlKVxuXG4gICAgZGVmIGdlbmVyYXRlKFxuICAgICAgICBzZWxmLFxuICAgICAgICBzb3VyY2VfaW1nOiBPcHRpb25hbFtJbWFnZS5JbWFnZV0gPSBOb25lLFxuICAgICAgICBjYXRlZ29yeTogc3RyID0gImdhcm1lbnQiLFxuICAgICAgICBjdXN0b21fcHJvbXB0OiBPcHRpb25hbFtzdHJdID0gTm9uZSxcbiAgICAgICAgZGV0YWlsczogT3B0aW9uYWxbc3RyXSA9IE5vbmUsXG4gICAgICAgIHNlZWQ6IGludCA9IDQyLFxuICAgICAgICB3aWR0aDogT3B0aW9uYWxbaW50XSA9IE5vbmUsXG4gICAgICAgIGhlaWdodDogT3B0aW9uYWxbaW50XSA9IE5vbmUsXG4gICAgICAgIHF1YWxpdHk6IHN0ciA9ICJzdGFuZGFyZCIsXG4gICAgICAgIGRlY29kZWQ6IE9wdGlvbmFsW0RlY29kZWRHYXJtZW50XSA9IE5vbmUsXG4gICAgICAgIG1hbmlmZXN0OiBPcHRpb25hbFtkaWN0XSA9IE5vbmUsXG4gICAgKSAtPiB0dXBsZTpcbiAgICAgICAgdGltaW5ncyA9IHt9XG4gICAgICAgIHRfYWxsX3N0YXJ0ID0gdGltZS5wZXJmX2NvdW50ZXIoKVxuICAgICAgICBjYXRfbm9ybSA9IG5vcm1hbGl6ZV9jYXRlZ29yeShjYXRlZ29yeSlcblxuICAgICAgICBpZiBkZWNvZGVkIGlzIE5vbmU6XG4gICAgICAgICAgICBpZiBzb3VyY2VfaW1nIGlzIE5vbmU6XG4gICAgICAgICAgICAgICAgcmFpc2UgVmFsdWVFcnJvcigiRWl0aGVyIGRlY29kZWQgb3Igc291cmNlX2ltZyBtdXN0IGJlIHByb3ZpZGVkIilcbiAgICAgICAgICAgIHJnYiA9IHNvdXJjZV9pbWcuY29udmVydCgiUkdCIilcbiAgICAgICAgICAgIGNvbmRpdGlvbmluZyA9IHJnYi5jb3B5KClcbiAgICAgICAgICAgIGRlY29kZWQgPSBEZWNvZGVkR2FybWVudChyZ2I9cmdiLCBhbHBoYT1Ob25lLCBjb25kaXRpb25pbmdfcmdiPWNvbmRpdGlvbmluZywgbm90aWNlcz0oInN5bnRoZXRpY193YXJtdXAiLCkpXG5cbiAgICAgICAgaWYgd2lkdGggaXMgTm9uZSBvciBoZWlnaHQgaXMgTm9uZTpcbiAgICAgICAgICAgIHdpZHRoLCBoZWlnaHQgPSBjYXRlZ29yeV9kaW1lbnNpb25zKGNhdF9ub3JtLCBkZWNvZGVkLmNvbmRpdGlvbmluZ19yZ2Iuc2l6ZSwgcXVhbGl0eSlcblxuICAgICAgICAjIFdhcm11cCBpcyB0aGUgb25seSBjYWxsIGFsbG93ZWQgd2l0aG91dCBhIHJlYWwgYXBwZWFyYW5jZSBtYW5pZmVzdC5cbiAgICAgICAgaWYgbWFuaWZlc3QgaXMgTm9uZSBhbmQgXCdzeW50aGV0aWNfd2FybXVwXCcgaW4gZGVjb2RlZC5ub3RpY2VzOlxuICAgICAgICAgICAgbWFuaWZlc3QgPSB7XCdjYXRlZ29yeVwnOmNhdF9ub3JtLFwnY29sb3JBbmRGaW5pc2hcJzpcJ0tlZXAgdGhlIHJlZmVyZW5jZSBncmV5XCcsXCdzdXJmYWNlVGV4dHVyZUFuZFdlYXZlXCc6XCdTbW9vdGggZmFicmljXCd9XG4gICAgICAgIHRva2VuaXplciA9IHNlbGYudGV4dF9waXBlLnRva2VuaXplclxuICAgICAgICBwcm9tcHQsIHByb21wdF9yZXBvcnQgPSBwYWNrX3Byb21wdChjYXRfbm9ybSwgbWFuaWZlc3QsIHRva2VuaXplcilcblxuICAgICAgICAjIDEuIFRleHQgZW5jb2Rpbmcgb24gR1BVIDBcbiAgICAgICAgdDAgPSB0aW1lLnBlcmZfY291bnRlcigpXG4gICAgICAgIGlmIHRvcmNoLmN1ZGEuaXNfYXZhaWxhYmxlKCkgYW5kIHNlbGYudGV4dF9kZXZpY2UudHlwZSA9PSAiY3VkYSI6XG4gICAgICAgICAgICB0b3JjaC5jdWRhLnN5bmNocm9uaXplKHNlbGYudGV4dF9kZXZpY2UpXG4gICAgICAgIHdpdGggdG9yY2guaW5mZXJlbmNlX21vZGUoKTpcbiAgICAgICAgICAgIGVtYmVkcywgXyA9IHNlbGYudGV4dF9waXBlLmVuY29kZV9wcm9tcHQoXG4gICAgICAgICAgICAgICAgcHJvbXB0PXByb21wdCwgZGV2aWNlPXNlbGYudGV4dF9kZXZpY2UsIG1heF9zZXF1ZW5jZV9sZW5ndGg9NTEyXG4gICAgICAgICAgICApXG4gICAgICAgIGlmIHRvcmNoLmN1ZGEuaXNfYXZhaWxhYmxlKCkgYW5kIHNlbGYudGV4dF9kZXZpY2UudHlwZSA9PSAiY3VkYSI6XG4gICAgICAgICAgICB0b3JjaC5jdWRhLnN5bmNocm9uaXplKHNlbGYudGV4dF9kZXZpY2UpXG4gICAgICAgIHRpbWluZ3NbXCd0ZXh0X2VuY1wnXSA9IHJvdW5kKCh0aW1lLnBlcmZfY291bnRlcigpIC0gdDApICogMTAwMCwgMSlcblxuICAgICAgICAjIDIuIEVtYmVkZGluZ3MgdHJhbnNmZXIgKEdQVSAwIC0+IEdQVSAxKVxuICAgICAgICB0MCA9IHRpbWUucGVyZl9jb3VudGVyKClcbiAgICAgICAgZW1iZWRzID0gZW1iZWRzLnRvKGRldmljZT1zZWxmLmltYWdlX2RldmljZSwgZHR5cGU9c2VsZi5jb21wdXRlX2R0eXBlKVxuICAgICAgICBpZiB0b3JjaC5jdWRhLmlzX2F2YWlsYWJsZSgpIGFuZCBzZWxmLmltYWdlX2RldmljZS50eXBlID09ICJjdWRhIjpcbiAgICAgICAgICAgIHRvcmNoLmN1ZGEuc3luY2hyb25pemUoc2VsZi5pbWFnZV9kZXZpY2UpXG4gICAgICAgIHRpbWluZ3NbXCdlbWJlZF90cmFuc2ZlclwnXSA9IHJvdW5kKCh0aW1lLnBlcmZfY291bnRlcigpIC0gdDApICogMTAwMCwgMSlcblxuICAgICAgICAjIDMuIENvbmRpdGlvbmluZyBJbWFnZSBQcmVwYXJhdGlvblxuICAgICAgICB0MCA9IHRpbWUucGVyZl9jb3VudGVyKClcbiAgICAgICAgY29uZGl0aW9uZWQgPSBjb25kaXRpb25pbmdfdGh1bWJuYWlsKGRlY29kZWQsIG1heF9zaXplPSh3aWR0aCwgaGVpZ2h0KSlcbiAgICAgICAgdGltaW5nc1tcJ3ByZXByb2Nlc3NcJ10gPSByb3VuZCgodGltZS5wZXJmX2NvdW50ZXIoKSAtIHQwKSAqIDEwMDAsIDEpXG5cbiAgICAgICAgIyA0LiBEZW5vaXNpbmcgRGlmZnVzaW9uIG9uIEdQVSAxICg0IHN0ZXBzKVxuICAgICAgICB0MCA9IHRpbWUucGVyZl9jb3VudGVyKClcbiAgICAgICAgd2l0aCB0b3JjaC5pbmZlcmVuY2VfbW9kZSgpOlxuICAgICAgICAgICAgcGlwZV9vdXQgPSBzZWxmLmltYWdlX3BpcGUoXG4gICAgICAgICAgICAgICAgaW1hZ2U9Y29uZGl0aW9uZWQsXG4gICAgICAgICAgICAgICAgcHJvbXB0X2VtYmVkcz1lbWJlZHMsXG4gICAgICAgICAgICAgICAgd2lkdGg9d2lkdGgsXG4gICAgICAgICAgICAgICAgaGVpZ2h0PWhlaWdodCxcbiAgICAgICAgICAgICAgICBudW1faW5mZXJlbmNlX3N0ZXBzPTQsXG4gICAgICAgICAgICAgICAgZ3VpZGFuY2Vfc2NhbGU9MS4wLFxuICAgICAgICAgICAgICAgIGdlbmVyYXRvcj10b3JjaC5HZW5lcmF0b3IoZGV2aWNlPSJjcHUiKS5tYW51YWxfc2VlZChzZWVkKSxcbiAgICAgICAgICAgIClcbiAgICAgICAgICAgIHJhd19vdXQgPSBwaXBlX291dC5pbWFnZXNbMF1cbiAgICAgICAgaWYgdG9yY2guY3VkYS5pc19hdmFpbGFibGUoKSBhbmQgc2VsZi5pbWFnZV9kZXZpY2UudHlwZSA9PSAiY3VkYSI6XG4gICAgICAgICAgICB0b3JjaC5jdWRhLnN5bmNocm9uaXplKHNlbGYuaW1hZ2VfZGV2aWNlKVxuICAgICAgICB0aW1pbmdzW1wnZGVub2lzZVwnXSA9IHJvdW5kKCh0aW1lLnBlcmZfY291bnRlcigpIC0gdDApICogMTAwMCwgMSlcblxuICAgICAgICAjIDUuIE91dHB1dCB0byBQSUwgSW1hZ2VcbiAgICAgICAgdDAgPSB0aW1lLnBlcmZfY291bnRlcigpXG4gICAgICAgIGlmIGlzaW5zdGFuY2UocmF3X291dCwgSW1hZ2UuSW1hZ2UpOlxuICAgICAgICAgICAgZ2VuX3BpbCA9IHJhd19vdXRcbiAgICAgICAgZWxzZTpcbiAgICAgICAgICAgIGFyciA9IG5wLmFycmF5KHJhd19vdXQpXG4gICAgICAgICAgICBpZiBhcnIuZHR5cGUgIT0gbnAudWludDg6XG4gICAgICAgICAgICAgICAgYXJyID0gbnAucmludChucC5jbGlwKGFyciAqIDI1NS4wLCAwLCAyNTUpKS5hc3R5cGUobnAudWludDgpXG4gICAgICAgICAgICBnZW5fcGlsID0gSW1hZ2UuZnJvbWFycmF5KGFycilcbiAgICAgICAgdGltaW5nc1tcJ2RlY29kZVwnXSA9IHJvdW5kKCh0aW1lLnBlcmZfY291bnRlcigpIC0gdDApICogMTAwMCwgMSlcblxuICAgICAgICBmaW5hbF9waWwgPSBnZW5fcGlsLmNvcHkoKVxuICAgICAgICB0aW1pbmdzW1wnY29sb3JcJ10gPSAwLjBcbiAgICAgICAgdGltaW5nc1tcJ3BydW5lXCddID0gMC4wXG4gICAgICAgIHRpbWluZ3NbXCdyZXBhaXJcJ10gPSAwLjBcblxuICAgICAgICByZXBvcnQgPSB7XG4gICAgICAgICAgICAicXVhbGl0eV9zdGF0dXMiOiAidW52ZXJpZmllZCIsXG4gICAgICAgICAgICAicG9zdHByb2Nlc3NfcmVhc29uIjogInNhZmVfYmFzZWxpbmVfbm9fZGVzdHJ1Y3RpdmVfcG9zdHByb2Nlc3NpbmciLFxuICAgICAgICAgICAgInBvc3Rwcm9jZXNzX21vZGUiOiAic2FmZV9iYXNlbGluZSIsXG4gICAgICAgICAgICAiY2F0ZWdvcnkiOiBjYXRfbm9ybSxcbiAgICAgICAgICAgICJ3aWR0aCI6IHdpZHRoLFxuICAgICAgICAgICAgImhlaWdodCI6IGhlaWdodCxcbiAgICAgICAgICAgICJzZWVkIjogc2VlZCxcbiAgICAgICAgICAgICJtb2RlbF9yZXZpc2lvbiI6IHNlbGYucmV2aXNpb24sXG4gICAgICAgICAgICAibm90aWNlcyI6IGxpc3QoZGVjb2RlZC5ub3RpY2VzKSxcbiAgICAgICAgICAgICJwcm9tcHRfcmVwb3J0IjogcHJvbXB0X3JlcG9ydCxcbiAgICAgICAgICAgICJ0aW1pbmdzX21zIjogdGltaW5nc1xuICAgICAgICB9XG5cbiAgICAgICAgdGltaW5nc1tcJ3RvdGFsXCddID0gcm91bmQoKHRpbWUucGVyZl9jb3VudGVyKCkgLSB0X2FsbF9zdGFydCkgKiAxMDAwLCAxKVxuICAgICAgICByZXR1cm4gZmluYWxfcGlsLCB0aW1pbmdzLCByZXBvcnRcblxuIyA9PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT1cbiMgNC4gRkFTVEFQSSBBUFBMSUNBVElPTiAmIEJPVU5ERUQgUVVFVUVcbiMgPT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09XG5hcHAgPSBGYXN0QVBJKHRpdGxlPSJDbG90aE1hdGljcyBTYWZlIEJhc2VsaW5lIEdob3N0IE1hbm5lcXVpbiBFbmdpbmUiKVxuYXBwLmFkZF9taWRkbGV3YXJlKFxuICAgIENPUlNNaWRkbGV3YXJlLFxuICAgIGFsbG93X29yaWdpbnM9WyIqIl0sXG4gICAgYWxsb3dfY3JlZGVudGlhbHM9VHJ1ZSxcbiAgICBhbGxvd19tZXRob2RzPVsiKiJdLFxuICAgIGFsbG93X2hlYWRlcnM9WyIqIl0sXG4pXG5cbkVOR0lORSA9IE5vbmVcbkVOR0lORV9TVEFUVVMgPSAiaW5pdGlhbGl6aW5nIlxuRU5HSU5FX0VSUk9SID0gTm9uZVxuTE9DSyA9IHRocmVhZGluZy5Mb2NrKClcblxuZGVmIGxvYWRfZW5naW5lX3dvcmtlcigpOlxuICAgIGdsb2JhbCBFTkdJTkUsIEVOR0lORV9TVEFUVVMsIEVOR0lORV9FUlJPUlxuICAgIHRyeTpcbiAgICAgICAgRU5HSU5FX1NUQVRVUyA9ICJsb2FkaW5nX21vZGVscyJcbiAgICAgICAgcHJpbnQoIuKaoSBMb2FkaW5nIER1YWwtR1BVIE1vZGVscyBpbnRvIFZSQU0uLi4iLCBmbHVzaD1UcnVlKVxuICAgICAgICBlbmdpbmUgPSBXYXJtRHVhbEdwdUVuZ2luZSgpXG4gICAgICAgIEVOR0lORV9TVEFUVVMgPSAicHJlZmxpZ2h0X2luZmVyZW5jZSJcbiAgICAgICAgcHJpbnQoIvCflKUgRXhlY3V0aW5nIHJlcHJlc2VudGF0aXZlIHdhcm0tdXAgcHJlZmxpZ2h0IGluZmVyZW5jZS4uLiIsIGZsdXNoPVRydWUpXG4gICAgICAgIGR1bW15ID0gSW1hZ2UubmV3KCJSR0IiLCAoNTc2LCA3NjgpLCAoMjQ1LCAyNDUsIDI0NSkpXG4gICAgICAgIF8sIHdhcm1fdGltaW5ncywgXyA9IGVuZ2luZS5nZW5lcmF0ZShzb3VyY2VfaW1nPWR1bW15LCBjYXRlZ29yeT0ic2hpcnQiLCB3aWR0aD01NzYsIGhlaWdodD03NjgpXG4gICAgICAgIGVuZ2luZS5pc193YXJtID0gVHJ1ZVxuICAgICAgICBFTkdJTkUgPSBlbmdpbmVcbiAgICAgICAgRU5HSU5FX1NUQVRVUyA9ICJyZWFkeSJcbiAgICAgICAgcHJpbnQoZiLwn46JIFdBUk0tVVAgU1VDQ0VTU0ZVTCEgTGF0ZW5jeToge3dhcm1fdGltaW5nc1tcJ3RvdGFsXCddfW1zLiBQZXJtYW5lbnQgVlJBTSByZWFkaW5lc3MgYWN0aXZlLiIsIGZsdXNoPVRydWUpXG4gICAgZXhjZXB0IEV4Y2VwdGlvbiBhcyBlOlxuICAgICAgICBpbXBvcnQgdHJhY2ViYWNrXG4gICAgICAgIGVycl9tc2cgPSB0cmFjZWJhY2suZm9ybWF0X2V4YygpXG4gICAgICAgIEVOR0lORV9FUlJPUiA9IGVycl9tc2dcbiAgICAgICAgRU5HSU5FX1NUQVRVUyA9ICJlcnJvciJcbiAgICAgICAgcHJpbnQoZiLinYwgRW5naW5lIGxvYWQgZXJyb3I6XFxue2Vycl9tc2d9IiwgZmx1c2g9VHJ1ZSlcblxuQGFwcC5vbl9ldmVudCgic3RhcnR1cCIpXG5kZWYgc3RhcnR1cF9sb2FkKCk6XG4gICAgdGhyZWFkID0gdGhyZWFkaW5nLlRocmVhZCh0YXJnZXQ9bG9hZF9lbmdpbmVfd29ya2VyLCBkYWVtb249VHJ1ZSlcbiAgICB0aHJlYWQuc3RhcnQoKVxuXG5AYXBwLmdldCgiLyIpXG5AYXBwLmdldCgiL2hlYWx0aCIpXG5kZWYgaGVhbHRoKCk6XG4gICAgcmVhZHkgPSBFTkdJTkUgaXMgbm90IE5vbmUgYW5kIGdldGF0dHIoRU5HSU5FLCBcJ2lzX3dhcm1cJywgRmFsc2UpXG4gICAgZ3B1X2luZm8gPSBbXVxuICAgIGlmIHRvcmNoLmN1ZGEuaXNfYXZhaWxhYmxlKCk6XG4gICAgICAgIGZvciBpIGluIHJhbmdlKHRvcmNoLmN1ZGEuZGV2aWNlX2NvdW50KCkpOlxuICAgICAgICAgICAgZnJlZSwgdG90YWwgPSB0b3JjaC5jdWRhLm1lbV9nZXRfaW5mbyhpKVxuICAgICAgICAgICAgZ3B1X2luZm8uYXBwZW5kKHtcbiAgICAgICAgICAgICAgICAiZ3B1IjogaSxcbiAgICAgICAgICAgICAgICAibmFtZSI6IHRvcmNoLmN1ZGEuZ2V0X2RldmljZV9uYW1lKGkpLFxuICAgICAgICAgICAgICAgICJmcmVlX2diIjogcm91bmQoZnJlZSAvIDIqKjMwLCAyKSxcbiAgICAgICAgICAgICAgICAidG90YWxfZ2IiOiByb3VuZCh0b3RhbCAvIDIqKjMwLCAyKVxuICAgICAgICAgICAgfSlcbiAgICByZXR1cm4ge1xuICAgICAgICAic3RhdHVzIjogIm9ubGluZSIgaWYgcmVhZHkgZWxzZSBFTkdJTkVfU1RBVFVTLFxuICAgICAgICAic2VydmljZSI6ICJDbG90aE1hdGljcyBTYWZlIEJhc2VsaW5lIEdob3N0IE1hbm5lcXVpbiBFbmdpbmUiLFxuICAgICAgICAicGlwZWxpbmVfdmVyc2lvbiI6IFBJUEVMSU5FX1ZFUlNJT04sXG4gICAgICAgICJnaG9zdF9jb250cmFjdF92ZXJzaW9uIjogQ09OVFJBQ1RfVkVSU0lPTixcbiAgICAgICAgIm1vZGVsIjogIkZMVVguMi1rbGVpbi00QiBORjQgKFdhcm0gRHVhbC1HUFUpIixcbiAgICAgICAgInJldmlzaW9uIjogZ2V0YXR0cihFTkdJTkUsIFwncmV2aXNpb25cJywgXCdlN2I3ZGMyN2Y5MWRlYWNhZDM4ZTc4OTc2ZDFmMmI0OTlkNzZhMjk0XCcpIGlmIEVOR0lORSBlbHNlIFwncGVuZGluZ1wnLFxuICAgICAgICAicHJlY2lzaW9uIjogIkZQMTYgKE5GNCBUZW5zb3IgQ29yZXMpICsgRlAzMiBUaWxlZCBWQUUiLFxuICAgICAgICAicmVhZHkiOiByZWFkeSxcbiAgICAgICAgInF1YWxpdHlfc3RhdHVzIjogInVudmVyaWZpZWQiLFxuICAgICAgICAicG9zdHByb2Nlc3NfbW9kZSI6ICJzYWZlX2Jhc2VsaW5lIixcbiAgICAgICAgImVycm9yIjogRU5HSU5FX0VSUk9SLFxuICAgICAgICAiZ3B1cyI6IGdwdV9pbmZvXG4gICAgfVxuXG5cblxuIyBUaGlzIHJldmlld2VkIGZyYWdtZW50IGlzIGFwcGVuZGVkIHRvIGdob3N0X3NlcnZlci5weSBieSB0aGUgbm90ZWJvb2sgYnVpbGRlci5cbiMgSW5mZXJlbmNlIHJ1bnMgb24gYSB0aHJlYWQgc28gL2hlYWx0aCBhbmQgZGlzY29ubmVjdCBoYW5kbGluZyByZW1haW4gcmVzcG9uc2l2ZS5cblJFU1VMVF9DQUNIRSA9IE9yZGVyZWREaWN0KClcbkNBQ0hFX0xPQ0sgPSB0aHJlYWRpbmcuTG9jaygpXG5DQUNIRV9UVEwgPSA2MDBcbkNBQ0hFX0JZVEVTID0gNDAgKiAxMDI0ICogMTAyNFxuXG5mcm9tIGNvbnRleHR2YXJzIGltcG9ydCBDb250ZXh0VmFyXG5SRVFVRVNUX0lEID0gQ29udGV4dFZhcihcJ3JlcXVlc3RfaWRcJywgZGVmYXVsdD1cJ3N0YXJ0dXBcJylcblxuZGVmIHJlcXVlc3RfbG9nKGV2ZW50LCAqKmRldGFpbHMpOlxuICAgICMgTmV2ZXIgbG9nIHJlcXVlc3QgaGVhZGVycywgc3luYyB0b2tlbnMsIGltYWdlIGJ5dGVzIG9yIHJhdyB1c2VyIHByb21wdHMuXG4gICAgcHJpbnQoanNvbi5kdW1wcyh7XCdldmVudFwnOmV2ZW50LCBcJ3JlcXVlc3RfaWRcJzpSRVFVRVNUX0lELmdldCgpLCAqKmRldGFpbHN9KSwgZmx1c2g9VHJ1ZSlcblxuQGFwcC5taWRkbGV3YXJlKFwnaHR0cFwnKVxuYXN5bmMgZGVmIGxvZ19yZXF1ZXN0KHJlcXVlc3Q6IFJlcXVlc3QsIGNhbGxfbmV4dCk6XG4gICAgaWYgcmVxdWVzdC51cmwucGF0aCBpbiAoXCcvXCcsIFwnL2hlYWx0aFwnKTpcbiAgICAgICAgcmV0dXJuIGF3YWl0IGNhbGxfbmV4dChyZXF1ZXN0KVxuICAgIGNvbnRleHQgPSBSRVFVRVNUX0lELnNldChzdHIodXVpZC51dWlkNCgpKSlcbiAgICBzdGFydGVkID0gdGltZS5wZXJmX2NvdW50ZXIoKVxuICAgIHJvdXRlID0gXCdnZW5lcmF0ZVwnIGlmIHJlcXVlc3QudXJsLnBhdGggPT0gXCcvZ2VuZXJhdGVcJyBlbHNlIChcJ291dGZpdFwnIGlmIHJlcXVlc3QudXJsLnBhdGggPT0gXCcvb3V0Zml0XCcgZWxzZSAoXCdmdWxsX2xvb2tcJyBpZiByZXF1ZXN0LnVybC5wYXRoID09IFwnL2Z1bGwtbG9va1wnIGVsc2UgXCdvdGhlclwnKSlcbiAgICByZXF1ZXN0X2xvZyhcJ3JlcXVlc3RfcmVjZWl2ZWRcJywgcm91dGU9cm91dGUpXG4gICAgdHJ5OlxuICAgICAgICByZXNwb25zZSA9IGF3YWl0IGNhbGxfbmV4dChyZXF1ZXN0KVxuICAgICAgICByZXNwb25zZS5oZWFkZXJzW1wnWC1SZXF1ZXN0LUlkXCddID0gUkVRVUVTVF9JRC5nZXQoKVxuICAgICAgICByZXF1ZXN0X2xvZyhcJ3JlcXVlc3RfZmluaXNoZWRcJywgc3RhdHVzPXJlc3BvbnNlLnN0YXR1c19jb2RlLCBlbGFwc2VkX21zPXJvdW5kKCh0aW1lLnBlcmZfY291bnRlcigpLXN0YXJ0ZWQpKjEwMDAsMSkpXG4gICAgICAgIHJldHVybiByZXNwb25zZVxuICAgIGV4Y2VwdCBFeGNlcHRpb24gYXMgZXhjOlxuICAgICAgICByZXF1ZXN0X2xvZyhcJ3JlcXVlc3RfZmFpbGVkXCcsIGVycm9yX3R5cGU9dHlwZShleGMpLl9fbmFtZV9fLCBlbGFwc2VkX21zPXJvdW5kKCh0aW1lLnBlcmZfY291bnRlcigpLXN0YXJ0ZWQpKjEwMDAsMSkpXG4gICAgICAgIHJhaXNlXG4gICAgZmluYWxseTpcbiAgICAgICAgUkVRVUVTVF9JRC5yZXNldChjb250ZXh0KVxuXG5kZWYgcmVuZGVyX3JlcXVlc3QoZGF0YSwgY2F0ZWdvcnksIG1hbmlmZXN0LCBxdWFsaXR5LCBzZWVkKTpcbiAgICBrZXkgPSBoYXNobGliLnNoYTI1NihkYXRhICsganNvbi5kdW1wcyhbY2F0ZWdvcnksIG1hbmlmZXN0LCBxdWFsaXR5LCBzZWVkXSwgc29ydF9rZXlzPVRydWUpLmVuY29kZSgpKS5oZXhkaWdlc3QoKVxuICAgIHdpdGggQ0FDSEVfTE9DSzpcbiAgICAgICAgbm93ID0gdGltZS5tb25vdG9uaWMoKVxuICAgICAgICBmb3Igb2xkX2tleSwgY2FjaGVkIGluIGxpc3QoUkVTVUxUX0NBQ0hFLml0ZW1zKCkpOlxuICAgICAgICAgICAgaWYgbm93IC0gY2FjaGVkWzBdID4gQ0FDSEVfVFRMOlxuICAgICAgICAgICAgICAgIFJFU1VMVF9DQUNIRS5wb3Aob2xkX2tleSwgTm9uZSlcbiAgICAgICAgY2FjaGVkID0gUkVTVUxUX0NBQ0hFLmdldChrZXkpXG4gICAgICAgIGlmIGNhY2hlZDpcbiAgICAgICAgICAgIHJlcXVlc3RfbG9nKFwnY2FjaGVfaGl0XCcsIGNhdGVnb3J5PWNhdGVnb3J5LCBzZWVkPXNlZWQpXG4gICAgICAgICAgICByZXR1cm4gUmVzcG9uc2UoY2FjaGVkWzFdLCBtZWRpYV90eXBlPVwnaW1hZ2UvcG5nXCcsIGhlYWRlcnM9eyoqY2FjaGVkWzJdLCBcJ1gtR2hvc3QtQ2FjaGVcJzpcJ2hpdFwnfSlcbiAgICBpZiBub3QgTE9DSy5hY3F1aXJlKGJsb2NraW5nPUZhbHNlKTpcbiAgICAgICAgcmVxdWVzdF9sb2coXCdncHVfYnVzeVwnLCByZXRyeV9hZnRlcl9zZWNvbmRzPTE1KVxuICAgICAgICByYWlzZSBIVFRQRXhjZXB0aW9uKDQyOSwgXCdBbm90aGVyIGdhcm1lbnQgaXMgYmVpbmcgcHJvY2Vzc2VkLiBQbGVhc2UgcmV0cnkuXCcsIGhlYWRlcnM9e1wnUmV0cnktQWZ0ZXJcJzpcJzE1XCd9KVxuICAgIHRyeTpcbiAgICAgICAgZGVjb2RlZCA9IGRlY29kZV9nYXJtZW50KGRhdGEpXG4gICAgICAgIGlmIG1pbihkZWNvZGVkLnJnYi5zaXplKSA8IDY0OlxuICAgICAgICAgICAgcmFpc2UgSW5wdXRJbWFnZUVycm9yKFwnVGhlIHNvdXJjZSBnYXJtZW50IGltYWdlIGlzIHRvbyBzbWFsbFwnKVxuICAgICAgICByZXF1ZXN0X2xvZyhcJ2dlbmVyYXRpb25fc3RhcnRlZFwnLCBjYXRlZ29yeT1jYXRlZ29yeSwgc2VlZD1zZWVkLCBpbnB1dF9ieXRlcz1sZW4oZGF0YSksIHNvdXJjZV93aWR0aD1kZWNvZGVkLnJnYi53aWR0aCwgc291cmNlX2hlaWdodD1kZWNvZGVkLnJnYi5oZWlnaHQsIHBhbGV0dGU9bWFuaWZlc3QuZ2V0KFwncGFsZXR0ZVwnLCBbXSkpXG4gICAgICAgIG91dHB1dCwgdGltaW5ncywgcmVwb3J0ID0gRU5HSU5FLmdlbmVyYXRlKGRlY29kZWQ9ZGVjb2RlZCwgY2F0ZWdvcnk9Y2F0ZWdvcnksIG1hbmlmZXN0PW1hbmlmZXN0LCBxdWFsaXR5PXF1YWxpdHksIHNlZWQ9c2VlZClcbiAgICAgICAgYnVmZmVyID0gaW8uQnl0ZXNJTygpXG4gICAgICAgIG91dHB1dC5jb252ZXJ0KFwnUkdCXCcpLnNhdmUoYnVmZmVyLCBmb3JtYXQ9XCdQTkdcJywgaWNjX3Byb2ZpbGU9U1JHQl9JQ0MpXG4gICAgICAgIHBheWxvYWQgPSBidWZmZXIuZ2V0dmFsdWUoKVxuICAgICAgICBpZiBub3QgNTAwIDw9IGxlbihwYXlsb2FkKSA8PSBNQVhfVVBMT0FEX0JZVEVTOlxuICAgICAgICAgICAgcmFpc2UgUnVudGltZUVycm9yKFwnR2VuZXJhdGVkIG91dHB1dCBleGNlZWRzIHRoZSBzdXBwb3J0ZWQgc2l6ZVwnKVxuICAgICAgICBoZWFkZXJzID0ge1wnWC1SZXF1ZXN0LUlkXCc6c3RyKHV1aWQudXVpZDQoKSksIFwnWC1QaXBlbGluZS1WZXJzaW9uXCc6UElQRUxJTkVfVkVSU0lPTixcbiAgICAgICAgICAgICAgICAgICBcJ1gtR2hvc3QtQ29udHJhY3QtVmVyc2lvblwnOnN0cihDT05UUkFDVF9WRVJTSU9OKSwgXCdYLUdob3N0LVNlZWRcJzpzdHIoc2VlZCksIFwnWC1HaG9zdC1QYWxldHRlLVZlcnNpb25cJzpcJzFcJyxcbiAgICAgICAgICAgICAgICAgICBcJ1gtUXVhbGl0eS1TdGF0dXNcJzpcJ3JlcXVpcmVzX3Zpc3VhbF9jb21wYXJpc29uXCcsIFwnWC1Qb3N0cHJvY2Vzcy1Nb2RlXCc6XCdub25lXCcsXG4gICAgICAgICAgICAgICAgICAgXCdYLVByb21wdC1Ub2tlbnNcJzpzdHIocmVwb3J0W1wncHJvbXB0X3JlcG9ydFwnXVtcJ3Byb21wdF90b2tlbnNcJ10pLFxuICAgICAgICAgICAgICAgICAgIFwnWC1HZW5lcmF0aW9uLVRpbWVcJzpzdHIodGltaW5nc1tcJ3RvdGFsXCddKSArIFwnbXNcJ31cbiAgICAgICAgd2l0aCBDQUNIRV9MT0NLOlxuICAgICAgICAgICAgUkVTVUxUX0NBQ0hFW2tleV0gPSAodGltZS5tb25vdG9uaWMoKSwgcGF5bG9hZCwgaGVhZGVycylcbiAgICAgICAgICAgIHdoaWxlIGxlbihSRVNVTFRfQ0FDSEUpID4gNCBvciBzdW0obGVuKGVudHJ5WzFdKSBmb3IgZW50cnkgaW4gUkVTVUxUX0NBQ0hFLnZhbHVlcygpKSA+IENBQ0hFX0JZVEVTOlxuICAgICAgICAgICAgICAgIFJFU1VMVF9DQUNIRS5wb3BpdGVtKGxhc3Q9RmFsc2UpXG4gICAgICAgIHJlcXVlc3RfbG9nKFwnZ2VuZXJhdGlvbl9maW5pc2hlZFwnLCBjYXRlZ29yeT1jYXRlZ29yeSwgc2VlZD1zZWVkLCBvdXRwdXRfd2lkdGg9cmVwb3J0W1wnd2lkdGhcJ10sIG91dHB1dF9oZWlnaHQ9cmVwb3J0W1wnaGVpZ2h0XCddLCBwcm9tcHRfcmVwb3J0PXJlcG9ydFtcJ3Byb21wdF9yZXBvcnRcJ10sIHRpbWluZ3NfbXM9dGltaW5ncywgb3V0cHV0X2J5dGVzPWxlbihwYXlsb2FkKSwgcXVhbGl0eV9zdGF0dXM9XCdyZXF1aXJlc192aXN1YWxfY29tcGFyaXNvblwnKVxuICAgICAgICByZXR1cm4gUmVzcG9uc2UocGF5bG9hZCwgbWVkaWFfdHlwZT1cJ2ltYWdlL3BuZ1wnLCBoZWFkZXJzPWhlYWRlcnMpXG4gICAgZXhjZXB0IElucHV0SW1hZ2VFcnJvciBhcyBleGM6XG4gICAgICAgIHJhaXNlIEhUVFBFeGNlcHRpb24oNDAwLCBzdHIoZXhjKSkgZnJvbSBleGNcbiAgICBmaW5hbGx5OlxuICAgICAgICBMT0NLLnJlbGVhc2UoKVxuXG5AYXBwLnBvc3QoXCcvZ2VuZXJhdGVcJylcbmFzeW5jIGRlZiBnZW5lcmF0ZShpbWFnZTogVXBsb2FkRmlsZSA9IEZpbGUoLi4uKSwgY2F0ZWdvcnk6IHN0ciA9IEZvcm0oLi4uKSxcbiAgICAgICAgICAgICAgICAgICBtYW5pZmVzdDogc3RyID0gRm9ybSguLi4pLCBjb250cmFjdF92ZXJzaW9uOiBpbnQgPSBGb3JtKC4uLiksXG4gICAgICAgICAgICAgICAgICAgcXVhbGl0eTogc3RyID0gRm9ybShcJ2hpZ2hcJyksIHNlZWQ6IGludCA9IEZvcm0oNDIpKTpcbiAgICB0cnk6XG4gICAgICAgIGlmIEVOR0lORSBpcyBOb25lIG9yIG5vdCBnZXRhdHRyKEVOR0lORSwgXCdpc193YXJtXCcsIEZhbHNlKTpcbiAgICAgICAgICAgIHJhaXNlIEhUVFBFeGNlcHRpb24oNTAzLCBcJ0VuZ2luZSBpcyB3YXJtaW5nIHVwOyByZXRyeSBzaG9ydGx5LlwnLCBoZWFkZXJzPXtcJ1JldHJ5LUFmdGVyXCc6XCcxNVwnfSlcbiAgICAgICAgaWYgY29udHJhY3RfdmVyc2lvbiAhPSBDT05UUkFDVF9WRVJTSU9OOlxuICAgICAgICAgICAgcmFpc2UgSFRUUEV4Y2VwdGlvbig0MDksIFwnVXBkYXRlIHRoZSB3ZWJzaXRlIHRvIHRoZSBhcHBlYXJhbmNlIHYyIGNvbnRyYWN0LlwnKVxuICAgICAgICBpZiBxdWFsaXR5IG5vdCBpbiAoXCdzdGFuZGFyZFwnLCBcJ2hpZ2hcJykgb3Igbm90IDAgPD0gc2VlZCA8IDIqKjMyOlxuICAgICAgICAgICAgcmFpc2UgSFRUUEV4Y2VwdGlvbig0MDAsIFwnVW5zdXBwb3J0ZWQgcXVhbGl0eSBvciBzZWVkXCcpXG4gICAgICAgIGlmIGxlbihtYW5pZmVzdCkgPiA2MDAwIG9yIGltYWdlLmNvbnRlbnRfdHlwZSBub3QgaW4gKFwnaW1hZ2UvcG5nXCcsXCdpbWFnZS9qcGVnXCcsXCdpbWFnZS93ZWJwXCcpOlxuICAgICAgICAgICAgcmFpc2UgSFRUUEV4Y2VwdGlvbig0MDAsIFwnSW52YWxpZCBnYXJtZW50IG1hbmlmZXN0IG9yIGltYWdlIHR5cGVcJylcbiAgICAgICAgdHJ5OlxuICAgICAgICAgICAgY2F0ZWdvcnkgPSBub3JtYWxpemVfY2F0ZWdvcnkoY2F0ZWdvcnkpXG4gICAgICAgICAgICBwYXJzZWQgPSBub3JtYWxpemVfbWFuaWZlc3QoY2F0ZWdvcnksIGpzb24ubG9hZHMobWFuaWZlc3QpKVxuICAgICAgICBleGNlcHQgKFZhbHVlRXJyb3IsIFR5cGVFcnJvcikgYXMgZXhjOlxuICAgICAgICAgICAgcmFpc2UgSFRUUEV4Y2VwdGlvbig0MDAsIFwnSW52YWxpZCBvciBtaXNtYXRjaGVkIGdhcm1lbnQgZXZpZGVuY2VcJykgZnJvbSBleGNcbiAgICAgICAgZGF0YSA9IGF3YWl0IGltYWdlLnJlYWQoTUFYX1VQTE9BRF9CWVRFUyArIDEpXG4gICAgICAgIGlmIG5vdCBkYXRhIG9yIGxlbihkYXRhKSA+IE1BWF9VUExPQURfQllURVM6XG4gICAgICAgICAgICByYWlzZSBIVFRQRXhjZXB0aW9uKDQxMywgXCdFbXB0eSBpbWFnZSBvciB1cGxvYWQgZXhjZWVkcyAyMCBNQlwnKVxuICAgICAgICAjIFRoZSB0aHJlYWQgb3ducyB0aGUgR1BVIGxvY2sgZXZlbiBpZiBhbiBIVFRQIGNhbGxlciB0aW1lcyBvdXQuXG4gICAgICAgIHJldHVybiBhd2FpdCBhc3luY2lvLnRvX3RocmVhZChyZW5kZXJfcmVxdWVzdCwgZGF0YSwgY2F0ZWdvcnksIHBhcnNlZCwgcXVhbGl0eSwgc2VlZClcbiAgICBmaW5hbGx5OlxuICAgICAgICBhd2FpdCBpbWFnZS5jbG9zZSgpXG5cbiMgT3B0aW9uYWwgZnVsbC1waG90byBvdXRmaXQgcm91dGUuIEFwcGVuZGVkIGFmdGVyIHJlcXVlc3RfaGFuZGxlci5weSBieSB0aGVcbiMgbm90ZWJvb2sgYnVpbGRlcjsgL2dlbmVyYXRlIHJlbWFpbnMgdW50b3VjaGVkLlxuaW1wb3J0IGJhc2U2NFxuZnJvbSBmYXN0YXBpLnJlc3BvbnNlcyBpbXBvcnQgSlNPTlJlc3BvbnNlXG5mcm9tIG91dGZpdF9wYXJzZXIgaW1wb3J0IHBhcnNlX291dGZpdCwgT3V0Zml0UGFyc2VyRXJyb3IsIFBBUlNFUl9WRVJTSU9OXG5cbk1BWF9PVVRGSVRfSVRFTVMgPSA1XG5NQVhfT1VURklUX0pTT04gPSAzMDAwMFxuTUFYX09VVEZJVF9SRVNQT05TRSA9IDMyICogMTAyNCAqIDEwMjRcblxuXG5kZWYgX291dGZpdF9pdGVtcyhyYXcpOlxuICAgIGlmIGxlbihyYXcpID4gTUFYX09VVEZJVF9KU09OOlxuICAgICAgICByYWlzZSBIVFRQRXhjZXB0aW9uKDQxMywgXCdPdXRmaXQgZXZpZGVuY2UgaXMgdG9vIGxhcmdlXCcpXG4gICAgdHJ5OlxuICAgICAgICB2YWx1ZSA9IGpzb24ubG9hZHMocmF3KVxuICAgIGV4Y2VwdCAoanNvbi5KU09ORGVjb2RlRXJyb3IsIFR5cGVFcnJvcikgYXMgZXhjOlxuICAgICAgICByYWlzZSBIVFRQRXhjZXB0aW9uKDQwMCwgXCdJbnZhbGlkIG91dGZpdCBldmlkZW5jZVwnKSBmcm9tIGV4Y1xuICAgIGlmIG5vdCBpc2luc3RhbmNlKHZhbHVlLCBsaXN0KSBvciBub3QgMSA8PSBsZW4odmFsdWUpIDw9IE1BWF9PVVRGSVRfSVRFTVM6XG4gICAgICAgIHJhaXNlIEhUVFBFeGNlcHRpb24oNDAwLCBcJ1Byb3ZpZGUgYmV0d2VlbiBvbmUgYW5kIGZpdmUgb3V0Zml0IGl0ZW1zXCcpXG4gICAgY2xlYW4sIHNlZW4gPSBbXSwgc2V0KClcbiAgICBmb3IgaXRlbSBpbiB2YWx1ZTpcbiAgICAgICAgaWYgbm90IGlzaW5zdGFuY2UoaXRlbSwgZGljdCkgb3Igbm90IGlzaW5zdGFuY2UoaXRlbS5nZXQoXCdpbmRleFwnKSwgaW50KSBvciBpdGVtW1wnaW5kZXhcJ10gaW4gc2VlbjpcbiAgICAgICAgICAgIHJhaXNlIEhUVFBFeGNlcHRpb24oNDAwLCBcJ091dGZpdCBpdGVtIGluZGV4ZXMgbXVzdCBiZSB1bmlxdWUgaW50ZWdlcnNcJylcbiAgICAgICAgc2Vlbi5hZGQoaXRlbVtcJ2luZGV4XCddKVxuICAgICAgICBjYW5kaWRhdGUgPSB7XG4gICAgICAgICAgICBcJ2luZGV4XCc6IGl0ZW1bXCdpbmRleFwnXSxcbiAgICAgICAgICAgIFwnYm91bmRpbmdCb3hcJzogaXRlbS5nZXQoXCdib3VuZGluZ0JveFwnKSxcbiAgICAgICAgICAgIFwncGFyc2VyQ2xhc3NcJzogc3RyKGl0ZW0uZ2V0KFwncGFyc2VyQ2xhc3NcJykgb3IgXCdcJylbOjQwXSxcbiAgICAgICAgICAgIFwncXVhbGl0eVwnOiBpdGVtLmdldChcJ3F1YWxpdHlcJywgXCdoaWdoXCcpLFxuICAgICAgICAgICAgXCdzZWVkXCc6IGl0ZW0uZ2V0KFwnc2VlZFwnLCA0MiksXG4gICAgICAgIH1cbiAgICAgICAgY2F0ZWdvcnkgPSBpdGVtLmdldChcJ2NhdGVnb3J5XCcpXG4gICAgICAgIG1hbmlmZXN0ID0gaXRlbS5nZXQoXCdtYW5pZmVzdFwnKVxuICAgICAgICBpZiBjYXRlZ29yeSBpcyBub3QgTm9uZTpcbiAgICAgICAgICAgIHRyeTpcbiAgICAgICAgICAgICAgICBjYXRlZ29yeSA9IG5vcm1hbGl6ZV9jYXRlZ29yeShjYXRlZ29yeSlcbiAgICAgICAgICAgICAgICBtYW5pZmVzdCA9IG5vcm1hbGl6ZV9tYW5pZmVzdChjYXRlZ29yeSwgbWFuaWZlc3QpXG4gICAgICAgICAgICBleGNlcHQgKFZhbHVlRXJyb3IsIFR5cGVFcnJvcikgYXMgZXhjOlxuICAgICAgICAgICAgICAgIHJhaXNlIEhUVFBFeGNlcHRpb24oNDAwLCBcJ0ludmFsaWQgb3IgbWlzbWF0Y2hlZCBvdXRmaXQgZ2FybWVudCBldmlkZW5jZVwnKSBmcm9tIGV4Y1xuICAgICAgICAgICAgaWYgY2FuZGlkYXRlW1wncXVhbGl0eVwnXSBub3QgaW4gKFwnc3RhbmRhcmRcJywgXCdoaWdoXCcpIG9yIG5vdCBpc2luc3RhbmNlKGNhbmRpZGF0ZVtcJ3NlZWRcJ10sIGludCkgb3Igbm90IDAgPD0gY2FuZGlkYXRlW1wnc2VlZFwnXSA8IDIqKjMyOlxuICAgICAgICAgICAgICAgIHJhaXNlIEhUVFBFeGNlcHRpb24oNDAwLCBcJ1Vuc3VwcG9ydGVkIG91dGZpdCBxdWFsaXR5IG9yIHNlZWRcJylcbiAgICAgICAgICAgIGNhbmRpZGF0ZS51cGRhdGUoY2F0ZWdvcnk9Y2F0ZWdvcnksIG1hbmlmZXN0PW1hbmlmZXN0KVxuICAgICAgICBjbGVhbi5hcHBlbmQoY2FuZGlkYXRlKVxuICAgIHJldHVybiBjbGVhblxuXG5cbkBhcHAucG9zdChcJy9vdXRmaXRcJylcbmFzeW5jIGRlZiBnZW5lcmF0ZV9vdXRmaXQoaW1hZ2U6IFVwbG9hZEZpbGUgPSBGaWxlKC4uLiksIGl0ZW1zOiBzdHIgPSBGb3JtKC4uLiksXG4gICAgICAgICAgICAgICAgICAgICAgICAgIGNvbnRyYWN0X3ZlcnNpb246IGludCA9IEZvcm0oLi4uKSk6XG4gICAgdHJ5OlxuICAgICAgICBpZiBFTkdJTkUgaXMgTm9uZSBvciBub3QgZ2V0YXR0cihFTkdJTkUsIFwnaXNfd2FybVwnLCBGYWxzZSk6XG4gICAgICAgICAgICByYWlzZSBIVFRQRXhjZXB0aW9uKDUwMywgXCdFbmdpbmUgaXMgd2FybWluZyB1cDsgcmV0cnkgc2hvcnRseS5cJywgaGVhZGVycz17XCdSZXRyeS1BZnRlclwnOlwnMTVcJ30pXG4gICAgICAgIGlmIGNvbnRyYWN0X3ZlcnNpb24gIT0gQ09OVFJBQ1RfVkVSU0lPTjpcbiAgICAgICAgICAgIHJhaXNlIEhUVFBFeGNlcHRpb24oNDA5LCBcJ1VwZGF0ZSB0aGUgd2Vic2l0ZSB0byB0aGUgYXBwZWFyYW5jZSB2MiBjb250cmFjdC5cJylcbiAgICAgICAgaWYgaW1hZ2UuY29udGVudF90eXBlIG5vdCBpbiAoXCdpbWFnZS9wbmdcJywgXCdpbWFnZS9qcGVnXCcsIFwnaW1hZ2Uvd2VicFwnKTpcbiAgICAgICAgICAgIHJhaXNlIEhUVFBFeGNlcHRpb24oNDAwLCBcJ0ludmFsaWQgb3V0Zml0IGltYWdlIHR5cGVcJylcbiAgICAgICAgcGFyc2VkX2l0ZW1zID0gX291dGZpdF9pdGVtcyhpdGVtcylcbiAgICAgICAgZGF0YSA9IGF3YWl0IGltYWdlLnJlYWQoTUFYX1VQTE9BRF9CWVRFUyArIDEpXG4gICAgICAgIGlmIG5vdCBkYXRhIG9yIGxlbihkYXRhKSA+IE1BWF9VUExPQURfQllURVM6XG4gICAgICAgICAgICByYWlzZSBIVFRQRXhjZXB0aW9uKDQxMywgXCdFbXB0eSBpbWFnZSBvciB1cGxvYWQgZXhjZWVkcyAyMCBNQlwnKVxuICAgICAgICByZXF1ZXN0X2xvZyhcJ291dGZpdF9wYXJzaW5nX3N0YXJ0ZWRcJywgaXRlbV9jb3VudD1sZW4ocGFyc2VkX2l0ZW1zKSwgaW5wdXRfYnl0ZXM9bGVuKGRhdGEpKVxuICAgICAgICB0cnk6XG4gICAgICAgICAgICBjdXRvdXRzLCBza2lwcGVkLCBldmlkZW5jZSA9IGF3YWl0IGFzeW5jaW8udG9fdGhyZWFkKHBhcnNlX291dGZpdCwgZGF0YSwgcGFyc2VkX2l0ZW1zKVxuICAgICAgICBleGNlcHQgT3V0Zml0UGFyc2VyRXJyb3IgYXMgZXhjOlxuICAgICAgICAgICAgcmVxdWVzdF9sb2coXCdvdXRmaXRfbm90X3dvcm5cJywgcmVhc29uPXN0cihleGMpKVxuICAgICAgICAgICAgcmFpc2UgSFRUUEV4Y2VwdGlvbig0MDksIHN0cihleGMpLCBoZWFkZXJzPXtcJ1gtT3V0Zml0LVBpcGVsaW5lLVZlcnNpb25cJzpQQVJTRVJfVkVSU0lPTn0pIGZyb20gZXhjXG4gICAgICAgIGJ5X2luZGV4ID0ge2l0ZW1bXCdpbmRleFwnXTogaXRlbSBmb3IgaXRlbSBpbiBwYXJzZWRfaXRlbXN9XG4gICAgICAgIHJlc3VsdHMgPSBbXVxuICAgICAgICBmb3IgY3V0b3V0IGluIGN1dG91dHM6XG4gICAgICAgICAgICByZXF1ZXN0ID0gYnlfaW5kZXhbY3V0b3V0LmluZGV4XVxuICAgICAgICAgICAgcmVzdWx0ID0ge1xuICAgICAgICAgICAgICAgIFwnaW5kZXhcJzogY3V0b3V0LmluZGV4LFxuICAgICAgICAgICAgICAgIFwnc291cmNlUG5nXCc6IGJhc2U2NC5iNjRlbmNvZGUoY3V0b3V0LnBuZykuZGVjb2RlKFwnYXNjaWlcJyksXG4gICAgICAgICAgICAgICAgXCdzb3VyY2VXaWR0aFwnOiBjdXRvdXQud2lkdGgsXG4gICAgICAgICAgICAgICAgXCdzb3VyY2VIZWlnaHRcJzogY3V0b3V0LmhlaWdodCxcbiAgICAgICAgICAgICAgICBcJ3BhcnNlckxhYmVsc1wnOiBsaXN0KGN1dG91dC5sYWJlbHMpLFxuICAgICAgICAgICAgICAgIFwnc291cmNlUGl4ZWxzXCc6IGN1dG91dC5waXhlbF9jb3VudCxcbiAgICAgICAgICAgICAgICBcJ3ByZXNlcnZlZE9jY2x1c2lvblBpeGVsc1wnOiBjdXRvdXQucHJlc2VydmVkX29jY2x1c2lvbl9waXhlbHMsXG4gICAgICAgICAgICAgICAgXCdyZXBhaXJlZE9jY2x1c2lvblBpeGVsc1wnOiBjdXRvdXQucmVwYWlyZWRfb2NjbHVzaW9uX3BpeGVscyxcbiAgICAgICAgICAgICAgICBcJ3RyaW1tZWRGb290d2VhclBpeGVsc1wnOiBjdXRvdXQudHJpbW1lZF9mb290d2Vhcl9waXhlbHMsXG4gICAgICAgICAgICB9XG4gICAgICAgICAgICBpZiByZXF1ZXN0LmdldChcJ2NhdGVnb3J5XCcpOlxuICAgICAgICAgICAgICAgIHRyeTpcbiAgICAgICAgICAgICAgICAgICAgcmVuZGVyZWQgPSBhd2FpdCBhc3luY2lvLnRvX3RocmVhZChcbiAgICAgICAgICAgICAgICAgICAgICAgIHJlbmRlcl9yZXF1ZXN0LCBjdXRvdXQucG5nLCByZXF1ZXN0W1wnY2F0ZWdvcnlcJ10sIHJlcXVlc3RbXCdtYW5pZmVzdFwnXSxcbiAgICAgICAgICAgICAgICAgICAgICAgIHJlcXVlc3RbXCdxdWFsaXR5XCddLCByZXF1ZXN0W1wnc2VlZFwnXVxuICAgICAgICAgICAgICAgICAgICApXG4gICAgICAgICAgICAgICAgICAgIHJlc3VsdC51cGRhdGUoXG4gICAgICAgICAgICAgICAgICAgICAgICBnZW5lcmF0ZWRQbmc9YmFzZTY0LmI2NGVuY29kZShyZW5kZXJlZC5ib2R5KS5kZWNvZGUoXCdhc2NpaVwnKSxcbiAgICAgICAgICAgICAgICAgICAgICAgIGNhdGVnb3J5PXJlcXVlc3RbXCdjYXRlZ29yeVwnXSwgc2VlZD1yZXF1ZXN0W1wnc2VlZFwnXVxuICAgICAgICAgICAgICAgICAgICApXG4gICAgICAgICAgICAgICAgZXhjZXB0IEV4Y2VwdGlvbiBhcyBleGM6XG4gICAgICAgICAgICAgICAgICAgIHJlcXVlc3RfbG9nKFwnb3V0Zml0X2l0ZW1fZ2VuZXJhdGlvbl9mYWlsZWRcJywgaW5kZXg9Y3V0b3V0LmluZGV4LCBlcnJvcl90eXBlPXR5cGUoZXhjKS5fX25hbWVfXylcbiAgICAgICAgICAgICAgICAgICAgcmVzdWx0W1wnZ2VuZXJhdGlvbkVycm9yXCddID0gc3RyKGV4Yy5kZXRhaWwpIGlmIGlzaW5zdGFuY2UoZXhjLCBIVFRQRXhjZXB0aW9uKSBlbHNlIFwnM0QgZ2VuZXJhdGlvbiBmYWlsZWQgZm9yIHRoaXMgaXRlbVwnXG4gICAgICAgICAgICByZXN1bHRzLmFwcGVuZChyZXN1bHQpXG4gICAgICAgIHBheWxvYWQgPSB7XCdpdGVtc1wnOiByZXN1bHRzLCBcJ3NraXBwZWRcJzogc2tpcHBlZCwgXCd3b3JuRXZpZGVuY2VcJzogZXZpZGVuY2UsXG4gICAgICAgICAgICAgICAgICAgXCdwYXJzZXJWZXJzaW9uXCc6IFBBUlNFUl9WRVJTSU9OLCBcJ2NvbnRyYWN0VmVyc2lvblwnOiBDT05UUkFDVF9WRVJTSU9OfVxuICAgICAgICBlbmNvZGVkID0ganNvbi5kdW1wcyhwYXlsb2FkLCBzZXBhcmF0b3JzPShcJyxcJywgXCc6XCcpKS5lbmNvZGUoKVxuICAgICAgICBpZiBsZW4oZW5jb2RlZCkgPiBNQVhfT1VURklUX1JFU1BPTlNFOlxuICAgICAgICAgICAgcmFpc2UgSFRUUEV4Y2VwdGlvbig0MTMsIFwnUHJlcGFyZWQgb3V0Zml0IHJlc3BvbnNlIGV4Y2VlZHMgMzIgTUJcJylcbiAgICAgICAgcmVxdWVzdF9sb2coXCdvdXRmaXRfZmluaXNoZWRcJywgcGFyc2VkPWxlbihyZXN1bHRzKSwgc2tpcHBlZD1sZW4oc2tpcHBlZCksIHdvcm5fZXZpZGVuY2U9ZXZpZGVuY2UpXG4gICAgICAgIHJldHVybiBSZXNwb25zZShlbmNvZGVkLCBtZWRpYV90eXBlPVwnYXBwbGljYXRpb24vanNvblwnLCBoZWFkZXJzPXtcbiAgICAgICAgICAgIFwnWC1PdXRmaXQtUGlwZWxpbmUtVmVyc2lvblwnOiBQQVJTRVJfVkVSU0lPTixcbiAgICAgICAgICAgIFwnWC1HaG9zdC1Db250cmFjdC1WZXJzaW9uXCc6IHN0cihDT05UUkFDVF9WRVJTSU9OKSxcbiAgICAgICAgfSlcbiAgICBmaW5hbGx5OlxuICAgICAgICBhd2FpdCBpbWFnZS5jbG9zZSgpXG5cbiMgT3B0aW9uYWwgc2VsZWN0ZWQtd2FyZHJvYmUgY29tcG9zaXRpb24gcm91dGUuIEFwcGVuZGVkIGJ5IGJ1aWxkX25vdGVib29rLnB5LlxuIyBFeGlzdGluZyAvZ2VuZXJhdGUgYW5kIHdvcm4tcGhvdG8gL291dGZpdCByb3V0ZXMgcmVtYWluIHVuY2hhbmdlZC5cbkZVTExfTE9PS19WRVJTSU9OID0gXCcxXCdcbk1BWF9GVUxMX0xPT0tfSVRFTVMgPSA2XG5NQVhfRlVMTF9MT09LX0pTT04gPSAzNjAwMFxuRlVMTF9MT09LX1dJRFRIID0gODMyXG5GVUxMX0xPT0tfSEVJR0hUID0gMTA4OFxuXG5cbmRlZiBfbG9va19jbGVhbih2YWx1ZSwgbGltaXQ9MTYwKTpcbiAgICByZXR1cm4gcmUuc3ViKHJcJ1xccytcJywgXCcgXCcsIHN0cih2YWx1ZSBvciBcJ1wnKSkuc3RyaXAoKVs6bGltaXRdXG5cblxuZGVmIF9mdWxsX2xvb2tfaXRlbXMocmF3LCByZWZlcmVuY2VfY291bnQpOlxuICAgIGlmIGxlbihyYXcpID4gTUFYX0ZVTExfTE9PS19KU09OOlxuICAgICAgICByYWlzZSBIVFRQRXhjZXB0aW9uKDQxMywgXCdDb21wbGV0ZS1sb29rIGV2aWRlbmNlIGlzIHRvbyBsYXJnZVwnKVxuICAgIHRyeTpcbiAgICAgICAgdmFsdWVzID0ganNvbi5sb2FkcyhyYXcpXG4gICAgZXhjZXB0IChqc29uLkpTT05EZWNvZGVFcnJvciwgVHlwZUVycm9yKSBhcyBleGM6XG4gICAgICAgIHJhaXNlIEhUVFBFeGNlcHRpb24oNDAwLCBcJ0ludmFsaWQgY29tcGxldGUtbG9vayBldmlkZW5jZVwnKSBmcm9tIGV4Y1xuICAgIGlmIG5vdCBpc2luc3RhbmNlKHZhbHVlcywgbGlzdCkgb3Igbm90IDIgPD0gbGVuKHZhbHVlcykgPD0gTUFYX0ZVTExfTE9PS19JVEVNUyBvciBsZW4odmFsdWVzKSAhPSByZWZlcmVuY2VfY291bnQ6XG4gICAgICAgIHJhaXNlIEhUVFBFeGNlcHRpb24oNDAwLCBcJ1Byb3ZpZGUgbWF0Y2hpbmcgcmVmZXJlbmNlcyBmb3IgdHdvIHRvIHNpeCBvdXRmaXQgaXRlbXNcJylcbiAgICBhbGxvd2VkX3Nsb3RzID0ge1wndG9wXCcsIFwnYm90dG9tXCcsIFwnbGF5ZXJcJywgXCdoZXJvXCcsIFwnZm9vdHdlYXJcJywgXCdhY2Nlc3NvcnlcJ31cbiAgICBjbGVhbiA9IFtdXG4gICAgZm9yIGluZGV4LCBpdGVtIGluIGVudW1lcmF0ZSh2YWx1ZXMpOlxuICAgICAgICBpZiBub3QgaXNpbnN0YW5jZShpdGVtLCBkaWN0KSBvciBpdGVtLmdldChcJ2luZGV4XCcpICE9IGluZGV4IG9yIGl0ZW0uZ2V0KFwnc2xvdFwnKSBub3QgaW4gYWxsb3dlZF9zbG90czpcbiAgICAgICAgICAgIHJhaXNlIEhUVFBFeGNlcHRpb24oNDAwLCBcJ0NvbXBsZXRlLWxvb2sgaXRlbSBvcmRlciBvciBzbG90IGlzIGludmFsaWRcJylcbiAgICAgICAgcGFsZXR0ZSA9IGl0ZW0uZ2V0KFwncGFsZXR0ZVwnKSBpZiBpc2luc3RhbmNlKGl0ZW0uZ2V0KFwncGFsZXR0ZVwnKSwgbGlzdCkgZWxzZSBbXVxuICAgICAgICBjbGVhbi5hcHBlbmQoe1xuICAgICAgICAgICAgXCdpbmRleFwnOiBpbmRleCxcbiAgICAgICAgICAgIFwnc2xvdFwnOiBpdGVtW1wnc2xvdFwnXSxcbiAgICAgICAgICAgIFwndGl0bGVcJzogX2xvb2tfY2xlYW4oaXRlbS5nZXQoXCd0aXRsZVwnKSwgODApLFxuICAgICAgICAgICAgXCdjYXRlZ29yeVwnOiBfbG9va19jbGVhbihpdGVtLmdldChcJ2NhdGVnb3J5XCcpLCA2MCksXG4gICAgICAgICAgICBcJ3JlbmRlcmVyQ2F0ZWdvcnlcJzogX2xvb2tfY2xlYW4oaXRlbS5nZXQoXCdyZW5kZXJlckNhdGVnb3J5XCcpLCA0MCksXG4gICAgICAgICAgICBcJ3ByaW1hcnlDb2xvclwnOiBfbG9va19jbGVhbihpdGVtLmdldChcJ3ByaW1hcnlDb2xvclwnKSwgNTApLFxuICAgICAgICAgICAgXCdzZWNvbmRhcnlDb2xvcnNcJzogW19sb29rX2NsZWFuKHZhbHVlLCA0MCkgZm9yIHZhbHVlIGluIChpdGVtLmdldChcJ3NlY29uZGFyeUNvbG9yc1wnKSBvciBbXSlbOjhdXSxcbiAgICAgICAgICAgIFwncGF0dGVyblwnOiBfbG9va19jbGVhbihpdGVtLmdldChcJ3BhdHRlcm5cJyksIDcwKSxcbiAgICAgICAgICAgIFwnbWF0ZXJpYWxcJzogX2xvb2tfY2xlYW4oaXRlbS5nZXQoXCdtYXRlcmlhbFwnKSwgNzApLFxuICAgICAgICAgICAgXCdmaXRcJzogX2xvb2tfY2xlYW4oaXRlbS5nZXQoXCdmaXRcJyksIDUwKSxcbiAgICAgICAgICAgIFwncGFsZXR0ZVwnOiBbZW50cnkgZm9yIGVudHJ5IGluIHBhbGV0dGVbOjEyXSBpZiBpc2luc3RhbmNlKGVudHJ5LCBkaWN0KV0sXG4gICAgICAgICAgICBcJ2NvbG9yQW5kRmluaXNoXCc6IF9sb29rX2NsZWFuKGl0ZW0uZ2V0KFwnY29sb3JBbmRGaW5pc2hcJyksIDIyMCksXG4gICAgICAgICAgICBcJ3N1cmZhY2VUZXh0dXJlQW5kV2VhdmVcJzogX2xvb2tfY2xlYW4oaXRlbS5nZXQoXCdzdXJmYWNlVGV4dHVyZUFuZFdlYXZlXCcpLCAxODApLFxuICAgICAgICAgICAgXCdoYXJkd2FyZUFuZENsb3N1cmVzXCc6IF9sb29rX2NsZWFuKGl0ZW0uZ2V0KFwnaGFyZHdhcmVBbmRDbG9zdXJlc1wnKSwgMTMwKSxcbiAgICAgICAgICAgIFwnZ3JhcGhpY3NPclRleHRcJzogX2xvb2tfY2xlYW4oaXRlbS5nZXQoXCdncmFwaGljc09yVGV4dFwnKSwgMTUwKSxcbiAgICAgICAgICAgIFwnc291cmNlS2luZFwnOiBcJ3ZlcmlmaWVkX2dob3N0XCcgaWYgaXRlbS5nZXQoXCdzb3VyY2VLaW5kXCcpID09IFwndmVyaWZpZWRfZ2hvc3RcJyBlbHNlIFwnd2FyZHJvYmVfcGhvdG9cJyxcbiAgICAgICAgfSlcbiAgICBzbG90cyA9IFtpdGVtW1wnc2xvdFwnXSBmb3IgaXRlbSBpbiBjbGVhbl1cbiAgICBpZiBcJ2hlcm9cJyBpbiBzbG90czpcbiAgICAgICAgaWYgXCd0b3BcJyBpbiBzbG90cyBvciBcJ2JvdHRvbVwnIGluIHNsb3RzOlxuICAgICAgICAgICAgcmFpc2UgSFRUUEV4Y2VwdGlvbig0MDAsIFwnQSBvbmUtcGllY2UgbG9vayBjYW5ub3QgYWxzbyBjb250YWluIHNlcGFyYXRlIHRvcCBvciBib3R0b20gcGllY2VzXCcpXG4gICAgZWxpZiBcJ3RvcFwnIG5vdCBpbiBzbG90cyBvciBcJ2JvdHRvbVwnIG5vdCBpbiBzbG90czpcbiAgICAgICAgcmFpc2UgSFRUUEV4Y2VwdGlvbig0MDAsIFwnQSBjb21wbGV0ZSBsb29rIG5lZWRzIGEgdG9wIGFuZCBib3R0b21cJylcbiAgICByZXR1cm4gY2xlYW5cblxuXG5kZWYgX3BhbGV0dGVfdGV4dChlbnRyaWVzKTpcbiAgICBwYXJ0cyA9IFtdXG4gICAgZm9yIGVudHJ5IGluIGVudHJpZXM6XG4gICAgICAgIGNvbG9yID0gX2xvb2tfY2xlYW4oZW50cnkuZ2V0KFwnaGV4XCcpLCA3KVxuICAgICAgICByb2xlID0gX2xvb2tfY2xlYW4oZW50cnkuZ2V0KFwncm9sZVwnKSwgMjQpXG4gICAgICAgIHJlZ2lvbiA9IF9sb29rX2NsZWFuKGVudHJ5LmdldChcJ3JlZ2lvblwnKSwgNDgpXG4gICAgICAgIGlmIHJlLmZ1bGxtYXRjaChyXCcjWzAtOUEtRmEtZl17Nn1cJywgY29sb3IpOlxuICAgICAgICAgICAgcGFydHMuYXBwZW5kKGZcJ3tyb2xlIG9yICJjb2xvciJ9IHtjb2xvcn0gYXQge3JlZ2lvbiBvciAidmlzaWJsZSByZWdpb24ifVwnKVxuICAgIHJldHVybiBcJywgXCcuam9pbihwYXJ0cylcblxuXG5kZWYgcGFja19mdWxsX2xvb2tfcHJvbXB0KGl0ZW1zLCBwcmVzZW50YXRpb24sIGZlZWRiYWNrLCB0b2tlbml6ZXIpOlxuICAgIGJhc2UgPSAoXG4gICAgICAgIGZcJ0NyZWF0ZSBvbmUgcHJlbWl1bSBmdWxsLWJvZHkgc3R1ZGlvIGZhc2hpb24gcGhvdG9ncmFwaCBvZiBvbmUgYW5vbnltb3VzIHtwcmVzZW50YXRpb259IHJldGFpbCBtYW5uZXF1aW4gd2VhcmluZyBhbGwgc3VwcGxpZWQgd2FyZHJvYmUgcmVmZXJlbmNlcyB0b2dldGhlciBhcyBvbmUgcmVhbGlzdGljIGNvbXBsZXRlIG91dGZpdC4gXCdcbiAgICAgICAgXCdTaG93IHRoZSBtYW5uZXF1aW4gZnJvbSBzbW9vdGggZmVhdHVyZWxlc3MgaGVhZCB0byBmb290d2VhciwgY2VudGVyZWQsIHN0YW5kaW5nIG5hdHVyYWxseSBpbiBhIHN1YnRsZSB0aHJlZS1xdWFydGVyIGZyb250IHBvc2Ugb24gYSBzZWFtbGVzcyB3YXJtLXdoaXRlIHN0dWRpbyBiYWNrZ3JvdW5kLiBcJ1xuICAgICAgICBcJ1RoZSBtYW5uZXF1aW4gaXMgYSBuZXV0cmFsIGRpc3BsYXkgZm9ybSwgbm90IGEgcmVhbCBwZXJzb246IG5vIGlkZW50aXR5LCBmYWNpYWwgZmVhdHVyZXMsIGhhaXIgb3Igc2tpbi4gS2VlcCBub3JtYWwgbWFubmVxdWluIGhhbmRzIG9ubHkgd2hlbiBuZWVkZWQgYmVzaWRlIHRoZSBvdXRmaXQuIFwnXG4gICAgICAgIFwnVXNlIGVhY2ggbnVtYmVyZWQgcmVmZXJlbmNlIGV4YWN0bHkgb25jZSBhbmQgaW4gaXRzIGFzc2lnbmVkIGJvZHkgc2xvdC4gUHJlc2VydmUgdGhlIHNvdXJjZSBnYXJtZW50IHBpeGVscyBhcyBhdXRob3JpdHkgZm9yIGh1ZSwgc2F0dXJhdGlvbiwgYnJpZ2h0bmVzcywgbXVsdGljb2xvciByZWdpb24gcGxhY2VtZW50LCBmYWJyaWMgdGV4dHVyZSwgcGF0dGVybiwgZ3JhcGhpY3MsIHNpbGhvdWV0dGUsIGxlbmd0aCwgY2xvc3VyZXMgYW5kIGNvbnN0cnVjdGlvbi4gXCdcbiAgICAgICAgXCdMYXllciBnYXJtZW50cyBuYXR1cmFsbHkgd2l0aG91dCBoaWRpbmcgdGhlaXIgZGVmaW5pbmcgZGV0YWlscy4gUHJlc2VydmUgYSBmb290d2VhciBwYWlyIGFzIHR3byBtYXRjaGluZyBzaG9lcyBhbmQgcGxhY2UgYWNjZXNzb3JpZXMgbmF0dXJhbGx5LiBEbyBub3QgaW52ZW50LCBkdXBsaWNhdGUsIG9taXQsIHJlY29sb3IsIG1pcnJvciBvciByZWRlc2lnbiBhbnkgd2FyZHJvYmUgcGllY2UuIFwnXG4gICAgICAgIFwnUHJvZHVjZSBvbmUgY29oZXJlbnQgcGhvdG9ncmFwaGVkIG91dGZpdCwgbm90IGEgY29sbGFnZSwgY29udGFjdCBzaGVldCwgZmxhdCBsYXksIGZsb2F0aW5nIHByb2R1Y3QgYXJyYW5nZW1lbnQsIHNwbGl0IHNjcmVlbiBvciBzZXBhcmF0ZSBnYXJtZW50IGNhcmRzLlwnXG4gICAgKVxuICAgIGxpbmVzID0gW11cbiAgICBmb3IgaXRlbSBpbiBpdGVtczpcbiAgICAgICAgZGV0YWlscyA9IFtcbiAgICAgICAgICAgIGZcJ1JlZmVyZW5jZSB7aXRlbVsiaW5kZXgiXSArIDF9OiBzbG90PXtpdGVtWyJzbG90Il19XCcsXG4gICAgICAgICAgICBmXCdpdGVtPXtpdGVtWyJ0aXRsZSJdIG9yIGl0ZW1bImNhdGVnb3J5Il0gb3IgIndhcmRyb2JlIHBpZWNlIn1cJyxcbiAgICAgICAgICAgIGZcJ2NhdGVnb3J5PXtpdGVtWyJjYXRlZ29yeSJdfVwnLFxuICAgICAgICAgICAgZlwncGFsZXR0ZT17X3BhbGV0dGVfdGV4dChpdGVtWyJwYWxldHRlIl0pfVwnLFxuICAgICAgICAgICAgZlwnY29sb3JzPXtpdGVtWyJjb2xvckFuZEZpbmlzaCJdIG9yIGl0ZW1bInByaW1hcnlDb2xvciJdfVwnLFxuICAgICAgICAgICAgZlwncGF0dGVybj17aXRlbVsicGF0dGVybiJdfVwnLFxuICAgICAgICAgICAgZlwnbWF0ZXJpYWw9e2l0ZW1bInN1cmZhY2VUZXh0dXJlQW5kV2VhdmUiXSBvciBpdGVtWyJtYXRlcmlhbCJdfVwnLFxuICAgICAgICAgICAgZlwnZml0PXtpdGVtWyJmaXQiXX1cJyxcbiAgICAgICAgICAgIGZcJ2NvbnN0cnVjdGlvbj17aXRlbVsiaGFyZHdhcmVBbmRDbG9zdXJlcyJdfVwnLFxuICAgICAgICAgICAgZlwnZ3JhcGhpY3M9e2l0ZW1bImdyYXBoaWNzT3JUZXh0Il19XCcsXG4gICAgICAgIF1cbiAgICAgICAgbGluZXMuYXBwZW5kKFwnOyBcJy5qb2luKHBhcnQgZm9yIHBhcnQgaW4gZGV0YWlscyBpZiBub3QgcGFydC5lbmRzd2l0aChcJz1cJykpICsgXCcuXCcpXG4gICAgY29ycmVjdGlvbiA9IGZcJyBNYW5kYXRvcnkgY29ycmVjdGlvbiBmcm9tIHRoZSBwcmV2aW91cyBjb21wYXJpc29uOiB7X2xvb2tfY2xlYW4oZmVlZGJhY2ssIDkwMCl9XCcgaWYgZmVlZGJhY2sgZWxzZSBcJ1wnXG4gICAgcHJvbXB0ID0gYmFzZSArIFwnIFwnICsgXCcgXCcuam9pbihsaW5lcykgKyBjb3JyZWN0aW9uXG4gICAgdG9rZW5zID0gdG9rZW5pemVyLmVuY29kZShwcm9tcHQsIGFkZF9zcGVjaWFsX3Rva2Vucz1GYWxzZSlcbiAgICBpZiBsZW4odG9rZW5zKSA+IDUwMDpcbiAgICAgICAgY29tcGFjdCA9IFtdXG4gICAgICAgIGZvciBpdGVtIGluIGl0ZW1zOlxuICAgICAgICAgICAgY29tcGFjdC5hcHBlbmQoXG4gICAgICAgICAgICAgICAgZlwnUmVmZXJlbmNlIHtpdGVtWyJpbmRleCJdICsgMX06IHtpdGVtWyJzbG90Il19OyB7aXRlbVsiY2F0ZWdvcnkiXX07IFwnXG4gICAgICAgICAgICAgICAgZlwncGFsZXR0ZSB7X3BhbGV0dGVfdGV4dChpdGVtWyJwYWxldHRlIl0pfTsgY29sb3JzIHtfbG9va19jbGVhbihpdGVtWyJjb2xvckFuZEZpbmlzaCJdIG9yIGl0ZW1bInByaW1hcnlDb2xvciJdLCAxMDApfTsgXCdcbiAgICAgICAgICAgICAgICBmXCdwYXR0ZXJuIHtfbG9va19jbGVhbihpdGVtWyJwYXR0ZXJuIl0sIDQ1KX07IG1hdGVyaWFsIHtfbG9va19jbGVhbihpdGVtWyJzdXJmYWNlVGV4dHVyZUFuZFdlYXZlIl0gb3IgaXRlbVsibWF0ZXJpYWwiXSwgNzApfS5cJ1xuICAgICAgICAgICAgKVxuICAgICAgICBwcm9tcHQgPSBiYXNlICsgXCcgXCcgKyBcJyBcJy5qb2luKGNvbXBhY3QpICsgY29ycmVjdGlvblxuICAgICAgICB0b2tlbnMgPSB0b2tlbml6ZXIuZW5jb2RlKHByb21wdCwgYWRkX3NwZWNpYWxfdG9rZW5zPUZhbHNlKVxuICAgIGlmIGxlbih0b2tlbnMpID4gNTEyOlxuICAgICAgICByYWlzZSBIVFRQRXhjZXB0aW9uKDQwMCwgXCdDb21wbGV0ZS1sb29rIGV2aWRlbmNlIGRvZXMgbm90IGZpdCB0aGUgbW9kZWwgY29udGV4dFwnKVxuICAgIHJldHVybiBwcm9tcHQsIGxlbih0b2tlbnMpXG5cblxuZGVmIHJlbmRlcl9mdWxsX2xvb2socmVmZXJlbmNlX2J5dGVzLCBpdGVtcywgcHJlc2VudGF0aW9uLCBmZWVkYmFjaywgc2VlZCk6XG4gICAgY2FjaGVfbWF0ZXJpYWwgPSBiXCdcJy5qb2luKGhhc2hsaWIuc2hhMjU2KHZhbHVlKS5kaWdlc3QoKSBmb3IgdmFsdWUgaW4gcmVmZXJlbmNlX2J5dGVzKVxuICAgIGtleSA9IGhhc2hsaWIuc2hhMjU2KGJcJ2Z1bGwtbG9vay12MVwnICsgY2FjaGVfbWF0ZXJpYWwgKyBqc29uLmR1bXBzKFtpdGVtcywgcHJlc2VudGF0aW9uLCBmZWVkYmFjaywgc2VlZF0sIHNvcnRfa2V5cz1UcnVlKS5lbmNvZGUoKSkuaGV4ZGlnZXN0KClcbiAgICB3aXRoIENBQ0hFX0xPQ0s6XG4gICAgICAgIG5vdyA9IHRpbWUubW9ub3RvbmljKClcbiAgICAgICAgZm9yIG9sZF9rZXksIGNhY2hlZCBpbiBsaXN0KFJFU1VMVF9DQUNIRS5pdGVtcygpKTpcbiAgICAgICAgICAgIGlmIG5vdyAtIGNhY2hlZFswXSA+IENBQ0hFX1RUTDpcbiAgICAgICAgICAgICAgICBSRVNVTFRfQ0FDSEUucG9wKG9sZF9rZXksIE5vbmUpXG4gICAgICAgIGNhY2hlZCA9IFJFU1VMVF9DQUNIRS5nZXQoa2V5KVxuICAgICAgICBpZiBjYWNoZWQ6XG4gICAgICAgICAgICByZXF1ZXN0X2xvZyhcJ2Z1bGxfbG9va19jYWNoZV9oaXRcJywgaXRlbV9jb3VudD1sZW4oaXRlbXMpLCBzZWVkPXNlZWQpXG4gICAgICAgICAgICByZXR1cm4gUmVzcG9uc2UoY2FjaGVkWzFdLCBtZWRpYV90eXBlPVwnaW1hZ2UvcG5nXCcsIGhlYWRlcnM9eyoqY2FjaGVkWzJdLCBcJ1gtR2hvc3QtQ2FjaGVcJzpcJ2hpdFwnfSlcbiAgICBpZiBub3QgTE9DSy5hY3F1aXJlKGJsb2NraW5nPUZhbHNlKTpcbiAgICAgICAgcmVxdWVzdF9sb2coXCdncHVfYnVzeVwnLCByZXRyeV9hZnRlcl9zZWNvbmRzPTE1KVxuICAgICAgICByYWlzZSBIVFRQRXhjZXB0aW9uKDQyOSwgXCdBbm90aGVyIGdlbmVyYXRpb24gaXMgYmVpbmcgcHJvY2Vzc2VkLiBQbGVhc2UgcmV0cnkuXCcsIGhlYWRlcnM9e1wnUmV0cnktQWZ0ZXJcJzpcJzE1XCd9KVxuICAgIHRyeTpcbiAgICAgICAgZGVjb2RlZCA9IFtkZWNvZGVfZ2FybWVudCh2YWx1ZSkgZm9yIHZhbHVlIGluIHJlZmVyZW5jZV9ieXRlc11cbiAgICAgICAgaWYgYW55KG1pbihpbWFnZS5yZ2Iuc2l6ZSkgPCA2NCBmb3IgaW1hZ2UgaW4gZGVjb2RlZCk6XG4gICAgICAgICAgICByYWlzZSBJbnB1dEltYWdlRXJyb3IoXCdBIGNvbXBsZXRlLWxvb2sgcmVmZXJlbmNlIGlzIHRvbyBzbWFsbFwnKVxuICAgICAgICBwcm9tcHQsIHByb21wdF90b2tlbnMgPSBwYWNrX2Z1bGxfbG9va19wcm9tcHQoaXRlbXMsIHByZXNlbnRhdGlvbiwgZmVlZGJhY2ssIEVOR0lORS50ZXh0X3BpcGUudG9rZW5pemVyKVxuICAgICAgICByZXF1ZXN0X2xvZyhcJ2Z1bGxfbG9va19nZW5lcmF0aW9uX3N0YXJ0ZWRcJywgaXRlbV9jb3VudD1sZW4oaXRlbXMpLCBzbG90cz1baXRlbVtcJ3Nsb3RcJ10gZm9yIGl0ZW0gaW4gaXRlbXNdLCBwcmVzZW50YXRpb249cHJlc2VudGF0aW9uLCBzZWVkPXNlZWQsIHByb21wdF90b2tlbnM9cHJvbXB0X3Rva2VucywgaW5wdXRfYnl0ZXM9c3VtKGxlbih2YWx1ZSkgZm9yIHZhbHVlIGluIHJlZmVyZW5jZV9ieXRlcykpXG4gICAgICAgIHN0YXJ0ZWQgPSB0aW1lLnBlcmZfY291bnRlcigpXG4gICAgICAgIHdpdGggdG9yY2guaW5mZXJlbmNlX21vZGUoKTpcbiAgICAgICAgICAgIGVtYmVkcywgXyA9IEVOR0lORS50ZXh0X3BpcGUuZW5jb2RlX3Byb21wdChwcm9tcHQ9cHJvbXB0LCBkZXZpY2U9RU5HSU5FLnRleHRfZGV2aWNlLCBtYXhfc2VxdWVuY2VfbGVuZ3RoPTUxMilcbiAgICAgICAgZW1iZWRzID0gZW1iZWRzLnRvKGRldmljZT1FTkdJTkUuaW1hZ2VfZGV2aWNlLCBkdHlwZT1FTkdJTkUuY29tcHV0ZV9kdHlwZSlcbiAgICAgICAgY29uZGl0aW9uZWQgPSBbY29uZGl0aW9uaW5nX3RodW1ibmFpbChpbWFnZSwgbWF4X3NpemU9KDY0MCwgNzY4KSkgZm9yIGltYWdlIGluIGRlY29kZWRdXG4gICAgICAgIHdpdGggdG9yY2guaW5mZXJlbmNlX21vZGUoKTpcbiAgICAgICAgICAgIGdlbmVyYXRlZCA9IEVOR0lORS5pbWFnZV9waXBlKFxuICAgICAgICAgICAgICAgIGltYWdlPWNvbmRpdGlvbmVkLFxuICAgICAgICAgICAgICAgIHByb21wdF9lbWJlZHM9ZW1iZWRzLFxuICAgICAgICAgICAgICAgIHdpZHRoPUZVTExfTE9PS19XSURUSCxcbiAgICAgICAgICAgICAgICBoZWlnaHQ9RlVMTF9MT09LX0hFSUdIVCxcbiAgICAgICAgICAgICAgICBudW1faW5mZXJlbmNlX3N0ZXBzPTQsXG4gICAgICAgICAgICAgICAgZ3VpZGFuY2Vfc2NhbGU9MS4wLFxuICAgICAgICAgICAgICAgIGdlbmVyYXRvcj10b3JjaC5HZW5lcmF0b3IoZGV2aWNlPVwnY3B1XCcpLm1hbnVhbF9zZWVkKHNlZWQpLFxuICAgICAgICAgICAgKS5pbWFnZXNbMF1cbiAgICAgICAgb3V0cHV0ID0gZ2VuZXJhdGVkIGlmIGlzaW5zdGFuY2UoZ2VuZXJhdGVkLCBJbWFnZS5JbWFnZSkgZWxzZSBJbWFnZS5mcm9tYXJyYXkobnAucmludChucC5jbGlwKG5wLmFycmF5KGdlbmVyYXRlZCkgKiAyNTUuMCwgMCwgMjU1KSkuYXN0eXBlKG5wLnVpbnQ4KSlcbiAgICAgICAgYnVmZmVyID0gaW8uQnl0ZXNJTygpO291dHB1dC5jb252ZXJ0KFwnUkdCXCcpLnNhdmUoYnVmZmVyLCBmb3JtYXQ9XCdQTkdcJywgaWNjX3Byb2ZpbGU9U1JHQl9JQ0MpO3BheWxvYWQgPSBidWZmZXIuZ2V0dmFsdWUoKVxuICAgICAgICBpZiBub3QgNTAwIDw9IGxlbihwYXlsb2FkKSA8PSBNQVhfVVBMT0FEX0JZVEVTOlxuICAgICAgICAgICAgcmFpc2UgUnVudGltZUVycm9yKFwnR2VuZXJhdGVkIGNvbXBsZXRlIGxvb2sgZXhjZWVkcyB0aGUgc3VwcG9ydGVkIHNpemVcJylcbiAgICAgICAgZWxhcHNlZCA9IHJvdW5kKCh0aW1lLnBlcmZfY291bnRlcigpIC0gc3RhcnRlZCkgKiAxMDAwLCAxKVxuICAgICAgICBoZWFkZXJzID0ge1wnWC1SZXF1ZXN0LUlkXCc6c3RyKHV1aWQudXVpZDQoKSksIFwnWC1GdWxsLUxvb2stUGlwZWxpbmUtVmVyc2lvblwnOkZVTExfTE9PS19WRVJTSU9OLCBcJ1gtRnVsbC1Mb29rLVNlZWRcJzpzdHIoc2VlZCksIFwnWC1HZW5lcmF0aW9uLVRpbWVcJzpzdHIoZWxhcHNlZCkrXCdtc1wnfVxuICAgICAgICB3aXRoIENBQ0hFX0xPQ0s6XG4gICAgICAgICAgICBSRVNVTFRfQ0FDSEVba2V5XSA9ICh0aW1lLm1vbm90b25pYygpLCBwYXlsb2FkLCBoZWFkZXJzKVxuICAgICAgICAgICAgd2hpbGUgbGVuKFJFU1VMVF9DQUNIRSkgPiA0IG9yIHN1bShsZW4oZW50cnlbMV0pIGZvciBlbnRyeSBpbiBSRVNVTFRfQ0FDSEUudmFsdWVzKCkpID4gQ0FDSEVfQllURVM6XG4gICAgICAgICAgICAgICAgUkVTVUxUX0NBQ0hFLnBvcGl0ZW0obGFzdD1GYWxzZSlcbiAgICAgICAgcmVxdWVzdF9sb2coXCdmdWxsX2xvb2tfZ2VuZXJhdGlvbl9maW5pc2hlZFwnLCBpdGVtX2NvdW50PWxlbihpdGVtcyksIHNlZWQ9c2VlZCwgb3V0cHV0X3dpZHRoPUZVTExfTE9PS19XSURUSCwgb3V0cHV0X2hlaWdodD1GVUxMX0xPT0tfSEVJR0hULCBvdXRwdXRfYnl0ZXM9bGVuKHBheWxvYWQpLCBlbGFwc2VkX21zPWVsYXBzZWQpXG4gICAgICAgIHJldHVybiBSZXNwb25zZShwYXlsb2FkLCBtZWRpYV90eXBlPVwnaW1hZ2UvcG5nXCcsIGhlYWRlcnM9aGVhZGVycylcbiAgICBleGNlcHQgSW5wdXRJbWFnZUVycm9yIGFzIGV4YzpcbiAgICAgICAgcmFpc2UgSFRUUEV4Y2VwdGlvbig0MDAsIHN0cihleGMpKSBmcm9tIGV4Y1xuICAgIGZpbmFsbHk6XG4gICAgICAgIExPQ0sucmVsZWFzZSgpXG5cblxuQGFwcC5wb3N0KFwnL2Z1bGwtbG9va1wnKVxuYXN5bmMgZGVmIGdlbmVyYXRlX2Z1bGxfbG9vayhyZWZlcmVuY2U6IExpc3RbVXBsb2FkRmlsZV0gPSBGaWxlKC4uLiksIGl0ZW1zOiBzdHIgPSBGb3JtKC4uLiksXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgIHByZXNlbnRhdGlvbjogc3RyID0gRm9ybSguLi4pLCBmZWVkYmFjazogc3RyID0gRm9ybShcJ1wnKSxcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgY29udHJhY3RfdmVyc2lvbjogaW50ID0gRm9ybSguLi4pLCBzZWVkOiBpbnQgPSBGb3JtKDQyKSk6XG4gICAgdHJ5OlxuICAgICAgICBpZiBFTkdJTkUgaXMgTm9uZSBvciBub3QgZ2V0YXR0cihFTkdJTkUsIFwnaXNfd2FybVwnLCBGYWxzZSk6XG4gICAgICAgICAgICByYWlzZSBIVFRQRXhjZXB0aW9uKDUwMywgXCdFbmdpbmUgaXMgd2FybWluZyB1cDsgcmV0cnkgc2hvcnRseS5cJywgaGVhZGVycz17XCdSZXRyeS1BZnRlclwnOlwnMTVcJ30pXG4gICAgICAgIGlmIGNvbnRyYWN0X3ZlcnNpb24gIT0gMTpcbiAgICAgICAgICAgIHJhaXNlIEhUVFBFeGNlcHRpb24oNDA5LCBcJ1VwZGF0ZSB0aGUgd2Vic2l0ZSB0byB0aGUgZnVsbC1sb29rIHYxIGNvbnRyYWN0LlwnKVxuICAgICAgICBpZiBwcmVzZW50YXRpb24gbm90IGluIChcJ21hc2N1bGluZVwnLCBcJ2ZlbWluaW5lXCcsIFwnbmV1dHJhbFwnKSBvciBub3QgMCA8PSBzZWVkIDwgMioqMzIgb3IgbGVuKGZlZWRiYWNrKSA+IDkwMDpcbiAgICAgICAgICAgIHJhaXNlIEhUVFBFeGNlcHRpb24oNDAwLCBcJ0ludmFsaWQgY29tcGxldGUtbG9vayBwcmVzZW50YXRpb24sIGNvcnJlY3Rpb24gb3Igc2VlZFwnKVxuICAgICAgICBpZiBub3QgMiA8PSBsZW4ocmVmZXJlbmNlKSA8PSBNQVhfRlVMTF9MT09LX0lURU1TIG9yIGFueSh1cGxvYWQuY29udGVudF90eXBlIG5vdCBpbiAoXCdpbWFnZS9wbmdcJyxcJ2ltYWdlL2pwZWdcJyxcJ2ltYWdlL3dlYnBcJykgZm9yIHVwbG9hZCBpbiByZWZlcmVuY2UpOlxuICAgICAgICAgICAgcmFpc2UgSFRUUEV4Y2VwdGlvbig0MDAsIFwnUHJvdmlkZSB0d28gdG8gc2l4IHN1cHBvcnRlZCByZWZlcmVuY2UgaW1hZ2VzXCcpXG4gICAgICAgIHBhcnNlZCA9IF9mdWxsX2xvb2tfaXRlbXMoaXRlbXMsIGxlbihyZWZlcmVuY2UpKTtkYXRhID0gW11cbiAgICAgICAgZm9yIHVwbG9hZCBpbiByZWZlcmVuY2U6XG4gICAgICAgICAgICB2YWx1ZSA9IGF3YWl0IHVwbG9hZC5yZWFkKE1BWF9VUExPQURfQllURVMgKyAxKVxuICAgICAgICAgICAgaWYgbm90IHZhbHVlIG9yIGxlbih2YWx1ZSkgPiBNQVhfVVBMT0FEX0JZVEVTOlxuICAgICAgICAgICAgICAgIHJhaXNlIEhUVFBFeGNlcHRpb24oNDEzLCBcJ0EgY29tcGxldGUtbG9vayByZWZlcmVuY2UgaXMgZW1wdHkgb3IgZXhjZWVkcyAyMCBNQlwnKVxuICAgICAgICAgICAgZGF0YS5hcHBlbmQodmFsdWUpXG4gICAgICAgIHJldHVybiBhd2FpdCBhc3luY2lvLnRvX3RocmVhZChyZW5kZXJfZnVsbF9sb29rLCBkYXRhLCBwYXJzZWQsIHByZXNlbnRhdGlvbiwgZmVlZGJhY2ssIHNlZWQpXG4gICAgZmluYWxseTpcbiAgICAgICAgZm9yIHVwbG9hZCBpbiByZWZlcmVuY2U6XG4gICAgICAgICAgICBhd2FpdCB1cGxvYWQuY2xvc2UoKVxuJw0KUFJPTVBUX0NPTlRSQUNUX0NPREUgPSAnIiIiQ2xvdGhNYXRpY3MgYXBwZWFyYW5jZSBjb250cmFjdCB2Mi4gUHVyZSBQeXRob24sIGluZGVwZW5kZW50bHkgdGVzdGFibGUuIiIiXG5pbXBvcnQgcmVcblxuQ09OVFJBQ1RfVkVSU0lPTiA9IDJcbkNBVEVHT1JJRVMgPSB7InNoaXJ0IiwgInRzaGlydCIsICJ0cmFja3BhbnRzIiwgInRyb3VzZXJzIiwgImNhcmdvIiwgImhvb2RpZSIsICJqYWNrZXQiLCAiZHJlc3MiLCAic2hvcnRzIn1cblNIQVBFX1JVTEVTID0ge1wndHJvdXNlcnNcJzogXCdMb3dlciBnYXJtZW50IG9ubHksIHdhaXN0YmFuZCB0byBib3RoIGhlbXMuIFByZXNlcnZlIHRoZSBleGFjdCByaXNlLCBjZW50ZXJlZCBjcm90Y2ggc2VhbSwgZmx5LCBpbnNlYW1zLCB0d28gc2VwYXJhdGUgbGVnIHR1YmVzLCBsZWcgd2lkdGggYW5kIGJvdGggaGVtIG9wZW5pbmdzOyBuZXZlciBhZGQgYSB0b3JzbyBvciB0dXJuIHRyb3VzZXJzIGludG8gYSBqdW1wc3VpdC5cJywgXCd0cmFja3BhbnRzXCc6IFwnTG93ZXIgZ2FybWVudCBvbmx5LCB3YWlzdGJhbmQgdG8gYm90aCBoZW1zLiBQcmVzZXJ2ZSB0aGUgZXhhY3QgZWxhc3RpYyB3YWlzdCwgZHJhd2NvcmQsIHJpc2UsIGNyb3RjaCwgdHdvIHNlcGFyYXRlIGxlZ3MsIHBvY2tldCBsYXlvdXQsIGxlZyBzaWxob3VldHRlIGFuZCBvcGVuIG9yIGN1ZmZlZCBoZW1zOyBuZXZlciBhZGQgYW4gdXBwZXIgZ2FybWVudC5cJywgXCdjYXJnb1wnOiBcJ0xvd2VyIGdhcm1lbnQgb25seSwgd2Fpc3RiYW5kIHRvIGJvdGggaGVtcy4gUHJlc2VydmUgcmlzZSwgZmx5LCBjcm90Y2gsIHR3byBzZXBhcmF0ZSBsZWdzIGFuZCBldmVyeSB2aXNpYmxlIGNhcmdvL2hpcC9yZWFyIHBvY2tldCB3aXRoIGl0cyBwbGFjZW1lbnQgYW5kIGZsYXA7IG5ldmVyIGFkZCBhIHRvcnNvLlwnLCBcJ3Nob3J0c1wnOiBcJ0xvd2VyIGdhcm1lbnQgb25seSwgd2Fpc3RiYW5kIHRvIGJvdGggc2hvcnQgaGVtcy4gUHJlc2VydmUgcmlzZSwgZmx5IG9yIGRyYXdjb3JkLCBjZW50ZXJlZCBjcm90Y2gsIHR3byBzZXBhcmF0ZSBsZWcgb3BlbmluZ3MsIHBvY2tldCBsYXlvdXQgYW5kIGV4YWN0IGluc2VhbSBsZW5ndGg7IG5ldmVyIGxlbmd0aGVuIGludG8gdHJvdXNlcnMgb3IgYWRkIGEgdG9yc28uXCcsIFwndG9wXCc6IFwnUHJlc2VydmUgdGhlIGV4YWN0IG9ic2VydmVkIHRvcCBuZWNrbGluZSwgYXJtaG9sZXMsIHN0cmFwcywgc2xlZXZlcyBhbmQgaGVtOyBkbyBub3QgYWRkIHNoaXJ0IGNvbGxhcnMgb3IgcGxhY2tldHMuXCcsIFwna25pdHdlYXJcJzogXCdQcmVzZXJ2ZSB0aGUga25pdCBwYXR0ZXJuLCByaWJiaW5nLCBuZWNrbGluZSwgc2xlZXZlIG9yIHNsZWV2ZWxlc3MgY29uc3RydWN0aW9uIGFuZCBoZW0uXCcsIFwncm9iZVwnOiBcJ1ByZXNlcnZlIHRoZSB2aXNpYmxlIGxvbmcgZmxvd2luZyBzaWxob3VldHRlLCB3cmFwIG9yIGZyb250IG9wZW5pbmcsIGJlbHQsIHBhbmVscyBhbmQgY292ZXJhZ2UuXCcsIFwnZHJhcGVkXCc6IFwnUHJlc2VydmUgdGhlIHBob3RvZ3JhcGhlZCB3cmFwcGVkIGZhYnJpYywgZm9sZHMsIGJvcmRlcnMgYW5kIGNvdmVyYWdlOyBkbyBub3Qgc3RpdGNoIGl0IGludG8gdHJvdXNlcnMgb3IgaW52ZW50IGhpZGRlbiBkcmFwZS5cJywgXCdjbG90aGluZ19zZXRcJzogXCdQcmVzZXJ2ZSBleGFjdGx5IHRoZSB2aXNpYmxlIHNlcGFyYXRlIGdhcm1lbnQgcGllY2VzLCBsZW5ndGhzIGFuZCBsYXllcmluZzsgbmV2ZXIgZnVzZSBwaWVjZXMgb3IgaW52ZW50IG1pc3NpbmcgZ2FybWVudHMuXCcsIFwnc2xlZXB3ZWFyXCc6IFwnUHJlc2VydmUgZXhhY3RseSB0aGUgcGhvdG9ncmFwaGVkIG5pZ2h0d2VhciBwaWVjZXMsIHN0cmFwcywgY2xvc3VyZXMsIGNvdmVyYWdlIGFuZCBsZW5ndGhzLlwnLCBcJ3NraXJ0XCc6IFwnTG93ZXIgZ2FybWVudCBvbmx5LiBQcmVzZXJ2ZSBza2lydCBmbGFyZSwgcGxlYXRzLCBsYXllcnMgYW5kIGhlbTsgbmV2ZXIgc3BsaXQgaW50byB0cm91c2VyIGxlZ3MuXCcsIFwnbGVnZ2luZ3NcJzogXCdMb3dlciBnYXJtZW50IG9ubHksIHdhaXN0YmFuZCB0byBib3RoIGhlbXMuIFByZXNlcnZlIGNsb3NlLWZpdHRpbmcgc3RyZXRjaCBjb25zdHJ1Y3Rpb24uXCcsIFwnc2FyZWVcJzogXCdQcmVzZXJ2ZSB0aGUgdmlzaWJsZSBzYXJlZSBkcmFwZSwgcGxlYXRzLCBwYWxsdSBhbmQgYm9yZGVyOyBkbyBub3QgdHVybiBkcmFwZWQgY2xvdGggaW50byBhIHN0aXRjaGVkIGRyZXNzIG9yIGludmVudCBoaWRkZW4gcGllY2VzLlwnLCBcJ2xlaGVuZ2FcJzogXCdQcmVzZXJ2ZSB0aGUgdmlzaWJsZSBmbGFyZWQgc2tpcnQsIGxheWVycywgYm9yZGVyIGFuZCBhbnkgcGhvdG9ncmFwaGVkIHNldCBwaWVjZXM7IGRvIG5vdCBpbnZlbnQgbWlzc2luZyBwaWVjZXMuXCcsIFwna3VydGFcJzogXCdQcmVzZXJ2ZSB0dW5pYyBsZW5ndGgsIHNpZGUgc2xpdHMsIG5lY2tsaW5lIGFuZCBlbWJyb2lkZXJ5OyBuZXZlciBzaG9ydGVuIHRvIGEgd2VzdGVybiBzaGlydC5cJywgXCdzaGVyd2FuaVwnOiBcJ1ByZXNlcnZlIGxvbmcgY29hdCBwYW5lbHMsIGNvbGxhciwgY2xvc3VyZXMgYW5kIGVtYnJvaWRlcnk7IGRvIG5vdCBzaG9ydGVuIG9yIGFkZCB1bnNlZW4gdHJvdXNlcnMuXCcsIFwndHJhZGl0aW9uYWxfc2V0XCc6IFwnUHJlc2VydmUgZXhhY3RseSB0aGUgcGhvdG9ncmFwaGVkIHNldCBwaWVjZXMsIHRoZWlyIHNlcGFyYXRlIGxheWVycywgZHJhcGUgYW5kIGJvcmRlcnM7IG5ldmVyIGZ1c2Ugb3IgYWRkIHBpZWNlcy5cJywgXCdqdW1wc3VpdFwnOiBcJ0tlZXAgdGhlIGNvbnRpbnVvdXMgb25lLXBpZWNlIGJvZGljZSBhbmQgZGl2aWRlZCBsZWdzLCB3YWlzdGJhbmQgYW5kIGNsb3N1cmVzLlwnLCBcJ3JvbXBlclwnOiBcJ0tlZXAgdGhlIGNvbnRpbnVvdXMgb25lLXBpZWNlIGJvZGljZSBhbmQgc2hvcnQgZGl2aWRlZCBsZWdzOyBwcmVzZXJ2ZSBpbnNlYW0gbGVuZ3RoLlwnLCBcJ2Jsb3VzZVwnOiBcJ1ByZXNlcnZlIHRoZSBvYnNlcnZlZCBibG91c2UgY3V0LCBuZWNrbGluZSwgc2xlZXZlcywgdGllcyBhbmQgaGVtOyBuZXZlciBhZGQgYSBzdGFuZGFyZCBzaGlydCBwbGFja2V0LlwnLCBcJ2NhcmRpZ2FuXCc6IFwnUHJlc2VydmUga25pdCB0ZXh0dXJlLCBvcGVuaW5nLCBjbG9zdXJlcywgbmVja2xpbmUgYW5kIGxlbmd0aC5cJywgXCdzd2ltd2VhclwnOiBcJ1ByZXNlcnZlIHRoZSBleGFjdCB2aXNpYmxlIG9uZS1waWVjZSBvciBzZXBhcmF0ZS1waWVjZSBjb25zdHJ1Y3Rpb24sIHN0cmFwcyBhbmQgY292ZXJhZ2UuXCcsIFwnaW5uZXJ3ZWFyXCc6IFwnUHJlc2VydmUgdGhlIHBob3RvZ3JhcGhlZCBnYXJtZW50IHBpZWNlcywgc3RyYXBzLCBjdXBzLCBzZWFtcywgZWxhc3RpYyBhbmQgY292ZXJhZ2UuXCcsIFwnc2NhcmZcJzogXCdQcmVzZXJ2ZSBkcmFwZWQgb3IgZm9sZGVkIGZhYnJpYywgbGVuZ3RoLCBib3JkZXJzIGFuZCBmcmluZ2U7IGRvIG5vdCBhZGQgYSB0b3JzbyBnYXJtZW50LlwnfVxuQ0FURUdPUklFUy51cGRhdGUoU0hBUEVfUlVMRVMpXG5MT1dFUl9DQVRFR09SSUVTID0geyJ0cm91c2VycyIsICJ0cmFja3BhbnRzIiwgImNhcmdvIiwgInNob3J0cyIsICJza2lydCIsICJsZWdnaW5ncyJ9XG5BTElBU0VTID0geyJ0LXNoaXJ0IjoidHNoaXJ0IiwgInRfc2hpcnQiOiJ0c2hpcnQiLCAidGVlIjoidHNoaXJ0IiwgImplYW5zIjoidHJvdXNlcnMiLCAiZGVuaW0iOiJ0cm91c2VycyIsICJwYW50cyI6InRyb3VzZXJzIiwgImNoaW5vcyI6InRyb3VzZXJzIiwgImpvZ2dlcnMiOiJ0cmFja3BhbnRzIiwgInN3ZWF0cGFudHMiOiJ0cmFja3BhbnRzIiwgImJsYXplciI6ImphY2tldCIsICJjb2F0IjoiamFja2V0IiwgInBvbG8iOiJzaGlydCIsICJzd2VhdHNoaXJ0IjoidHNoaXJ0In1cbkZJRUxEUyA9IFtcbiAgICAoImNvbG9yQW5kRmluaXNoIiwgIlBob3RvZ3JhcGhlZCBjb2xvcnMiLCA0MDAsIDcwKSxcbiAgICAoInN1cmZhY2VUZXh0dXJlQW5kV2VhdmUiLCAiRmFicmljIHRleHR1cmUiLCAzMDAsIDQ4KSxcbiAgICAoIndhaXN0YmFuZEFuZFJpc2UiLCAiV2Fpc3RiYW5kIGFuZCByaXNlIiwgMjAwLCAyOCksXG4gICAgKCJmbHlBbmRDbG9zdXJlIiwgIkZseSBhbmQgY2xvc3VyZSIsIDIwMCwgMjQpLFxuICAgICgiY3JvdGNoQW5kSW5zZWFtIiwgIkNyb3RjaCBhbmQgaW5zZWFtIiwgMjIwLCAzMCksXG4gICAgKCJsZWdTaWxob3VldHRlIiwgIkxlZyBzaWxob3VldHRlIiwgMjAwLCAyOCksXG4gICAgKCJoZW1BbmRDdWZmcyIsICJCb3RoIGhlbXMgb3IgY3VmZnMiLCAxODAsIDI0KSxcbiAgICAoInBvY2tldExheW91dCIsICJQb2NrZXQgbGF5b3V0IiwgMjIwLCAyOCksXG4gICAgKCJleHRlcm5hbENvbXBhcnRtZW50cyIsICJQb2NrZXRzIiwgMjQwLCAzNiksXG4gICAgKCJoYXJkd2FyZUFuZENsb3N1cmVzIiwgIkZhc3RlbmVycyIsIDIyMCwgMzYpLFxuICAgICgibmVja2xpbmVPcldhaXN0YmFuZCIsICJOZWNrbGluZSBvciB3YWlzdGJhbmQiLCAyMDAsIDMyKSxcbiAgICAoImdhcm1lbnRMZW5ndGhBbmRIZW0iLCAiTGVuZ3RoIGFuZCBoZW0iLCAyMDAsIDMyKSxcbiAgICAoImdyYXBoaWNzT3JUZXh0IiwgIkdyYXBoaWNzIGFuZCBsZXR0ZXJpbmciLCAzMDAsIDQ4KSxcbiAgICAoImZpdCIsICJPYnNlcnZlZCBmaXQiLCA4MCwgMTYpLFxuICAgICgic2xlZXZlVHlwZSIsICJTbGVldmVzIiwgODAsIDE2KSxcbl1cblxuZGVmIG5vcm1hbGl6ZV9jYXRlZ29yeSh2YWx1ZSk6XG4gICAgcmF3ID0gcmUuc3ViKHIiXFxzKyIsICJfIiwgc3RyKHZhbHVlIG9yICIiKS5zdHJpcCgpLmxvd2VyKCkpXG4gICAgY2F0ZWdvcnkgPSBBTElBU0VTLmdldChyYXcsIHJhdylcbiAgICBpZiBjYXRlZ29yeSBub3QgaW4gQ0FURUdPUklFUzpcbiAgICAgICAgcmFpc2UgVmFsdWVFcnJvcigiVW5zdXBwb3J0ZWQgZ2FybWVudCBjYXRlZ29yeTsgbm8gZ2VuZXJpYyBzaGlydCBmYWxsYmFjayIpXG4gICAgcmV0dXJuIGNhdGVnb3J5XG5cbmRlZiBjYXRlZ29yeV9kaW1lbnNpb25zKGNhdGVnb3J5LCBzaXplLCBxdWFsaXR5KTpcbiAgICAiIiJLZWVwIHRoZSBwcm92ZW4gcG9ydHJhaXQgcHJvZmlsZSBmb3IgdG9wczsgZnJhbWUgbG93ZXIgZ2FybWVudHMgYnkgc291cmNlIHNoYXBlLiIiIlxuICAgIGNhdGVnb3J5ID0gbm9ybWFsaXplX2NhdGVnb3J5KGNhdGVnb3J5KVxuICAgIGlmIHF1YWxpdHkgbm90IGluICgiaGlnaCIsICJwb3J0cmFpdCIsICJzdGFuZGFyZCIpIG9yIGNhdGVnb3J5IG5vdCBpbiBMT1dFUl9DQVRFR09SSUVTOlxuICAgICAgICByZXR1cm4gKDc2OCwgMTAyNCkgaWYgcXVhbGl0eSBpbiAoImhpZ2giLCAicG9ydHJhaXQiLCAic3RhbmRhcmQiKSBlbHNlICgoMTAyNCwgNzY4KSBpZiBxdWFsaXR5ID09ICJ3aWRlIiBlbHNlICg1NzYsIDc2OCkpXG4gICAgc291cmNlX3dpZHRoLCBzb3VyY2VfaGVpZ2h0ID0gc2l6ZVxuICAgIHJhdGlvID0gc291cmNlX3dpZHRoIC8gbWF4KDEsIHNvdXJjZV9oZWlnaHQpXG4gICAgaWYgY2F0ZWdvcnkgPT0gInNob3J0cyI6XG4gICAgICAgIHJhdGlvID0gbWluKDEuMTUsIG1heCguNzgsIHJhdGlvKSlcbiAgICAgICAgaGVpZ2h0ID0gODk2XG4gICAgZWxzZTpcbiAgICAgICAgcmF0aW8gPSBtaW4oLjgyLCBtYXgoLjYwLCByYXRpbykpXG4gICAgICAgIGhlaWdodCA9IDEwMjRcbiAgICB3aWR0aCA9IG1heCgxNiwgcm91bmQoKGhlaWdodCAqIHJhdGlvKSAvIDE2KSAqIDE2KVxuICAgIHJldHVybiB3aWR0aCwgaGVpZ2h0XG5cbmRlZiBub3JtYWxpemVfbWFuaWZlc3QoY2F0ZWdvcnksIG1hbmlmZXN0KTpcbiAgICBjYXRlZ29yeSA9IG5vcm1hbGl6ZV9jYXRlZ29yeShjYXRlZ29yeSlcbiAgICBpZiBub3QgaXNpbnN0YW5jZShtYW5pZmVzdCwgZGljdCkgb3Igbm9ybWFsaXplX2NhdGVnb3J5KG1hbmlmZXN0LmdldCgiY2F0ZWdvcnkiKSkgIT0gY2F0ZWdvcnk6XG4gICAgICAgIHJhaXNlIFZhbHVlRXJyb3IoIk1hbmlmZXN0IGNhdGVnb3J5IG11c3QgbWF0Y2ggdGhlIHJlcXVlc3RlZCBnYXJtZW50IilcbiAgICByZXN1bHQgPSB7ImNhdGVnb3J5IjogY2F0ZWdvcnl9XG4gICAgZm9yIGtleSwgXywgbGltaXQsIF8gaW4gRklFTERTOlxuICAgICAgICB2YWx1ZSA9IG1hbmlmZXN0LmdldChrZXksICIiKVxuICAgICAgICBpZiBub3QgaXNpbnN0YW5jZSh2YWx1ZSwgc3RyKTpcbiAgICAgICAgICAgIHJhaXNlIFZhbHVlRXJyb3IoIk1hbmlmZXN0IGZpZWxkcyBtdXN0IGJlIHRleHQiKVxuICAgICAgICByZXN1bHRba2V5XSA9IHJlLnN1YihyIls8PlxceDAwLVxceDFmXSIsICIgIiwgdmFsdWUpLnN0cmlwKClbOmxpbWl0XVxuICAgIGlmIG5vdCByZXN1bHRbImNvbG9yQW5kRmluaXNoIl0gb3Igbm90IHJlc3VsdFsic3VyZmFjZVRleHR1cmVBbmRXZWF2ZSJdOlxuICAgICAgICByYWlzZSBWYWx1ZUVycm9yKCJPYnNlcnZlZCBjb2xvciBhbmQgZmFicmljIHRleHR1cmUgYXJlIHJlcXVpcmVkIilcbiAgICBpZiBjYXRlZ29yeSBpbiBMT1dFUl9DQVRFR09SSUVTOlxuICAgICAgICByZXN1bHRbInNsZWV2ZVR5cGUiXSA9ICIiXG4gICAgZWxzZTpcbiAgICAgICAgZm9yIGtleSBpbiAoIndhaXN0YmFuZEFuZFJpc2UiLCAiZmx5QW5kQ2xvc3VyZSIsICJjcm90Y2hBbmRJbnNlYW0iLCAibGVnU2lsaG91ZXR0ZSIsICJoZW1BbmRDdWZmcyIsICJwb2NrZXRMYXlvdXQiKTpcbiAgICAgICAgICAgIHJlc3VsdFtrZXldID0gIiJcbiAgICBwYWxldHRlID0gbWFuaWZlc3QuZ2V0KFwncGFsZXR0ZVwnLCBbXSlcbiAgICBpZiBub3QgaXNpbnN0YW5jZShwYWxldHRlLCBsaXN0KSBvciBsZW4ocGFsZXR0ZSkgPiAxMjpcbiAgICAgICAgcmFpc2UgVmFsdWVFcnJvcihcJ0ludmFsaWQgZ2FybWVudCBwYWxldHRlXCcpXG4gICAgcmVzdWx0W1wncGFsZXR0ZVwnXSA9IFtdXG4gICAgZm9yIGNvbG9yIGluIHBhbGV0dGU6XG4gICAgICAgIGlmIG5vdCBpc2luc3RhbmNlKGNvbG9yLCBkaWN0KSBvciBjb2xvci5nZXQoXCdyb2xlXCcpIG5vdCBpbiAoXCdiYXNlXCcsXCdzZWNvbmRhcnlcJyxcJ3ByaW50XCcsXCd0cmltXCcsXCdoYXJkd2FyZVwnLFwnd2FzaFwnLFwnZW1icm9pZGVyeVwnLFwncGFuZWxcJykgb3Igbm90IHJlLmZ1bGxtYXRjaChyXCcjW2EtZkEtRjAtOV17Nn1cJywgc3RyKGNvbG9yLmdldChcJ2hleFwnLCBcJ1wnKSkpOlxuICAgICAgICAgICAgcmFpc2UgVmFsdWVFcnJvcihcJ0ludmFsaWQgY29sb3Igc2FtcGxlXCcpXG4gICAgICAgIHJlZ2lvbiA9IHJlLnN1YihyXCdbXmEtekEtWjAtOSAsLy1dXCcsIFwnIFwnLCBzdHIoY29sb3IuZ2V0KFwncmVnaW9uXCcsIFwnXCcpKSkuc3RyaXAoKVs6NDhdXG4gICAgICAgIHJlc3VsdFtcJ3BhbGV0dGVcJ10uYXBwZW5kKHtcJ3JvbGVcJzpjb2xvcltcJ3JvbGVcJ10sIFwnaGV4XCc6Y29sb3JbXCdoZXhcJ10udXBwZXIoKSwgXCdyZWdpb25cJzpyZWdpb259KVxuICAgIHJldHVybiByZXN1bHRcblxuZGVmIGludmFyaWFudF9wcm9tcHQoY2F0ZWdvcnkpOlxuICAgIGNhdGVnb3J5ID0gbm9ybWFsaXplX2NhdGVnb3J5KGNhdGVnb3J5KVxuICAgIGxvd2VyID0gY2F0ZWdvcnkgaW4gTE9XRVJfQ0FURUdPUklFU1xuICAgIHNoYXBlID0gU0hBUEVfUlVMRVMuZ2V0KGNhdGVnb3J5KSBvciAoIkxvd2VyIGdhcm1lbnQgb25seSwgd2Fpc3RiYW5kIHRvIGxlZyBoZW1zLiBObyB1cHBlciBnYXJtZW50IG9yIGp1bXBzdWl0LiAiIGlmIGxvd2VyIGVsc2UgIktlZXAgdGhlIHJlZmVyZW5jZSBnYXJtZW50XCdzIG9ic2VydmVkIHNsZWV2ZXMsIG5lY2tsaW5lIGFuZCBoZW0uICIpXG4gICAgdm9sdW1lID0gKCJ2aXNpYmxlIGlubmVyIHdhaXN0YmFuZCBkZXB0aCwgbmF0dXJhbCBzZWF0IGFuZCBjcm90Y2ggdm9sdW1lLCB0d28gc2VwYXJhdGUgbGVnIHR1YmVzLCBzaWRld2FsbCB0aGlja25lc3MsIGZvbGQgZ3JhZGllbnRzLCBjb250YWN0IHNoYWRvd3MgYW5kIHN1YnRsZSBwcm9kdWN0LWNhbWVyYSBwZXJzcGVjdGl2ZSIgaWYgbG93ZXIgZWxzZSAiaW5uZXIgZWRnZSBkZXB0aCBhdCB0aGUgY29sbGFyIG9yIHdhaXN0YmFuZCwgbmF0dXJhbCBzaG91bGRlciBvciBzZWF0IHNoYXBlLCBzaWRld2FsbCB0aGlja25lc3MsIGZvbGQgZ3JhZGllbnRzLCBjb250YWN0IHNoYWRvd3MgYW5kIHN1YnRsZSBwcm9kdWN0LWNhbWVyYSBwZXJzcGVjdGl2ZSIpXG4gICAgamFja2V0ID0gKCJKYWNrZXQgZmlkZWxpdHkgaXMgc3RyaWN0OiBwcmVzZXJ2ZSB0aGUgZXhhY3QgY29sbGFyIGFuZCBmcm9udCBjbG9zdXJlLCBwb2NrZXQgY291bnQgYW5kIHBsYWNlbWVudCwgc2xlZXZlIG1hcmtzIGFuZCB0cmltLiBLZWVwIGV2ZXJ5IGxlZnQvcmlnaHQgZGV0YWlsIG9uIHRoZSBzYW1lIHZpZXdlciBzaWRlOyBuZXZlciBtaXJyb3IgdGhlIHJlZmVyZW5jZS4gRG8gbm90IGFkZCBwb2NrZXRzLCBzbmFwcywgcGFuZWxzIG9yIGxvZ29zIHRoYXQgYXJlIG5vdCB2aXNpYmx5IHByZXNlbnQuIFRoZSBjb2xsYXIgbXVzdCBiZSBhIHRydWx5IGVtcHR5IGdhcm1lbnQgb3BlbmluZyB3aXRoIGJhY2tncm91bmQgb3IgbmF0dXJhbCBkYXJrIGlubmVyLWZhYnJpYyBkZXB0aCB2aXNpYmxlIHRocm91Z2ggaXQ7IG5ldmVyIHBsYWNlIGEgd2hpdGUsIGdyZXkgb3Igc2tpbi10b25lZCBuZWNrLCBjaGVzdCBvciBtYW5uZXF1aW4gc3VyZmFjZSBpbnNpZGUuICIgaWYgY2F0ZWdvcnkgPT0gImphY2tldCIgZWxzZSAiIilcbiAgICByZXR1cm4gKFxuICAgICAgICBmIkNyZWF0ZSBhIGNsZWFuIHN0dWRpbyBnaG9zdC1tYW5uZXF1aW4gcHJvZHVjdCByZW5kZXIgb2YgdGhlIFNBTUUgc2luZ2xlIHtjYXRlZ29yeX07IG5vIHZpc2libGUgbWFubmVxdWluIG9yIGh1bWFuIGJvZHkuIFVzZSBhIGNvbXBsZXRlbHkgaW52aXNpYmxlLCBhbmF0b21pY2FsbHkgbmV1dHJhbCBnYXJtZW50IHN1cHBvcnQuICJcbiAgICAgICAgZiJLZWVwIHRoZSBzdXBwb3J0IGhpZGRlbiB3aGlsZSBnaXZpbmcgdGhlIGNsb3RoaW5nIGJlbGlldmFibGUgdGhyZWUtZGltZW5zaW9uYWwgdm9sdW1lOiB7dm9sdW1lfS4gIlxuICAgICAgICAiTmV2ZXIgbWFrZSBhIGZsYXQgZnJvbnQgY3V0b3V0LCB0ZWNobmljYWwgZHJhd2luZyBvciAyRCBpY29uLiBObyB2aXNpYmxlIG1hbm5lcXVpbiwgcGVyc29uLCBza2luLCBoZWFkLCBuZWNrIGN5bGluZGVyLCB0b3JzbywgbGltYnMsIHN0YW5kIG9yIGhhbmdlcjsgb25seSBnYXJtZW50IGFuZCB3aGl0ZSBiYWNrZ3JvdW5kIG1heSBiZSB2aXNpYmxlLiAiXG4gICAgICAgICsgamFja2V0ICsgc2hhcGUgK1xuICAgICAgICAiUmVmZXJlbmNlIGdhcm1lbnQgcGl4ZWxzIG92ZXJyaWRlIHRleHQgY29sb3IgbmFtZXMuIFByZXNlcnZlIHBob3RvZ3JhcGhlZCBodWUsIHNhdHVyYXRpb24sIGJyaWdodG5lc3MsIHdoaXRlIGJhbGFuY2UsICJcbiAgICAgICAgInRleHR1cmUsIGN1dCwgcG9ja2V0cywgZmFzdGVuZXJzIGFuZCBsZXR0ZXJpbmcuIE5vIHJlY29sb3JpbmcsIHJlZGVzaWduIG9yIGludmVudGVkIGhpZGRlbiBkZXRhaWxzLiAiXG4gICAgKVxuXG5kZWYgcGFja19wcm9tcHQoY2F0ZWdvcnksIG1hbmlmZXN0LCB0b2tlbml6ZXIsIG1heF90b2tlbnM9NDYwKTpcbiAgICAiIiJSZXNlcnZlIHNwYWNlIGZvciB0aGUgY2hhdCB0ZW1wbGF0ZTsgbmV2ZXIgc3RyaXAgb3IgdHJ1bmNhdGUgaW52YXJpYW50cy5cblxuICAgIERpc3RyaWJ1dGUgdGhlIHJlbWFpbmluZyBidWRnZXQgYWNyb3NzIGluZGl2aWR1YWwgZXZpZGVuY2UgZmllbGRzLiBTaHJpbmtcbiAgICBmaWVsZCB2YWx1ZXMgKG5vdCBhIGJsaW5kIHRhaWwgc2xpY2UpIHNvIGV2ZXJ5IG9ic2VydmVkIHByb3BlcnR5IGdldHMgc3BhY2UuXG4gICAgIiIiXG4gICAgbWFuaWZlc3QgPSBub3JtYWxpemVfbWFuaWZlc3QoY2F0ZWdvcnksIG1hbmlmZXN0KVxuICAgIGhlYWQgPSBpbnZhcmlhbnRfcHJvbXB0KGNhdGVnb3J5KVxuICAgIHBhbGV0dGUgPSBtYW5pZmVzdFtcJ3BhbGV0dGVcJ11cbiAgICBpZiBwYWxldHRlOlxuICAgICAgICBoZWFkICs9IFwnIFByZXNlcnZlIGVhY2ggc2FtcGxlZCByZWdpb24gc2VwYXJhdGVseTsgbmV2ZXIgYXZlcmFnZSBjb2xvcnMgb3IgbmV1dHJhbGl6ZSB3YXJtIHN0cmlwZXM6IFwnICsgXCc7IFwnLmpvaW4oZiJ7Y1tcJ3JvbGVcJ119IHtjW1wncmVnaW9uXCddfSB7Y1tcJ2hleFwnXX0iIGZvciBjIGluIHBhbGV0dGUpICsgXCcuIFwnXG4gICAgZW5jb2RlID0gbGFtYmRhIHRleHQ6IHRva2VuaXplci5lbmNvZGUodGV4dCwgYWRkX3NwZWNpYWxfdG9rZW5zPUZhbHNlKVxuICAgIGlmIGxlbihlbmNvZGUoaGVhZCkpID4gbWF4X3Rva2VucyAtIDgwOlxuICAgICAgICByYWlzZSBWYWx1ZUVycm9yKCJDb2xvciBldmlkZW5jZSBleGNlZWRzIG1vZGVsIGNvbnRleHQ7IHNob3J0ZW4gcmVnaW9uIGxhYmVscyBhbmQgcmV0cnkgYW5hbHlzaXMuIE5vIHBhbGV0dGUgd2FzIHNpbGVudGx5IHRydW5jYXRlZC4iKVxuICAgIHNlY3Rpb25zLCB0cnVuY2F0ZWQgPSBbXSwgW11cbiAgICBmb3Iga2V5LCBsYWJlbCwgXywgcXVvdGEgaW4gRklFTERTOlxuICAgICAgICB2YWx1ZSA9IG1hbmlmZXN0W2tleV1cbiAgICAgICAgaWYgbm90IHZhbHVlOlxuICAgICAgICAgICAgY29udGludWVcbiAgICAgICAgaWRzID0gZW5jb2RlKHZhbHVlKVxuICAgICAgICBzZWN0aW9ucy5hcHBlbmQoW2tleSwgbGFiZWwsIGlkcywgbWluKGxlbihpZHMpLCBxdW90YSldKVxuICAgICAgICBpZiBsZW4oaWRzKSA+IHF1b3RhOlxuICAgICAgICAgICAgdHJ1bmNhdGVkLmFwcGVuZChrZXkpXG4gICAgZGVmIGFzc2VtYmxlKCk6XG4gICAgICAgIHJldHVybiBoZWFkICsgIiAiLmpvaW4oZiJ7bGFiZWx9OiB7dG9rZW5pemVyLmRlY29kZShpZHNbOmNvdW50XSwgc2tpcF9zcGVjaWFsX3Rva2Vucz1UcnVlKX0uIiBmb3IgXywgbGFiZWwsIGlkcywgY291bnQgaW4gc2VjdGlvbnMpXG4gICAgd2hpbGUgbGVuKGVuY29kZShhc3NlbWJsZSgpKSkgPiBtYXhfdG9rZW5zOlxuICAgICAgICBjYW5kaWRhdGVzID0gW3MgZm9yIHMgaW4gc2VjdGlvbnMgaWYgc1szXSA+IDhdXG4gICAgICAgIGlmIG5vdCBjYW5kaWRhdGVzOlxuICAgICAgICAgICAgcmFpc2UgVmFsdWVFcnJvcigiTWFuaWZlc3QgY2Fubm90IGZpdCBzYWZlbHkgaW4gdGhlIG1vZGVsIGNvbnRleHQiKVxuICAgICAgICBzZWN0aW9uID0gbWF4KGNhbmRpZGF0ZXMsIGtleT1sYW1iZGEgczpzWzNdKVxuICAgICAgICBzZWN0aW9uWzNdIC09IDFcbiAgICAgICAgaWYgc2VjdGlvblswXSBub3QgaW4gdHJ1bmNhdGVkOlxuICAgICAgICAgICAgdHJ1bmNhdGVkLmFwcGVuZChzZWN0aW9uWzBdKVxuICAgIHByb21wdCA9IGFzc2VtYmxlKClcbiAgICByZXR1cm4gcHJvbXB0LCB7InByb21wdF90b2tlbnMiOmxlbihlbmNvZGUocHJvbXB0KSksICJ0cnVuY2F0ZWRfZmllbGRzIjp0cnVuY2F0ZWQsICJjb250cmFjdF92ZXJzaW9uIjpDT05UUkFDVF9WRVJTSU9OfVxuJw0KT1VURklUX1BBUlNFUl9DT0RFID0gJyIiIlBpeGVsLWxldmVsIHdvcm4tb3V0Zml0IGV4dHJhY3Rpb24gZm9yIHRoZSBvcHRpb25hbCAvb3V0Zml0IHJvdXRlLlxuXG5UaGlzIG1vZHVsZSBpcyBkZWxpYmVyYXRlbHkgaXNvbGF0ZWQgZnJvbSBnaG9zdF9zZXJ2ZXIucHkuICBUaGUgZXN0YWJsaXNoZWRcbi9nZW5lcmF0ZSByZW5kZXJlciBuZXZlciBpbXBvcnRzIG9yIGxvYWRzIHRoZSBwYXJzZXIgdW5sZXNzIC9vdXRmaXQgaXMgdXNlZC5cbiIiIlxuZnJvbSBfX2Z1dHVyZV9fIGltcG9ydCBhbm5vdGF0aW9uc1xuXG5pbXBvcnQgaW9cbmltcG9ydCBvc1xuaW1wb3J0IHRocmVhZGluZ1xuZnJvbSBkYXRhY2xhc3NlcyBpbXBvcnQgZGF0YWNsYXNzXG5mcm9tIHR5cGluZyBpbXBvcnQgSXRlcmFibGVcblxuaW1wb3J0IGN2MlxuaW1wb3J0IG51bXB5IGFzIG5wXG5mcm9tIFBJTCBpbXBvcnQgSW1hZ2UsIEltYWdlT3BzLCBJbWFnZUNtcywgVW5pZGVudGlmaWVkSW1hZ2VFcnJvclxuXG5NT0RFTF9JRCA9ICJtYXR0bWRqYWdhL3NlZ2Zvcm1lcl9iMl9jbG90aGVzIlxuTU9ERUxfUkVWSVNJT04gPSAiNTg0YWJjMWUxZDI2MGUyM2MwZmM2MjdjNTIxN2EwOWIyYjQ2MTA0NiJcblBBUlNFUl9WRVJTSU9OID0gIjMiXG5NQVhfUElYRUxTID0gMjRfMDAwXzAwMFxuU1JHQl9QUk9GSUxFID0gSW1hZ2VDbXMuSW1hZ2VDbXNQcm9maWxlKEltYWdlQ21zLmNyZWF0ZVByb2ZpbGUoInNSR0IiKSlcblNSR0JfSUNDID0gU1JHQl9QUk9GSUxFLnRvYnl0ZXMoKVxuXG4jIE1vZGVsIGxhYmVsczogMCBiYWNrZ3JvdW5kLCAxIGhhdCwgMiBoYWlyLCAzIHN1bmdsYXNzZXMsIDQgdXBwZXItY2xvdGhlcyxcbiMgNSBza2lydCwgNiBwYW50cywgNyBkcmVzcywgOCBiZWx0LCA5LzEwIHNob2VzLCAxMSBmYWNlLCAxMi8xMyBsZWdzLFxuIyAxNC8xNSBhcm1zLCAxNiBiYWcsIDE3IHNjYXJmLlxuQk9EWV9MQUJFTFMgPSBmcm96ZW5zZXQoKDIsIDExLCAxMiwgMTMsIDE0LCAxNSkpXG5HQVJNRU5UX0xBQkVMUyA9IGZyb3plbnNldCgoNCwgNSwgNiwgNykpXG5GT09UV0VBUl9MQUJFTFMgPSBmcm96ZW5zZXQoKDksIDEwKSlcblxuX01PREVMID0gTm9uZVxuX1BST0NFU1NPUiA9IE5vbmVcbl9MT0FEX0xPQ0sgPSB0aHJlYWRpbmcuTG9jaygpXG5cblxuY2xhc3MgT3V0Zml0UGFyc2VyRXJyb3IoVmFsdWVFcnJvcik6XG4gICAgcGFzc1xuXG5cbkBkYXRhY2xhc3NcbmNsYXNzIFBhcnNlZEN1dG91dDpcbiAgICBpbmRleDogaW50XG4gICAgcG5nOiBieXRlc1xuICAgIHdpZHRoOiBpbnRcbiAgICBoZWlnaHQ6IGludFxuICAgIHBpeGVsX2NvdW50OiBpbnRcbiAgICBsYWJlbHM6IHR1cGxlW2ludCwgLi4uXVxuICAgIHByZXNlcnZlZF9vY2NsdXNpb25fcGl4ZWxzOiBpbnQgPSAwXG4gICAgcmVwYWlyZWRfb2NjbHVzaW9uX3BpeGVsczogaW50ID0gMFxuICAgIHRyaW1tZWRfZm9vdHdlYXJfcGl4ZWxzOiBpbnQgPSAwXG5cblxuZGVmIF9sb2FkX3BhcnNlcigpOlxuICAgIGdsb2JhbCBfTU9ERUwsIF9QUk9DRVNTT1JcbiAgICBpZiBfTU9ERUwgaXMgbm90IE5vbmU6XG4gICAgICAgIHJldHVybiBfUFJPQ0VTU09SLCBfTU9ERUxcbiAgICB3aXRoIF9MT0FEX0xPQ0s6XG4gICAgICAgIGlmIF9NT0RFTCBpcyBOb25lOlxuICAgICAgICAgICAgaW1wb3J0IHRvcmNoXG4gICAgICAgICAgICBmcm9tIHRyYW5zZm9ybWVycyBpbXBvcnQgU2VnZm9ybWVyRm9yU2VtYW50aWNTZWdtZW50YXRpb24sIFNlZ2Zvcm1lckltYWdlUHJvY2Vzc29yXG5cbiAgICAgICAgICAgIGRldmljZSA9IG9zLmVudmlyb24uZ2V0KCJDTE9USE1BVElDU19QQVJTRVJfREVWSUNFIiwgImNwdSIpLnN0cmlwKCkubG93ZXIoKVxuICAgICAgICAgICAgaWYgZGV2aWNlICE9ICJjcHUiOlxuICAgICAgICAgICAgICAgIHJhaXNlIFJ1bnRpbWVFcnJvcigiVGhlIG91dGZpdCBwYXJzZXIgaXMgcGlubmVkIHRvIENQVSBzbyBGTFVYIEdQVSBiZWhhdmlvciByZW1haW5zIHVuY2hhbmdlZCIpXG4gICAgICAgICAgICBfUFJPQ0VTU09SID0gU2VnZm9ybWVySW1hZ2VQcm9jZXNzb3IuZnJvbV9wcmV0cmFpbmVkKFxuICAgICAgICAgICAgICAgIE1PREVMX0lELCByZXZpc2lvbj1NT0RFTF9SRVZJU0lPTiwgdHJ1c3RfcmVtb3RlX2NvZGU9RmFsc2VcbiAgICAgICAgICAgIClcbiAgICAgICAgICAgIF9NT0RFTCA9IFNlZ2Zvcm1lckZvclNlbWFudGljU2VnbWVudGF0aW9uLmZyb21fcHJldHJhaW5lZChcbiAgICAgICAgICAgICAgICBNT0RFTF9JRCwgcmV2aXNpb249TU9ERUxfUkVWSVNJT04sIHRydXN0X3JlbW90ZV9jb2RlPUZhbHNlXG4gICAgICAgICAgICApLnRvKCJjcHUiKS5ldmFsKClcbiAgICByZXR1cm4gX1BST0NFU1NPUiwgX01PREVMXG5cblxuZGVmIGRlY29kZV9waG90byhkYXRhOiBieXRlcykgLT4gSW1hZ2UuSW1hZ2U6XG4gICAgaWYgbm90IGRhdGE6XG4gICAgICAgIHJhaXNlIE91dGZpdFBhcnNlckVycm9yKCJUaGUgb3V0Zml0IHBob3RvIGlzIGVtcHR5IilcbiAgICB0cnk6XG4gICAgICAgIHdpdGggSW1hZ2Uub3Blbihpby5CeXRlc0lPKGRhdGEpKSBhcyBvcGVuZWQ6XG4gICAgICAgICAgICBpZiBnZXRhdHRyKG9wZW5lZCwgIm5fZnJhbWVzIiwgMSkgIT0gMTpcbiAgICAgICAgICAgICAgICByYWlzZSBPdXRmaXRQYXJzZXJFcnJvcigiVXBsb2FkIG9uZSBzdGlsbCBvdXRmaXQgcGhvdG8iKVxuICAgICAgICAgICAgaWYgb3BlbmVkLndpZHRoICogb3BlbmVkLmhlaWdodCA+IE1BWF9QSVhFTFM6XG4gICAgICAgICAgICAgICAgcmFpc2UgT3V0Zml0UGFyc2VyRXJyb3IoIlRoZSBvdXRmaXQgcGhvdG8gZXhjZWVkcyAyNE0gcGl4ZWxzIilcbiAgICAgICAgICAgIG9wZW5lZC5sb2FkKClcbiAgICAgICAgICAgIGljYyA9IG9wZW5lZC5pbmZvLmdldCgiaWNjX3Byb2ZpbGUiKVxuICAgICAgICAgICAgb3JpZW50ZWQgPSBJbWFnZU9wcy5leGlmX3RyYW5zcG9zZShvcGVuZWQpXG4gICAgICAgICAgICBpZiBpY2M6XG4gICAgICAgICAgICAgICAgdHJ5OlxuICAgICAgICAgICAgICAgICAgICBzb3VyY2VfcHJvZmlsZSA9IEltYWdlQ21zLkltYWdlQ21zUHJvZmlsZShpby5CeXRlc0lPKGljYykpXG4gICAgICAgICAgICAgICAgICAgIGJhc2UgPSBvcmllbnRlZCBpZiBvcmllbnRlZC5tb2RlIGluICgiUkdCIiwgIkNNWUsiLCAiTCIsICJMQUIiKSBlbHNlIG9yaWVudGVkLmNvbnZlcnQoIlJHQiIpXG4gICAgICAgICAgICAgICAgICAgIHJldHVybiBJbWFnZUNtcy5wcm9maWxlVG9Qcm9maWxlKGJhc2UsIHNvdXJjZV9wcm9maWxlLCBTUkdCX1BST0ZJTEUsIG91dHB1dE1vZGU9IlJHQiIpXG4gICAgICAgICAgICAgICAgZXhjZXB0IChJbWFnZUNtcy5QeUNNU0Vycm9yLCBPU0Vycm9yLCBWYWx1ZUVycm9yKSBhcyBleGM6XG4gICAgICAgICAgICAgICAgICAgIHJhaXNlIE91dGZpdFBhcnNlckVycm9yKCJFbWJlZGRlZCBjb2xvciBwcm9maWxlIGNhbm5vdCBiZSBjb252ZXJ0ZWQiKSBmcm9tIGV4Y1xuICAgICAgICAgICAgcmV0dXJuIG9yaWVudGVkLmNvbnZlcnQoIlJHQiIpXG4gICAgZXhjZXB0IE91dGZpdFBhcnNlckVycm9yOlxuICAgICAgICByYWlzZVxuICAgIGV4Y2VwdCAoVW5pZGVudGlmaWVkSW1hZ2VFcnJvciwgT1NFcnJvciwgVmFsdWVFcnJvcikgYXMgZXhjOlxuICAgICAgICByYWlzZSBPdXRmaXRQYXJzZXJFcnJvcigiVW5zdXBwb3J0ZWQgb3V0Zml0IHBob3RvIikgZnJvbSBleGNcblxuXG5kZWYgcHJlZGljdF9sYWJlbHMocGhvdG86IEltYWdlLkltYWdlKSAtPiBucC5uZGFycmF5OlxuICAgIGltcG9ydCB0b3JjaFxuXG4gICAgcHJvY2Vzc29yLCBtb2RlbCA9IF9sb2FkX3BhcnNlcigpXG4gICAgaW5wdXRzID0gcHJvY2Vzc29yKGltYWdlcz1waG90bywgcmV0dXJuX3RlbnNvcnM9InB0IilcbiAgICB3aXRoIHRvcmNoLmluZmVyZW5jZV9tb2RlKCk6XG4gICAgICAgIG91dHB1dHMgPSBtb2RlbCgqKmlucHV0cylcbiAgICB0YXJnZXQgPSBbKHBob3RvLmhlaWdodCwgcGhvdG8ud2lkdGgpXVxuICAgICMgVHJhbnNmb3JtZXJzIDUueCBleHBlY3RzIFNlbWFudGljU2VnbWVudGVyT3V0cHV0IGhlcmUgYW5kIHJlYWRzXG4gICAgIyBvdXRwdXRzLmxvZ2l0cyBpbnRlcm5hbGx5LiBQYXNzaW5nIHRoZSB0ZW5zb3IgaXRzZWxmIHJhaXNlcyBBdHRyaWJ1dGVFcnJvci5cbiAgICBsYWJlbHMgPSBwcm9jZXNzb3IucG9zdF9wcm9jZXNzX3NlbWFudGljX3NlZ21lbnRhdGlvbihvdXRwdXRzLCB0YXJnZXRfc2l6ZXM9dGFyZ2V0KVswXVxuICAgIHJldHVybiBsYWJlbHMuZGV0YWNoKCkuY3B1KCkubnVtcHkoKS5hc3R5cGUobnAudWludDgpXG5cblxuZGVmIHdvcm5fcGhvdG9fZXZpZGVuY2UobGFiZWxzOiBucC5uZGFycmF5KSAtPiBkaWN0OlxuICAgIHRvdGFsID0gbWF4KDEsIGxhYmVscy5zaXplKVxuICAgIGJvZHlfcGl4ZWxzID0gaW50KG5wLmlzaW4obGFiZWxzLCB0dXBsZShCT0RZX0xBQkVMUykpLnN1bSgpKVxuICAgIGdhcm1lbnRfcGl4ZWxzID0gaW50KG5wLmlzaW4obGFiZWxzLCB0dXBsZShHQVJNRU5UX0xBQkVMUykpLnN1bSgpKVxuICAgIGZhY2UgPSBpbnQoKGxhYmVscyA9PSAxMSkuc3VtKCkpXG4gICAgbGltYnMgPSBpbnQobnAuaXNpbihsYWJlbHMsICgxMiwgMTMsIDE0LCAxNSkpLnN1bSgpKVxuICAgICMgUmVxdWlyZSBib3RoIGNsb3RoaW5nIGFuZCB2aXNpYmxlIGh1bWFuIGV2aWRlbmNlLiBUaGlzIGtlZXBzIGZsYXQtbGF5IGFuZFxuICAgICMgaGFuZ2luZyBnYXJtZW50IHBob3RvcyBvbiB0aGUgZXN0YWJsaXNoZWQgL2dlbmVyYXRlIHBhdGguXG4gICAgd29ybiA9IGdhcm1lbnRfcGl4ZWxzIC8gdG90YWwgPj0gMC4wMDQgYW5kIGJvZHlfcGl4ZWxzID49IDY0IGFuZCAoXG4gICAgICAgIGZhY2UgPiAwIG9yIGxpbWJzID4gMFxuICAgIClcbiAgICByZXR1cm4ge1xuICAgICAgICAid29ybiI6IGJvb2wod29ybiksXG4gICAgICAgICJib2R5X2ZyYWN0aW9uIjogcm91bmQoYm9keV9waXhlbHMgLyB0b3RhbCwgNSksXG4gICAgICAgICJnYXJtZW50X2ZyYWN0aW9uIjogcm91bmQoZ2FybWVudF9waXhlbHMgLyB0b3RhbCwgNSksXG4gICAgfVxuXG5cbmRlZiBfYm94KHZhbHVlLCB3aWR0aDogaW50LCBoZWlnaHQ6IGludCkgLT4gdHVwbGVbaW50LCBpbnQsIGludCwgaW50XTpcbiAgICBpZiBub3QgaXNpbnN0YW5jZSh2YWx1ZSwgKGxpc3QsIHR1cGxlKSkgb3IgbGVuKHZhbHVlKSAhPSA0OlxuICAgICAgICByYWlzZSBPdXRmaXRQYXJzZXJFcnJvcigiRWFjaCBvdXRmaXQgaXRlbSBuZWVkcyBhIGZvdXItdmFsdWUgYm91bmRpbmcgYm94IilcbiAgICB0cnk6XG4gICAgICAgIHkxLCB4MSwgeTIsIHgyID0gW2Zsb2F0KHBhcnQpIGZvciBwYXJ0IGluIHZhbHVlXVxuICAgIGV4Y2VwdCAoVHlwZUVycm9yLCBWYWx1ZUVycm9yKSBhcyBleGM6XG4gICAgICAgIHJhaXNlIE91dGZpdFBhcnNlckVycm9yKCJJbnZhbGlkIG91dGZpdCBpdGVtIGJvdW5kaW5nIGJveCIpIGZyb20gZXhjXG4gICAgIyBUaGUgd2Vic2l0ZSBjb250cmFjdCBhbHdheXMgdXNlcyBub3JtYWxpemVkIDAuLjEwMDAgY29vcmRpbmF0ZXMuXG4gICAgaWYgbWluKHkxLCB4MSwgeTIsIHgyKSA8IDAgb3IgbWF4KHkxLCB4MSwgeTIsIHgyKSA+IDEwMDA6XG4gICAgICAgIHJhaXNlIE91dGZpdFBhcnNlckVycm9yKCJPdXRmaXQgaXRlbSBib3VuZGluZyBib3ggbXVzdCB1c2UgMC4uMTAwMCBjb29yZGluYXRlcyIpXG4gICAgeTEsIHkyID0geTEgKiBoZWlnaHQgLyAxMDAwLCB5MiAqIGhlaWdodCAvIDEwMDBcbiAgICB4MSwgeDIgPSB4MSAqIHdpZHRoIC8gMTAwMCwgeDIgKiB3aWR0aCAvIDEwMDBcbiAgICBpZiB5MiA8PSB5MSBvciB4MiA8PSB4MTpcbiAgICAgICAgcmFpc2UgT3V0Zml0UGFyc2VyRXJyb3IoIkludmFsaWQgb3V0Zml0IGl0ZW0gYm91bmRpbmcgYm94IilcbiAgICBwYWRfeCA9IG1heCgzLCBpbnQoKHgyIC0geDEpICogMC4wOCkpXG4gICAgcGFkX3kgPSBtYXgoMywgaW50KCh5MiAtIHkxKSAqIDAuMDgpKVxuICAgIHJldHVybiAoXG4gICAgICAgIG1heCgwLCBpbnQoeDEpIC0gcGFkX3gpLCBtYXgoMCwgaW50KHkxKSAtIHBhZF95KSxcbiAgICAgICAgbWluKHdpZHRoLCBpbnQobnAuY2VpbCh4MikpICsgcGFkX3gpLCBtaW4oaGVpZ2h0LCBpbnQobnAuY2VpbCh5MikpICsgcGFkX3kpLFxuICAgIClcblxuXG5kZWYgbGFiZWxzX2ZvcihraW5kOiBzdHIpIC0+IHR1cGxlW2ludCwgLi4uXTpcbiAgICBrZXkgPSBzdHIoa2luZCBvciAiIikubG93ZXIoKVxuICAgIGlmIGtleSBpbiAoInNoaXJ0IiwgInRzaGlydCIsICJob29kaWUiLCAiamFja2V0IiwgImJsb3VzZSIsICJjYXJkaWdhbiIsICJrbml0d2VhciIsICJ0b3AiLCAic2hlcndhbmkiLCAia3VydGEiKTpcbiAgICAgICAgcmV0dXJuICg0LClcbiAgICBpZiBrZXkgPT0gInNraXJ0IjpcbiAgICAgICAgcmV0dXJuICg1LClcbiAgICBpZiBrZXkgaW4gKCJ0cm91c2VycyIsICJ0cmFja3BhbnRzIiwgImNhcmdvIiwgInNob3J0cyIsICJsZWdnaW5ncyIpOlxuICAgICAgICByZXR1cm4gKDYsKVxuICAgIGlmIGtleSBpbiAoImRyZXNzIiwgImp1bXBzdWl0IiwgInJvbXBlciIsICJzYXJlZSIsICJsZWhlbmdhIiwgInRyYWRpdGlvbmFsX3NldCIsICJyb2JlIiwgImRyYXBlZCIsICJzbGVlcHdlYXIiLCAiY2xvdGhpbmdfc2V0IiwgInN3aW13ZWFyIiwgImlubmVyd2VhciIpOlxuICAgICAgICByZXR1cm4gKDcsIDQsIDUsIDYpXG4gICAgaWYga2V5ID09ICJzY2FyZiI6XG4gICAgICAgIHJldHVybiAoMTcsKVxuICAgIGlmIGtleSA9PSAiZm9vdHdlYXIiOlxuICAgICAgICByZXR1cm4gKDksIDEwKVxuICAgIHJhaXNlIE91dGZpdFBhcnNlckVycm9yKCJVbnN1cHBvcnRlZCBvdXRmaXQgaXRlbSB0eXBlIilcblxuXG5kZWYgX2NsZWFuX21hc2sobWFzazogbnAubmRhcnJheSkgLT4gbnAubmRhcnJheTpcbiAgICBiaW5hcnkgPSBtYXNrLmFzdHlwZShucC51aW50OClcbiAgICBrZXJuZWwgPSBucC5vbmVzKCgzLCAzKSwgbnAudWludDgpXG4gICAgYmluYXJ5ID0gY3YyLm1vcnBob2xvZ3lFeChiaW5hcnksIGN2Mi5NT1JQSF9DTE9TRSwga2VybmVsLCBpdGVyYXRpb25zPTEpXG4gICAgY291bnQsIGNvbXBvbmVudCwgc3RhdHMsIF8gPSBjdjIuY29ubmVjdGVkQ29tcG9uZW50c1dpdGhTdGF0cyhiaW5hcnksIDgpXG4gICAgaWYgY291bnQgPD0gMTpcbiAgICAgICAgcmV0dXJuIGJpbmFyeS5hc3R5cGUoYm9vbClcbiAgICBtaW5pbXVtID0gbWF4KDMyLCBpbnQoYmluYXJ5LnNpemUgKiAwLjAwMDEyKSlcbiAgICBrZWVwID0gbnAuemVyb3NfbGlrZShiaW5hcnkpXG4gICAgZm9yIGxhYmVsIGluIHJhbmdlKDEsIGNvdW50KTpcbiAgICAgICAgaWYgc3RhdHNbbGFiZWwsIGN2Mi5DQ19TVEFUX0FSRUFdID49IG1pbmltdW06XG4gICAgICAgICAgICBrZWVwW2NvbXBvbmVudCA9PSBsYWJlbF0gPSAxXG4gICAgcmV0dXJuIGtlZXAuYXN0eXBlKGJvb2wpXG5cblxuZGVmIF9jb252ZXhfZW52ZWxvcGUobWFzazogbnAubmRhcnJheSkgLT4gbnAubmRhcnJheTpcbiAgICAiIiJSZXR1cm4gYSBjb25zZXJ2YXRpdmUgc2lsaG91ZXR0ZSBlbnZlbG9wZSBhcm91bmQgb2JzZXJ2ZWQgZ2FybWVudCBwaXhlbHMuIiIiXG4gICAgcG9pbnRzID0gbnAuY29sdW1uX3N0YWNrKG5wLndoZXJlKG1hc2spWzo6LTFdKS5hc3R5cGUobnAuaW50MzIpXG4gICAgaWYgbGVuKHBvaW50cykgPCAzOlxuICAgICAgICByZXR1cm4gbWFzay5jb3B5KClcbiAgICBodWxsID0gY3YyLmNvbnZleEh1bGwocG9pbnRzLnJlc2hhcGUoLTEsIDEsIDIpKVxuICAgIGVudmVsb3BlID0gbnAuemVyb3MobWFzay5zaGFwZSwgZHR5cGU9bnAudWludDgpXG4gICAgY3YyLmZpbGxDb252ZXhQb2x5KGVudmVsb3BlLCBodWxsLCAxKVxuICAgIGVudmVsb3BlID0gY3YyLmRpbGF0ZShlbnZlbG9wZSwgbnAub25lcygoMywgMyksIG5wLnVpbnQ4KSwgaXRlcmF0aW9ucz0xKVxuICAgIHJldHVybiBlbnZlbG9wZS5hc3R5cGUoYm9vbClcblxuXG5kZWYgX3ByZXNlcnZlX29jY2x1c2lvbnMobWFzazogbnAubmRhcnJheSwgbGFiZWxzOiBucC5uZGFycmF5LCByZWdpb246IG5wLm5kYXJyYXksXG4gICAgICAgICAgICAgICAgICAgICAgICAgcGFyc2VyX2NsYXNzOiBzdHIpIC0+IHR1cGxlW25wLm5kYXJyYXksIG5wLm5kYXJyYXldOlxuICAgICIiIktlZXAgcGhvdG9ncmFwaGVkIG9jY2x1ZGVyIHBpeGVscyB0aGF0IHNpdCBpbnNpZGUgdGhlIGdhcm1lbnQgc2lsaG91ZXR0ZS5cblxuICAgIFRoaXMgaW50ZW50aW9uYWxseSBwcmVzZXJ2ZXMgc291cmNlIHBpeGVscyAoZm9yIGV4YW1wbGUgYSBoYW5kIHJlc3Rpbmcgb3ZlclxuICAgIHRyb3VzZXJzKSBpbnN0ZWFkIG9mIGN1dHRpbmcgaG9sZXMgaW50byB0aGUgZ2FybWVudC4gIEl0IG5ldmVyIHN5bnRoZXNpemVzXG4gICAgaGlkZGVuIHRleHRpbGUgcGl4ZWxzOyB0aGUgZG93bnN0cmVhbSBnYXJtZW50IHJlbmRlcmVyIHJlbW92ZXMgdGhlIHBlcnNvbi5cbiAgICAiIiJcbiAgICBpZiBub3QgbWFzay5hbnkoKTpcbiAgICAgICAgcmV0dXJuIG1hc2ssIG5wLnplcm9zKG1hc2suc2hhcGUsIGR0eXBlPWJvb2wpXG4gICAga2luZCA9IHN0cihwYXJzZXJfY2xhc3Mgb3IgIiIpLmxvd2VyKClcbiAgICBlbnZlbG9wZSA9IF9jb252ZXhfZW52ZWxvcGUobWFzaykgJiByZWdpb25cbiAgICBpZiBraW5kIGluICgidHJvdXNlcnMiLCAidHJhY2twYW50cyIsICJjYXJnbyIsICJzaG9ydHMiLCAibGVnZ2luZ3MiLCAic2tpcnQiKTpcbiAgICAgICAgeXMgPSBucC53aGVyZShtYXNrKVswXVxuICAgICAgICB0b3AsIGJvdHRvbSA9IGludCh5cy5taW4oKSksIGludCh5cy5tYXgoKSkgKyAxXG4gICAgICAgIHVwcGVyX2xpbWl0ID0gdG9wICsgbWF4KDEsIGludCgoYm90dG9tIC0gdG9wKSAqIDAuNDYpKVxuICAgICAgICB1cHBlcl9iYW5kID0gbnAuemVyb3MobWFzay5zaGFwZSwgZHR5cGU9Ym9vbClcbiAgICAgICAgdXBwZXJfYmFuZFt0b3A6dXBwZXJfbGltaXRdID0gVHJ1ZVxuICAgICAgICAjIEhhbmRzL2FybXMsIGFuIG92ZXJsYXBwaW5nIHNoaXJ0IGhlbSBhbmQgYSBiZWx0IGNvbW1vbmx5IGNvdmVyIHRoZVxuICAgICAgICAjIHdhaXN0YmFuZC9oaXAgYXJlYS4gIFByZXNlcnZlIHRob3NlIHBob3RvZ3JhcGhlZCBwaXhlbHMgb25seSB3aXRoaW5cbiAgICAgICAgIyB0aGUgaW5mZXJyZWQgbG93ZXItZ2FybWVudCBlbnZlbG9wZSBhbmQgaXRzIHVwcGVyIHNlY3Rpb24uXG4gICAgICAgIGNhbmRpZGF0ZXMgPSBucC5pc2luKGxhYmVscywgKDQsIDgsIDE0LCAxNSkpICYgdXBwZXJfYmFuZFxuICAgIGVsaWYga2luZCBpbiAoInNoaXJ0IiwgInRzaGlydCIsICJob29kaWUiLCAiamFja2V0IiwgImJsb3VzZSIsICJjYXJkaWdhbiIsXG4gICAgICAgICAgICAgICAgICAia25pdHdlYXIiLCAidG9wIiwgInNoZXJ3YW5pIiwgImt1cnRhIik6XG4gICAgICAgICMgS2VlcCBhcm1zL2hhbmRzIHdoZXJlIHRoZXkgY3Jvc3MgdGhlIHNoaXJ0IGJvZHkuICBGYWNlL25lY2sgcGl4ZWxzIGFyZVxuICAgICAgICAjIGRlbGliZXJhdGVseSBleGNsdWRlZCBzbyB0aGUgY29sbGFyIG9wZW5pbmcgcmVtYWlucyB0cmFuc3BhcmVudC5cbiAgICAgICAgY2FuZGlkYXRlcyA9IG5wLmlzaW4obGFiZWxzLCAoMTQsIDE1KSlcbiAgICBlbGlmIGtpbmQgaW4gKCJkcmVzcyIsICJqdW1wc3VpdCIsICJyb21wZXIiLCAic2FyZWUiLCAibGVoZW5nYSIsXG4gICAgICAgICAgICAgICAgICAidHJhZGl0aW9uYWxfc2V0IiwgInJvYmUiLCAiZHJhcGVkIiwgInNsZWVwd2VhciIsXG4gICAgICAgICAgICAgICAgICAiY2xvdGhpbmdfc2V0IiwgInN3aW13ZWFyIiwgImlubmVyd2VhciIpOlxuICAgICAgICBjYW5kaWRhdGVzID0gbnAuaXNpbihsYWJlbHMsICgxNCwgMTUpKVxuICAgIGVsc2U6XG4gICAgICAgIHJldHVybiBtYXNrLCBucC56ZXJvcyhtYXNrLnNoYXBlLCBkdHlwZT1ib29sKVxuICAgIGFkZGl0aW9ucyA9IGNhbmRpZGF0ZXMgJiBlbnZlbG9wZSAmIHJlZ2lvbiAmIH5tYXNrXG4gICAgcmV0dXJuIG1hc2sgfCBhZGRpdGlvbnMsIGFkZGl0aW9uc1xuXG5cbmRlZiBfcmVwYWlyX29jY2x1c2lvbl9waXhlbHMoc291cmNlX3JnYjogbnAubmRhcnJheSwgY2xlYW5fZ2FybWVudDogbnAubmRhcnJheSxcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgb2NjbHVzaW9uczogbnAubmRhcnJheSkgLT4gdHVwbGVbbnAubmRhcnJheSwgaW50XTpcbiAgICAiIiJSZXBsYWNlIHNtYWxsIHZlcmlmaWVkIG9jY2x1ZGVycyB3aXRoIG5lYXJlc3Qgb2JzZXJ2ZWQgZ2FybWVudCBwaXhlbHMuXG5cbiAgICBUaGUgZmlsbCBpcyByZXN0cmljdGVkIHRvIGFybS9oYW5kIG9yIG92ZXJsYXBwaW5nLWNsb3RoaW5nIGxhYmVscyBhbHJlYWR5XG4gICAgYWNjZXB0ZWQgYnkgYGBfcHJlc2VydmVfb2NjbHVzaW9uc2BgLiAgSXQgY29waWVzIHNvdXJjZSBnYXJtZW50IHBpeGVscyBhbmRcbiAgICBkb2VzIG5vdCBzYW1wbGUgc2tpbiBvciBiYWNrZ3JvdW5kLiAgVmVyeSBsYXJnZSBoaWRkZW4gcmVnaW9ucyBhcmUgcmV0YWluZWRcbiAgICBhcyBwaG90b2dyYXBoZWQgYmVjYXVzZSB0aGVpciB1bnNlZW4gdGV4dHVyZSBjYW5ub3QgYmUgcmVjb3ZlcmVkIHJlbGlhYmx5LlxuICAgICIiIlxuICAgIGNvdW50ID0gaW50KG9jY2x1c2lvbnMuc3VtKCkpXG4gICAgY2xlYW5fY291bnQgPSBpbnQoY2xlYW5fZ2FybWVudC5zdW0oKSlcbiAgICBpZiBub3QgY291bnQgb3IgY2xlYW5fY291bnQgPCA2NCBvciBjb3VudCA+IGNsZWFuX2NvdW50ICogMC4yMjpcbiAgICAgICAgcmV0dXJuIHNvdXJjZV9yZ2IsIDBcbiAgICB5cywgeHMgPSBucC53aGVyZShjbGVhbl9nYXJtZW50IHwgb2NjbHVzaW9ucylcbiAgICBwYWQgPSAyXG4gICAgdG9wLCBib3R0b20gPSBtYXgoMCwgaW50KHlzLm1pbigpKSAtIHBhZCksIG1pbihzb3VyY2VfcmdiLnNoYXBlWzBdLCBpbnQoeXMubWF4KCkpICsgcGFkICsgMSlcbiAgICBsZWZ0LCByaWdodCA9IG1heCgwLCBpbnQoeHMubWluKCkpIC0gcGFkKSwgbWluKHNvdXJjZV9yZ2Iuc2hhcGVbMV0sIGludCh4cy5tYXgoKSkgKyBwYWQgKyAxKVxuICAgIGNsZWFuID0gY2xlYW5fZ2FybWVudFt0b3A6Ym90dG9tLCBsZWZ0OnJpZ2h0XVxuICAgIHRhcmdldCA9IG9jY2x1c2lvbnNbdG9wOmJvdHRvbSwgbGVmdDpyaWdodF1cbiAgICAjIGRpc3RhbmNlVHJhbnNmb3JtV2l0aExhYmVscyBhc3NpZ25zIGV2ZXJ5IG5vbi1jbGVhbiBwaXhlbCB0aGUgbGFiZWwgb2ZcbiAgICAjIGl0cyBuZWFyZXN0IGNsZWFuIGdhcm1lbnQgcGl4ZWwuICBUaGUgbG9va3VwIHRhYmxlIGlzIGJ1aWx0IG9ubHkgZnJvbVxuICAgICMgb2JzZXJ2ZWQgZ2FybWVudCBwaXhlbHMsIHNvIGhhbmRzIGNhbm5vdCBsZWFrIGJhY2sgaW50byB0aGUgcmVwYWlyLlxuICAgIF8sIG5lYXJlc3QgPSBjdjIuZGlzdGFuY2VUcmFuc2Zvcm1XaXRoTGFiZWxzKFxuICAgICAgICAofmNsZWFuKS5hc3R5cGUobnAudWludDgpLCBjdjIuRElTVF9MMiwgNSxcbiAgICAgICAgbGFiZWxUeXBlPWN2Mi5ESVNUX0xBQkVMX1BJWEVMXG4gICAgKVxuICAgIGNsZWFuX3ksIGNsZWFuX3ggPSBucC53aGVyZShjbGVhbilcbiAgICBpZiBub3QgbGVuKGNsZWFuX3gpOlxuICAgICAgICByZXR1cm4gc291cmNlX3JnYiwgMFxuICAgIHJlcGFpcmVkID0gc291cmNlX3JnYi5jb3B5KClcbiAgICBsb2NhbCA9IHJlcGFpcmVkW3RvcDpib3R0b20sIGxlZnQ6cmlnaHRdXG4gICAgdGFyZ2V0X3ksIHRhcmdldF94ID0gbnAud2hlcmUodGFyZ2V0KVxuICAgIG5lYXJlc3RfaW5kZXggPSBuZWFyZXN0W3RhcmdldF95LCB0YXJnZXRfeF0gLSAxXG4gICAgdmFsaWQgPSAobmVhcmVzdF9pbmRleCA+PSAwKSAmIChuZWFyZXN0X2luZGV4IDwgbGVuKGNsZWFuX3gpKVxuICAgIGlmIG5vdCB2YWxpZC5hbnkoKTpcbiAgICAgICAgcmV0dXJuIHNvdXJjZV9yZ2IsIDBcbiAgICBsb2NhbFt0YXJnZXRfeVt2YWxpZF0sIHRhcmdldF94W3ZhbGlkXV0gPSBsb2NhbFtcbiAgICAgICAgY2xlYW5feVtuZWFyZXN0X2luZGV4W3ZhbGlkXV0sIGNsZWFuX3hbbmVhcmVzdF9pbmRleFt2YWxpZF1dXG4gICAgXVxuICAgIHJldHVybiByZXBhaXJlZCwgaW50KHZhbGlkLnN1bSgpKVxuXG5cbmRlZiBfdHJpbV9mb290d2Vhcl9zdGVtcyhtYXNrOiBucC5uZGFycmF5KSAtPiB0dXBsZVtucC5uZGFycmF5LCBpbnRdOlxuICAgICIiIlJlbW92ZSBuYXJyb3cgc29jay9hbmtsZSBzdGVtcyBhYm92ZSBlYWNoIG90aGVyd2lzZSBpbnRhY3Qgc2hvZSBtYXNrLiIiIlxuICAgIGJpbmFyeSA9IG1hc2suYXN0eXBlKG5wLnVpbnQ4KVxuICAgIGNvdW50LCBjb21wb25lbnRzLCBzdGF0cywgXyA9IGN2Mi5jb25uZWN0ZWRDb21wb25lbnRzV2l0aFN0YXRzKGJpbmFyeSwgOClcbiAgICByZXN1bHQgPSBiaW5hcnkuY29weSgpXG4gICAgdHJpbW1lZCA9IDBcbiAgICBmb3IgbGFiZWwgaW4gcmFuZ2UoMSwgY291bnQpOlxuICAgICAgICB4ID0gc3RhdHNbbGFiZWwsIGN2Mi5DQ19TVEFUX0xFRlRdXG4gICAgICAgIHkgPSBzdGF0c1tsYWJlbCwgY3YyLkNDX1NUQVRfVE9QXVxuICAgICAgICB3aWR0aCA9IHN0YXRzW2xhYmVsLCBjdjIuQ0NfU1RBVF9XSURUSF1cbiAgICAgICAgaGVpZ2h0ID0gc3RhdHNbbGFiZWwsIGN2Mi5DQ19TVEFUX0hFSUdIVF1cbiAgICAgICAgaWYgd2lkdGggPCA4IG9yIGhlaWdodCA8IDEyOlxuICAgICAgICAgICAgY29udGludWVcbiAgICAgICAgY29tcG9uZW50ID0gY29tcG9uZW50c1t5OnkgKyBoZWlnaHQsIHg6eCArIHdpZHRoXSA9PSBsYWJlbFxuICAgICAgICByb3dfd2lkdGhzID0gY29tcG9uZW50LnN1bShheGlzPTEpXG4gICAgICAgIG1heGltdW0gPSBpbnQocm93X3dpZHRocy5tYXgoKSlcbiAgICAgICAgdGhyZXNob2xkID0gbWF4KDQsIGludChtYXhpbXVtICogMC4zNCkpXG4gICAgICAgIHN1c3RhaW5lZCA9IG5wLmNvbnZvbHZlKChyb3dfd2lkdGhzID49IHRocmVzaG9sZCkuYXN0eXBlKG5wLnVpbnQ4KSxcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgbnAub25lcygzLCBkdHlwZT1ucC51aW50OCksIG1vZGU9InNhbWUiKVxuICAgICAgICBjYW5kaWRhdGVzID0gbnAud2hlcmUoc3VzdGFpbmVkID49IDMpWzBdXG4gICAgICAgIGlmIG5vdCBsZW4oY2FuZGlkYXRlcyk6XG4gICAgICAgICAgICBjb250aW51ZVxuICAgICAgICBib2R5X3N0YXJ0ID0gbWF4KDAsIGludChjYW5kaWRhdGVzWzBdKSAtIDEpXG4gICAgICAgIG1pbmltdW1fc3RlbSA9IG1heCgzLCBpbnQoaGVpZ2h0ICogMC4wNykpXG4gICAgICAgIG1heGltdW1fdHJpbSA9IGludChoZWlnaHQgKiAwLjM0KVxuICAgICAgICBpZiBib2R5X3N0YXJ0IDwgbWluaW11bV9zdGVtIG9yIGJvZHlfc3RhcnQgPiBtYXhpbXVtX3RyaW06XG4gICAgICAgICAgICBjb250aW51ZVxuICAgICAgICBzdGVtX3dpZHRoID0gZmxvYXQocm93X3dpZHRoc1s6Ym9keV9zdGFydF0ubWVhbigpKSBpZiBib2R5X3N0YXJ0IGVsc2UgbWF4aW11bVxuICAgICAgICBpZiBzdGVtX3dpZHRoID4gbWF4aW11bSAqIDAuNDg6XG4gICAgICAgICAgICBjb250aW51ZVxuICAgICAgICBzdGVtID0gY29tcG9uZW50Wzpib2R5X3N0YXJ0XVxuICAgICAgICByZW1vdmVkID0gaW50KHN0ZW0uc3VtKCkpXG4gICAgICAgIGlmIHJlbW92ZWQ6XG4gICAgICAgICAgICB2aWV3ID0gcmVzdWx0W3k6eSArIGJvZHlfc3RhcnQsIHg6eCArIHdpZHRoXVxuICAgICAgICAgICAgdmlld1tzdGVtXSA9IDBcbiAgICAgICAgICAgIHRyaW1tZWQgKz0gcmVtb3ZlZFxuICAgIHJldHVybiByZXN1bHQuYXN0eXBlKGJvb2wpLCB0cmltbWVkXG5cblxuZGVmIGN1dG91dF9mb3IocGhvdG86IEltYWdlLkltYWdlLCBsYWJlbHM6IG5wLm5kYXJyYXksIGl0ZW06IGRpY3QpIC0+IFBhcnNlZEN1dG91dDpcbiAgICBpbmRleCA9IGludChpdGVtLmdldCgiaW5kZXgiLCAtMSkpXG4gICAgc2VsZWN0ZWQgPSBsYWJlbHNfZm9yKGl0ZW0uZ2V0KCJwYXJzZXJDbGFzcyIpIG9yIGl0ZW0uZ2V0KCJjYXRlZ29yeSIpKVxuICAgIHgxLCB5MSwgeDIsIHkyID0gX2JveChpdGVtLmdldCgiYm91bmRpbmdCb3giKSwgcGhvdG8ud2lkdGgsIHBob3RvLmhlaWdodClcbiAgICByZWdpb24gPSBucC56ZXJvcyhsYWJlbHMuc2hhcGUsIGR0eXBlPWJvb2wpXG4gICAgcmVnaW9uW3kxOnkyLCB4MTp4Ml0gPSBUcnVlXG4gICAgcGFyc2VyX2NsYXNzID0gc3RyKGl0ZW0uZ2V0KCJwYXJzZXJDbGFzcyIpIG9yIGl0ZW0uZ2V0KCJjYXRlZ29yeSIpIG9yICIiKS5sb3dlcigpXG4gICAgbWFzayA9IF9jbGVhbl9tYXNrKG5wLmlzaW4obGFiZWxzLCBzZWxlY3RlZCkgJiByZWdpb24pXG4gICAgeXMsIHhzID0gbnAud2hlcmUobWFzaylcbiAgICBtaW5pbXVtID0gbWF4KDQ4LCBpbnQoKHgyIC0geDEpICogKHkyIC0geTEpICogMC4wMDUpKVxuICAgIGlmIGxlbih4cykgPCBtaW5pbXVtIGFuZCBpdGVtLmdldCgicGFyc2VyQ2xhc3MiKSAhPSAiZm9vdHdlYXIiOlxuICAgICAgICAjIEEgZmFzaGlvbiBwYXJzZXIgY2FuIGxhYmVsIGFuIHVudXN1YWwgdG9wIGFzIGRyZXNzIG9yIGxvb3NlIHNob3J0cyBhc1xuICAgICAgICAjIHNraXJ0LiBTdGF5IG9uIHNlbWFudGljIGNsb3RoaW5nIHBpeGVscywgY2hvb3NlIHRoZSBkb21pbmFudCBjbGFzc1xuICAgICAgICAjIGluc2lkZSB0aGlzIGl0ZW1cJ3MgR2VtaW5pIGJveCwgYW5kIG5ldmVyIGZhbGwgYmFjayB0byB0aGUgcmVjdGFuZ2xlLlxuICAgICAgICBjb3VudHMgPSBbKGludCgoKGxhYmVscyA9PSBsYWJlbCkgJiByZWdpb24pLnN1bSgpKSwgbGFiZWwpIGZvciBsYWJlbCBpbiBHQVJNRU5UX0xBQkVMU11cbiAgICAgICAgY291bnQsIGZhbGxiYWNrID0gbWF4KGNvdW50cywgZGVmYXVsdD0oMCwgMCkpXG4gICAgICAgIGlmIGNvdW50ID49IG1pbmltdW06XG4gICAgICAgICAgICBzZWxlY3RlZCA9IChmYWxsYmFjaywpXG4gICAgICAgICAgICBtYXNrID0gX2NsZWFuX21hc2soKGxhYmVscyA9PSBmYWxsYmFjaykgJiByZWdpb24pXG4gICAgICAgICAgICB5cywgeHMgPSBucC53aGVyZShtYXNrKVxuICAgIGlmIGxlbih4cykgPCBtaW5pbXVtOlxuICAgICAgICByYWlzZSBPdXRmaXRQYXJzZXJFcnJvcigiVGhlIHNlbWFudGljIHBhcnNlciBmb3VuZCB0b28gZmV3IGdhcm1lbnQgcGl4ZWxzIGluc2lkZSB0aGlzIGl0ZW0gYm94IilcbiAgICBwcmVzZXJ2ZWRfb2NjbHVzaW9uX3BpeGVscyA9IDBcbiAgICByZXBhaXJlZF9vY2NsdXNpb25fcGl4ZWxzID0gMFxuICAgIHRyaW1tZWRfZm9vdHdlYXJfcGl4ZWxzID0gMFxuICAgIHNvdXJjZV9yZ2IgPSBucC5hc2FycmF5KHBob3RvKS5jb3B5KClcbiAgICBpZiBwYXJzZXJfY2xhc3MgPT0gImZvb3R3ZWFyIjpcbiAgICAgICAgbWFzaywgdHJpbW1lZF9mb290d2Vhcl9waXhlbHMgPSBfdHJpbV9mb290d2Vhcl9zdGVtcyhtYXNrKVxuICAgIGVsc2U6XG4gICAgICAgIGNsZWFuX2dhcm1lbnQgPSBtYXNrLmNvcHkoKVxuICAgICAgICBtYXNrLCBvY2NsdXNpb25zID0gX3ByZXNlcnZlX29jY2x1c2lvbnMoXG4gICAgICAgICAgICBtYXNrLCBsYWJlbHMsIHJlZ2lvbiwgcGFyc2VyX2NsYXNzXG4gICAgICAgIClcbiAgICAgICAgc291cmNlX3JnYiwgcmVwYWlyZWRfb2NjbHVzaW9uX3BpeGVscyA9IF9yZXBhaXJfb2NjbHVzaW9uX3BpeGVscyhcbiAgICAgICAgICAgIHNvdXJjZV9yZ2IsIGNsZWFuX2dhcm1lbnQsIG9jY2x1c2lvbnNcbiAgICAgICAgKVxuICAgICAgICBwcmVzZXJ2ZWRfb2NjbHVzaW9uX3BpeGVscyA9IGludChvY2NsdXNpb25zLnN1bSgpKSAtIHJlcGFpcmVkX29jY2x1c2lvbl9waXhlbHNcbiAgICB5cywgeHMgPSBucC53aGVyZShtYXNrKVxuICAgIGxlZnQsIHJpZ2h0ID0gaW50KHhzLm1pbigpKSwgaW50KHhzLm1heCgpKSArIDFcbiAgICB0b3AsIGJvdHRvbSA9IGludCh5cy5taW4oKSksIGludCh5cy5tYXgoKSkgKyAxXG4gICAgbWFyZ2luID0gbWF4KDIsIGludChtYXgocmlnaHQgLSBsZWZ0LCBib3R0b20gLSB0b3ApICogMC4wMTUpKVxuICAgIGxlZnQsIHRvcCA9IG1heCgwLCBsZWZ0IC0gbWFyZ2luKSwgbWF4KDAsIHRvcCAtIG1hcmdpbilcbiAgICByaWdodCwgYm90dG9tID0gbWluKHBob3RvLndpZHRoLCByaWdodCArIG1hcmdpbiksIG1pbihwaG90by5oZWlnaHQsIGJvdHRvbSArIG1hcmdpbilcbiAgICBhbHBoYSA9IChtYXNrLmFzdHlwZShucC51aW50OCkgKiAyNTUpXG4gICAgIyBBIG9uZS1waXhlbCBlZGdlIHNvZnRlbmluZyBhdm9pZHMgYSBqYWdnZWQgcHJldmlldyB3aXRob3V0IGFkZGluZyBhbnlcbiAgICAjIHBpeGVscyB0aGF0IHdlcmUgbm90IHByZXNlbnQgaW4gdGhlIHNvdXJjZSBwaG90b2dyYXBoLlxuICAgIGFscGhhID0gY3YyLkdhdXNzaWFuQmx1cihhbHBoYSwgKDMsIDMpLCAwLjQ1KVxuICAgIHJnYmEgPSBucC5kc3RhY2soKHNvdXJjZV9yZ2IsIGFscGhhKSlbdG9wOmJvdHRvbSwgbGVmdDpyaWdodF1cbiAgICBvdXRwdXQgPSBJbWFnZS5mcm9tYXJyYXkocmdiYSwgIlJHQkEiKVxuICAgIGlmIG1heChvdXRwdXQuc2l6ZSkgPiAxMjAwOlxuICAgICAgICBvdXRwdXQudGh1bWJuYWlsKCgxMjAwLCAxMjAwKSwgSW1hZ2UuUmVzYW1wbGluZy5MQU5DWk9TKVxuICAgIGJ1ZmZlciA9IGlvLkJ5dGVzSU8oKVxuICAgIG91dHB1dC5zYXZlKGJ1ZmZlciwgZm9ybWF0PSJQTkciLCBvcHRpbWl6ZT1UcnVlLCBpY2NfcHJvZmlsZT1TUkdCX0lDQylcbiAgICByZXR1cm4gUGFyc2VkQ3V0b3V0KFxuICAgICAgICBpbmRleCwgYnVmZmVyLmdldHZhbHVlKCksIG91dHB1dC53aWR0aCwgb3V0cHV0LmhlaWdodCwgaW50KG1hc2suc3VtKCkpLCBzZWxlY3RlZCxcbiAgICAgICAgcHJlc2VydmVkX29jY2x1c2lvbl9waXhlbHMsIHJlcGFpcmVkX29jY2x1c2lvbl9waXhlbHMsIHRyaW1tZWRfZm9vdHdlYXJfcGl4ZWxzXG4gICAgKVxuXG5cbmRlZiBwYXJzZV9vdXRmaXQoZGF0YTogYnl0ZXMsIGl0ZW1zOiBJdGVyYWJsZVtkaWN0XSkgLT4gdHVwbGVbbGlzdFtQYXJzZWRDdXRvdXRdLCBsaXN0W2RpY3RdLCBkaWN0XTpcbiAgICBwaG90byA9IGRlY29kZV9waG90byhkYXRhKVxuICAgIGxhYmVscyA9IHByZWRpY3RfbGFiZWxzKHBob3RvKVxuICAgIGV2aWRlbmNlID0gd29ybl9waG90b19ldmlkZW5jZShsYWJlbHMpXG4gICAgaWYgbm90IGV2aWRlbmNlWyJ3b3JuIl06XG4gICAgICAgIHJhaXNlIE91dGZpdFBhcnNlckVycm9yKCJUaGUgcGFyc2VyIGRpZCBub3QgZmluZCByZWxpYWJsZSB3b3JuLXBlcnNvbiBldmlkZW5jZSIpXG4gICAgcGFyc2VkLCBza2lwcGVkID0gW10sIFtdXG4gICAgZm9yIGl0ZW0gaW4gaXRlbXM6XG4gICAgICAgIHRyeTpcbiAgICAgICAgICAgIHBhcnNlZC5hcHBlbmQoY3V0b3V0X2ZvcihwaG90bywgbGFiZWxzLCBpdGVtKSlcbiAgICAgICAgZXhjZXB0IChPdXRmaXRQYXJzZXJFcnJvciwgVHlwZUVycm9yLCBWYWx1ZUVycm9yKSBhcyBleGM6XG4gICAgICAgICAgICBza2lwcGVkLmFwcGVuZCh7ImluZGV4IjogaW50KGl0ZW0uZ2V0KCJpbmRleCIsIC0xKSksICJtZXNzYWdlIjogc3RyKGV4Yyl9KVxuICAgIHJldHVybiBwYXJzZWQsIHNraXBwZWQsIGV2aWRlbmNlXG4nDQoNCihQUk9KRUNUIC8gJ2Nsb3RobWF0aWNzX2FwaS5weScpLndyaXRlX3RleHQoV0FSTV9TRVJWRVJfQ09ERSkNCihQUk9KRUNUIC8gJ3Byb21wdF9jb250cmFjdC5weScpLndyaXRlX3RleHQoUFJPTVBUX0NPTlRSQUNUX0NPREUpDQpwcmludCgi4pyFIFNhZmUgQmFzZWxpbmUgRmFzdEFQSSBzZXJ2ZXIgc2NyaXB0IHdyaXR0ZW4uIikNCg0KIyAtLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0NCiMgU1RFUCA1OiBTdGFydCBGYXN0QVBJIFNlcnZlciAmIFdhaXQgZm9yIFdhcm0gTW9kZWwgTG9hZGluZw0KIyAtLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0NCndpdGggc29ja2V0LnNvY2tldCgpIGFzIHNvY2s6DQogICAgc29jay5iaW5kKCgnMTI3LjAuMC4xJywgMCkpDQogICAgQVBJX1BPUlQgPSBzb2NrLmdldHNvY2tuYW1lKClbMV0NCkFQSV9VUkwgPSBmJ2h0dHA6Ly8xMjcuMC4wLjE6e0FQSV9QT1JUfScNCg0KYXBpX2VudiA9IGRpY3Qob3MuZW52aXJvbikNCmFwaV9lbnZbJ0NMT1RITUFUSUNTX1BST0pFQ1QnXSA9IHN0cihQUk9KRUNULnJlc29sdmUoKSkNCmFwaV9lbnZbJ1BZVEhPTlVOQlVGRkVSRUQnXSA9ICcxJw0KQVBJX0xPRyA9IFBST0pFQ1QgLyAnYXBpLXNlcnZlci5sb2cnDQpBUElfTE9HX0ZJTEUgPSBvcGVuKEFQSV9MT0csICd3JywgZW5jb2Rpbmc9J3V0Zi04JywgYnVmZmVyaW5nPTEpDQoNCnByaW50KGYiXG5TdGFydGluZyBBUEkgU2VydmVyIG9uIHBvcnQge0FQSV9QT1JUfS4uLiIpDQpwcmludCgi4o+zIFByZS1sb2FkaW5nIG1vZGVscyBpbnRvIEdQVSBWUkFNICYgZXhlY3V0aW5nIHByZWZsaWdodCB3YXJtLXVwIHBhc3MuLi4iKQ0KQVBJX1BST0NFU1MgPSBzdWJwcm9jZXNzLlBvcGVuKFsNCiAgICBQWVRIT04sICctbScsICd1dmljb3JuJywgJ2Nsb3RobWF0aWNzX2FwaTphcHAnLA0KICAgICctLWFwcC1kaXInLCBzdHIoUFJPSkVDVCksICctLWhvc3QnLCAnMTI3LjAuMC4xJywgJy0tcG9ydCcsIHN0cihBUElfUE9SVCksDQogICAgJy0td29ya2VycycsICcxJywgJy0tbm8tYWNjZXNzLWxvZycsICctLWxvZy1sZXZlbCcsICd3YXJuaW5nJw0KXSwgY3dkPVBST0pFQ1QsIGVudj1hcGlfZW52LCBzdGRvdXQ9QVBJX0xPR19GSUxFLCBzdGRlcnI9c3VicHJvY2Vzcy5TVERPVVQpDQoNCm1vZGVsX3JlYWR5ID0gRmFsc2UNCk1BWF9XQUlUX1NFQ09ORFMgPSA2MDANCnBvbGxfaW50ZXJ2YWwgPSAyDQptYXhfYXR0ZW1wdHMgPSBNQVhfV0FJVF9TRUNPTkRTIC8vIHBvbGxfaW50ZXJ2YWwNCmxvZ19wb3MgPSAwDQoNCmZvciBhdHRlbXB0IGluIHJhbmdlKG1heF9hdHRlbXB0cyk6DQogICAgdGltZS5zbGVlcChwb2xsX2ludGVydmFsKQ0KICAgIGVsYXBzZWQgPSAoYXR0ZW1wdCArIDEpICogcG9sbF9pbnRlcnZhbA0KDQogICAgaWYgQVBJX0xPRy5leGlzdHMoKToNCiAgICAgICAgdHJ5Og0KICAgICAgICAgICAgd2l0aCBBUElfTE9HLm9wZW4oJ3InLCBlbmNvZGluZz0ndXRmLTgnLCBlcnJvcnM9J3JlcGxhY2UnKSBhcyBsZjoNCiAgICAgICAgICAgICAgICBsZi5zZWVrKGxvZ19wb3MpDQogICAgICAgICAgICAgICAgbmV3X2NodW5rID0gbGYucmVhZCgpDQogICAgICAgICAgICAgICAgbG9nX3BvcyA9IGxmLnRlbGwoKQ0KICAgICAgICAgICAgICAgIGlmIG5ld19jaHVuazoNCiAgICAgICAgICAgICAgICAgICAgZm9yIHJhd19saW5lIGluIG5ld19jaHVuay5zcGxpdGxpbmVzKCk6DQogICAgICAgICAgICAgICAgICAgICAgICBjbGVhbl9saW5lID0gcmF3X2xpbmUuc3RyaXAoKQ0KICAgICAgICAgICAgICAgICAgICAgICAgaWYgY2xlYW5fbGluZToNCiAgICAgICAgICAgICAgICAgICAgICAgICAgICBwcmludChmIiAgW3ZyYW0tZW5naW5lXSB7Y2xlYW5fbGluZX0iLCBmbHVzaD1UcnVlKQ0KICAgICAgICBleGNlcHQgRXhjZXB0aW9uOg0KICAgICAgICAgICAgcGFzcw0KDQogICAgaWYgQVBJX1BST0NFU1MucG9sbCgpIGlzIG5vdCBOb25lOg0KICAgICAgICBsb2dfY29udGVudCA9IEFQSV9MT0cucmVhZF90ZXh0KGVuY29kaW5nPSd1dGYtOCcsIGVycm9ycz0ncmVwbGFjZScpIGlmIEFQSV9MT0cuZXhpc3RzKCkgZWxzZSAiTm8gbG9nIGZpbGUgZm91bmQuIg0KICAgICAgICByYWlzZSBSdW50aW1lRXJyb3IoIkFQSSBwcm9jZXNzIGRpZWQgdW5leHBlY3RlZGx5OlxuIiArIGxvZ19jb250ZW50Wy0zMDAwOl0pDQoNCiAgICBzdGF0dXMgPSAiY29ubmVjdGluZyINCiAgICBzZXJ2ZXJfZXJyb3IgPSBOb25lDQogICAgdHJ5Og0KICAgICAgICByZXEgPSB1cmxsaWIucmVxdWVzdC5SZXF1ZXN0KEFQSV9VUkwgKyAnL2hlYWx0aCcpDQogICAgICAgIHdpdGggdXJsbGliLnJlcXVlc3QudXJsb3BlbihyZXEsIHRpbWVvdXQ9MykgYXMgcmVzcDoNCiAgICAgICAgICAgIGRhdGEgPSBqc29uLmxvYWRzKHJlc3AucmVhZCgpLmRlY29kZSgpKQ0KICAgICAgICAgICAgaWYgZGF0YS5nZXQoJ2Vycm9yJyk6DQogICAgICAgICAgICAgICAgc2VydmVyX2Vycm9yID0gZGF0YVsnZXJyb3InXQ0KICAgICAgICAgICAgZWxpZiBkYXRhLmdldCgncmVhZHknKSBhbmQgZGF0YS5nZXQoJ2dob3N0X2NvbnRyYWN0X3ZlcnNpb24nKSA9PSAyOg0KICAgICAgICAgICAgICAgIG1vZGVsX3JlYWR5ID0gVHJ1ZQ0KICAgICAgICAgICAgICAgIGJyZWFrDQogICAgICAgICAgICBlbHNlOg0KICAgICAgICAgICAgICAgIHN0YXR1cyA9IGRhdGEuZ2V0KCdzdGF0dXMnLCAnd2FybWluZ191cCcpDQogICAgZXhjZXB0IHVybGxpYi5lcnJvci5VUkxFcnJvcjoNCiAgICAgICAgc3RhdHVzID0gImNvbm5lY3RpbmdfdG9fc2VydmVyIg0KICAgIGV4Y2VwdCBFeGNlcHRpb24gYXMgZToNCiAgICAgICAgc3RhdHVzID0gc3RyKGUpDQoNCiAgICBpZiBzZXJ2ZXJfZXJyb3I6DQogICAgICAgIHByaW50KGYiXG7inYwgRkFUQUw6IEVuZ2luZSBpbml0aWFsaXphdGlvbiBmYWlsZWQgaW4gVlJBTTpcbntzZXJ2ZXJfZXJyb3J9XG4iLCBmbHVzaD1UcnVlKQ0KICAgICAgICBpZiBBUElfTE9HLmV4aXN0cygpOg0KICAgICAgICAgICAgcHJpbnQoIi0tLSBBUEkgU2VydmVyIExvZyBUYWlsIC0tLSIpDQogICAgICAgICAgICBwcmludChBUElfTE9HLnJlYWRfdGV4dChlbmNvZGluZz0ndXRmLTgnLCBlcnJvcnM9J3JlcGxhY2UnKVstMzAwMDpdKQ0KICAgICAgICByYWlzZSBSdW50aW1lRXJyb3IoZiJFbmdpbmUgZmFpbGVkIHRvIGxvYWQgaW4gVlJBTTpcbntzZXJ2ZXJfZXJyb3J9IikNCg0KICAgIGlmIGF0dGVtcHQgJSA1ID09IDAgYW5kIGF0dGVtcHQgPiAwOg0KICAgICAgICBwcmludChmIuKPsyBXYWl0aW5nIGZvciBtb2RlbCByZWFkaW5lc3MgaW4gVlJBTS4uLiAoe2VsYXBzZWR9cy97TUFYX1dBSVRfU0VDT05EU31zKSBbU3RhdHVzOiB7c3RhdHVzfV0iLCBmbHVzaD1UcnVlKQ0KDQppZiBub3QgbW9kZWxfcmVhZHk6DQogICAgbG9nX2NvbnRlbnQgPSBBUElfTE9HLnJlYWRfdGV4dCgpIGlmIEFQSV9MT0cuZXhpc3RzKCkgZWxzZSAiTm8gbG9nIGZpbGUgZm91bmQuIg0KICAgIHJhaXNlIFJ1bnRpbWVFcnJvcihmIk1vZGVsIGxvYWRpbmcgdGltZWQgb3V0IGFmdGVyIHtNQVhfV0FJVF9TRUNPTkRTfXMuIEFQSSBTZXJ2ZXIgTG9nOlxue2xvZ19jb250ZW50Wy00MDAwOl19IikNCg0KcHJpbnQoIvCfjokgTU9ERUwgSVMgV0FSTSAmIFBFUk1BTkVOVExZIExPQURFRCBJTiBWUkFNISIpDQoNCiMgLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tDQojIFNURVAgNjogQ2xvdWRmbGFyZSBUdW5uZWwgJiBXb3JrZXIgQXV0by1SZWdpc3RyYXRpb24NCiMgLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tDQpDTE9VREZMQVJFRCA9IFBST0pFQ1QgLyAnY2xvdWRmbGFyZWQnDQojIENsb3VkZmxhcmVkIGJpbmFyeSBpcyB+NDAtNjBNQi4gSWYgbWlzc2luZyBvciBjb3JydXB0ZWQgKDwxME1CKSwgZG93bmxvYWQgaXQuDQppZiBub3QgQ0xPVURGTEFSRUQuZXhpc3RzKCkgb3IgQ0xPVURGTEFSRUQuc3RhdCgpLnN0X3NpemUgPCAxMF8wMDBfMDAwOg0KICAgIHByaW50KCJEb3dubG9hZGluZyBDbG91ZGZsYXJlIFR1bm5lbCBiaW5hcnkuLi4iLCBmbHVzaD1UcnVlKQ0KICAgIGlmIENMT1VERkxBUkVELmV4aXN0cygpOg0KICAgICAgICB0cnk6DQogICAgICAgICAgICBDTE9VREZMQVJFRC51bmxpbmsoKQ0KICAgICAgICBleGNlcHQgRXhjZXB0aW9uOg0KICAgICAgICAgICAgcGFzcw0KICAgIGRsX3VybCA9ICdodHRwczovL2dpdGh1Yi5jb20vY2xvdWRmbGFyZS9jbG91ZGZsYXJlZC9yZWxlYXNlcy9sYXRlc3QvZG93bmxvYWQvY2xvdWRmbGFyZWQtbGludXgtYW1kNjQnDQogICAgc3VicHJvY2Vzcy5ydW4oWyd3Z2V0JywgJy1xJywgJy0tdHJpZXM9MycsICctLXRpbWVvdXQ9MzAnLCBkbF91cmwsICctTycsIHN0cihDTE9VREZMQVJFRCldLCBjaGVjaz1UcnVlKQ0KDQp0cnk6DQogICAgc3VicHJvY2Vzcy5ydW4oWydjaG1vZCcsICcreCcsIHN0cihDTE9VREZMQVJFRCldLCBjaGVjaz1UcnVlKQ0KZXhjZXB0IEV4Y2VwdGlvbjoNCiAgICBpbXBvcnQgb3MNCiAgICBvcy5jaG1vZChzdHIoQ0xPVURGTEFSRUQpLCAwbzc1NSkNCg0KVFVOTkVMX0xPRyA9IFBST0pFQ1QgLyAndHVubmVsLmxvZycNCg0KZGVmIHN0YXJ0X2Nsb3VkZmxhcmVfdHVubmVsKG1heF9hdHRlbXB0cz0zKToNCiAgICBnbG9iYWwgVFVOTkVMX1BST0NFU1MsIFRVTk5FTF9MT0dfRklMRQ0KICAgIHR1bm5lbF91cmwgPSBOb25lDQoNCiAgICBmb3IgYXR0ZW1wdCBpbiByYW5nZSgxLCBtYXhfYXR0ZW1wdHMgKyAxKToNCiAgICAgICAgcHJpbnQoZiJDb25uZWN0aW5nIENsb3VkZmxhcmUgVHVubmVsIChhdHRlbXB0IHthdHRlbXB0fS97bWF4X2F0dGVtcHRzfSkuLi4iLCBmbHVzaD1UcnVlKQ0KICAgICAgICBpZiAnVFVOTkVMX1BST0NFU1MnIGluIGdsb2JhbHMoKSBhbmQgZ2xvYmFscygpWydUVU5ORUxfUFJPQ0VTUyddIGFuZCBnbG9iYWxzKClbJ1RVTk5FTF9QUk9DRVNTJ10ucG9sbCgpIGlzIE5vbmU6DQogICAgICAgICAgICB0cnk6DQogICAgICAgICAgICAgICAgZ2xvYmFscygpWydUVU5ORUxfUFJPQ0VTUyddLnRlcm1pbmF0ZSgpDQogICAgICAgICAgICAgICAgZ2xvYmFscygpWydUVU5ORUxfUFJPQ0VTUyddLndhaXQodGltZW91dD0zKQ0KICAgICAgICAgICAgZXhjZXB0IEV4Y2VwdGlvbjoNCiAgICAgICAgICAgICAgICBnbG9iYWxzKClbJ1RVTk5FTF9QUk9DRVNTJ10ua2lsbCgpDQoNCiAgICAgICAgaWYgJ1RVTk5FTF9MT0dfRklMRScgaW4gZ2xvYmFscygpIGFuZCBnbG9iYWxzKClbJ1RVTk5FTF9MT0dfRklMRSddOg0KICAgICAgICAgICAgdHJ5Og0KICAgICAgICAgICAgICAgIGdsb2JhbHMoKVsnVFVOTkVMX0xPR19GSUxFJ10uY2xvc2UoKQ0KICAgICAgICAgICAgZXhjZXB0IEV4Y2VwdGlvbjoNCiAgICAgICAgICAgICAgICBwYXNzDQoNCiAgICAgICAgVFVOTkVMX0xPR19GSUxFID0gb3BlbihUVU5ORUxfTE9HLCAndycsIGVuY29kaW5nPSd1dGYtOCcsIGJ1ZmZlcmluZz0xKQ0KICAgICAgICAjIEthZ2dsZSBibG9ja3MgVURQL1FVSUMgKHBvcnQgNzg0NCk7IC0tcHJvdG9jb2wgaHR0cDIgZm9yY2VzIFRDUCBwb3J0IDQ0MyB3aGljaCBjb25uZWN0cyBpbW1lZGlhdGVseS4NCiAgICAgICAgY21kID0gWw0KICAgICAgICAgICAgc3RyKENMT1VERkxBUkVEKSwgJ3R1bm5lbCcsDQogICAgICAgICAgICAnLS1uby1hdXRvdXBkYXRlJywNCiAgICAgICAgICAgICctLXByb3RvY29sJywgJ2h0dHAyJywNCiAgICAgICAgICAgICctLWVkZ2UtaXAtdmVyc2lvbicsICc0JywNCiAgICAgICAgICAgICctLXVybCcsIGYnaHR0cDovLzEyNy4wLjAuMTp7QVBJX1BPUlR9Jw0KICAgICAgICBdDQogICAgICAgIFRVTk5FTF9QUk9DRVNTID0gc3VicHJvY2Vzcy5Qb3BlbihjbWQsIHN0ZG91dD1UVU5ORUxfTE9HX0ZJTEUsIHN0ZGVycj1zdWJwcm9jZXNzLlNURE9VVCkNCg0KICAgICAgICAjIFBvbGwgdXAgdG8gNDUgc2Vjb25kcyBwZXIgYXR0ZW1wdCAoOTAgdGlja3Mgb2YgMC41cykNCiAgICAgICAgZm9yIHNlYyBpbiByYW5nZSg5MCk6DQogICAgICAgICAgICB0aW1lLnNsZWVwKDAuNSkNCiAgICAgICAgICAgIHJldCA9IFRVTk5FTF9QUk9DRVNTLnBvbGwoKQ0KICAgICAgICAgICAgaWYgcmV0IGlzIG5vdCBOb25lOg0KICAgICAgICAgICAgICAgIGxvZ190YWlsID0gVFVOTkVMX0xPRy5yZWFkX3RleHQoZW5jb2Rpbmc9J3V0Zi04JywgZXJyb3JzPSdyZXBsYWNlJylbLTMwMDA6XSBpZiBUVU5ORUxfTE9HLmV4aXN0cygpIGVsc2UgIk5vIGxvZyINCiAgICAgICAgICAgICAgICBwcmludChmIuKaoO+4jyBUdW5uZWwgcHJvY2VzcyBleGl0ZWQgdW5leHBlY3RlZGx5IHdpdGggY29kZSB7cmV0fTpcbntsb2dfdGFpbH0iLCBmbHVzaD1UcnVlKQ0KICAgICAgICAgICAgICAgIGJyZWFrDQoNCiAgICAgICAgICAgIGlmIFRVTk5FTF9MT0cuZXhpc3RzKCk6DQogICAgICAgICAgICAgICAgdGV4dCA9IFRVTk5FTF9MT0cucmVhZF90ZXh0KGVuY29kaW5nPSd1dGYtOCcsIGVycm9ycz0ncmVwbGFjZScpDQogICAgICAgICAgICAgICAgbWF0Y2hlcyA9IHJlLmZpbmRhbGwocidodHRwczovL1thLXpBLVowLTktXStcLnRyeWNsb3VkZmxhcmVcLmNvbScsIHRleHQpDQogICAgICAgICAgICAgICAgaWYgbWF0Y2hlczoNCiAgICAgICAgICAgICAgICAgICAgdHVubmVsX3VybCA9IG1hdGNoZXNbMF0NCiAgICAgICAgICAgICAgICAgICAgcHJpbnQoZiLinIUgQ2xvdWRmbGFyZSBUdW5uZWwgZXN0YWJsaXNoZWQ6IHt0dW5uZWxfdXJsfSIsIGZsdXNoPVRydWUpDQogICAgICAgICAgICAgICAgICAgIHJldHVybiB0dW5uZWxfdXJsDQoNCiAgICAgICAgICAgIGlmIChzZWMgKyAxKSAlIDEwID09IDA6DQogICAgICAgICAgICAgICAgZWxhcHNlZF9zZWMgPSAoc2VjICsgMSkgLy8gMg0KICAgICAgICAgICAgICAgIHByaW50KGYi4o+zIFdhaXRpbmcgZm9yIENsb3VkZmxhcmUgcXVpY2sgdHVubmVsIGFzc2lnbm1lbnQuLi4gKHtlbGFwc2VkX3NlY31zLzQ1cykiLCBmbHVzaD1UcnVlKQ0KDQogICAgICAgIGlmIGF0dGVtcHQgPCBtYXhfYXR0ZW1wdHM6DQogICAgICAgICAgICBwcmludCgiUmV0cnlpbmcgdHVubmVsIGNyZWF0aW9uIGluIDMgc2Vjb25kcy4uLiIsIGZsdXNoPVRydWUpDQogICAgICAgICAgICB0aW1lLnNsZWVwKDMpDQoNCiAgICBsb2dfdGFpbCA9IFRVTk5FTF9MT0cucmVhZF90ZXh0KGVuY29kaW5nPSd1dGYtOCcsIGVycm9ycz0ncmVwbGFjZScpWy00MDAwOl0gaWYgVFVOTkVMX0xPRy5leGlzdHMoKSBlbHNlICJObyBsb2cgZmlsZSBmb3VuZC4iDQogICAgcmFpc2UgUnVudGltZUVycm9yKGYiRmFpbGVkIHRvIG9idGFpbiBDbG91ZGZsYXJlIHR1bm5lbCBVUkwgYWZ0ZXIge21heF9hdHRlbXB0c30gYXR0ZW1wdHMuXG4tLS0gQ2xvdWRmbGFyZSBUdW5uZWwgTG9nIFRhaWwgLS0tXG57bG9nX3RhaWx9IikNCg0KUFVCTElDX0FQSV9VUkwgPSBzdGFydF9jbG91ZGZsYXJlX3R1bm5lbCgpDQoNCiMgUmVnaXN0ZXIgYWN0aXZlIHR1bm5lbCB3aXRoIHBlcm1hbmVudCBDbG91ZGZsYXJlIFdvcmtlciB2aWEgUE9TVCB3aXRoIFgtU3luYy1Ub2tlbiBoZWFkZXINCldPUktFUl9TWU5DX1VSTCA9ICJodHRwczovL2Nsb3RobWF0aWNzLWdob3N0LmNoaXJhZ3NoYXJtYTM3Ni53b3JrZXJzLmRldi9zZXQtdGFyZ2V0Ig0KDQp0cnk6DQogICAgaW1wb3J0IHVybGxpYi5wYXJzZQ0KICAgIHBhcnNlZF90dW5uZWwgPSB1cmxsaWIucGFyc2UudXJscGFyc2UoUFVCTElDX0FQSV9VUkwpDQogICAgaWYgcGFyc2VkX3R1bm5lbC5zY2hlbWUgPT0gImh0dHBzIiBhbmQgcGFyc2VkX3R1bm5lbC5uZXRsb2M6DQogICAgICAgIG9yaWdpbl90dW5uZWwgPSBmImh0dHBzOi8ve3BhcnNlZF90dW5uZWwubmV0bG9jfSINCiAgICAgICAgc3luY19wYXlsb2FkID0ganNvbi5kdW1wcyh7InVybCI6IG9yaWdpbl90dW5uZWx9KS5lbmNvZGUoInV0Zi04IikNCiAgICAgICAgcmVxID0gdXJsbGliLnJlcXVlc3QuUmVxdWVzdCgNCiAgICAgICAgICAgIFdPUktFUl9TWU5DX1VSTCwNCiAgICAgICAgICAgIGRhdGE9c3luY19wYXlsb2FkLA0KICAgICAgICAgICAgaGVhZGVycz17DQogICAgICAgICAgICAgICAgJ0NvbnRlbnQtVHlwZSc6ICdhcHBsaWNhdGlvbi9qc29uJywNCiAgICAgICAgICAgICAgICAnVXNlci1BZ2VudCc6ICdDbG90aE1hdGljcy1LYWdnbGUtTm9kZS85LjEuMCcsDQogICAgICAgICAgICAgICAgJ1gtU3luYy1Ub2tlbic6IFNZTkNfVE9LRU4NCiAgICAgICAgICAgIH0sDQogICAgICAgICAgICBtZXRob2Q9J1BPU1QnDQogICAgICAgICkNCiAgICAgICAgd2l0aCB1cmxsaWIucmVxdWVzdC51cmxvcGVuKHJlcSwgdGltZW91dD0xMCkgYXMgcjoNCiAgICAgICAgICAgIGRhdGEgPSBqc29uLmxvYWRzKHIucmVhZCgpLmRlY29kZSgpKQ0KICAgICAgICAgICAgcHJpbnQoZiLinIUgV09SS0VSIExJTktFRDoge2RhdGF9IikNCiAgICBlbHNlOg0KICAgICAgICBwcmludChmIuKaoO+4jyBJbnZhbGlkIHR1bm5lbCBVUkwgZm9ybWF0OiB7UFVCTElDX0FQSV9VUkx9IikNCmV4Y2VwdCBFeGNlcHRpb24gYXMgZToNCiAgICBmb3IgcHJvYyBpbiBbQVBJX1BST0NFU1MsIFRVTk5FTF9QUk9DRVNTXToNCiAgICAgICAgaWYgcHJvYy5wb2xsKCkgaXMgTm9uZToNCiAgICAgICAgICAgIHByb2MudGVybWluYXRlKCkNCiAgICByYWlzZSBSdW50aW1lRXJyb3IoJ1RoZSBuZXcgZW5naW5lIHN0YXJ0ZWQgYnV0IFdvcmtlciByZWdpc3RyYXRpb24gZmFpbGVkLiBDaGVjayB0aGUgbWF0Y2hpbmcgS2FnZ2xlIHN5bmMgc2VjcmV0IGFuZCBXb3JrZXIgY29uZmlndXJhdGlvbi4nKSBmcm9tIGUNCg0KIyAtLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0NCiMgRklOSVNIRUQhDQojIC0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLQ0KcHJpbnQoIlxuIiArICI9Iio4MCkNCnByaW50KCJDTE9USE1BVElDUyB2OS4yLjAgR0hPU1QgVk9MVU1FIEVOR0lORSBJUyBMSVZFIikNCnByaW50KCI9Iio4MCkNCnByaW50KGYi8J+RiSBQRVJNQU5FTlQgV0VCU0lURSBFTkRQT0lOVCA6IGh0dHBzOi8vY2xvdGhtYXRpY3MtZ2hvc3QuY2hpcmFnc2hhcm1hMzc2LndvcmtlcnMuZGV2L2dlbmVyYXRlIikNCnByaW50KGYi8J+RiSBBQ1RJVkUgS0FHR0xFIFRVTk5FTCAgICAgICA6IHtQVUJMSUNfQVBJX1VSTH0iKQ0KcHJpbnQoZiLimqEgQ09NUFVURSBQUkVDSVNJT04gICAgICAgICAgOiBGUDE2IChUZW5zb3IgQ29yZXMgb24gVGVzbGEgVDQpICsgRlAzMiBUaWxlZCBWQUUiKQ0KcHJpbnQoZiLwn5uh77iPIFBJUEVMSU5FIE1PREUgICAgICAgICAgICAgIDogM0QgR2hvc3QgTWFubmVxdWluIFNhZmUgQmFzZWxpbmUgKE5vbi1kZXN0cnVjdGl2ZSkiKQ0KcHJpbnQoZiJHQVJNRU5UIENPTkRJVElPTklORyAgICAgICAgIDogY2F0ZWdvcnktc3BlY2lmaWMsIHRva2VuLWJ1ZGdldGVkIG9ic2VydmVkIGRldGFpbHMiKQ0KcHJpbnQoZiJDT0xPUiBIQU5ETElORyAgICAgICAgICAgICAgIDogc1JHQiBpbnB1dDsgbm8gZ2xvYmFsIHJlY29sb3JpbmcuIFdlYnNpdGUgdmlzdWFsIGNvbXBhcmlzb24gcmVxdWlyZWQuIikNCnByaW50KGYi4o+x77iPIElOU1RSVU1FTlRBVElPTiAgICAgICAgICAgIDogU3RhZ2UgdGltaW5ncyAmIHF1YWxpdHkgc3RhdHVzIGV4cG9zZWQgaW4gcmVzcG9uc2UgaGVhZGVycyIpDQpwcmludCgiPSIqODApDQpwcmludCgi8J+SoSBSZWFkeSBmb3IgZ2VuZXJhdGlvbiByZXF1ZXN0cyB2aWEgQ2xvdWRmbGFyZSBXb3JrZXIgcHJveHkgb3IgYWN0aXZlIEthZ2dsZSB0dW5uZWwuXG4iKQ0KDQojIC0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLQ0KIyBTVEVQIDc6IFF1aWV0IGxpc3RlbmVyICYgcmVxdWVzdC1vbmx5IGRpYWdub3N0aWNzDQojIC0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLQ0KcHJpbnQoIvCfk6EgUmVhZHkuIElkbGUgb3V0cHV0IGlzIHF1aWV0OyBnZW5lcmF0aW9uIHJlcXVlc3RzIHByaW50IGRpYWdub3N0aWNzIChjZWxsIHN0YXlzIGFjdGl2ZSBbKl0pLiIpDQpwcmludCgiICAgVG8gc3RvcCB0aGUgc2VydmVyLCBjbGljayB0aGUgU3RvcCBidXR0b24gaW4gS2FnZ2xlLlxuIikNCg0KbGFzdF9hcGlfcG9zID0gbG9nX3BvcyBpZiAnbG9nX3BvcycgaW4gZ2xvYmFscygpIGVsc2UgKEFQSV9MT0cuc3RhdCgpLnN0X3NpemUgaWYgQVBJX0xPRy5leGlzdHMoKSBlbHNlIDApDQoNCnRyeToNCiAgICB3aGlsZSBUcnVlOg0KICAgICAgICB0aW1lLnNsZWVwKDEpDQoNCiAgICAgICAgIyAxLiBQcm9jZXNzIEhlYWx0aCBDaGVja3MNCiAgICAgICAgaWYgQVBJX1BST0NFU1MucG9sbCgpIGlzIG5vdCBOb25lOg0KICAgICAgICAgICAgdGFpbCA9IEFQSV9MT0cucmVhZF90ZXh0KGVuY29kaW5nPSd1dGYtOCcsIGVycm9ycz0ncmVwbGFjZScpWy0zMDAwOl0gaWYgQVBJX0xPRy5leGlzdHMoKSBlbHNlICJObyBsb2cgZmlsZS4iDQogICAgICAgICAgICBwcmludChmIlxu4p2MIEZBVEFMOiBBUEkgU2VydmVyIGRpZWQgdW5leHBlY3RlZGx5IChjb2RlIHtBUElfUFJPQ0VTUy5yZXR1cm5jb2RlfSk6XG57dGFpbH0iLCBmbHVzaD1UcnVlKQ0KICAgICAgICAgICAgYnJlYWsNCg0KICAgICAgICBpZiBUVU5ORUxfUFJPQ0VTUy5wb2xsKCkgaXMgbm90IE5vbmU6DQogICAgICAgICAgICB0YWlsID0gVFVOTkVMX0xPRy5yZWFkX3RleHQoZW5jb2Rpbmc9J3V0Zi04JywgZXJyb3JzPSdyZXBsYWNlJylbLTMwMDA6XSBpZiBUVU5ORUxfTE9HLmV4aXN0cygpIGVsc2UgIk5vIGxvZyBmaWxlLiINCiAgICAgICAgICAgIHByaW50KGYiXG7inYwgRkFUQUw6IENsb3VkZmxhcmUgVHVubmVsIGRpZWQgdW5leHBlY3RlZGx5IChjb2RlIHtUVU5ORUxfUFJPQ0VTUy5yZXR1cm5jb2RlfSk6XG57dGFpbH0iLCBmbHVzaD1UcnVlKQ0KICAgICAgICAgICAgYnJlYWsNCg0KICAgICAgICAjIDIuIFN0cmVhbSBuZXcgQVBJIGxvZ3MgaW4gcmVhbCB0aW1lIChyZXF1ZXN0cywgcHJvY2Vzc2luZywgMjAwIE9LKQ0KICAgICAgICBpZiBBUElfTE9HLmV4aXN0cygpOg0KICAgICAgICAgICAgY3Vycl9zaXplID0gQVBJX0xPRy5zdGF0KCkuc3Rfc2l6ZQ0KICAgICAgICAgICAgaWYgY3Vycl9zaXplID4gbGFzdF9hcGlfcG9zOg0KICAgICAgICAgICAgICAgIHRyeToNCiAgICAgICAgICAgICAgICAgICAgd2l0aCBBUElfTE9HLm9wZW4oJ3InLCBlbmNvZGluZz0ndXRmLTgnLCBlcnJvcnM9J3JlcGxhY2UnKSBhcyBsZjoNCiAgICAgICAgICAgICAgICAgICAgICAgIGxmLnNlZWsobGFzdF9hcGlfcG9zKQ0KICAgICAgICAgICAgICAgICAgICAgICAgbmV3X2NvbnRlbnQgPSBsZi5yZWFkKCkNCiAgICAgICAgICAgICAgICAgICAgICAgIGxhc3RfYXBpX3BvcyA9IGxmLnRlbGwoKQ0KICAgICAgICAgICAgICAgICAgICAgICAgaWYgbmV3X2NvbnRlbnQ6DQogICAgICAgICAgICAgICAgICAgICAgICAgICAgZm9yIHJhd19saW5lIGluIG5ld19jb250ZW50LnNwbGl0bGluZXMoKToNCiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgc2xpbmUgPSByYXdfbGluZS5zdHJpcCgpDQogICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIGlmIHNsaW5lOg0KICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgcHJpbnQoZiIgIHtzbGluZX0iLCBmbHVzaD1UcnVlKQ0KICAgICAgICAgICAgICAgIGV4Y2VwdCBFeGNlcHRpb246DQogICAgICAgICAgICAgICAgICAgIHBhc3MNCg0KZXhjZXB0IEtleWJvYXJkSW50ZXJydXB0Og0KICAgIHByaW50KCJcbvCfm5EgU3RvcCByZXF1ZXN0ZWQgYnkgdXNlciAoS2V5Ym9hcmRJbnRlcnJ1cHQpLiIpDQpmaW5hbGx5Og0KICAgIHByaW50KCJTaHV0dGluZyBkb3duIEFQSSBzZXJ2ZXIgYW5kIENsb3VkZmxhcmUgdHVubmVsLi4uIikNCiAgICBmb3IgcHJvYyBpbiBbQVBJX1BST0NFU1MsIFRVTk5FTF9QUk9DRVNTXToNCiAgICAgICAgaWYgcHJvYyBhbmQgcHJvYy5wb2xsKCkgaXMgTm9uZToNCiAgICAgICAgICAgIHRyeToNCiAgICAgICAgICAgICAgICBwcm9jLnRlcm1pbmF0ZSgpDQogICAgICAgICAgICAgICAgcHJvYy53YWl0KHRpbWVvdXQ9MykNCiAgICAgICAgICAgIGV4Y2VwdCBFeGNlcHRpb246DQogICAgICAgICAgICAgICAgcHJvYy5raWxsKCkNCiAgICBmb3IgZmhfbmFtZSBpbiBbJ0FQSV9MT0dfRklMRScsICdUVU5ORUxfTE9HX0ZJTEUnXToNCiAgICAgICAgaWYgZmhfbmFtZSBpbiBnbG9iYWxzKCk6DQogICAgICAgICAgICB0cnk6DQogICAgICAgICAgICAgICAgZ2xvYmFscygpW2ZoX25hbWVdLmNsb3NlKCkNCiAgICAgICAgICAgIGV4Y2VwdCBFeGNlcHRpb246DQogICAgICAgICAgICAgICAgcGFzcw0KICAgIHByaW50KCLwn5GLIENsZWFuIHNodXRkb3duIGNvbXBsZXRlLiBLYWdnbGUgcmVzb3VyY2VzIHJlbGVhc2VkLiIpDQo=__CLOTHMATICS_KAGGLE_SOURCE_BASE64_END__*/
