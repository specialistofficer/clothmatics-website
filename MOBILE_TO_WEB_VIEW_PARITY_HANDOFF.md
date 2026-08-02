# ClothMatics Website V2 — Mobile Feature Audit and View-Parity Implementation Brief

## Instructions for the website Codex task

Work inside the existing `clothmatic_website_v2` project. Before changing code,
inspect the current website implementation and compare it with the mobile source
files named in this brief. Do not blindly rebuild features that already exist.

For every feature in the matrix below, classify the website implementation as:

1. **Complete** — already matches the mobile data and intended web behavior.
2. **Partial** — present, but missing data, details, or mobile parity.
3. **Missing but readable** — Firestore already stores the data and the website
   can display it after authenticated queries/rules/indexes are added.
4. **Mobile-local only** — the mobile app keeps the result in AsyncStorage or
   device state, so it cannot be displayed on another device until the mobile
   app starts syncing that data to Firestore.
5. **Intentionally excluded from web** — mobile-only mutation, camera,
   extraction, native notification, or device-specific behavior.

Implement only categories 2 and 3 unless this brief explicitly permits another
action. Report category 4 items as a data limitation; do not invent placeholder
data or silently introduce new mobile writes.

---

## Product goal

The authenticated website should become a polished, responsive, **view-first
companion** to the ClothMatics mobile app.

Users should be able to sign in with the same account and inspect:

- their wardrobe and garment intelligence;
- favorites and Lookbook;
- saved and generated outfits;
- their full-month outfit planner;
- wear history and cost-per-wear insights;
- profile and style preferences;
- Closet Quest progress, scores, streaks, points, and badges;
- useful home insights and summaries;
- any other cross-device data that is already persisted in Firestore.

The existing website outfit generator must remain available.

The website is **not** a replacement for mobile garment capture or editing.

---

## Non-negotiable boundaries

### Keep the website read-only for mobile-managed product data

Do not let the website create, update, or delete:

- wardrobe garments;
- garment images or metadata;
- favorites or Lookbook membership;
- saved outfits or user-created looks;
- outfit calendar plans or wear records;
- style profile answers;
- Closet Quest submissions;
- challenge definitions;
- user profile/selfie data;
- feedback/style-learning events.

The existing authenticated website outfit-generation request may remain. The
existing administrator coupon workflow may also remain because it is already a
deliberate admin capability.

### Do not add mobile image-processing features

Do not copy, modify, or reimplement:

- camera capture;
- Auto Extract;
- Style Check image processing;
- Single Garment extraction;
- background removal;
- segmentation;
- crop/rotate/refine selection;
- accessory capture;
- selfie analysis;
- model download/setup.

Do not modify any extraction code in the mobile project.

### No website notifications

Do not:

- request browser notification permission;
- use Firebase Messaging on the website;
- create a service worker for push;
- show notification settings;
- schedule outfit reminders;
- reproduce Closet Quest notifications;
- reproduce the mobile 10-item unlock notification.

Calendar reminder metadata may be shown as informational text only if it already
exists in Firestore.

### Preserve the current stack and visual identity

The website is currently vanilla HTML, CSS, and JavaScript deployed on
Cloudflare Pages. Do not migrate it to React or introduce a new application
framework.

Continue using the existing ClothMatics design language:

- primary purple `#6C63FF`;
- pink accent `#FF4FA3`;
- deep indigo `#2D1B69`;
- light background `#F8F7FF`;
- white cards and soft lavender surfaces;
- restrained gradients;
- rounded 20–24px cards;
- clear responsive desktop/tablet/mobile layouts.

Reuse existing CSS components and tokens before adding new ones.

---

## Current website: confirmed implementation

Audit these files first:

- `index.html`
- `styles.css`
- `app.js`
- `config.js`
- `functions/api/generate-outfit.js`
- `admin.html`
- `admin.js`
- `admin.css`
- `firestore.rules` if present
- `firestore.indexes.json` if present

The current website already has:

