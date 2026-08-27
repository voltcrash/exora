import type { Rgb, RockyPaletteFamily, RockyWorldRecipe, WorldRecipe } from "@exora/worldgen";
import { ICY_MOONS, MEASURED_GEOLOGY } from "./surface-geology-catalog.ts";
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
  /**
   * What a visitor is standing on.
   *
   * `rock` is ground. `cloud` is a giant's cloud deck — the top of a convecting layer, which is
   * the only thing an excursion to a gas or ice giant can stand on, and which has never claimed
   * to be anything else. It shares the vista's geometry and light and none of its materials: a
   * cloud has no bedrock, no bedding, no loose rock, and it scatters light through itself rather
   * than reflecting it off a surface.
   */
  medium: "cloud" | "rock";
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
  /** The colour of a deep body of it, and of a shallow one — which is most of what tells a
   * viewer where the shore is. */
  liquidColor: Rgb;
  liquidShallowColor: Rgb;
  provenance: "inferred" | "measured";
  provinces: readonly TerrainProvince[];
  /**
   * What colour the sky is from the ground, which is a fact about the air rather than about the
   * rock beneath it — and not something the surface palette can be asked for. Left to the
   * inference, Titan's came out blue: its equilibrium temperature marks it as a deep-frozen world,
   * and frozen worlds get their atmosphere tinted toward ice, so the orange smog moon whose sky
   * hides its own sun was given a clear blue one.
   */
  skyColor: Rgb;
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

/**
 * Ground truth for the Solar System, keyed by NAIF id.
 *
 * Every number here answers to a mission result rather than to a preference, and the ones that
 * look surprising are the ones that matter most: Venus's crater density is near zero because the
 * whole planet was resurfaced within the last ~500 Myr; Io's is exactly zero because nothing
 * survives its resurfacing at all; Europa's relief is a few hundred metres across a body the size
 * of the Moon. Getting these right is the difference between a world and a texture swap.
 */

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

/**
 * The cloud deck a giant's excursion stands on.
 *
 * Not terrain and not presented as terrain: it is the top of the convecting layer whose bands the
 * orbital view shows from above, given the same horizon, air and light as everything else so it
 * reads as a place rather than as a fogged plane. Its swells run along the world's own banding,
 * because that is what a jet stream does to a cloud layer.
 */
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
    // Long swells running with the banding, over a broader roll: cloud streets over convection.
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
    // Bands run east-west, so the swells lie across the direction a visitor faces.
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
    liquidShallowColor: surface.waterColorShallow,
    hazeDensity: clamp01(air * 0.7 + surface.cloudCover * 0.2),
    // The recipe's atmosphere colour is what this world's air would scatter; with no air to
    // scatter in, the sky is simply space.
    skyColor: mix(rgb(0.003, 0.004, 0.008), recipe.atmosphere.color, clamp01(air * 1.6) ** 0.6),
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
    liquidShallowColor: measured.liquidShallowColor ?? inferred.liquidShallowColor,
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
