# API rate limiting and caching

## Decision

Exora does not currently need a durable application-level rate-limit store. The API is public,
read-only, and unauthenticated, so there is no paid-user quota or authorization boundary that must
be exact. Planet search, browse, and exact-name reads use a committed NASA Exoplanet Archive
snapshot bundled into the function, and cacheable successful GET responses carry shared-CDN
freshness and stale-serving policies. The NASA, SIMBAD, and JPL adapters use
bounded per-instance caches, coalesce identical misses within an instance, and have tighter
per-route request budgets where an upstream miss is relatively expensive.

This is a traffic-model decision, not a claim that the in-memory limits are global. There is no
current evidence of distributed abuse, upstream quota exhaustion, or a cost/SLO problem that would
justify adding a network write to every cache miss or API request. Review the decision if Vercel
traffic logs show sustained function invocations that bypass the CDN, upstream `429` responses,
materially elevated egress/function cost, or one source spreading requests across concurrent
instances.

## Enforcement boundaries

| Mechanism                 | Scope                        | What it guarantees                                                                 |
| ------------------------- | ---------------------------- | ---------------------------------------------------------------------------------- |
| Browser `Cache-Control`   | One browser cache            | Short reuse for public GET responses; no cross-client protection                   |
| `CDN-Cache-Control`       | Shared Vercel/downstream CDN | Cross-client reuse of identical cacheable GET responses at the edge                |
| Archive adapter cache     | One warm function instance   | Bounded LRU/TTL reuse; a cold or different instance misses independently           |
| Request coalescer         | One warm function instance   | One in-flight upstream load per key in that instance only                          |
| General and route budgets | One warm function instance   | Bounds a client bucket on that instance; reset or scale-out creates another budget |
| Vercel platform firewall  | Vercel ingress               | Platform DDoS protection before the function                                       |

The response headers describe the decision made by the instance that handled the request. They are
useful back-pressure signals, but must not be interpreted as a durable global quota.

## Client identity

Production trusts Vercel's protected `x-vercel-forwarded-for` header only when the runtime has
Vercel's system environment marker. Vercel sets this header at its ingress; generic
`x-forwarded-for` and `x-real-ip` values are ignored, and direct or local runtimes do not trust any
forwarding header. The protected value must be one valid IP address. Missing, malformed,
comma-separated, and untrusted values all share the `unknown` bucket, so a caller cannot obtain new
local budgets merely by changing a forwarding header.

If another reverse proxy is placed in front of Vercel, revisit this boundary before deployment.
The proxy can collapse identity to its own egress address unless Vercel's supported trusted-proxy
configuration is used. Do not restore parsing of an arbitrary left-most forwarded address.

Reference: [Vercel request headers](https://vercel.com/docs/headers/request-headers).

## Cache and failure behavior

Only successful public data responses receive reusable cache policies. Rate-limit responses are
`429` with `Retry-After`, the applicable remaining-budget headers, and `Cache-Control: no-store`, so
a shared cache cannot replay one client's refusal to others. Errors also remain uncacheable.

An adapter cache miss is expected on a cold instance and does not indicate data loss. Identical
concurrent misses are coalesced only within that instance. Across instances, the CDN is the shared
cache for HTTP responses. Adding a distributed archive-result cache would duplicate the CDN for
repeatable GETs and would introduce invalidation, serialization, availability, and operating-cost
concerns.

## Planet catalog snapshot

Search, browse, and exact-name lookup read one committed snapshot of the `pscomppars` table,
`packages/planet-catalog/data/pscomppars.json`. `vp run @exora/api#planet-catalog` regenerates it
with the API's own TAP columns, row validation, and normalization (`loadNasaPlanets` in
`nasa-archive.ts`). It sorts planets by name and writes a header of field paths plus one array of
values per planet, with the generation time and source query. Fields NASA did not report stay
`null`. If only the timestamp would change, the generator keeps the old file, so an unchanged
archive produces no diff. It refuses to write a catalog of fewer than 1,000 planets. The
October 2026 snapshot holds 6,451 planets: 1,766,258 bytes raw, 510,445 gzip, and 408,147 brotli.

