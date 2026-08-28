import { ActionManager } from "@babylonjs/core/Actions/actionManager.js";
import { ExecuteCodeAction } from "@babylonjs/core/Actions/directActions.js";
import { Color3 } from "@babylonjs/core/Maths/math.color.js";
import { Vector3 } from "@babylonjs/core/Maths/math.vector.js";
import { Effect } from "@babylonjs/core/Materials/effect.js";
import { ShaderMaterial } from "@babylonjs/core/Materials/shaderMaterial.js";
import { StandardMaterial } from "@babylonjs/core/Materials/standardMaterial.js";
import type { AbstractMesh } from "@babylonjs/core/Meshes/abstractMesh.js";
import { Mesh } from "@babylonjs/core/Meshes/mesh.js";
import { MeshBuilder } from "@babylonjs/core/Meshes/meshBuilder.js";
import type { TransformNode } from "@babylonjs/core/Meshes/transformNode.js";
import type { Scene } from "@babylonjs/core/scene.js";
import { type RenderQualityProfile, shaderDefines } from "./render-quality.ts";
import { createStarGlare, type StarGlare } from "./star-visuals.ts";

const STAR_VERTEX_SHADER = `
precision highp float;
attribute vec3 position;
attribute vec3 normal;
uniform mat4 world;
uniform mat4 worldViewProjection;
varying vec3 vObjectPosition;
varying vec3 vNormal;
varying vec3 vWorldPosition;
void main(void) {
  vObjectPosition = normalize(position);
  vNormal = normalize(mat3(world) * normal);
  vWorldPosition = (world * vec4(position, 1.0)).xyz;
  gl_Position = worldViewProjection * vec4(position, 1.0);
}`;

