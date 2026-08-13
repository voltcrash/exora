import { ArcRotateCamera } from "@babylonjs/core/Cameras/arcRotateCamera.js";
import { Engine } from "@babylonjs/core/Engines/engine.js";
import { DirectionalLight } from "@babylonjs/core/Lights/directionalLight.js";
import { Color3, Color4 } from "@babylonjs/core/Maths/math.color.js";
import { Vector3 } from "@babylonjs/core/Maths/math.vector.js";
import { Effect } from "@babylonjs/core/Materials/effect.js";
import { ShaderMaterial } from "@babylonjs/core/Materials/shaderMaterial.js";
import { StandardMaterial } from "@babylonjs/core/Materials/standardMaterial.js";
import type { AbstractMesh } from "@babylonjs/core/Meshes/abstractMesh.js";
import { Mesh } from "@babylonjs/core/Meshes/mesh.js";
import { MeshBuilder } from "@babylonjs/core/Meshes/meshBuilder.js";
import { VertexData } from "@babylonjs/core/Meshes/mesh.vertexData.js";
import { Scene, ScenePerformancePriority } from "@babylonjs/core/scene.js";
import { TransformNode } from "@babylonjs/core/Meshes/transformNode.js";
import { WebXRDefaultExperience } from "@babylonjs/core/XR/webXRDefaultExperience.js";
import "@babylonjs/core/XR/features/WebXRControllerPointerSelection.js";
import "@babylonjs/core/XR/features/WebXRControllerTeleportation.js";
import "@babylonjs/core/XR/features/WebXRHandTracking.js";
import { WebXRState } from "@babylonjs/core/XR/webXRTypes.js";
import type { Rgb, WorldRecipe } from "@exora/worldgen";
import {
  adaptHardwareScaling,
  deriveRenderQuality,
  type RenderQualityProfile,
  type RenderQualityTier,
} from "./render-quality.ts";

const PLANET_POSITION = new Vector3(0, 1.35, 9.5);
const VIEWING_DECK_POSITION = new Vector3(0, 0, -7.4);
const LIGHT_DIRECTION = new Vector3(-0.82, 0.3, -0.38).normalize();

const PLANET_VERTEX_SHADER = `
precision highp float;

attribute vec3 position;
attribute vec3 normal;

uniform mat4 world;
uniform mat4 worldViewProjection;

varying vec3 vWorldPosition;
varying vec3 vWorldNormal;

void main(void) {
  vec4 worldPosition = world * vec4(position, 1.0);
  vWorldPosition = worldPosition.xyz;
  vWorldNormal = normalize(mat3(world) * normal);
  gl_Position = worldViewProjection * vec4(position, 1.0);
}
`;

const PLANET_FRAGMENT_SHADER = `
precision highp float;

varying vec3 vWorldPosition;
varying vec3 vWorldNormal;

uniform float time;
uniform float seed;
uniform float turbulence;
uniform float contrast;
uniform float jetCount;
uniform float stormLatitude;
uniform float stormScale;
uniform float stormStrength;
uniform vec3 cameraPosition;
uniform vec3 lightDirection;
uniform vec3 deepColor;
uniform vec3 midColor;
uniform vec3 lightColor;
uniform vec3 stormColor;

float hash(vec2 point) {
  point = fract(point * vec2(123.34, 456.21));
  point += dot(point, point + 45.32 + seed * 0.0001);
  return fract(point.x * point.y);
}

float noise(vec2 point) {
  vec2 index = floor(point);
  vec2 fraction = fract(point);
  fraction = fraction * fraction * (3.0 - 2.0 * fraction);

  return mix(
    mix(hash(index), hash(index + vec2(1.0, 0.0)), fraction.x),
    mix(hash(index + vec2(0.0, 1.0)), hash(index + vec2(1.0, 1.0)), fraction.x),
    fraction.y
  );
}

float fbm(vec2 point) {
  float value = 0.0;
  float amplitude = 0.5;
  mat2 rotation = mat2(0.8, -0.6, 0.6, 0.8);

  for (int octave = 0; octave < 5; octave++) {
    value += amplitude * noise(point);
    point = rotation * point * 2.04 + 11.7;
    amplitude *= 0.5;
  }

  return value;
}

void main(void) {
  vec3 normal = normalize(vWorldNormal);
  float longitude = atan(normal.z, normal.x);
  float latitude = asin(clamp(normal.y, -1.0, 1.0));
  float flow = time * 0.035;

  vec2 cloudUv = vec2(longitude * 2.4 + flow, latitude * 11.5);
  float broadNoise = fbm(vec2(longitude * 1.2 - flow * 0.3, latitude * 5.0));
  float fineNoise = fbm(cloudUv * vec2(1.0, turbulence));
  float jetShear = sin(latitude * jetCount) * 0.18;
  float bands = sin(latitude * jetCount * 2.0 + broadNoise * 5.0 + fineNoise * 2.4);
  float bandMix = smoothstep(-0.72, 0.78, bands) * contrast;
  float stormLongitude = sin(seed * 0.00013) * 2.4;
  float wrappedLongitude = atan(sin(longitude - stormLongitude), cos(longitude - stormLongitude));
  vec2 stormUv = vec2(wrappedLongitude * cos(stormLatitude), latitude - stormLatitude);
  float stormDistance = length(stormUv * vec2(stormScale * 0.62, stormScale * 1.7));
  float stormCore = 1.0 - smoothstep(0.48, 1.0, stormDistance);
  float stormSpiral = sin(atan(stormUv.y, stormUv.x) * 4.0 - stormDistance * 17.0 + flow * 2.0);
  float storms = stormCore * (0.72 + stormSpiral * 0.28) * stormStrength;
  float cells = smoothstep(0.68, 0.9, fbm(vec2(longitude * 3.1 + flow + jetShear, latitude * 8.0)));

  vec3 cloudColor = mix(deepColor, midColor, 0.35 + broadNoise * 0.5);
  cloudColor = mix(cloudColor, lightColor, clamp(bandMix + cells * 0.22, 0.0, 1.0));
  cloudColor = mix(cloudColor, stormColor, clamp(storms, 0.0, 0.9));

  float diffuse = max(dot(normal, lightDirection), 0.0);
  float wrappedLight = 0.2 + diffuse * 0.92;
  vec3 viewDirection = normalize(cameraPosition - vWorldPosition);
  float rim = pow(1.0 - max(dot(normal, viewDirection), 0.0), 3.0);
  vec3 finalColor = cloudColor * wrappedLight + midColor * rim * 0.38;

  gl_FragColor = vec4(finalColor, 1.0);
}
`;

