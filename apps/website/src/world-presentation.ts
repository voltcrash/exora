import { MultiPointerScaleBehavior } from "@babylonjs/core/Behaviors/Meshes/multiPointerScaleBehavior.js";
import { PointerDragBehavior } from "@babylonjs/core/Behaviors/Meshes/pointerDragBehavior.js";
import type { Light } from "@babylonjs/core/Lights/light.js";
import { Vector3 } from "@babylonjs/core/Maths/math.vector.js";
import type { AbstractMesh } from "@babylonjs/core/Meshes/abstractMesh.js";
import { Mesh } from "@babylonjs/core/Meshes/mesh.js";
import { TransformNode } from "@babylonjs/core/Meshes/transformNode.js";
import { VertexData } from "@babylonjs/core/Meshes/mesh.vertexData.js";
import type { Scene } from "@babylonjs/core/scene.js";

/** A bit the desktop/VR cameras see and the AR camera deliberately omits. */
export const VIRTUAL_BACKGROUND_LAYER_MASK = 0x0800_0000;

const AR_DISPLAY_DIAMETER_METERS = 0.68;
const MIN_AR_SCALE_FACTOR = 0.25;
const MAX_AR_SCALE_FACTOR = 4;

/** Marks camera-filling geometry that must give way to passthrough in AR. */
export const markAsVirtualBackground = <MeshType extends AbstractMesh>(
  mesh: MeshType,
): MeshType => {
  mesh.layerMask = VIRTUAL_BACKGROUND_LAYER_MASK;
  return mesh;
};

export interface WorldPresentationContents {
  lights: readonly Light[];
  meshes: readonly AbstractMesh[];
  transformNodes: readonly TransformNode[];
}

export interface WorldPresentation {
  /** Makes the existing world a tabletop-scale, manipulable AR object, initially hidden. */
  beginAr: () => void;
  /** Captures the world nodes after its one ordinary scene build. */
  capture: (contents: WorldPresentationContents) => void;
  dispose: () => void;
  /** Restores the exact identity transform used by desktop and immersive VR. */
  endAr: () => void;
  isPlaced: () => boolean;
  /** Places the bottom of the captured world on the hit-tested physical surface. */
  place: (position: Vector3) => void;
  proxy: Mesh;
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

/**
 * Adds a transform-only presentation wrapper around a world's existing nodes.
 *
 * Identity transforms leave desktop and VR byte-for-byte on the scene builders' original path.
 * AR alone scales and moves this wrapper; none of the procedural geometry or shaders are rebuilt.
 */
export const createWorldPresentation = (scene: Scene): WorldPresentation => {
  const proxy = new Mesh("world-presentation-proxy", scene);
  const contentsRoot = new TransformNode("world-presentation-contents", scene);
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

  drag.onDragEndObservable.add(() => {
    surfaceY = proxy.position.y + minimumY * proxy.scaling.y;
  });

  const scaleObserver = scene.onBeforeRenderObservable.add(() => {
    if (!placed) return;
    const nextScale = Math.min(
      baseScale * MAX_AR_SCALE_FACTOR,
      Math.max(baseScale * MIN_AR_SCALE_FACTOR, proxy.scaling.x),
    );
    proxy.scaling.setAll(nextScale);
    proxy.position.y = surfaceY - minimumY * nextScale;
  });

  return {
    proxy,
    capture: ({ lights, meshes, transformNodes }) => {
      if (captured) return;
      captured = true;

      const foreground = meshes.filter(
        (mesh) => mesh !== proxy && mesh.layerMask !== VIRTUAL_BACKGROUND_LAYER_MASK,
      );
      const { maximum, minimum } = finiteBounds(foreground);
      const size = maximum.subtract(minimum);
      const widestDimension = Math.max(size.x, size.y, size.z, 0.001);
      baseScale = AR_DISPLAY_DIAMETER_METERS / widestDimension;
      minimumY = minimum.y;

      const proxyGeometry = VertexData.CreateBox({
        depth: Math.max(size.z, 0.001),
        height: Math.max(size.y, 0.001),
        width: Math.max(size.x, 0.001),
      });
      const center = minimum.add(maximum).scale(0.5);
      const positions = proxyGeometry.positions;
      if (positions) {
        for (let index = 0; index < positions.length; index += 3) {
          positions[index] += center.x;
          positions[index + 1] += center.y;
          positions[index + 2] += center.z;
        }
      }
      proxyGeometry.applyToMesh(proxy, true);

      for (const mesh of meshes) {
        if (mesh !== proxy && !mesh.parent) mesh.parent = contentsRoot;
      }
      for (const node of transformNodes) {
        if (node !== contentsRoot && !node.parent) node.parent = contentsRoot;
      }
      for (const light of lights) {
        if (!light.parent) light.parent = contentsRoot;
      }
    },
    dispose: () => {
      proxy.removeBehavior(drag);
      proxy.removeBehavior(scale);
      scene.onBeforeRenderObservable.remove(scaleObserver);
    },
    beginAr: () => {
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
    },
    isPlaced: () => placed,
    place: (position) => {
      surfaceY = position.y;
      proxy.position.copyFrom(position);
      proxy.position.y = surfaceY - minimumY * proxy.scaling.y;
      proxy.setEnabled(true);
      placed = true;
    },
  };
};
