import type { Rgb, RockyPaletteFamily, RockyWorldRecipe, WorldRecipe } from "@exora/worldgen";
import type { ChemistryDetailFamily, SurfaceDetailFamily } from "./texture-cache.ts";

/**
 * What a world's ground is made of and shaped like, as the standing-on-it view needs it.
 *
 * The orbital view of a known body is a mission mosaic wrapped on a sphere: it is a photograph,
 * and it is right by construction. The surface view has no such luxury — no one has photographed
 * the ground of an exoplanet, and even for the Solar System the imagery that exists is a map from
 * above, not a horizon. So this module states, per world, the geology a vista has to honour:
 * which landform provinces the ground belongs to, what colour its rock and its dust are, how much
 * of it is cratered, mantled, frosted, layered or molten.
 *
 * Two sources feed it, and they are kept apart on purpose:
 *  - `measured`  — a Solar System body whose surface geology is established by mission science.
 *                  Mercury's crater saturation, Venus's near-total absence of craters, Io's
 *                  complete absence of them, Europa's flatness, Titan's dune seas. These are
 *                  facts, and the renderer is not allowed to invent past them.
 *  - `inferred`  — an exoplanet, where the recipe's measured mass/radius/temperature is all
 *                  anyone has. The provinces here are a cautious reading of that thermal and
 *                  mineral regime, not a claim about a place.
 */
export type TerrainArchetype =
  /** Crater-saturated ancient crust: overlapping rims, basin floors, ejecta rays. */
  | "impact-highlands"
  /** Smooth volcanic plains cut by wrinkle ridges and collapsed lava channels. */
  | "flood-basalt"
  /** Aeolian sand seas: long transverse dune trains with steep slip faces. */
  | "dune-sea"
  /** Wind-carved parallel ridges and layered mesas separated by deflation hollows. */
  | "yardang-badlands"
  /** Deep graben and chasma with terraced walls and landslide aprons on the floor. */
  | "canyon-rift"
  /** Broad, low-angle shields with summit calderas and radiating fissure vents. */
  | "volcanic-shield"
  /** Active flow fields: crusted lava lakes, levéed channels, spatter cones. */
  | "lava-fields"
  /** Ice plains pocked by sublimation hollows, with occasional rock nunataks. */
  | "glacial-plain"
  /** Ridged, cracked ice crust: double ridges, lineae, and rafted chaos blocks. */
  | "fractured-ice"
  /** Tectonically uplifted ranges with talus fans and through-cut valleys. */
  | "folded-mountains"
  /** Wave-cut benches, spits and shallow shelves beside standing liquid. */
  | "coastal-shelf"
  /** Evaporite flats crazed into polygonal desiccation plates. */
  | "salt-pan"
  /** Gently rolling ground under a deep mantle of fines, pitted by small craters. */
  | "regolith-plain";

export interface TerrainProvince {
  archetype: TerrainArchetype;
  /** Share of the vista this province takes, across a set summing to 1. */
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
  /** Loose fines that collect in hollows and mantle shallow slopes. */
  regolithColor: Rgb;
  /** Freshly broken rock, seen on scarps and steep slopes where fines cannot rest. */
  bedrockColor: Rgb;
  /** Boulders per unit area, 0-1. */
  boulderDensity: number;
  /** Characteristic boulder size in scene units (1 unit ≈ 1 m at eye height). */
  boulderScale: number;
  /** Impacts per unit area, 0-1. Zero is a real answer: Io has no impact craters at all. */
  craterDensity: number;
  detail: SurfaceDetailChoice;
  /** How far the dominant landform runs before it repeats, in scene units. */
  featureScale: number;
  frostColor: Rgb;
  /** Share of flat, shaded ground carrying frost or evaporite, 0-1. */
  frostCoverage: number;
  /** Optical thickness of the air between the eye and the horizon, 0-1. */
  hazeDensity: number;
  lavaColor: Rgb;
  /** Strength of molten fissure glow, 0-1. */
  lavaGlow: number;
  /** Standing liquid height in the height field's own units, or null for a dry world. */
  liquidLevel: number | null;
  liquidColor: Rgb;
  provenance: "inferred" | "measured";
  provinces: readonly TerrainProvince[];
  /** Bottom-to-top colour ramp for the exposed ground, sampled by altitude. */
  ramp: readonly [Rgb, Rgb, Rgb, Rgb, Rgb];
  /** Depth of the fines mantle: 0 is bare rock, 1 an ocean of dust. */
  regolithDepth: number;
  /** Vertical scale of the vista, in scene units. */
  relief: number;
  seed: number;
  /** Vertical spacing of visible bedding planes, in scene units. */
  strataSpacing: number;
  /** How strongly bedding shows on scarps, 0-1. */
  strataStrength: number;
  windDirection: number;
  /** Strength of wind-blown streaking and drift, 0-1. */
  windStreaks: number;
}

