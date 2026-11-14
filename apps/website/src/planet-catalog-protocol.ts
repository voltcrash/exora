import type { ExoplanetProfile } from "@exora/contracts";
import type { CatalogPage } from "@exora/planet-catalog";

export interface CatalogRequest {
  id: number;
  query:
    | { type: "ready" }
    | { type: "browse"; limit: number; cursor?: string | null }
    | { type: "find"; name: string }
    | { type: "search"; query: string; limit: number };
}

export interface CatalogResponse {
  id: number;
  value: CatalogPage | ExoplanetProfile | ExoplanetProfile[] | null;
  error?: true;
}
