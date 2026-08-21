import { expect, test, vi } from "vite-plus/test";
import {
  createArchiveCache,
  createRequestCoalescer,
  DEFAULT_MAX_ENTRIES,
} from "../src/archive-cache.ts";

test("serves a value back until its expiry passes", () => {
  const cache = createArchiveCache<string>();
  cache.set("a", "value", 100);

  expect(cache.get("a", 99)).toBe("value");
  // Expiry is exclusive: an entry is dead at the instant it expires, not after it.
  expect(cache.get("a", 100)).toBeUndefined();
});

test("an expired entry is dropped rather than left occupying a slot", () => {
  const cache = createArchiveCache<string>();
  cache.set("a", "value", 100);

  expect(cache.size()).toBe(1);
  cache.get("a", 500);
  expect(cache.size()).toBe(0);
});

test("a missing key is simply absent", () => {
  const cache = createArchiveCache<string>();

  expect(cache.get("never-set", 0)).toBeUndefined();
  expect(cache.size()).toBe(0);
});

test("the entry count never exceeds the bound, however many queries arrive", () => {
  const cache = createArchiveCache<number>(4);

  for (let index = 0; index < 5_000; index += 1) {
    cache.set(`search-${index}`, index, Number.MAX_SAFE_INTEGER);
  }

  expect(cache.size()).toBe(4);
});

test("eviction takes the least recently used entry", () => {
  const cache = createArchiveCache<string>(3);
  cache.set("a", "a", Number.MAX_SAFE_INTEGER);
  cache.set("b", "b", Number.MAX_SAFE_INTEGER);
  cache.set("c", "c", Number.MAX_SAFE_INTEGER);

  // Touching "a" makes "b" the oldest, so "b" is what the next insert displaces.
  expect(cache.get("a", 0)).toBe("a");
  cache.set("d", "d", Number.MAX_SAFE_INTEGER);

  expect(cache.get("a", 0)).toBe("a");
  expect(cache.get("b", 0)).toBeUndefined();
  expect(cache.get("c", 0)).toBe("c");
  expect(cache.get("d", 0)).toBe("d");
});

test("a re-set key moves to the most recently used end instead of keeping its place", () => {
  const cache = createArchiveCache<string>(2);
  cache.set("a", "a", Number.MAX_SAFE_INTEGER);
  cache.set("b", "b", Number.MAX_SAFE_INTEGER);
  cache.set("a", "a2", Number.MAX_SAFE_INTEGER);
  cache.set("c", "c", Number.MAX_SAFE_INTEGER);

  expect(cache.get("a", 0)).toBe("a2");
  expect(cache.get("b", 0)).toBeUndefined();
  expect(cache.get("c", 0)).toBe("c");
});

test("a repeatedly hit fixed key survives a flood of one-off searches", () => {
  const cache = createArchiveCache<string>(8);
  cache.set("category:earth-like", "results", Number.MAX_SAFE_INTEGER);

  for (let index = 0; index < 200; index += 1) {
    cache.set(`q:${index}`, "junk", Number.MAX_SAFE_INTEGER);
    cache.get("category:earth-like", 0);
  }

  expect(cache.get("category:earth-like", 0)).toBe("results");
});

test("the default bound leaves ample room above the fixed-key working set", () => {
  // Twelve planet categories, twelve star categories, featured, and the browsing field.
  expect(DEFAULT_MAX_ENTRIES).toBeGreaterThan(26);
});

test("concurrent work for one key shares a single load", async () => {
  const requests = createRequestCoalescer<string>();
  let loads = 0;
  let release!: (value: string) => void;
  const pending = new Promise<string>((resolve) => {
    release = resolve;
  });
  const load = () => {
    loads += 1;
    return pending;
  };

  const first = requests.run("same-query", load);
  const second = requests.run("same-query", load);

  expect(first).toBe(second);
  expect(loads).toBe(0);
  expect(requests.size()).toBe(1);

  release("result");
  await expect(first).resolves.toBe("result");
  expect(loads).toBe(1);
  await vi.waitFor(() => expect(requests.size()).toBe(0));
});

test("a rejected load is forgotten so the key can be retried", async () => {
  const requests = createRequestCoalescer<string>();

  await expect(
    requests.run("query", async () => Promise.reject(new Error("offline"))),
  ).rejects.toThrow("offline");
  await expect(requests.run("query", async () => "recovered")).resolves.toBe("recovered");
});
