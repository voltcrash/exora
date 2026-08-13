import { expect, test } from "vite-plus/test";
import type { ExoplanetProfile } from "@exora/contracts";
import { deriveWorldRecipe } from "../src/index.ts";

const featuredPlanet: ExoplanetProfile = {
  id: "hip-65426-b",
  name: "HIP 65426 b",
  hostStar: "HIP 65426",
  kind: "gas-giant",
  observation: {
    radiusJupiter: 1.5,
    massJupiter: 9,
    radiusEarth: 16.8,
    massEarth: 2860.4,
    equilibriumTemperatureKelvin: 1500,
    orbitalPeriodDays: null,
    semiMajorAxisAu: 92,
    distanceParsecs: 108.875,
    discoveryYear: 2017,
    discoveryMethod: "Imaging",
    hostSpectralType: "A2 V",
  },
  source: {
    archive: "NASA Exoplanet Archive",
    table: "pscomppars",
    retrievedOn: "2026-08-13",
  },
};

const temperateRockyPlanet: ExoplanetProfile = {
  ...featuredPlanet,
  id: "kepler-62-f",
  name: "Kepler-62 f",
  kind: "rocky",
  observation: {
    ...featuredPlanet.observation,
    radiusJupiter: null,
    massJupiter: null,
    radiusEarth: 1.41,
    massEarth: 2.8,
    equilibriumTemperatureKelvin: 208,
  },
};

test("world recipes are deterministic for the same planet", () => {
  const first = deriveWorldRecipe(featuredPlanet);
  const second = deriveWorldRecipe(featuredPlanet);

  expect(second).toEqual(first);
});

test("hot massive gas giants produce the intended visual family", () => {
  const recipe = deriveWorldRecipe(featuredPlanet);

  expect(recipe.renderer).toBe("gas-giant");
  expect(recipe.classification).toBe("Young super-Jupiter");
  expect(recipe.atmosphere.label).toContain("inferred");
  expect(recipe.radiusSceneUnits).toBeGreaterThan(4);
});

test("temperate rocky planets produce displaced terrain with low basins", () => {
  const recipe = deriveWorldRecipe(temperateRockyPlanet);

  expect(recipe.renderer).toBe("rocky");
  expect(recipe.classification).toBe("Temperate rocky world");

  if (recipe.renderer !== "rocky") throw new Error("Expected a rocky recipe.");
  expect(recipe.surface.elevation).toBeGreaterThan(0);
  expect(recipe.surface.waterLevel).toBeGreaterThan(0);
  expect(recipe.atmosphere.label).toContain("inferred");
});

test("rocky terrain changes deterministically between planets", () => {
  const first = deriveWorldRecipe(temperateRockyPlanet);
  const second = deriveWorldRecipe({
    ...temperateRockyPlanet,
    id: "trappist-1-e",
    name: "TRAPPIST-1 e",
  });

  expect(first.seed).not.toBe(second.seed);
  expect(first).not.toEqual(second);
});
