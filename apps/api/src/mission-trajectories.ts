import { missionTrajectoryPointSchema, type MissionTrajectoryPoint } from "@exora/contracts";
import { createRequestCoalescer } from "./archive-cache.ts";
import { HORIZONS_API_VERSION, HORIZONS_SOURCE, HorizonsError } from "./horizons.ts";

const HORIZONS_ENDPOINT = "https://ssd.jpl.nasa.gov/api/horizons.api";

type Fetcher = (input: string | URL | Request, init?: RequestInit) => Promise<Response>;

export interface MissionTrajectoryTarget {
  command: string;
  name: string;
  spkId: string;
}

export const MISSION_TRAJECTORY_TARGETS = [
  { command: "-23", name: "Pioneer 10", spkId: "-23" },
  { command: "-24", name: "Pioneer 11", spkId: "-24" },
  { command: "-31", name: "Voyager 1", spkId: "-31" },
  { command: "-32", name: "Voyager 2", spkId: "-32" },
  { command: "-61", name: "Juno", spkId: "-61" },
  { command: "-64", name: "OSIRIS-REx", spkId: "-64" },
  { command: "-77", name: "Galileo", spkId: "-77" },
  { command: "-82", name: "Cassini", spkId: "-82" },
  { command: "-96", name: "Parker Solar Probe", spkId: "-96" },
  { command: "-98", name: "New Horizons", spkId: "-98" },
  { command: "-203", name: "Dawn", spkId: "-203" },
  { command: "-226", name: "Rosetta", spkId: "-226" },
] as const satisfies readonly MissionTrajectoryTarget[];

const TARGET_BY_SPK = new Map<string, MissionTrajectoryTarget>(
  MISSION_TRAJECTORY_TARGETS.map((target) => [target.spkId, target]),
);

interface HorizonsPayload {
  error?: unknown;
  result?: unknown;
  signature?: { source?: unknown; version?: unknown };
}

export interface MissionTrajectoryResult {
  cached: boolean;
  retrievedAt: string;
  solution: string;
  stale: boolean;
  target: MissionTrajectoryTarget;
  value: MissionTrajectoryPoint[];
}

export interface MissionTrajectoryRepository {
  trajectory(
    spkId: string,
    start: string,
    stop: string,
    stepDays: number,
  ): Promise<MissionTrajectoryResult>;
}

interface CacheEntry {
  freshUntil: number;
  result: Omit<MissionTrajectoryResult, "cached" | "stale">;
  staleUntil: number;
}

export interface JplMissionTrajectoryRepositoryOptions {
  cacheTtlMs?: number;
  fetcher?: Fetcher;
  maxCacheEntries?: number;
  now?: () => number;
  staleTtlMs?: number;
  timeoutMs?: number;
}

const finite = (value: string | undefined): number | null => {
  if (!value) return null;
  const parsed = Number(value.trim());
  return Number.isFinite(parsed) ? parsed : null;
};

/** Parses a bounded, multi-row Horizons vector table and rejects a changed API envelope. */
export const parseMissionTrajectory = (
  payload: unknown,
  target: MissionTrajectoryTarget,
): { points: MissionTrajectoryPoint[]; solution: string } => {
  if (!payload || typeof payload !== "object") {
    throw new HorizonsError("Horizons returned a non-object mission payload.");
  }
  const candidate = payload as HorizonsPayload;
  if (
    candidate.signature?.source !== HORIZONS_SOURCE ||
    candidate.signature.version !== HORIZONS_API_VERSION
  ) {
    throw new HorizonsError(
      "Horizons API signature or version did not match the validated mission contract.",
    );
  }
  if (typeof candidate.error === "string" && candidate.error.trim()) {
    throw new HorizonsError("Horizons rejected the mission trajectory request.");
  }
  if (typeof candidate.result !== "string") {
    throw new HorizonsError("Horizons omitted its mission trajectory result.");
  }
  if (!candidate.result.includes("Center body name: Sun (10)")) {
    throw new HorizonsError("Horizons returned a mission trajectory with an unexpected center.");
  }
  if (!candidate.result.includes("Reference frame : Ecliptic of J2000.0")) {
    throw new HorizonsError(
      "Horizons returned a mission trajectory in an unexpected reference frame.",
    );
  }
  if (!candidate.result.includes("Calendar Date (TDB)")) {
    throw new HorizonsError("Horizons returned mission samples in an unexpected time scale.");
  }
  const returnedTarget = candidate.result.match(/Target body name:\s*([^\n{]+)/)?.[1]?.trim();
  if (!returnedTarget?.toLocaleLowerCase().includes(target.name.toLocaleLowerCase())) {
    throw new HorizonsError("Horizons returned a different mission than Exora requested.");
  }
  const solution = candidate.result.match(/Target body name:.*\{source:\s*([^}]+)\}/)?.[1]?.trim();
  if (!solution) throw new HorizonsError("Horizons omitted its mission solution identifier.");

  const table = candidate.result.match(/\$\$SOE\s*\n([\s\S]*?)\n\$\$EOE/);
  const rows = table?.[1]
    ?.split("\n")
    .map((row) => row.trim())
    .filter(Boolean);
  if (!rows || rows.length < 2 || rows.length > 400) {
    throw new HorizonsError("Horizons returned an invalid number of mission trajectory samples.");
  }
  const points = rows.map((row): MissionTrajectoryPoint => {
    const fields = row.split(",").map((field) => field.trim());
    const values = [fields[0], ...fields.slice(2, 8)].map(finite);
    if (fields.length < 8 || values.some((value) => value === null)) {
      throw new HorizonsError("Horizons returned an unreadable mission trajectory table.");
    }
    const [julianDateTdb, x, y, z, vx, vy, vz] = values as [
      number,
      number,
      number,
      number,
      number,
      number,
      number,
    ];
    const calendar = fields[1] ?? "";
    const point = missionTrajectoryPointSchema.safeParse({
      calendarTdb: calendar.endsWith(" TDB") ? calendar : `${calendar} TDB`,
      julianDateTdb,
      positionAu: { x, y, z },
      velocityAuPerDay: { x: vx, y: vy, z: vz },
    });
    if (!point.success) {
      throw new HorizonsError("Horizons returned an invalid mission trajectory sample.");
    }
    return point.data;
  });
  return { points, solution };
};

