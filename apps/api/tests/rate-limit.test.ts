import { expect, test } from "vite-plus/test";
import { clientKey, createRateLimiter } from "../src/rate-limit.ts";

test("counts down isolated client budgets and resets their windows", () => {
  const limiter = createRateLimiter({ limit: 3, windowMs: 1_000 });

  expect(limiter.check("a", 0)).toMatchObject({ allowed: true, remaining: 2 });
  expect(limiter.check("a", 10)).toMatchObject({ allowed: true, remaining: 1 });
  expect(limiter.check("a", 20)).toMatchObject({ allowed: true, remaining: 0 });
  expect(limiter.check("a", 0)).toMatchObject({ allowed: false, remaining: 0 });
  expect(limiter.check("a", 1_000).allowed).toBe(true);
  expect(limiter.check("b", 0).allowed).toBe(true);

  const firstInstance = createRateLimiter({ limit: 1, windowMs: 1_000 });
  const secondInstance = createRateLimiter({ limit: 1, windowMs: 1_000 });

  expect(firstInstance.check("client", 0).allowed).toBe(true);
  expect(firstInstance.check("client", 0).allowed).toBe(false);
  expect(secondInstance.check("client", 0).allowed).toBe(true);
});

test("reports the enforced budget and a nonzero wait through the end of its window", () => {
  const limiter = createRateLimiter({ limit: 1, windowMs: 60_000 });
  limiter.check("a", 0);

  const refused = limiter.check("a", 30_000);

  expect(refused.allowed).toBe(false);
  expect(refused.retryAfterSeconds).toBe(30);
  expect(refused.resetAt).toBe(60_000);
  expect(refused.limit).toBe(1);

  const shortWindow = createRateLimiter({ limit: 1, windowMs: 1_000 });
  shortWindow.check("a", 0);
  expect(shortWindow.check("a", 999).retryAfterSeconds).toBe(1);
});

test("bounds tracked clients and evicts the least recently seen", () => {
  const limiter = createRateLimiter({ limit: 10, maxClients: 4, windowMs: 1_000 });

  for (let index = 0; index < 2_000; index += 1) limiter.check(`client-${index}`, 0);

  expect(limiter.size()).toBe(4);

  const smallLimiter = createRateLimiter({ limit: 1, maxClients: 2, windowMs: 10_000 });
  smallLimiter.check("a", 0);
  smallLimiter.check("b", 0);
  smallLimiter.check("a", 1);
  smallLimiter.check("c", 2);

  expect(smallLimiter.check("a", 3).allowed).toBe(false);
  expect(smallLimiter.check("b", 4).allowed).toBe(true);
});

test("trusts only a valid Vercel identity behind the configured proxy boundary", () => {
  const headers = { vercelForwardedFor: "203.0.113.7" };

  expect(clientKey(headers)).toBe("unknown");
  expect(clientKey(headers, { trustVercelProxy: true })).toBe("203.0.113.7");
  expect(clientKey({ forwardedFor: "203.0.113.7" })).toBe("unknown");
  expect(
    clientKey({ forwardedFor: "203.0.113.7", realIp: "198.51.100.4" }, { trustVercelProxy: true }),
  ).toBe("unknown");
  expect(
    clientKey({ vercelForwardedFor: "203.0.113.7, 198.51.100.4" }, { trustVercelProxy: true }),
  ).toBe("unknown");
  expect(clientKey({ vercelForwardedFor: "not-an-ip" }, { trustVercelProxy: true })).toBe(
    "unknown",
  );
  expect(clientKey({})).toBe("unknown");
});
