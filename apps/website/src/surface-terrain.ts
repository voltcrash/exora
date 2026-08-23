import type { SurfaceGeology, TerrainArchetype } from "./surface-geology.ts";

/**
 * The shape of the ground under a visitor's feet, one landform province at a time.
 *
 * What this replaces was a single fractal-noise hill field scaled by three recipe numbers, which
 * is why every world's vista read as the same landscape in a different colour. Real ground is not
 * one process: it is whichever processes have run on that body and left something behind. An
 * airless world keeps its crater record because nothing erases it; a windy dry one buries its
 * craters under dunes and carves what is left into yardangs; a volcanic one paves itself flat and
 * cracks the pavement; an ice world barely has relief at all.
 *
 * So the ground here is built province by province. A seeded cellular map divides the vista into
 * territories, each territory gets one of the archetypes the world's geology allows, and the
 * boundaries between them blend over a few metres. Standing in one spot you are in a dune sea; a
 * few hundred metres away the dunes lap against a canyon rim.
 *
 * Everything is a pure function of position, geology and seed — no RNG state, no allocation in the
 * sampling path — so the same world builds the same ground on every visit, and the mesh builder
 * can call it a hundred thousand times without producing garbage.
 */

/** Material channels a point of ground carries, alongside its height. */
export interface TerrainSample {
  /** Loose fines resting on the surface, 0-1. */
  regolith: number;
  /** Freshly exposed rock face, 0-1 — steep ground and scarps, where fines cannot stay. */
  scarp: number;
  /** Frost, snow or evaporite, 0-1. */
  frost: number;
  /** Molten or incandescent ground, 0-1. */
  molten: number;
  /** Height in scene units, relative to the vista's own datum. */
  height: number;
  /** Which entry of `geology.provinces` dominates here. */
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

/** Deterministic 32-bit hash of two integer lattice coordinates plus a seed. Integer-only, so it
 * is exact on every engine — the `sin(dot(...)) * 43758.5` idiom the old field used drifts between
 * GPUs and CPUs and repeats visibly along the axes. */
const hash2 = (xi: number, zi: number, seed: number): number => {
  let h =
    (Math.imul(xi, 374_761_393) + Math.imul(zi, 668_265_263) + Math.imul(seed, 1_442_695_041)) | 0;
  h = Math.imul(h ^ (h >>> 13), 1_274_126_177);
  h ^= h >>> 16;
  return h >>> 0;
};

const fade = (t: number): number => t * t * t * (t * (t * 6 - 15) + 10);

/** Perlin-style gradient noise on a 2D lattice, in roughly [-1, 1]. */
const gradientNoise = (x: number, z: number, seed: number): number => {
  const x0 = Math.floor(x);
  const z0 = Math.floor(z);
  const dx = x - x0;
  const dz = z - z0;
  const u = fade(dx);
  const v = fade(dz);

  const dot = (xi: number, zi: number, fx: number, fz: number): number => {
    // Eight evenly spaced gradient directions, selected by three hash bits.
    const angle = (hash2(xi, zi, seed) & 7) * 0.785_398_163;
    return Math.cos(angle) * fx + Math.sin(angle) * fz;
  };

  const n00 = dot(x0, z0, dx, dz);
  const n10 = dot(x0 + 1, z0, dx - 1, dz);
  const n01 = dot(x0, z0 + 1, dx, dz - 1);
  const n11 = dot(x0 + 1, z0 + 1, dx - 1, dz - 1);
  return lerp(lerp(n00, n10, u), lerp(n01, n11, u), v) * 1.41;
};

/** Layered gradient noise, normalized to roughly [-1, 1]. */
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

/** Ridged multifractal: folds noise around zero so crest lines read as ridges rather than bumps. */
const ridged = (x: number, z: number, seed: number, octaves: number, gain = 0.5): number => {
  let amplitude = 1;
  let frequency = 1;
  let sum = 0;
  let normalization = 0;
  let weight = 1;
  for (let octave = 0; octave < octaves; octave += 1) {
    let value = 1 - Math.abs(gradientNoise(x * frequency, z * frequency, seed + octave * 197));
    value *= value * weight;
    weight = clamp01(value * 2.1);
    sum += amplitude * value;
    normalization += amplitude;
    amplitude *= gain;
    frequency *= 2.07;
  }
  return normalization > 0 ? sum / normalization : 0;
};

/**
 * Cellular distances over a jittered lattice.
 *
 * Returns the nearest and second-nearest feature distances and the nearest cell's hash, which is
 * all three of the things the landforms here need from one evaluation: `f1` for bowls and domes,
 * `f2 - f1` for the walls between cells (canyon networks, ice ridges, salt polygons), and the
 * cell id for giving each cell its own character.
 */
interface CellResult {
  cell: number;
  f1: number;
  f2: number;
}

const cellResult: CellResult = { cell: 0, f1: 0, f2: 0 };

const cellular = (x: number, z: number, seed: number, jitter = 0.85): CellResult => {
  const xi = Math.floor(x);
  const zi = Math.floor(z);
  let f1 = 16;
  let f2 = 16;
  let cell = 0;

  for (let ox = -1; ox <= 1; ox += 1) {
    for (let oz = -1; oz <= 1; oz += 1) {
      const cx = xi + ox;
      const cz = zi + oz;
      const h = hash2(cx, cz, seed);
      const px = cx + 0.5 + (((h & 0xff) / 255) * 2 - 1) * 0.5 * jitter;
      const pz = cz + 0.5 + ((((h >>> 8) & 0xff) / 255) * 2 - 1) * 0.5 * jitter;
      const dx = px - x;
      const dz = pz - z;
      const distance = Math.sqrt(dx * dx + dz * dz);
      if (distance < f1) {
        f2 = f1;
        f1 = distance;
        cell = h;
      } else if (distance < f2) {
        f2 = distance;
      }
    }
  }

  cellResult.cell = cell;
  cellResult.f1 = f1;
  cellResult.f2 = f2;
  return cellResult;
};

/**
 * A field of impact craters at one size class.
 *
 * Real crater populations follow a steep power law — many small, few large — and a real crater is
 * not a dent: it is a parabolic bowl inside a raised, overturned rim, surrounded by an ejecta
 * blanket that thins with distance, and above a threshold diameter it rebounds into a central peak
 * and terraces its own walls. All of that reads at a glance and none of it survives a round dip.
 */
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

