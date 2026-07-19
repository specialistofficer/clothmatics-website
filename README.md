# ClothMatics website

This folder is a complete Cloudflare Pages website and authenticated web
dashboard. It intentionally provides **read-only wardrobe access**. Garment
upload, extraction, editing, and deletion remain mobile-app-only.

## What is included

- Responsive marketing website using the ClothMatics design system.
- Persistent Firebase email/password and Google authentication.
- The signed-in user's wardrobe, favorites, Lookbook items, and custom looks.
- Search and filtering without any wardrobe writes.
- Online outfit generation through a Cloudflare Pages Function.
- Firebase-token verification before every AI request.
- Optional per-user daily generation limits using Cloudflare KV.
- Editable marketing/demo content in `data/content.json`.
- A claim-protected, read-only administrator dashboard at `/admin.html`.
- Dedicated privacy policy and searchable FAQ pages.

## Data shared with the mobile app

| Feature | Firebase location | Website access |
|---|---|---|
| User profile | `users/{uid}` | Read |
| Wardrobe | `wardrobe` filtered by `userId` | Read only |
| Saved/custom looks | `savedOutfits` filtered by `userId` | Read only |
| Garment upload/extraction | Mobile pipeline | Not present |
| Outfit generation | `/api/generate-outfit` | Authenticated request |

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

Add these encrypted environment variables under **Settings → Variables and
Secrets**:

| Variable | Purpose |
|---|---|
| `GEMINI_API_KEY` | Server-only Gemini credential |
| `FIREBASE_WEB_API_KEY` | Used by the function to validate Firebase ID tokens |
| `WEB_DAILY_OUTFIT_LIMIT` | Optional; defaults to `1` |

For secure daily trial limits, create a KV namespace and bind it to the Pages
project with the variable name `OUTFIT_LIMITS`. Without the binding, generation
still works but the server does not impose a daily web limit.

## Local preview

Static marketing and Firebase dashboard preview:

```powershell
npx wrangler pages dev website
```

The Pages Function also runs under this command. Add local secrets in a
`website/.dev.vars` file (do not commit it):

```text
GEMINI_API_KEY=...
FIREBASE_WEB_API_KEY=...
WEB_DAILY_OUTFIT_LIMIT=1
```

## Deployment behavior

- A visitor sees the marketing site until authenticated.
- Firebase browser-local persistence keeps the user signed in after closing the
  browser.
- The dashboard queries only documents whose `userId` equals the authenticated
  UID.
- There are no calls to `addDoc`, `setDoc`, `updateDoc`, `deleteDoc`, Storage,
  camera, image picker, or extraction services in the website.
- Outfit generation sends only garment metadata—not garment image bytes—to the
  server function. Returned IDs are checked against the supplied wardrobe
  before rendering.

## Files

- `index.html` — marketing site, login dialog, and dashboard structure.
- `styles.css` — complete responsive design system.
- `app.js` — Firebase session, read-only data queries, rendering, and AI UI.
- `functions/api/generate-outfit.js` — authenticated server-side Gemini route.
- `data/content.json` — occasions and editable demo content.
- `_headers` — Cloudflare security and cache headers.
- `admin.html`, `admin.js`, `admin.css` — administrator activity dashboard.
- `privacy.html` — public privacy policy.
- `faq.html`, `faq.js` — searchable help and FAQ page.
- `ADMIN_SETUP.md` — one-time Firebase custom-claim instructions.
