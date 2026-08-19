import { ArcRotateCamera } from "@babylonjs/core/Cameras/arcRotateCamera.js";
import { ActionManager } from "@babylonjs/core/Actions/actionManager.js";
import "@babylonjs/core/Culling/ray.js";
import { ExecuteCodeAction } from "@babylonjs/core/Actions/directActions.js";
import { Engine } from "@babylonjs/core/Engines/engine.js";
import { GlowLayer } from "@babylonjs/core/Layers/glowLayer.js";
import { Color3, Color4 } from "@babylonjs/core/Maths/math.color.js";
import { Vector3 } from "@babylonjs/core/Maths/math.vector.js";
import { Effect } from "@babylonjs/core/Materials/effect.js";
import { ShaderMaterial } from "@babylonjs/core/Materials/shaderMaterial.js";
import { StandardMaterial } from "@babylonjs/core/Materials/standardMaterial.js";
import { Mesh } from "@babylonjs/core/Meshes/mesh.js";
import { MeshBuilder } from "@babylonjs/core/Meshes/meshBuilder.js";
import { VertexData } from "@babylonjs/core/Meshes/mesh.vertexData.js";
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
import { deriveStarRecipe } from "@exora/worldgen";
import {
  adaptFixedFoveation,
  deriveRenderQuality,
  type RenderQualityTier,
  shaderDefines,
} from "./render-quality.ts";
import type { XrStatus } from "./planet-scene.ts";
import { createXrMenu, type XrMenu, type XrMenuItem } from "./xr-menu.ts";
import { requestVrHandoff } from "./xr-session.ts";

const STAR_VERTEX_SHADER = `
precision highp float;
attribute vec3 position;
attribute vec3 normal;
uniform mat4 world;
uniform mat4 worldViewProjection;
varying vec3 vPosition;
varying vec3 vNormal;
void main(void) {
  vPosition = normalize(position);
  vNormal = normalize(mat3(world) * normal);
  gl_Position = worldViewProjection * vec4(position, 1.0);
}`;

const STAR_FRAGMENT_SHADER = `
precision highp float;
varying vec3 vPosition;
varying vec3 vNormal;
uniform float time;
uniform float seed;
uniform float activity;
uniform vec3 baseColor;
uniform vec3 hotColor;

float hash(vec3 p) {
  p = fract(p * 0.1031 + seed * 0.000017);
  p += dot(p, p.yzx + 33.33);
  return fract((p.x + p.y) * p.z);
}
float noise(vec3 p) {
  vec3 i = floor(p);
  vec3 f = fract(p);
  f = f * f * (3.0 - 2.0 * f);
  return mix(
    mix(mix(hash(i), hash(i + vec3(1,0,0)), f.x), mix(hash(i + vec3(0,1,0)), hash(i + vec3(1,1,0)), f.x), f.y),
    mix(mix(hash(i + vec3(0,0,1)), hash(i + vec3(1,0,1)), f.x), mix(hash(i + vec3(0,1,1)), hash(i + vec3(1,1,1)), f.x), f.y), f.z
  );
}
float fbm(vec3 p) {
  float value = 0.0;
  float amplitude = 0.56;
  for (int i = 0; i < FBM_OCTAVES; i++) {
    value += noise(p) * amplitude;
    p = p.yzx * 2.07 + vec3(7.1, 13.7, 19.3);
    amplitude *= 0.48;
  }
  return value;
}
void main(void) {
  vec3 p = normalize(vPosition);
  float drift = time * 0.035;
  float broad = fbm(p * 3.4 + vec3(drift, 0.0, -drift));
  float cells = fbm(p * 10.0 + vec3(broad * 2.8, drift * 0.6, 4.2));
  float granules = smoothstep(0.46, 0.82, cells + broad * 0.22);
  float darkLane = smoothstep(0.42, 0.7, 1.0 - abs(cells * 2.0 - 1.0));
  float flare = pow(max(0.0, sin(p.y * 15.0 + p.x * 9.0 + time * 0.7)), 14.0) * step(0.84 - activity * 0.2, broad);
  vec3 color = mix(baseColor * 0.72, hotColor, granules * (0.52 + activity * 0.34) + broad * 0.24);
  color *= 0.92 + darkLane * 0.12;
  color += hotColor * flare * 0.55;
  float pulse = 0.98 + sin(time * 0.65 + seed) * 0.018;
  gl_FragColor = vec4(color * pulse, 1.0);
}`;

const STAR_POSITION = new Vector3(0, 0.8, 7.5);
/** Observation platform, parked outside the widest planetary orbit in the system. */
const STAR_DECK_POSITION = new Vector3(0, 0, -9);
const STAR_DECK_RADIUS = 3.6;
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
  onXrStatusChange: (status: XrStatus) => void;
  star: StarProfile;
}

