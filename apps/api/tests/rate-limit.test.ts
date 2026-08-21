import { expect, test } from "vite-plus/test";
import { clientKey, createRateLimiter } from "../src/rate-limit.ts";

test("requests inside the budget are allowed and count down", () => {
  const limiter = createRateLimiter({ limit: 3, windowMs: 1_000 });

  expect(limiter.check("a", 0)).toMatchObject({ allowed: true, remaining: 2 });
  expect(limiter.check("a", 10)).toMatchObject({ allowed: true, remaining: 1 });
  expect(limiter.check("a", 20)).toMatchObject({ allowed: true, remaining: 0 });
});

test("the request past the budget is refused", () => {
  const limiter = createRateLimiter({ limit: 2, windowMs: 1_000 });
  limiter.check("a", 0);
  limiter.check("a", 0);

  expect(limiter.check("a", 0)).toMatchObject({ allowed: false, remaining: 0 });
});

test("the window rolls over and the budget returns", () => {
  const limiter = createRateLimiter({ limit: 1, windowMs: 1_000 });

  expect(limiter.check("a", 0).allowed).toBe(true);
  expect(limiter.check("a", 999).allowed).toBe(false);
  expect(limiter.check("a", 1_000).allowed).toBe(true);
});

test("clients are budgeted separately", () => {
  const limiter = createRateLimiter({ limit: 1, windowMs: 1_000 });

  expect(limiter.check("a", 0).allowed).toBe(true);
  expect(limiter.check("b", 0).allowed).toBe(true);
  expect(limiter.check("a", 0).allowed).toBe(false);
});

test("a refused caller is told to wait past the end of the window", () => {
  const limiter = createRateLimiter({ limit: 1, windowMs: 60_000 });
  limiter.check("a", 0);

  const refused = limiter.check("a", 30_000);

  expect(refused.allowed).toBe(false);
  expect(refused.retryAfterSeconds).toBe(30);
  expect(refused.resetAt).toBe(60_000);
});

test("a wait is never rounded down to zero seconds", () => {
  const limiter = createRateLimiter({ limit: 1, windowMs: 1_000 });
  limiter.check("a", 0);

  // 1ms of window left still has to read as "wait", or the caller retries into the same window.
  expect(limiter.check("a", 999).retryAfterSeconds).toBe(1);
});

test("the tracked client count is bounded, since the keys come from request headers", () => {
  const limiter = createRateLimiter({ limit: 10, maxClients: 4, windowMs: 1_000 });

  for (let index = 0; index < 2_000; index += 1) limiter.check(`client-${index}`, 0);

  expect(limiter.size()).toBe(4);
});

test("eviction drops the least recently seen client", () => {
  const limiter = createRateLimiter({ limit: 1, maxClients: 2, windowMs: 10_000 });
  limiter.check("a", 0);
  limiter.check("b", 0);
  limiter.check("a", 1); // "a" is refused, but the touch makes "b" the oldest
  limiter.check("c", 2); // evicts "b"

  // "a" survived and is still over its budget. Checked first on purpose: with only two slots,
  // probing a third client would itself evict one, which is the trap this ordering avoids.
  expect(limiter.check("a", 3).allowed).toBe(false);
  // "b" was forgotten, so it starts from a fresh window.
  expect(limiter.check("b", 4).allowed).toBe(true);
});

test("the caller is identified by the left-most forwarded address", () => {
  // Proxies append hop by hop, so the original client is first and the rest are infrastructure.
  expect(clientKey({ forwardedFor: "203.0.113.7, 70.41.3.18, 150.172.238.178" })).toBe(
    "203.0.113.7",
  );
});

test("identification falls back through the headers a proxy might set", () => {
  expect(clientKey({ realIp: "203.0.113.9" })).toBe("203.0.113.9");
  expect(clientKey({ forwardedFor: "   ", realIp: "203.0.113.9" })).toBe("203.0.113.9");
  expect(clientKey({})).toBe("unknown");
});

test("a decision reports the budget it was actually made against", () => {
  // The response header is built from this, so a limiter configured away from the default must
  // not have callers told the default's number.
  const limiter = createRateLimiter({ limit: 7, windowMs: 1_000 });

  expect(limiter.check("a", 0).limit).toBe(7);
});