const STAR_FRAGMENT_SHADER = `
precision highp float;
varying vec3 vObjectPosition;
varying vec3 vNormal;
varying vec3 vWorldPosition;

uniform float time;
uniform float seed;
uniform float activity;
uniform float rotationFactor;
uniform float spotCoverage;
uniform float granulationScale;
uniform float granulationStrength;
uniform float temperatureKelvin;
uniform vec3 baseColor;
uniform vec3 hotColor;
uniform vec3 spotColor;
uniform vec3 cameraPosition;

const float STAR_EXPOSURE = 3.0;

float hash13(vec3 p) {
  p = fract(p * 0.1031 + seed * 0.00001357);
  p += dot(p, p.zyx + 31.32);
  return fract((p.x + p.y) * p.z);
}
vec3 hash33(vec3 p) {
  p = vec3(
    dot(p, vec3(127.1, 311.7, 74.7)),
    dot(p, vec3(269.5, 183.3, 246.1)),
    dot(p, vec3(113.5, 271.9, 124.6))
  );
  return fract(sin(p + seed * 0.0001) * 43758.5453123);
}
float noise(vec3 p) {
  vec3 i = floor(p);
  vec3 f = fract(p);
  f = f * f * (3.0 - 2.0 * f);
  return mix(
    mix(mix(hash13(i), hash13(i + vec3(1,0,0)), f.x), mix(hash13(i + vec3(0,1,0)), hash13(i + vec3(1,1,0)), f.x), f.y),
    mix(mix(hash13(i + vec3(0,0,1)), hash13(i + vec3(1,0,1)), f.x), mix(hash13(i + vec3(0,1,1)), hash13(i + vec3(1,1,1)), f.x), f.y), f.z
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
vec3 cellular(vec3 p) {
  vec3 base = floor(p);
  vec3 local = fract(p);
  float nearest = 8.0;
  float second = 8.0;
  float cellHash = 0.0;
  for (int z = -1; z <= 1; z += 1) {
    for (int y = -1; y <= 1; y += 1) {
      for (int x = -1; x <= 1; x += 1) {
        vec3 offset = vec3(float(x), float(y), float(z));
        vec3 jitter = hash33(base + offset);
        vec3 featurePoint = offset + jitter * 0.88;
        float wobblePhase = jitter.x * 6.28318 + time * (0.1 + jitter.y * 0.15);
        featurePoint += 0.16 * jitter.z * vec3(sin(wobblePhase), cos(wobblePhase * 1.3), sin(wobblePhase * 0.7));
        float distanceToPoint = length(local - featurePoint);
        if (distanceToPoint < nearest) {
          second = nearest;
          nearest = distanceToPoint;
          cellHash = hash13(base + offset);
        } else if (distanceToPoint < second) {
          second = distanceToPoint;
        }
      }
    }
  }
  return vec3(nearest, second, cellHash);
}

#ifdef STAR_ADVANCED
vec3 rotateY(vec3 p, float angle) {
  float s = sin(angle);
  float c = cos(angle);
  return vec3(p.x * c - p.z * s, p.y, p.x * s + p.z * c);
}
vec3 starspotField(vec3 p) {
  vec3 rotated = rotateY(p, time * (0.015 + rotationFactor * 0.05));
  float latitudeBias = mix(0.4, 1.0, exp(-pow((abs(rotated.y) - 0.5) * 2.4, 2.0)));
  vec3 warped = rotated + (fbm(rotated * 1.6 + 9.1) - 0.5) * 0.4;
  vec3 clusters = cellular(warped * 2.4);
  float threshold = 1.0 - clamp(spotCoverage * 1.9 * latitudeBias, 0.0, 0.96);
  float clusterActive = step(threshold, clusters.z);
  float clusterRadius = mix(0.055, 0.17, fract(clusters.z * 17.23));
  float boundary = clusters.x + (noise(warped * 9.0 + 5.0) - 0.5) * 0.09;
  float umbra = (1.0 - smoothstep(clusterRadius * 0.45, clusterRadius, boundary)) * clusterActive;
  float penumbra = (1.0 - smoothstep(clusterRadius, clusterRadius * 1.55, boundary)) * clusterActive;
  float plage = (1.0 - smoothstep(clusterRadius * 1.55, clusterRadius * 2.2, boundary)) * clusterActive;
  return vec3(umbra, penumbra - umbra, plage - penumbra);
}
#endif

void main(void) {
  vec3 p = normalize(vObjectPosition);

  vec3 viewDirection = normalize(cameraPosition - vWorldPosition);
  float mu = clamp(dot(normalize(vNormal), viewDirection), 0.0, 1.0);

  float networkField = fbm(p * (2.3 + granulationScale * 0.8) + 4.3);
  float network = pow(clamp(1.0 - abs(networkField * 2.0 - 1.0), 0.0, 1.0), 5.0);
  float supergranule = mix(0.965, 1.04, networkField);

  float granuleFrequency = (16.0 + granulationScale * 8.0) * (0.72 + networkField * 0.62);
  vec3 cellSpace = p * granuleFrequency;
  float warpTime = time * 0.06;
  vec3 warpField = vec3(
    fbm(cellSpace * 0.25 + vec3(0.0, 0.0, warpTime)),
    fbm(cellSpace * 0.25 + vec3(5.2, 1.3, warpTime * 0.83)),
    fbm(cellSpace * 0.25 + vec3(1.7, 9.2, warpTime * 1.14))
  );
  vec3 warped = cellSpace + (warpField - 0.5) * 1.5;
  warped += (vec3(
    noise(cellSpace * 0.55 + 11.0),
    noise(cellSpace * 0.55 + 23.0),
    noise(cellSpace * 0.55 + 37.0)
  ) - 0.5) * 0.6;

  vec3 cells = cellular(warped);

  float boundary = cells.y - cells.x;
  float laneWidth = mix(0.05, 0.12, noise(warped * 1.7 + 3.0));
  float lane = 1.0 - smoothstep(0.0, laneWidth, boundary);
  float dome = smoothstep(0.0, 0.34, boundary);
  float cellSeed = fract(cells.z * 7.31);
  float cellBrightness = mix(0.96, 1.05, cellSeed);

  float granulation = (0.84 + dome * 0.32) * cellBrightness * supergranule;
  granulation *= 1.0 - lane * (0.08 + granulationStrength * 0.16) * mix(0.55, 1.4, cellSeed);
  granulation = mix(1.0, granulation, smoothstep(0.0, 0.5, mu));

  vec3 color = mix(
    baseColor,
    hotColor,
    clamp((granulation - 0.85) * 1.6, 0.0, 1.0) * (0.35 + granulationStrength * 0.5)
  );
  color *= granulation;

  float faculae = network * activity * (1.0 - mu) * (1.0 - mu);
  color += hotColor * faculae * 0.5;

#ifdef STAR_ADVANCED
  vec3 spots = starspotField(p);
  float umbra = spots.x;
  float penumbra = clamp(spots.y, 0.0, 1.0);
  float plage = clamp(spots.z, 0.0, 1.0);
  color = mix(color, spotColor * 0.55, umbra);
  color = mix(color, spotColor * 1.05, penumbra * 0.85);
  color += hotColor * plage * activity * 0.22;
#endif

  float temperatureNorm = clamp((temperatureKelvin - 3000.0) / 27000.0, 0.0, 1.0);
  float limbCoefficient = mix(0.72, 0.36, temperatureNorm);
  float limb = 1.0 - limbCoefficient * (1.0 - mu);
  color *= limb;

  float chromosphere = pow(1.0 - mu, 6.0)
    * activity
    * (1.0 - smoothstep(3800.0, 6800.0, temperatureKelvin));
  color += vec3(1.0, 0.36, 0.28) * chromosphere * 0.35;

  float luminance = dot(color, vec3(0.2126, 0.7152, 0.0722));
  float exposed = 1.0 - exp(-luminance * STAR_EXPOSURE);
  vec3 shown = color * (exposed / max(luminance, 0.0001));
  shown = mix(shown, vec3(1.0), clamp(exposed - 0.9, 0.0, 1.0) * 3.0);

  gl_FragColor = vec4(clamp(shown, 0.0, 1.0), 1.0);
}`;

