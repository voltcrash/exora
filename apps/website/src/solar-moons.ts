import type { ExoplanetProfile } from "@exora/contracts";

const EARTH_GM_KM3_S2 = 398_600.436;
const EARTH_MEAN_RADIUS_KM = 6_371;

interface MoonParameters {
  axialTiltDegrees?: number;
  discoveryYear: number | null;
  equilibriumTemperatureKelvin: number;
  gmKm3PerSecond2: number;
  id: string;
  inclinationDegrees: number;
  name: string;
  naifId: number;
  orbitalPeriodDays: number;
  orbitalSemiMajorAxisKilometers: number;
  parent: "Earth" | "Jupiter" | "Mars" | "Neptune" | "Pluto" | "Saturn" | "Uranus";
  parentOrbitAu: number;
  parentOrbitalPeriodDays: number;
  radiusKilometers: number;
  retrograde?: boolean;
  summary: string;
}

const moon = ({
  axialTiltDegrees = 0,
  discoveryYear,
  equilibriumTemperatureKelvin,
  gmKm3PerSecond2,
  id,
  inclinationDegrees,
  name,
  naifId,
  orbitalPeriodDays,
  orbitalSemiMajorAxisKilometers,
  parent,
  parentOrbitAu,
  parentOrbitalPeriodDays,
  radiusKilometers,
  retrograde = false,
  summary,
}: MoonParameters): ExoplanetProfile => ({
  hostStar: "Sun",
  id: `solar-system-${id}`,
  kind: "rocky",
  name,
  observation: {
    declinationDegrees: null,
    distanceParsecs: 0,
    discoveryMethod: discoveryYear === null ? "Known since prehistory" : "Telescopic discovery",
    discoveryYear,
    equilibriumTemperatureKelvin,
    hostLuminosityLogSolar: 0,
    hostMassSolar: 1,
    hostRadiusSolar: 1,
    hostSpectralType: "G2 V",
    hostTemperatureKelvin: 5_772,
    massEarth: gmKm3PerSecond2 / EARTH_GM_KM3_S2,
    massJupiter: null,
    orbitalEccentricity: null,
    orbitalInclinationDegrees: null,
    orbitalPeriodDays: parentOrbitalPeriodDays,
    radiusEarth: radiusKilometers / EARTH_MEAN_RADIUS_KM,
    radiusJupiter: null,
    rightAscensionDegrees: null,
    semiMajorAxisAu: parentOrbitAu,
  },
  solarSystem: {
    axialTiltDegrees,
    bodyType: "moon",
    naifId,
    orbitalInclinationDegrees: inclinationDegrees,
    orbitalPeriodDays,
    orbitalSemiMajorAxisKilometers,
    parent,
    rotationPeriodHours: orbitalPeriodDays * 24 * (retrograde ? -1 : 1),
    summary,
    surfaceStatus: "mapped",
  },
  source: {
    archive: "NASA/JPL Solar System Dynamics",
    retrievedOn: "2026-08-23",
    table: "planetary-satellite-physical-parameters",
  },
});

export const MOON = moon({
  axialTiltDegrees: 6.68,
  discoveryYear: null,
  equilibriumTemperatureKelvin: 270,
  gmKm3PerSecond2: 4_902.8,
  id: "moon",
  inclinationDegrees: 5.145,
  name: "Moon",
  naifId: 301,
  orbitalPeriodDays: 27.321661,
  orbitalSemiMajorAxisKilometers: 384_400,
  parent: "Earth",
  parentOrbitAu: 1,
  parentOrbitalPeriodDays: 365.256,
  radiusKilometers: 1_737.4,
  summary:
    "Earth's tide-raising companion: a geologically preserved world of basaltic maria, ancient highlands, and polar water ice.",
});

export const PHOBOS = moon({
  discoveryYear: 1877,
  equilibriumTemperatureKelvin: 233,
  gmKm3PerSecond2: 0.0007087,
  id: "phobos",
  inclinationDegrees: 1.075,
  name: "Phobos",
  naifId: 401,
  orbitalPeriodDays: 0.31891,
  orbitalSemiMajorAxisKilometers: 9_376,
  parent: "Mars",
  parentOrbitAu: 1.5237,
  parentOrbitalPeriodDays: 686.98,
  radiusKilometers: 11.08,
  summary:
    "The larger inner moon of Mars, racing around the planet three times a day and slowly spiraling toward its future breakup.",
});

