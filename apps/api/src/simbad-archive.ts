import type { StarKind, StarProfile } from "@exora/contracts";
import type { RepositoryResult } from "./nasa-archive.ts";

const SIMBAD_TAP_ENDPOINT = "https://simbad.cds.unistra.fr/simbad/sim-tap/sync";
const FEATURED_NAMES = [
  "Altair",
  "Antares",
  "Betelgeuse",
  "Polaris",
  "Proxima Centauri",
  "Rigel",
  "Sirius",
  "Vega",
] as const;
const STAR_COLUMNS = [
  "i.id as matched_id",
  "b.main_id",
  "b.otype",
  "b.otype_txt",
  "b.ra",
  "b.dec",
  "b.plx_value",
  "b.pmra",
  "b.pmdec",
  "b.rvz_radvel",
  "b.sp_type",
  'f."V"',
  'f."G"',
].join(",");
const STAR_FROM =
  "from ident as i join basic as b on i.oidref=b.oid " +
  "left outer join allfluxes as f on b.oid=f.oidref";

type Fetcher = (input: string | URL | Request, init?: RequestInit) => Promise<Response>;

interface SimbadStarRow {
  G: number | null;
  V: number | null;
  dec: number | null;
  main_id: string | null;
  matched_id: string | null;
  otype: string | null;
  otype_txt: string | null;
  plx_value: number | null;
  pmdec: number | null;
  pmra: number | null;
  ra: number | null;
  rvz_radvel: number | null;
  sp_type: string | null;
}

interface SimbadPayload {
  data?: unknown[][];
  metadata?: { name?: string }[];
}

interface CacheEntry<T> {
  expiresAt: number;
  value: T;
}

export interface StarRepository {
  discover(
    category: StarDiscoveryCategory,
    limit: number,
  ): Promise<RepositoryResult<StarProfile[]>>;
  featured(): Promise<RepositoryResult<StarProfile[]>>;
  findByName(name: string): Promise<RepositoryResult<StarProfile | null>>;
  search(query: string, limit: number): Promise<RepositoryResult<StarProfile[]>>;
}

export type StarDiscoveryCategory =
  | "nearby-stars"
  | "sun-like"
  | "red-dwarfs"
  | "blue-stars"
  | "giants"
  | "binary-systems"
  | "variable-stars"
  | "stellar-remnants"
  | "closest-neighbors"
  | "solar-analogs"
  | "brightest-stars"
  | "stellar-extremes";

export const STAR_DISCOVERY_CATEGORIES = new Set<StarDiscoveryCategory>([
  "nearby-stars",
  "sun-like",
  "red-dwarfs",
  "blue-stars",
  "giants",
  "binary-systems",
  "variable-stars",
  "stellar-remnants",
  "closest-neighbors",
  "solar-analogs",
  "brightest-stars",
  "stellar-extremes",
]);

const STAR_DISCOVERY_FILTERS: Record<StarDiscoveryCategory, { order: string; where: string }> = {
  "nearby-stars": {
    where: "b.plx_value >= 50 and b.sp_type is not null",
    order: "plx_value desc",
  },
  "sun-like": {
    where: "(b.sp_type like 'F%V%' or b.sp_type like 'G%V%')",
    order: '"V"',
  },
  "red-dwarfs": { where: "b.sp_type like 'M%V%'", order: "plx_value desc" },
  "blue-stars": {
    where: "(b.sp_type like 'O%' or b.sp_type like 'B%')",
    order: '"V"',
  },
  giants: {
    where: "(b.sp_type like '%III%' or b.sp_type like '%II%' or b.sp_type like '%I%')",
    order: '"V"',
  },
  "binary-systems": {
    where: "(b.otype like '%**%' or b.otype like 'SB%' or b.otype like 'EB%')",
    order: "plx_value desc",
  },
  "variable-stars": { where: "b.otype like 'V*%'", order: '"V"' },
  "stellar-remnants": {
    where: "(b.otype like 'WD%' or b.otype like 'Psr%' or b.sp_type like 'D%')",
    order: "plx_value desc",
  },
  "closest-neighbors": {
    where: "b.plx_value >= 50 and b.sp_type is not null",
    order: "plx_value desc",
  },
  "solar-analogs": {
    where:
      "(b.sp_type like 'G1%V%' or b.sp_type like 'G2%V%' or b.sp_type like 'G3%V%') and b.plx_value > 0",
    order: "plx_value desc",
  },
  "brightest-stars": {
    where: 'f."V" is not null and b.sp_type is not null',
    order: '"V"',
  },
  "stellar-extremes": {
    where: "(b.sp_type like 'O%' or b.sp_type like 'B%I%')",
    order: '"V"',
  },
};

