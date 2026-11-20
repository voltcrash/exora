import {
  BufferGeometry,
  Color,
  Float32BufferAttribute,
  Group,
  InstancedMesh,
  Mesh,
  MeshStandardMaterial,
  Object3D,
  ShaderMaterial,
} from "three";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";
import type { SurfaceGeology } from "../surface-geology.ts";
import { SURFACE_WALK_LIMIT } from "../surface-landing.ts";
import { createTerrainField, createTerrainSample } from "../surface-terrain.ts";

const forms = ["Boulder", "Slab", "Spire", "IceShard"] as const;
type Form = (typeof forms)[number];
type Outcrop = InstancedMesh<BufferGeometry, MeshStandardMaterial>;

export function createOutcrops(
  root: Group,
  geology: SurfaceGeology,
  height: (x: number, z: number) => number,
  water: number,
  constrained: boolean,
) {
  const field = createTerrainField(geology);
  const sample = createTerrainSample();
  const bedrock = new Color().setRGB(...geology.bedrockColor);
  const sediment = new Color().setRGB(...geology.regolithColor);
  const frost = new Color().setRGB(...geology.frostColor);
  const instances: Outcrop[] = [];
  let clearModels: (() => void) | undefined;
  let shadows: Mesh<BufferGeometry, ShaderMaterial> | undefined;
  let closed = false;
  let state = geology.seed >>> 0;
  const random = () => {
    state = (Math.imul(state, 1664525) + 1013904223) >>> 0;
    return state / 4_294_967_296;
  };

  void new GLTFLoader()
    .loadAsync("/models/terrain-outcrops.glb")
    .then(({ scene }) => {
      const geometries = new Set<BufferGeometry>();
      const materials = new Set<MeshStandardMaterial>();
      scene.traverse((object) => {
        if (object instanceof Mesh) {
          geometries.add(object.geometry);
          materials.add(object.material as MeshStandardMaterial);
        }
      });
      clearModels = () => {
        for (const geometry of geometries) geometry.dispose();
        for (const material of materials) material.dispose();
      };
      if (closed) {
        clearModels();
        return;
      }

      const clusters = Math.round(16 + geology.boulderDensity * 42);
      const fragments = constrained ? 7 : 12;
      const capacity = clusters * fragments;
      const byForm = new Map<Form, Outcrop>();
      for (const name of forms) {
        const model = scene.getObjectByName(name);
        if (!(model instanceof Mesh) || !(model.material instanceof MeshStandardMaterial)) continue;
        const mesh = new InstancedMesh(model.geometry, model.material, capacity);
        mesh.count = 0;
        mesh.raycast = () => {};
        byForm.set(name, mesh);
        instances.push(mesh);
      }
      const transform = new Object3D();
      const tint = new Color();
      const vertices: number[] = [];
      const opacity: number[] = [];
      const indices: number[] = [];

      for (let cluster = 0; cluster < clusters; cluster += 1) {
        const angle = random() * 2 * Math.PI;
        const radius = 2.5 + Math.sqrt(random()) * (SURFACE_WALK_LIMIT + 12) * 0.8;
        const centerX = Math.cos(angle) * radius;
        const centerZ = Math.sin(angle) * radius;
        const clusterSize = (0.55 + random() ** 1.65 * 1.56) * geology.boulderScale;
        const spread = 1.8 + random() * 6.5;
        const bearing = random() * Math.PI;

        for (let fragment = 0; fragment < fragments; fragment += 1) {
          const offset = bearing + random() * 2 * Math.PI;
          const displacement = spread * random() ** 1.5;
          const x = centerX + Math.cos(offset) * displacement;
          const z = centerZ + Math.sin(offset) * displacement;
          const y = height(x, z);
          if (y <= water + 0.08) continue;
          const dx = (height(x + 0.6, z) - height(x - 0.6, z)) / 1.2;
          const dz = (height(x, z + 0.6) - height(x, z - 0.6)) / 1.2;
          if (Math.hypot(dx, dz) > 0.66) continue;

          field.sample(x, z, sample);
          if (sample.molten > 0.2) continue;
          const choice = random();
          const form: Form =
            sample.frost > 0.48 && choice > 0.28
              ? "IceShard"
              : fragment === 0 && sample.scarp > 0.23 && choice > 0.38
                ? "Spire"
                : choice < 0.53
                  ? "Slab"
                  : "Boulder";
          const mesh = byForm.get(form);
          if (!mesh) continue;

          const size = clusterSize * (fragment === 0 ? 0.91 : 0.045 + random() ** 2.1 * 0.48);
          const stretch = 0.75 + random() * 0.54;
          transform.position.set(x, y - size * 0.11, z);
          transform.scale.set(size * stretch, size * (0.64 + random() * 0.47), size);
          transform.rotation.set(-Math.atan(dz), bearing + random() * 0.84, Math.atan(dx));
          transform.updateMatrix();
          mesh.setMatrixAt(mesh.count, transform.matrix);
          tint
            .copy(bedrock)
            .lerp(sediment, sample.regolith * 0.45)
            .lerp(frost, sample.frost * (form === "IceShard" ? 0.76 : 0.32))
            .multiplyScalar(0.68 + random() * 0.7);
          mesh.setColorAt(mesh.count, tint);
          mesh.count += 1;

          if (size < 0.19) continue;
          const index = opacity.length;
          const edges = 10;
          vertices.push(x, y + 0.023, z);
          opacity.push(0.56);
          for (let edge = 0; edge < edges; edge += 1) {
            const turn = (edge / edges) * 2 * Math.PI;
            const px = x + Math.cos(turn) * size * 1.64;
            const pz = z + Math.sin(turn) * size * 1.56;
            vertices.push(px, height(px, pz) + 0.023, pz);
            opacity.push(0);
            indices.push(index, index + 1 + ((edge + 1) % edges), index + 1 + edge);
          }
        }
      }

      for (const mesh of instances) if (mesh.count) root.add(mesh);
      const geometry = new BufferGeometry()
        .setAttribute("position", new Float32BufferAttribute(vertices, 3))
        .setAttribute("opacity", new Float32BufferAttribute(opacity, 1))
        .setIndex(indices);
      const shadow = new ShaderMaterial({
        transparent: true,
        depthWrite: false,
        vertexShader: `
          attribute float opacity;
          varying float shade;
          void main() {
            shade = opacity;
            gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.);
          }
        `,
        fragmentShader: `
          varying float shade;
          void main() { gl_FragColor = vec4(.012, .009, .008, shade * shade); }
        `,
      });
      shadows = new Mesh(geometry, shadow);
      shadows.raycast = () => {};
      root.add(shadows);
    })
    .catch(() => undefined);
  return () => {
    closed = true;
    for (const mesh of instances) {
      mesh.removeFromParent();
      mesh.dispose();
    }
    clearModels?.();
    shadows?.removeFromParent();
    shadows?.geometry.dispose();
    shadows?.material.dispose();
  };
}
