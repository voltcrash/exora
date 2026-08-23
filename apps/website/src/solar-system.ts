import type { ExoplanetProfile, StarProfile } from "@exora/contracts";

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

export type SolarSystemCatalogEntry =
  | { profile: ExoplanetProfile; type: "world" }
  | { profile: StarProfile; type: "star" };

export const SOLAR_SYSTEM_CATALOG: readonly SolarSystemCatalogEntry[] = [
  { profile: SUN, type: "star" },
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
