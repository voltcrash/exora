import { createApp } from "./app.ts";
import { JplHorizonsRepository } from "./horizons.ts";
import { NasaPlanetRepository } from "./nasa-archive.ts";
import { SimbadStarRepository } from "./simbad-archive.ts";

export const app = createApp({
  horizonsRepository: new JplHorizonsRepository(),
  repository: new NasaPlanetRepository(),
  starRepository: new SimbadStarRepository(),
  trustVercelProxy: Boolean(process.env.VERCEL),
});
