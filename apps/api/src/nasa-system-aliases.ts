import type { StarProfile } from "@exora/contracts";
import { createArchiveCache, createRequestCoalescer } from "./archive-cache.ts";
import { NasaArchiveError, type RepositoryResult } from "./nasa-archive.ts";

const NASA_SYSTEM_ALIASES_ENDPOINT =
  "https://exoplanetarchive.ipac.caltech.edu/cgi-bin/Lookup/nph-aliaslookup.py";

type Fetcher = (input: string | URL | Request, init?: RequestInit) => Promise<Response>;

interface AliasLookupPayload {
  manifest?: {
    lookup_status?: unknown;
    resolved_name?: unknown;
  };
}

export interface SystemAliasRepository {
  resolveHost(star: StarProfile): Promise<RepositoryResult<string | null>>;
}

export interface NasaSystemAliasRepositoryOptions {
  cacheTtlMs?: number;
  fetcher?: Fetcher;
  now?: () => number;
  timeoutMs?: number;
}

const cleanIdentifier = (identifier: string): string =>
  identifier
    .replace(/^NAME\s+/i, "")
    .replace(/^\*\s+/, "")
    .trim();

/**
 * SIMBAD identifiers ordered by how reliably NASA says its aliases service recognizes them.
 * The canonical SIMBAD display name remains first; catalog identifiers are fallbacks only.
 */
export const nasaAliasCandidates = (star: StarProfile): readonly string[] => {
  const aliases = star.aliases ?? [];
  const reliableAliases = aliases.filter((alias) =>
    /^(?:NAME|HD|HIP|GJ|Gaia DR[23]|TIC|2MASS)\s/i.test(alias),
  );
  const candidates = [star.name, star.catalogName, ...reliableAliases, ...aliases].map(
    cleanIdentifier,
  );

  return [
    ...new Map(
      candidates.filter(Boolean).map((candidate) => [candidate.toLocaleLowerCase(), candidate]),
    ).values(),
  ].slice(0, 16);
};

/** Resolves a SIMBAD star to NASA's authoritative default host-system name. */
export class NasaSystemAliasRepository implements SystemAliasRepository {
  readonly #cache = createArchiveCache<string | null>();
  readonly #cacheTtlMs: number;
  readonly #fetcher: Fetcher;
  readonly #now: () => number;
  readonly #requests = createRequestCoalescer<RepositoryResult<string | null>>();
  readonly #timeoutMs: number;

  constructor(options: NasaSystemAliasRepositoryOptions = {}) {
    this.#cacheTtlMs = options.cacheTtlMs ?? 1000 * 60 * 60 * 12;
    this.#fetcher = options.fetcher ?? fetch;
    this.#now = options.now ?? Date.now;
    this.#timeoutMs = options.timeoutMs ?? 10_000;
  }

  resolveHost(star: StarProfile): Promise<RepositoryResult<string | null>> {
    const candidates = nasaAliasCandidates(star);
    const key = candidates.join("\0").toLocaleLowerCase();
    const requestTime = this.#now();
    const cached = this.#cache.get(key, requestTime);
    if (cached !== undefined) return Promise.resolve({ cached: true, value: cached });

    return this.#requests.run(key, async () => {
      for (const candidate of candidates) {
        const url = new URL(NASA_SYSTEM_ALIASES_ENDPOINT);
        url.searchParams.set("objname", candidate);

        let response: Response;
        try {
          response = await this.#fetcher(url, {
            headers: { accept: "application/json" },
            signal: AbortSignal.timeout(this.#timeoutMs),
          });
        } catch (error) {
          throw new NasaArchiveError("NASA system-alias lookup failed.", { cause: error });
        }

        if (!response.ok) {
          throw new NasaArchiveError(
            `NASA system-alias lookup responded with status ${response.status}.`,
          );
        }

        const payload = (await response.json()) as AliasLookupPayload;
        const resolvedName = payload.manifest?.resolved_name;
        if (payload.manifest?.lookup_status === "OK" && typeof resolvedName === "string") {
          const hostName = resolvedName.trim();
          if (hostName) {
            this.#cache.set(key, hostName, requestTime + this.#cacheTtlMs);
            return { cached: false, value: hostName };
          }
        }
      }

      this.#cache.set(key, null, requestTime + this.#cacheTtlMs);
      return { cached: false, value: null };
    });
  }
}
