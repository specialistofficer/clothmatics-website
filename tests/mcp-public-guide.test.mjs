import assert from "node:assert/strict";
import test from "node:test";
import { handleMcpMessage, mcpServerCard, mcpServerCardResponse } from "../functions/_shared/mcp-public-guide.mjs";

test("MCP Server Card points to a real read-only Streamable HTTP endpoint", () => {
  const card = mcpServerCard();
  assert.equal(card.$schema, "https://static.modelcontextprotocol.io/schemas/v1/server-card.schema.json");
  assert.equal(card.name, "dev.pages.clothmatics/public-guide");
  assert.equal(card.remotes[0].type, "streamable-http");
  assert.equal(card.remotes[0].url, "https://clothmatics.pages.dev/mcp");
  assert.ok(card.remotes[0].supportedProtocolVersions.includes("2025-11-25"));

  const response = mcpServerCardResponse();
  assert.match(response.headers.get("content-type"), /^application\/mcp-server-card\+json/);
  assert.equal(response.headers.get("access-control-allow-origin"), "*");
});

test("MCP initialization declares only public read-only capabilities", () => {
  const result = handleMcpMessage({
    jsonrpc: "2.0",
    id: 1,
    method: "initialize",
    params: { protocolVersion: "2025-11-25", capabilities: {}, clientInfo: { name: "test", version: "1.0.0" } },
  });
  assert.equal(result.status, 200);
  assert.equal(result.body.result.protocolVersion, "2025-11-25");
  assert.deepEqual(Object.keys(result.body.result.capabilities).sort(), ["resources", "tools"]);
  assert.match(result.body.result.instructions, /never provides private wardrobe or account data/i);
});

test("MCP lists and calls its public discovery tools", () => {
  const listed = handleMcpMessage({ jsonrpc: "2.0", id: 2, method: "tools/list", params: {} });
  assert.deepEqual(listed.body.result.tools.map((tool) => tool.name), ["get_clothmatics_overview", "find_public_resource"]);
  assert.ok(listed.body.result.tools.every((tool) => tool.annotations.readOnlyHint === true && tool.annotations.destructiveHint === false));

  const called = handleMcpMessage({ jsonrpc: "2.0", id: 3, method: "tools/call", params: { name: "find_public_resource", arguments: { topic: "about" } } });
  assert.equal(called.body.result.isError, undefined);
  assert.equal(called.body.result.structuredContent.url, "https://clothmatics.pages.dev/about");
  assert.match(called.body.result.content[0].text, /About ClothMatics/);
});

test("MCP public resources reject unknown private or invented URIs", () => {
  const listed = handleMcpMessage({ jsonrpc: "2.0", id: 4, method: "resources/list", params: {} });
  assert.ok(listed.body.result.resources.some((resource) => resource.uri === "clothmatics://public/privacy"));
  assert.ok(listed.body.result.resources.every((resource) => !/wardrobe|account/i.test(resource.uri)));

  const missing = handleMcpMessage({ jsonrpc: "2.0", id: 5, method: "resources/read", params: { uri: "clothmatics://private/wardrobe" } });
  assert.equal(missing.body.error.code, -32602);
});

test("MCP notifications are accepted without a JSON-RPC response body", () => {
  const result = handleMcpMessage({ jsonrpc: "2.0", method: "notifications/initialized", params: {} });
  assert.deepEqual(result, { status: 202, body: null });
});
