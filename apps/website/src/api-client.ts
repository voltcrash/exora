import {
  type ContractSchema,
  type BlackHoleProfile,
  type BlackHoleResponse,
  type EphemerisResponse,
  type ExoplanetProfile,
  type PlanetResponse,
  type SchemaOutput,
  type StarProfile,
  type StarResponse,
} from "@exora/contracts";
import { appendUniqueById } from "./catalog-pagination.ts";
import { requestDeadline } from "./request-deadline.ts";

type Fetcher = (input: string | URL | Request, init?: RequestInit) => Promise<Response>;

const OBJECT_LOOKUP_TIMEOUT_MS = 8_000;

const PLANET_COLLECTION_TIMEOUT_MS = 8_000;
const STAR_COLLECTION_TIMEOUT_MS = 10_000;
const BLACK_HOLE_COLLECTION_TIMEOUT_MS = 10_000;
const EPHEMERIS_TIMEOUT_MS = 20_000;

interface CollectionOptions {
  fetcher?: Fetcher;
  signal?: AbortSignal;
}

interface PageOptions extends CollectionOptions {
  cursor?: string | null;
  limit?: number;
}

type ContractModule = typeof import("@exora/contracts");
type SchemaSelector<Schema extends ContractSchema> = (contracts: ContractModule) => Schema;

const responseSchema = {
  Ephemeris: (contracts: ContractModule) => contracts.ephemerisResponseSchema,
  BlackHole: (contracts: ContractModule) => contracts.blackHoleResponseSchema,
  BlackHoleSearch: (contracts: ContractModule) => contracts.blackHoleSearchResponseSchema,
  Planet: (contracts: ContractModule) => contracts.planetResponseSchema,
  PlanetSearch: (contracts: ContractModule) => contracts.planetSearchResponseSchema,
  Star: (contracts: ContractModule) => contracts.starResponseSchema,
  StarSearch: (contracts: ContractModule) => contracts.starSearchResponseSchema,
} as const;

const parseApiPayload = async <Schema extends ContractSchema>(
  selectSchema: SchemaSelector<Schema>,
  value: unknown,
): Promise<SchemaOutput<Schema>> => {
  const contracts = await import("@exora/contracts");
  return selectSchema(contracts).parse(value);
};

const requestCollection = async <Schema extends ContractSchema>(
  path: string,
  { fetcher = fetch, signal }: CollectionOptions,
  timeoutMs: number,
  subject: string,
  selectSchema: SchemaSelector<Schema>,
): Promise<SchemaOutput<Schema>> => {
  const response = await fetcher(path, {
    headers: { accept: "application/json" },
    signal: requestDeadline(timeoutMs, signal),
  });

  if (!response.ok) throw new Error(`${subject} failed with status ${response.status}.`);

  const payload: unknown = await response.json();
  try {
    return await parseApiPayload(selectSchema, payload);
  } catch {
    throw new Error(`${subject} returned an invalid response.`);
  }
};

const requestPlanetCollection = (
  path: string,
  options: CollectionOptions,
  subject: string,
): Promise<PlanetSearchResult> =>
  requestCollection(
    path,
    options,
    PLANET_COLLECTION_TIMEOUT_MS,
    subject,
    responseSchema.PlanetSearch,
  ).then(({ data, meta }) => ({
    cached: meta.cached,
    nextCursor: meta.nextCursor,
    // Archive rows can collapse onto one slug ("TWA 27b" and "TWA 27 b").
    planets: appendUniqueById([], data),
    query: meta.query,
  }));

const requestStarCollection = (
  path: string,
  options: CollectionOptions,
  subject: string,
): Promise<StarSearchResult> =>
  requestCollection(
    path,
    options,
    STAR_COLLECTION_TIMEOUT_MS,
    subject,
    responseSchema.StarSearch,
  ).then(({ data, meta }) => ({
    cached: meta.cached,
    nextCursor: meta.nextCursor,
    query: meta.query,
    stars: appendUniqueById([], data),
  }));

export interface PlanetLoadResult {
  cached: boolean;
  mode: "custom" | "fallback" | "live" | "solar";
  planet: ExoplanetProfile;
}

export interface PlanetSearchResult {
  cached: boolean;
  nextCursor: string | null;
  planets: ExoplanetProfile[];
  query: string;
}

export interface StarLoadResult {
  cached: boolean;
  mode: "custom" | "live" | "solar";
  star: StarProfile;
}

export interface StarSearchResult {
  cached: boolean;
  nextCursor: string | null;
  query: string;
  stars: StarProfile[];
}

