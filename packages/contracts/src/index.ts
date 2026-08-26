export type PlanetKind = "gas-giant" | "ice-giant" | "rocky" | "unknown";

export interface SolarSystemIdentity {
  /** IAU class of this object inside our own planetary system. */
  bodyType: "dwarf-planet" | "moon" | "planet" | "star";
  /** NAIF's permanent numeric body code, shared by JPL Horizons and SPICE. */
  naifId: number;
  /** JPL Horizons/SBDB SPK identifier. It differs from the legacy NAIF code for some asteroids. */
  spkId?: string;
  /** The body this object directly orbits; null only for the Sun. */
  parent: string | null;
  /** Inclination to the body's local reference plane (the ecliptic for planets). */
  orbitalInclinationDegrees: number | null;
  /** Sidereal period around the direct parent, used for moons whose host star is still the Sun. */
  orbitalPeriodDays?: number | null;
  /** Mean distance from the direct parent; deliberately kept separate from heliocentric AU. */
  orbitalSemiMajorAxisKilometers?: number | null;
  /** Sidereal rotation, signed so retrograde rotation remains observable. */
  rotationPeriodHours: number | null;
  /** A known body's factual one-line description, not an inferred visual summary. */
  summary: string;
  /** Obliquity to the body's orbital plane. */
  axialTiltDegrees: number | null;
  /** Measured full-axis dimensions, ordered longest to shortest. */
  dimensionsKilometers?: readonly [number, number, number];
  /** How faithfully the visible surface can be tied to observations. */
  surfaceStatus?: "mapped" | "modeled" | "unresolved";
  /** Plain-language disclosure for incomplete coverage or constrained visualizations. */
  surfaceNote?: string;
  texture?: {
    credit: string;
    license?: string;
    mission?: string;
    originalUrl?: string;
    path: string;
    retrievedOn?: string;
    sourceUrl: string;
    topography?: {
      credit: string;
      license: string;
      originalUrl: string;
      path: string;
      retrievalDate: string;
      /** Peak-to-peak display relief as a fraction of mean radius. */
      reliefScale: number;
    };
  };
}

export interface SolarSystemSource {
  archive: "NASA/JPL Small-Body Database" | "NASA/JPL Solar System Dynamics";
  retrievedOn: string;
  table:
    | "planetary-physical-parameters"
    | "planetary-satellite-physical-parameters"
    | "sbdb-api-v1.3";
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
  /** Preferred SIMBAD stellar-diameter measurement, converted to kilometres when possible. */
  diameterKilometers?: number | null;
  distanceParsecs: number | null;
  /** Preferred effective-temperature measurement from SIMBAD's mesFe_h collection. */
  effectiveTemperatureKelvin?: number | null;
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
  /** SIMBAD identifiers for this same object, used to bridge archive naming differences. */
  aliases?: readonly string[];
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
        tables:
          | readonly ["basic", "ident", "allfluxes"]
          | readonly ["basic", "ident", "allfluxes", "mesDiameter", "mesFe_h"];
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

export interface EphemerisVector {
  /** The UTC instant requested by Exora and evaluated by Horizons. */
  epoch: string;
  name: string;
  /** Permanent NAIF body code used by Exora's authored Solar System catalog. */
  naifId: number;
  /** Permanent Horizons/SPK identity, retained separately where the small-body code differs. */
  spkId: string;
  /** Heliocentric ecliptic-J2000 geometric position, in astronomical units. */
  positionAu: { x: number; y: number; z: number };
  /** Horizons' permanent major-body kernel or small-body orbital-solution label. */
  solution: string;
  /** Heliocentric ecliptic-J2000 geometric velocity, in astronomical units per day. */
  velocityAuPerDay: { x: number; y: number; z: number };
}

export interface EphemerisResponse {
  data: EphemerisVector[];
  meta: {
    /** True only when every vector came from Exora's server-side cache. */
    cached: boolean;
    center: "Sun (10)";
    coordinateFrame: "Ecliptic J2000";
    epoch: string;
    retrievedAt: string;
    source: "NASA/JPL Horizons API";
    sourceVersion: string;
    /** True when expired cache entries were served because Horizons could not answer. */
    stale: boolean;
  };
}

export interface MissionTrajectoryPoint {
  /** Calendar timestamp normalized with an explicit TDB time-scale suffix. */
  calendarTdb: string;
  /** Julian Date in the TDB time scale. */
  julianDateTdb: number;
  /** Heliocentric ecliptic-J2000 geometric position, in astronomical units. */
  positionAu: { x: number; y: number; z: number };
  /** Heliocentric ecliptic-J2000 geometric velocity, in astronomical units per day. */
  velocityAuPerDay: { x: number; y: number; z: number };
}

export interface MissionTrajectoryResponse {
  data: MissionTrajectoryPoint[];
  meta: {
    cached: boolean;
    center: "Sun (10)";
    coordinateFrame: "Ecliptic J2000";
    retrievedAt: string;
    solution: string;
    source: "NASA/JPL Horizons API";
    sourceVersion: string;
    spkId: string;
    stale: boolean;
    stepDays: number;
    targetName: string;
  };
}

export type SmallBodyKind = "asteroid" | "comet";
export type SmallBodyLookup = "auto" | "designation" | "spk";

/** One SBDB value kept with the uncertainty, units, and citation JPL attached to it. */
export interface SmallBodyParameter {
  name: string;
  reference: string | null;
  title: string;
  uncertainty: string | null;
  units: string | null;
  value: string;
}

export interface SmallBodyCloseApproach {
  body: string;
  calendarDate: string;
  distanceAu: number;
  distanceMaximumAu: number | null;
  distanceMinimumAu: number | null;
  julianDate: number | null;
  relativeVelocityKilometersPerSecond: number | null;
  timeUncertaintySeconds: number | null;
}

export interface SmallBodyProfile {
  closeApproaches: SmallBodyCloseApproach[];
  designation: string;
  fullName: string;
  kind: SmallBodyKind;
  nearEarth: boolean | null;
  orbit: {
    conditionCode: string | null;
    dataArcDays: number | null;
    elements: SmallBodyParameter[];
    epochJulianDate: number | null;
    firstObservation: string | null;
    lastObservation: string | null;
    solutionDate: string | null;
    solutionId: string | null;
  };
  orbitClass: { code: string; name: string } | null;
  physicalParameters: SmallBodyParameter[];
  potentiallyHazardous: boolean | null;
  spkId: string;
}

export interface SmallBodyMatch {
  designation: string;
  name: string;
}

export interface SmallBodySearchResponse {
  data: SmallBodyProfile | null;
  matches: SmallBodyMatch[];
  meta: {
    cached: boolean;
    lookup: SmallBodyLookup;
    query: string;
    retrievedAt: string;
    source: "NASA/JPL Small-Body Database (SBDB) API";
    sourceVersion: string;
    stale: boolean;
    status: "ambiguous" | "match" | "not-found";
  };
}

export interface ApiErrorResponse {
  error: {
    code: "INVALID_REQUEST" | "NOT_FOUND" | "RATE_LIMITED" | "UPSTREAM_UNAVAILABLE";
    message: string;
  };
}
