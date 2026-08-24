import type { Material } from "@babylonjs/core/Materials/material.js";
import { Matrix, Quaternion, Vector3 } from "@babylonjs/core/Maths/math.vector.js";
import { Mesh } from "@babylonjs/core/Meshes/mesh.js";
import { VertexData } from "@babylonjs/core/Meshes/mesh.vertexData.js";
import type { TransformNode } from "@babylonjs/core/Meshes/transformNode.js";
import type { Scene } from "@babylonjs/core/scene.js";
import type { RenderQualityProfile } from "./render-quality.ts";
import type { SurfaceGeology } from "./surface-geology.ts";
import type { SurfaceVista } from "./surface-vista.ts";

/**
 * Everything loose lying on the ground: boulders, outcrops, slabs, ice blocks, cobbles.
 *
 * What this replaces was sixty-two UV spheres of one colour, scaled at random and half-buried in
 * the terrain — the single most cartoonish thing in the vista, and the thing a visitor's eye goes
 * to first, because loose rock is the only object in a landscape whose real size everyone knows.
 *
 * Three things make the difference here:
 *
 *  - **Shape.** A rock is not a sphere. Each one starts as an icosahedron and is broken by a
 *    seeded noise field into facets, then stretched along its own axes, so it has flat faces,
 *    edges, and a silhouette that reads as fracture rather than as inflation.
 *  - **Placement that means something.** Boulders come from somewhere: they fall off scarps, they
 *    are thrown out of craters, they are left behind when fines blow away. So density follows the
 *    terrain's own scarp and regolith channels rather than a uniform sprinkle, they sit tilted on
 *    the slope they landed on, and they settle into the ground by a fraction of their own size.
 *  - **The same light as the ground.** They share the terrain's material, so they take the same
 *    sun, the same baked shadow at the spot they stand on, the same aerial haze — and they are
 *    merged into a single mesh, so all of them together cost one draw call instead of sixty-two.
 */

/** How far from the vista's centre scatter is worth placing. Past this a boulder is a pixel. */
const SCATTER_RADIUS = 96;

/** Where the small stuff lives: cobbles only matter within a few strides of the viewer, and are
 * what tells the eye how big everything else is. */
const COBBLE_RADIUS = 26;

const SCATTER_BUDGET: Readonly<Record<RenderQualityProfile["tier"], number>> = {
  desktop: 620,
  mobile: 260,
  quest: 200,
};

const createSeededRandom = (seed: number): (() => number) => {
  let state = (seed || 1) >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let value = state;
    value = Math.imul(value ^ (value >>> 15), value | 1);
    value ^= value + Math.imul(value ^ (value >>> 7), value | 61);
    return ((value ^ (value >>> 14)) >>> 0) / 4_294_967_296;
  };
};

const clamp01 = (value: number): number =>
  Number.isFinite(value) ? (value < 0 ? 0 : value > 1 ? 1 : value) : 0;

/** Unit icosahedron, subdivided once: 42 vertices and 80 faces, which is enough to carry facets
 * without spending geometry on a thing that is usually a few dozen pixels across. */
const buildIcosphere = (): { indices: number[]; positions: number[] } => {
  const t = (1 + Math.sqrt(5)) / 2;
  const base: [number, number, number][] = [
    [-1, t, 0],
    [1, t, 0],
    [-1, -t, 0],
    [1, -t, 0],
    [0, -1, t],
    [0, 1, t],
    [0, -1, -t],
    [0, 1, -t],
    [t, 0, -1],
    [t, 0, 1],
    [-t, 0, -1],
    [-t, 0, 1],
  ];
  const faces: [number, number, number][] = [
    [0, 11, 5],
    [0, 5, 1],
    [0, 1, 7],
    [0, 7, 10],
    [0, 10, 11],
    [1, 5, 9],
    [5, 11, 4],
    [11, 10, 2],
    [10, 7, 6],
    [7, 1, 8],
    [3, 9, 4],
    [3, 4, 2],
    [3, 2, 6],
    [3, 6, 8],
    [3, 8, 9],
    [4, 9, 5],
    [2, 4, 11],
    [6, 2, 10],
    [8, 6, 7],
    [9, 8, 1],
  ];

  const positions: number[] = [];
  for (const [x, y, z] of base) {
    const length = Math.hypot(x, y, z);
    positions.push(x / length, y / length, z / length);
  }

  const midpoints = new Map<string, number>();
  const midpoint = (a: number, b: number): number => {
    const key = a < b ? `${a}:${b}` : `${b}:${a}`;
    const existing = midpoints.get(key);
    if (existing !== undefined) return existing;
    const x = (positions[a * 3]! + positions[b * 3]!) / 2;
    const y = (positions[a * 3 + 1]! + positions[b * 3 + 1]!) / 2;
    const z = (positions[a * 3 + 2]! + positions[b * 3 + 2]!) / 2;
    const length = Math.hypot(x, y, z);
    const index = positions.length / 3;
    positions.push(x / length, y / length, z / length);
    midpoints.set(key, index);
    return index;
  };

  // Wound the way Babylon's left-handed convention wants, so `ComputeNormals` points them out of
  // the rock rather than into it. Facing the wrong way they render — and light like a hole.
  const indices: number[] = [];
  for (const [a, b, c] of faces) {
    const ab = midpoint(a, b);
    const bc = midpoint(b, c);
    const ca = midpoint(c, a);
    indices.push(a, ca, ab, b, ab, bc, c, bc, ca, ab, ca, bc);
  }

  return { indices, positions };
};

