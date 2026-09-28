import { planetPopulationSchema, type PlanetPopulation } from "@exora/contracts";
import { z } from "zod";
import { createArchiveCache, createRequestCoalescer } from "./archive-cache.ts";
import { NasaArchiveError } from "./nasa-archive.ts";

/*
 * EVERY CONFIRMED WORLD, ONE ROW EACH
 *
 * The atlas plots the whole archive at once, so it needs every planet but only the handful of
 * columns a scatter can use. Rows are sent as tuples with the discovery method as an index into a
 * shared list, and values are rounded to four significant figures — finer than any plot resolves —
 * which brings 2.5 MB of TAP JSON down to a few hundred kilobytes that change at most daily.
 */

const NASA_TAP_ENDPOINT = "https://exoplanetarchive.ipac.caltech.edu/TAP/sync";
const POPULATION_QUERY =
  "select pl_name,pl_orbper,pl_rade,pl_bmasse,pl_eqt,sy_dist,disc_year,discoverymethod,pl_bmassprov,pl_rade_reflink from pscomppars order by pl_name";

export const POPULATION_FLAGS = {
  massEstimated: 4,
  massMinimum: 2,
  radiusEstimated: 1,
} as const;

type Fetcher = (input: string | URL | Request, init?: RequestInit) => Promise<Response>;

const nullableNumber = z.number().finite().nullable();
const nullableText = z.string().nullable();
const populationRowsSchema = z.array(
  z.strictObject({
    disc_year: nullableNumber,
    discoverymethod: nullableText,
    pl_bmasse: nullableNumber,
    pl_bmassprov: nullableText,
    pl_eqt: nullableNumber,
    pl_name: nullableText,
    pl_orbper: nullableNumber,
    pl_rade: nullableNumber,
    pl_rade_reflink: nullableText,
    sy_dist: nullableNumber,
  }),
);

type PopulationRow = z.infer<typeof populationRowsSchema>[number];

const rounded = (value: number | null): number | null =>
  value === null || !Number.isFinite(value) || value <= 0 ? null : Number(value.toPrecision(4));

const flagsFor = (row: PopulationRow): number => {
  let flags = 0;
  if (row.pl_rade !== null && row.pl_rade_reflink?.includes("CALCULATED_VALUE")) {
    flags |= POPULATION_FLAGS.radiusEstimated;
  }
  if (row.pl_bmasse !== null && row.pl_bmassprov === "Msini") flags |= POPULATION_FLAGS.massMinimum;
  if (row.pl_bmasse !== null && row.pl_bmassprov === "M-R relationship") {
    flags |= POPULATION_FLAGS.massEstimated;
  }
  return flags;
};

export const compactPopulation = (rows: readonly PopulationRow[]): PlanetPopulation => {
  const methods: string[] = [];
  const methodIndex = new Map<string, number>();
  const compact: PlanetPopulation["rows"] = [];
  for (const row of rows) {
    const name = row.pl_name?.trim();
    if (!name) continue;
    const method = row.discoverymethod?.trim() || "Unknown";
    let index = methodIndex.get(method);
    if (index === undefined) {
      index = methods.length;
      methods.push(method);
      methodIndex.set(method, index);
    }
    compact.push([
      name,
      rounded(row.pl_orbper),
      rounded(row.pl_rade),
      rounded(row.pl_bmasse),
      rounded(row.pl_eqt),
      rounded(row.sy_dist),
      row.disc_year !== null && Number.isInteger(row.disc_year) ? row.disc_year : null,
      index,
      flagsFor(row),
    ]);
  }
  return { methods, rows: compact };
};

export interface PopulationResult {
  cached: boolean;
  retrievedOn: string;
  value: PlanetPopulation;
}

export interface PopulationRepository {
  population(): Promise<PopulationResult>;
}

export class NasaPopulationRepository implements PopulationRepository {
  readonly #cache = createArchiveCache<{ population: PlanetPopulation; retrievedOn: string }>();
  readonly #cacheTtlMs: number;
  readonly #fetcher: Fetcher;
  readonly #now: () => number;
  readonly #requests = createRequestCoalescer<PopulationResult>();
  readonly #timeoutMs: number;

  constructor({
    cacheTtlMs = 1000 * 60 * 60 * 12,
    fetcher = fetch,
    now = Date.now,
    timeoutMs = 25_000,
  }: { cacheTtlMs?: number; fetcher?: Fetcher; now?: () => number; timeoutMs?: number } = {}) {
    this.#cacheTtlMs = cacheTtlMs;
    this.#fetcher = fetcher;
    this.#now = now;
    this.#timeoutMs = timeoutMs;
  }

  async population(): Promise<PopulationResult> {
    const requestTime = this.#now();
    const cached = this.#cache.get(POPULATION_QUERY, requestTime);
    if (cached) return { cached: true, retrievedOn: cached.retrievedOn, value: cached.population };

    return this.#requests.run(POPULATION_QUERY, async () => {
      const url = new URL(NASA_TAP_ENDPOINT);
      url.searchParams.set("query", POPULATION_QUERY);
      url.searchParams.set("format", "json");
      try {
        const response = await this.#fetcher(url, {
          headers: { accept: "application/json" },
          signal: AbortSignal.timeout(this.#timeoutMs),
        });
        if (!response.ok) {
          throw new NasaArchiveError(`NASA TAP responded with status ${response.status}.`);
        }
        const rows = populationRowsSchema.safeParse(await response.json());
        if (!rows.success) {
          throw new NasaArchiveError("NASA TAP returned an unexpected population shape.");
        }
        const population = planetPopulationSchema.parse(compactPopulation(rows.data));
        const retrievedOn = new Date(requestTime).toISOString().slice(0, 10);
        this.#cache.set(
          POPULATION_QUERY,
          { population, retrievedOn },
          requestTime + this.#cacheTtlMs,
        );
        return { cached: false, retrievedOn, value: population };
      } catch (error) {
        if (error instanceof NasaArchiveError) throw error;
        throw new NasaArchiveError("NASA TAP population request failed.", { cause: error });
      }
    });
  }
}
