import type { ExoplanetProfile } from "@exora/contracts";
import { expect, test } from "vite-plus/test";
import {
  browsePlanetCatalog,
  compareCatalogNames,
  findCatalogPlanet,
  rankPlanetMatches,
  searchPlanetCatalog,
} from "../src/index.ts";

const planet = (name: string, radiusEarth: number | null = 1): ExoplanetProfile => ({
  id: name.toLowerCase().replaceAll(/[^a-z0-9]+/g, "-"),
  name,
  hostStar: "Host",
  kind: "rocky",
  observation: {
    radiusJupiter: null,
    massJupiter: null,
    radiusEarth,
    massEarth: null,
    massProvenance: null,
    radiusProvenance: null,
    equilibriumTemperatureKelvin: 250,
    orbitalEccentricity: null,
    orbitalInclinationDegrees: null,
    orbitalPeriodDays: null,
    semiMajorAxisAu: null,
    distanceParsecs: 10,
    rightAscensionDegrees: null,
    declinationDegrees: null,
    discoveryYear: null,
    discoveryMethod: "Transit",
    hostSpectralType: null,
    hostTemperatureKelvin: null,
    hostRadiusSolar: null,
    hostMassSolar: null,
    hostLuminosityLogSolar: null,
    signal: {
      impactParameter: null,
      orbitalPeriodUncertaintyDays: null,
      radialVelocityAmplitudeMetersPerSecond: null,
      radiusRatio: null,
      transitDepthPercent: null,
      transitDurationHours: null,
      transitMidpointBjd: null,
      transitMidpointUncertaintyDays: null,
    },
  },
  source: { archive: "NASA Exoplanet Archive", table: "pscomppars", retrievedOn: "2026-10-27" },
});

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

test("the planet a reader means outranks longer names that merely contain it", () => {
  const ranked = rankPlanetMatches(
    "kepler 18",
    ["Kepler-1018 b", "Kepler-187 b", "Kepler-18 c", "Kepler-18 b"].map((name) => planet(name)),
  ).map(({ name }) => name);

  expect(ranked).toEqual(["Kepler-18 b", "Kepler-18 c", "Kepler-187 b", "Kepler-1018 b"]);
});

test("browse names use keyset ordering and compare wildcard cursors literally", () => {
  const catalog = ["World_2 b", "World%1 b", "World 3 b"]
    .map((name) => planet(name))
    .sort(compareCatalogNames);
  expect(catalog.map(({ name }) => name)).toEqual(["World 3 b", "World%1 b", "World_2 b"]);
  expect(browsePlanetCatalog(catalog, 12, "World%1 b").planets.map(({ name }) => name)).toEqual([
    "World_2 b",
  ]);
  expect(browsePlanetCatalog(catalog, 12, "World_2 b")).toEqual({ nextCursor: null, planets: [] });
});

test("browse pages skip worlds without physical controls and clamp their size", () => {
  const catalog = Array.from({ length: 30 }, (_, index) =>
    planet(`World ${String(index).padStart(2, "0")}`, index === 3 ? null : 1),
  );
  const first = browsePlanetCatalog(catalog, 1);
  expect(first.planets).toHaveLength(12);
  expect(first.planets.map(({ name }) => name)).not.toContain("World 03");
  expect(first.nextCursor).toBe("World 12");
  const second = browsePlanetCatalog(catalog, 12, ` ${first.nextCursor} `);
  expect(second.planets[0]?.name).toBe("World 13");
  expect(second.nextCursor).toBe("World 24");
  expect(browsePlanetCatalog(catalog, 12, second.nextCursor)).toEqual({
    nextCursor: null,
    planets: catalog.slice(25),
  });
});

test("search results are capped at the public search limit", () => {
  const catalog = Array.from({ length: 30 }, (_, index) => planet(`Kepler-${index + 1} b`));
  expect(searchPlanetCatalog(catalog, "kepler", 100)).toHaveLength(24);
  expect(searchPlanetCatalog(catalog, "kepler", 0)).toHaveLength(1);
});