export const DEIMOS = moon({
  discoveryYear: 1877,
  equilibriumTemperatureKelvin: 233,
  gmKm3PerSecond2: 0.0000962,
  id: "deimos",
  inclinationDegrees: 0.93,
  name: "Deimos",
  naifId: 402,
  orbitalPeriodDays: 1.26244,
  orbitalSemiMajorAxisKilometers: 23_463,
  parent: "Mars",
  parentOrbitAu: 1.5237,
  parentOrbitalPeriodDays: 686.98,
  radiusKilometers: 6.2,
  summary:
    "Mars's tiny outer moon, a dark and dusty irregular body whose softened craters make it look almost smooth from afar.",
});

export const IO = moon({
  discoveryYear: 1610,
  equilibriumTemperatureKelvin: 110,
  gmKm3PerSecond2: 5_959.91547,
  id: "io",
  inclinationDegrees: 0.036,
  name: "Io",
  naifId: 501,
  orbitalPeriodDays: 1.769138,
  orbitalSemiMajorAxisKilometers: 421_800,
  parent: "Jupiter",
  parentOrbitAu: 5.2028,
  parentOrbitalPeriodDays: 4_332.59,
  radiusKilometers: 1_821.49,
  summary:
    "The most volcanically active world known, kneaded by Jupiter's tides into a sulfur-painted landscape of lava lakes and plumes.",
});

export const EUROPA = moon({
  discoveryYear: 1610,
  equilibriumTemperatureKelvin: 102,
  gmKm3PerSecond2: 3_202.7121,
  id: "europa",
  inclinationDegrees: 0.466,
  name: "Europa",
  naifId: 502,
  orbitalPeriodDays: 3.551181,
  orbitalSemiMajorAxisKilometers: 671_100,
  parent: "Jupiter",
  parentOrbitAu: 5.2028,
  parentOrbitalPeriodDays: 4_332.59,
  radiusKilometers: 1_560.8,
  summary:
    "A bright fractured ice shell hiding a global saltwater ocean, making Europa one of the Solar System's strongest habitats to investigate.",
});

export const GANYMEDE = moon({
  discoveryYear: 1610,
  equilibriumTemperatureKelvin: 110,
  gmKm3PerSecond2: 9_887.83275,
  id: "ganymede",
  inclinationDegrees: 0.177,
  name: "Ganymede",
  naifId: 503,
  orbitalPeriodDays: 7.154553,
  orbitalSemiMajorAxisKilometers: 1_070_400,
  parent: "Jupiter",
  parentOrbitAu: 5.2028,
  parentOrbitalPeriodDays: 4_332.59,
  radiusKilometers: 2_631.2,
  summary:
    "The Solar System's largest moon—bigger than Mercury—and the only moon known to generate its own magnetic field.",
});

export const CALLISTO = moon({
  discoveryYear: 1610,
  equilibriumTemperatureKelvin: 134,
  gmKm3PerSecond2: 7_179.2834,
  id: "callisto",
  inclinationDegrees: 0.192,
  name: "Callisto",
  naifId: 504,
  orbitalPeriodDays: 16.689018,
  orbitalSemiMajorAxisKilometers: 1_882_700,
  parent: "Jupiter",
  parentOrbitAu: 5.2028,
  parentOrbitalPeriodDays: 4_332.59,
  radiusKilometers: 2_410.3,
  summary:
    "An ancient, dark ice-rock world saturated with impact scars, preserving one of the oldest surfaces in the Solar System.",
});

export const MIMAS = moon({
  discoveryYear: 1789,
  equilibriumTemperatureKelvin: 64,
  gmKm3PerSecond2: 2.50349,
  id: "mimas",
  inclinationDegrees: 1.574,
  name: "Mimas",
  naifId: 601,
  orbitalPeriodDays: 0.942422,
  orbitalSemiMajorAxisKilometers: 185_540,
  parent: "Saturn",
  parentOrbitAu: 9.5388,
  parentOrbitalPeriodDays: 10_759.22,
  radiusKilometers: 198.2,
  summary:
    "A cratered ice moon dominated by the enormous Herschel basin, with evidence for a surprisingly young hidden ocean.",
});

export const ENCELADUS = moon({
  discoveryYear: 1789,
  equilibriumTemperatureKelvin: 75,
  gmKm3PerSecond2: 7.21037,
  id: "enceladus",
  inclinationDegrees: 0.009,
  name: "Enceladus",
  naifId: 602,
  orbitalPeriodDays: 1.370218,
  orbitalSemiMajorAxisKilometers: 238_040,
  parent: "Saturn",
  parentOrbitAu: 9.5388,
  parentOrbitalPeriodDays: 10_759.22,
  radiusKilometers: 252.1,
  summary:
    "A brilliant ice moon venting an ocean into space through south-polar tiger stripes—the source of Saturn's E ring.",
});