- Firebase email/password and Google authentication;
- persistent signed-in sessions;
- public marketing pages;
- authenticated Overview, Wardrobe, Lookbook, and AI Stylist panels;
- `users/{uid}` profile read;
- owner-filtered `wardrobe` read;
- owner-filtered `savedOutfits` read;
- wardrobe totals, favorites, recent items, search, and filters;
- Lookbook garments and saved/custom look cards;
- protected online outfit generation through
  `functions/api/generate-outfit.js`;
- a read-only admin activity dashboard;
- admin user detail views;
- model/provider/API health reporting;
- admin coupon creation and coupon library.

Do not duplicate these. Enhance them where the matrix identifies partial
coverage.

---

## Mobile-to-web feature matrix

| Product area | Mobile capability | Current website | Required website outcome |
|---|---|---|---|
| Authentication | Login, registration, Google sign-in, persistent session, verification | Mostly present | Retain. Clearly handle unverified email and expired sessions without exposing data. |
| Home | Weather-aware outfit, planner preview, wardrobe summary, AI Stylist, Wardrobe Assistant, Closet Quest, nudges | Partial overview only | Build a compact personalized overview using stored data. Do not fake live weather or mobile-local results. |
| Wardrobe | Search, filters, category counts, favorites, laundry state, detailed metadata, sharing, editing | Basic grid/search/filter | Add rich read-only detail drawer/modal, category summaries, status chips, value/wear data, and safe image preview. |
| Garment capture | Auto Extract, Style Check, Single Garment, accessories, crop/rotate, background removal | Correctly absent | Keep absent. Show “Manage in mobile app” entry points only. |
| Lookbook | Lookbook garments, user-created looks, challenge looks, saved outfit details, sharing | Partial cards | Separate user-created Lookbook looks from AI saved outfits and add complete read-only detail views. |
| AI Stylist | Occasion, mood, custom preference, weather/profile-aware selection, complete outfit enforcement, alternatives | Basic generation | Preserve generation and enrich request/result parity where server-safe. Do not expose API keys. |
| Style This | Start with selected garment; wardrobe-only or complete-the-look modes | Missing | Optional later phase. If added, use selected existing item and protected server endpoint; never modify wardrobe. |
| Outfit Planner | Full current-month calendar, date thumbnails, planned/worn state, full look, reminders | Missing | Add full read-only month calendar and look details from `outfitWear`. No planning/edit/delete/reminder controls. |
| Cost per wear | Purchase value, wear count, per-wear cost, totals | Missing | Add read-only dashboard calculated from wardrobe fields and wear history. |
| Wardrobe Assistant | Destination/trip query, day-by-day looks, packing list, missing items | Missing; current mobile result is device-local | Do not fake parity. Explain data limitation. Add only after results are persisted server-side in a future mobile change. |
| Profile | Personal details, DOB, body type, city, profession, subscription, selfie | Basic name only | Add privacy-aware read-only profile summary. Never display the selfie publicly or to other users. |
| Style Profile | Gender-aware questionnaire, fit, colors, exclusions, lifestyle, comfort, expression | Missing | Display saved `users/{uid}.preferences` as a read-only style profile summary. |
| Style learning | Feedback events and device-computed learned profile | Mostly device-local | Do not claim cross-device learned-profile parity. Website may show simple counts only if Firestore rules safely allow them. |
| Closet Quest | Eligibility, daily/published challenge, one attempt, score, history, points, streak, badges | Missing | Add complete read-only progress and history. No play, retry, submission, upload, or notifications. |
| Sharing | Branded share cards for garments, looks, recommendations, planned outfits | Missing | Optional browser Share/Download for already-visible data, with no database mutation. Must use one compact template. |
| Subscription | Plan, premium expiry, coupon redemption | Not shown to user; admin coupons exist | Add read-only plan/status summary. Do not add user coupon redemption unless separately approved. |
| Admin users | Users, profiles, activity, garments, generated outfits/API use | Present | Retain; improve only if new collections need read-only visibility. |
| Admin challenges | Publish challenges with optional reference image | Mobile admin only | Do not add challenge publishing in this view-parity phase. Optional read-only list of published challenges. |
| Admin notifications | Push campaigns and preferences | Mobile only | Exclude completely from website. |

