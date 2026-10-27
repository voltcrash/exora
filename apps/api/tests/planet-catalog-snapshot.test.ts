import type { ExoplanetProfile } from "@exora/contracts";
import { expect, test, vi } from "vite-plus/test";
import { createPlanetCatalogSnapshot } from "../src/planet-catalog-snapshot.ts";

test("different readers share one in-flight catalog and reuse it until expiry", async () => {
  let now = 0;
  let release!: (value: ExoplanetProfile[]) => void;
  const load = vi.fn(
    () =>
      new Promise<ExoplanetProfile[]>((resolve) => {
        release = resolve;
      }),
  );
  const snapshot = createPlanetCatalogSnapshot(load, { cacheTtlMs: 100, now: () => now });
  const first = snapshot();
  const second = snapshot();
  await Promise.resolve();
  expect(load).toHaveBeenCalledOnce();
  release([]);
  expect(await Promise.all([first, second])).toEqual([
    { cached: false, value: [] },
    { cached: false, value: [] },
  ]);
  now = 99;
  expect(await snapshot()).toEqual({ cached: true, value: [] });
  now = 100;
  const refresh = snapshot();
  await Promise.resolve();
  expect(load).toHaveBeenCalledTimes(2);
  release([]);
  expect(await refresh).toEqual({ cached: false, value: [] });
});

test("failed snapshot loads are coalesced and have a cooldown before recovery", async () => {
  let now = 0;
  let failing = true;
  const load = vi.fn(async () => {
    if (failing) throw new Error("TAP unavailable");
    return [];
  });
  const snapshot = createPlanetCatalogSnapshot(load, { cacheTtlMs: 100_000, now: () => now });
  expect(await Promise.all([snapshot(), snapshot()])).toEqual([null, null]);
  now = 59_999;
  expect(await snapshot()).toBeNull();
  expect(load).toHaveBeenCalledOnce();
  failing = false;
  now = 60_000;
  expect(await snapshot()).toEqual({ cached: false, value: [] });
  expect(await snapshot()).toEqual({ cached: true, value: [] });
  expect(load).toHaveBeenCalledTimes(2);
});
