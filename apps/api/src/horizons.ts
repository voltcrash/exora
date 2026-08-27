import { ephemerisVectorSchema, type EphemerisVector } from "@exora/contracts";
import { createRequestCoalescer } from "./archive-cache.ts";

const HORIZONS_ENDPOINT = "https://ssd.jpl.nasa.gov/api/horizons.api";
export const HORIZONS_API_VERSION = "1.2";
export const HORIZONS_SOURCE = "NASA/JPL Horizons API" as const;

type Fetcher = (input: string | URL | Request, init?: RequestInit) => Promise<Response>;

export interface HorizonsTarget {
  command: string;
  name: string;
  naifId: number;
  spkId: string;
}

export const HORIZONS_TARGETS = [
  { command: "199", name: "Mercury", naifId: 199, spkId: "199" },
  { command: "299", name: "Venus", naifId: 299, spkId: "299" },
  { command: "399", name: "Earth", naifId: 399, spkId: "399" },
  { command: "499", name: "Mars", naifId: 499, spkId: "499" },
  { command: "599", name: "Jupiter", naifId: 599, spkId: "599" },
  { command: "699", name: "Saturn", naifId: 699, spkId: "699" },
  { command: "799", name: "Uranus", naifId: 799, spkId: "799" },
  { command: "899", name: "Neptune", naifId: 899, spkId: "899" },
  { command: "999", name: "Pluto", naifId: 999, spkId: "999" },
  { command: "DES=20000001;", name: "Ceres", naifId: 2_000_001, spkId: "20000001" },
  { command: "DES=20136199;", name: "Eris", naifId: 20_136_199, spkId: "20136199" },
  { command: "DES=20136108;", name: "Haumea", naifId: 20_136_108, spkId: "20136108" },
  { command: "DES=20136472;", name: "Makemake", naifId: 20_136_472, spkId: "20136472" },
] as const satisfies readonly HorizonsTarget[];

const TARGET_BY_NAIF = new Map<number, HorizonsTarget>(
  HORIZONS_TARGETS.map((target) => [target.naifId, target]),
);

export class HorizonsError extends Error {
  constructor(message: string, options?: ErrorOptions) {
    super(message, options);
    this.name = "HorizonsError";
  }
}

interface HorizonsPayload {
  error?: unknown;
  result?: unknown;
  signature?: { source?: unknown; version?: unknown };
}

interface CacheEntry {
  freshUntil: number;
  retrievedAt: string;
  staleUntil: number;
  value: EphemerisVector;
}

export interface HorizonsResult {
  cached: boolean;
  retrievedAt: string;
  stale: boolean;
  value: EphemerisVector[];
}

export interface HorizonsRepository {
  positions(naifIds: readonly number[], epoch: Date): Promise<HorizonsResult>;
}

export interface JplHorizonsRepositoryOptions {
  cacheTtlMs?: number;
  fetcher?: Fetcher;
  maxCacheEntries?: number;
  now?: () => number;
  staleTtlMs?: number;
  timeoutMs?: number;
  upstreamConcurrency?: number;
}

const finite = (value: string | undefined): number | null => {
  if (!value) return null;
  const parsed = Number(value.trim());
  return Number.isFinite(parsed) ? parsed : null;
};

/** Parses Horizons' documented CSV vector table while rejecting any changed API envelope. */
export const parseHorizonsVector = (
  payload: unknown,
  target: HorizonsTarget,
  epoch: string,
): EphemerisVector => {
  if (!payload || typeof payload !== "object") {
    throw new HorizonsError("Horizons returned a non-object payload.");
  }
  const candidate = payload as HorizonsPayload;
  if (
    candidate.signature?.source !== HORIZONS_SOURCE ||
    candidate.signature.version !== HORIZONS_API_VERSION
  ) {
    throw new HorizonsError(
      "Horizons API signature or version did not match the validated contract.",
    );
  }
  if (typeof candidate.error === "string" && candidate.error.trim()) {
    throw new HorizonsError("Horizons rejected the ephemeris request.");
  }
  if (typeof candidate.result !== "string") {
    throw new HorizonsError("Horizons omitted its vector result.");
  }
  if (!candidate.result.includes("Center body name: Sun (10)")) {
    throw new HorizonsError("Horizons returned a vector with an unexpected center.");
  }
  if (!candidate.result.includes("Reference frame : Ecliptic of J2000.0")) {
    throw new HorizonsError("Horizons returned a vector in an unexpected reference frame.");
  }
  const solution = candidate.result.match(/Target body name:.*\{source:\s*([^}]+)\}/)?.[1]?.trim();
  if (!solution) throw new HorizonsError("Horizons omitted its target solution identifier.");
  const returnedTarget = candidate.result.match(/Target body name:\s*([^\n{]+)/)?.[1]?.trim();
  if (!returnedTarget?.toLocaleLowerCase().includes(target.name.toLocaleLowerCase())) {
    throw new HorizonsError("Horizons returned a different target than Exora requested.");
  }

  const table = candidate.result.match(/\$\$SOE\s*\n([^\n]+)\n\$\$EOE/);
  const fields = table?.[1]?.split(",").map((field) => field.trim());
  if (!fields || fields.length < 8) {
    throw new HorizonsError("Horizons returned an unreadable vector table.");
  }
  const values = fields.slice(2, 8).map(finite);
  if (values.some((value) => value === null)) {
    throw new HorizonsError("Horizons returned non-finite vector components.");
  }
  const [x, y, z, vx, vy, vz] = values as [number, number, number, number, number, number];
  const vector = ephemerisVectorSchema.safeParse({
    epoch,
    name: target.name,
    naifId: target.naifId,
    positionAu: { x, y, z },
    solution,
    spkId: target.spkId,
    velocityAuPerDay: { x: vx, y: vy, z: vz },
  });
  if (!vector.success) throw new HorizonsError("Horizons returned an invalid vector contract.");
  return vector.data;
};