---

## Required authenticated website information architecture

Keep navigation compact. Recommended structure:

1. **Overview**
2. **Wardrobe**
3. **Looks**
4. **Planner**
5. **Insights**
6. **Closet Quest**
7. **AI Stylist**
8. **Profile**

On small screens use a compact drawer or horizontally scrollable section
navigation. Do not create an oversized mobile-style bottom bar on desktop.

“Looks” may contain tabs:

- Lookbook
- Saved AI outfits
- Challenge looks

“Insights” may contain:

- Cost per wear
- wear activity
- wardrobe distribution
- underused garments

Do not create a separate page for every small metric.

---

## Detailed implementation requirements

### 1. Overview

Enhance the existing overview without making it a long feed.

Show:

- greeting based on the signed-in user’s local browser time;
- total wardrobe items;
- favorites;
- Lookbook looks/items;
- planned looks this month;
- completed Closet Quests;
- recently added garments;
- next planned outfit, when stored;
- a Closet Quest preview only when the user has at least 10 wardrobe items;
- compact category distribution;
- links into Planner, Insights, Closet Quest, and AI Stylist.

If no next planned outfit exists, show a useful empty state and link to the
mobile app. Do not auto-generate or write an outfit just to fill the card.

Do not show weather claims unless the website has verified weather data for the
user’s selected/current city. Never reuse stale weather text from an unrelated
place.

### 2. Wardrobe

Retain the existing owner-filtered wardrobe query and current search.

Add:

- category filter based on normalized categories;
- color filter;
- season and occasion filters;
- favorites filter;
- laundry/status filter;
- category totals such as “5 tops, 4 bottoms, 2 footwear”;
- “Footwear” as the umbrella label for shoes, sandals, slippers, flip-flops,
  boots, heels, and similar subcategories;
- card chips for favorite, Lookbook, laundry status, and hidden-from-AI;
- click/tap to open a read-only garment detail modal or side sheet.

The garment detail must safely display available fields:

- image;
- title;
- category and subcategory;
- role/layer role;
- brand;
- primary and secondary colors;
- pattern;
- fit;
- material;
- sleeve and neckline;
- season;
- occasions and activity suitability;
- formality;
- set type/components where applicable;
- remarks/tags/AI description;
- favorite and Lookbook membership;
- laundry status;
- purchase year and price;
- times worn and last worn;
- calculated cost per wear;
- user-confirmed/hidden-from-AI state.

Legacy documents will not contain every field. Treat absent values as
“Not provided”; do not crash and do not infer gender from a garment image.

No edit, delete, favorite toggle, Lookbook toggle, crop, background removal, or
upload buttons.

### 3. Looks and saved outfits

The website currently combines Lookbook garments and saved outfits too loosely.
Use the saved outfit fields to distinguish:

- `lookbook === true` or `source === "user_created"` → user-created Lookbook;
- `source === "ai_recommendation"` or missing legacy source → saved AI outfit;
- `source === "style_challenge"` → Closet Quest look.

Each look detail should show:

- title and subtitle;
- occasion/source;
- score when available;
- all resolved wardrobe garments;
- category role of each piece;
- reasoning and shopping suggestions when present;
- created date;
- challenge relationship when present;
- broken/missing-item notice when referenced garment IDs no longer resolve.

Resolve `wardrobeItemIds` against the already loaded wardrobe map. Do not trust
or render raw HTML from Firestore.

### 4. AI Stylist

Preserve the existing server-protected generator and current one-recommendation
website limit unless product policy is deliberately changed.

Audit the existing request against the current mobile recommendation inputs:

- profile gender;
- date of birth/age band;
- body type;
- skin tone where appropriate;
- profession/city;
- saved style preferences;
- occasion;
- mood;
- custom preference;
- wardrobe metadata;
- unavailable/laundry/hidden-from-AI items;
- garment roles and standalone/set semantics.

Add mood selection to the web form. Keep custom preference optional.

The generated result must:

- contain a complete wearable outfit;
- enforce a bottom when the selected outfit is not a one-piece/traditional
  complete set;
