import { exoplanetProfileSchema, type ExoplanetProfile, type PlanetKind } from "@exora/contracts";
import { z } from "zod";
import { createArchiveCache, createRequestCoalescer } from "./archive-cache.ts";
import { UpstreamError } from "./errors.ts";
import {
  PLANET_DISCOVERY_FILTERS,
  renderPlanetOrder,
  renderPlanetPredicate,
  type PlanetDiscoveryCategory,
} from "./discovery-categories.ts";

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
  "pl_orbeccen",
  "pl_orbincl",
  "sy_dist",
  "ra",
  "dec",
  "disc_year",
  "discoverymethod",
  "st_spectype",
  "st_teff",
  "st_rad",
  "st_mass",
  "st_lum",
].join(",");

export {
  PLANET_DISCOVERY_CATEGORIES,
  type PlanetDiscoveryCategory,
} from "./discovery-categories.ts";

type Fetcher = (input: string | URL | Request, init?: RequestInit) => Promise<Response>;

interface NasaPlanetRow {
  dec: number | null;
  disc_year: number | null;
  discoverymethod: string | null;
  hostname: string | null;
  pl_bmasse: number | null;
  pl_bmassj: number | null;
  pl_eqt: number | null;
  pl_name: string | null;
  pl_orbeccen: number | null;
  pl_orbincl: number | null;
  pl_orbper: number | null;
  pl_orbsmax: number | null;
  pl_rade: number | null;
  pl_radj: number | null;
  ra: number | null;
  st_spectype: string | null;
  st_teff: number | null;
  st_rad: number | null;
  st_mass: number | null;
  st_lum: number | null;
  sy_dist: number | null;
}

const nullableFiniteNumber = z.number().finite().nullable();
const nullableText = z.string().nullable();
const nasaPlanetRowSchema = z.strictObject({
  dec: nullableFiniteNumber,
  disc_year: nullableFiniteNumber,
  discoverymethod: nullableText,
  hostname: nullableText,
  pl_bmasse: nullableFiniteNumber,
  pl_bmassj: nullableFiniteNumber,
  pl_eqt: nullableFiniteNumber,
  pl_name: nullableText,
  pl_orbeccen: nullableFiniteNumber,
  pl_orbincl: nullableFiniteNumber,
  pl_orbper: nullableFiniteNumber,
  pl_orbsmax: nullableFiniteNumber,
  pl_rade: nullableFiniteNumber,
  pl_radj: nullableFiniteNumber,
  ra: nullableFiniteNumber,
  st_lum: nullableFiniteNumber,
  st_mass: nullableFiniteNumber,
  st_rad: nullableFiniteNumber,
  st_spectype: nullableText,
  st_teff: nullableFiniteNumber,
  sy_dist: nullableFiniteNumber,
});
const nasaPlanetRowsSchema = z.array(nasaPlanetRowSchema);

export interface RepositoryResult<T> {
  cached: boolean;
  value: T;
}

export interface RepositoryPage<T> extends RepositoryResult<T> {
  nextCursor: string | null;
}

export interface PlanetRepository {
  browse(limit: number, cursor?: string): Promise<RepositoryPage<ExoplanetProfile[]>>;
  discover(
    category: PlanetDiscoveryCategory,
    limit: number,
  ): Promise<RepositoryResult<ExoplanetProfile[]>>;
  findByName(name: string): Promise<RepositoryResult<ExoplanetProfile | null>>;
  findByHost(hostStar: string, limit: number): Promise<RepositoryResult<ExoplanetProfile[]>>;
  search(query: string, limit: number): Promise<RepositoryResult<ExoplanetProfile[]>>;
}

export interface NasaPlanetRepositoryOptions {
  cacheTtlMs?: number;
  fetcher?: Fetcher;
  now?: () => number;
  timeoutMs?: number;
}

export class NasaArchiveError extends UpstreamError {
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
      orbitalEccentricity: numberOrNull(row.pl_orbeccen),
      orbitalInclinationDegrees: numberOrNull(row.pl_orbincl),
      orbitalPeriodDays: numberOrNull(row.pl_orbper),
      semiMajorAxisAu: numberOrNull(row.pl_orbsmax),
      distanceParsecs: numberOrNull(row.sy_dist),
      rightAscensionDegrees: numberOrNull(row.ra),
      declinationDegrees: numberOrNull(row.dec),
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

// Keyset cursors are compared, not pattern matched, so wildcards stay intact.
const escapeAdqlCursor = (value: string): string => value.replaceAll("'", "''");

export class NasaPlanetRepository implements PlanetRepository {
  readonly #cache = createArchiveCache<ExoplanetProfile[]>();
  readonly #cacheTtlMs: number;
  readonly #fetcher: Fetcher;
  readonly #now: () => number;
  readonly #requests = createRequestCoalescer<RepositoryResult<ExoplanetProfile[]>>();
  readonly #timeoutMs: number;

