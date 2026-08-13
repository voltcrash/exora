import { ArcRotateCamera } from "@babylonjs/core/Cameras/arcRotateCamera.js";
import { Engine } from "@babylonjs/core/Engines/engine.js";
import { DirectionalLight } from "@babylonjs/core/Lights/directionalLight.js";
import { Color3, Color4 } from "@babylonjs/core/Maths/math.color.js";
import { Vector3 } from "@babylonjs/core/Maths/math.vector.js";
import { Effect } from "@babylonjs/core/Materials/effect.js";
import { ShaderMaterial } from "@babylonjs/core/Materials/shaderMaterial.js";
import { StandardMaterial } from "@babylonjs/core/Materials/standardMaterial.js";
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
uniform vec3 cameraPosition;
uniform vec3 lightDirection;
uniform vec3 deepColor;
uniform vec3 midColor;
uniform vec3 lightColor;

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
  float bands = sin(latitude * 34.0 + broadNoise * 5.0 + fineNoise * 2.4);
  float bandMix = smoothstep(-0.72, 0.78, bands) * contrast;
  float storms = smoothstep(0.63, 0.9, fbm(vec2(longitude * 2.8 + flow, latitude * 7.0)));

  vec3 cloudColor = mix(deepColor, midColor, 0.35 + broadNoise * 0.5);
  cloudColor = mix(cloudColor, lightColor, clamp(bandMix + storms * 0.45, 0.0, 1.0));

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
  float storms = smoothstep(0.68, 0.92, stormNoise) * stormStrength;

  vec3 atmosphereColor = mix(deepColor, hazeColor, 0.32 + haze * 0.5);
  atmosphereColor = mix(atmosphereColor, lightColor, bands * 0.24 + storms);

  float diffuse = max(dot(normal, lightDirection), 0.0);
  float wrappedLight = 0.22 + diffuse * 0.9;
  vec3 viewDirection = normalize(cameraPosition - vWorldPosition);
  float rim = pow(1.0 - max(dot(normal, viewDirection), 0.0), 2.5);
  vec3 finalColor = atmosphereColor * wrappedLight + hazeColor * rim * 0.46;
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
uniform vec3 cameraPosition;
uniform vec3 lightDirection;
uniform vec3 lowColor;
uniform vec3 midColor;
uniform vec3 highColor;
uniform vec3 waterColor;

float hash(vec3 point) {
  point = fract(point * 0.1031 + seed * 0.000017);
  point += dot(point, point.yzx + 31.32);
  return fract((point.x + point.y) * point.z);
}