- not treat outerwear as a base top when `requiresBaseLayer` is true;
- avoid duplicate use of the same wardrobe item;
- respect laundry and `hiddenFromAI`;
- correctly handle traditional sets and one-pieces;
- show all selected garments with images and roles;
- show score, title, subtitle, reasons, and missing-item suggestions;
- reject unknown IDs returned by AI;
- display the standard high-usage message when all providers are unavailable.

Any provider key must stay in the Cloudflare function/environment. Never ship a
Gemini or Groq key to browser JavaScript.

Do not add “Save outfit,” “Plan this look,” feedback writes, or “Not for me”
unless separately approved because this phase is view-first/read-only.

### 5. Full-month outfit planner

Read owner-filtered documents from `outfitWear`.

Build a real month view:

- correct number of days for the selected month;
- weekday alignment;
- previous/next month controls;
- today indicator based on the browser’s local date;
- thumbnails for dates containing planned/worn outfits;
- count badge for multiple looks on one date;
- planned versus worn status;
- selected-day detail under or beside the calendar;
- “Open full look” that resolves the outfit snapshot or matching saved outfit;
- responsive layout matching the current website theme.

Show reminder time/timing only as existing metadata. Do not schedule, change, or
cancel reminders on web.

Do not show planning forms, date editing, mark-worn, or delete controls.

### 6. Cost-per-wear and wardrobe insights

Calculate from wardrobe fields:

```text
costPerWear = purchasePrice / timesWorn
```

Only calculate a numeric cost per wear when `purchasePrice > 0` and
`timesWorn > 0`. Never divide by zero.

Show:

- total recorded wardrobe investment;
- total recorded wears;
- average cost per recorded wear;
- best-value items;
- never-worn priced items;
- most-worn garments;
- least-used garments;
- category distribution;
- optional recent wear activity from `outfitWear`.

Currency should follow the stored/user locale when available; otherwise retain
the product’s current INR presentation.

These are read-only calculations; do not update wear counts.

### 7. Profile and style profile

Create a privacy-aware profile section for the signed-in owner.

Personal summary may show:

- full name;
- city;
- profession;
- gender;
- date of birth or derived age band;
- self-reported body type;
- height/weight only if the product deliberately wants them visible to the
  signed-in user;
- profile completion;
- subscription plan and expiry.

Style summary should render `preferences`:

- fit preference;
- style lean;
- coverage rules;
- hard exclusions;
- temperature sensitivity;
- daily environment;
- commute;
- favorite and avoided colors;
- color mood;
- footwear comfort;
- open-footwear restriction;
- styling priority;
- women’s wardrobe direction where relevant;
- men’s shirt styling and silhouette where relevant;
- style expression;
- questionnaire completion status.

Gender-specific fields must be displayed only when relevant. Do not show empty
female-only values to a male profile or vice versa.

Do not add editing, selfie upload, or retake-selfie controls.

Do not show the stored selfie by default. It is sensitive profile data and is
not needed for web wardrobe browsing.

### 8. Closet Quest

Read:

- `styleChallenges` for published challenge definitions when rules allow;
- `styleChallengeSubmissions` filtered by the signed-in `userId`;
- `wardrobe` and `savedOutfits` already loaded.

Eligibility:

- locked when fewer than 10 wardrobe items are available;
- unlocked at 10 or more;
- the web page must explain the requirement without triggering a notification.

Display:

- current active published quest when one is stored and active;
- existing personal submission/history;
- reference garment image for an admin challenge, if present;
- challenge title, prompt, mood, occasion, and anchor category;
- one-attempt/completed state;
- total points;
- personal best;
- current streak and longest streak;
- seven-day activity row;
- score breakdown;
- improvement tip;
- garments used;
- whether the result was saved to Lookbook;
- earned and locked badges;
- history cards.

Use a premium badge/streak presentation consistent with the mobile direction:
shield/hexagonal achievement badges, earned color treatments, muted locked
states, progress bars, and an orange streak accent. Implement with CSS/SVG or
existing icon assets; do not require generated raster artwork.