const ICE_GIANT_FRAGMENT_SHADER = `
precision highp float;

varying vec3 vWorldPosition;
varying vec3 vWorldNormal;

uniform float time;
uniform float seed;
uniform float bandScale;
uniform float stormStrength;
uniform float stormLatitude;
uniform float polarGlow;
uniform vec3 cameraPosition;
uniform vec3 lightDirection;
uniform vec3 deepColor;
uniform vec3 hazeColor;
uniform vec3 lightColor;

float hash(vec2 point) {
  point = fract(point * vec2(127.1, 311.7));
  point += dot(point, point + 19.19 + seed * 0.00007);
  return fract(point.x * point.y);
}

float noise(vec2 point) {
  vec2 index = floor(point);
  vec2 fraction = fract(point);
  fraction = fraction * fraction * (3.0 - 2.0 * fraction);
  return mix(
    mix(hash(index), hash(index + vec2(1.0, 0.0)), fraction.x),
    mix(hash(index + vec2(0.0, 1.0)), hash(index + vec2(1.0, 1.0)), fraction.x),
    fraction.y
  );
}

float fbm(vec2 point) {
  float value = 0.0;
  float amplitude = 0.52;
  for (int octave = 0; octave < 4; octave++) {
    value += amplitude * noise(point);
    point = point * 2.07 + vec2(9.3, 14.8);
    amplitude *= 0.48;
  }
  return value;
}

void main(void) {
  vec3 normal = normalize(vWorldNormal);
  float longitude = atan(normal.z, normal.x);
  float latitude = asin(clamp(normal.y, -1.0, 1.0));
  float flow = time * 0.018;
  float haze = fbm(vec2(longitude * 1.7 + flow, latitude * bandScale));
  float bands = sin(latitude * bandScale * 2.4 + haze * 2.8) * 0.5 + 0.5;
  float stormNoise = fbm(vec2(longitude * 4.2 - flow * 1.8, latitude * 8.0));
  float latitudeMask = 1.0 - smoothstep(0.08, 0.48, abs(latitude - stormLatitude));
  float storms = smoothstep(0.64, 0.9, stormNoise) * stormStrength * latitudeMask;
  float pole = pow(smoothstep(0.55, 1.3, abs(latitude)), 2.0) * polarGlow;

  vec3 atmosphereColor = mix(deepColor, hazeColor, 0.32 + haze * 0.5);
  atmosphereColor = mix(atmosphereColor, lightColor, bands * 0.24 + storms);

  float diffuse = max(dot(normal, lightDirection), 0.0);
  float wrappedLight = 0.22 + diffuse * 0.9;
  vec3 viewDirection = normalize(cameraPosition - vWorldPosition);
  float rim = pow(1.0 - max(dot(normal, viewDirection), 0.0), 2.5);
  vec3 finalColor = atmosphereColor * wrappedLight + hazeColor * rim * 0.46;
  finalColor += lightColor * pole * (0.16 + 0.08 * sin(longitude * 5.0 + flow * 3.0));
  gl_FragColor = vec4(finalColor, 1.0);
}
`;

const ROCKY_VERTEX_SHADER = `
precision highp float;

attribute vec3 position;
attribute vec3 normal;

uniform mat4 world;
uniform mat4 worldViewProjection;
uniform float seed;
uniform float elevation;
uniform float roughness;

varying vec3 vWorldPosition;
varying vec3 vWorldNormal;
varying vec3 vSurfacePosition;
varying float vHeight;

float hash(vec3 point) {
  point = fract(point * 0.1031 + seed * 0.000013);
  point += dot(point, point.yzx + 33.33);
  return fract((point.x + point.y) * point.z);
}

float noise(vec3 point) {
  vec3 index = floor(point);
  vec3 fraction = fract(point);
  fraction = fraction * fraction * (3.0 - 2.0 * fraction);

  return mix(
    mix(mix(hash(index), hash(index + vec3(1.0, 0.0, 0.0)), fraction.x),
        mix(hash(index + vec3(0.0, 1.0, 0.0)), hash(index + vec3(1.0, 1.0, 0.0)), fraction.x), fraction.y),
    mix(mix(hash(index + vec3(0.0, 0.0, 1.0)), hash(index + vec3(1.0, 0.0, 1.0)), fraction.x),
        mix(hash(index + vec3(0.0, 1.0, 1.0)), hash(index + vec3(1.0, 1.0, 1.0)), fraction.x), fraction.y),
    fraction.z
  );
}

float fbm(vec3 point) {
  float value = 0.0;
  float amplitude = 0.54;
  for (int octave = 0; octave < 5; octave++) {
    value += amplitude * noise(point);
    point = point * 2.03 + vec3(7.1, 13.7, 19.3);
    amplitude *= 0.48;
  }
  return value;
}

void main(void) {
  vec3 direction = normalize(position);
  float continents = fbm(direction * roughness);
  float ridges = abs(fbm(direction * roughness * 2.15 + vec3(17.0)) * 2.0 - 1.0);
  float terrain = clamp(continents * 0.78 + (1.0 - ridges) * 0.22, 0.0, 1.0);
  vec3 displacedPosition = position + normal * ((terrain - 0.44) * elevation);
  vec4 worldPosition = world * vec4(displacedPosition, 1.0);

  vHeight = terrain;
  vSurfacePosition = direction;
  vWorldPosition = worldPosition.xyz;
  vWorldNormal = normalize(mat3(world) * normal);
  gl_Position = worldViewProjection * vec4(displacedPosition, 1.0);
}
`;

const ROCKY_FRAGMENT_SHADER = `
precision highp float;

varying vec3 vWorldPosition;
varying vec3 vWorldNormal;
varying vec3 vSurfacePosition;
varying float vHeight;

uniform float seed;
uniform float craterDensity;
uniform float waterLevel;
uniform float time;
uniform float lavaStrength;
uniform float iceCapStrength;
uniform vec3 cameraPosition;
uniform vec3 lightDirection;
uniform vec3 lowColor;
uniform vec3 midColor;
uniform vec3 highColor;
uniform vec3 waterColor;
uniform vec3 emissiveColor;

float hash(vec3 point) {
  point = fract(point * 0.1031 + seed * 0.000017);
  point += dot(point, point.yzx + 31.32);
  return fract((point.x + point.y) * point.z);
}

void main(void) {
  vec3 normal = normalize(vWorldNormal);
  vec3 craterPoint = (vSurfacePosition + 1.0) * 18.0;
  vec3 craterCell = floor(craterPoint);
  vec3 craterLocal = fract(craterPoint) - 0.5;
  float craterNoise = hash(craterCell);
  float craterRadius = 0.2 + hash(craterCell + 4.7) * 0.18;
  float craterCandidate = step(1.0 - craterDensity * 0.12, craterNoise);
  float crater = (1.0 - smoothstep(craterRadius * 0.58, craterRadius, length(craterLocal))) * craterCandidate;
  float detail = hash(floor((vSurfacePosition + 1.0) * 95.0)) - 0.5;
  float fractureA = abs(sin((vSurfacePosition.x + vSurfacePosition.z * 0.7) * 42.0 + detail * 7.0));
  float fractureB = abs(sin((vSurfacePosition.y - vSurfacePosition.x * 0.45) * 31.0 - detail * 5.0));
  float fractures = (1.0 - smoothstep(0.0, 0.11, min(fractureA, fractureB))) * lavaStrength;

  vec3 rockColor = mix(lowColor, midColor, smoothstep(0.28, 0.62, vHeight));
  rockColor = mix(rockColor, highColor, smoothstep(0.62, 0.9, vHeight));
  rockColor *= 0.9 + detail * 0.16;
  rockColor = mix(rockColor, lowColor * 0.45, crater * 0.72);

  float waterMask = waterLevel > 0.0 ? 1.0 - smoothstep(waterLevel - 0.018, waterLevel + 0.018, vHeight) : 0.0;
  vec3 surfaceColor = mix(rockColor, waterColor, waterMask * 0.92);
  float polarMask = smoothstep(0.58, 0.94, abs(vSurfacePosition.y)) * iceCapStrength;
  surfaceColor = mix(surfaceColor, vec3(0.72, 0.84, 0.88), polarMask * (0.64 + detail * 0.14));
  float diffuse = max(dot(normal, lightDirection), 0.0);
  float wrappedLight = 0.16 + diffuse * 0.98;
  vec3 viewDirection = normalize(cameraPosition - vWorldPosition);
  vec3 halfDirection = normalize(lightDirection + viewDirection);
  float waterSpecular = pow(max(dot(normal, halfDirection), 0.0), 46.0) * waterMask;
  float rim = pow(1.0 - max(dot(normal, viewDirection), 0.0), 3.0);

  vec3 finalColor = surfaceColor * wrappedLight + vec3(0.34, 0.58, 0.72) * waterSpecular * 0.45;
  finalColor += highColor * rim * 0.08;
  finalColor += emissiveColor * fractures * (0.72 + 0.28 * sin(time * 0.7 + detail * 8.0));
  gl_FragColor = vec4(finalColor, 1.0);
}
`;