/** The subset of a geology a Solar System body states outright; the rest is filled from the
 * recipe so a body never silently loses a field when this table grows. */
type MeasuredGeology = Partial<Omit<SurfaceGeology, "provenance" | "seed">>;

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

/**
 * Ground truth for the Solar System, keyed by NAIF id.
 *
 * Every number here answers to a mission result rather than to a preference, and the ones that
 * look surprising are the ones that matter most: Venus's crater density is near zero because the
 * whole planet was resurfaced within the last ~500 Myr; Io's is exactly zero because nothing
 * survives its resurfacing at all; Europa's relief is a few hundred metres across a body the size
 * of the Moon. Getting these right is the difference between a world and a texture swap.
 */
const MEASURED_GEOLOGY: Readonly<Record<number, MeasuredGeology>> = {
  // Mercury — crater-saturated crust darkened by graphite, cut by kilometre-high lobate scarps
  // where the whole planet contracted as it cooled, with smooth volcanic plains between.
  199: {
    provinces: provinces(
      ["impact-highlands", 0.52],
      ["flood-basalt", 0.28],
      ["regolith-plain", 0.2],
    ),
    ramp: [
      rgb(0.026, 0.024, 0.022),
      rgb(0.062, 0.058, 0.054),
      rgb(0.118, 0.112, 0.104),
      rgb(0.196, 0.188, 0.176),
      rgb(0.31, 0.3, 0.288),
    ],
    regolithColor: rgb(0.108, 0.102, 0.095),
    bedrockColor: rgb(0.15, 0.143, 0.134),
    frostColor: rgb(0.4, 0.42, 0.45),
    frostCoverage: 0,
    craterDensity: 0.95,
    regolithDepth: 0.72,
    boulderDensity: 0.5,
    boulderScale: 1.1,
    relief: 3.4,
    featureScale: 1.05,
    strataStrength: 0.18,
    strataSpacing: 2.6,
    windStreaks: 0,
    hazeDensity: 0,
    detail: {
      chemistry: "carbon",
      chemistryScale: 11,
      chemistryStrength: 0.34,
      primary: "regolith",
      primaryScale: 13,
      secondary: "basalt",
      secondaryScale: 8,
    },
  },
  // Venus — basalt plains under a 92-bar atmosphere. Almost no craters survive its global
  // resurfacing, nothing erodes without water, and Venera's own photographs show flat, layered,
  // platy slabs in an orange light that the CO2 column filters out of the sunlight above.
  299: {
    provinces: provinces(
      ["flood-basalt", 0.46],
      ["volcanic-shield", 0.28],
      ["folded-mountains", 0.26],
    ),
    ramp: [
      rgb(0.048, 0.032, 0.018),
      rgb(0.105, 0.07, 0.036),
      rgb(0.192, 0.128, 0.064),
      rgb(0.305, 0.212, 0.108),
      rgb(0.44, 0.322, 0.176),
    ],
    regolithColor: rgb(0.185, 0.128, 0.062),
    bedrockColor: rgb(0.128, 0.088, 0.048),
    frostColor: rgb(0.36, 0.3, 0.24),
    frostCoverage: 0,
    craterDensity: 0.05,
    regolithDepth: 0.22,
    boulderDensity: 0.82,
    boulderScale: 1.6,
    relief: 3.1,
    featureScale: 1.2,
    strataStrength: 0.86,
    strataSpacing: 0.55,
    windStreaks: 0.12,
    hazeDensity: 0.92,
    detail: {
      chemistry: "silicate",
      chemistryScale: 9,
      chemistryStrength: 0.3,
      primary: "basalt",
      primaryScale: 7,
      secondary: "cracked",
      secondaryScale: 5,
    },
  },
  // Earth — the one surface anyone has stood on. Folded ranges, a vegetated lowland, standing
  // water, and an impact record almost entirely erased by weather and plate tectonics.
  399: {
    provinces: provinces(
      ["folded-mountains", 0.4],
      ["coastal-shelf", 0.32],
      ["regolith-plain", 0.28],
    ),
    ramp: [
      rgb(0.024, 0.038, 0.018),
      rgb(0.052, 0.082, 0.03),
      rgb(0.145, 0.142, 0.078),
      rgb(0.33, 0.3, 0.235),
      rgb(0.72, 0.735, 0.755),
    ],
    regolithColor: rgb(0.19, 0.155, 0.105),
    bedrockColor: rgb(0.21, 0.2, 0.19),
    frostColor: rgb(0.82, 0.86, 0.9),
    frostCoverage: 0.22,
    craterDensity: 0.01,
    regolithDepth: 0.55,
    boulderDensity: 0.3,
    boulderScale: 1.0,
    relief: 3.6,
    featureScale: 1.0,
    strataStrength: 0.42,
    strataSpacing: 1.1,
    windStreaks: 0.08,
    hazeDensity: 0.42,
    detail: {
      chemistry: "silicate",
      chemistryScale: 12,
      chemistryStrength: 0.28,
      primary: "granite",
      primaryScale: 10,
      secondary: "regolith",
      secondaryScale: 15,
    },
  },
  // The Moon — the crater density ceiling for the inner system, under metres of impact-ground
  // regolith, with dark basalt maria flooding the near-side basins.
  301: {
    provinces: provinces(
      ["impact-highlands", 0.48],
      ["flood-basalt", 0.32],
      ["regolith-plain", 0.2],
    ),
    ramp: [
      rgb(0.02, 0.019, 0.018),
      rgb(0.046, 0.044, 0.042),
      rgb(0.086, 0.084, 0.08),
      rgb(0.152, 0.15, 0.145),
      rgb(0.248, 0.246, 0.242),
    ],
    regolithColor: rgb(0.088, 0.086, 0.083),
    bedrockColor: rgb(0.115, 0.113, 0.109),
    frostColor: rgb(0.4, 0.43, 0.47),
    frostCoverage: 0,
    craterDensity: 1,
    regolithDepth: 0.88,
    boulderDensity: 0.52,
    boulderScale: 1.05,
    relief: 2.7,
    featureScale: 0.95,
    strataStrength: 0.12,
    strataSpacing: 3.2,
    windStreaks: 0,
    hazeDensity: 0,
    detail: {
      chemistry: "carbon",
      chemistryScale: 12,
      chemistryStrength: 0.3,
      primary: "regolith",
      primaryScale: 14,
      secondary: "basalt",
      secondaryScale: 9,
    },
  },
  // Mars — a cold desert, not an ice world. Dark basaltic sand blown into dune seas over
  // ochre dust, wind-carved yardang ridges, the deepest canyon system known, the largest
  // volcanoes known, and permanent ice confined to roughly a hundredth of the surface.
  499: {
    provinces: provinces(
      ["yardang-badlands", 0.28],
      ["dune-sea", 0.22],
      ["canyon-rift", 0.2],
      ["impact-highlands", 0.17],
      ["volcanic-shield", 0.13],
    ),
    ramp: [
      rgb(0.052, 0.032, 0.022),
      rgb(0.112, 0.068, 0.04),
      rgb(0.215, 0.132, 0.074),
      rgb(0.355, 0.232, 0.132),
      rgb(0.53, 0.382, 0.238),
    ],
    regolithColor: rgb(0.305, 0.19, 0.108),
    bedrockColor: rgb(0.158, 0.1, 0.066),
    frostColor: rgb(0.72, 0.76, 0.8),
    frostCoverage: 0.06,
    craterDensity: 0.55,
    regolithDepth: 0.7,
    boulderDensity: 0.46,
    boulderScale: 0.95,
    relief: 4.2,
    featureScale: 1.15,
    strataStrength: 0.72,
    strataSpacing: 0.8,
    windStreaks: 0.88,
    hazeDensity: 0.38,
    detail: {
      chemistry: "oxidized",
      chemistryScale: 13,
      chemistryStrength: 0.36,
      primary: "regolith",
      primaryScale: 14,
      secondary: "basalt",
      secondaryScale: 8,
    },
  },
  // Phobos — a dark, grooved, regolith-covered fragment, its surface dominated by Stickney's
  // ejecta rather than by anything endogenic.
  401: {
    provinces: provinces(["impact-highlands", 0.7], ["regolith-plain", 0.3]),
    ramp: [
      rgb(0.014, 0.013, 0.012),
      rgb(0.032, 0.03, 0.028),
      rgb(0.058, 0.055, 0.052),
      rgb(0.098, 0.094, 0.089),
      rgb(0.16, 0.155, 0.148),
    ],
    regolithColor: rgb(0.058, 0.055, 0.052),
    bedrockColor: rgb(0.078, 0.074, 0.07),
    frostCoverage: 0,
    craterDensity: 0.92,
    regolithDepth: 0.8,
    boulderDensity: 0.6,
    boulderScale: 1.15,
    relief: 2.2,
    featureScale: 0.8,
    windStreaks: 0,
    hazeDensity: 0,
    detail: {
      chemistry: "carbon",
      chemistryScale: 13,
      chemistryStrength: 0.36,
      primary: "regolith",
      primaryScale: 15,
      secondary: "basalt",
      secondaryScale: 9,
    },
  },
  402: {
    provinces: provinces(["regolith-plain", 0.62], ["impact-highlands", 0.38]),
    ramp: [
      rgb(0.016, 0.015, 0.014),
      rgb(0.036, 0.034, 0.032),
      rgb(0.066, 0.063, 0.059),
      rgb(0.108, 0.104, 0.098),
      rgb(0.172, 0.166, 0.158),
    ],
    regolithColor: rgb(0.07, 0.067, 0.063),
    bedrockColor: rgb(0.086, 0.082, 0.078),
    frostCoverage: 0,
    craterDensity: 0.6,
    // Deimos's craters are largely buried: its regolith is thick enough to smooth the body out.
    regolithDepth: 0.95,
    boulderDensity: 0.4,
    boulderScale: 0.9,
    relief: 1.5,
    featureScale: 0.75,
    windStreaks: 0,
    hazeDensity: 0,
    detail: {
      chemistry: "carbon",
      chemistryScale: 14,
      chemistryStrength: 0.34,
      primary: "regolith",
      primaryScale: 16,
      secondary: "basalt",
      secondaryScale: 10,
    },
  },
  // Io — sulfur and sulfur dioxide over silicate, resurfaced fast enough that not one impact
  // crater has ever been identified on it, with tectonic peaks taller than anything on Earth.
  501: {
    provinces: provinces(
      ["lava-fields", 0.38],
      ["volcanic-shield", 0.27],
      ["folded-mountains", 0.2],
      ["flood-basalt", 0.15],
    ),
    ramp: [
      rgb(0.075, 0.045, 0.012),
      rgb(0.235, 0.155, 0.028),
      rgb(0.46, 0.345, 0.062),
      rgb(0.68, 0.575, 0.155),
      rgb(0.87, 0.815, 0.44),
    ],
    regolithColor: rgb(0.62, 0.5, 0.13),
    bedrockColor: rgb(0.095, 0.072, 0.045),
    frostColor: rgb(0.9, 0.88, 0.66),
    frostCoverage: 0.34,
    craterDensity: 0,
    regolithDepth: 0.42,
    boulderDensity: 0.32,
    boulderScale: 1.2,
    relief: 4.6,
    featureScale: 1.1,
    strataStrength: 0.55,
    strataSpacing: 0.7,
    windStreaks: 0,
    hazeDensity: 0.06,
    lavaGlow: 0.72,
    lavaColor: rgb(1, 0.4, 0.075),
    detail: {
      chemistry: "sulfuric",
      chemistryScale: 10,
      chemistryStrength: 0.44,
      primary: "basalt",
      primaryScale: 8,
      secondary: "cracked",
      secondaryScale: 6,
    },
  },
  // Europa — the smoothest solid surface known: bright water ice crazed by double ridges and
  // rafted into chaos blocks, with total relief of only a few hundred metres.
  502: {
    provinces: provinces(["fractured-ice", 0.74], ["glacial-plain", 0.26]),
    ramp: [
      rgb(0.185, 0.155, 0.135),
      rgb(0.36, 0.335, 0.32),
      rgb(0.58, 0.585, 0.6),
      rgb(0.75, 0.775, 0.8),
      rgb(0.9, 0.93, 0.96),
    ],
    regolithColor: rgb(0.68, 0.7, 0.73),
    bedrockColor: rgb(0.42, 0.36, 0.33),
    frostColor: rgb(0.94, 0.96, 0.99),
    frostCoverage: 0.85,
    craterDensity: 0.03,
    regolithDepth: 0.3,
    boulderDensity: 0.55,
    boulderScale: 1.9,
    // A tenth of the inner planets' relief. Europa's whole topography fits inside one Martian dune.
    relief: 0.9,
    featureScale: 1.4,
    strataStrength: 0.3,
    strataSpacing: 0.5,
    windStreaks: 0,
    hazeDensity: 0.02,
    detail: {
      chemistry: "ice",
      chemistryScale: 11,
      chemistryStrength: 0.32,
      primary: "ice",
      primaryScale: 10,
      secondary: "cracked",
      secondaryScale: 6,
    },
  },
  // Ganymede — dark, ancient, cratered terrain cut across by bright grooved bands where the
  // crust pulled apart.
  503: {
    provinces: provinces(
      ["fractured-ice", 0.42],
      ["impact-highlands", 0.34],
      ["glacial-plain", 0.24],
    ),
    ramp: [
      rgb(0.055, 0.05, 0.046),
      rgb(0.12, 0.115, 0.11),
      rgb(0.235, 0.235, 0.238),
      rgb(0.42, 0.43, 0.45),
      rgb(0.66, 0.685, 0.72),
    ],
    regolithColor: rgb(0.24, 0.24, 0.245),
    bedrockColor: rgb(0.14, 0.132, 0.126),
    frostColor: rgb(0.82, 0.87, 0.93),
    frostCoverage: 0.5,
    craterDensity: 0.62,
    regolithDepth: 0.45,
    boulderDensity: 0.42,
    boulderScale: 1.4,
    relief: 2.1,
    featureScale: 1.2,
    strataStrength: 0.4,
    strataSpacing: 0.6,
    windStreaks: 0,
    hazeDensity: 0.01,
    detail: {
      chemistry: "ice",
      chemistryScale: 12,
      chemistryStrength: 0.28,
      primary: "ice",
      primaryScale: 11,
      secondary: "regolith",
      secondaryScale: 14,
    },
  },
  // Callisto — the most heavily cratered surface in the Solar System, its ice darkened to a
  // lag of dust and its small craters erased by sublimation.
  504: {
    provinces: provinces(["impact-highlands", 0.66], ["regolith-plain", 0.34]),
    ramp: [
      rgb(0.028, 0.026, 0.024),
      rgb(0.062, 0.059, 0.056),
      rgb(0.122, 0.12, 0.12),
      rgb(0.24, 0.245, 0.252),
      rgb(0.5, 0.53, 0.56),
    ],
    regolithColor: rgb(0.1, 0.097, 0.094),
    bedrockColor: rgb(0.135, 0.135, 0.138),
    frostColor: rgb(0.78, 0.84, 0.9),
    frostCoverage: 0.28,
    craterDensity: 1,
    regolithDepth: 0.68,
    boulderDensity: 0.38,
    boulderScale: 1.3,
    relief: 2.4,
    featureScale: 1,
    strataStrength: 0.1,
    strataSpacing: 2,
    windStreaks: 0,
    hazeDensity: 0,
    detail: {
      chemistry: "carbon",
      chemistryScale: 12,
      chemistryStrength: 0.34,
      primary: "regolith",
      primaryScale: 14,
      secondary: "ice",
      secondaryScale: 10,
    },
  },
  // Enceladus — the brightest surface in the Solar System: fresh plume fallout over a young
  // south-polar terrain of tiger-stripe fractures.
  602: {
    provinces: provinces(
      ["fractured-ice", 0.48],
      ["glacial-plain", 0.34],
      ["impact-highlands", 0.18],
    ),
    ramp: [
      rgb(0.42, 0.46, 0.5),
      rgb(0.62, 0.67, 0.72),
      rgb(0.78, 0.83, 0.88),
      rgb(0.9, 0.94, 0.97),
      rgb(0.97, 0.99, 1),
    ],
    regolithColor: rgb(0.9, 0.94, 0.98),
    bedrockColor: rgb(0.6, 0.66, 0.72),
    frostColor: rgb(0.98, 0.995, 1),
    frostCoverage: 0.95,
    craterDensity: 0.24,
    regolithDepth: 0.62,
    boulderDensity: 0.34,
    boulderScale: 1.5,
    relief: 1.4,
    featureScale: 1.3,
    strataStrength: 0.22,
    strataSpacing: 0.45,
    windStreaks: 0,
    hazeDensity: 0.03,
    detail: {
      chemistry: "ice",
      chemistryScale: 10,
      chemistryStrength: 0.24,
      primary: "ice",
      primaryScale: 9,
      secondary: "cracked",
      secondaryScale: 6,
    },
  },
  // Titan — sand seas of organic grains covering a fifth of the moon, fluvial valleys cut by
  // methane rain, polar lakes, and an orange haze thick enough to hide the Sun.
  606: {
    provinces: provinces(
      ["dune-sea", 0.46],
      ["yardang-badlands", 0.2],
      ["coastal-shelf", 0.2],
      ["regolith-plain", 0.14],
    ),
    ramp: [
      rgb(0.038, 0.024, 0.011),
      rgb(0.095, 0.062, 0.026),
      rgb(0.185, 0.122, 0.05),
      rgb(0.3, 0.208, 0.092),
      rgb(0.44, 0.325, 0.16),
    ],
    regolithColor: rgb(0.2, 0.135, 0.058),
    bedrockColor: rgb(0.15, 0.135, 0.125),
    frostColor: rgb(0.42, 0.4, 0.36),
    frostCoverage: 0.05,
    craterDensity: 0.04,
    regolithDepth: 0.9,
    boulderDensity: 0.28,
    boulderScale: 0.8,
    relief: 1.6,
    featureScale: 1.5,
    strataStrength: 0.35,
    strataSpacing: 0.9,
    windStreaks: 0.7,
    hazeDensity: 0.96,
    liquidColor: rgb(0.02, 0.018, 0.016),
    detail: {
      chemistry: "carbon",
      chemistryScale: 14,
      chemistryStrength: 0.32,
      primary: "regolith",
      primaryScale: 16,
      secondary: "cracked",
      secondaryScale: 7,
    },
  },
  // Iapetus — two hemispheres in one body: a dark dust-mantled leading side and bright trailing
  // ice, split by an equatorial ridge 13 km high.
  608: {
    provinces: provinces(
      ["impact-highlands", 0.5],
      ["folded-mountains", 0.28],
      ["glacial-plain", 0.22],
    ),
    ramp: [
      rgb(0.016, 0.013, 0.011),
      rgb(0.05, 0.045, 0.04),
      rgb(0.18, 0.182, 0.185),
      rgb(0.45, 0.47, 0.49),
      rgb(0.72, 0.76, 0.8),
    ],
    regolithColor: rgb(0.06, 0.053, 0.046),
    bedrockColor: rgb(0.24, 0.25, 0.26),
    frostColor: rgb(0.88, 0.92, 0.96),
    frostCoverage: 0.45,
    craterDensity: 0.9,
    regolithDepth: 0.6,
    boulderDensity: 0.4,
    boulderScale: 1.35,
    relief: 4.4,
    featureScale: 1.05,
    strataStrength: 0.2,
    strataSpacing: 1.4,
    windStreaks: 0,
    hazeDensity: 0,
    detail: {
      chemistry: "carbon",
      chemistryScale: 12,
      chemistryStrength: 0.4,
      primary: "regolith",
      primaryScale: 14,
      secondary: "ice",
      secondaryScale: 10,
    },
  },
  // Triton — nitrogen frost over a cantaloupe terrain of dimpled cells, with active plumes and
  // almost no craters on a surface younger than 100 Myr.
  801: {
    provinces: provinces(
      ["glacial-plain", 0.44],
      ["fractured-ice", 0.36],
      ["volcanic-shield", 0.2],
    ),
    ramp: [
      rgb(0.24, 0.2, 0.19),
      rgb(0.44, 0.4, 0.4),
      rgb(0.64, 0.62, 0.63),
      rgb(0.8, 0.8, 0.81),
      rgb(0.93, 0.94, 0.95),
    ],
    regolithColor: rgb(0.72, 0.72, 0.74),
    bedrockColor: rgb(0.42, 0.37, 0.36),
    frostColor: rgb(0.95, 0.95, 0.97),
    frostCoverage: 0.88,
    craterDensity: 0.05,
    regolithDepth: 0.5,
    boulderDensity: 0.24,
    boulderScale: 1.4,
    relief: 1.2,
    featureScale: 1.35,
    strataStrength: 0.25,
    strataSpacing: 0.6,
    windStreaks: 0.4,
    hazeDensity: 0.14,
    detail: {
      chemistry: "ice",
      chemistryScale: 11,
      chemistryStrength: 0.26,
      primary: "ice",
      primaryScale: 10,
      secondary: "regolith",
      secondaryScale: 14,
    },
  },
  // Charon — grey water ice, a tectonic chasm system four times the length of the Grand Canyon,
  // and a north polar cap stained red by tholins escaping from Pluto.
  901: {
    provinces: provinces(
      ["canyon-rift", 0.38],
      ["impact-highlands", 0.34],
      ["glacial-plain", 0.28],
    ),
    ramp: [
      rgb(0.075, 0.062, 0.055),
      rgb(0.165, 0.155, 0.15),
      rgb(0.3, 0.298, 0.3),
      rgb(0.47, 0.475, 0.485),
      rgb(0.68, 0.7, 0.72),
    ],
    regolithColor: rgb(0.28, 0.275, 0.275),
    bedrockColor: rgb(0.2, 0.19, 0.185),
    frostColor: rgb(0.84, 0.88, 0.92),
    frostCoverage: 0.4,
    craterDensity: 0.7,
    regolithDepth: 0.4,
    boulderDensity: 0.44,
    boulderScale: 1.6,
    relief: 3.8,
    featureScale: 1.15,
    strataStrength: 0.3,
    strataSpacing: 0.8,
    windStreaks: 0,
    hazeDensity: 0,
    detail: {
      chemistry: "ice",
      chemistryScale: 12,
      chemistryStrength: 0.3,
      primary: "ice",
      primaryScale: 11,
      secondary: "regolith",
      secondaryScale: 14,
    },
  },
  // Pluto — nitrogen ice convecting into cells tens of kilometres across on Sputnik Planitia,
  // walled by water-ice mountains and bordered by tholin-dark uplands.
  999: {
    provinces: provinces(
      ["glacial-plain", 0.4],
      ["folded-mountains", 0.24],
      ["fractured-ice", 0.2],
      ["impact-highlands", 0.16],
    ),
    ramp: [
      rgb(0.07, 0.044, 0.03),
      rgb(0.17, 0.122, 0.088),
      rgb(0.34, 0.272, 0.212),
      rgb(0.56, 0.492, 0.418),
      rgb(0.82, 0.79, 0.74),
    ],
    regolithColor: rgb(0.46, 0.4, 0.34),
    bedrockColor: rgb(0.3, 0.29, 0.3),
    frostColor: rgb(0.9, 0.9, 0.88),
    frostCoverage: 0.62,
    craterDensity: 0.3,
    regolithDepth: 0.55,
    boulderDensity: 0.3,
    boulderScale: 1.7,
    relief: 3.2,
    featureScale: 1.3,
    strataStrength: 0.28,
    strataSpacing: 0.7,
    windStreaks: 0.2,
    hazeDensity: 0.2,
    detail: {
      chemistry: "ice",
      chemistryScale: 12,
      chemistryStrength: 0.34,
      primary: "ice",
      primaryScale: 11,
      secondary: "regolith",
      secondaryScale: 15,
    },
  },
  // Ceres — a dark carbonaceous crust at 9% albedo, pocked by craters and spotted with the
  // brightest salt deposits in the belt.
  2_000_001: {
    provinces: provinces(["impact-highlands", 0.58], ["regolith-plain", 0.28], ["salt-pan", 0.14]),
    ramp: [
      rgb(0.018, 0.017, 0.016),
      rgb(0.04, 0.038, 0.036),
      rgb(0.075, 0.072, 0.069),
      rgb(0.13, 0.127, 0.123),
      rgb(0.34, 0.35, 0.35),
    ],
    regolithColor: rgb(0.068, 0.065, 0.062),
    bedrockColor: rgb(0.09, 0.087, 0.084),
    frostColor: rgb(0.86, 0.88, 0.9),
    frostCoverage: 0.08,
    craterDensity: 0.88,
    regolithDepth: 0.66,
    boulderDensity: 0.46,
    boulderScale: 1.2,
    relief: 2.6,
    featureScale: 0.95,
    strataStrength: 0.16,
    strataSpacing: 1.8,
    windStreaks: 0,
    hazeDensity: 0,
    detail: {
      chemistry: "carbon",
      chemistryScale: 13,
      chemistryStrength: 0.38,
      primary: "regolith",
      primaryScale: 15,
      secondary: "basalt",
      secondaryScale: 9,
    },
  },
};

