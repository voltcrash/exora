import type { ExoplanetProfile, StarProfile } from "@exora/contracts";
import type { WorldRecipe } from "@exora/worldgen";

/**
 * Our home system is small, known and useful offline, so it is an authored catalog rather than
 * an exoplanet-shaped request to a service that deliberately excludes it. Physical identifiers
 * and values follow NASA/JPL Solar System Dynamics; visual map provenance lives with each body.
 */
export const SUN: StarProfile = {
  catalogName: "NAIF 10",
  customization: {
    activity: 0.48,
    radius: 0.5,
    rotation: 0.34,
    seed: 10,
    temperatureKelvin: 5_772,
  },
  id: "solar-system-sun",
  kind: "main-sequence",
  name: "Sun",
  objectType: "G2 V star",
  observation: {
    declinationDegrees: null,
    distanceParsecs: 0,
    gaiaMagnitude: null,
    parallaxMas: null,
    properMotionDecMasPerYear: null,
    properMotionRaMasPerYear: null,
    radialVelocityKmPerSecond: null,
    rightAscensionDegrees: null,
    spectralType: "G2 V",
    visualMagnitude: -26.74,
  },
  solarSystem: {
    axialTiltDegrees: 7.25,
    bodyType: "star",
    naifId: 10,
    orbitalInclinationDegrees: null,
    parent: null,
    rotationPeriodHours: 609.12,
    summary:
      "Our 4.6-billion-year-old G-type star, holding 99.86% of the Solar System's mass and powering almost every world in it.",
  },
  source: {
    archive: "NASA/JPL Solar System Dynamics",
    retrievedOn: "2026-08-23",
    table: "planetary-physical-parameters",
  },
};

interface PlanetParameters {
  axialTiltDegrees: number;
  bodyType?: "dwarf-planet" | "planet";
  discoveryMethod: string;
  discoveryYear: number | null;
  eccentricity: number;
  equilibriumTemperatureKelvin: number;
  id: string;
  inclinationDegrees: number;
  kind: ExoplanetProfile["kind"];
  massEarth: number;
  massJupiter?: number;
  name: string;
  naifId: number;
  orbitalPeriodDays: number;
  radiusEarth: number;
  radiusJupiter?: number;
  rotationPeriodHours: number;
  semiMajorAxisAu: number;
  summary: string;
  texture?: {
    credit: string;
    page: string;
  };
}

const planet = ({
  axialTiltDegrees,
  bodyType = "planet",
  discoveryMethod,
  discoveryYear,
  eccentricity,
  equilibriumTemperatureKelvin,
  id,
  inclinationDegrees,
  kind,
  massEarth,
  massJupiter,
  name,
  naifId,
  orbitalPeriodDays,
  radiusEarth,
  radiusJupiter,
  rotationPeriodHours,
  semiMajorAxisAu,
  summary,
  texture,
}: PlanetParameters): ExoplanetProfile => ({
  hostStar: "Sun",
  id: `solar-system-${id}`,
  kind,
  name,
  observation: {
    declinationDegrees: null,
    distanceParsecs: 0,
    discoveryMethod,
    discoveryYear,
    equilibriumTemperatureKelvin,
    hostLuminosityLogSolar: 0,
    hostMassSolar: 1,
    hostRadiusSolar: 1,
    hostSpectralType: "G2 V",
    hostTemperatureKelvin: 5_772,
    massEarth,
    massJupiter: massJupiter ?? null,
    orbitalEccentricity: eccentricity,
    // Solar-System inclinations use the ecliptic, not an observer's sky plane. The measured
    // value is preserved in `solarSystem` and translated only by the system layout.
    orbitalInclinationDegrees: null,
    orbitalPeriodDays,
    radiusEarth,
    radiusJupiter: radiusJupiter ?? null,
    rightAscensionDegrees: null,
    semiMajorAxisAu,
  },
  solarSystem: {
    axialTiltDegrees,
    bodyType,
    naifId,
    orbitalInclinationDegrees: inclinationDegrees,
    parent: "Sun",
    rotationPeriodHours,
    summary,
    ...(texture
      ? {
          texture: {
            credit: texture.credit,
            path: `/textures/solar-system/${id}.jpg`,
            sourceUrl: texture.page,
          },
        }
      : {}),
  },
  source: {
    archive: "NASA/JPL Solar System Dynamics",
    retrievedOn: "2026-08-23",
    table: "planetary-physical-parameters",
  },
});

