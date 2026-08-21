import { syncPlanetCatalog } from "./catalog-sync.ts";
import { createDatabaseClient } from "./database.ts";
import { NasaPlanetRepository } from "./nasa-archive.ts";

const connectionString = process.env.DATABASE_URL?.trim();
if (!connectionString) throw new Error("DATABASE_URL is required to synchronize the catalog.");

const database = createDatabaseClient(connectionString);

try {
  const nasa = new NasaPlanetRepository({ cacheTtlMs: 0, timeoutMs: 60_000 });
  const result = await nasa.listAll();
  const sync = await syncPlanetCatalog(database, result.value);
  console.log(
    `Synchronized ${sync.upserted} confirmed planets ` +
      `(${sync.inserted} new, ${sync.updated} refreshed); ` +
      `removed ${sync.removed} stale records.`,
  );
} finally {
  await database.close();
}
