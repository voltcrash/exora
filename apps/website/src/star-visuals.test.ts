import { afterEach, expect, test, vi } from "vite-plus/test";
import { createNightSky } from "./three/sky.ts";
import { createProminences } from "./three/prominences.ts";
import { Color, Group } from "three";

afterEach(() => vi.restoreAllMocks());
test("a seeded sky fills both camera tiers and regenerates the same directions", () => {
  for (const count of [1000, 2400]) {
    const a = createNightSky(count, 17),
      b = createNightSky(count, 17),
      c = createNightSky(count, 33);
    try {
      const positions = a.mesh.geometry.getAttribute("position");
      expect(positions.count).toBe(count);
      expect(positions.array).toEqual(b.mesh.geometry.getAttribute("position").array);
      expect(positions.array[3]).not.toEqual(c.mesh.geometry.getAttribute("position").array[3]);
      expect(a.mesh.geometry.getAttribute("color").count).toBe(count);
    } finally {
      a.dispose();
      b.dispose();
      c.dispose();
    }
  }
});
test("stellar prominences scale with their parent and release their buffers", () => {
  const parent = new Group(),
    arcs = createProminences(2, new Color("orange"), 0.8, 22);
  parent.add(arcs);
  parent.scale.setScalar(0.04);
  parent.updateMatrixWorld();
  expect(arcs.matrixWorld.elements[0]).toBeCloseTo(0.04);
  expect(arcs.geometry.getAttribute("position").count).toBeGreaterThan(32);
  arcs.geometry.dispose();
  arcs.material.dispose();
});
