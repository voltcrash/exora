import { expect, test } from "vite-plus/test";
import type { DatabaseClient } from "../src/database.ts";
import { applyMigrations } from "../src/migrations.ts";

const MIGRATIONS = new URL("../migrations/", import.meta.url);

class FakeDatabase implements DatabaseClient {
  readonly statements: string[] = [];
  readonly recorded: Set<string>;

  constructor(alreadyApplied: string[] = []) {
    this.recorded = new Set(alreadyApplied);
  }

  async close(): Promise<void> {}

  async query<T extends Record<string, unknown>>(
    statement: string,
    parameters: readonly unknown[] = [],
  ): Promise<T[]> {
    this.statements.push(statement.trim());

    if (statement.includes("SELECT version FROM schema_migrations")) {
      return [...this.recorded].map((version) => ({ version })) as unknown as T[];
    }
    // Only the runner's parameterised insert records a version here. Migration files carry their
    // own literal `INSERT INTO schema_migrations`, which this fake is not a SQL engine for.
    if (statement.includes("INSERT INTO schema_migrations") && parameters.length > 0) {
      this.recorded.add(String(parameters[0]));
    }
    return [];
  }

  async transaction<T>(callback: (client: DatabaseClient) => Promise<T>): Promise<T> {
    return callback(this);
  }
}

test("a fresh database applies every migration in filename order", async () => {
  const database = new FakeDatabase();

  const run = await applyMigrations(database, MIGRATIONS);

  expect(run.applied).toEqual(["0001_exoplanet_catalog", "0002_host_star_parameters"]);
  expect(run.skipped).toEqual([]);
});

test("an already-migrated database applies nothing", async () => {
  const database = new FakeDatabase(["0001_exoplanet_catalog", "0002_host_star_parameters"]);

  const run = await applyMigrations(database, MIGRATIONS);

  expect(run.applied).toEqual([]);
  expect(run.skipped).toEqual(["0001_exoplanet_catalog", "0002_host_star_parameters"]);
  // The point of the change: no migration file's SQL reaches the database a second time. The
  // runner's own ledger DDL is expected and is deliberately not what this looks for.
  const migrationSql = database.statements.filter(
    (statement) =>
      statement.includes("CREATE TABLE IF NOT EXISTS exoplanets") ||
      statement.includes("ALTER TABLE exoplanets"),
  );
  expect(migrationSql).toEqual([]);
});

test("only the migrations missing from the ledger are applied", async () => {
  const database = new FakeDatabase(["0001_exoplanet_catalog"]);

  const run = await applyMigrations(database, MIGRATIONS);

  expect(run.applied).toEqual(["0002_host_star_parameters"]);
  expect(run.skipped).toEqual(["0001_exoplanet_catalog"]);
});

test("running twice in a row is a no-op the second time", async () => {
  const database = new FakeDatabase();

  const first = await applyMigrations(database, MIGRATIONS);
  const second = await applyMigrations(database, MIGRATIONS);

  expect(first.applied).toHaveLength(2);
  expect(second.applied).toEqual([]);
  expect(second.skipped).toEqual(first.applied);
});

test("the ledger is created before it is read, so a fresh database can be inspected", async () => {
  const database = new FakeDatabase();

  await applyMigrations(database, MIGRATIONS);

  const ledgerIndex = database.statements.findIndex((statement) =>
    statement.includes("CREATE TABLE IF NOT EXISTS schema_migrations"),
  );
  const readIndex = database.statements.findIndex((statement) =>
    statement.includes("SELECT version FROM schema_migrations"),
  );

  expect(ledgerIndex).toBeGreaterThanOrEqual(0);
  expect(readIndex).toBeGreaterThan(ledgerIndex);
});

test("an applied migration is recorded even if its own file forgot to", async () => {
  const database = new FakeDatabase();

  await applyMigrations(database, MIGRATIONS);

  // Without this the file would be applied again on the next run, forever.
  expect([...database.recorded].sort()).toEqual([
    "0001_exoplanet_catalog",
    "0002_host_star_parameters",
  ]);
});
