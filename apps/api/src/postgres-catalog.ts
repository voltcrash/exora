import type { ExoplanetProfile } from "@exora/contracts";
import type { DatabaseClient } from "./database.ts";
import {
  PLANET_DISCOVERY_FILTERS,
  POSTGRES_DIALECT,
  renderPlanetOrder,
  renderPlanetPredicate,
  type PlanetDiscoveryCategory,
} from "./discovery-categories.ts";
import type { PlanetRepository, RepositoryResult } from "./nasa-archive.ts";

interface PlanetRow extends Record<string, unknown> {
  discovery_method: string;
  discovery_year: number | null;
  distance_parsecs: number | null;
  equilibrium_temperature_kelvin: number | null;
  host_spectral_type: string | null;
  host_temperature_kelvin: number | null;
  host_radius_solar: number | null;
  host_mass_solar: number | null;
  host_luminosity_log_solar: number | null;
  host_star: string;
  id: string;
  kind: ExoplanetProfile["kind"];
  mass_earth: number | null;
  mass_jupiter: number | null;
  name: string;
  orbital_period_days: number | null;
  radius_earth: number | null;
  radius_jupiter: number | null;
  retrieved_on: string | Date;
  semi_major_axis_au: number | null;
  source_archive: "NASA Exoplanet Archive";
  source_table: "pscomppars";
}

const PLANET_COLUMNS = `
  id,
  name,
  host_star,
  kind,
  radius_jupiter,
  mass_jupiter,
  radius_earth,
  mass_earth,
  equilibrium_temperature_kelvin,
  orbital_period_days,
  semi_major_axis_au,
  distance_parsecs,
  discovery_year,
  discovery_method,
  host_spectral_type,
  host_temperature_kelvin,
  host_radius_solar,
  host_mass_solar,
  host_luminosity_log_solar,
  source_archive,
  source_table,
  retrieved_on
`;

const toIsoDate = (value: string | Date): string =>
  value instanceof Date ? value.toISOString().slice(0, 10) : value.slice(0, 10);

const toPlanet = (row: PlanetRow): ExoplanetProfile => ({
  id: row.id,
  name: row.name,
  hostStar: row.host_star,
  kind: row.kind,
  observation: {
    radiusJupiter: row.radius_jupiter,
    massJupiter: row.mass_jupiter,
    radiusEarth: row.radius_earth,
    massEarth: row.mass_earth,
    equilibriumTemperatureKelvin: row.equilibrium_temperature_kelvin,
    orbitalPeriodDays: row.orbital_period_days,
    semiMajorAxisAu: row.semi_major_axis_au,
    distanceParsecs: row.distance_parsecs,
    discoveryYear: row.discovery_year,
    discoveryMethod: row.discovery_method,
    hostSpectralType: row.host_spectral_type,
    hostTemperatureKelvin: row.host_temperature_kelvin,
    hostRadiusSolar: row.host_radius_solar,
    hostMassSolar: row.host_mass_solar,
    hostLuminosityLogSolar: row.host_luminosity_log_solar,
  },
  source: {
    archive: row.source_archive,
    table: row.source_table,
    retrievedOn: toIsoDate(row.retrieved_on),
  },
});

/**
 * Reads report `cached: false`.
 *
 * `meta.cached` tells a client whether it is looking at a value the API had already, and every
 * method here issues a live statement against the catalog. The archive adapters are where the
 * flag becomes true, when an in-process entry answers instead of a TAP request. Reporting a
 * fresh database read as cached would be the same kind of backfill the rest of Exora refuses:
 * a field the system does not actually know, filled in with a plausible value.
 */
export class PostgresPlanetRepository implements PlanetRepository {
  readonly #database: DatabaseClient;

  constructor(database: DatabaseClient) {
    this.#database = database;
  }

  async browse(limit: number): Promise<RepositoryResult<ExoplanetProfile[]>> {
    const safeLimit = Math.max(24, Math.min(Math.trunc(limit), 120));
    const rows = await this.#database.query<PlanetRow>(
      `SELECT ${PLANET_COLUMNS}
       FROM exoplanets
       WHERE distance_parsecs IS NOT NULL
         AND equilibrium_temperature_kelvin IS NOT NULL
         AND (radius_earth IS NOT NULL OR radius_jupiter IS NOT NULL)
       ORDER BY name
       LIMIT $1`,
      [safeLimit],
    );
    return { cached: false, value: rows.map(toPlanet) };
  }

  async discover(
    category: PlanetDiscoveryCategory,
    limit: number,
  ): Promise<RepositoryResult<ExoplanetProfile[]>> {
    const filter = PLANET_DISCOVERY_FILTERS[category];
    const where = renderPlanetPredicate(filter.where, POSTGRES_DIALECT);
    const order = renderPlanetOrder(filter.order, POSTGRES_DIALECT);
    const safeLimit = Math.max(1, Math.min(Math.trunc(limit), 24));
    const rows = await this.#database.query<PlanetRow>(
      `SELECT ${PLANET_COLUMNS} FROM exoplanets WHERE ${where} ORDER BY ${order} LIMIT $1`,
      [safeLimit],
    );
    return { cached: false, value: rows.map(toPlanet) };
  }

  async findByName(name: string): Promise<RepositoryResult<ExoplanetProfile | null>> {
    const rows = await this.#database.query<PlanetRow>(
      `SELECT ${PLANET_COLUMNS} FROM exoplanets WHERE lower(name) = lower($1) LIMIT 1`,
      [name.trim().slice(0, 100)],
    );

    return { cached: false, value: rows[0] ? toPlanet(rows[0]) : null };
  }

  async findByHost(hostStar: string, limit: number): Promise<RepositoryResult<ExoplanetProfile[]>> {
    const safeLimit = Math.max(1, Math.min(Math.trunc(limit), 24));
    const rows = await this.#database.query<PlanetRow>(
      `SELECT ${PLANET_COLUMNS}
       FROM exoplanets
       WHERE lower(host_star) = lower($1)
       ORDER BY name
       LIMIT $2`,
      [hostStar.trim().slice(0, 100), safeLimit],
    );

    return { cached: false, value: rows.map(toPlanet) };
  }

  async search(query: string, limit: number): Promise<RepositoryResult<ExoplanetProfile[]>> {
    const normalizedQuery = query.trim().slice(0, 80);
    const safeLimit = Math.max(1, Math.min(Math.trunc(limit), 24));
    const rows = await this.#database.query<PlanetRow>(
      `SELECT ${PLANET_COLUMNS}
       FROM exoplanets
       WHERE name ILIKE '%' || $1 || '%'
          OR name % $1
          OR ($2 <> '' AND regexp_replace(lower(name), '[^a-z0-9]', '', 'g') LIKE '%' || $2 || '%')
       ORDER BY
         CASE WHEN lower(name) LIKE lower($1) || '%' THEN 0 ELSE 1 END,
         similarity(name, $1) DESC,
         name
       LIMIT $3`,
      [normalizedQuery, normalizedQuery.toLowerCase().replaceAll(/[^a-z0-9]/g, ""), safeLimit],
    );

    return { cached: false, value: rows.map(toPlanet) };
  }
}
