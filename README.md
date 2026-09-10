# ClothMatics website

This folder contains the public website and authenticated companion dashboard.
The signed-in website includes a Camera screen with Add to Closet and Style
Check modes. It can capture or select a clear garment photo, identify it through
the authenticated AI gateway, remove its background through the Oracle Cloud
extraction service, and save the cutout to the same wardrobe used by mobile.
Style Check analyzes a complete outfit using the mobile response contract, and
Auto Extract can prepare multiple eligible garments from up to five photos.
Tap refinement and replacement of an existing wardrobe image remain mobile-only.
Website AI uses the same account-level allowance as mobile.

## What is included

- Responsive marketing website using the ClothMatics design system.
- Persistent Firebase email/password and Google authentication.
- Dedicated Camera screen with blur warning, single-garment and multi-garment intake, Oracle Cloud extraction, original-photo fallback, R2 storage, and review-before-save.
- Complete-outfit Style Check with score, confidence, occasion, colors, detected clothing, recommendations, tips, accessories, and shopping suggestions.
- The signed-in user's wardrobe, favorites, Lookbook items, and custom looks.
- Search and filtering with protected owner-only metadata updates.
- Grounded Wardrobe Assistant trip planning with UID-scoped cache and the shared account AI allowance.
- Typed Smart Purchase comparison; clothing photos are handled by the Camera screen.
- Administrator-only notification drafting and personal-outfit campaigns.
- Editable marketing/demo content in `data/content.json`.
- A claim-protected administrator dashboard at `/admin.html`.
- Dedicated privacy policy and searchable FAQ pages.

## Data shared with the mobile app

| Feature | Firebase location | Website access |
|---|---|---|
| User profile | `users/{uid}` | Read and protected supported-field update |
| Wardrobe | `wardrobe` filtered by `userId` | Read, protected metadata update/delete |
| Saved/custom looks | `savedOutfits` filtered by `userId` | Read and protected save |
| Single-garment upload/extraction | AI gateway + Oracle extraction + R2 | Authenticated review-before-save flow |
| Complete-outfit Style Check | `outfitHistory` + AI gateway | Authenticated Camera flow using the shared result contract |
| Smart Purchase | Browser-local calculation | No AI request or upload |
| User AI and quota | Core/AI Workers | Verified Firebase account; image analysis consumes the same shared mobile/web allowance |
| Admin notification tools | Core/AI Workers | Firebase `admin: true` claim required |

The Firebase web configuration is not a secret. Firestore Security Rules and
Firebase Auth enforce access. Gemini credentials must never be placed in
`config.js` or frontend JavaScript.

## Configure Firebase

1. In Firebase Console, open **Project settings → Your apps** and create or
   select a Web App.
2. Replace the placeholders in `config.js` with that Web App configuration.
3. In **Authentication → Settings → Authorized domains**, add:
   - `clothmatics.pages.dev`
   - your custom production domain, if used
4. Enable Email/Password and Google providers if both buttons should work.
5. Deploy the updated root `firestore.rules`:

   ```powershell
   firebase deploy --only firestore:rules
   ```

The tightened rules require each user query to include
`where("userId", "==", currentUser.uid)`, which the website and app already do.

## Configure Cloudflare Pages

Cloudflare must see `functions/` at the Pages project root. Choose the matching
configuration for the way the files are stored in GitHub:

**If the repository root contains `index.html`, `app.js`, and `functions/`:**

- Production branch: `main` (or your chosen production branch)
- Framework preset: None
- Build command: leave empty (or use `exit 0` if the field is required)
- Build output directory: `.`
- Root directory: leave blank

**If those files are inside a `website/` folder in the repository:**

- Production branch: `main` (or your chosen production branch)
- Framework preset: None
- Build command: leave empty (or use `exit 0` if the field is required)
- Build output directory: `.`
- Root directory: `website`

Do not use repository root plus `website` as only the output directory: Pages
Functions are discovered from the configured project root, not from an
arbitrary static output subfolder.

The website includes the same public Firebase project configuration and public
service endpoints as the production mobile app. No extra value is required for
the standard deployment. The following optional environment overrides can be
set under **Settings → Variables and Secrets** when infrastructure is rotated:

| Variable | Purpose |
|---|---|
| `FIREBASE_WEB_API_KEY` | Optional override for the public Firebase web API key |
| `ORACLE_EXTRACTION_API_URL` | Optional HTTPS override for the authenticated Oracle extraction service |
| `UPLOAD_WORKER_URL` | Optional override for the authenticated R2 upload worker |

The Pages project does not hold a Gemini key. Browser AI requests use the
existing authenticated AI gateway, where availability, shared quota, provider
credentials, prompts, and output limits are enforced. The Pages Functions
proxy only the user-selected image to Oracle and the finished cutout to the
existing upload worker; both upstream services verify the Firebase account.