export interface SystemLoadResult {
  cached: boolean;
  hostStar: string;
  planets: ExoplanetProfile[];
}

export interface RandomPlanetResult {
  cached: boolean;
  planet: ExoplanetProfile;
}

export interface RandomStarResult {
  cached: boolean;
  star: StarProfile;
}

export interface BlackHoleSearchResult {
  blackHoles: BlackHoleProfile[];
  cached: boolean;
  stale: boolean;
}

const requestBlackHole = async (
  name: string,
  fetcher: Fetcher,
  signal?: AbortSignal,
): Promise<BlackHoleResponse | null> => {
  try {
    const response = await fetcher(`/api/black-holes/${encodeURIComponent(name)}`, {
      headers: { accept: "application/json" },
      signal: requestDeadline(OBJECT_LOOKUP_TIMEOUT_MS, signal),
    });
    if (!response.ok) return null;
    return await parseApiPayload(responseSchema.BlackHole, await response.json());
  } catch {
    return null;
  }
};

export const loadBlackHoleByName = async (
  name: string,
  fetcher: Fetcher = fetch,
): Promise<BlackHoleProfile | null> => (await requestBlackHole(name, fetcher))?.data ?? null;

export const loadObservedBlackHoles = async (
  limit = 50,
  options: CollectionOptions = {},
): Promise<BlackHoleSearchResult> => {
  const safeLimit = Math.max(1, Math.min(Math.trunc(limit), 100));
  const response = await requestCollection(
    `/api/black-holes?source=observed&limit=${safeLimit}`,
    options,
    BLACK_HOLE_COLLECTION_TIMEOUT_MS,
    "Black-hole catalog",
    responseSchema.BlackHoleSearch,
  );
  return {
    blackHoles: response.data,
    cached: response.meta.cached,
    stale: response.meta.stale,
  };
};

export const loadSolarEphemeris = async (
  epoch: Date,
  naifIds: readonly number[],
  options: CollectionOptions = {},
): Promise<EphemerisResponse> => {
  const parameters = new URLSearchParams({
    at: epoch.toISOString(),
    ids: naifIds.join(","),
  });
  const response = await requestCollection(
    `/api/ephemerides?${parameters.toString()}`,
    options,
    EPHEMERIS_TIMEOUT_MS,
    "JPL ephemeris",
    responseSchema.Ephemeris,
  );
  const expected = new Set(naifIds);
  if (
    response.data.length !== expected.size ||
    response.data.some(
      (vector) => !expected.has(vector.naifId) || vector.epoch !== response.meta.epoch,
    )
  ) {
    throw new Error("JPL ephemeris returned a different target set or epoch.");
  }
  return response;
};

