import type { ExoplanetProfile } from "@exora/contracts";

export type Rgb = readonly [red: number, green: number, blue: number];

interface BaseWorldRecipe {
  axialTilt: number;
  atmosphere: {
    color: Rgb;
    label: string;
  };
  classification: string;
  confidence: "low" | "medium" | "high";
  moon: {
    color: Rgb;
    inclination: number;
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
    jetCount: number;
    lightColor: Rgb;
    midColor: Rgb;
    speed: number;
    stormColor: Rgb;
    stormLatitude: number;
    stormScale: number;
    stormStrength: number;
    turbulence: number;
  };
  renderer: "gas-giant";
  rings: {
    color: Rgb;
    opacity: number;
    outerRadius: number;
  } | null;
}

export interface IceGiantWorldRecipe extends BaseWorldRecipe {
  atmosphereBands: {
    bandScale: number;
    deepColor: Rgb;
    hazeColor: Rgb;
    lightColor: Rgb;
    polarGlow: number;
    speed: number;
    stormLatitude: number;
    stormStrength: number;
  };
  renderer: "ice-giant";
  rings: {
    color: Rgb;
    opacity: number;
    outerRadius: number;
  };
}

export interface RockyWorldRecipe extends BaseWorldRecipe {
  renderer: "rocky";
  surface: {
    cloudColor: Rgb;
    cloudCover: number;
    cloudSpeed: number;
    craterDensity: number;
    elevation: number;
    emissiveColor: Rgb;
    highColor: Rgb;
    iceCapStrength: number;
    lavaStrength: number;
    lowColor: Rgb;
    midColor: Rgb;
    roughness: number;
    waterColor: Rgb;
    waterLevel: number;
  };
}

export type WorldRecipe = GasGiantWorldRecipe | IceGiantWorldRecipe | RockyWorldRecipe;

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

const coldGasGiantPalette = {
  deepColor: [0.025, 0.045, 0.09] as const,
  midColor: [0.2, 0.31, 0.45] as const,
  lightColor: [0.68, 0.78, 0.83] as const,
  atmosphere: [0.28, 0.56, 0.9] as const,
};

const ultraHotGasGiantPalette = {
  deepColor: [0.075, 0.008, 0.025] as const,
  midColor: [0.62, 0.055, 0.075] as const,
  lightColor: [1, 0.82, 0.42] as const,
  atmosphere: [1, 0.16, 0.12] as const,
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
  const massJupiter = planet.observation.massJupiter ?? 0;
  const isUltraHot = equilibriumTemperature >= 1_800;
  const isHot = equilibriumTemperature >= 1_000;
  const isCold = equilibriumTemperature > 0 && equilibriumTemperature < 220;
  const palette = isUltraHot
    ? ultraHotGasGiantPalette
    : isHot
      ? hotGasGiantPalette
      : isCold
        ? coldGasGiantPalette
        : temperateGasGiantPalette;
  const scaledRadius = 3.8 + Math.min(radiusJupiter, 2) * 0.45;
  const hasProminentRings = random() > 0.62;
  const stormHue = random();

  return {
    seed,
    renderer: "gas-giant",
    classification: isUltraHot
      ? "Ultra-hot Jupiter"
      : isHot && massJupiter >= 5
        ? "Young super-Jupiter"
        : isHot
          ? "Hot Jupiter"
          : isCold
            ? "Cold gas giant"
            : "Gas giant",
    confidence: "medium",
    radiusSceneUnits: scaledRadius,
    rotationSpeed: 0.022 + random() * 0.01,
    axialTilt: -0.16 + random() * 0.32,
    cloudBands: {
      ...palette,
      speed: 0.022 + random() * 0.018,
      turbulence: 1.8 + random() * 1.4,
      contrast: 0.62 + random() * 0.16,
      jetCount: 13 + Math.floor(random() * 12),
      stormLatitude: -0.48 + random() * 0.96,
      stormScale: 3.2 + random() * 3.8,
      stormStrength: 0.32 + random() * 0.58,
      stormColor: isUltraHot
        ? [1, 0.44 + stormHue * 0.18, 0.12]
        : isCold
          ? [0.68, 0.84, 0.95]
          : [0.92, 0.66 + stormHue * 0.16, 0.4],
    },
    atmosphere: {
      color: palette.atmosphere,
      label: "Hydrogen / helium · inferred",
    },
    moon: {
      radius: scaledRadius * (0.075 + random() * 0.025),
      orbitRadius: scaledRadius * (1.7 + random() * 0.2),
      speed: 0.055 + random() * 0.02,
      inclination: -0.22 + random() * 0.44,
      color: isHot ? [0.29, 0.19, 0.14] : [0.22, 0.25, 0.29],
    },
    rings: hasProminentRings
      ? {
          color: isHot ? [0.66, 0.35, 0.19] : [0.42, 0.52, 0.62],
          opacity: 0.12 + random() * 0.12,
          outerRadius: scaledRadius * (1.42 + random() * 0.24),
        }
      : null,
    summary: hasProminentRings
      ? "A giant world with animated jet bands, a long-lived storm vortex, and a sparse ring system inferred from its measured scale and thermal regime."
      : "A giant world with animated jet bands and a long-lived storm vortex, colored by its measured scale and thermal regime.",
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
    axialTilt: -0.34 + random() * 0.68,
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
      lavaStrength: isScorched ? 0.5 + random() * 0.42 : 0,
      emissiveColor: isScorched ? [1, 0.16, 0.015] : [0, 0, 0],
      iceCapStrength: isFrozen ? 0.86 : isTemperate ? 0.28 + random() * 0.2 : 0,
      cloudCover: isTemperate ? 0.3 + random() * 0.34 : isFrozen ? 0.12 + random() * 0.16 : 0,
      cloudSpeed: 0.016 + random() * 0.016,
      cloudColor: isFrozen ? [0.58, 0.75, 0.86] : [0.84, 0.9, 0.94],
    },
    moon: {
      radius: scaledRadius * (0.055 + random() * 0.025),
      orbitRadius: scaledRadius * (1.72 + random() * 0.22),
      speed: 0.045 + random() * 0.024,
      inclination: -0.34 + random() * 0.68,
      color: isFrozen ? [0.32, 0.38, 0.42] : [0.24, 0.22, 0.2],
    },
    summary: isTemperate
      ? "A speculative temperate world with ocean basins, drifting cloud systems, highland terrain, and polar ice generated from its measured scale and temperature."
      : isScorched
        ? "An intensely heated mineral world with glowing fracture networks, dark impact basins, and a thin vapor haze generated from its measured thermal regime."
        : "A frozen rocky world with broad polar ice, weathered highlands, impact basins, and sparse drifting cloud systems.",
  };
};

