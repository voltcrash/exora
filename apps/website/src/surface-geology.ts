import type { Rgb, RockyPaletteFamily, RockyWorldRecipe, WorldRecipe } from "@exora/worldgen";
import { ICY_MOONS, MEASURED_GEOLOGY } from "./surface-geology-catalog.ts";
import type { ChemistryDetailFamily, SurfaceDetailFamily } from "./texture-cache.ts";

export type TerrainArchetype =
  | "impact-highlands"
  | "flood-basalt"
  | "dune-sea"
  | "yardang-badlands"
  | "canyon-rift"
  | "volcanic-shield"
  | "lava-fields"
  | "glacial-plain"
  | "fractured-ice"
  | "folded-mountains"
  | "coastal-shelf"
  | "salt-pan"
  | "regolith-plain";

export interface TerrainProvince {
  archetype: TerrainArchetype;
  weight: number;
}

export interface SurfaceDetailChoice {
  chemistry: ChemistryDetailFamily;
  chemistryScale: number;
  chemistryStrength: number;
  primary: SurfaceDetailFamily;
  primaryScale: number;
  secondary: SurfaceDetailFamily;
  secondaryScale: number;
}

export interface SurfaceGeology {
  medium: "cloud" | "rock";
  regolithColor: Rgb;
  bedrockColor: Rgb;
  boulderDensity: number;
  boulderScale: number;
  craterDensity: number;
  detail: SurfaceDetailChoice;
  featureScale: number;
  frostColor: Rgb;
  frostCoverage: number;
  hazeDensity: number;
  lavaColor: Rgb;
  lavaGlow: number;
  liquidLevel: number | null;
  liquidColor: Rgb;
  liquidShallowColor: Rgb;
  provenance: "inferred" | "measured";
  provinces: readonly TerrainProvince[];
  skyColor: Rgb;
  ramp: readonly [Rgb, Rgb, Rgb, Rgb, Rgb];
  regolithDepth: number;
  relief: number;
  seed: number;
  strataSpacing: number;
  strataStrength: number;
  windDirection: number;
  windStreaks: number;
}

export type MeasuredGeology = Partial<Omit<SurfaceGeology, "provenance" | "seed">>;

const rgb = (red: number, green: number, blue: number): Rgb => [red, green, blue];

const clamp01 = (value: number): number =>
  Number.isFinite(value) ? Math.min(1, Math.max(0, value)) : 0;

const mix = (from: Rgb, to: Rgb, amount: number): Rgb => {
  const t = clamp01(amount);
  return [
    from[0] + (to[0] - from[0]) * t,
    from[1] + (to[1] - from[1]) * t,
    from[2] + (to[2] - from[2]) * t,
  ];
};

const scale = (color: Rgb, amount: number): Rgb => [
  color[0] * amount,
  color[1] * amount,
  color[2] * amount,
];

const provinces = (
  ...entries: readonly (readonly [TerrainArchetype, number])[]
): readonly TerrainProvince[] => {
  const total = entries.reduce((sum, [, weight]) => sum + weight, 0);
  return total > 0
    ? entries.map(([archetype, weight]) => ({ archetype, weight: weight / total }))
    : [{ archetype: "regolith-plain", weight: 1 }];
};

const isRocky = (recipe: WorldRecipe): recipe is RockyWorldRecipe => recipe.renderer === "rocky";

const createSeededRandom = (seed: number): (() => number) => {
  let state = (seed || 1) >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let value = state;
    value = Math.imul(value ^ (value >>> 15), value | 1);
    value ^= value + Math.imul(value ^ (value >>> 7), value | 61);
    return ((value ^ (value >>> 14)) >>> 0) / 4_294_967_296;
  };
};

