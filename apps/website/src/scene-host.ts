import { ArcRotateCamera } from "@babylonjs/core/Cameras/arcRotateCamera.js";
import "@babylonjs/core/Culling/ray.js";
import { Ray } from "@babylonjs/core/Culling/ray.js";
import type { Engine } from "@babylonjs/core/Engines/engine.js";
import { Color3 } from "@babylonjs/core/Maths/math.color.js";
import { Vector3 } from "@babylonjs/core/Maths/math.vector.js";
import { StandardMaterial } from "@babylonjs/core/Materials/standardMaterial.js";
import { Mesh } from "@babylonjs/core/Meshes/mesh.js";
import { MeshBuilder } from "@babylonjs/core/Meshes/meshBuilder.js";
import "@babylonjs/core/Meshes/instancedMesh.js";
import { Scene } from "@babylonjs/core/scene.js";
import type { WebXRCamera } from "@babylonjs/core/XR/webXRCamera.js";
import type { WebXRAbstractMotionController } from "@babylonjs/core/XR/motionController/webXRAbstractMotionController.js";
import type { WebXRControllerComponent } from "@babylonjs/core/XR/motionController/webXRControllerComponent.js";
import type { WebXRInputSource } from "@babylonjs/core/XR/webXRInputSource.js";
import type { WebXRDefaultExperience } from "@babylonjs/core/XR/webXRDefaultExperience.js";
import { createArPresentation } from "./ar-presentation.ts";
import {
  adaptFixedFoveation,
  adaptHardwareScaling,
  deriveRenderQuality,
  type RenderQualityProfile,
  type RenderQualityTier,
} from "./render-quality.ts";
import type { RendererStatus } from "./renderer-recovery.ts";
import {
  arrivalRadius,
  departureRadius,
  easeAway,
  easeDrift,
  easeSettle,
  travelStep,
  TRAVEL_ARRIVE_MS,
  TRAVEL_COAST_MS,
  TRAVEL_COAST_SCALE,
  TRAVEL_CROSS_MS,
  TRAVEL_DEPART_MS,
  TRAVEL_RECALL_MS,
  type TravelPhase,
} from "./travel-transition.ts";
import { advanceXrButtonPressGate, xrControllerAction } from "./xr-controller-input.ts";
import { createSceneMountSlot } from "./scene-mount.ts";
import { createSceneHostRegistry } from "./scene-host-registry.ts";
import { createPersistentScene, resetPersistentScene } from "./scene-lifecycle.ts";
import { createRenderLifecycle } from "./scene-render-lifecycle.ts";
import { createXrIntegration, type XrStatus } from "./scene-xr-integration.ts";
import { getVariantLaunchUrl, onVariantLaunchReady, type ImmersiveMode } from "./variant-launch.ts";
import { VIRTUAL_BACKGROUND_LAYER_MASK } from "./world-presentation.ts";
import type * as XrRuntime from "./xr-runtime.ts";

export type { XrStatus } from "./scene-xr-integration.ts";

// One host owns the WebGL context across every destination and WebXR session.
const XR_MOVE_SPEED = 2.2;
const VEIL_FADE_SECONDS = 0.22;

export interface MountedWorld {
  farthestView?: () => number | undefined;
  dispose: () => void;
  focusXrRig: (initial: boolean) => void;
  restoreDesktopView: () => void;
}

export interface SceneHost {
  readonly camera: ArcRotateCamera;
  readonly canvas: HTMLCanvasElement;
  readonly engine: Engine;
  readonly profile: RenderQualityProfile;
  readonly qualityTier: RenderQualityTier;
  readonly scene: Scene;
  beginTravel: () => void;
  cancelTravel: () => void;
  dispose: () => Promise<void>;
  enterImmersive: () => Promise<void>;
  getFps: () => number;
  isArSupported: () => boolean;
  isInXr: () => boolean;
  isVrSupported: () => boolean;
  onTravelPhase: (listener: (phase: TravelPhase) => void) => () => void;
  mountWorld: <World extends MountedWorld>(
    build: () => Promise<World> | World,
  ) => Promise<World | null>;
  onXrStatus: (listener: (status: XrStatus) => void) => () => void;
  onRendererStatus: (listener: (status: RendererStatus) => void) => () => void;
  prefersReducedMotion: () => boolean;
  suspendRendering: () => () => void;
  xrCamera: () => WebXRCamera | null;
}