const requestUrl = (target: HorizonsTarget, epoch: Date): URL => {
  const julianDate = epoch.getTime() / 86_400_000 + 2_440_587.5;
  const parameters = new URLSearchParams({
    CENTER: "'500@10'",
    COMMAND: `'${target.command}'`,
    CSV_FORMAT: "'YES'",
    EPHEM_TYPE: "'VECTORS'",
    MAKE_EPHEM: "'YES'",
    OBJ_DATA: "'NO'",
    OUT_UNITS: "'AU-D'",
    REF_PLANE: "'ECLIPTIC'",
    REF_SYSTEM: "'ICRF'",
    TIME_TYPE: "'UT'",
    TLIST: `'${julianDate.toFixed(9)}'`,
    TLIST_TYPE: "'JD'",
    VEC_CORR: "'NONE'",
    VEC_LABELS: "'NO'",
    VEC_TABLE: "'2'",
    format: "json",
  });
  return new URL(`${HORIZONS_ENDPOINT}?${parameters.toString()}`);
};

const concurrentMap = async <T, U>(
  values: readonly T[],
  concurrency: number,
  transform: (value: T) => Promise<U>,
): Promise<U[]> => {
  const output: U[] = [];
  let cursor = 0;
  const workers = Array.from({ length: Math.min(concurrency, values.length) }, async () => {
    while (cursor < values.length) {
      const index = cursor;
      cursor += 1;
      const value = values[index];
      if (value !== undefined) output[index] = await transform(value);
    }
  });
  await Promise.all(workers);
  return output;
};

export class JplHorizonsRepository implements HorizonsRepository {
  readonly #cache = new Map<string, CacheEntry>();
  readonly #cacheTtlMs: number;
  readonly #fetcher: Fetcher;
  readonly #maxCacheEntries: number;
  readonly #now: () => number;
  readonly #requests = createRequestCoalescer<{
    cached: boolean;
    retrievedAt: string;
    stale: boolean;
    value: EphemerisVector;
  }>();
  readonly #staleTtlMs: number;
  readonly #timeoutMs: number;
  readonly #upstreamConcurrency: number;

  constructor(options: JplHorizonsRepositoryOptions = {}) {
    this.#cacheTtlMs = options.cacheTtlMs ?? 86_400_000;
    this.#fetcher = options.fetcher ?? fetch;
    this.#maxCacheEntries = options.maxCacheEntries ?? 1_024;
    this.#now = options.now ?? Date.now;
    this.#staleTtlMs = options.staleTtlMs ?? 30 * 86_400_000;
    this.#timeoutMs = options.timeoutMs ?? 12_000;
    this.#upstreamConcurrency = Math.max(1, options.upstreamConcurrency ?? 3);
  }

  async positions(naifIds: readonly number[], epoch: Date): Promise<HorizonsResult> {
    const targets = naifIds.map((naifId) => {
      const target = TARGET_BY_NAIF.get(naifId);
      if (!target) throw new HorizonsError(`Unsupported Horizons target ${naifId}.`);
      return target;
    });
    const epochIso = epoch.toISOString();
    const states = await concurrentMap(targets, this.#upstreamConcurrency, (target) =>
      this.#position(target, epoch, epochIso),
    );
    return {
      cached: states.every(({ cached }) => cached),
      // One collection can mix cache ages. Reporting the oldest retrieval is the conservative
      // statement: no vector in the response is older than the instant printed to the visitor.
      retrievedAt: states.map(({ retrievedAt }) => retrievedAt).sort()[0] ?? epochIso,
      stale: states.some(({ stale }) => stale),
      value: states.map(({ value }) => value),
    };
  }

  #position(
    target: HorizonsTarget,
    epoch: Date,
    epochIso: string,
  ): Promise<{ cached: boolean; retrievedAt: string; stale: boolean; value: EphemerisVector }> {
    const key = `${target.naifId}:${epochIso}`;
    const now = this.#now();
    const cached = this.#cache.get(key);
    if (cached && cached.freshUntil > now) {
      this.#promote(key, cached);
      return Promise.resolve({
        cached: true,
        retrievedAt: cached.retrievedAt,
        stale: false,
        value: cached.value,
      });
    }

    return this.#requests.run(key, async () => {
      try {
        const response = await this.#fetcher(requestUrl(target, epoch), {
          headers: { accept: "application/json" },
          signal: AbortSignal.timeout(this.#timeoutMs),
        });
        if (!response.ok)
          throw new HorizonsError(`Horizons request failed with ${response.status}.`);
        const payload: unknown = await response.json();
        const value = parseHorizonsVector(payload, target, epochIso);
        const retrievedAt = new Date(this.#now()).toISOString();
        this.#promote(key, {
          freshUntil: now + this.#cacheTtlMs,
          retrievedAt,
          staleUntil: now + this.#staleTtlMs,
          value,
        });
        return { cached: false, retrievedAt, stale: false, value };
      } catch (error) {
        if (cached && cached.staleUntil > now) {
          this.#promote(key, cached);
          return {
            cached: true,
            retrievedAt: cached.retrievedAt,
            stale: true,
            value: cached.value,
          };
        }
        throw error instanceof HorizonsError
          ? error
          : new HorizonsError("Horizons request failed.", { cause: error });
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