const createStarfield = (scene: Scene, seed: number, count: number): Mesh => {
  const mesh = new Mesh("stellar-background", scene);
  const positions: number[] = [];
  const colors: number[] = [];
  const indices: number[] = [];
  let state = seed || 1;
  const random = (): number => {
    state = (state * 1664525 + 1013904223) >>> 0;
    return state / 4294967296;
  };
  for (let index = 0; index < count; index += 1) {
    const radius = 70 + random() * 30;
    const theta = random() * Math.PI * 2;
    const phi = Math.acos(2 * random() - 1);
    const brightness = 0.25 + random() * 0.75;
    positions.push(
      radius * Math.sin(phi) * Math.cos(theta),
      radius * Math.cos(phi),
      radius * Math.sin(phi) * Math.sin(theta),
    );
    colors.push(brightness * 0.72, brightness * 0.85, brightness, 1);
    indices.push(index);
  }
  const data = new VertexData();
  data.positions = positions;
  data.colors = colors;
  data.indices = indices;
  data.applyToMesh(mesh);
  const material = new StandardMaterial("stellar-background-material", scene);
  material.disableLighting = true;
  material.emissiveColor = Color3.White();
  material.pointsCloud = true;
  material.pointSize = 1.65;
  material.disableDepthWrite = true;
  material.freeze();
  mesh.material = material;
  mesh.isPickable = false;
  return mesh;
};