const CLOUD_FRAGMENT_SHADER = `
precision highp float;

varying vec3 vWorldPosition;
varying vec3 vWorldNormal;

uniform float time;
uniform float seed;
uniform float cloudCover;
uniform vec3 cloudColor;
uniform vec3 cameraPosition;
uniform vec3 lightDirection;

float hash(vec3 point) {
  point = fract(point * 0.1031 + seed * 0.000021);
  point += dot(point, point.yzx + 27.17);
  return fract((point.x + point.y) * point.z);
}

float noise(vec3 point) {
  vec3 index = floor(point);
  vec3 fraction = fract(point);
  fraction = fraction * fraction * (3.0 - 2.0 * fraction);
  return mix(
    mix(mix(hash(index), hash(index + vec3(1.0, 0.0, 0.0)), fraction.x),
        mix(hash(index + vec3(0.0, 1.0, 0.0)), hash(index + vec3(1.0, 1.0, 0.0)), fraction.x), fraction.y),
    mix(mix(hash(index + vec3(0.0, 0.0, 1.0)), hash(index + vec3(1.0, 0.0, 1.0)), fraction.x),
        mix(hash(index + vec3(0.0, 1.0, 1.0)), hash(index + vec3(1.0, 1.0, 1.0)), fraction.x), fraction.y),
    fraction.z
  );
}

float fbm(vec3 point) {
  float value = 0.0;
  float amplitude = 0.54;
  for (int octave = 0; octave < 4; octave++) {
    value += amplitude * noise(point);
    point = point * 2.06 + vec3(8.1, 13.4, 4.7);
    amplitude *= 0.48;
  }
  return value;
}

void main(void) {
  vec3 normal = normalize(vWorldNormal);
  vec3 samplePosition = normal * 3.2 + vec3(time * 0.028, 0.0, time * -0.014);
  float cloudNoise = fbm(samplePosition);
  float threshold = mix(0.74, 0.43, cloudCover);
  float cloud = smoothstep(threshold, threshold + 0.16, cloudNoise);
  vec3 viewDirection = normalize(cameraPosition - vWorldPosition);
  float rim = pow(1.0 - max(dot(normal, viewDirection), 0.0), 2.2);
  float diffuse = 0.28 + max(dot(normal, lightDirection), 0.0) * 0.78;
  gl_FragColor = vec4(cloudColor * (diffuse + rim * 0.34), cloud * (0.24 + cloudCover * 0.48));
}
`;

const ATMOSPHERE_VERTEX_SHADER = `
precision highp float;

attribute vec3 position;
attribute vec3 normal;

uniform mat4 world;
uniform mat4 worldViewProjection;

varying vec3 vWorldPosition;
varying vec3 vWorldNormal;

void main(void) {
  vec4 worldPosition = world * vec4(position, 1.0);
  vWorldPosition = worldPosition.xyz;
  vWorldNormal = normalize(mat3(world) * normal);
  gl_Position = worldViewProjection * vec4(position, 1.0);
}
`;

const ATMOSPHERE_FRAGMENT_SHADER = `
precision highp float;

varying vec3 vWorldPosition;
varying vec3 vWorldNormal;

uniform vec3 atmosphereColor;
uniform vec3 cameraPosition;
uniform float time;
uniform float activity;

void main(void) {
  vec3 normal = normalize(vWorldNormal);
  vec3 viewDirection = normalize(cameraPosition - vWorldPosition);
  float rim = pow(1.0 - max(dot(normal, viewDirection), 0.0), 2.25);
  float pulse = 0.92 + sin(time * 0.42) * 0.08 * activity;
  float alpha = smoothstep(0.03, 1.0, rim) * (0.42 + activity * 0.16) * pulse;
  gl_FragColor = vec4(atmosphereColor * (0.75 + rim * (1.35 + activity * 0.5)), alpha);
}
`;

export type XrStatus = "checking" | "entering" | "in-xr" | "ready" | "unavailable";
export type ViewMode = "orbit" | "surface" | "transition";

export interface PlanetExperience {
  dispose: () => void;
  enterVr: () => Promise<void>;
  getFps: () => number;
  isVrSupported: boolean;
  qualityTier: RenderQualityTier;
}

interface PlanetExperienceOptions {
  canvas: HTMLCanvasElement;
  onFirstFrame: () => void;
  onViewModeChange: (mode: ViewMode) => void;
  onXrStatusChange: (status: XrStatus) => void;
  recipe: WorldRecipe;
}

const toColor3 = ([red, green, blue]: Rgb): Color3 => new Color3(red, green, blue);

