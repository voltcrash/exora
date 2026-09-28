import { ArcRotateCamera } from "@babylonjs/core/Cameras/arcRotateCamera.js";
import { Camera } from "@babylonjs/core/Cameras/camera.js";
import { Engine } from "@babylonjs/core/Engines/engine.js";
import { Color4 } from "@babylonjs/core/Maths/math.color.js";
import { Vector3 } from "@babylonjs/core/Maths/math.vector.js";
import { Scene, ScenePerformancePriority } from "@babylonjs/core/scene.js";
import type { RenderQualityProfile } from "./render-quality.ts";

const DEFAULT_CLEAR_COLOR = new Color4(0.0015, 0.003, 0.008, 1);

// Babylon holds the vertical angle fixed, which leaves a portrait phone a sliver of the scene
// horizontally; there the horizontal angle is held instead so subjects still fit across.
export const fieldOfViewModeFor = (width: number, height: number): number =>
  width > 0 && height > 0 && width < height
    ? Camera.FOVMODE_HORIZONTAL_FIXED
    : Camera.FOVMODE_VERTICAL_FIXED;

export interface PersistentSceneResources {
  camera: ArcRotateCamera;
  engine: Engine;
  scene: Scene;
  dispose: () => void;
}

export const createPersistentScene = (
  canvas: HTMLCanvasElement,
  profile: RenderQualityProfile,
): PersistentSceneResources => {
  const engine = new Engine(
    canvas,
    false,
    {
      antialias: false,
      alpha: true,
      doNotHandleContextLost: false,
      preserveDrawingBuffer: false,
      stencil: false,
    },
    false,
  );
  engine.setHardwareScalingLevel(profile.hardwareScalingLevel);

  const scene = new Scene(engine);
  scene.clearColor = DEFAULT_CLEAR_COLOR.clone();
  scene.performancePriority = ScenePerformancePriority.Intermediate;
  scene.autoClear = true;
  scene.skipPointerMovePicking = true;

  const camera = new ArcRotateCamera(
    "explorerCamera",
    -Math.PI / 2,
    Math.PI / 2.13,
    17.2,
    Vector3.Zero(),
    scene,
  );
  camera.wheelDeltaPercentage = 0.018;
  camera.pinchDeltaPercentage = 0.008;
  camera.inertia = 0.82;

  const fitFieldOfView = (): void => {
    camera.fovMode = fieldOfViewModeFor(engine.getRenderWidth(), engine.getRenderHeight());
  };
  fitFieldOfView();
  const resizeObserver = engine.onResizeObservable.add(fitFieldOfView);

  return {
    camera,
    engine,
    scene,
    dispose: () => {
      engine.onResizeObservable.remove(resizeObserver);
      scene.dispose();
      engine.dispose();
    },
  };
};

export const resetPersistentScene = (scene: Scene, camera: ArcRotateCamera): void => {
  camera.detachControl();
  scene.clearColor = DEFAULT_CLEAR_COLOR.clone();
  scene.fogMode = Scene.FOGMODE_NONE;
  scene.fogDensity = 0;
  scene.setRenderingAutoClearDepthStencil(1, true, true, true);
};
