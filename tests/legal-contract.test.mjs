import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const root = new URL("../", import.meta.url);

async function page(name) {
  return readFile(new URL(name, root), "utf8");
}

test("privacy policy distinguishes wardrobe content from AI-improvement source media", async () => {
  const privacy = await page("privacy.html");
  assert.match(privacy, /Wardrobe Content[\s\S]+Source Media/);
  assert.match(privacy, /raw Source Media collected specifically for AI Improvement is scheduled for deletion no later than ninety \(90\) days/);
  assert.match(privacy, /ordinarily seeks to complete deletion of applicable raw Source Media within seven \(7\) days/);
  assert.match(privacy, /does not automatically delete Wardrobe Content/);
  assert.match(privacy, /Granting a device permission does not by itself constitute consent/);
});

test("privacy policy covers permissions, service providers, rights, and account deletion", async () => {
  const privacy = await page("privacy.html");
  for (const required of [
    "Camera.",
    "Photos and media.",
    "Location.",
    "Notifications.",
    "Disclosure and Service Providers",
    "User rights",
    "Account and data deletion",
    "Digital Personal Data Protection Act, 2023",
    "ClothMatics Help and Contact page",
  ]) assert.ok(privacy.includes(required), `missing privacy disclosure: ${required}`);
});

test("terms preserve ownership and use a limited content licence", async () => {
  const terms = await page("terms.html");
  assert.match(terms, /you retain ownership of your User Content/);
  assert.match(terms, /limited licence to host, store, technically reproduce, process/);
  assert.match(terms, /does not grant ClothMatics a general right to commercially exploit private User Content/);
  assert.match(terms, /AI outputs constitute general wardrobe and styling information/);
});

test("terms contain proportionate commercial and legal protections", async () => {
  const terms = await page("terms.html");
  for (const required of [
    "Plans, purchases, subscriptions, coupons, and promotions",
    "Prohibited conduct",
    "Service availability and modification",
    "Limitation of liability",
    "To the extent permitted by Applicable Law, you will indemnify",
    "governed by the laws of India",
    "do not designate an exclusive city or court",
    "mandatory consumer right",
  ]) assert.ok(terms.includes(required), `missing terms provision: ${required}`);
});

test("legal pages publish the current effective date and machine-readable date", async () => {
  for (const name of ["privacy.html", "terms.html"]) {
    const html = await page(name);
    assert.match(html, /Effective: 23 August 2026/);
    assert.match(html, /Last updated: 23 August 2026/);
    assert.match(html, /"dateModified":"2026-08-23"/);
  }
});
