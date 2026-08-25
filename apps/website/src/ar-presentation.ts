import { Color3 } from "@babylonjs/core/Maths/math.color.js";
import { Vector3 } from "@babylonjs/core/Maths/math.vector.js";
import { StandardMaterial } from "@babylonjs/core/Materials/standardMaterial.js";
import { MeshBuilder } from "@babylonjs/core/Meshes/meshBuilder.js";
import { PointerEventTypes } from "@babylonjs/core/Events/pointerEvents.js";
import type { Observer } from "@babylonjs/core/Misc/observable.js";
import type { PointerInfo } from "@babylonjs/core/Events/pointerEvents.js";
import type { Scene } from "@babylonjs/core/scene.js";
import type { IWebXRHitResult, WebXRHitTest } from "@babylonjs/core/XR/features/WebXRHitTest.js";
import type { WorldPresentation } from "./world-presentation.ts";

export interface ArPresentation {
  /** Connects hit testing and manipulation to the currently mounted, already-built world. */
  begin: (hitTest: WebXRHitTest, world: WorldPresentation | null) => void;
  dispose: () => void;
  /** Restores the flat/VR presentation after AR ends or fails to enter. */
  end: () => void;
  overlay: HTMLElement;
  /** Changes destination without changing the AR session or rebuilding presentation logic. */
  setWorld: (world: WorldPresentation | null) => void;
}

const instruction = (placed: boolean): string =>
  placed ? "DRAG TO MOVE · PINCH TO SCALE" : "MOVE TO FIND A SURFACE · TAP TO PLACE";

/**
 * Owns AR-only input and guidance around the ordinary Babylon world.
 *
 * The controller adds a physical-surface reticle, then hands placement and manipulation to the
 * transform wrapper captured by `world-presentation.ts`. It never creates a planet, star or black
 * hole; switching presentation mode therefore cannot diverge from the desktop/VR shaders.
 */
export const createArPresentation = (scene: Scene): ArPresentation => {
  const overlay = document.createElement("div");
  overlay.id = "ar-overlay";
  overlay.hidden = true;
  overlay.setAttribute("aria-live", "polite");
  const guidance = document.createElement("p");
  guidance.textContent = instruction(false);
  overlay.append(guidance);
  document.body.append(overlay);

  const reticleMaterial = new StandardMaterial("ar-reticle-material", scene);
  reticleMaterial.disableLighting = true;
  reticleMaterial.diffuseColor = Color3.Black();
  reticleMaterial.emissiveColor = new Color3(0.545, 0.902, 0.918);
  reticleMaterial.specularColor = Color3.Black();
  const reticle = MeshBuilder.CreateTorus(
    "ar-surface-reticle",
    { diameter: 0.14, tessellation: 48, thickness: 0.006 },
    scene,
  );
  reticle.material = reticleMaterial;
  reticle.isPickable = false;
  reticle.setEnabled(false);

  let active = false;
  let currentWorld: WorldPresentation | null = null;
  let latestHit: Vector3 | null = null;
  let hitObserver: Observer<IWebXRHitResult[]> | null = null;
  let pointerObserver: Observer<PointerInfo> | null = null;

  const resetWorld = (world: WorldPresentation | null): void => {
    currentWorld?.endAr();
    currentWorld = world;
    latestHit = null;
    reticle.setEnabled(false);
    guidance.textContent = instruction(false);
    if (active) currentWorld?.beginAr();
  };

  const end = (): void => {
    if (!active) return;
    active = false;
    if (hitObserver) hitObserver.remove();
    if (pointerObserver) pointerObserver.remove();
    hitObserver = null;
    pointerObserver = null;
    currentWorld?.endAr();
    latestHit = null;
    reticle.setEnabled(false);
    overlay.hidden = true;
    delete document.body.dataset.presentationMode;
  };

  return {
    overlay,
    begin: (hitTest, world) => {
      end();
      active = true;
      currentWorld = world;
      currentWorld?.beginAr();
      overlay.hidden = false;
      guidance.textContent = instruction(false);
      document.body.dataset.presentationMode = "ar";

      hitObserver = hitTest.onHitTestResultObservable.add((results) => {
        const result = results[0];
        if (!result) {
          latestHit = null;
          reticle.setEnabled(false);
          return;
        }
        latestHit = result.position.clone();
        reticle.position.copyFrom(result.position);
        reticle.rotationQuaternion = result.rotationQuaternion.clone();
        reticle.setEnabled(currentWorld?.isPlaced() !== true);
      });

      pointerObserver = scene.onPointerObservable.add((pointerInfo) => {
        if (
          pointerInfo.type !== PointerEventTypes.POINTERDOWN ||
          !latestHit ||
          !currentWorld ||
          currentWorld.isPlaced()
        ) {
          return;
        }
        currentWorld.place(latestHit);
        reticle.setEnabled(false);
        guidance.textContent = instruction(true);
      });
    },
    dispose: () => {
      end();
      reticle.dispose(false, true);
      reticleMaterial.dispose(false, false);
      overlay.remove();
    },
    end,
    setWorld: resetWorld,
  };
};
