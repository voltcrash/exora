import { readFile } from "node:fs/promises";
import { decodePlanetCatalog, type PlanetCatalogSnapshot } from "@exora/planet-catalog";
import { expect, test } from "vite-plus/test";
import { buildPages, buildSitemap, homepage, renderDocument } from "../discovery/pages.ts";
import { featuredPlanet } from "./planet-profile.ts";
import { NOTABLE_PLANET_NAMES } from "./search-discovery.ts";

const snapshot = JSON.parse(
  new TextDecoder().decode(
    await readFile(
      new URL("../../../packages/planet-catalog/data/pscomppars.json", import.meta.url),
    ),
  ),
) as PlanetCatalogSnapshot;
const planets = decodePlanetCatalog(snapshot);
const pages = buildPages(planets);

test("every featured planet has a source-backed readable page and one sitemap entry", () => {
  const profiles = pages.filter((page) => page.path.startsWith("/explore/planets/"));
  expect(profiles).toHaveLength(NOTABLE_PLANET_NAMES.length);
  for (const planet of planets.filter((item) => NOTABLE_PLANET_NAMES.includes(item.name))) {
    const profile = profiles.find((page) => page.path === `/explore/planets/${planet.id}/`);
    expect(profile?.body).toContain(planet.source.retrievedOn);
    expect(profile?.body).toContain(
      `https://exoplanetarchive.ipac.caltech.edu/overview/${encodeURIComponent(planet.name)}`,
    );
    expect(profile?.body).toContain(`/?planet=${encodeURIComponent(planet.name)}`);
  }
  const sitemap = buildSitemap(pages);
  expect(sitemap.match(/<loc>/g)).toHaveLength(pages.length + 1);
  expect(sitemap).not.toContain("?planet=");
  expect(new Set(pages.map((page) => page.path)).size).toBe(pages.length);
});

test("structured data identifies the app and page without inventing ratings", () => {
  for (const page of [homepage, ...pages]) {
    const html = renderDocument(page);
    const structured = html.match(/<script type="application\/ld\+json">(.*?)<\/script>/s)?.[1];
    expect(structured, page.path).toBeDefined();
    const schema = JSON.parse(structured!) as { "@graph": { "@type": string }[] };
    expect(schema["@graph"].map((entity) => entity["@type"])).toContain("WebApplication");
    expect(schema["@graph"].map((entity) => entity["@type"])).toContain(page.type);
    expect(html).not.toMatch(/aggregateRating|reviewCount/);
  }
});

test("profile values preserve unknowns, provenance and escape untrusted catalog text", () => {
  const planet = {
    ...featuredPlanet,
    id: "safe-id",
    name: "TRAPPIST-1 e",
    hostStar: '<script>alert("catalog")</script>',
    observation: {
      ...featuredPlanet.observation,
      radiusEarth: null,
      massEarth: null,
      discoveryYear: null,
      orbitalPeriodDays: null,
    },
  };
  const page = buildPages([planet]).find((entry) => entry.path === "/explore/planets/safe-id/")!;
  const html = renderDocument(page);
  expect(page.body).toContain("Not reported");
  expect(page.body).toContain("minimum");
  expect(page.body).toContain("estimated");
  expect(page.body).not.toContain("null");
  expect(html).not.toContain('<script>alert("catalog")</script>');
  expect(html).toContain("&lt;script&gt;");
  const structured = html.match(/<script type="application\/ld\+json">(.*?)<\/script>/s)?.[1];
  expect(() => JSON.parse(structured!)).not.toThrow();
});
