export type PlanetKind = "gas-giant" | "ice-giant" | "rocky" | "unknown";

export interface SolarSystemIdentity {
  /** IAU class of this object inside our own planetary system. */
  bodyType: "dwarf-planet" | "moon" | "planet" | "star";
  /** NAIF's permanent numeric body code, shared by JPL Horizons and SPICE. */
  naifId: number;
  /** The body this object directly orbits; null only for the Sun. */
  parent: string | null;
  /** Sidereal rotation, signed so retrograde rotation remains observable. */
  rotationPeriodHours: number | null;
  /** A known body's factual one-line description, not an inferred visual summary. */
  summary: string;
  /** Obliquity to the body's orbital plane. */
  axialTiltDegrees: number | null;
  texture?: {
    credit: string;
    path: string;
    sourceUrl: string;
  };
}

export interface SolarSystemSource {
  archive: "NASA/JPL Solar System Dynamics";
  retrievedOn: string;
  table: "planetary-physical-parameters" | "planetary-satellite-physical-parameters";
}

export interface ExoplanetObservation {
  /**
   * Where the host system sits on the sky, in ICRS degrees, as the archive reports it.
   *
   * Paired with `distanceParsecs` this is the system's actual place in the galaxy, which is what
   * lets the renderer draw the real sky as seen from there rather than a generated one. Null for
   * a procedural world, which has no place among the real stars to be looked at from.
   */
  declinationDegrees: number | null;
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
  /**
   * Orbital eccentricity, dimensionless, as the archive reports it.
   *
   * Zero is a circle and a genuine measurement; null is the archive not having solved for one at
   * all, which is the common case for a transit detection. The two must never be conflated — a
   * renderer that needs a shape has to say out loud that it assumed the circle.
   */
  orbitalEccentricity: number | null;
  /**
   * Orbital inclination in degrees, measured from the plane of the sky: 90° is an orbit seen
   * edge-on, which is what a transiting planet has.
   *
   * The longitude of the ascending node is not catalogued alongside it, so this fixes how far an
   * orbit is tilted out of the sky plane but not which way it is turned. Null wherever the
   * archive did not solve for it.
   */
  orbitalInclinationDegrees: number | null;
  orbitalPeriodDays: number | null;
  radiusEarth: number | null;
  radiusJupiter: number | null;
  /** ICRS right ascension of the host system in degrees. See `declinationDegrees`. */
  rightAscensionDegrees: number | null;
  semiMajorAxisAu: number | null;
}

export interface ExoplanetProfile {
  hostStar: string;
  id: string;
  kind: PlanetKind;
  name: string;
  observation: ExoplanetObservation;
  solarSystem?: SolarSystemIdentity;
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
      }
    | SolarSystemSource;
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
  declinationDegrees: number | null;
  distanceParsecs: number | null;
  gaiaMagnitude: number | null;
  parallaxMas: number | null;
  properMotionDecMasPerYear: number | null;
  properMotionRaMasPerYear: number | null;
  radialVelocityKmPerSecond: number | null;
  rightAscensionDegrees: number | null;
  spectralType: string | null;
  visualMagnitude: number | null;
}

export interface StarProfile {
  catalogName: string;
  customization?: {
    activity: number;
    radius: number;
    rotation: number;
    seed: number;
    temperatureKelvin: number;
  };
  id: string;
  kind: StarKind;
  name: string;
  objectType: string;
  observation: StarObservation;
  solarSystem?: SolarSystemIdentity;
  source:
    | {
        archive: "SIMBAD";
        retrievedOn: string;
        tables: readonly ["basic", "ident", "allfluxes"];
      }
    | {
        archive: "Exora Custom Generator";
        retrievedOn: string;
        table: "procedural";
      }
    | SolarSystemSource;
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
    code: "INVALID_REQUEST" | "NOT_FOUND" | "RATE_LIMITED" | "UPSTREAM_UNAVAILABLE";
    message: string;
  };
}
