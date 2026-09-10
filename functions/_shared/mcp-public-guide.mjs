const SITE_URL = "https://clothmatics.pages.dev";
const SERVER_NAME = "dev.pages.clothmatics/public-guide";
const SERVER_VERSION = "1.0.0";
const PROTOCOL_VERSIONS = ["2025-11-25", "2025-06-18", "2025-03-26"];

const PUBLIC_RESOURCES = Object.freeze({
  about: { title: "About ClothMatics", url: `${SITE_URL}/about`, description: "Purpose, product boundaries, and operating principles." },
  faq: { title: "Help and FAQ", url: `${SITE_URL}/faq`, description: "Answers about accounts, wardrobe access, outfits, planning, privacy, and troubleshooting." },
  photo_guide: { title: "Photo guide", url: `${SITE_URL}/photo-guide`, description: "How to take full-body outfit and single-garment photos for ClothMatics." },
  privacy: { title: "Privacy Policy", url: `${SITE_URL}/privacy`, description: "Data handling, permissions, AI features, retention, rights, and deletion practices." },
  terms: { title: "Terms of Use", url: `${SITE_URL}/terms`, description: "Terms governing accounts, wardrobe services, user content, AI features, and acceptable use." },
  contact: { title: "Help and Contact", url: `${SITE_URL}/contact`, description: "Product support, privacy questions, and authenticated account-deletion requests." },
  android_app: { title: "ClothMatics on Google Play", url: `${SITE_URL}/r?to=play`, description: "Official Android app listing." },
});

export function mcpServerCard() {
  return {
    $schema: "https://static.modelcontextprotocol.io/schemas/v1/server-card.schema.json",
    name: SERVER_NAME,
    version: SERVER_VERSION,
    title: "ClothMatics Public Guide",
    description: "Read-only product facts and public resource discovery for ClothMatics.",
    websiteUrl: `${SITE_URL}/about`,
    icons: [{ src: `${SITE_URL}/assets/clothmatics-logo.png`, mimeType: "image/png" }],
    remotes: [{ type: "streamable-http", url: `${SITE_URL}/mcp`, supportedProtocolVersions: PROTOCOL_VERSIONS }],
  };
}

export function mcpServerCardResponse({ head = false } = {}) {
  const body = JSON.stringify(mcpServerCard());
  return new Response(head ? null : body, {
    status: 200,
    headers: {
      "Access-Control-Allow-Origin": "*",
      "Cache-Control": "public, max-age=3600",
      "Content-Type": "application/mcp-server-card+json; charset=utf-8",
      "X-Content-Type-Options": "nosniff",
    },
  });
}

const TOOLS = [
  {
    name: "get_clothmatics_overview",
    title: "Get ClothMatics overview",
    description: "Return public facts about what ClothMatics does and the boundary between its Android app and website.",
    inputSchema: { type: "object", properties: {}, additionalProperties: false },
    annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false },
  },
  {
    name: "find_public_resource",
    title: "Find an official ClothMatics resource",
    description: "Return the canonical URL and description for an official public ClothMatics page.",
    inputSchema: {
      type: "object",
      properties: { topic: { type: "string", enum: Object.keys(PUBLIC_RESOURCES), description: "Public resource topic." } },
      required: ["topic"],
      additionalProperties: false,
    },
    annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false },
  },
];

function response(id, result) {
  return { jsonrpc: "2.0", id, result };
}

function error(id, code, message, data) {
  return { jsonrpc: "2.0", id: id ?? null, error: { code, message, ...(data === undefined ? {} : { data }) } };
}

function textResult(text, structuredContent) {
  return { content: [{ type: "text", text }], ...(structuredContent ? { structuredContent } : {}) };
}

function overview() {
  const facts = {
    name: "ClothMatics",
    category: "Digital wardrobe and outfit planner",
    platforms: ["Android", "Web"],
    publicWebsite: SITE_URL,
    about: `${SITE_URL}/about`,
    privacy: "Personal wardrobe data requires authentication and is not exposed through this public MCP server.",
    mobileBoundary: "Garment capture, image replacement, background preparation, and camera-based features are handled in the Android app.",
    webBoundary: "The website provides public product resources and an authenticated companion for wardrobe review, planning, saved looks, and insights.",
  };
  return textResult(`ClothMatics is a digital wardrobe and outfit-planning service for Android and the web. ${facts.mobileBoundary} ${facts.webBoundary} ${facts.privacy}`, facts);
}

function callTool(params = {}) {
  if (params.name === "get_clothmatics_overview") return overview();
  if (params.name === "find_public_resource") {
    const topic = params.arguments?.topic;
    const resource = PUBLIC_RESOURCES[topic];
    if (!resource) return { ...textResult(`Unknown topic. Choose one of: ${Object.keys(PUBLIC_RESOURCES).join(", ")}.`), isError: true };
    return textResult(`${resource.title}: ${resource.description} ${resource.url}`, { topic, ...resource });
  }
  return { ...textResult(`Unknown tool: ${String(params.name || "")}.`), isError: true };
}

export function handleMcpMessage(message) {
  if (!message || typeof message !== "object" || Array.isArray(message) || message.jsonrpc !== "2.0" || typeof message.method !== "string") {
    return { status: 400, body: error(message?.id, -32600, "Invalid Request") };
  }
  if (!("id" in message)) return { status: 202, body: null };

  const { id, method, params = {} } = message;
  if (method === "initialize") {
    const requested = params.protocolVersion;
    const protocolVersion = PROTOCOL_VERSIONS.includes(requested) ? requested : PROTOCOL_VERSIONS[0];
    return { status: 200, body: response(id, {
      protocolVersion,
      capabilities: { tools: { listChanged: false }, resources: { subscribe: false, listChanged: false } },
      serverInfo: { name: SERVER_NAME, title: "ClothMatics Public Guide", version: SERVER_VERSION },
      instructions: "Use this read-only server for public ClothMatics product facts and canonical public links. It never provides private wardrobe or account data.",
    }) };
  }
  if (method === "ping") return { status: 200, body: response(id, {}) };
  if (method === "tools/list") return { status: 200, body: response(id, { tools: TOOLS }) };
  if (method === "tools/call") return { status: 200, body: response(id, callTool(params)) };
  if (method === "resources/list") {
    const resources = Object.entries(PUBLIC_RESOURCES).map(([key, item]) => ({ uri: `clothmatics://public/${key}`, name: key, title: item.title, description: item.description, mimeType: "text/plain" }));
    return { status: 200, body: response(id, { resources }) };
  }
  if (method === "resources/read") {
    const key = String(params.uri || "").replace("clothmatics://public/", "");
    const item = PUBLIC_RESOURCES[key];
    if (!item) return { status: 200, body: error(id, -32602, "Unknown public resource URI") };
    return { status: 200, body: response(id, { contents: [{ uri: params.uri, mimeType: "text/plain", text: `${item.title}\n\n${item.description}\n\nCanonical URL: ${item.url}` }] }) };
  }
  return { status: 200, body: error(id, -32601, "Method not found") };
}

export function mcpJsonResponse(result) {
  return new Response(result.body === null ? null : JSON.stringify(result.body), {
    status: result.status,
    headers: {
      "Access-Control-Allow-Origin": "*",
      "Cache-Control": "no-store",
      "Content-Type": "application/json; charset=utf-8",
      "MCP-Protocol-Version": PROTOCOL_VERSIONS[0],
      "X-Content-Type-Options": "nosniff",
    },
  });
}
