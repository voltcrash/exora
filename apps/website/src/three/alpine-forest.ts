import { Color, Group, InstancedMesh, Mesh, MeshStandardMaterial, Object3D } from "three";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";
import { sitePosition } from "../surface-landing.ts";

export function createAlpineForest(
  root: Group,
  seed: number,
  height: (x: number, z: number) => number,
  water: number,
  constrained: boolean,
  onReady: () => void,
) {
  let closed = false;
  let stand: InstancedMesh | undefined;
  let release: (() => void) | undefined;
  const trunks: { x: number; z: number; radius: number }[] = [];
  const start = sitePosition(seed, 0, -7);
  void new GLTFLoader()
    .loadAsync("/models/alpine-fir.glb")
    .then(({ scene }) => {
      const fir = scene.getObjectByProperty("isMesh", true);
      if (!(fir instanceof Mesh) || !(fir.material instanceof MeshStandardMaterial)) return;
      release = () => {
        fir.geometry.dispose();
        fir.material.map?.dispose();
        fir.material.dispose();
      };
      if (closed) {
        release();
        return;
      }
      let state = seed >>> 0;
      const random = () => {
        state = (Math.imul(state, 1664525) + 1013904223) >>> 0;
        return state / 4294967296;
      };
      const grid = constrained ? 23 : 32;
      const trees = new InstancedMesh(fir.geometry, fir.material, grid * grid);
      const pose = new Object3D();
      const tint = new Color();
      trees.count = 0;
      for (let row = 0; row < grid; row++)
        for (let column = 0; column < grid; column++) {
          const x = ((column + random()) / grid - 0.5) * 222;
          const z = ((row + random()) / grid - 0.5) * 222;
          const y = height(x, z);
          const moisture = Math.sin(x * 0.071 + z * 0.046) + 0.74 * Math.cos(z * 0.13 - x * 0.037);
          if (
            y < water + 0.13 ||
            y > 11 + moisture * 4 ||
            moisture < -0.57 ||
            Math.hypot(x - start.x, z - start.z) < 7
          )
            continue;
          const slope = Math.hypot(height(x + 1, z) - y, height(x, z + 1) - y);
          if (slope > 0.83) continue;
          const size = (0.42 + random() * 0.83) * (1 - Math.max(0, y - 6) * 0.033);
          pose.position.set(x, y - 0.13, z);
          pose.rotation.set((random() - 0.5) * 0.085, random() * Math.PI * 2, 0);
          pose.scale.set(size, size * (0.9 + random() * 0.23), size);
          pose.updateMatrix();
          trees.setMatrixAt(trees.count, pose.matrix);
          tint.setRGB(0.65 + random() * 0.64, 0.77 + random() * 0.36, 0.69 + random() * 0.4);
          trees.setColorAt(trees.count++, tint);
          trunks.push({ x, z, radius: 0.17 * size + 0.15 });
        }
      trees.castShadow = trees.receiveShadow = true;
      trees.raycast = () => {};
      root.add(trees);
      stand = trees;
      onReady();
    })
    .catch(() => undefined);
  return {
    blocks(x: number, z: number) {
      return trunks.some((tree) => (x - tree.x) ** 2 + (z - tree.z) ** 2 < tree.radius ** 2);
    },
    dispose() {
      closed = true;
      stand?.removeFromParent();
      stand?.dispose();
      release?.();
    },
  };
}
