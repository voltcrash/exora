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
  browse: (limit: number, cursor?: string | null) => Promise<CatalogPage>;
  find: (name: string) => Promise<ExoplanetProfile | null>;
  search: (query: string, limit: number) => Promise<ExoplanetProfile[]>;
}

export const loadLocalPlanetCatalog = async (fetcher: Fetcher = fetch): Promise<PlanetCatalog> => {
  // Low priority so the snapshot never competes with the scene's own downloads.
  const response = await fetcher(snapshotUrl, {
    priority: "low",
    signal: AbortSignal.timeout(30_000),
  });
  if (!response.ok) throw new Error(`Planet catalog failed with status ${response.status}.`);
  const snapshot = (await response.json()) as PlanetCatalogSnapshot;
  const planets = decodePlanetCatalog(snapshot);
  return {
    browse: async (limit, cursor) => browsePlanetCatalog(planets, limit, cursor),
    find: async (name) => findCatalogPlanet(planets, name),
    search: async (query, limit) => searchPlanetCatalog(planets, query, limit),
  };
};
