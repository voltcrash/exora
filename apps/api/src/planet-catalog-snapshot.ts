import type { ExoplanetProfile } from "@exora/contracts";
import { createArchiveCache, createRequestCoalescer } from "./archive-cache.ts";
import type { RepositoryResult } from "./nasa-archive.ts";

export const createPlanetCatalogSnapshot = (
  load: () => Promise<ExoplanetProfile[]>,
  {
    cacheTtlMs,
    now,
    retryMs = 60_000,
  }: { cacheTtlMs: number; now: () => number; retryMs?: number },
): (() => Promise<RepositoryResult<ExoplanetProfile[]> | null>) => {
  const cache = createArchiveCache<ExoplanetProfile[]>(1);
  const requests = createRequestCoalescer<RepositoryResult<ExoplanetProfile[]> | null>();
  let retryAt = Number.NEGATIVE_INFINITY;

  return async () => {
    const requestTime = now();
    const cached = cache.get("catalog", requestTime);
    if (cached) return { cached: true, value: cached };
    if (requestTime < retryAt) return null;

    return requests.run("catalog", async () => {
      try {
        const value = await load();
        cache.set("catalog", value, requestTime + cacheTtlMs);
        return { cached: false, value };
      } catch {
        // Avoid retrying a failed full download for every keystroke while live queries recover.
        retryAt = now() + retryMs;
        return null;
      }
    });
  };
};
