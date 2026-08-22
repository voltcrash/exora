import type { ExoplanetProfile } from "@exora/contracts";

export type { ExoplanetProfile } from "@exora/contracts";

/**
 * A resilient local fixture used while the API starts or when NASA TAP cannot
 * be reached. The renderer consumes Exora's normalized contract either way.
 */
export const featuredPlanet: ExoplanetProfile = {
  id: "kepler-297-b",
  name: "Kepler-297 b",
  hostStar: "Kepler-297",
  kind: "ice-giant",
  observation: {
    radiusJupiter: 0.256,
    massJupiter: 0.153,
    radiusEarth: 2.87,
    massEarth: 48.5,
    equilibriumTemperatureKelvin: 509,
    orbitalPeriodDays: 38.871826,
    semiMajorAxisAu: 0.217,
    distanceParsecs: 692.14,
    rightAscensionDegrees: 283.2091605,
    declinationDegrees: 48.7776156,
    discoveryYear: 2014,
    discoveryMethod: "Transit",
    hostSpectralType: null,
    hostTemperatureKelvin: 5_619,
    hostRadiusSolar: 0.915,
    hostMassSolar: 0.927,
    hostLuminosityLogSolar: -0.09608,
  },
  source: {
    archive: "NASA Exoplanet Archive",
    table: "pscomppars",
    retrievedOn: "2026-08-20",
  },
};
