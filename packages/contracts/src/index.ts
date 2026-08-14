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

export type StarKind =
  | "binary"
  | "evolved"
  | "main-sequence"
  | "neutron-star"
  | "star"
  | "variable"
  | "white-dwarf";

export interface StarObservation {
  declinationDegrees: number;
  distanceParsecs: number | null;
  gaiaMagnitude: number | null;
  parallaxMas: number | null;
  properMotionDecMasPerYear: number | null;
  properMotionRaMasPerYear: number | null;
  radialVelocityKmPerSecond: number | null;
  rightAscensionDegrees: number;
  spectralType: string | null;
  visualMagnitude: number | null;
}

export interface StarProfile {
  catalogName: string;
  id: string;
  kind: StarKind;
  name: string;
  objectType: string;
  observation: StarObservation;
  source: {
    archive: "SIMBAD";
    retrievedOn: string;
    tables: readonly ["basic", "ident", "allfluxes"];
  };
}

export interface StarApiMetadata {
  cached: boolean;
  source: "SIMBAD";
}

export interface StarResponse {
  data: StarProfile;
  meta: StarApiMetadata;
}

export interface StarSearchResponse {
  data: StarProfile[];
  meta: StarApiMetadata & {
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
