import type { ExoplanetProfile } from "@exora/contracts";

export type Rgb = readonly [red: number, green: number, blue: number];

interface BaseWorldRecipe {
  atmosphere: {
    color: Rgb;
    label: string;
  };
  classification: string;
  confidence: "low" | "medium" | "high";
  moon: {
    orbitRadius: number;
    radius: number;
    speed: number;
  };
  radiusSceneUnits: number;
  rotationSpeed: number;
  seed: number;
  summary: string;
}

export interface GasGiantWorldRecipe extends BaseWorldRecipe {
  cloudBands: {
    contrast: number;
    deepColor: Rgb;
    lightColor: Rgb;
    midColor: Rgb;
    speed: number;
    turbulence: number;
  };
  renderer: "gas-giant";
}

export interface RockyWorldRecipe extends BaseWorldRecipe {
  renderer: "rocky";
  surface: {
    craterDensity: number;
    elevation: number;
    highColor: Rgb;
    lowColor: Rgb;
    midColor: Rgb;
    roughness: number;
    waterColor: Rgb;
    waterLevel: number;
  };
}

export type WorldRecipe = GasGiantWorldRecipe | RockyWorldRecipe;

const hashString = (value: string): number => {
  let hash = 2166136261;

  for (const character of value) {
    hash ^= character.charCodeAt(0);
    hash = Math.imul(hash, 16777619);
  }

  return hash >>> 0;
};

const createRandom = (seed: number): (() => number) => {
  let state = seed;

  return () => {
    state += 0x6d2b79f5;
    let value = state;
    value = Math.imul(value ^ (value >>> 15), value | 1);
    value ^= value + Math.imul(value ^ (value >>> 7), value | 61);
    return ((value ^ (value >>> 14)) >>> 0) / 4294967296;
  };
};

const hotGasGiantPalette = {
  deepColor: [0.16, 0.025, 0.025] as const,
  midColor: [0.78, 0.2, 0.07] as const,
  lightColor: [1, 0.68, 0.28] as const,
  atmosphere: [1, 0.28, 0.08] as const,
};

const temperateGasGiantPalette = {
  deepColor: [0.07, 0.1, 0.16] as const,
  midColor: [0.46, 0.32, 0.2] as const,
  lightColor: [0.93, 0.8, 0.54] as const,
  atmosphere: [0.38, 0.66, 1] as const,
};

const deriveGasGiantRecipe = (
  planet: ExoplanetProfile,
  seed: number,
  random: () => number,
): GasGiantWorldRecipe => {
  const equilibriumTemperature = planet.observation.equilibriumTemperatureKelvin ?? 0;
  const radiusJupiter =
    planet.observation.radiusJupiter ??
    (planet.observation.radiusEarth !== null ? planet.observation.radiusEarth / 11.209 : 1);
  const isHot = equilibriumTemperature >= 1_000;
  const palette = isHot ? hotGasGiantPalette : temperateGasGiantPalette;
  const scaledRadius = 3.8 + Math.min(radiusJupiter, 2) * 0.45;

  return {
    seed,
    renderer: "gas-giant",
    classification: isHot ? "Young super-Jupiter" : "Gas giant",
    confidence: "medium",
    radiusSceneUnits: scaledRadius,
    rotationSpeed: 0.022 + random() * 0.01,
    cloudBands: {
      ...palette,
      speed: 0.022 + random() * 0.018,
      turbulence: 1.8 + random() * 1.4,
      contrast: 0.62 + random() * 0.16,
    },
    atmosphere: {
      color: palette.atmosphere,
      label: "Hydrogen / helium · inferred",
    },
    moon: {
      radius: scaledRadius * (0.075 + random() * 0.025),
      orbitRadius: scaledRadius * (1.7 + random() * 0.2),
      speed: 0.055 + random() * 0.02,
    },
    summary:
      "A giant world rendered with turbulent cloud bands and a deep thermal glow derived from its measured scale and temperature.",
  };
};

const deriveRockyRecipe = (
  planet: ExoplanetProfile,
  seed: number,
  random: () => number,
): RockyWorldRecipe => {
  const temperature = planet.observation.equilibriumTemperatureKelvin;
  const radiusEarth = planet.observation.radiusEarth ?? 1;
  const scaledRadius = 3.25 + Math.min(Math.max(radiusEarth, 0.3), 2) * 0.34;
  const isScorched = temperature !== null && temperature > 500;
  const isTemperate = temperature !== null && temperature >= 180 && temperature <= 330;
  const isFrozen = temperature !== null && temperature < 180;

  const palette = isScorched
    ? {
        lowColor: [0.12, 0.025, 0.012] as const,
        midColor: [0.52, 0.12, 0.035] as const,
        highColor: [0.93, 0.47, 0.13] as const,
        waterColor: [0.2, 0.035, 0.018] as const,
        atmosphere: [1, 0.28, 0.08] as const,
      }
    : isFrozen
      ? {
          lowColor: [0.055, 0.095, 0.13] as const,
          midColor: [0.36, 0.5, 0.57] as const,
          highColor: [0.83, 0.92, 0.94] as const,
          waterColor: [0.025, 0.09, 0.15] as const,
          atmosphere: [0.35, 0.7, 1] as const,
        }
      : isTemperate
        ? {
            lowColor: [0.08, 0.16, 0.07] as const,
            midColor: [0.38, 0.3, 0.16] as const,
            highColor: [0.72, 0.67, 0.54] as const,
            waterColor: [0.015, 0.13, 0.24] as const,
            atmosphere: [0.22, 0.62, 1] as const,
          }
        : {
            lowColor: [0.09, 0.075, 0.07] as const,
            midColor: [0.34, 0.26, 0.2] as const,
            highColor: [0.67, 0.58, 0.48] as const,
            waterColor: [0.035, 0.06, 0.075] as const,
            atmosphere: [0.42, 0.5, 0.58] as const,
          };

  const classification = isScorched
    ? "Scorched rocky world"
    : isFrozen
      ? "Frozen rocky world"
      : isTemperate
        ? "Temperate rocky world"
        : "Rocky world";

  return {
    seed,
    renderer: "rocky",
    classification,
    confidence: temperature === null ? "low" : "medium",
    radiusSceneUnits: scaledRadius,
    rotationSpeed: 0.014 + random() * 0.012,
    atmosphere: {
      color: palette.atmosphere,
      label: isScorched
        ? "Mineral vapor · inferred"
        : isTemperate
          ? "Secondary atmosphere · inferred"
          : "Thin volatiles · inferred",
    },
    surface: {
      ...palette,
      elevation: 0.13 + random() * 0.12,
      roughness: 2.1 + random() * 1.4,
      craterDensity: 0.38 + random() * 0.34,
      waterLevel: isTemperate ? 0.4 + random() * 0.08 : 0,
    },
    moon: {
      radius: scaledRadius * (0.055 + random() * 0.025),
      orbitRadius: scaledRadius * (1.72 + random() * 0.22),
      speed: 0.045 + random() * 0.024,
    },
    summary: isTemperate
      ? "A speculative temperate surface with fractured highlands and low basins, generated from the planet's measured radius and thermal regime."
      : "A rugged mineral surface with procedurally displaced highlands and impact-worn basins, shaped by the planet's measured scale and temperature.",
  };
};

export const deriveWorldRecipe = (planet: ExoplanetProfile): WorldRecipe => {
  const seed = hashString(planet.id);
  const random = createRandom(seed);

  return planet.kind === "rocky"
    ? deriveRockyRecipe(planet, seed, random)
    : deriveGasGiantRecipe(planet, seed, random);
};
