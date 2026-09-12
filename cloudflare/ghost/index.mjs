// src/index.js
var CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, PUT, OPTIONS",
  "Access-Control-Allow-Headers": "*",
  "Access-Control-Max-Age": "86400"
};
var index_default = {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    if (request.method === "OPTIONS") {
      return new Response(null, {
        status: 204,
        headers: CORS_HEADERS
      });
    }
    if (url.pathname === "/set-target") {
      if (request.method !== "POST") return new Response("Use POST to register a backend.", {status:405,headers:{...CORS_HEADERS,Allow:"POST"}});
      if (!env.CLOTHMATICS_SYNC_TOKEN) return new Response("Backend registration is not configured.",{status:503,headers:CORS_HEADERS});
      const supplied = request.headers.get("X-Sync-Token") || "";
      const encode = new TextEncoder();
      const expectedHash = new Uint8Array(await crypto.subtle.digest("SHA-256",encode.encode(env.CLOTHMATICS_SYNC_TOKEN)));
      const suppliedHash = new Uint8Array(await crypto.subtle.digest("SHA-256",encode.encode(supplied)));
      let mismatch = 0;
      for(let i=0;i<expectedHash.length;i++) mismatch |= expectedHash[i]^suppliedHash[i];
      if(mismatch) return new Response("Invalid sync token.",{status:401,headers:CORS_HEADERS});

      let target = url.searchParams.get("url");
      if (!target && request.method === "POST") {
        try {
          const body = await request.json();
          target = body.url || body.target_url;
        } catch (_) {
        }
      }
      if (!target) {
        const current = await env.GHOST_CONFIG.get("TARGET_BACKEND_URL");
        return new Response(
          JSON.stringify({
            status: "info",
            message: "Provide ?url=https://your-tunnel.trycloudflare.com to update target backend.",
            current_target: current || null
          }, null, 2),
          { status: 200, headers: { "Content-Type": "application/json", ...CORS_HEADERS } }
        );
      }
      try {
        if(typeof target !== "string") throw Error("Invalid target");
        const parsed = new URL(target.trim());
        if(parsed.protocol !== "https:" || parsed.username || parsed.password || parsed.port || parsed.search || parsed.hash || parsed.pathname !== "/" || !/^[a-z0-9-]+\.trycloudflare\.com$/.test(parsed.hostname)) throw Error("Invalid target");
        target = parsed.origin;
      } catch { return new Response("A valid HTTPS Kaggle Quick Tunnel origin is required.",{status:400,headers:CORS_HEADERS}); }
      await env.GHOST_CONFIG.put("TARGET_BACKEND_URL", target);
      return new Response(
        JSON.stringify({
          status: "success",
          message: "Target backend URL updated successfully in KV storage.",
          active_target: target,
          timestamp: (/* @__PURE__ */ new Date()).toISOString()
        }, null, 2),
        { status: 200, headers: { "Content-Type": "application/json", ...CORS_HEADERS } }
      );
    }
    const targetBackend = await env.GHOST_CONFIG.get("TARGET_BACKEND_URL");
    if (url.pathname === "/" || url.pathname === "/health") {
      if (!targetBackend) {
        return new Response(
          JSON.stringify({
            status: "waiting_for_backend",
            service: "ClothMatics Ghost Mannequin Proxy",
            active_target: null,
            message: "Kaggle backend tunnel is not registered yet. Run Cell 3 in Kaggle to connect."
          }, null, 2),
          { status: 200, headers: { "Content-Type": "application/json", ...CORS_HEADERS } }
        );
      }
      try {
        const healthCheck = await fetch(`${targetBackend}/health`, {
          method: "GET",
          headers: { "Accept": "application/json", "User-Agent": "ClothMatics-Proxy/1.0" },
          signal: AbortSignal.timeout(5e3)
        });
        if (!healthCheck.ok) {
          return new Response(
            JSON.stringify({
              status: "backend_offline",
              service: "ClothMatics Ghost Mannequin Proxy",
              active_target: targetBackend,
              target_status: healthCheck.status,
              message: `Target backend at ${targetBackend} is unreachable (Status ${healthCheck.status}). Please restart Kaggle Cell 3.`
            }, null, 2),
            { status: 503, headers: { "Content-Type": "application/json", ...CORS_HEADERS } }
          );
        }
        const backendData = await healthCheck.json().catch(() => ({}));
        return new Response(
          JSON.stringify({
            status: "online",
            service: "ClothMatics Ghost Mannequin Proxy",
            active_target: targetBackend,
            backend_response: backendData
          }, null, 2),
          { status: 200, headers: { "Content-Type": "application/json", ...CORS_HEADERS } }
        );
      } catch (err) {
        return new Response(
          JSON.stringify({
            status: "backend_offline",
            service: "ClothMatics Ghost Mannequin Proxy",
            active_target: targetBackend,
            message: `Target backend at ${targetBackend} is not responding. Please restart Kaggle Cell 3.`,
            error: err.message
          }, null, 2),
          { status: 503, headers: { "Content-Type": "application/json", ...CORS_HEADERS } }
        );
      }
    }
    if (!targetBackend) {
      return new Response(
        JSON.stringify({
          error: "Backend Offline",
          status: 503,
          message: "Kaggle GPU backend is not currently registered. Please run Cell 3 in Kaggle."
        }, null, 2),
        { status: 503, headers: { "Content-Type": "application/json", ...CORS_HEADERS } }
      );
    }
    const targetUrl = new URL(url.pathname + url.search, targetBackend);
    const forwardHeaders = new Headers(request.headers);
    forwardHeaders.delete("host");
    forwardHeaders.delete("authorization");
    forwardHeaders.delete("cookie");
    forwardHeaders.delete("x-sync-token");
    try {
      const backendResponse = await fetch(targetUrl.toString(), {
        method: request.method,
        headers: forwardHeaders,
        body: request.body,
        redirect: "manual"
      });
      if(backendResponse.status>=300&&backendResponse.status<400) return new Response(JSON.stringify({error:"Unexpected backend redirect"}),{status:502,headers:{"Content-Type":"application/json",...CORS_HEADERS}});
      const contentType = backendResponse.headers.get("content-type") || "";
      if (backendResponse.status === 530 || url.pathname === "/generate" && contentType.includes("text/html")) {
        return new Response(
          JSON.stringify({
            error: "Backend Offline",
            status: 503,
            message: `Kaggle GPU tunnel (${targetBackend}) has expired. Please run Cell 3 in Kaggle to re-activate.`
          }, null, 2),
          { status: 503, headers: { "Content-Type": "application/json", ...CORS_HEADERS } }
        );
      }
      const responseHeaders = new Headers(backendResponse.headers);
      responseHeaders.set("Access-Control-Allow-Origin", "*");
      responseHeaders.set("Access-Control-Allow-Methods", "GET, POST, PUT, OPTIONS");
      responseHeaders.set("Access-Control-Allow-Headers", "*");
      return new Response(backendResponse.body, {
        status: backendResponse.status,
        statusText: backendResponse.statusText,
        headers: responseHeaders
      });
    } catch (err) {
      return new Response(
        JSON.stringify({
          error: "Proxy Forwarding Failed",
          status: 502,
          message: `Could not reach target at ${targetBackend}. Verify Kaggle session is active.`,
          detail: err.message
        }, null, 2),
        { status: 502, headers: { "Content-Type": "application/json", ...CORS_HEADERS } }
      );
    }
  }
};
export {
  index_default as default
};