export const MERCURY = planet({
  axialTiltDegrees: 0.034,
  discoveryMethod: "Known since antiquity",
  discoveryYear: null,
  eccentricity: 0.2056,
  equilibriumTemperatureKelvin: 437,
  id: "mercury",
  inclinationDegrees: 7.005,
  kind: "rocky",
  massEarth: 0.0553,
  name: "Mercury",
  naifId: 199,
  orbitalPeriodDays: 87.969,
  radiusEarth: 0.383,
  rotationPeriodHours: 1_407.6,
  semiMajorAxisAu: 0.3871,
  summary:
    "The smallest planet and the fastest around the Sun: a metal-rich, cratered world with almost no atmosphere.",
  texture: {
    credit: "NASA MESSENGER / USGS Astrogeology",
    page: "https://astrogeology.usgs.gov/search/map/mercury_messenger_mdis_global_mosaic_250m",
  },
});

export const VENUS = planet({
  axialTiltDegrees: 177.36,
  discoveryMethod: "Known since antiquity",
  discoveryYear: null,
  eccentricity: 0.0068,
  equilibriumTemperatureKelvin: 232,
  id: "venus",
  inclinationDegrees: 3.395,
  kind: "rocky",
  massEarth: 0.815,
  name: "Venus",
  naifId: 299,
  orbitalPeriodDays: 224.701,
  radiusEarth: 0.949,
  rotationPeriodHours: -5_832.5,
  semiMajorAxisAu: 0.7233,
  summary:
    "Earth's near-twin in size, wrapped in sulfuric clouds and a crushing greenhouse atmosphere hot enough to melt lead.",
  texture: {
    credit: "NASA Magellan / JPL-Caltech",
    page: "https://science.nasa.gov/3d-resources/venus/",
  },
});

export const EARTH = planet({
  axialTiltDegrees: 23.439,
  discoveryMethod: "Home world",
  discoveryYear: null,
  eccentricity: 0.0167,
  equilibriumTemperatureKelvin: 255,
  id: "earth",
  inclinationDegrees: 0.00005,
  kind: "rocky",
  massEarth: 1,
  name: "Earth",
  naifId: 399,
  orbitalPeriodDays: 365.256,
  radiusEarth: 1,
  rotationPeriodHours: 23.9345,
  semiMajorAxisAu: 1,
  summary:
    "Our ocean world: the only place known to host life, with a living atmosphere and an active rocky surface.",
  texture: {
    credit: "NASA Goddard / MODIS Blue Marble",
    page: "https://visibleearth.nasa.gov/images/57723/the-blue-marble",
  },
});

export const MARS = planet({
  axialTiltDegrees: 25.19,
  discoveryMethod: "Known since antiquity",
  discoveryYear: null,
  eccentricity: 0.0934,
  equilibriumTemperatureKelvin: 210,
  id: "mars",
  inclinationDegrees: 1.85,
  kind: "rocky",
  massEarth: 0.1074,
  name: "Mars",
  naifId: 499,
  orbitalPeriodDays: 686.98,
  radiusEarth: 0.532,
  rotationPeriodHours: 24.6229,
  semiMajorAxisAu: 1.5237,
  summary:
    "A cold desert world of iron oxide, ancient rivers, planet-scale volcanoes, and the deepest canyon system we know.",
  texture: {
    credit: "NASA Viking / USGS / JPL-Caltech",
    page: "https://science.nasa.gov/3d-resources/mars/",
  },
});

export const JUPITER = planet({
  axialTiltDegrees: 3.13,
  discoveryMethod: "Known since antiquity",
  discoveryYear: null,
  eccentricity: 0.0489,
  equilibriumTemperatureKelvin: 110,
  id: "jupiter",
  inclinationDegrees: 1.304,
  kind: "gas-giant",
  massEarth: 317.83,
  massJupiter: 1,
  name: "Jupiter",
  naifId: 599,
  orbitalPeriodDays: 4_332.59,
  radiusEarth: 11.209,
  radiusJupiter: 1,
  rotationPeriodHours: 9.925,
  semiMajorAxisAu: 5.2028,
  summary:
    "The largest planet: a fast-spinning hydrogen giant whose jets, storms, and Great Red Spot reshape themselves in real time.",
  texture: {
    credit: "NASA Voyager / JPL-Caltech",
    page: "https://science.nasa.gov/3d-resources/jupiter/",
  },
});

