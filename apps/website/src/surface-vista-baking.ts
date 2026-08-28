import type { Vector3 } from "@babylonjs/core/Maths/math.vector.js";
import type { RenderQualityProfile } from "./render-quality.ts";

export const SURFACE_HALF_EXTENT = 240;

export const gradeSurfaceAxis = (u: number): number =>
  SURFACE_HALF_EXTENT * (0.28 * u + 0.72 * u * u * u);

export const inverseSurfaceGradeAxis = (x: number): number => {
  const target = Math.min(1, Math.max(-1, x / SURFACE_HALF_EXTENT));
  let u = target;
  for (let iteration = 0; iteration < 4; iteration += 1) {
    const value = 0.28 * u + 0.72 * u * u * u - target;
    const slope = 0.28 + 2.16 * u * u;
    u -= value / slope;
  }
  return Math.min(1, Math.max(-1, u));
};

export const SURFACE_GRID_RESOLUTION: Readonly<Record<RenderQualityProfile["tier"], number>> = {
  desktop: 208,
  mobile: 132,
  quest: 116,
};

export const bakeSurfaceSunVisibility = (
  heights: Float32Array,
  resolution: number,
  sunDirection: Vector3,
  reliefScale: number,
): Float32Array => {
  const stride = resolution + 1;
  const visibility = new Float32Array(stride * stride);
  const horizontal = Math.hypot(sunDirection.x, sunDirection.z);

  if (horizontal < 1e-4 || sunDirection.y <= 0.01) {
    visibility.fill(sunDirection.y > 0.01 ? 1 : 0);
    return visibility;
  }

  const stepX = sunDirection.x / horizontal;
  const stepZ = sunDirection.z / horizontal;
  const rise = sunDirection.y / horizontal;
  const steps = 22;
  const maxDistance = SURFACE_HALF_EXTENT * 0.62;

  const heightAtGrid = (worldX: number, worldZ: number): number => {
    const u = inverseSurfaceGradeAxis(worldX);
    const v = inverseSurfaceGradeAxis(worldZ);
    const fx = (u + 1) * 0.5 * resolution;
    const fz = (v + 1) * 0.5 * resolution;
    const x0 = Math.min(resolution - 1, Math.max(0, Math.floor(fx)));
    const z0 = Math.min(resolution - 1, Math.max(0, Math.floor(fz)));
    const tx = Math.min(1, Math.max(0, fx - x0));
    const tz = Math.min(1, Math.max(0, fz - z0));
    const h00 = heights[z0 * stride + x0] ?? 0;
    const h10 = heights[z0 * stride + x0 + 1] ?? 0;
    const h01 = heights[(z0 + 1) * stride + x0] ?? 0;
    const h11 = heights[(z0 + 1) * stride + x0 + 1] ?? 0;
    return (h00 * (1 - tx) + h10 * tx) * (1 - tz) + (h01 * (1 - tx) + h11 * tx) * tz;
  };

  for (let iz = 0; iz <= resolution; iz += 1) {
    const worldZ = gradeSurfaceAxis((iz / resolution) * 2 - 1);
    for (let ix = 0; ix <= resolution; ix += 1) {
      const worldX = gradeSurfaceAxis((ix / resolution) * 2 - 1);
      const origin = heights[iz * stride + ix] ?? 0;
      let shade = 0;

      for (let step = 0; step < steps; step += 1) {
        const t = (step + 1) / steps;
        const distance = maxDistance * t * t;
        const sampleX = worldX + stepX * distance;
        const sampleZ = worldZ + stepZ * distance;
        if (Math.abs(sampleX) > SURFACE_HALF_EXTENT || Math.abs(sampleZ) > SURFACE_HALF_EXTENT)
          break;
        const rayHeight = origin + rise * distance;
        const blocker = heightAtGrid(sampleX, sampleZ);
        if (blocker > rayHeight) {
          const overtop = (blocker - rayHeight) / Math.max(distance * 0.035 + 0.12, 0.05);
          shade = Math.max(shade, Math.min(1, overtop));
          if (shade >= 1) break;
        }
      }

      visibility[iz * stride + ix] = 1 - shade * Math.min(1, 0.55 + reliefScale * 0.12);
    }
  }

  return visibility;
};

export const bandlimitSurfaceFarField = (heights: Float32Array, resolution: number): void => {
  const stride = resolution + 1;
  const source = Float32Array.from(heights);

  for (let iz = 0; iz <= resolution; iz += 1) {
    const v = (iz / resolution) * 2 - 1;
    for (let ix = 0; ix <= resolution; ix += 1) {
      const u = (ix / resolution) * 2 - 1;
      const coarseness = Math.max(Math.abs(u), Math.abs(v));
      const strength = Math.min(1, Math.max(0, (coarseness - 0.34) / 0.66)) ** 1.5;
      if (strength <= 0.01) continue;

      let sum = 0;
      let weight = 0;
      const radius = strength > 0.6 ? 2 : 1;
      for (let oz = -radius; oz <= radius; oz += 1) {
        for (let ox = -radius; ox <= radius; ox += 1) {
          const sx = Math.min(resolution, Math.max(0, ix + ox));
          const sz = Math.min(resolution, Math.max(0, iz + oz));
          const kernel = 1 / (1 + ox * ox + oz * oz);
          sum += (source[sz * stride + sx] ?? 0) * kernel;
          weight += kernel;
        }
      }

      const smoothed = sum / Math.max(weight, 1e-6);
      const index = iz * stride + ix;
      heights[index] = (source[index] ?? 0) * (1 - strength) + smoothed * strength;
    }
  }
};

export const bakeSurfaceOcclusion = (heights: Float32Array, resolution: number): Float32Array => {
  const stride = resolution + 1;
  const occlusion = new Float32Array(stride * stride);
  const radii = [1, 3, 7];

  for (let iz = 0; iz <= resolution; iz += 1) {
    for (let ix = 0; ix <= resolution; ix += 1) {
      const center = heights[iz * stride + ix] ?? 0;
      let openness = 0;
      let weightTotal = 0;

      for (const radius of radii) {
        let sum = 0;
        let count = 0;
        for (let offset = -radius; offset <= radius; offset += radius) {
          for (let other = -radius; other <= radius; other += radius) {
            if (offset === 0 && other === 0) continue;
            const sx = Math.min(resolution, Math.max(0, ix + offset));
            const sz = Math.min(resolution, Math.max(0, iz + other));
            sum += heights[sz * stride + sx] ?? 0;
            count += 1;
          }
        }
        const weight = 1 / radius;
        openness += weight * Math.tanh((center - sum / Math.max(count, 1)) * 1.6);
        weightTotal += weight;
      }

      occlusion[iz * stride + ix] = Math.min(
        1,
        Math.max(0.16, 0.72 + (openness / Math.max(weightTotal, 1e-6)) * 0.34),
      );
    }
  }

  return occlusion;
};
