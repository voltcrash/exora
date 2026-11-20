import { expect, test } from "vite-plus/test";
import { MARS } from "./solar-system.ts";
import { buildSurfaceTerrain, createSurfaceFloor } from "./surface-terrain-kernel.ts";
import { surfaceTerrainFixture } from "./terrain-test-fixtures.ts";

test("walking height follows both upward-facing triangles on the graded mesh", () => {
  const request = surfaceTerrainFixture(MARS, 16);
  if (request.kind !== "surface") throw new Error("Expected a surface request");
  const terrain = buildSurfaceTerrain(request.input);
  const floor = createSurfaceFloor(terrain);
  const { indices, positions } = terrain;
  for (let triangle = 0; triangle < indices.length; triangle += 3) {
    const a = indices[triangle]! * 3;
    const b = indices[triangle + 1]! * 3;
    const c = indices[triangle + 2]! * 3;
    const x = (positions[a]! + positions[b]! + positions[c]!) / 3;
    const y = (positions[a + 1]! + positions[b + 1]! + positions[c + 1]!) / 3;
    const z = (positions[a + 2]! + positions[b + 2]! + positions[c + 2]!) / 3;
    const normalY =
      (positions[b + 2]! - positions[a + 2]!) * (positions[c]! - positions[a]!) -
      (positions[b]! - positions[a]!) * (positions[c + 2]! - positions[a + 2]!);
    expect(normalY).toBeGreaterThan(0);
    expect(floor(x, z)).toBeCloseTo(y, 6);
  }
});