export const TETHYS = moon({
  discoveryYear: 1684,
  equilibriumTemperatureKelvin: 86,
  gmKm3PerSecond2: 41.21353,
  id: "tethys",
  inclinationDegrees: 1.091,
  name: "Tethys",
  naifId: 603,
  orbitalPeriodDays: 1.887802,
  orbitalSemiMajorAxisKilometers: 294_670,
  parent: "Saturn",
  parentOrbitAu: 9.5388,
  parentOrbitalPeriodDays: 10_759.22,
  radiusKilometers: 531.1,
  summary:
    "An almost pure water-ice moon split by the immense Ithaca Chasma and marked by the giant Odysseus impact basin.",
});

export const DIONE = moon({
  discoveryYear: 1684,
  equilibriumTemperatureKelvin: 87,
  gmKm3PerSecond2: 73.11607,
  id: "dione",
  inclinationDegrees: 0.028,
  name: "Dione",
  naifId: 604,
  orbitalPeriodDays: 2.736915,
  orbitalSemiMajorAxisKilometers: 377_420,
  parent: "Saturn",
  parentOrbitAu: 9.5388,
  parentOrbitalPeriodDays: 10_759.22,
  radiusKilometers: 561.4,
  summary:
    "A dense icy moon with bright tectonic cliffs, a heavily cratered face, and subtle hints of an ocean deep below.",
});

export const RHEA = moon({
  discoveryYear: 1672,
  equilibriumTemperatureKelvin: 76,
  gmKm3PerSecond2: 153.94175,
  id: "rhea",
  inclinationDegrees: 0.345,
  name: "Rhea",
  naifId: 605,
  orbitalPeriodDays: 4.518212,
  orbitalSemiMajorAxisKilometers: 527_070,
  parent: "Saturn",
  parentOrbitAu: 9.5388,
  parentOrbitalPeriodDays: 10_759.22,
  radiusKilometers: 763.5,
  summary:
    "Saturn's second-largest moon, an old ice-rock body covered in craters, wispy fractures, and a trace oxygen atmosphere.",
});

export const TITAN = moon({
  discoveryYear: 1655,
  equilibriumTemperatureKelvin: 82,
  gmKm3PerSecond2: 8_978.1371,
  id: "titan",
  inclinationDegrees: 0.349,
  name: "Titan",
  naifId: 606,
  orbitalPeriodDays: 15.945421,
  orbitalSemiMajorAxisKilometers: 1_221_870,
  parent: "Saturn",
  parentOrbitAu: 9.5388,
  parentOrbitalPeriodDays: 10_759.22,
  radiusKilometers: 2_574.76,
  summary:
    "A planet-scale moon with a dense nitrogen sky, methane weather, dunes, rivers, and hydrocarbon seas—the only liquid lakes beyond Earth.",
});

export const IAPETUS = moon({
  discoveryYear: 1671,
  equilibriumTemperatureKelvin: 90,
  gmKm3PerSecond2: 120.51511,
  id: "iapetus",
  inclinationDegrees: 15.47,
  name: "Iapetus",
  naifId: 608,
  orbitalPeriodDays: 79.3215,
  orbitalSemiMajorAxisKilometers: 3_560_820,
  parent: "Saturn",
  parentOrbitAu: 9.5388,
  parentOrbitalPeriodDays: 10_759.22,
  radiusKilometers: 734.3,
  summary:
    "Saturn's two-tone moon: one hemisphere charcoal-dark, the other bright ice, with an equatorial ridge wrapping much of the world.",
});

export const MIRANDA = moon({
  discoveryYear: 1948,
  equilibriumTemperatureKelvin: 59,
  gmKm3PerSecond2: 4.3,
  id: "miranda",
  inclinationDegrees: 4.338,
  name: "Miranda",
  naifId: 705,
  orbitalPeriodDays: 1.413479,
  orbitalSemiMajorAxisKilometers: 129_390,
  parent: "Uranus",
  parentOrbitAu: 19.1914,
  parentOrbitalPeriodDays: 30_688.5,
  radiusKilometers: 235.8,
  summary:
    "A small ice moon with one of the strangest landscapes seen: enormous coronae, jumbled provinces, and kilometer-high scarps.",
});

export const ARIEL = moon({
  discoveryYear: 1851,
  equilibriumTemperatureKelvin: 60,
  gmKm3PerSecond2: 83.5,
  id: "ariel",
  inclinationDegrees: 0.26,
  name: "Ariel",
  naifId: 701,
  orbitalPeriodDays: 2.520379,
  orbitalSemiMajorAxisKilometers: 191_020,
  parent: "Uranus",
  parentOrbitAu: 19.1914,
  parentOrbitalPeriodDays: 30_688.5,
  radiusKilometers: 578.9,
  summary:
    "The brightest Uranian moon, carved by long fault valleys and resurfaced by ancient flows that hint at past internal activity.",
});

