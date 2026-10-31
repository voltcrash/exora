import assert from "node:assert/strict";
import { access, readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";

const dist = new URL("../dist/", import.meta.url);
const origin = "https://exora.voltcrash.com";
const sitemap = await readFile(new URL("sitemap.xml", dist), "utf8");
const locations = [...sitemap.matchAll(/<loc>([^<]+)<\/loc>/g)].map((match) => match[1]!);
assert(locations.length > 1, "The sitemap must list readable discovery pages");
assert.equal(new Set(locations).size, locations.length, "Duplicate sitemap locations");
const titles = new Set<string>();
const checked = new Set<string>();

for (const location of locations) {
  const url = new URL(location);
  assert.equal(url.origin, origin);
  assert.equal(url.search, "", "Interactive state URLs must not enter the sitemap");
  const file = new URL(`${url.pathname.slice(1)}index.html`, dist);
  const html = await readFile(file, "utf8");
  const context = fileURLToPath(file);
  assert.equal((html.match(/rel="canonical"/g) ?? []).length, 1, context);
  assert(html.includes(`rel="canonical" href="${location}"`), `Canonical mismatch: ${context}`);
  assert.equal(
    (html.match(/<h1[ >]/g) ?? []).length,
    1,
    `Missing or duplicate heading: ${context}`,
  );
  assert(!html.includes("<!-- discovery:"), `Unexpanded HTML marker: ${context}`);
  const title = html.match(/<title>(.*?)<\/title>/s)?.[1];
  assert(title && !titles.has(title), `Missing or duplicate title: ${context}`);
  titles.add(title);
  assert(html.includes('name="description" content="'), `Missing description: ${context}`);
  assert(html.includes('name="robots" content="index,follow'), `Not indexable: ${context}`);
  const structured = html.match(/<script type="application\/ld\+json">(.*?)<\/script>/s)?.[1];
  assert(structured, `Missing structured data: ${context}`);
  JSON.parse(structured);
  if (url.pathname !== "/")
    assert(
      !html.includes('<script type="module"'),
      `Discovery pages must not require application JavaScript: ${context}`,
    );

  for (const match of html.matchAll(/(?:href|src)="(\/[^"#]*)"/g)) {
    const target = new URL(match[1]!.replaceAll("&amp;", "&"), origin);
    const path = target.pathname;
    if (checked.has(path)) continue;
    checked.add(path);
    await access(new URL(path.endsWith("/") ? `${path.slice(1)}index.html` : path.slice(1), dist));
  }
}

const robots = await readFile(new URL("robots.txt", dist), "utf8");
assert.match(robots, /User-agent: \*\s+Allow: \//);
assert(robots.includes(`Sitemap: ${origin}/sitemap.xml`));
assert(!robots.includes("Disallow:"));
const llms = await readFile(new URL("llms.txt", dist), "utf8");
for (const location of locations.filter((url) => url !== `${origin}/`))
  assert(llms.includes(location));
const notFound = await readFile(new URL("404.html", dist), "utf8");
assert(notFound.includes('name="robots" content="noindex"'));

console.log(
  `[discovery] ${locations.length} indexable pages: unique canonicals and titles, JSON-LD, internal links, crawler policy and llms.txt passed`,
);
