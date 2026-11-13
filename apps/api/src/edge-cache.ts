/** The part of the Workers Cache API (`caches.default`) the edge cache uses. */
export interface EdgeCache {
  match(request: Request): Promise<Response | undefined>;
  put(request: Request, response: Response): Promise<void>;
}

const BROWSER_POLICY = "X-Exora-Browser-Cache-Control";
const STORED_AT = "X-Exora-Stored-At";
// Budgets belong to whoever triggered the fill, not to every later reader of the cached copy.
const PER_CALLER_HEADERS = [
  "RateLimit-Limit",
  "RateLimit-Remaining",
  "RateLimit-Reset",
  "Ephemeris-RateLimit-Limit",
  "Ephemeris-RateLimit-Remaining",
];

interface EdgePolicy {
  maxAge: number;
  staleIfError: number;
  staleWhileRevalidate: number;
}

const seconds = (policy: string, directive: string): number => {
  const value = new RegExp(`(?:^|,)\\s*${directive}=(\\d+)`, "i").exec(policy)?.[1];
  return value ? Number.parseInt(value, 10) : 0;
};

const parsePolicy = (policy: string): EdgePolicy => ({
  maxAge: seconds(policy, "max-age"),
  staleIfError: seconds(policy, "stale-if-error"),
  staleWhileRevalidate: seconds(policy, "stale-while-revalidate"),
});

const forBrowser = (stored: Response): Response => {
  const headers = new Headers(stored.headers);
  headers.set("Cache-Control", headers.get(BROWSER_POLICY) ?? "no-cache");
  headers.delete(BROWSER_POLICY);
  headers.delete(STORED_AT);
  return new Response(stored.body, {
    headers,
    status: stored.status,
    statusText: stored.statusText,
  });
};

/**
 * Answers repeated GETs from the data centre's cache under the response's CDN-Cache-Control,
 * including its stale-while-revalidate and stale-if-error windows, which the Cache API itself
 * ignores. A popular read costs one cache lookup instead of an archive query, and an archive
 * outage is covered by the last good answer. Browsers still receive the response's own
 * Cache-Control.
 */
export const edgeCached = async (
  request: Request,
  handle: (request: Request) => Promise<Response> | Response,
  cache: EdgeCache | undefined,
  waitUntil: (task: Promise<unknown>) => void,
  now: () => number = Date.now,
): Promise<Response> => {
  if (!cache || request.method !== "GET") return handle(request);

  // Key on the URL alone so caller headers cannot split or poison entries.
  const key = new Request(request.url, { method: "GET" });

  const store = (response: Response): void => {
    const edgePolicy = response.headers.get("CDN-Cache-Control");
    if (response.status !== 200 || !edgePolicy || response.headers.has("Set-Cookie")) return;
    const { maxAge, staleIfError, staleWhileRevalidate } = parsePolicy(edgePolicy);
    if (maxAge <= 0) return;
    const headers = new Headers(response.headers);
    headers.set(BROWSER_POLICY, response.headers.get("Cache-Control") ?? "no-cache");
    headers.set(STORED_AT, String(now()));
    // The Cache API keeps an entry for its Cache-Control lifetime and ignores CDN-Cache-Control,
    // so keep it through the longest stale window and judge freshness on each hit.
    headers.set(
      "Cache-Control",
      `public, max-age=${maxAge + Math.max(staleWhileRevalidate, staleIfError)}`,
    );
    for (const name of PER_CALLER_HEADERS) headers.delete(name);
    const copy = new Response(response.clone().body, { headers, status: response.status });
    waitUntil(cache.put(key, copy).catch(() => undefined));
  };

  const fill = async (): Promise<Response> => {
    const response = await handle(request);
    store(response);
    return response;
  };

  const hit = await cache.match(key).catch(() => undefined);
  if (!hit) return fill();

  const policy = parsePolicy(hit.headers.get("CDN-Cache-Control") ?? "");
  const age = (now() - Number(hit.headers.get(STORED_AT) ?? 0)) / 1_000;
  if (age < policy.maxAge) return forBrowser(hit);
  if (age < policy.maxAge + policy.staleWhileRevalidate) {
    waitUntil(fill().catch(() => undefined));
    return forBrowser(hit);
  }
  if (age >= policy.maxAge + policy.staleIfError) return fill();

  const fresh = await fill().catch(() => undefined);
  return fresh && fresh.status < 500 ? fresh : forBrowser(hit);
};