      // Power-law sizes: squaring a uniform draw makes large craters rare without ever forbidding
      // one, which is what a real size-frequency distribution looks like.
      const sizeRoll = ((h >>> 8) & 0xff) / 255;
      const radius = cellSize * (0.14 + sizeRoll * sizeRoll * 0.42);
      const centerX = (cx + 0.5 + ((((h >>> 16) & 0xff) / 255) * 2 - 1) * 0.42) * cellSize;
      const centerZ = (cz + 0.5 + ((((h >>> 24) & 0xff) / 255) * 2 - 1) * 0.42) * cellSize;
      const dx = x - centerX;
      const dz = z - centerZ;
      const distance = Math.sqrt(dx * dx + dz * dz) / radius;
      if (distance > 2.4) continue;

      // Rim and floor are roughened by the crater's own hash so no two read as the same stamp.
      const rough = gradientNoise(x * 0.35, z * 0.35, seed + (h & 0xffff)) * 0.12;
      const depth = depthScale * radius * (0.22 - sizeRoll * 0.08);

      if (distance < 0.82) {
        const bowl = 1 - (distance / 0.82) * (distance / 0.82);
        displacement -= depth * bowl * (1 + rough);
        // Complex craters above roughly 15 km rebound; here that is the largest size class.
        if (sizeRoll > 0.72 && distance < 0.26) {
          displacement += depth * 0.85 * (1 - distance / 0.26) ** 1.4;
        }
      } else if (distance < 1.16) {
        // Overturned rim: highest just outside the bowl, falling away on both sides.
        const rim = 1 - Math.abs(distance - 0.95) / 0.21;
        displacement += depth * 0.55 * Math.max(0, rim) * (1 + rough * 2);
      } else {
        // Ejecta blanket, thinning as the inverse cube of range the way real ones do.
        const ejecta = (1 - (distance - 1.16) / 1.24) ** 3;
        displacement += depth * 0.16 * Math.max(0, ejecta) * (0.6 + rough * 3);
      }
    }
  }

  return displacement;
};

