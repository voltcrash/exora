import type { ExoplanetProfile } from "@exora/contracts";
import { encodePlanetCatalog } from "@exora/planet-catalog";
import { expect, test, vi } from "vite-plus/test";
import { featuredPlanet } from "./planet-profile.ts";

const named = (name: string): ExoplanetProfile => ({
  ...featuredPlanet,
  id: name.toLowerCase().replaceAll(/[^a-z0-9]+/g, "-"),
  name,
});

const worlds = Array.from({ length: 70 }, (_, index) =>
  named(`World ${String(index).padStart(2, "0")} b`),
);
const snapshot = encodePlanetCatalog([named("Kepler-18 b"), named("Kepler-187 b"), ...worlds], {
  endpoint: "https://exoplanetarchive.ipac.caltech.edu/TAP/sync",
  generatedAt: "2026-10-27T05:00:00.000Z",
  query: "select pl_name from pscomppars order by pl_name",
});

const freshClient = async () => {
  vi.resetModules();
  return import("./api-client.ts");
};

const apiPayload = (planets: ExoplanetProfile[], query: string) =>
  Response.json({
    data: planets,
    meta: { cached: false, count: planets.length, query, source: "NASA Exoplanet Archive" },
  });

test("planet reads use the API until the snapshot has loaded", async () => {
  const client = await freshClient();
  const api = vi.fn(async () => apiPayload([named("Kepler-18 b")], "kepler"));
  expect((await client.searchPlanets("kepler", { fetcher: api })).cached).toBe(false);
  expect(api).toHaveBeenCalledOnce();
});

test("a loaded snapshot answers search, browse pages and exact names without the API", async () => {
  const client = await freshClient();
  const assets = vi.fn(async (_input: string | URL | Request, _init?: RequestInit) =>
    Response.json(snapshot),
  );
  expect(await client.preloadPlanetCatalog(assets)).not.toBeNull();
  expect(await client.preloadPlanetCatalog(assets)).not.toBeNull();
  expect(assets).toHaveBeenCalledOnce();
  expect(assets.mock.calls[0]?.[1]).toEqual({ priority: "low" });

  const api = vi.fn(async () => new Response(null, { status: 503 }));
  const search = await client.searchPlanets(" kepler 18 ", { fetcher: api });
  expect(search).toMatchObject({ cached: true, nextCursor: null, query: "kepler 18" });
  expect(search.planets.map(({ name }) => name)).toEqual(["Kepler-18 b", "Kepler-187 b"]);

  const first = await client.loadPlanetFilterPool({ fetcher: api });
  expect(first.planets).toHaveLength(60);
  expect(first.nextCursor).toBe(first.planets.at(-1)?.name);
  const second = await client.loadPlanetFilterPool({ cursor: first.nextCursor, fetcher: api });
  expect(second.planets.map(({ name }) => name)).toEqual(worlds.slice(58).map(({ name }) => name));
  expect(second.nextCursor).toBeNull();

  expect((await client.loadPlanetByName("kepler-18 B", api))?.planet.name).toBe("Kepler-18 b");
  expect(api).not.toHaveBeenCalled();
});

test("names and searches the snapshot lacks still reach the API", async () => {
  const client = await freshClient();
  await client.preloadPlanetCatalog(async () => Response.json(snapshot));
  const newer = named("TOI-9999 b");
  const lookup = vi.fn(async () =>
    Response.json({ data: newer, meta: { cached: false, source: "NASA Exoplanet Archive" } }),
  );
  expect((await client.loadPlanetByName("TOI-9999 b", lookup))?.planet.name).toBe("TOI-9999 b");
  expect(lookup).toHaveBeenCalledOnce();

  const search = vi.fn(async () => apiPayload([newer], "toi 9999"));
  expect((await client.searchPlanets("toi 9999", { fetcher: search })).planets).toEqual([newer]);
  expect(search).toHaveBeenCalledOnce();
});

test("a failed snapshot leaves the API in charge and is retried after a pause", async () => {
  vi.useFakeTimers();
  vi.spyOn(console, "warn").mockImplementation(() => undefined);
  try {
    const client = await freshClient();
    const assets = vi
      .fn<(input: string | URL | Request) => Promise<Response>>()
      .mockResolvedValueOnce(new Response(null, { status: 404 }))
      .mockResolvedValue(Response.json(snapshot));
    expect(await client.preloadPlanetCatalog(assets)).toBeNull();
    expect(await client.preloadPlanetCatalog(assets)).toBeNull();
    expect(assets).toHaveBeenCalledOnce();
    const api = vi.fn(async () => apiPayload([], "physical-controls"));
    await client.loadPlanetFilterPool({ fetcher: api });
    expect(api).toHaveBeenCalledOnce();

    vi.advanceTimersByTime(60_000);
    expect(await client.preloadPlanetCatalog(assets)).not.toBeNull();
    expect(assets).toHaveBeenCalledTimes(2);
  } finally {
    vi.useRealTimers();
    vi.restoreAllMocks();
  }
});
