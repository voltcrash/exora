import { readFile } from "node:fs/promises";
import { expect, test } from "vite-plus/test";

interface HeaderRule {
  headers: { key: string; value: string }[];
  source: string;
}

interface VercelConfig {
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
    "x-content-type-options": "nosniff",
    "x-frame-options": "DENY",
  });
  expect(headers["permissions-policy"]).toContain("xr-spatial-tracking=(self)");
  expect(headers["permissions-policy"]).toContain("camera=(self)");
  expect(headers["permissions-policy"]).toContain("microphone=()");
});
