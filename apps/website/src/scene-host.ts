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
 * So the engine, the scene, the desktop camera, the immersive session and the in-headset Discover
 * all live here, for as long as the page does, and a destination is just the *contents* of that
 * one scene. Travelling swaps the contents. The session never notices.
 *
 * What the host owns, no world may dispose; what a world adds, `world-scope.ts` takes back out.
 */

import type { ExoplanetProfile, StarProfile } from "@exora/contracts";
import type { CustomStar, CustomWorld } from "@exora/worldgen";
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
import type { WebXRControllerMovement } from "@babylonjs/core/XR/features/WebXRControllerMovement.pure.js";
import { WebXRDefaultExperience } from "@babylonjs/core/XR/webXRDefaultExperience.js";
import "@babylonjs/core/XR/features/WebXRControllerMovement.js";
import "@babylonjs/core/XR/features/WebXRControllerPointerSelection.js";
import "@babylonjs/core/XR/features/WebXRControllerTeleportation.js";
import "@babylonjs/core/XR/features/WebXRHandTracking.js";
import "@babylonjs/core/XR/features/WebXRDOMOverlay.js";
import "@babylonjs/core/XR/features/WebXRHitTest.js";
import { WebXRFeatureName } from "@babylonjs/core/XR/webXRFeaturesManager.js";
import { WebXRState } from "@babylonjs/core/XR/webXRTypes.js";
import { createArPresentation } from "./ar-presentation.ts";
import type { BlackHoleProfile } from "./black-holes.ts";
import type { AsteroidProfile } from "./solar-asteroids.ts";
import type { CometProfile } from "./solar-comets.ts";
import type { SolarMissionProfile } from "./solar-missions.ts";
import type { SolarRegionProfile } from "./solar-regions.ts";
import {
  adaptFixedFoveation,
  adaptHardwareScaling,
  deriveRenderQuality,
  type RenderQualityProfile,
  type RenderQualityTier,
} from "./render-quality.ts";
import {
  transitionRendererStatus,
  type RendererEvent,
  type RendererStatus,
} from "./renderer-recovery.ts";
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
import type { XrConsoleHost } from "./xr-console.ts";
import { createXrDiscoverSurface, type XrDiscoverSurface } from "./xr-discover-surface.ts";
import {
  chooseImmersiveDestination,
  getVariantLaunchUrl,
  onVariantLaunchReady,
  type ImmersiveDestination,
  type ImmersiveMode,
} from "./variant-launch.ts";
import { openWorldScope, type WorldScope } from "./world-scope.ts";
import { VIRTUAL_BACKGROUND_LAYER_MASK } from "./world-presentation.ts";

export type XrStatus =
  | "checking"
  | "entering"
  | "in-xr"
  | "ready-ar"
  | "ready-ar-launch"
  | "ready-vr"
  | "unavailable";

/** Locomotion speed inside a session, shared by every destination so travel never changes feel. */
const XR_MOVE_SPEED = 2.2;
const DEFAULT_CLEAR_COLOR = new Color4(0.0015, 0.003, 0.008, 1);
/** How long the in-headset fade takes in each direction. */
const VEIL_FADE_SECONDS = 0.22;

/** Everything a world contributes to the console, minus the parts the host answers for itself. */
export type WorldConsole = Omit<XrConsoleHost, "onExit">;

/**
 * The page's own answer to the console's catalog, used wherever the world has no answer of its own.
 *
 * The in-headset Discover screen offers the same journeys the flat one does — the home system,
 * the NASA and SIMBAD catalogs, the black-hole atlas, the world forge — from every destination,
 * because a wearer cannot reach the browser screen without taking the headset off. Only three of
 * the nine destinations used to hand it somewhere to send the result, though, so on a comet, an
 * asteroid, a region, a mission, a moon subsystem or a black hole those pages browsed and paged
 * and searched perfectly well and then did nothing at all when a row was chosen.
 *
 * Travel is a property of the page rather than of the world being left, so it is registered once
 * here and every destination inherits it. A world that wants to say something more specific still
 * overrides it through its own `WorldConsole`.
 */
