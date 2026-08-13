import { expect, test } from "vite-plus/test";
import { loadFeaturedPlanet, loadPlanetByName, searchPlanets } from "./api-client.ts";
import { featuredPlanet } from "./planet-profile.ts";

test("uses normalized live API data", async () => {
  const result = await loadFeaturedPlanet(featuredPlanet, async () =>
    Response.json({
      data: { ...featuredPlanet, name: "HIP 65426 b · live" },
      meta: { cached: true, source: "NASA Exoplanet Archive" },
    }),
  );

  expect(result.mode).toBe("live");
  expect(result.cached).toBe(true);
  expect(result.planet.name).toContain("live");
});

test("falls back when the API is unavailable", async () => {
  const result = await loadFeaturedPlanet(
    featuredPlanet,
    async () => new Response(null, { status: 502 }),
  );

  expect(result).toMatchObject({ mode: "fallback", planet: featuredPlanet });
});

test("loads a planet by its exact archive name", async () => {
  const result = await loadPlanetByName("WASP-39 b", async (input) => {
    const requestUrl =
      typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
    expect(requestUrl).toContain("WASP-39%20b");
    return Response.json({
      data: { ...featuredPlanet, id: "wasp-39-b", name: "WASP-39 b" },
      meta: { cached: false, source: "NASA Exoplanet Archive" },
    });
  });

  expect(result?.planet.id).toBe("wasp-39-b");
});

test("returns normalized planet search results", async () => {
  const result = await searchPlanets("wasp", {
    fetcher: async () =>
      Response.json({
        data: [featuredPlanet],
        meta: {
          cached: false,
          count: 1,
          query: "wasp",
          source: "NASA Exoplanet Archive",
        },
      }),
  });

  expect(result).toMatchObject({ planets: [{ id: "hip-65426-b" }], query: "wasp" });
});
