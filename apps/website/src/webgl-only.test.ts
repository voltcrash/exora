import { expect, test } from "vite-plus/test";

const sources = import.meta.glob<string>("./**/*.{ts,tsx}", {
  eager: true,
  import: "default",
  query: "?raw",
});

test("the viewer uses one WebGL renderer across destinations", () => {
  const offenders = Object.entries(sources)
    .filter(([path]) => !path.endsWith("webgl-only.test.ts"))
    .filter(([, source]) => source.includes("WebGPUEngine") || source.includes("@babylonjs/"))
    .map(([path]) => path);

  expect(offenders).toEqual([]);
});

test("the guard reads real sources rather than silently matching nothing", () => {
  expect(Object.keys(sources).length).toBeGreaterThan(20);
  expect(sources["./three/observatory.ts"]).toContain("new WebGLRenderer(");
});
