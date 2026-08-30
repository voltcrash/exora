import type { ExoplanetProfile } from "@exora/contracts";

export type { ExoplanetProfile } from "@exora/contracts";

export const featuredPlanet: ExoplanetProfile = {
  id: "gj-674-b",
  name: "GJ 674 b",
  hostStar: "GJ 674",
  kind: "ice-giant",
  observation: {
    radiusJupiter: 0.297,
    massJupiter: 0.035,
    radiusEarth: 3.33,
    massEarth: 11.09,
    equilibriumTemperatureKelvin: 530.8,
    orbitalEccentricity: 0.2,
    orbitalInclinationDegrees: null,
    orbitalPeriodDays: 4.6938,
    semiMajorAxisAu: 0.039,
    distanceParsecs: 4.54896,
    rightAscensionDegrees: 262.1700476,
    declinationDegrees: -46.8989826,
    discoveryYear: 2007,
    discoveryMethod: "Radial Velocity",
    hostSpectralType: "M2.5",
    hostTemperatureKelvin: 3_600,
    hostRadiusSolar: 0.36463,
    hostMassSolar: 0.35,
    hostLuminosityLogSolar: -1.796,
  },
  source: {
    archive: "NASA Exoplanet Archive",
    table: "pscomppars",
    retrievedOn: "2026-08-20",
  },
};