export interface ConsoleNavigator {
  onForgePlanet?: (world: CustomWorld) => void;
  onForgeStar?: (star: CustomStar) => void;
  onTravelAsteroid?: (asteroid: AsteroidProfile) => void;
  onTravelBlackHole?: (blackHole: BlackHoleProfile) => void;
  onTravelComet?: (comet: CometProfile) => void;
  onTravelMission?: (mission: SolarMissionProfile) => void;
  onTravelPlanet?: (planet: ExoplanetProfile) => void;
  onTravelRegion?: (region: SolarRegionProfile) => void;
  onTravelStar?: (star: StarProfile) => void;
}

/** A destination occupying the shared scene. */
export interface MountedWorld {
  console: WorldConsole;
  /**
   * The farthest the camera may be pulled back before this world stops holding up, if it has a
   * limit at all.
   *
   * A jump begins by flying away from what is being left, and how far that can go is the world's
   * own business. An orbital view has nothing behind it but a sky that follows the camera, so it
   * can be left from any distance; a surface vista is a finite patch of ground under a dome, and
   * pulling back past its edge would show the visitor where the world stops. Answering nothing
   * lets the flight simply scale the distance the visitor was already watching from.
   */
  farthestView?: () => number | undefined;
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
  /**
   * Starts flying away from the world on screen, before the destination is even known.
   *
   * A jump that has to ask an archive for its destination first would otherwise sit perfectly
   * still until the answer came back, and then move — so the click reads as having done nothing.
   * Calling this the moment the visitor asks puts the flight and the request in the air together;
   * `mountWorld` picks the flight up wherever it has got to. Harmless to call twice, and does
   * nothing inside an immersive session, where the in-headset veil covers the jump instead.
   */
  beginTravel: () => void;
  /** Flies back to the view a jump left from, for a destination that turned out not to exist. */
  cancelTravel: () => void;
  dispose: () => void;
  enterImmersive: () => Promise<void>;
  getFps: () => number;
  isArSupported: () => boolean;
  isInXr: () => boolean;
  isVrSupported: () => boolean;
  /**
   * Subscribes to where a jump has got to, called immediately with the current phase.
   *
   * The page above the canvas has its own half of the flight to play — panels belonging to the
   * world being left have to go with it, and the dark that hides the swap is a DOM layer — so the
   * renderer says where it is rather than reaching up into the interface itself.
   */
  onTravelPhase: (listener: (phase: TravelPhase) => void) => () => void;
  /**
   * Replaces the world in the shared scene, without touching a running session.
   *
   * Resolves with the mounted world, or with null when a later travel request overtook this one
   * while the screen was fading — in that case nothing was built and nothing needs releasing.
   */
  mountWorld: <World extends MountedWorld>(
    build: () => Promise<World> | World,
  ) => Promise<World | null>;
  /** Subscribes to the shared desktop/VR Discover state. */
  onDiscoverVisibility: (listener: (open: boolean) => void) => () => void;
  /** Repaints the console, for when a world's own entries change after it was mounted. */
  refreshConsole: () => void;
  /** Supplies the actual React dialog mirrored onto the VR window. */
  setDiscoverElement: (element: HTMLDialogElement | null) => void;
  /** Keeps React and the controller-summoned VR window on the same open state. */
  setDiscoverVisibility: (visible: boolean) => void;
  /** Registers the page-level destinations the console falls back to. See `ConsoleNavigator`. */
  setConsoleNavigator: (navigator: ConsoleNavigator | null) => void;
  /** Subscribes to immersive status, called immediately with the current one. */
  onXrStatus: (listener: (status: XrStatus) => void) => () => void;
  /** Subscribes to WebGL availability and recovery, called immediately with the current state. */
  onRendererStatus: (listener: (status: RendererStatus) => void) => () => void;
  /**
   * Whether the visitor has asked for less movement.
   *
   * Read here rather than in each scene, because a jump between destinations and a descent
   * within one are the same promise to that visitor, and answering it differently in two places
   * is how one of them ends up still flying.
   */
  prefersReducedMotion: () => boolean;
  /**
   * Parks the render loop while something else owns the screen, returning the release.
   *
   * A modal dialog covers the scene with a blurred, three-quarters-opaque scrim, and the frames
   * still being drawn underneath it are paid for twice: once by the GPU rendering a full-detail
   * planet at the display's native density, and again by the compositor, which has to re-run the
   * `backdrop-filter` blur over the whole viewport every time the canvas changes. Neither buys
   * anything a reader can see. Stopping the loop makes the canvas static, which lets the browser
   * cache the blurred backdrop instead of rebuilding it per frame, so the saving is both halves.
   *
   * Calls nest: the loop restarts once the last holder releases. Never applies inside an
   * immersive session, where the loop belongs to the headset's frame callback rather than to us.
   */
  suspendRendering: () => () => void;
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
    {
      antialias: profile.tier === "desktop",
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

  // AR presentation is host-owned just like the XR rig. Its reticle and DOM overlay therefore
  // survive destination changes, while each world's transform wrapper is exchanged below.
  const arPresentation = createArPresentation(scene);

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

  let isArSupported = false;
  let isVrSupported = false;
  let immersiveDestination: ImmersiveDestination = chooseImmersiveDestination({
    ar: false,
    launchUrl: getVariantLaunchUrl(),
    vr: false,
  });
  let activeImmersiveMode: ImmersiveMode | null = null;
  let xrCameraLayerMask = 0x0fff_ffff;
  let disposed = false;
  let xr: WebXRDefaultExperience | null = null;
  let xrDiscoverSurface: XrDiscoverSurface | null = null;
  let xrMovement: WebXRControllerMovement | null = null;
  let discoverElement: HTMLDialogElement | null = null;
  let currentWorld: MountedWorld | null = null;
  let currentScope: WorldScope | null = null;
  let mountToken = 0;
  let worldBuildGate = Promise.resolve();
  let sessionFoveation = profile.xrFixedFoveation;
  /** Whether the in-headset Discover screen currently owns the view. */
  let discoverOpen = false;
  const discoverListeners = new Set<(open: boolean) => void>();
  const syncDiscoverElementPresentation = (): void => {
    discoverElement?.toggleAttribute(
      "data-xr-mirrored",
      isInXr && activeImmersiveMode === "vr" && discoverOpen,
    );
  };
  const setDiscoverOpen = (open: boolean): void => {
    if (discoverOpen === open) return;
    discoverOpen = open;
    if (xrMovement) xrMovement.movementEnabled = !open;
    syncDiscoverElementPresentation();
    for (const listener of discoverListeners) listener(open);
  };
  let qualitySampleSeconds = 0;

  let xrStatus: XrStatus = "checking";
  const statusListeners = new Set<(status: XrStatus) => void>();
  const setXrStatus = (next: XrStatus): void => {
    xrStatus = next;
    for (const listener of statusListeners) listener(next);
  };

  const readyXrStatus = (): XrStatus => {
    if (!immersiveDestination) return "unavailable";
    if (immersiveDestination.mode === "vr") return "ready-vr";
    return immersiveDestination.launchUrl ? "ready-ar-launch" : "ready-ar";
  };

  const stopWatchingVariantLaunch = onVariantLaunchReady(() => {
    immersiveDestination = chooseImmersiveDestination({
      ar: isArSupported,
      launchUrl: getVariantLaunchUrl(),
      vr: isVrSupported,
    });
    if (!isInXr && xrStatus !== "entering") setXrStatus(readyXrStatus());
  });

  let rendererStatus: RendererStatus = "ready";
  const rendererStatusListeners = new Set<(status: RendererStatus) => void>();
  const dispatchRendererEvent = (event: RendererEvent): void => {
    const next = transitionRendererStatus(rendererStatus, event);
    if (next === rendererStatus) return;
    rendererStatus = next;
    for (const listener of rendererStatusListeners) listener(next);
  };

  // Babylon owns the low-level resource rebuild because context-loss handling is enabled on the
  // engine. Exora owns the user-visible lifecycle: pause behind a recovery screen, then only
  // declare success after the restored context has rendered a complete frame.
  engine.onContextLostObservable.add(() => {
    if (!disposed) dispatchRendererEvent("context-lost");
  });
  engine.onContextRestoredObservable.add(() => {
    if (disposed) return;
    dispatchRendererEvent("context-restored");
    engine.resize();
  });

  /**
   * Trades peripheral sharpness for frame rate while the headset is on.
   *
   * Canvas resolution is fixed for the lifetime of a session, so foveation is the only lever
   * left; a Quest 2 that starts missing 72 Hz recovers by blurring further from the eye.
   */
  const adaptSessionFoveation = (fps: number): void => {
    const sessionManager = xr?.baseExperience.sessionManager;
    if (!sessionManager?.isFixedFoveationSupported) return;
    // Keep the UI text sharp while Discover is open and park the adaptive ladder until it closes.
    if (discoverOpen) return;
    const next = adaptFixedFoveation(sessionFoveation, fps, profile);
    if (next === sessionFoveation) return;
    sessionFoveation = next;
    sessionManager.fixedFoveation = next;
  };

  scene.onBeforeRenderObservable.add(() => {
    const deltaSeconds = Math.min(engine.getDeltaTime() / 1_000, 0.05);

    // Inside an XR session this observer runs within the frame callback, which is the only place
    // the rig's pose may be read. The veil is still opaque here, so the move is never seen.
    if (rigAwaitingWorld && isInXr && activeImmersiveMode === "vr") {
      rigAwaitingWorld = false;
      currentWorld?.focusXrRig(false);
      xrDiscoverSurface?.recall();
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
    if (isInXr && activeImmersiveMode === "vr") xrDiscoverSurface?.update(deltaSeconds);

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

  let looping = false;
  /** How many overlays are currently claiming the screen. Zero means the loop should be running. */
  let suspensions = 0;

  const renderFrame = (): void => {
    try {
      scene.render();
      dispatchRendererEvent("frame-rendered");
    } catch (error) {
      console.error("[renderer] frame failed", error);
      dispatchRendererEvent("render-failed");
      engine.stopRenderLoop();
      looping = false;
    }
  };

  const startRenderLoop = (): void => {
    if (looping || disposed) return;
    looping = true;
    // Babylon's frame-time average is a rolling window that knows nothing about the pause, so
    // without this the first frame back reports the whole suspension as one enormous frame and
    // the heads-up display spends a second claiming single-digit FPS.
    engine.performanceMonitor.reset();
    engine.runRenderLoop(renderFrame);
  };

  const stopRenderLoop = (): void => {
    if (!looping) return;
    looping = false;
    engine.stopRenderLoop(renderFrame);
  };

  const suspendRendering = (): (() => void) => {
    suspensions += 1;
    if (suspensions === 1 && !isInXr) stopRenderLoop();

    let released = false;
    return () => {
      if (released) return;
      released = true;
      suspensions -= 1;
      if (suspensions === 0) startRenderLoop();
    };
  };

  startRenderLoop();

  const resize = (): void => {
    engine.resize();
    // A resized canvas gets a fresh, empty drawing buffer. While the loop is parked nothing
    // would ever fill it, so the scrim would be blurring a blank rectangle: draw the one frame.
    if (!looping && !disposed) renderFrame();
  };
  window.addEventListener("resize", resize);

  /** Undoes the scene-level settings a world is allowed to change, before the next one lands. */
  const resetSceneDefaults = (): void => {
    camera.detachControl();
    scene.clearColor = DEFAULT_CLEAR_COLOR.clone();
    scene.fogMode = Scene.FOGMODE_NONE;
    scene.fogDensity = 0;
    scene.setRenderingAutoClearDepthStencil(1, true, true, true);
  };

  let travelPhase: TravelPhase = "idle";
  const travelListeners = new Set<(phase: TravelPhase) => void>();
  const setTravelPhase = (next: TravelPhase): void => {
    if (next === travelPhase) return;
    travelPhase = next;
    for (const listener of travelListeners) listener(next);
  };

  /** The view a jump left from, kept so one that finds nothing to travel to can be flown back. */
  let travelOrigin: { lower: number | null; radius: number; upper: number | null } | null = null;
  /** The outbound flight in progress, shared by whoever started it and whoever lands on it. */
  let departure: Promise<boolean> | null = null;
  /** Set once a mount has taken the outbound flight over, so it stops drifting and crosses. */
  let departureClaimed = false;
  let glideFrame = 0;
  let glideDeadline = 0;
  let landGlide: ((landed: boolean) => void) | null = null;

  const prefersReducedMotion = (): boolean =>
    window.matchMedia?.("(prefers-reduced-motion: reduce)").matches === true;

  /**
   * How far out a flight to or from the world on screen reaches.
   *
   * A visitor who has asked for less movement gets no flight at all: the distance collapses to
   * the one they are already watching from, and a jump becomes the dark fading across the swap
   * and nothing else. That part stays, because it is covering a stalled frame loop rather than
   * decorating one — it is the honest picture of what the page is doing.
   */
  const flightRadius = (resting: number): number =>
    prefersReducedMotion() ? resting : departureRadius(resting, currentWorld?.farthestView?.());

  /**
   * Makes room for a flight that leaves the distances the current view was built around.
   *
   * The camera clamps its own radius to those limits on every frame it updates, so the room has
   * to be re-made each step rather than once: the world being left is entitled to reset its own
   * limits underneath the flight, and does exactly that when a surface approach lands mid-jump.
   */
  const widenCameraReach = (from: number, to: number): void => {
    camera.lowerRadiusLimit = Math.min(camera.lowerRadiusLimit ?? from, from, to);
    camera.upperRadiusLimit = Math.max(camera.upperRadiusLimit ?? to, from, to);
  };

  /**
   * Ends the flight in progress, saying whether it got where it was going.
   *
   * A flight that was cut short — overtaken by the next jump, or by the host being disposed —
   * still has to resolve, or whatever is awaiting it waits for ever. It must not *land*, though:
   * landing puts the camera's limits back and hands control to the visitor, and doing that
   * underneath the flight that replaced it would clamp it mid-air and let the wheel fight it.
   */
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

  /**
   * Flies the shared camera to a distance, resolving once it is there.
   *
   * Driven from `requestAnimationFrame` rather than from the scene's own frame observer, because
   * a jump can begin while a dialog has the render loop parked — and a flight waiting on frames
   * nobody is drawing would leave the destination behind it never built at all. The timer is the
   * same guarantee for a tab that gets backgrounded mid-flight, where frames stop entirely.
   */
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

    // Nothing else may drive the camera while the flight has it: a wheel notch part-way through
    // would otherwise fight the flight for the same value, frame by frame.
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
    if (disposed || isInXr || !currentWorld || departure) return;
    travelOrigin = {
      lower: camera.lowerRadiusLimit,
      radius: camera.radius,
      upper: camera.upperRadiusLimit,
    };
    departureClaimed = false;
    setTravelPhase("departing");
    const far = flightRadius(camera.radius);
    departure = glideCamera(far, TRAVEL_DEPART_MS, easeAway).then((landed) => {
      // Nothing has come to claim the flight, so an archive is still being asked where this jump
      // is going. It carries on drifting at the speed it had rather than stopping dead in the
      // middle of the sky, which is what reads as the page having hung rather than as travel.
      if (landed && !departureClaimed && !disposed) {
        void glideCamera(far * TRAVEL_COAST_SCALE, TRAVEL_COAST_MS, easeDrift);
      }
      return landed;
    });
  };

  const cancelTravel = (): void => {
    const origin = travelOrigin;
    // Once the screen has gone dark there is nothing left to fly back to: the world that was
    // being left is already being taken apart behind it.
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

  /** The outbound half of a jump: finish pulling away, then darken over the swap itself. */
  const departFromWorld = async (): Promise<void> => {
    if (isInXr) return;
    if (!departure) beginTravel();
    departureClaimed = true;
    await departure;
    setTravelPhase("crossing");
    await new Promise<void>((resolve) => window.setTimeout(resolve, TRAVEL_CROSS_MS));
  };

  /**
   * The inbound half: the destination is already close, and the camera settles back onto it.
   *
   * Started on the destination's first drawn frame rather than the instant it was built. The
   * build stalls the frame loop, and behind that stall sits the shader compilation for
   * everything it just made — together long enough that a flight timed from the end of the build
   * would spend its first third frozen and then jump to wherever the clock had got to. Waiting
   * for the frame costs the jump nothing, because the dark is over that whole stall anyway.
   */
  const arriveAtWorld = (mounted: number): void => {
    departure = null;
    departureClaimed = false;
    travelOrigin = null;
    if (isInXr) {
      setTravelPhase("idle");
      return;
    }

    // Whatever the world put the camera at as it was built is where this flight is going.
    const resting = camera.radius;
    const lower = camera.lowerRadiusLimit;
    const upper = camera.upperRadiusLimit;
    const near = arrivalRadius(resting, lower ?? undefined);
    widenCameraReach(near, resting);
    camera.radius = near;

    const settle = (): void => {
      // The first world of a session arrives out of `idle` rather than out of the dark, so what
      // is checked is that this is still the world the scene holds — not which phase it came from.
      if (disposed || mounted !== mountToken) return;
      // The dark lifts here rather than when the build returned: everything the visitor is about
      // to see starts together, on a frame that has actually been drawn.
      setTravelPhase("arriving");
      void glideCamera(resting, TRAVEL_ARRIVE_MS, easeSettle).then((landed) => {
        // A flight overtaken by the next jump, or one whose host was disposed out from under it,
        // has nothing to hand back: the limits and the controls belong to whatever replaced it.
        if (!landed || disposed) return;
        camera.lowerRadiusLimit = lower;
        camera.upperRadiusLimit = upper;
        if (!isInXr) camera.attachControl(canvas, true);
        setTravelPhase("idle");
      });
    };

    // Whichever comes first: the frame, or a deadline for the case where no frame is coming
    // because a dialog has the loop parked and nothing is being drawn at all.
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
    // Choosing a destination closes Discover, the way it closes on the flat page. In a headset
    // this also makes the newly selected world the focus instead of leaving the catalog window in
    // front of it after the jump.
    xrDiscoverSurface?.setVisible(false);
    // The outgoing world keeps rendering through the flight, so the jump never shows an empty
    // sky: it is watched receding, and only the swap itself happens behind the dark.
    if (currentWorld) {
      await fadeVeil(1);
      await departFromWorld();
    }
    if (token !== mountToken || disposed) return null;

    // Asset-backed destinations can yield while Babylon fetches a model. Serialize that interval:
    // a second mount must never open another world scope while the first scope is still observing
    // additions to the shared scene.
    const precedingBuild = worldBuildGate;
    let releaseBuildGate = (): void => undefined;
    worldBuildGate = new Promise<void>((resolve) => {
      releaseBuildGate = resolve;
    });
    await precedingBuild;

    try {
      if (token !== mountToken || disposed) return null;

      currentWorld?.dispose();
      arPresentation.setWorld(null);
      currentScope?.dispose();
      currentWorld = null;
      currentScope = null;
      resetSceneDefaults();

      // Nothing may interleave between opening the scope and sealing it: the scope's reading of
      // what the world added depends on the build being uninterrupted. See `world-scope.ts`.
      const scope = openWorldScope(scene);
      let world: World;
      try {
        world = await build();
      } catch (error) {
        // A build that failed part-way still left geometry in a scene that is not thrown away any
        // more, so the half-built world is swept out before the failure is reported.
        scope.seal();
        scope.dispose();
        void fadeVeil(0);
        // There is no destination to fly in to, so the flight is abandoned rather than landed:
        // the recovery screen that answers this has to be visible, not behind a jump that never
        // ends.
        endGlide(null, false);
        departure = null;
        travelOrigin = null;
        setTravelPhase("idle");
        dispatchRendererEvent("render-failed");
        throw error;
      }
      scope.seal();

      // A newer request may have arrived while the model was in flight. The completed scene is
      // scientifically valid but no longer the requested destination, so release it unseen.
      if (token !== mountToken || disposed) {
        world.dispose();
        scope.dispose();
        return null;
      }

      currentScope = scope;
      currentWorld = world;
      arPresentation.setWorld(scope.presentation);
      rigAwaitingWorld = isInXr && activeImmersiveMode === "vr";
      void fadeVeil(0);
      arriveAtWorld(token);
      // A destination can be chosen from a dialog that is still open over the canvas — the
      // catalog closes and the world mounts in the same commit, and nothing says which lands
      // first. One frame here means the scrim is never left blurring the world the visitor just
      // left.
      if (!looping) renderFrame();
      // Building a world stalls the frame loop, and the rolling average knows nothing about why:
      // left alone it reports the stall as a run of enormous frames for seconds afterwards, which
      // shows up as a heads-up display insisting on single digits and — worse — as the quality
      // adapter deciding the machine cannot keep up and dropping the render scale, which
      // reallocates the framebuffer and hitches the arrival it was supposed to be helping.
      engine.performanceMonitor.reset();
      qualitySampleSeconds = 0;
      return world;
    } finally {
      releaseBuildGate();
    }
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
      xrMovement = createdXr.baseExperience.featuresManager.enableFeature(
        WebXRFeatureName.MOVEMENT,
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
      ) as WebXRControllerMovement;
      xrDiscoverSurface = createXrDiscoverSurface(scene, profile.anisotropicFiltering);
      xrDiscoverSurface.onVisibility((open) => {
        setDiscoverOpen(open);
        const sessionManager = createdXr.baseExperience.sessionManager;
        if (!sessionManager.isFixedFoveationSupported) return;
        sessionManager.fixedFoveation = open ? 0 : sessionFoveation;
      });
      xrDiscoverSurface.attach(createdXr);
      xrDiscoverSurface.setElement(discoverElement);

      // The rig lands wherever the headset happens to face, so the view has to be aimed at the
      // subject; otherwise a VR session opens on empty starfield and looks broken. AR must leave
      // the tracked camera at the physical device pose, so its world moves instead of the rig.
      createdXr.baseExperience.onInitialXRPoseSetObservable.add(() => {
        if (activeImmersiveMode === "vr") currentWorld?.focusXrRig(true);
      });

      createdXr.baseExperience.onStateChangedObservable.add((state) => {
        if (disposed) return;
        if (state === WebXRState.ENTERING_XR) {
          setXrStatus("entering");
        }
        if (state === WebXRState.IN_XR) {
          isInXr = true;
          // Inside a session the loop is the headset's frame callback, and a wearer cannot see
          // the flat dialog that parked it. Whatever suspensions are outstanding, run.
          startRenderLoop();
          sessionFoveation = profile.xrFixedFoveation;
          if (createdXr.baseExperience.sessionManager.isFixedFoveationSupported) {
            createdXr.baseExperience.sessionManager.fixedFoveation = sessionFoveation;
          }
          xrDiscoverSurface?.setVisible(activeImmersiveMode === "vr");
          setXrStatus("in-xr");
        }
        if (state === WebXRState.NOT_IN_XR) {
          const endedMode = activeImmersiveMode;
          isInXr = false;
          // Back on the flat page, an overlay that outlived the session owns the screen again.
          if (suspensions > 0) stopRenderLoop();
          rigAwaitingWorld = false;
          xrDiscoverSurface?.setVisible(false);
          // A session ending mid-jump would otherwise leave a fade waiting for frames that only
          // arrive inside the headset.
          veilTarget = 0;
          veilAlpha = 0;
          veilMaterial.alpha = 0;
          veil.setEnabled(false);
          resolveVeil();
          if (endedMode === "ar") {
            arPresentation.end();
            createdXr.baseExperience.camera.layerMask = xrCameraLayerMask;
            createdXr.baseExperience.featuresManager.disableFeature(WebXRFeatureName.HIT_TEST);
            createdXr.baseExperience.featuresManager.disableFeature(WebXRFeatureName.DOM_OVERLAY);
          }
          activeImmersiveMode = null;
          currentWorld?.restoreDesktopView();
          setXrStatus(readyXrStatus());
        }
      });

      [isArSupported, isVrSupported] = await Promise.all([
        createdXr.baseExperience.sessionManager
          .isSessionSupportedAsync("immersive-ar")
          .catch(() => false),
        createdXr.baseExperience.sessionManager
          .isSessionSupportedAsync("immersive-vr")
          .catch(() => false),
      ]);
      immersiveDestination = chooseImmersiveDestination({
        ar: isArSupported,
        launchUrl: getVariantLaunchUrl(),
        vr: isVrSupported,
      });
      if (disposed) {
        createdXr.dispose();
        if (xr === createdXr) xr = null;
        return;
      }
      setXrStatus(readyXrStatus());
    })
    .catch(() => {
      if (!disposed) setXrStatus(readyXrStatus());
    });

  return {
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
    isArSupported: () => isArSupported,
    isInXr: () => isInXr,
    isVrSupported: () => isVrSupported,
    mountWorld,
    onDiscoverVisibility: (listener) => {
      discoverListeners.add(listener);
      listener(discoverOpen);
      return () => discoverListeners.delete(listener);
    },
    refreshConsole: () => undefined,
    setConsoleNavigator: () => undefined,
    setDiscoverElement: (element) => {
      discoverElement = element;
      syncDiscoverElementPresentation();
      xrDiscoverSurface?.setElement(element);
    },
    setDiscoverVisibility: (open) => {
      setDiscoverOpen(open);
      if (isInXr && activeImmersiveMode === "vr") xrDiscoverSurface?.setVisible(open);
    },
    suspendRendering,
    xrCamera: () => xr?.baseExperience.camera ?? null,
    onXrStatus: (listener) => {
      statusListeners.add(listener);
      listener(xrStatus);
      return () => statusListeners.delete(listener);
    },
    onRendererStatus: (listener) => {
      rendererStatusListeners.add(listener);
      listener(rendererStatus);
      return () => rendererStatusListeners.delete(listener);
    },
    onTravelPhase: (listener) => {
      travelListeners.add(listener);
      listener(travelPhase);
      return () => travelListeners.delete(listener);
    },
    enterImmersive: async () => {
      const destination = immersiveDestination;
      if (!destination) return;
      if (destination.launchUrl) {
        window.location.assign(destination.launchUrl);
        return;
      }
      if (!xr) return;

      activeImmersiveMode = destination.mode;
      if (destination.mode === "vr") {
        // This is the original Quest path: same session mode, reference space, render target and
        // optional hand feature set. Capability selection above only decides to arrive here.
        await xr.baseExperience.enterXRAsync("immersive-vr", "local-floor", xr.renderTarget);
        return;
      }

      const features = xr.baseExperience.featuresManager;
      try {
        const hitTest = features.enableFeature(
          WebXRFeatureName.HIT_TEST,
          "latest",
          { enableTransientHitTest: true },
          true,
          true,
        );
        features.enableFeature(
          WebXRFeatureName.DOM_OVERLAY,
          "latest",
          { element: arPresentation.overlay, supressXRSelectEvents: false },
          true,
          false,
        );
        xrCameraLayerMask = xr.baseExperience.camera.layerMask;
        xr.baseExperience.camera.layerMask &= ~VIRTUAL_BACKGROUND_LAYER_MASK;
        arPresentation.begin(hitTest, currentScope?.presentation ?? null);
        // Variant Launch and native mobile WebXR both implement the standard AR session. Hit
        // testing is required; DOM overlay is optional so a device can still place/manipulate the
        // scene through Babylon pointer events if it cannot render the instruction strip.
        await xr.baseExperience.enterXRAsync("immersive-ar", "local", xr.renderTarget);
      } catch (error) {
        arPresentation.end();
        xr.baseExperience.camera.layerMask = xrCameraLayerMask;
        features.disableFeature(WebXRFeatureName.HIT_TEST);
        features.disableFeature(WebXRFeatureName.DOM_OVERLAY);
        activeImmersiveMode = null;
        setXrStatus(readyXrStatus());
        throw error;
      }
    },
    dispose: () => {
      if (disposed) return;
      disposed = true;
      // Test remounts and client-side renderer recovery can present the same canvas node again.
      // Never let the module singleton hand that caller this already-disposed host.
      if (host?.scene === scene) host = null;
      // Both subscriber sets are released, not just one. A disposed host answers nothing, and
      // `recreateSceneHost` builds its replacement while React still holds the old subscriptions
      // until its effects re-run — so anything still reachable from here is a listener that has
      // already stopped being told the truth.
      rendererStatusListeners.clear();
      statusListeners.clear();
      travelListeners.clear();
      endGlide(null, false);
      stopWatchingVariantLaunch();
      window.removeEventListener("resize", resize);
      currentWorld?.dispose();
      arPresentation.dispose();
      currentScope?.dispose();
      currentWorld = null;
      currentScope = null;
      discoverListeners.clear();
      xrDiscoverSurface?.dispose();
      xrDiscoverSurface = null;
      xrMovement = null;
      discoverElement = null;
      xr?.dispose();
      xr = null;
      looping = false;
      engine.stopRenderLoop();
      // An OBJ/GLB import cannot be cancelled once Babylon has handed it to a loader. Keep the
      // shared scene alive until that build leaves its serialized scope; disposing it underneath
      // the loader turns a routine React unmount into a late `clearColor`/mesh write on null
      // internals. The disposed flag still prevents the completed destination from mounting.
      void worldBuildGate.then(() => {
        scene.dispose();
        engine.dispose();
      });
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

/** Replaces a failed renderer while retaining the page-owned canvas and React destination. */
export const recreateSceneHost = (canvas: HTMLCanvasElement): SceneHost => {
  host?.dispose();
  host = createSceneHost(canvas);
  return host;
};
