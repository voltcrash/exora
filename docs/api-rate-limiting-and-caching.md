# API rate limiting and caching

## Decision

Exora does not currently need a durable application-level rate-limit store. The API is public,
read-only, and unauthenticated, so there is no paid-user quota or authorization boundary that must
be exact. Planet search, browse, and exact-name reads use a per-instance NASA Exoplanet Archive
snapshot, and cacheable successful GET responses carry shared-CDN freshness and stale-serving policies. The NASA, SIMBAD, and JPL adapters use
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

Search, browse, and exact-name lookup share one full `pscomppars` download containing the existing
profile columns. The loader keeps one six-hour snapshot and uses `archive-cache.ts` to coalesce
background loads per instance. On a cold instance, search and exact-name readers start one background
catalog download and immediately use their existing small live TAP queries. Browse waits for that
coalesced download so its first page and subsequent cursor pages use the same globally sorted catalog;
NASA TAP applies `TOP` before `ORDER BY`, making the live subset unsuitable for consistent paging.
Once loaded, subsequent keystrokes,
pages, and names are answered in memory. After expiry, readers keep using the stale snapshot while
one background refresh runs. A cold or different instance loads its own snapshot; no cron,
external store, credentials, or production service configuration is required. The Vercel entry
injects `waitUntil` from `@vercel/functions` and registers each coalesced catalog load, extending the
request lifetime through background warmup or refresh without delaying immediate reads. Local and
Node runtimes leave this hook unset. The helper is a production dependency; the deployment check
imports the built Vercel entry to verify its dependencies resolve.

The same row validation and normalization apply to snapshots and live queries. Fields NASA did not
report remain `null`. Search uses the same ordered name tokens and exact-name ranking as the live
path; browse retains its distance/temperature/radius filters, lexical name ordering, limit bounds,
and last-name keyset cursor. `meta.cached` reports reuse of the adapter's snapshot or query cache;
it does not imply a global or durable cache. HTTP response schemas and CDN policies are unchanged.

If a cold snapshot load fails, readers continue using live TAP queries. If a refresh fails, the
previous snapshot remains available. Background failures are caught, and the loader waits 60 seconds
before retrying the full download, so every keystroke does not repeat a failing large request. Live-query misses still coalesce and use the bounded query cache. Discovery collections
and host-system queries retain their live-query caches, while the atlas's compact population
endpoint retains its separate twelve-hour cache. General and route request budgets in `app.ts`
continue to apply to every API request, including reads answered from a snapshot.

Before background loading, one live smoke test from the aarch64 development container blocked
concurrent search, browse, and exact-name lookup for 3,869 ms on the full TAP download. Cold reads
for search and exact-name lookup now use live queries while that download runs in the background;
browse waits for the catalog. A different search then took
1.60 ms from the same snapshot without another upstream request. These are single local samples,
not measurements of Vercel deployment latency or service-level guarantees.

## Escalation path

If measurements demonstrate a need for globally enforceable request limits, prefer a Vercel WAF
rate-limit rule on `/api/*` or only the expensive JPL/SIMBAD paths. It executes at ingress before
function and upstream cost, uses Vercel's source identity, and is compatible with the current
deployment. Start the rule in log mode, review its counts and Vercel function logs, then choose a
fixed-window threshold and `429` action.

Reference: [Vercel WAF rate limiting](https://vercel.com/docs/vercel-firewall/vercel-waf/rate-limiting).

A new distributed counter service is not justified while Vercel ingress controls satisfy the
demonstrated requirement.