/** Bright water-ice moons whose surfaces differ mainly in how much of the crater record and how
 * much of the tectonics survives. Stated as one shape with per-body dials rather than repeated. */
const icyMoonGeology = (
  cratering: number,
  tectonics: number,
  brightness: number,
  relief: number,
): MeasuredGeology => ({
  provinces: provinces(
    ["impact-highlands", cratering],
    ["fractured-ice", tectonics],
    ["glacial-plain", Math.max(0.12, 1 - cratering - tectonics)],
  ),
  ramp: [
    scale(rgb(0.1, 0.105, 0.115), brightness),
    scale(rgb(0.24, 0.25, 0.27), brightness),
    scale(rgb(0.45, 0.47, 0.5), brightness),
    scale(rgb(0.68, 0.71, 0.75), brightness),
    scale(rgb(0.9, 0.93, 0.97), brightness),
  ],
  regolithColor: scale(rgb(0.5, 0.53, 0.57), brightness),
  bedrockColor: scale(rgb(0.32, 0.33, 0.35), brightness),
  frostColor: scale(rgb(0.93, 0.96, 1), Math.min(1, brightness * 1.05)),
  frostCoverage: 0.55 + brightness * 0.3,
  craterDensity: cratering,
  regolithDepth: 0.44,
  boulderDensity: 0.36,
  boulderScale: 1.45,
  relief,
  featureScale: 1.2,
  strataStrength: 0.24,
  strataSpacing: 0.6,
  windStreaks: 0,
  hazeDensity: 0,
  detail: {
    chemistry: "ice",
    chemistryScale: 11,
    chemistryStrength: 0.28,
    primary: "ice",
    primaryScale: 10,
    secondary: "regolith",
    secondaryScale: 14,
  },
});

