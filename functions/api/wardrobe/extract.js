import { bearer, json, verifyFirebaseToken } from "../../_shared/firebase-rest.mjs";
import { DEFAULT_ORACLE_EXTRACTION_API_URL } from "../../_shared/service-config.mjs";
import { postMultipartToHttpsIp } from "../../_shared/ip-https.mjs";
const ALLOWED_IMAGE_TYPES = new Set(["image/jpeg", "image/png", "image/webp"]);
const MAX_IMAGE_BYTES = 6 * 1024 * 1024;

function cleanRegion(value) {
  if (!Array.isArray(value) || value.length !== 4) return null;
  const box = value.map(Number);
  if (!box.every(Number.isFinite)) return null;
  const [y0, x0, y1, x1] = box;
  if (y0 < 0 || x0 < 0 || y1 > 1000 || x1 > 1000 || y1 <= y0 || x1 <= x0) return null;
  return box.map((entry) => Math.round(entry));
}

function parseJsonField(input, name, fallback) {
  const value = input.get(name);
  if (!value) return fallback;
  try { return JSON.parse(String(value)); }
  catch { return fallback; }
}

function forwardHeaders(upstream) {
  const headers = new Headers({
    "Content-Type": upstream.headers.get("Content-Type") || "application/octet-stream",
    "Cache-Control": "no-store",
    "X-Content-Type-Options": "nosniff",
  });
  for (const name of [
    "X-Request-Id", "X-Processing-Ms", "X-Inference-Ms", "X-Model-Id",
    "X-Input-Width", "X-Input-Height", "X-Output-Width", "X-Output-Height",
    "X-Mask-Coverage", "X-Transparent-Fraction", "X-Opaque-Fraction",
    "X-Edge-Fraction", "X-Postprocess-Version",
  ]) {
    const value = upstream.headers.get(name);
    if (value) headers.set(name, value);
  }
  return headers;
}

export async function onRequestPost({ request, env }) {
  const token = bearer(request.headers.get("Authorization") || "");
  if (!token) return json({ error: { message: "Authentication is required." } }, 401);
  const identity = await verifyFirebaseToken(token, env.FIREBASE_WEB_API_KEY);
  if (!identity) return json({ error: { message: "Your session is invalid or expired. Please sign in again." } }, 401);

  let input;
  try { input = await request.formData(); }
  catch { return json({ error: { message: "A valid multipart image is required." } }, 400); }
  const image = input.get("image");
  if (!image || typeof image.arrayBuffer !== "function") {
    return json({ error: { message: "Choose an image to process." } }, 400);
  }
  const contentType = String(image.type || "").toLowerCase();
  if (!ALLOWED_IMAGE_TYPES.has(contentType)) {
    return json({ error: { message: "Only JPEG, PNG and WebP images are accepted." } }, 415);
  }
  if (image.size < 500 || image.size > MAX_IMAGE_BYTES) {
    return json({ error: { message: "Image size is outside the supported range." } }, 413);
  }

  const mode = input.get("mode") === "portrait_region" ? "portrait_region" : "single_garment";
  const region = cleanRegion(parseJsonField(input, "region", null));
  const regions = parseJsonField(input, "regions", []);
  const candidateIndex = Number(input.get("candidateIndex"));
  if (mode === "portrait_region" && !region) {
    return json({ error: { message: "A valid garment region is required." } }, 400);
  }

  const oracleUrl = String(env.ORACLE_EXTRACTION_API_URL || DEFAULT_ORACLE_EXTRACTION_API_URL).replace(/\/$/, "");
  if (!oracleUrl.startsWith("https://")) {
    return json({ error: { message: "Image preparation is temporarily unavailable." } }, 503);
  }
  const upstreamForm = new FormData();
  upstreamForm.append("image", image, "clothmatics-garment.jpg");
  upstreamForm.append("mode", mode);
  upstreamForm.append("preserveLightFabric", input.get("preserveLightFabric") === "true" ? "true" : "false");
  if (region) upstreamForm.append("region", JSON.stringify(region));
  if (Array.isArray(regions)) {
    const safeRegions = regions.slice(0, 5).map((item) => ({
      type: String(item?.type || item?.category || "garment").slice(0, 60),
      label: String(item?.label || item?.title || "Garment").slice(0, 100),
      boundingBox: cleanRegion(item?.boundingBox) || [],
      visibility: ["full", "partial", "mostly_hidden"].includes(String(item?.visibility))
        ? String(item.visibility)
        : "",
      visibleFraction: Number.isFinite(Number(item?.visibleFraction))
        ? Math.max(0, Math.min(1, Number(item.visibleFraction)))
        : undefined,
      occludedBy: String(item?.occludedBy || "").slice(0, 100),
      extractionReady: item?.extractionReady !== false,
      extractionObstructions: Array.isArray(item?.extractionObstructions)
        ? item.extractionObstructions.map((value) => String(value).slice(0, 100)).slice(0, 8)
        : [],
    }));
    upstreamForm.append("regions", JSON.stringify(safeRegions));
  }
  if (Number.isInteger(candidateIndex) && candidateIndex >= 0 && candidateIndex < 5) {
    upstreamForm.append("candidateIndex", String(candidateIndex));
  }

  let upstream;
  try {
    const parsedUrl = new URL(oracleUrl);
    if (/^\d{1,3}(?:\.\d{1,3}){3}$/.test(parsedUrl.hostname)) {
      const raw = await postMultipartToHttpsIp({
        hostname: parsedUrl.hostname,
        path: `${parsedUrl.pathname.replace(/\/$/, "")}/v1/extract`.replace(/^\/\//, "/"),
        token,
        image,
        fields: {
          mode,
          preserveLightFabric: input.get("preserveLightFabric") === "true" ? "true" : "false",
          region: region ? JSON.stringify(region) : "",
          regions: Array.isArray(regions) ? upstreamForm.get("regions") : "",
          candidateIndex: Number.isInteger(candidateIndex) ? String(candidateIndex) : "",
        },
      });
      upstream = { body: raw.body, status: raw.status, headers: raw.headers };
    } else {
      upstream = await fetch(`${oracleUrl}/v1/extract`, {
        method: "POST",
        headers: { Authorization: `Bearer ${token}` },
        body: upstreamForm,
      });
    }
  } catch {
    return json({ error: { message: "The image could not be prepared right now. Please try again." } }, 502);
  }
  return new Response(upstream.body, { status: upstream.status, headers: forwardHeaders(upstream) });
}

export function onRequest() {
  return json({ error: { message: "Method not allowed." } }, 405);
}