const CORONA_VERTEX_SHADER = `
precision highp float;
attribute vec3 position;
attribute vec3 normal;
uniform mat4 world;
uniform mat4 worldViewProjection;
varying vec3 vObjectPosition;
varying vec3 vNormal;
varying vec3 vWorldPosition;
void main(void) {
  vObjectPosition = normalize(position);
  vNormal = normalize(mat3(world) * normal);
  vWorldPosition = (world * vec4(position, 1.0)).xyz;
  gl_Position = worldViewProjection * vec4(position, 1.0);
}`;

const CORONA_FRAGMENT_SHADER = `
precision highp float;
varying vec3 vObjectPosition;
varying vec3 vNormal;
varying vec3 vWorldPosition;

uniform float time;
uniform float seed;
uniform float coronalIntensity;
uniform float starRadius;
uniform float shellRadii;
uniform vec3 starCenter;
uniform vec3 coronaColor;
uniform vec3 chromosphereColor;
uniform vec3 cameraPosition;

float hash13(vec3 p) {
  p = fract(p * 0.1031 + seed * 0.00001357);
  p += dot(p, p.zyx + 31.32);
  return fract((p.x + p.y) * p.z);
}
float noise(vec3 p) {
  vec3 i = floor(p);
  vec3 f = fract(p);
  f = f * f * (3.0 - 2.0 * f);
  return mix(
    mix(mix(hash13(i), hash13(i + vec3(1,0,0)), f.x), mix(hash13(i + vec3(0,1,0)), hash13(i + vec3(1,1,0)), f.x), f.y),
    mix(mix(hash13(i + vec3(0,0,1)), hash13(i + vec3(1,0,1)), f.x), mix(hash13(i + vec3(0,1,1)), hash13(i + vec3(1,1,1)), f.x), f.y), f.z
  );
}
float fbm(vec3 p) {
  float value = 0.0;
  float amplitude = 0.56;
  for (int i = 0; i < CORONA_OCTAVES; i++) {
    value += noise(p) * amplitude;
    p = p.yzx * 2.07 + vec3(7.1, 13.7, 19.3);
    amplitude *= 0.48;
  }
  return value;
}
void main(void) {
  vec3 rayDirection = normalize(vWorldPosition - cameraPosition);
  vec3 toStar = starCenter - cameraPosition;
  float along = dot(toStar, rayDirection);
  float impact = length(toStar - rayDirection * along);
  float radii = impact / max(starRadius, 0.0001);
  float ahead = smoothstep(0.0, starRadius, along);

  float rim = exp(-(radii - 1.0) * 13.0);
  float halo = exp(-(radii - 1.0) * 1.9) * 0.5;
  float density = (rim * 0.34 + halo)
    * ahead
    * smoothstep(0.985, 1.02, radii)
    * (1.0 - smoothstep(shellRadii * 0.82, shellRadii, radii));

  if (density <= 0.0005) discard;

  vec3 direction = normalize(vObjectPosition);
  float drift = time * 0.02;
  float streamers = fbm(direction * 3.2 + vec3(0.0, drift, 0.0));
  float filaments = noise(direction * 8.5 - vec3(drift * 0.6, 0.0, drift * 0.4));
  float shape = 0.34 + smoothstep(0.22, 0.85, streamers) * 0.72 + filaments * 0.16;

  shape *= mix(1.0, 0.52, smoothstep(0.42, 0.96, abs(direction.y)));

  vec3 tint = mix(coronaColor, chromosphereColor, clamp(rim * 0.45, 0.0, 0.45));
  float alpha = clamp(density * shape * (0.45 + coronalIntensity * 0.75), 0.0, 0.72);

  gl_FragColor = vec4(tint, alpha);
}`;

