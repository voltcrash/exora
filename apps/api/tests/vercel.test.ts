import { waitUntil } from "@vercel/functions";
import { expect, test, vi } from "vite-plus/test";
import vercelApp from "../src/vercel.ts";

vi.mock("@vercel/functions", () => ({ waitUntil: vi.fn() }));

test("serves the Hono app through the Vercel entry point", async () => {
  const response = await vercelApp.request("https://exora.test/api/health");

  expect(response.status).toBe(200);
  expect(await response.json()).toEqual({ service: "exora-api", status: "ok" });
});

test("the Vercel entry keeps the background catalog load alive after a search response", async () => {
  let release!: (response: Response) => void;
  vi.stubGlobal("fetch", async (input: string | URL | Request) => {
    const query = new URL(input instanceof Request ? input.url : input).searchParams.get("query")!;
    return query.startsWith("select top ")
      ? Response.json([])
      : new Promise<Response>((resolve) => {
          release = resolve;
        });
  });
  try {
    vi.resetModules();
    const { default: app } = await import("../src/vercel.ts");
    const response = await app.request("https://exora.test/api/planets?q=hip");
    expect(response.status).toBe(200);
    expect(waitUntil).toHaveBeenCalledOnce();
    const pending = vi.mocked(waitUntil).mock.calls[0]![0];
    expect(pending).toBeInstanceOf(Promise);
    release(Response.json([]));
    await pending;
  } finally {
    vi.unstubAllGlobals();
  }
});