/** Multi-scale crater population: three size classes an order of magnitude apart, so a heavily
 * cratered world shows basins with craters inside them and pits inside those. */
const craterField = (x: number, z: number, seed: number, density: number): number =>
  craterLayer(x, z, seed + 11, 62, density * 0.55, 1) +
  craterLayer(x, z, seed + 29, 19, density * 0.72, 0.9) +
  craterLayer(x, z, seed + 53, 5.5, density * 0.85, 0.8) +
  craterLayer(x, z, seed + 71, 1.7, density * 0.6, 0.7);

/** Shared per-sample context so the archetypes below can read the world's own parameters without
 * every one of them taking a dozen arguments. */
interface FieldContext {
  /** Cosine and sine of the prevailing wind, precomputed once. */
  windCos: number;
  windSin: number;
  craterDensity: number;
  erosion: number;
  seed: number;
  /** Horizontal scale multiplier: above 1 the landforms run longer before repeating. */
  featureScale: number;
  strataSpacing: number;
  strataStrength: number;
}

/** Quantizes height into visible bedding planes — the terracing that makes a scarp read as layered
 * rock rather than as a smooth slope. */
const stratify = (height: number, context: FieldContext, amount: number): number => {
  const strength = context.strataStrength * amount;
  if (strength <= 0.001) return height;
  const spacing = Math.max(0.12, context.strataSpacing);
  const stepped = Math.round(height / spacing) * spacing;
  // Soften the step so bedding reads as a bench rather than as a staircase artifact.
  const blend = smoothstep(0, 1, Math.abs(height - stepped) / spacing + 0.35);
  return lerp(height, lerp(stepped, height, blend * 0.55), strength);
};

/**
 * One landform province, evaluated at a point.
 *
 * Each returns a height in roughly [-1, 1] and writes its material channels into `out`; the caller
 * scales the height by the world's measured relief. Keeping them normalized is what lets Europa's
 * 0.9-unit relief and Mars's 4.2 share one set of shapes without either being rewritten.
 */
type ArchetypeField = (x: number, z: number, context: FieldContext, out: TerrainSample) => number;

const impactHighlands: ArchetypeField = (x, z, context, out) => {
  const base = fbm(x * 0.012, z * 0.012, context.seed + 3, 4) * 0.55;
  const craters = craterField(x, z, context.seed, Math.max(0.15, context.craterDensity));
  const height = base + craters * 0.42;
  const rubble = fbm(x * 0.4, z * 0.4, context.seed + 17, 2);
  out.regolith = clamp01(0.62 - craters * 0.5 + rubble * 0.15);
  out.scarp = clamp01(Math.abs(craters) * 0.9);
  out.frost = 0;
  out.molten = 0;
  return height;
};

const regolithPlain: ArchetypeField = (x, z, context, out) => {
  const swell = fbm(x * 0.009, z * 0.009, context.seed + 5, 3) * 0.5;
  const dimples = craterLayer(x, z, context.seed + 91, 4.2, context.craterDensity * 0.5, 0.55);
  // Drift ripples: the centimetre-scale texture that tells the eye it is looking at loose ground.
  const rippleX = x * context.windCos + z * context.windSin;
  const ripple = Math.sin(rippleX * 1.9 + fbm(x * 0.09, z * 0.09, context.seed + 7, 2) * 4) * 0.012;
  out.regolith = clamp01(0.86 + fbm(x * 0.2, z * 0.2, context.seed + 9, 2) * 0.12);
  out.scarp = 0.04;
  out.frost = 0;
  out.molten = 0;
  return swell + dimples * 0.3 + ripple;
};