let shadersRegistered = false;

const registerSurfaceShaders = (): void => {
  if (shadersRegistered) return;
  shadersRegistered = true;
  Effect.ShadersStore.exoraStarVertexShader = STAR_VERTEX_SHADER;
  Effect.ShadersStore.exoraStarFragmentShader = STAR_FRAGMENT_SHADER;
  Effect.ShadersStore.exoraCoronaVertexShader = CORONA_VERTEX_SHADER;
  Effect.ShadersStore.exoraCoronaFragmentShader = CORONA_FRAGMENT_SHADER;
};

const clampUnit = (value: number): number => Math.min(1, Math.max(0, value));

export interface StellarSurfaceRecipe {
  activity: number;
  color: readonly [red: number, green: number, blue: number];
  coronalIntensity: number;
  granulationScale: number;
  granulationStrength: number;
  temperatureKelvin: number;
}

export interface StellarSurfaceOptions {
  detail: "distant" | "subject";
  diameter: number;
  parent?: TransformNode;
  pickable?: boolean;
  position: Vector3;
  profile: RenderQualityProfile;
  recipe: StellarSurfaceRecipe;
  renderingGroupId?: number;
  rotationFactor?: number;
  scene: Scene;
  seed: number;
  spotCoverage: number;
}

export interface StellarSurface {
  dispose: () => void;
  meshes: AbstractMesh[];
  photosphere: Mesh;
  update: (elapsedSeconds: number, cameraPosition: Vector3) => void;
}

export const makeStarTravelTarget = (
  scene: Scene,
  surface: StellarSurface,
  travel: () => void,
): void => {
  for (const target of surface.meshes) {
    if (!target.isPickable) continue;
    target.actionManager = new ActionManager(scene);
    target.actionManager.registerAction(new ExecuteCodeAction(ActionManager.OnPickTrigger, travel));
  }
};

