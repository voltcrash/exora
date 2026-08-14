import type { ExoplanetProfile, PlanetKind } from "@exora/contracts";

const NASA_TAP_ENDPOINT = "https://exoplanetarchive.ipac.caltech.edu/TAP/sync";
const NASA_COLUMNS = [
  "pl_name",
  "hostname",
  "pl_radj",
  "pl_bmassj",
  "pl_rade",
  "pl_bmasse",
  "pl_eqt",
  "pl_orbper",
  "pl_orbsmax",
  "sy_dist",
  "disc_year",
  "discoverymethod",
  "st_spectype",
  "st_teff",
  "st_rad",
  "st_mass",
  "st_lum",
].join(",");

type Fetcher = (input: string | URL | Request, init?: RequestInit) => Promise<Response>;

interface NasaPlanetRow {
  disc_year: number | null;
  discoverymethod: string | null;
  hostname: string | null;
  pl_bmasse: number | null;
  pl_bmassj: number | null;
  pl_eqt: number | null;
  pl_name: string | null;
  pl_orbper: number | null;
  pl_orbsmax: number | null;
  pl_rade: number | null;
  pl_radj: number | null;
  st_spectype: string | null;
  st_teff: number | null;
  st_rad: number | null;
  st_mass: number | null;
  st_lum: number | null;
  sy_dist: number | null;
}

interface CacheEntry<T> {
  expiresAt: number;
  value: T;
}

export interface RepositoryResult<T> {
  cached: boolean;
  value: T;
}

export interface PlanetRepository {
  discover(
    category: PlanetDiscoveryCategory,
    limit: number,
  ): Promise<RepositoryResult<ExoplanetProfile[]>>;
  findByName(name: string): Promise<RepositoryResult<ExoplanetProfile | null>>;
  search(query: string, limit: number): Promise<RepositoryResult<ExoplanetProfile[]>>;
}

export type PlanetDiscoveryCategory =
  | "earth-like"
  | "lava-worlds"
  | "gas-giants"
  | "ocean-candidates"
  | "frozen-worlds"
  | "extreme-weather"
  | "potentially-habitable"
  | "recently-discovered";

export const PLANET_DISCOVERY_CATEGORIES = new Set<PlanetDiscoveryCategory>([
  "earth-like",
  "lava-worlds",
  "gas-giants",
  "ocean-candidates",
  "frozen-worlds",
  "extreme-weather",
  "potentially-habitable",
  "recently-discovered",
]);

const DISCOVERY_FILTERS: Record<PlanetDiscoveryCategory, { order: string; where: string }> = {
  "earth-like": {
    where: "pl_rade between 0.8 and 1.6 and pl_eqt between 220 and 320",
    order: "abs(pl_rade-1), abs(pl_eqt-255)",
  },
  "lava-worlds": { where: "pl_eqt >= 1000 and pl_rade < 3", order: "pl_eqt desc" },
  "gas-giants": {
    where: "(pl_radj >= 0.45 or pl_bmassj >= 0.08)",
    order: "pl_radj desc",
  },
  "ocean-candidates": {
    where: "pl_rade between 1.3 and 2.6 and pl_eqt between 200 and 350",
    order: "abs(pl_eqt-275), pl_rade",
  },
  "frozen-worlds": { where: "pl_eqt < 180", order: "pl_eqt" },
  "extreme-weather": {
    where: "pl_eqt >= 1200 and (pl_radj >= 0.45 or pl_bmassj >= 0.08)",
    order: "pl_eqt desc",
  },
  "potentially-habitable": {
    where: "pl_rade between 0.5 and 1.8 and pl_eqt between 180 and 330",
    order: "abs(pl_rade-1), abs(pl_eqt-255)",
  },
  "recently-discovered": { where: "disc_year is not null", order: "disc_year desc, pl_name" },
};

export interface NasaPlanetRepositoryOptions {
  cacheTtlMs?: number;
  fetcher?: Fetcher;
  now?: () => number;
  timeoutMs?: number;
}

export class NasaArchiveError extends Error {
  constructor(message: string, options?: ErrorOptions) {
    super(message, options);
    this.name = "NasaArchiveError";
  }
}

const numberOrNull = (value: unknown): number | null =>
  typeof value === "number" && Number.isFinite(value) ? value : null;

const stringOrNull = (value: unknown): string | null =>
  typeof value === "string" && value.trim() ? value.trim() : null;

export const slugifyPlanetName = (name: string): string =>
  name
    .normalize("NFKD")
    .toLowerCase()
    .replaceAll(/[^a-z0-9]+/g, "-")
    .replaceAll(/^-|-$/g, "");

const classifyPlanet = (row: NasaPlanetRow): PlanetKind => {
  const earthRadius = numberOrNull(row.pl_rade);
  const earthMass = numberOrNull(row.pl_bmasse);
  const jupiterRadius = numberOrNull(row.pl_radj);
  const jupiterMass = numberOrNull(row.pl_bmassj);

  if ((earthRadius !== null && earthRadius <= 2) || (earthMass !== null && earthMass <= 10)) {
    return "rocky";
  }

  if ((earthRadius !== null && earthRadius <= 6) || (earthMass !== null && earthMass <= 40)) {
    return "ice-giant";
  }

  if (
    (jupiterRadius !== null && jupiterRadius >= 0.45) ||
    (jupiterMass !== null && jupiterMass >= 0.08)
  ) {
    return "gas-giant";
  }

  return "unknown";
};