const createSceneHost = (canvas: HTMLCanvasElement): SceneHost => {
  const deviceNavigator = window.navigator as Navigator & { deviceMemory?: number };
  const profile = deriveRenderQuality({
    userAgent: deviceNavigator.userAgent,
    pixelRatio: window.devicePixelRatio,
    hardwareConcurrency: deviceNavigator.hardwareConcurrency,
    ...(deviceNavigator.deviceMemory === undefined
      ? {}
      : { deviceMemory: deviceNavigator.deviceMemory }),
  });

  const resources = createPersistentScene(canvas, profile);
  const { camera, engine, scene } = resources;

  let isInXr = false;

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
  veil.renderingGroupId = 3;
  veil.setEnabled(false);

  const arPresentation = createArPresentation(scene);

  let veilAlpha = 0;
  let veilTarget = 0;
  let settleVeil: (() => void) | null = null;
  let rigAwaitingWorld = false;

  const resolveVeil = (): void => {
    const settle = settleVeil;
    settleVeil = null;
    settle?.();
  };

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

  let activeImmersiveMode: ImmersiveMode | null = null;
  let xrCameraLayerMask = 0x0fff_ffff;
  let disposed = false;
  let xr: WebXRDefaultExperience | null = null;
  let xrRuntime: typeof XrRuntime | null = null;
  let xrInitialization: Promise<WebXRDefaultExperience | null> | null = null;
  const boundXrControllers = new WeakSet<WebXRInputSource>();
  const boundXrMotionControllers = new WeakSet<WebXRAbstractMotionController>();
  const xrImmersiveButtonArmed = new WeakMap<WebXRControllerComponent, boolean>();
  let mountToken = 0;
  let sessionFoveation = profile.xrFixedFoveation;
  let qualitySampleSeconds = 0;

  const xrIntegration = createXrIntegration({
    getLaunchUrl: getVariantLaunchUrl,
    onLaunchReady: onVariantLaunchReady,
    xrSystem: () => navigator.xr,
  });

  const adaptSessionFoveation = (fps: number): void => {
    const sessionManager = xr?.baseExperience.sessionManager;
    if (!sessionManager?.isFixedFoveationSupported) return;
    const next = adaptFixedFoveation(sessionFoveation, fps, profile);
    if (next === sessionFoveation) return;
    sessionFoveation = next;
    sessionManager.fixedFoveation = next;
  };

  const xrPrimaryRay = new Ray(Vector3.Zero(), Vector3.Forward(), 100);
  const activateXrPrimary = (controller: WebXRInputSource): void => {
    if (!isInXr || activeImmersiveMode !== "vr") return;
    controller.getWorldPointerRayToRef(xrPrimaryRay);
    const pick = scene.pickWithRay(xrPrimaryRay);
    const metadata = pick?.pickedMesh?.metadata as
      | { exoraXrPrimaryAction?: () => void }
      | null
      | undefined;
    metadata?.exoraXrPrimaryAction?.();
  };

  scene.onBeforeRenderObservable.add(() => {
    const deltaSeconds = Math.min(engine.getDeltaTime() / 1_000, 0.05);

    if (rigAwaitingWorld && isInXr && activeImmersiveMode === "vr") {
      rigAwaitingWorld = false;
      worldMount.current?.focusXrRig(false);
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

  const renderLifecycle = createRenderLifecycle({
    engine,
    isInXr: () => isInXr,
    resizeTarget: window,
    scene,
  });

  const resetSceneDefaults = (): void => resetPersistentScene(scene, camera);

  const worldMount = createSceneMountSlot<MountedWorld>(scene, {
    beforeRemove: () => arPresentation.setWorld(null),
    prepareScene: resetSceneDefaults,
  });

  let travelPhase: TravelPhase = "idle";
  const travelListeners = new Set<(phase: TravelPhase) => void>();
  const setTravelPhase = (next: TravelPhase): void => {
    if (next === travelPhase) return;
    travelPhase = next;
    for (const listener of travelListeners) listener(next);
  };

  let travelOrigin: { lower: number | null; radius: number; upper: number | null } | null = null;
  let departure: Promise<boolean> | null = null;
  let departureClaimed = false;
  let glideFrame = 0;
  let glideDeadline = 0;
  let landGlide: ((landed: boolean) => void) | null = null;

  const prefersReducedMotion = (): boolean =>
    window.matchMedia?.("(prefers-reduced-motion: reduce)").matches === true;

  const flightRadius = (resting: number): number =>
    prefersReducedMotion()
      ? resting
      : departureRadius(resting, worldMount.current?.farthestView?.());

  const widenCameraReach = (from: number, to: number): void => {
    camera.lowerRadiusLimit = Math.min(camera.lowerRadiusLimit ?? from, from, to);
    camera.upperRadiusLimit = Math.max(camera.upperRadiusLimit ?? to, from, to);
  };

  const endGlide = (snapTo: number | null, landed: boolean): void => {
    if (glideFrame) window.cancelAnimationFrame(glideFrame);
    if (glideDeadline) window.clearTimeout(glideDeadline);
    glideFrame = 0;
    glideDeadline = 0;
    if (snapTo !== null) camera.radius = snapTo;
    const land = landGlide;
    landGlide = null;
    land?.(landed);
  };

  const glideCamera = (
    to: number,
    durationMs: number,
    ease: (progress: number) => number,
  ): Promise<boolean> => {
    endGlide(null, false);
    const from = camera.radius;
    widenCameraReach(from, to);
    if (prefersReducedMotion()) {
      camera.radius = to;
      return Promise.resolve(true);
    }

    camera.detachControl();
    const startedAt = performance.now();
    return new Promise<boolean>((resolve) => {
      landGlide = resolve;
      const step = (): void => {
        const flown = travelStep(from, to, performance.now() - startedAt, durationMs, ease);
        widenCameraReach(from, to);
        camera.radius = flown.radius;
        if (flown.settled) {
          endGlide(null, true);
          return;
        }
        glideFrame = window.requestAnimationFrame(step);
      };
      glideFrame = window.requestAnimationFrame(step);
      glideDeadline = window.setTimeout(() => endGlide(to, true), durationMs + 600);
    });
  };

  const beginTravel = (): void => {
    if (disposed || isInXr || !worldMount.current || departure) return;
    travelOrigin = {
      lower: camera.lowerRadiusLimit,
      radius: camera.radius,
      upper: camera.upperRadiusLimit,
    };
    departureClaimed = false;
    setTravelPhase("departing");
    const far = flightRadius(camera.radius);
    departure = glideCamera(far, TRAVEL_DEPART_MS, easeAway).then((landed) => {
      if (landed && !departureClaimed && !disposed) {
        void glideCamera(far * TRAVEL_COAST_SCALE, TRAVEL_COAST_MS, easeDrift);
      }
      return landed;
    });
  };

  const cancelTravel = (): void => {
    const origin = travelOrigin;
    if (!origin || travelPhase !== "departing") return;
    departure = null;
    travelOrigin = null;
    setTravelPhase("arriving");
    void glideCamera(origin.radius, TRAVEL_RECALL_MS, easeSettle).then((landed) => {
      if (!landed || disposed) return;
      camera.lowerRadiusLimit = origin.lower;
      camera.upperRadiusLimit = origin.upper;
      if (!isInXr) camera.attachControl(canvas, true);
      setTravelPhase("idle");
    });
  };

  const departFromWorld = async (): Promise<void> => {
    if (isInXr) return;
    if (!departure) beginTravel();
    departureClaimed = true;
    await departure;
    setTravelPhase("crossing");
    await new Promise<void>((resolve) => window.setTimeout(resolve, TRAVEL_CROSS_MS));
  };

  const arriveAtWorld = (mounted: number): void => {
    departure = null;
    departureClaimed = false;
    travelOrigin = null;
    if (isInXr) {
      setTravelPhase("idle");
      return;
    }

    const resting = camera.radius;
    const lower = camera.lowerRadiusLimit;
    const upper = camera.upperRadiusLimit;
    const near = arrivalRadius(resting, lower ?? undefined);
    widenCameraReach(near, resting);
    camera.radius = near;

    const settle = (): void => {
      if (disposed || mounted !== mountToken) return;
      setTravelPhase("arriving");
      void glideCamera(resting, TRAVEL_ARRIVE_MS, easeSettle).then((landed) => {
        if (!landed || disposed) return;
        camera.lowerRadiusLimit = lower;
        camera.upperRadiusLimit = upper;
        if (!isInXr) camera.attachControl(canvas, true);
        setTravelPhase("idle");
      });
    };

    let started = false;
    const startOnce = (): void => {
      if (started) return;
      started = true;
      scene.onAfterRenderObservable.remove(firstDrawn);
      window.clearTimeout(drawDeadline);
      settle();
    };
    const firstDrawn = scene.onAfterRenderObservable.add(() => startOnce());
    const drawDeadline = window.setTimeout(startOnce, 400);
  };

  const mountWorld = async <World extends MountedWorld>(
    build: () => Promise<World> | World,
  ): Promise<World | null> => {
    const token = (mountToken += 1);
    if (worldMount.current) {
      await fadeVeil(1);
      await departFromWorld();
    }
    if (token !== mountToken || disposed) return null;

    let world: World | null;
    try {
      world = await worldMount.replace(build, () => token === mountToken && !disposed);
    } catch (error) {
      void fadeVeil(0);
      endGlide(null, false);
      departure = null;
      travelOrigin = null;
      setTravelPhase("idle");
      renderLifecycle.fail();
      throw error;
    }
    if (!world) return null;

    arPresentation.setWorld(worldMount.scope?.presentation ?? null);
    rigAwaitingWorld = isInXr && activeImmersiveMode === "vr";
    void fadeVeil(0);
    arriveAtWorld(token);
    if (!renderLifecycle.isRunning) renderLifecycle.renderFrame();
    engine.performanceMonitor.reset();
    qualitySampleSeconds = 0;
    return world;
  };

  const initializeXr = async (): Promise<WebXRDefaultExperience | null> => {
    try {
      const runtime = await import("./xr-runtime.ts");
      xrRuntime = runtime;
      const createdXr = await runtime.WebXRDefaultExperience.CreateAsync(scene, {
        disableDefaultUI: true,
        disableNearInteraction: true,
        disablePointerSelection: true,
        disableTeleportation: true,
        handSupportOptions: { handMeshes: { disableDefaultMeshes: true } },
        inputOptions: { doNotLoadControllerMeshes: true },
        optionalFeatures: ["hand-tracking"],
        outputCanvasOptions: {
          canvasOptions: {
            alpha: true,
            antialias: false,
            depth: true,
            stencil: false,
            framebufferScaleFactor: profile.xrFramebufferScaleFactor,
          },
        },
      });
      if (disposed) {
        createdXr.dispose();
        return null;
      }

      xr = createdXr;
      createdXr.baseExperience.featuresManager.enableFeature(
        runtime.WebXRFeatureName.MOVEMENT,
        "latest",
        {
          movementEnabled: true,
          movementOrientationFollowsController: false,
          movementOrientationFollowsViewerPose: true,
          movementSpeed: XR_MOVE_SPEED,
          movementThreshold: 0.16,
          rotationEnabled: true,
          rotationSpeed: 0.42,
          rotationThreshold: 0.18,
          xrInput: createdXr.input,
        },
      );
      let changingVr = false;
      const toggleVr = async (): Promise<void> => {
        if (changingVr) return;
        changingVr = true;
        try {
          if (isInXr) {
            if (activeImmersiveMode === "vr") {
              await createdXr.baseExperience.sessionManager.exitXRAsync();
            }
            return;
          }
          if (!xrIntegration.isVrSupported()) return;
          activeImmersiveMode = "vr";
          await createdXr.baseExperience.enterXRAsync(
            "immersive-vr",
            "local-floor",
            createdXr.renderTarget,
          );
        } catch (error) {
          activeImmersiveMode = null;
          xrIntegration.markReady();
          console.error("[xr] controller VR toggle failed", error);
        } finally {
          changingVr = false;
        }
      };
      const bindXrMotionController = (
        controller: WebXRInputSource,
        motionController: WebXRAbstractMotionController,
      ): void => {
        if (boundXrMotionControllers.has(motionController)) return;
        boundXrMotionControllers.add(motionController);
        for (const id of motionController.getComponentIds()) {
          const component = motionController.getComponent(id);
          if (!component) continue;
          const action = xrControllerAction(id);
          if (action !== "immersive" && action !== "primary") continue;
          if (action === "immersive") xrImmersiveButtonArmed.set(component, !component.pressed);
          component.onButtonStateChangedObservable.add((changed) => {
            const pressed = changed.changes.pressed?.current;
            if (id === "a-button" || id === "x-button") {
              if (pressed === true) activateXrPrimary(controller);
              return;
            }
            if (action === "immersive" && pressed !== undefined) {
              const gate = advanceXrButtonPressGate(
                xrImmersiveButtonArmed.get(component) ?? false,
                pressed,
              );
              xrImmersiveButtonArmed.set(component, gate.armed);
              if (gate.activate) void toggleVr();
              return;
            }
          });
        }
      };
      const bindXrController = (controller: WebXRInputSource): void => {
        if (boundXrControllers.has(controller)) return;
        boundXrControllers.add(controller);
        const motionController = controller.motionController;
        if (motionController) bindXrMotionController(controller, motionController);
        controller.onMotionControllerInitObservable.add((initializedMotionController) =>
          bindXrMotionController(controller, initializedMotionController),
        );
      };
      for (const controller of createdXr.input.controllers) bindXrController(controller);
      createdXr.input.onControllerAddedObservable.add(bindXrController);
      createdXr.baseExperience.onInitialXRPoseSetObservable.add(() => {
        if (activeImmersiveMode === "vr") worldMount.current?.focusXrRig(true);
      });

      createdXr.baseExperience.onStateChangedObservable.add((state) => {
        if (disposed) return;
        if (state === runtime.WebXRState.ENTERING_XR) xrIntegration.markEntering();
        if (state === runtime.WebXRState.IN_XR) {
          isInXr = true;
          renderLifecycle.start();
          sessionFoveation = profile.xrFixedFoveation;
          if (createdXr.baseExperience.sessionManager.isFixedFoveationSupported) {
            createdXr.baseExperience.sessionManager.fixedFoveation = sessionFoveation;
          }
          xrIntegration.markInXr();
        }
        if (state === runtime.WebXRState.NOT_IN_XR) {
          const endedMode = activeImmersiveMode;
          isInXr = false;
          if (renderLifecycle.suspensionCount > 0) renderLifecycle.stop();
          rigAwaitingWorld = false;
          veilTarget = 0;
          veilAlpha = 0;
          veilMaterial.alpha = 0;
          veil.setEnabled(false);
          resolveVeil();
          if (endedMode === "ar") {
            arPresentation.end();
            createdXr.baseExperience.camera.layerMask = xrCameraLayerMask;
            createdXr.baseExperience.featuresManager.disableFeature(
              runtime.WebXRFeatureName.HIT_TEST,
            );
            createdXr.baseExperience.featuresManager.disableFeature(
              runtime.WebXRFeatureName.DOM_OVERLAY,
            );
          }
          activeImmersiveMode = null;
          worldMount.current?.restoreDesktopView();
          xrIntegration.markReady();
        }
      });
      return createdXr;
    } catch (error) {
      xrInitialization = null;
      if (!disposed) xrIntegration.markReady();
      console.error("[xr] failed to initialize", error);
      return null;
    }
  };

  const ensureXr = (): Promise<WebXRDefaultExperience | null> => {
    if (xr) return Promise.resolve(xr);
    xrInitialization ??= initializeXr();
    return xrInitialization;
  };

  const sceneHost: SceneHost = {
    camera,
    canvas,
    engine,
    profile,
    scene,
    qualityTier: profile.tier,
    beginTravel,
    cancelTravel,
    prefersReducedMotion,
    getFps: () => engine.getFps(),
    isArSupported: xrIntegration.isArSupported,
    isInXr: () => isInXr,
    isVrSupported: xrIntegration.isVrSupported,
    mountWorld,
    suspendRendering: renderLifecycle.suspend,
    xrCamera: () => xr?.baseExperience.camera ?? null,
    onXrStatus: xrIntegration.onStatus,
    onRendererStatus: renderLifecycle.onStatus,
    onTravelPhase: (listener) => {
      travelListeners.add(listener);
      listener(travelPhase);
      return () => travelListeners.delete(listener);
    },
    enterImmersive: async () => {
      const destination = xrIntegration.destination;
      if (!destination) return;
      if (destination.launchUrl) {
        window.location.assign(destination.launchUrl);
        return;
      }
      const readyXr = await ensureXr();
      const runtime = xrRuntime;
      if (!readyXr || !runtime) return;

      activeImmersiveMode = destination.mode;
      if (destination.mode === "vr") {
        await readyXr.baseExperience.enterXRAsync(
          "immersive-vr",
          "local-floor",
          readyXr.renderTarget,
        );
        return;
      }

      const features = readyXr.baseExperience.featuresManager;
      try {
        const hitTest = features.enableFeature(
          runtime.WebXRFeatureName.HIT_TEST,
          "latest",
          { enableTransientHitTest: false },
          true,
          true,
        );
        features.enableFeature(
          runtime.WebXRFeatureName.DOM_OVERLAY,
          "latest",
          { element: arPresentation.overlay, supressXRSelectEvents: false },
          true,
          false,
        );
        const arCamera = readyXr.baseExperience.camera;
        xrCameraLayerMask = arCamera.layerMask;
        arCamera.layerMask &= ~VIRTUAL_BACKGROUND_LAYER_MASK;
        arPresentation.begin(
          hitTest,
          readyXr.baseExperience.sessionManager,
          worldMount.scope?.presentation ?? null,
          (spaceBackground) => {
            arCamera.layerMask = spaceBackground
              ? xrCameraLayerMask
              : xrCameraLayerMask & ~VIRTUAL_BACKGROUND_LAYER_MASK;
          },
        );
        await readyXr.baseExperience.enterXRAsync("immersive-ar", "local", readyXr.renderTarget);
      } catch (error) {
        arPresentation.end();
        readyXr.baseExperience.camera.layerMask = xrCameraLayerMask;
        features.disableFeature(runtime.WebXRFeatureName.HIT_TEST);
        features.disableFeature(runtime.WebXRFeatureName.DOM_OVERLAY);
        activeImmersiveMode = null;
        xrIntegration.markReady();
        throw error;
      }
    },
    dispose: async () => {
      if (disposed) return;
      disposed = true;
      sceneHostRegistry.forget(sceneHost);
      travelListeners.clear();
      endGlide(null, false);
      xrIntegration.dispose();
      renderLifecycle.dispose();
      const worldDisposed = worldMount.dispose();
      arPresentation.dispose();
      xr?.dispose();
      xr = null;
      await worldDisposed;
      resources.dispose();
    },
  };
  return sceneHost;
};

const sceneHostRegistry = createSceneHostRegistry(createSceneHost);

export const acquireSceneHost = (canvas: HTMLCanvasElement): SceneHost => {
  return sceneHostRegistry.acquire(canvas);
};

export const recreateSceneHost = (canvas: HTMLCanvasElement): Promise<SceneHost> => {
  return sceneHostRegistry.recreate(canvas);
};
