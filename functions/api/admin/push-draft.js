import { bearer, hasAdminClaim, json, verifyFirebaseToken } from "../../_shared/firebase-rest.mjs";

const GATEWAY_URL = "https://clothmatics-ai-gateway.chiragsharma376.workers.dev/v1/admin/push-draft";
const ALLOWED_LANGUAGES = new Set(["English", "Hinglish", "Hindi"]);
const ALLOWED_AUDIENCES = new Set(["all", "free", "subscribed", "inactive", "small_wardrobe", "daily_ready", "specific"]);

export async function onRequestPost({ request, env }) {
  const token = bearer(request.headers.get("Authorization") || "");
  if (!token) return json({ error: { message: "Authentication is required." } }, 401);
  const identity = await verifyFirebaseToken(token, env.FIREBASE_WEB_API_KEY);
  if (!identity) return json({ error: { message: "The Firebase session is invalid or expired." } }, 401);
  if (!hasAdminClaim(identity)) return json({ error: { message: "Administrator access is required." } }, 403);
  let input;
  try { input = await request.json(); } catch { return json({ error: { message: "A valid JSON body is required." } }, 400); }
  const brief = String(input.brief || "").trim().slice(0, 1200);
  if (brief.length < 8) return json({ error: { message: "Describe the campaign in at least 8 characters." } }, 400);
  const payload = {
    brief,
    language: ALLOWED_LANGUAGES.has(input.language) ? input.language : "English",
    includeImage: input.includeImage === true,
    audience: ALLOWED_AUDIENCES.has(input.audience) ? input.audience : "all",
    channel: String(input.channel || "announcements").slice(0, 60),
    destination: String(input.destination || "Main").slice(0, 80),
    occasion: String(input.occasion || "").trim().slice(0, 120),
  };
  const upstream = await fetch(GATEWAY_URL, { method:"POST", headers:{"Content-Type":"application/json",Authorization:`Bearer ${token}`}, body:JSON.stringify(payload) });
  let body;
  try { body = await upstream.json(); } catch { body = { error: { message: "The notification assistant returned an invalid response." } }; }
  return json(body, upstream.status);
}

export function onRequest() { return json({ error: { message: "Method not allowed." } }, 405); }