Compute statistics deterministically from submission dates and points. Use the
user’s local date for day boundaries and deduplicate multiple records on the
same date.

Suggested initial badge rules, matching the current individual-only feature:

- First Quest — complete 1 quest;
- One Week In — 7 active/completed days;
- Focused 10 — complete 10 quests;
- Monthly Master — complete 30 quests;
- High Scorer — reach a score threshold defined by the mobile logic;
- Streak badges for 3, 7, 14, and 30 days.

Before hard-coding thresholds, inspect the mobile badge/streak implementation
and mirror its exact rules.

Do not allow:

- play/start;
- retry;
- garment selection;
- selfie or image upload;
- submission;
- score generation;
- saving to Lookbook;
- challenge notification settings;
- community posting;
- admin challenge creation.

The current Quest score is application-side deterministic scoring, not a new AI
call. The website must not call AI for historical score display.

### 9. Wardrobe Assistant / trip planner

The current mobile `TripPackingScreen` stores the latest result in
`AsyncStorage`, not Firestore. Therefore the website cannot retrieve that
mobile result across devices today.

For this phase:

- do not show fabricated trip plans;
- do not independently call AI and imply it is the same mobile history;
- include a tasteful unavailable/coming-later state only if a navigation entry
  is useful;
- document the missing persistence as a prerequisite.

A later cross-device phase would need an owner-scoped collection such as
`wardrobeAssistantPlans` containing the query, destination, duration,
day-by-day outfits, item IDs, packing list, missing items, timestamps, and
schema version. That mobile/backend change is outside this task.

### 10. Sharing

Optional, because it does not require a Firestore mutation:

- allow browser-native share when supported;
- otherwise download a single branded card image;
- support a garment, saved look, generated result, and planned outfit;
- include the signed-in user’s display name;
- label the source accurately, for example “Chirag’s planned look for 24 July”
  or “Chirag’s generated outfit”;
- use one responsive, compact ClothMatics template;
- make garment imagery fill its allocated regions without distortion;
- avoid large unused canvas space.

Never expose private IDs, email addresses, Firebase URLs with tokens, or raw
profile attributes in a share card.

### 11. Subscription status

Display the signed-in user’s current plan using the existing user document
shape:

- plan/free state;
- premium expiry;
- last coupon only if appropriate for the user to see.

Do not add payments or coupon redemption in this task.

### 12. Admin parity

The website admin already has users, activity, service health, model
distribution, user details, images, and coupons. Preserve those behaviors.

Extend read-only admin summaries only where useful:

- planned/worn outfit count;
- Closet Quest completion count and points;
- current subscription state;
- per-user successful AI activity;
- read-only published challenge list.

Do not add:

- push campaign creation;
- browser notifications;
- challenge publishing/editing;
- image extraction controls.

Do not weaken the existing `admin: true` custom-claim check.

---

## Firestore data contract

Use the existing production field names. Tolerate missing fields on legacy
documents.

### `users/{uid}`

Relevant fields include:

```text
uid
fullName
displayName
email
gender
height
weight
profession
city
dateOfBirth
bodyTypeSelfReported
profileCompletion
profileCompleted
aiAnalysis
preferences
preferencesVersion
subscription
createdAt
updatedAt
```

### `wardrobe/{itemId}`

Owner field: `userId`.

Important fields include:

```text
image
title
type
category
subCategory
categoryRole
layerRole
requiresBaseLayer
standaloneOutfit
userOccasions
activitySuitability
userRestrictions
userConfirmed
setType
includedComponents
requiredComponents
piecesSeparable
bodyZone
companionGroup
brand
primaryColor
secondaryColors
pattern
fit
material
sleeveType
neckline
season
occasion
formality
favorite
inLookbook
laundryStatus
remarks
tags
aiDescription
purchaseYear
purchasePrice
rating
lastWorn
timesWorn
hiddenFromAI
bgRemoved
createdAt
```

### `savedOutfits/{outfitId}`

Owner field: `userId`.

```text
occasion
outfit
wardrobeItemIds
lookbook
source
challengeId
challengeSubmissionId
createdAt
```

Nested `outfit` can contain:

