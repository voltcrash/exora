import { readFile } from "node:fs/promises";
import { expect, test } from "vite-plus/test";

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
    "strict-transport-security": "max-age=31536000",
    "x-content-type-options": "nosniff",
    "x-frame-options": "DENY",
  });
  expect(headers["permissions-policy"]).toContain("xr-spatial-tracking=(self)");
  expect(headers["permissions-policy"]).toContain("camera=(self)");
  expect(headers["permissions-policy"]).toContain("microphone=()");
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
