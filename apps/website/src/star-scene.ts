import { ArcRotateCamera } from "@babylonjs/core/Cameras/arcRotateCamera.js";
import { ActionManager } from "@babylonjs/core/Actions/actionManager.js";
import "@babylonjs/core/Culling/ray.js";
import { ExecuteCodeAction } from "@babylonjs/core/Actions/directActions.js";
import { Engine } from "@babylonjs/core/Engines/engine.js";
import { GlowLayer } from "@babylonjs/core/Layers/glowLayer.js";
import { Color3, Color4 } from "@babylonjs/core/Maths/math.color.js";
import { Vector3 } from "@babylonjs/core/Maths/math.vector.js";
import { StandardMaterial } from "@babylonjs/core/Materials/standardMaterial.js";
import { MeshBuilder } from "@babylonjs/core/Meshes/meshBuilder.js";
import { TransformNode } from "@babylonjs/core/Meshes/transformNode.js";
import "@babylonjs/core/Meshes/instancedMesh.js";
import { Scene, ScenePerformancePriority } from "@babylonjs/core/scene.js";
import type { WebXRCamera } from "@babylonjs/core/XR/webXRCamera.js";
import { WebXRDefaultExperience } from "@babylonjs/core/XR/webXRDefaultExperience.js";
import "@babylonjs/core/XR/features/WebXRControllerMovement.js";
import "@babylonjs/core/XR/features/WebXRControllerPointerSelection.js";
import "@babylonjs/core/XR/features/WebXRHandTracking.js";
import { WebXRFeatureName } from "@babylonjs/core/XR/webXRFeaturesManager.js";
import { WebXRState } from "@babylonjs/core/XR/webXRTypes.js";
import type { ExoplanetProfile, StarProfile } from "@exora/contracts";
import { deriveStarRecipe, type CustomStar, type CustomWorld } from "@exora/worldgen";
import {
  adaptFixedFoveation,
  deriveRenderQuality,
  type RenderQualityTier,
} from "./render-quality.ts";
import type { XrStatus } from "./planet-scene.ts";
import { createStellarSurface } from "./star-surface.ts";
import { starKindLabel, starSummary } from "./star-utils.ts";
import { createStarfield } from "./star-visuals.ts";
import { createXrConsole, type XrConsole, type XrConsoleHost } from "./xr-console.ts";
import { starFacts } from "./xr-console-model.ts";
import type { XrCell } from "./xr-panel-layout.ts";
import { requestVrHandoff } from "./xr-session.ts";

const STAR_POSITION = new Vector3(0, 0.8, 7.5);
/** Initial immersive viewpoint, parked outside the widest planetary orbit in the system. */
const XR_STAR_STAND = new Vector3(0, 0, -9);
const XR_MOVE_SPEED = 2.2;

export interface StarSceneExperience {
  dispose: () => void;
  enterVr: () => Promise<void>;
  getFps: () => number;
  qualityTier: RenderQualityTier;
  setPlanetTargets: (
    planets: readonly ExoplanetProfile[],
    onSelectPlanet: (planet: ExoplanetProfile) => void,
  ) => void;
}

interface StarSceneOptions {
  canvas: HTMLCanvasElement;
  onFirstFrame: () => void;
  /** Immersive-only travel, so a wearer can leave for anywhere without removing the headset. */
  onForgeStar?: (star: CustomStar) => void;
  onForgeWorld?: (world: CustomWorld) => void;
  onSelectPlanet?: (planet: ExoplanetProfile) => void;
  onSelectStar?: (star: StarProfile) => void;
  onXrStatusChange: (status: XrStatus) => void;
  star: StarProfile;
}

