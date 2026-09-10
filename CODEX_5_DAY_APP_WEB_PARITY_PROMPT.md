# Codex task: close the last-five-day ClothMatics app/web functionality gap

Work in `D:\stylemateai\clothmatic_website_v2`. Treat `D:\stylemateai\StyleMateAI` as the authoritative, read-only product reference. Do not edit the mobile repository during this task.

The relevant development window is 29 July–2 August 2026. Audit the current website before coding; several older parity features already exist and must be extended rather than duplicated.

## Objective

Bring the authenticated website and website admin portal into practical parity with the recent mobile features where the browser can safely support them. Preserve mobile-only garment capture and extraction. Deliver working functionality, responsive UI, security-rule changes if required, tests, and updated parity documentation.

## Authoritative mobile references

Inspect these current files before implementation:

- `D:\stylemateai\StyleMateAI\src\screens\CreateLookScreen.tsx`
- `D:\stylemateai\StyleMateAI\src\utils\garmentTaxonomy.ts`
- `D:\stylemateai\StyleMateAI\src\screens\OutfitCalendarScreen.tsx`
- `D:\stylemateai\StyleMateAI\src\screens\SmartPurchaseCheckScreen.tsx`
- `D:\stylemateai\StyleMateAI\src\services\smartPurchaseAiService.ts`
- `D:\stylemateai\StyleMateAI\src\screens\WeeklyClosetReportScreen.tsx`
- `D:\stylemateai\StyleMateAI\src\screens\FestivalStylistScreen.tsx`
- `D:\stylemateai\StyleMateAI\src\services\festivalService.ts`
- `D:\stylemateai\StyleMateAI\src\screens\AIStylistScreen.tsx`
- `D:\stylemateai\StyleMateAI\src\services\stylistService.ts`
- `D:\stylemateai\StyleMateAI\src\ai\promptRegistry.ts`
- `D:\stylemateai\StyleMateAI\EVAL_HARNESS.md`
- `D:\stylemateai\StyleMateAI\src\components\ShareCard.tsx`
- `D:\stylemateai\StyleMateAI\src\services\shareService.ts`
- `D:\stylemateai\StyleMateAI\src\services\installAttributionService.ts`
- `D:\stylemateai\StyleMateAI\src\screens\AdminPushCampaignScreen.tsx`
- `D:\stylemateai\StyleMateAI\src\services\pushCampaignService.ts`
- `D:\stylemateai\StyleMateAI\src\services\pushNotificationAiService.ts`
- `D:\stylemateai\StyleMateAI\cloudflare-ai-worker\src\pushDraft.mjs`
- `D:\stylemateai\StyleMateAI\functions\index.js`
- `D:\stylemateai\StyleMateAI\firestore.rules`

Audit these website files first:

- `index.html`, `app.js`, `styles.css`, `config.js`
- `admin.html`, `admin.js`, `admin.css`
- `functions/api/generate-outfit.js`
- `functions/r.js`
- `FEATURE_AUDIT.md`
- `MOBILE_TO_WEB_VIEW_PARITY_HANDOFF.md`
- `README.md`, `privacy.html`, `faq.html`

## Non-negotiable safety boundaries

1. Do not copy or modify garment extraction, Auto Extract, Single Garment, Style Check processing, segmentation, background removal, selfie analysis, on-device models, camera code, or upload workers.
2. Website garment images and wardrobe metadata remain read-only. Do not let web users create, edit, delete, crop, rotate, refine, reclassify, favorite, or change laundry state for wardrobe garments.
3. Never put Gemini, Firebase Admin, Cloudflare, or signing secrets in browser JavaScript. AI and privileged mutations must use authenticated server endpoints/callables.
4. Never trust a client-supplied subscription plan, user ID, AI result, push audience, prompt version, share owner, or campaign status. Re-read trusted state server-side.
5. Preserve owner-scoped Firestore queries. Every user-data write must stamp `userId` from authenticated identity, never from a free-form browser field.
6. Preserve the vanilla HTML/CSS/JavaScript and Cloudflare Pages architecture. Do not migrate to React or another framework.
7. Do not add browser push notification registration or a messaging service worker. The website admin may manage mobile push campaigns, but ordinary website users must not register web push tokens.
8. The earlier blanket “view-only website” rule is superseded only for the explicit user-owned actions below: creating/deleting Lookbook looks, planning/removing/marking outfits worn, generating Style This/Festival/Smart Purchase results, and sharing. Keep every other mobile-managed area view-only.
9. Update README, privacy copy, and feature audit whenever behavior changes.

