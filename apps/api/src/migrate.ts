import { createDatabaseClient } from "./database.ts";
import { applyMigrations } from "./migrations.ts";

const connectionString = process.env.DATABASE_URL?.trim();
if (!connectionString) throw new Error("DATABASE_URL is required to run database migrations.");

// Migration files manage their own BEGIN/COMMIT boundaries, so pin their raw
// multi-statement queries to one physical connection.
const database = createDatabaseClient(connectionString, { maxConnections: 1 });

try {
  const run = await applyMigrations(database, new URL("../migrations/", import.meta.url));

  for (const version of run.skipped) {
    console.log(`Skipped PostgreSQL migration ${version}; already applied.`);
  }
  for (const version of run.applied) {
    console.log(`Applied PostgreSQL migration ${version}.`);
  }
  if (run.applied.length === 0) {
    console.log("PostgreSQL schema is already up to date.");
  }
} finally {
  await database.close();
}
