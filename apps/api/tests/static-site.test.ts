import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Hono } from "hono";
import { afterAll, beforeAll, expect, test } from "vite-plus/test";
import { parseHeaderRules, parseRewrites, serveStaticSite } from "../src/static-site.ts";

let root: string;
let app: Hono;

beforeAll(async () => {
  root = await mkdtemp(join(tmpdir(), "exora-static-"));
  await mkdir(join(root, "assets"));
  await mkdir(join(root, "explore"));
  await mkdir(join(root, ".vite"));
  await writeFile(join(root, "index.html"), "<p>home</p>");
  await writeFile(join(root, "404.html"), "<p>missing</p>");
  await writeFile(join(root, "explore", "index.html"), "<p>explore</p>");
  await writeFile(join(root, "assets", "main-abc.js"), "export {};");
  await writeFile(join(root, "logo.svg"), "<svg/>");
  await writeFile(join(root, ".vite", "manifest.json"), "{}");
  await writeFile(
    join(root, "_headers"),
    "# comment\n/*\n  X-Frame-Options: DENY\n\n/assets/*\n  Cache-Control: public, max-age=31536000, immutable\n",
  );
  await writeFile(join(root, "_redirects"), "/favicon.svg /logo.svg 200\n/old /new 301\n");

  app = new Hono();
  app.get("/api/health", (context) => context.json({ status: "ok" }));
  serveStaticSite(app, root);
});

afterAll(async () => {
  await rm(root, { force: true, recursive: true });
});

test("pages and hashed bundles carry the _headers rules that match their path", async () => {
  const home = await app.request("/");
  const bundle = await app.request("/assets/main-abc.js");

  expect(home.status).toBe(200);
  expect(await home.text()).toBe("<p>home</p>");
  expect(home.headers.get("X-Frame-Options")).toBe("DENY");
  expect(home.headers.get("Cache-Control")).toBe("public, max-age=0, must-revalidate");
  expect(bundle.headers.get("X-Frame-Options")).toBe("DENY");
  expect(bundle.headers.get("Cache-Control")).toBe("public, max-age=31536000, immutable");
});

test("a directory redirects to its trailing slash and then serves its index", async () => {
  const redirect = await app.request("/explore?tour=extremes");
  const page = await app.request("/explore/");

  expect(redirect.status).toBe(307);
  expect(redirect.headers.get("Location")).toBe("/explore/?tour=extremes");
  expect(await page.text()).toBe("<p>explore</p>");
});

test("rewrites serve another file under the requested path", async () => {
  const icon = await app.request("/favicon.svg");

  expect(icon.status).toBe(200);
  expect(await icon.text()).toBe("<svg/>");
});

test("missing pages, host configuration and build metadata answer with the 404 page", async () => {
  for (const path of ["/nowhere", "/_headers", "/_redirects", "/.vite/manifest.json"]) {
    const response = await app.request(path);
    expect(response.status).toBe(404);
    expect(await response.text()).toBe("<p>missing</p>");
    expect(response.headers.get("X-Frame-Options")).toBe("DENY");
  }
});

test("API routes registered first are never shadowed by static files", async () => {
  const response = await app.request("/api/health");
  expect(await response.json()).toEqual({ status: "ok" });
});

test("header and rewrite files are parsed the way Cloudflare reads them", () => {
  const [all, assets] = parseHeaderRules("/*\n  A: 1\n/assets/*\n  B: two: parts\n");

  expect(all?.pattern.test("/anything/at/all")).toBe(true);
  expect(assets?.pattern.test("/assets/x.js")).toBe(true);
  expect(assets?.pattern.test("/textures/x.ktx2")).toBe(false);
  expect(assets?.headers).toEqual([["B", "two: parts"]]);
  expect([...parseRewrites("/a /b 200\n/c /d 301\n# /e /f 200\n")]).toEqual([["/a", "/b"]]);
});
