import type {
  SmallBodyCloseApproach,
  SmallBodyLookup,
  SmallBodyMatch,
  SmallBodyParameter,
  SmallBodyProfile,
} from "@exora/contracts";
import { createRequestCoalescer } from "./archive-cache.ts";

const SBDB_ENDPOINT = "https://ssd-api.jpl.nasa.gov/sbdb.api";
export const SBDB_API_VERSION = "1.3";
export const SBDB_SOURCE = "NASA/JPL Small-Body Database (SBDB) API" as const;

type Fetcher = (input: string | URL | Request, init?: RequestInit) => Promise<Response>;

export const POPULAR_SMALL_BODY_QUERIES = new Set([
  "1p",
  "4",
  "16",
  "19p",
  "67p",
  "81p",
  "243",
  "433",
  "9p",
  "1995 o1",
  "1993 f2",
  "25143",
  "65803",
  "99942",
  "101955",
  "162173",
  "1000005",
  "1000012",
  "1000036",
  "1000093",
  "1000107",
  "1000132",
  "1000190",
  "20000004",
  "20000016",
  "20000243",
  "20000433",
  "20025143",
  "20065803",
  "20099942",
  "20101955",
  "20162173",
  "apophis",
  "bennu",
  "borrelly",
  "didymos",
  "eros",
  "hale-bopp",
  "halley",
  "ida",
  "itokawa",
  "psyche",
  "ryugu",
  "tempel 1",
  "vesta",
  "wild 2",
]);

interface SbdbPayload {
  ca_data?: unknown;
  code?: unknown;
  list?: unknown;
  message?: unknown;
  object?: unknown;
  orbit?: unknown;
  phys_par?: unknown;
  signature?: { source?: unknown; version?: unknown };
}

interface CacheEntry {
  freshUntil: number;
  staleUntil: number;
  value: SbdbSearchValue;
}

export interface SbdbSearchValue {
  data: SmallBodyProfile | null;
  matches: SmallBodyMatch[];
  retrievedAt: string;
  status: "ambiguous" | "match" | "not-found";
}

export interface SbdbSearchResult extends SbdbSearchValue {
  cached: boolean;
  stale: boolean;
}

export interface SbdbRepository {
  search(query: string, lookup: SmallBodyLookup): Promise<SbdbSearchResult>;
}

export interface JplSbdbRepositoryOptions {
  cacheTtlMs?: number;
  fetcher?: Fetcher;
  maxCacheEntries?: number;
  now?: () => number;
  popularCacheTtlMs?: number;
  staleTtlMs?: number;
  timeoutMs?: number;
}

export class SbdbError extends Error {
  constructor(message: string, options?: ErrorOptions) {
    super(message, options);
    this.name = "SbdbError";
  }
}

const recordOrNull = (value: unknown): Record<string, unknown> | null =>
  value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;

const stringOrNull = (value: unknown): string | null =>
  typeof value === "string" && value.trim() ? value.trim() : null;

const numberOrNull = (value: unknown): number | null => {
  if (typeof value !== "number" && typeof value !== "string") return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
};

const booleanOrNull = (value: unknown): boolean | null =>
  typeof value === "boolean" ? value : null;

const parameter = (value: unknown): SmallBodyParameter | null => {
  const candidate = recordOrNull(value);
  const name = stringOrNull(candidate?.name);
  const title = stringOrNull(candidate?.title);
  const measured = stringOrNull(candidate?.value);
  if (!candidate || !name || !title || !measured) return null;
  return {
    name,
    reference: stringOrNull(candidate.ref),
    title,
    uncertainty: stringOrNull(candidate.sigma),
    units: stringOrNull(candidate.units),
    value: measured,
  };
};

const parameters = (value: unknown): SmallBodyParameter[] =>
  Array.isArray(value) ? value.map(parameter).filter((item) => item !== null) : [];

const closeApproach = (value: unknown): SmallBodyCloseApproach | null => {
  const candidate = recordOrNull(value);
  const body = stringOrNull(candidate?.body);
  const calendarDate = stringOrNull(candidate?.cd);
  const distanceAu = numberOrNull(candidate?.dist);
  if (!candidate || !body || !calendarDate || distanceAu === null) return null;
  return {
    body,
    calendarDate,
    distanceAu,
    distanceMaximumAu: numberOrNull(candidate.dist_max),
    distanceMinimumAu: numberOrNull(candidate.dist_min),
    julianDate: numberOrNull(candidate.jd),
    relativeVelocityKilometersPerSecond: numberOrNull(candidate.v_rel),
    timeUncertaintySeconds: numberOrNull(candidate.sigma_t),
  };
};