/* Saturnian and Uranian ice moons, ordered by how much of each surface is crater record versus
 * tectonic resurfacing. Mimas is the crater extreme; Ariel and Miranda the tectonic one. */
const ICY_MOONS: Readonly<Record<number, MeasuredGeology>> = {
  601: icyMoonGeology(0.94, 0.06, 0.96, 2.6),
  603: icyMoonGeology(0.82, 0.18, 1, 2.4),
  604: icyMoonGeology(0.62, 0.32, 0.86, 2.2),
  605: icyMoonGeology(0.88, 0.1, 0.84, 2.3),
  701: icyMoonGeology(0.4, 0.52, 0.62, 2.5),
  702: icyMoonGeology(0.82, 0.12, 0.3, 2.1),
  703: icyMoonGeology(0.6, 0.34, 0.42, 2.6),
  704: icyMoonGeology(0.76, 0.18, 0.38, 2.4),
  // Miranda's coronae stack scarps 20 km high on a body 470 km across — the most extreme relief
  // to radius ratio in the Solar System.
  705: icyMoonGeology(0.34, 0.58, 0.5, 4.8),
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

/**
 * Reads a set of landform provinces off a rocky recipe's own thermal and mineral regime.
 *
 * Nothing here is a claim about a place — an exoplanet's surface has never been seen. What the
 * catalogue does constrain is the regime: a world hot enough to melt rock has flow fields, one
 * cold enough to freeze its volatiles out has ice, one with standing liquid has a shoreline, one
 * with a thin atmosphere keeps its crater record because nothing erases it. The seeded draw only
 * chooses between provinces the regime already allows, so two worlds with the same physics still
 * differ without either of them contradicting what is known.
 */
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
    // Nothing erodes an airless world but more impacts, so the crater record is the landscape.
    entries.push(["impact-highlands", 0.4 + terrain.craterDensity * 0.28]);
    entries.push(["regolith-plain", 0.2 + random() * 0.18]);
    entries.push(["flood-basalt", 0.12 + random() * 0.18]);
  } else {
    // A dry world with air: wind is the only agent left, and it builds dunes and carves yardangs.
    entries.push(["dune-sea", 0.2 + air * 0.3]);
    entries.push(["yardang-badlands", 0.18 + terrain.erosionAmount * 0.3]);
    entries.push(["impact-highlands", 0.12 + terrain.craterDensity * 0.2 * (1 - air)]);
    if (random() > 0.6) entries.push(["salt-pan", 0.1 + random() * 0.14]);
  }

  // One province drawn from outside the regime's default set, so a world reads as a place with a
  // history rather than as one process applied uniformly.
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

