import { createApp } from "./app.ts";
import { JplHorizonsRepository } from "./horizons.ts";
import { NasaPlanetRepository } from "./nasa-archive.ts";
import { SimbadStarRepository } from "./simbad-archive.ts";

export const app = createApp({
  horizonsRepository: new JplHorizonsRepository(),
  repository: new NasaPlanetRepository(),
  starRepository: new SimbadStarRepository(),
  // Only Vercel's ingress-owned forwarding header is trusted. Direct/local requests have no
  // equivalent trusted proxy boundary and remain grouped in the conservative fallback bucket.
  trustVercelProxy: Boolean(process.env.VERCEL),
});
