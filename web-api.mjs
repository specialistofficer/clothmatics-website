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
      ? String(error?.message || "We couldn’t process this photo right now. Please try again.")
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

function findJsonObjectEnd(text, start) {
  let depth = 0, inString = false, escaped = false;
  for (let index = start; index < text.length; index += 1) {
    const character = text[index];
    if (inString) {
      if (escaped) escaped = false;
      else if (character === '\\') escaped = true;
      else if (character === '"') inString = false;
      continue;
    }
    if (character === '"') inString = true;
    else if (character === '{') depth += 1;
    else if (character === '}' && --depth === 0) return index;
  }
  return -1;
}

function isInsideArray(text, objStart) {
  let depth = 0, inString = false, escaped = false;
  for (let i = 0; i < objStart; i += 1) {
    const char = text[i];
    if (inString) {
      if (escaped) escaped = false;
      else if (char === '\\') escaped = true;
      else if (char === '"') inString = false;
      continue;
    }
    if (char === '"') inString = true;
    else if (char === '[') depth += 1;
    else if (char === ']' && depth > 0) depth -= 1;
  }
  return depth > 0;
}

function escapeControlCharsInJson(str) {
  let inString = false, escaped = false, out = '';
  for (let i = 0; i < str.length; i += 1) {
    const c = str[i];
    if (inString) {
      if (escaped) {
        escaped = false;
        out += c;
      } else if (c === '\\') {
        escaped = true;
        out += c;
      } else if (c === '"') {
        inString = false;
        out += c;
      } else if (c === '\n') {
        out += '\\n';
      } else if (c === '\r') {
        out += '\\r';
      } else if (c === '\t') {
        out += '\\t';
      } else {
        out += c;
      }
    } else {
      if (c === '"') inString = true;
      out += c;
    }
  }
  return out;
}

function repairTruncatedJson(str) {
  let inString = false, escaped = false, stack = [];
  for (let i = 0; i < str.length; i += 1) {
    const c = str[i];
    if (inString) {
      if (escaped) escaped = false;
      else if (c === '\\') escaped = true;
      else if (c === '"') inString = false;
      continue;
    }
    if (c === '"') inString = true;
    else if (c === '{' || c === '[') stack.push(c);
    else if (c === '}' && stack[stack.length - 1] === '{') stack.pop();
    else if (c === ']' && stack[stack.length - 1] === '[') stack.pop();
  }
  let repaired = str.replace(/,\s*$/, '');
  if (inString) repaired += '"';
  while (stack.length > 0) {
    const open = stack.pop();
    repaired = repaired.replace(/,\s*$/, '');
    repaired += open === '{' ? '}' : ']';
  }
  return repaired;
}

function tryParseJson(str) {
  if (!str || typeof str !== 'string') return null;
  try { return JSON.parse(str); } catch {}
  try { return JSON.parse(str.replace(/,\s*([}\]])/g, '$1')); } catch {}
  try {
    const escaped = escapeControlCharsInJson(str).replace(/,\s*([}\]])/g, '$1');
    return JSON.parse(escaped);
  } catch {}
  try {
    const doubleQuoted = escapeControlCharsInJson(str)
      .replace(/'([^'\\]*(?:\\.[^'\\]*)*)'/g, '"$1"')
      .replace(/,\s*([}\]])/g, '$1');
    return JSON.parse(doubleQuoted);
  } catch {}
  try {
    const pythonFixed = str
      .replace(/\bNone\b/g, 'null')
      .replace(/\bTrue\b/g, 'true')
      .replace(/\bFalse\b/g, 'false')
      .replace(/,\s*([}\]])/g, '$1');
    return JSON.parse(pythonFixed);
  } catch {}
  try {
    const repaired = repairTruncatedJson(escapeControlCharsInJson(str));
    return JSON.parse(repaired);
  } catch {}
  return null;
}

export function parseAiJson(text) {
  const raw = String(text || '').trim();
  if (!raw) return null;

  const fencedMatch = raw.match(/```(?:json|markdown|text)?\s*([\s\S]*?)\s*```/i);
  const target = fencedMatch ? fencedMatch[1].trim() : raw;

  const direct = tryParseJson(target);
  if (direct && typeof direct === 'object') {
    return Array.isArray(direct) ? null : direct;
  }

  const start = target.indexOf('{');
  if (start < 0 || isInsideArray(target, start)) return null;

  const end = findJsonObjectEnd(target, start);
  if (end > start) {
    const candidate = target.slice(start, end + 1);
    const parsed = tryParseJson(candidate);
    if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) return parsed;
  }

  const lastBrace = target.lastIndexOf('}');
  if (lastBrace > start) {
    const candidate = target.slice(start, lastBrace + 1);
    const parsed = tryParseJson(candidate);
    if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) return parsed;
  }

  // Final attempt: repair potential truncation starting from {
  const candidateFromStart = target.slice(start);
  const repairedFromStart = tryParseJson(candidateFromStart);
  if (repairedFromStart && typeof repairedFromStart === 'object' && !Array.isArray(repairedFromStart)) {
    return repairedFromStart;
  }

  return null;
}

export async function callUserAi(user, payload, options = {}) {
  const { body, response } = await callAiGateway(user, "/v1/generate", payload, options);
  const parts = body?.candidates?.[0]?.content?.parts || [];
  const nonThoughtParts = parts.filter((part) => !part?.thought && typeof part?.text === "string" && part.text.trim().length > 0);
  const partsToUse = nonThoughtParts.length > 0 ? nonThoughtParts : parts;
  const text = partsToUse.map((part) => part?.text || "").join("").trim();
  if (!text) throw new ClothmaticsApiError("The stylist returned an empty response.", { status: 502, code: "invalid-response" });
  const data = parseAiJson(text);
  if (!data || typeof data !== "object" || Array.isArray(data)) {
    console.error("[ClothMatics AI Stylist] parseAiJson could not extract JSON from text:", text);
    throw new ClothmaticsApiError("The stylist returned an invalid response. Please try again.", { status: 502, code: "invalid-response", details: text.slice(0, 500) });
  }
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
