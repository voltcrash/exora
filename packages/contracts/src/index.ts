export type PlanetKind = "gas-giant" | "ice-giant" | "rocky" | "unknown";

export interface ExoplanetObservation {
  distanceParsecs: number | null;
  discoveryMethod: string;
  discoveryYear: number | null;
  equilibriumTemperatureKelvin: number | null;
  hostLuminosityLogSolar: number | null;
  hostMassSolar: number | null;
  hostRadiusSolar: number | null;
  hostSpectralType: string | null;
  hostTemperatureKelvin: number | null;
  massEarth: number | null;
  massJupiter: number | null;
  orbitalPeriodDays: number | null;
  radiusEarth: number | null;
  radiusJupiter: number | null;
  semiMajorAxisAu: number | null;
}

export interface ExoplanetProfile {
  hostStar: string;
  id: string;
  kind: PlanetKind;
  name: string;
  observation: ExoplanetObservation;
  source:
    | {
        archive: "NASA Exoplanet Archive";
        retrievedOn: string;
        table: "pscomppars";
      }
    | {
        archive: "Exora Custom Generator";
        retrievedOn: string;
        table: "procedural";
      };
}

export interface ApiMetadata {
  cached: boolean;
  source: "NASA Exoplanet Archive";
}

export interface PlanetResponse {
  data: ExoplanetProfile;
  meta: ApiMetadata;
}

export interface PlanetSearchResponse {
  data: ExoplanetProfile[];
  meta: ApiMetadata & {
    count: number;
    query: string;
  };
}

export interface ApiErrorResponse {
  error: {
    code: "INVALID_REQUEST" | "NOT_FOUND" | "UPSTREAM_UNAVAILABLE";
    message: string;
  };
}