const floodBasalt: ArchetypeField = (x, z, context, out) => {
  // A lava plain is close to level; what breaks it up is compressional wrinkle ridges and the
  // collapsed roofs of the tubes the lava drained through.
  const plain = fbm(x * 0.008, z * 0.008, context.seed + 13, 3) * 0.16;
  const wrinkleAxis = x * 0.021 + z * 0.006;
  const wrinkle =
    ridged(wrinkleAxis, z * 0.05, context.seed + 23, 3) ** 2.4 *
    (0.35 + fbm(x * 0.01, z * 0.01, context.seed + 31, 2) * 0.3);
  const cell = cellular(x * 0.02, z * 0.02, context.seed + 37, 0.9);
  const channel = smoothstep(0.09, 0.0, cell.f2 - cell.f1) * 0.22;
  const height = plain + wrinkle * 0.5 - channel;
  out.regolith = clamp01(0.35 + channel * 1.6);
  out.scarp = clamp01(wrinkle * 1.4 + channel * 0.8);
  out.frost = 0;
  out.molten = 0;
  return stratify(height, context, 0.35);
};

const duneSea: ArchetypeField = (x, z, context, out) => {
  // Dunes march across the wind, so the profile is measured along the wind axis. Their crests
  // meander, they ride on much larger draa, and their slip faces are steep on the lee side only —
  // that asymmetry is the whole reason a dune reads as a dune and not as a sine wave.
  const along = (x * context.windCos + z * context.windSin) / context.featureScale;
  const across = (-x * context.windSin + z * context.windCos) / context.featureScale;
  const meander = fbm(across * 0.02, along * 0.006, context.seed + 41, 3) * 9;
  const draa = fbm(along * 0.006, across * 0.004, context.seed + 43, 2);
  const wavelength = 13 * (1 + draa * 0.35);
  const phase = ((along + meander) / wavelength) % 1;
  const t = phase < 0 ? phase + 1 : phase;
  // Windward face rises over 72% of the wavelength; the slip face drops over the remaining 28%.
  const profile = t < 0.72 ? (t / 0.72) ** 1.35 : 1 - (t - 0.72) / 0.28;
  const crestBreak = fbm(across * 0.05, along * 0.05, context.seed + 47, 3) * 0.3;
  const height = (profile - 0.45) * (0.72 + draa * 0.4) + draa * 0.45 + crestBreak * 0.12;
  const ripple =
    Math.sin(along * 1.6 + fbm(along * 0.1, across * 0.1, context.seed + 49, 2) * 5) * 0.01;
  out.regolith = 1;
  out.scarp = clamp01((t > 0.74 && t < 0.98 ? 0.35 : 0) * 0.6);
  out.frost = 0;
  out.molten = 0;
  return height + ripple;
};

const yardangBadlands: ArchetypeField = (x, z, context, out) => {
  // Wind cuts parallel to itself, so the ridges are long along the wind and narrow across it.
  const along = (x * context.windCos + z * context.windSin) / context.featureScale;
  const across = (-x * context.windSin + z * context.windCos) / context.featureScale;
  const warpX = fbm(across * 0.03, along * 0.008, context.seed + 59, 2) * 3;
  const carve = ridged(across * 0.11 + warpX * 0.05, along * 0.014, context.seed + 61, 4);
  const platform = fbm(along * 0.007, across * 0.009, context.seed + 67, 3) * 0.5;
  const raw = platform + (carve ** 1.6 - 0.3) * 0.85;
  const height = stratify(raw, context, 1);
  const flank = clamp01((1 - carve) * 1.5);
  out.regolith = clamp01(0.3 + flank * 0.5);
  out.scarp = clamp01(carve * 1.2);
  out.frost = 0;
  out.molten = 0;
  return height;
};

