import type { ExoplanetProfile } from "@exora/contracts";
import type { DatabaseClient } from "./database.ts";

const UPSERT_COLUMNS = [
  "id",
  "name",
  "host_star",
  "kind",
  "radius_jupiter",
  "mass_jupiter",
  "radius_earth",
  "mass_earth",
  "equilibrium_temperature_kelvin",
  "orbital_eccentricity",
  "orbital_inclination_degrees",
  "orbital_period_days",
  "semi_major_axis_au",
  "distance_parsecs",
  "right_ascension_degrees",
  "declination_degrees",
  "discovery_year",
  "discovery_method",
  "host_spectral_type",
  "host_temperature_kelvin",
  "host_radius_solar",
  "host_mass_solar",
  "host_luminosity_log_solar",
  "source_archive",
  "source_table",
  "retrieved_on",
  "last_seen_at",
] as const;

const BATCH_SIZE = 250;

export interface CatalogSyncResult {
  fetched: number;
  /** Rows that did not exist before this run. */
  inserted: number;
  removed: number;
  /** Rows the database reported writing, counted rather than assumed. */
  upserted: number;
  /** Rows that already existed and were refreshed. */
  updated: number;
}

export interface CatalogSyncOptions {
  minimumCatalogSize?: number;
  now?: Date;
}

const planetValues = (planet: ExoplanetProfile, syncStartedAt: string): unknown[] => [
  planet.id,
  planet.name,
  planet.hostStar,
  planet.kind,
  planet.observation.radiusJupiter,
  planet.observation.massJupiter,
  planet.observation.radiusEarth,
  planet.observation.massEarth,
  planet.observation.equilibriumTemperatureKelvin,
  planet.observation.orbitalEccentricity,
  planet.observation.orbitalInclinationDegrees,
  planet.observation.orbitalPeriodDays,
  planet.observation.semiMajorAxisAu,
  planet.observation.distanceParsecs,
  planet.observation.rightAscensionDegrees,
  planet.observation.declinationDegrees,
  planet.observation.discoveryYear,
  planet.observation.discoveryMethod,
  planet.observation.hostSpectralType,
  planet.observation.hostTemperatureKelvin,
  planet.observation.hostRadiusSolar,
  planet.observation.hostMassSolar,
  planet.observation.hostLuminosityLogSolar,
  planet.source.archive,
  planet.source.table,
  planet.source.retrievedOn,
  syncStartedAt,
];

interface UpsertCounts {
  inserted: number;
  updated: number;
}

const upsertBatch = async (
  database: DatabaseClient,
  planets: ExoplanetProfile[],
  syncStartedAt: string,
): Promise<UpsertCounts> => {
  const parameters: unknown[] = [];
  const rows = planets.map((planet) => {
    const values = planetValues(planet, syncStartedAt);
    const placeholders = values.map((value) => {
      parameters.push(value);
      return `$${parameters.length}`;
    });
    return `(${placeholders.join(", ")})`;
  });

  const written = await database.query<{ inserted: boolean }>(
    `INSERT INTO exoplanets (${UPSERT_COLUMNS.join(", ")})
     VALUES ${rows.join(", ")}
     ON CONFLICT (id) DO UPDATE SET
       name = EXCLUDED.name,
       host_star = EXCLUDED.host_star,
       kind = EXCLUDED.kind,
       radius_jupiter = EXCLUDED.radius_jupiter,
       mass_jupiter = EXCLUDED.mass_jupiter,
       radius_earth = EXCLUDED.radius_earth,
       mass_earth = EXCLUDED.mass_earth,
       equilibrium_temperature_kelvin = EXCLUDED.equilibrium_temperature_kelvin,
       orbital_eccentricity = EXCLUDED.orbital_eccentricity,
       orbital_inclination_degrees = EXCLUDED.orbital_inclination_degrees,
       orbital_period_days = EXCLUDED.orbital_period_days,
       semi_major_axis_au = EXCLUDED.semi_major_axis_au,
       distance_parsecs = EXCLUDED.distance_parsecs,
       right_ascension_degrees = EXCLUDED.right_ascension_degrees,
       declination_degrees = EXCLUDED.declination_degrees,
       discovery_year = EXCLUDED.discovery_year,
       discovery_method = EXCLUDED.discovery_method,
       host_spectral_type = EXCLUDED.host_spectral_type,
       host_temperature_kelvin = EXCLUDED.host_temperature_kelvin,
       host_radius_solar = EXCLUDED.host_radius_solar,
       host_mass_solar = EXCLUDED.host_mass_solar,
       host_luminosity_log_solar = EXCLUDED.host_luminosity_log_solar,
       source_archive = EXCLUDED.source_archive,
       source_table = EXCLUDED.source_table,
       retrieved_on = EXCLUDED.retrieved_on,
       last_seen_at = GREATEST(exoplanets.last_seen_at, EXCLUDED.last_seen_at),
       updated_at = now()
     RETURNING (xmax = 0) AS inserted`,
    parameters,
  );

  // A row that went through DO UPDATE carries this transaction in `xmax`; a freshly inserted one
  // leaves it zero. That is the only thing distinguishing the two here, since both come back from
  // RETURNING identically otherwise.
  const inserted = written.filter((row) => row.inserted).length;
  return { inserted, updated: written.length - inserted };
};

export const syncPlanetCatalog = async (
  database: DatabaseClient,
  planets: ExoplanetProfile[],
  { minimumCatalogSize = 1_000, now = new Date() }: CatalogSyncOptions = {},
): Promise<CatalogSyncResult> => {
  if (planets.length < minimumCatalogSize) {
    throw new Error(
      `Catalog sync refused a suspiciously small NASA payload (${planets.length} planets).`,
    );
  }

  const syncStartedAt = now.toISOString();

  return database.transaction(async (transaction) => {
    await transaction.query("SELECT pg_advisory_xact_lock(hashtext('exora_catalog_sync'))");

    let inserted = 0;
    let updated = 0;
    for (let start = 0; start < planets.length; start += BATCH_SIZE) {
      const counts = await upsertBatch(
        transaction,
        planets.slice(start, start + BATCH_SIZE),
        syncStartedAt,
      );
      inserted += counts.inserted;
      updated += counts.updated;
    }
    const upserted = inserted + updated;

    const removedRows = await transaction.query<Record<string, unknown>>(
      `DELETE FROM exoplanets
       WHERE source_archive = 'NASA Exoplanet Archive' AND last_seen_at < $1
       RETURNING id`,
      [syncStartedAt],
    );

    await transaction.query(
      `INSERT INTO catalog_sync_runs (
         started_at, finished_at, fetched_count, upserted_count, removed_count
       ) VALUES ($1, now(), $2, $3, $4)`,
      [syncStartedAt, planets.length, upserted, removedRows.length],
    );

    return { fetched: planets.length, inserted, removed: removedRows.length, updated, upserted };
  });
};
