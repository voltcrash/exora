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

const iceGiantPlanet: ExoplanetProfile = {
  ...featuredPlanet,
  id: "gj-436-b",
  name: "GJ 436 b",
  hostStar: "GJ 436",
  kind: "ice-giant",
  observation: {
    ...featuredPlanet.observation,
    radiusJupiter: 0.37,
    massJupiter: 0.07,
    radiusEarth: 4.17,
    massEarth: 22.1,
    equilibriumTemperatureKelvin: 686,
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

  if (recipe.renderer !== "gas-giant") throw new Error("Expected a gas-giant recipe.");
  expect(recipe.cloudBands.jetCount).toBeGreaterThanOrEqual(13);
  expect(recipe.cloudBands.stormStrength).toBeGreaterThan(0);
  expect(recipe.cloudBands.stormColor).toHaveLength(3);
});

test("temperate rocky planets produce displaced terrain with low basins", () => {
  const recipe = deriveWorldRecipe(temperateRockyPlanet);

  expect(recipe.renderer).toBe("rocky");
  expect(recipe.classification).toBe("Temperate rocky world");

  if (recipe.renderer !== "rocky") throw new Error("Expected a rocky recipe.");
  expect(recipe.surface.elevation).toBeGreaterThan(0);
  expect(recipe.surface.waterLevel).toBeGreaterThan(0);
  expect(recipe.surface.cloudCover).toBeGreaterThan(0);
  expect(recipe.surface.iceCapStrength).toBeGreaterThan(0);
  expect(recipe.surface.lavaStrength).toBe(0);
  expect(recipe.atmosphere.label).toContain("inferred");
});

test("scorched rocky planets generate emissive fractures without water", () => {
  const recipe = deriveWorldRecipe({
    ...temperateRockyPlanet,
    id: "lava-world",
    observation: {
      ...temperateRockyPlanet.observation,
      equilibriumTemperatureKelvin: 1_120,
    },
  });

  expect(recipe.renderer).toBe("rocky");
  if (recipe.renderer !== "rocky") throw new Error("Expected a rocky recipe.");
  expect(recipe.classification).toBe("Scorched rocky world");
  expect(recipe.surface.lavaStrength).toBeGreaterThan(0);
  expect(recipe.surface.waterLevel).toBe(0);
  expect(recipe.surface.cloudCover).toBe(0);
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

test("ice giants produce methane haze and a faint ring system", () => {
  const recipe = deriveWorldRecipe(iceGiantPlanet);

  expect(recipe.renderer).toBe("ice-giant");
  expect(recipe.classification).toBe("Ice giant");
  expect(recipe.atmosphere.label).toContain("methane");

  if (recipe.renderer !== "ice-giant") throw new Error("Expected an ice-giant recipe.");
  expect(recipe.atmosphereBands.bandScale).toBeGreaterThanOrEqual(9);
  expect(recipe.atmosphereBands.polarGlow).toBeGreaterThan(0);
  expect(recipe.rings.outerRadius).toBeGreaterThan(recipe.radiusSceneUnits);
  expect(recipe.rings.opacity).toBeLessThan(0.25);
});