export const createStarScene = ({
  canvas,
  onFirstFrame,
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
  createStarfield(scene, seed, profile.starCount);
  Effect.ShadersStore.exoraStarVertexShader = STAR_VERTEX_SHADER;
  Effect.ShadersStore.exoraStarFragmentShader = STAR_FRAGMENT_SHADER;

  const starMesh = MeshBuilder.CreateSphere(
    "observed-star",
    { diameter, segments: profile.tier === "desktop" ? 128 : 64 },
    scene,
  );
  starMesh.position.copyFrom(STAR_POSITION);
  starMesh.isPickable = false;
  const material = new ShaderMaterial(
    "observed-star-material",
    scene,
    { vertex: "exoraStar", fragment: "exoraStar" },
    {
      attributes: ["position", "normal"],
      defines: shaderDefines(profile),
      uniforms: [
        "world",
        "worldViewProjection",
        "time",
        "seed",
        "activity",
        "baseColor",
        "hotColor",
      ],
    },
  );
  const [red, green, blue] = recipe.color;
  const baseColor = new Color3(red, green, blue);
  material.setColor3("baseColor", baseColor);
  material.setColor3("hotColor", Color3.Lerp(baseColor, Color3.White(), 0.68));
  material.setFloat("seed", seed);
  material.setFloat("activity", activity);
  material.setFloat("time", 0);
  starMesh.material = material;

  const glow = new GlowLayer("stellar-glow", scene, {
    blurKernelSize: profile.tier === "desktop" ? 48 : 24,
    mainTextureFixedSize: profile.tier === "desktop" ? 512 : 256,
  });
  glow.intensity = 0.5 + activity * 0.42;
  glow.addIncludedOnlyMesh(starMesh);

  // Immersive sessions need something solid underfoot; the deck stays hidden on the flat page.
  const deck = MeshBuilder.CreateCylinder(
    "stellar-deck",
    { diameter: STAR_DECK_RADIUS * 2.2, height: 0.12, tessellation: 64 },
    scene,
  );
  deck.position.set(STAR_DECK_POSITION.x, STAR_DECK_POSITION.y - 0.06, STAR_DECK_POSITION.z);
  deck.isPickable = false;
  deck.isVisible = false;
  const deckMaterial = new StandardMaterial("stellar-deck-material", scene);
  deckMaterial.diffuseColor = new Color3(0.008, 0.014, 0.025);
  deckMaterial.emissiveColor = new Color3(0.015, 0.045, 0.07);
  deckMaterial.specularColor = new Color3(0.1, 0.36, 0.46);
  deckMaterial.alpha = 0.82;
  deckMaterial.freeze();
  deck.material = deckMaterial;
  deck.freezeWorldMatrix();

  const deckRing = MeshBuilder.CreateTorus(
    "stellar-deck-ring",
    { diameter: STAR_DECK_RADIUS * 2, thickness: 0.026, tessellation: 96 },
    scene,
  );
  deckRing.position.set(STAR_DECK_POSITION.x, 0.015, STAR_DECK_POSITION.z);
  deckRing.isPickable = false;
  deckRing.isVisible = false;
  const deckRingMaterial = new StandardMaterial("stellar-deck-ring-material", scene);
  deckRingMaterial.disableLighting = true;
  deckRingMaterial.emissiveColor = new Color3(0.08, 0.82, 1);
  deckRingMaterial.alpha = 0.68;
  deckRingMaterial.freeze();
  deckRing.material = deckRingMaterial;
  deckRing.freezeWorldMatrix();

  const setDeckVisible = (visible: boolean): void => {
    deck.isVisible = visible;
    deckRing.isVisible = visible;
  };

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
    refreshXrMenu();
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
    material.setFloat("time", elapsed);
    starMesh.rotation.y = elapsed * (0.008 + (star.customization?.rotation ?? 0.35) * 0.07);
    for (let index = 0; index < planetTargetRoots.length; index += 1) {
      const root = planetTargetRoots[index];
      if (root) root.rotation.y += ((0.025 + index * 0.004) * engine.getDeltaTime()) / 1_000;
    }

    const rig = isInXr ? xrCamera() : null;
    if (rig) {
      // Thumbstick movement is flat and unbounded, so the wearer is held on the platform.
      const offsetX = rig.position.x - STAR_DECK_POSITION.x;
      const offsetZ = rig.position.z - STAR_DECK_POSITION.z;
      const distance = Math.hypot(offsetX, offsetZ);
      if (distance > STAR_DECK_RADIUS) {
        const scale = STAR_DECK_RADIUS / distance;
        rig.position.x = STAR_DECK_POSITION.x + offsetX * scale;
        rig.position.z = STAR_DECK_POSITION.z + offsetZ * scale;
      }
      rig.position.y += STAR_DECK_POSITION.y - (rig.position.y - rig.realWorldHeight);
      xrMenu?.update(rig, deltaSeconds);
    }

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
  let xrMenu: XrMenu | null = null;
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
   * Puts the wearer on the observation deck facing the star.
   *
   * The rig otherwise starts wherever the headset happened to be pointing, which in a scene this
   * sparse means staring at empty starfield with no clue that anything rendered at all.
   */
  const placeXrCamera = (initial: boolean): void => {
    const rig = xrCamera();
    if (!rig) return;
    const headOffset = initial ? 0 : rig.realWorldHeight;
    rig.position.set(STAR_DECK_POSITION.x, STAR_DECK_POSITION.y + headOffset, STAR_DECK_POSITION.z);
    rig.setTarget(STAR_POSITION);
  };

  const buildXrMenuItems = (): XrMenuItem[] => {
    const items: XrMenuItem[] = [
      {
        id: "recentre",
        label: "Recentre me",
        detail: "Face the star",
        onSelect: () => placeXrCamera(false),
      },
    ];

    const travel = selectPlanet;
    if (travel) {
      for (const planet of menuPlanets.slice(0, 5)) {
        items.push({
          id: `planet-${planet.id}`,
          label: planet.name,
          detail: "Travel to this world",
          onSelect: () => travel(planet),
        });
      }
    }

    items.push({
      id: "exit",
      label: "Exit immersive VR",
      detail: "Back to the browser view",
      onSelect: () => void xr?.baseExperience.exitXRAsync(),
    });
    return items;
  };

  const refreshXrMenu = (): void => xrMenu?.setItems(buildXrMenuItems());

  onXrStatusChange("checking");
  void WebXRDefaultExperience.CreateAsync(scene, {
    disableDefaultUI: true,
    disableNearInteraction: true,
    disableTeleportation: true,
    floorMeshes: [deck],
    // The rigged hand mesh is a remote glTF and no loader is bundled, so joint spheres are used.
    handSupportOptions: { handMeshes: { disableDefaultMeshes: true } },
    inputOptions: { doNotLoadControllerMeshes: true },
    optionalFeatures: ["hand-tracking"],
    outputCanvasOptions: {
      canvasOptions: {
        // An opaque immersive layer saves the headset compositor a per-pixel blend it would
        // otherwise do against nothing, and no view here ever wants to see through the world.
        alpha: false,
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

      xrMenu = createXrMenu(scene, star.name);
      refreshXrMenu();

      createdXr.baseExperience.onInitialXRPoseSetObservable.add(() => placeXrCamera(true));
      createdXr.baseExperience.onStateChangedObservable.add((state) => {
        if (disposed) return;
        if (state === WebXRState.ENTERING_XR) {
          setDeckVisible(true);
          onXrStatusChange("entering");
        }
        if (state === WebXRState.IN_XR) {
          isInXr = true;
          sessionFoveation = profile.xrFixedFoveation;
          if (createdXr.baseExperience.sessionManager.isFixedFoveationSupported) {
            createdXr.baseExperience.sessionManager.fixedFoveation = sessionFoveation;
          }
          refreshXrMenu();
          xrMenu?.setVisible(true);
          onXrStatusChange("in-xr");
        }
        if (state === WebXRState.NOT_IN_XR) {
          isInXr = false;
          xrMenu?.setVisible(false);
          setDeckVisible(false);
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
      xrMenu?.dispose();
      xrMenu = null;
      xr?.dispose();
      engine.stopRenderLoop();
      scene.dispose();
      engine.dispose();
    },
  };
};
