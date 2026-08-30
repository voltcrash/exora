import { FEATURED_BLACK_HOLES, type ExoplanetProfile, type StarProfile } from "@exora/contracts";
import { expect, test, vi } from "vite-plus/test";
import { createApp } from "../src/app.ts";
import type { BlackHoleRepository } from "../src/black-hole-archive.ts";
import { NasaArchiveError, type PlanetRepository } from "../src/nasa-archive.ts";
import { createRateLimiter } from "../src/rate-limit.ts";
import type { HorizonsRepository } from "../src/horizons.ts";
import { SimbadArchiveError, type StarRepository } from "../src/simbad-archive.ts";
import type { SystemAliasRepository } from "../src/nasa-system-aliases.ts";

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
    orbitalEccentricity: null,
    orbitalInclinationDegrees: null,
    orbitalPeriodDays: null,
    semiMajorAxisAu: 92,
    distanceParsecs: 108.875,
    rightAscensionDegrees: 201.1501727,
    declinationDegrees: -51.5045384,
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
  browse: async () => ({ cached: true, nextCursor: null, value: [planet] }),
  discover: async () => ({ cached: true, value: [planet] }),
  findByName: async () => ({ cached: false, value: planet }),
  findByHost: async () => ({ cached: true, value: [planet] }),
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
  browse: async () => ({ cached: true, nextCursor: null, value: [star] }),
  discover: async () => ({ cached: true, value: [star] }),
  featured: async () => ({ cached: true, value: [star] }),
  findByName: async () => ({ cached: false, value: star }),
  search: async () => ({ cached: false, value: [star] }),
};

const systemAliasRepository: SystemAliasRepository = {
  resolveHost: async () => ({ cached: true, value: "HIP 65426" }),
};

const blackHoleRepository: BlackHoleRepository = {
  browse: async () => ({ cached: true, stale: false, value: [FEATURED_BLACK_HOLES[3]!] }),
  findByName: async (name) => ({
    cached: false,
    stale: false,
    value: name.toLowerCase() === "cygnus x-1" ? FEATURED_BLACK_HOLES[3]! : null,
  }),
};

test("returns service health", async () => {
  const response = await createApp({ repository }).request("/api/health");

  expect(response.status).toBe(200);
  expect(await response.json()).toEqual({ service: "exora-api", status: "ok" });
});

test("returns featured, observed, and exact black-hole responses", async () => {
  const app = createApp({ blackHoleRepository, repository });
  const featured = await app.request("/api/black-holes/featured");
  const observed = await app.request("/api/black-holes?source=observed&limit=50");
  const detail = await app.request("/api/black-holes/Cygnus%20X-1");

  expect(featured.status).toBe(200);
  const featuredPayload = await featured.json();
  expect(featuredPayload).toMatchObject({
    meta: { count: 5, query: "featured", source: "Exora curated featured" },
  });
  expect(featuredPayload.data.slice(0, 2)).toMatchObject([
    { name: "Sagittarius A*" },
    { name: "M87*" },
  ]);
  expect(observed.status).toBe(200);
  expect(await observed.json()).toMatchObject({
    data: [{ provenance: "observed", status: "confirmed" }],
    meta: { count: 1, query: "observed", source: "BlackCAT / CDS VizieR" },
  });
  expect(detail.status).toBe(200);
  expect(await detail.json()).toMatchObject({ data: { name: "Cygnus X-1" } });
});

test("validates black-hole source and names before repository access", async () => {
  const app = createApp({ blackHoleRepository, repository });
  const missingSource = await app.request("/api/black-holes");
  const syntheticSource = await app.request("/api/black-holes?source=procedural");
  const tooLong = await app.request(`/api/black-holes/${"x".repeat(101)}`);

  expect(missingSource.status).toBe(400);
  expect(syntheticSource.status).toBe(400);
  expect(tooLong.status).toBe(400);
  expect(await missingSource.json()).toMatchObject({ error: { code: "INVALID_REQUEST" } });
});

test("returns a structured 404 for an unknown observed black hole", async () => {
  const response = await createApp({ blackHoleRepository, repository }).request(
    "/api/black-holes/Unknown",
  );

  expect(response.status).toBe(404);
  expect(await response.json()).toMatchObject({ error: { code: "NOT_FOUND" } });
});

test("public read-only API CORS is wildcard and never credentialed", async () => {
  const app = createApp({ repository });
  const response = await app.request("/api/health", {
    headers: { origin: "https://catalog.example" },
  });
  const preflight = await app.request("/api/health", {
    headers: {
      "access-control-request-method": "GET",
      origin: "https://catalog.example",
    },
    method: "OPTIONS",
  });

  expect(response.headers.get("Access-Control-Allow-Origin")).toBe("*");
  expect(response.headers.get("Access-Control-Allow-Credentials")).toBeNull();
  expect(preflight.status).toBe(204);
  expect(preflight.headers.get("Access-Control-Allow-Methods")).toBe("GET,OPTIONS");
  expect(preflight.headers.get("Access-Control-Allow-Credentials")).toBeNull();
});

