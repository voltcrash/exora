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
  "orbital_period_days",
  "semi_major_axis_au",
  "distance_parsecs",
  "discovery_year",
  "discovery_method",
  "host_spectral_type",
  "source_archive",
  "source_table",
  "retrieved_on",
  "last_seen_at",
] as const;

const BATCH_SIZE = 250;

export interface CatalogSyncResult {
  fetched: number;
  removed: number;
  upserted: number;
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
  planet.observation.orbitalPeriodDays,
  planet.observation.semiMajorAxisAu,
  planet.observation.distanceParsecs,
  planet.observation.discoveryYear,
  planet.observation.discoveryMethod,
  planet.observation.hostSpectralType,
  planet.source.archive,
  planet.source.table,
  planet.source.retrievedOn,
  syncStartedAt,
];

const upsertBatch = async (
  database: DatabaseClient,
  planets: ExoplanetProfile[],
  syncStartedAt: string,
): Promise<void> => {
  const parameters: unknown[] = [];
  const rows = planets.map((planet) => {
    const values = planetValues(planet, syncStartedAt);
    const placeholders = values.map((value) => {
      parameters.push(value);
      return `$${parameters.length}`;
    });
    return `(${placeholders.join(", ")})`;
  });

  await database.query(
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
       orbital_period_days = EXCLUDED.orbital_period_days,
       semi_major_axis_au = EXCLUDED.semi_major_axis_au,
       distance_parsecs = EXCLUDED.distance_parsecs,
       discovery_year = EXCLUDED.discovery_year,
       discovery_method = EXCLUDED.discovery_method,
       host_spectral_type = EXCLUDED.host_spectral_type,
       source_archive = EXCLUDED.source_archive,
       source_table = EXCLUDED.source_table,
       retrieved_on = EXCLUDED.retrieved_on,
       last_seen_at = GREATEST(exoplanets.last_seen_at, EXCLUDED.last_seen_at),
       updated_at = now()`,
    parameters,
  );
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

    for (let start = 0; start < planets.length; start += BATCH_SIZE) {
      await upsertBatch(transaction, planets.slice(start, start + BATCH_SIZE), syncStartedAt);
    }

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
      [syncStartedAt, planets.length, planets.length, removedRows.length],
    );

    return {
      fetched: planets.length,
      upserted: planets.length,
      removed: removedRows.length,
    };
  });
};