const canyonRift: ArchetypeField = (x, z, context, out) => {
  // A canyon system is a network, not a trench: cell walls give branching, and the cut deepens
  // toward the trunk. The walls terrace as they expose successive beds, and the floor collects
  // the landslide aprons that came off them.
  const scale = 0.0075 / context.featureScale;
  const warpX = fbm(x * 0.004, z * 0.004, context.seed + 71, 2) * 40;
  const warpZ = fbm(x * 0.004 + 5.1, z * 0.004 - 3.7, context.seed + 73, 2) * 40;
  const cell = cellular((x + warpX) * scale, (z + warpZ) * scale, context.seed + 79, 0.95);
  const edge = cell.f2 - cell.f1;
  const plateau = fbm(x * 0.006, z * 0.006, context.seed + 83, 3) * 0.34 + 0.42;
  // `edge` is near zero on the network's lines and grows into the blocks between them.
  const cut = 1 - smoothstep(0, 0.42, edge);
  const depth = cut ** 1.7;
  const floorNoise = fbm(x * 0.05, z * 0.05, context.seed + 89, 3) * 0.06;
  const talus = smoothstep(0.06, 0.3, edge) * (1 - smoothstep(0.3, 0.5, edge)) * 0.12;
  const height = stratify(plateau - depth * 1.35 + talus, context, 0.9) + floorNoise * depth;
  out.regolith = clamp01(0.25 + depth * 0.55);
  out.scarp = clamp01(smoothstep(0.02, 0.24, edge) * (1 - smoothstep(0.24, 0.48, edge)) * 1.6);
  out.frost = 0;
  out.molten = 0;
  return height;
};

const volcanicShield: ArchetypeField = (x, z, context, out) => {
  // Shields are enormously wide for their height, which is what makes them read as volcanoes
  // rather than as cones: a summit caldera, flanks under two degrees, and fissures radiating out.
  const scale = 0.0055 / context.featureScale;
  const cell = cellular(x * scale, z * scale, context.seed + 97, 0.75);
  const size = 0.55 + ((cell.cell >>> 12) & 0xff) / 255;
  const radial = cell.f1 / size;
  const flank = Math.exp(-(radial * radial) * 2.4);
  const caldera = smoothstep(0.2, 0.05, radial) * 0.55;
  const fissures = ridged(x * 0.05, z * 0.05, context.seed + 101, 3) ** 3 * flank * 0.3;
  const apron = fbm(x * 0.02, z * 0.02, context.seed + 103, 3) * 0.16;
  const height = flank * 0.95 - caldera * flank + fissures + apron - 0.3;
  out.regolith = clamp01(0.55 - flank * 0.3);
  out.scarp = clamp01(caldera * 1.4 + fissures * 2);
  out.frost = 0;
  out.molten = 0;
  return height;
};

const lavaFields: ArchetypeField = (x, z, context, out) => {
  // Cooled crust breaks into plates that ride on what is still molten below; the light comes up
  // through the gaps between them, not off their surfaces.
  const cell = cellular(x * 0.035, z * 0.035, context.seed + 107, 0.95);
  const edge = cell.f2 - cell.f1;
  const plate = ((cell.cell >>> 7) & 0xff) / 255;
  const crack = 1 - smoothstep(0, 0.11, edge);
  const surface = fbm(x * 0.06, z * 0.06, context.seed + 109, 3) * 0.12;
  const ropey = Math.sin(cell.f1 * 34 + plate * 8) * 0.02 * (1 - crack);
  const vents = smoothstep(
    0.72,
    0.94,
    fbm(x * 0.014, z * 0.014, context.seed + 113, 3) * 0.5 + 0.5,
  );
  const height = (plate - 0.5) * 0.22 + surface - crack * 0.16 - vents * 0.25 + ropey;
  out.regolith = clamp01(0.2 + (1 - crack) * 0.2);
  out.scarp = clamp01(crack * 1.2);
  out.frost = 0;
  out.molten = clamp01(crack * 0.85 + vents * 0.9);
  return height;
};

const glacialPlain: ArchetypeField = (x, z, context, out) => {
  // Ice flows, so its plains are broad and smooth; what breaks them is sublimation eating pits
  // into the surface and wind sculpting sastrugi across it.
  const swell = fbm(x * 0.007, z * 0.007, context.seed + 127, 3) * 0.55;
  const cell = cellular(x * 0.06, z * 0.06, context.seed + 131, 0.8);
  const pit = smoothstep(0.42, 0.06, cell.f1) * 0.16;
  const along = x * context.windCos + z * context.windSin;
  const sastrugi =
    ridged(
      along * 0.5,
      (-x * context.windSin + z * context.windCos) * 0.06,
      context.seed + 137,
      2,
    ) * 0.035;
  const nunatak = smoothstep(
    0.78,
    0.95,
    fbm(x * 0.01, z * 0.01, context.seed + 139, 3) * 0.5 + 0.5,
  );
  const height = swell - pit + sastrugi + nunatak * 0.5;
  out.regolith = clamp01(0.25 + pit * 2);
  out.scarp = clamp01(nunatak * 1.6 + pit * 1.4);
  out.frost = clamp01(1 - nunatak * 1.4);
  out.molten = 0;
  return height;
};

