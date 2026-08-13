import { serve } from "@hono/node-server";
import { createApp } from "./app.ts";
import { createDatabaseClient } from "./database.ts";
import { NasaPlanetRepository } from "./nasa-archive.ts";
import { PostgresPlanetRepository } from "./postgres-catalog.ts";

const configuredPort = Number.parseInt(process.env.PORT ?? "8787", 10);
const port = Number.isFinite(configuredPort) ? configuredPort : 8787;
const connectionString = process.env.DATABASE_URL?.trim();
const database = connectionString ? createDatabaseClient(connectionString) : null;
const repository = database ? new PostgresPlanetRepository(database) : new NasaPlanetRepository();
const app = createApp({ repository });

const server = serve({ fetch: app.fetch, port }, (info) => {
  console.log(`Exora API listening on http://localhost:${info.port}`);
});

const closeServer = (signal: NodeJS.Signals): void => {
  console.log(`Received ${signal}; closing Exora API.`);
  server.close(async (error) => {
    await database?.close();
    if (error) {
      console.error(error);
      process.exitCode = 1;
    }
  });
};

process.once("SIGINT", closeServer);
process.once("SIGTERM", closeServer);
