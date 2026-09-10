import { AI_GATEWAY_URL, CORE_API_URL } from "./config.js";

export class ClothmaticsApiError extends Error {
  constructor(message, { code = "unknown", status = 500, details = null } = {}) {
    super(message);
    this.name = "ClothmaticsApiError";
    this.code = code;
    this.status = status;
    this.details = details;
  }
}

async function authenticatedFetch(user, baseUrl, path, { method = "POST", data = {}, signal } = {}) {
  if (!user) throw new ClothmaticsApiError("Sign in required.", { code: "unauthenticated", status: 401 });
  if (!baseUrl) throw new ClothmaticsApiError("This feature is temporarily unavailable.", { code: "unavailable", status: 503 });
  const send = async (refresh) => fetch(`${baseUrl.replace(/\/$/, "")}${path}`, {
    method,
    headers: { Authorization: `Bearer ${await user.getIdToken(refresh)}`, "Content-Type": "application/json" },
    ...(method === "GET" ? {} : { body: JSON.stringify(data) }),
    signal,
  });
  let response;
  try {
    response = await send(false);
  } catch (error) {
    if (method !== "GET" || signal?.aborted) throw error;
    await new Promise((resolve) => setTimeout(resolve, 700));
    response = await send(false);
  }
  if (method === "GET" && response.status === 503) {
    await new Promise((resolve) => setTimeout(resolve, 700));
    response = await send(false);
  }
  if (response.status === 401) response = await send(true);
  const body = await response.json().catch(() => ({}));
  if (!response.ok) {
    const error = body?.error || body;
    const code = String(error?.code || (response.status === 429 ? "DAILY_LIMIT" : "unknown"));
    const message = response.status === 429 || code === "DAILY_LIMIT" || code === "resource-exhausted"
      ? "You have used today’s AI allowance. Your calls reset at midnight IST."
      : response.status === 503
      ? "We couldn’t process this photo right now. Please try again."
      : String(error?.message || `Request failed (${response.status}).`);
    throw new ClothmaticsApiError(message, { code, status: response.status, details: body?.details || null });
  }
  return { body, response };
}

export async function callCoreApi(user, path, data = {}, options = {}) {
  return (await authenticatedFetch(user, CORE_API_URL, path, { data, ...options })).body;
}

export async function callAiGateway(user, path, data, options = {}) {
  return authenticatedFetch(user, AI_GATEWAY_URL, path, { data, ...options });
}

export async function callUserAi(user, payload, options = {}) {
  const { body, response } = await callAiGateway(user, "/v1/generate", payload, options);
  const text = body?.candidates?.[0]?.content?.parts?.map((part) => part?.text || "").join("").trim();
  if (!text) throw new ClothmaticsApiError("The stylist returned an empty response.", { status: 502, code: "invalid-response" });
  let data;
  try { data = JSON.parse(text.replace(/```json|```/g, "").trim()); }
  catch { throw new ClothmaticsApiError("The stylist returned an invalid response. Please try again.", { status: 502, code: "invalid-response" }); }
  return {
    data,
    provider: response.headers.get("X-AI-Provider") || body?._clothmatics?.provider || "unknown",
    model: response.headers.get("X-AI-Model") || body?._clothmatics?.model || "unknown",
  };
}

const CACHE_PREFIX = "clothmatics:web-ai:";
export function aiCacheKey(uid, feature, promptHash, wardrobeFingerprint, requestFingerprint) {
  return `${CACHE_PREFIX}${uid}:${feature}:${promptHash}:${wardrobeFingerprint}:${requestFingerprint}`;
}
export function readAiCache(key, maxAgeMs = 6 * 60 * 60 * 1000) {
  try {
    const parsed = JSON.parse(localStorage.getItem(key) || "null");
    return parsed?.savedAt > Date.now() - maxAgeMs ? parsed.value : null;
  } catch { return null; }
}
export function writeAiCache(key, value) {
  try { localStorage.setItem(key, JSON.stringify({ savedAt: Date.now(), value })); } catch {}
}
export function clearUserAiCache(uid) {
  try {
    for (let index = localStorage.length - 1; index >= 0; index -= 1) {
      const key = localStorage.key(index);
      if (key?.startsWith(`${CACHE_PREFIX}${uid}:`)) localStorage.removeItem(key);
    }
  } catch {}
}