const relevantApproaches = (value: unknown, now: number): SmallBodyCloseApproach[] => {
  if (!Array.isArray(value)) return [];
  const todayJulianDate = now / 86_400_000 + 2_440_587.5;
  return value
    .map(closeApproach)
    .filter((item) => item !== null)
    .sort(
      (left, right) =>
        Math.abs((left.julianDate ?? todayJulianDate) - todayJulianDate) -
        Math.abs((right.julianDate ?? todayJulianDate) - todayJulianDate),
    )
    .slice(0, 6)
    .sort((left, right) => (left.julianDate ?? 0) - (right.julianDate ?? 0));
};

const validateSignature = (payload: SbdbPayload): void => {
  if (payload.signature?.source !== SBDB_SOURCE || payload.signature.version !== SBDB_API_VERSION) {
    throw new SbdbError("SBDB API signature or version did not match the validated contract.");
  }
};

/** Normalizes the documented unique, ambiguous, and not-found SBDB response envelopes. */
export const parseSbdbPayload = (
  payload: unknown,
  retrievedAt: string,
  now = Date.now(),
): SbdbSearchValue => {
  const candidate = recordOrNull(payload) as SbdbPayload | null;
  if (!candidate) throw new SbdbError("SBDB returned a non-object payload.");

  // JPL's documented not-found envelope intentionally has no signature. Keep the exception
  // narrow: only the exact code/message pair is accepted without a versioned data contract.
  if (String(candidate.code) === "200" && candidate.message === "specified object was not found") {
    return { data: null, matches: [], retrievedAt, status: "not-found" };
  }

  validateSignature(candidate);
  if (String(candidate.code) === "300") {
    if (!Array.isArray(candidate.list)) throw new SbdbError("SBDB omitted its ambiguity list.");
    const matches = candidate.list
      .map((item) => {
        const match = recordOrNull(item);
        const designation = stringOrNull(match?.pdes);
        const name = stringOrNull(match?.name);
        return designation && name ? { designation, name } : null;
      })
      .filter((item) => item !== null);
    if (matches.length === 0) throw new SbdbError("SBDB returned an empty ambiguity list.");
    return { data: null, matches, retrievedAt, status: "ambiguous" };
  }

  const object = recordOrNull(candidate.object);
  const orbit = recordOrNull(candidate.orbit);
  const designation = stringOrNull(object?.des);
  const spkId = stringOrNull(object?.spkid);
  const fullName = stringOrNull(object?.fullname) ?? stringOrNull(object?.shortname);
  const kindCode = stringOrNull(object?.kind);
  if (!object || !orbit || !designation || !spkId || !fullName || !kindCode) {
    throw new SbdbError("SBDB omitted required object or orbit identity fields.");
  }
  const kind = kindCode.startsWith("a") ? "asteroid" : kindCode.startsWith("c") ? "comet" : null;
  if (!kind) throw new SbdbError("SBDB returned an unknown small-body classification.");

  const orbitClass = recordOrNull(object.orbit_class);
  const orbitClassCode = stringOrNull(orbitClass?.code);
  const orbitClassName = stringOrNull(orbitClass?.name);
  return {
    data: {
      closeApproaches: relevantApproaches(candidate.ca_data, now),
      designation,
      fullName,
      kind,
      nearEarth: booleanOrNull(object.neo),
      orbit: {
        conditionCode: stringOrNull(orbit.condition_code),
        dataArcDays: numberOrNull(orbit.data_arc),
        elements: parameters(orbit.elements),
        epochJulianDate: numberOrNull(orbit.epoch),
        firstObservation: stringOrNull(orbit.first_obs),
        lastObservation: stringOrNull(orbit.last_obs),
        solutionDate: stringOrNull(orbit.soln_date),
        solutionId: stringOrNull(object.orbit_id) ?? stringOrNull(orbit.orbit_id),
      },
      orbitClass:
        orbitClassCode && orbitClassName ? { code: orbitClassCode, name: orbitClassName } : null,
      physicalParameters: parameters(candidate.phys_par),
      potentiallyHazardous: booleanOrNull(object.pha),
      spkId,
    },
    matches: [],
    retrievedAt,
    status: "match",
  };
};