const createStarfield = (scene: Scene, seed: number, starCount: number): Mesh => {
  const starfield = new Mesh("starfield", scene);
  const positions: number[] = [];
  const colors: number[] = [];
  const indices: number[] = [];
  let randomState = seed || 1;

  const random = (): number => {
    randomState = (randomState * 1664525 + 1013904223) >>> 0;
    return randomState / 4294967296;
  };

  for (let index = 0; index < starCount; index += 1) {
    const distance = 70 + random() * 45;
    const theta = random() * Math.PI * 2;
    const phi = Math.acos(2 * random() - 1);
    const brightness = 0.35 + random() * 0.65;

    positions.push(
      distance * Math.sin(phi) * Math.cos(theta),
      distance * Math.cos(phi),
      distance * Math.sin(phi) * Math.sin(theta),
    );
    colors.push(brightness * 0.78, brightness * 0.9, brightness, 1);
    indices.push(index);
  }

  const vertexData = new VertexData();
  vertexData.positions = positions;
  vertexData.colors = colors;
  vertexData.indices = indices;
  vertexData.applyToMesh(starfield);

  const starMaterial = new StandardMaterial("starMaterial", scene);
  starMaterial.disableLighting = true;
  starMaterial.emissiveColor = Color3.White();
  starMaterial.pointsCloud = true;
  starMaterial.pointSize = 1.7;
  starMaterial.disableDepthWrite = true;
  starMaterial.freeze();
  starfield.material = starMaterial;
  starfield.isPickable = false;
  starfield.alwaysSelectAsActiveMesh = true;
  starfield.freezeWorldMatrix();

  return starfield;
};

interface ViewingDeck {
  floor: Mesh;
  ring: Mesh;
}

const createViewingDeck = (scene: Scene, profile: RenderQualityProfile): ViewingDeck => {
  const deck = MeshBuilder.CreateCylinder(
    "viewingDeck",
    { diameter: 5.8, height: 0.12, tessellation: 64 },
    scene,
  );
  deck.position.copyFrom(VIEWING_DECK_POSITION);
  deck.position.y = -0.06;

  const deckMaterial = new StandardMaterial("deckMaterial", scene);
  deckMaterial.diffuseColor = new Color3(0.008, 0.014, 0.025);
  deckMaterial.emissiveColor = new Color3(0.015, 0.045, 0.07);
  deckMaterial.specularColor = new Color3(0.1, 0.36, 0.46);
  deckMaterial.alpha = 0.82;
  deckMaterial.freeze();
  deck.material = deckMaterial;
  deck.freezeWorldMatrix();
  deck.isVisible = false;

  const deckRing = MeshBuilder.CreateTorus(
    "deckRing",
    { diameter: 5.25, thickness: 0.026, tessellation: profile.ringTessellation },
    scene,
  );
  deckRing.position.set(VIEWING_DECK_POSITION.x, 0.015, VIEWING_DECK_POSITION.z);

  const ringMaterial = new StandardMaterial("deckRingMaterial", scene);
  ringMaterial.disableLighting = true;
  ringMaterial.emissiveColor = new Color3(0.08, 0.82, 1);
  ringMaterial.alpha = 0.68;
  ringMaterial.freeze();
  deckRing.material = ringMaterial;
  deckRing.freezeWorldMatrix();
  deckRing.isVisible = false;

  return { floor: deck, ring: deckRing };
};

const setViewingDeckVisible = (viewingDeck: ViewingDeck, visible: boolean): void => {
  viewingDeck.floor.isVisible = visible;
  viewingDeck.ring.isVisible = visible;
};

const createRingSystem = (
  scene: Scene,
  profile: RenderQualityProfile,
  radius: number,
  outerRadius: number,
  color: Rgb,
  opacity: number,
  tilt: number,
): TransformNode => {
  const ringSystem = new TransformNode("ringSystem", scene);
  ringSystem.position.copyFrom(PLANET_POSITION);
  ringSystem.rotation.x = 0.88 + tilt * 0.36;
  ringSystem.rotation.z = tilt;
  const ringCount = profile.tier === "desktop" ? 9 : 6;
  const span = outerRadius - radius * 1.08;

  for (let index = 0; index < ringCount; index += 1) {
    const progress = (index + 0.35) / ringCount;
    const ringRadius = radius * 1.08 + span * progress;
    const ring = MeshBuilder.CreateTorus(
      `planetRing-${index}`,
      {
        diameter: ringRadius * 2,
        thickness: Math.max(0.016, span * (0.035 + (index % 3) * 0.012)),
        tessellation: profile.ringTessellation,
      },
      scene,
    );
    ring.parent = ringSystem;
    ring.isPickable = false;

    const material = new StandardMaterial(`planetRingMaterial-${index}`, scene);
    const ringColor = toColor3(color).scale(0.72 + (index % 4) * 0.09);
    material.disableLighting = true;
    material.diffuseColor = ringColor;
    material.emissiveColor = ringColor.scale(0.32);
    material.alpha = opacity * (0.48 + ((index * 7) % 5) * 0.13);
    material.backFaceCulling = false;
    material.disableDepthWrite = true;
    material.freeze();
    ring.material = material;
  }

  return ringSystem;
};