## Required implementation

### 1. Lookbook taxonomy and builder

The website currently displays saved looks but cannot build one. Add a responsive Lookbook builder using existing wardrobe items.

- Use these slots: Top, Bottom, Layer, One-piece, Footwear, Accessory.
- Port the behavior—not the React code—of `lookbookSlotFor`.
- Concrete garment words must override stale legacy metadata.
- Dress shirts, shirts, T-shirts, blouses, kurtas and polos must never appear in One-piece.
- Jackets, blazers, coats, cardigans, shrugs, overshirts and hoodies load under Layer.
- Watches, bags, belts, jewellery, scarves, eyewear and headwear load under Accessory.
- Dresses, gowns, jumpsuits, rompers, sarees, lehengas, anarkalis, sherwanis and complete traditional sets load under One-piece.
- Selecting a One-piece clears Top/Bottom/Layer but preserves compatible footwear/accessory. Selecting a separate clears One-piece.
- Allow optional look name and occasion.
- Save to `savedOutfits` using the same current document contract, with `lookbook: true` and `source: "user_created"`.
- Confirm before deletion and permit deletion only for the authenticated owner’s saved look—not wardrobe items.
- Use `contain` for garment imagery. Never stretch or crop cutouts.

### 2. Outfit Planner parity

The website already has previous/next month controls. Audit and improve them rather than creating a second calendar.

- Preserve previous/next month navigation and add a visible “Today” action.
- Preserve the selected day number when switching months, clamped to the target month’s last valid day.
- Show a month-specific planned-day count, not the current month count.
- Show planned/worn state, outfit thumbnails, reminder metadata when stored, and full look details.
- Add an accessible action to plan an existing saved/Lookbook outfit for the selected date.
- Add owner-only actions to remove a plan and mark a past/today plan worn.
- Do not create browser reminders. Clearly label reminder information as mobile reminder state.
- Add “Generate for this day”; when the user views/accepts the generated outfit, write the plan to the selected date exactly once. Prevent duplicate writes on refresh/double-click.
- Use local calendar dates (`YYYY-MM-DD`) without UTC day shifts.

### 3. Smart Purchase Check

Add a web Smart Purchase Check using a browser file picker, not a camera requirement.

- Preview the complete selected image with `object-fit: contain`.
- Browser-only crop/rotate is permitted for the transient purchase photo, but do not upload it to wardrobe, R2, or Firestore.
- Accept an optional store price.
- For premium/subscribed users, call an authenticated server endpoint using the same grounded rules as `smartPurchaseAiService.ts`.
- The server must verify Firebase identity and subscription status; do not trust a browser plan flag.
- For free users, produce the deterministic non-AI result using real wardrobe metadata.
- Similar matches must be genuine and thresholded. Do not show arbitrary “5 similar” or cap/fabricate “99 outfits.”
- Every suggested combination must contain real existing wardrobe IDs and render the actual garment images.
- Show only a few outfit cards initially with “Show more.”
- Keep the result language “ClothMatics AI stylist” rather than “AI confidence.”
- Do not persist the store photo unless a future separately-approved flow explicitly requests it.

### 4. Weekly Closet Report

Upgrade the existing Insights panel with the meaningful weekly report now present in mobile.

- Report the local seven-day period.
- Show garments worn versus total eligible garments.
- Show most-worn/best-value item only when data supports it.
- Show neglected clean garments, useful colors, wardrobe rotation and a suggested next-week outfit using real IDs.
- Explain calculations. Do not ask users to “add prices” without explaining that price enables cost-per-wear.
- Handle no wear data, no prices, empty wardrobe and partial metadata gracefully.
- Prefer deterministic calculation. Do not add an AI call unless the mobile service currently makes one and the server can stamp the correct prompt identity.

### 5. Admin-driven festival campaigns

Do not add a separate Festival Stylist page or home-navigation card. Festival styling is an admin campaign capability that reuses the existing AI Stylist.

