import { json } from "../../_shared/firebase-rest.mjs";

export async function onRequestGet({ env }) {
  const serpApiKey = String(env.SERPAPI_API_KEY || env.SERPAPI_KEY || "").trim();
  const serperApiKey = String(
    env.SERPER_API_KEY ||
    env.SERPER_KEY ||
    env.SERVER_DEV_API_KEY ||
    env.SERVER_API_KEY ||
    env.SERPER_DEV_API_KEY ||
    ""
  ).trim();
  const geminiKey = String(env.GEMINI_API_KEY || "").trim();
  const preferredProvider = String(env.SHOPPING_PROVIDER || "auto").trim().toLowerCase();

  let activeStrategy = "Sample Data (No API keys configured)";
  if (serperApiKey && serpApiKey) {
    activeStrategy = "Dual Provider: SerpApi Primary + Serper.dev Fallback";
  } else if (serperApiKey) {
    activeStrategy = "Live: Serper.dev (server.dev) Primary";
  } else if (serpApiKey) {
    activeStrategy = "Live: SerpApi Primary";
  }

  return json({
    ok: true,
    providers: {
      serper: {
        name: "Serper.dev (server.dev)",
        configured: Boolean(serperApiKey),
        role: serperApiKey && !serpApiKey ? "Primary" : (serperApiKey ? "Fallback" : "Inactive")
      },
      serpapi: {
        name: "SerpApi",
        configured: Boolean(serpApiKey),
        role: serpApiKey ? "Primary" : "Inactive"
      },
      gemini: {
        name: "Google Gemini AI",
        configured: Boolean(geminiKey),
        role: "Outfit Styling Intent"
      }
    },
    activeStrategy,
    preferredProvider,
    timestamp: new Date().toISOString()
  });
}
