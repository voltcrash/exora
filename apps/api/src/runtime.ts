import { createApp } from "./app.ts";
import { JplHorizonsRepository } from "./horizons.ts";
import { NasaPlanetRepository, type NasaPlanetRepositoryOptions } from "./nasa-archive.ts";
import { SimbadStarRepository } from "./simbad-archive.ts";
import { VizierBlackHoleRepository } from "./black-hole-archive.ts";

export const createRuntimeApp = (options: Pick<NasaPlanetRepositoryOptions, "waitUntil"> = {}) =>
  createApp({
    blackHoleRepository: new VizierBlackHoleRepository(),
    horizonsRepository: new JplHorizonsRepository(),
    repository: new NasaPlanetRepository(options),
    starRepository: new SimbadStarRepository(),
    trustVercelProxy: Boolean(process.env.VERCEL),
  });
