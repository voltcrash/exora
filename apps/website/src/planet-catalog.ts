import type { ExoplanetProfile } from "@exora/contracts";
import type { CatalogPage } from "@exora/planet-catalog";
import type { PlanetCatalog } from "./planet-catalog-data.ts";
import type { CatalogRequest, CatalogResponse } from "./planet-catalog-protocol.ts";

export type { PlanetCatalog } from "./planet-catalog-data.ts";

type Fetcher = (input: string | URL | Request, init?: RequestInit) => Promise<Response>;

export const loadPlanetCatalog = async (fetcher?: Fetcher): Promise<PlanetCatalog> => {
  if (fetcher || typeof Worker === "undefined") {
    const { loadLocalPlanetCatalog } = await import("./planet-catalog-data.ts");
    return loadLocalPlanetCatalog(fetcher);
  }

  const worker = new Worker(new URL("./planet-catalog.worker.ts", import.meta.url), {
    type: "module",
  });
  let sequence = 0;
  let failure: Error | null = null;
  const pending = new Map<
    number,
    { resolve: (value: CatalogResponse["value"]) => void; reject: (error: Error) => void }
  >();
  const fail = (): void => {
    failure = new Error("The background planet catalog stopped.");
    worker.terminate();
    for (const request of pending.values()) request.reject(failure);
    pending.clear();
  };
  worker.onerror = (event) => {
    event.preventDefault();
    fail();
  };
  worker.onmessageerror = fail;
  worker.onmessage = ({ data }: MessageEvent<CatalogResponse>) => {
    if (data.error) return fail();
    pending.get(data.id)?.resolve(data.value);
    pending.delete(data.id);
  };

  const request = <T extends CatalogResponse["value"]>(
    query: CatalogRequest["query"],
  ): Promise<T> => {
    if (failure) return Promise.reject(failure);
    const id = ++sequence;
    return new Promise<CatalogResponse["value"]>((resolve, reject) => {
      const timer = setTimeout(fail, 30_000);
      pending.set(id, {
        resolve: (value) => {
          clearTimeout(timer);
          resolve(value);
        },
        reject: (error) => {
          clearTimeout(timer);
          reject(error);
        },
      });
      try {
        worker.postMessage({ id, query } satisfies CatalogRequest);
      } catch {
        fail();
      }
    }) as Promise<T>;
  };

  await request({ type: "ready" });
  return {
    browse: (limit, cursor) =>
      request<CatalogPage>({ type: "browse", limit, cursor: cursor ?? null }),
    find: (name) => request<ExoplanetProfile | null>({ type: "find", name }),
    search: (query, limit) => request<ExoplanetProfile[]>({ type: "search", query, limit }),
  };
};
