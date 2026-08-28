import type { ExoplanetProfile, StarProfile } from "@exora/contracts";
import type { Rgb, WorldRecipe } from "@exora/worldgen";
import { SOLAR_SYSTEM_MOON_GROUPS, SOLAR_SYSTEM_MOONS } from "./solar-moons.ts";
import { measuredSurfaceAppearance } from "./surface-geology.ts";

export { SOLAR_SYSTEM_MOON_GROUPS, SOLAR_SYSTEM_MOONS } from "./solar-moons.ts";

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
    diameterKilometers: 1_391_400,
    distanceParsecs: 0,
    effectiveTemperatureKelvin: 5_772,
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
  axialTiltDegrees: number | null;
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
  spkId?: string;
  orbitalPeriodDays: number;
  radiusEarth: number;
  radiusJupiter?: number;
  rotationPeriodHours: number;
  semiMajorAxisAu: number;
  summary: string;
  dimensionsKilometers?: readonly [number, number, number];
  surfaceNote?: string;
  surfaceStatus?: "mapped" | "modeled" | "unresolved";
  texture?: {
    credit: string;
    license?: string;
    mission?: string;
    originalUrl?: string;
    page: string;
    topography?: {
      credit: string;
      license: string;
      originalUrl: string;
      path: string;
      reliefScale: number;
    };
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
  spkId,
  orbitalPeriodDays,
  radiusEarth,
  radiusJupiter,
  rotationPeriodHours,
  semiMajorAxisAu,
  summary,
  dimensionsKilometers,
  surfaceNote,
  surfaceStatus,
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
    ...(dimensionsKilometers ? { dimensionsKilometers } : {}),
    naifId,
    ...(spkId ? { spkId } : {}),
    orbitalInclinationDegrees: inclinationDegrees,
    parent: "Sun",
    rotationPeriodHours,
    summary,
    ...(surfaceNote ? { surfaceNote } : {}),
    ...(surfaceStatus ? { surfaceStatus } : {}),
    ...(texture
      ? {
          texture: {
            credit: texture.credit,
            ...(texture.license ? { license: texture.license } : {}),
            ...(texture.mission ? { mission: texture.mission } : {}),
            ...(texture.originalUrl ? { originalUrl: texture.originalUrl } : {}),
            path: `/textures/solar-system/${id}.jpg`,
            retrievedOn: "2026-08-23",
            sourceUrl: texture.page,
            ...(texture.topography
              ? {
                  topography: {
                    ...texture.topography,
                    retrievalDate: "2026-08-23",
                  },
                }
              : {}),
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
    credit: "NASA Cassini ISS / JPL-Caltech / Space Science Institute",
    page: "https://science.nasa.gov/photojournal/cassinis-best-maps-of-jupiter-cylindrical-map/",
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

export const CERES = planet({
  axialTiltDegrees: 4,
  bodyType: "dwarf-planet",
  dimensionsKilometers: [964.4, 964.2, 891.8],
  discoveryMethod: "Telescopic observation by Giuseppe Piazzi",
  discoveryYear: 1801,
  eccentricity: 0.0796923,
  equilibriumTemperatureKelvin: 168,
  id: "ceres",
  inclinationDegrees: 10.588,
  kind: "rocky",
  massEarth: 0.0001571,
  name: "Ceres",
  naifId: 2_000_001,
  orbitalPeriodDays: 1_679.853,
  radiusEarth: 0.07372,
  rotationPeriodHours: 9.07417,
  semiMajorAxisAu: 2.765553,
  spkId: "20000001",
  summary:
    "The largest body in the main belt: a water-rich dwarf planet whose Dawn-mapped crust preserves brines, cryovolcanism, and Occator's bright salt deposits.",
  surfaceNote:
    "Dawn FC global mosaic with stereo-derived HAMO topography. Illumination differences and the south-polar coverage limits remain visible; relief is displayed at measured scale.",
  surfaceStatus: "mapped",
  texture: {
    credit: "NASA/JPL-Caltech/UCLA/MPS/DLR/IDA · USGS Astrogeology",
    license: "US Government work; cite mission product authors",
    mission: "Dawn FC2 HAMO",
    originalUrl:
      "https://astrogeology.usgs.gov/ckan/dataset/6ad84c9a-1fad-4869-b4f6-b52c5c2ace36/resource/9f757a65-8d8a-4349-a72d-8062387574b3/download/ceres_dawn_fc_dlr_global_feb2016_1024.jpg",
    page: "https://astrogeology.usgs.gov/search/map/ceres_dawn_fc_global_mosaic_140m",
    topography: {
      credit: "DLR · Dawn FC2 · USGS Astrogeology",
      license: "US Government work; cite Preusker et al. (2016)",
      originalUrl:
        "https://astrogeology.usgs.gov/ckan/dataset/1a165f71-5f31-44b6-b770-63e53b53902e/resource/a407b289-19ab-451d-bd3d-e423b9949a08/download/ceres_dawn_fc_hamo_dtm_dlr_global_1024.jpg",
      path: "/textures/solar-system/ceres-topography.jpg",
      reliefScale: 0.032,
    },
  },
});

export const ERIS = planet({
  axialTiltDegrees: null,
  bodyType: "dwarf-planet",
  dimensionsKilometers: [2_400, 2_400, 2_400],
  discoveryMethod: "CCD survey images by Brown, Trujillo, and Rabinowitz",
  discoveryYear: 2005,
  eccentricity: 0.438239,
  equilibriumTemperatureKelvin: 30,
  id: "eris",
  inclinationDegrees: 43.926,
  kind: "rocky",
  massEarth: 0.00278,
  name: "Eris",
  naifId: 20_136_199,
  orbitalPeriodDays: 204_516.663,
  radiusEarth: 0.18835,
  rotationPeriodHours: 25.9,
  semiMajorAxisAu: 67.93395,
  spkId: "20136199",
  summary:
    "A massive, methane-frosted scattered-disk dwarf planet whose discovery forced astronomy to define the modern planet category.",
  surfaceNote:
    "No spacecraft has resolved Eris. The neutral methane-ice material encodes measured color and albedo constraints only; it contains no invented terrain.",
  surfaceStatus: "unresolved",
});

export const HAUMEA = planet({
  axialTiltDegrees: null,
  bodyType: "dwarf-planet",
  dimensionsKilometers: [2_322, 1_704, 1_026],
  discoveryMethod: "Observatory survey imaging; discovery credit remains disputed",
  discoveryYear: 2003,
  eccentricity: 0.194443,
  equilibriumTemperatureKelvin: 50,
  id: "haumea",
  inclinationDegrees: 28.208,
  kind: "rocky",
  massEarth: 0.000671,
  name: "Haumea",
  naifId: 20_136_108,
  orbitalPeriodDays: 103_208.117,
  radiusEarth: 0.11223,
  rotationPeriodHours: 3.9154,
  semiMajorAxisAu: 43.06029,
  spkId: "20136108",
  summary:
    "A rapidly rotating, triaxial Kuiper Belt dwarf planet with a water-ice-rich surface, two moons, a collisional family, and a narrow ring.",
  surfaceNote:
    "Haumea is unresolved as a globe. Its measured occultation-constrained triaxial proportions are retained, while the neutral water-ice material carries no fictional geography.",
  surfaceStatus: "modeled",
});

export const MAKEMAKE = planet({
  axialTiltDegrees: null,
  bodyType: "dwarf-planet",
  dimensionsKilometers: [1_434, 1_428, 1_428],
  discoveryMethod: "CCD survey images by Brown, Trujillo, and Rabinowitz",
  discoveryYear: 2005,
  eccentricity: 0.158889,
  equilibriumTemperatureKelvin: 37,
  id: "makemake",
  inclinationDegrees: 29.028,
  kind: "rocky",
  massEarth: 0.000519,
  name: "Makemake",
  naifId: 20_136_472,
  orbitalPeriodDays: 112_364.807,
  radiusEarth: 0.11231,
  rotationPeriodHours: 22.8266,
  semiMajorAxisAu: 45.57093,
  spkId: "20136472",
  summary:
    "A bright methane- and ethane-frosted Kuiper Belt dwarf planet with a very dark, unresolved satellite provisionally called MK2.",
  surfaceNote:
    "Makemake has not been resolved as a mapped globe. The visualization is a spectrally constrained methane-frost material without synthetic landforms.",
  surfaceStatus: "unresolved",
});

export const SOLAR_SYSTEM_DWARF_PLANETS = [CERES, PLUTO, ERIS, HAUMEA, MAKEMAKE] as const;

export const SOLAR_SYSTEM_WORLDS = [
  ...SOLAR_SYSTEM_PLANETS,
  ...SOLAR_SYSTEM_DWARF_PLANETS,
] as const;

export type SolarSystemCatalogEntry =
  | { profile: ExoplanetProfile; type: "world" }
  | { profile: StarProfile; type: "star" };

export const SOLAR_SYSTEM_CATALOG: readonly SolarSystemCatalogEntry[] = [
  { profile: SUN, type: "star" },
  ...SOLAR_SYSTEM_WORLDS.map((profile) => ({ profile, type: "world" as const })),
  ...SOLAR_SYSTEM_MOONS.map((profile) => ({ profile, type: "world" as const })),
];

export const SOLAR_SYSTEM_CATALOG_GROUPS = [
  {
    entries: [{ profile: SUN, type: "star" as const }],
    label: "Sun · home star",
  },
  {
    entries: SOLAR_SYSTEM_PLANETS.map((profile) => ({ profile, type: "world" as const })),
    label: "Planets · 8 worlds",
  },
  {
    entries: SOLAR_SYSTEM_DWARF_PLANETS.map((profile) => ({
      profile,
      type: "world" as const,
    })),
    label: "Dwarf planets · 5 worlds",
  },
  ...SOLAR_SYSTEM_MOON_GROUPS.map(({ moons, parent }) => ({
    entries: moons.map((profile) => ({ profile, type: "world" as const })),
    label: `${parent} system · ${moons.length} mapped moon${moons.length === 1 ? "" : "s"}`,
  })),
] as const;

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
  2000001: "Dawn-mapped main-belt dwarf planet",
  20136108: "Rapidly rotating triaxial dwarf planet",
  20136199: "Scattered-disk dwarf planet",
  20136472: "Methane-frosted Kuiper Belt dwarf planet",
  120136108: "Unresolved outer Haumean moon",
  120136199: "Unresolved Eridian moon",
  120136472: "Unresolved Makemakean moon",
  220136108: "Unresolved inner Haumean moon",
  199: "Mercurian planet",
  299: "Cloud-shrouded terrestrial planet",
  399: "Ocean-bearing terrestrial planet",
  499: "Cold desert terrestrial planet",
  599: "Jovian gas giant",
  699: "Ringed gas giant",
  799: "Sideways ice giant",
  301: "Earth's natural satellite",
  401: "Inner Martian moon",
  402: "Outer Martian moon",
  501: "Tidally heated volcanic moon",
  502: "Ocean-bearing ice moon",
  503: "Magnetized ocean moon",
  504: "Ancient cratered ice moon",
  601: "Cratered ocean-candidate moon",
  602: "Ocean-bearing cryovolcanic moon",
  603: "Water-ice moon",
  604: "Tectonic ice moon",
  605: "Cratered ice-rock moon",
  606: "Hazy ocean-bearing moon",
  608: "Two-tone ridge moon",
  701: "Resurfaced Uranian moon",
  702: "Dark cratered Uranian moon",
  703: "Largest Uranian moon",
  704: "Outer Uranian moon",
  705: "Corona-covered Uranian moon",
  801: "Captured retrograde ice moon",
  901: "Pluto's binary companion",
  899: "Storm-active ice giant",
  999: "Kuiper Belt dwarf planet",
};

export const tuneSolarWorldRecipe = (
  profile: ExoplanetProfile,
  recipe: WorldRecipe,
): WorldRecipe => {
  const identity = profile.solarSystem;
  if (!identity || !["dwarf-planet", "moon", "planet"].includes(identity.bodyType)) return recipe;
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
    const moon = identity.bodyType === "moon";
    const unresolved =
      identity.surfaceStatus === "unresolved" || identity.surfaceStatus === "modeled";
    const atmosphereDensity =
      identity.naifId === 606
        ? 0.94
        : identity.naifId === 801
          ? 0.035
          : moon
            ? 0.004
            : identity.naifId === 199
              ? 0.015
              : identity.naifId === 299
                ? 0.98
                : identity.naifId === 399
                  ? 0.62
                  : 0.11;
    const cloudCover =
      identity.naifId === 606
        ? 0.86
        : moon
          ? 0
          : identity.naifId === 299
            ? 0.9
            : identity.naifId === 399
              ? 0.52
              : identity.naifId === 499
                ? 0.04
                : 0;
    const appearance = unresolved ? null : measuredSurfaceAppearance(identity.naifId);
    return {
      ...base,
      atmosphere: { ...base.atmosphere, density: atmosphereDensity },
      rings: null,
      surface: {
        ...base.surface,
        ...(appearance
          ? {
              highColor: appearance.highColor,
              lowColor: appearance.lowColor,
              midColor: appearance.midColor,
            }
          : {}),
        ...(unresolved
          ? {
              craterDensity: 0,
              elevation: 0,
              highColor: [0.72, 0.75, 0.78] as [number, number, number],
              lowColor: [0.48, 0.51, 0.54] as [number, number, number],
              midColor: [0.61, 0.64, 0.67] as [number, number, number],
              roughness: 0.82,
            }
          : {}),
        cloudCover,
        iceCapStrength:
          identity.naifId === 399
            ? 0.34
            : identity.naifId === 499
              ? 0.2
              : moon && identity.naifId !== 501
                ? 0.12
                : 0,
        lavaStrength: identity.naifId === 501 ? 0.22 : 0,
        waterLevel: identity.naifId === 399 ? 0.46 : 0,
      },
      terrain: {
        ...base.terrain,
        ...(appearance ? { paletteFamily: appearance.paletteFamily } : {}),
        atmosphereDensity,
        cloudCoverage: cloudCover,
        iceCoverage:
          identity.naifId === 399
            ? 0.12
            : identity.naifId === 499
              ? 0.06
              : moon && identity.naifId !== 501
                ? 0.42
                : 0,
        lavaCoverage: identity.naifId === 501 ? 0.2 : 0,
        ...(unresolved
          ? {
              continentalFragmentation: 0,
              craterDensity: 0,
              erosionAmount: 0,
              mountainCoverage: 0,
              mountainHeight: 0,
              terrainRoughness: 0,
              volcanicActivity: 0,
            }
          : {}),
        oceanCoverage: identity.naifId === 399 ? 0.46 : 0,
      },
    };
  }

  if (base.renderer === "gas-giant") {
    const saturn = identity.naifId === 699;
    const cloudBands = saturn
      ? {
          deepColor: [0.16, 0.14, 0.1] as Rgb,
          lightColor: [0.96, 0.89, 0.71] as Rgb,
          midColor: [0.63, 0.53, 0.34] as Rgb,
        }
      : {
          deepColor: [0.11, 0.08, 0.07] as Rgb,
          lightColor: [0.92, 0.82, 0.63] as Rgb,
          midColor: [0.52, 0.33, 0.19] as Rgb,
        };
    return {
      ...base,
      cloudBands: { ...base.cloudBands, ...cloudBands },
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

  const uranus = identity.naifId === 799;
  return {
    ...base,
    atmosphereBands: {
      ...base.atmosphereBands,
      deepColor: uranus ? [0.07, 0.17, 0.2] : [0.02, 0.08, 0.24],
      hazeColor: uranus ? [0.3, 0.56, 0.6] : [0.12, 0.31, 0.66],
      lightColor: uranus ? [0.7, 0.88, 0.9] : [0.56, 0.73, 0.95],
    },
    rings: {
      ...base.rings,
      color: uranus ? [0.45, 0.66, 0.68] : [0.3, 0.4, 0.52],
      opacity: uranus ? 0.09 : 0.045,
    },
  };
};