const effectiveLookup = (
  query: string,
  requested: SmallBodyLookup,
): Exclude<SmallBodyLookup, "auto"> | "search" => {
  if (requested !== "auto") return requested;
  return /^\d{7,}$/.test(query) ? "spk" : "search";
};

const requestUrl = (query: string, lookup: SmallBodyLookup): URL => {
  const resolved = effectiveLookup(query, lookup);
  const parameters = new URLSearchParams({
    "alt-des": "1",
    "ca-body": "Earth",
    "ca-data": "1",
    "ca-time": "both",
    "ca-tunc": "both",
    discovery: "1",
    "full-prec": "1",
    "phys-par": "1",
  });
  parameters.set(resolved === "search" ? "sstr" : resolved === "spk" ? "spk" : "des", query);
  return new URL(`${SBDB_ENDPOINT}?${parameters.toString()}`);
};

export class JplSbdbRepository implements SbdbRepository {
  readonly #cache = new Map<string, CacheEntry>();
  readonly #cacheTtlMs: number;
  readonly #fetcher: Fetcher;
  readonly #maxCacheEntries: number;
  readonly #now: () => number;
  readonly #popularCacheTtlMs: number;
  readonly #requests = createRequestCoalescer<SbdbSearchResult>();
  readonly #staleTtlMs: number;
  readonly #timeoutMs: number;

  constructor(options: JplSbdbRepositoryOptions = {}) {
    this.#cacheTtlMs = options.cacheTtlMs ?? 60 * 60_000;
    this.#fetcher = options.fetcher ?? fetch;
    this.#maxCacheEntries = options.maxCacheEntries ?? 512;
    this.#now = options.now ?? Date.now;
    this.#popularCacheTtlMs = options.popularCacheTtlMs ?? 24 * 60 * 60_000;
    this.#staleTtlMs = options.staleTtlMs ?? 30 * 24 * 60 * 60_000;
    this.#timeoutMs = options.timeoutMs ?? 12_000;
  }

  search(query: string, lookup: SmallBodyLookup): Promise<SbdbSearchResult> {
    const normalizedQuery = query.trim();
    const key = `${lookup}:${normalizedQuery.toLocaleLowerCase()}`;
    const now = this.#now();
    const cached = this.#cache.get(key);
    if (cached?.freshUntil && cached.freshUntil > now) {
      this.#promote(key, cached);
      return Promise.resolve({ ...cached.value, cached: true, stale: false });
    }

    return this.#requests.run(key, async () => {
      try {
        const response = await this.#fetcher(requestUrl(normalizedQuery, lookup), {
          headers: { accept: "application/json" },
          signal: AbortSignal.timeout(this.#timeoutMs),
        });
        if (!response.ok) throw new SbdbError(`SBDB request failed with ${response.status}.`);
        const retrievedAt = new Date(this.#now()).toISOString();
        const payload: unknown = await response.json();
        const value = parseSbdbPayload(payload, retrievedAt, now);
        const normalizedPopular = normalizedQuery.toLocaleLowerCase().replace(/^\((.*)\)$/, "$1");
        const ttl = POPULAR_SMALL_BODY_QUERIES.has(normalizedPopular)
          ? this.#popularCacheTtlMs
          : this.#cacheTtlMs;
        this.#promote(key, {
          freshUntil: now + ttl,
          staleUntil: now + this.#staleTtlMs,
          value,
        });
        return { ...value, cached: false, stale: false };
      } catch (error) {
        if (cached && cached.staleUntil > now) {
          this.#promote(key, cached);
          return { ...cached.value, cached: true, stale: true };
        }
        throw error instanceof SbdbError
          ? error
          : new SbdbError("SBDB request failed.", { cause: error });
      }
    });
  }

  #promote(key: string, entry: CacheEntry): void {
    this.#cache.delete(key);
    this.#cache.set(key, entry);
    while (this.#cache.size > this.#maxCacheEntries) {
      const oldest = this.#cache.keys().next();
      if (oldest.done) break;
      this.#cache.delete(oldest.value);
    }
  }
}
