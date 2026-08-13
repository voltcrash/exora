import type { ExoplanetProfile } from "@exora/contracts";
import { expect, test } from "vite-plus/test";
import { createApp } from "../src/app.ts";
import type { PlanetRepository } from "../src/nasa-archive.ts";

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
  },
  source: {
    archive: "NASA Exoplanet Archive",
    table: "pscomppars",
    retrievedOn: "2026-08-13",
  },
};

const repository: PlanetRepository = {
  findByName: async () => ({ cached: false, value: planet }),
  search: async () => ({ cached: true, value: [planet] }),
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

test("rejects undersized search queries", async () => {
  const response = await createApp({ repository }).request("/api/planets?q=h");

  expect(response.status).toBe(400);
  expect(await response.json()).toMatchObject({ error: { code: "INVALID_REQUEST" } });
});
