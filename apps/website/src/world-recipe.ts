import type { ExoplanetProfile } from "./planet-profile.ts";

export type Rgb = readonly [red: number, green: number, blue: number];

export interface WorldRecipe {
  atmosphere: {
    color: Rgb;
    label: string;
  };
  classification: string;
  cloudBands: {
    contrast: number;
    deepColor: Rgb;
    lightColor: Rgb;
    midColor: Rgb;
    speed: number;
    turbulence: number;
  };
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

export const deriveWorldRecipe = (planet: ExoplanetProfile): WorldRecipe => {
  const seed = hashString(planet.id);
  const random = createRandom(seed);
  const isHot = planet.observation.equilibriumTemperatureKelvin >= 1_000;
  const palette = isHot ? hotGasGiantPalette : temperateGasGiantPalette;
  const scaledRadius = 3.8 + Math.min(planet.observation.radiusJupiter, 2) * 0.45;

  return {
    seed,
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
      "A young, self-luminous giant rendered with turbulent silicate-cloud bands and a deep thermal glow.",
  };
};
