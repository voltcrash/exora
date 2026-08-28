import { isIP } from "node:net";

export interface RateLimitDecision {
  limit: number;
  remaining: number;
  resetAt: number;
  retryAfterSeconds: number;
}

export interface RateLimiter {
  check(client: string, now: number): RateLimitDecision & { allowed: boolean };
  size(): number;
}

export interface ClientIdentityHeaders {
  forwardedFor?: string | undefined;
  realIp?: string | undefined;
  vercelForwardedFor?: string | undefined;
}

export interface RateLimiterOptions {
  limit: number;
  maxClients?: number;
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
  // Map insertion order tracks client recency.
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
        // Never wake a blocked caller inside the same window.
        retryAfterSeconds: allowed ? 0 : Math.max(1, Math.ceil((resetAt - now) / 1_000)),
      };
    },

    size: () => windows.size,
  };
};

export const clientKey = (
  headers: ClientIdentityHeaders,
  { trustVercelProxy = false }: { trustVercelProxy?: boolean } = {},
): string => {
  if (!trustVercelProxy) return "unknown";

  const forwarded = headers.vercelForwardedFor?.trim() ?? "";
  return isIP(forwarded) ? forwarded : "unknown";
};
