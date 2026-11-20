import { siteBearing } from "./surface-landing.ts";
import type { SurfaceGeology, TerrainArchetype } from "./surface-geology.ts";

export interface TerrainSample {
  regolith: number;
  scarp: number;
  frost: number;
  molten: number;
  height: number;
  province: number;
}

export const createTerrainSample = (): TerrainSample => ({
  frost: 0,
  height: 0,
  molten: 0,
  province: 0,
  regolith: 0,
  scarp: 0,
});

const clamp01 = (value: number): number =>
  Number.isFinite(value) ? (value < 0 ? 0 : value > 1 ? 1 : value) : 0;

const smoothstep = (edge0: number, edge1: number, value: number): number => {
  if (edge0 === edge1) return value < edge0 ? 0 : 1;
  const t = clamp01((value - edge0) / (edge1 - edge0));
  return t * t * (3 - 2 * t);
};

const lerp = (a: number, b: number, t: number): number => a + (b - a) * t;

const hash2 = (xi: number, zi: number, seed: number): number => {
  let h =
    (Math.imul(xi, 374_761_393) + Math.imul(zi, 668_265_263) + Math.imul(seed, 1_442_695_041)) | 0;
  h = Math.imul(h ^ (h >>> 13), 1_274_126_177);
  h ^= h >>> 16;
  return h >>> 0;
};

const fade = (t: number): number => t * t * t * (t * (t * 6 - 15) + 10);

const gradients = Array.from({ length: 8 }, (_, index) => {
  const angle = index * 0.785_398_163;
  return { x: Math.cos(angle), z: Math.sin(angle) };
});

const gradientNoise = (x: number, z: number, seed: number): number => {
  const x0 = Math.floor(x);
  const z0 = Math.floor(z);
  const dx = x - x0;
  const dz = z - z0;
  const u = fade(dx);
  const v = fade(dz);

  const dot = (xi: number, zi: number, fx: number, fz: number): number => {
    const gradient = gradients[hash2(xi, zi, seed) & 7]!;
    return gradient.x * fx + gradient.z * fz;
  };

  const n00 = dot(x0, z0, dx, dz);
  const n10 = dot(x0 + 1, z0, dx - 1, dz);
  const n01 = dot(x0, z0 + 1, dx, dz - 1);
  const n11 = dot(x0 + 1, z0 + 1, dx - 1, dz - 1);
  return lerp(lerp(n00, n10, u), lerp(n01, n11, u), v) * 1.41;
};

const fbm = (x: number, z: number, seed: number, octaves: number, gain = 0.5): number => {
  let amplitude = 1;
  let frequency = 1;
  let sum = 0;
  let normalization = 0;
  for (let octave = 0; octave < octaves; octave += 1) {
    sum += amplitude * gradientNoise(x * frequency, z * frequency, seed + octave * 131);
    normalization += amplitude;
    amplitude *= gain;
    frequency *= 2.03;
  }
  return normalization > 0 ? sum / normalization : 0;
};

const craterLayer = (
  x: number,
  z: number,
  seed: number,
  cellSize: number,
  density: number,
  depthScale: number,
): number => {
  if (density <= 0) return 0;
  const gx = x / cellSize;
  const gz = z / cellSize;
  const xi = Math.floor(gx);
  const zi = Math.floor(gz);
  let displacement = 0;

  for (let ox = -1; ox <= 1; ox += 1) {
    for (let oz = -1; oz <= 1; oz += 1) {
      const cx = xi + ox;
      const cz = zi + oz;
      const h = hash2(cx, cz, seed);
      if ((h & 0xff) / 255 > density) continue;

      const sizeRoll = ((h >>> 8) & 0xff) / 255;
      const radius = cellSize * (0.16 + sizeRoll * sizeRoll * 0.33);
      const centerX = (cx + 0.5 + ((((h >>> 16) & 0xff) / 255) * 2 - 1) * 0.42) * cellSize;
      const centerZ = (cz + 0.5 + ((((h >>> 24) & 0xff) / 255) * 2 - 1) * 0.42) * cellSize;
      const dx = x - centerX;
      const dz = z - centerZ;
      const distance = Math.sqrt(dx * dx + dz * dz) / radius;
      if (distance > 2.2) continue;

      const rough = gradientNoise(x * 0.35, z * 0.35, seed + (h & 0xffff));
      const depth = depthScale * radius * (0.28 - sizeRoll * 0.09);
      const bowl = 1 - smoothstep(0.25 + sizeRoll * 0.25, 0.95, distance);
      const rim = smoothstep(0.57, 0.99, distance) * (1 - smoothstep(1, 1.48, distance));
      const ejecta = smoothstep(0.86, 1.08, distance) * (1 - smoothstep(1.16, 2.2, distance));
      const peak = smoothstep(0.72, 1, sizeRoll) * (1 - smoothstep(0, 0.24, distance));
      displacement +=
        depth *
        (-bowl + rim * (0.52 + rough * 0.16) + ejecta * (0.11 + rough * 0.09) + peak * 0.62);
    }
  }

  return displacement;
};

