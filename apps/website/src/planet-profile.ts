export type PlanetKind = "gas-giant" | "rocky" | "ice-giant";

export interface ExoplanetObservation {
  distanceParsecs: number;
  discoveryMethod: string;
  discoveryYear: number;
  equilibriumTemperatureKelvin: number;
  hostSpectralType: string | null;
  massJupiter: number;
  orbitalPeriodDays: number | null;
  radiusJupiter: number;
  semiMajorAxisAu: number | null;
}

export interface ExoplanetProfile {
  hostStar: string;
  id: string;
  kind: PlanetKind;
  name: string;
  observation: ExoplanetObservation;
  source: {
    archive: string;
    retrievedOn: string;
    table: string;
  };
}

/**
 * A local first-draft fixture from the NASA Exoplanet Archive composite table.
 * The renderer consumes this shape instead of depending on archive column names.
 */
export const featuredPlanet: ExoplanetProfile = {
  id: "hip-65426-b",
  name: "HIP 65426 b",
  hostStar: "HIP 65426",
  kind: "gas-giant",
  observation: {
    radiusJupiter: 1.5,
    massJupiter: 9,
    equilibriumTemperatureKelvin: 1500,
    orbitalPeriodDays: null,
    semiMajorAxisAu: 92,
    distanceParsecs: 108.875,
    discoveryYear: 2017,
    discoveryMethod: "Imaging",
    hostSpectralType: "A2 V",
  },
  source: {
    archive: "NASA Exoplanet Archive",
    table: "pscomppars",
    retrievedOn: "2026-08-13",
  },
};