The `Refresh planet catalog` workflow regenerates the snapshot every Monday and on demand. It
validates the snapshot with the `@exora/planet-catalog` tests, then opens or force-updates the
`chore/refresh-planet-catalog` pull request when the data changed. It needs the repository setting
"Allow GitHub Actions to create and approve pull requests". Pull requests opened with
`GITHUB_TOKEN` do not start the Quality workflow, so close and reopen the pull request, or push to
its branch, before merging. The snapshot ships when the pull request merges and `main` deploys.

The name matching, ranking, browse filters (distance, temperature, and a radius), lexical name
order, limit bounds, and last-name keyset cursor live in `@exora/planet-catalog`. The API and the
website run the same code, so a page fetched from either source continues correctly from the
other.

**API.** The build bundles the snapshot into the function as a compact `JSON.parse` string, which
is decoded on the first planet read. No instance downloads the catalog, and there is no refresh,
background load, or `waitUntil`. Live TAP queries remain only as fallbacks: an exact name the
snapshot lacks (for example a planet confirmed after it was generated), a search with no snapshot
match, and a repository created without a snapshot. Those queries keep the bounded, coalesced
query cache. Snapshot answers report `meta.cached: true`. Discovery collections, host-system
queries, and the atlas's population endpoint (twelve-hour cache) are unchanged and still query
NASA. General and route request budgets in `app.ts` apply to every API request, including reads
answered from the snapshot. HTTP response schemas and CDN policies are unchanged.

**Website.** The build emits the snapshot as a hashed, immutable asset
(`/assets/pscomppars-<hash>.json`) that is not part of the initial JavaScript. A lazy chunk of
about 2 kB fetches it at low priority, parses it, yields, and decodes it. The download starts
after the first destination scene has rendered and the browser is idle, unless the connection
reports save-data or 2G. Opening the planet catalog or the command palette starts it immediately.
Until the snapshot has loaded, and if it fails, `api-client.ts` answers through the API, so the
first keystroke never waits. A failed load is retried after a minute. Once loaded, search, browse
pages, and exact-name lookups are answered in the browser. An exact-name miss or a search with no
match still asks the API. The service worker keeps the snapshot with the other hashed assets for
offline use and deletes older snapshots when a new one is stored.

Local measurements, taken on an aarch64 development machine with the production builds and
headless Chromium. These are samples, not service-level guarantees:

- Before this design, a cold instance blocked concurrent search, browse, and exact-name lookup for
  3,869 ms on the full TAP download. Now a fresh Node process imports the built function in
  58–95 ms, answers its first search, including the decode, in 53–66 ms, and answers later
  searches in about 2 ms, with no outbound request.
- In the browser, with a 4x CPU slowdown: JSON parsing takes about 20 ms, decoding about 38 ms,
  and no task during loading exceeds 50 ms. A search takes 1–6 ms, a browse page under 1 ms, and an
  exact-name lookup under 1 ms. These costs did not justify a worker, whose result would have to
  be copied back to the main thread anyway.
- On a Fast 3G-like profile with a 4x CPU slowdown, the first scene settled in a median of about
  5.3 s whether the snapshot download was allowed or blocked.

## Escalation path

If measurements demonstrate a need for globally enforceable request limits, prefer a Vercel WAF
rate-limit rule on `/api/*` or only the expensive JPL/SIMBAD paths. It executes at ingress before
function and upstream cost, uses Vercel's source identity, and is compatible with the current
deployment. Start the rule in log mode, review its counts and Vercel function logs, then choose a
fixed-window threshold and `429` action.

Reference: [Vercel WAF rate limiting](https://vercel.com/docs/vercel-firewall/vercel-waf/rate-limiting).

A new distributed counter service is not justified while Vercel ingress controls satisfy the
demonstrated requirement.