export const createStarScene = ({
  canvas,
  onFirstFrame,
  onForgeStar,
  onForgeWorld,
  onSelectPlanet,
  onSelectStar,
  onXrStatusChange,
  star,
}: StarSceneOptions): StarSceneExperience => {
  const deviceNavigator = window.navigator as Navigator & { deviceMemory?: number };
  const profile = deriveRenderQuality({
    userAgent: deviceNavigator.userAgent,
    pixelRatio: window.devicePixelRatio,
    hardwareConcurrency: deviceNavigator.hardwareConcurrency,
    deviceMemory: deviceNavigator.deviceMemory,
  });
  const engine = new Engine(canvas, profile.tier === "desktop", {
    antialias: profile.tier === "desktop",
    preserveDrawingBuffer: false,
    stencil: false,
  });
  engine.setHardwareScalingLevel(profile.hardwareScalingLevel);
  const scene = new Scene(engine);
  scene.clearColor = new Color4(0.001, 0.002, 0.006, 1);
  scene.performancePriority = ScenePerformancePriority.Intermediate;
  // The intermediate priority also turns off the colour clear, which leaves each eye smearing
  // the previous frame in an immersive session. Nothing here paints every pixel, so clear.
  scene.autoClear = true;
  scene.skipPointerMovePicking = true;

  const camera = new ArcRotateCamera(
    "stellar-camera",
    -Math.PI / 2,
    Math.PI / 2.08,
    15.5,
    STAR_POSITION.clone(),
    scene,
  );
  camera.lowerRadiusLimit = 9.5;
  camera.upperRadiusLimit = 24;
  camera.lowerBetaLimit = 0.45;
  camera.upperBetaLimit = Math.PI - 0.45;
  camera.wheelDeltaPercentage = 0.018;
  camera.pinchDeltaPercentage = 0.008;
  camera.inertia = 0.82;
  camera.attachControl(canvas, true);

  const recipe = deriveStarRecipe(star);
  const seed = recipe.seed;
  const activity = recipe.activity;
  const diameter = recipe.radiusSceneUnits;

  const starfield = createStarfield({ count: profile.starCount, scene, seed });

  const stellarSurface = createStellarSurface({
    detail: "subject",
    diameter,
    position: STAR_POSITION,
    profile,
    recipe,
    rotationFactor: star.customization?.rotation ?? 0.35,
    scene,
    seed,
    spotCoverage: recipe.spotCoverage,
  });
  const starMesh = stellarSurface.photosphere;

  // Kept modest, and the corona shell rides along in the same bloom pass — without it the shell
  // reads as a flat, hard-edged translucent disc rather than a soft glow.
  const glow = new GlowLayer("stellar-glow", scene, {
    blurKernelSize: profile.tier === "desktop" ? 40 : 20,
    mainTextureFixedSize: profile.tier === "desktop" ? 512 : 256,
  });
  glow.intensity = 0.75 + activity * 0.35;
  glow.addIncludedOnlyMesh(starMesh);

  let planetTargetRoots: TransformNode[] = [];
  let menuPlanets: readonly ExoplanetProfile[] = [];
  let selectPlanet: ((planet: ExoplanetProfile) => void) | null = null;
  const setPlanetTargets = (
    planets: readonly ExoplanetProfile[],
    onSelectPlanet: (planet: ExoplanetProfile) => void,
  ): void => {
    menuPlanets = planets;
    // Picking a world in-scene rebuilds the renderer, so an active session is handed over.
    selectPlanet = (planet: ExoplanetProfile): void => {
      if (isInXr) requestVrHandoff();
      onSelectPlanet(planet);
    };
    refreshXrConsole();
    for (const root of planetTargetRoots) root.dispose(false, true);
    planetTargetRoots = planets.slice(0, 8).map((planet, index) => {
      const root = new TransformNode(`system-world-orbit-${planet.id}`, scene);
      root.position.copyFrom(starMesh.position);
      root.rotation.x = -0.08 + (index % 3) * 0.07;
      root.rotation.z = ((index % 2 === 0 ? -1 : 1) * Math.PI) / 34;

      const orbitRadius = diameter * 0.68 + 1.1 + index * 0.48;
      const orbit = MeshBuilder.CreateTorus(
        `system-world-guide-${planet.id}`,
        { diameter: orbitRadius * 2, thickness: 0.012, tessellation: 96 },
        scene,
      );
      orbit.parent = root;
      orbit.isPickable = false;
      const orbitMaterial = new StandardMaterial(`system-world-guide-material-${planet.id}`, scene);
      orbitMaterial.disableLighting = true;
      orbitMaterial.emissiveColor = new Color3(0.24, 0.48, 0.52);
      orbitMaterial.alpha = 0.22;
      orbitMaterial.disableDepthWrite = true;
      orbit.material = orbitMaterial;

      const world = MeshBuilder.CreateSphere(
        `system-world-${planet.id}`,
        { diameter: planet.kind === "gas-giant" ? 0.72 : 0.5, segments: 24 },
        scene,
      );
      world.parent = root;
      world.position.x = orbitRadius;
      world.isPickable = true;
      const worldMaterial = new StandardMaterial(`system-world-material-${planet.id}`, scene);
      worldMaterial.disableLighting = true;
      const worldColor =
        planet.kind === "gas-giant"
          ? new Color3(0.9, 0.58, 0.3)
          : planet.kind === "ice-giant"
            ? new Color3(0.34, 0.72, 0.92)
            : new Color3(0.36, 0.82, 0.7);
      worldMaterial.diffuseColor = worldColor;
      worldMaterial.emissiveColor = worldColor.scale(0.45);
      world.material = worldMaterial;

      const pointerTarget = MeshBuilder.CreateSphere(
        `system-world-pointer-${planet.id}`,
        { diameter: 1.05, segments: 16 },
        scene,
      );
      pointerTarget.parent = root;
      pointerTarget.position.copyFrom(world.position);
      pointerTarget.isPickable = true;
      const pointerMaterial = new StandardMaterial(
        `system-world-pointer-material-${planet.id}`,
        scene,
      );
      pointerMaterial.disableLighting = true;
      pointerMaterial.emissiveColor = worldColor;
      pointerMaterial.alpha = 0.055;
      pointerMaterial.disableDepthWrite = true;
      pointerTarget.material = pointerMaterial;

      for (const target of [world, pointerTarget]) {
        target.actionManager = new ActionManager(scene);
        target.actionManager.registerAction(
          new ExecuteCodeAction(ActionManager.OnPickTrigger, () => selectPlanet?.(planet)),
        );
      }
      root.rotation.y = (index / Math.max(1, planets.length)) * Math.PI * 2;
      return root;
    });
  };

  let elapsed = 0;
  let qualitySampleSeconds = 0;
  let firstFrame = true;
  scene.onBeforeRenderObservable.add(() => {
    const deltaSeconds = Math.min(engine.getDeltaTime() / 1_000, 0.05);
    elapsed += deltaSeconds;
    qualitySampleSeconds += deltaSeconds;
    const activeCameraPosition = scene.activeCamera?.globalPosition ?? camera.globalPosition;
    stellarSurface.update(elapsed, activeCameraPosition);
    starfield.update(elapsed, activeCameraPosition);
    for (let index = 0; index < planetTargetRoots.length; index += 1) {
      const root = planetTargetRoots[index];
      if (root) root.rotation.y += ((0.025 + index * 0.004) * engine.getDeltaTime()) / 1_000;
    }

    // Locomotion owns the XR rig after entry; rewriting it per frame causes room-scale snap-back.
    if (isInXr) xrConsole?.update(deltaSeconds);

    if (qualitySampleSeconds >= 3) {
      qualitySampleSeconds = 0;
      if (isInXr) adaptSessionFoveation(engine.getFps());
    }
  });
  engine.runRenderLoop(() => {
    scene.render();
    if (firstFrame) {
      firstFrame = false;
      onFirstFrame();
    }
  });
  const resize = (): void => engine.resize();
  window.addEventListener("resize", resize);

  let xr: WebXRDefaultExperience | null = null;
  let xrConsole: XrConsole | null = null;
  let isInXr = false;
  let vrSupported = false;
  let disposed = false;

  const xrCamera = (): WebXRCamera | null => xr?.baseExperience.camera ?? null;

  let sessionFoveation = profile.xrFixedFoveation;

  /**
   * Trades peripheral sharpness for frame rate while the headset is on, since canvas
   * resolution is fixed for the lifetime of an immersive session.
   */
  const adaptSessionFoveation = (fps: number): void => {
    const sessionManager = xr?.baseExperience.sessionManager;
    if (!sessionManager?.isFixedFoveationSupported) return;
    const next = adaptFixedFoveation(sessionFoveation, fps, profile);
    if (next === sessionFoveation) return;
    sessionFoveation = next;
    sessionManager.fixedFoveation = next;
  };

  /**
   * Puts the wearer at the initial orbital viewpoint facing the star.
   *
   * The rig otherwise starts wherever the headset happened to be pointing, which in a scene this
   * sparse means staring at empty starfield with no clue that anything rendered at all.
   */
  const placeXrCamera = (initial: boolean): void => {
    const rig = xrCamera();
    if (!rig) return;
    const headOffset = initial ? 0 : rig.realWorldHeight;
    rig.position.set(XR_STAR_STAND.x, XR_STAR_STAND.y + headOffset, XR_STAR_STAND.z);
    rig.setTarget(STAR_POSITION);
  };

  const buildSceneActions = (): XrCell[] => {
    const actions: XrCell[] = [
      {
        detail: "Face the star",
        id: "recentre",
        label: "Recentre me",
        onSelect: () => placeXrCamera(false),
      },
    ];

    const travel = selectPlanet;
    if (travel) {
      for (const planet of menuPlanets.slice(0, 5)) {
        actions.push({
          badge: planet.kind === "unknown" ? undefined : planet.kind.replace("-", " "),
          detail: "Travel to this world",
          id: `planet-${planet.id}`,
          label: planet.name,
          onSelect: () => travel(planet),
        });
      }
    }

    return actions;
  };

  // Travelling anywhere rebuilds the renderer, so an active session is handed over rather than
  // dropping the wearer back into the flat page.
  const handOver = <Argument>(travel: (argument: Argument) => void) => {
    return (argument: Argument): void => {
      if (isInXr) requestVrHandoff();
      travel(argument);
    };
  };

  const consoleHost: XrConsoleHost = {
    facts: () => starFacts(star),
    onExit: () => void xr?.baseExperience.exitXRAsync(),
    onForgePlanet: onForgeWorld ? handOver(onForgeWorld) : undefined,
    onForgeStar: onForgeStar ? handOver(onForgeStar) : undefined,
    onTravelPlanet: onSelectPlanet ? handOver(onSelectPlanet) : undefined,
    onTravelStar: onSelectStar ? handOver(onSelectStar) : undefined,
    sceneActions: buildSceneActions,
    source: () => `${star.source.archive} · ${star.source.retrievedOn}`,
    subtitle: () => `${starKindLabel(star)} · orbital view`,
    summary: () => starSummary(star),
    title: () => star.name,
  };

  const refreshXrConsole = (): void => xrConsole?.refresh();

  onXrStatusChange("checking");
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
      if (disposed) return createdXr.dispose();
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

      createdXr.baseExperience.onInitialXRPoseSetObservable.add(() => placeXrCamera(true));
      createdXr.baseExperience.onStateChangedObservable.add((state) => {
        if (disposed) return;
        if (state === WebXRState.ENTERING_XR) {
          onXrStatusChange("entering");
        }
        if (state === WebXRState.IN_XR) {
          isInXr = true;
          sessionFoveation = profile.xrFixedFoveation;
          if (createdXr.baseExperience.sessionManager.isFixedFoveationSupported) {
            createdXr.baseExperience.sessionManager.fixedFoveation = sessionFoveation;
          }
          xrConsole?.setVisible(true);
          onXrStatusChange("in-xr");
        }
        if (state === WebXRState.NOT_IN_XR) {
          isInXr = false;
          xrConsole?.setVisible(false);
          camera.attachControl(canvas, true);
          onXrStatusChange(vrSupported ? "ready" : "unavailable");
        }
      });
      vrSupported =
        await createdXr.baseExperience.sessionManager.isSessionSupportedAsync("immersive-vr");
      if (!disposed) onXrStatusChange(vrSupported ? "ready" : "unavailable");
    })
    .catch(() => {
      if (!disposed) onXrStatusChange("unavailable");
    });

  return {
    qualityTier: profile.tier,
    setPlanetTargets,
    getFps: () => engine.getFps(),
    enterVr: async () => {
      if (!xr || !vrSupported) return;
      await xr.baseExperience.enterXRAsync("immersive-vr", "local-floor", xr.renderTarget);
    },
    dispose: () => {
      if (disposed) return;
      disposed = true;
      window.removeEventListener("resize", resize);
      xrConsole?.dispose();
      xrConsole = null;
      xr?.dispose();
      engine.stopRenderLoop();
      scene.dispose();
      engine.dispose();
    },
  };
};
