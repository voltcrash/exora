import { afterEach, expect, test, vi } from "vite-plus/test";
import { loadPlanetCatalog } from "./planet-catalog.ts";
import type { CatalogRequest, CatalogResponse } from "./planet-catalog-protocol.ts";

class CatalogWorker {
  static instance: CatalogWorker;
  onmessage?: (event: MessageEvent<CatalogResponse>) => void;
  onerror?: (event: ErrorEvent) => void;
  onmessageerror?: () => void;
  messages: CatalogRequest[] = [];
  terminate = vi.fn();
  constructor() {
    CatalogWorker.instance = this;
  }
  postMessage(message: CatalogRequest) {
    this.messages.push(message);
    if (message.query.type === "ready") {
      queueMicrotask(() => this.respond(message.id, null));
    }
  }
  respond(id: number, value: CatalogResponse["value"]) {
    this.onmessage?.({ data: { id, value } } as MessageEvent<CatalogResponse>);
  }
}

afterEach(() => {
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

test("background catalog matches concurrent replies to their callers", async () => {
  vi.stubGlobal("Worker", CatalogWorker);
  const catalog = await loadPlanetCatalog();
  const worker = CatalogWorker.instance;
  const search = catalog.search("kepler", 12);
  const browse = catalog.browse(60);
  worker.respond(3, { planets: [], nextCursor: "Kepler-22 b" });
  worker.respond(2, []);
  expect(await browse).toEqual({ planets: [], nextCursor: "Kepler-22 b" });
  expect(await search).toEqual([]);
  expect(worker.messages[1]?.query).toEqual({ type: "search", query: "kepler", limit: 12 });
});

test("worker failures reject pending and future reads so the API can take over", async () => {
  vi.stubGlobal("Worker", CatalogWorker);
  const catalog = await loadPlanetCatalog();
  const reading = catalog.find("Kepler-22 b");
  const failed = expect(reading).rejects.toThrow("background planet catalog stopped");
  CatalogWorker.instance.onmessageerror?.();
  await failed;
  expect(CatalogWorker.instance.terminate).toHaveBeenCalledOnce();
  await expect(catalog.browse(60)).rejects.toThrow("background planet catalog stopped");
});

test("a stalled worker releases every pending read after its deadline", async () => {
  vi.stubGlobal("Worker", CatalogWorker);
  const catalog = await loadPlanetCatalog();
  vi.useFakeTimers();
  const reading = catalog.search("kepler", 12);
  const failed = expect(reading).rejects.toThrow("background planet catalog stopped");
  await vi.advanceTimersByTimeAsync(30_000);
  await failed;
  expect(CatalogWorker.instance.terminate).toHaveBeenCalledOnce();
  expect(vi.getTimerCount()).toBe(0);
});

test("planet reads fall back to the API after an initialized worker fails", async () => {
  vi.resetModules();
  vi.stubGlobal("Worker", CatalogWorker);
  const client = await import("./api-client.ts");
  const { featuredPlanet } = await import("./planet-profile.ts");
  await client.preloadPlanetCatalog();
  const api = vi.fn(async (input: string | URL | Request) => {
    const path = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
    return Response.json({
      data: path.includes("/api/planets/") ? featuredPlanet : [featuredPlanet],
      meta: {
        cached: false,
        source: "NASA Exoplanet Archive",
        ...(path.includes("/api/planets/") ? {} : { count: 1, query: "kepler" }),
      },
    });
  });
  const first = client.loadPlanetByName("Kepler-22 b", api);
  CatalogWorker.instance.onmessageerror?.();
  expect((await first)?.planet).toEqual(featuredPlanet);
  expect((await client.searchPlanets("kepler", { fetcher: api })).planets).toEqual([
    featuredPlanet,
  ]);
  expect((await client.loadPlanetFilterPool({ fetcher: api })).planets).toEqual([featuredPlanet]);
  expect(api).toHaveBeenCalledTimes(3);
});
