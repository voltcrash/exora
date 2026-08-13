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
    orbitalPeriodDays: 267.3,
    semiMajorAxisAu: 0.718,
    distanceParsecs: 300,
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
  orbital_period_days: planet.observation.orbitalPeriodDays,
  semi_major_axis_au: planet.observation.semiMajorAxisAu,
  distance_parsecs: planet.observation.distanceParsecs,
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

class FakeDatabase implements DatabaseClient {
  readonly queries: { parameters: readonly unknown[]; statement: string }[] = [];

  async close(): Promise<void> {}

  async query<T extends Record<string, unknown>>(
    statement: string,
    parameters: readonly unknown[] = [],
  ): Promise<T[]> {
    this.queries.push({ statement, parameters });

    if (statement.includes("DELETE FROM exoplanets")) {
      return [{ id: "stale-world" }] as unknown as T[];
    }
    if (statement.includes("SELECT") && statement.includes("FROM exoplanets")) {
      return [planetRow] as unknown as T[];
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

  expect(result).toEqual({ cached: true, value: planet });
  expect(database.queries[0]?.parameters).toEqual(["Kepler-62 f"]);
});

test("bounds database catalog searches", async () => {
  const database = new FakeDatabase();
  const repository = new PostgresPlanetRepository(database);

  const result = await repository.search("kepler", 100);

  expect(result.value).toEqual([planet]);
  expect(database.queries[0]?.parameters).toEqual(["kepler", 24]);
});

test("synchronizes planets and removes stale rows in one transaction", async () => {
  const database = new FakeDatabase();
  const result = await syncPlanetCatalog(database, [planet], {
    minimumCatalogSize: 1,
    now: new Date("2026-08-13T12:00:00.000Z"),
  });

  expect(result).toEqual({ fetched: 1, upserted: 1, removed: 1 });
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