/** Widens a recipe's three-stop palette into the five-stop ramp the ground shading samples,
 * keeping the recipe's own mineral hue while pulling the extremes further apart than a straight
 * interpolation would — real ground is darker in its hollows and brighter on its crests than the
 * midpoint of a two-colour blend. */
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

const inferredGeology = (recipe: RockyWorldRecipe): SurfaceGeology => {
  const random = createSeededRandom((recipe.seed ^ 0x5f_35_6b_21) >>> 0);
  const { surface, terrain } = recipe;
  const ramp = rampFromRecipe(recipe);
  const air = terrain.atmosphereDensity;
  const detail = DETAIL_BY_PALETTE[terrain.paletteFamily] ?? DETAIL_BY_PALETTE["silicate-neutral"]!;

  return {
    provinces: inferProvinces(recipe, random),
    ramp,
    // Fines are ground out by impacts on an airless world and blown into a mantle on a windy
    // one; a wet world washes them into its basins instead, so it keeps more bare rock exposed.
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
    hazeDensity: clamp01(air * 0.7 + surface.cloudCover * 0.2),
    detail,
    provenance: "inferred",
    seed: recipe.seed,
  };
};

export interface SolarBodyIdentity {
  naifId: number;
  /** How much of this body's surface has actually been resolved by a mission. */
  surfaceStatus?: "mapped" | "modeled" | "unresolved";
}

