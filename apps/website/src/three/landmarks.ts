import {
  BufferAttribute,
  BufferGeometry,
  Group,
  Mesh,
  Raycaster,
  Vector3,
  type Material,
  type ShaderMaterial,
} from "three";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";
import type { SurfaceGeology } from "../surface-geology.ts";
import { siteBearing, sitePosition } from "../surface-landing.ts";

type Placement = readonly [across: number, forward: number, scale: number, turn: number];
const arch: readonly Placement[] = [[-7.6, 31, 1.05, -0.23]];
const pressureRidge: readonly Placement[] = [
  [-7, 23, 1.08, -0.52],
  [6, 32, 0.74, -0.39],
  [20, 43, 1.34, -0.83],
  [-29, 9, 0.72, -0.28],
  [42, 58, 0.92, -0.36],
  [-48, -32, 1.2, 0.8],
];
const basalt: readonly Placement[] = [
  [8, 24, 0.86, 0.28],
  [-15, 51, 1.21, 2.3],
  [26, 64, 0.64, 0.51],
];

export function createLandmarks(
  root: Group,
  geology: SurfaceGeology,
  height: (x: number, z: number) => number,
  material: ShaderMaterial,
  onReady: () => void,
) {
  const dominant = geology.provinces.reduce((best, p) => (p.weight > best.weight ? p : best), {
    archetype: "regolith-plain",
    weight: 0,
  } as SurfaceGeology["provinces"][number]).archetype;
  const ice = dominant === "fractured-ice" || dominant === "glacial-plain";
  const volcanic = ["volcanic-shield", "lava-fields", "flood-basalt"].includes(dominant);
  if (!ice && !volcanic && dominant !== "yardang-badlands" && dominant !== "canyon-rift")
    return null;
  const asset = ice ? "pressure-ice" : volcanic ? "basalt-joints" : "sandstone-window";
  const placements = ice ? pressureRidge : volcanic ? basalt : arch;
  let disposed = false;
  const meshes: Mesh[] = [];
  let geometry: BufferGeometry | undefined;

  void new GLTFLoader()
    .loadAsync(`/models/${asset}.glb`)
    .then(({ scene }) => {
      const original = scene.getObjectByProperty("isMesh", true) as
        | Mesh<BufferGeometry, Material>
        | undefined;
      if (!original) return;
      original.material.dispose();
      geometry = original.geometry;
      if (disposed) {
        geometry.dispose();
        return;
      }
      const count = geometry.getAttribute("position").count;
      const masks = new Float32Array(count * 4);
      const shade = new Float32Array(count * 2).fill(1);
      for (let i = 0; i < count; i++) masks.set([0.08, 0.94, ice ? 0.99 : 0, 0], i * 4);
      geometry.setAttribute("masks", new BufferAttribute(masks, 4));
      geometry.setAttribute("shade", new BufferAttribute(shade, 2));
      for (const [across, forward, scale, turn] of placements) {
        const { x, z } = sitePosition(geology.seed, across, forward);
        const mesh = new Mesh(geometry, material);
        mesh.name = asset;
        mesh.position.set(x, height(x, z) - 0.23 * scale, z);
        mesh.rotation.y = -siteBearing(geology.seed) + turn;
        mesh.scale.setScalar(scale);
        mesh.castShadow = mesh.receiveShadow = true;
        root.add(mesh);
        meshes.push(mesh);
      }
      onReady();
    })
    .catch(() => undefined);

  const ray = new Raycaster();
  const eye = new Vector3(),
    direction = new Vector3();
  return {
    blocks(x: number, z: number, nextX: number, nextZ: number, eyeY: number) {
      direction.set(nextX - x, 0, nextZ - z);
      const step = direction.length();
      if (!step) return false;
      direction.multiplyScalar(1 / step);
      ray.far = step + 0.3;
      for (const y of [eyeY - 1.05, eyeY]) {
        ray.set(eye.set(x, y, z), direction);
        if (ray.intersectObjects(meshes, false).length) return true;
      }
      return false;
    },
    dispose() {
      disposed = true;
      for (const mesh of meshes) mesh.removeFromParent();
      geometry?.dispose();
    },
  };
}