- In the admin push-campaign composer, read published `festivalCampaigns` documents and merge the same safe built-in fallbacks used by `festivalService.ts`.
- Let the admin select a festival, style mode and one of two actions: `notification only` or `personal outfit on open`.
- Provide a year-round Indian festival catalogue with remote admin overrides, verified event dates, and visible moon-sighting warnings where applicable.
- Provide quick scheduling for 14 days before, 7 days before and the festival morning, plus accessible date and time pickers; never require an admin to type an ISO timestamp.
- `notification only` opens the normal authenticated home page.
- `personal outfit on open` opens the existing web AI Stylist with occasion, mood, prompt, `festivalCampaignId`, festival name and mode prefilled. It may auto-start only after the user deliberately clicks the notification/deep link.
- Generated combinations must use owned wardrobe IDs only and carry `festivalCampaignId` through result and share attribution.
- Do not create a second festival outfit-generation engine or a duplicated user-facing festival screen.
- Do not imply an outfit was pre-generated in a push message when it has not been generated. Use accurate language such as “Your festival stylist is ready.”

### 6. Central prompt identity and evaluation compatibility

The website AI endpoint must align with the mobile prompt registry.

- Create one server-only prompt registry module for website AI functions using the same IDs: `outfit_stylist`, `style_this`, `smart_purchase`, `style_check`, `selfie_analysis`, `garment_analysis`, `trip_packing`, `festival_stylist`, `weekly_report`, `push_notification`, `unknown`.
- Match the active version/release tag in the mobile registry for prompts actually used by web.
- Stamp every website AI result/log with `promptId`, `promptVersion`, `promptHash`, `requestPromptHash`, provider and model.
- Include prompt hash/version in any server cache namespace.
- Never expose full prompts in analytics.
- Add contract tests using privacy-safe fixtures. Website outfit output must be exportable as `{fixtureId: [wardrobeItemIds...]}` so it can be checked by the mobile `npm run eval:stylist -- --candidate ...` harness.

### 7. Attributed sharing

Add one polished web share-card implementation for existing garments, saved looks, AI recommendations, festival outfits and planned outfits.

- Reuse the Firebase callables `createShareLink` and `logShareEvent`; do not write directly to analytics.
- Render actual wardrobe images, a small ClothMatics mark, and the returned `clothmatics.pages.dev/r?c=...` link.
- Use Web Share API when available and provide PNG/JPEG download plus copy-link fallback.
- Carry `source`, `outfitId` and `campaignId`.
- Preserve the existing `/functions/r.js` click bridge.
- Do not place name, DOB, email, body details, location or other sensitive profile fields on share cards.
- Admin metrics should show cards shared, clicks, click rate and activated installs from trusted backend records.

### 8. Website admin: mobile push campaign operations

The old parity brief excluded admin notifications. This task explicitly supersedes that exclusion for custom-claim administrators only.

Add a Push Campaign section to `admin.html` using the current mobile/backend contract.

- Require Firebase custom claim `admin === true` before loading data or enabling controls.
- Compose title/body, public HTTPS image, notification channel, audience and destination. Festival campaigns additionally select festival, mode, delivery behavior and event-relative scheduling.
- Add the same optional Gemini notification assistant used by mobile admin. It accepts an admin brief, English/Hinglish/Hindi and an optional image toggle; it returns one recommended draft plus two alternatives and fills the existing editable composer.
- Generation must use the authenticated server-side AI gateway and require the Firebase `admin === true` custom claim at the server boundary. Do not expose a Gemini key in browser code and do not fall back to an ordinary-user endpoint.
- Optional artwork must use Gemini image generation with a fixed garment-only safety wrapper (no people, faces, bodies, text, logos or trademarks), be persisted to authenticated R2 storage, and place only the resulting public HTTPS URL into `payload.imageUrl`.
- The Generate action must never create a `pushCampaigns` document or send anything. Only the existing Test, Schedule and Queue actions may enter the delivery pipeline after explicit admin review.
- Pass the currently selected channel, audience, destination and festival context into drafting without silently changing those selections. Store provider/model and `push_notification` prompt hash/version metadata with the campaign, but never store the full admin prompt in analytics.
- Support Send now and Schedule with date and time pickers plus visible local-time and IST interpretation.
- Support test-to-current-admin-device, reuse and deletion.
- Keep existing notification history collapsed by default and show the campaign count in its section header.
- Explain `registration-token-not-registered` as an expired/uninstalled device token, exclude it from future sends, and provide a current-device token refresh action before sending another test.
- Deletion must call `deletePushCampaign`; never directly delete a sending campaign.
- Provide “Reach every eligible device” with an explicit 24-hour suppression explanation.
- Show status, scheduled time, unique targeted users, device targets, sent, failed, opened, skipped reasons, FCM failure reasons and processing errors.
- “All users” still means all eligible registered devices; explain that users without permission/token and users who disabled the channel cannot receive the push.
- Do not duplicate server sending logic in Cloudflare. Continue using Firebase Functions and `pushCampaigns`.

