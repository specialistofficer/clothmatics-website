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

  let serperCredits = null;
  let serperQueriesUsed = null;
  let serperError = null;

  if (serperApiKey) {
    try {
      let res = await fetch("https://google.serper.dev/account", {
        headers: { "X-API-KEY": serperApiKey },
        signal: AbortSignal.timeout(3500)
      });
      if (!res.ok && res.status === 404) {
        res = await fetch("https://google.serper.dev/credits", {
          headers: { "X-API-KEY": serperApiKey },
          signal: AbortSignal.timeout(3500)
        });
      }
      if (res.ok) {
        const data = await res.json();
        const creds = data?.credits ?? data?.balance ?? data?.remainingCredits ?? null;
        if (typeof creds === "number") {
          serperCredits = creds;
          serperQueriesUsed = Math.max(0, 2500 - creds);
        }
      } else {
        serperError = `HTTP ${res.status}`;
      }
    } catch (e) {
      serperError = e?.message || "Unavailable";
    }
  }

  let serpApiUsage = null;
  let serpApiError = null;

  if (serpApiKey) {
    try {
      const res = await fetch(`https://serpapi.com/account.json?api_key=${encodeURIComponent(serpApiKey)}`, {
        signal: AbortSignal.timeout(3500)
      });
      if (res.ok) {
        const data = await res.json();
        serpApiUsage = {
          planSearchesLeft: data?.plan_searches_left ?? null,
          thisMonthUsage: data?.this_month_usage ?? null,
          totalSearches: data?.total_searches ?? null,
          planName: data?.plan_name || data?.plan_id || null
        };
      } else {
        serpApiError = `HTTP ${res.status}`;
      }
    } catch (e) {
      serpApiError = e?.message || "Unavailable";
    }
  }
  let geminiActiveModel = null;
  let geminiError = null;
  let geminiAvailableModels = [];

  if (geminiKey) {
    try {
      const listRes = await fetch(`https://generativelanguage.googleapis.com/v1beta/models?key=${geminiKey}`, {
        signal: AbortSignal.timeout(4000)
      });
      if (listRes.ok) {
        const listData = await listRes.json();
        geminiAvailableModels = (listData.models || [])
          .map((m) => m.name.replace("models/", ""))
          .filter((m) => m.includes("gemini") || m.includes("flash"));
        geminiActiveModel = geminiAvailableModels[0] || null;
      } else {
        const txt = await listRes.text().catch(() => "");
        geminiError = `List models HTTP ${listRes.status}: ${txt.slice(0, 100)}`;
      }
    } catch (e) {
      geminiError = `List models error: ${e?.message || "Unavailable"}`;
    }
  }

  return json({
    ok: true,
    providers: {
      serper: {
        name: "Serper.dev (server.dev)",
        configured: Boolean(serperApiKey),
        role: serperApiKey && !serpApiKey ? "Primary" : (serperApiKey ? "Fallback" : "Inactive"),
        credits: serperCredits,
        queriesUsed: serperQueriesUsed,
        error: serperError
      },
      serpapi: {
        name: "SerpApi",
        configured: Boolean(serpApiKey),
        role: serpApiKey ? "Primary" : "Inactive",
        searchesThisMonth: serpApiUsage?.thisMonthUsage ?? null,
        planSearchesLeft: serpApiUsage?.planSearchesLeft ?? null,
        totalSearches: serpApiUsage?.totalSearches ?? null,
        planName: serpApiUsage?.planName ?? null,
        error: serpApiError
      },
      gemini: {
        name: "Google Gemini AI",
        configured: Boolean(geminiKey),
        role: "Outfit Styling Intent",
        activeModel: geminiActiveModel,
        availableModels: geminiAvailableModels,
        error: geminiError
      }
    },
    activeStrategy,
    preferredProvider,
    timestamp: new Date().toISOString()
  });
}
