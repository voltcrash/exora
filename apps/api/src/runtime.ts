import { createApp } from "./app.ts";
import { GitHubCatalogRefreshDispatcher } from "./catalog-refresh.ts";
import { createDatabaseClient } from "./database.ts";
import { NasaPlanetRepository } from "./nasa-archive.ts";
import { JplHorizonsRepository } from "./horizons.ts";
import { PostgresPlanetRepository } from "./postgres-catalog.ts";
import { JplSbdbRepository } from "./sbdb.ts";
import { SimbadStarRepository } from "./simbad-archive.ts";

const connectionString = process.env.DATABASE_URL?.trim();
const catalogRefreshSecret = process.env.CRON_SECRET?.trim();
const catalogRefreshToken = process.env.CATALOG_SYNC_GITHUB_TOKEN?.trim();

export const database = connectionString
  ? createDatabaseClient(connectionString, {
      // Each Vercel instance has its own client. Neon handles cross-instance
      // concurrency through its pooled connection string.
      maxConnections: process.env.VERCEL ? 1 : 10,
    })
  : null;

const repository = database ? new PostgresPlanetRepository(database) : new NasaPlanetRepository();
const catalogRefresh =
  catalogRefreshSecret && catalogRefreshToken
    ? {
        dispatcher: new GitHubCatalogRefreshDispatcher({ token: catalogRefreshToken }),
        secret: catalogRefreshSecret,
      }
    : null;

export const app = createApp({
  ...(catalogRefresh ? { catalogRefresh } : {}),
  horizonsRepository: new JplHorizonsRepository(),
  repository,
  sbdbRepository: new JplSbdbRepository(),
  starRepository: new SimbadStarRepository(),
});
