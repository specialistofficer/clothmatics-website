import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { markdownForPath, markdownResponse, prefersMarkdown } from "../functions/_shared/agent-content.mjs";

const root = new URL("../", import.meta.url);

test("content negotiation prefers explicitly requested Markdown", () => {
  assert.equal(prefersMarkdown("text/markdown"), true);
  assert.equal(prefersMarkdown("text/markdown, text/html;q=0.9"), true);
  assert.equal(prefersMarkdown("text/*"), true);
  assert.equal(prefersMarkdown("text/html, text/markdown;q=0.5"), false);
  assert.equal(prefersMarkdown("*/*"), false);
  assert.equal(prefersMarkdown("text/markdown;q=0"), false);
});

test("home page has a useful Markdown representation with negotiation headers", async () => {
  const markdown = markdownForPath("/");
  assert.match(markdown, /^---[\s\S]+# ClothMatics/m);
  assert.match(markdown, /Mobile app and website boundaries/);
  assert.match(markdown, /https:\/\/clothmatics\.pages\.dev\/privacy/);

  const response = markdownResponse(markdown);
  assert.match(response.headers.get("content-type"), /^text\/markdown/);
  assert.equal(response.headers.get("vary"), "Accept");
  assert.equal(response.headers.get("content-signal"), "search=yes, ai-input=yes, ai-train=no");
});

test("crawler policy and llms.txt expose consistent AI discovery metadata", async () => {
  const [robots, llms, headers, html] = await Promise.all([
    readFile(new URL("robots.txt", root), "utf8"),
    readFile(new URL("llms.txt", root), "utf8"),
    readFile(new URL("_headers", root), "utf8"),
    readFile(new URL("index.html", root), "utf8"),
  ]);
  assert.match(robots, /Content-Signal: search=yes, ai-input=yes, ai-train=no/);
  assert.match(llms, /^# ClothMatics[\s\S]+## Product/m);
  assert.match(headers, /<\/llms\.txt>; rel="describedby"/);
  assert.match(html, /rel="describedby" href="https:\/\/clothmatics\.pages\.dev\/llms\.txt"/);
});
