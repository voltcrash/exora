/**
 * A per-client request budget, kept in the instance's own memory.
 *
 * The API is public, unauthenticated, and every miss becomes a request to NASA or SIMBAD. The
 * caches absorb repeats, but a caller working through distinct queries walks straight past them,
 * and the archives are a shared research resource Exora is a guest of. This is the backstop for
 * that: enough to stop one client hammering a warm instance, and nothing more.
 *
 * It is deliberately not presented as a security control. Serverless instances are many and
 * short-lived, so a determined caller spread across them gets a multiple of this budget, and a
 * restart clears the counters. What it reliably does is bound what a single client costs a single
 * instance — which is the case that actually happens, and the one that reaches the archives.
 *
 * Kept free of Hono and of any clock so the window arithmetic is testable without either.
 */

export interface RateLimitDecision {
  /** The budget this decision was made against, so a caller is never told a limit that is not theirs. */
  limit: number;
  /** Requests still available in the current window once this one is accounted for. */
  remaining: number;
  /** When the current window ends, as epoch milliseconds. */
  resetAt: number;
  /** Seconds a rejected caller should wait. Zero when the request is allowed. */
  retryAfterSeconds: number;
}

export interface RateLimiter {
  /** Accounts for one request from `client` and reports whether it may proceed. */
  check(client: string, now: number): RateLimitDecision & { allowed: boolean };
  size(): number;
}

export interface RateLimiterOptions {
  /** Requests permitted per client per window. */
  limit: number;
  /**
   * How many clients to track. Client keys come from request headers, so the set is attacker-
   * influenced and has to be bounded for the same reason the archive caches are; the
   * least-recently-seen entry is dropped first.
   */
  maxClients?: number;
  /** Window length in milliseconds. */
  windowMs: number;
}

interface Window {
  count: number;
  startedAt: number;
}

export const DEFAULT_RATE_LIMIT = { limit: 120, windowMs: 60_000 } as const;
const DEFAULT_MAX_CLIENTS = 5_000;

export const createRateLimiter = ({
  limit,
  maxClients = DEFAULT_MAX_CLIENTS,
  windowMs,
}: RateLimiterOptions): RateLimiter => {
  // Insertion order doubles as recency, as in `archive-cache.ts`.
  const windows = new Map<string, Window>();

  return {
    check(client, now) {
      const existing = windows.get(client);
      const window: Window =
        existing && now - existing.startedAt < windowMs ? existing : { count: 0, startedAt: now };

      window.count += 1;
      windows.delete(client);
      windows.set(client, window);

      while (windows.size > maxClients) {
        const oldest = windows.keys().next();
        if (oldest.done) break;
        windows.delete(oldest.value);
      }

      const resetAt = window.startedAt + windowMs;
      const allowed = window.count <= limit;
      return {
        allowed,
        limit,
        remaining: Math.max(0, limit - window.count),
        resetAt,
        // Rounded up, so a caller told to wait one second is never woken into the same window.
        retryAfterSeconds: allowed ? 0 : Math.max(1, Math.ceil((resetAt - now) / 1_000)),
      };
    },

    size: () => windows.size,
  };
};

/**
 * Identifies the caller behind a proxy.
 *
 * Vercel terminates TLS and forwards the client address, so the socket address is useless here.
 * `x-forwarded-for` is a list appended to hop by hop; the left-most entry is the original client.
 * A caller can forge it, which is another reason this is a budget rather than a control — but the
 * alternative, treating every request as one client, would limit the whole world together.
 */
export const clientKey = (headers: {
  forwardedFor?: string | undefined;
  realIp?: string | undefined;
}): string => {
  const forwarded = headers.forwardedFor?.split(",")[0]?.trim();
  return forwarded || headers.realIp?.trim() || "unknown";
};