const fracturedIce: ArchetypeField = (x, z, context, out) => {
  // Europa's signature: paired ridges with a groove down the middle, crossing an almost level
  // plain, with blocks of crust rafted out of place where the shell broke through.
  const scale = 0.02 / context.featureScale;
  const warpX = fbm(x * 0.006, z * 0.006, context.seed + 149, 2) * 18;
  const cell = cellular((x + warpX) * scale, z * scale, context.seed + 151, 0.9);
  const edge = cell.f2 - cell.f1;
  // Two ridges either side of the groove: the double-ridge profile the flybys resolved.
  const ridgePair =
    Math.exp(-(((edge - 0.055) / 0.035) ** 2)) - Math.exp(-((edge / 0.03) ** 2)) * 0.55;
  const secondary = cellular(x * scale * 3.1 + 7.3, z * scale * 3.1, context.seed + 157, 0.9);
  const hairline = Math.exp(-(((secondary.f2 - secondary.f1) / 0.05) ** 2)) * 0.22;
  const chaos = smoothstep(0.68, 0.9, fbm(x * 0.012, z * 0.012, context.seed + 163, 3) * 0.5 + 0.5);
  const raft = chaos * (((cell.cell >>> 5) & 0xff) / 255 - 0.5) * 0.9;
  const plain = fbm(x * 0.02, z * 0.02, context.seed + 167, 3) * 0.12;
  out.regolith = clamp01(0.3 + chaos * 0.3);
  out.scarp = clamp01(Math.abs(ridgePair) * 1.6 + chaos * 0.8);
  out.frost = clamp01(0.9 - chaos * 0.4);
  out.molten = 0;
  return plain + ridgePair * 0.8 + hairline * 0.3 + raft;
};

const foldedMountains: ArchetypeField = (x, z, context, out) => {
  // Uplift makes ridge lines; erosion cuts valleys back into them and dumps the debris as talus
  // fans at their feet. Blending the ridged field toward a smooth one by the world's own erosion
  // is what separates a young, sharp range from an old, rounded one.
  const scale = 0.011 / context.featureScale;
  const warpX = fbm(x * 0.004, z * 0.004, context.seed + 173, 2) * 26;
  const warpZ = fbm(x * 0.004 - 8.2, z * 0.004 + 2.9, context.seed + 179, 2) * 26;
  const sharp = ridged((x + warpX) * scale, (z + warpZ) * scale, context.seed + 181, 5, 0.52);
  const rounded = fbm((x + warpX) * scale, (z + warpZ) * scale, context.seed + 181, 4) * 0.5 + 0.5;
  const relief = lerp(sharp, rounded, context.erosion * 0.7);
  const massif = fbm(x * 0.0035, z * 0.0035, context.seed + 191, 2) * 0.5 + 0.5;
  const peak = relief ** 1.35 * (0.35 + massif * 0.95);
  // Talus: loose debris banked against the lower slopes, filling in the sharpest lows.
  const talus = (1 - relief) ** 2 * 0.18 * (0.4 + context.erosion);
  const detail = fbm(x * 0.09, z * 0.09, context.seed + 193, 3) * 0.05 * relief;
  out.regolith = clamp01(0.2 + talus * 3 + (1 - relief) * 0.35);
  out.scarp = clamp01(relief * 1.35);
  out.frost = clamp01((peak - 0.55) * 2.2);
  out.molten = 0;
  return peak * 1.4 + talus + detail - 0.45;
};

