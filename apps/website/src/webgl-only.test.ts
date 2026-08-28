import { expect, test } from "vite-plus/test";

const sources = import.meta.glob<string>("./**/*.{ts,tsx}", {
  eager: true,
  import: "default",
  query: "?raw",
});

test("the renderer stays WebGL, so dropping Babylon's WGSL shaders is safe", () => {
  const offenders = Object.entries(sources)
    .filter(([path]) => !path.endsWith("webgl-only.test.ts"))
    .filter(([, source]) => source.includes("WebGPUEngine"))
    .map(([path]) => path);

  expect(offenders).toEqual([]);
});

test("the guard reads real sources rather than silently matching nothing", () => {
  expect(Object.keys(sources).length).toBeGreaterThan(20);
  expect(sources["./scene-lifecycle.ts"]).toContain("new Engine(");
});