const deriveIceGiantRecipe = (
  planet: ExoplanetProfile,
  seed: number,
  random: () => number,
): IceGiantWorldRecipe => {
  const temperature = planet.observation.equilibriumTemperatureKelvin;
  const radiusEarth = planet.observation.radiusEarth ?? 4;
  const scaledRadius = 3.55 + Math.min(Math.max(radiusEarth, 2), 6) * 0.11;
  const isWarm = temperature !== null && temperature >= 700;
  const palette = isWarm
    ? {
        deepColor: [0.025, 0.17, 0.25] as const,
        hazeColor: [0.08, 0.54, 0.64] as const,
        lightColor: [0.48, 0.88, 0.86] as const,
        atmosphere: [0.16, 0.82, 0.92] as const,
      }
    : {
        deepColor: [0.018, 0.055, 0.2] as const,
        hazeColor: [0.09, 0.28, 0.68] as const,
        lightColor: [0.42, 0.68, 1] as const,
        atmosphere: [0.16, 0.48, 1] as const,
      };

  return {
    seed,
    renderer: "ice-giant",
    classification: isWarm ? "Warm Neptune" : "Ice giant",
    confidence: temperature === null ? "low" : "medium",
    radiusSceneUnits: scaledRadius,
    rotationSpeed: 0.024 + random() * 0.016,
    axialTilt: -0.46 + random() * 0.92,
    atmosphere: {
      color: palette.atmosphere,
      label: "Hydrogen / helium / methane · inferred",
    },
    atmosphereBands: {
      ...palette,
      speed: 0.018 + random() * 0.015,
      bandScale: 9 + random() * 5,
      stormStrength: 0.32 + random() * 0.28,
      stormLatitude: -0.5 + random(),
      polarGlow: 0.2 + random() * 0.46,
    },
    rings: {
      color: isWarm ? [0.28, 0.55, 0.58] : [0.3, 0.45, 0.72],
      opacity: 0.1 + random() * 0.12,
      outerRadius: scaledRadius * (1.35 + random() * 0.12),
    },
    moon: {
      radius: scaledRadius * (0.045 + random() * 0.025),
      orbitRadius: scaledRadius * (1.7 + random() * 0.24),
      speed: 0.04 + random() * 0.025,
      inclination: -0.42 + random() * 0.84,
      color: isWarm ? [0.2, 0.29, 0.3] : [0.2, 0.24, 0.32],
    },
    summary:
      "A deep volatile-rich atmosphere rendered with methane-tinted haze, subdued cloud bands, and a faint debris ring inferred from its measured scale and temperature.",
  };
};

export const deriveWorldRecipe = (planet: ExoplanetProfile): WorldRecipe => {
  const seed = hashString(planet.id);
  const random = createRandom(seed);

  if (planet.kind === "rocky") return deriveRockyRecipe(planet, seed, random);
  if (planet.kind === "ice-giant") return deriveIceGiantRecipe(planet, seed, random);
  return deriveGasGiantRecipe(planet, seed, random);
};
