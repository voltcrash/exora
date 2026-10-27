import type { ExoplanetProfile } from "@exora/contracts";
import { decodePlanetCatalog, type PlanetCatalogSnapshot } from "@exora/planet-catalog";
import snapshot from "@exora/planet-catalog/snapshot.json" with { type: "json" };

let planets: readonly ExoplanetProfile[] | undefined;

/** The committed catalog, bundled into the function and decoded on first use. */
export const bundledPlanetCatalog = (): readonly ExoplanetProfile[] =>
  (planets ??= decodePlanetCatalog(snapshot as unknown as PlanetCatalogSnapshot));
