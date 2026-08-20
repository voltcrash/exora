/**
 * The renderer that outlives every world.
 *
 * A WebXR session belongs to the WebGL context it was opened against. Exora used to give each
 * destination its own Babylon engine, so travelling from a world to its host star disposed the
 * context the session was running on: the headset dropped back to the panel, the next scene
 * booted, and the wearer had to be pulled back into VR through a second permission-free but very
 * visible re-entry. Two black transitions and a compositor hand-off for what should be a step
 * across a room.
 *
 * So the engine, the scene, the desktop camera, the immersive session and the in-headset console
 * all live here, for as long as the page does, and a destination is just the *contents* of that
 * one scene. Travelling swaps the contents. The session never notices.
 *
 * What the host owns, no world may dispose; what a world adds, `world-scope.ts` takes back out.
 */

import { ArcRotateCamera } from "@babylonjs/core/Cameras/arcRotateCamera.js";
import "@babylonjs/core/Culling/ray.js";
import { Engine } from "@babylonjs/core/Engines/engine.js";
import { Color3, Color4 } from "@babylonjs/core/Maths/math.color.js";
import { Vector3 } from "@babylonjs/core/Maths/math.vector.js";
import { StandardMaterial } from "@babylonjs/core/Materials/standardMaterial.js";
import { Mesh } from "@babylonjs/core/Meshes/mesh.js";
import { MeshBuilder } from "@babylonjs/core/Meshes/meshBuilder.js";
import "@babylonjs/core/Meshes/instancedMesh.js";
import { Scene, ScenePerformancePriority } from "@babylonjs/core/scene.js";
import type { WebXRCamera } from "@babylonjs/core/XR/webXRCamera.js";
import { WebXRDefaultExperience } from "@babylonjs/core/XR/webXRDefaultExperience.js";
import "@babylonjs/core/XR/features/WebXRControllerMovement.js";
import "@babylonjs/core/XR/features/WebXRControllerPointerSelection.js";
import "@babylonjs/core/XR/features/WebXRControllerTeleportation.js";
import "@babylonjs/core/XR/features/WebXRHandTracking.js";
import { WebXRFeatureName } from "@babylonjs/core/XR/webXRFeaturesManager.js";
import { WebXRState } from "@babylonjs/core/XR/webXRTypes.js";
import {
  adaptFixedFoveation,
  adaptHardwareScaling,
  deriveRenderQuality,
  type RenderQualityProfile,
  type RenderQualityTier,
} from "./render-quality.ts";
import { createXrConsole, type XrConsole, type XrConsoleHost } from "./xr-console.ts";
import { openWorldScope, type WorldScope } from "./world-scope.ts";

export type XrStatus = "checking" | "entering" | "in-xr" | "ready" | "unavailable";

/** Locomotion speed inside a session, shared by every destination so travel never changes feel. */
const XR_MOVE_SPEED = 2.2;
const DEFAULT_CLEAR_COLOR = new Color4(0.0015, 0.003, 0.008, 1);
/** How long the in-headset fade takes in each direction. */
const VEIL_FADE_SECONDS = 0.22;

/** Everything a world contributes to the console, minus the parts the host answers for itself. */
export type WorldConsole = Omit<XrConsoleHost, "onExit">;

/** A destination occupying the shared scene. */
export interface MountedWorld {
  console: WorldConsole;
  /** Releases anything the world holds outside the scene: listeners, observers, effect layers. */
  dispose: () => void;
  /**
   * Puts the immersive rig where this world expects a visitor to stand.
   *
   * `initial` marks the very first pose of a session, before Babylon has added the wearer's real
   * height to the rig; every later call happens mid-session, where the height is already there.
   */
  focusXrRig: (initial: boolean) => void;
  /** Restores the desktop camera so leaving the headset lands on the view the wearer left in. */
  restoreDesktopView: () => void;
}

export interface SceneHost {
  readonly camera: ArcRotateCamera;
  readonly canvas: HTMLCanvasElement;
  readonly engine: Engine;
  readonly profile: RenderQualityProfile;
  readonly qualityTier: RenderQualityTier;
  readonly scene: Scene;
  dispose: () => void;
  enterVr: () => Promise<void>;
  getFps: () => number;
  isInXr: () => boolean;
  isVrSupported: () => boolean;
  /**
   * Replaces the world in the shared scene, without touching a running session.
   *
   * Resolves with the mounted world, or with null when a later travel request overtook this one
   * while the screen was fading — in that case nothing was built and nothing needs releasing.
   */
  mountWorld: <World extends MountedWorld>(build: () => World) => Promise<World | null>;
  /** Repaints the console, for when a world's own entries change after it was mounted. */
  refreshConsole: () => void;
  /** Subscribes to immersive status, called immediately with the current one. */
  onXrStatus: (listener: (status: XrStatus) => void) => () => void;
  xrCamera: () => WebXRCamera | null;
}

