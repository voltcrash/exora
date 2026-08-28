import type { RockyTerrainDetail } from "@exora/worldgen";

interface Vector3Like {
  x: number;
  y: number;
  z: number;
}

const clamp01 = (value: number): number =>
  Number.isFinite(value) ? Math.min(1, Math.max(0, value)) : 0;

const smoothstep = (edge0: number, edge1: number, value: number): number => {
  if (edge0 === edge1) return value < edge0 ? 0 : 1;
  const t = clamp01((value - edge0) / (edge1 - edge0));
  return t * t * (3 - 2 * t);
};

const lerp = (a: number, b: number, t: number): number => a + (b - a) * t;

const hash3i = (xi: number, yi: number, zi: number, seed: number): number => {
  let h = (xi * 374_761_393 + yi * 668_265_263 + zi * 2_147_483_647 + seed * 3_266_489_917) | 0;
  h = Math.imul(h ^ (h >>> 13), 1_274_126_177);
  h ^= h >>> 16;
  return h >>> 0;
};

const GRADIENTS_3D: readonly Vector3Like[] = [
  { x: 1, y: 1, z: 0 },
  { x: -1, y: 1, z: 0 },
  { x: 1, y: -1, z: 0 },
  { x: -1, y: -1, z: 0 },
  { x: 1, y: 0, z: 1 },
  { x: -1, y: 0, z: 1 },
  { x: 1, y: 0, z: -1 },
  { x: -1, y: 0, z: -1 },
  { x: 0, y: 1, z: 1 },
  { x: 0, y: -1, z: 1 },
  { x: 0, y: 1, z: -1 },
  { x: 0, y: -1, z: -1 },
];

const gradientDot = (
  xi: number,
  yi: number,
  zi: number,
  seed: number,
  dx: number,
  dy: number,
  dz: number,
): number => {
  const gradient = GRADIENTS_3D[hash3i(xi, yi, zi, seed) % GRADIENTS_3D.length]!;
  return gradient.x * dx + gradient.y * dy + gradient.z * dz;
};

const fade = (t: number): number => t * t * t * (t * (t * 6 - 15) + 10);

export const gradientNoise3 = (x: number, y: number, z: number, seed: number): number => {
  const x0 = Math.floor(x);
  const y0 = Math.floor(y);
  const z0 = Math.floor(z);
  const dx = x - x0;
  const dy = y - y0;
  const dz = z - z0;
  const u = fade(dx);
  const v = fade(dy);
  const w = fade(dz);

  const n000 = gradientDot(x0, y0, z0, seed, dx, dy, dz);
  const n100 = gradientDot(x0 + 1, y0, z0, seed, dx - 1, dy, dz);
  const n010 = gradientDot(x0, y0 + 1, z0, seed, dx, dy - 1, dz);
  const n110 = gradientDot(x0 + 1, y0 + 1, z0, seed, dx - 1, dy - 1, dz);
  const n001 = gradientDot(x0, y0, z0 + 1, seed, dx, dy, dz - 1);
  const n101 = gradientDot(x0 + 1, y0, z0 + 1, seed, dx - 1, dy, dz - 1);
  const n011 = gradientDot(x0, y0 + 1, z0 + 1, seed, dx, dy - 1, dz - 1);
  const n111 = gradientDot(x0 + 1, y0 + 1, z0 + 1, seed, dx - 1, dy - 1, dz - 1);

  const nx00 = lerp(n000, n100, u);
  const nx10 = lerp(n010, n110, u);
  const nx01 = lerp(n001, n101, u);
  const nx11 = lerp(n011, n111, u);
  const nxy0 = lerp(nx00, nx10, v);
  const nxy1 = lerp(nx01, nx11, v);

  return lerp(nxy0, nxy1, w) * 1.4;
};

interface FbmOptions {
  gain?: number;
  lacunarity?: number;
  octaves: number;
}

export const fbm3 = (
  x: number,
  y: number,
  z: number,
  seed: number,
  options: FbmOptions,
): number => {
  const lacunarity = options.lacunarity ?? 2.0;
  const gain = options.gain ?? 0.5;
  let amplitude = 1;
  let frequency = 1;
  let sum = 0;
  let normalization = 0;

  for (let octave = 0; octave < options.octaves; octave += 1) {
    sum +=
      amplitude * gradientNoise3(x * frequency, y * frequency, z * frequency, seed + octave * 101);
    normalization += amplitude;
    amplitude *= gain;
    frequency *= lacunarity;
  }

  return normalization > 0 ? sum / normalization : 0;
};

