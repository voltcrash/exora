import { MultiPointerScaleBehavior } from "@babylonjs/core/Behaviors/Meshes/multiPointerScaleBehavior.js";
import { PointerDragBehavior } from "@babylonjs/core/Behaviors/Meshes/pointerDragBehavior.js";
import type { Light } from "@babylonjs/core/Lights/light.js";
import { Vector3 } from "@babylonjs/core/Maths/math.vector.js";
import type { AbstractMesh } from "@babylonjs/core/Meshes/abstractMesh.js";
import type { Mesh } from "@babylonjs/core/Meshes/mesh.js";
import type { TransformNode } from "@babylonjs/core/Meshes/transformNode.js";
import type { Scene } from "@babylonjs/core/scene.js";

const MIN_AR_SCALE_FACTOR = 0.25;
const MAX_AR_SCALE_FACTOR = 4;

export interface WorldPresentationContents {
  lights: readonly Light[];
  meshes: readonly AbstractMesh[];
  transformNodes: readonly TransformNode[];
}

export interface WorldPresentation {
  beginAr: () => void;
  capture: (contents: WorldPresentationContents) => void;
  dispose: () => void;
  endAr: () => void;
  isPlaced: () => boolean;
  moveBy: (delta: Vector3) => void;
  place: (position: Vector3) => void;
  proxy: Mesh;
  scaleBy: (factor: number) => void;
}

export const createWorldPresentation = async (scene: Scene): Promise<WorldPresentation> => {
  const { capturePresentationProxy, createPresentationProxy } =
    await import("./world-presentation-proxy.ts");
  const { contentsRoot, proxy } = createPresentationProxy(scene);
  contentsRoot.parent = proxy;
  proxy.isPickable = false;
  proxy.visibility = 0;

  const drag = new PointerDragBehavior({ dragPlaneNormal: Vector3.Up() });
  drag.detachCameraControls = false;
  drag.dragDeltaRatio = 0.35;
  drag.updateDragPlane = false;
  const scale = new MultiPointerScaleBehavior();

  let baseScale = 1;
  let minimumY = -0.5;
  let placed = false;
  let surfaceY = 0;
  let captured = false;
  let frozenMeshes: readonly AbstractMesh[] = [];

  const applyScale = (requestedScale: number): void => {
    const nextScale = Math.min(
      baseScale * MAX_AR_SCALE_FACTOR,
      Math.max(baseScale * MIN_AR_SCALE_FACTOR, requestedScale),
    );
    proxy.scaling.setAll(nextScale);
    proxy.position.y = surfaceY - minimumY * nextScale;
  };

  drag.onDragEndObservable.add(() => {
    surfaceY = proxy.position.y + minimumY * proxy.scaling.y;
  });

  const scaleObserver = scene.onBeforeRenderObservable.add(() => {
    if (!placed) return;
    applyScale(proxy.scaling.x);
  });

  return {
    proxy,
    capture: ({ lights, meshes, transformNodes }) => {
      if (captured) return;
      captured = true;
      frozenMeshes = meshes.filter((mesh) => mesh.isWorldMatrixFrozen);

      ({ baseScale, minimumY } = capturePresentationProxy(proxy, contentsRoot, {
        lights,
        meshes,
        transformNodes,
      }));
    },
    dispose: () => {
      proxy.removeBehavior(drag);
      proxy.removeBehavior(scale);
      scene.onBeforeRenderObservable.remove(scaleObserver);
    },
    beginAr: () => {
      for (const mesh of frozenMeshes) mesh.unfreezeWorldMatrix();
      placed = false;
      proxy.position.setAll(0);
      proxy.rotationQuaternion = null;
      proxy.rotation.setAll(0);
      proxy.scaling.setAll(baseScale);
      proxy.isPickable = true;
      proxy.setEnabled(false);
      proxy.addBehavior(drag);
      proxy.addBehavior(scale);
    },
    endAr: () => {
      proxy.removeBehavior(drag);
      proxy.removeBehavior(scale);
      placed = false;
      proxy.isPickable = false;
      proxy.position.setAll(0);
      proxy.rotationQuaternion = null;
      proxy.rotation.setAll(0);
      proxy.scaling.setAll(1);
      proxy.setEnabled(true);
      for (const mesh of frozenMeshes) {
        mesh.computeWorldMatrix(true);
        mesh.freezeWorldMatrix();
      }
    },
    isPlaced: () => placed,
    moveBy: (delta) => {
      if (!placed) return;
      proxy.position.addInPlace(delta);
    },
    place: (position) => {
      surfaceY = position.y;
      proxy.position.copyFrom(position);
      proxy.position.y = surfaceY - minimumY * proxy.scaling.y;
      proxy.setEnabled(true);
      placed = true;
    },
    scaleBy: (factor) => {
      if (!placed || !Number.isFinite(factor) || factor <= 0) return;
      applyScale(proxy.scaling.x * factor);
    },
  };
};