const createSceneHost = (canvas: HTMLCanvasElement): SceneHost => {
  const deviceNavigator = window.navigator as Navigator & { deviceMemory?: number };
  const profile = deriveRenderQuality({
    userAgent: deviceNavigator.userAgent,
    pixelRatio: window.devicePixelRatio,
    hardwareConcurrency: deviceNavigator.hardwareConcurrency,
    deviceMemory: deviceNavigator.deviceMemory,
  });

  const engine = new Engine(
    canvas,
    profile.tier === "desktop",
    { antialias: profile.tier === "desktop", preserveDrawingBuffer: false, stencil: false },
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

  let isInXr = false;

  /**
   * The black shell the wearer is inside during a jump.
   *
   * Building a world is thousands of lines of synchronous geometry and shader work, which stalls
   * the session's frame loop for as long as it runs. Fading to black first means the frame the
   * compositor holds through the stall is a black one, so the stall reads as a blink rather than
   * a freeze — and the new world arrives faded in rather than cutting in around the wearer.
   */
  const veilMaterial = new StandardMaterial("travelVeilMaterial", scene);
  veilMaterial.disableLighting = true;
  veilMaterial.diffuseColor = Color3.Black();
  veilMaterial.emissiveColor = Color3.Black();
  veilMaterial.specularColor = Color3.Black();
  veilMaterial.disableDepthWrite = true;
  veilMaterial.alpha = 0;
  const veil = MeshBuilder.CreateSphere(
    "travelVeil",
    { diameter: 0.8, segments: 10, sideOrientation: Mesh.BACKSIDE },
    scene,
  );
  veil.material = veilMaterial;
  veil.isPickable = false;
  veil.applyFog = false;
  veil.alwaysSelectAsActiveMesh = true;
  // Above the console's own group, so a jump hides the panel the wearer travelled from.
  veil.renderingGroupId = 3;
  veil.setEnabled(false);

  let veilAlpha = 0;
  let veilTarget = 0;
  let settleVeil: (() => void) | null = null;
  /**
   * Set when a newly mounted world still has to be handed the immersive rig.
   *
   * Positioning the rig reads the wearer's real height, which Babylon answers from the live
   * XRFrame — and an XRFrame may only be touched inside the callback that produced it. Travel is
   * driven from a promise continuation, so the move waits for the next frame instead.
   */
  let rigAwaitingWorld = false;

  const resolveVeil = (): void => {
    const settle = settleVeil;
    settleVeil = null;
    settle?.();
  };

  /** Drives the veil to `target`, resolving once it is there (or immediately, outside a session). */
  const fadeVeil = async (target: number): Promise<void> => {
    if (!isInXr) {
      veilTarget = 0;
      veilAlpha = 0;
      veilMaterial.alpha = 0;
      veil.setEnabled(false);
      return;
    }
    resolveVeil();
    veilTarget = target;
    if (veilAlpha === veilTarget) return;
    await new Promise<void>((resolve) => {
      settleVeil = resolve;
    });
  };

  let isVrSupported = false;
  let disposed = false;
  let xr: WebXRDefaultExperience | null = null;
  let xrConsole: XrConsole | null = null;
  let currentWorld: MountedWorld | null = null;
  let currentScope: WorldScope | null = null;
  let mountToken = 0;
  let sessionFoveation = profile.xrFixedFoveation;
  let qualitySampleSeconds = 0;

  let xrStatus: XrStatus = "checking";
  const statusListeners = new Set<(status: XrStatus) => void>();
  const setXrStatus = (next: XrStatus): void => {
    xrStatus = next;
    for (const listener of statusListeners) listener(next);
  };

  /**
   * Trades peripheral sharpness for frame rate while the headset is on.
   *
   * Canvas resolution is fixed for the lifetime of a session, so foveation is the only lever
   * left; a Quest 2 that starts missing 72 Hz recovers by blurring further from the eye.
   */
  const adaptSessionFoveation = (fps: number): void => {
    const sessionManager = xr?.baseExperience.sessionManager;
    if (!sessionManager?.isFixedFoveationSupported) return;
    const next = adaptFixedFoveation(sessionFoveation, fps, profile);
    if (next === sessionFoveation) return;
    sessionFoveation = next;
    sessionManager.fixedFoveation = next;
  };

  scene.onBeforeRenderObservable.add(() => {
    const deltaSeconds = Math.min(engine.getDeltaTime() / 1_000, 0.05);

    // Inside an XR session this observer runs within the frame callback, which is the only place
    // the rig's pose may be read. The veil is still opaque here, so the move is never seen.
    if (rigAwaitingWorld && isInXr) {
      rigAwaitingWorld = false;
      currentWorld?.focusXrRig(false);
      xrConsole?.recall();
    }

    if (veilAlpha !== veilTarget || veil.isEnabled()) {
      const step = deltaSeconds / VEIL_FADE_SECONDS;
      veilAlpha =
        veilTarget > veilAlpha
          ? Math.min(veilTarget, veilAlpha + step)
          : Math.max(veilTarget, veilAlpha - step);
      veilMaterial.alpha = veilAlpha;
      veil.setEnabled(veilAlpha > 0.001);
      const eye = scene.activeCamera?.globalPosition;
      if (eye) veil.position.copyFrom(eye);
      if (veilAlpha === veilTarget) resolveVeil();
    }

    // Locomotion owns the XR rig after entry. Rewriting its position here causes visible
    // snap-backs on room-scale headsets, so only the head-locked console needs a frame update.
    if (isInXr) xrConsole?.update(deltaSeconds);

    qualitySampleSeconds += deltaSeconds;
    if (qualitySampleSeconds >= 3) {
      qualitySampleSeconds = 0;
      if (isInXr) {
        adaptSessionFoveation(engine.getFps());
      } else {
        const currentLevel = engine.getHardwareScalingLevel();
        const nextLevel = adaptHardwareScaling(currentLevel, engine.getFps(), profile, false);
        if (nextLevel !== currentLevel) {
          engine.setHardwareScalingLevel(nextLevel);
          engine.resize();
        }
      }
    }
  });

  engine.runRenderLoop(() => scene.render());

  const resize = (): void => engine.resize();
  window.addEventListener("resize", resize);

  /**
   * The console is built once and outlives every world, so it keeps its page, its search results
   * and its position across a jump. Its scene-specific half is read through here.
   */
  const consoleHost: XrConsoleHost = {
    facts: () => currentWorld?.console.facts() ?? [],
    onExit: () => void xr?.baseExperience.exitXRAsync(),
    onForgePlanet: (world) => currentWorld?.console.onForgePlanet?.(world),
    onForgeStar: (star) => currentWorld?.console.onForgeStar?.(star),
    onTravelPlanet: (planet) => currentWorld?.console.onTravelPlanet?.(planet),
    onTravelStar: (star) => currentWorld?.console.onTravelStar?.(star),
    sceneActions: () => currentWorld?.console.sceneActions() ?? [],
    source: () => currentWorld?.console.source() ?? "",
    subtitle: () => currentWorld?.console.subtitle() ?? "",
    summary: () => currentWorld?.console.summary() ?? "",
    title: () => currentWorld?.console.title() ?? "Exora",
  };

  /** Undoes the scene-level settings a world is allowed to change, before the next one lands. */
  const resetSceneDefaults = (): void => {
    camera.detachControl();
    scene.clearColor = DEFAULT_CLEAR_COLOR.clone();
    scene.fogMode = Scene.FOGMODE_NONE;
    scene.fogDensity = 0;
    scene.setRenderingAutoClearDepthStencil(1, true, true, true);
  };

  const mountWorld = async <World extends MountedWorld>(
    build: () => World,
  ): Promise<World | null> => {
    const token = (mountToken += 1);
    // The outgoing world keeps rendering through the fade, so the jump never shows an empty sky.
    if (currentWorld) await fadeVeil(1);
    if (token !== mountToken || disposed) return null;

    currentWorld?.dispose();
    currentScope?.dispose();
    currentWorld = null;
    currentScope = null;
    resetSceneDefaults();

    // Nothing may interleave between opening the scope and sealing it: the scope's reading of
    // what the world added depends on the build being uninterrupted. See `world-scope.ts`.
    const scope = openWorldScope(scene);
    let world: World;
    try {
      world = build();
    } catch (error) {
      // A build that failed part-way still left geometry in a scene that is not thrown away any
      // more, so the half-built world is swept out before the failure is reported.
      scope.seal();
      scope.dispose();
      xrConsole?.refresh();
      void fadeVeil(0);
      throw error;
    }
    scope.seal();

    currentScope = scope;
    currentWorld = world;
    rigAwaitingWorld = isInXr;
    xrConsole?.refresh();
    void fadeVeil(0);
    return world;
  };

  setXrStatus("checking");
  void WebXRDefaultExperience.CreateAsync(scene, {
    disableDefaultUI: true,
    disableNearInteraction: true,
    disableTeleportation: true,
    // The rigged hand mesh is a remote glTF and no loader is bundled, so joint spheres are used.
    handSupportOptions: { handMeshes: { disableDefaultMeshes: true } },
    inputOptions: { doNotLoadControllerMeshes: true },
    optionalFeatures: ["hand-tracking"],
    outputCanvasOptions: {
      canvasOptions: {
        // Quest 2's compositor is unreliable with an explicitly opaque WebGL layer. Babylon's
        // compatible default is alpha-enabled; the scene still clears to opaque black each frame.
        alpha: true,
        antialias: false,
        depth: true,
        stencil: false,
        framebufferScaleFactor: profile.xrFramebufferScaleFactor,
      },
    },
  })
    .then(async (createdXr) => {
      if (disposed) {
        createdXr.dispose();
        return;
      }

      xr = createdXr;
      createdXr.baseExperience.featuresManager.enableFeature(WebXRFeatureName.MOVEMENT, "latest", {
        movementEnabled: true,
        movementOrientationFollowsController: false,
        movementOrientationFollowsViewerPose: true,
        movementSpeed: XR_MOVE_SPEED,
        movementThreshold: 0.16,
        rotationEnabled: true,
        rotationSpeed: 0.42,
        rotationThreshold: 0.18,
        xrInput: createdXr.input,
      });
      xrConsole = createXrConsole(scene, consoleHost, profile.anisotropicFiltering);
      xrConsole.attach(createdXr);

      // The rig lands wherever the headset happens to face, so the view has to be aimed at the
      // subject; otherwise the session opens on empty starfield and looks broken.
      createdXr.baseExperience.onInitialXRPoseSetObservable.add(() => {
        currentWorld?.focusXrRig(true);
      });

      createdXr.baseExperience.onStateChangedObservable.add((state) => {
        if (disposed) return;
        if (state === WebXRState.ENTERING_XR) {
          setXrStatus("entering");
        }
        if (state === WebXRState.IN_XR) {
          isInXr = true;
          sessionFoveation = profile.xrFixedFoveation;
          if (createdXr.baseExperience.sessionManager.isFixedFoveationSupported) {
            createdXr.baseExperience.sessionManager.fixedFoveation = sessionFoveation;
          }
          xrConsole?.setVisible(true);
          setXrStatus("in-xr");
        }
        if (state === WebXRState.NOT_IN_XR) {
          isInXr = false;
          rigAwaitingWorld = false;
          xrConsole?.setVisible(false);
          // A session ending mid-jump would otherwise leave a fade waiting for frames that only
          // arrive inside the headset.
          veilTarget = 0;
          veilAlpha = 0;
          veilMaterial.alpha = 0;
          veil.setEnabled(false);
          resolveVeil();
          currentWorld?.restoreDesktopView();
          setXrStatus(isVrSupported ? "ready" : "unavailable");
        }
      });

      isVrSupported =
        await createdXr.baseExperience.sessionManager.isSessionSupportedAsync("immersive-vr");
      if (disposed) {
        createdXr.dispose();
        if (xr === createdXr) xr = null;
        return;
      }
      setXrStatus(isVrSupported ? "ready" : "unavailable");
    })
    .catch(() => {
      if (!disposed) setXrStatus("unavailable");
    });

  return {
    camera,
    canvas,
    engine,
    profile,
    scene,
    qualityTier: profile.tier,
    getFps: () => engine.getFps(),
    isInXr: () => isInXr,
    isVrSupported: () => isVrSupported,
    mountWorld,
    refreshConsole: () => xrConsole?.refresh(),
    xrCamera: () => xr?.baseExperience.camera ?? null,
    onXrStatus: (listener) => {
      statusListeners.add(listener);
      listener(xrStatus);
      return () => statusListeners.delete(listener);
    },
    enterVr: async () => {
      if (!xr || !isVrSupported) return;
      // Babylon appends the reference space and every enabled optional feature (including
      // hand tracking) to the session request, so nothing has to be listed by hand here.
      await xr.baseExperience.enterXRAsync("immersive-vr", "local-floor", xr.renderTarget);
    },
    dispose: () => {
      if (disposed) return;
      disposed = true;
      window.removeEventListener("resize", resize);
      currentWorld?.dispose();
      currentScope?.dispose();
      currentWorld = null;
      currentScope = null;
      xrConsole?.dispose();
      xrConsole = null;
      xr?.dispose();
      xr = null;
      engine.stopRenderLoop();
      scene.dispose();
      engine.dispose();
    },
  };
};

let host: SceneHost | null = null;

/**
 * The one renderer for the page.
 *
 * The React tree swaps a planet view for a star view by unmounting one component and mounting
 * another, but the canvas and everything attached to it must survive that — losing the WebGL
 * context is exactly what used to end the immersive session.
 */
export const acquireSceneHost = (canvas: HTMLCanvasElement): SceneHost => {
  if (host && host.canvas === canvas) return host;
  host?.dispose();
  host = createSceneHost(canvas);
  return host;
};