const requestPlanet = async (
  path: string,
  fetcher: Fetcher,
  signal?: AbortSignal,
): Promise<PlanetResponse | null> => {
  try {
    const response = await fetcher(path, {
      headers: { accept: "application/json" },
      signal: requestDeadline(OBJECT_LOOKUP_TIMEOUT_MS, signal),
    });

    if (!response.ok) return null;

    return await parseApiPayload(responseSchema.Planet, await response.json());
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
  options: CollectionOptions = {},
): Promise<PlanetSearchResult> => {
  const normalizedQuery = query.trim();
  if (normalizedQuery.length < 1) {
    return { cached: false, nextCursor: null, planets: [], query: normalizedQuery };
  }

  return requestPlanetCollection(
    `/api/planets?q=${encodeURIComponent(normalizedQuery)}&limit=12`,
    options,
    "Planet search",
  );
};

export const discoverPlanets = async (
  category: string,
  options: CollectionOptions = {},
): Promise<PlanetSearchResult> =>
  requestPlanetCollection(
    `/api/planets?category=${encodeURIComponent(category)}&limit=12`,
    options,
    "Planet discovery",
  );

export const loadPlanetsByHost = async (
  hostStar: string,
  options: CollectionOptions = {},
): Promise<PlanetSearchResult> =>
  requestPlanetCollection(
    `/api/planets?host=${encodeURIComponent(hostStar)}&limit=12`,
    options,
    "Planet discovery",
  );

export const loadPlanetsForStar = async (
  starName: string,
  options: CollectionOptions = {},
): Promise<PlanetSearchResult> =>
  requestPlanetCollection(
    `/api/stars/${encodeURIComponent(starName)}/planets?limit=12`,
    options,
    "Stellar system discovery",
  );

const PLANET_PAGE_SIZE = 60;
const STAR_PAGE_SIZE = 24;

const pageQuery = (limit: number, cursor?: string | null): string =>
  `&limit=${limit}${cursor ? `&cursor=${encodeURIComponent(cursor)}` : ""}`;

export const loadPlanetFilterPool = async ({
  cursor,
  limit = PLANET_PAGE_SIZE,
  ...options
}: PageOptions = {}): Promise<PlanetSearchResult> =>
  requestPlanetCollection(
    `/api/planets?browse=physical-controls${pageQuery(limit, cursor)}`,
    options,
    "Planet discovery",
  );

export const browseStars = async ({
  cursor,
  limit = STAR_PAGE_SIZE,
  ...options
}: PageOptions = {}): Promise<StarSearchResult> =>
  requestStarCollection(
    `/api/stars?browse=catalog${pageQuery(limit, cursor)}`,
    options,
    "Star catalog",
  );

const PLANET_SURPRISE_CATEGORIES = [
  "most-earth-like",
  "nearest-rocky-worlds",
  "record-breakers",
  "gas-giants",
  "frozen-worlds",
  "recently-confirmed",
] as const;

const randomIndex = (length: number, random: () => number): number =>
  Math.min(length - 1, Math.floor(Math.max(0, random()) * length));

export const discoverRandomPlanet = async (
  options: { fetcher?: Fetcher; random?: () => number; signal?: AbortSignal } = {},
): Promise<RandomPlanetResult> => {
  const random = options.random ?? Math.random;
  const start = randomIndex(PLANET_SURPRISE_CATEGORIES.length, random);

  for (let offset = 0; offset < PLANET_SURPRISE_CATEGORIES.length; offset += 1) {
    const category =
      PLANET_SURPRISE_CATEGORIES[(start + offset) % PLANET_SURPRISE_CATEGORIES.length];
    if (!category) continue;
    const result = await discoverPlanets(category, options);
    const candidates = result.planets.filter((planet) => planet.kind !== "unknown");
    if (candidates.length === 0) continue;
    const planet = candidates[randomIndex(candidates.length, random)];
    if (planet) return { cached: result.cached, planet };
  }

  throw new Error("No renderable surprise destination is currently available.");
};

const requestStar = async (
  path: string,
  fetcher: Fetcher,
  signal?: AbortSignal,
): Promise<StarResponse | null> => {
  try {
    const response = await fetcher(path, {
      headers: { accept: "application/json" },
      signal: requestDeadline(OBJECT_LOOKUP_TIMEOUT_MS, signal),
    });
    if (!response.ok) return null;
    return await parseApiPayload(responseSchema.Star, await response.json());
  } catch {
    return null;
  }
};

export const loadStarByName = async (
  name: string,
  fetcher: Fetcher = fetch,
): Promise<StarLoadResult | null> => {
  const payload = await requestStar(`/api/stars/${encodeURIComponent(name)}`, fetcher);
  return payload ? { cached: payload.meta.cached, mode: "live", star: payload.data } : null;
};

export const searchStars = async (
  query: string,
  options: CollectionOptions = {},
): Promise<StarSearchResult> => {
  const normalizedQuery = query.trim();
  const path =
    normalizedQuery.length >= 1
      ? `/api/stars?q=${encodeURIComponent(normalizedQuery)}&limit=12`
      : "/api/stars/featured";

  return requestStarCollection(path, options, "Star search");
};

export const discoverStars = async (
  category: string,
  options: CollectionOptions = {},
): Promise<StarSearchResult> =>
  requestStarCollection(
    `/api/stars?category=${encodeURIComponent(category)}&limit=12`,
    options,
    "Star discovery",
  );

const STAR_SURPRISE_CATEGORIES = [
  "closest-neighbors",
  "solar-analogs",
  "brightest-stars",
  "stellar-extremes",
  "binary-systems",
  "stellar-remnants",
] as const;

export const discoverRandomStar = async (
  options: { fetcher?: Fetcher; random?: () => number; signal?: AbortSignal } = {},
): Promise<RandomStarResult> => {
  const random = options.random ?? Math.random;
  const start = randomIndex(STAR_SURPRISE_CATEGORIES.length, random);

  for (let offset = 0; offset < STAR_SURPRISE_CATEGORIES.length; offset += 1) {
    const category = STAR_SURPRISE_CATEGORIES[(start + offset) % STAR_SURPRISE_CATEGORIES.length];
    if (!category) continue;
    const result = await discoverStars(category, options);
    const star = result.stars[randomIndex(result.stars.length, random)];
    if (star) return { cached: result.cached, star };
  }

  throw new Error("No surprise stellar destination is currently available.");
};
