import { createApp } from "./app.ts";
import { createDatabaseClient } from "./database.ts";
import { NasaPlanetRepository } from "./nasa-archive.ts";
import { PostgresPlanetRepository } from "./postgres-catalog.ts";

const connectionString = process.env.DATABASE_URL?.trim();

export const database = connectionString
  ? createDatabaseClient(connectionString, {
      // Each Vercel instance has its own client. Neon handles cross-instance
      // concurrency through its pooled connection string.
      maxConnections: process.env.VERCEL ? 1 : 10,
    })
  : null;

const repository = database ? new PostgresPlanetRepository(database) : new NasaPlanetRepository();

export const app = createApp({ repository });