## Local preview

Static marketing and Firebase dashboard preview:

```powershell
npx wrangler pages dev website
```

The Pages Function also runs under this command. Overrides may be placed in a
local `.dev.vars` file (do not commit it), but they are not required while the
mobile production endpoints remain unchanged:

```text
FIREBASE_WEB_API_KEY=...
ORACLE_EXTRACTION_API_URL=https://your-extraction-host
UPLOAD_WORKER_URL=https://your-upload-worker
```

## Deployment behavior

- A visitor sees the marketing site until authenticated.
- Firebase browser-local persistence keeps the user signed in after closing the
  browser.
- The dashboard queries only documents whose `userId` equals the authenticated
  UID.
- A signed-in user can capture or pick JPEG, PNG, or WebP images up to 6 MB
  from the dedicated Camera screen. Single Garment accepts one image and Auto
  Extract accepts up to five.
- The browser warns before processing a likely blurry photo, normalizes every
  accepted source to the same 1024px-wide JPEG used by mobile analysis, and
  requests authenticated Oracle extraction.
- Single Garment uses a direct full-frame pass first. A quality rejection can
  retry a padded Gemini box and then light-fabric preservation. Infrastructure
  failure never creates a broken wardrobe record: the unchanged source remains
  available for explicit review and save.
- Auto Extract uses the mobile visibility gate, stops further cloud calls after
  a batch-level Oracle infrastructure failure, reuses each prepared preview at
  save time, uploads one non-fatal source reference per photo, and continues
  saving other reviewed garments if one item fails.
- The reviewed artifact is resized/compressed with the mobile upload profile
  before it is uploaded to the user-owned R2 wardrobe namespace. Firestore is
  written only after upload succeeds, and a failed Firestore save triggers R2
  cleanup of that wardrobe artifact.
- Style Check sends the normalized complete-outfit image through the same
  authenticated, account-level AI allowance as mobile and renders the matching
  score, confidence, occasion, colors, detected clothing, and advice fields.
- Browser intake does not offer tap refinement or replacement of an existing
  wardrobe image; those paths remain mobile-only.
- Outfit generation sends only garment metadata—not garment image bytes—to the
  server function. Returned IDs are checked against the supplied wardrobe
  before rendering.

## View-first mobile parity

The authenticated companion displays Firestore-backed garment intelligence,
saved and generated outfits, the monthly planner, wear history, cost-per-wear,
profile preferences, and private Closet Quest progress. Mobile-managed product
data remains view-only. The existing server-side outfit generator and
administrator coupon workflow are the deliberate exceptions.

See `FEATURE_AUDIT.md` for the full classification. These reads use the
existing owner-scoped rules and client-side sorting, so no new Firestore
composite index is required.

## August 2026 parity deployment

The authenticated companion includes a Lookbook builder, enhanced planner, Weekly Closet Report, local Smart Purchase Check, attributed sharing, Wardrobe Assistant trip planning, and administrator mobile-push campaign operations. The older Festival Stylist and generic website outfit generator have been removed; Wardrobe Assistant is the supported user-facing AI workflow.

Cloudflare Pages must use this directory as its project root and `.` as the output directory. The standard mobile-aligned public configuration is built in; provider credentials remain only in the existing AI gateway and are never included in this website.

Verify and deploy:

```powershell
node --test tests/*.test.mjs
node --check app.js
node --check admin.js
node --check functions/api/admin/push-draft.js
npx wrangler pages deploy . --project-name clothmatics
```

No Firestore rule change was required. Current rules already allow owner-scoped `savedOutfits` and `outfitWear` writes, published festival reads, admin-only `pushCampaigns`, and block ordinary direct analytics writes.

## Files

- `index.html` — marketing site, login dialog, and dashboard structure.
- `styles.css` — complete responsive design system.
- `app.js` — Firebase session, owner-scoped data queries, garment intake UI, rendering, and local Smart Purchase UI.
- `garment-upload.mjs` — browser image normalization, shared-quota vision call, Oracle extraction, and cutout upload client.
- `functions/api/wardrobe/extract.js` — authenticated same-origin Oracle proxy.
- `functions/api/wardrobe/upload.js` — authenticated user-scoped R2 upload and rollback proxy.
- `functions/api/admin/push-draft.js` — administrator-claim proxy to the secured notification AI gateway.
- `data/content.json` — occasions and editable demo content.
- `_headers` — Cloudflare security and cache headers.
- `admin.html`, `admin.js`, `admin.css` — administrator activity dashboard.
- `privacy.html` — public privacy policy.
- `faq.html`, `faq.js` — searchable help and FAQ page.
- `ADMIN_SETUP.md` — one-time Firebase custom-claim instructions.
