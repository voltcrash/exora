import type { ExoplanetProfile, StarProfile } from "@exora/contracts";
import { expect, test } from "vite-plus/test";
import { createApp } from "../src/app.ts";
import type { PlanetRepository } from "../src/nasa-archive.ts";
import type { StarRepository } from "../src/simbad-archive.ts";

const planet: ExoplanetProfile = {
  id: "hip-65426-b",
  name: "HIP 65426 b",
  hostStar: "HIP 65426",
  kind: "gas-giant",
  observation: {
    radiusJupiter: 1.5,
    massJupiter: 9,
    radiusEarth: 16.8,
    massEarth: 2860.4,
    equilibriumTemperatureKelvin: 1500,
    orbitalPeriodDays: null,
    semiMajorAxisAu: 92,
    distanceParsecs: 108.875,
    discoveryYear: 2017,
    discoveryMethod: "Imaging",
    hostSpectralType: "A2 V",
    hostTemperatureKelvin: 8_840,
    hostRadiusSolar: 1.77,
    hostMassSolar: 1.96,
    hostLuminosityLogSolar: 1.02,
  },
  source: {
    archive: "NASA Exoplanet Archive",
    table: "pscomppars",
    retrievedOn: "2026-08-13",
  },
};

const repository: PlanetRepository = {
  discover: async () => ({ cached: true, value: [planet] }),
  findByName: async () => ({ cached: false, value: planet }),
  search: async () => ({ cached: true, value: [planet] }),
};

const star: StarProfile = {
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
};

const starRepository: StarRepository = {
  discover: async () => ({ cached: true, value: [star] }),
  featured: async () => ({ cached: true, value: [star] }),
  findByName: async () => ({ cached: false, value: star }),
  search: async () => ({ cached: false, value: [star] }),
};

test("returns service health", async () => {
  const response = await createApp({ repository }).request("/api/health");

  expect(response.status).toBe(200);
  expect(await response.json()).toEqual({ service: "exora-api", status: "ok" });
});

test("returns normalized planet search results", async () => {
  const response = await createApp({ repository }).request("/api/planets?q=hip&limit=5");
  const payload = await response.json();

  expect(response.status).toBe(200);
  expect(payload).toMatchObject({
    data: [{ id: "hip-65426-b" }],
    meta: { cached: true, count: 1, query: "hip" },
  });
});

test("returns category-driven planet and star discovery results", async () => {
  const app = createApp({ repository, starRepository });
  const planetResponse = await app.request("/api/planets?category=earth-like");
  const starResponse = await app.request("/api/stars?category=nearby-stars");
  const planetCollectionResponse = await app.request("/api/planets?category=most-earth-like");
  const starCollectionResponse = await app.request("/api/stars?category=solar-analogs");

  expect(planetResponse.status).toBe(200);
  expect(await planetResponse.json()).toMatchObject({
    data: [{ id: "hip-65426-b" }],
    meta: { query: "earth-like" },
  });
  expect(starResponse.status).toBe(200);
  expect(await starResponse.json()).toMatchObject({
    data: [{ id: "alf-cma" }],
    meta: { query: "nearby-stars" },
  });
  expect(planetCollectionResponse.status).toBe(200);
  expect(await planetCollectionResponse.json()).toMatchObject({
    meta: { query: "most-earth-like" },
  });
  expect(starCollectionResponse.status).toBe(200);
  expect(await starCollectionResponse.json()).toMatchObject({
    meta: { query: "solar-analogs" },
  });
});

test("accepts one-character autocomplete and rejects empty search queries", async () => {
  const autocompleteResponse = await createApp({ repository }).request("/api/planets?q=h");
  const response = await createApp({ repository }).request("/api/planets");

  expect(autocompleteResponse.status).toBe(200);
  expect(response.status).toBe(400);
  expect(await response.json()).toMatchObject({ error: { code: "INVALID_REQUEST" } });
});

test("returns featured and exact SIMBAD star results", async () => {
  const app = createApp({ repository, starRepository });
  const featuredResponse = await app.request("/api/stars/featured");
  const searchResponse = await app.request("/api/stars?q=sirius");
  const detailResponse = await app.request("/api/stars/Sirius");

  expect(featuredResponse.status).toBe(200);
  expect(await featuredResponse.json()).toMatchObject({
    data: [{ name: "Sirius" }],
    meta: { source: "SIMBAD" },
  });
  expect(await searchResponse.json()).toMatchObject({ meta: { count: 1, query: "sirius" } });
  expect(await detailResponse.json()).toMatchObject({ data: { id: "alf-cma" } });
});
