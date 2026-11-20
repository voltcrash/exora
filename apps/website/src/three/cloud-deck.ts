import { DataTexture, LinearFilter, RedFormat } from "three";
import { SURFACE_HALF_EXTENT } from "../surface-vista-baking.ts";
import type { SurfaceTerrainData } from "../surface-terrain-kernel.ts";

export function createCloudHeights(
  data: SurfaceTerrainData,
  height: (x: number, z: number) => number,
) {
  const size = 160;
  const pixels = new Uint8Array(size * size);
  const span = Math.max(0.01, data.high - data.low);
  for (let row = 0; row < size; row++) {
    const z = (((row + 0.5) * 2) / size - 1) * SURFACE_HALF_EXTENT;
    for (let col = 0; col < size; col++) {
      const x = (((col + 0.5) * 2) / size - 1) * SURFACE_HALF_EXTENT;
      pixels[row * size + col] = Math.round(((height(x, z) - data.low) * 255) / span);
    }
  }
  const map = new DataTexture(pixels, size, size, RedFormat);
  map.magFilter = map.minFilter = LinearFilter;
  map.needsUpdate = true;
  return map;
}