export interface SimbadStarRepositoryOptions {
  cacheTtlMs?: number;
  fetcher?: Fetcher;
  now?: () => number;
  timeoutMs?: number;
}

export class SimbadArchiveError extends Error {
  constructor(message: string, options?: ErrorOptions) {
    super(message, options);
    this.name = "SimbadArchiveError";
  }
}

const numberOrNull = (value: unknown): number | null =>
  typeof value === "number" && Number.isFinite(value) ? value : null;

const stringOrNull = (value: unknown): string | null =>
  typeof value === "string" && value.trim() ? value.trim() : null;

const escapeAdqlLiteral = (value: string): string => value.replaceAll("'", "''");

const titleCase = (value: string): string =>
  value.replaceAll(
    /\S+/g,
    (word) => `${word[0]?.toUpperCase() ?? ""}${word.slice(1).toLowerCase()}`,
  );

const nameCandidates = (name: string): string[] => {
  const clean = name.trim().replaceAll(/\s+/g, " ").slice(0, 100);
  const titled = titleCase(clean);
  return [...new Set([clean, titled, clean.toUpperCase(), `NAME ${titled}`])];
};

export const slugifyStarName = (name: string): string =>
  name
    .normalize("NFKD")
    .toLowerCase()
    .replaceAll(/[^a-z0-9]+/g, "-")
    .replaceAll(/^-|-$/g, "");

const classifyStar = (otype: string, spectralType: string | null): StarKind => {
  if (otype.includes("WD") || spectralType?.startsWith("D")) return "white-dwarf";
  if (["Psr", "N*", "X"].some((token) => otype.includes(token))) return "neutron-star";
  if (otype.includes("**") || otype.includes("SB") || otype.includes("EB")) return "binary";
  if (otype.includes("V*") || ["Ce*", "RR*", "Mi*", "s*r"].includes(otype)) return "variable";
  if (/I{1,3}[ab]?/i.test(spectralType ?? "") || otype.includes("Ev")) return "evolved";
  if (/V/i.test(spectralType ?? "")) return "main-sequence";
  return "star";
};

const displayName = (matchedId: string, mainId: string): string => {
  const matched = matchedId.replace(/^NAME\s+/i, "").trim();
  return matched && !/^(\*|V\*|Cl\*)\s/.test(matched) ? matched : mainId;
};

export const normalizeSimbadStar = (
  rawRow: Record<string, unknown>,
  retrievedOn = new Date().toISOString().slice(0, 10),
): StarProfile | null => {
  const row = rawRow as unknown as SimbadStarRow;
  const mainId = stringOrNull(row.main_id);
  const matchedId = stringOrNull(row.matched_id) ?? mainId;
  const ra = numberOrNull(row.ra);
  const dec = numberOrNull(row.dec);
  if (!mainId || !matchedId || ra === null || dec === null) return null;

  const name = displayName(matchedId, mainId);
  const parallax = numberOrNull(row.plx_value);
  const spectralType = stringOrNull(row.sp_type);
  const otype = stringOrNull(row.otype) ?? "*";

  return {
    id: slugifyStarName(mainId),
    name,
    catalogName: mainId,
    kind: classifyStar(otype, spectralType),
    objectType: stringOrNull(row.otype_txt) ?? "Star",
    observation: {
      rightAscensionDegrees: ra,
      declinationDegrees: dec,
      parallaxMas: parallax,
      distanceParsecs: parallax !== null && parallax > 0 ? 1_000 / parallax : null,
      properMotionRaMasPerYear: numberOrNull(row.pmra),
      properMotionDecMasPerYear: numberOrNull(row.pmdec),
      radialVelocityKmPerSecond: numberOrNull(row.rvz_radvel),
      spectralType,
      visualMagnitude: numberOrNull(row.V),
      gaiaMagnitude: numberOrNull(row.G),
    },
    source: {
      archive: "SIMBAD",
      tables: ["basic", "ident", "allfluxes"],
      retrievedOn,
    },
  };
};

