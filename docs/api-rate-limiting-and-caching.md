# API rate limiting and caching

## Decision

Exora does not currently need a durable application-level rate-limit store. The API is public,
read-only, and unauthenticated, so there is no paid-user quota or authorization boundary that must
be exact. Planet reads use the existing Neon catalog in production, and cacheable successful GET
responses carry shared-CDN freshness and stale-serving policies. The remaining NASA, SIMBAD, and
JPL adapters use bounded per-instance caches, coalesce identical misses within an instance, and
have tighter per-route request budgets where an upstream miss is relatively expensive.

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
a shared cache cannot replay one client's refusal to others. Internal catalog-refresh responses
and errors also remain uncacheable.

An adapter cache miss is expected on a cold instance and does not indicate data loss. Identical
concurrent misses are coalesced only within that instance. Across instances, the CDN is the shared
cache for HTTP responses; for planet data, Neon is the durable source of truth. Adding a distributed
archive-result cache would duplicate the CDN for repeatable GETs and would introduce invalidation,
serialization, availability, and operating-cost concerns.

## Escalation path

If measurements demonstrate a need for globally enforceable request limits, prefer a Vercel WAF
rate-limit rule on `/api/*` or only the expensive JPL/SIMBAD paths. It executes at ingress before
function and upstream cost, uses Vercel's source identity, is compatible with the current deployment,
and avoids turning Neon into a per-request counter database. Start the rule in log mode, compare its
counts with function/upstream telemetry, then choose a fixed-window threshold and `429` action.

Reference: [Vercel WAF rate limiting](https://vercel.com/docs/vercel-firewall/vercel-waf/rate-limiting).

Use Neon-backed counters only if Exora later needs an application-defined key that the WAF cannot
enforce, such as an authenticated account quota. That design must use one atomic statement or
transaction for increment-and-check, expire old windows, fail according to an explicit availability
policy, and account for the latency and write amplification added to every governed request. A new
Redis/KV service is not justified while Vercel ingress controls or the already deployed Neon database
can satisfy the demonstrated requirement.