```text
score
title
subtitle
wardrobeItemIds
reasoning
shoppingSuggestions
explorationPick
rankingTrace
```

### `outfitWear/{recordId}`

Owner field: `userId`.

```text
outfitId
wearDate
occasion
notes
status
outfit
wardrobeItemIds
reminderAt
reminderTiming
createdAt
updatedAt
```

### `styleChallenges/{challengeId}`

Read published definitions only:

```text
title
prompt
occasion
mood
anchorCategory
startDate
endDate
status
referenceImageUrl
referenceItemTitle
createdAt
```

### `styleChallengeSubmissions/{submissionId}`

Owner field: `userId`.

```text
challengeId
challengeDateKey
challengeTitle
anchorItemId
wardrobeItemIds
score
pointsEarned
visibility
shareEnabled
scoringVersion
challengeSnapshot
createdAt
```

### Optional supporting reads

Use only if existing rules permit and the UI genuinely needs them:

- `users/{uid}/styleEvents` — counts/learning activity, not raw public data;
- `users/{uid}/outfitFeedback` — private feedback history;
- `analytics/...` — admin only;
- `coupons` — admin only.

Never read another user’s private wardrobe/profile data in the regular
dashboard.

---

## Firestore query and security requirements

All user collection queries must be owner-filtered:

```js
query(collection(db, "wardrobe"), where("userId", "==", user.uid))
query(collection(db, "savedOutfits"), where("userId", "==", user.uid))
query(collection(db, "outfitWear"), where("userId", "==", user.uid))
query(collection(db, "styleChallengeSubmissions"), where("userId", "==", user.uid))
```

Use client-side sorting when that avoids an unnecessary composite index and the
document volume is bounded. If server ordering is required, add the minimum
composite indexes:

- `savedOutfits`: `userId ASC, createdAt DESC`
- `outfitWear`: `userId ASC, wearDate DESC`
- `styleChallengeSubmissions`: `userId ASC, createdAt DESC`
- `styleChallenges`: `status ASC, createdAt DESC` if matching mobile lookup

Do not deploy rules or indexes automatically. Produce the exact rule/index diff
and deployment instructions for the project owner.

Rules must enforce:

- authenticated owner read for user-private collections;
- no website write broadening;
- admin reads require the existing `admin: true` claim;
- public/published challenge definition reads expose only intended challenge
  documents;
- no general list access to user profiles or wardrobes.

If current production rules do not allow a required safe read, report it. Do
not replace secure rules with permissive test rules.

---

## Loading, caching, and performance

Extend the current authenticated load flow without creating repeated reads on
every panel switch.

Recommended state:

```js
{
  user: null,
  profile: null,
  wardrobe: [],
  outfits: [],
  wearRecords: [],
  challengeDefinitions: [],
  challengeSubmissions: [],
  panel: "overview"
}
```

Requirements:

- fetch owner-scoped collections once after authentication;
- create `Map` lookups for wardrobe and saved outfits;
- derive filtered views in memory;
- show per-section loading/empty/error states;
- invalidate all private state on sign-out;
- do not put Firestore documents containing private data in persistent browser
  storage;
- lazy-load below-the-fold garment images;
- use safe URL validation;
- escape all Firestore text before inserting HTML;
- avoid N+1 document reads.

---

## Responsive UI and accessibility

- Maintain usable desktop, tablet, and mobile layouts.
- Modals/drawers must trap focus and close with Escape.
- All controls need keyboard focus styles and accessible labels.
- Do not use emoji as the only meaning-bearing icon.
- Images need meaningful alt text or empty alt when decorative.
- Use skeletons/spinners consistent with the current dashboard.
- Empty states must explain whether an action belongs in the mobile app.
- Long garment/look titles must wrap or clamp without hiding critical category
  information.
- Do not reproduce oversized mobile cards verbatim on desktop.

---

## Recommended implementation sequence

### Phase 1 — Audit and shared data layer

1. Inspect all current website files.
2. Create a written complete/partial/missing/excluded checklist.
3. Extend authenticated reads for `outfitWear` and
   `styleChallengeSubmissions`.
