import { createApp } from "./app.ts";
import { JplHorizonsRepository } from "./horizons.ts";
import { NasaPlanetRepository } from "./nasa-archive.ts";
import { SimbadStarRepository } from "./simbad-archive.ts";
import { VizierBlackHoleRepository } from "./black-hole-archive.ts";

export const app = createApp({
  blackHoleRepository: new VizierBlackHoleRepository(),
  horizonsRepository: new JplHorizonsRepository(),
  repository: new NasaPlanetRepository(),
  starRepository: new SimbadStarRepository(),
  trustVercelProxy: Boolean(process.env.VERCEL),
});