export const UMBRIEL = moon({
  discoveryYear: 1851,
  equilibriumTemperatureKelvin: 58,
  gmKm3PerSecond2: 85.1,
  id: "umbriel",
  inclinationDegrees: 0.205,
  name: "Umbriel",
  naifId: 702,
  orbitalPeriodDays: 4.144177,
  orbitalSemiMajorAxisKilometers: 266_300,
  parent: "Uranus",
  parentOrbitAu: 19.1914,
  parentOrbitalPeriodDays: 30_688.5,
  radiusKilometers: 584.7,
  summary:
    "The darkest major moon of Uranus, an old cratered ice-rock world with a mysterious bright ring on crater Wunda's floor.",
});

export const TITANIA = moon({
  discoveryYear: 1787,
  equilibriumTemperatureKelvin: 60,
  gmKm3PerSecond2: 226.9,
  id: "titania",
  inclinationDegrees: 0.34,
  name: "Titania",
  naifId: 703,
  orbitalPeriodDays: 8.705872,
  orbitalSemiMajorAxisKilometers: 435_910,
  parent: "Uranus",
  parentOrbitAu: 19.1914,
  parentOrbitalPeriodDays: 30_688.5,
  radiusKilometers: 788.9,
  summary:
    "Uranus's largest moon, a canyon-cut ice-rock world whose fault systems record a long history of interior expansion.",
});

export const OBERON = moon({
  discoveryYear: 1787,
  equilibriumTemperatureKelvin: 58,
  gmKm3PerSecond2: 205.3,
  id: "oberon",
  inclinationDegrees: 0.058,
  name: "Oberon",
  naifId: 704,
  orbitalPeriodDays: 13.463239,
  orbitalSemiMajorAxisKilometers: 583_520,
  parent: "Uranus",
  parentOrbitAu: 19.1914,
  parentOrbitalPeriodDays: 30_688.5,
  radiusKilometers: 761.4,
  summary:
    "The outermost major moon of Uranus, a dark ancient world where bright ice spills from crater walls and chasmata split the crust.",
});

export const TRITON = moon({
  discoveryYear: 1846,
  equilibriumTemperatureKelvin: 38,
  gmKm3PerSecond2: 1_428.49546,
  id: "triton",
  inclinationDegrees: 156.865,
  name: "Triton",
  naifId: 801,
  orbitalPeriodDays: 5.876854,
  orbitalSemiMajorAxisKilometers: 354_800,
  parent: "Neptune",
  parentOrbitAu: 30.0611,
  parentOrbitalPeriodDays: 60_182,
  radiusKilometers: 1_352.6,
  retrograde: true,
  summary:
    "A captured Kuiper Belt world orbiting backward, with a young nitrogen-ice surface, cantaloupe terrain, and active geysers.",
});

export const CHARON = moon({
  discoveryYear: 1978,
  equilibriumTemperatureKelvin: 53,
  gmKm3PerSecond2: 106.1,
  id: "charon",
  inclinationDegrees: 0.001,
  name: "Charon",
  naifId: 901,
  orbitalPeriodDays: 6.38723,
  orbitalSemiMajorAxisKilometers: 19_596,
  parent: "Pluto",
  parentOrbitAu: 39.482,
  parentOrbitalPeriodDays: 90_560,
  radiusKilometers: 606,
  retrograde: true,
  summary:
    "Pluto's enormous companion, marked by a rust-red polar cap, a globe-spanning canyon belt, and smooth resurfaced plains.",
});

export const SOLAR_SYSTEM_MOON_GROUPS = [
  { moons: [MOON], parent: "Earth" },
  { moons: [PHOBOS, DEIMOS], parent: "Mars" },
  { moons: [IO, EUROPA, GANYMEDE, CALLISTO], parent: "Jupiter" },
  { moons: [MIMAS, ENCELADUS, TETHYS, DIONE, RHEA, TITAN, IAPETUS], parent: "Saturn" },
  { moons: [MIRANDA, ARIEL, UMBRIEL, TITANIA, OBERON], parent: "Uranus" },
  { moons: [TRITON], parent: "Neptune" },
  { moons: [CHARON], parent: "Pluto" },
] as const;

export const SOLAR_SYSTEM_MOONS = SOLAR_SYSTEM_MOON_GROUPS.flatMap(({ moons }) => moons);
