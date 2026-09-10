const SITE_URL = "https://clothmatics.pages.dev";

const HOME_MARKDOWN = `---
title: ClothMatics — AI wardrobe and personal outfit planner
description: Organize a digital closet, plan outfits, track wears, and get wardrobe-grounded styling ideas.
image: ${SITE_URL}/assets/clothmatics-social.png
---

# ClothMatics

ClothMatics is a personal digital wardrobe and outfit-planning service for Android and the web. It helps people organize clothes they own, plan complete looks, track wears, and understand wardrobe use.

## What ClothMatics does

- Organizes garments in a private digital closet.
- Creates wardrobe-grounded outfit and trip-packing suggestions for signed-in users.
- Keeps saved outfits, Lookbook combinations, plans, wear history, and wardrobe insights together.
- Compares a possible purchase with clothes already owned using typed product details.
- Uses weather and stated preferences when preparing styling suggestions.

## Mobile app and website boundaries

The signed-in website has a Camera screen for choosing up to five photos from the gallery. Auto Extract finds visible garments in worn-outfit photos and lets the user review each prepared item before saving; Single Garment handles one clear item photo. Style Check evaluates a complete outfit and returns the same score, confidence, colors, detected clothing, and recommendations contract used by the Android app. Garment-image replacement and tap refinement remain Android features. The website also lets a user review their wardrobe, saved outfits, planner, wear insights, supported garment metadata, profile preferences, and private Closet Quest progress. Personal wardrobe data is not public and requires authentication.

## Public resources

- [About ClothMatics](${SITE_URL}/about): Purpose, product boundaries, operating principles, and accountability links.
- [Help and FAQ](${SITE_URL}/faq): Answers about accounts, wardrobe access, outfits, planning, privacy, and troubleshooting.
- [Photo guide](${SITE_URL}/photo-guide): Guidance for taking full-body outfit and single-garment photos.
- [Privacy Policy](${SITE_URL}/privacy): How ClothMatics handles account, wardrobe, media, location, notification, support, retention, and deletion data.
- [Terms of Use](${SITE_URL}/terms): Terms governing accounts, wardrobe services, user content, AI features, plans, and acceptable use.
- [Help and contact](${SITE_URL}/contact): Support and authenticated account-deletion requests.
- [Google Play](${SITE_URL}/r?to=play): Install the ClothMatics Android app.

## Important usage notes

- ClothMatics provides wardrobe and styling assistance, not professional medical, legal, or financial advice.
- AI-generated suggestions may be imperfect and should be reviewed by the user.
- The signed-in website Camera accepts gallery images for Auto Extract, Single Garment, or Style Check. Auto Extract accepts up to five photos and presents each detected item for review before saving. Tap refinement and image replacement remain in the mobile app.

## Machine-readable discovery

- [AI-readable site map](${SITE_URL}/llms.txt)
- [XML sitemap](${SITE_URL}/sitemap.xml)
- [Crawler policy](${SITE_URL}/robots.txt)

\`\`\`json
{"@context":"https://schema.org","@type":"SoftwareApplication","name":"ClothMatics","url":"${SITE_URL}/","applicationCategory":"LifestyleApplication","operatingSystem":"Android, Web","isAccessibleForFree":true}
\`\`\`
`;

const ABOUT_MARKDOWN = `---
title: About ClothMatics
description: The purpose, product boundaries, and operating principles behind the ClothMatics digital wardrobe service.
image: ${SITE_URL}/assets/clothmatics-social.png
---

# About ClothMatics

ClothMatics is an independently operated digital wardrobe and outfit-planning service offered under the ClothMatics name. It is not represented as a separate incorporated company.

## Why ClothMatics exists

ClothMatics is designed to make an owned wardrobe easier to understand and use. It organizes garment information, brings complete looks and plans together, tracks wear activity, and can prepare suggestions grounded in eligible clothes connected to a user's account.

## Mobile app and website

The Android app and signed-in website both provide gallery photo intake, Style Check, multi-item Auto Extract, and a one-photo Single Garment flow. The Android app additionally handles image replacement, tap refinement, and other device-specific clothing workflows. The website also provides a private wardrobe experience for reviewing wardrobe details, saved looks, plans, wear insights, profile preferences, and Closet Quest progress.

## Operating principles

- Help users find more combinations in clothes they already own.
- State which functions belong to mobile, web, or authenticated services.
- Require sign-in before showing personal wardrobe information.
- Provide routes for support, privacy questions, data requests, and account deletion.
- Keep canonical help, policy, sitemap, and discovery resources on the official website.

## Policies and support

- [Help and FAQ](${SITE_URL}/faq)
- [Privacy Policy](${SITE_URL}/privacy)
- [Terms of Use](${SITE_URL}/terms)
- [Help and Contact](${SITE_URL}/contact)
`;

export const MARKDOWN_PAGES = new Map([
  ["/", HOME_MARKDOWN],
  ["/index.html", HOME_MARKDOWN],
  ["/about", ABOUT_MARKDOWN],
  ["/about.html", ABOUT_MARKDOWN],
]);

function quality(value) {
  const match = /(?:^|;)\s*q=([0-9.]+)/i.exec(value);
  return match ? Math.max(0, Math.min(1, Number(match[1]))) : 1;
}

export function prefersMarkdown(acceptHeader = "") {
  const entries = String(acceptHeader)
    .split(",")
    .map((entry, index) => ({ value: entry.trim().toLowerCase(), index }))
    .filter(({ value }) => value);

  const markdown = entries
    .filter(({ value }) => value.startsWith("text/markdown") || value.startsWith("text/*"))
    .map((entry) => ({ ...entry, q: quality(entry.value) }))
    .sort((a, b) => b.q - a.q || a.index - b.index)[0];
  if (!markdown || markdown.q === 0) return false;

  const html = entries
    .filter(({ value }) => value.startsWith("text/html") || value.startsWith("application/xhtml+xml"))
    .map((entry) => ({ ...entry, q: quality(entry.value) }))
    .sort((a, b) => b.q - a.q || a.index - b.index)[0];

  return !html || markdown.q > html.q || (markdown.q === html.q && markdown.index < html.index);
}

export function markdownForPath(pathname) {
  const normalized = pathname.length > 1 ? pathname.replace(/\/$/, "") : pathname;
  return MARKDOWN_PAGES.get(normalized) || null;
}

export function markdownResponse(markdown, { head = false } = {}) {
  const tokenEstimate = Math.ceil(markdown.split(/\s+/).filter(Boolean).length / 0.75);
  return new Response(head ? null : markdown, {
    status: 200,
    headers: {
      "Cache-Control": "public, max-age=3600",
      "Content-Signal": "search=yes, ai-input=yes, ai-train=no",
      "Content-Type": "text/markdown; charset=utf-8",
      "Vary": "Accept",
      "X-Content-Type-Options": "nosniff",
      "X-Markdown-Tokens": String(tokenEstimate),
    },
  });
}