interface Massif {
  x: number;
  z: number;
  width: number;
  length: number;
  height: number;
  angle: number;
}

function makeMassifs(seed: number): Massif[] {
  const roll = (index: number, lane: number) => hash2(index, lane, seed) / 4294967296;
  const make = (
    x: number,
    z: number,
    width: number,
    length: number,
    height: number,
    i: number,
  ) => ({
    x,
    z,
    width: width * (0.82 + 0.38 * roll(i, 1)),
    length: length * (0.85 + 0.4 * roll(i, 2)),
    height: height * (0.76 + 0.47 * roll(i, 3)),
    angle: roll(i, 4) * Math.PI * 2,
  });
  const massifs = [
    make(-22 + roll(0, 0) * 7, 56, 14, 19, 17, 0),
    make(23 + roll(1, 0) * 13, 88, 22, 34, 28, 1),
    make(-27 + roll(2, 0) * 19, 162, 24, 40, 36, 2),
    make(-62, 109, 32, 47, 38, 3),
  ];
  for (let i = 4; i < 39; i++) {
    const angle = roll(i, 5) * Math.PI * 2;
    const distance = 57 + 207 * roll(i, 6);
    const foreground = Math.sin(angle) > 0 && Math.abs(Math.cos(angle)) < 0.53 && distance < 177;
    const scale = (0.44 + 1.58 * roll(i, 7)) * (foreground ? 0.49 : 1);
    massifs.push(
      make(
        Math.cos(angle) * distance,
        Math.sin(angle) * distance,
        17 * scale,
        23 * scale,
        (9 + distance * 0.1) * scale,
        i,
      ),
    );
  }
  return massifs;
}

export interface TerrainField {
  geology: SurfaceGeology;
  height: (x: number, z: number) => number;
  sample: (x: number, z: number, out: TerrainSample) => TerrainSample;
}