test("does not expose an OpenAPI document", async () => {
  const response = await createApp({ repository }).request("/api/openapi.json");

  expect(response.status).toBe(404);
  expect(await response.json()).toEqual({
    error: { code: "NOT_FOUND", message: "The requested API route does not exist." },
  });
});

const ephemerisRepository: HorizonsRepository = {
  positions: async (_naifIds, epoch) => ({
    cached: true,
    retrievedAt: "2026-08-24T12:00:00.000Z",
    stale: false,
    value: [
      {
        epoch: epoch.toISOString(),
        name: "Earth",
        naifId: 399,
        positionAu: { x: 1, y: 0, z: 0 },
        solution: "DE441",
        spkId: "399",
        velocityAuPerDay: { x: 0, y: 0.0172, z: 0 },
      },
    ],
  }),
};

test("returns cached heliocentric Horizons vectors through the backend", async () => {
  const response = await createApp({ horizonsRepository: ephemerisRepository, repository }).request(
    "/api/ephemerides?at=2026-08-24T12%3A00%3A00.000Z&ids=399",
  );

  expect(response.status).toBe(200);
  expect(response.headers.get("CDN-Cache-Control")).toContain("stale-while-revalidate");
  expect(await response.json()).toMatchObject({
    data: [{ naifId: 399, spkId: "399" }],
    meta: {
      cached: true,
      center: "Sun (10)",
      coordinateFrame: "Ecliptic J2000",
      source: "NASA/JPL Horizons API",
      sourceVersion: "1.2",
      stale: false,
    },
  });
});

test("rejects invalid ephemeris dates and targets without reaching Horizons", async () => {
  const positions = vi.spyOn(ephemerisRepository, "positions");
  const app = createApp({ horizonsRepository: ephemerisRepository, repository });
  const badDate = await app.request("/api/ephemerides?at=not-a-date&ids=399");
  const badTarget = await app.request(
    "/api/ephemerides?at=2026-08-24T12%3A00%3A00.000Z&ids=399,123456",
  );

  expect(badDate.status).toBe(400);
  expect(badTarget.status).toBe(400);
  expect(positions).not.toHaveBeenCalled();
  positions.mockRestore();
});

test("applies a smaller request budget to the upstream-expensive ephemeris route", async () => {
  const app = createApp({
    horizonsRateLimiter: createRateLimiter({ limit: 1, windowMs: 60_000 }),
    horizonsRepository: ephemerisRepository,
    repository,
  });
  const path = "/api/ephemerides?at=2026-08-24T12%3A00%3A00.000Z&ids=399";
  const first = await app.request(path);
  const refused = await app.request(path);

  expect(first.status).toBe(200);
  expect(refused.status).toBe(429);
  expect(refused.headers.get("Retry-After")).toBeTruthy();
});

test("returns normalized planet search results", async () => {
  const response = await createApp({ repository }).request("/api/planets?q=hip&limit=5");
  const payload = await response.json();

  expect(response.status).toBe(200);
  expect(payload).toMatchObject({
    data: [{ id: "hip-65426-b" }],
    meta: { cached: true, count: 1, query: "hip" },
  });
  expect(response.headers.get("Cache-Control")).toBe("public, max-age=0, must-revalidate");
  expect(response.headers.get("CDN-Cache-Control")).toBe(
    "public, max-age=300, stale-while-revalidate=3600, stale-if-error=21600",
  );
});

test("refuses malformed repository data instead of exposing it as an API payload", async () => {
  const malformed: PlanetRepository = {
    ...repository,
    search: async () => ({
      cached: false,
      value: [
        {
          ...planet,
          observation: { ...planet.observation, orbitalEccentricity: "unknown" },
        } as unknown as ExoplanetProfile,
      ],
    }),
  };
  const logged = vi.spyOn(console, "error").mockImplementation(() => undefined);

  const response = await createApp({ repository: malformed }).request("/api/planets?q=hip");
  const payload = await response.json();

  expect(response.status).toBe(500);
  expect(payload).toEqual({
    error: { code: "UPSTREAM_UNAVAILABLE", message: "The API could not complete the request." },
  });
  expect(JSON.stringify(payload)).not.toContain("unknown");
  logged.mockRestore();
});

