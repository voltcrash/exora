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

  let low = Number.POSITIVE_INFINITY;
  let high = Number.NEGATIVE_INFINITY;

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
      if (sample.height < low) low = sample.height;
      if (sample.height > high) high = sample.height;
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
      indices[cursor + 1] = topRight;
      indices[cursor + 2] = bottomLeft;
      indices[cursor + 3] = topRight;
      indices[cursor + 4] = bottomRight;
      indices[cursor + 5] = bottomLeft;
      cursor += 6;
    }
  }

  bandlimitSurfaceFarField(heights, resolution);
  low = Number.POSITIVE_INFINITY;
  high = Number.NEGATIVE_INFINITY;
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
