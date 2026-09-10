# ClothMatics website parity audit — 5 September 2026

The mobile repository was the authoritative, read-only reference. The website remains a view-first companion; new user writes are limited to the approved Lookbook, planner/wear, AI and sharing actions.

## Implemented parity

| Area | Result |
|---|---|
| Wardrobe search | One shared normalizer across Wardrobe, Lookbook and pickers, including tee/T-shirt, shoe/footwear and accessory equivalents. |
| Lookbook | Six-slot mobile taxonomy builder. Owner-created looks use `savedOutfits` and can be deleted without touching garments. |
| Planner | Date-clamped month navigation, Today, visible-month count, plan saved outfit, remove/mark-worn, full outfits, reminder metadata and idempotent generation acceptance. |
| Smart Purchase | Transient preview; deterministic free result without AI; protected premium AI route with server-side subscription and wardrobe verification. |
| Insights | Deterministic local seven-day report covering rotation, wear, value, neglected pieces, useful colors and a grounded next-week suggestion. |
| Festival Stylist | Published campaigns merged with Navratri, Karva Chauth and Diwali fallbacks; lifecycle state, mode prefill and campaign attribution. |
| AI identity | Server registry matches mobile prompt IDs/versions and stamps hashes, provider and model. Results contain current owned IDs only. |
| Sharing | Protected Core routes create/log attributed links without profile fields. |
| User AI | Wardrobe Assistant trip planning uses the AI Gateway; the gateway consumes the shared Core quota exactly once for a fresh request, while a UID-scoped cache hit consumes zero. |
| Camera / Add to Closet | Camera or gallery intake supports Single Garment and up-to-five-photo Auto Extract, applies the mobile blur/visibility gates, uses authenticated Oracle extraction, then reviews and saves optimized artifacts to owner-scoped storage. |
| Camera / Style Check | Complete-outfit image analysis uses the same shared allowance and response fields as mobile, renders the full result, and records safe history metadata. |
| Wardrobe management | Supported metadata and deletion use owner-verified Core routes; garment image replacement stays mobile-only. |
| Admin | User/activity pagination, explorer, model reporting and coupons retained; notification compose, reach, personal-outfit generation, collage upload, delivery and deletion use claim-protected workers. |

## Deliberately mobile-only

- Single-garment photo selection, optional Gemini identification, direct-first Oracle extraction with bounded quality recovery, original-photo choice, upload, metadata/privacy review, and wardrobe save are supported on web.
- Auto Extract preserves per-photo source linkage, eligible-region filtering, exact-preview reuse and per-item partial save behavior. Browser on-device ONNX fallback, tap refinement, image replacement, and Closet Quest submissions remain mobile-only.
- Selfie analysis and model download/setup.
- Browser push registration and browser reminder scheduling.
- Unsynced mobile AsyncStorage-only results.

## Security posture

- AI endpoints verify Firebase identity, verified email and account restrictions.
- Wardrobe and subscription state are re-read server-side; browser plan flags and wardrobe payloads are ignored.
- AI result IDs are allowlisted against the owner’s current wardrobe.
- Secrets remain in Cloudflare; missing `OUTFIT_LIMITS` fails closed.
- Push, account deletion, and user security controls require `admin === true` and use protected Core endpoints.
- Share analytics use protected callables, not direct browser writes.

## Verification

Run `node --test tests/*.test.mjs`. Tests cover taxonomy, synonym search, calendar clamping/local dates, free Smart Purchase ID integrity, weekly periods, prompt identity, server trust boundaries, sharing and admin claim gating.
