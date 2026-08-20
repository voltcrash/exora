import { expect, test } from "vite-plus/test";

/** Every source file in this package, read as text. `?raw` keeps this browser-typed — the website
 * package deliberately has no Node types, so the filesystem is off limits here. */
const sources = import.meta.glob<string>("./**/*.{ts,tsx}", {
  eager: true,
  import: "default",
  query: "?raw",
});

/**
 * `vite.config.ts` resolves Babylon's WGSL shader sources to an empty module, which is only sound
 * while every engine here is WebGL. Constructing a `WebGPUEngine` would reach a shader store the
 * build deliberately left empty and fail at runtime rather than at compile time — so the
 * invariant is asserted rather than left as a comment on the plugin.
 */
test("the renderer stays WebGL, so dropping Babylon's WGSL shaders is safe", () => {
  const offenders = Object.entries(sources)
    .filter(([path]) => !path.endsWith("webgl-only.test.ts"))
    .filter(([, source]) => source.includes("WebGPUEngine"))
    .map(([path]) => path);

  expect(offenders).toEqual([]);
});

test("the guard reads real sources rather than silently matching nothing", () => {
  // A glob that resolved to an empty set would make the assertion above vacuously true.
  expect(Object.keys(sources).length).toBeGreaterThan(20);
  expect(sources["./scene-host.ts"]).toContain("new Engine(");
});
