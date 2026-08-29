import type { Light } from "@babylonjs/core/Lights/light.js";
import { Vector3 } from "@babylonjs/core/Maths/math.vector.js";
import type { AbstractMesh } from "@babylonjs/core/Meshes/abstractMesh.js";
import { Mesh } from "@babylonjs/core/Meshes/mesh.js";
import { TransformNode } from "@babylonjs/core/Meshes/transformNode.js";
import { VertexData } from "@babylonjs/core/Meshes/mesh.vertexData.js";
import type { Scene } from "@babylonjs/core/scene.js";
import { VIRTUAL_BACKGROUND_LAYER_MASK } from "./virtual-background.ts";

const AR_DISPLAY_DIAMETER_METERS = 0.68;

export interface PresentationProxyContents {
  lights: readonly Light[];
  meshes: readonly AbstractMesh[];
  transformNodes: readonly TransformNode[];
}

const finiteBounds = (meshes: readonly AbstractMesh[]): { maximum: Vector3; minimum: Vector3 } => {
  const minimum = new Vector3(
    Number.POSITIVE_INFINITY,
    Number.POSITIVE_INFINITY,
    Number.POSITIVE_INFINITY,
  );
  const maximum = new Vector3(
    Number.NEGATIVE_INFINITY,
    Number.NEGATIVE_INFINITY,
    Number.NEGATIVE_INFINITY,
  );

  for (const mesh of meshes) {
    if (
      mesh.layerMask === VIRTUAL_BACKGROUND_LAYER_MASK ||
      !mesh.isEnabled() ||
      mesh.getTotalVertices() === 0
    ) {
      continue;
    }
    mesh.computeWorldMatrix(true);
    const box = mesh.getBoundingInfo().boundingBox;
    minimum.minimizeInPlace(box.minimumWorld);
    maximum.maximizeInPlace(box.maximumWorld);
  }

  if (!Number.isFinite(minimum.x) || !Number.isFinite(maximum.x)) {
    return { maximum: Vector3.One(), minimum: Vector3.One().scale(-1) };
  }
  return { maximum, minimum };
};

export const createPresentationProxy = (scene: Scene) => ({
  contentsRoot: new TransformNode("world-presentation-contents", scene),
  proxy: new Mesh("world-presentation-proxy", scene),
});

export const capturePresentationProxy = (
  proxy: Mesh,
  contentsRoot: TransformNode,
  { lights, meshes, transformNodes }: PresentationProxyContents,
): { baseScale: number; minimumY: number } => {
  const foreground = meshes.filter(
    (mesh) => mesh !== proxy && mesh.layerMask !== VIRTUAL_BACKGROUND_LAYER_MASK,
  );
  const { maximum, minimum } = finiteBounds(foreground);
  const size = maximum.subtract(minimum);
  const widestDimension = Math.max(size.x, size.y, size.z, 0.001);
  const proxyGeometry = VertexData.CreateBox({
    depth: Math.max(size.z, 0.001),
    height: Math.max(size.y, 0.001),
    width: Math.max(size.x, 0.001),
  });
  const center = minimum.add(maximum).scale(0.5);
  const positions = proxyGeometry.positions;
  if (positions) {
    for (let index = 0; index < positions.length; index += 3) {
      positions[index] = positions[index]! + center.x;
      positions[index + 1] = positions[index + 1]! + center.y;
      positions[index + 2] = positions[index + 2]! + center.z;
    }
  }
  proxyGeometry.applyToMesh(proxy, true);

  for (const mesh of meshes) {
    if (mesh !== proxy && mesh.layerMask !== VIRTUAL_BACKGROUND_LAYER_MASK && !mesh.parent) {
      mesh.parent = contentsRoot;
    }
  }
  for (const node of transformNodes) {
    if (node !== contentsRoot && !node.parent) node.parent = contentsRoot;
  }
  for (const light of lights) {
    if (!light.parent) light.parent = contentsRoot;
  }

  return { baseScale: AR_DISPLAY_DIAMETER_METERS / widestDimension, minimumY: minimum.y };
};
