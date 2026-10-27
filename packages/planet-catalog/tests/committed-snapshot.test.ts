import { exoplanetProfileSchema } from "@exora/contracts";
import { expect, test } from "vite-plus/test";
import {
  compareCatalogNames,
  decodePlanetCatalog,
  PLANET_CATALOG_FIELDS,
  type PlanetCatalogSnapshot,
} from "../src/index.ts";
import committed from "@exora/planet-catalog/snapshot.json" with { type: "json" };

const snapshot = committed as unknown as PlanetCatalogSnapshot;

test("the committed snapshot decodes into valid, name-ordered profiles", () => {
  expect(snapshot.fields).toEqual(PLANET_CATALOG_FIELDS);
  expect(Number.isNaN(Date.parse(snapshot.generatedAt))).toBe(false);
  const planets = decodePlanetCatalog(snapshot);
  expect(planets.length).toBeGreaterThan(5_000);
  for (const planet of planets) exoplanetProfileSchema.parse(planet);
  expect(planets).toEqual([...planets].sort(compareCatalogNames));
});
