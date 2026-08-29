import { blackHoleProfileSchema, type BlackHoleProfile } from "@exora/contracts";
import { z } from "zod";
import { createArchiveCache, createRequestCoalescer } from "./archive-cache.ts";
import {
  normalizedFixtureProfiles,
  type NormalizedBlackCatFixture,
} from "./black-hole-fallback.ts";
import { UpstreamError } from "./errors.ts";

const VIZIER_TAP_ENDPOINT = "https://tapvizier.cds.unistra.fr/TAPVizieR/tap/sync";
const BLACKCAT_TABLE = "J/A+A/587/A61/tablea1";
const BLACKCAT_MASS_TABLE = "J/A+A/587/A61/tablea4";
const BLACKCAT_SOURCE_URL = "https://www.astro.puc.cl/BlackCAT/transients.php";
const PARSEC_TO_LIGHT_YEARS = 3.261_56;

const BLACKCAT_QUERY = `SELECT a."Name",a.f_Name,a.Ctp,a.RAJ2000,a.DEJ2000,a.Dist,a.e_Dist,m.M1,m."E_M1" AS massUpper,m."e_M1" AS massLower,m.M1u,m.l_M1 FROM "${BLACKCAT_TABLE}" AS a LEFT OUTER JOIN "${BLACKCAT_MASS_TABLE}" AS m ON a."Name"=m."Name"`;
const EXPECTED_COLUMNS = [
  "Name",
  "f_Name",
  "Ctp",
  "RAJ2000",
  "DEJ2000",
  "Dist",
  "e_Dist",
  "M1",
  "massUpper",
  "massLower",
  "M1u",
  "l_M1",
] as const;

type Fetcher = (input: string | URL | Request, init?: RequestInit) => Promise<Response>;

const nullableFiniteNumber = z.number().finite().nullable();
const blackCatRowSchema = z.strictObject({
  Ctp: z.string().nullable(),
  DEJ2000: z.number().finite(),
  Dist: nullableFiniteNumber,
  M1: nullableFiniteNumber,
  M1u: nullableFiniteNumber,
  Name: z.string().min(1),
  RAJ2000: z.number().finite(),
  e_Dist: nullableFiniteNumber,
  f_Name: z.string().nullable(),
  l_M1: z.string().nullable(),
  massLower: nullableFiniteNumber,
  massUpper: nullableFiniteNumber,
});

const tapPayloadSchema = z.strictObject({
  data: z.array(z.array(z.unknown())),
  metadata: z.array(z.object({ name: z.string().min(1) }).passthrough()),
});

export interface BlackHoleRepositoryResult<T> {
  cached: boolean;
  stale: boolean;
  value: T;
}

export interface BlackHoleRepository {
  browse(limit: number): Promise<BlackHoleRepositoryResult<BlackHoleProfile[]>>;
  findByName(name: string): Promise<BlackHoleRepositoryResult<BlackHoleProfile | null>>;
}

export interface BlackHoleArchiveOptions {
  cacheTtlMs?: number;
  fetcher?: Fetcher;
  fallback?: readonly BlackHoleProfile[];
  now?: () => number;
  timeoutMs?: number;
}

export class BlackHoleArchiveError extends UpstreamError {
  constructor(message: string, options?: ErrorOptions) {
    super(message, options);
    this.name = "BlackHoleArchiveError";
  }
}

export const slugifyBlackHoleName = (name: string): string =>
  name
    .normalize("NFKD")
    .toLowerCase()
    .replaceAll(/[^a-z0-9]+/g, "-")
    .replaceAll(/^-|-$/g, "");

const cleanCompanion = (value: string | null): string | null => {
  const companion = value
    ?.trim()
    .replace(/^\(|\)$/g, "")
    .trim();
  return companion || null;
};