test("returns confirmed planets for a host star", async () => {
  const response = await createApp({ repository }).request(
    "/api/planets?host=HIP%2065426&limit=12",
  );

  expect(response.status).toBe(200);
  expect(await response.json()).toMatchObject({
    data: [{ hostStar: "HIP 65426", id: "hip-65426-b" }],
    meta: { cached: true, count: 1, query: "HIP 65426" },
  });
});

test("returns a broad planet field for physical controls", async () => {
  const response = await createApp({ repository }).request(
    "/api/planets?browse=physical-controls&limit=120",
  );

  expect(response.status).toBe(200);
  expect(await response.json()).toMatchObject({
    data: [{ id: "hip-65426-b" }],
    meta: { count: 1, query: "physical-controls" },
  });
  expect(response.headers.get("Cache-Control")).toBe("public, max-age=60");
  expect(response.headers.get("CDN-Cache-Control")).toContain("stale-if-error=86400");
});

test("browses the stellar catalog with cursor metadata", async () => {
  const response = await createApp({ starRepository }).request(
    "/api/stars?browse=catalog&limit=24&cursor=NAME%20Altair",
  );

  expect(response.status).toBe(200);
  expect(await response.json()).toMatchObject({
    data: [{ id: "alf-cma" }],
    meta: { count: 1, nextCursor: null, query: "catalog" },
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

test("joins a canonical SIMBAD star to NASA's authoritative host name and planets", async () => {
  const response = await createApp({ repository, starRepository, systemAliasRepository }).request(
    "/api/stars/Sirius/planets",
  );

  expect(response.status).toBe(200);
  expect(await response.json()).toMatchObject({
    data: [{ hostStar: "HIP 65426", name: "HIP 65426 b" }],
    meta: { count: 1, query: "HIP 65426", source: "NASA Exoplanet Archive" },
  });
});

test("every response carries the caller's remaining request budget", async () => {
  const response = await createApp({ repository }).request("/api/health");

  expect(response.headers.get("RateLimit-Limit")).toBe("120");
  expect(Number(response.headers.get("RateLimit-Remaining"))).toBe(119);
  expect(Number(response.headers.get("RateLimit-Reset"))).toBeGreaterThan(0);
});

test("a caller past its budget is refused with a wait", async () => {
  const app = createApp({
    repository,
    rateLimiter: createRateLimiter({ limit: 2, windowMs: 60_000 }),
    trustVercelProxy: true,
  });
  const headers = { "x-vercel-forwarded-for": "203.0.113.7" };

  const allowed = await Promise.all([
    app.request("/api/health", { headers }),
    app.request("/api/health", { headers }),
  ]);
  const refused = await app.request("/api/health", { headers });

  expect(allowed.map((response) => response.status)).toEqual([200, 200]);
  expect(refused.status).toBe(429);
  expect(await refused.json()).toMatchObject({ error: { code: "RATE_LIMITED" } });
  expect(refused.headers.get("Cache-Control")).toBe("no-store");
  expect(refused.headers.get("RateLimit-Remaining")).toBe("0");
  expect(Number(refused.headers.get("Retry-After"))).toBeGreaterThan(0);
});

test("one caller exhausting its budget does not refuse another", async () => {
  const app = createApp({
    repository,
    rateLimiter: createRateLimiter({ limit: 1, windowMs: 60_000 }),
    trustVercelProxy: true,
  });

  await app.request("/api/health", { headers: { "x-vercel-forwarded-for": "203.0.113.7" } });
  const sameCaller = await app.request("/api/health", {
    headers: { "x-vercel-forwarded-for": "203.0.113.7" },
  });
  const otherCaller = await app.request("/api/health", {
    headers: { "x-vercel-forwarded-for": "198.51.100.4" },
  });

  expect(sameCaller.status).toBe(429);
  expect(otherCaller.status).toBe(200);
});

test("caller-supplied forwarding headers cannot manufacture fresh local budgets", async () => {
  const app = createApp({
    repository,
    rateLimiter: createRateLimiter({ limit: 1, windowMs: 60_000 }),
  });

  const first = await app.request("/api/health", {
    headers: { "x-forwarded-for": "203.0.113.7" },
  });
  const spoofed = await app.request("/api/health", {
    headers: { "x-forwarded-for": "198.51.100.4" },
  });

  expect(first.status).toBe(200);
  expect(spoofed.status).toBe(429);
});

test("generic proxy headers cannot manufacture fresh deployed budgets", async () => {
  const app = createApp({
    repository,
    rateLimiter: createRateLimiter({ limit: 1, windowMs: 60_000 }),
    trustVercelProxy: true,
  });

  const first = await app.request("/api/health", {
    headers: { "x-forwarded-for": "203.0.113.7", "x-real-ip": "203.0.113.7" },
  });
  const spoofed = await app.request("/api/health", {
    headers: { "x-forwarded-for": "198.51.100.4", "x-real-ip": "198.51.100.4" },
  });

  expect(first.status).toBe(200);
  expect(spoofed.status).toBe(429);
});

test("an unreachable NASA archive is reported as an upstream failure, not a crash", async () => {
  const failing: PlanetRepository = {
    ...repository,
    search: async () => {
      throw new NasaArchiveError("NASA TAP request failed.");
    },
  };
  const logged = vi.spyOn(console, "error").mockImplementation(() => undefined);

  const response = await createApp({ repository: failing }).request("/api/planets?q=hip");

  expect(response.status).toBe(502);
  expect(await response.json()).toMatchObject({
    error: { code: "UPSTREAM_UNAVAILABLE", message: expect.stringContaining("NASA") },
  });
  logged.mockRestore();
});

test("an unreachable SIMBAD archive is reported as an upstream failure", async () => {
  const failing: StarRepository = {
    ...starRepository,
    featured: async () => {
      throw new SimbadArchiveError("SIMBAD TAP request failed.");
    },
  };
  const logged = vi.spyOn(console, "error").mockImplementation(() => undefined);

  const response = await createApp({ repository, starRepository: failing }).request(
    "/api/stars/featured",
  );

  expect(response.status).toBe(502);
  expect(await response.json()).toMatchObject({
    error: { code: "UPSTREAM_UNAVAILABLE", message: expect.stringContaining("SIMBAD") },
  });
  logged.mockRestore();
});

test("an unexpected failure does not leak its message to the caller", async () => {
  const failure = new Error("secret-bearing upstream detail");
  const failing: PlanetRepository = {
    ...repository,
    search: async () => {
      throw failure;
    },
  };
  const logged = vi.spyOn(console, "error").mockImplementation(() => undefined);

  const response = await createApp({ repository: failing }).request("/api/planets?q=hip");
  const payload = await response.json();

  expect(response.status).toBe(500);
  expect(JSON.stringify(payload)).not.toContain("secret-bearing upstream detail");
  expect(payload).toMatchObject({ error: { code: "UPSTREAM_UNAVAILABLE" } });
  expect(logged).toHaveBeenCalledWith("API request failed", {
    error: failure,
    method: "GET",
    path: "/api/planets",
  });
  logged.mockRestore();
});

test("an unknown planet is a 404 rather than an empty success", async () => {
  const empty: PlanetRepository = {
    ...repository,
    findByName: async () => ({ cached: false, value: null }),
  };

  const response = await createApp({ repository: empty }).request("/api/planets/Nowhere%20b");

  expect(response.status).toBe(404);
  expect(await response.json()).toMatchObject({
    error: { code: "NOT_FOUND", message: expect.stringContaining("Nowhere b") },
  });
});

test("an unknown star is a 404", async () => {
  const empty: StarRepository = {
    ...starRepository,
    findByName: async () => ({ cached: false, value: null }),
  };

  const response = await createApp({ repository, starRepository: empty }).request(
    "/api/stars/Nowhere",
  );

  expect(response.status).toBe(404);
  expect(await response.json()).toMatchObject({ error: { code: "NOT_FOUND" } });
});

test("a missing featured planet is a 404 rather than a broken landing page", async () => {
  const empty: PlanetRepository = {
    ...repository,
    findByName: async () => ({ cached: false, value: null }),
  };

  const response = await createApp({ repository: empty }).request("/api/planets/featured");

  expect(response.status).toBe(404);
  expect(await response.json()).toMatchObject({ error: { code: "NOT_FOUND" } });
});

test("names longer than the archives could carry are rejected before any lookup", async () => {
  const tooLong = "x".repeat(101);
  const app = createApp({ repository, starRepository });

  for (const path of [
    `/api/planets/${tooLong}`,
    `/api/stars/${tooLong}`,
    `/api/planets?host=${tooLong}`,
  ]) {
    const response = await app.request(path);
    expect(response.status, path).toBe(400);
    expect(await response.json()).toMatchObject({ error: { code: "INVALID_REQUEST" } });
  }
});

test("an unrecognised discovery category is refused rather than silently ignored", async () => {
  const app = createApp({ repository, starRepository });

  const planets = await app.request("/api/planets?category=not-a-category");
  const stars = await app.request("/api/stars?category=not-a-category");

  expect(planets.status).toBe(400);
  expect(stars.status).toBe(400);
  expect(await planets.json()).toMatchObject({ error: { code: "INVALID_REQUEST" } });
  expect(await stars.json()).toMatchObject({ error: { code: "INVALID_REQUEST" } });
});

test("an unknown API route is a structured 404", async () => {
  const response = await createApp({ repository }).request("/api/does-not-exist");

  expect(response.status).toBe(404);
  expect(await response.json()).toMatchObject({ error: { code: "NOT_FOUND" } });
});