export const SATURN = planet({
  axialTiltDegrees: 26.73,
  discoveryMethod: "Known since antiquity",
  discoveryYear: null,
  eccentricity: 0.0565,
  equilibriumTemperatureKelvin: 81,
  id: "saturn",
  inclinationDegrees: 2.485,
  kind: "gas-giant",
  massEarth: 95.16,
  massJupiter: 0.299,
  name: "Saturn",
  naifId: 699,
  orbitalPeriodDays: 10_759.22,
  radiusEarth: 9.449,
  radiusJupiter: 0.843,
  rotationPeriodHours: 10.656,
  semiMajorAxisAu: 9.5388,
  summary:
    "A pale hydrogen giant encircled by the Solar System's most spectacular ring system: billions of shards of ice and rock.",
  texture: {
    credit: "NASA/JPL-Caltech Solar System Simulator",
    page: "https://science.nasa.gov/3d-resources/saturn/",
  },
});

export const URANUS = planet({
  axialTiltDegrees: 97.77,
  discoveryMethod: "Telescopic observation",
  discoveryYear: 1781,
  eccentricity: 0.0472,
  equilibriumTemperatureKelvin: 59,
  id: "uranus",
  inclinationDegrees: 0.773,
  kind: "ice-giant",
  massEarth: 14.54,
  massJupiter: 0.0457,
  name: "Uranus",
  naifId: 799,
  orbitalPeriodDays: 30_688.5,
  radiusEarth: 4.007,
  radiusJupiter: 0.3575,
  rotationPeriodHours: -17.24,
  semiMajorAxisAu: 19.1914,
  summary:
    "A cyan ice giant rotating almost on its side, with a magnetosphere, seasons, rings, and moons all tipped into the roll.",
});

export const NEPTUNE = planet({
  axialTiltDegrees: 28.32,
  discoveryMethod: "Mathematical prediction",
  discoveryYear: 1846,
  eccentricity: 0.0086,
  equilibriumTemperatureKelvin: 47,
  id: "neptune",
  inclinationDegrees: 1.77,
  kind: "ice-giant",
  massEarth: 17.15,
  massJupiter: 0.054,
  name: "Neptune",
  naifId: 899,
  orbitalPeriodDays: 60_182,
  radiusEarth: 3.883,
  radiusJupiter: 0.3464,
  rotationPeriodHours: 16.11,
  semiMajorAxisAu: 30.0611,
  summary:
    "The farthest planet: a deep-blue ice giant with supersonic winds, transient dark storms, faint rings, and a captured moon.",
  texture: {
    credit: "NASA/JPL-Caltech Solar System Simulator",
    page: "https://science.nasa.gov/3d-resources/neptune/",
  },
});

export const SOLAR_SYSTEM_PLANETS = [
  MERCURY,
  VENUS,
  EARTH,
  MARS,
  JUPITER,
  SATURN,
  URANUS,
  NEPTUNE,
] as const;

export const PLUTO = planet({
  axialTiltDegrees: 119.61,
  bodyType: "dwarf-planet",
  discoveryMethod: "Photographic plate",
  discoveryYear: 1930,
  eccentricity: 0.2488,
  equilibriumTemperatureKelvin: 44,
  id: "pluto",
  inclinationDegrees: 17.16,
  kind: "rocky",
  massEarth: 0.00218,
  name: "Pluto",
  naifId: 999,
  orbitalPeriodDays: 90_560,
  radiusEarth: 0.186,
  rotationPeriodHours: -153.293,
  semiMajorAxisAu: 39.482,
  summary:
    "A complex Kuiper Belt dwarf planet with blue haze, mountains of water ice, and the vast nitrogen glacier Sputnik Planitia.",
  texture: {
    credit: "NASA New Horizons / JHUAPL / SwRI",
    page: "https://science.nasa.gov/resource/pluto-global-color-map/",
  },
});

export const SOLAR_SYSTEM_WORLDS = [...SOLAR_SYSTEM_PLANETS, PLUTO] as const;

export type SolarSystemCatalogEntry =
  | { profile: ExoplanetProfile; type: "world" }
  | { profile: StarProfile; type: "star" };