const createPlanet = (
  scene: Scene,
  recipe: WorldRecipe,
  profile: RenderQualityProfile,
): {
  atmosphere: ShaderMaterial;
  cloudLayer: ShaderMaterial | null;
  cloudMesh: Mesh | null;
  moonOrbit: TransformNode;
  orbitalMeshes: AbstractMesh[];
  orbitalRoot: TransformNode;
  planet: Mesh;
  ringSystem: TransformNode | null;
  shader: ShaderMaterial;
} => {
  Effect.ShadersStore.exoraPlanetVertexShader = PLANET_VERTEX_SHADER;
  Effect.ShadersStore.exoraPlanetFragmentShader = PLANET_FRAGMENT_SHADER;
  Effect.ShadersStore.exoraIceGiantFragmentShader = ICE_GIANT_FRAGMENT_SHADER;
  Effect.ShadersStore.exoraRockyVertexShader = ROCKY_VERTEX_SHADER;
  Effect.ShadersStore.exoraRockyFragmentShader = ROCKY_FRAGMENT_SHADER;
  Effect.ShadersStore.exoraCloudFragmentShader = CLOUD_FRAGMENT_SHADER;
  Effect.ShadersStore.exoraAtmosphereVertexShader = ATMOSPHERE_VERTEX_SHADER;
  Effect.ShadersStore.exoraAtmosphereFragmentShader = ATMOSPHERE_FRAGMENT_SHADER;

  const orbitalRoot = new TransformNode("orbitalWorld", scene);
  const orbitalMeshes: AbstractMesh[] = [];

  const planet = MeshBuilder.CreateSphere(
    "planet",
    { diameter: recipe.radiusSceneUnits * 2, segments: profile.planetSegments },
    scene,
  );
  planet.position.copyFrom(PLANET_POSITION);
  planet.parent = orbitalRoot;
  planet.rotation.z = recipe.axialTilt;
  planet.isPickable = false;
  orbitalMeshes.push(planet);

  let shader: ShaderMaterial;

  if (recipe.renderer === "rocky") {
    shader = new ShaderMaterial(
      "rockyPlanetMaterial",
      scene,
      { vertex: "exoraRocky", fragment: "exoraRocky" },
      {
        attributes: ["position", "normal"],
        uniforms: [
          "world",
          "worldViewProjection",
          "cameraPosition",
          "seed",
          "elevation",
          "roughness",
          "craterDensity",
          "waterLevel",
          "time",
          "lavaStrength",
          "iceCapStrength",
          "lightDirection",
          "lowColor",
          "midColor",
          "highColor",
          "waterColor",
          "emissiveColor",
        ],
      },
    );
  } else if (recipe.renderer === "ice-giant") {
    shader = new ShaderMaterial(
      "iceGiantPlanetMaterial",
      scene,
      { vertex: "exoraPlanet", fragment: "exoraIceGiant" },
      {
        attributes: ["position", "normal"],
        uniforms: [
          "world",
          "worldViewProjection",
          "cameraPosition",
          "time",
          "seed",
          "bandScale",
          "stormStrength",
          "stormLatitude",
          "polarGlow",
          "lightDirection",
          "deepColor",
          "hazeColor",
          "lightColor",
        ],
      },
    );
  } else {
    shader = new ShaderMaterial(
      "gasGiantPlanetMaterial",
      scene,
      { vertex: "exoraPlanet", fragment: "exoraPlanet" },
      {
        attributes: ["position", "normal"],
        uniforms: [
          "world",
          "worldViewProjection",
          "cameraPosition",
          "time",
          "seed",
          "turbulence",
          "contrast",
          "jetCount",
          "stormLatitude",
          "stormScale",
          "stormStrength",
          "lightDirection",
          "deepColor",
          "midColor",
          "lightColor",
          "stormColor",
        ],
      },
    );
  }

  shader.setFloat("seed", recipe.seed);
  shader.setVector3("lightDirection", LIGHT_DIRECTION);

  if (recipe.renderer === "rocky") {
    shader.setFloat("elevation", recipe.surface.elevation);
    shader.setFloat("roughness", recipe.surface.roughness);
    shader.setFloat("craterDensity", recipe.surface.craterDensity);
    shader.setFloat("waterLevel", recipe.surface.waterLevel);
    shader.setFloat("lavaStrength", recipe.surface.lavaStrength);
    shader.setFloat("iceCapStrength", recipe.surface.iceCapStrength);
    shader.setColor3("lowColor", toColor3(recipe.surface.lowColor));
    shader.setColor3("midColor", toColor3(recipe.surface.midColor));
    shader.setColor3("highColor", toColor3(recipe.surface.highColor));
    shader.setColor3("waterColor", toColor3(recipe.surface.waterColor));
    shader.setColor3("emissiveColor", toColor3(recipe.surface.emissiveColor));
  } else if (recipe.renderer === "ice-giant") {
    shader.setFloat("bandScale", recipe.atmosphereBands.bandScale);
    shader.setFloat("stormStrength", recipe.atmosphereBands.stormStrength);
    shader.setFloat("stormLatitude", recipe.atmosphereBands.stormLatitude);
    shader.setFloat("polarGlow", recipe.atmosphereBands.polarGlow);
    shader.setColor3("deepColor", toColor3(recipe.atmosphereBands.deepColor));
    shader.setColor3("hazeColor", toColor3(recipe.atmosphereBands.hazeColor));
    shader.setColor3("lightColor", toColor3(recipe.atmosphereBands.lightColor));
  } else {
    shader.setFloat("turbulence", recipe.cloudBands.turbulence);
    shader.setFloat("contrast", recipe.cloudBands.contrast);
    shader.setFloat("jetCount", recipe.cloudBands.jetCount);
    shader.setFloat("stormLatitude", recipe.cloudBands.stormLatitude);
    shader.setFloat("stormScale", recipe.cloudBands.stormScale);
    shader.setFloat("stormStrength", recipe.cloudBands.stormStrength);
    shader.setColor3("deepColor", toColor3(recipe.cloudBands.deepColor));
    shader.setColor3("midColor", toColor3(recipe.cloudBands.midColor));
    shader.setColor3("lightColor", toColor3(recipe.cloudBands.lightColor));
    shader.setColor3("stormColor", toColor3(recipe.cloudBands.stormColor));
  }
  planet.material = shader;

  const ringRecipe = recipe.renderer === "rocky" ? null : recipe.rings;
  const ringSystem = ringRecipe
    ? createRingSystem(
        scene,
        profile,
        recipe.radiusSceneUnits,
        ringRecipe.outerRadius,
        ringRecipe.color,
        ringRecipe.opacity,
        recipe.axialTilt,
      )
    : null;
  if (ringSystem) {
    ringSystem.parent = orbitalRoot;
    orbitalMeshes.push(...ringSystem.getChildMeshes(false));
  }

  let cloudMesh: Mesh | null = null;
  let cloudLayer: ShaderMaterial | null = null;
  if (recipe.renderer === "rocky" && recipe.surface.cloudCover > 0) {
    cloudMesh = MeshBuilder.CreateSphere(
      "cloudLayer",
      { diameter: recipe.radiusSceneUnits * 2.035, segments: profile.planetSegments },
      scene,
    );
    cloudMesh.position.copyFrom(PLANET_POSITION);
    cloudMesh.parent = orbitalRoot;
    cloudMesh.rotation.z = recipe.axialTilt;
    cloudMesh.isPickable = false;
    cloudMesh.renderingGroupId = 1;
    orbitalMeshes.push(cloudMesh);
    cloudLayer = new ShaderMaterial(
      "cloudLayerMaterial",
      scene,
      { vertex: "exoraAtmosphere", fragment: "exoraCloud" },
      {
        attributes: ["position", "normal"],
        uniforms: [
          "world",
          "worldViewProjection",
          "cameraPosition",
          "time",
          "seed",
          "cloudCover",
          "cloudColor",
          "lightDirection",
        ],
        needAlphaBlending: true,
      },
    );
    cloudLayer.setFloat("seed", recipe.seed);
    cloudLayer.setFloat("cloudCover", recipe.surface.cloudCover);
    cloudLayer.setColor3("cloudColor", toColor3(recipe.surface.cloudColor));
    cloudLayer.setVector3("lightDirection", LIGHT_DIRECTION);
    cloudLayer.backFaceCulling = true;
    cloudLayer.disableDepthWrite = true;
    cloudMesh.material = cloudLayer;
  }

  const atmosphereMesh = MeshBuilder.CreateSphere(
    "atmosphere",
    { diameter: recipe.radiusSceneUnits * 2.08, segments: profile.planetSegments },
    scene,
  );
  atmosphereMesh.position.copyFrom(PLANET_POSITION);
  atmosphereMesh.parent = orbitalRoot;
  atmosphereMesh.isPickable = false;
  atmosphereMesh.renderingGroupId = 1;
  orbitalMeshes.push(atmosphereMesh);

  const atmosphere = new ShaderMaterial(
    "atmosphereMaterial",
    scene,
    { vertex: "exoraAtmosphere", fragment: "exoraAtmosphere" },
    {
      attributes: ["position", "normal"],
      uniforms: [
        "world",
        "worldViewProjection",
        "cameraPosition",
        "atmosphereColor",
        "time",
        "activity",
      ],
      needAlphaBlending: true,
    },
  );
  atmosphere.setColor3("atmosphereColor", toColor3(recipe.atmosphere.color));
  atmosphere.setFloat(
    "activity",
    recipe.renderer === "gas-giant"
      ? recipe.cloudBands.stormStrength
      : recipe.renderer === "ice-giant"
        ? recipe.atmosphereBands.polarGlow
        : Math.max(recipe.surface.cloudCover, recipe.surface.lavaStrength * 0.35),
  );
  atmosphere.backFaceCulling = true;
  atmosphere.alphaMode = Engine.ALPHA_ADD;
  atmosphere.disableDepthWrite = true;
  atmosphereMesh.material = atmosphere;
  atmosphereMesh.freezeWorldMatrix();

  const orbitGuide = MeshBuilder.CreateTorus(
    "moonOrbitGuide",
    {
      diameter: recipe.moon.orbitRadius * 2,
      thickness: 0.012,
      tessellation: profile.ringTessellation,
    },
    scene,
  );
  orbitGuide.position.copyFrom(PLANET_POSITION);
  orbitGuide.parent = orbitalRoot;
  orbitGuide.rotation.z = recipe.moon.inclination;
  orbitGuide.isPickable = false;
  orbitalMeshes.push(orbitGuide);

  const orbitMaterial = new StandardMaterial("orbitGuideMaterial", scene);
  orbitMaterial.disableLighting = true;
  orbitMaterial.emissiveColor = new Color3(0.18, 0.58, 0.72);
  orbitMaterial.alpha = 0.12;
  orbitMaterial.freeze();
  orbitGuide.material = orbitMaterial;
  orbitGuide.freezeWorldMatrix();

  const moonOrbit = new TransformNode("moonOrbit", scene);
  moonOrbit.position.copyFrom(PLANET_POSITION);
  moonOrbit.parent = orbitalRoot;
  moonOrbit.rotation.z = recipe.moon.inclination;

  const moon = MeshBuilder.CreateSphere(
    "generatedMoon",
    { diameter: recipe.moon.radius * 2, segments: profile.moonSegments },
    scene,
  );
  moon.parent = moonOrbit;
  moon.position.set(recipe.moon.orbitRadius, 0, 0);
  moon.isPickable = false;
  orbitalMeshes.push(moon);

  const moonMaterial = new StandardMaterial("moonMaterial", scene);
  moonMaterial.diffuseColor = toColor3(recipe.moon.color);
  moonMaterial.emissiveColor = new Color3(0.01, 0.014, 0.018);
  moonMaterial.specularColor = new Color3(0.06, 0.07, 0.08);
  moonMaterial.freeze();
  moon.material = moonMaterial;

  return {
    atmosphere,
    cloudLayer,
    cloudMesh,
    moonOrbit,
    orbitalMeshes,
    orbitalRoot,
    planet,
    ringSystem,
    shader,
  };
};