export const createStellarSurface = ({
  detail,
  diameter,
  parent,
  pickable = false,
  position,
  profile,
  recipe,
  renderingGroupId = 0,
  rotationFactor = 0.4,
  scene,
  seed,
  spotCoverage,
}: StellarSurfaceOptions): StellarSurface => {
  registerSurfaceShaders();

  const isSubject = detail === "subject";
  const advanced = isSubject && profile.tier !== "quest";
  const segments = isSubject ? (profile.tier === "desktop" ? 128 : 64) : 32;
  const coronaOctaves = profile.tier === "desktop" ? 4 : profile.tier === "mobile" ? 3 : 2;
  const coronaShellRadii = 2.6;

  const photosphere = MeshBuilder.CreateSphere("star-photosphere", { diameter, segments }, scene);
  if (parent) photosphere.parent = parent;
  photosphere.position.copyFrom(position);
  photosphere.isPickable = pickable;
  photosphere.applyFog = false;
  photosphere.renderingGroupId = renderingGroupId;

  const material = new ShaderMaterial(
    "star-photosphere-material",
    scene,
    { vertex: "exoraStar", fragment: "exoraStar" },
    {
      attributes: ["position", "normal"],
      defines: [...shaderDefines(profile), ...(advanced ? ["#define STAR_ADVANCED"] : [])],
      uniforms: [
        "world",
        "worldViewProjection",
        "cameraPosition",
        "time",
        "seed",
        "activity",
        "rotationFactor",
        "spotCoverage",
        "granulationScale",
        "granulationStrength",
        "temperatureKelvin",
        "baseColor",
        "hotColor",
        "spotColor",
      ],
    },
  );
  const [red, green, blue] = recipe.color;
  const baseColor = new Color3(red, green, blue);
  const hotColor = Color3.Lerp(baseColor, Color3.White(), 0.45);
  const spotColor = Color3.Lerp(baseColor, Color3.Black(), 0.72);
  material.setColor3("baseColor", baseColor);
  material.setColor3("hotColor", hotColor);
  material.setColor3("spotColor", spotColor);
  material.setFloat("seed", seed);
  material.setFloat("activity", recipe.activity);
  material.setFloat("rotationFactor", rotationFactor);
  material.setFloat("spotCoverage", spotCoverage);
  material.setFloat("granulationScale", recipe.granulationScale);
  material.setFloat("granulationStrength", recipe.granulationStrength);
  material.setFloat("temperatureKelvin", recipe.temperatureKelvin);
  material.setFloat("time", 0);
  photosphere.material = material;

  const buildCorona = (): { material: ShaderMaterial; mesh: Mesh } => {
    const mesh = MeshBuilder.CreateSphere(
      "star-corona",
      {
        diameter: diameter * coronaShellRadii,
        segments: profile.tier === "desktop" ? 64 : 40,
        sideOrientation: Mesh.BACKSIDE,
      },
      scene,
    );
    if (parent) mesh.parent = parent;
    mesh.position.copyFrom(position);
    mesh.isPickable = false;
    mesh.applyFog = false;
    mesh.renderingGroupId = renderingGroupId + 1;

    const coronaMaterial = new ShaderMaterial(
      "star-corona-material",
      scene,
      { vertex: "exoraCorona", fragment: "exoraCorona" },
      {
        attributes: ["position", "normal"],
        defines: [`#define CORONA_OCTAVES ${coronaOctaves}`],
        uniforms: [
          "world",
          "worldViewProjection",
          "cameraPosition",
          "time",
          "seed",
          "coronalIntensity",
          "coronaColor",
          "chromosphereColor",
          "starCenter",
          "starRadius",
          "shellRadii",
        ],
        needAlphaBlending: true,
      },
    );
    coronaMaterial.backFaceCulling = true;
    coronaMaterial.disableDepthWrite = true;
    coronaMaterial.setColor3("coronaColor", Color3.Lerp(hotColor, Color3.White(), 0.5));
    const chromosphereWarmth = 1 - clampUnit((recipe.temperatureKelvin - 4_200) / 3_000);
    coronaMaterial.setColor3(
      "chromosphereColor",
      Color3.Lerp(
        Color3.Lerp(hotColor, Color3.White(), 0.5),
        Color3.Lerp(new Color3(1, 0.55, 0.44), baseColor, 0.5),
        chromosphereWarmth,
      ),
    );
    coronaMaterial.setFloat("seed", seed);
    coronaMaterial.setFloat("coronalIntensity", recipe.coronalIntensity);
    coronaMaterial.setFloat("starRadius", diameter * 0.5);
    coronaMaterial.setFloat("shellRadii", coronaShellRadii);
    coronaMaterial.setFloat("time", 0);
    mesh.material = coronaMaterial;
    return { material: coronaMaterial, mesh };
  };

  const corona = isSubject ? buildCorona() : null;
  const starCenter = Vector3.Zero();

  const pickTarget = pickable
    ? MeshBuilder.CreateSphere(
        "star-pick-target",
        { diameter: diameter * 2.4, segments: 12 },
        scene,
      )
    : null;
  if (pickTarget) {
    if (parent) pickTarget.parent = parent;
    pickTarget.position.copyFrom(position);
    pickTarget.applyFog = false;
    pickTarget.isPickable = true;
    pickTarget.renderingGroupId = renderingGroupId;
    const pickMaterial = new StandardMaterial("star-pick-target-material", scene);
    pickMaterial.disableLighting = true;
    pickMaterial.alpha = 0;
    pickMaterial.disableDepthWrite = true;
    pickMaterial.freeze();
    pickTarget.material = pickMaterial;
  }

  const glare: StarGlare = createStarGlare({
    color: Color3.Lerp(baseColor, Color3.White(), 0.35),
    diameter,
    intensity: isSubject ? 0.78 + recipe.activity * 0.25 : 1.15,
    ...(parent ? { parent } : {}),
    position,
    scene,
    renderingGroupId: renderingGroupId + 1,
    spikes: isSubject ? 0.28 : 1,
    spread: isSubject ? 3.2 : 5.5,
  });
  glare.mesh.isPickable = false;

  const meshes: AbstractMesh[] = [photosphere, glare.mesh];
  if (corona) meshes.push(corona.mesh);
  if (pickTarget) meshes.push(pickTarget);

  return {
    meshes,
    photosphere,
    update: (elapsedSeconds: number, cameraPosition: Vector3): void => {
      material.setFloat("time", elapsedSeconds);
      material.setVector3("cameraPosition", cameraPosition);
      glare.update(elapsedSeconds);
      if (corona) {
        corona.material.setFloat("time", elapsedSeconds);
        corona.material.setVector3("cameraPosition", cameraPosition);
        corona.mesh.computeWorldMatrix(true).getTranslationToRef(starCenter);
        corona.material.setVector3("starCenter", starCenter);
      }
      photosphere.rotation.y = elapsedSeconds * (0.008 + rotationFactor * 0.07);
    },
    dispose: (): void => {
      glare.dispose();
      pickTarget?.dispose(false, true);
      corona?.mesh.dispose(false, true);
      photosphere.dispose(false, true);
    },
  };
};
