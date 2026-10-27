import type { ExoplanetProfile } from "@exora/contracts";
import { expect, test, vi } from "vite-plus/test";
import { createPlanetCatalogSnapshot } from "../src/planet-catalog-snapshot.ts";

test("cold readers return immediately and share a background load, then serve stale during refresh", async () => {
  let now = 0;
  let release!: (value: ExoplanetProfile[]) => void;
  const load = vi.fn(
    () =>
      new Promise<ExoplanetProfile[]>((resolve) => {
        release = resolve;
      }),
  );
  const snapshot = createPlanetCatalogSnapshot(load, { cacheTtlMs: 100, now: () => now });
  expect(snapshot()).toBeNull();
  expect(snapshot()).toBeNull();
  await Promise.resolve();
  expect(load).toHaveBeenCalledOnce();
  const first: ExoplanetProfile[] = [];
  release(first);
  await vi.waitFor(() => expect(snapshot()).toEqual({ cached: true, value: first }));
  now = 99;
  expect(snapshot()?.value).toBe(first);
  expect(load).toHaveBeenCalledOnce();
  now = 100;
  expect(snapshot()?.value).toBe(first);
  expect(snapshot()?.value).toBe(first);
  await Promise.resolve();
  expect(load).toHaveBeenCalledTimes(2);
  const refreshed: ExoplanetProfile[] = [];
  release(refreshed);
  await vi.waitFor(() => expect(snapshot()?.value).toBe(refreshed));
});

test("failed cold loads have a cooldown before background recovery", async () => {
  let now = 0;
  const load = vi.fn<() => Promise<ExoplanetProfile[]>>().mockRejectedValue(new Error("offline"));
  const snapshot = createPlanetCatalogSnapshot(load, { cacheTtlMs: 100_000, now: () => now });
  expect(snapshot()).toBeNull();
  expect(snapshot()).toBeNull();
  await vi.waitFor(() => expect(load).toHaveBeenCalledOnce());
  now = 59_999;
  expect(snapshot()).toBeNull();
  expect(load).toHaveBeenCalledOnce();
  load.mockResolvedValue([]);
  now = 60_000;
  expect(snapshot()).toBeNull();
  await vi.waitFor(() => expect(snapshot()).toEqual({ cached: true, value: [] }));
  expect(load).toHaveBeenCalledTimes(2);
});

test("a failed refresh retains the stale snapshot through backoff and recovery", async () => {
  let now = 0;
  const first: ExoplanetProfile[] = [];
  const load = vi.fn<() => Promise<ExoplanetProfile[]>>().mockResolvedValue(first);
  const snapshot = createPlanetCatalogSnapshot(load, { cacheTtlMs: 100, now: () => now });
  snapshot();
  await vi.waitFor(() => expect(snapshot()?.value).toBe(first));
  load.mockRejectedValue(new Error("offline"));
  now = 100;
  expect(snapshot()?.value).toBe(first);
  await vi.waitFor(() => expect(load).toHaveBeenCalledTimes(2));
  now = 60_099;
  expect(snapshot()?.value).toBe(first);
  expect(load).toHaveBeenCalledTimes(2);
  const refreshed: ExoplanetProfile[] = [];
  load.mockResolvedValue(refreshed);
  now = 60_100;
  expect(snapshot()?.value).toBe(first);
  await vi.waitFor(() => expect(snapshot()?.value).toBe(refreshed));
  expect(load).toHaveBeenCalledTimes(3);
});
