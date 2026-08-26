import { Color3 } from "@babylonjs/core/Maths/math.color.js";
import { Vector3 } from "@babylonjs/core/Maths/math.vector.js";
import { StandardMaterial } from "@babylonjs/core/Materials/standardMaterial.js";
import { Mesh } from "@babylonjs/core/Meshes/mesh.js";
import { MeshBuilder } from "@babylonjs/core/Meshes/meshBuilder.js";
import { PointerEventTypes } from "@babylonjs/core/Events/pointerEvents.js";
import type { Observer } from "@babylonjs/core/Misc/observable.js";
import type { PointerInfo } from "@babylonjs/core/Events/pointerEvents.js";
import type { Scene } from "@babylonjs/core/scene.js";
import type { IWebXRHitResult, WebXRHitTest } from "@babylonjs/core/XR/features/WebXRHitTest.js";
import type { WebXRSessionManager } from "@babylonjs/core/XR/webXRSessionManager.js";
import { VIRTUAL_BACKGROUND_LAYER_MASK, type WorldPresentation } from "./world-presentation.ts";

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

interface ScreenPoint {
  x: number;
  y: number;
}

const gestureCenter = (points: readonly ScreenPoint[]): ScreenPoint => ({
  x: points.reduce((sum, point) => sum + point.x, 0) / points.length,
  y: points.reduce((sum, point) => sum + point.y, 0) / points.length,
});

