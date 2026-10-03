import { ArcRotateCamera } from "@babylonjs/core/Cameras/arcRotateCamera.js";
import "@babylonjs/core/Culling/ray.js";
import type { Engine } from "@babylonjs/core/Engines/engine.js";
import "@babylonjs/core/Meshes/instancedMesh.js";
import { Scene } from "@babylonjs/core/scene.js";
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
import { createSceneMountSlot } from "./scene-mount.ts";
import { createSceneHostRegistry } from "./scene-host-registry.ts";
import { createPersistentScene, resetPersistentScene } from "./scene-lifecycle.ts";
import { createRenderLifecycle } from "./scene-render-lifecycle.ts";
import { createXrIntegration, type XrStatus } from "./scene-xr-integration.ts";
import { getVariantLaunchUrl, onVariantLaunchReady } from "./variant-launch.ts";
import { VIRTUAL_BACKGROUND_LAYER_MASK } from "./virtual-background.ts";
import type * as XrRuntime from "./xr-runtime.ts";

export type { XrStatus } from "./scene-xr-integration.ts";

// One host owns the WebGL context across every destination and WebXR session.

export interface MountedWorld {
  farthestView?: () => number | undefined;
  dispose: () => void;
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
  onTravelPhase: (listener: (phase: TravelPhase) => void) => () => void;
  mountWorld: <World extends MountedWorld>(
    build: () => Promise<World> | World,
  ) => Promise<World | null>;
  onXrStatus: (listener: (status: XrStatus) => void) => () => void;
  onRendererStatus: (listener: (status: RendererStatus) => void) => () => void;
  prefersReducedMotion: () => boolean;
  suspendRendering: () => () => void;
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

  const arPresentation = createArPresentation(scene);

  let arActive = false;
  let xrCameraLayerMask = 0x0fff_ffff;
  let disposed = false;
  let xr: WebXRDefaultExperience | null = null;
  let xrRuntime: typeof XrRuntime | null = null;
  let xrInitialization: Promise<WebXRDefaultExperience | null> | null = null;
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

  scene.onBeforeRenderObservable.add(() => {
    const deltaSeconds = Math.min(engine.getDeltaTime() / 1_000, 0.05);

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

  let hasArrivedOnce = false;
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
    // The first world of a session has nothing to arrive from, so it opens at its resting view.
    if (isInXr || !hasArrivedOnce) {
      hasArrivedOnce = true;
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
    if (worldMount.current) await departFromWorld();
    if (token !== mountToken || disposed) return null;

    let world: World | null;
    try {
      world = await worldMount.replace(build, () => token === mountToken && !disposed);
    } catch (error) {
      endGlide(null, false);
      departure = null;
      travelOrigin = null;
      setTravelPhase("idle");
      renderLifecycle.fail();
      throw error;
    }
    if (!world) return null;

    arPresentation.setWorld(worldMount.scope?.presentation ?? null);
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
        disableHandTracking: true,
        disableNearInteraction: true,
        disablePointerSelection: true,
        disableTeleportation: true,
        inputOptions: { doNotLoadControllerMeshes: true },
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
          isInXr = false;
          if (renderLifecycle.suspensionCount > 0) renderLifecycle.stop();
          if (arActive) {
            arPresentation.end();
            createdXr.baseExperience.camera.layerMask = xrCameraLayerMask;
            createdXr.baseExperience.featuresManager.disableFeature(
              runtime.WebXRFeatureName.HIT_TEST,
            );
            createdXr.baseExperience.featuresManager.disableFeature(
              runtime.WebXRFeatureName.DOM_OVERLAY,
            );
          }
          arActive = false;
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
    mountWorld,
    suspendRendering: renderLifecycle.suspend,
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

      arActive = true;
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
        arActive = false;
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