const createSeededRandom = (seed: number): (() => number) => {
  let state = seed || 1;
  return () => {
    state = (state * 1664525 + 1013904223) >>> 0;
    return state / 4294967296;
  };
};

const terrainNoise = (x: number, z: number, seed: number): number => {
  const seedPhase = seed * 0.000013;
  const broad = Math.sin(x * 0.105 + seedPhase) * Math.cos(z * 0.082 - seedPhase * 1.7);
  const ridges = Math.sin((x + z) * 0.19 + seedPhase * 2.4) * 0.45;
  const detail = Math.sin(x * 0.43 - z * 0.31 + seedPhase * 4.1) * 0.18;
  return broad * 0.72 + ridges + detail;
};

const mixRgb = (from: Rgb, to: Rgb, amount: number): Color4 =>
  new Color4(
    from[0] + (to[0] - from[0]) * amount,
    from[1] + (to[1] - from[1]) * amount,
    from[2] + (to[2] - from[2]) * amount,
    1,
  );

const createSurfaceEnvironment = (
  scene: Scene,
  recipe: WorldRecipe,
  profile: RenderQualityProfile,
): { cloudLayers: Mesh[]; meshes: AbstractMesh[]; root: TransformNode } => {
  const root = new TransformNode("surfaceEnvironment", scene);
  const meshes: AbstractMesh[] = [];
  const random = createSeededRandom(recipe.seed ^ 0x9e3779b9);
  const subdivisions = profile.tier === "desktop" ? 72 : 44;
  const terrainLowColor =
    recipe.renderer === "rocky"
      ? recipe.surface.lowColor
      : recipe.renderer === "gas-giant"
        ? recipe.cloudBands.deepColor
        : recipe.atmosphereBands.deepColor;
  const terrainHighColor =
    recipe.renderer === "rocky"
      ? recipe.surface.highColor
      : recipe.renderer === "gas-giant"
        ? recipe.cloudBands.lightColor
        : recipe.atmosphereBands.lightColor;
  const ground = MeshBuilder.CreateGround(
    "surfaceTerrain",
    { width: 72, height: 82, subdivisions, updatable: true },
    scene,
  );
  ground.parent = root;
  ground.position.set(0, -1.6, 18);
  ground.isPickable = false;
  meshes.push(ground);

  const positions = ground.getVerticesData("position");
  const indices = ground.getIndices();
  if (positions && indices) {
    const colors: number[] = [];
    const normals: number[] = [];
    const isAtmospheric = recipe.renderer !== "rocky";
    for (let index = 0; index < positions.length; index += 3) {
      const x = positions[index] ?? 0;
      const z = positions[index + 2] ?? 0;
      const distance = Math.hypot(x * 0.72, z * 0.25);
      const noise = terrainNoise(x, z, recipe.seed);
      const horizonLift = Math.max(0, (z - 2) / 36) * 1.7;
      const height = isAtmospheric
        ? noise * 1.15 + Math.sin(z * 0.16 + recipe.seed) * 0.42 + horizonLift
        : noise * (0.85 + Math.min(distance / 25, 1) * 1.9) + horizonLift;
      positions[index + 1] = height;
      const color = mixRgb(
        terrainLowColor,
        terrainHighColor,
        Math.min(1, Math.max(0, 0.42 + height * 0.13)),
      );
      colors.push(color.r, color.g, color.b, 1);
    }

    VertexData.ComputeNormals(positions, indices, normals);
    ground.updateVerticesData("position", positions);
    ground.setVerticesData("normal", normals);
    ground.setVerticesData("color", colors, false, 4);
  }

  const groundMaterial = new StandardMaterial("surfaceTerrainMaterial", scene);
  groundMaterial.diffuseColor = Color3.White();
  groundMaterial.emissiveColor = toColor3(terrainHighColor).scale(
    recipe.renderer === "rocky" ? 0.1 : 0.22,
  );
  groundMaterial.specularColor =
    recipe.renderer === "rocky" && recipe.surface.waterLevel > 0
      ? new Color3(0.2, 0.32, 0.38)
      : new Color3(0.025, 0.035, 0.04);
  groundMaterial.roughness = recipe.renderer === "rocky" ? 0.92 : 0.7;
  groundMaterial.freeze();
  ground.material = groundMaterial;

  if (recipe.renderer === "rocky") {
    const rockMaterial = new StandardMaterial("surfaceRockMaterial", scene);
    const rockColor = mixRgb(terrainLowColor, terrainHighColor, 0.34);
    rockMaterial.diffuseColor = new Color3(rockColor.r, rockColor.g, rockColor.b);
    rockMaterial.emissiveColor = rockMaterial.diffuseColor.scale(0.06);
    rockMaterial.specularColor = new Color3(0.018, 0.02, 0.022);
    rockMaterial.freeze();
    const rockCount = profile.tier === "desktop" ? 22 : 12;
    for (let index = 0; index < rockCount; index += 1) {
      const rock = MeshBuilder.CreateSphere(
        `surfaceRock-${index}`,
        { diameter: 0.7 + random() * 1.45, segments: 4 },
        scene,
      );
      const x = -25 + random() * 50;
      const z = 4 + random() * 42;
      rock.position.set(x, -0.9 + terrainNoise(x, z, recipe.seed), z + 18);
      rock.scaling.set(0.55 + random() * 0.8, 0.55 + random() * 1.7, 0.55 + random());
      rock.rotation.set(random() * 0.4, random() * Math.PI, random() * 0.35);
      rock.parent = root;
      rock.isPickable = false;
      rock.material = rockMaterial;
      meshes.push(rock);
    }
  }

  const cloudLayers: Mesh[] = [];
  const hazeCount = recipe.renderer === "rocky" ? (recipe.surface.cloudCover > 0 ? 3 : 1) : 5;
  for (let index = 0; index < hazeCount; index += 1) {
    const haze = MeshBuilder.CreateSphere(
      `surfaceHaze-${index}`,
      { diameter: 8 + random() * 9, segments: profile.tier === "desktop" ? 20 : 12 },
      scene,
    );
    haze.parent = root;
    haze.position.set(-24 + random() * 48, 5 + random() * 8, 22 + random() * 34);
    haze.scaling.set(1.8 + random() * 1.8, 0.18 + random() * 0.22, 0.8 + random() * 1.3);
    haze.isPickable = false;
    const hazeMaterial = new StandardMaterial(`surfaceHazeMaterial-${index}`, scene);
    hazeMaterial.disableLighting = true;
    hazeMaterial.emissiveColor =
      recipe.renderer === "rocky"
        ? toColor3(recipe.surface.cloudColor).scale(0.38)
        : toColor3(recipe.atmosphere.color).scale(0.48);
    hazeMaterial.alpha = recipe.renderer === "rocky" ? 0.075 : 0.14;
    hazeMaterial.backFaceCulling = false;
    hazeMaterial.disableDepthWrite = true;
    haze.material = hazeMaterial;
    cloudLayers.push(haze);
    meshes.push(haze);
  }

  const horizonLight = MeshBuilder.CreateSphere(
    "surfaceHorizonLight",
    { diameter: recipe.renderer === "rocky" ? 2.4 : 4.2, segments: 16 },
    scene,
  );
  horizonLight.parent = root;
  horizonLight.position.set(-21, 10.5, 48);
  horizonLight.isPickable = false;
  const horizonMaterial = new StandardMaterial("surfaceHorizonLightMaterial", scene);
  horizonMaterial.disableLighting = true;
  horizonMaterial.emissiveColor =
    recipe.renderer === "rocky" && recipe.surface.lavaStrength > 0
      ? new Color3(1, 0.19, 0.025)
      : toColor3(recipe.atmosphere.color).scale(1.25);
  horizonMaterial.alpha = 0.88;
  horizonMaterial.freeze();
  horizonLight.material = horizonMaterial;
  meshes.push(horizonLight);

  for (const mesh of meshes) {
    mesh.isVisible = false;
    mesh.setEnabled(false);
  }
  root.setEnabled(false);
  return { cloudLayers, meshes, root };
};

