import { expect, test, vi } from "vite-plus/test";
import vercelApp from "../src/vercel.ts";

test("serves the Hono app through the Vercel entry point", async () => {
  const response = await vercelApp.request("https://exora.test/api/health");

  expect(response.status).toBe(200);
  expect(await response.json()).toEqual({ service: "exora-api", status: "ok" });
});

test("the Vercel entry answers planet reads from the bundled snapshot without reaching NASA", async () => {
  const upstream = vi.fn(async () => new Response(null, { status: 503 }));
  vi.stubGlobal("fetch", upstream);
  try {
    // The repositories capture fetch when the entry module is evaluated.
    vi.resetModules();
    const { default: app } = await import("../src/vercel.ts");
    const search = await app.request("https://exora.test/api/planets?q=kepler%2018");
    expect(search.status).toBe(200);
    const { data } = (await search.json()) as { data: { name: string }[] };
    expect(data[0]?.name).toBe("Kepler-18 b");

    const browse = await app.request(
      "https://exora.test/api/planets?browse=physical-controls&limit=12",
    );
    const page = (await browse.json()) as { data: unknown[]; meta: { nextCursor: string } };
    expect(page.data).toHaveLength(12);
    expect(page.meta.nextCursor).toEqual(expect.any(String));

    const planet = await app.request("https://exora.test/api/planets/TRAPPIST-1%20e");
    expect(planet.status).toBe(200);
    expect(upstream).not.toHaveBeenCalled();

    const newer = await app.request("https://exora.test/api/planets/Not%20Yet%20Catalogued%20b");
    expect(newer.status).toBe(502);
    expect(upstream).toHaveBeenCalledOnce();
  } finally {
    vi.unstubAllGlobals();
  }
});
