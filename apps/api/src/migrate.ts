import { readFile } from "node:fs/promises";
import { readdir } from "node:fs/promises";
import { createDatabaseClient } from "./database.ts";

const connectionString = process.env.DATABASE_URL?.trim();
if (!connectionString) throw new Error("DATABASE_URL is required to run database migrations.");

// Migration files manage their own BEGIN/COMMIT boundaries, so pin their raw
// multi-statement queries to one physical connection.
const database = createDatabaseClient(connectionString, { maxConnections: 1 });

try {
  const migrationsUrl = new URL("../migrations/", import.meta.url);
  const migrationFiles = (await readdir(migrationsUrl))
    .filter((file) => /^\d+_[a-z0-9_]+\.sql$/.test(file))
    .sort();

  for (const migrationFile of migrationFiles) {
    const migration = await readFile(new URL(migrationFile, migrationsUrl), "utf8");
    await database.query(migration);
    console.log(`Applied PostgreSQL migration ${migrationFile.replace(".sql", "")}.`);
  }
} finally {
  await database.close();
}