const setEnvironmentEnabled = (
  root: TransformNode,
  meshes: readonly AbstractMesh[],
  enabled: boolean,
): void => {
  root.setEnabled(enabled);
  for (const mesh of meshes) {
    mesh.isVisible = enabled;
    mesh.setEnabled(enabled);
  }
};

export const createPlanetExperience = ({
  canvas,
  onFirstFrame,
  onViewModeChange,
  onXrStatusChange,
  recipe,
}: PlanetExperienceOptions): PlanetExperience => {
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
  scene.clearColor = new Color4(0.0015, 0.003, 0.008, 1);
  scene.performancePriority = ScenePerformancePriority.Intermediate;
  scene.autoClear = true;
  scene.skipPointerMovePicking = true;

  const camera = new ArcRotateCamera(
    "explorerCamera",
    -Math.PI / 2,
    Math.PI / 2.13,
    17.2,
    PLANET_POSITION,
    scene,
  );
  camera.lowerRadiusLimit = 10.5;
  camera.upperRadiusLimit = 25;
  camera.lowerBetaLimit = 0.58;
  camera.upperBetaLimit = Math.PI - 0.58;
  camera.wheelDeltaPercentage = 0.018;
  camera.pinchDeltaPercentage = 0.008;
  camera.inertia = 0.82;
  camera.attachControl(canvas, true);

  const keyLight = new DirectionalLight("stellarLight", LIGHT_DIRECTION.scale(-1), scene);
  keyLight.intensity = 2.2;

  createStarfield(scene, recipe.seed, profile.starCount);
  const viewingDeck = createViewingDeck(scene, profile);
  const {
    atmosphere,
    cloudLayer,
    cloudMesh,
    moonOrbit,
    orbitalMeshes,
    orbitalRoot,
    planet,
    ringSystem,
    shader,
  } = createPlanet(scene, recipe, profile);
  const surfaceEnvironment = createSurfaceEnvironment(scene, recipe, profile);

  let elapsedSeconds = 0;
  let qualitySampleSeconds = 0;
  let isInXr = false;
  let viewState: "entering" | "leaving" | "orbit" | "surface" = "orbit";
  let viewTransitionSeconds = 0;
  const orbitTarget = PLANET_POSITION.clone();
  const surfaceTarget = new Vector3(0, 0.1, 25);

  const applyViewEnvironment = (surface: boolean): void => {
    setEnvironmentEnabled(orbitalRoot, orbitalMeshes, !surface);
    setEnvironmentEnabled(surfaceEnvironment.root, surfaceEnvironment.meshes, surface);
    scene.fogMode = surface ? Scene.FOGMODE_EXP2 : Scene.FOGMODE_NONE;
    scene.fogDensity = surface ? (recipe.renderer === "rocky" ? 0.012 : 0.019) : 0;
    scene.fogColor = toColor3(recipe.atmosphere.color).scale(0.16);
    scene.clearColor = surface
      ? new Color4(
          recipe.atmosphere.color[0] * 0.025,
          recipe.atmosphere.color[1] * 0.025,
          recipe.atmosphere.color[2] * 0.025,
          1,
        )
      : new Color4(0.0015, 0.003, 0.008, 1);
  };

  applyViewEnvironment(false);

  const beginViewTransition = (direction: "entering" | "leaving"): void => {
    if (viewState !== "orbit" && viewState !== "surface") return;
    viewState = direction;
    viewTransitionSeconds = 0;
    camera.detachControl();
    applyViewEnvironment(direction === "entering");
    onViewModeChange("transition");
  };

  scene.onBeforeRenderObservable.add(() => {
    const deltaSeconds = Math.min(engine.getDeltaTime() / 1_000, 0.05);
    elapsedSeconds += deltaSeconds;
    qualitySampleSeconds += deltaSeconds;

    if (!isInXr && viewState === "orbit" && camera.radius <= 10.62) beginViewTransition("entering");
    if (!isInXr && viewState === "surface" && camera.radius >= 18.1) beginViewTransition("leaving");

    if (viewState === "entering" || viewState === "leaving") {
      viewTransitionSeconds += deltaSeconds;
      const progress = Math.min(1, viewTransitionSeconds / 0.95);
      const eased = progress * progress * (3 - 2 * progress);
      const entering = viewState === "entering";
      const target = entering ? surfaceTarget : orbitTarget;
      const targetRadius = entering ? 12.8 : 12.2;
      const targetBeta = entering ? 1.23 : Math.PI / 2.13;
      camera.target = Vector3.Lerp(camera.target, target, Math.min(1, eased * 0.18 + 0.06));
      camera.radius += (targetRadius - camera.radius) * Math.min(1, eased * 0.18 + 0.06);
      camera.beta += (targetBeta - camera.beta) * Math.min(1, eased * 0.16 + 0.05);
      camera.alpha += (-Math.PI / 2 - camera.alpha) * Math.min(1, eased * 0.16 + 0.05);

      if (progress >= 1) {
        viewState = entering ? "surface" : "orbit";
        applyViewEnvironment(entering);
        camera.lowerRadiusLimit = entering ? 7.5 : 10.5;
        camera.upperRadiusLimit = entering ? 18.4 : 25;
        camera.lowerBetaLimit = entering ? 1.02 : 0.58;
        camera.upperBetaLimit = entering ? 1.48 : Math.PI - 0.58;
        camera.attachControl(canvas, true);
        onViewModeChange(entering ? "surface" : "orbit");
      }
    }

    planet.rotation.y += deltaSeconds * recipe.rotationSpeed;
    moonOrbit.rotation.y += deltaSeconds * recipe.moon.speed;
    if (ringSystem) ringSystem.rotation.y += deltaSeconds * recipe.rotationSpeed * 0.045;
    if (cloudMesh && recipe.renderer === "rocky")
      cloudMesh.rotation.y += deltaSeconds * (recipe.rotationSpeed + recipe.surface.cloudSpeed);
    if (recipe.renderer === "gas-giant")
      shader.setFloat("time", elapsedSeconds * recipe.cloudBands.speed * 18);
    if (recipe.renderer === "ice-giant")
      shader.setFloat("time", elapsedSeconds * recipe.atmosphereBands.speed * 18);
    if (recipe.renderer === "rocky") shader.setFloat("time", elapsedSeconds);
    atmosphere.setFloat("time", elapsedSeconds);
    if (cloudLayer && recipe.renderer === "rocky")
      cloudLayer.setFloat("time", elapsedSeconds * recipe.surface.cloudSpeed * 18);
    for (let index = 0; index < surfaceEnvironment.cloudLayers.length; index += 1) {
      const haze = surfaceEnvironment.cloudLayers[index];
      if (haze) haze.position.x += deltaSeconds * (0.11 + index * 0.025);
      if (haze && haze.position.x > 34) haze.position.x = -34;
    }

    const activePosition = scene.activeCamera?.globalPosition ?? camera.globalPosition;
    shader.setVector3("cameraPosition", activePosition);
    atmosphere.setVector3("cameraPosition", activePosition);
    cloudLayer?.setVector3("cameraPosition", activePosition);

    if (qualitySampleSeconds >= 3) {
      qualitySampleSeconds = 0;
      const currentLevel = engine.getHardwareScalingLevel();
      const nextLevel = adaptHardwareScaling(currentLevel, engine.getFps(), profile, isInXr);
      if (nextLevel !== currentLevel) {
        engine.setHardwareScalingLevel(nextLevel);
        engine.resize();
      }
    }
  });

  scene.onAfterRenderObservable.addOnce(onFirstFrame);
  engine.runRenderLoop(() => scene.render());

  const resize = (): void => engine.resize();
  window.addEventListener("resize", resize);

  onXrStatusChange("checking");
  let xr: WebXRDefaultExperience | null = null;
  let isVrSupported = false;
  let disposed = false;

  void WebXRDefaultExperience.CreateAsync(scene, {
    disableDefaultUI: true,
    disableNearInteraction: true,
    floorMeshes: [viewingDeck.floor],
    inputOptions: { doNotLoadControllerMeshes: true },
    optionalFeatures: ["hand-tracking"],
    outputCanvasOptions: {
      canvasOptions: {
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
      createdXr.baseExperience.onInitialXRPoseSetObservable.add((xrCamera) => {
        xrCamera.position.copyFrom(VIEWING_DECK_POSITION);
      });

      createdXr.baseExperience.onStateChangedObservable.add((state) => {
        if (disposed) return;
        if (state === WebXRState.ENTERING_XR) {
          setViewingDeckVisible(viewingDeck, true);
          onXrStatusChange("entering");
        }
        if (state === WebXRState.IN_XR) {
          isInXr = true;
          if (createdXr.baseExperience.sessionManager.isFixedFoveationSupported) {
            createdXr.baseExperience.sessionManager.fixedFoveation = profile.xrFixedFoveation;
          }
          onXrStatusChange("in-xr");
        }
        if (state === WebXRState.NOT_IN_XR) {
          isInXr = false;
          setViewingDeckVisible(viewingDeck, false);
          onXrStatusChange(isVrSupported ? "ready" : "unavailable");
        }
      });

      isVrSupported =
        await createdXr.baseExperience.sessionManager.isSessionSupportedAsync("immersive-vr");
      if (disposed) {
        createdXr.dispose();
        if (xr === createdXr) xr = null;
        return;
      }
      onXrStatusChange(isVrSupported ? "ready" : "unavailable");
    })
    .catch(() => {
      if (!disposed) onXrStatusChange("unavailable");
    });

  return {
    get isVrSupported() {
      return isVrSupported;
    },
    qualityTier: profile.tier,
    getFps: () => engine.getFps(),
    enterVr: async () => {
      if (!xr || !isVrSupported) return;
      await xr.baseExperience.enterXRAsync("immersive-vr", "local-floor", xr.renderTarget, {
        optionalFeatures: ["local-floor", "bounded-floor", "hand-tracking"],
      });
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
