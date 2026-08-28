import { ArcRotateCamera } from "@babylonjs/core/Cameras/arcRotateCamera.js";
import { Engine } from "@babylonjs/core/Engines/engine.js";
import { Color4 } from "@babylonjs/core/Maths/math.color.js";
import { Vector3 } from "@babylonjs/core/Maths/math.vector.js";
import { Scene, ScenePerformancePriority } from "@babylonjs/core/scene.js";
import type { RenderQualityProfile } from "./render-quality.ts";

const DEFAULT_CLEAR_COLOR = new Color4(0.0015, 0.003, 0.008, 1);

export interface PersistentSceneResources {
  camera: ArcRotateCamera;
  engine: Engine;
  scene: Scene;
  /** Releases the page-lifetime resources. Worlds are removed separately before this is called. */
  dispose: () => void;
}

/** Creates the one Babylon engine, scene, and desktop camera that every destination shares. */
export const createPersistentScene = (
  canvas: HTMLCanvasElement,
  profile: RenderQualityProfile,
): PersistentSceneResources => {
  const engine = new Engine(
    canvas,
    // Native-density Retina rendering plus MSAA can require several full-size GPU buffers before
    // the first world is even mounted. The scene's procedural edges are already filtered by its
    // material shaders; keeping MSAA off avoids a context-loss spiral on browsers with tighter
    // per-tab GPU budgets.
    false,
    {
      antialias: false,
      // Variant Launch composites the iPhone camera behind the page. The WebGL context therefore
      // needs an alpha channel even though desktop and immersive VR still clear it opaquely.
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
  // The intermediate priority also turns off the colour clear, which leaves each eye smearing
  // the previous frame in an immersive session. Nothing here paints every pixel, so clear.
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

  return {
    camera,
    engine,
    scene,
    dispose: () => {
      scene.dispose();
      engine.dispose();
    },
  };
};

/** Undoes scene-level settings a world may change without touching host-owned resources. */
export const resetPersistentScene = (scene: Scene, camera: ArcRotateCamera): void => {
  camera.detachControl();
  scene.clearColor = DEFAULT_CLEAR_COLOR.clone();
  scene.fogMode = Scene.FOGMODE_NONE;
  scene.fogDensity = 0;
  scene.setRenderingAutoClearDepthStencil(1, true, true, true);
};
