import type { ExoplanetProfile } from "@exora/contracts";
import type { DatabaseClient } from "./database.ts";
import type {
  PlanetDiscoveryCategory,
  PlanetRepository,
  RepositoryResult,
} from "./nasa-archive.ts";

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

export class PostgresPlanetRepository implements PlanetRepository {
  readonly #database: DatabaseClient;

  constructor(database: DatabaseClient) {
    this.#database = database;
  }

  async discover(
    category: PlanetDiscoveryCategory,
    limit: number,
  ): Promise<RepositoryResult<ExoplanetProfile[]>> {
    const filters: Record<PlanetDiscoveryCategory, { order: string; where: string }> = {
      "earth-like": {
        where:
          "radius_earth BETWEEN 0.8 AND 1.6 AND equilibrium_temperature_kelvin BETWEEN 220 AND 320",
        order: "abs(radius_earth - 1), abs(equilibrium_temperature_kelvin - 255)",
      },
      "lava-worlds": {
        where: "equilibrium_temperature_kelvin >= 1000 AND radius_earth < 3",
        order: "equilibrium_temperature_kelvin DESC",
      },
      "gas-giants": {
        where: "(radius_jupiter >= 0.45 OR mass_jupiter >= 0.08)",
        order: "radius_jupiter DESC NULLS LAST",
      },
      "ocean-candidates": {
        where:
          "radius_earth BETWEEN 1.3 AND 2.6 AND equilibrium_temperature_kelvin BETWEEN 200 AND 350",
        order: "abs(equilibrium_temperature_kelvin - 275), radius_earth",
      },
      "frozen-worlds": {
        where: "equilibrium_temperature_kelvin < 180",
        order: "equilibrium_temperature_kelvin",
      },
      "extreme-weather": {
        where:
          "equilibrium_temperature_kelvin >= 1200 AND (radius_jupiter >= 0.45 OR mass_jupiter >= 0.08)",
        order: "equilibrium_temperature_kelvin DESC",
      },
      "potentially-habitable": {
        where:
          "radius_earth BETWEEN 0.5 AND 1.8 AND equilibrium_temperature_kelvin BETWEEN 180 AND 330",
        order: "abs(radius_earth - 1), abs(equilibrium_temperature_kelvin - 255)",
      },
      "recently-discovered": {
        where: "discovery_year IS NOT NULL",
        order: "discovery_year DESC, name",
      },
      "most-earth-like": {
        where:
          "radius_earth BETWEEN 0.75 AND 1.5 AND equilibrium_temperature_kelvin BETWEEN 210 AND 320",
        order: "abs(radius_earth - 1), abs(equilibrium_temperature_kelvin - 255)",
      },
      "nearest-rocky-worlds": {
        where: "radius_earth <= 2 AND distance_parsecs IS NOT NULL",
        order: "distance_parsecs, radius_earth",
      },
      "recently-confirmed": {
        where: "discovery_year IS NOT NULL",
        order: "discovery_year DESC, name",
      },
      "record-breakers": {
        where: "equilibrium_temperature_kelvin >= 1500 OR mass_jupiter >= 5",
        order: "equilibrium_temperature_kelvin DESC NULLS LAST, mass_jupiter DESC NULLS LAST",
      },
    };
    const filter = filters[category];
    const safeLimit = Math.max(1, Math.min(Math.trunc(limit), 24));
    const rows = await this.#database.query<PlanetRow>(
      `SELECT ${PLANET_COLUMNS} FROM exoplanets WHERE ${filter.where} ORDER BY ${filter.order} LIMIT $1`,
      [safeLimit],
    );
    return { cached: true, value: rows.map(toPlanet) };
  }

  async findByName(name: string): Promise<RepositoryResult<ExoplanetProfile | null>> {
    const rows = await this.#database.query<PlanetRow>(
      `SELECT ${PLANET_COLUMNS} FROM exoplanets WHERE lower(name) = lower($1) LIMIT 1`,
      [name.trim().slice(0, 100)],
    );

    return { cached: true, value: rows[0] ? toPlanet(rows[0]) : null };
  }

  async search(query: string, limit: number): Promise<RepositoryResult<ExoplanetProfile[]>> {
    const normalizedQuery = query.trim().slice(0, 80);
    const safeLimit = Math.max(1, Math.min(Math.trunc(limit), 24));
    const rows = await this.#database.query<PlanetRow>(
      `SELECT ${PLANET_COLUMNS}
       FROM exoplanets
       WHERE name ILIKE '%' || $1 || '%'
       ORDER BY similarity(name, $1) DESC, name
       LIMIT $2`,
      [normalizedQuery, safeLimit],
    );

    return { cached: true, value: rows.map(toPlanet) };
  }
}
