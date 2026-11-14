import { expect, test } from "vite-plus/test";
import { loadPlanetCatalog } from "./planet-catalog.ts";

test("a real module worker searches and pages the archive without blocking the UI", async () => {
  const catalog = await loadPlanetCatalog();
  const [found, matches, first] = await Promise.all([
    catalog.find("Kepler-22 b"),
    catalog.search("Kepler 22", 12),
    catalog.browse(10),
  ]);
  expect(found?.name).toBe("Kepler-22 b");
  expect(matches.some((planet) => planet.id === found?.id)).toBe(true);
  expect(first.planets).toHaveLength(10);
  const next = await catalog.browse(10, first.nextCursor);
  expect(next.planets).toHaveLength(10);
  expect(next.planets.some((planet) => first.planets.some(({ id }) => id === planet.id))).toBe(
    false,
  );
});
