import {
  type EphemerisResponse,
  type ExoplanetProfile,
  type MissionTrajectoryResponse,
  type PlanetResponse,
  type PlanetSearchResponse,
  type SmallBodyLookup,
  type SmallBodySearchResponse,
  type StarProfile,
  type StarResponse,
  type StarSearchResponse,
} from "@exora/contracts";
import { requestDeadline } from "./request-deadline.ts";

type Fetcher = (input: string | URL | Request, init?: RequestInit) => Promise<Response>;

/**
 * How long a single-object lookup waits before giving up.
 *
 * Both object lookups fail soft — they resolve to `null` and the caller falls back — so the
 * budget has to cover the slowest honest answer rather than the typical one. A cold serverless
 * instance plus a cold database connection clears four seconds without either end being broken,
 * and the cost of cutting it short is silent and wrong: a shared `?planet=` link quietly lands
 * on the bundled featured world instead of the world it named.
 */
const OBJECT_LOOKUP_TIMEOUT_MS = 8_000;

/**
 * How long a list request waits. Longer than a single-object lookup, because a collection may
 * cost the API a fresh archive round trip, and longer for SIMBAD than for the planet catalog,
 * which is usually answered from PostgreSQL.
 */
const PLANET_COLLECTION_TIMEOUT_MS = 8_000;
const STAR_COLLECTION_TIMEOUT_MS = 10_000;
const EPHEMERIS_TIMEOUT_MS = 20_000;
const MISSION_TRAJECTORY_TIMEOUT_MS = 20_000;
const SMALL_BODY_TIMEOUT_MS = 15_000;

interface CollectionOptions {
  fetcher?: Fetcher;
  signal?: AbortSignal;
}

interface SmallBodySearchOptions extends CollectionOptions {
  lookup?: SmallBodyLookup;
}

type RuntimeSchemaName =
  | "ephemerisResponseSchema"
  | "missionTrajectoryResponseSchema"
  | "planetResponseSchema"
  | "planetSearchResponseSchema"
  | "smallBodySearchResponseSchema"
  | "starResponseSchema"
  | "starSearchResponseSchema";

const parseApiPayload = async <Payload>(
  schemaName: RuntimeSchemaName,
  value: unknown,
): Promise<Payload> => {
  // Contracts are loaded only when the first API response arrives. Zod and the full schema graph
  // stay out of Exora's latency-sensitive renderer chunk while every network payload still passes
  // through the same runtime contract used by the server.
  const contracts = await import("@exora/contracts");
  return contracts[schemaName].parse(value) as Payload;
};

/**
 * Fetches and validates one list endpoint.
 *
 * Unlike the single-object lookups above, a failure here is raised rather than swallowed: there
 * is no sensible stand-in for "the collection you asked for", so the caller shows the error.
 * `subject` names the request in that message, which is the only thing that varied between the
 * four copies of this that used to exist.
 */
const requestCollection = async <Payload>(
  path: string,
  { fetcher = fetch, signal }: CollectionOptions,
  timeoutMs: number,
  subject: string,
  schemaName: RuntimeSchemaName,
): Promise<Payload> => {
  const response = await fetcher(path, {
    headers: { accept: "application/json" },
    signal: requestDeadline(timeoutMs, signal),
  });

  if (!response.ok) throw new Error(`${subject} failed with status ${response.status}.`);

  const payload: unknown = await response.json();
  try {
    return await parseApiPayload<Payload>(schemaName, payload);
  } catch {
    throw new Error(`${subject} returned an invalid response.`);
  }
};

const requestPlanetCollection = (
  path: string,
  options: CollectionOptions,
  subject: string,
): Promise<PlanetSearchResult> =>
  requestCollection<PlanetSearchResponse>(
    path,
    options,
    PLANET_COLLECTION_TIMEOUT_MS,
    subject,
    "planetSearchResponseSchema",
  ) //
    .then(({ data, meta }) => ({ cached: meta.cached, planets: data, query: meta.query }));

const requestStarCollection = (
  path: string,
  options: CollectionOptions,
  subject: string,
): Promise<StarSearchResult> =>
  requestCollection<StarSearchResponse>(
    path,
    options,
    STAR_COLLECTION_TIMEOUT_MS,
    subject,
    "starSearchResponseSchema",
  ) //
    .then(({ data, meta }) => ({ cached: meta.cached, query: meta.query, stars: data }));

export interface PlanetLoadResult {
  cached: boolean;
  mode: "custom" | "fallback" | "live" | "solar";
  planet: ExoplanetProfile;
}

export interface PlanetSearchResult {
  cached: boolean;
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
  query: string;
  stars: StarProfile[];
}

/**
 * A whole host system: its name, and every confirmed world the archive links to it.
 *
 * Deliberately not a star lookup. Each planet row already carries its host's temperature, radius,
 * mass and luminosity, which is what the diorama draws the star from, so a system resolves out of
 * one planet query and stays reachable for the many hosts SIMBAD cannot name.
 */
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

export const searchSmallBodies = async (
  query: string,
  { lookup = "auto", ...options }: SmallBodySearchOptions = {},
): Promise<SmallBodySearchResponse> => {
  const parameters = new URLSearchParams({ lookup, q: query.trim() });
  return requestCollection<SmallBodySearchResponse>(
    `/api/small-bodies?${parameters.toString()}`,
    options,
    SMALL_BODY_TIMEOUT_MS,
    "JPL small-body search",
    "smallBodySearchResponseSchema",
  );
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
  const response = await requestCollection<EphemerisResponse>(
    `/api/ephemerides?${parameters.toString()}`,
    options,
    EPHEMERIS_TIMEOUT_MS,
    "JPL ephemeris",
    "ephemerisResponseSchema",
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

export const loadMissionTrajectory = async (
  spkId: string,
  range: { start: string; stepDays: number; stop: string },
  options: CollectionOptions = {},
): Promise<MissionTrajectoryResponse> => {
  const parameters = new URLSearchParams({
    spk: spkId,
    start: range.start,
    step: String(range.stepDays),
    stop: range.stop,
  });
  const response = await requestCollection<MissionTrajectoryResponse>(
    `/api/mission-trajectories?${parameters.toString()}`,
    options,
    MISSION_TRAJECTORY_TIMEOUT_MS,
    "JPL mission trajectory",
    "missionTrajectoryResponseSchema",
  );
  if (response.meta.spkId !== spkId || response.meta.stepDays !== range.stepDays) {
    throw new Error("JPL mission trajectory returned a different target or sample interval.");
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

    return await parseApiPayload<PlanetResponse>("planetResponseSchema", await response.json());
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
    return { cached: false, planets: [], query: normalizedQuery };
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

export const loadPlanetFilterPool = async (
  options: CollectionOptions = {},
): Promise<PlanetSearchResult> =>
  requestPlanetCollection(
    "/api/planets?browse=physical-controls&limit=120",
    options,
    "Planet discovery",
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
    return await parseApiPayload<StarResponse>("starResponseSchema", await response.json());
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
