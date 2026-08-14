import { expect, test } from "vite-plus/test";
import { featuredPlanet } from "./planet-profile.ts";
import {
  DEFAULT_PHYSICAL_PLANET_FILTERS,
  filterPlanetsByPhysicalControls,
  suggestPlanetName,
  suggestStarName,
} from "./search-discovery.ts";

test("corrects planet misspellings and punctuation-free catalog numbers", () => {
  expect(suggestPlanetName("keplar-452 b")).toBe("Kepler-452 b");
  expect(suggestPlanetName("wasp39b")).toBe("WASP-39 b");
});

test("matches familiar and catalog star identities", () => {
  expect(suggestStarName("betelguese")).toBe("Betelgeuse");
  expect(suggestStarName("HD10700")).toBe("Tau Ceti");
});

test("does not suggest unrelated or incomplete signals", () => {
  expect(suggestPlanetName("xy")).toBeNull();
  expect(suggestStarName("something unrelated")).toBeNull();
});

test("physical controls immediately narrow the visible planet field", () => {
  const temperateRocky = {
    ...featuredPlanet,
    id: "temperate-rocky",
    name: "Temperate Rocky",
    kind: "rocky" as const,
    observation: {
      ...featuredPlanet.observation,
      radiusEarth: 1.1,
      radiusJupiter: null,
      equilibriumTemperatureKelvin: 260,
      distanceParsecs: 8,
    },
  };

  expect(
    filterPlanetsByPhysicalControls([featuredPlanet, temperateRocky], {
      ...DEFAULT_PHYSICAL_PLANET_FILTERS,
      composition: 0,
      habitableZone: true,
    }),
  ).toEqual([temperateRocky]);
});

test("data-completeness control excludes sparsely observed worlds", () => {
  const sparse = {
    ...featuredPlanet,
    id: "sparse",
    observation: {
      ...featuredPlanet.observation,
      massEarth: null,
      massJupiter: null,
      orbitalPeriodDays: null,
      semiMajorAxisAu: null,
      hostTemperatureKelvin: null,
      hostRadiusSolar: null,
    },
  };

  expect(
    filterPlanetsByPhysicalControls([sparse, featuredPlanet], {
      ...DEFAULT_PHYSICAL_PLANET_FILTERS,
      wellMeasured: true,
    }),
  ).toEqual([featuredPlanet]);
});