const UNIT_ROCK = buildIcosphere();

/**
 * How a piece of loose rock is shaped, which is a fact about how it broke.
 *
 * Fresh rock off a scarp is angular and platy; rock that has sat in wind and dust for an age is
 * rounded; an ice shell that has cracked leaves rafted blocks with flat tops and square edges.
 */
type RockForm = "block" | "raft" | "rounded" | "slab" | "spire";

interface RockShape {
  /** Per-axis stretch, before the world's own boulder scale. */
  scale: [number, number, number];
  /** How hard the noise field cuts facets into the sphere, 0-1. */
  faceting: number;
  /** Frequency of that noise: low is a few broad faces, high is rubble. */
  grain: number;
  /** Fraction of the rock's height that sits below the ground line. */
  bury: number;
}

const shapeFor = (form: RockForm, random: () => number): RockShape => {
  switch (form) {
    case "block":
      return {
        bury: 0.08 + random() * 0.1,
        faceting: 0.62 + random() * 0.24,
        grain: 0.85 + random() * 0.3,
        scale: [0.8 + random() * 0.5, 0.62 + random() * 0.45, 0.75 + random() * 0.55],
      };
    case "slab":
      // Wide, thin and flat-lying: the platy basalt Venera photographed, and the ledges a
      // layered scarp sheds.
      return {
        bury: 0.22 + random() * 0.16,
        faceting: 0.5 + random() * 0.2,
        grain: 0.7 + random() * 0.2,
        scale: [1.25 + random() * 0.75, 0.2 + random() * 0.16, 1.05 + random() * 0.8],
      };
    case "spire":
      // What is left when the softer rock around a hard core is carved away.
      return {
        bury: 0.1 + random() * 0.1,
        faceting: 0.72 + random() * 0.2,
        grain: 1.15 + random() * 0.35,
        scale: [0.42 + random() * 0.24, 1.7 + random() * 1.5, 0.42 + random() * 0.24],
      };
    case "raft":
      // A slab of crust that broke free and tilted: flat top, square sides, jumbled attitude.
      return {
        bury: 0.24 + random() * 0.16,
        faceting: 0.62 + random() * 0.22,
        grain: 0.62 + random() * 0.2,
        scale: [0.95 + random() * 0.7, 0.4 + random() * 0.3, 0.85 + random() * 0.65],
      };
    default:
      return {
        bury: 0.12 + random() * 0.14,
        faceting: 0.42 + random() * 0.24,
        grain: 1.0 + random() * 0.3,
        scale: [0.9 + random() * 0.35, 0.72 + random() * 0.3, 0.88 + random() * 0.36],
      };
  }
};

/**
 * A constant value per cell of a coarse lattice, which is what makes a facet a facet.
 *
 * The caller scales the direction down to a handful of cells across the rock, so neighbouring
 * vertices land in the same cell and get pushed in by the same amount — a flat face. Sampled
 * finely instead, every vertex gets its own displacement and the result is a lumpy potato: the
 * shape reads as inflated rather than as broken.
 */
const facetNoise = (x: number, y: number, z: number, seed: number): number => {
  let h =
    (Math.imul(Math.round(x), 374_761_393) +
      Math.imul(Math.round(y), 668_265_263) +
      Math.imul(Math.round(z), 2_147_483_647) +
      Math.imul(seed, 1_442_695_041)) |
    0;
  h = Math.imul(h ^ (h >>> 13), 1_274_126_177);
  h ^= h >>> 16;
  return (h >>> 0) / 4_294_967_296;
};

export interface SurfaceScatterOptions {
  geology: SurfaceGeology;
  material: Material;
  parent: TransformNode;
  profile: RenderQualityProfile;
  /** Where the vista's terrain field is centred in the scene. */
  origin: Vector3;
  vista: SurfaceVista;
}

/**
 * Builds the whole scatter field as one merged mesh sharing the terrain's material.
 *
 * Returns `null` for a world with nothing loose on it — a dust-drowned plain, an unresolved body
 * whose surface no mission has seen, or a lava field where a boulder would have sunk.
 */
