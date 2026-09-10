import { markdownForPath, markdownResponse, prefersMarkdown } from "./_shared/agent-content.mjs";
import { mcpServerCardResponse } from "./_shared/mcp-public-guide.mjs";

export async function onRequest(context) {
  const { request } = context;
  const pathname = new URL(request.url).pathname;
  const isServerCard = [
    "/.well-known/mcp/server-card",
    "/.well-known/mcp/server-card.json",
    "/mcp/server-card",
    "/mcp/server-card.json",
  ].includes(pathname);
  if ((request.method === "GET" || request.method === "HEAD") && isServerCard) {
    return mcpServerCardResponse({ head: request.method === "HEAD" });
  }
  if ((request.method === "GET" || request.method === "HEAD") && prefersMarkdown(request.headers.get("Accept"))) {
    const markdown = markdownForPath(pathname);
    if (markdown) return markdownResponse(markdown, { head: request.method === "HEAD" });
  }
  return context.next();
}
