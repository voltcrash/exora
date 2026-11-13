/** The part of the Workers Cache API (`caches.default`) the edge cache uses. */
export interface EdgeCache {
  match(request: Request): Promise<Response | undefined>;
  put(request: Request, response: Response): Promise<void>;
}

const BROWSER_POLICY = "X-Exora-Browser-Cache-Control";
// Budgets belong to whoever triggered the fill, not to every later reader of the cached copy.
const PER_CALLER_HEADERS = [
  "RateLimit-Limit",
  "RateLimit-Remaining",
  "RateLimit-Reset",
  "Ephemeris-RateLimit-Limit",
  "Ephemeris-RateLimit-Remaining",
];

const restoreBrowserPolicy = (hit: Response): Response => {
  const headers = new Headers(hit.headers);
  headers.set("Cache-Control", headers.get(BROWSER_POLICY) ?? "no-cache");
  headers.delete(BROWSER_POLICY);
  return new Response(hit.body, { headers, status: hit.status, statusText: hit.statusText });
};

const forEdge = (response: Response, edgePolicy: string): Response => {
  const headers = new Headers(response.headers);
  headers.set(BROWSER_POLICY, response.headers.get("Cache-Control") ?? "no-cache");
  // The Cache API keeps an entry for its Cache-Control lifetime and ignores CDN-Cache-Control.
  headers.set("Cache-Control", edgePolicy);
  for (const name of PER_CALLER_HEADERS) headers.delete(name);
  return new Response(response.body, { headers, status: response.status });
};

/**
 * Answers repeated GETs from the data centre's cache for as long as the response's
 * CDN-Cache-Control allows, so a popular read costs one cache lookup instead of an archive query.
 * Browsers still receive the response's own Cache-Control.
 */
export const edgeCached = async (
  request: Request,
  handle: (request: Request) => Promise<Response> | Response,
  cache: EdgeCache | undefined,
  waitUntil: (task: Promise<unknown>) => void,
): Promise<Response> => {
  if (!cache || request.method !== "GET") return handle(request);

  // Key on the URL alone so caller headers cannot split or poison entries.
  const key = new Request(request.url, { method: "GET" });
  const hit = await cache.match(key).catch(() => undefined);
  if (hit) return restoreBrowserPolicy(hit);

  const response = await handle(request);
  const edgePolicy = response.headers.get("CDN-Cache-Control");
  if (response.status !== 200 || !edgePolicy || response.headers.has("Set-Cookie")) {
    return response;
  }
  waitUntil(cache.put(key, forEdge(response.clone(), edgePolicy)).catch(() => undefined));
  return response;
};