export const SOLAR_SYSTEM_CATALOG: readonly SolarSystemCatalogEntry[] = [
  { profile: SUN, type: "star" },
  ...SOLAR_SYSTEM_WORLDS.map((profile) => ({ profile, type: "world" as const })),
];

export const findSolarStar = (name: string): StarProfile | null =>
  name.trim().toLocaleLowerCase() === SUN.name.toLocaleLowerCase() ? SUN : null;

export const findSolarWorld = (name: string): ExoplanetProfile | null => {
  const normalized = name.trim().toLocaleLowerCase();
  const entry = SOLAR_SYSTEM_CATALOG.find(
    (candidate) =>
      candidate.type === "world" && candidate.profile.name.toLocaleLowerCase() === normalized,
  );
  return entry?.type === "world" ? entry.profile : null;
};

export const findSolarSystem = (hostStar: string) =>
  hostStar.trim().toLocaleLowerCase() === "sun"
    ? { cached: true, hostStar: "Sun", planets: [...SOLAR_SYSTEM_WORLDS] }
    : null;

const classifications: Readonly<Record<number, string>> = {
  199: "Mercurian planet",
  299: "Cloud-shrouded terrestrial planet",
  399: "Ocean-bearing terrestrial planet",
  499: "Cold desert terrestrial planet",
  599: "Jovian gas giant",
  699: "Ringed gas giant",
  799: "Sideways ice giant",
  899: "Storm-active ice giant",
  999: "Kuiper Belt dwarf planet",
};

/**
 * Catalog exoplanets are intentionally inferred; known planets are not. Keep the shared geometry
 * and shaders, but replace the random axial tilt and ring lottery with measured, recognisable
 * properties before either the close-up renderer or the system diorama sees the recipe.
 */
export const tuneSolarWorldRecipe = (
  profile: ExoplanetProfile,
  recipe: WorldRecipe,
): WorldRecipe => {
  const identity = profile.solarSystem;
  if (!identity || !["dwarf-planet", "planet"].includes(identity.bodyType)) return recipe;
  const base = {
    ...recipe,
    axialTilt:
      identity.axialTiltDegrees === null
        ? recipe.axialTilt
        : (identity.axialTiltDegrees * Math.PI) / 180,
    classification: classifications[identity.naifId] ?? recipe.classification,
    confidence: "high" as const,
    summary: identity.summary,
  };

  if (base.renderer === "rocky") {
    const atmosphereDensity =
      identity.naifId === 199
        ? 0.015
        : identity.naifId === 299
          ? 0.98
          : identity.naifId === 399
            ? 0.62
            : 0.11;
    const cloudCover =
      identity.naifId === 299
        ? 0.9
        : identity.naifId === 399
          ? 0.52
          : identity.naifId === 499
            ? 0.04
            : 0;
    return {
      ...base,
      atmosphere: { ...base.atmosphere, density: atmosphereDensity },
      rings: null,
      surface: {
        ...base.surface,
        cloudCover,
        iceCapStrength: identity.naifId === 399 ? 0.34 : identity.naifId === 499 ? 0.2 : 0,
        lavaStrength: 0,
        waterLevel: identity.naifId === 399 ? 0.46 : 0,
      },
      terrain: {
        ...base.terrain,
        atmosphereDensity,
        cloudCoverage: cloudCover,
        iceCoverage: identity.naifId === 399 ? 0.12 : identity.naifId === 499 ? 0.06 : 0,
        lavaCoverage: 0,
        oceanCoverage: identity.naifId === 399 ? 0.46 : 0,
      },
    };
  }

  if (base.renderer === "gas-giant") {
    const saturn = identity.naifId === 699;
    return {
      ...base,
      rings: {
        bands: saturn ? 12 : 4,
        color: saturn ? [0.82, 0.74, 0.59] : [0.44, 0.34, 0.25],
        gapiness: saturn ? 0.42 : 0.72,
        innerRadius: base.radiusSceneUnits * (saturn ? 1.18 : 1.42),
        opacity: saturn ? 0.52 : 0.035,
        outerRadius: base.radiusSceneUnits * (saturn ? 2.34 : 1.68),
      },
    };
  }

  return {
    ...base,
    rings: {
      ...base.rings,
      color: identity.naifId === 799 ? [0.45, 0.66, 0.68] : [0.3, 0.4, 0.52],
      opacity: identity.naifId === 799 ? 0.09 : 0.045,
    },
  };
};
