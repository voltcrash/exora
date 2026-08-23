import { expect, test, vi, beforeEach } from "vite-plus/test";
import { featuredPlanet } from "./planet-profile.ts";
import {
  reachStar,
  reachSystem,
  resetDestinationCacheForTesting,
  warmDestinations,
} from "./destination-cache.ts";

beforeEach(() => {
  resetDestinationCacheForTesting();
  vi.unstubAllGlobals();
});

const starPayload = {
  data: {
    catalogName: "* alf CMa",
    id: "alf-cma",
    kind: "binary",
    name: "Sirius",
    objectType: "Spectroscopic binary",
    observation: {
      declinationDegrees: -16.716,
      distanceParsecs: 2.637,
      gaiaMagnitude: null,
      parallaxMas: 379.21,
      properMotionDecMasPerYear: -1223.07,
      properMotionRaMasPerYear: -546.01,
      radialVelocityKmPerSecond: -5.5,
      rightAscensionDegrees: 101.287,
      spectralType: "A0mA1Va",
      visualMagnitude: -1.46,
    },
    source: {
      archive: "SIMBAD",
      retrievedOn: "2026-08-14",
      tables: ["basic", "ident", "allfluxes"],
    },
  },
  meta: { cached: false, source: "SIMBAD" },
} as const;

const systemPayload = {
  data: [featuredPlanet],
  meta: {
    cached: true,
    count: 1,
    query: featuredPlanet.hostStar,
    source: "NASA Exoplanet Archive",
  },
} as const;

/** Counts what actually left for the network, which is the whole point of the cache. */
const countingArchive = (): { calls: string[] } => {
  const calls: string[] = [];
  vi.stubGlobal("fetch", (input: string) => {
    calls.push(input);
    return Promise.resolve(
      Response.json(input.startsWith("/api/stars") ? starPayload : systemPayload),
    );
  });
  return { calls };
};

test("a destination asked for twice is only fetched once", async () => {
  const archive = countingArchive();

  expect((await reachStar("Sirius"))?.star.name).toBe("Sirius");
  expect((await reachStar("Sirius"))?.star.name).toBe("Sirius");
  expect(archive.calls).toHaveLength(1);
});

test("a warmed destination is answered from memory when the jump takes it", async () => {
  // The reason the cache exists: the click that follows a warmed view costs no request at all,
  // so the flight never has to stop in the air waiting for one.
  const archive = countingArchive();

  warmDestinations(featuredPlanet.hostStar);
  await Promise.resolve();

  expect((await reachStar(featuredPlanet.hostStar))?.star.name).toBe("Sirius");
  expect((await reachSystem(featuredPlanet.hostStar))?.planets).toHaveLength(1);
  expect(archive.calls).toHaveLength(2);
  expect(archive.calls.some((path) => path.startsWith("/api/stars/"))).toBe(true);
  expect(archive.calls.some((path) => path.includes("host="))).toBe(true);
});

test("two views asking at once share the one request", async () => {
  const archive = countingArchive();

  const [first, second] = await Promise.all([reachSystem("Kepler-297"), reachSystem("Kepler-297")]);

  expect(first).toBe(second);
  expect(archive.calls).toHaveLength(1);
});

test("a host the archive links no worlds to is not remembered as a system", async () => {
  // Nothing to cache and nothing to be sure of: an empty answer may be the archive being slow to
  // agree with itself, and a page that cached it would never offer that system again.
  vi.stubGlobal("fetch", () =>
    Promise.resolve(
      Response.json({ data: [], meta: { cached: false, count: 0, query: "", source: "NASA" } }),
    ),
  );
  expect(await reachSystem("Nowhere")).toBeNull();

  const archive = countingArchive();
  expect((await reachSystem("Nowhere"))?.planets).toHaveLength(1);
  expect(archive.calls).toHaveLength(1);
});

test("a lookup that failed is retried rather than remembered", async () => {
  vi.stubGlobal("fetch", () => Promise.reject(new Error("offline")));
  expect(await reachStar("Sirius")).toBeNull();
  expect(await reachSystem("Kepler-297")).toBeNull();

  const archive = countingArchive();
  expect((await reachStar("Sirius"))?.star.name).toBe("Sirius");
  expect((await reachSystem("Kepler-297"))?.planets).toHaveLength(1);
  expect(archive.calls).toHaveLength(2);
});
