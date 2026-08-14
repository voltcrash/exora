import { expect, test } from "vite-plus/test";
import {
  discoverRandomPlanet,
  discoverRandomStar,
  loadFeaturedPlanet,
  loadPlanetFilterPool,
  loadPlanetByName,
  loadPlanetsByHost,
  loadStarByName,
  searchPlanets,
  searchStars,
} from "./api-client.ts";
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

test("loads the confirmed planets connected to a star", async () => {
  const result = await loadPlanetsByHost("HIP 65426", {
    fetcher: async (input) => {
      expect(input).toContain("host=HIP%2065426");
      return Response.json({
        data: [featuredPlanet],
        meta: {
          cached: true,
          count: 1,
          query: "HIP 65426",
          source: "NASA Exoplanet Archive",
        },
      });
    },
  });

  expect(result).toMatchObject({ cached: true, planets: [{ id: "hip-65426-b" }] });
});

test("loads a broad field for local physical filtering", async () => {
  const result = await loadPlanetFilterPool({
    fetcher: async (input) => {
      expect(input).toBe("/api/planets?browse=physical-controls&limit=120");
      return Response.json({
        data: [featuredPlanet],
        meta: {
          cached: true,
          count: 1,
          query: "physical-controls",
          source: "NASA Exoplanet Archive",
        },
      });
    },
  });

  expect(result).toMatchObject({ planets: [{ id: "hip-65426-b" }] });
});

test("chooses a renderable surprise planet from a curated archive result", async () => {
  const result = await discoverRandomPlanet({
    random: () => 0,
    fetcher: async (input) => {
      expect(input).toContain("category=most-earth-like");
      return Response.json({
        data: [featuredPlanet],
        meta: {
          cached: true,
          count: 1,
          query: "most-earth-like",
          source: "NASA Exoplanet Archive",
        },
      });
    },
  });

  expect(result).toMatchObject({ cached: true, planet: { id: "hip-65426-b" } });
});

const starPayload = {
  data: {
    id: "alf-cma",
    name: "Sirius",
    catalogName: "* alf CMa",
    kind: "binary",
    objectType: "Spectroscopic binary",
    observation: {
      rightAscensionDegrees: 101.287,
      declinationDegrees: -16.716,
      parallaxMas: 379.21,
      distanceParsecs: 2.637,
      properMotionRaMasPerYear: -546.01,
      properMotionDecMasPerYear: -1223.07,
      radialVelocityKmPerSecond: -5.5,
      spectralType: "A0mA1Va",
      visualMagnitude: -1.46,
      gaiaMagnitude: null,
    },
    source: {
      archive: "SIMBAD",
      tables: ["basic", "ident", "allfluxes"],
      retrievedOn: "2026-08-14",
    },
  },
  meta: { cached: false, source: "SIMBAD" },
} as const;

test("loads a star by its familiar name", async () => {
  const result = await loadStarByName("Sirius", async () => Response.json(starPayload));
  expect(result?.star).toMatchObject({ id: "alf-cma", name: "Sirius" });
});

test("loads featured stars for an empty catalog query", async () => {
  const result = await searchStars("", {
    fetcher: async (input) => {
      expect(input).toBe("/api/stars/featured");
      return Response.json({
        data: [starPayload.data],
        meta: { cached: true, count: 1, query: "", source: "SIMBAD" },
      });
    },
  });
  expect(result).toMatchObject({ cached: true, stars: [{ name: "Sirius" }] });
});

test("chooses a surprise star from a curated SIMBAD result", async () => {
  const result = await discoverRandomStar({
    random: () => 0,
    fetcher: async (input) => {
      expect(input).toContain("category=closest-neighbors");
      return Response.json({
        data: [starPayload.data],
        meta: { cached: false, count: 1, query: "closest-neighbors", source: "SIMBAD" },
      });
    },
  });

  expect(result).toMatchObject({ cached: false, star: { name: "Sirius" } });
});