void main(void) {
  vec3 normal = normalize(vWorldNormal);
  vec3 craterCell = floor((vSurfacePosition + 1.0) * 18.0);
  float craterNoise = hash(craterCell);
  float crater = smoothstep(1.0 - craterDensity * 0.12, 1.0, craterNoise);
  float detail = hash(floor((vSurfacePosition + 1.0) * 95.0)) - 0.5;

  vec3 rockColor = mix(lowColor, midColor, smoothstep(0.28, 0.62, vHeight));
  rockColor = mix(rockColor, highColor, smoothstep(0.62, 0.9, vHeight));
  rockColor *= 0.9 + detail * 0.16;
  rockColor = mix(rockColor, lowColor * 0.45, crater * 0.72);

  float waterMask = waterLevel > 0.0 ? 1.0 - smoothstep(waterLevel - 0.018, waterLevel + 0.018, vHeight) : 0.0;
  vec3 surfaceColor = mix(rockColor, waterColor, waterMask * 0.92);
  float diffuse = max(dot(normal, lightDirection), 0.0);
  float wrappedLight = 0.16 + diffuse * 0.98;
  vec3 viewDirection = normalize(cameraPosition - vWorldPosition);
  vec3 halfDirection = normalize(lightDirection + viewDirection);
  float waterSpecular = pow(max(dot(normal, halfDirection), 0.0), 46.0) * waterMask;
  float rim = pow(1.0 - max(dot(normal, viewDirection), 0.0), 3.0);

  vec3 finalColor = surfaceColor * wrappedLight + vec3(0.34, 0.58, 0.72) * waterSpecular * 0.45;
  finalColor += highColor * rim * 0.08;
  gl_FragColor = vec4(finalColor, 1.0);
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

void main(void) {
  vec3 normal = normalize(vWorldNormal);
  vec3 viewDirection = normalize(cameraPosition - vWorldPosition);
  float rim = pow(1.0 - max(dot(normal, viewDirection), 0.0), 2.25);
  float alpha = smoothstep(0.03, 1.0, rim) * 0.5;
  gl_FragColor = vec4(atmosphereColor * (0.75 + rim * 1.5), alpha);
}
`;

export type XrStatus = "checking" | "entering" | "in-xr" | "ready" | "unavailable";

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

const createViewingDeck = (scene: Scene, profile: RenderQualityProfile): Mesh => {
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

  return deck;
};

const createPlanet = (
  scene: Scene,
  recipe: WorldRecipe,
  profile: RenderQualityProfile,
): {
  atmosphere: ShaderMaterial;
  moonOrbit: TransformNode;
  planet: Mesh;
  shader: ShaderMaterial;
} => {
  Effect.ShadersStore.exoraPlanetVertexShader = PLANET_VERTEX_SHADER;
  Effect.ShadersStore.exoraPlanetFragmentShader = PLANET_FRAGMENT_SHADER;
  Effect.ShadersStore.exoraIceGiantFragmentShader = ICE_GIANT_FRAGMENT_SHADER;
  Effect.ShadersStore.exoraRockyVertexShader = ROCKY_VERTEX_SHADER;
  Effect.ShadersStore.exoraRockyFragmentShader = ROCKY_FRAGMENT_SHADER;
  Effect.ShadersStore.exoraAtmosphereVertexShader = ATMOSPHERE_VERTEX_SHADER;
  Effect.ShadersStore.exoraAtmosphereFragmentShader = ATMOSPHERE_FRAGMENT_SHADER;

  const planet = MeshBuilder.CreateSphere(
    "planet",
    { diameter: recipe.radiusSceneUnits * 2, segments: profile.planetSegments },
    scene,
  );
  planet.position.copyFrom(PLANET_POSITION);
  planet.rotation.z = -0.09;
  planet.isPickable = false;

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
          "lightDirection",
          "lowColor",
          "midColor",
          "highColor",
          "waterColor",
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
          "lightDirection",
          "deepColor",
          "midColor",
          "lightColor",
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
    shader.setColor3("lowColor", toColor3(recipe.surface.lowColor));
    shader.setColor3("midColor", toColor3(recipe.surface.midColor));
    shader.setColor3("highColor", toColor3(recipe.surface.highColor));
    shader.setColor3("waterColor", toColor3(recipe.surface.waterColor));
  } else if (recipe.renderer === "ice-giant") {
    shader.setFloat("bandScale", recipe.atmosphereBands.bandScale);
    shader.setFloat("stormStrength", recipe.atmosphereBands.stormStrength);
    shader.setColor3("deepColor", toColor3(recipe.atmosphereBands.deepColor));
    shader.setColor3("hazeColor", toColor3(recipe.atmosphereBands.hazeColor));
    shader.setColor3("lightColor", toColor3(recipe.atmosphereBands.lightColor));
  } else {
    shader.setFloat("turbulence", recipe.cloudBands.turbulence);
    shader.setFloat("contrast", recipe.cloudBands.contrast);
    shader.setColor3("deepColor", toColor3(recipe.cloudBands.deepColor));
    shader.setColor3("midColor", toColor3(recipe.cloudBands.midColor));
    shader.setColor3("lightColor", toColor3(recipe.cloudBands.lightColor));
  }
  planet.material = shader;

  if (recipe.renderer === "ice-giant") {
    const ring = MeshBuilder.CreateTorus(
      "iceGiantRing",
      {
        diameter: recipe.radiusSceneUnits + recipe.rings.outerRadius,
        thickness: recipe.rings.outerRadius - recipe.radiusSceneUnits,
        tessellation: profile.ringTessellation,
      },
      scene,
    );
    ring.position.copyFrom(PLANET_POSITION);
    ring.rotation.x = 0.95;
    ring.rotation.z = -0.08;
    ring.isPickable = false;

    const ringMaterial = new StandardMaterial("iceGiantRingMaterial", scene);
    ringMaterial.disableLighting = true;
    ringMaterial.diffuseColor = toColor3(recipe.rings.color);
    ringMaterial.emissiveColor = toColor3(recipe.rings.color).scale(0.38);
    ringMaterial.alpha = recipe.rings.opacity;
    ringMaterial.backFaceCulling = false;
    ringMaterial.disableDepthWrite = true;
    ringMaterial.freeze();
    ring.material = ringMaterial;
    ring.freezeWorldMatrix();
  }

  const atmosphereMesh = MeshBuilder.CreateSphere(
    "atmosphere",
    { diameter: recipe.radiusSceneUnits * 2.08, segments: profile.planetSegments },
    scene,
  );
  atmosphereMesh.position.copyFrom(PLANET_POSITION);
  atmosphereMesh.isPickable = false;
  atmosphereMesh.renderingGroupId = 1;

  const atmosphere = new ShaderMaterial(
    "atmosphereMaterial",
    scene,
    { vertex: "exoraAtmosphere", fragment: "exoraAtmosphere" },
    {
      attributes: ["position", "normal"],
      uniforms: ["world", "worldViewProjection", "cameraPosition", "atmosphereColor"],
      needAlphaBlending: true,
    },
  );
  atmosphere.setColor3("atmosphereColor", toColor3(recipe.atmosphere.color));
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
  orbitGuide.rotation.z = 0.18;
  orbitGuide.isPickable = false;

  const orbitMaterial = new StandardMaterial("orbitGuideMaterial", scene);
  orbitMaterial.disableLighting = true;
  orbitMaterial.emissiveColor = new Color3(0.18, 0.58, 0.72);
  orbitMaterial.alpha = 0.12;
  orbitMaterial.freeze();
  orbitGuide.material = orbitMaterial;
  orbitGuide.freezeWorldMatrix();

  const moonOrbit = new TransformNode("moonOrbit", scene);
  moonOrbit.position.copyFrom(PLANET_POSITION);
  moonOrbit.rotation.z = 0.18;

  const moon = MeshBuilder.CreateSphere(
    "generatedMoon",
    { diameter: recipe.moon.radius * 2, segments: profile.moonSegments },
    scene,
  );
  moon.parent = moonOrbit;
  moon.position.set(recipe.moon.orbitRadius, 0, 0);
  moon.isPickable = false;

  const moonMaterial = new StandardMaterial("moonMaterial", scene);
  moonMaterial.diffuseColor = new Color3(0.19, 0.22, 0.25);
  moonMaterial.emissiveColor = new Color3(0.01, 0.014, 0.018);
  moonMaterial.specularColor = new Color3(0.06, 0.07, 0.08);
  moonMaterial.freeze();
  moon.material = moonMaterial;

  return { atmosphere, moonOrbit, planet, shader };
};

export const createPlanetExperience = async ({
  canvas,
  onFirstFrame,
  onXrStatusChange,
  recipe,
}: PlanetExperienceOptions): Promise<PlanetExperience> => {
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
  scene.performancePriority = ScenePerformancePriority.Aggressive;
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
  const { atmosphere, moonOrbit, planet, shader } = createPlanet(scene, recipe, profile);

  let elapsedSeconds = 0;
  let qualitySampleSeconds = 0;
  let isInXr = false;
  scene.onBeforeRenderObservable.add(() => {
    const deltaSeconds = Math.min(engine.getDeltaTime() / 1_000, 0.05);
    elapsedSeconds += deltaSeconds;
    qualitySampleSeconds += deltaSeconds;
    planet.rotation.y += deltaSeconds * recipe.rotationSpeed;
    moonOrbit.rotation.y += deltaSeconds * recipe.moon.speed;
    if (recipe.renderer === "gas-giant")
      shader.setFloat("time", elapsedSeconds * recipe.cloudBands.speed * 18);
    if (recipe.renderer === "ice-giant")
      shader.setFloat("time", elapsedSeconds * recipe.atmosphereBands.speed * 18);

    const activePosition = scene.activeCamera?.globalPosition ?? camera.globalPosition;
    shader.setVector3("cameraPosition", activePosition);
    atmosphere.setVector3("cameraPosition", activePosition);

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

  try {
    xr = await WebXRDefaultExperience.CreateAsync(scene, {
      disableDefaultUI: true,
      disableNearInteraction: true,
      floorMeshes: [viewingDeck],
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
    });

    xr.baseExperience.onInitialXRPoseSetObservable.add((xrCamera) => {
      xrCamera.position.copyFrom(VIEWING_DECK_POSITION);
    });

    xr.baseExperience.onStateChangedObservable.add((state) => {
      if (state === WebXRState.ENTERING_XR) onXrStatusChange("entering");
      if (state === WebXRState.IN_XR) {
        isInXr = true;
        if (xr?.baseExperience.sessionManager.isFixedFoveationSupported) {
          xr.baseExperience.sessionManager.fixedFoveation = profile.xrFixedFoveation;
        }
        onXrStatusChange("in-xr");
      }
      if (state === WebXRState.NOT_IN_XR) {
        isInXr = false;
        onXrStatusChange(isVrSupported ? "ready" : "unavailable");
      }
    });

    isVrSupported = await xr.baseExperience.sessionManager.isSessionSupportedAsync("immersive-vr");
    onXrStatusChange(isVrSupported ? "ready" : "unavailable");
  } catch {
    onXrStatusChange("unavailable");
  }

  return {
    isVrSupported,
    qualityTier: profile.tier,
    getFps: () => engine.getFps(),
    enterVr: async () => {
      if (!xr || !isVrSupported) return;
      await xr.baseExperience.enterXRAsync("immersive-vr", "local-floor", xr.renderTarget, {
        optionalFeatures: ["local-floor", "bounded-floor", "hand-tracking"],
      });
    },
    dispose: () => {
      window.removeEventListener("resize", resize);
      xr?.dispose();
      scene.dispose();
      engine.dispose();
    },
  };
};