const requestUrl = (
  target: MissionTrajectoryTarget,
  start: string,
  stop: string,
  stepDays: number,
): URL => {
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
    START_TIME: `'${start}'`,
    STEP_SIZE: `'${stepDays} d'`,
    STOP_TIME: `'${stop}'`,
    TIME_TYPE: "'TDB'",
    VEC_CORR: "'NONE'",
    VEC_LABELS: "'NO'",
    VEC_TABLE: "'2'",
    format: "json",
  });
  return new URL(`${HORIZONS_ENDPOINT}?${parameters.toString()}`);
};

export class JplMissionTrajectoryRepository implements MissionTrajectoryRepository {
  readonly #cache = new Map<string, CacheEntry>();
  readonly #cacheTtlMs: number;
  readonly #fetcher: Fetcher;
  readonly #maxCacheEntries: number;
  readonly #now: () => number;
  readonly #requests = createRequestCoalescer<MissionTrajectoryResult>();
  readonly #staleTtlMs: number;
  readonly #timeoutMs: number;

  constructor(options: JplMissionTrajectoryRepositoryOptions = {}) {
    this.#cacheTtlMs = options.cacheTtlMs ?? 30 * 86_400_000;
    this.#fetcher = options.fetcher ?? fetch;
    this.#maxCacheEntries = options.maxCacheEntries ?? 128;
    this.#now = options.now ?? Date.now;
    this.#staleTtlMs = options.staleTtlMs ?? 365 * 86_400_000;
    this.#timeoutMs = options.timeoutMs ?? 15_000;
  }

  trajectory(
    spkId: string,
    start: string,
    stop: string,
    stepDays: number,
  ): Promise<MissionTrajectoryResult> {
    const target = TARGET_BY_SPK.get(spkId);
    if (!target) throw new HorizonsError(`Unsupported mission target ${spkId}.`);
    const key = `${spkId}:${start}:${stop}:${stepDays}`;
    const now = this.#now();
    const cached = this.#cache.get(key);
    if (cached && cached.freshUntil > now) {
      this.#promote(key, cached);
      return Promise.resolve({ ...cached.result, cached: true, stale: false });
    }

    return this.#requests.run(key, async () => {
      try {
        const response = await this.#fetcher(requestUrl(target, start, stop, stepDays), {
          headers: { accept: "application/json" },
          signal: AbortSignal.timeout(this.#timeoutMs),
        });
        if (!response.ok) {
          throw new HorizonsError(`Horizons mission request failed with ${response.status}.`);
        }
        const parsed = parseMissionTrajectory(await response.json(), target);
        const result = {
          retrievedAt: new Date(this.#now()).toISOString(),
          solution: parsed.solution,
          target,
          value: parsed.points,
        };
        this.#promote(key, {
          freshUntil: now + this.#cacheTtlMs,
          result,
          staleUntil: now + this.#staleTtlMs,
        });
        return { ...result, cached: false, stale: false };
      } catch (error) {
        if (cached && cached.staleUntil > now) {
          this.#promote(key, cached);
          return { ...cached.result, cached: true, stale: true };
        }
        throw error instanceof HorizonsError
          ? error
          : new HorizonsError("Horizons mission request failed.", { cause: error });
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
