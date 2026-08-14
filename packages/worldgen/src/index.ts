import type { ExoplanetProfile, StarKind, StarProfile } from "@exora/contracts";

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
  star: {
    apparentRadiusRadians: number;
    color: Rgb;
    intensity: number;
    radiusSceneUnits: number;
  };
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

export interface CustomPlanetParameters {
  activity: number;
  atmosphere: number;
  axialTilt: number;
  baseColor: Rgb;
  kind: Exclude<ExoplanetProfile["kind"], "unknown">;
  name: string;
  radius: number;
  rings: boolean;
  rotation: number;
  seed: number;
  temperatureKelvin: number;
  water: number;
}

export interface CustomWorld {
  planet: ExoplanetProfile;
  recipe: WorldRecipe;
}

export interface CustomStarParameters {
  activity: number;
  kind: StarKind;
  name: string;
  radius: number;
  rotation: number;
  seed: number;
  temperatureKelvin: number;
}

export interface CustomStar {
  star: StarProfile;
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

const clamp = (value: number, minimum: number, maximum: number): number =>
  Math.min(maximum, Math.max(minimum, value));

/** Approximate a black-body color from NASA's stellar effective temperature. */
const temperatureToRgb = (temperatureKelvin: number): Rgb => {
  const temperature = clamp(temperatureKelvin, 1_000, 40_000) / 100;
  const red = temperature <= 66 ? 255 : 329.698727446 * (temperature - 60) ** -0.1332047592;
  const green =
    temperature <= 66
      ? 99.4708025861 * Math.log(temperature) - 161.1195681661
      : 288.1221695283 * (temperature - 60) ** -0.0755148492;
  const blue =
    temperature >= 66
      ? 255
      : temperature <= 19
        ? 0
        : 138.5177312231 * Math.log(temperature - 10) - 305.0447927307;

  return [clamp(red, 0, 255) / 255, clamp(green, 0, 255) / 255, clamp(blue, 0, 255) / 255];
};

export const deriveHostStar = (planet: ExoplanetProfile): BaseWorldRecipe["star"] => {
  const massSolar = Math.max(0.08, planet.observation.hostMassSolar ?? 1);
  const radiusSolar = Math.max(0.08, planet.observation.hostRadiusSolar ?? massSolar ** 0.8);
  const luminositySolar =
    planet.observation.hostLuminosityLogSolar === null
      ? massSolar ** 3.5
      : 10 ** planet.observation.hostLuminosityLogSolar;
  const temperatureKelvin =
    planet.observation.hostTemperatureKelvin ??
    5_772 * (luminositySolar / radiusSolar ** 2) ** 0.25;
  const orbitalDistanceAu = planet.observation.semiMajorAxisAu;
  const physicalAngularRadius =
    orbitalDistanceAu !== null && orbitalDistanceAu > 0
      ? Math.asin(clamp((radiusSolar * 0.00465047) / orbitalDistanceAu, 0, 0.95))
      : 0.00465047 * Math.sqrt(radiusSolar);

  return {
    color: temperatureToRgb(temperatureKelvin),
    radiusSceneUnits: clamp(1.5 + Math.log2(radiusSolar + 0.5) * 1.1, 1.1, 5.5),
    intensity: clamp(1.45 + Math.log10(Math.max(0.001, luminositySolar)) * 0.34, 0.65, 3.2),
    // Preserve the relative apparent sizes while keeping ordinary stars legible in the terrain sky.
    apparentRadiusRadians: clamp(physicalAngularRadius * 2.4, 0.012, 0.09),
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
    star: deriveHostStar(planet),
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
    star: deriveHostStar(planet),
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
    star: deriveHostStar(planet),
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

const clampUnit = (value: number): number => Math.min(1, Math.max(0, value));

const temperatureToSpectralClass = (temperatureKelvin: number): string => {
  if (temperatureKelvin >= 30_000) return "O";
  if (temperatureKelvin >= 10_000) return "B";
  if (temperatureKelvin >= 7_500) return "A";
  if (temperatureKelvin >= 6_000) return "F";
  if (temperatureKelvin >= 5_200) return "G";
  if (temperatureKelvin >= 3_700) return "K";
  return "M";
};

const luminosityClass = (kind: StarKind): string => {
  if (kind === "white-dwarf") return "D";
  if (kind === "neutron-star") return "NS";
  if (kind === "evolved") return "III";
  return "V";
};

const starKindDescription: Record<StarKind, string> = {
  binary: "Custom binary star",
  evolved: "Custom giant star",
  "main-sequence": "Custom main-sequence star",
  "neutron-star": "Custom neutron star",
  star: "Custom star",
  variable: "Custom variable star",
  "white-dwarf": "Custom white dwarf",
};

export const generateCustomStar = (parameters: CustomStarParameters): CustomStar => {
  const seed = Math.max(0, Math.trunc(parameters.seed));
  const temperatureKelvin = Math.round(
    Math.min(40_000, Math.max(2_000, parameters.temperatureKelvin)),
  );
  const spectralClass = temperatureToSpectralClass(temperatureKelvin);
  const name = parameters.name.trim() || "Untitled Star";
  return {
    star: {
      id: `custom-star-${seed}`,
      name,
      catalogName: `FORGE ${seed.toString().padStart(6, "0")}`,
      kind: parameters.kind,
      objectType: starKindDescription[parameters.kind],
      observation: {
        rightAscensionDegrees: null,
        declinationDegrees: null,
        parallaxMas: null,
        distanceParsecs: null,
        properMotionRaMasPerYear: null,
        properMotionDecMasPerYear: null,
        radialVelocityKmPerSecond: null,
        spectralType: `${spectralClass}${luminosityClass(parameters.kind)}`,
        visualMagnitude: null,
        gaiaMagnitude: null,
      },
      customization: {
        activity: clampUnit(parameters.activity),
        radius: clampUnit(parameters.radius),
        rotation: clampUnit(parameters.rotation),
        seed,
        temperatureKelvin,
      },
      source: {
        archive: "Exora Custom Generator",
        retrievedOn: new Date().toISOString().slice(0, 10),
        table: "procedural",
      },
    },
  };
};

const scaleColor = (color: Rgb, amount: number): Rgb =>
  color.map((channel) => clampUnit(channel * amount)) as unknown as Rgb;

const mixColor = (from: Rgb, to: Rgb, amount: number): Rgb =>
  from.map(
    (channel, index) => channel + (to[index] - channel) * clampUnit(amount),
  ) as unknown as Rgb;

export const generateCustomWorld = (parameters: CustomPlanetParameters): CustomWorld => {
  const radius = clampUnit(parameters.radius);
  const activity = clampUnit(parameters.activity);
  const atmosphere = clampUnit(parameters.atmosphere);
  const water = clampUnit(parameters.water);
  const seed = Math.max(0, Math.trunc(parameters.seed));
  const temperatureKelvin = Math.max(40, Math.round(parameters.temperatureKelvin));
  const radiusEarth =
    parameters.kind === "rocky"
      ? 0.45 + radius * 1.65
      : parameters.kind === "ice-giant"
        ? 2.1 + radius * 4.2
        : (0.72 + radius * 1.18) * 11.209;
  const massEarth =
    parameters.kind === "rocky"
      ? radiusEarth ** 3.1
      : parameters.kind === "ice-giant"
        ? 8 + radius * 35
        : (0.25 + radius * 9.75) * 317.83;
  const date = new Date().toISOString().slice(0, 10);
  const planet: ExoplanetProfile = {
    id: `custom-${parameters.kind}-${seed}`,
    name: parameters.name.trim() || "Untitled World",
    hostStar: "Custom star system",
    kind: parameters.kind,
    observation: {
      distanceParsecs: null,
      discoveryMethod: "Procedural synthesis",
      discoveryYear: null,
      equilibriumTemperatureKelvin: temperatureKelvin,
      hostSpectralType: "USER DEFINED",
      hostTemperatureKelvin: 5_772,
      hostRadiusSolar: 1,
      hostMassSolar: 1,
      hostLuminosityLogSolar: 0,
      massEarth,
      massJupiter: parameters.kind === "gas-giant" ? massEarth / 317.83 : null,
      orbitalPeriodDays: null,
      radiusEarth,
      radiusJupiter: parameters.kind === "gas-giant" ? radiusEarth / 11.209 : null,
      semiMajorAxisAu: null,
    },
    source: {
      archive: "Exora Custom Generator",
      retrievedOn: date,
      table: "procedural",
    },
  };

  const generated = deriveWorldRecipe(planet);
  const shared = {
    ...generated,
    axialTilt: ((parameters.axialTilt - 0.5) * Math.PI) / 2,
    rotationSpeed: 0.004 + clampUnit(parameters.rotation) * 0.062,
    atmosphere: {
      ...generated.atmosphere,
      color: mixColor(scaleColor(parameters.baseColor, 0.65), [0.72, 0.9, 1], atmosphere * 0.45),
      label: `User-defined atmosphere · ${Math.round(atmosphere * 100)}% density`,
    },
    confidence: "high" as const,
  };

  if (generated.renderer === "rocky") {
    const isHot = temperatureKelvin >= 650;
    const isCold = temperatureKelvin < 180;
    return {
      planet,
      recipe: {
        ...shared,
        renderer: "rocky",
        classification: "Custom rocky world",
        surface: {
          ...generated.surface,
          lowColor: scaleColor(parameters.baseColor, 0.2),
          midColor: scaleColor(parameters.baseColor, 0.72),
          highColor: mixColor(parameters.baseColor, [0.95, 0.92, 0.84], 0.52),
          elevation: 0.045 + activity * 0.3,
          roughness: 1.5 + activity * 3.6,
          craterDensity: 0.12 + activity * 0.82,
          waterLevel: isHot || water < 0.03 ? 0 : 0.22 + water * 0.32,
          waterColor: mixColor([0.005, 0.06, 0.16], parameters.baseColor, 0.12),
          cloudCover: atmosphere * (isHot ? 0.15 : 0.82),
          cloudSpeed: 0.008 + activity * 0.04,
          lavaStrength: isHot ? 0.2 + activity * 0.8 : 0,
          emissiveColor: isHot ? [1, 0.11, 0.008] : [0, 0, 0],
          iceCapStrength: isCold ? 0.45 + water * 0.55 : Math.max(0, water * 0.25 - 0.05),
        },
        summary:
          "A user-tuned rocky world synthesized from its chosen terrain, hydrology, atmosphere, temperature, rotation, and color parameters.",
      },
    };
  }

  if (generated.renderer === "ice-giant") {
    return {
      planet,
      recipe: {
        ...shared,
        renderer: "ice-giant",
        classification: "Custom ice giant",
        atmosphereBands: {
          ...generated.atmosphereBands,
          deepColor: scaleColor(parameters.baseColor, 0.18),
          hazeColor: scaleColor(parameters.baseColor, 0.75),
          lightColor: mixColor(parameters.baseColor, [0.88, 0.98, 1], 0.58),
          bandScale: 7 + activity * 13,
          stormStrength: activity,
          polarGlow: atmosphere * 0.75,
          speed: 0.008 + clampUnit(parameters.rotation) * 0.04,
        },
        rings: {
          ...generated.rings,
          color: mixColor(parameters.baseColor, [0.82, 0.9, 1], 0.42),
          opacity: parameters.rings ? 0.08 + atmosphere * 0.22 : 0,
        },
        summary:
          "A user-tuned volatile giant synthesized from its chosen haze, storm activity, rings, temperature, rotation, and color parameters.",
      },
    };
  }

  return {
    planet,
    recipe: {
      ...shared,
      renderer: "gas-giant",
      classification: "Custom gas giant",
      cloudBands: {
        ...generated.cloudBands,
        deepColor: scaleColor(parameters.baseColor, 0.16),
        midColor: scaleColor(parameters.baseColor, 0.72),
        lightColor: mixColor(parameters.baseColor, [1, 0.92, 0.75], 0.62),
        stormColor: mixColor(parameters.baseColor, [1, 0.72, 0.3], 0.68),
        contrast: 0.4 + atmosphere * 0.5,
        jetCount: 8 + Math.round(activity * 24),
        stormScale: 2.8 + activity * 5,
        stormStrength: activity,
        turbulence: 1.2 + activity * 3,
        speed: 0.01 + clampUnit(parameters.rotation) * 0.05,
      },
      rings: parameters.rings
        ? {
            color: mixColor(parameters.baseColor, [0.92, 0.78, 0.58], 0.5),
            opacity: 0.1 + atmosphere * 0.22,
            outerRadius: shared.radiusSceneUnits * (1.42 + radius * 0.25),
          }
        : null,
      summary:
        "A user-tuned gas giant synthesized from its chosen jet activity, storm strength, rings, temperature, rotation, and color parameters.",
    },
  };
};