const inferProvinces = (recipe: RockyWorldRecipe, random: () => number): TerrainProvince[] => {
  const { surface, terrain } = recipe;
  const entries: [TerrainArchetype, number][] = [];
  const air = terrain.atmosphereDensity;
  const ice = surface.iceCapStrength;

  if (surface.lavaStrength > 0.25) {
    entries.push(["lava-fields", 0.3 + surface.lavaStrength * 0.34]);
    entries.push(["volcanic-shield", 0.18 + terrain.volcanicActivity * 0.22]);
    entries.push(["flood-basalt", 0.16 + random() * 0.14]);
  } else if (ice > 0.7) {
    entries.push(["glacial-plain", 0.34 + ice * 0.22]);
    entries.push(["fractured-ice", 0.2 + random() * 0.28]);
    if (surface.waterLevel > 0) entries.push(["coastal-shelf", 0.12 + random() * 0.1]);
    else entries.push(["impact-highlands", 0.1 + terrain.craterDensity * 0.18]);
  } else if (surface.waterLevel > 0) {
    entries.push(["coastal-shelf", 0.24 + surface.waterLevel * 0.24]);
    entries.push(["folded-mountains", 0.2 + terrain.mountainCoverage * 0.3]);
    entries.push(["regolith-plain", 0.14 + random() * 0.16]);
    if (random() > 0.55) entries.push(["canyon-rift", 0.1 + random() * 0.16]);
  } else if (air < 0.12) {
    entries.push(["impact-highlands", 0.4 + terrain.craterDensity * 0.28]);
    entries.push(["regolith-plain", 0.2 + random() * 0.18]);
    entries.push(["flood-basalt", 0.12 + random() * 0.18]);
  } else {
    entries.push(["dune-sea", 0.2 + air * 0.3]);
    entries.push(["yardang-badlands", 0.18 + terrain.erosionAmount * 0.3]);
    entries.push(["impact-highlands", 0.12 + terrain.craterDensity * 0.2 * (1 - air)]);
    if (random() > 0.6) entries.push(["salt-pan", 0.1 + random() * 0.14]);
  }

  const accents: TerrainArchetype[] = [
    "canyon-rift",
    "folded-mountains",
    "volcanic-shield",
    "yardang-badlands",
    "regolith-plain",
  ];
  const accent = accents[Math.floor(random() * accents.length)];
  if (accent && !entries.some(([archetype]) => archetype === accent)) {
    entries.push([accent, 0.08 + terrain.mountainHeight * 0.5]);
  }

  return [...provinces(...entries)];
};

const rampFromRecipe = (recipe: RockyWorldRecipe): SurfaceGeology["ramp"] => {
  const { highColor, lowColor, midColor } = recipe.surface;
  return [
    scale(lowColor, 0.62),
    mix(lowColor, midColor, 0.45),
    midColor,
    mix(midColor, highColor, 0.55),
    scale(highColor, 1.04),
  ];
};

const DETAIL_BY_PALETTE: Readonly<Record<string, SurfaceDetailChoice>> = {
  "basaltic-dark": {
    chemistry: "carbon",
    chemistryScale: 10,
    chemistryStrength: 0.32,
    primary: "basalt",
    primaryScale: 9,
    secondary: "regolith",
    secondaryScale: 14,
  },
  "carbon-dark": {
    chemistry: "carbon",
    chemistryScale: 11,
    chemistryStrength: 0.42,
    primary: "basalt",
    primaryScale: 8,
    secondary: "cracked",
    secondaryScale: 7,
  },
  "desert-tan": {
    chemistry: "oxidized",
    chemistryScale: 15,
    chemistryStrength: 0.28,
    primary: "regolith",
    primaryScale: 15,
    secondary: "granite",
    secondaryScale: 10,
  },
  "ice-blue": {
    chemistry: "ice",
    chemistryScale: 11,
    chemistryStrength: 0.3,
    primary: "ice",
    primaryScale: 10,
    secondary: "cracked",
    secondaryScale: 6,
  },
  "iron-rich": {
    chemistry: "oxidized",
    chemistryScale: 10,
    chemistryStrength: 0.34,
    primary: "granite",
    primaryScale: 9,
    secondary: "basalt",
    secondaryScale: 8,
  },
  "lava-black-red": {
    chemistry: "carbon",
    chemistryScale: 9,
    chemistryStrength: 0.4,
    primary: "basalt",
    primaryScale: 7,
    secondary: "cracked",
    secondaryScale: 5,
  },
  "oxidized-red": {
    chemistry: "oxidized",
    chemistryScale: 13,
    chemistryStrength: 0.36,
    primary: "regolith",
    primaryScale: 14,
    secondary: "basalt",
    secondaryScale: 8,
  },
  "silicate-neutral": {
    chemistry: "silicate",
    chemistryScale: 12,
    chemistryStrength: 0.28,
    primary: "granite",
    primaryScale: 10,
    secondary: "regolith",
    secondaryScale: 15,
  },
  "sulfuric-yellow": {
    chemistry: "sulfuric",
    chemistryScale: 10,
    chemistryStrength: 0.44,
    primary: "basalt",
    primaryScale: 8,
    secondary: "cracked",
    secondaryScale: 6,
  },
};

