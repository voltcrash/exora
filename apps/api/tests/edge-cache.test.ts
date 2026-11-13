import { expect, test, vi } from "vite-plus/test";
import { edgeCached, type EdgeCache } from "../src/edge-cache.ts";

const memoryCache = () => {
  const entries = new Map<string, Response>();
  const cache: EdgeCache = {
    match: async (request) => entries.get(request.url)?.clone(),
    put: async (request, response) => {
      entries.set(request.url, response);
    },
  };
  return { cache, entries };
};

const settle = () => {
  const tasks: Promise<unknown>[] = [];
  return { tasks, waitUntil: (task: Promise<unknown>) => void tasks.push(task) };
};

const catalogResponse = (body: string) =>
  new Response(body, {
    headers: {
      "Cache-Control": "public, max-age=60",
      "CDN-Cache-Control": "public, max-age=900",
      "Content-Type": "application/json",
      "RateLimit-Remaining": "119",
    },
  });

test("a repeated read is answered from the edge with the browser's own cache policy", async () => {
  const { cache, entries } = memoryCache();
  const { tasks, waitUntil } = settle();
  const handle = vi.fn(async () => catalogResponse('{"data":1}'));
  const url = "https://exora.test/api/planets?q=kepler";

  const first = await edgeCached(new Request(url), handle, cache, waitUntil);
  await Promise.all(tasks);
  const second = await edgeCached(new Request(url), handle, cache, waitUntil);

  expect(handle).toHaveBeenCalledOnce();
  expect(await first.text()).toBe('{"data":1}');
  expect(await second.text()).toBe('{"data":1}');
  expect(second.headers.get("Cache-Control")).toBe("public, max-age=60");
  expect(second.headers.get("X-Exora-Browser-Cache-Control")).toBeNull();
  expect(second.headers.get("RateLimit-Remaining")).toBeNull();
  expect(entries.get(url)?.headers.get("Cache-Control")).toBe("public, max-age=900");
});

test("caller headers cannot change which entry a request reads", async () => {
  const { cache } = memoryCache();
  const { tasks, waitUntil } = settle();
  const handle = vi.fn(async () => catalogResponse("{}"));
  const url = "https://exora.test/api/stars/featured";

  await edgeCached(new Request(url, { headers: { Cookie: "a=1" } }), handle, cache, waitUntil);
  await Promise.all(tasks);
  await edgeCached(
    new Request(url, { headers: { Accept: "text/html" } }),
    handle,
    cache,
    waitUntil,
  );

  expect(handle).toHaveBeenCalledOnce();
});

test("errors, refusals and responses without an edge policy are never stored", async () => {
  const { cache, entries } = memoryCache();
  const { tasks, waitUntil } = settle();
  const responses = [
    new Response("{}", { status: 502, headers: { "CDN-Cache-Control": "public, max-age=900" } }),
    new Response("{}", { status: 429, headers: { "Cache-Control": "no-store" } }),
    new Response("{}", { headers: { "Cache-Control": "public, max-age=60" } }),
  ];

  for (const [index, response] of responses.entries()) {
    await edgeCached(
      new Request(`https://exora.test/api/${index}`),
      () => response,
      cache,
      waitUntil,
    );
  }
  await Promise.all(tasks);

  expect(entries.size).toBe(0);
});

test("only GET requests consult the cache", async () => {
  const match = vi.fn(async () => catalogResponse("stale"));
  const handle = vi.fn(async () => new Response(null, { status: 204 }));

  const response = await edgeCached(
    new Request("https://exora.test/api/health", { method: "OPTIONS" }),
    handle,
    { match, put: async () => undefined },
    () => undefined,
  );

  expect(response.status).toBe(204);
  expect(match).not.toHaveBeenCalled();
});

test("an unavailable cache falls through to the application", async () => {
  const handle = vi.fn(async () => catalogResponse("{}"));
  const failing: EdgeCache = {
    match: async () => Promise.reject(new Error("cache offline")),
    put: async () => Promise.reject(new Error("cache offline")),
  };
  const { tasks, waitUntil } = settle();

  const response = await edgeCached(
    new Request("https://exora.test/api/planets/featured"),
    handle,
    failing,
    waitUntil,
  );
  await Promise.all(tasks);

  expect(response.status).toBe(200);
  expect(handle).toHaveBeenCalledOnce();
});

const policyResponse = (body: string, status = 200) =>
  new Response(body, {
    status,
    headers: {
      "Cache-Control": "public, max-age=60",
      "CDN-Cache-Control": "public, max-age=100, stale-while-revalidate=200, stale-if-error=1000",
    },
  });

const expiringCache = async () => {
  const { cache, entries } = memoryCache();
  const { tasks, waitUntil } = settle();
  let clock = 0;
  const now = () => clock;
  const url = "https://exora.test/api/planets/population";
  await edgeCached(new Request(url), () => policyResponse("first"), cache, waitUntil, now);
  await Promise.all(tasks.splice(0));
  return {
    entries,
    read: async (handle: () => Response) => {
      const response = await edgeCached(new Request(url), handle, cache, waitUntil, now);
      await Promise.all(tasks.splice(0));
      return response;
    },
    advance: (secondsLater: number) => {
      clock = secondsLater * 1_000;
    },
  };
};

test("entries outlive max-age by their longest stale window", async () => {
  const { entries } = await expiringCache();
  expect(
    entries.get("https://exora.test/api/planets/population")?.headers.get("Cache-Control"),
  ).toBe("public, max-age=1100");
});

test("a stale entry inside stale-while-revalidate is served while it refreshes", async () => {
  const { advance, read } = await expiringCache();
  const handle = vi.fn(() => policyResponse("second"));

  advance(99);
  expect(await (await read(handle)).text()).toBe("first");
  expect(handle).not.toHaveBeenCalled();

  advance(150);
  const stale = await read(handle);
  expect(await stale.text()).toBe("first");
  expect(stale.headers.get("Cache-Control")).toBe("public, max-age=60");
  expect(handle).toHaveBeenCalledOnce();

  expect(await (await read(handle)).text()).toBe("second");
});

test("past stale-while-revalidate, an upstream failure is covered by stale-if-error", async () => {
  const { advance, read } = await expiringCache();

  advance(500);
  expect(await (await read(() => policyResponse("{}", 502))).text()).toBe("first");
  expect(await (await read(() => policyResponse("refreshed"))).text()).toBe("refreshed");
});

test("past every stale window, failures reach the caller", async () => {
  const { advance, read } = await expiringCache();

  advance(1_200);
  expect((await read(() => policyResponse("{}", 502))).status).toBe(502);
});