4. Add safe helper functions for dates, currency, garment taxonomy, role
   normalization, lookup maps, and private-state cleanup.
5. Confirm Firestore rule/index requirements before UI work.

### Phase 2 — Core view parity

1. Wardrobe detail modal and richer filters/counts.
2. Lookbook/saved AI/challenge look separation and detail modal.
3. Full-month read-only outfit calendar.
4. Cost-per-wear and wardrobe insights.
5. Read-only profile and style-profile summary.

### Phase 3 — Engagement views

1. Closet Quest eligibility and current challenge.
2. Points, scores, history, streak, and badges.
3. Overview widgets for the next planned look and Quest.
4. Optional branded browser share cards.

### Phase 4 — AI Stylist parity and QA

1. Audit the protected generation payload against mobile metadata.
2. Add mood and profile/style context safely.
3. Enforce complete outfit validation and safe ID resolution.
4. Test male, female, one-piece, traditional-set, outerwear, light wardrobe,
   laundry, missing-item, and provider-failure scenarios.

Do not begin Wardrobe Assistant cross-device history until persistence is
designed and approved separately.

---

## Required validation scenarios

### Security

- Signed-out visitors cannot load private panels or data.
- User A cannot query User B’s wardrobe, looks, plans, submissions, or profile.
- Signing out clears all rendered private data.
- Admin routes still require the custom claim.
- No AI secret appears in browser source, network payloads, or committed config.

### Legacy data

- Garments missing new metadata render safely.
- Saved outfits referencing deleted garments show a warning.
- Missing challenge snapshots do not crash history.
- Missing purchase price/times worn does not produce `NaN` or infinity.

### Planner

- February and leap-year months align correctly.
- Month start weekday is correct.
- Local “today” is correct.
- Multiple looks on one date show a count.
- Open full look resolves snapshot/saved data correctly.

### Gender and taxonomy

- A male profile is not summarized using female-only questionnaire labels.
- One-piece/traditional garments are not counted as shirts.
- Sandals/slippers/flip-flops appear under Footwear.
- Outerwear is not described as a complete base top.

### Closet Quest

- Under 10 items shows locked state.
- At 10 items shows eligible state.
- Completed challenge cannot appear playable on web.
- Multiple submissions on one date count once for streak.
- Score parts total and render correctly.
- Locked/earned badge visuals are distinct.

### AI result

- Shirt + footwear without a required bottom is rejected.
- Dress/one-piece does not require an artificial bottom.
- Blazer that requires a base layer cannot replace the base.
- Duplicate item IDs are rejected.
- Missing or foreign IDs are ignored/rejected.
- High provider usage shows the approved friendly error.

### Responsive and accessibility

- Test at 360px, 768px, 1024px, and wide desktop.
- All panels work with keyboard navigation.
- Modals restore focus on close.
- No horizontal overflow.
- Images retain aspect ratio without distortion.

---

## Deliverables

The website Codex task must provide:

1. Updated website code using the existing vanilla stack.
2. A short audit table showing what was already present, enhanced, added,
   excluded, or blocked by mobile-local storage.
3. Any required Firestore rule changes as a reviewable diff.
4. Any required Firestore composite indexes as a reviewable diff.
5. Manual deployment steps; do not deploy automatically.
6. A QA report covering the validation scenarios above.
7. A concise list of future work, especially Wardrobe Assistant persistence.

---

## Mobile source-of-truth references

Use these mobile files to confirm behavior and field names. Read them; do not
edit extraction code.

### Navigation and product inventory

- `D:\stylemateai\StyleMateAI\src\navigation\AppNavigator.tsx`
- `D:\stylemateai\StyleMateAI\src\navigation\MainTabs.tsx`

### Home, wardrobe, looks, profile

- `D:\stylemateai\StyleMateAI\src\screens\HomeScreen.tsx`
- `D:\stylemateai\StyleMateAI\src\screens\WardrobeScreen.tsx`
- `D:\stylemateai\StyleMateAI\src\screens\WardrobeItemDetailScreen.tsx`
- `D:\stylemateai\StyleMateAI\src\screens\SavedOutfitDetailScreen.tsx`
- `D:\stylemateai\StyleMateAI\src\screens\CreateLookScreen.tsx`
- `D:\stylemateai\StyleMateAI\src\screens\ProfileScreen.tsx`
- `D:\stylemateai\StyleMateAI\src\screens\StyleProfileScreen.tsx`

