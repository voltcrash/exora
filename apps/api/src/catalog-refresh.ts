import { createHash, timingSafeEqual } from "node:crypto";

type Fetcher = (input: string | URL | Request, init?: RequestInit) => Promise<Response>;

export interface CatalogRefreshDispatcher {
  dispatch(): Promise<void>;
}

interface GitHubCatalogRefreshDispatcherOptions {
  fetcher?: Fetcher;
  repository?: string;
  timeoutMs?: number;
  token: string;
}

export class CatalogRefreshDispatchError extends Error {
  constructor(message: string, options?: ErrorOptions) {
    super(message, options);
    this.name = "CatalogRefreshDispatchError";
  }
}

export class GitHubCatalogRefreshDispatcher implements CatalogRefreshDispatcher {
  readonly #fetcher: Fetcher;
  readonly #repository: string;
  readonly #timeoutMs: number;
  readonly #token: string;

  constructor({
    fetcher = fetch,
    repository = "voltcrash/exora",
    timeoutMs = 8_000,
    token,
  }: GitHubCatalogRefreshDispatcherOptions) {
    if (!/^[\w.-]+\/[\w.-]+$/.test(repository)) {
      throw new Error("Catalog refresh repository must use the owner/name format.");
    }
    if (!token.trim()) throw new Error("A GitHub token is required to dispatch catalog refreshes.");

    this.#fetcher = fetcher;
    this.#repository = repository;
    this.#timeoutMs = timeoutMs;
    this.#token = token;
  }

  async dispatch(): Promise<void> {
    try {
      const response = await this.#fetcher(
        `https://api.github.com/repos/${this.#repository}/dispatches`,
        {
          body: JSON.stringify({ event_type: "catalog-refresh" }),
          headers: {
            accept: "application/vnd.github+json",
            authorization: `Bearer ${this.#token}`,
            "content-type": "application/json",
            "x-github-api-version": "2022-11-28",
          },
          method: "POST",
          signal: AbortSignal.timeout(this.#timeoutMs),
        },
      );

      if (!response.ok) {
        throw new CatalogRefreshDispatchError(
          `GitHub rejected the catalog refresh dispatch with status ${response.status}.`,
        );
      }
    } catch (error) {
      if (error instanceof CatalogRefreshDispatchError) throw error;
      throw new CatalogRefreshDispatchError("GitHub catalog refresh dispatch failed.", {
        cause: error,
      });
    }
  }
}

const digest = (value: string): Buffer => createHash("sha256").update(value).digest();

export const isAuthorizedCatalogRefresh = (
  authorization: string | undefined,
  secret: string | undefined,
): boolean => {
  if (!authorization || !secret) return false;
  return timingSafeEqual(digest(authorization), digest(`Bearer ${secret}`));
};
