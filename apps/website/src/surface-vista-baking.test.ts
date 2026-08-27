import { Vector3 } from "@babylonjs/core/Maths/math.vector.js";
import { expect, test } from "vite-plus/test";
import {
  bakeSurfaceOcclusion,
  bakeSurfaceSunVisibility,
  gradeSurfaceAxis,
  inverseSurfaceGradeAxis,
} from "./surface-vista-baking.ts";

test("the graded surface grid remains invertible across the full patch", () => {
  for (const normalized of [-1, -0.7, -0.2, 0, 0.35, 0.8, 1]) {
    expect(inverseSurfaceGradeAxis(gradeSurfaceAxis(normalized))).toBeCloseTo(normalized, 5);
  }
});

test("terrain light baking returns bounded values for every grid vertex", () => {
  const resolution = 4;
  const stride = resolution + 1;
  const heights = new Float32Array(stride * stride);
  heights[2 * stride + 2] = 2;

  const occlusion = bakeSurfaceOcclusion(heights, resolution);
  const sunlight = bakeSurfaceSunVisibility(
    heights,
    resolution,
    new Vector3(0.8, 0.35, 0.2).normalize(),
    1,
  );

  expect(occlusion).toHaveLength(stride * stride);
  expect(sunlight).toHaveLength(stride * stride);
  expect([...occlusion, ...sunlight].every((value) => value >= 0 && value <= 1)).toBe(true);
});