/**
 * A body whose surface no mission has resolved.
 *
 * Its size and orbit are measured, and nothing else is. Rather than dressing it in a plausible
 * landscape — which would be an astronomical claim with nothing behind it — the vista gets a
 * featureless graded plain: no craters, no mountains, no colour beyond the neutral grey the
 * orbital view already uses for the same reason.
 */
const unresolvedGeology = (recipe: RockyWorldRecipe): SurfaceGeology => ({
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
  hazeDensity: 0,
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

/**
 * The geology a surface vista should be built from.
 *
 * A Solar System body with mission-resolved terrain answers from `MEASURED_GEOLOGY`; one whose
 * surface has never been resolved gets the deliberately featureless plain above; everything else
 * is read off the recipe's own measured physical properties.
 */
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
    // Water level stays with the recipe: it is what the orbital view and the vista's own liquid
    // plane already agree on, and the measured table has no business restating it.
    liquidLevel: inferred.liquidLevel,
    liquidColor: measured.liquidColor ?? inferred.liquidColor,
    lavaGlow: measured.lavaGlow ?? 0,
    lavaColor: measured.lavaColor ?? inferred.lavaColor,
    windDirection: inferred.windDirection,
    provenance: "measured",
    seed: recipe.seed,
  };
};

/**
 * What each measured body's rock is made of, in the same vocabulary the exoplanet inference uses.
 *
 * Only the mineral family is stated here; the colours a vista actually paints come from that
 * body's own ramp above. The two are separate because the family is a claim about chemistry and
 * the ramp is a claim about appearance, and for a body like Europa — water ice, but grey-white
 * rather than the blue an "ice" family would suggest — they genuinely disagree.
 */
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

/**
 * The three-stop palette a Solar System body's recipe should carry, taken from its measured ramp.
 *
 * Without this a known world's surface colours come out of the same inference an exoplanet gets,
 * which for Mars (210 K, so "ice" under the old threshold) produced a blue-white ice palette for
 * a planet whose defining visual fact is that it is rust-coloured.
 */
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

/** Whether a body's ground truth is stated here rather than inferred — used by tests and by the
 * telemetry that tells a visitor which of the two they are looking at. */
export const hasMeasuredGeology = (naifId: number): boolean =>
  naifId in MEASURED_GEOLOGY || naifId in ICY_MOONS;