export const ridged3 = (
  x: number,
  y: number,
  z: number,
  seed: number,
  options: FbmOptions,
): number => {
  const lacunarity = options.lacunarity ?? 2.0;
  const gain = options.gain ?? 0.5;
  let amplitude = 1;
  let frequency = 1;
  let sum = 0;
  let normalization = 0;
  let weight = 1;

  for (let octave = 0; octave < options.octaves; octave += 1) {
    let ridge =
      1 -
      Math.abs(gradientNoise3(x * frequency, y * frequency, z * frequency, seed + octave * 191));
    ridge *= ridge * weight;
    weight = clamp01(ridge * 2.2);
    sum += amplitude * ridge;
    normalization += amplitude;
    amplitude *= gain;
    frequency *= lacunarity;
  }

  return normalization > 0 ? (sum / normalization) * 2 - 1 : 0;
};

export const worley3 = (x: number, y: number, z: number, seed: number): number => {
  const xi = Math.floor(x);
  const yi = Math.floor(y);
  const zi = Math.floor(z);
  let closest = 8;

  for (let ox = -1; ox <= 1; ox += 1) {
    for (let oy = -1; oy <= 1; oy += 1) {
      for (let oz = -1; oz <= 1; oz += 1) {
        const cellX = xi + ox;
        const cellY = yi + oy;
        const cellZ = zi + oz;
        const h = hash3i(cellX, cellY, cellZ, seed);
        const jitterX = ((h & 0xff) / 255 - 0.5) * 0.9;
        const jitterY = (((h >>> 8) & 0xff) / 255 - 0.5) * 0.9;
        const jitterZ = (((h >>> 16) & 0xff) / 255 - 0.5) * 0.9;
        const dx = cellX + 0.5 + jitterX - x;
        const dy = cellY + 0.5 + jitterY - y;
        const dz = cellZ + 0.5 + jitterZ - z;
        const distance = Math.sqrt(dx * dx + dy * dy + dz * dz);
        if (distance < closest) closest = distance;
      }
    }
  }

  return clamp01(closest);
};

export const domainWarp3 = (
  x: number,
  y: number,
  z: number,
  seed: number,
  strength: number,
): Vector3Like => {
  const warpX = fbm3(x + 11.3, y - 4.7, z + 7.1, seed + 4001, { octaves: 3 });
  const warpY = fbm3(x - 9.1, y + 2.3, z - 6.8, seed + 4002, { octaves: 3 });
  const warpZ = fbm3(x + 3.4, y + 8.9, z - 1.6, seed + 4003, { octaves: 3 });
  return {
    x: x + warpX * strength,
    y: y + warpY * strength,
    z: z + warpZ * strength,
  };
};

interface Crater {
  centralPeak: boolean;
  depth: number;
  direction: Vector3Like;
  radius: number;
  rimHeight: number;
}

const createSeededRandom = (seed: number): (() => number) => {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let value = state;
    value = Math.imul(value ^ (value >>> 15), value | 1);
    value ^= value + Math.imul(value ^ (value >>> 7), value | 61);
    return ((value ^ (value >>> 14)) >>> 0) / 4_294_967_296;
  };
};

export const buildCraterField = (seed: number, density: number, scale: number): Crater[] => {
  const random = createSeededRandom((seed ^ 0x9e3779b9) >>> 0);
  const count = Math.round(lerp(4, 46, clamp01(density)));
  const craters: Crater[] = [];

  for (let index = 0; index < count; index += 1) {
    const cosTheta = random() * 2 - 1;
    const sinTheta = Math.sqrt(Math.max(0, 1 - cosTheta * cosTheta));
    const phi = random() * Math.PI * 2;
    const direction: Vector3Like = {
      x: sinTheta * Math.cos(phi),
      y: cosTheta,
      z: sinTheta * Math.sin(phi),
    };
    const sizeRoll = random();
    const radius = lerp(0.035, 0.32, sizeRoll * sizeRoll) * lerp(0.6, 1.6, clamp01(scale));
    const depth = lerp(0.25, 1, 1 - sizeRoll) * lerp(0.4, 1.1, clamp01(scale));
    craters.push({
      direction,
      radius,
      depth,
      rimHeight: depth * lerp(0.28, 0.5, random()),
      centralPeak: radius > 0.18 && random() > 0.4,
    });
  }

  return craters;
};

