import { afterEach, expect, test, vi } from "vite-plus/test";
import type { EdgeCache } from "../src/edge-cache.ts";

const context = () => {
  const tasks: Promise<unknown>[] = [];
  return { tasks, waitUntil: (task: Promise<unknown>) => void tasks.push(task) };
};

afterEach(() => {
  vi.unstubAllGlobals();
  vi.resetModules();
});

test("the Worker answers planet reads from the bundled snapshot without reaching NASA", async () => {
  const upstream = vi.fn(async () => new Response(null, { status: 503 }));
  vi.stubGlobal("fetch", upstream);
  const { default: worker } = await import("../src/worker.ts");
  const ctx = context();

  const search = await worker.fetch(
    new Request("https://exora.test/api/planets?q=kepler%2018"),
    {},
    ctx,
  );
  const { data } = (await search.json()) as { data: { name: string }[] };

  expect(search.status).toBe(200);
  expect(data[0]?.name).toBe("Kepler-18 b");
  expect(upstream).not.toHaveBeenCalled();
});

test("the Worker rate-limits by Cloudflare's connecting address, not forwarding headers", async () => {
  const { default: worker } = await import("../src/worker.ts");
  const ctx = context();
  const request = (headers: Record<string, string>) =>
    worker.fetch(new Request("https://exora.test/api/health", { headers }), {}, ctx);

  const fromEdge = await request({ "cf-connecting-ip": "203.0.113.9" });
  const spoofed = await request({ "x-forwarded-for": "203.0.113.9" });

  expect(Number(fromEdge.headers.get("RateLimit-Remaining"))).toBe(119);
  expect(Number(spoofed.headers.get("RateLimit-Remaining"))).toBe(119);
});

test("the Worker serves repeated catalog reads from the Workers cache", async () => {
  const entries = new Map<string, Response>();
  const put = vi.fn(async (request: Request, response: Response) => {
    entries.set(request.url, response);
  });
  const cache: EdgeCache = {
    match: async (request) => entries.get(request.url)?.clone(),
    put,
  };
  vi.stubGlobal("caches", { default: cache });
  const { default: worker } = await import("../src/worker.ts");
  const ctx = context();
  const url = "https://exora.test/api/planets/featured";

  const first = await worker.fetch(new Request(url), {}, ctx);
  await Promise.all(ctx.tasks);
  const second = await worker.fetch(new Request(url), {}, ctx);

  expect(first.status).toBe(200);
  expect(second.status).toBe(200);
  expect(put).toHaveBeenCalledOnce();
  expect(await second.json()).toEqual(await first.json());
  expect(second.headers.get("Cache-Control")).toBe(first.headers.get("Cache-Control"));
  expect(second.headers.get("X-Robots-Tag")).toBe("noindex");
});