const coastalShelf: ArchetypeField = (x, z, context, out) => {
  // Ground beside standing liquid: headlands, a shelving beach, and the benches a shoreline cuts
  // when it stands at one level long enough.
  const swell = fbm(x * 0.006, z * 0.006, context.seed + 197, 4) * 0.9;
  const headland = ridged(x * 0.014, z * 0.014, context.seed + 199, 3) ** 2 * 0.45;
  const height = swell + headland - 0.18;
  // Wave-cut benches cluster within a shallow band of the datum, where the liquid actually works.
  const nearDatum = 1 - smoothstep(0, 0.28, Math.abs(height));
  const bench = nearDatum * Math.round(height / 0.06) * 0.06 * 0.5;
  out.regolith = clamp01(0.4 + nearDatum * 0.5);
  out.scarp = clamp01(headland * 1.8);
  out.frost = 0;
  out.molten = 0;
  return lerp(height, bench + height * 0.5, nearDatum * 0.5);
};

const saltPan: ArchetypeField = (x, z, context, out) => {
  // Dead level, and crazed into polygons as the last of the liquid left it.
  const cell = cellular(x * 0.16, z * 0.16, context.seed + 211, 0.7);
  const edge = cell.f2 - cell.f1;
  const rim = Math.exp(-((edge / 0.045) ** 2)) * 0.035;
  const coarse = cellular(x * 0.03, z * 0.03, context.seed + 223, 0.7);
  const coarseRim = Math.exp(-(((coarse.f2 - coarse.f1) / 0.05) ** 2)) * 0.05;
  const basin = fbm(x * 0.005, z * 0.005, context.seed + 227, 2) * 0.09;
  out.regolith = clamp01(0.7 - rim * 6);
  out.scarp = clamp01((rim + coarseRim) * 8);
  out.frost = clamp01(0.55 + basin * 2);
  out.molten = 0;
  return basin + rim + coarseRim;
};

const ARCHETYPE_FIELDS: Readonly<Record<TerrainArchetype, ArchetypeField>> = {
  "canyon-rift": canyonRift,
  "coastal-shelf": coastalShelf,
  "dune-sea": duneSea,
  "flood-basalt": floodBasalt,
  "folded-mountains": foldedMountains,
  "fractured-ice": fracturedIce,
  "glacial-plain": glacialPlain,
  "impact-highlands": impactHighlands,
  "lava-fields": lavaFields,
  "regolith-plain": regolithPlain,
  "salt-pan": saltPan,
  "volcanic-shield": volcanicShield,
  "yardang-badlands": yardangBadlands,
};

export interface TerrainField {
  geology: SurfaceGeology;
  /** Height alone, for callers that only need to stand something on the ground. */
  height: (x: number, z: number) => number;
  /** Height plus material channels, written into the caller's own sample to avoid allocating. */
  sample: (x: number, z: number, out: TerrainSample) => TerrainSample;
}

/**
 * How large a share of the vista's relief is allowed near the viewer.
 *
 * A vista wants a foreground you can see across, a middle distance with landforms in it, and a
 * horizon with the tallest ground on it — which is also how a real landing site looks, because
 * you cannot see the mountain you are standing on. Beyond that it keeps the host star clear of
 * the ridge line: the sun here sits a few degrees up, and terrain free to raise a peak beside the
 * viewer would put it in front of the sun.
 */
const nearFieldRelief = (radius: number): number => 0.34 + smoothstep(5, 105, radius) * 0.66;

const primarySample = createTerrainSample();
const secondarySample = createTerrainSample();

