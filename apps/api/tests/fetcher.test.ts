import { afterEach, expect, test, vi } from "vite-plus/test";
import { VizierBlackHoleRepository } from "../src/black-hole-archive.ts";
import { JplHorizonsRepository } from "../src/horizons.ts";
import { NasaPlanetRepository } from "../src/nasa-archive.ts";
import { NasaPopulationRepository } from "../src/planet-population.ts";
import { SimbadStarRepository } from "../src/simbad-archive.ts";

afterEach(() => {
  vi.unstubAllGlobals();
});

test("default repositories call fetch the way Workers require, never as their own method", async () => {
  const receivers: unknown[] = [];
  // Workers reject a fetch whose `this` is anything but the global scope.
  vi.stubGlobal("fetch", function (this: unknown) {
    receivers.push(this);
    if (this !== undefined && this !== globalThis) throw new TypeError("Illegal invocation");
    return Promise.resolve(new Response(null, { status: 503 }));
  });

  await Promise.allSettled([
    new VizierBlackHoleRepository().browse(12),
    new JplHorizonsRepository().positions([399], new Date("2026-01-01T00:00:00Z")),
    new NasaPlanetRepository().search("kepler", 6),
    new NasaPopulationRepository().population(),
    new SimbadStarRepository().search("vega", 6),
  ]);

  expect(receivers.length).toBeGreaterThanOrEqual(5);
  expect(receivers.every((receiver) => receiver === undefined || receiver === globalThis)).toBe(
    true,
  );
});
