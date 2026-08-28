import type { Material } from "@babylonjs/core/Materials/material.js";
import { Matrix, Quaternion, Vector3 } from "@babylonjs/core/Maths/math.vector.js";
import { Mesh } from "@babylonjs/core/Meshes/mesh.js";
import { VertexData } from "@babylonjs/core/Meshes/mesh.vertexData.js";
import type { TransformNode } from "@babylonjs/core/Meshes/transformNode.js";
import type { Scene } from "@babylonjs/core/scene.js";
import type { RenderQualityProfile } from "./render-quality.ts";
import type { SurfaceGeology } from "./surface-geology.ts";
import type { SurfaceVista } from "./surface-vista.ts";

const SCATTER_RADIUS = 96;

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

type RockForm = "block" | "raft" | "rounded" | "slab" | "spire";

interface RockShape {
  scale: [number, number, number];
  faceting: number;
  grain: number;
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
      return {
        bury: 0.22 + random() * 0.16,
        faceting: 0.5 + random() * 0.2,
        grain: 0.7 + random() * 0.2,
        scale: [1.25 + random() * 0.75, 0.2 + random() * 0.16, 1.05 + random() * 0.8],
      };
    case "spire":
      return {
        bury: 0.1 + random() * 0.1,
        faceting: 0.72 + random() * 0.2,
        grain: 1.15 + random() * 0.35,
        scale: [0.42 + random() * 0.24, 1.7 + random() * 1.5, 0.42 + random() * 0.24],
      };
    case "raft":
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
  origin: Vector3;
  vista: SurfaceVista;
}

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
    Vector3.SlerpToRef(upright, slope, 0.55, scratch);
    scratch.normalize();
    const axis = Vector3.Cross(upright, scratch);
    const angle = Math.acos(Math.min(1, Math.max(-1, Vector3.Dot(upright, scratch))));
    if (axis.lengthSquared() > 1e-6) {
      Quaternion.RotationAxisToRef(axis.normalize(), angle, rotation);
    } else {
      rotation.copyFromFloats(0, 0, 0, 1);
    }
    const spin = Quaternion.RotationAxis(scratch, random() * Math.PI * 2);
    spin.multiplyToRef(rotation, rotation);
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

      const upFacing = clamp01(uy * 0.5 + 0.5);
      colors.push(
        clamp01(tint.regolith * (0.3 + upFacing * 0.75) * geology.regolithDepth),
        clamp01(0.24 + tint.scarp * 0.34 - upFacing * 0.16),
        clamp01(tint.frost * upFacing * upFacing),
        tint.molten * 0.25,
      );
      shade.push(clamp01(lit.occlusion * (0.68 + upFacing * 0.32)), clamp01(lit.sunVisibility));
    }

    for (const vertex of UNIT_ROCK.indices) indices.push(base + vertex);

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
    const radius = Math.sqrt(random()) * SCATTER_RADIUS;
    const angle = random() * Math.PI * 2;
    const x = origin.x + Math.cos(angle) * radius;
    const z = origin.z + Math.sin(angle) * radius;
    const ground = vista.sampleAt(x, z);
    scatterSample.frost = ground.frost;
    scatterSample.molten = ground.molten;
    scatterSample.regolith = ground.regolith;
    scatterSample.scarp = ground.scarp;

    const likelihood =
      geology.boulderDensity *
      (0.25 + ground.scarp * 1.1 - ground.regolith * 0.45) *
      (1 - ground.molten);
    if (random() > likelihood) continue;

    const sizeRoll = random();
    const size = geology.boulderScale * (0.1 + sizeRoll ** 3.6 * 1.15);

    const form: RockForm =
      ground.frost > 0.55
        ? "raft"
        : geology.strataStrength > 0.6 && random() > 0.55
          ? "slab"
          : ground.scarp > 0.55
            ? geology.windStreaks > 0.3 && random() > 0.9
              ? "spire"
              : "block"
            : random() > 0.55
              ? "rounded"
              : "block";

    addRock(x, z, size, form, scatterSample);

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
