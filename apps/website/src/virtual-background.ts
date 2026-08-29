import type { AbstractMesh } from "@babylonjs/core/Meshes/abstractMesh.js";

export const VIRTUAL_BACKGROUND_LAYER_MASK = 0x0800_0000;

export const markAsVirtualBackground = <MeshType extends AbstractMesh>(
  mesh: MeshType,
): MeshType => {
  mesh.layerMask = VIRTUAL_BACKGROUND_LAYER_MASK;
  return mesh;
};
