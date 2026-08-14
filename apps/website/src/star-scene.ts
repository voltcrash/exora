import { ArcRotateCamera } from "@babylonjs/core/Cameras/arcRotateCamera.js";
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
import { Scene, ScenePerformancePriority } from "@babylonjs/core/scene.js";
import { WebXRDefaultExperience } from "@babylonjs/core/XR/webXRDefaultExperience.js";
import "@babylonjs/core/XR/features/WebXRControllerPointerSelection.js";
import "@babylonjs/core/XR/features/WebXRHandTracking.js";
import { WebXRState } from "@babylonjs/core/XR/webXRTypes.js";
import type { StarProfile } from "@exora/contracts";
import { deriveRenderQuality, type RenderQualityTier } from "./render-quality.ts";
import { deriveStarVisual } from "./star-utils.ts";
import type { XrStatus } from "./planet-scene.ts";

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
  for (int i = 0; i < 5; i++) {
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

export interface StarSceneExperience {
  dispose: () => void;
  enterVr: () => Promise<void>;
  getFps: () => number;
  qualityTier: RenderQualityTier;
}

interface StarSceneOptions {
  canvas: HTMLCanvasElement;
  onFirstFrame: () => void;
  onXrStatusChange: (status: XrStatus) => void;
  star: StarProfile;
}

const hashName = (name: string): number => {
  let hash = 2166136261;
  for (const character of name) hash = Math.imul(hash ^ character.charCodeAt(0), 16777619);
  return hash >>> 0;
};

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
  scene.skipPointerMovePicking = true;

  const camera = new ArcRotateCamera(
    "stellar-camera",
    -Math.PI / 2,
    Math.PI / 2.08,
    15.5,
    new Vector3(0, 0.8, 7.5),
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

  const seed = hashName(star.catalogName);
  const visual = deriveStarVisual(star);
  const activity = star.customization?.activity ?? 0.55;
  const diameter = 5.6 + (star.customization?.radius ?? 0.5) * 3.2;
  createStarfield(scene, seed, profile.starCount);
  Effect.ShadersStore.exoraStarVertexShader = STAR_VERTEX_SHADER;
  Effect.ShadersStore.exoraStarFragmentShader = STAR_FRAGMENT_SHADER;

  const starMesh = MeshBuilder.CreateSphere(
    "observed-star",
    { diameter, segments: profile.tier === "desktop" ? 128 : 64 },
    scene,
  );
  starMesh.position.set(0, 0.8, 7.5);
  starMesh.isPickable = false;
  const material = new ShaderMaterial(
    "observed-star-material",
    scene,
    { vertex: "exoraStar", fragment: "exoraStar" },
    {
      attributes: ["position", "normal"],
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
  const [red, green, blue] = visual.color;
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

  let elapsed = 0;
  let firstFrame = true;
  scene.onBeforeRenderObservable.add(() => {
    elapsed += Math.min(engine.getDeltaTime() / 1_000, 0.05);
    material.setFloat("time", elapsed);
    starMesh.rotation.y = elapsed * (0.008 + (star.customization?.rotation ?? 0.35) * 0.07);
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
  let vrSupported = false;
  let disposed = false;
  onXrStatusChange("checking");
  void WebXRDefaultExperience.CreateAsync(scene, {
    disableDefaultUI: true,
    disableNearInteraction: true,
    disableTeleportation: true,
    inputOptions: { doNotLoadControllerMeshes: true },
  })
    .then(async (createdXr) => {
      if (disposed) return createdXr.dispose();
      xr = createdXr;
      createdXr.baseExperience.onStateChangedObservable.add((state) => {
        if (disposed) return;
        if (state === WebXRState.ENTERING_XR) onXrStatusChange("entering");
        if (state === WebXRState.IN_XR) onXrStatusChange("in-xr");
        if (state === WebXRState.NOT_IN_XR) onXrStatusChange(vrSupported ? "ready" : "unavailable");
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
    getFps: () => engine.getFps(),
    enterVr: async () => {
      if (!xr || !vrSupported) return;
      await xr.baseExperience.enterXRAsync("immersive-vr", "local-floor", xr.renderTarget);
    },
    dispose: () => {
      if (disposed) return;
      disposed = true;
      window.removeEventListener("resize", resize);
      xr?.dispose();
      engine.stopRenderLoop();
      scene.dispose();
      engine.dispose();
    },
  };
};
