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
  if (
    !Number.isInteger(limit) ||
    limit <= 0 ||
    !Number.isInteger(maxClients) ||
    maxClients <= 0 ||
    !Number.isFinite(windowMs) ||
    windowMs <= 0
  )
    throw new RangeError("Rate-limit configuration must be positive and finite.");
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

const IPV4 = /^(?:(?:25[0-5]|2[0-4]\d|1\d\d|[1-9]?\d)\.){3}(?:25[0-5]|2[0-4]\d|1\d\d|[1-9]?\d)$/;

/** IPv4 or IPv6 literal, without depending on `node:net` so every runtime can load it. */
export const isIpAddress = (value: string): boolean => {
  if (IPV4.test(value)) return true;
  if (!value.includes(":") || !/^[\da-f:.]+$/i.test(value)) return false;
  try {
    return new URL(`http://[${value}]/`).hostname.length > 2;
  } catch {
    return false;
  }
};

/**
 * The caller's address from the one header the hosting edge overwrites on every request, such as
 * Cloudflare's `cf-connecting-ip`. Anything else is caller-controlled and shares one budget.
 */
export const clientKey = (trustedClientIp: string | undefined): string => {
  const address = trustedClientIp?.trim() ?? "";
  return isIpAddress(address) ? address : "unknown";
};
