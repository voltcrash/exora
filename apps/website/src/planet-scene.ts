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
import { Scene } from "@babylonjs/core/scene.js";
import { TransformNode } from "@babylonjs/core/Meshes/transformNode.js";
import { WebXRDefaultExperience } from "@babylonjs/core/XR/webXRDefaultExperience.js";
import "@babylonjs/core/XR/features/WebXRControllerPointerSelection.js";
import "@babylonjs/core/XR/features/WebXRControllerTeleportation.js";
import "@babylonjs/core/XR/features/WebXRHandTracking.js";
import { WebXRState } from "@babylonjs/core/XR/webXRTypes.js";
import type { Rgb, WorldRecipe } from "./world-recipe.ts";

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
}

interface PlanetExperienceOptions {
  canvas: HTMLCanvasElement;
  onFirstFrame: () => void;
  onXrStatusChange: (status: XrStatus) => void;
  recipe: WorldRecipe;
}

const toColor3 = ([red, green, blue]: Rgb): Color3 => new Color3(red, green, blue);

const createStarfield = (scene: Scene, seed: number): Mesh => {
  const starfield = new Mesh("starfield", scene);
  const positions: number[] = [];
  const colors: number[] = [];
  const indices: number[] = [];
  let randomState = seed || 1;

  const random = (): number => {
    randomState = (randomState * 1664525 + 1013904223) >>> 0;
    return randomState / 4294967296;
  };

  for (let index = 0; index < 1_100; index += 1) {
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
  starfield.material = starMaterial;
  starfield.isPickable = false;
  starfield.alwaysSelectAsActiveMesh = true;

  return starfield;
};

const createViewingDeck = (scene: Scene): Mesh => {
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
  deck.material = deckMaterial;

  const deckRing = MeshBuilder.CreateTorus(
    "deckRing",
    { diameter: 5.25, thickness: 0.026, tessellation: 96 },
    scene,
  );
  deckRing.position.set(VIEWING_DECK_POSITION.x, 0.015, VIEWING_DECK_POSITION.z);

  const ringMaterial = new StandardMaterial("deckRingMaterial", scene);
  ringMaterial.disableLighting = true;
  ringMaterial.emissiveColor = new Color3(0.08, 0.82, 1);
  ringMaterial.alpha = 0.68;
  deckRing.material = ringMaterial;

  return deck;
};

const createPlanet = (
  scene: Scene,
  recipe: WorldRecipe,
): {
  atmosphere: ShaderMaterial;
  moonOrbit: TransformNode;
  planet: Mesh;
  shader: ShaderMaterial;
} => {
  Effect.ShadersStore.exoraPlanetVertexShader = PLANET_VERTEX_SHADER;
  Effect.ShadersStore.exoraPlanetFragmentShader = PLANET_FRAGMENT_SHADER;
  Effect.ShadersStore.exoraRockyVertexShader = ROCKY_VERTEX_SHADER;
  Effect.ShadersStore.exoraRockyFragmentShader = ROCKY_FRAGMENT_SHADER;
  Effect.ShadersStore.exoraAtmosphereVertexShader = ATMOSPHERE_VERTEX_SHADER;
  Effect.ShadersStore.exoraAtmosphereFragmentShader = ATMOSPHERE_FRAGMENT_SHADER;

  const planet = MeshBuilder.CreateSphere(
    "planet",
    { diameter: recipe.radiusSceneUnits * 2, segments: 64 },
    scene,
  );
  planet.position.copyFrom(PLANET_POSITION);
  planet.rotation.z = -0.09;
  planet.isPickable = false;

  const shader =
    recipe.renderer === "rocky"
      ? new ShaderMaterial(
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
        )
      : new ShaderMaterial(
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
  } else {
    shader.setFloat("turbulence", recipe.cloudBands.turbulence);
    shader.setFloat("contrast", recipe.cloudBands.contrast);
    shader.setColor3("deepColor", toColor3(recipe.cloudBands.deepColor));
    shader.setColor3("midColor", toColor3(recipe.cloudBands.midColor));
    shader.setColor3("lightColor", toColor3(recipe.cloudBands.lightColor));
  }
  planet.material = shader;

  const atmosphereMesh = MeshBuilder.CreateSphere(
    "atmosphere",
    { diameter: recipe.radiusSceneUnits * 2.08, segments: 64 },
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

  const orbitGuide = MeshBuilder.CreateTorus(
    "moonOrbitGuide",
    { diameter: recipe.moon.orbitRadius * 2, thickness: 0.012, tessellation: 128 },
    scene,
  );
  orbitGuide.position.copyFrom(PLANET_POSITION);
  orbitGuide.rotation.z = 0.18;
  orbitGuide.isPickable = false;

  const orbitMaterial = new StandardMaterial("orbitGuideMaterial", scene);
  orbitMaterial.disableLighting = true;
  orbitMaterial.emissiveColor = new Color3(0.18, 0.58, 0.72);
  orbitMaterial.alpha = 0.12;
  orbitGuide.material = orbitMaterial;

  const moonOrbit = new TransformNode("moonOrbit", scene);
  moonOrbit.position.copyFrom(PLANET_POSITION);
  moonOrbit.rotation.z = 0.18;

  const moon = MeshBuilder.CreateSphere(
    "generatedMoon",
    { diameter: recipe.moon.radius * 2, segments: 24 },
    scene,
  );
  moon.parent = moonOrbit;
  moon.position.set(recipe.moon.orbitRadius, 0, 0);
  moon.isPickable = false;

  const moonMaterial = new StandardMaterial("moonMaterial", scene);
  moonMaterial.diffuseColor = new Color3(0.19, 0.22, 0.25);
  moonMaterial.emissiveColor = new Color3(0.01, 0.014, 0.018);
  moonMaterial.specularColor = new Color3(0.06, 0.07, 0.08);
  moon.material = moonMaterial;

  return { atmosphere, moonOrbit, planet, shader };
};

export const createPlanetExperience = async ({
  canvas,
  onFirstFrame,
  onXrStatusChange,
  recipe,
}: PlanetExperienceOptions): Promise<PlanetExperience> => {
  const engine = new Engine(
    canvas,
    true,
    { antialias: true, preserveDrawingBuffer: false, stencil: true },
    true,
  );
  engine.setHardwareScalingLevel(Math.max(1, window.devicePixelRatio / 1.65));

  const scene = new Scene(engine);
  scene.clearColor = new Color4(0.0015, 0.003, 0.008, 1);
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

  createStarfield(scene, recipe.seed);
  const viewingDeck = createViewingDeck(scene);
  const { atmosphere, moonOrbit, planet, shader } = createPlanet(scene, recipe);

  let elapsedSeconds = 0;
  scene.onBeforeRenderObservable.add(() => {
    const deltaSeconds = Math.min(engine.getDeltaTime() / 1_000, 0.05);
    elapsedSeconds += deltaSeconds;
    planet.rotation.y += deltaSeconds * recipe.rotationSpeed;
    moonOrbit.rotation.y += deltaSeconds * recipe.moon.speed;
    if (recipe.renderer === "gas-giant") {
      shader.setFloat("time", elapsedSeconds * recipe.cloudBands.speed * 18);
    }

    const activePosition = scene.activeCamera?.globalPosition ?? camera.globalPosition;
    shader.setVector3("cameraPosition", activePosition);
    atmosphere.setVector3("cameraPosition", activePosition);
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
      optionalFeatures: true,
    });

    xr.baseExperience.onInitialXRPoseSetObservable.add((xrCamera) => {
      xrCamera.position.copyFrom(VIEWING_DECK_POSITION);
    });

    xr.baseExperience.onStateChangedObservable.add((state) => {
      if (state === WebXRState.ENTERING_XR) onXrStatusChange("entering");
      if (state === WebXRState.IN_XR) onXrStatusChange("in-xr");
      if (state === WebXRState.NOT_IN_XR) onXrStatusChange(isVrSupported ? "ready" : "unavailable");
    });

    isVrSupported = await xr.baseExperience.sessionManager.isSessionSupportedAsync("immersive-vr");
    onXrStatusChange(isVrSupported ? "ready" : "unavailable");
  } catch {
    onXrStatusChange("unavailable");
  }

  return {
    isVrSupported,
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
