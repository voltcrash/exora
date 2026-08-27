import type { ExoplanetProfile } from "@exora/contracts";
import { expect, test } from "vite-plus/test";
import { syncPlanetCatalog } from "../src/catalog-sync.ts";
import type { DatabaseClient } from "../src/database.ts";
import { PostgresPlanetRepository } from "../src/postgres-catalog.ts";

const planet: ExoplanetProfile = {
  id: "kepler-62-f",
  name: "Kepler-62 f",
  hostStar: "Kepler-62",
  kind: "rocky",
  observation: {
    radiusJupiter: null,
    massJupiter: null,
    radiusEarth: 1.41,
    massEarth: 2.8,
    equilibriumTemperatureKelvin: 208,
    orbitalEccentricity: 0.0,
    orbitalInclinationDegrees: 89.9,
    orbitalPeriodDays: 267.3,
    semiMajorAxisAu: 0.718,
    distanceParsecs: 300,
    rightAscensionDegrees: 283.2125621,
    declinationDegrees: 45.3496992,
    discoveryYear: 2013,
    discoveryMethod: "Transit",
    hostSpectralType: "K2V",
    hostTemperatureKelvin: 4_925,
    hostRadiusSolar: 0.64,
    hostMassSolar: 0.69,
    hostLuminosityLogSolar: -0.63,
  },
  source: {
    archive: "NASA Exoplanet Archive",
    table: "pscomppars",
    retrievedOn: "2026-08-13",
  },
};

const planetRow = {
  id: planet.id,
  name: planet.name,
  host_star: planet.hostStar,
  kind: planet.kind,
  radius_jupiter: planet.observation.radiusJupiter,
  mass_jupiter: planet.observation.massJupiter,
  radius_earth: planet.observation.radiusEarth,
  mass_earth: planet.observation.massEarth,
  equilibrium_temperature_kelvin: planet.observation.equilibriumTemperatureKelvin,
  orbital_eccentricity: planet.observation.orbitalEccentricity,
  orbital_inclination_degrees: planet.observation.orbitalInclinationDegrees,
  orbital_period_days: planet.observation.orbitalPeriodDays,
  semi_major_axis_au: planet.observation.semiMajorAxisAu,
  distance_parsecs: planet.observation.distanceParsecs,
  right_ascension_degrees: planet.observation.rightAscensionDegrees,
  declination_degrees: planet.observation.declinationDegrees,
  discovery_year: planet.observation.discoveryYear,
  discovery_method: planet.observation.discoveryMethod,
  host_spectral_type: planet.observation.hostSpectralType,
  host_temperature_kelvin: planet.observation.hostTemperatureKelvin,
  host_radius_solar: planet.observation.hostRadiusSolar,
  host_mass_solar: planet.observation.hostMassSolar,
  host_luminosity_log_solar: planet.observation.hostLuminosityLogSolar,
  source_archive: planet.source.archive,
  source_table: planet.source.table,
  retrieved_on: planet.source.retrievedOn,
};

/** Columns written per row by the catalog upsert, used to infer a batch size from its parameters. */
const UPSERT_COLUMN_COUNT = 27;

class FakeDatabase implements DatabaseClient {
  readonly queries: { parameters: readonly unknown[]; statement: string }[] = [];
  /** How many of the next upsert's rows the database should report as newly inserted. */
  insertedRows = Number.POSITIVE_INFINITY;
  selectedRows: Record<string, unknown>[] = [planetRow];

  async close(): Promise<void> {}

  async query<T extends Record<string, unknown>>(
    statement: string,
    parameters: readonly unknown[] = [],
  ): Promise<T[]> {
    this.queries.push({ statement, parameters });

    if (statement.includes("INSERT INTO exoplanets")) {
      const rows = parameters.length / UPSERT_COLUMN_COUNT;
      return Array.from({ length: rows }, (_, index) => ({
        inserted: index < this.insertedRows,
      })) as unknown as T[];
    }
    if (statement.includes("DELETE FROM exoplanets")) {
      return [{ id: "stale-world" }] as unknown as T[];
    }
    if (statement.includes("SELECT") && statement.includes("FROM exoplanets")) {
      return this.selectedRows as T[];
    }
    return [];
  }

  async transaction<T>(callback: (client: DatabaseClient) => Promise<T>): Promise<T> {
    return callback(this);
  }
}

test("serves normalized planet profiles from PostgreSQL", async () => {
  const database = new FakeDatabase();
  const repository = new PostgresPlanetRepository(database);

  const result = await repository.findByName("Kepler-62 f");

  // A live statement against the catalog is not a cached answer: `meta.cached` is what the
  // archive adapters set when an in-process entry replaces a TAP request.
  expect(result).toEqual({ cached: false, value: planet });
  expect(database.queries[0]?.parameters).toEqual(["Kepler-62 f"]);
});

