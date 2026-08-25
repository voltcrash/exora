import { Color3 } from "@babylonjs/core/Maths/math.color.js";
import { Vector3 } from "@babylonjs/core/Maths/math.vector.js";
import { StandardMaterial } from "@babylonjs/core/Materials/standardMaterial.js";
import { MeshBuilder } from "@babylonjs/core/Meshes/meshBuilder.js";
import { PointerEventTypes } from "@babylonjs/core/Events/pointerEvents.js";
import type { Observer } from "@babylonjs/core/Misc/observable.js";
import type { PointerInfo } from "@babylonjs/core/Events/pointerEvents.js";
import type { Scene } from "@babylonjs/core/scene.js";
import type { IWebXRHitResult, WebXRHitTest } from "@babylonjs/core/XR/features/WebXRHitTest.js";
import type { WebXRSessionManager } from "@babylonjs/core/XR/webXRSessionManager.js";
import type { WorldPresentation } from "./world-presentation.ts";

export interface ArPresentation {
  /** Connects hit testing and manipulation to the currently mounted, already-built world. */
  begin: (
    hitTest: WebXRHitTest,
    sessionManager: WebXRSessionManager,
    world: WorldPresentation | null,
    setSpaceBackground: (enabled: boolean) => void,
  ) => void;
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
  const backgroundToggle = document.createElement("button");
  backgroundToggle.type = "button";
  backgroundToggle.className = "ar-background-toggle";
  overlay.append(backgroundToggle);
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
  let sessionInitObserver: Observer<XRSession> | null = null;
  let xrSession: XRSession | null = null;
  let previousClearAlpha = scene.clearColor.a;
  let spaceBackground = false;
  let updateSpaceBackground: ((enabled: boolean) => void) | null = null;

  const renderBackgroundToggle = (): void => {
    backgroundToggle.textContent = spaceBackground
      ? "SHOW CAMERA · AR VIEW"
      : "HIDE CAMERA · SPACE VIEW";
    backgroundToggle.setAttribute("aria-pressed", String(spaceBackground));
  };

  const setSpaceBackground = (enabled: boolean): void => {
    spaceBackground = enabled;
    scene.clearColor.a = enabled ? 1 : 0;
    document.documentElement.dataset.arBackground = enabled ? "space" : "camera";
    document.body.dataset.arBackground = enabled ? "space" : "camera";
    renderBackgroundToggle();
    updateSpaceBackground?.(enabled);
  };

  backgroundToggle.addEventListener("beforexrselect", (event) => event.preventDefault());
  backgroundToggle.addEventListener("click", (event) => {
    event.stopPropagation();
    setSpaceBackground(!spaceBackground);
  });
  renderBackgroundToggle();

  const preventGestureZoom = (event: Event): void => event.preventDefault();
  const preventTouchPinchZoom = (event: TouchEvent): void => {
    if (event.touches.length > 1) event.preventDefault();
  };

  const setPageZoomGuard = (enabled: boolean): void => {
    const method = enabled ? "addEventListener" : "removeEventListener";
    document[method]("gesturestart", preventGestureZoom, { capture: true, passive: false });
    document[method]("gesturechange", preventGestureZoom, { capture: true, passive: false });
    document[method]("gestureend", preventGestureZoom, { capture: true, passive: false });
    document[method]("touchmove", preventTouchPinchZoom as EventListener, {
      capture: true,
      passive: false,
    });
  };

  const placeAtLatestHit = (): void => {
    if (!latestHit || !currentWorld || currentWorld.isPlaced()) return;
    currentWorld.place(latestHit);
    reticle.setEnabled(false);
    guidance.textContent = instruction(true);
  };

  const onXrSelect = (): void => placeAtLatestHit();

  const resetWorld = (world: WorldPresentation | null): void => {
    currentWorld?.endAr();
    currentWorld = world;
    latestHit = null;
    reticle.setEnabled(false);
    guidance.textContent = instruction(false);
    if (active) {
      scene.clearColor.a = spaceBackground ? 1 : 0;
      currentWorld?.beginAr();
    }
  };

  const end = (): void => {
    if (!active) return;
    active = false;
    if (hitObserver) hitObserver.remove();
    if (pointerObserver) pointerObserver.remove();
    if (sessionInitObserver) sessionInitObserver.remove();
    xrSession?.removeEventListener("select", onXrSelect);
    hitObserver = null;
    pointerObserver = null;
    sessionInitObserver = null;
    xrSession = null;
    currentWorld?.endAr();
    updateSpaceBackground?.(false);
    updateSpaceBackground = null;
    spaceBackground = false;
    renderBackgroundToggle();
    scene.clearColor.a = previousClearAlpha;
    latestHit = null;
    reticle.setEnabled(false);
    overlay.hidden = true;
    setPageZoomGuard(false);
    delete document.documentElement.dataset.presentationMode;
    delete document.documentElement.dataset.arBackground;
    delete document.body.dataset.presentationMode;
    delete document.body.dataset.arBackground;
  };

  return {
    overlay,
    begin: (hitTest, sessionManager, world, onSpaceBackgroundChange) => {
      end();
      active = true;
      currentWorld = world;
      currentWorld?.beginAr();
      previousClearAlpha = scene.clearColor.a;
      updateSpaceBackground = onSpaceBackgroundChange;
      setSpaceBackground(false);
      overlay.hidden = false;
      setPageZoomGuard(true);
      guidance.textContent = instruction(false);
      document.documentElement.dataset.presentationMode = "ar";
      document.body.dataset.presentationMode = "ar";

      // Screen taps in a handheld WebXR session are XR `select` events, not necessarily DOM
      // pointer events on Babylon's canvas. Variant exposes the standard event, so bind it as
      // soon as requestSession succeeds; the pointer observer below remains useful for runtimes
      // which also mirror screen input onto the canvas.
      sessionInitObserver = sessionManager.onXRSessionInit.add((session) => {
        xrSession?.removeEventListener("select", onXrSelect);
        xrSession = session;
        xrSession.addEventListener("select", onXrSelect);
      });

      hitObserver = hitTest.onHitTestResultObservable.add((results) => {
        // A transient hit-test ray follows the finger that generated it. It must not replace the
        // stable viewer-centred reticle (the large ring seen while touching the iPhone screen).
        // The subsequent `select` places at the latest permanent surface pose.
        const result = results.find((candidate) => !candidate.isTransient);
        if (!result && results.some((candidate) => candidate.isTransient)) return;
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
        placeAtLatestHit();
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