export function createTerrainField(geology: SurfaceGeology): TerrainField {
  const { seed, provinces } = geology;
  if (provinces.length === 0) {
    const flat = { ...createTerrainSample(), regolith: 1 };
    return { geology, height: () => 0, sample: (_x, _z, out) => Object.assign(out, flat) };
  }
  const yaw = siteBearing(seed);
  const sin = Math.sin(yaw);
  const cos = Math.cos(yaw);
  const massifs = makeMassifs(seed);
  const scale = Math.min(1.6, Math.max(0.72, geology.featureScale));
  const uplift = Math.min(1.5, Math.max(0.45, geology.relief / 4));
  const phase = (hash2(3, 7, seed) / 4294967296) * 12;
  const ordered = provinces
    .map((p, index) => ({ ...p, index }))
    .sort((a, b) => b.weight - a.weight);
  const total = ordered.reduce((sum, p) => sum + p.weight, 0) || 1;
  const blendWidths = ordered.map((p, i) =>
    Math.min(0.055, (0.49 * Math.min(p.weight, ordered[i + 1]?.weight ?? 0)) / total),
  );
  const first = createTerrainSample(),
    next = createTerrainSample();

  function sample(worldX: number, worldZ: number, out: TerrainSample): TerrainSample {
    const x = (worldX * cos + worldZ * sin) / scale;
    const z = (worldX * sin - worldZ * cos) / scale;
    const regional = fbm(x * 0.017 + 2.7, z * 0.017, seed, 3);
    const detail = fbm(x * 0.082, z * 0.082 + 8.1, seed + 7, 3);
    const drainage = fbm(x * 0.042, z * 0.042, seed + 19, 3);
    const braid =
      5 * Math.sin(z * 0.049 + phase) + 2.6 * Math.sin(z * 0.112 - phase) + regional * 3;

    // The landing opens into the dominant province. Other provinces cross the route beyond it.
    const apron =
      1 - smoothstep(10, 55, Math.abs(x) - Math.max(0, z) * 0.3 + Math.max(0, -z) * 0.68);
    const territory = clamp01(
      (0.51 + fbm(x * 0.021, z * 0.021, seed + 901, 2) * 0.9) * (1 - apron),
    );
    let index = 0,
      limit = ordered[0]!.weight / total;
    while (index + 1 < ordered.length && territory > limit + blendWidths[index]!) {
      index++;
      limit += ordered[index]!.weight / total;
    }

    function shape(kind: TerrainArchetype, result: TerrainSample) {
      result.height = regional * 1.2 + detail * 0.22;
      result.regolith = 0.65 + regional * 0.25;
      result.scarp = 0;
      result.frost = 0;
      result.molten = 0;
      let relief = 0;
      if (kind === "dune-sea" || geology.medium === "cloud") {
        if (geology.medium === "cloud") {
          const billow = fbm(x * 0.036 + regional * 1.7, z * 0.029, seed + 41, 5);
          const bank = smoothstep(-0.22, 0.55, regional + billow * 0.36);
          result.height = 12 * regional + 18 * bank + billow * (5 + 9 * bank);
          result.regolith = bank;
          result.scarp = clamp01(0.5 - billow);
        } else {
          const wind = x * 0.74 + z * 0.48;
          const cross = z * 0.75 - x * 0.47;
          const angle = wind * 0.193 + 1.8 * Math.sin(cross * 0.057 + phase) + regional * 3.6;
          const t = angle / (2 * Math.PI) - Math.floor(angle / (2 * Math.PI));
          const stoss = smoothstep(0, 0.79, t);
          const slip = 1 - smoothstep(0.79, 1, t);
          const envelope =
            0.36 + smoothstep(-0.35, 0.47, regional + 0.25 * Math.sin(cross * 0.037));
          result.height += (stoss * slip - 0.25) * (6.8 + 7 * smoothstep(10, 85, z)) * envelope;
          result.regolith = 0.98;
          result.scarp = smoothstep(0.79, 0.85, t) * (1 - smoothstep(0.93, 1, t)) * 0.17;
        }
      } else if (kind === "fractured-ice" || kind === "glacial-plain" || kind === "salt-pan") {
        const shear = x - braid + z * 0.29;
        const seam = Math.min(Math.abs(shear - 8), Math.abs(shear + 22 + regional * 6));
        const joint = 1 - smoothstep(0.25, 2.7, seam);
        const ridge = Math.exp(-(((seam - 3.7) / 2.25) ** 2));
        const raft = fbm((x + z * 0.35) * 0.048, z * 0.011, seed + 56, 3);
        const compression = kind === "fractured-ice" ? 1 : kind === "glacial-plain" ? 0.53 : 0.12;
        result.height += (ridge * (2.3 + drainage * 2.8) - joint * 1.5 + raft * 2.7) * compression;
        result.frost = clamp01(0.92 - joint * 0.74 + ridge * 0.12);
        result.scarp = clamp01(joint + ridge * 0.28);
        result.regolith = 0.24;
      } else if (kind === "impact-highlands" || kind === "regolith-plain") {
        const distance = Math.hypot((x + 4) / 32, (z - 32) / 36) + drainage * 0.065;
        const crater = 1 - smoothstep(0.55, 1, distance);
        const rim = Math.exp(-(((distance - 1.02) / 0.14) ** 2));
        const highland = smoothstep(0.15, 0.52, regional) * 8;
        const age = kind === "impact-highlands" ? 1 : 0.32;
        result.height +=
          age * (-8.6 * crater + rim * (3.3 + detail * 1.8) + highland) +
          craterLayer(x, z, seed + 13, 24, geology.craterDensity, 1.45) +
          craterLayer(x, z, seed + 26, 5.6, geology.craterDensity * 0.85, 0.9);
        result.scarp = clamp01(rim + highland * 0.09);
        result.regolith = 0.78 - result.scarp * 0.45;
      } else {
        const volcanic =
          kind === "lava-fields" || kind === "volcanic-shield" || kind === "flood-basalt";
        const alpine = kind === "folded-mountains" || kind === "coastal-shelf";
        for (const m of massifs) {
          const dx = (x - m.x) / m.width,
            dz = (z - m.z) / m.length;
          if (Math.abs(dx) > 2.2 || Math.abs(dz) > 2.2) continue;
          const theta = Math.atan2(dz, dx);
          const lobes = 0.12 * Math.cos(theta * 3 + m.angle) + 0.08 * Math.sin(theta * 5 - m.angle);
          const radius = Math.hypot(dx, dz) * (1 + lobes) + drainage * 0.19 + detail * 0.05;
          let profile: number;
          if (alpine) {
            const buttress = 0.16 * Math.cos(theta * 6 + m.angle + regional * 2);
            profile =
              Math.max(0, 1 - Math.max(0, radius + buttress * Math.min(1, radius)) / 1.85) ** 1.67;
            profile *= (1.38 + 0.26 * drainage) * (kind === "coastal-shelf" ? 0.6 : 1);
          } else if (volcanic) {
            profile =
              Math.max(0, 1 - radius / 1.7) ** 1.45 - (1 - smoothstep(0.21, 0.48, radius)) * 0.42;
          } else {
            const pediment = (1 - smoothstep(0.46, 1.55, radius)) * 0.27;
            const cliff = (1 - smoothstep(0.52, 0.73, radius)) * 0.57;
            const cap = (1 - smoothstep(0.4, 0.54, radius)) * 0.17;
            const flute = Math.abs(Math.sin(theta * 7 + m.angle + drainage * 2.9));
            profile =
              (pediment + cliff + cap) * (1 - 0.21 * flute * smoothstep(0.12, 0.64, radius));
            profile += (1 - smoothstep(0.08, 0.36, radius + 0.13 * flute)) * 0.19;
          }
          relief = Math.max(relief, m.height * profile);
        }
        result.height += relief * 0.77;
        if (alpine) {
          const valley = 1 - smoothstep(2, 13, Math.abs(x - braid + z * 0.12));
          result.height += 2.4 - valley * 5.2 + drainage * (1.1 + relief * 0.23);
          result.scarp = smoothstep(2.5, 16, relief);
          result.frost = smoothstep(17, 36, relief + 8 * drainage);
        } else if (volcanic) {
          const fault = Math.abs(x - braid - 2.5 - z * 0.12);
          const crust = smoothstep(1.7, 3.8, fault);
          const levee = Math.exp(-(((fault - 4.5) / 2.8) ** 2));
          const channelFloor = z * 0.018 - 1.35 + regional * 0.3;
          result.height = lerp(channelFloor, result.height + levee * 1.5 + detail * 0.9, crust);
          result.molten = kind === "flood-basalt" ? 0 : (1 - crust) * geology.lavaGlow;
          result.scarp = clamp01(0.68 + drainage - regional * 0.42 + levee * 0.4);
          result.regolith = clamp01(0.23 + regional * 0.88 + 0.28 * crust);
        } else {
          const wash = 1 - smoothstep(2, 9, Math.abs(x - braid));
          result.height += drainage * (1.4 + relief * 0.055) - wash * 1.6;
          result.scarp = smoothstep(2, 10, relief);
          result.regolith = clamp01(0.7 + wash * 0.2 - result.scarp * 0.51);
        }
      }
      result.height *= uplift;
      result.frost *= smoothstep(0, 0.25, geology.frostCoverage);
    }

    const primary = ordered[index]!;
    shape(primary.archetype, first);
    Object.assign(out, first);
    out.province = primary.index;
    const secondary = ordered[index + 1];
    const width = blendWidths[index]!;
    if (secondary && territory > limit - width) {
      const t = smoothstep(limit - width, limit + width, territory);
      shape(secondary.archetype, next);
      out.height = lerp(first.height, next.height, t);
      out.regolith = lerp(first.regolith, next.regolith, t);
      out.scarp = lerp(first.scarp, next.scarp, t);
      out.frost = lerp(first.frost, next.frost, t);
      out.molten = lerp(first.molten, next.molten, t);
      if (t > 0.5) out.province = secondary.index;
    }
    return out;
  }
  const scratch = createTerrainSample();
  return { geology, sample, height: (x, z) => sample(x, z, scratch).height };
}