export const normalizeNasaPlanet = (
  rawRow: Record<string, unknown>,
  retrievedOn = new Date().toISOString().slice(0, 10),
): ExoplanetProfile | null => {
  const row = rawRow as unknown as NasaPlanetRow;
  const name = stringOrNull(row.pl_name);
  const hostStar = stringOrNull(row.hostname);

  if (!name || !hostStar) return null;

  return {
    id: slugifyPlanetName(name),
    name,
    hostStar,
    kind: classifyPlanet(row),
    observation: {
      radiusJupiter: numberOrNull(row.pl_radj),
      massJupiter: numberOrNull(row.pl_bmassj),
      radiusEarth: numberOrNull(row.pl_rade),
      massEarth: numberOrNull(row.pl_bmasse),
      equilibriumTemperatureKelvin: numberOrNull(row.pl_eqt),
      orbitalPeriodDays: numberOrNull(row.pl_orbper),
      semiMajorAxisAu: numberOrNull(row.pl_orbsmax),
      distanceParsecs: numberOrNull(row.sy_dist),
      discoveryYear: numberOrNull(row.disc_year),
      discoveryMethod: stringOrNull(row.discoverymethod) ?? "Unknown",
      hostSpectralType: stringOrNull(row.st_spectype),
      hostTemperatureKelvin: numberOrNull(row.st_teff),
      hostRadiusSolar: numberOrNull(row.st_rad),
      hostMassSolar: numberOrNull(row.st_mass),
      hostLuminosityLogSolar: numberOrNull(row.st_lum),
    },
    source: {
      archive: "NASA Exoplanet Archive",
      table: "pscomppars",
      retrievedOn,
    },
  };
};

const escapeAdqlLiteral = (value: string): string =>
  value.replaceAll("%", "").replaceAll("_", "").replaceAll("'", "''");

export class NasaPlanetRepository implements PlanetRepository {
  readonly #cache = new Map<string, CacheEntry<ExoplanetProfile[]>>();
  readonly #cacheTtlMs: number;
  readonly #fetcher: Fetcher;
  readonly #now: () => number;
  readonly #timeoutMs: number;

  constructor(options: NasaPlanetRepositoryOptions = {}) {
    this.#cacheTtlMs = options.cacheTtlMs ?? 1000 * 60 * 60 * 6;
    this.#fetcher = options.fetcher ?? fetch;
    this.#now = options.now ?? Date.now;
    this.#timeoutMs = options.timeoutMs ?? 10_000;
  }

  discover(
    category: PlanetDiscoveryCategory,
    limit: number,
  ): Promise<RepositoryResult<ExoplanetProfile[]>> {
    const filter = DISCOVERY_FILTERS[category];
    const safeLimit = Math.max(1, Math.min(Math.trunc(limit), 24));
    return this.#query(
      `select top ${safeLimit} ${NASA_COLUMNS} from pscomppars where ${filter.where} order by ${filter.order}`,
    );
  }

  async findByName(name: string): Promise<RepositoryResult<ExoplanetProfile | null>> {
    const normalizedName = name.trim().slice(0, 100);
    const escapedName = escapeAdqlLiteral(normalizedName);
    const adql = `select top 1 ${NASA_COLUMNS} from pscomppars where pl_name='${escapedName}'`;
    const result = await this.#query(adql);

    return { cached: result.cached, value: result.value[0] ?? null };
  }

  async search(query: string, limit: number): Promise<RepositoryResult<ExoplanetProfile[]>> {
    const normalizedQuery = query.trim().toLowerCase().slice(0, 80);
    const escapedQuery = escapeAdqlLiteral(normalizedQuery);
    const safeLimit = Math.max(1, Math.min(Math.trunc(limit), 24));
    const adql = `select top ${safeLimit} ${NASA_COLUMNS} from pscomppars where lower(pl_name) like '%${escapedQuery}%' order by pl_name`;

    return this.#query(adql);
  }

  async listAll(): Promise<RepositoryResult<ExoplanetProfile[]>> {
    const adql = `select ${NASA_COLUMNS} from pscomppars order by pl_name`;
    return this.#query(adql);
  }

  async #query(adql: string): Promise<RepositoryResult<ExoplanetProfile[]>> {
    const cached = this.#cache.get(adql);
    const requestTime = this.#now();

    if (cached && cached.expiresAt > requestTime) {
      return { cached: true, value: cached.value };
    }

    const url = new URL(NASA_TAP_ENDPOINT);
    url.searchParams.set("query", adql);
    url.searchParams.set("format", "json");

    try {
      const response = await this.#fetcher(url, {
        headers: { accept: "application/json" },
        signal: AbortSignal.timeout(this.#timeoutMs),
      });

      if (!response.ok) {
        throw new NasaArchiveError(`NASA TAP responded with status ${response.status}.`);
      }

      const payload: unknown = await response.json();

      if (!Array.isArray(payload)) {
        throw new NasaArchiveError("NASA TAP returned an unexpected response shape.");
      }

      const retrievedOn = new Date(requestTime).toISOString().slice(0, 10);
      const planets = payload
        .map((row) =>
          row && typeof row === "object"
            ? normalizeNasaPlanet(row as Record<string, unknown>, retrievedOn)
            : null,
        )
        .filter((planet): planet is ExoplanetProfile => planet !== null);

      this.#cache.set(adql, {
        value: planets,
        expiresAt: requestTime + this.#cacheTtlMs,
      });

      return { cached: false, value: planets };
    } catch (error) {
      if (error instanceof NasaArchiveError) throw error;
      throw new NasaArchiveError("NASA TAP request failed.", { cause: error });
    }
  }
}
