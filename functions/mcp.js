import { handleMcpMessage, mcpJsonResponse } from "./_shared/mcp-public-guide.mjs";

export async function onRequestPost({ request }) {
  const contentType = request.headers.get("Content-Type") || "";
  if (!contentType.toLowerCase().includes("application/json")) {
    return mcpJsonResponse({ status: 415, body: { jsonrpc: "2.0", id: null, error: { code: -32600, message: "Content-Type must be application/json." } } });
  }
  let message;
  try { message = await request.json(); }
  catch { return mcpJsonResponse({ status: 400, body: { jsonrpc: "2.0", id: null, error: { code: -32700, message: "Parse error" } } }); }
  return mcpJsonResponse(handleMcpMessage(message));
}

export function onRequestGet() {
  return new Response(null, { status: 405, headers: { Allow: "POST, OPTIONS", "Access-Control-Allow-Origin": "*" } });
}

export function onRequestOptions() {
  return new Response(null, {
    status: 204,
    headers: {
      "Access-Control-Allow-Headers": "Content-Type, MCP-Protocol-Version, MCP-Session-Id",
      "Access-Control-Allow-Methods": "POST, OPTIONS",
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Max-Age": "86400",
    },
  });
}