export const createTerrainField = (geology: SurfaceGeology): TerrainField => {
  const provinceList = geology.provinces.length > 0 ? geology.provinces : [];
  const context: FieldContext = {
    craterDensity: geology.craterDensity,
    erosion: clamp01(1 - geology.strataStrength * 0.4),
    featureScale: Math.max(0.35, geology.featureScale),
    seed: geology.seed | 0,
    strataSpacing: geology.strataSpacing,
    strataStrength: geology.strataStrength,
    windCos: Math.cos(geology.windDirection),
    windSin: Math.sin(geology.windDirection),
  };

  // Cumulative province weights, so a cell's hash picks a province in proportion to its share.
  const cumulative: number[] = [];
  let running = 0;
  for (const province of provinceList) {
    running += province.weight;
    cumulative.push(running);
  }
  const total = running > 0 ? running : 1;

  const provinceAt = (hash: number): number => {
    const roll = ((hash >>> 3) & 0xffff) / 65_536;
    const target = roll * total;
    for (let index = 0; index < cumulative.length; index += 1) {
      if (target <= (cumulative[index] ?? 0)) return index;
    }
    return Math.max(0, cumulative.length - 1);
  };

  // Province territories are large — a vista should hold two or three of them, not twenty — and
  // their boundaries are warped so no one ever sees the lattice they came from.
  const territoryScale = 0.0125 / Math.max(0.35, geology.featureScale);

  const sample = (x: number, z: number, out: TerrainSample): TerrainSample => {
    if (provinceList.length === 0) {
      out.height = 0;
      out.frost = 0;
      out.molten = 0;
      out.province = 0;
      out.regolith = 1;
      out.scarp = 0;
      return out;
    }

    const warpX = fbm(x * 0.0035, z * 0.0035, context.seed + 907, 2) * 62;
    const warpZ = fbm(x * 0.0035 + 12.7, z * 0.0035 - 4.3, context.seed + 911, 2) * 62;
    const territory = cellular(
      (x + warpX) * territoryScale,
      (z + warpZ) * territoryScale,
      context.seed + 919,
      0.95,
    );
    const primaryIndex = provinceAt(territory.cell);
    // The neighbouring territory, reached by stepping across the boundary the cell map already
    // found, so the blend runs between the two provinces that actually meet here.
    const boundary = territory.f2 - territory.f1;
    const blend = 1 - smoothstep(0.02, 0.16, boundary);
    const neighbourIndex = provinceAt(
      hash2(
        Math.round(x * territoryScale * 4),
        Math.round(z * territoryScale * 4),
        context.seed + 929,
      ),
    );

    const primaryArchetype = provinceList[primaryIndex]?.archetype ?? "regolith-plain";
    const primaryField = ARCHETYPE_FIELDS[primaryArchetype];
    let height = primaryField(x, z, context, primarySample);
    out.frost = primarySample.frost;
    out.molten = primarySample.molten;
    out.regolith = primarySample.regolith;
    out.scarp = primarySample.scarp;
    out.province = primaryIndex;

    if (blend > 0.004 && neighbourIndex !== primaryIndex) {
      const neighbourArchetype = provinceList[neighbourIndex]?.archetype ?? "regolith-plain";
      const neighbourHeight = ARCHETYPE_FIELDS[neighbourArchetype](x, z, context, secondarySample);
      const weight = blend * 0.5;
      height = lerp(height, neighbourHeight, weight);
      out.frost = lerp(out.frost, secondarySample.frost, weight);
      out.molten = lerp(out.molten, secondarySample.molten, weight);
      out.regolith = lerp(out.regolith, secondarySample.regolith, weight);
      out.scarp = lerp(out.scarp, secondarySample.scarp, weight);
    }

    const radius = Math.sqrt(x * x + z * z);
    const scaled = height * geology.relief * nearFieldRelief(radius);
    // Broad regional grade, so the ground is not statistically level in every direction at once —
    // real ground drains somewhere. Kept to a few undulations across the vista and to a third of
    // the world's relief: at a lower frequency it degenerates into one arbitrary planar tilt, which
    // on a genuinely flat world (a lava plain, an ice sheet) is the only thing left to look at.
    const regional = fbm(x * 0.0068, z * 0.0068, context.seed + 937, 3) * geology.relief * 0.32;

    out.height = Number.isFinite(scaled) ? scaled + regional : 0;
    // Fines gather where the ground is low and still, and the world's own mantle depth sets the
    // ceiling: a bare-rock world has nothing to gather.
    out.regolith = clamp01(out.regolith * (0.35 + geology.regolithDepth * 0.9));
    out.frost = clamp01(out.frost * geology.frostCoverage * 1.6);
    out.molten = clamp01(out.molten * geology.lavaGlow);
    return out;
  };

  const scratch = createTerrainSample();

  return {
    geology,
    height: (x, z) => sample(x, z, scratch).height,
    sample,
  };
};
