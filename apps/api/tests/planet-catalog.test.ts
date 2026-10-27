import { expect, test } from "vite-plus/test";
import { normalizeNasaPlanet } from "../src/nasa-archive.ts";
import {
  browsePlanetCatalog,
  compareCatalogNames,
  findCatalogPlanet,
  searchPlanetCatalog,
} from "../src/planet-catalog.ts";

const planet = (name: string) =>
  normalizeNasaPlanet(
    {
      pl_name: name,
      hostname: "Host",
      pl_rade: 1,
      sy_dist: 10,
      pl_eqt: 250,
    },
    "2026-10-27",
  )!;

test("snapshot lookup keeps apostrophes literal and strips legacy query wildcards", () => {
  const catalog = [planet("O'Neil-1 b"), planet("A''B c")];
  expect(findCatalogPlanet(catalog, "o%_'neil-1 B")).toBe(catalog[0]);
  expect(findCatalogPlanet(catalog, "a''b C")).toBe(catalog[1]);
  expect(findCatalogPlanet(catalog, "unknown")).toBeNull();
});

test("snapshot search requires each token in order without treating punctuation as a pattern", () => {
  const catalog = [
    planet("51 Peg b"),
    planet("Peg 51 b"),
    planet("O'Neil-1 b"),
    planet("Étoile-12 b"),
  ];
  expect(searchPlanetCatalog(catalog, "51_Peg%b", 24).map(({ name }) => name)).toEqual([
    "51 Peg b",
  ]);
  expect(searchPlanetCatalog(catalog, "o'neil", 24).map(({ name }) => name)).toEqual([
    "O'Neil-1 b",
  ]);
  expect(searchPlanetCatalog(catalog, "étoile12b", 24).map(({ name }) => name)).toEqual([
    "Étoile-12 b",
  ]);
  expect(searchPlanetCatalog(catalog, "--", 24)).toEqual([]);
});

test("browse names use keyset ordering and compare wildcard cursors literally", () => {
  const catalog = ["World_2 b", "World%1 b", "World 3 b"].map(planet).sort(compareCatalogNames);
  expect(catalog.map(({ name }) => name)).toEqual(["World 3 b", "World%1 b", "World_2 b"]);
  expect(browsePlanetCatalog(catalog, 12, "World%1 b").map(({ name }) => name)).toEqual([
    "World_2 b",
  ]);
  expect(browsePlanetCatalog(catalog, 12, "World_2 b")).toEqual([]);
});
