import type { ExoplanetProfile, PlanetResponse, PlanetSearchResponse } from "@exora/contracts";

type Fetcher = (input: string | URL | Request, init?: RequestInit) => Promise<Response>;

export interface PlanetLoadResult {
  cached: boolean;
  mode: "custom" | "fallback" | "live";
  planet: ExoplanetProfile;
}

export interface PlanetSearchResult {
  cached: boolean;
  planets: ExoplanetProfile[];
  query: string;
}

const isPlanetResponse = (value: unknown): value is PlanetResponse => {
  if (!value || typeof value !== "object") return false;

  const candidate = value as Partial<PlanetResponse>;
  return Boolean(
    candidate.data &&
    typeof candidate.data.id === "string" &&
    typeof candidate.data.name === "string" &&
    candidate.meta?.source === "NASA Exoplanet Archive",
  );
};

const isPlanetSearchResponse = (value: unknown): value is PlanetSearchResponse => {
  if (!value || typeof value !== "object") return false;

  const candidate = value as Partial<PlanetSearchResponse>;
  return Boolean(
    Array.isArray(candidate.data) &&
    candidate.data.every(
      (planet) => typeof planet.id === "string" && typeof planet.name === "string",
    ) &&
    typeof candidate.meta?.query === "string" &&
    candidate.meta.source === "NASA Exoplanet Archive",
  );
};

const requestPlanet = async (
  path: string,
  fetcher: Fetcher,
  signal?: AbortSignal,
): Promise<PlanetResponse | null> => {
  try {
    const response = await fetcher(path, {
      headers: { accept: "application/json" },
      signal: signal ?? AbortSignal.timeout(4_000),
    });

    if (!response.ok) return null;

    const payload: unknown = await response.json();
    return isPlanetResponse(payload) ? payload : null;
  } catch {
    return null;
  }
};

export const loadFeaturedPlanet = async (
  fallback: ExoplanetProfile,
  fetcher: Fetcher = fetch,
): Promise<PlanetLoadResult> => {
  const payload = await requestPlanet("/api/planets/featured", fetcher);

  return payload
    ? { cached: payload.meta.cached, mode: "live", planet: payload.data }
    : { cached: false, mode: "fallback", planet: fallback };
};

export const loadPlanetByName = async (
  name: string,
  fetcher: Fetcher = fetch,
): Promise<PlanetLoadResult | null> => {
  const payload = await requestPlanet(`/api/planets/${encodeURIComponent(name)}`, fetcher);

  return payload ? { cached: payload.meta.cached, mode: "live", planet: payload.data } : null;
};

export const searchPlanets = async (
  query: string,
  options: { fetcher?: Fetcher; signal?: AbortSignal } = {},
): Promise<PlanetSearchResult> => {
  const normalizedQuery = query.trim();
  if (normalizedQuery.length < 2) {
    return { cached: false, planets: [], query: normalizedQuery };
  }

  const response = await (options.fetcher ?? fetch)(
    `/api/planets?q=${encodeURIComponent(normalizedQuery)}&limit=12`,
    {
      headers: { accept: "application/json" },
      signal: options.signal ?? AbortSignal.timeout(8_000),
    },
  );

  if (!response.ok) throw new Error(`Planet search failed with status ${response.status}.`);

  const payload: unknown = await response.json();
  if (!isPlanetSearchResponse(payload)) {
    throw new Error("Planet search returned an invalid response.");
  }

  return {
    cached: payload.meta.cached,
    planets: payload.data,
    query: payload.meta.query,
  };
};
