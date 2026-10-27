import { createApp } from "./app.ts";
import { JplHorizonsRepository } from "./horizons.ts";
import { NasaPlanetRepository } from "./nasa-archive.ts";
import { bundledPlanetCatalog } from "./planet-catalog-snapshot.ts";
import { SimbadStarRepository } from "./simbad-archive.ts";
import { VizierBlackHoleRepository } from "./black-hole-archive.ts";

export const createRuntimeApp = () =>
  createApp({
    blackHoleRepository: new VizierBlackHoleRepository(),
    horizonsRepository: new JplHorizonsRepository(),
    repository: new NasaPlanetRepository({ catalog: bundledPlanetCatalog }),
    starRepository: new SimbadStarRepository(),
    trustVercelProxy: Boolean(process.env.VERCEL),
  });
