import type { ExoplanetProfile } from "@exora/contracts";
import { createRequestCoalescer } from "./archive-cache.ts";
import type { RepositoryResult } from "./nasa-archive.ts";

export const createPlanetCatalogSnapshot = (
  load: () => Promise<ExoplanetProfile[]>,
  {
    cacheTtlMs,
    now,
    retryMs = 60_000,
  }: { cacheTtlMs: number; now: () => number; retryMs?: number },
) => {
  const requests = createRequestCoalescer<void>();
  let value: ExoplanetProfile[] | undefined;
  let expiresAt = Number.NEGATIVE_INFINITY;
  let retryAt = Number.NEGATIVE_INFINITY;

  const refresh = () => {
    const requestTime = now();
    if (requestTime >= expiresAt && requestTime >= retryAt) {
      return requests.run("catalog", async () => {
        try {
          value = await load();
          expiresAt = now() + cacheTtlMs;
        } catch {
          // Keep stale data and avoid retrying a failed full download for every keystroke.
          retryAt = now() + retryMs;
        }
      });
    }
  };

  const read = (): RepositoryResult<ExoplanetProfile[]> | null =>
    value ? { cached: true, value } : null;

  return Object.assign(
    () => {
      void refresh();
      return read();
    },
    {
      async ready() {
        const pending = refresh();
        if (!value) await pending;
        return read();
      },
    },
  );
};