export class SimbadStarRepository implements StarRepository {
  readonly #cache = new Map<string, CacheEntry<StarProfile[]>>();
  readonly #cacheTtlMs: number;
  readonly #fetcher: Fetcher;
  readonly #now: () => number;
  readonly #timeoutMs: number;

  constructor(options: SimbadStarRepositoryOptions = {}) {
    this.#cacheTtlMs = options.cacheTtlMs ?? 1000 * 60 * 60 * 12;
    this.#fetcher = options.fetcher ?? fetch;
    this.#now = options.now ?? Date.now;
    this.#timeoutMs = options.timeoutMs ?? 10_000;
  }

  discover(
    category: StarDiscoveryCategory,
    limit: number,
  ): Promise<RepositoryResult<StarProfile[]>> {
    const filter = STAR_DISCOVERY_FILTERS[category];
    const safeLimit = Math.max(1, Math.min(Math.trunc(limit), 12));
    const columns = STAR_COLUMNS.replace("i.id as matched_id", "b.main_id as matched_id");
    return this.#query(
      `select distinct top ${safeLimit} ${columns} from basic as b left outer join allfluxes as f on b.oid=f.oidref where ${filter.where} order by ${filter.order}`,
    );
  }

  featured(): Promise<RepositoryResult<StarProfile[]>> {
    const aliases = FEATURED_NAMES.map((name) => `'NAME ${escapeAdqlLiteral(name)}'`).join(",");
    return this.#query(
      `select distinct top 12 ${STAR_COLUMNS} ${STAR_FROM} where i.id in (${aliases})`,
    );
  }

  async findByName(name: string): Promise<RepositoryResult<StarProfile | null>> {
    const result = await this.search(name, 1);
    return { cached: result.cached, value: result.value[0] ?? null };
  }

  search(query: string, limit: number): Promise<RepositoryResult<StarProfile[]>> {
    const candidates = nameCandidates(query);
    const conditions = candidates
      .map((candidate) => `i.id='${escapeAdqlLiteral(candidate)}'`)
      .join(" or ");
    const safeLimit = Math.max(1, Math.min(Math.trunc(limit), 12));
    return this.#query(
      `select distinct top ${safeLimit} ${STAR_COLUMNS} ${STAR_FROM} where ${conditions}`,
    );
  }

  async #query(adql: string): Promise<RepositoryResult<StarProfile[]>> {
    const cached = this.#cache.get(adql);
    const requestTime = this.#now();
    if (cached && cached.expiresAt > requestTime) {
      return { cached: true, value: cached.value };
    }

    const url = new URL(SIMBAD_TAP_ENDPOINT);
    url.searchParams.set("request", "doQuery");
    url.searchParams.set("lang", "adql");
    url.searchParams.set("format", "json");
    url.searchParams.set("query", adql);

    try {
      const response = await this.#fetcher(url, {
        headers: { accept: "application/json" },
        signal: AbortSignal.timeout(this.#timeoutMs),
      });
      if (!response.ok) {
        throw new SimbadArchiveError(`SIMBAD TAP responded with status ${response.status}.`);
      }

      const payload = (await response.json()) as SimbadPayload;
      if (!Array.isArray(payload.metadata) || !Array.isArray(payload.data)) {
        throw new SimbadArchiveError("SIMBAD TAP returned an unexpected response shape.");
      }

      const columns = payload.metadata.map((column) => column.name ?? "");
      const retrievedOn = new Date(requestTime).toISOString().slice(0, 10);
      const stars = payload.data
        .map((values) =>
          normalizeSimbadStar(
            Object.fromEntries(columns.map((column, index) => [column, values[index]])),
            retrievedOn,
          ),
        )
        .filter((star): star is StarProfile => star !== null);

      this.#cache.set(adql, {
        expiresAt: requestTime + this.#cacheTtlMs,
        value: stars,
      });
      return { cached: false, value: stars };
    } catch (error) {
      if (error instanceof SimbadArchiveError) throw error;
      throw new SimbadArchiveError("SIMBAD TAP request failed.", { cause: error });
    }
  }
}