### Stylist, planner, insights, assistant

- `D:\stylemateai\StyleMateAI\src\screens\AIStylistScreen.tsx`
- `D:\stylemateai\StyleMateAI\src\screens\StylistRecommendationScreen.tsx`
- `D:\stylemateai\StyleMateAI\src\screens\StyleThisScreen.tsx`
- `D:\stylemateai\StyleMateAI\src\screens\OutfitCalendarScreen.tsx`
- `D:\stylemateai\StyleMateAI\src\screens\CostPerWearScreen.tsx`
- `D:\stylemateai\StyleMateAI\src\screens\TripPackingScreen.tsx`
- `D:\stylemateai\StyleMateAI\src\services\recommendationService.ts`
- `D:\stylemateai\StyleMateAI\src\services\outfitWearService.ts`
- `D:\stylemateai\StyleMateAI\src\services\savedOutfitService.ts`

### Closet Quest

- `D:\stylemateai\StyleMateAI\src\screens\StyleChallengeHubScreen.tsx`
- `D:\stylemateai\StyleMateAI\src\screens\StyleChallengePlayScreen.tsx`
- `D:\stylemateai\StyleMateAI\src\screens\StyleChallengeResultScreen.tsx`
- `D:\stylemateai\StyleMateAI\src\services\styleChallengeService.ts`
- `D:\stylemateai\StyleMateAI\src\utils\styleChallengeScoring.ts`
- `D:\stylemateai\StyleMateAI\src\types\styleChallenge.ts`

### Data models

- `D:\stylemateai\StyleMateAI\src\types\wardrobe.ts`
- `D:\stylemateai\StyleMateAI\src\types\profile.ts`
- `D:\stylemateai\StyleMateAI\src\types\stylist.ts`
- `D:\stylemateai\StyleMateAI\src\types\admin.ts`
- `D:\stylemateai\StyleMateAI\src\services\profileService.ts`
- `D:\stylemateai\StyleMateAI\src\services\wardrobeService.ts`

### Admin

- `D:\stylemateai\StyleMateAI\src\screens\AdminDashboardScreen.tsx`
- `D:\stylemateai\StyleMateAI\src\screens\AdminUserProfileScreen.tsx`
- `D:\stylemateai\StyleMateAI\src\screens\AdminStyleChallengeScreen.tsx`
- `D:\stylemateai\StyleMateAI\src\services\adminService.ts`
- `D:\stylemateai\StyleMateAI\src\services\subscriptionService.ts`

---

## Definition of done

The website is complete for this phase when:

- existing wardrobe, Lookbook, authentication, AI generation, and admin
  functionality still works;
- users can inspect all Firestore-backed mobile data identified above through a
  coherent responsive dashboard;
- wardrobe, looks, planner, cost-per-wear, profile, and Closet Quest each have
  useful read-only detail experiences;
- the website does not upload, extract, edit, delete, schedule notifications,
  or mutate mobile-managed data;
- Wardrobe Assistant is honestly marked as blocked by device-local persistence
  rather than being faked;
- Firestore ownership remains enforced;
- no mobile extraction code is changed;
- all required manual deployment steps and security diffs are documented.

## Superseding August 2026 parity note

The 2 August implementation deliberately supersedes the older blanket no-write statement only for: owner-created Lookbook outfits, owner planner/wear records, protected AI generation and attributed sharing. Garment records, images, favorites, laundry, profiles, challenges and image-processing workflows remain mobile-managed.

New parity includes shared taxonomy/search, date-clamped planning with idempotent generation acceptance, deterministic weekly reporting, free/premium Smart Purchase separation, Festival Stylist campaigns, central server prompt identity, callable sharing, and custom-claim administrator push campaigns. See `FEATURE_AUDIT.md` and `tests/` for current contracts and evidence.
