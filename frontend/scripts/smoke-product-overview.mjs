import assert from "node:assert/strict";

// Run against a started frontend. No backend session is needed.
const base = process.argv[2] || "http://localhost:3000";
const response = await fetch(new URL("/product-guide", base), { redirect: "manual" });
assert.equal(response.status, 200, "The product overview must be available without a session");

const page = await response.text();
for (const text of [
  "SerpHawk CRM Documentation",
  "Product overview",
  "Sales workflow",
  "Admissions workflow",
  "CRM capabilities",
  "Workspace and access",
  "Capture and assign enquiries",
  "Research and follow up",
  "Manage the relationship",
  'href="/demo"',
]) {
  assert.ok(page.includes(text), `Public page is missing ${text}`);
}
assert.doesNotMatch(page, /Loading workspace|Loading product guide|Company Unavailable/);
assert.doesNotMatch(page, /small (?:sales and admissions )?teams|2[–-]10/i);
assert.match(page, /<nav aria-label="Documentation sections"/);
for (const section of ["overview", "sales", "admissions", "capabilities", "workspace"]) {
  assert.ok(page.includes(`href="#${section}"`) && page.includes(`id="${section}"`), `Missing documentation navigation for ${section}`);
}

const logo = page.match(/<img\b[^>]*\bsrc="(\/Serp%20Hawk%20Logo\.png)"/)?.[1];
assert.ok(logo, "The header must reference the official logo directly");
const artwork = await fetch(new URL(logo, base), { redirect: "manual" });
assert.equal(artwork.status, 200, "The logo must be served to signed-out visitors");
const pngSignature = new Uint8Array(await artwork.arrayBuffer()).subarray(0, 8);
assert.deepEqual([...pngSignature], [137, 80, 78, 71, 13, 10, 26, 10], "The logo must be a PNG");

const showcase = await fetch(new URL("/showcase", base));
assert.equal(showcase.status, 200);
assert.match(await showcase.text(), /href="\/product-guide"/);
console.log("Product overview, official logo, and showcase link are available without a session.");