const visualForName = (name: string): BlackHoleProfile["visual"] => {
  let hash = 2_166_136_261;
  for (const character of name) {
    hash ^= character.codePointAt(0) ?? 0;
    hash = Math.imul(hash, 16_777_619) >>> 0;
  }
  return {
    diskActivity: 0.35 + (hash % 55) / 100,
    diskHueDegrees: 12 + (hash % 218),
    diskTiltDegrees: 8 + (hash % 55),
    jetStrength: ((hash >>> 8) % 36) / 100,
    seed: hash,
  };
};

export const normalizeBlackCatRow = (
  row: NormalizedBlackCatFixture,
  retrievedOn = new Date().toISOString().slice(0, 10),
): BlackHoleProfile => {
  const distanceLightYears =
    row.distanceKpc === null ? null : row.distanceKpc * 1_000 * PARSEC_TO_LIGHT_YEARS;
  const status = row.dynamical ? "confirmed" : "candidate";
  const companion = cleanCompanion(row.companion);
  const measurement =
    row.massSolar === null
      ? "No reliable dynamical mass is reported in BlackCAT."
      : `${row.massSolar} solar masses${row.massUncertaintySolar === null ? "" : ` ± ${row.massUncertaintySolar}`}`;

  return blackHoleProfileSchema.parse({
    aliases: companion ? [companion] : [],
    catalogDesignation: row.name,
    constellation: null,
    distanceLightYears,
    host: companion ? `${companion} binary` : "X-ray binary",
    id: `blackcat-${slugifyBlackHoleName(row.name)}`,
    kind: "stellar-mass",
    massSolar: row.massSolar,
    massUncertaintySolar: row.massUncertaintySolar,
    milestone: row.dynamical
      ? "Dynamically confirmed BlackCAT system"
      : "BlackCAT black-hole candidate",
    name: row.name,
    observation: {
      accretion: "active",
      companion,
      declinationDegrees: row.declinationDegrees,
      redshift: null,
      rightAscensionDegrees: row.rightAscensionDegrees,
      summary: row.dynamical
        ? "A stellar-mass black hole in an X-ray binary with a dynamical mass constraint cataloged by BlackCAT. The scene is interpretive."
        : "An X-ray transient cataloged by BlackCAT as a black-hole candidate. No unreported mass is inferred for this visualization.",
    },
    provenance: "observed",
    source: {
      archive: "BlackCAT / CDS VizieR",
      catalog: `${BLACKCAT_TABLE} + ${BLACKCAT_MASS_TABLE}`,
      measurement,
      retrievedOn,
      title: "BlackCAT: stellar-mass black holes in X-ray transients",
      url: BLACKCAT_SOURCE_URL,
    },
    status,
    visual: visualForName(row.name),
  });
};

const normalizeTapRow = (
  row: z.infer<typeof blackCatRowSchema>,
  retrievedOn: string,
): BlackHoleProfile =>
  normalizeBlackCatRow(
    {
      companion: row.Ctp,
      declinationDegrees: row.DEJ2000,
      distanceKpc: row.Dist,
      distanceUncertaintyKpc: row.e_Dist,
      dynamical: row.f_Name?.trim() === "*",
      massSolar: row.M1,
      massUncertaintySolar:
        row.massUpper === null && row.massLower === null
          ? null
          : Math.max(row.massUpper ?? 0, row.massLower ?? 0),
      name: row.Name.trim(),
      rightAscensionDegrees: row.RAJ2000,
    },
    retrievedOn,
  );

const identity = (value: string): string =>
  value
    .normalize("NFKD")
    .toLowerCase()
    .replaceAll(/[^a-z0-9]/g, "");

export class VizierBlackHoleRepository implements BlackHoleRepository {
  readonly #cache = createArchiveCache<BlackHoleProfile[]>();
  readonly #cacheTtlMs: number;
  readonly #fallback: readonly BlackHoleProfile[];
  readonly #fetcher: Fetcher;
  readonly #now: () => number;
  readonly #requests = createRequestCoalescer<BlackHoleRepositoryResult<BlackHoleProfile[]>>();
  #stale: readonly BlackHoleProfile[] | null = null;
  readonly #timeoutMs: number;

