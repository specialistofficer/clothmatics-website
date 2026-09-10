import { bearer, json, verifyFirebaseToken } from "../../_shared/firebase-rest.mjs";
import { DEFAULT_UPLOAD_WORKER_URL } from "../../_shared/service-config.mjs";
const MAX_UPLOAD_BYTES = 6 * 1024 * 1024;
const IMAGE_EXTENSIONS = new Map([
  ["image/jpeg", "jpg"],
  ["image/png", "png"],
  ["image/webp", "webp"],
]);

async function authenticated(request, env) {
  const token = bearer(request.headers.get("Authorization") || "");
  if (!token) return { error: json({ error: { message: "Authentication is required." } }, 401) };
  const identity = await verifyFirebaseToken(token, env.FIREBASE_WEB_API_KEY);
  if (!identity?.localId) return { error: json({ error: { message: "Your session is invalid or expired. Please sign in again." } }, 401) };
  return { token, uid: identity.localId };
}

function uploadWorkerUrl(env) {
  return String(env.UPLOAD_WORKER_URL || DEFAULT_UPLOAD_WORKER_URL).replace(/\/$/, "");
}

export async function onRequestPost({ request, env }) {
  const session = await authenticated(request, env);
  if (session.error) return session.error;
  const contentType = String(request.headers.get("Content-Type") || "").split(";", 1)[0].trim().toLowerCase();
  const extension = IMAGE_EXTENSIONS.get(contentType);
  if (!extension) return json({ error: { message: "Only JPEG, PNG and WebP images are accepted." } }, 415);
  const bytes = await request.arrayBuffer();
  if (bytes.byteLength < 500 || bytes.byteLength > MAX_UPLOAD_BYTES) {
    return json({ error: { message: "Image size is outside the supported range." } }, 413);
  }
  const objectKey = `users/${session.uid}/wardrobe/${crypto.randomUUID()}.${extension}`;
  let upstream;
  try {
    upstream = await fetch(`${uploadWorkerUrl(env)}/upload/${objectKey}`, {
      method: "PUT",
      headers: { Authorization: `Bearer ${session.token}`, "Content-Type": contentType },
      body: bytes,
    });
  } catch {
    return json({ error: { message: "Image storage could not be reached." } }, 502);
  }
  const body = await upstream.json().catch(() => ({ error: { message: "Image storage returned an invalid response." } }));
  return json(body, upstream.status);
}

export async function onRequestDelete({ request, env }) {
  const session = await authenticated(request, env);
  if (session.error) return session.error;
  const objectKey = new URL(request.url).searchParams.get("objectKey") || "";
  if (!objectKey.startsWith(`users/${session.uid}/wardrobe/`) || objectKey.includes("..")) {
    return json({ error: { message: "The image does not belong to this account." } }, 403);
  }
  let upstream;
  try {
    upstream = await fetch(`${uploadWorkerUrl(env)}/upload/${objectKey}`, {
      method: "DELETE",
      headers: { Authorization: `Bearer ${session.token}` },
    });
  } catch {
    return json({ error: { message: "Image storage could not be reached." } }, 502);
  }
  const body = await upstream.json().catch(() => ({ success: upstream.ok }));
  return json(body, upstream.status);
}

export function onRequest() {
  return json({ error: { message: "Method not allowed." } }, 405);
}
