import type { ExoplanetProfile } from "@exora/contracts";
import {
  browsePlanetCatalog,
  decodePlanetCatalog,
  findCatalogPlanet,
  searchPlanetCatalog,
  type CatalogPage,
  type PlanetCatalogSnapshot,
} from "@exora/planet-catalog";
import snapshotUrl from "@exora/planet-catalog/snapshot.json?url";

type Fetcher = (input: string | URL | Request, init?: RequestInit) => Promise<Response>;

/** The committed archive snapshot, answering the same questions the API does with its code. */
export interface PlanetCatalog {
  browse: (limit: number, cursor?: string | null) => CatalogPage;
  find: (name: string) => ExoplanetProfile | null;
  search: (query: string, limit: number) => ExoplanetProfile[];
}

export const loadPlanetCatalog = async (fetcher: Fetcher = fetch): Promise<PlanetCatalog> => {
  // Low priority so the snapshot never competes with the scene's own downloads.
  const response = await fetcher(snapshotUrl, { priority: "low" });
  if (!response.ok) throw new Error(`Planet catalog failed with status ${response.status}.`);
  const planets = decodePlanetCatalog((await response.json()) as PlanetCatalogSnapshot);
  return {
    browse: (limit, cursor) => browsePlanetCatalog(planets, limit, cursor),
    find: (name) => findCatalogPlanet(planets, name),
    search: (query, limit) => searchPlanetCatalog(planets, query, limit),
  };
};