export const cloudDeckGeology = (recipe: WorldRecipe): SurfaceGeology | null => {
  const bands =
    recipe.renderer === "gas-giant"
      ? {
          deep: recipe.cloudBands.deepColor,
          light: recipe.cloudBands.lightColor,
          mid: recipe.cloudBands.midColor,
        }
      : recipe.renderer === "ice-giant"
        ? {
            deep: recipe.atmosphereBands.deepColor,
            light: recipe.atmosphereBands.lightColor,
            mid: recipe.atmosphereBands.hazeColor,
          }
        : null;
  if (!bands) return null;

  return {
    medium: "cloud",
    provinces: provinces(["dune-sea", 0.56], ["glacial-plain", 0.44]),
    ramp: [
      scale(bands.deep, 0.5),
      mix(bands.deep, bands.mid, 0.3),
      mix(bands.deep, bands.mid, 0.75),
      bands.mid,
      mix(bands.mid, bands.light, 0.7),
    ],
    regolithColor: bands.light,
    bedrockColor: mix(bands.deep, bands.mid, 0.4),
    frostColor: bands.light,
    frostCoverage: 0,
    craterDensity: 0,
    regolithDepth: 1,
    boulderDensity: 0,
    boulderScale: 1,
    relief: 5.5,
    featureScale: 2.6,
    strataStrength: 0,
    strataSpacing: 1,
    windStreaks: 0,
    windDirection: Math.PI / 2,
    lavaGlow: 0,
    lavaColor: rgb(0, 0, 0),
    liquidLevel: null,
    liquidColor: rgb(0, 0, 0),
    liquidShallowColor: rgb(0, 0, 0),
    hazeDensity: 0.52,
    skyColor: recipe.atmosphere.color,
    detail: {
      chemistry: "ice",
      chemistryScale: 8,
      chemistryStrength: 0,
      primary: "ice",
      primaryScale: 8,
      secondary: "ice",
      secondaryScale: 8,
    },
    provenance: "inferred",
    seed: recipe.seed,
  };
};

const inferredGeology = (recipe: RockyWorldRecipe): SurfaceGeology => {
  const random = createSeededRandom((recipe.seed ^ 0x5f_35_6b_21) >>> 0);
  const { surface, terrain } = recipe;
  const ramp = rampFromRecipe(recipe);
  const air = terrain.atmosphereDensity;
  const detail = DETAIL_BY_PALETTE[terrain.paletteFamily] ?? DETAIL_BY_PALETTE["silicate-neutral"]!;

  return {
    medium: "rock",
    provinces: inferProvinces(recipe, random),
    ramp,
    regolithColor: mix(ramp[2], ramp[3], 0.45 + random() * 0.2),
    bedrockColor: scale(mix(ramp[0], ramp[2], 0.4), 0.9),
    frostColor: mix(rgb(0.86, 0.91, 0.96), surface.cloudColor, 0.3),
    frostCoverage: clamp01(surface.iceCapStrength * 0.7 + terrain.polarIceBias * 0.12),
    craterDensity: clamp01(terrain.craterDensity * (1 - Math.min(0.85, air * 0.7))),
    regolithDepth: clamp01(
      0.3 + air * 0.4 + terrain.erosionAmount * 0.3 - surface.waterLevel * 0.2,
    ),
    boulderDensity: clamp01(0.22 + terrain.craterDensity * 0.35 + terrain.terrainRoughness * 0.25),
    boulderScale: 0.75 + terrain.terrainRoughness * 1.1 + random() * 0.4,
    relief: 1.6 + surface.elevation * 12 + terrain.mountainHeight * 6,
    featureScale: 0.8 + terrain.continentalScale * 0.7,
    strataStrength: clamp01(0.2 + terrain.erosionAmount * 0.55 + random() * 0.2),
    strataSpacing: 0.5 + random() * 1.4,
    windStreaks: clamp01(air * 0.9 - surface.waterLevel * 0.3),
    windDirection: surface.windDirection,
    lavaGlow: clamp01(surface.lavaStrength * 0.9),
    lavaColor: surface.lavaStrength > 0 ? surface.emissiveColor : rgb(0, 0, 0),
    liquidLevel: surface.waterLevel > 0 ? surface.waterLevel : null,
    liquidColor: surface.waterColor,
    liquidShallowColor: surface.waterColorShallow,
    hazeDensity: clamp01(air * 0.7 + surface.cloudCover * 0.2),
    skyColor: mix(rgb(0.003, 0.004, 0.008), recipe.atmosphere.color, clamp01(air * 1.6) ** 0.6),
    detail,
    provenance: "inferred",
    seed: recipe.seed,
  };
};