  constructor(options: NasaPlanetRepositoryOptions = {}) {
    this.#cacheTtlMs = options.cacheTtlMs ?? 1000 * 60 * 60 * 6;
    this.#fetcher = options.fetcher ?? fetch;
    this.#now = options.now ?? Date.now;
    this.#timeoutMs = options.timeoutMs ?? 10_000;
  }

  async browse(limit: number, cursor?: string): Promise<RepositoryPage<ExoplanetProfile[]>> {
    const safeLimit = Math.max(12, Math.min(Math.trunc(limit), 120));
    const after = cursor?.trim().slice(0, 100);
    const keyset = after ? ` and pl_name > '${escapeAdqlCursor(after)}'` : "";
    const result = await this.#query(
      `select top ${safeLimit} ${NASA_COLUMNS} from pscomppars where sy_dist is not null and pl_eqt is not null and (pl_rade is not null or pl_radj is not null)${keyset} order by pl_name`,
    );

    return {
      ...result,
      nextCursor: result.value.length === safeLimit ? (result.value.at(-1)?.name ?? null) : null,
    };
  }

  discover(
    category: PlanetDiscoveryCategory,
    limit: number,
  ): Promise<RepositoryResult<ExoplanetProfile[]>> {
    const filter = PLANET_DISCOVERY_FILTERS[category];
    const where = renderPlanetPredicate(filter.where);
    const order = renderPlanetOrder(filter.order);
    const safeLimit = Math.max(1, Math.min(Math.trunc(limit), 24));
    return this.#query(
      `select top ${safeLimit} ${NASA_COLUMNS} from pscomppars where ${where} order by ${order}`,
    );
  }

  async findByName(name: string): Promise<RepositoryResult<ExoplanetProfile | null>> {
    const normalizedName = name.trim().slice(0, 100);
    const escapedName = escapeAdqlLiteral(normalizedName);
    const adql = `select top 1 ${NASA_COLUMNS} from pscomppars where lower(pl_name)=lower('${escapedName}')`;
    const result = await this.#query(adql);

    return { cached: result.cached, value: result.value[0] ?? null };
  }

  findByHost(hostStar: string, limit: number): Promise<RepositoryResult<ExoplanetProfile[]>> {
    const normalizedHost = hostStar.trim().slice(0, 100);
    const escapedHost = escapeAdqlLiteral(normalizedHost);
    const safeLimit = Math.max(1, Math.min(Math.trunc(limit), 24));
    return this.#query(
      `select top ${safeLimit} ${NASA_COLUMNS} from pscomppars where lower(hostname)=lower('${escapedHost}') order by pl_name`,
    );
  }

  async search(query: string, limit: number): Promise<RepositoryResult<ExoplanetProfile[]>> {
    const normalizedQuery = query.trim().toLowerCase().slice(0, 80);
    const escapedQuery = escapeAdqlLiteral(normalizedQuery);
    const safeLimit = Math.max(1, Math.min(Math.trunc(limit), 24));
    const adql = `select top ${safeLimit} ${NASA_COLUMNS} from pscomppars where lower(pl_name) like '%${escapedQuery}%' order by pl_name`;

    return this.#query(adql);
  }

  async #query(adql: string): Promise<RepositoryResult<ExoplanetProfile[]>> {
    const requestTime = this.#now();
    const cached = this.#cache.get(adql, requestTime);

    if (cached) return { cached: true, value: cached };

    return this.#requests.run(adql, async () => {
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

        const rows = nasaPlanetRowsSchema.safeParse(payload);
        if (!rows.success)
          throw new NasaArchiveError("NASA TAP returned an unexpected response shape.");

        const retrievedOn = new Date(requestTime).toISOString().slice(0, 10);
        const planets = rows.data
          .map((row) => normalizeNasaPlanet(row, retrievedOn))
          .filter((planet): planet is ExoplanetProfile => planet !== null)
          .map((planet) => exoplanetProfileSchema.parse(planet));

        this.#cache.set(adql, planets, requestTime + this.#cacheTtlMs);

        return { cached: false, value: planets };
      } catch (error) {
        if (error instanceof NasaArchiveError) throw error;
        throw new NasaArchiveError("NASA TAP request failed.", { cause: error });
      }
    });
  }
}
