import type { ExoplanetProfile, SmallBodyProfile, StarProfile } from "@exora/contracts";
import { expect, test, vi } from "vite-plus/test";
import { createApp } from "../src/app.ts";
import { NasaArchiveError, type PlanetRepository } from "../src/nasa-archive.ts";
import { createRateLimiter } from "../src/rate-limit.ts";
import { SbdbError, type SbdbRepository } from "../src/sbdb.ts";
import type { HorizonsRepository } from "../src/horizons.ts";
import type { MissionTrajectoryRepository } from "../src/mission-trajectories.ts";
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
  browse: async () => ({ cached: true, value: [planet] }),
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
  discover: async () => ({ cached: true, value: [star] }),
  featured: async () => ({ cached: true, value: [star] }),
  findByName: async () => ({ cached: false, value: star }),
  search: async () => ({ cached: false, value: [star] }),
};

const systemAliasRepository: SystemAliasRepository = {
  resolveHost: async () => ({ cached: true, value: "HIP 65426" }),
};

test("returns service health", async () => {
  const response = await createApp({ repository }).request("/api/health");

  expect(response.status).toBe(200);
  expect(await response.json()).toEqual({ service: "exora-api", status: "ok" });
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

test("rejects unauthorized scheduled catalog refresh calls without dispatching work", async () => {
  const dispatch = vi.fn(async () => undefined);
  const app = createApp({
    catalogRefresh: { dispatcher: { dispatch }, secret: "scheduled-secret" },
    repository,
  });

  const missing = await app.request("/api/internal/catalog-refresh");
  const wrong = await app.request("/api/internal/catalog-refresh", {
    headers: { authorization: "Bearer wrong-secret" },
  });

  expect([missing.status, wrong.status]).toEqual([401, 401]);
  expect(missing.headers.get("Cache-Control")).toBe("no-store");
  expect(dispatch).not.toHaveBeenCalled();
});

test("authorized catalog refresh calls only dispatch the external worker", async () => {
  const dispatch = vi.fn(async () => undefined);
  const app = createApp({
    catalogRefresh: { dispatcher: { dispatch }, secret: "scheduled-secret" },
    repository,
  });

  const response = await app.request("/api/internal/catalog-refresh", {
    headers: { authorization: "Bearer scheduled-secret" },
  });

  expect(response.status).toBe(202);
  expect(response.headers.get("Cache-Control")).toBe("no-store");
  expect(await response.json()).toEqual({ accepted: true });
  expect(dispatch).toHaveBeenCalledOnce();
});

test("publishes an OpenAPI 3.1 document backed by the runtime response schemas", async () => {
  const response = await createApp({ repository }).request("/api/openapi.json");
  const document = await response.json();

  expect(response.status).toBe(200);
  expect(document).toMatchObject({
    components: {
      schemas: {
        ApiError: { type: "object" },
        Planet: { type: "object" },
        Star: { type: "object" },
      },
    },
    openapi: "3.1.0",
    paths: {
      "/api/ephemerides": { get: { responses: { 200: expect.any(Object) } } },
      "/api/planets": { get: { responses: { 200: expect.any(Object) } } },
      "/api/small-bodies": { get: { responses: { 200: expect.any(Object) } } },
    },
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

const missionTrajectoryRepository: MissionTrajectoryRepository = {
  trajectory: async (spkId, _start, _stop, _stepDays) => ({
    cached: true,
    retrievedAt: "2026-08-24T12:00:00.000Z",
    solution: "Voyager_1_ST+refit2022_m",
    stale: false,
    target: { command: spkId, name: "Voyager 1", spkId },
    value: [
      {
        calendarTdb: "A.D. 1977-Sep-06 00:00:00.0000 TDB",
        julianDateTdb: 2_443_392.5,
        positionAu: { x: 1, y: 0, z: 0 },
        velocityAuPerDay: { x: 0, y: 0.02, z: 0 },
      },
      {
        calendarTdb: "A.D. 1978-Sep-06 00:00:00.0000 TDB",
        julianDateTdb: 2_443_757.5,
        positionAu: { x: 3, y: 2, z: 0.1 },
        velocityAuPerDay: { x: 0.01, y: 0.01, z: 0 },
      },
    ],
  }),
};

const smallBody: SmallBodyProfile = {
  closeApproaches: [
    {
      body: "Earth",
      calendarDate: "2029-Apr-13 21:46",
      distanceAu: 0.000254,
      distanceMaximumAu: 0.000256,
      distanceMinimumAu: 0.000252,
      julianDate: 2462239.407,
      relativeVelocityKilometersPerSecond: 7.42,
      timeUncertaintySeconds: 3.1,
    },
  ],
  designation: "99942",
  fullName: "99942 Apophis (2004 MN4)",
  kind: "asteroid",
  nearEarth: true,
  orbit: {
    conditionCode: "0",
    dataArcDays: 7600,
    elements: [
      {
        name: "a",
        reference: null,
        title: "semi-major axis",
        uncertainty: "1e-10",
        units: "au",
        value: "0.9224",
      },
    ],
    epochJulianDate: 2461000.5,
    firstObservation: "2004-03-15",
    lastObservation: "2026-08-01",
    solutionDate: "2026-08-02 12:00:00",
    solutionId: "220",
  },
  orbitClass: { code: "ATE", name: "Aten" },
  physicalParameters: [],
  potentiallyHazardous: true,
  spkId: "2099942",
};

const sbdbRepository: SbdbRepository = {
  search: async () => ({
    cached: true,
    data: smallBody,
    matches: [],
    retrievedAt: "2026-08-24T12:00:00.000Z",
    stale: false,
    status: "match",
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

test("returns a bounded mission trajectory through the backend", async () => {
  const response = await createApp({ missionTrajectoryRepository, repository }).request(
    "/api/mission-trajectories?spk=-31&start=1977-09-06&stop=1978-09-06&step=365",
  );

  expect(response.status).toBe(200);
  expect(response.headers.get("CDN-Cache-Control")).toContain("stale-while-revalidate");
  expect(await response.json()).toMatchObject({
    data: [{ calendarTdb: expect.stringContaining("TDB") }, { julianDateTdb: 2_443_757.5 }],
    meta: {
      cached: true,
      center: "Sun (10)",
      coordinateFrame: "Ecliptic J2000",
      solution: "Voyager_1_ST+refit2022_m",
      source: "NASA/JPL Horizons API",
      sourceVersion: "1.2",
      spkId: "-31",
      stale: false,
      stepDays: 365,
      targetName: "Voyager 1",
    },
  });
});

test("rejects unsupported or unbounded mission trajectories before repository access", async () => {
  const trajectory = vi.spyOn(missionTrajectoryRepository, "trajectory");
  const app = createApp({ missionTrajectoryRepository, repository });
  const unsupported = await app.request(
    "/api/mission-trajectories?spk=-999&start=2000-01-01&stop=2001-01-01&step=30",
  );
  const tooMany = await app.request(
    "/api/mission-trajectories?spk=-31&start=1977-09-06&stop=2026-01-01&step=1",
  );

  expect(unsupported.status).toBe(400);
  expect(tooMany.status).toBe(400);
  expect(trajectory).not.toHaveBeenCalled();
  trajectory.mockRestore();
});

test("returns normalized JPL small-body data through the backend", async () => {
  const response = await createApp({ repository, sbdbRepository }).request(
    "/api/small-bodies?q=Apophis",
  );

  expect(response.status).toBe(200);
  expect(response.headers.get("CDN-Cache-Control")).toContain("stale-while-revalidate");
  expect(await response.json()).toMatchObject({
    data: {
      designation: "99942",
      kind: "asteroid",
      potentiallyHazardous: true,
      spkId: "2099942",
    },
    matches: [],
    meta: {
      cached: true,
      lookup: "auto",
      query: "Apophis",
      source: "NASA/JPL Small-Body Database (SBDB) API",
      sourceVersion: "1.3",
      status: "match",
    },
  });
});

test("passes designation choices through for ambiguous SBDB searches", async () => {
  const ambiguous: SbdbRepository = {
    search: async () => ({
      cached: false,
      data: null,
      matches: [
        { designation: "141P", name: "141P/Machholz 2" },
        { designation: "141P-A", name: "141P/Machholz 2-A" },
      ],
      retrievedAt: "2026-08-24T12:00:00.000Z",
      stale: false,
      status: "ambiguous",
    }),
  };
  const response = await createApp({ repository, sbdbRepository: ambiguous }).request(
    "/api/small-bodies?q=141P",
  );

  expect(response.status).toBe(200);
  expect(await response.json()).toMatchObject({
    data: null,
    matches: [{ designation: "141P" }, { designation: "141P-A" }],
    meta: { status: "ambiguous" },
  });
});

test("validates and separately rate-limits small-body searches", async () => {
  const search = vi.spyOn(sbdbRepository, "search");
  const validationApp = createApp({ repository, sbdbRepository });
  const empty = await validationApp.request("/api/small-bodies?q=");
  const invalidMode = await validationApp.request("/api/small-bodies?q=Eros&lookup=wrong");
  const wildcard = await validationApp.request("/api/small-bodies?q=Eros*");
  const invalidSpk = await validationApp.request("/api/small-bodies?q=Eros&lookup=spk");
  const app = createApp({
    repository,
    sbdbRateLimiter: createRateLimiter({ limit: 1, windowMs: 60_000 }),
    sbdbRepository,
  });
  const first = await app.request("/api/small-bodies?q=Eros");
  const refused = await app.request("/api/small-bodies?q=Bennu");

  expect(empty.status).toBe(400);
  expect(invalidMode.status).toBe(400);
  expect(wildcard.status).toBe(400);
  expect(invalidSpk.status).toBe(400);
  expect(first.status).toBe(200);
  expect(refused.status).toBe(429);
  expect(refused.headers.get("Retry-After")).toBeTruthy();
  expect(search).toHaveBeenCalledOnce();
  search.mockRestore();
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

  const response = await createApp({ repository: failing }).request("/api/planets?q=hip");

  expect(response.status).toBe(502);
  expect(await response.json()).toMatchObject({
    error: { code: "UPSTREAM_UNAVAILABLE", message: expect.stringContaining("NASA") },
  });
});

test("an unreachable SIMBAD archive is reported as an upstream failure", async () => {
  const failing: StarRepository = {
    ...starRepository,
    featured: async () => {
      throw new SimbadArchiveError("SIMBAD TAP request failed.");
    },
  };

  const response = await createApp({ repository, starRepository: failing }).request(
    "/api/stars/featured",
  );

  expect(response.status).toBe(502);
  expect(await response.json()).toMatchObject({
    error: { code: "UPSTREAM_UNAVAILABLE", message: expect.stringContaining("SIMBAD") },
  });
});

test("an unreachable SBDB service is reported without leaking an upstream response", async () => {
  const failing: SbdbRepository = {
    search: async () => {
      throw new SbdbError("upstream response contained an internal trace");
    },
  };

  const response = await createApp({ repository, sbdbRepository: failing }).request(
    "/api/small-bodies?q=Eros",
  );
  const payload = await response.json();

  expect(response.status).toBe(502);
  expect(payload).toMatchObject({
    error: { code: "UPSTREAM_UNAVAILABLE", message: expect.stringContaining("JPL SBDB") },
  });
  expect(JSON.stringify(payload)).not.toContain("internal trace");
});

test("an unexpected failure does not leak its message to the caller", async () => {
  const failing: PlanetRepository = {
    ...repository,
    search: async () => {
      throw new Error("connection string postgres://user:hunter2@host/db refused");
    },
  };

  const response = await createApp({ repository: failing }).request("/api/planets?q=hip");
  const payload = await response.json();

  expect(response.status).toBe(500);
  expect(JSON.stringify(payload)).not.toContain("hunter2");
  expect(payload).toMatchObject({ error: { code: "UPSTREAM_UNAVAILABLE" } });
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
