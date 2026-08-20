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
import { deriveStarRecipe, type CustomStar, type CustomWorld } from "@exora/worldgen";
import {
  adaptFixedFoveation,
  deriveRenderQuality,
  type RenderQualityTier,
  shaderDefines,
} from "./render-quality.ts";
import type { XrStatus } from "./planet-scene.ts";
import { starKindLabel, starSummary } from "./star-utils.ts";
import { createXrConsole, type XrConsole, type XrConsoleHost } from "./xr-console.ts";
import { starFacts } from "./xr-console-model.ts";
import type { XrCell } from "./xr-panel-layout.ts";
import { requestVrHandoff } from "./xr-session.ts";

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

// Photosphere shading: multi-scale evolving convection cells, deterministic irregular
// starspots with an optional latitude preference, mandatory limb darkening, and a final
// display/exposure adaptation pass kept separate from the physical blackbody color so the
// two concerns (what temperature the star physically is vs. how that reads on a screen)
// never get tangled together.
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

/** How hard the photosphere blows out on screen. Purely a display choice — it never feeds
 * back into the blackbody colour or into anything the planet renderer lights from. */
const float STAR_EXPOSURE = 2.0;

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
// Breaks up any residual grid regularity in the cellular field below and gives the whole
// pattern a slow, non-scrolling evolution — the warp offset drifts with time, not the lattice.
vec3 domainWarp(vec3 p, float speed) {
  vec3 warp = vec3(
    fbm(p + vec3(0.0, 0.0, time * speed)),
    fbm(p + vec3(5.2, 1.3, time * speed * 0.83)),
    fbm(p + vec3(1.7, 9.2, time * speed * 1.14))
  );
  return p + (warp - 0.5) * 0.7;
}
// Cellular/Voronoi field with per-cell drift: feature points wobble in place over time rather
// than sliding uniformly, so cells evolve and occasionally reshuffle like real convection
// granules instead of looking like a texture scrolling underneath the surface.
//
// Returns (F1, F2, cellHash). F2 - F1 goes to zero exactly on a cell boundary, which is what
// gives the thin intergranular downflow lanes their shape — a plain F1 distance band would
// instead draw rings inside each cell.
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
// Irregular, clustered starspots: cluster centers come from a coarse cellular field, only a
// spotCoverage-controlled fraction of clusters are "active", and their boundary is perturbed
// by a finer noise field so edges read as ragged rather than perfect circles. A soft
// mid-latitude bias mirrors the belts real spots tend to favor without excluding the poles.
vec3 starspotField(vec3 p) {
  vec3 rotated = rotateY(p, time * (0.015 + rotationFactor * 0.05));
  float latitudeBias = mix(0.4, 1.0, exp(-pow((abs(rotated.y) - 0.5) * 2.4, 2.0)));
  vec3 warped = rotated + (fbm(rotated * 1.6 + 9.1) - 0.5) * 0.4;
  vec3 clusters = cellular(warped * 2.4);
  float threshold = 1.0 - clamp(spotCoverage * 1.9 * latitudeBias, 0.0, 0.96);
  float clusterActive = step(threshold, clusters.z);
  float clusterRadius = mix(0.055, 0.17, fract(clusters.z * 17.23));
  // Noise, not a second Voronoi pass: this only has to make the spot outline ragged so it does
  // not read as a circular decal, and noise breaks the circle just as well for far less cost.
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

  // Granule size. Cooler, more convective stars get somewhat larger cells, but the base stays
  // high enough that granules read as fine surface texture rather than as a cracked-mud
  // pattern of a dozen huge polygons.
  float granuleFrequency = 11.0 + granulationScale * 6.0;
  vec3 warped = domainWarp(p * granuleFrequency, 0.02);
  // A second, finer warp makes the cell walls wander. Without it the Voronoi edges stay evenly
  // spaced and the surface reads as lizard skin stretched over a ball.
  warped += (vec3(
    noise(warped * 3.1 + 11.0),
    noise(warped * 3.1 + 23.0),
    noise(warped * 3.1 + 37.0)
  ) - 0.5) * 0.5;

  vec3 cells = cellular(warped);

  float laneWidth = mix(0.05, 0.14, noise(warped * 1.7 + 3.0));
  float lane = 1.0 - smoothstep(0.0, laneWidth, cells.y - cells.x);
  float core = 1.0 - smoothstep(0.02, 0.6, cells.x);
  float cellBrightness = mix(0.92, 1.1, fract(cells.z * 7.31));
  // Supergranulation: a much coarser convection scale that mottles whole groups of granules.
  // Cheap fbm rather than a second cellular lookup — at this scale only the broad light/dark
  // drift is visible, and a 27-tap Voronoi for it is not worth the fragment cost.
  float supergranule = mix(0.96, 1.05, fbm(warped * 0.25 + 4.3));

  float granulation = (0.9 + core * 0.24) * cellBrightness * supergranule;
  granulation *= 1.0 - lane * (0.1 + granulationStrength * 0.16);
  // Granulation contrast falls away toward the limb, where the line of sight grazes the tops of
  // the cells rather than looking straight down into them.
  granulation = mix(1.0, granulation, mix(0.3, 1.0, mu));

  // Granulation drives emission level; the hottest granule cores also shift toward the star's
  // hot colour, so brightness and hue move together the way rising convection cells do.
  vec3 color = mix(
    baseColor,
    hotColor,
    clamp((granulation - 0.85) * 1.6, 0.0, 1.0) * (0.35 + granulationStrength * 0.5)
  );
  color *= granulation;

#ifdef STAR_ADVANCED
  vec3 spots = starspotField(p);
  float umbra = spots.x;
  float penumbra = clamp(spots.y, 0.0, 1.0);
  float plage = clamp(spots.z, 0.0, 1.0);
  color = mix(color, spotColor * 0.55, umbra);
  color = mix(color, spotColor * 1.05, penumbra * 0.85);
  color += hotColor * plage * activity * 0.22;
#endif

  // Mandatory limb darkening: cooler photospheres darken more sharply toward the edge than
  // hotter, more radiative ones. mu is the view-angle cosine, independent of any light
  // direction, since the star is the light source rather than something lit externally.
  float temperatureNorm = clamp((temperatureKelvin - 3000.0) / 27000.0, 0.0, 1.0);
  float limbCoefficient = mix(0.82, 0.32, temperatureNorm);
  float limb = pow(1.0 - limbCoefficient * (1.0 - mu), 1.0 + limbCoefficient * 0.5);
  color *= limb;

  // Display/exposure adaptation, kept separate from the physical blackbody colour above. A
  // photosphere is a light source, so it has to saturate toward white across the disc rather
  // than settle at some mid grey — a plain Reinhard curve maps an emission of 1.0 to 0.5 and
  // makes the star read as a dull tan ball. The per-channel exponential desaturates the
  // brightest regions on its own, exactly the way an overexposed star photograph does, while
  // the limb keeps the temperature's colour because it never reaches saturation.
  vec3 exposed = vec3(1.0) - exp(-color * STAR_EXPOSURE);

  gl_FragColor = vec4(clamp(exposed, 0.0, 1.0), 1.0);
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

// A thin emissive shell rather than a uniform bloom sphere: alpha is driven almost entirely
// by a Fresnel edge term, and low-frequency drifting noise breaks the corona into soft
// streamers instead of a perfectly round halo.
const CORONA_FRAGMENT_SHADER = `
precision highp float;
varying vec3 vObjectPosition;
varying vec3 vNormal;
varying vec3 vWorldPosition;

uniform float time;
uniform float seed;
uniform float coronalIntensity;
uniform float starRadius;
uniform vec3 starCenter;
uniform vec3 coronaColor;
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
  // Impact parameter of this fragment's view ray, measured from the star's centre in stellar
  // radii. Keying the falloff to distance from the STAR — rather than to a Fresnel term on the
  // shell — is what anchors the glow to the photosphere's limb. A shell Fresnel instead peaks
  // at the shell's own silhouette, where it saturates into a hard-edged bright circle floating
  // in empty space, which reads as a black disc with a ring drawn around it.
  vec3 rayDirection = normalize(vWorldPosition - cameraPosition);
  vec3 toStar = starCenter - cameraPosition;
  float along = dot(toStar, rayDirection);
  float impact = length(toStar - rayDirection * along);
  float radii = impact / max(starRadius, 0.0001);

  float drift = time * 0.012;
  float streamers = fbm(vObjectPosition * 2.1 + vec3(drift, -drift * 0.7, drift * 0.5));
  float shape = 0.45 + smoothstep(0.25, 0.8, streamers) * 0.55;

  // Exponential density falloff away from the limb, tuned so the corona has already faded to
  // nothing well before the shell's own edge — that is what keeps the shell invisible as
  // geometry. Cut off inside the disc so the photosphere stays crisp under its own corona.
  float density = exp(-(radii - 1.0) * 3.8) * smoothstep(0.98, 1.07, radii);
  float alpha = clamp(density * shape * coronalIntensity * 0.9, 0.0, 0.8);

  gl_FragColor = vec4(coronaColor, alpha);
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
  /** Immersive-only travel, so a wearer can leave for anywhere without removing the headset. */
  onForgeStar?: (star: CustomStar) => void;
  onForgeWorld?: (world: CustomWorld) => void;
  onSelectPlanet?: (planet: ExoplanetProfile) => void;
  onSelectStar?: (star: StarProfile) => void;
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
  // Quest is GPU-limited enough that the per-pixel 27-tap cellular field used for spots and
  // active regions is skipped entirely there; granulation and limb darkening (mandatory) stay
  // on every tier since they carry most of the visual read.
  const starIsAdvancedTier = profile.tier !== "quest";
  const coronaOctaves = profile.tier === "desktop" ? 4 : profile.tier === "mobile" ? 3 : 2;
  createStarfield(scene, seed, profile.starCount);
  Effect.ShadersStore.exoraStarVertexShader = STAR_VERTEX_SHADER;
  Effect.ShadersStore.exoraStarFragmentShader = STAR_FRAGMENT_SHADER;
  Effect.ShadersStore.exoraCoronaVertexShader = CORONA_VERTEX_SHADER;
  Effect.ShadersStore.exoraCoronaFragmentShader = CORONA_FRAGMENT_SHADER;

  // A UV sphere is enough here: nothing displaces the star's surface (all detail — granulation,
  // spots, limb darkening — is computed per-fragment from the normal/view direction), so the
  // pole pinching an icosphere would avoid never becomes visible, and the cheaper geometry
  // leaves more of the frame budget for the shading itself.
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
      defines: [
        ...shaderDefines(profile),
        ...(starIsAdvancedTier ? ["#define STAR_ADVANCED"] : []),
      ],
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
  // hotColor drives bright granule cores and active regions (lifted toward white); spotColor
  // drives umbra/penumbra (pulled toward black and slightly desaturated, the way a sunspot
  // reads darker and cooler rather than simply dimmer).
  const hotColor = Color3.Lerp(baseColor, Color3.White(), 0.45);
  const spotColor = Color3.Lerp(baseColor, Color3.Black(), 0.72);
  material.setColor3("baseColor", baseColor);
  material.setColor3("hotColor", hotColor);
  material.setColor3("spotColor", spotColor);
  material.setFloat("seed", seed);
  material.setFloat("activity", activity);
  material.setFloat("rotationFactor", recipe.rotationFactor);
  material.setFloat("spotCoverage", recipe.spotCoverage);
  material.setFloat("granulationScale", recipe.granulationScale);
  material.setFloat("granulationStrength", recipe.granulationStrength);
  material.setFloat("temperatureKelvin", recipe.temperatureKelvin);
  material.setFloat("time", 0);
  starMesh.material = material;

  // A Fresnel-shaped emissive shell stands in for the corona: it only becomes visible near the
  // grazing limb, and drifting low-frequency noise breaks it into streamers rather than a
  // uniform halo. Quest skips the shell (glow-layer bloom alone is its "simpler corona") since
  // an extra alpha-blended sphere plus fbm sampling is disproportionately expensive there.
  let coronaMaterial: ShaderMaterial | null = null;
  let coronaMesh: Mesh | null = null;
  if (starIsAdvancedTier) {
    coronaMesh = MeshBuilder.CreateSphere(
      "stellar-corona",
      { diameter: diameter * 2.2, segments: profile.tier === "desktop" ? 64 : 40 },
      scene,
    );
    coronaMesh.position.copyFrom(STAR_POSITION);
    coronaMesh.isPickable = false;
    // Group 1 draws after everything else, matching the planet atmosphere shell. Left in the
    // default group the transparent shell sorts against the starfield and blanks it out,
    // leaving a black annulus around the star instead of blending over it.
    coronaMesh.renderingGroupId = 1;
    coronaMaterial = new ShaderMaterial(
      "stellar-corona-material",
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
          "starCenter",
          "starRadius",
        ],
        needAlphaBlending: true,
      },
    );
    // Standard alpha blending, not ALPHA_ADD: the scene runs at Intermediate performance
    // priority, which keeps render state between frames, and an explicitly forced additive
    // mode ends up stale here — the shell then blanks the starfield behind it and leaves a
    // black annulus around the star. This mirrors the host-star corona in the planet scene,
    // which blends correctly under the same scene settings.
    coronaMaterial.backFaceCulling = true;
    coronaMaterial.disableDepthWrite = true;
    coronaMaterial.setColor3("coronaColor", Color3.Lerp(hotColor, Color3.White(), 0.15));
    coronaMaterial.setFloat("seed", seed);
    coronaMaterial.setFloat("coronalIntensity", recipe.coronalIntensity);
    coronaMaterial.setVector3("starCenter", STAR_POSITION);
    coronaMaterial.setFloat("starRadius", diameter * 0.5);
    coronaMaterial.setFloat("time", 0);
    coronaMesh.material = coronaMaterial;
  }

  // Kept modest and let the corona shell ride along in the same bloom pass — without it the
  // additive shell reads as a flat, hard-edged translucent disc rather than a soft glow.
  const glow = new GlowLayer("stellar-glow", scene, {
    blurKernelSize: profile.tier === "desktop" ? 40 : 20,
    mainTextureFixedSize: profile.tier === "desktop" ? 512 : 256,
  });
  glow.intensity = 0.5 + activity * 0.3;
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
  deckMaterial.diffuseColor = new Color3(0.006, 0.018, 0.03);
  deckMaterial.emissiveColor = new Color3(0.008, 0.038, 0.06);
  deckMaterial.specularColor = new Color3(0.12, 0.5, 0.62);
  deckMaterial.alpha = 0.32;
  deckMaterial.backFaceCulling = false;
  deckMaterial.freeze();
  deck.material = deckMaterial;
  deck.freezeWorldMatrix();

  const deckRingMaterial = new StandardMaterial("stellar-deck-ring-material", scene);
  deckRingMaterial.disableLighting = true;
  deckRingMaterial.emissiveColor = new Color3(1, 0.54, 0.18);
  deckRingMaterial.alpha = 0.78;
  deckRingMaterial.freeze();

  const makeDeckRing = (name: string, diameter: number, thickness: number): Mesh => {
    const ring = MeshBuilder.CreateTorus(
      name,
      { diameter, thickness, tessellation: profile.ringTessellation },
      scene,
    );
    ring.position.set(STAR_DECK_POSITION.x, STAR_DECK_POSITION.y + 0.012, STAR_DECK_POSITION.z);
    ring.isPickable = false;
    ring.isVisible = false;
    ring.material = deckRingMaterial;
    ring.freezeWorldMatrix();
    return ring;
  };

  const deckOuterRing = makeDeckRing("stellar-deck-outer-ring", STAR_DECK_RADIUS * 2, 0.032);
  const deckInnerRing = makeDeckRing("stellar-deck-inner-ring", 1.35, 0.018);
  const deckMarkers = Array.from({ length: 12 }, (_, index) => {
    const angle = (index / 12) * Math.PI * 2;
    const marker = MeshBuilder.CreateBox(
      `stellar-deck-bearing-${index}`,
      { depth: 0.34, height: 0.012, width: index % 3 === 0 ? 0.055 : 0.028 },
      scene,
    );
    marker.position.set(
      STAR_DECK_POSITION.x + Math.sin(angle) * STAR_DECK_RADIUS * 0.9,
      STAR_DECK_POSITION.y + 0.014,
      STAR_DECK_POSITION.z + Math.cos(angle) * STAR_DECK_RADIUS * 0.9,
    );
    marker.rotation.y = angle;
    marker.isPickable = false;
    marker.isVisible = false;
    marker.material = deckRingMaterial;
    marker.freezeWorldMatrix();
    return marker;
  });

  const deckVisuals = [deck, deckOuterRing, deckInnerRing, ...deckMarkers];

  const setDeckVisible = (visible: boolean): void => {
    for (const mesh of deckVisuals) mesh.isVisible = visible;
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
    material.setFloat("time", elapsed);
    material.setVector3("cameraPosition", activeCameraPosition);
    if (coronaMaterial) {
      coronaMaterial.setFloat("time", elapsed);
      coronaMaterial.setVector3("cameraPosition", activeCameraPosition);
    }
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
      xrConsole?.update(deltaSeconds);
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
    // The console is world-locked, so a teleport would otherwise strand it where the wearer was.
    xrConsole?.recall();
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
    subtitle: () => `${starKindLabel(star)} · observation deck`,
    summary: () => starSummary(star),
    title: () => star.name,
  };

  const refreshXrConsole = (): void => xrConsole?.refresh();

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
          setDeckVisible(true);
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
      xrConsole?.dispose();
      xrConsole = null;
      xr?.dispose();
      engine.stopRenderLoop();
      scene.dispose();
      engine.dispose();
    },
  };
};
