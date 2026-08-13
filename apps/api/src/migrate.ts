import { readFile } from "node:fs/promises";
import { createDatabaseClient } from "./database.ts";

const connectionString = process.env.DATABASE_URL?.trim();
if (!connectionString) throw new Error("DATABASE_URL is required to run database migrations.");

const database = createDatabaseClient(connectionString);

try {
  const migrationUrl = new URL("../migrations/0001_exoplanet_catalog.sql", import.meta.url);
  const migration = await readFile(migrationUrl, "utf8");
  await database.query(migration);
  console.log("Applied PostgreSQL migration 0001_exoplanet_catalog.");
} finally {
  await database.close();
}
