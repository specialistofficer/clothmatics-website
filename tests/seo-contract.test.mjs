import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const root = new URL("../", import.meta.url);
const publicPages = [
  ["index.html", "https://clothmatics.pages.dev/"],
  ["photo-guide.html", "https://clothmatics.pages.dev/photo-guide"],
  ["faq.html", "https://clothmatics.pages.dev/faq"],
  ["privacy.html", "https://clothmatics.pages.dev/privacy"],
  ["terms.html", "https://clothmatics.pages.dev/terms"],
  ["contact.html", "https://clothmatics.pages.dev/contact"],
];

test("every public page has complete index and sharing metadata", async () => {
  for (const [file, canonical] of publicPages) {
    const html = await readFile(new URL(file, root), "utf8");
    assert.ok(html.includes(`<link rel="canonical" href="${canonical}"`), `${file} canonical is missing`);
    assert.match(html, /<meta name="robots" content="index,follow[^"\n]*"/, file);
    assert.match(html, /property="og:image" content="https:\/\/clothmatics\.pages\.dev\/assets\/clothmatics-social\.png"/, file);
    assert.match(html, /name="twitter:image" content="https:\/\/clothmatics\.pages\.dev\/assets\/clothmatics-social\.png"/, file);
    assert.equal((html.match(/<h1\b/g) || []).length, 1, `${file} must have one H1`);
    for (const match of html.matchAll(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/g)) assert.doesNotThrow(() => JSON.parse(match[1]), `${file} has invalid JSON-LD`);
  }
});

test("public copy avoids implementation and configuration language", async () => {
  const combined = (await Promise.all(publicPages.map(([file]) => readFile(new URL(file, root), "utf8")))).join("\n");
  assert.doesNotMatch(combined, /Cloudflare|Firestore|Firebase|API key|server function|custom claim|account UID|prompt hash/i);
});

test("FAQ schema covers every visible FAQ question", async () => {
  const html = await readFile(new URL("faq.html", root), "utf8");
  const visibleQuestions = [...html.matchAll(/<details class="faq-item"><summary>(.*?)<\/summary>/g)].map((match) => match[1].replace(/<[^>]+>/g, ""));
  const json = JSON.parse(html.match(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/)[1]);
  const faq = json["@graph"].find((entry) => entry["@type"] === "FAQPage");
  assert.equal(faq.mainEntity.length, visibleQuestions.length);
  assert.equal(new Set(faq.mainEntity.map((entry) => entry.name)).size, visibleQuestions.length);
  assert.ok(faq.mainEntity.every((entry) => entry.acceptedAnswer?.text));
});

test("sitemap contains every canonical public route", async () => {
  const sitemap = await readFile(new URL("sitemap.xml", root), "utf8");
  for (const [, canonical] of publicPages) assert.ok(sitemap.includes(`<loc>${canonical}</loc>`), `Missing sitemap URL: ${canonical}`);
});

test("social preview is 1200 by 630 pixels", async () => {
  const image = await readFile(new URL("assets/clothmatics-social.png", root));
  assert.equal(image.readUInt32BE(16), 1200);
  assert.equal(image.readUInt32BE(20), 630);
});

test("Google Search Console verification file is exact", async () => {
  const verification = await readFile(new URL("googled46210596bbf9069.html", root), "utf8");
  assert.equal(verification.trim(), "google-site-verification: googled46210596bbf9069.html");
});
