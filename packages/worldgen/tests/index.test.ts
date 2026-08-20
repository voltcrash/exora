import { expect, test } from "vite-plus/test";
import type { ExoplanetProfile, StarProfile } from "@exora/contracts";
import {
  deriveHostStar,
  derivePlanetDerivedProperties,
  derivePlanetInferredProperties,
  derivePlanetMeasuredProperties,
  deriveStarRecipe,
  deriveWorldRecipe,
  generateCustomStar,
  generateCustomWorld,
  hashObjectId,
} from "../src/index.ts";

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
    hostTemperatureKelvin: 8_840,
    hostRadiusSolar: 1.77,
    hostMassSolar: 1.96,
    hostLuminosityLogSolar: 1.02,
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

test("host-star visuals respond to NASA stellar temperature, radius, luminosity, and orbit", () => {
  const hotStar = deriveHostStar(featuredPlanet);
  const coolNearbyStar = deriveHostStar({
    ...featuredPlanet,
    observation: {
      ...featuredPlanet.observation,
      hostTemperatureKelvin: 2_800,
      hostRadiusSolar: 0.12,
      hostMassSolar: 0.09,
      hostLuminosityLogSolar: -3.2,
      semiMajorAxisAu: 0.02,
    },
  });
  const massFallbackStar = deriveHostStar({
    ...featuredPlanet,
    observation: {
      ...featuredPlanet.observation,
      hostTemperatureKelvin: null,
      hostRadiusSolar: null,
      hostMassSolar: 0.2,
      hostLuminosityLogSolar: null,
    },
  });

  expect(hotStar.color[2]).toBeGreaterThan(coolNearbyStar.color[2]);
  expect(coolNearbyStar.color[0]).toBeGreaterThan(coolNearbyStar.color[2]);
  expect(hotStar.radiusSceneUnits).toBeGreaterThan(coolNearbyStar.radiusSceneUnits);
  expect(hotStar.intensity).toBeGreaterThan(coolNearbyStar.intensity);
  expect(coolNearbyStar.apparentRadiusRadians).toBeGreaterThan(hotStar.apparentRadiusRadians);
  expect(massFallbackStar.radiusSceneUnits).toBeLessThan(hotStar.radiusSceneUnits);
  expect(massFallbackStar.intensity).toBeLessThan(hotStar.intensity);
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

test("rocky mineral families survive into visibly distinct rendered palettes", () => {
  const carbonRichPlanet: ExoplanetProfile = {
    ...temperateRockyPlanet,
    id: "low-density-carbon-world",
    observation: {
      ...temperateRockyPlanet.observation,
      radiusEarth: 1.7,
      massEarth: 1,
      equilibriumTemperatureKelvin: 360,
    },
  };
  const gallery = [
    deriveWorldRecipe(carbonRichPlanet),
    deriveWorldRecipe(massiveSuperEarthPlanet),
    deriveWorldRecipe(smallHotRockyPlanet),
    deriveWorldRecipe(coldRockyPlanet),
  ];
  const rockyGallery = gallery.map((recipe) => {
    if (recipe.renderer !== "rocky") throw new Error("Expected a rocky recipe.");
    return recipe;
  });

  expect(new Set(rockyGallery.map((recipe) => recipe.inferred.paletteFamily)).size).toBe(4);
  expect(new Set(rockyGallery.map((recipe) => JSON.stringify(recipe.surface.midColor))).size).toBe(
    4,
  );
  for (const recipe of rockyGallery) {
    for (const channel of [
      ...recipe.surface.lowColor,
      ...recipe.surface.midColor,
      ...recipe.surface.highColor,
    ]) {
      expect(channel).toBeGreaterThanOrEqual(0);
      expect(channel).toBeLessThanOrEqual(1);
    }
  }
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

test("custom world parameters directly tune the generated renderer recipe", () => {
  const world = generateCustomWorld({
    activity: 0.9,
    atmosphere: 0.75,
    axialTilt: 0.8,
    baseColor: [0.15, 0.55, 0.72],
    kind: "gas-giant",
    name: "Asteria Prime",
    radius: 0.7,
    rings: true,
    rotation: 0.6,
    seed: 7319,
    temperatureKelvin: 840,
    water: 0,
  });

  expect(world.planet.name).toBe("Asteria Prime");
  expect(world.planet.source.archive).toBe("Exora Custom Generator");
  expect(world.recipe.renderer).toBe("gas-giant");
  expect(world.recipe.rotationSpeed).toBeCloseTo(0.0412);

  if (world.recipe.renderer !== "gas-giant") throw new Error("Expected a gas giant.");
  expect(world.recipe.cloudBands.stormStrength).toBe(0.9);
  expect(world.recipe.cloudBands.jetCount).toBe(30);
  expect(world.recipe.rings?.opacity).toBeCloseTo(0.265);
});

test("custom rocky worlds vaporize selected water at extreme temperatures", () => {
  const world = generateCustomWorld({
    activity: 0.5,
    atmosphere: 0.4,
    axialTilt: 0.5,
    baseColor: [0.7, 0.15, 0.05],
    kind: "rocky",
    name: "Caldera",
    radius: 0.5,
    rings: false,
    rotation: 0.5,
    seed: 42,
    temperatureKelvin: 1_300,
    water: 1,
  });

  if (world.recipe.renderer !== "rocky") throw new Error("Expected a rocky world.");
  expect(world.recipe.surface.waterLevel).toBe(0);
  expect(world.recipe.surface.lavaStrength).toBeGreaterThan(0);
  expect(world.recipe.surface.midColor).toEqual([0.504, 0.108, 0.036]);
});

test("custom star parameters create a local renderer profile", () => {
  const { star } = generateCustomStar({
    activity: 0.82,
    kind: "evolved",
    name: "Solara",
    radius: 0.9,
    rotation: 0.35,
    seed: 911,
    temperatureKelvin: 3_450,
  });

  expect(star).toMatchObject({
    id: "custom-star-911",
    kind: "evolved",
    name: "Solara",
    observation: { spectralType: "MIII" },
    source: { archive: "Exora Custom Generator", table: "procedural" },
    customization: {
      activity: 0.82,
      radius: 0.9,
      rotation: 0.35,
      temperatureKelvin: 3_450,
    },
  });
  expect(star.observation.rightAscensionDegrees).toBeNull();
  expect(star.observation.visualMagnitude).toBeNull();
});

const catalogStar: StarProfile = {
  id: "hd-172167",
  name: "Vega",
  catalogName: "HD 172167",
  kind: "main-sequence",
  objectType: "Star",
  observation: {
    rightAscensionDegrees: 279.234,
    declinationDegrees: 38.784,
    parallaxMas: 130.23,
    distanceParsecs: 7.68,
    properMotionRaMasPerYear: 200.94,
    properMotionDecMasPerYear: 286.23,
    radialVelocityKmPerSecond: -20.6,
    spectralType: "A0Va",
    visualMagnitude: 0.03,
    gaiaMagnitude: 0.15,
  },
  source: { archive: "SIMBAD", tables: ["basic", "ident", "allfluxes"], retrievedOn: "2026-08-13" },
};

test("hashObjectId is a pure function of the identifier and worldgen version", () => {
  expect(hashObjectId("hip-65426-b")).toBe(hashObjectId("hip-65426-b"));
  expect(hashObjectId("hip-65426-b")).not.toBe(hashObjectId("kepler-62-f"));
});

test("planet recipes are deterministic given the same seed and differ across object ids", () => {
  const first = deriveWorldRecipe(featuredPlanet);
  const second = deriveWorldRecipe({ ...featuredPlanet });
  const renamed = deriveWorldRecipe({ ...featuredPlanet, id: "a-different-planet-id" });

  expect(second).toEqual(first);
  expect(second.seed).toBe(first.seed);
  expect(renamed.seed).not.toBe(first.seed);
  expect(renamed).not.toEqual(first);
});

test("star recipes are deterministic for the same star and differ across object ids", () => {
  const first = deriveStarRecipe(catalogStar);
  const second = deriveStarRecipe({ ...catalogStar });
  const renamed = deriveStarRecipe({ ...catalogStar, id: "a-different-star-id" });

  expect(second).toEqual(first);
  expect(second.seed).toBe(first.seed);
  expect(renamed.seed).not.toBe(first.seed);
});

test("missing NASA host-star fields never produce NaN or non-finite values", () => {
  const sparse = deriveHostStar({
    ...featuredPlanet,
    observation: {
      ...featuredPlanet.observation,
      hostTemperatureKelvin: null,
      hostRadiusSolar: null,
      hostMassSolar: null,
      hostLuminosityLogSolar: null,
      semiMajorAxisAu: null,
    },
  });

  for (const value of [
    sparse.intensity,
    sparse.radiusSceneUnits,
    sparse.apparentRadiusRadians,
    ...sparse.color,
  ]) {
    expect(Number.isFinite(value)).toBe(true);
    expect(Number.isNaN(value)).toBe(false);
  }
});

test("missing SIMBAD spectral type never produces NaN and falls back to a sane default", () => {
  const sparse = deriveStarRecipe({
    ...catalogStar,
    observation: { ...catalogStar.observation, spectralType: null },
  });

  expect(Number.isFinite(sparse.temperatureKelvin)).toBe(true);
  expect(sparse.color.every((channel) => Number.isFinite(channel))).toBe(true);
  expect(sparse.label).toBe("Yellow star");
});

test("extreme host-star values are clamped into physically sane ranges instead of overflowing", () => {
  const extreme = deriveHostStar({
    ...featuredPlanet,
    observation: {
      ...featuredPlanet.observation,
      hostTemperatureKelvin: null,
      hostRadiusSolar: null,
      hostMassSolar: 1e12,
      hostLuminosityLogSolar: 1e6,
      semiMajorAxisAu: 1e-9,
    },
  });

  expect(Number.isFinite(extreme.intensity)).toBe(true);
  expect(Number.isFinite(extreme.radiusSceneUnits)).toBe(true);
  expect(Number.isFinite(extreme.apparentRadiusRadians)).toBe(true);
  expect(extreme.intensity).toBeLessThanOrEqual(3.2);
  expect(extreme.radiusSceneUnits).toBeLessThanOrEqual(5.5);
  expect(extreme.apparentRadiusRadians).toBeLessThanOrEqual(0.09);
  for (const channel of extreme.color) {
    expect(channel).toBeGreaterThanOrEqual(0);
    expect(channel).toBeLessThanOrEqual(1);
  }
});

test("extreme custom star inputs stay within the recipe's expected ranges", () => {
  const { star } = generateCustomStar({
    activity: 50,
    kind: "main-sequence",
    name: "Overdriven",
    radius: -8,
    rotation: 2,
    seed: -100,
    temperatureKelvin: 9_000_000,
  });
  const recipe = deriveStarRecipe(star);

  expect(recipe.seed).toBeGreaterThanOrEqual(0);
  expect(recipe.temperatureKelvin).toBeLessThanOrEqual(40_000);
  expect(recipe.activity).toBeGreaterThanOrEqual(0);
  expect(recipe.activity).toBeLessThanOrEqual(1);
  expect(recipe.radiusSceneUnits).toBeGreaterThanOrEqual(5.6);
  expect(recipe.radiusSceneUnits).toBeLessThanOrEqual(5.6 + 3.2);
  for (const channel of recipe.color) {
    expect(Number.isFinite(channel)).toBe(true);
    expect(channel).toBeGreaterThanOrEqual(0);
    expect(channel).toBeLessThanOrEqual(1);
  }
});

const earthSizeRockyPlanet: ExoplanetProfile = {
  ...temperateRockyPlanet,
  id: "earth-analog",
  name: "Earth Analog",
  observation: {
    ...temperateRockyPlanet.observation,
    radiusEarth: 1.0,
    massEarth: 1.0,
    equilibriumTemperatureKelvin: 255,
  },
};

const massiveSuperEarthPlanet: ExoplanetProfile = {
  ...temperateRockyPlanet,
  id: "massive-super-earth",
  name: "Massive Super-Earth",
  observation: {
    ...temperateRockyPlanet.observation,
    radiusEarth: 1.8,
    massEarth: 9,
    equilibriumTemperatureKelvin: 260,
  },
};

const smallHotRockyPlanet: ExoplanetProfile = {
  ...temperateRockyPlanet,
  id: "small-hot-rocky",
  name: "Small Hot Rocky World",
  observation: {
    ...temperateRockyPlanet.observation,
    radiusEarth: 0.8,
    massEarth: 0.6,
    equilibriumTemperatureKelvin: 2_100,
    semiMajorAxisAu: 0.01,
  },
};

const coldRockyPlanet: ExoplanetProfile = {
  ...temperateRockyPlanet,
  id: "cold-rocky",
  name: "Cold Rocky World",
  observation: {
    ...temperateRockyPlanet.observation,
    radiusEarth: 1.1,
    massEarth: 1.3,
    equilibriumTemperatureKelvin: 90,
  },
};

const jupiterSizeGiantPlanet: ExoplanetProfile = {
  ...featuredPlanet,
  id: "jupiter-analog",
  name: "Jupiter Analog",
  kind: "gas-giant",
  observation: {
    ...featuredPlanet.observation,
    radiusJupiter: 1.0,
    massJupiter: 1.0,
    equilibriumTemperatureKelvin: 150,
  },
};

const lowDensityGiantPlanet: ExoplanetProfile = {
  ...featuredPlanet,
  id: "low-density-giant",
  name: "Puffy Giant",
  kind: "gas-giant",
  observation: {
    ...featuredPlanet.observation,
    radiusJupiter: 1.8,
    massJupiter: 0.3,
    equilibriumTemperatureKelvin: 900,
  },
};

const neptuneSizeWorld: ExoplanetProfile = {
  ...iceGiantPlanet,
  id: "neptune-analog",
  name: "Neptune Analog",
  observation: {
    ...iceGiantPlanet.observation,
    radiusEarth: 3.88,
    massEarth: 17.1,
    equilibriumTemperatureKelvin: 72,
  },
};

const hotJupiterPlanet: ExoplanetProfile = {
  ...featuredPlanet,
  id: "hot-jupiter",
  name: "Hot Jupiter",
  kind: "gas-giant",
  observation: {
    ...featuredPlanet.observation,
    radiusJupiter: 1.3,
    massJupiter: 0.8,
    equilibriumTemperatureKelvin: 1_650,
    semiMajorAxisAu: 0.03,
  },
};

const unknownIncompletePlanet: ExoplanetProfile = {
  ...temperateRockyPlanet,
  id: "unknown-incomplete",
  name: "Unknown Incomplete Object",
  kind: "unknown",
  observation: {
    distanceParsecs: null,
    discoveryMethod: "Unknown",
    discoveryYear: null,
    equilibriumTemperatureKelvin: null,
    hostLuminosityLogSolar: null,
    hostMassSolar: null,
    hostRadiusSolar: null,
    hostSpectralType: null,
    hostTemperatureKelvin: null,
    massEarth: null,
    massJupiter: null,
    orbitalPeriodDays: null,
    radiusEarth: null,
    radiusJupiter: null,
    semiMajorAxisAu: null,
  },
};

const mDwarfStar: StarProfile = {
  ...catalogStar,
  id: "gj-1002",
  name: "GJ 1002",
  observation: { ...catalogStar.observation, spectralType: "M5.5V" },
};

const gStar: StarProfile = {
  ...catalogStar,
  id: "sun-analog",
  name: "Sun Analog",
  observation: { ...catalogStar.observation, spectralType: "G2V" },
};

const hotABStar: StarProfile = {
  ...catalogStar,
  id: "regulus",
  name: "Regulus",
  observation: { ...catalogStar.observation, spectralType: "B8IVn" },
};

test("Earth-size rocky planets resolve to a rocky or ocean-candidate visual class with populated terrain", () => {
  const recipe = deriveWorldRecipe(earthSizeRockyPlanet);

  if (recipe.renderer !== "rocky") throw new Error("Expected a rocky recipe.");
  expect(["rocky", "ocean_candidate"]).toContain(recipe.inferred.visualClass);
  expect(recipe.derived.bulkDensityGCm3).not.toBeNull();
  expect(recipe.terrain.oceanCoverage).toBe(recipe.surface.waterLevel);
  expect(recipe.terrain.cloudCoverage).toBe(recipe.surface.cloudCover);
});

test("massive super-Earths derive a bulk density from measured mass and radius", () => {
  const recipe = deriveWorldRecipe(massiveSuperEarthPlanet);

  if (recipe.renderer !== "rocky") throw new Error("Expected a rocky recipe.");
  expect(recipe.derived.bulkDensityGCm3).not.toBeNull();
  expect(recipe.derived.bulkDensityGCm3 ?? 0).toBeGreaterThan(0);
  expect(recipe.derived.radiusEarthEffective).toBeCloseTo(1.8);
});

test("small hot rocky worlds under extreme irradiation infer a lava visual class", () => {
  const recipe = deriveWorldRecipe(smallHotRockyPlanet);

  if (recipe.renderer !== "rocky") throw new Error("Expected a rocky recipe.");
  expect(recipe.inferred.visualClass).toBe("lava");
  expect(recipe.inferred.volcanicLikelihood).toBeGreaterThan(0.5);
  expect(recipe.terrain.lavaCoverage).toBeGreaterThan(0);
  expect(recipe.terrain.oceanCoverage).toBe(0);
});

test("cold rocky worlds infer an ice visual class with high ice likelihood", () => {
  const recipe = deriveWorldRecipe(coldRockyPlanet);

  if (recipe.renderer !== "rocky") throw new Error("Expected a rocky recipe.");
  expect(recipe.inferred.visualClass).toBe("ice");
  expect(recipe.inferred.iceLikelihood).toBeGreaterThan(0.6);
  expect(recipe.inferred.paletteFamily).toBe("ice-blue");
  expect(recipe.terrain.iceCoverage).toBeGreaterThan(0);
});

test("Jupiter-size giants resolve to the gas_giant visual class", () => {
  const recipe = deriveWorldRecipe(jupiterSizeGiantPlanet);

  if (recipe.renderer !== "gas-giant") throw new Error("Expected a gas-giant recipe.");
  expect(recipe.inferred.visualClass).toBe("gas_giant");
  expect(recipe.bandDetail.bandCount).toBeGreaterThan(0);
  expect(recipe.bandDetail.stormCount).toBeGreaterThanOrEqual(1);
});

test("low-density giants still resolve to a giant visual class from their catalog kind", () => {
  const recipe = deriveWorldRecipe(lowDensityGiantPlanet);

  if (recipe.renderer !== "gas-giant") throw new Error("Expected a gas-giant recipe.");
  expect(["gas_giant", "hot_gas_giant"]).toContain(recipe.inferred.visualClass);
  expect(recipe.bandDetail.atmosphereDepth).toBeGreaterThan(0);
});

test("Neptune-size worlds resolve to the ice_giant visual class", () => {
  const recipe = deriveWorldRecipe(neptuneSizeWorld);

  if (recipe.renderer !== "ice-giant") throw new Error("Expected an ice-giant recipe.");
  expect(recipe.inferred.visualClass).toBe("ice_giant");
  expect(recipe.bandDetail.paletteFamily).toMatch(/methane-blue|cyan-ice/);
});

test("hot Jupiters infer the hot_gas_giant visual class with reduced ice likelihood", () => {
  const recipe = deriveWorldRecipe(hotJupiterPlanet);

  if (recipe.renderer !== "gas-giant") throw new Error("Expected a gas-giant recipe.");
  expect(recipe.inferred.visualClass).toBe("hot_gas_giant");
  expect(recipe.inferred.paletteFamily).toBe("hot-dark-red");
  expect(recipe.inferred.iceLikelihood).toBeLessThan(0.3);
});

const ultraHotJupiterPlanet: ExoplanetProfile = {
  ...featuredPlanet,
  id: "ultra-hot-jupiter",
  name: "Ultra-hot Jupiter",
  kind: "gas-giant",
  observation: {
    ...featuredPlanet.observation,
    radiusJupiter: 1.7,
    massJupiter: 1.2,
    equilibriumTemperatureKelvin: 2_400,
    semiMajorAxisAu: 0.02,
  },
};

const temperateGasGiantPlanet: ExoplanetProfile = {
  ...featuredPlanet,
  id: "temperate-gas-giant",
  name: "Temperate Gas Giant",
  kind: "gas-giant",
  observation: {
    ...featuredPlanet.observation,
    radiusJupiter: 1.0,
    massJupiter: 0.9,
    equilibriumTemperatureKelvin: 500,
  },
};

test("ultra-hot Jupiters infer the ultrahot-red-brown palette family, distinct from a hot Jupiter's", () => {
  const ultraHotRecipe = deriveWorldRecipe(ultraHotJupiterPlanet);
  const hotRecipe = deriveWorldRecipe(hotJupiterPlanet);
  if (ultraHotRecipe.renderer !== "gas-giant" || hotRecipe.renderer !== "gas-giant") {
    throw new Error("Expected gas-giant recipes.");
  }

  expect(ultraHotRecipe.classification).toBe("Ultra-hot Jupiter");
  expect(ultraHotRecipe.inferred.paletteFamily).toBe("ultrahot-red-brown");
  expect(ultraHotRecipe.cloudBands.deepColor).not.toEqual(hotRecipe.cloudBands.deepColor);
});

test("gas-giant bandDetail exposes the full recipe-control surface the shader consumes", () => {
  for (const planet of [jupiterSizeGiantPlanet, hotJupiterPlanet, ultraHotJupiterPlanet]) {
    const recipe = deriveWorldRecipe(planet);
    if (recipe.renderer !== "gas-giant") throw new Error("Expected a gas-giant recipe.");

    expect(recipe.bandDetail.stormCount).toBeGreaterThanOrEqual(1);
    expect(recipe.bandDetail.stormCount).toBeLessThanOrEqual(3);
    for (const value of [
      recipe.bandDetail.bandSharpness,
      recipe.bandDetail.bandWarp,
      recipe.bandDetail.zonalVariation,
      recipe.bandDetail.stormColorShift,
    ]) {
      expect(Number.isFinite(value)).toBe(true);
      expect(value).toBeGreaterThanOrEqual(0);
    }
    expect(recipe.bandDetail.stormColorShift).toBeLessThanOrEqual(1);
  }
});

test("ice-giant bandDetail exposes the full recipe-control surface the shader consumes", () => {
  for (const planet of [iceGiantPlanet, neptuneSizeWorld]) {
    const recipe = deriveWorldRecipe(planet);
    if (recipe.renderer !== "ice-giant") throw new Error("Expected an ice-giant recipe.");

    expect(recipe.bandDetail.stormCount).toBeGreaterThanOrEqual(1);
    expect(recipe.bandDetail.stormCount).toBeLessThanOrEqual(2);
    for (const value of [
      recipe.bandDetail.bandSharpness,
      recipe.bandDetail.bandWarp,
      recipe.bandDetail.zonalVariation,
      recipe.bandDetail.stormColorShift,
    ]) {
      expect(Number.isFinite(value)).toBe(true);
      expect(value).toBeGreaterThanOrEqual(0);
    }
  }
});

test("a gallery of seeded giants is deterministic and visually distinct across families", () => {
  const gallery = [
    jupiterSizeGiantPlanet, // cold gas giant
    temperateGasGiantPlanet, // temperate gas giant
    hotJupiterPlanet, // hot gas giant
    ultraHotJupiterPlanet, // ultra-hot gas giant
    iceGiantPlanet, // warm-leaning ice giant
    neptuneSizeWorld, // cold ice giant
  ];

  const recipes = gallery.map((planet) => deriveWorldRecipe(planet));

  // Stable: deriving the same fixed-seed planet twice reproduces an identical recipe.
  for (const [index, planet] of gallery.entries()) {
    expect(deriveWorldRecipe(planet)).toEqual(recipes[index]);
  }

  // Distinct: no two giants in the gallery render with the same deep/light color pair, so the
  // gallery does not silently collapse onto one shared look.
  const colorSignatures = recipes.map((recipe) =>
    recipe.renderer === "gas-giant"
      ? JSON.stringify([recipe.cloudBands.deepColor, recipe.cloudBands.lightColor])
      : recipe.renderer === "ice-giant"
        ? JSON.stringify([recipe.atmosphereBands.deepColor, recipe.atmosphereBands.lightColor])
        : JSON.stringify(recipe.surface.lowColor),
  );
  expect(new Set(colorSignatures).size).toBe(colorSignatures.length);
});

test("unknown/incomplete objects fall back to conservative low-confidence defaults, never NaN", () => {
  const recipe = deriveWorldRecipe(unknownIncompletePlanet);

  expect(recipe.confidence).toBe("low");
  expect(recipe.inferred.confidence).toBe("low");
  if (recipe.renderer === "rocky") {
    expect(recipe.inferred.visualClass).toBe("unknown");
  }
  for (const value of [
    recipe.derived.radiusEarthEffective,
    recipe.derived.massEarthEffective,
    recipe.radiusSceneUnits,
    recipe.star.intensity,
  ]) {
    expect(Number.isFinite(value)).toBe(true);
  }
  expect(recipe.derived.bulkDensityGCm3).toBeNull();
  expect(recipe.derived.insolationEarthRelative).toBeNull();
});

test("M dwarf stars resolve to a red, cooler star recipe with a small apparent size", () => {
  const recipe = deriveStarRecipe(mDwarfStar);

  expect(recipe.spectralClassification.startsWith("M")).toBe(true);
  expect(recipe.temperatureKelvin).toBeLessThan(4_000);
  expect(recipe.label).toBe("Red star");
});

test("G stars resolve to a sun-like yellow star recipe", () => {
  const recipe = deriveStarRecipe(gStar);

  expect(recipe.spectralClassification.startsWith("G")).toBe(true);
  expect(recipe.temperatureKelvin).toBeGreaterThan(5_000);
  expect(recipe.temperatureKelvin).toBeLessThan(6_500);
  expect(recipe.label).toBe("Yellow star");
});

test("A/B hot stars resolve to a blue-white star recipe with weaker granulation than an M dwarf", () => {
  const hotRecipe = deriveStarRecipe(hotABStar);
  const coolRecipe = deriveStarRecipe(mDwarfStar);

  expect(hotRecipe.spectralClassification.startsWith("B")).toBe(true);
  expect(hotRecipe.temperatureKelvin).toBeGreaterThan(10_000);
  expect(hotRecipe.granulationStrength).toBeLessThan(coolRecipe.granulationStrength);
});

test("star recipe GENERATED fields stay within their documented [0, 1] or positive ranges", () => {
  for (const star of [mDwarfStar, gStar, hotABStar, catalogStar]) {
    const recipe = deriveStarRecipe(star);

    expect(recipe.spotCoverage).toBeGreaterThanOrEqual(0);
    expect(recipe.spotCoverage).toBeLessThanOrEqual(1);
    expect(recipe.granulationStrength).toBeGreaterThanOrEqual(0);
    expect(recipe.granulationStrength).toBeLessThanOrEqual(1);
    expect(recipe.coronalIntensity).toBeGreaterThanOrEqual(0);
    expect(recipe.coronalIntensity).toBeLessThanOrEqual(1);
    expect(recipe.granulationScale).toBeGreaterThan(0);
    expect(recipe.rotationFactor).toBeGreaterThanOrEqual(0);
    expect(recipe.rotationFactor).toBeLessThanOrEqual(1);
  }
});

test("derivePlanetDerivedProperties only reports a density when both mass and radius are measured", () => {
  const measuredBoth = derivePlanetMeasuredProperties(earthSizeRockyPlanet);
  const measuredRadiusOnly = derivePlanetMeasuredProperties({
    ...earthSizeRockyPlanet,
    observation: { ...earthSizeRockyPlanet.observation, massEarth: null },
  });

  expect(derivePlanetDerivedProperties(measuredBoth).bulkDensityGCm3).toBeCloseTo(5.51, 1);
  expect(derivePlanetDerivedProperties(measuredRadiusOnly).bulkDensityGCm3).toBeNull();
});

test("derivePlanetInferredProperties never claims high confidence with no measured inputs", () => {
  const measured = derivePlanetMeasuredProperties(unknownIncompletePlanet);
  const derived = derivePlanetDerivedProperties(measured);
  const inferred = derivePlanetInferredProperties(
    unknownIncompletePlanet,
    measured,
    derived,
    () => 0.5,
  );

  expect(inferred.confidence).toBe("low");
  expect(inferred.visualClass).toBe("unknown");
});
