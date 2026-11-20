import { DataTexture, LinearFilter, RGFormat, type Vector3 } from "three";
import { SURFACE_HALF_EXTENT } from "../surface-vista-baking.ts";
import type { SurfaceTerrainData } from "../surface-terrain-kernel.ts";

export function createCloudHeights(
  data: SurfaceTerrainData,
  height: (x: number, z: number) => number,
  sun: Vector3,
) {
  const size = 160;
  const pixels = new Uint8Array(size * size * 2);
  const span = Math.max(0.01, data.high - data.low);
  for (let row = 0; row < size; row++) {
    const z = (((row + 0.5) * 2) / size - 1) * SURFACE_HALF_EXTENT;
    for (let col = 0; col < size; col++) {
      const x = (((col + 0.5) * 2) / size - 1) * SURFACE_HALF_EXTENT;
      const bottom = height(x, z);
      const lightward = height(x + sun.x * 8, z + sun.z * 8);
      const index = (row * size + col) * 2;
      pixels[index] = Math.round(((bottom - data.low) * 255) / span);
      pixels[index + 1] = Math.round(
        255 * Math.max(0, Math.min(1, 0.53 + (bottom - lightward) * 0.12)),
      );
    }
  }
  const map = new DataTexture(pixels, size, size, RGFormat);
  map.magFilter = map.minFilter = LinearFilter;
  map.needsUpdate = true;
  return map;
}