const evaluateCraters = (direction: Vector3Like, craters: readonly Crater[]): number => {
  let displacement = 0;

  for (const crater of craters) {
    const dot =
      clamp01(
        (direction.x * crater.direction.x +
          direction.y * crater.direction.y +
          direction.z * crater.direction.z +
          1) /
          2,
      ) *
        2 -
      1;
    const angularDistance = Math.acos(Math.min(1, Math.max(-1, dot)));
    const normalizedDistance = angularDistance / crater.radius;
    if (normalizedDistance >= 1.35) continue;

    if (normalizedDistance < 0.72) {
      const bowl = 1 - normalizedDistance / 0.72;
      let bowlShape = -crater.depth * bowl * bowl;
      if (crater.centralPeak && normalizedDistance < 0.18) {
        bowlShape += crater.depth * 0.55 * (1 - normalizedDistance / 0.18);
      }
      displacement += bowlShape;
    } else if (normalizedDistance < 1.35) {
      const rim = 1 - Math.abs(normalizedDistance - 0.95) / 0.4;
      displacement += crater.rimHeight * Math.max(0, rim);
    }
  }

  return displacement;
};

export interface TerrainSample {
  height: number;
}

export const sampleTerrainHeight = (
  direction: Vector3Like,
  terrain: RockyTerrainDetail,
  seed: number,
  craters: readonly Crater[],
): TerrainSample => {
  const continentalScale = clamp01(terrain.continentalScale);
  const fragmentation = clamp01(terrain.continentalFragmentation);
  const oceanCoverage = clamp01(terrain.oceanCoverage);
  const mountainCoverage = clamp01(terrain.mountainCoverage);
  const mountainHeight = clamp01(terrain.mountainHeight);
  const roughness = clamp01(terrain.terrainRoughness);
  const erosion = clamp01(terrain.erosionAmount);

  const macroFrequency = lerp(0.7, 2.6, continentalScale);
  const warped = domainWarp3(
    direction.x * macroFrequency,
    direction.y * macroFrequency,
    direction.z * macroFrequency,
    seed,
    lerp(0.35, 1.3, fragmentation),
  );
  const continentField = (fbm3(warped.x, warped.y, warped.z, seed + 1, { octaves: 4 }) + 1) / 2;
  const threshold = lerp(0.28, 0.72, oceanCoverage);
  const continentMask = smoothstep(threshold - 0.1, threshold + 0.1, continentField);
  const macro = (continentField - threshold) * 2;

  const regionalFrequency = macroFrequency * 3.4;
  const ridgedRegional = ridged3(
    direction.x * regionalFrequency,
    direction.y * regionalFrequency,
    direction.z * regionalFrequency,
    seed + 2,
    { octaves: 4 },
  );
  const smoothedRegional = fbm3(
    direction.x * regionalFrequency,
    direction.y * regionalFrequency,
    direction.z * regionalFrequency,
    seed + 2,
    { octaves: 3 },
  );
  const regional =
    lerp(ridgedRegional, smoothedRegional, erosion) *
    mountainHeight *
    mountainCoverage *
    continentMask;

  const localFrequency = regionalFrequency * 3.1;
  const local =
    ridged3(
      direction.x * localFrequency,
      direction.y * localFrequency,
      direction.z * localFrequency,
      seed + 3,
      {
        octaves: 3,
      },
    ) *
    0.35 *
    lerp(0.3, 1, mountainCoverage) *
    continentMask;

  const smallFrequency = localFrequency * 3.7;
  const small =
    fbm3(
      direction.x * smallFrequency,
      direction.y * smallFrequency,
      direction.z * smallFrequency,
      seed + 4,
      {
        octaves: 3,
      },
    ) *
    0.18 *
    roughness;

  const craterDisplacement = evaluateCraters(direction, craters);

  const height = macro * 0.85 + regional + local + small + craterDisplacement;

  return { height: Number.isFinite(height) ? height : 0 };
};
