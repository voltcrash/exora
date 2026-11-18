import { Color, Group, InstancedMesh, Mesh, MeshStandardMaterial, Object3D } from "three";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";

export function createOutcrops(
  root: Group,
  seed: number,
  tint: Color,
  icy: boolean,
  height: (x: number, z: number) => number,
  water: number,
) {
  let closed = false,
    instances: InstancedMesh | undefined;
  let state = seed >>> 0;
  const random = () => {
    state = (Math.imul(state, 1664525) + 1013904223) >>> 0;
    return state / 4294967296;
  };
  void new GLTFLoader()
    .loadAsync(icy ? "/models/ice-fragment.glb" : "/models/impact-fragment.glb")
    .then(({ scene }) => {
      const original = scene.getObjectByProperty("isMesh", true) as
        | Mesh<import("three").BufferGeometry, MeshStandardMaterial>
        | undefined;
      if (!original) return;
      if (closed) {
        original.material.dispose();
        original.geometry.dispose();
        return;
      }
      const rock = new InstancedMesh(original.geometry, original.material, 180);
      instances = rock;
      rock.material.color.copy(tint).lerp(new Color("white"), 0.35);
      const transform = new Object3D();
      let count = 0;
      for (let i = 0; i < 180; i++) {
        const angle = random() * 2 * Math.PI,
          radius = 2.4 + random() ** 1.2 * 59;
        const x = radius * Math.cos(angle),
          z = radius * Math.sin(angle) + 5,
          y = height(x, z);
        if (y <= water + 0.03) continue;
        const size = 0.06 + random() ** 3 * 0.9;
        transform.position.set(x, y + 0.12 * size, z);
        transform.scale.set(size * (1 + random() * 0.5), size * (0.32 + 0.48 * random()), size);
        transform.rotation.set(random() * 0.35, random() * Math.PI, random() * 0.55);
        transform.updateMatrix();
        rock.setMatrixAt(count++, transform.matrix);
      }
      rock.count = count;
      rock.raycast = () => {};
      root.add(rock);
    })
    .catch(() => undefined);
  return () => {
    closed = true;
    if (instances) {
      instances.removeFromParent();
      instances.dispose();
      instances.geometry.dispose();
      (instances.material as MeshStandardMaterial).dispose();
    }
  };
}
