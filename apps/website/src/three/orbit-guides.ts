import {
  BufferGeometry,
  LineBasicMaterial,
  LineLoop,
  Mesh,
  type Material,
  type Object3D,
  Vector3,
} from "three";

export function orbitGuide(
  radiusAt: (angle: number) => number,
  color: number,
  segments: number,
  opacity: number,
) {
  const points = Array.from({ length: segments }, (_, i) => {
    const angle = (i * 2 * Math.PI) / segments,
      radius = radiusAt(angle);
    return new Vector3(radius * Math.cos(angle), 0, -radius * Math.sin(angle));
  });
  const orbit = new LineLoop(
    new BufferGeometry().setFromPoints(points),
    new LineBasicMaterial({ color, opacity, transparent: true, depthWrite: false }),
  );
  orbit.raycast = () => {};
  return orbit;
}

export function disposeObjects(root: Object3D) {
  const geometries = new Set<BufferGeometry>(),
    materials = new Set<Material>();
  root.traverse((child) => {
    const item = child as Mesh;
    if (item.geometry) geometries.add(item.geometry);
    if (item.material)
      for (const material of Array.isArray(item.material) ? item.material : [item.material])
        materials.add(material);
  });
  for (const geometry of geometries) geometry.dispose();
  for (const material of materials) material.dispose();
  root.removeFromParent();
}