### 9. Search normalization

Apply one shared browser search normalizer across Wardrobe, Lookbook and item pickers.

- Treat `tshirt`, `t shirt`, `tee` and `t-shirt` as equivalent.
- Match common footwear terms such as shoe/shoes/sneaker/sneakers/footwear.
- Match accessory terms such as watch, bag, belt, jewellery/jewelry, scarf and sunglasses.
- Search title, normalized category, subcategory, colors, pattern, tags and brand without changing stored data.

## Data and security requirements

- Reuse current Firebase collections and current backend contracts. Do not create parallel outfit/planner collections.
- Use transactions or idempotency keys for generation-to-planner acceptance and destructive state changes.
- Update Firestore rules with the narrowest necessary owner/admin access. Analytics, attribution, push delivery and prompt logs remain callable/server-write-only.
- Validate all URLs before rendering. Escape all Firestore/user text before inserting into HTML.
- Strip image data from logs and analytics.
- Preserve account-blocked and mandatory-email-verification behavior.
- Do not weaken existing coupon, AI rate-limit, kill-switch, account-deletion or admin controls.

## UX requirements

- Reuse the existing ClothMatics colors, typography, card radius and responsive breakpoints.
- Desktop must not look like a stretched phone screen.
- All icon-only controls need accessible labels and keyboard focus.
- Add loading, empty, retry, error and offline states.
- Disable actions while requests are running and prevent double submission.
- Use concise, truthful copy. Never fabricate counts, compatibility, AI confidence, delivery or data freshness.

## Required tests and acceptance checks

1. Dress Shirt resolves to Top even when stale metadata says standalone/full-body.
2. Bomber Jacket resolves to Layer; Watch resolves to Accessory; Saree/Dress resolves to One-piece.
3. Planner moves backward/forward across year boundaries, clamps 31 January → 28 February when needed, and returns to today.
4. Planner counts only the visible month and never shifts local dates because of UTC.
5. Free Smart Purchase makes no AI network request.
6. Premium Smart Purchase is rejected server-side when the trusted plan is not premium.
7. No Smart Purchase combination contains an unknown wardrobe ID.
8. Festival generation carries the correct campaign ID into sharing.
9. Share events cannot be written directly by an ordinary client.
10. Admin push controls are unavailable without the admin custom claim.
11. Scheduled campaigns display in IST and reuse clears the old schedule unless the admin explicitly schedules again.
12. Website AI output includes prompt identity metadata and passes the 30-case candidate validator.
13. Existing login, wardrobe, saved outfits, planner reading, Closet Quest and coupon admin functionality remain working.
14. No mobile extraction, upload-worker or garment-processing file changes.

## Deliverables

- Implemented website and admin code.
- Any narrowly required Firestore rule/index update.
- Tests or a deterministic browser test script for taxonomy, calendar, subscription gating, ID validation and prompt stamps.
- Updated `FEATURE_AUDIT.md`, `README.md`, `MOBILE_TO_WEB_VIEW_PARITY_HANDOFF.md`, `privacy.html` and relevant FAQ text.
- A concise deployment checklist for Firebase and Cloudflare Pages.
- Final report divided into: implemented parity, deliberately mobile-only, security changes, test evidence, deployment commands and remaining risks.

Do not stop after producing an audit. Implement the safe web parity described above, verify it, and report any genuinely blocked item with exact evidence.