const gestureDistance = (points: readonly ScreenPoint[]): number | null => {
  const first = points[0];
  const second = points[1];
  if (!first || !second) return null;
  return Math.hypot(second.x - first.x, second.y - first.y);
};

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
  const backButton = document.createElement("button");
  backButton.type = "button";
  backButton.className = "ar-back-button";
  backButton.setAttribute("aria-label", "Exit AR");
  backButton.textContent = "\u2190 BACK";
  overlay.append(backButton);
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

  // Space View must live in the same XR framebuffer as the world. A black DOM/canvas backing is
  // composited above Variant's WebXR layer on iPhone and therefore hides the planet along with the
  // camera. This inward-facing, camera-relative shell instead contributes opaque black fragments
  // behind the world while leaving its foreground and virtual starfield visible.
  const spaceBackdropMaterial = new StandardMaterial("ar-space-backdrop-material", scene);
  spaceBackdropMaterial.disableLighting = true;
  spaceBackdropMaterial.diffuseColor = Color3.Black();
  spaceBackdropMaterial.emissiveColor = Color3.Black();
  spaceBackdropMaterial.specularColor = Color3.Black();
  spaceBackdropMaterial.disableDepthWrite = true;
  const spaceBackdrop = MeshBuilder.CreateSphere(
    "ar-space-backdrop",
    { diameter: 1_000, segments: 16, sideOrientation: Mesh.BACKSIDE },
    scene,
  );
  spaceBackdrop.material = spaceBackdropMaterial;
  spaceBackdrop.layerMask = VIRTUAL_BACKGROUND_LAYER_MASK;
  spaceBackdrop.infiniteDistance = true;
  spaceBackdrop.isPickable = false;
  spaceBackdrop.applyFog = false;
  spaceBackdrop.alwaysSelectAsActiveMesh = true;
  spaceBackdrop.setEnabled(false);

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
  let exitSession: (() => Promise<void>) | null = null;
  const activePointers = new Map<number, ScreenPoint>();
  let previousGestureCenter: ScreenPoint | null = null;
  let previousGestureDistance: number | null = null;

  const renderBackgroundToggle = (): void => {
    backgroundToggle.textContent = spaceBackground
      ? "SHOW CAMERA · AR VIEW"
      : "HIDE CAMERA · SPACE VIEW";
    backgroundToggle.setAttribute("aria-pressed", String(spaceBackground));
  };

  const setSpaceBackground = (enabled: boolean): void => {
    spaceBackground = enabled;
    // Babylon deliberately leaves an immersive-AR framebuffer uncleared so the platform can
    // provide a truly transparent camera composite. Space is geometry, not a different clear.
    scene.clearColor.a = 0;
    spaceBackdrop.setEnabled(enabled);
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
  backButton.addEventListener("beforexrselect", (event) => event.preventDefault());
  backButton.addEventListener("click", async (event) => {
    event.stopPropagation();
    if (!exitSession || backButton.disabled) return;
    backButton.disabled = true;
    try {
      await exitSession();
    } catch (error) {
      console.error("Unable to exit the AR session", error);
      backButton.disabled = false;
    }
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

  const resetGestureBaseline = (): void => {
    const points = [...activePointers.values()];
    previousGestureCenter = points.length > 0 ? gestureCenter(points) : null;
    previousGestureDistance = gestureDistance(points);
  };

  const moveWorldByScreenDelta = (deltaX: number, deltaY: number): void => {
    if (!currentWorld || !scene.activeCamera) return;
    const camera = scene.activeCamera;
    const distance = Vector3.Distance(camera.globalPosition, currentWorld.proxy.absolutePosition);
    const viewportHeight = Math.max(overlay.clientHeight, window.innerHeight, 1);
    const metersPerPixel = (2 * distance * Math.tan(camera.fov / 2)) / viewportHeight;
    const right = camera.getDirection(Vector3.Right());
    right.y = 0;
    if (right.lengthSquared() < 0.0001) return;
    right.normalize();
    const forward = camera.getDirection(Vector3.Forward());
    forward.y = 0;
    if (forward.lengthSquared() < 0.0001) {
      Vector3.CrossToRef(right, Vector3.Up(), forward);
    }
    forward.normalize();
    currentWorld.moveBy(
      right.scale(deltaX * metersPerPixel).addInPlace(forward.scale(-deltaY * metersPerPixel)),
    );
  };

  const onPointerDown = (event: PointerEvent): void => {
    if (
      !active ||
      !currentWorld?.isPlaced() ||
      (event.target instanceof Element && event.target.closest("button"))
    ) {
      return;
    }
    activePointers.set(event.pointerId, { x: event.clientX, y: event.clientY });
    resetGestureBaseline();
    event.preventDefault();
  };

  const onPointerMove = (event: PointerEvent): void => {
    if (!activePointers.has(event.pointerId) || !currentWorld?.isPlaced()) return;
    activePointers.set(event.pointerId, { x: event.clientX, y: event.clientY });
    const points = [...activePointers.values()];
    const nextCenter = gestureCenter(points);
    if (previousGestureCenter) {
      moveWorldByScreenDelta(
        nextCenter.x - previousGestureCenter.x,
        nextCenter.y - previousGestureCenter.y,
      );
    }
    const nextDistance = gestureDistance(points);
    if (nextDistance && previousGestureDistance) {
      currentWorld.scaleBy(nextDistance / previousGestureDistance);
    }
    previousGestureCenter = nextCenter;
    previousGestureDistance = nextDistance;
    event.preventDefault();
  };

  const onPointerEnd = (event: PointerEvent): void => {
    if (!activePointers.delete(event.pointerId)) return;
    resetGestureBaseline();
    event.preventDefault();
  };

  overlay.addEventListener("pointerdown", onPointerDown);
  document.addEventListener("pointermove", onPointerMove, { capture: true, passive: false });
  document.addEventListener("pointerup", onPointerEnd, { capture: true, passive: false });
  document.addEventListener("pointercancel", onPointerEnd, { capture: true, passive: false });

  const resetWorld = (world: WorldPresentation | null): void => {
    currentWorld?.endAr();
    currentWorld = world;
    latestHit = null;
    reticle.setEnabled(false);
    guidance.textContent = instruction(false);
    if (active) {
      scene.clearColor.a = 0;
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
    exitSession = null;
    backButton.disabled = false;
    activePointers.clear();
    resetGestureBaseline();
    spaceBackground = false;
    spaceBackdrop.setEnabled(false);
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
      exitSession = () => sessionManager.exitXRAsync();
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
      spaceBackdrop.dispose(false, true);
      spaceBackdropMaterial.dispose(false, false);
      overlay.removeEventListener("pointerdown", onPointerDown);
      document.removeEventListener("pointermove", onPointerMove, { capture: true });
      document.removeEventListener("pointerup", onPointerEnd, { capture: true });
      document.removeEventListener("pointercancel", onPointerEnd, { capture: true });
      overlay.remove();
    },
    end,
    setWorld: resetWorld,
  };
};
