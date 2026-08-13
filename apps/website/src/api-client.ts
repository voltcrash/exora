import type { ExoplanetProfile, PlanetResponse } from "@exora/contracts";

type Fetcher = (input: string | URL | Request, init?: RequestInit) => Promise<Response>;

export interface FeaturedPlanetResult {
  cached: boolean;
  mode: "fallback" | "live";
  planet: ExoplanetProfile;
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

export const loadFeaturedPlanet = async (
  fallback: ExoplanetProfile,
  fetcher: Fetcher = fetch,
): Promise<FeaturedPlanetResult> => {
  try {
    const response = await fetcher("/api/planets/featured", {
      headers: { accept: "application/json" },
      signal: AbortSignal.timeout(4_000),
    });

    if (!response.ok) return { cached: false, mode: "fallback", planet: fallback };

    const payload: unknown = await response.json();
    if (!isPlanetResponse(payload)) {
      return { cached: false, mode: "fallback", planet: fallback };
    }

    return { cached: payload.meta.cached, mode: "live", planet: payload.data };
  } catch {
    return { cached: false, mode: "fallback", planet: fallback };
  }
};