test("rejects malformed PostgreSQL measurements instead of exposing them", async () => {
  const database = new FakeDatabase();
  database.selectedRows = [{ ...planetRow, radius_earth: "1.41" }];
  const repository = new PostgresPlanetRepository(database);

  await expect(repository.findByName("Kepler-62 f")).rejects.toThrow();
});

test("loads a broad bounded planet field for physical controls", async () => {
  const database = new FakeDatabase();
  const repository = new PostgresPlanetRepository(database);

  const result = await repository.browse(500);

  expect(result.value).toEqual([planet]);
  expect(database.queries[0]?.parameters).toEqual([120]);
  expect(database.queries[0]?.statement).toContain("equilibrium_temperature_kelvin IS NOT NULL");
});

test("bounds database catalog searches", async () => {
  const database = new FakeDatabase();
  const repository = new PostgresPlanetRepository(database);

  const result = await repository.search("kepler", 100);

  expect(result.value).toEqual([planet]);
  expect(database.queries[0]?.parameters).toEqual(["kepler", "kepler", 24]);
  expect(database.queries[0]?.statement).toContain("name % $1");
});

test("loads a bounded set of planets for a host star", async () => {
  const database = new FakeDatabase();
  const repository = new PostgresPlanetRepository(database);

  const result = await repository.findByHost("Kepler-62", 100);

  expect(result.value).toEqual([planet]);
  expect(database.queries[0]?.parameters).toEqual(["Kepler-62", 24]);
  expect(database.queries[0]?.statement).toContain("lower(host_star) = lower($1)");
});

test("synchronizes planets and removes stale rows in one transaction", async () => {
  const database = new FakeDatabase();
  const result = await syncPlanetCatalog(database, [planet], {
    minimumCatalogSize: 1,
    now: new Date("2026-08-13T12:00:00.000Z"),
  });

  expect(result).toEqual({ fetched: 1, inserted: 1, removed: 1, updated: 0, upserted: 1 });
  expect(
    database.queries.some(({ statement }) => statement.includes("pg_advisory_xact_lock")),
  ).toBe(true);
  expect(database.queries.some(({ statement }) => statement.includes("ON CONFLICT (id)"))).toBe(
    true,
  );
  expect(database.queries.at(-1)?.parameters).toEqual(["2026-08-13T12:00:00.000Z", 1, 1, 1]);
});

test("refuses incomplete archive payloads before deleting catalog rows", async () => {
  const database = new FakeDatabase();

  await expect(syncPlanetCatalog(database, [])).rejects.toThrow("suspiciously small");
  expect(database.queries).toHaveLength(0);
});

test("every database read reports itself as live rather than cached", async () => {
  const database = new FakeDatabase();
  const repository = new PostgresPlanetRepository(database);

  const results = await Promise.all([
    repository.browse(24),
    repository.discover("earth-like", 12),
    repository.findByName("Kepler-62 f"),
    repository.findByHost("Kepler-62", 12),
    repository.search("kepler", 12),
  ]);

  expect(results.map(({ cached }) => cached)).toEqual([false, false, false, false, false]);
});

test("the run counts what the database reported writing, not what was handed to it", async () => {
  const database = new FakeDatabase();
  // Two of the three rows already existed, so the database reports one insert and two updates.
  database.insertedRows = 1;

  const result = await syncPlanetCatalog(
    database,
    [planet, { ...planet, id: "b", name: "B" }, { ...planet, id: "c", name: "C" }],
    { minimumCatalogSize: 1, now: new Date("2026-08-13T12:00:00.000Z") },
  );

  expect(result).toMatchObject({ fetched: 3, inserted: 1, updated: 2, upserted: 3 });
  // `fetched` is what NASA returned; `upserted` is what the database acknowledged. Recording the
  // payload size for both would make a run that wrote nothing indistinguishable from a healthy one.
  const runLog = database.queries.at(-1);
  expect(runLog?.statement).toContain("INSERT INTO catalog_sync_runs");
  expect(runLog?.parameters).toEqual(["2026-08-13T12:00:00.000Z", 3, 3, 1]);
});

test("the upsert asks the database which rows were new", async () => {
  const database = new FakeDatabase();

  await syncPlanetCatalog(database, [planet], { minimumCatalogSize: 1 });

  const upsert = database.queries.find(({ statement }) =>
    statement.includes("INSERT INTO exoplanets"),
  );
  // A row that went through DO UPDATE carries the transaction in xmax; a new one leaves it zero.
  expect(upsert?.statement).toContain("RETURNING (xmax = 0) AS inserted");
});