  constructor(options: BlackHoleArchiveOptions = {}) {
    this.#cacheTtlMs = options.cacheTtlMs ?? 1000 * 60 * 60 * 6;
    this.#fetcher = options.fetcher ?? fetch;
    this.#now = options.now ?? Date.now;
    this.#timeoutMs = options.timeoutMs ?? 10_000;
    this.#fallback = options.fallback ?? normalizedFixtureProfiles(normalizeBlackCatRow);
  }

  async browse(limit: number): Promise<BlackHoleRepositoryResult<BlackHoleProfile[]>> {
    const safeLimit = Math.max(1, Math.min(Math.trunc(limit), 100));
    const result = await this.#catalog();
    return { ...result, value: result.value.slice(0, safeLimit) };
  }

  async findByName(name: string): Promise<BlackHoleRepositoryResult<BlackHoleProfile | null>> {
    const result = await this.#catalog();
    const requested = identity(name);
    return {
      ...result,
      value:
        result.value.find((blackHole) =>
          [blackHole.id, blackHole.name, blackHole.catalogDesignation, ...blackHole.aliases].some(
            (candidate) => identity(candidate) === requested,
          ),
        ) ?? null,
    };
  }

  async #catalog(): Promise<BlackHoleRepositoryResult<BlackHoleProfile[]>> {
    const requestTime = this.#now();
    const cached = this.#cache.get(BLACKCAT_QUERY, requestTime);
    if (cached) return { cached: true, stale: false, value: cached };

    return this.#requests.run(BLACKCAT_QUERY, async () => {
      const url = new URL(VIZIER_TAP_ENDPOINT);
      url.searchParams.set("request", "doQuery");
      url.searchParams.set("lang", "adql");
      url.searchParams.set("format", "json");
      url.searchParams.set("query", BLACKCAT_QUERY);

      try {
        const response = await this.#fetcher(url, {
          headers: { accept: "application/json" },
          signal: AbortSignal.timeout(this.#timeoutMs),
        });
        if (!response.ok)
          throw new BlackHoleArchiveError(`VizieR TAP responded with status ${response.status}.`);
        const payload = tapPayloadSchema.safeParse(await response.json());
        if (!payload.success)
          throw new BlackHoleArchiveError("VizieR TAP returned an unexpected response shape.");
        const columns = payload.data.metadata.map(({ name }) => name);
        if (
          columns.length !== EXPECTED_COLUMNS.length ||
          columns.some((name, index) => name !== EXPECTED_COLUMNS[index])
        ) {
          throw new BlackHoleArchiveError("VizieR TAP returned unexpected BlackCAT columns.");
        }
        const retrievedOn = new Date(requestTime).toISOString().slice(0, 10);
        const blackHoles = payload.data.data.map((values) => {
          if (values.length !== columns.length)
            throw new BlackHoleArchiveError("VizieR TAP returned a truncated BlackCAT row.");
          const parsed = blackCatRowSchema.safeParse(
            Object.fromEntries(columns.map((column, index) => [column, values[index]])),
          );
          if (!parsed.success)
            throw new BlackHoleArchiveError("VizieR TAP returned malformed BlackCAT measurements.");
          return normalizeTapRow(parsed.data, retrievedOn);
        });
        this.#cache.set(BLACKCAT_QUERY, blackHoles, requestTime + this.#cacheTtlMs);
        this.#stale = blackHoles;
        return { cached: false, stale: false, value: blackHoles };
      } catch (error) {
        const stale = this.#stale ?? this.#fallback;
        if (stale.length > 0) return { cached: true, stale: true, value: [...stale] };
        if (error instanceof BlackHoleArchiveError) throw error;
        throw new BlackHoleArchiveError("VizieR TAP request failed.", { cause: error });
      }
    });
  }
}