export const createSurfaceScatter = (
  scene: Scene,
  { geology, material, origin, parent, profile, vista }: SurfaceScatterOptions,
): Mesh | null => {
  if (geology.boulderDensity <= 0.01) return null;

  const random = createSeededRandom((geology.seed ^ 0x3f_1a_9c_55) >>> 0);
  const budget = SCATTER_BUDGET[profile.tier];
  const positions: number[] = [];
  const normals: number[] = [];
  const colors: number[] = [];
  const shade: number[] = [];
  const indices: number[] = [];

  const casters: { height: number; radius: number; x: number; z: number }[] = [];
  const rotation = Quaternion.Identity();
  const transform = new Matrix();
  const scratch = new Vector3();
  const upright = new Vector3(0, 1, 0);

  const addRock = (
    centerX: number,
    centerZ: number,
    size: number,
    form: RockForm,
    tint: { frost: number; molten: number; regolith: number; scarp: number },
  ): void => {
    const shape = shapeFor(form, random);
    const groundY = vista.heightAt(centerX, centerZ);
    const lit = vista.shadeAt(centerX, centerZ);
    const slope = vista.slopeAt(centerX, centerZ);
    // Sitting on the slope it landed on rather than bolt upright, but not fully aligned: a rock
    // that has come to rest has found its own balance, not the ground's normal.
    Vector3.SlerpToRef(upright, slope, 0.55, scratch);
    scratch.normalize();
    const axis = Vector3.Cross(upright, scratch);
    const angle = Math.acos(Math.min(1, Math.max(-1, Vector3.Dot(upright, scratch))));
    if (axis.lengthSquared() > 1e-6) {
      Quaternion.RotationAxisToRef(axis.normalize(), angle, rotation);
    } else {
      rotation.copyFromFloats(0, 0, 0, 1);
    }
    // Spin about its own vertical, so no two rocks present the same face.
    const spin = Quaternion.RotationAxis(scratch, random() * Math.PI * 2);
    spin.multiplyToRef(rotation, rotation);
    // A slight lean, so nothing looks placed.
    const lean = Quaternion.RotationAxis(
      new Vector3(random() - 0.5, 0, random() - 0.5).normalize(),
      (random() - 0.5) * 0.5,
    );
    lean.multiplyToRef(rotation, rotation);

    const height = size * shape.scale[1];
    Matrix.ComposeToRef(
      new Vector3(size * shape.scale[0], height, size * shape.scale[2]),
      rotation,
      new Vector3(centerX, groundY + height * (0.5 - shape.bury), centerZ),
      transform,
    );

    const base = positions.length / 3;
    const seed = Math.floor(random() * 1_000_000);
    const facetSeeds = [seed, seed + 7717, seed + 15_331];

    for (let index = 0; index < UNIT_ROCK.positions.length; index += 3) {
      const ux = UNIT_ROCK.positions[index]!;
      const uy = UNIT_ROCK.positions[index + 1]!;
      const uz = UNIT_ROCK.positions[index + 2]!;
      // Two octaves of facet noise: broad faces, then chipped edges on top of them.
      const broad = facetNoise(
        ux * shape.grain,
        uy * shape.grain,
        uz * shape.grain,
        facetSeeds[0]!,
      );
      const fine = facetNoise(
        ux * shape.grain * 2.4,
        uy * shape.grain * 2.4,
        uz * shape.grain * 2.4,
        facetSeeds[1]!,
      );
      const displacement = 1 - shape.faceting * (0.66 * broad + 0.34 * fine) * 0.8;
      scratch.set(ux * displacement, uy * displacement, uz * displacement);
      Vector3.TransformCoordinatesToRef(scratch, transform, scratch);
      positions.push(scratch.x, scratch.y, scratch.z);

      // Fines collect on the upward faces and against the base; the sides stay bare rock. The
      // underside is written as fully occluded, which is the contact shadow every one of these
      // used to be missing.
      const upFacing = clamp01(uy * 0.5 + 0.5);
      colors.push(
        clamp01(tint.regolith * (0.3 + upFacing * 0.75) * geology.regolithDepth),
        // Not fully bedrock: a boulder is the same rock as the ground it came off, weathered on
        // its exposed faces and dust-coated on top, so it stays inside the world's own palette.
        clamp01(0.24 + tint.scarp * 0.34 - upFacing * 0.16),
        clamp01(tint.frost * upFacing * upFacing),
        tint.molten * 0.25,
      );
      // Only what the *ground* already knows: how open the sky is here and whether the sun
      // reaches this spot. The rock's own shape is shaded by its normals in the shader, so
      // darkening the downward faces here too would shade it twice and read as soot.
      shade.push(clamp01(lit.occlusion * (0.68 + upFacing * 0.32)), clamp01(lit.sunVisibility));
    }

    for (const vertex of UNIT_ROCK.indices) indices.push(base + vertex);

    // What this rock throws on the ground. Only the ones large enough for a shadow to read are
    // recorded; a cobble's shadow is smaller than the ground's own texel.
    const exposed = height * (0.5 + shape.bury);
    if (exposed > 0.18) {
      casters.push({
        height: exposed,
        radius: size * Math.max(shape.scale[0], shape.scale[2]) * 0.5,
        x: centerX,
        z: centerZ,
      });
    }
  };

  const scatterSample = { frost: 0, molten: 0, regolith: 0, scarp: 0 };

  for (let attempt = 0; attempt < budget * 3 && positions.length / 3 < budget * 42; attempt += 1) {
    // Uniform over the disc, which a naive (random radius, random angle) pair is not — it would
    // pile every boulder in the vista around the viewer's feet.
    const radius = Math.sqrt(random()) * SCATTER_RADIUS;
    const angle = random() * Math.PI * 2;
    const x = origin.x + Math.cos(angle) * radius;
    const z = origin.z + Math.sin(angle) * radius;
    const ground = vista.sampleAt(x, z);
    scatterSample.frost = ground.frost;
    scatterSample.molten = ground.molten;
    scatterSample.regolith = ground.regolith;
    scatterSample.scarp = ground.scarp;

    // Rock is exposed where the ground is broken and buried where fines have drifted over it.
    // Nothing survives standing on ground that is still molten.
    const likelihood =
      geology.boulderDensity *
      (0.25 + ground.scarp * 1.1 - ground.regolith * 0.45) *
      (1 - ground.molten);
    if (random() > likelihood) continue;

    // Power-law sizes, the way a real block field grades: many small, a few large, and the
    // largest an order of magnitude above the median rather than twice it. Capped well under
    // human scale at the median, because a boulder is the one thing in the frame whose size a
    // visitor can read directly — get it wrong and the whole vista changes size with it.
    const sizeRoll = random();
    const size = geology.boulderScale * (0.1 + sizeRoll ** 3.6 * 1.15);

    const form: RockForm =
      ground.frost > 0.55
        ? "raft"
        : geology.strataStrength > 0.6 && random() > 0.55
          ? "slab"
          : ground.scarp > 0.55
            ? // A spire is what wind leaves behind when it takes the soft rock away. Without wind
              // there is nothing to carve one, so an airless world never grows them.
              geology.windStreaks > 0.3 && random() > 0.9
              ? "spire"
              : "block"
            : random() > 0.55
              ? "rounded"
              : "block";

    addRock(x, z, size, form, scatterSample);

    // Rockfall arrives in company: a block that came off a scarp brought its neighbours with it.
    if (ground.scarp > 0.4 && random() > 0.62) {
      const companions = 1 + Math.floor(random() * 3);
      for (let index = 0; index < companions; index += 1) {
        const spread = size * (1.4 + random() * 2.6);
        addRock(
          x + (random() - 0.5) * spread,
          z + (random() - 0.5) * spread,
          size * (0.3 + random() * 0.5),
          form === "spire" ? "block" : form,
          scatterSample,
        );
      }
    }
  }

  // Cobbles underfoot. Cheap, small, and the only thing in the frame whose size a visitor can
  // read directly — without them a vista has no scale at all.
  const cobbles = Math.round(budget * 0.45);
  for (let index = 0; index < cobbles; index += 1) {
    const radius = Math.sqrt(random()) * COBBLE_RADIUS;
    const angle = random() * Math.PI * 2;
    const x = origin.x + Math.cos(angle) * radius;
    const z = origin.z + Math.sin(angle) * radius;
    const ground = vista.sampleAt(x, z);
    if (ground.molten > 0.3) continue;
    scatterSample.frost = ground.frost;
    scatterSample.molten = ground.molten;
    scatterSample.regolith = ground.regolith;
    scatterSample.scarp = ground.scarp;
    addRock(x, z, geology.boulderScale * (0.08 + random() * 0.16), "rounded", scatterSample);
  }

  if (indices.length === 0) return null;

  vista.stampShadows(casters);
  VertexData.ComputeNormals(positions, indices, normals);

  const mesh = new Mesh("surfaceScatter", scene);
  const vertexData = new VertexData();
  vertexData.positions = positions;
  vertexData.indices = indices;
  vertexData.normals = normals;
  vertexData.colors = colors;
  vertexData.uvs = shade;
  vertexData.applyToMesh(mesh, false);
  mesh.parent = parent;
  mesh.isPickable = false;
  mesh.material = material;
  mesh.alwaysSelectAsActiveMesh = true;
  return mesh;
};
