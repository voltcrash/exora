import type { ExoplanetProfile } from "@exora/contracts";

/*
 * A COMPACT, COMMITTED PSCOMPPARS SNAPSHOT
 *
 * Every confirmed planet as one array of values under a shared list of field paths, sorted by name.
 * Values are exactly what the API's row normalization produced; anything NASA left blank stays
 * null. The source object is the same for every row, so it is stored once.
 */

export const PLANET_CATALOG_FORMAT = 1;

export const PLANET_CATALOG_FIELDS = [
  "id",
  "name",
  "hostStar",
  "kind",
  "observation.radiusJupiter",
  "observation.massJupiter",
  "observation.radiusEarth",
  "observation.massEarth",
  "observation.massProvenance",
  "observation.radiusProvenance",
  "observation.equilibriumTemperatureKelvin",
  "observation.orbitalEccentricity",
  "observation.orbitalInclinationDegrees",
  "observation.orbitalPeriodDays",
  "observation.semiMajorAxisAu",
  "observation.distanceParsecs",
  "observation.rightAscensionDegrees",
  "observation.declinationDegrees",
  "observation.discoveryYear",
  "observation.discoveryMethod",
  "observation.hostSpectralType",
  "observation.hostTemperatureKelvin",
  "observation.hostRadiusSolar",
  "observation.hostMassSolar",
  "observation.hostLuminosityLogSolar",
  "observation.signal.impactParameter",
  "observation.signal.orbitalPeriodUncertaintyDays",
  "observation.signal.radialVelocityAmplitudeMetersPerSecond",
  "observation.signal.radiusRatio",
  "observation.signal.transitDepthPercent",
  "observation.signal.transitDurationHours",
  "observation.signal.transitMidpointBjd",
  "observation.signal.transitMidpointUncertaintyDays",
] as const;

export type PlanetCatalogValue = string | number | null;

export interface PlanetCatalogSnapshot {
  fields: readonly string[];
  format: typeof PLANET_CATALOG_FORMAT;
  generatedAt: string;
  rows: readonly (readonly PlanetCatalogValue[])[];
  source: {
    archive: "NASA Exoplanet Archive";
    endpoint: string;
    query: string;
    table: "pscomppars";
  };
}

type NestedRecord = { [key: string]: NestedRecord | PlanetCatalogValue | undefined };

const fieldPath = (field: string): string[] => field.split(".");

export const encodePlanetCatalog = (
  planets: readonly ExoplanetProfile[],
  { endpoint, generatedAt, query }: { endpoint: string; generatedAt: string; query: string },
): PlanetCatalogSnapshot => {
  const paths = PLANET_CATALOG_FIELDS.map(fieldPath);
  return {
    format: PLANET_CATALOG_FORMAT,
    generatedAt,
    source: { archive: "NASA Exoplanet Archive", table: "pscomppars", endpoint, query },
    fields: PLANET_CATALOG_FIELDS,
    rows: planets.map((planet) =>
      paths.map((path) => {
        let value: unknown = planet;
        for (const key of path) value = (value as NestedRecord | undefined)?.[key];
        return (value ?? null) as PlanetCatalogValue;
      }),
    ),
  };
};

/** Rebuilds profiles in snapshot order. Throws on a format this code does not understand. */
export const decodePlanetCatalog = (snapshot: PlanetCatalogSnapshot): ExoplanetProfile[] => {
  if (snapshot.format !== PLANET_CATALOG_FORMAT || !Array.isArray(snapshot.rows)) {
    throw new Error("Unsupported planet catalog snapshot format.");
  }
  const paths = snapshot.fields.map(fieldPath);
  const source = {
    archive: snapshot.source.archive,
    table: snapshot.source.table,
    retrievedOn: snapshot.generatedAt.slice(0, 10),
  };
  return snapshot.rows.map((row) => {
    const profile: NestedRecord = {};
    paths.forEach((path, column) => {
      let target = profile;
      for (const key of path.slice(0, -1)) target = (target[key] ??= {}) as NestedRecord;
      target[path.at(-1)!] = row[column] ?? null;
    });
    return { ...profile, source: { ...source } } as unknown as ExoplanetProfile;
  });
};
