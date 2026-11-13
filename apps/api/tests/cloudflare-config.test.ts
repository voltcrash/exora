import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { expect, test } from "vite-plus/test";
import { VARIANT_LAUNCH_INITIALIZER } from "../../website/variant-launch-embed.ts";

interface WranglerConfig {
  assets: {
    directory: string;
    not_found_handling: string;
    run_worker_first: string[];
  };
  compatibility_flags?: string[];
  main: string;
}

const repository = new URL("../../../", import.meta.url);

const wranglerConfig = async (): Promise<WranglerConfig> => {
  const source = await readFile(new URL("wrangler.jsonc", repository), "utf8");
  const json = source
    .split("\n")
    .filter((line) => !line.trimStart().startsWith("//"))
    .join("\n")
    .replaceAll(/,(\s*[}\]])/g, "$1");
  return JSON.parse(json) as WranglerConfig;
};

/** Header blocks from a _headers file, keyed by path pattern with lower-case header names. */
const headerRules = async (): Promise<Map<string, Record<string, string>>> => {
  const source = await readFile(new URL("apps/website/public/_headers", repository), "utf8");
  const rules = new Map<string, Record<string, string>>();
  let current: Record<string, string> | undefined;
  for (const line of source.split("\n")) {
    if (!line.trim() || line.trimStart().startsWith("#")) continue;
    if (!/^\s/.test(line)) {
      current = {};
      rules.set(line.trim(), current);
      continue;
    }
    const separator = line.indexOf(":");
    current![line.slice(0, separator).trim().toLowerCase()] = line.slice(separator + 1).trim();
  }
  return rules;
};

test("only API paths start the Worker; everything else is served as a static asset", async () => {
  const config = await wranglerConfig();

  expect(config.main).toBe("apps/api/dist/worker.mjs");
  expect(config.assets.directory).toBe("apps/website/dist");
  expect(config.assets.run_worker_first).toEqual(["/api/*"]);
  expect(config.assets.not_found_handling).toBe("404-page");
  // The Worker needs no Node.js compatibility layer.
  expect(config.compatibility_flags ?? []).not.toContain("nodejs_compat");
});

test("the static site applies its browser security policy to every response", async () => {
  const headers = (await headerRules()).get("/*") ?? {};

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

test("hashed bundles are immutable and large scene assets revalidate in the background", async () => {
  const rules = await headerRules();

  expect(rules.get("/assets/*")?.["cache-control"]).toBe("public, max-age=31536000, immutable");
  expect(rules.get("/sky/*")?.["cache-control"]).toBe("public, max-age=31536000, immutable");
  for (const path of ["/textures/*", "/models/*", "/ktx2/*"]) {
    expect(rules.get(path)?.["cache-control"]).toBe(
      "public, max-age=604800, stale-while-revalidate=2592000",
    );
  }
});

test("the service worker is always revalidated so an update reaches every visitor", async () => {
  expect((await headerRules()).get("/sw.js")?.["cache-control"]).toBe(
    "public, max-age=0, must-revalidate",
  );
});

test("build metadata is never published as a static asset", async () => {
  const ignored = await readFile(new URL("apps/website/public/.assetsignore", repository), "utf8");
  expect(ignored.split("\n")).toContain(".vite");
});
