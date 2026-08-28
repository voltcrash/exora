import { expect, test } from "vite-plus/test";
import {
  discoverRandomPlanet,
  discoverRandomStar,
  loadFeaturedPlanet,
  loadPlanetFilterPool,
  loadPlanetByName,
  loadPlanetsByHost,
  loadPlanetsForStar,
  loadSolarEphemeris,
  loadStarByName,
  searchPlanets,
  searchStars,
} from "./api-client.ts";
import { featuredPlanet } from "./planet-profile.ts";

test("uses normalized live API data", async () => {
  const result = await loadFeaturedPlanet(featuredPlanet, async () =>
    Response.json({
      data: { ...featuredPlanet, name: `${featuredPlanet.name} · live` },
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

test("rejects an id-and-name-only planet payload instead of treating it as live data", async () => {
  const result = await loadFeaturedPlanet(featuredPlanet, async () =>
    Response.json({
      data: { id: "plausible-id", name: "Plausible Name" },
      meta: { cached: false, source: "NASA Exoplanet Archive" },
    }),
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

  expect(result).toMatchObject({ planets: [{ id: featuredPlanet.id }], query: "wasp" });
});

test("rejects malformed scientific fields in planet collections", async () => {
  await expect(
    searchPlanets("wasp", {
      fetcher: async () =>
        Response.json({
          data: [
            {
              ...featuredPlanet,
              observation: { ...featuredPlanet.observation, orbitalEccentricity: "unknown" },
            },
          ],
          meta: {
            cached: false,
            count: 1,
            query: "wasp",
            source: "NASA Exoplanet Archive",
          },
        }),
    }),
  ).rejects.toThrow("invalid response");
});

test("loads the confirmed planets connected to a star", async () => {
  const result = await loadPlanetsByHost(featuredPlanet.hostStar, {
    fetcher: async (input) => {
      expect(input).toContain(`host=${encodeURIComponent(featuredPlanet.hostStar)}`);
      return Response.json({
        data: [featuredPlanet],
        meta: {
          cached: true,
          count: 1,
          query: featuredPlanet.hostStar,
          source: "NASA Exoplanet Archive",
        },
      });
    },
  });

  expect(result).toMatchObject({ cached: true, planets: [{ id: featuredPlanet.id }] });
});

test("loads a SIMBAD star's planets through NASA's aliases service", async () => {
  const result = await loadPlanetsForStar("Proxima Centauri", {
    fetcher: async (input) => {
      expect(input).toBe("/api/stars/Proxima%20Centauri/planets?limit=12");
      return Response.json({
        data: [featuredPlanet],
        meta: {
          cached: false,
          count: 1,
          query: "Proxima Cen",
          source: "NASA Exoplanet Archive",
        },
      });
    },
  });

  expect(result).toMatchObject({
    planets: [{ id: featuredPlanet.id }],
    query: "Proxima Cen",
  });
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

  expect(result).toMatchObject({ planets: [{ id: featuredPlanet.id }] });
});

test("loads validated Solar System vectors only through Exora's API", async () => {
  const epoch = new Date("2026-08-24T12:00:00.000Z");
  const result = await loadSolarEphemeris(epoch, [399], {
    fetcher: async (input) => {
      const path =
        typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
      expect(path).toContain("/api/ephemerides?");
      expect(path).toContain("ids=399");
      expect(path).not.toContain("ssd.jpl.nasa.gov");
      return Response.json({
        data: [
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
        meta: {
          cached: true,
          center: "Sun (10)",
          coordinateFrame: "Ecliptic J2000",
          epoch: epoch.toISOString(),
          retrievedAt: "2026-08-24T12:00:01.000Z",
          source: "NASA/JPL Horizons API",
          sourceVersion: "1.2",
          stale: false,
        },
      });
    },
  });

  expect(result).toMatchObject({ data: [{ naifId: 399 }], meta: { cached: true, stale: false } });
});

test("rejects a malformed Horizons contract instead of drawing unvalidated positions", async () => {
  await expect(
    loadSolarEphemeris(new Date("2026-08-24T12:00:00.000Z"), [399], {
      fetcher: async () =>
        Response.json({
          data: [],
          meta: { source: "NASA/JPL Horizons API", sourceVersion: "changed" },
        }),
    }),
  ).rejects.toThrow("invalid response");
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

  expect(result).toMatchObject({ cached: true, planet: { id: featuredPlanet.id } });
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

test("rejects an id-and-name-only star payload", async () => {
  const result = await loadStarByName("Sirius", async () =>
    Response.json({
      data: { id: "alf-cma", name: "Sirius" },
      meta: { cached: false, source: "SIMBAD" },
    }),
  );

  expect(result).toBeNull();
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

test("a catalog request keeps its deadline when the caller supplies a cancellation", async () => {
  // Every catalog call site passes its own controller so it can drop a result it no longer wants.
  // Preferring that signal used to hand it to `fetch` unchanged, discarding the timeout with it,
  // so a stalled archive left the request outstanding instead of failing and saying so. The
  // deadline itself is timed in request-deadline.test.ts; what matters here is that the request
  // is issued under something other than the caller's bare signal.
  const controller = new AbortController();
  let issued: AbortSignal | undefined;

  await searchPlanets("wasp", {
    signal: controller.signal,
    fetcher: async (_input, init) => {
      issued = init?.signal ?? undefined;
      return Response.json({
        data: [featuredPlanet],
        meta: { cached: false, count: 1, query: "wasp", source: "NASA Exoplanet Archive" },
      });
    },
  });

  expect(issued).toBeDefined();
  expect(issued).not.toBe(controller.signal);
  expect(issued?.aborted).toBe(false);
});

test("a catalog request the caller cancels reports the cancellation, not the deadline", async () => {
  const controller = new AbortController();

  const settled = searchStars("sirius", {
    signal: controller.signal,
    fetcher: async (_input, init) =>
      new Promise<Response>((_resolve, reject) => {
        init?.signal?.addEventListener("abort", () => reject(init.signal?.reason), { once: true });
      }),
  }).then(
    () => "resolved",
    (error: unknown) => (error as DOMException).name,
  );

  controller.abort();
  expect(await settled).toBe("AbortError");
});
