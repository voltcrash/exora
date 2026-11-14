import { loadLocalPlanetCatalog } from "./planet-catalog-data.ts";
import type { CatalogRequest, CatalogResponse } from "./planet-catalog-protocol.ts";

let catalog: ReturnType<typeof loadLocalPlanetCatalog> | undefined;

self.onmessage = async ({ data: { id, query } }: MessageEvent<CatalogRequest>) => {
  try {
    catalog ??= loadLocalPlanetCatalog();
    const ready = await catalog;
    let value: CatalogResponse["value"] = null;
    switch (query.type) {
      case "browse":
        value = await ready.browse(query.limit, query.cursor);
        break;
      case "find":
        value = await ready.find(query.name);
        break;
      case "search":
        value = await ready.search(query.query, query.limit);
        break;
    }
    self.postMessage({ id, value } satisfies CatalogResponse);
  } catch {
    self.postMessage({ id, value: null, error: true } satisfies CatalogResponse);
  }
};