export interface SolarBodyIdentity {
  naifId: number;
  surfaceStatus?: "mapped" | "modeled" | "unresolved";
}

const unresolvedGeology = (recipe: RockyWorldRecipe): SurfaceGeology => ({
  medium: "rock",
  provinces: provinces(["regolith-plain", 1]),
  ramp: [
    rgb(0.29, 0.31, 0.33),
    rgb(0.4, 0.42, 0.44),
    rgb(0.5, 0.53, 0.55),
    rgb(0.61, 0.64, 0.67),
    rgb(0.72, 0.75, 0.78),
  ],
  regolithColor: rgb(0.53, 0.56, 0.59),
  bedrockColor: rgb(0.46, 0.49, 0.52),
  frostColor: rgb(0.72, 0.75, 0.78),
  frostCoverage: 0,
  craterDensity: 0,
  regolithDepth: 1,
  boulderDensity: 0,
  boulderScale: 1,
  relief: 0.5,
  featureScale: 1.6,
  strataStrength: 0,
  strataSpacing: 1,
  windStreaks: 0,
  windDirection: 0,
  lavaGlow: 0,
  lavaColor: rgb(0, 0, 0),
  liquidLevel: null,
  liquidColor: rgb(0.1, 0.12, 0.14),
  liquidShallowColor: rgb(0.2, 0.24, 0.28),
  hazeDensity: 0,
  skyColor: rgb(0.003, 0.004, 0.008),
  detail: {
    chemistry: "silicate",
    chemistryScale: 12,
    chemistryStrength: 0.1,
    primary: "regolith",
    primaryScale: 16,
    secondary: "regolith",
    secondaryScale: 16,
  },
  provenance: "measured",
  seed: recipe.seed,
});

export const deriveSurfaceGeology = (
  recipe: WorldRecipe,
  identity?: SolarBodyIdentity | null,
): SurfaceGeology | null => {
  if (!isRocky(recipe)) return null;

  const inferred = inferredGeology(recipe);
  if (!identity) return inferred;
  if (identity.surfaceStatus === "modeled" || identity.surfaceStatus === "unresolved") {
    return unresolvedGeology(recipe);
  }

  const measured = MEASURED_GEOLOGY[identity.naifId] ?? ICY_MOONS[identity.naifId];
  if (!measured) return inferred;

  return {
    ...inferred,
    ...measured,
    liquidLevel: inferred.liquidLevel,
    liquidColor: measured.liquidColor ?? inferred.liquidColor,
    liquidShallowColor: measured.liquidShallowColor ?? inferred.liquidShallowColor,
    lavaGlow: measured.lavaGlow ?? 0,
    lavaColor: measured.lavaColor ?? inferred.lavaColor,
    windDirection: inferred.windDirection,
    provenance: "measured",
    seed: recipe.seed,
  };
};

const MEASURED_PALETTE_FAMILY: Readonly<Record<number, RockyPaletteFamily>> = {
  199: "basaltic-dark",
  299: "basaltic-dark",
  301: "basaltic-dark",
  399: "silicate-neutral",
  401: "carbon-dark",
  402: "carbon-dark",
  499: "oxidized-red",
  501: "sulfuric-yellow",
  502: "ice-blue",
  503: "ice-blue",
  504: "carbon-dark",
  601: "ice-blue",
  602: "ice-blue",
  603: "ice-blue",
  604: "ice-blue",
  605: "ice-blue",
  606: "desert-tan",
  608: "carbon-dark",
  701: "ice-blue",
  702: "carbon-dark",
  703: "ice-blue",
  704: "ice-blue",
  705: "ice-blue",
  801: "ice-blue",
  901: "ice-blue",
  999: "desert-tan",
  2_000_001: "carbon-dark",
};

export interface MeasuredSurfaceAppearance {
  highColor: Rgb;
  lowColor: Rgb;
  midColor: Rgb;
  paletteFamily: RockyPaletteFamily;
}

export const measuredSurfaceAppearance = (naifId: number): MeasuredSurfaceAppearance | null => {
  const geology = MEASURED_GEOLOGY[naifId] ?? ICY_MOONS[naifId];
  const family = MEASURED_PALETTE_FAMILY[naifId];
  if (!geology?.ramp || !family) return null;
  return {
    lowColor: geology.ramp[0],
    midColor: geology.ramp[2],
    highColor: geology.ramp[4],
    paletteFamily: family,
  };
};

export const hasMeasuredGeology = (naifId: number): boolean =>
  naifId in MEASURED_GEOLOGY || naifId in ICY_MOONS;
