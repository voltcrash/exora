import type { SurfaceGeology } from "./surface-geology.ts";
import { createTerrainField, createTerrainSample } from "./surface-terrain.ts";
import {
  bakeSurfaceOcclusion,
  bakeSurfaceSunVisibility,
  bandlimitSurfaceFarField,
  gradeSurfaceAxis,
} from "./surface-vista-baking.ts";

export interface SurfaceTerrainInput {
  geology: SurfaceGeology;
  resolution: number;
  sunDirection: { x: number; y: number; z: number };
}

export const buildSurfaceTerrain = ({ geology, resolution, sunDirection }: SurfaceTerrainInput) => {
  const field = createTerrainField(geology);
  const stride = resolution + 1;
  const vertexCount = stride * stride;
  const positions = new Float32Array(vertexCount * 3);
  const colors = new Float32Array(vertexCount * 4);
  const shade = new Float32Array(vertexCount * 2);
  const heights = new Float32Array(vertexCount);
  const indices = new Uint32Array(resolution * resolution * 6);
  const sample = createTerrainSample();

  for (let iz = 0; iz <= resolution; iz += 1) {
    const z = gradeSurfaceAxis((iz / resolution) * 2 - 1);
    for (let ix = 0; ix <= resolution; ix += 1) {
      const x = gradeSurfaceAxis((ix / resolution) * 2 - 1);
      const index = iz * stride + ix;
      field.sample(x, z, sample);
      heights[index] = sample.height;
      positions[index * 3] = x;
      positions[index * 3 + 1] = sample.height;
      positions[index * 3 + 2] = z;
      colors[index * 4] = sample.regolith;
      colors[index * 4 + 1] = sample.scarp;
      colors[index * 4 + 2] = sample.frost;
      colors[index * 4 + 3] = sample.molten;
    }
  }

  let cursor = 0;
  for (let iz = 0; iz < resolution; iz += 1) {
    for (let ix = 0; ix < resolution; ix += 1) {
      const topLeft = iz * stride + ix;
      const topRight = topLeft + 1;
      const bottomLeft = topLeft + stride;
      const bottomRight = bottomLeft + 1;
      indices[cursor] = topLeft;
      indices[cursor + 1] = bottomLeft;
      indices[cursor + 2] = topRight;
      indices[cursor + 3] = topRight;
      indices[cursor + 4] = bottomLeft;
      indices[cursor + 5] = bottomRight;
      cursor += 6;
    }
  }

  bandlimitSurfaceFarField(heights, resolution);
  let low = Number.POSITIVE_INFINITY;
  let high = Number.NEGATIVE_INFINITY;
  for (let index = 0; index < vertexCount; index += 1) {
    const height = heights[index] ?? 0;
    positions[index * 3 + 1] = height;
    if (height < low) low = height;
    if (height > high) high = height;
  }

  const occlusion = bakeSurfaceOcclusion(heights, resolution);
  const visibility = bakeSurfaceSunVisibility(heights, resolution, sunDirection, geology.relief);
  for (let index = 0; index < vertexCount; index += 1) {
    shade[index * 2] = occlusion[index] ?? 1;
    shade[index * 2 + 1] = visibility[index] ?? 1;
  }

  return { positions, colors, shade, heights, indices, occlusion, visibility, low, high };
};

export type SurfaceTerrainData = ReturnType<typeof buildSurfaceTerrain>;

export const createSurfaceFloor = ({ positions, heights }: SurfaceTerrainData) => {
  const stride = Math.sqrt(heights.length);
  const findSpan = (value: number, offset: number, step: number) => {
    let low = 0;
    let high = stride - 1;
    while (high - low > 1) {
      const middle = (high + low) >>> 1;
      if (positions[offset + step * middle]! <= value) low = middle;
      else high = middle;
    }
    return low;
  };

  return (x: number, z: number): number => {
    const col = findSpan(x, 0, 3);
    const row = findSpan(z, 2, stride * 3);
    const x0 = positions[col * 3]!;
    const z0 = positions[row * stride * 3 + 2]!;
    const u = Math.min(1, Math.max(0, (x - x0) / (positions[col * 3 + 3]! - x0)));
    const v = Math.min(1, Math.max(0, (z - z0) / (positions[(row + 1) * stride * 3 + 2]! - z0)));
    const index = row * stride + col;
    const east = heights[index + 1]!;
    const south = heights[index + stride]!;
    return u + v <= 1
      ? heights[index]! * (1 - u - v) + east * u + south * v
      : east * (1 - v) + south * (1 - u) + heights[index + stride + 1]! * (u + v - 1);
  };
};
