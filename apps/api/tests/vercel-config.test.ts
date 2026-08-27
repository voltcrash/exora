import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { expect, test } from "vite-plus/test";
import { VARIANT_LAUNCH_INITIALIZER } from "../../website/variant-launch-embed.ts";

interface HeaderRule {
  headers: { key: string; value: string }[];
  source: string;
}

interface VercelConfig {
  crons: { path: string; schedule: string }[];
  headers: HeaderRule[];
}

test("the deployment applies its browser security policy to every response", async () => {
  const path = new URL("../../../vercel.json", import.meta.url);
  const config = JSON.parse(await readFile(path, "utf8")) as VercelConfig;
  const globalRule = config.headers.find(({ source }) => source === "/(.*)");
  const headers = Object.fromEntries(
    globalRule?.headers.map(({ key, value }) => [key.toLowerCase(), value]) ?? [],
  );

  expect(headers).toMatchObject({
    "cross-origin-opener-policy": "same-origin",
    "cross-origin-resource-policy": "same-origin",
    "referrer-policy": "strict-origin-when-cross-origin",
    "strict-transport-security": "max-age=63072000; includeSubDomains",
    "x-content-type-options": "nosniff",
    "x-frame-options": "DENY",
  });
  expect(headers["permissions-policy"]).toContain("xr-spatial-tracking=(self)");
  expect(headers["permissions-policy"]).toContain("camera=(self)");
  expect(headers["permissions-policy"]).toContain("microphone=()");

  const csp = headers["content-security-policy"] ?? "";
  const variantHash = createHash("sha256").update(VARIANT_LAUNCH_INITIALIZER).digest("base64");
  expect(csp).toContain("default-src 'self'");
  expect(csp).toContain("frame-ancestors 'none'");
  expect(csp).toContain("object-src 'none'");
  expect(csp).toContain("worker-src 'self' blob:");
  expect(csp).toContain("'wasm-unsafe-eval'");
  expect(csp).toContain("'unsafe-eval'");
  expect(csp).toContain("https://launchar.app");
  expect(csp).toContain(`'sha256-${variantHash}'`);
  expect(csp).not.toContain("script-src 'self' 'unsafe-inline'");
});

test("large destination models are cached at the edge and revalidated in the background", async () => {
  const path = new URL("../../../vercel.json", import.meta.url);
  const config = JSON.parse(await readFile(path, "utf8")) as VercelConfig;
  const modelRule = config.headers.find(({ source }) => source === "/models/(.*)");
  const headers = Object.fromEntries(
    modelRule?.headers.map(({ key, value }) => [key.toLowerCase(), value]) ?? [],
  );

  expect(headers["cache-control"]).toBe("public, max-age=604800, stale-while-revalidate=2592000");
});

test("schedules the authenticated catalog trigger outside the full synchronization worker", async () => {
  const path = new URL("../../../vercel.json", import.meta.url);
  const config = JSON.parse(await readFile(path, "utf8")) as VercelConfig;

  expect(config.crons).toEqual([{ path: "/api/internal/catalog-refresh", schedule: "17 3 * * *" }]);
});
