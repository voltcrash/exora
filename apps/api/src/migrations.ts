import { readdir, readFile } from "node:fs/promises";
import type { DatabaseClient } from "./database.ts";

/**
 * Applying the migration files, once each.
 *
 * `schema_migrations` existed and was written to, but nothing ever read it: every run re-executed
 * every file from the beginning. That worked only because both files happen to be written
 * idempotently — `CREATE TABLE IF NOT EXISTS`, `ADD COLUMN IF NOT EXISTS` — so the ledger was
 * recording history nobody consulted. The first migration that backfills a row, renames a column,
 * or does anything else that cannot be repeated would have run again on the next deploy.
 *
 * So the ledger is now the thing that decides. A version already recorded is skipped.
 */

const MIGRATION_FILE = /^\d+_[a-z0-9_]+\.sql$/;

/**
 * Created here rather than left to the first migration, because it has to be readable before
 * that migration is considered. It matches the definition in `0001_exoplanet_catalog.sql`, which
 * still creates it too — both are `IF NOT EXISTS`, and a database migrated before this runner
 * existed already has it.
 */
const LEDGER_TABLE = `
  CREATE TABLE IF NOT EXISTS schema_migrations (
    version text PRIMARY KEY,
    applied_at timestamptz NOT NULL DEFAULT now()
  )`;

export interface MigrationRun {
  applied: string[];
  skipped: string[];
}

export const applyMigrations = async (
  database: DatabaseClient,
  migrationsUrl: URL,
): Promise<MigrationRun> => {
  await database.query(LEDGER_TABLE);

  const recorded = await database.query<{ version: string }>(
    "SELECT version FROM schema_migrations",
  );
  const alreadyApplied = new Set(recorded.map((row) => row.version));

  const files = (await readdir(migrationsUrl)).filter((file) => MIGRATION_FILE.test(file)).sort();
  const run: MigrationRun = { applied: [], skipped: [] };

  for (const file of files) {
    const version = file.replace(/\.sql$/, "");
    if (alreadyApplied.has(version)) {
      run.skipped.push(version);
      continue;
    }

    const migration = await readFile(new URL(file, migrationsUrl), "utf8");
    await database.query(migration);

    // Each file also records itself inside its own BEGIN/COMMIT, which is what makes applying and
    // recording atomic. This repeats it for any that does not, so a migration cannot be left
    // applied but unrecorded and run a second time; `ON CONFLICT` makes the overlap a no-op.
    await database.query(
      "INSERT INTO schema_migrations (version) VALUES ($1) ON CONFLICT (version) DO NOTHING",
      [version],
    );
    run.applied.push(version);
  }

  return run;
};
