import { ArcRotateCamera } from "@babylonjs/core/Cameras/arcRotateCamera.js";
import { ActionManager } from "@babylonjs/core/Actions/actionManager.js";
import { ExecuteCodeAction } from "@babylonjs/core/Actions/directActions.js";
import "@babylonjs/core/Culling/ray.js";
import { Engine } from "@babylonjs/core/Engines/engine.js";
import { DirectionalLight } from "@babylonjs/core/Lights/directionalLight.js";
import { Color3, Color4 } from "@babylonjs/core/Maths/math.color.js";
import { Vector2, Vector3 } from "@babylonjs/core/Maths/math.vector.js";
import { Effect } from "@babylonjs/core/Materials/effect.js";
import { ShaderMaterial } from "@babylonjs/core/Materials/shaderMaterial.js";
import { StandardMaterial } from "@babylonjs/core/Materials/standardMaterial.js";
import type { AbstractMesh } from "@babylonjs/core/Meshes/abstractMesh.js";
import { Mesh } from "@babylonjs/core/Meshes/mesh.js";
import { MeshBuilder } from "@babylonjs/core/Meshes/meshBuilder.js";
import "@babylonjs/core/Meshes/instancedMesh.js";
import { VertexBuffer } from "@babylonjs/core/Buffers/buffer.js";
import { VertexData } from "@babylonjs/core/Meshes/mesh.vertexData.js";
import { Scene, ScenePerformancePriority } from "@babylonjs/core/scene.js";
import { TransformNode } from "@babylonjs/core/Meshes/transformNode.js";
import type { WebXRCamera } from "@babylonjs/core/XR/webXRCamera.js";
import { WebXRDefaultExperience } from "@babylonjs/core/XR/webXRDefaultExperience.js";
import "@babylonjs/core/XR/features/WebXRControllerMovement.js";
import "@babylonjs/core/XR/features/WebXRControllerPointerSelection.js";
import "@babylonjs/core/XR/features/WebXRControllerTeleportation.js";
import "@babylonjs/core/XR/features/WebXRHandTracking.js";
import { WebXRFeatureName } from "@babylonjs/core/XR/webXRFeaturesManager.js";
import { WebXRState } from "@babylonjs/core/XR/webXRTypes.js";
import type { Rgb, RingRecipe, RockyWorldRecipe, WorldRecipe } from "@exora/worldgen";
import {
  adaptFixedFoveation,
  adaptHardwareScaling,
  deriveRenderQuality,
  type RenderQualityProfile,
  type RenderQualityTier,
  shaderDefines,
} from "./render-quality.ts";
import { buildCraterField, sampleTerrainHeight } from "./planet-terrain.ts";
import { getSurfaceDetailTextures } from "./texture-cache.ts";
import { createXrMenu, type XrMenu, type XrMenuItem } from "./xr-menu.ts";
import { requestVrHandoff } from "./xr-session.ts";

const PLANET_POSITION = new Vector3(0, 1.35, 9.5);
const VIEWING_DECK_POSITION = new Vector3(0, 0, -7.4);
const LIGHT_DIRECTION = new Vector3(-0.82, 0.3, -0.38).normalize();
const DESKTOP_MOVE_SPEED = 5.2;
const XR_MOVE_SPEED = 2.2;
const SURFACE_GROUND_ORIGIN_Z = 18;
const SURFACE_GROUND_BASE_Y = -1.6;
/** Where the wearer stands when the immersive session drops onto the terrain. */
const XR_SURFACE_STAND = new Vector3(0, 0, 12);
const XR_SURFACE_BOUNDS = { maxX: 30, maxZ: 50, minX: -30, minZ: -14 };
/** Radius of the orbital platform, so a thumbstick cannot walk the wearer into empty space. */
const XR_DECK_RADIUS = 2.4;

const clamp = (value: number, minimum: number, maximum: number): number =>
  Math.min(maximum, Math.max(minimum, value));

const SKY_VERTEX_SHADER = `
precision highp float;

attribute vec3 position;
uniform mat4 worldViewProjection;
varying vec3 vDirection;

void main(void) {
  vDirection = normalize(position);
  gl_Position = worldViewProjection * vec4(position, 1.0);
}
`;

const SKY_FRAGMENT_SHADER = `
precision highp float;

varying vec3 vDirection;

uniform float time;
uniform float seed;
uniform float density;
uniform float cloudiness;
uniform float starVisibility;
uniform vec3 horizonColor;
uniform vec3 zenithColor;
uniform vec3 cloudColor;

float hash(vec2 point) {
  point = fract(point * vec2(123.34, 345.45));
  point += dot(point, point + 34.345 + seed * 0.0001);
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
  for (int octave = 0; octave < FBM_OCTAVES; octave++) {
    value += noise(point) * amplitude;
    point = point * 2.03 + vec2(13.1, 7.7);
    amplitude *= 0.48;
  }
  return value;
}

void main(void) {
  vec3 direction = normalize(vDirection);
  float elevation = clamp(direction.y * 0.5 + 0.5, 0.0, 1.0);
  float horizon = pow(1.0 - abs(direction.y), 2.2);
  vec3 sky = mix(horizonColor, zenithColor, smoothstep(0.03, 0.78, elevation));
  sky += horizonColor * horizon * density * 0.32;

  float longitude = atan(direction.z, direction.x);
  vec2 cloudUv = vec2(longitude * 2.1 + time * 0.006, direction.y * 5.2);
  float cloudNoise = fbm(cloudUv + fbm(cloudUv * 0.63 + 4.2));
  float cloudBand = smoothstep(0.48 + (1.0 - cloudiness) * 0.22, 0.78, cloudNoise);
  cloudBand *= smoothstep(-0.14, 0.35, direction.y) * (1.0 - smoothstep(0.62, 0.96, direction.y));
  sky = mix(sky, cloudColor, cloudBand * cloudiness * (0.34 + density * 0.46));

  vec2 starCell = floor(vec2(longitude * 210.0, asin(direction.y) * 180.0));
  float star = step(0.994, hash(starCell)) * pow(hash(starCell + 9.4), 5.0);
  star *= smoothstep(0.08, 0.72, direction.y) * starVisibility;
  sky += vec3(0.72, 0.86, 1.0) * star * 2.4;

  float dither = (hash(gl_FragCoord.xy) - 0.5) / 255.0;
  gl_FragColor = vec4(sky + dither, 1.0);
}
`;

const PLANET_VERTEX_SHADER = `
precision highp float;

attribute vec3 position;
attribute vec3 normal;

uniform mat4 world;
uniform mat4 worldViewProjection;

varying vec3 vWorldPosition;
varying vec3 vWorldNormal;
varying vec3 vSurfacePosition;

void main(void) {
  vec4 worldPosition = world * vec4(position, 1.0);
  vWorldPosition = worldPosition.xyz;
  vWorldNormal = normalize(mat3(world) * normal);
  vSurfacePosition = normalize(position);
  gl_Position = worldViewProjection * vec4(position, 1.0);
}
`;

const PLANET_FRAGMENT_SHADER = `
precision highp float;

varying vec3 vWorldPosition;
varying vec3 vWorldNormal;
varying vec3 vSurfacePosition;

uniform float time;
uniform float seed;
uniform float turbulence;
uniform float contrast;
uniform float jetCount;
uniform float bandSharpness;
uniform float bandWarp;
uniform float zonalVariation;
uniform float stormLatitude;
uniform float stormScale;
uniform float stormStrength;
uniform float stormCount;
uniform float stormColorShift;
uniform float haze;
uniform float atmosphereDepth;
uniform float polarVariation;
uniform vec3 cameraPosition;
uniform vec3 lightDirection;
uniform vec3 stellarColor;
uniform float stellarIntensity;
uniform vec3 deepColor;
uniform vec3 midColor;
uniform vec3 lightColor;
uniform vec3 stormColor;

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
  float amplitude = 0.52;
  for (int octave = 0; octave < FBM_OCTAVES + 1; octave++) {
    value += amplitude * noise(point);
    point = point.yzx * 2.03 + vec3(11.7, 7.9, 15.3);
    amplitude *= 0.48;
  }
  return value;
}

vec3 rotateY(vec3 point, float angle) {
  float sine = sin(angle);
  float cosine = cos(angle);
  return vec3(cosine * point.x - sine * point.z, point.y, sine * point.x + cosine * point.z);
}

void main(void) {
  vec3 normal = normalize(vWorldNormal);
  vec3 surface = normalize(vSurfacePosition);
  float latitude = asin(clamp(surface.y, -1.0, 1.0));
  float flow = time * 0.035;
  vec3 flowingSurface = rotateY(surface, flow);
  float broadNoise = fbm(flowingSurface * 2.15 + vec3(4.1, 8.7, 2.3));
  float warpNoise = fbm(
    flowingSurface * 4.4 + vec3(broadNoise * 2.7, -broadNoise * 1.3, broadNoise * 2.1)
  );
  float filamentNoise = fbm(
    vec3(flowingSurface.x * 7.0, flowingSurface.y * (16.0 + turbulence * 3.0), flowingSurface.z * 7.0) + vec3(17.1, flow * 0.45, 3.7)
  );

  // Each storm gets a deterministic latitude/longitude/scale/phase derived from its own index
  // and the planet seed, so a multi-storm giant never reads as identical circles pasted around
  // the sphere. MAX_GIANT_STORMS is a quality-tier compile constant; activeStorms (from the
  // recipe's stormCount) clamps how many of those slots actually render.
  float stormMask = 0.0;
  vec3 stormTint = vec3(0.0);
  int activeStorms = int(min(stormCount, float(MAX_GIANT_STORMS)));
  for (int i = 0; i < MAX_GIANT_STORMS; i++) {
    if (i >= activeStorms) continue;
    float fi = float(i);
    float indexHashA = hash(vec3(seed * 0.0002 + fi * 7.13, fi * 3.71, fi * 11.9));
    float indexHashB = hash(vec3(fi * 5.31, seed * 0.00031 + fi * 2.17, fi * 9.4));
    float sizeFalloff = 1.0 - fi * 0.32;
    float latSpread = 0.1 + fi * 0.22;
    float thisLatitude = clamp(stormLatitude + (indexHashA - 0.5) * latSpread, -1.3, 1.3);
    float thisLongitude = sin(seed * 0.00013 + fi * 2.71) * 3.4 + indexHashB * 6.28;
    vec3 stormCenter = vec3(
      cos(thisLatitude) * cos(thisLongitude),
      sin(thisLatitude),
      cos(thisLatitude) * sin(thisLongitude)
    );
    vec3 stormEast = normalize(cross(vec3(0.0, 1.0, 0.0), stormCenter));
    vec3 stormNorth = normalize(cross(stormCenter, stormEast));
    vec2 stormUv = vec2(dot(surface, stormEast), dot(surface, stormNorth));
    float thisScale = max(stormScale * sizeFalloff, 0.6);
    float stormDistance = length(stormUv * vec2(thisScale * 0.7, thisScale * 1.65));
    float stormCore = (1.0 - smoothstep(0.38, 1.0, stormDistance)) * smoothstep(-0.2, 0.72, dot(surface, stormCenter));
    float stormAngle = atan(stormUv.y, stormUv.x);
    float spiralDir = mod(fi, 2.0) < 0.5 ? 1.0 : -1.0;
    float stormSpiral = sin(stormAngle * (4.0 + fi) - stormDistance * 19.0 + flow * (2.0 + fi * 0.6) * spiralDir + warpNoise * 2.0);
    float thisStorm = stormCore * (0.7 + stormSpiral * 0.18 + filamentNoise * 0.12) * stormStrength * sizeFalloff;
    float thisShift = fract(stormColorShift + indexHashB * 0.5 + fi * 0.17);
    stormTint += mix(stormColor, lightColor, thisShift * 0.55) * thisStorm;
    stormMask += thisStorm;
  }
  vec3 blendedStormColor = stormMask > 0.0001 ? stormTint / stormMask : stormColor;
  stormMask = clamp(stormMask, 0.0, 1.0);

  // Zonal warp keeps jet bands from reading as mathematically perfect horizontal stripes: it
  // nudges the effective latitude before banding, and storms visibly disturb the flow around
  // them via the same bandPhase term.
  float zonalNoise = fbm(vec3(latitude * 3.1 + 5.4, flow * 0.22, 8.8));
  float latitudeWarp = latitude + (zonalNoise - 0.5) * zonalVariation * 0.7;
  float bandPhase = latitudeWarp * jetCount * 1.42
    + (broadNoise - 0.5) * (3.6 + bandWarp * 3.2)
    + (warpNoise - 0.5) * (1.4 + bandWarp * 1.6)
    + stormMask * 2.4;
  float bandWave = 0.5 + sin(bandPhase) * 0.34 + sin(bandPhase * 0.51 + 1.8) * 0.12;
  float halfWidth = mix(0.44, 0.08, clamp(bandSharpness, 0.0, 1.0));
  float bandMix = smoothstep(0.5 - halfWidth, 0.5 + halfWidth, bandWave);
  bandMix = mix(0.5, bandMix, contrast);
  float cells = smoothstep(0.66, 0.9, filamentNoise) * (0.35 + 0.65 * abs(cos(bandPhase)));

  float depthMix = clamp(0.22 + broadNoise * 0.62 + warpNoise * 0.12, 0.0, 1.0);
  depthMix = pow(depthMix, mix(1.5, 0.65, clamp(atmosphereDepth, 0.0, 1.0)));
  vec3 cloudColor = mix(deepColor, midColor, depthMix);
  cloudColor = mix(cloudColor, lightColor, clamp(bandMix * 0.82 + filamentNoise * 0.12 + cells * 0.16, 0.0, 1.0));
  cloudColor *= 0.92 + (filamentNoise - 0.5) * 0.12;
  cloudColor = mix(cloudColor, mix(deepColor, lightColor, 0.5), clamp(haze, 0.0, 1.0) * 0.18);
  cloudColor = mix(cloudColor, blendedStormColor, clamp(stormMask, 0.0, 0.9));

  // Polar structure: giants darken and haze toward the poles instead of holding the same band
  // pattern edge to edge.
  float poleMask = pow(smoothstep(0.5, 1.3, abs(latitude)), 2.0);
  cloudColor = mix(cloudColor, mix(deepColor, midColor, 0.4), poleMask * clamp(polarVariation, 0.0, 1.0) * 0.7);

  float diffuse = max(dot(normal, lightDirection), 0.0);
  float wrappedLight = 0.18 + diffuse * 0.94;
  vec3 viewDirection = normalize(cameraPosition - vWorldPosition);
  vec3 halfDirection = normalize(lightDirection + viewDirection);
  float sheen = pow(max(dot(normal, halfDirection), 0.0), 28.0) * (0.08 + cells * 0.12);
  float rim = pow(1.0 - max(dot(normal, viewDirection), 0.0), 2.7);
  vec3 finalColor = cloudColor * wrappedLight * mix(vec3(1.0), stellarColor, diffuse * 0.32) * stellarIntensity;
  finalColor += lightColor * sheen + midColor * rim * 0.28;
  float dither = (hash(vec3(gl_FragCoord.xy, seed)) - 0.5) / 255.0;

  gl_FragColor = vec4(finalColor + dither, 1.0);
}
`;

const ICE_GIANT_FRAGMENT_SHADER = `
precision highp float;

varying vec3 vWorldPosition;
varying vec3 vWorldNormal;
varying vec3 vSurfacePosition;

uniform float time;
uniform float seed;
uniform float bandScale;
uniform float bandContrast;
uniform float bandSharpness;
uniform float bandTurbulence;
uniform float bandWarp;
uniform float zonalVariation;
uniform float stormStrength;
uniform float stormLatitude;
uniform float stormCount;
uniform float stormColorShift;
uniform float haze;
uniform float atmosphereDepth;
uniform float polarGlow;
uniform vec3 cameraPosition;
uniform vec3 lightDirection;
uniform vec3 stellarColor;
uniform float stellarIntensity;
uniform vec3 deepColor;
uniform vec3 hazeColor;
uniform vec3 lightColor;

float hash(vec3 point) {
  point = fract(point * 0.1031 + seed * 0.000019);
  point += dot(point, point.yzx + 31.32);
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
  float amplitude = 0.52;
  for (int octave = 0; octave < FBM_OCTAVES; octave++) {
    value += amplitude * noise(point);
    point = point.yzx * 2.07 + vec3(9.3, 14.8, 5.6);
    amplitude *= 0.48;
  }
  return value;
}

vec3 rotateY(vec3 point, float angle) {
  float sine = sin(angle);
  float cosine = cos(angle);
  return vec3(cosine * point.x - sine * point.z, point.y, sine * point.x + cosine * point.z);
}

void main(void) {
  vec3 normal = normalize(vWorldNormal);
  vec3 surface = normalize(vSurfacePosition);
  float latitude = asin(clamp(surface.y, -1.0, 1.0));
  float flow = time * 0.018;
  vec3 flowingSurface = rotateY(surface, flow);
  float hazeNoise = fbm(flowingSurface * 2.6 + vec3(3.7, 11.9, 6.2));
  float detail = fbm(
    vec3(flowingSurface.x * (5.0 + bandTurbulence * 3.0), flowingSurface.y * (13.0 + bandTurbulence * 4.0), flowingSurface.z * (5.0 + bandTurbulence * 3.0)) + vec3(hazeNoise * 2.0)
  );

  // Subdued, wider-spread band warp than the gas giant shader -- ice giants read as more
  // uniform and hazier, not just a re-tinted gas giant.
  float zonalNoise = fbm(vec3(latitude * 2.6 + 9.1, flow * 0.15, 4.4));
  float latitudeWarp = latitude + (zonalNoise - 0.5) * zonalVariation * 0.8;
  float bandPhase = latitudeWarp * bandScale * 1.65
    + (hazeNoise - 0.5) * (2.2 + bandWarp * 2.2)
    + (detail - 0.5) * (0.5 + bandWarp * 0.7);
  float bandWave = 0.5 + sin(bandPhase) * 0.25 + sin(bandPhase * 0.47 + 2.2) * 0.08;
  float halfWidth = mix(0.44, 0.1, clamp(bandSharpness, 0.0, 1.0));
  float bands = smoothstep(0.5 - halfWidth, 0.5 + halfWidth, bandWave);
  bands = mix(0.5, bands, clamp(bandContrast, 0.0, 1.0));

  // Fewer, subtler storms than a gas giant, each with its own deterministic latitude/phase/tint.
  float stormMask = 0.0;
  int activeStorms = int(min(stormCount, float(MAX_GIANT_STORMS)));
  for (int i = 0; i < MAX_GIANT_STORMS; i++) {
    if (i >= activeStorms) continue;
    float fi = float(i);
    float indexHash = hash(vec3(seed * 0.00023 + fi * 6.7, fi * 4.1, fi * 8.3));
    float thisLatitude = clamp(stormLatitude + (indexHash - 0.5) * (0.15 + fi * 0.3), -1.2, 1.2);
    float stormNoise = fbm(rotateY(surface, -flow * (1.6 + fi * 0.4)) * (5.5 + fi * 1.2) + vec3(12.4 + fi * 3.1, 4.2, 8.7 + fi * 2.0));
    float latitudeMask = 1.0 - smoothstep(0.06, 0.42, abs(latitude - thisLatitude));
    float thisStrength = stormStrength * (1.0 - fi * 0.28);
    float thisShift = fract(stormColorShift + indexHash * 0.6 + fi * 0.21);
    stormMask += smoothstep(0.62, 0.9, stormNoise) * thisStrength * latitudeMask * (0.7 + thisShift * 0.3);
  }
  stormMask = clamp(stormMask, 0.0, 1.0);

  float pole = pow(smoothstep(0.55, 1.3, abs(latitude)), 2.0);

  float depthMix = clamp(0.3 + hazeNoise * 0.5 + detail * 0.08, 0.0, 1.0);
  depthMix = pow(depthMix, mix(1.4, 0.7, clamp(atmosphereDepth, 0.0, 1.0)));
  vec3 atmosphereColor = mix(deepColor, hazeColor, depthMix);
  atmosphereColor = mix(atmosphereColor, lightColor, bands * 0.2 + stormMask + detail * 0.05);
  // Strong haze flattens contrast further -- the defining difference from a gas giant's crisper
  // cloud definition.
  atmosphereColor = mix(atmosphereColor, hazeColor, clamp(haze, 0.0, 1.0) * 0.32);
  // Polar treatment differs from the gas giant: a desaturating haze cap rather than a bright
  // sheen hotspot.
  atmosphereColor = mix(atmosphereColor, hazeColor, pole * polarGlow * 0.55);

  float diffuse = max(dot(normal, lightDirection), 0.0);
  float wrappedLight = 0.22 + diffuse * 0.9;
  vec3 viewDirection = normalize(cameraPosition - vWorldPosition);
  float rim = pow(1.0 - max(dot(normal, viewDirection), 0.0), 2.5);
  vec3 finalColor = atmosphereColor * wrappedLight * mix(vec3(1.0), stellarColor, diffuse * 0.32) * stellarIntensity + hazeColor * rim * 0.46;
  finalColor += lightColor * pole * polarGlow * (0.05 + detail * 0.04);
  float dither = (hash(vec3(gl_FragCoord.xy, seed)) - 0.5) / 255.0;
  gl_FragColor = vec4(finalColor + dither, 1.0);
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
varying vec3 vObjectPosition;
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
  // Geometry is displaced once, CPU-side, in object space (see displaceRockyPlanet in
  // planet-scene.ts) so lighting normals stay correct under directional light; this shader only
  // recomputes a cosmetic height value from the same surface direction for color banding.
  vec3 direction = normalize(position);
  float continents = fbm(direction * roughness);
  float ridges = abs(fbm(direction * roughness * 2.15 + vec3(17.0)) * 2.0 - 1.0);
  float terrain = clamp(continents * 0.78 + (1.0 - ridges) * 0.22, 0.0, 1.0);
  vec4 worldPosition = world * vec4(position, 1.0);

  vHeight = terrain;
  vSurfacePosition = direction;
  // Object-space (pre-world-transform) position, used by the fragment shader for triplanar
  // microdetail sampling so the detail texture stays glued to the surface instead of swimming
  // through it as the planet rotates.
  vObjectPosition = position;
  vWorldPosition = worldPosition.xyz;
  vWorldNormal = normalize(mat3(world) * normal);
  gl_Position = worldViewProjection * vec4(position, 1.0);
}
`;

const ROCKY_FRAGMENT_SHADER = `
precision highp float;

varying vec3 vWorldPosition;
varying vec3 vWorldNormal;
varying vec3 vSurfacePosition;
varying vec3 vObjectPosition;
varying float vHeight;

uniform mat4 world;
uniform float seed;
uniform float craterDensity;
uniform float roughness;
uniform float waterLevel;
uniform float time;
uniform float lavaStrength;
uniform float iceCapStrength;
uniform vec3 cameraPosition;
uniform vec3 lightDirection;
uniform vec3 stellarColor;
uniform float stellarIntensity;
uniform vec3 lowColor;
uniform vec3 midColor;
uniform vec3 highColor;
uniform vec3 waterColor;
uniform vec3 waterColorShallow;
uniform vec3 emissiveColor;

#ifdef SURFACE_MICRODETAIL
uniform sampler2D graniteNormalMap;
uniform sampler2D graniteRoughnessMap;
uniform sampler2D basaltNormalMap;
uniform sampler2D basaltRoughnessMap;
uniform sampler2D crackedNormalMap;
uniform sampler2D crackedRoughnessMap;
uniform sampler2D regolithNormalMap;
uniform sampler2D regolithRoughnessMap;
uniform sampler2D iceNormalMap;
uniform sampler2D iceRoughnessMap;
uniform float detailFadeStart;
uniform float detailFadeEnd;
#endif

float hash(vec3 point) {
  point = fract(point * 0.1031 + seed * 0.000017);
  point += dot(point, point.yzx + 31.32);
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
  float amplitude = 0.52;
  for (int octave = 0; octave < FBM_OCTAVES; octave++) {
    value += amplitude * noise(point);
    point = point.yzx * 2.04 + vec3(8.7, 13.1, 5.9);
    amplitude *= 0.48;
  }
  return value;
}

float ridgedFbm(vec3 point) {
  float value = 0.0;
  float amplitude = 0.54;
  for (int octave = 0; octave < FBM_OCTAVES - 1; octave++) {
    float ridge = 1.0 - abs(noise(point) * 2.0 - 1.0);
    value += ridge * ridge * amplitude;
    point = point.zxy * 2.12 + vec3(4.3, 17.2, 9.1);
    amplitude *= 0.47;
  }
  return value;
}

vec3 perturbNormal(vec3 position, vec3 normal, float height) {
  vec3 positionDx = dFdx(position);
  vec3 positionDy = dFdy(position);
  vec3 crossY = cross(positionDy, normal);
  vec3 crossX = cross(normal, positionDx);
  float determinant = dot(positionDx, crossY);
  vec3 gradient = sign(determinant) * (dFdx(height) * crossY + dFdy(height) * crossX);
  return normalize(abs(determinant) * normal - gradient * 0.07);
}

#ifdef SURFACE_MICRODETAIL
/** Sharpened per-axis blend weights for object-space triplanar sampling (Babylon translates
 * texture2D/attribute/varying to their WebGL2 equivalents automatically). */
vec3 triplanarBlend(vec3 objectNormal) {
  vec3 blend = pow(abs(objectNormal), vec3(4.0));
  return blend / max(blend.x + blend.y + blend.z, 0.0001);
}

// Whiteout-blended triplanar normal map: samples the three axis-aligned projections of the
// given normal map and combines them relative to the base object-space normal so seams between
// projections stay hidden.
vec3 sampleTriplanarNormal(sampler2D tex, vec3 p, vec3 blend, vec3 objectNormal) {
  vec3 nx = texture2D(tex, p.yz).xyz * 2.0 - 1.0;
  vec3 ny = texture2D(tex, p.xz).xyz * 2.0 - 1.0;
  vec3 nz = texture2D(tex, p.xy).xyz * 2.0 - 1.0;

  nx = vec3(nx.xy + objectNormal.zy, abs(nx.z) * objectNormal.x);
  ny = vec3(ny.xy + objectNormal.xz, abs(ny.z) * objectNormal.y);
  nz = vec3(nz.xy + objectNormal.xy, abs(nz.z) * objectNormal.z);

  return normalize(nx.zyx * blend.x + ny.xzy * blend.y + nz.xyz * blend.z);
}

float sampleTriplanarScalar(sampler2D tex, vec3 p, vec3 blend) {
  float sx = texture2D(tex, p.yz).r;
  float sy = texture2D(tex, p.zx).r;
  float sz = texture2D(tex, p.xy).r;
  return sx * blend.x + sy * blend.y + sz * blend.z;
}
#endif

void main(void) {
  vec3 surface = normalize(vSurfacePosition);
  vec3 baseNormal = normalize(vWorldNormal);
  float macroDetail = fbm(surface * (roughness * 1.35) + vec3(3.2, 7.1, 11.8));
  float erosion = ridgedFbm(surface * (roughness * 4.6) + vec3(13.7, 2.4, 8.1));
  float mineralDetail = fbm(surface * 12.0 + vec3(5.1, 19.4, 7.7));
  float microDetail = fbm(surface * 28.0 + vec3(27.1, 4.6, 15.3));
  float craterNoise = fbm(surface * 7.5 + vec3(31.2, 8.3, 17.9));
  float craterThreshold = mix(0.91, 0.76, craterDensity);
  float crater = smoothstep(craterThreshold, craterThreshold + 0.09, craterNoise);
  float craterRim = smoothstep(craterThreshold - 0.035, craterThreshold, craterNoise) - crater;
  // Fracture channels (thin, ridge-following cracks) and separate rounded hotspots (isolated
  // upwelling cells), both bounded by lavaStrength so activity never reads as a whole-planet glow.
  float fractureField = abs(
    ridgedFbm(surface * 7.8 + vec3(2.4, 18.1, 9.7)) -
    ridgedFbm(surface * 7.8 + vec3(9.6, 3.2, 21.4))
  );
  float fractures = (1.0 - smoothstep(0.012, 0.085, fractureField)) * lavaStrength;
  float hotspotNoise = fbm(surface * 3.4 + vec3(51.3, 22.4, 7.1));
  float hotspots = smoothstep(0.8, 0.93, hotspotNoise) * lavaStrength;
  float lavaGlow = clamp(fractures * 0.85 + hotspots * 0.6, 0.0, max(lavaStrength * 0.92, 0.0));
  float surfaceHeight = macroDetail * 0.32 + erosion * 0.1 + mineralDetail * 0.025 - crater * 0.04 + craterRim * 0.025;
  vec3 normal = perturbNormal(vWorldPosition, baseNormal, surfaceHeight);
  // Ice coverage grows from the poles inward as iceCapStrength rises: near 1.0 it eats through
  // the lower-latitude threshold entirely, giving a globally glaciated world instead of just
  // wider polar caps.
  float polarBoundary = abs(surface.y) + (macroDetail - 0.5) * 0.16 + (mineralDetail - 0.5) * 0.04;
  float polarThreshold = mix(0.58, 0.04, smoothstep(0.74, 1.0, iceCapStrength));
  float polarMask = smoothstep(polarThreshold, polarThreshold + 0.3, polarBoundary) * iceCapStrength;
  vec3 iceColor = mix(vec3(0.63, 0.78, 0.85), vec3(0.93, 0.97, 0.99), smoothstep(0.35, 0.85, mineralDetail));

  float detailRoughness = 0.55;
#ifdef SURFACE_MICRODETAIL
  // Blend weights for the five reusable material families, all driven by recipe/terrain
  // quantities (slope, elevation, craters, lava, ice cap) rather than any Earth-specific biome
  // rule, so e.g. a sulfuric world still only ever picks among rock/dust/ice detail.
  float slope = 1.0 - clamp(dot(baseNormal, surface), 0.0, 1.0);
  float iceWeight = polarMask;
  float basaltWeight = clamp(fractures * 1.6 + (1.0 - smoothstep(0.0, 0.22, vHeight)) * 0.28, 0.0, 1.0) * (1.0 - iceWeight);
  float crackedWeight = clamp(craterRim * 2.2 + crater * 0.55 + erosion * 0.12, 0.0, 1.0) * (1.0 - iceWeight);
  float graniteWeight = clamp(smoothstep(0.42, 0.82, slope) + smoothstep(0.7, 0.95, vHeight) * 0.55, 0.0, 1.0) * (1.0 - iceWeight);
  float claimedWeight = clamp(iceWeight + basaltWeight + crackedWeight + graniteWeight, 0.0, 1.0);
  float regolithWeight = max(1.0 - claimedWeight, 0.0);
  float weightTotal = max(iceWeight + basaltWeight + crackedWeight + graniteWeight + regolithWeight, 0.0001);

  // Low-frequency domain warp on the sample position so the same tiled texture does not repeat
  // identically across every triplanar cell.
  vec3 warp = vec3(
    noise(surface * 2.3 + 4.1),
    noise(surface * 2.3 + 8.7),
    noise(surface * 2.3 + 15.2)
  ) - 0.5;
  vec3 detailPosition = vObjectPosition + warp * 1.35;
  vec3 objectNormal = surface;
  vec3 triBlend = triplanarBlend(objectNormal);

  vec3 detailNormalSum = vec3(0.0);
  float detailRoughnessSum = 0.0;

  if (graniteWeight > 0.003) {
    vec3 p = detailPosition * 7.0;
    detailNormalSum += sampleTriplanarNormal(graniteNormalMap, p, triBlend, objectNormal) * graniteWeight;
    detailRoughnessSum += sampleTriplanarScalar(graniteRoughnessMap, p, triBlend) * graniteWeight;
  }
  if (basaltWeight > 0.003) {
    vec3 p = detailPosition * 8.0;
    detailNormalSum += sampleTriplanarNormal(basaltNormalMap, p, triBlend, objectNormal) * basaltWeight;
    detailRoughnessSum += sampleTriplanarScalar(basaltRoughnessMap, p, triBlend) * basaltWeight;
  }
  if (crackedWeight > 0.003) {
    vec3 p = detailPosition * 6.0;
    detailNormalSum += sampleTriplanarNormal(crackedNormalMap, p, triBlend, objectNormal) * crackedWeight;
    detailRoughnessSum += sampleTriplanarScalar(crackedRoughnessMap, p, triBlend) * crackedWeight;
  }
  if (regolithWeight > 0.003) {
    vec3 p = detailPosition * 13.0;
    detailNormalSum += sampleTriplanarNormal(regolithNormalMap, p, triBlend, objectNormal) * regolithWeight;
    detailRoughnessSum += sampleTriplanarScalar(regolithRoughnessMap, p, triBlend) * regolithWeight;
  }
  if (iceWeight > 0.003) {
    vec3 p = detailPosition * 10.0;
    detailNormalSum += sampleTriplanarNormal(iceNormalMap, p, triBlend, objectNormal) * iceWeight;
    detailRoughnessSum += sampleTriplanarScalar(iceRoughnessMap, p, triBlend) * iceWeight;
  }

  detailRoughness = detailRoughnessSum / weightTotal;
  vec3 objectDetailNormal = normalize(mix(objectNormal, detailNormalSum / weightTotal, clamp(weightTotal, 0.0, 1.0)));

  // Fade microdetail out with distance: rich up close, smooth again from orbit so the planet
  // does not read as sandpaper in a wide shot.
  float cameraDistance = length(cameraPosition - vWorldPosition);
  float detailFade = 1.0 - smoothstep(detailFadeStart, detailFadeEnd, cameraDistance);
  vec3 worldDetailNormal = normalize(mat3(world) * objectDetailNormal);
  normal = normalize(mix(normal, worldDetailNormal, 0.55 * detailFade));
#endif

  vec3 rockColor = mix(lowColor, midColor, smoothstep(0.28, 0.62, vHeight));
  rockColor = mix(rockColor, highColor, smoothstep(0.62, 0.9, vHeight));
  vec3 mineralTint = mix(lowColor, highColor, clamp(mineralDetail * 0.88 + erosion * 0.18, 0.0, 1.0));
  rockColor = mix(rockColor, mineralTint, 0.18 + erosion * 0.12);
  rockColor *= 0.94 + (microDetail - 0.5) * 0.06;
  rockColor = mix(rockColor, highColor * 1.08, craterRim * 0.36);
  rockColor = mix(rockColor, lowColor * 0.38, crater * 0.68);
  // Dark volcanic crust: the ground around active fracture/hotspot networks reads as cooled,
  // ash-dark basalt rather than plain rock, independent of the emissive glow itself.
  rockColor = mix(rockColor, vec3(0.018, 0.012, 0.011), clamp(lavaStrength * 0.55, 0.0, 1.0) * (1.0 - lavaGlow));

  float coastline = vHeight + (macroDetail - 0.5) * 0.025;
  float shoreline = waterLevel > 0.0 ? smoothstep(waterLevel + 0.016, waterLevel - 0.012, coastline) : 0.0;
  float waterMask = shoreline;
  // Ice-locked oceans (high iceCapStrength on a water world) keep the basin shape but stop
  // acting like liquid: no ripple, no glint, tinted toward ice instead of the liquid color.
  float frozenWater = waterMask * smoothstep(0.55, 0.82, iceCapStrength);
  float liquidWater = waterMask * (1.0 - frozenWater);

  // Subtle animated ripple, liquid areas only, so the surface is not perfectly still.
  vec3 rippleSample = surface * 42.0 + vec3(time * 0.6, time * -0.44, time * 0.31);
  float ripple = (noise(rippleSample) - 0.5) * 0.05 * liquidWater;
  vec3 waterNormal = normalize(baseNormal + vec3(ripple, ripple * 0.6, -ripple));
  normal = normalize(mix(normal, mix(baseNormal, waterNormal, liquidWater > 0.0 ? 1.0 : 0.0), waterMask * 0.94));

  // Shallow (near the shore) vs. deep (basin interior) tint, using distance past the shoreline
  // threshold as a cheap depth proxy — no separate depth buffer needed.
  float depthProxy = waterLevel > 0.0 ? clamp((waterLevel - coastline) / max(waterLevel, 0.05), 0.0, 1.0) : 0.0;
  vec3 liquidColor = mix(waterColorShallow, waterColor, depthProxy);
  vec3 waterSurfaceColor = mix(liquidColor, iceColor, frozenWater / max(waterMask, 0.0001));
  vec3 surfaceColor = mix(rockColor, waterSurfaceColor, waterMask * 0.92);
  surfaceColor = mix(surfaceColor, iceColor, polarMask * (0.62 + microDetail * 0.16));

  float diffuse = max(dot(normal, lightDirection), 0.0);
  float wrappedLight = 0.16 + diffuse * 0.98;
  vec3 viewDirection = normalize(cameraPosition - vWorldPosition);
  vec3 halfDirection = normalize(lightDirection + viewDirection);
  // Fresnel reflectance: water (and ice) throw more of the sky/star back at grazing angles,
  // rock stays mostly matte.
  float fresnel = pow(1.0 - max(dot(normal, viewDirection), 0.0), 5.0);
  float waterFresnel = fresnel * (liquidWater * 0.85 + frozenWater * 0.22);
  // A tight, bright star glint on liquid water; a softer, dimmer one on ice.
  float waterSpecular = pow(max(dot(normal, halfDirection), 0.0), 130.0) * liquidWater;
  float iceSpecular = pow(max(dot(normal, halfDirection), 0.0), 34.0) * frozenWater * 0.4;
  // Smoother materials (ice) throw a tighter, brighter highlight; rougher ones (dust, rock) a
  // dim, broad one — giving the surface meaningful, material-driven roughness variation.
  float rockSpecular = pow(max(dot(normal, halfDirection), 0.0), mix(6.0, 70.0, 1.0 - detailRoughness)) * (1.0 - waterMask) * (1.0 - detailRoughness) * 0.1;
  float rim = pow(1.0 - max(dot(normal, viewDirection), 0.0), 3.0);

  vec3 finalColor = surfaceColor * wrappedLight * mix(vec3(1.0), stellarColor, diffuse * 0.38) * stellarIntensity;
  finalColor += mix(vec3(0.34, 0.58, 0.72), stellarColor, 0.55) * (waterSpecular + iceSpecular) * stellarIntensity;
  finalColor += stellarColor * waterFresnel * stellarIntensity * 0.5;
  finalColor += stellarColor * rockSpecular * stellarIntensity;
  finalColor += highColor * rim * 0.08;
  finalColor += emissiveColor * lavaGlow * (0.72 + 0.2 * sin(time * 0.7 + microDetail * 8.0) + 0.12 * sin(time * 1.7 + hotspotNoise * 11.0));
  float dither = (hash(vec3(gl_FragCoord.xy, seed)) - 0.5) / 255.0;
  gl_FragColor = vec4(finalColor + dither, 1.0);
}
`;

const CLOUD_FRAGMENT_SHADER = `
precision highp float;

varying vec3 vWorldPosition;
varying vec3 vWorldNormal;

uniform float time;
uniform float seed;
uniform float cloudCover;
uniform float cloudScale;
uniform vec2 windDirection;
uniform vec3 cloudColor;
uniform vec3 cameraPosition;
uniform vec3 lightDirection;
uniform vec3 stellarColor;

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
  for (int octave = 0; octave < FBM_OCTAVES - 1; octave++) {
    value += amplitude * noise(point);
    point = point * 2.06 + vec3(8.1, 13.4, 4.7);
    amplitude *= 0.48;
  }
  return value;
}

void main(void) {
  vec3 normal = normalize(vWorldNormal);
  // Wind drift is a translation along the (seed-chosen) prevailing direction, independent of
  // the planet's own rotation, which the cloud mesh already inherits from its parent transform.
  vec3 drift = vec3(windDirection.x, 0.0, windDirection.y) * time * 0.03;
  vec3 samplePosition = normal * (2.6 * cloudScale * 0.5 + 1.3) + drift;
  float cloudNoise = fbm(samplePosition);

#ifdef CLOUD_DETAIL
  // A second, higher-frequency octave group sampled at a different scale/speed than the base
  // layer, so the cloud field reads as multi-scale structure (large systems + fine wisps)
  // instead of one blob of noise. Skipped on fill-rate-constrained tiers.
  vec3 fineSamplePosition = normal * (7.5 * cloudScale * 0.5 + 2.0) - drift * 1.7;
  float fineNoise = fbm(fineSamplePosition + cloudNoise * 0.6);
  cloudNoise = mix(cloudNoise, cloudNoise * 0.6 + fineNoise * 0.4, 0.55);
#endif

  float threshold = mix(0.74, 0.43, cloudCover);
  float cloud = smoothstep(threshold, threshold + 0.16, cloudNoise);
  vec3 viewDirection = normalize(cameraPosition - vWorldPosition);
  float rim = pow(1.0 - max(dot(normal, viewDirection), 0.0), 2.2);
  float diffuse = 0.28 + max(dot(normal, lightDirection), 0.0) * 0.78;
  gl_FragColor = vec4(cloudColor * mix(vec3(1.0), stellarColor, 0.28) * (diffuse + rim * 0.34), cloud * (0.24 + cloudCover * 0.48));
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
uniform vec3 lightDirection;
uniform vec3 stellarColor;
uniform float stellarIntensity;
uniform float time;
uniform float activity;
uniform float density;
uniform float haze;
uniform float scatterStrength;

void main(void) {
  vec3 normal = normalize(vWorldNormal);
  vec3 viewDirection = normalize(cameraPosition - vWorldPosition);
  float rim = pow(1.0 - max(dot(normal, viewDirection), 0.0), 2.25);
  float pulse = 0.92 + sin(time * 0.42) * 0.08 * activity;

  // Cheap Rayleigh-like approximation: thin/edge-on air scatters shorter wavelengths harder, so
  // push the limb color toward blue as it thins away from the (thicker-looking) disc center.
  vec3 rayleighTint = mix(atmosphereColor, vec3(0.55, 0.72, 1.0), scatterStrength * 0.5);
  vec3 rimColor = mix(atmosphereColor, rayleighTint, smoothstep(0.15, 0.85, rim));

  // Terminator behavior: the day-side limb reads bright and scattered, the night-side limb goes
  // dim and desaturated instead of glowing uniformly all the way around.
  float sunFacing = dot(normal, lightDirection);
  float dayNight = smoothstep(-0.55, 0.35, sunFacing);
  vec3 nightTint = mix(atmosphereColor * 0.22, vec3(0.05, 0.04, 0.09), 0.5);
  vec3 litColor = mix(nightTint, rimColor, dayNight);

  // Mie-like forward glow concentrated toward the star direction as seen from the camera.
  float mie = pow(max(dot(viewDirection, lightDirection), 0.0), 10.0) * haze * dayNight;

  float alpha = smoothstep(0.03, 1.0, rim) * density * (0.42 + activity * 0.16) * pulse;
  alpha *= mix(0.45, 1.0, dayNight);
  vec3 finalColor = litColor * (0.75 + rim * (1.35 + activity * 0.5)) * mix(vec3(1.0), stellarColor, 0.4 * dayNight) * (0.6 + stellarIntensity * 0.25);
  finalColor += stellarColor * mie * stellarIntensity * 0.6;
  gl_FragColor = vec4(finalColor, clamp(alpha + mie * 0.3, 0.0, 1.0));
}
`;

const RING_VERTEX_SHADER = `
precision highp float;

attribute vec3 position;
attribute vec2 uv;

uniform mat4 world;
uniform mat4 worldViewProjection;

varying vec2 vUv;
varying vec3 vWorldPosition;
varying vec3 vWorldNormal;

void main(void) {
  vUv = uv;
  vec4 worldPosition = world * vec4(position, 1.0);
  vWorldPosition = worldPosition.xyz;
  vWorldNormal = normalize(mat3(world) * vec3(0.0, 1.0, 0.0));
  gl_Position = worldViewProjection * vec4(position, 1.0);
}
`;

/**
 * Deterministic, procedural radial density so a ring never renders as one flat, uniformly
 * transparent disc: `vUv.x` sweeps 0 (inner edge) to 1 (outer edge) and layered value-noise
 * over that single axis produces bands, gaps, and per-band shading/color variation.
 */
const RING_FRAGMENT_SHADER = `
precision highp float;

varying vec2 vUv;
varying vec3 vWorldPosition;
varying vec3 vWorldNormal;

uniform float seed;
uniform float bands;
uniform float gapiness;
uniform float opacity;
uniform vec3 ringColor;
uniform vec3 cameraPosition;
uniform vec3 lightDirection;
uniform vec3 stellarColor;
uniform float stellarIntensity;

float hash1(float n) {
  return fract(sin(n * 127.1 + seed * 0.0173) * 43758.5453123);
}

float bandNoise(float r) {
  float value = 0.0;
  float freq = bands;
  float amplitude = 0.55;
  for (int octave = 0; octave < RING_OCTAVES; octave++) {
    float cell = floor(r * freq);
    float local = fract(r * freq);
    float a = hash1(cell + float(octave) * 19.3);
    float b = hash1(cell + 1.0 + float(octave) * 19.3);
    value += mix(a, b, smoothstep(0.0, 1.0, local)) * amplitude;
    freq *= 1.93;
    amplitude *= 0.52;
  }
  return value / 1.4;
}

void main(void) {
  float r = clamp(vUv.x, 0.0, 1.0);
  float density = bandNoise(r);
  float gapMask = smoothstep(gapiness * 0.32, gapiness * 0.32 + 0.14, density);
  float edgeFade = smoothstep(0.0, 0.05, r) * smoothstep(1.0, 0.92, r);
  float shade = mix(0.55, 1.35, hash1(floor(r * bands * 2.3) + 4.1));
  vec3 tint = ringColor * shade;

  vec3 normal = normalize(vWorldNormal);
  vec3 viewDirection = normalize(cameraPosition - vWorldPosition);
  // Rings are unshadowed thin discs, lit from both faces; abs() keeps the underside from
  // reading as pitch black while still tracking the host-star direction for day/night balance.
  float lit = 0.35 + abs(dot(normal, lightDirection)) * 0.85;
  float grazing = pow(1.0 - abs(dot(normal, viewDirection)), 1.4);

  vec3 finalColor = tint * lit * mix(vec3(1.0), stellarColor, 0.4) * stellarIntensity;
  finalColor += tint * grazing * 0.12;
  float alpha = opacity * gapMask * edgeFade * (0.55 + density * 0.5);
  gl_FragColor = vec4(finalColor, clamp(alpha, 0.0, 1.0));
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
  onSelectHostStar?: () => void;
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

const createHostStar = (
  scene: Scene,
  recipe: WorldRecipe,
  profile: RenderQualityProfile,
  parent: TransformNode,
  onSelectHostStar?: () => void,
): AbstractMesh[] => {
  const starPosition = PLANET_POSITION.add(new Vector3(-18, 11, 32));
  const star = MeshBuilder.CreateSphere(
    "hostStar",
    {
      diameter: recipe.star.radiusSceneUnits * 2,
      segments: profile.tier === "desktop" ? 40 : 24,
    },
    scene,
  );
  star.parent = parent;
  star.position.copyFrom(starPosition);
  star.isPickable = Boolean(onSelectHostStar);

  const starMaterial = new StandardMaterial("hostStarMaterial", scene);
  starMaterial.disableLighting = true;
  starMaterial.diffuseColor = toColor3(recipe.star.color);
  starMaterial.emissiveColor = toColor3(recipe.star.color).scale(recipe.star.intensity);
  starMaterial.freeze();
  star.material = starMaterial;

  const corona = MeshBuilder.CreateSphere(
    "hostStarCorona",
    {
      diameter: recipe.star.radiusSceneUnits * 2.7,
      segments: profile.tier === "desktop" ? 32 : 20,
    },
    scene,
  );
  corona.parent = parent;
  corona.position.copyFrom(starPosition);
  corona.isPickable = Boolean(onSelectHostStar);
  corona.renderingGroupId = 1;
  const coronaMaterial = new StandardMaterial("hostStarCoronaMaterial", scene);
  coronaMaterial.disableLighting = true;
  coronaMaterial.emissiveColor = toColor3(recipe.star.color).scale(0.85);
  coronaMaterial.alpha = Math.min(0.38, 0.16 + recipe.star.intensity * 0.065);
  coronaMaterial.backFaceCulling = false;
  coronaMaterial.disableDepthWrite = true;
  coronaMaterial.freeze();
  corona.material = coronaMaterial;

  if (onSelectHostStar) {
    for (const target of [star, corona]) {
      target.actionManager = new ActionManager(scene);
      target.actionManager.registerAction(
        new ExecuteCodeAction(ActionManager.OnPickTrigger, onSelectHostStar),
      );
    }
  }

  return [star, corona];
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

/**
 * Builds a single flat annulus (inner radius -> outer radius) in the XZ plane: `uv.x` sweeps
 * radially (0 at the inner edge, 1 at the outer edge) so a shader can drive procedural radial
 * density from it, `uv.y` sweeps angularly. A handful of radial subdivisions (rather than one
 * quad strip) let the per-fragment band noise read as more than a flat gradient across the
 * width. One draw call, unlike the previous stacked-torus approach.
 */
const buildRingMesh = (
  scene: Scene,
  innerRadius: number,
  outerRadius: number,
  angularSegments: number,
): Mesh => {
  const mesh = new Mesh("planetRings", scene);
  const radialSteps = 6;
  const positions: number[] = [];
  const uvs: number[] = [];
  const indices: number[] = [];

  for (let ring = 0; ring <= radialSteps; ring += 1) {
    const radialFraction = ring / radialSteps;
    const ringRadius = innerRadius + (outerRadius - innerRadius) * radialFraction;
    for (let segment = 0; segment <= angularSegments; segment += 1) {
      const angle = (segment / angularSegments) * Math.PI * 2;
      positions.push(Math.cos(angle) * ringRadius, 0, Math.sin(angle) * ringRadius);
      uvs.push(radialFraction, segment / angularSegments);
    }
  }

  const rowLength = angularSegments + 1;
  for (let ring = 0; ring < radialSteps; ring += 1) {
    for (let segment = 0; segment < angularSegments; segment += 1) {
      const a = ring * rowLength + segment;
      const b = a + 1;
      const c = a + rowLength;
      const d = c + 1;
      indices.push(a, c, b, b, c, d);
    }
  }

  const normals = Array.from<number>({ length: positions.length }).fill(0);
  for (let index = 1; index < normals.length; index += 3) normals[index] = 1;

  const vertexData = new VertexData();
  vertexData.positions = positions;
  vertexData.indices = indices;
  vertexData.uvs = uvs;
  vertexData.normals = normals;
  vertexData.applyToMesh(mesh);
  return mesh;
};

const createRingSystem = (
  scene: Scene,
  profile: RenderQualityProfile,
  planetRadius: number,
  ring: RingRecipe,
  star: WorldRecipe["star"],
  tilt: number,
): { material: ShaderMaterial; system: TransformNode } => {
  const ringSystem = new TransformNode("ringSystem", scene);
  ringSystem.position.copyFrom(PLANET_POSITION);
  ringSystem.rotation.x = 0.88 + tilt * 0.36;
  ringSystem.rotation.z = tilt;

  const innerRadius = Math.max(planetRadius * 1.05, ring.innerRadius);
  const outerRadius = Math.max(innerRadius * 1.05, ring.outerRadius);
  const mesh = buildRingMesh(scene, innerRadius, outerRadius, profile.ringTessellation);
  mesh.parent = ringSystem;
  mesh.isPickable = false;
  mesh.renderingGroupId = 1;

  const material = new ShaderMaterial(
    "planetRingMaterial",
    scene,
    { vertex: "exoraRing", fragment: "exoraRing" },
    {
      attributes: ["position", "uv"],
      defines: [`#define RING_OCTAVES ${profile.tier === "desktop" ? 4 : 3}`],
      uniforms: [
        "world",
        "worldViewProjection",
        "cameraPosition",
        "seed",
        "bands",
        "gapiness",
        "opacity",
        "ringColor",
        "lightDirection",
        "stellarColor",
        "stellarIntensity",
      ],
      needAlphaBlending: true,
    },
  );
  material.setFloat("seed", ring.outerRadius * 1_000 + ring.bands);
  material.setFloat("bands", Math.max(3, ring.bands));
  material.setFloat("gapiness", Math.min(1, Math.max(0, ring.gapiness)));
  material.setFloat("opacity", ring.opacity);
  material.setColor3("ringColor", toColor3(ring.color));
  material.setVector3("lightDirection", LIGHT_DIRECTION);
  material.setColor3("stellarColor", toColor3(star.color));
  material.setFloat("stellarIntensity", star.intensity);
  material.backFaceCulling = false;
  material.disableDepthWrite = true;
  mesh.material = material;

  return { material, system: ringSystem };
};

/**
 * How much CPU-side terrain displacement (in scene units) a fully-elevated world gets, kept
 * separate from `recipe.radiusSceneUnits` (display radius) and any physical radius derived from
 * catalog data — this is a purely artistic knob so mountains read as visible relief without
 * implying kilometer-accurate heights.
 */
const TERRAIN_DISPLAY_EXAGGERATION = 0.5;

/**
 * Displaces a rocky planet's icosphere vertices with multi-scale procedural terrain (continents,
 * mountains, ridges, roughness, craters — see planet-terrain.ts) and recomputes normals from the
 * displaced geometry so directional lighting responds to the actual shape instead of the
 * original sphere's normals. Runs once at mesh-build time, in object space, so it is unaffected
 * by the mesh's later rotation/position/orbit transforms.
 */
const displaceRockyPlanet = (planet: Mesh, recipe: RockyWorldRecipe): void => {
  const positions = planet.getVerticesData(VertexBuffer.PositionKind);
  const indices = planet.getIndices();
  if (!positions || !indices) return;

  const craters = buildCraterField(
    recipe.seed,
    recipe.terrain.craterDensity,
    recipe.terrain.craterScale,
  );
  const radius = recipe.radiusSceneUnits;

  for (let vertex = 0; vertex < positions.length; vertex += 3) {
    const x = positions[vertex]!;
    const y = positions[vertex + 1]!;
    const z = positions[vertex + 2]!;
    const length = Math.hypot(x, y, z) || 1;
    const direction = { x: x / length, y: y / length, z: z / length };
    const { height } = sampleTerrainHeight(direction, recipe.terrain, recipe.seed, craters);
    const rawOffset = height * recipe.surface.elevation * TERRAIN_DISPLAY_EXAGGERATION;
    // Clamp relative to radius so extreme parameter combinations (max mountains + max craters)
    // cannot fold the mesh in on itself.
    const offset = Math.min(radius * 0.4, Math.max(-radius * 0.4, rawOffset));
    const displaced = radius + offset;
    positions[vertex] = direction.x * displaced;
    positions[vertex + 1] = direction.y * displaced;
    positions[vertex + 2] = direction.z * displaced;
  }

  const normals = new Float32Array(positions.length);
  VertexData.ComputeNormals(positions, indices, normals);
  planet.updateVerticesData(VertexBuffer.PositionKind, positions);
  planet.setVerticesData(VertexBuffer.NormalKind, normals);
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
  ringMaterial: ShaderMaterial | null;
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
  Effect.ShadersStore.exoraRingVertexShader = RING_VERTEX_SHADER;
  Effect.ShadersStore.exoraRingFragmentShader = RING_FRAGMENT_SHADER;

  const orbitalRoot = new TransformNode("orbitalWorld", scene);
  const orbitalMeshes: AbstractMesh[] = [];

  // Rocky worlds get an icosphere: its near-uniform vertex distribution avoids the pinched
  // triangles a UV sphere has at the poles, which otherwise show up as displacement/crater
  // artifacts once terrain pushes vertices in and out along their normals. Gas/ice giants have
  // no vertex displacement, so they keep the cheaper UV sphere.
  const planet =
    recipe.renderer === "rocky"
      ? MeshBuilder.CreateIcoSphere(
          "planet",
          {
            radius: recipe.radiusSceneUnits,
            subdivisions: profile.planetIcoSubdivisions,
            flat: false,
          },
          scene,
        )
      : MeshBuilder.CreateSphere(
          "planet",
          { diameter: recipe.radiusSceneUnits * 2, segments: profile.planetSegments },
          scene,
        );
  planet.position.copyFrom(PLANET_POSITION);
  planet.parent = orbitalRoot;
  planet.rotation.z = recipe.axialTilt;
  planet.isPickable = false;
  orbitalMeshes.push(planet);

  if (recipe.renderer === "rocky") {
    displaceRockyPlanet(planet, recipe);
  }

  let shader: ShaderMaterial;

  if (recipe.renderer === "rocky") {
    shader = new ShaderMaterial(
      "rockyPlanetMaterial",
      scene,
      { vertex: "exoraRocky", fragment: "exoraRocky" },
      {
        attributes: ["position", "normal"],
        defines: shaderDefines(profile),
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
          "stellarColor",
          "stellarIntensity",
          "lowColor",
          "midColor",
          "highColor",
          "waterColor",
          "waterColorShallow",
          "emissiveColor",
          ...(profile.surfaceMicrodetail ? ["detailFadeStart", "detailFadeEnd"] : []),
        ],
        samplers: profile.surfaceMicrodetail
          ? [
              "graniteNormalMap",
              "graniteRoughnessMap",
              "basaltNormalMap",
              "basaltRoughnessMap",
              "crackedNormalMap",
              "crackedRoughnessMap",
              "regolithNormalMap",
              "regolithRoughnessMap",
              "iceNormalMap",
              "iceRoughnessMap",
            ]
          : [],
      },
    );
  } else if (recipe.renderer === "ice-giant") {
    shader = new ShaderMaterial(
      "iceGiantPlanetMaterial",
      scene,
      { vertex: "exoraPlanet", fragment: "exoraIceGiant" },
      {
        attributes: ["position", "normal"],
        defines: shaderDefines(profile),
        uniforms: [
          "world",
          "worldViewProjection",
          "cameraPosition",
          "time",
          "seed",
          "bandScale",
          "bandContrast",
          "bandSharpness",
          "bandTurbulence",
          "bandWarp",
          "zonalVariation",
          "stormStrength",
          "stormLatitude",
          "stormCount",
          "stormColorShift",
          "haze",
          "atmosphereDepth",
          "polarGlow",
          "lightDirection",
          "stellarColor",
          "stellarIntensity",
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
        defines: shaderDefines(profile),
        uniforms: [
          "world",
          "worldViewProjection",
          "cameraPosition",
          "time",
          "seed",
          "turbulence",
          "contrast",
          "jetCount",
          "bandSharpness",
          "bandWarp",
          "zonalVariation",
          "stormLatitude",
          "stormScale",
          "stormStrength",
          "stormCount",
          "stormColorShift",
          "haze",
          "atmosphereDepth",
          "polarVariation",
          "lightDirection",
          "stellarColor",
          "stellarIntensity",
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
  shader.setColor3("stellarColor", toColor3(recipe.star.color));
  shader.setFloat("stellarIntensity", recipe.star.intensity);

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
    shader.setColor3("waterColorShallow", toColor3(recipe.surface.waterColorShallow));
    shader.setColor3("emissiveColor", toColor3(recipe.surface.emissiveColor));

    if (profile.surfaceMicrodetail) {
      const detail = getSurfaceDetailTextures(scene);
      shader.setTexture("graniteNormalMap", detail.granite.normal);
      shader.setTexture("graniteRoughnessMap", detail.granite.roughness);
      shader.setTexture("basaltNormalMap", detail.basalt.normal);
      shader.setTexture("basaltRoughnessMap", detail.basalt.roughness);
      shader.setTexture("crackedNormalMap", detail.cracked.normal);
      shader.setTexture("crackedRoughnessMap", detail.cracked.roughness);
      shader.setTexture("regolithNormalMap", detail.regolith.normal);
      shader.setTexture("regolithRoughnessMap", detail.regolith.roughness);
      shader.setTexture("iceNormalMap", detail.ice.normal);
      shader.setTexture("iceRoughnessMap", detail.ice.roughness);
      // Full-resolution detail up close, fading out well before orbital distance so the surface
      // does not read as sandpaper from far away.
      shader.setFloat("detailFadeStart", recipe.radiusSceneUnits * 4);
      shader.setFloat("detailFadeEnd", recipe.radiusSceneUnits * 16);
    }
  } else if (recipe.renderer === "ice-giant") {
    shader.setFloat("bandScale", recipe.atmosphereBands.bandScale);
    shader.setFloat("bandContrast", recipe.bandDetail.bandContrast);
    shader.setFloat("bandSharpness", recipe.bandDetail.bandSharpness);
    shader.setFloat("bandTurbulence", recipe.bandDetail.bandTurbulence);
    shader.setFloat("bandWarp", recipe.bandDetail.bandWarp);
    shader.setFloat("zonalVariation", recipe.bandDetail.zonalVariation);
    shader.setFloat("stormStrength", recipe.atmosphereBands.stormStrength);
    shader.setFloat("stormLatitude", recipe.atmosphereBands.stormLatitude);
    shader.setFloat("stormCount", recipe.bandDetail.stormCount);
    shader.setFloat("stormColorShift", recipe.bandDetail.stormColorShift);
    shader.setFloat("haze", recipe.bandDetail.haze);
    shader.setFloat("atmosphereDepth", recipe.bandDetail.atmosphereDepth);
    shader.setFloat("polarGlow", recipe.atmosphereBands.polarGlow);
    shader.setColor3("deepColor", toColor3(recipe.atmosphereBands.deepColor));
    shader.setColor3("hazeColor", toColor3(recipe.atmosphereBands.hazeColor));
    shader.setColor3("lightColor", toColor3(recipe.atmosphereBands.lightColor));
  } else {
    shader.setFloat("turbulence", recipe.cloudBands.turbulence);
    shader.setFloat("contrast", recipe.cloudBands.contrast);
    shader.setFloat("jetCount", recipe.cloudBands.jetCount);
    shader.setFloat("bandSharpness", recipe.bandDetail.bandSharpness);
    shader.setFloat("bandWarp", recipe.bandDetail.bandWarp);
    shader.setFloat("zonalVariation", recipe.bandDetail.zonalVariation);
    shader.setFloat("stormLatitude", recipe.cloudBands.stormLatitude);
    shader.setFloat("stormScale", recipe.cloudBands.stormScale);
    shader.setFloat("stormStrength", recipe.cloudBands.stormStrength);
    shader.setFloat("stormCount", recipe.bandDetail.stormCount);
    shader.setFloat("stormColorShift", recipe.bandDetail.stormColorShift);
    shader.setFloat("haze", recipe.bandDetail.haze);
    shader.setFloat("atmosphereDepth", recipe.bandDetail.atmosphereDepth);
    shader.setFloat("polarVariation", recipe.bandDetail.polarVariation);
    shader.setColor3("deepColor", toColor3(recipe.cloudBands.deepColor));
    shader.setColor3("midColor", toColor3(recipe.cloudBands.midColor));
    shader.setColor3("lightColor", toColor3(recipe.cloudBands.lightColor));
    shader.setColor3("stormColor", toColor3(recipe.cloudBands.stormColor));
  }
  planet.material = shader;

  const ringRecipe = recipe.rings;
  const ringBuild = ringRecipe
    ? createRingSystem(
        scene,
        profile,
        recipe.radiusSceneUnits,
        ringRecipe,
        recipe.star,
        recipe.axialTilt,
      )
    : null;
  const ringSystem = ringBuild?.system ?? null;
  const ringMaterial = ringBuild?.material ?? null;
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
        defines: shaderDefines(profile),
        uniforms: [
          "world",
          "worldViewProjection",
          "cameraPosition",
          "time",
          "seed",
          "cloudCover",
          "cloudScale",
          "windDirection",
          "cloudColor",
          "lightDirection",
          "stellarColor",
        ],
        needAlphaBlending: true,
      },
    );
    cloudLayer.setFloat("seed", recipe.seed);
    cloudLayer.setFloat("cloudCover", recipe.surface.cloudCover);
    cloudLayer.setFloat("cloudScale", recipe.surface.cloudScale);
    cloudLayer.setVector2(
      "windDirection",
      new Vector2(Math.cos(recipe.surface.windDirection), Math.sin(recipe.surface.windDirection)),
    );
    cloudLayer.setColor3("cloudColor", toColor3(recipe.surface.cloudColor));
    cloudLayer.setVector3("lightDirection", LIGHT_DIRECTION);
    cloudLayer.setColor3("stellarColor", toColor3(recipe.star.color));
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
        "lightDirection",
        "stellarColor",
        "stellarIntensity",
        "atmosphereColor",
        "time",
        "activity",
        "density",
        "haze",
        "scatterStrength",
      ],
      needAlphaBlending: true,
    },
  );
  atmosphere.setColor3("atmosphereColor", toColor3(recipe.atmosphere.color));
  atmosphere.setVector3("lightDirection", LIGHT_DIRECTION);
  atmosphere.setColor3("stellarColor", toColor3(recipe.star.color));
  atmosphere.setFloat("stellarIntensity", recipe.star.intensity);
  atmosphere.setFloat("density", recipe.atmosphere.density);
  atmosphere.setFloat("haze", recipe.atmosphere.haze);
  atmosphere.setFloat("scatterStrength", recipe.atmosphere.scatterStrength);
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
    ringMaterial,
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

const terrainHash = (x: number, z: number, seed: number): number => {
  const value = Math.sin(x * 127.1 + z * 311.7 + seed * 0.000_071) * 43_758.545_312_3;
  return value - Math.floor(value);
};

const smoothTerrainNoise = (x: number, z: number, seed: number): number => {
  const cellX = Math.floor(x);
  const cellZ = Math.floor(z);
  const fractionX = x - cellX;
  const fractionZ = z - cellZ;
  const blendX = fractionX * fractionX * (3 - 2 * fractionX);
  const blendZ = fractionZ * fractionZ * (3 - 2 * fractionZ);
  const near =
    terrainHash(cellX, cellZ, seed) * (1 - blendX) + terrainHash(cellX + 1, cellZ, seed) * blendX;
  const far =
    terrainHash(cellX, cellZ + 1, seed) * (1 - blendX) +
    terrainHash(cellX + 1, cellZ + 1, seed) * blendX;
  return near * (1 - blendZ) + far * blendZ;
};

const terrainNoise = (x: number, z: number, seed: number): number => {
  const warpX = smoothTerrainNoise(x * 0.021, z * 0.021, seed ^ 0x51f2d3) - 0.5;
  const warpZ = smoothTerrainNoise(x * 0.021, z * 0.021, seed ^ 0xa1c8e7) - 0.5;
  x += warpX * 13;
  z += warpZ * 13;
  let frequency = 0.055;
  let amplitude = 1;
  let height = 0;
  let normalizer = 0;

  for (let octave = 0; octave < 5; octave += 1) {
    const sample = smoothTerrainNoise(x * frequency, z * frequency, seed + octave * 1_013);
    height += (sample * 2 - 1) * amplitude;
    normalizer += amplitude;
    frequency *= 2.08;
    amplitude *= 0.5;
  }

  const ridgeSample = smoothTerrainNoise(x * 0.092, z * 0.092, seed ^ 0x68bc21eb);
  const ridge = 1 - Math.abs(ridgeSample * 2 - 1);
  const broadMass = smoothTerrainNoise(x * 0.018, z * 0.018, seed ^ 0x218bc4) * 2 - 1;
  return (height / normalizer) * 1.32 + ridge ** 3 * 1.05 + broadMass * 0.72 - 0.43;
};

const craterField = (x: number, z: number, seed: number, density: number): number => {
  const cellSize = 7.5 + (1 - density) * 5;
  const cellX = Math.floor(x / cellSize);
  const cellZ = Math.floor(z / cellSize);
  let displacement = 0;

  for (let offsetX = -1; offsetX <= 1; offsetX += 1) {
    for (let offsetZ = -1; offsetZ <= 1; offsetZ += 1) {
      const sampleX = cellX + offsetX;
      const sampleZ = cellZ + offsetZ;
      const chance = terrainHash(sampleX, sampleZ, seed ^ 0xc4a73);
      if (chance > density * 0.58) continue;
      const radius = cellSize * (0.16 + terrainHash(sampleX, sampleZ, seed ^ 0x91da2) * 0.23);
      const centerX =
        (sampleX + 0.18 + terrainHash(sampleX, sampleZ, seed ^ 0x3bd17) * 0.64) * cellSize;
      const centerZ =
        (sampleZ + 0.18 + terrainHash(sampleX, sampleZ, seed ^ 0x7fe91) * 0.64) * cellSize;
      const distance = Math.hypot(x - centerX, z - centerZ) / radius;
      const bowl = Math.max(0, 1 - distance) ** 2 * -1.15;
      const rim = Math.max(0, 1 - Math.abs(distance - 1) / 0.22) * 0.42;
      displacement += bowl + rim;
    }
  }

  return displacement;
};

const surfaceTerrainHeight = (x: number, z: number, recipe: WorldRecipe): number => {
  const base = terrainNoise(x, z, recipe.seed);
  const horizonLift = Math.max(0, (z - 2) / 36) * 1.7;
  if (recipe.renderer === "gas-giant") {
    return base * 0.52 + Math.sin(z * 0.13 + recipe.seed) * 0.46 + horizonLift * 0.7;
  }
  if (recipe.renderer === "ice-giant") {
    return base * 0.68 + Math.sin(z * 0.1 + recipe.seed) * 0.3 + horizonLift * 0.82;
  }

  const distance = Math.hypot(x * 0.72, z * 0.25);
  const relief = 1.1 + Math.min(distance / 25, 1) * (1.5 + recipe.surface.elevation * 3.2);
  const terraceAmount = Math.min(0.42, Math.max(0, recipe.surface.roughness - 2) * 0.12);
  const terraced =
    Math.round(base * (5 + recipe.surface.roughness)) / (5 + recipe.surface.roughness);
  const crater = craterField(x, z, recipe.seed, recipe.surface.craterDensity);
  return (base * (1 - terraceAmount) + terraced * terraceAmount) * relief + crater + horizonLift;
};

/** Terrain height in world space, matching how the surface ground mesh is placed. */
const surfaceGroundHeight = (x: number, z: number, recipe: WorldRecipe): number =>
  SURFACE_GROUND_BASE_Y + surfaceTerrainHeight(x, z - SURFACE_GROUND_ORIGIN_Z, recipe);

const mixRgb = (from: Rgb, to: Rgb, amount: number): Color4 =>
  new Color4(
    from[0] + (to[0] - from[0]) * amount,
    from[1] + (to[1] - from[1]) * amount,
    from[2] + (to[2] - from[2]) * amount,
    1,
  );

const mixColor3 = (from: Rgb, to: Rgb, amount: number): Color3 => {
  const mixed = mixRgb(from, to, Math.min(1, Math.max(0, amount)));
  return new Color3(mixed.r, mixed.g, mixed.b);
};

const createSurfaceSky = (
  scene: Scene,
  root: TransformNode,
  recipe: WorldRecipe,
  profile: RenderQualityProfile,
): { material: ShaderMaterial; mesh: Mesh } => {
  Effect.ShadersStore.exoraSkyVertexShader = SKY_VERTEX_SHADER;
  Effect.ShadersStore.exoraSkyFragmentShader = SKY_FRAGMENT_SHADER;
  const atmosphere = recipe.atmosphere.color;
  const isGasGiant = recipe.renderer === "gas-giant";
  const isIceGiant = recipe.renderer === "ice-giant";
  const cloudiness = isGasGiant
    ? 0.94
    : isIceGiant
      ? 0.8
      : Math.max(0.08, recipe.surface.cloudCover);
  const density = isGasGiant
    ? 1
    : isIceGiant
      ? 0.9
      : Math.min(
          0.82,
          0.25 + recipe.surface.cloudCover * 0.72 + recipe.surface.lavaStrength * 0.22,
        );
  const zenithColor = isGasGiant
    ? mixColor3(atmosphere, recipe.cloudBands.deepColor, 0.62)
    : isIceGiant
      ? mixColor3(atmosphere, recipe.atmosphereBands.deepColor, 0.66)
      : mixColor3(atmosphere, [0.008, 0.014, 0.035], 0.64 - density * 0.24);
  const horizonColor = isGasGiant
    ? mixColor3(atmosphere, recipe.cloudBands.lightColor, 0.35)
    : isIceGiant
      ? mixColor3(atmosphere, recipe.atmosphereBands.hazeColor, 0.38)
      : mixColor3(atmosphere, recipe.surface.highColor, 0.14);
  const cloudColor = isGasGiant
    ? toColor3(recipe.cloudBands.lightColor)
    : isIceGiant
      ? toColor3(recipe.atmosphereBands.hazeColor)
      : toColor3(recipe.surface.cloudColor);
  const mesh = MeshBuilder.CreateSphere(
    "surfaceSky",
    { diameter: 180, segments: profile.tier === "desktop" ? 32 : 20 },
    scene,
  );
  mesh.parent = root;
  mesh.infiniteDistance = true;
  mesh.isPickable = false;
  mesh.renderingGroupId = 0;

  const material = new ShaderMaterial(
    "surfaceSkyMaterial",
    scene,
    { vertex: "exoraSky", fragment: "exoraSky" },
    {
      attributes: ["position"],
      defines: shaderDefines(profile),
      uniforms: [
        "worldViewProjection",
        "time",
        "seed",
        "density",
        "cloudiness",
        "starVisibility",
        "horizonColor",
        "zenithColor",
        "cloudColor",
      ],
    },
  );
  material.setFloat("time", 0);
  material.setFloat("seed", recipe.seed);
  material.setFloat("density", density);
  material.setFloat("cloudiness", cloudiness);
  material.setFloat("starVisibility", isGasGiant ? 0 : isIceGiant ? 0.02 : 1 - density);
  material.setColor3("horizonColor", horizonColor);
  material.setColor3("zenithColor", zenithColor);
  material.setColor3("cloudColor", cloudColor);
  material.backFaceCulling = false;
  material.disableDepthWrite = true;
  mesh.material = material;
  return { material, mesh };
};

const createSurfaceEnvironment = (
  scene: Scene,
  recipe: WorldRecipe,
  profile: RenderQualityProfile,
  onSelectHostStar?: () => void,
): { cloudLayers: Mesh[]; meshes: AbstractMesh[]; root: TransformNode; sky: ShaderMaterial } => {
  const root = new TransformNode("surfaceEnvironment", scene);
  const meshes: AbstractMesh[] = [];
  const random = createSeededRandom(recipe.seed ^ 0x9e3779b9);
  const subdivisions = profile.tier === "desktop" ? 96 : 52;
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
  ground.position.set(0, SURFACE_GROUND_BASE_Y, SURFACE_GROUND_ORIGIN_Z);
  ground.isPickable = false;
  meshes.push(ground);
  const surfaceSky = createSurfaceSky(scene, root, recipe, profile);
  meshes.push(surfaceSky.mesh);

  const positions = ground.getVerticesData("position");
  const indices = ground.getIndices();
  if (positions && indices) {
    const normals: number[] = [];
    for (let index = 0; index < positions.length; index += 3) {
      const x = positions[index] ?? 0;
      const z = positions[index + 2] ?? 0;
      positions[index + 1] = surfaceTerrainHeight(x, z, recipe);
    }

    VertexData.ComputeNormals(positions, indices, normals);
    const colors: number[] = [];
    for (let index = 0; index < positions.length; index += 3) {
      const height = positions[index + 1] ?? 0;
      const normalY = normals[index + 1] ?? 1;
      const altitude = Math.min(1, Math.max(0, 0.38 + height * 0.11));
      const exposedSlope = Math.min(1, Math.max(0, (0.88 - normalY) * 3.6));
      const biome = smoothTerrainNoise(
        (positions[index] ?? 0) * 0.075,
        (positions[index + 2] ?? 0) * 0.075,
        recipe.seed ^ 0x7193a,
      );
      const midColor = recipe.renderer === "rocky" ? recipe.surface.midColor : terrainHighColor;
      let color =
        altitude < 0.52
          ? mixRgb(terrainLowColor, midColor, altitude / 0.52)
          : mixRgb(midColor, terrainHighColor, (altitude - 0.52) / 0.48);
      if (recipe.renderer === "rocky") {
        const slopeColor = mixRgb(
          recipe.surface.midColor,
          recipe.surface.highColor,
          0.24 + biome * 0.2,
        );
        color = new Color4(
          color.r + (slopeColor.r - color.r) * exposedSlope,
          color.g + (slopeColor.g - color.g) * exposedSlope,
          color.b + (slopeColor.b - color.b) * exposedSlope,
          1,
        );
        if (recipe.surface.lavaStrength > 0 && height < -0.25) {
          const lava = Math.min(1, (-height - 0.25) * recipe.surface.lavaStrength * 1.8);
          color = mixRgb([color.r, color.g, color.b] as Rgb, recipe.surface.emissiveColor, lava);
        }
      }
      const shade = 0.62 + normalY * 0.38 - exposedSlope * 0.14 + (biome - 0.5) * 0.08;
      colors.push(color.r * shade, color.g * shade, color.b * shade, 1);
    }
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

  if (recipe.renderer === "rocky" && recipe.surface.waterLevel > 0) {
    const water = MeshBuilder.CreateGround(
      "surfaceWater",
      { width: 72, height: 82, subdivisions: 1 },
      scene,
    );
    water.parent = root;
    water.position.set(0, -1.42 + recipe.surface.waterLevel * 0.55, 18);
    water.isPickable = false;
    const waterMaterial = new StandardMaterial("surfaceWaterMaterial", scene);
    waterMaterial.diffuseColor = toColor3(recipe.surface.waterColor);
    waterMaterial.emissiveColor = toColor3(recipe.surface.waterColor).scale(0.34);
    waterMaterial.specularColor = mixColor3(recipe.surface.waterColor, [0.72, 0.9, 1], 0.62);
    waterMaterial.alpha = 0.88;
    waterMaterial.roughness = 0.18;
    waterMaterial.freeze();
    water.material = waterMaterial;
    meshes.push(water);
  }

  if (recipe.renderer === "rocky") {
    const rockMaterial = new StandardMaterial("surfaceRockMaterial", scene);
    const rockColor = mixRgb(terrainLowColor, terrainHighColor, 0.34);
    rockMaterial.diffuseColor = new Color3(rockColor.r, rockColor.g, rockColor.b);
    rockMaterial.emissiveColor = rockMaterial.diffuseColor.scale(0.06);
    rockMaterial.specularColor = new Color3(0.018, 0.02, 0.022);
    rockMaterial.freeze();
    const rockCount = profile.tier === "desktop" ? 62 : 28;
    for (let index = 0; index < rockCount; index += 1) {
      const rock = MeshBuilder.CreateSphere(
        `surfaceRock-${index}`,
        { diameter: 0.55 + random() * 1.25, segments: 5 },
        scene,
      );
      const x = -25 + random() * 50;
      const z = -2 + random() * 50;
      const terrainHeight = surfaceTerrainHeight(x, z, recipe);
      rock.position.set(x, -1.42 + terrainHeight, z + 18);
      const formation = random() > 0.9 ? 1.35 + random() * 0.9 : 1;
      rock.scaling.set(
        (0.42 + random() * 0.9) * formation,
        (0.48 + random() * 1.45) * formation,
        (0.42 + random() * 0.9) * formation,
      );
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

  const surfaceStarDiameter = 1.6 + recipe.star.apparentRadiusRadians * 30;
  const surfaceStar = MeshBuilder.CreateSphere(
    "surfaceHostStar",
    { diameter: surfaceStarDiameter, segments: profile.tier === "desktop" ? 28 : 18 },
    scene,
  );
  surfaceStar.parent = root;
  surfaceStar.position.set(-8, 3.8, 48);
  surfaceStar.isPickable = Boolean(onSelectHostStar);
  surfaceStar.applyFog = false;
  surfaceStar.renderingGroupId = 1;
  const surfaceStarMaterial = new StandardMaterial("surfaceHostStarMaterial", scene);
  surfaceStarMaterial.disableLighting = true;
  surfaceStarMaterial.diffuseColor = toColor3(recipe.star.color);
  surfaceStarMaterial.emissiveColor = toColor3(recipe.star.color).scale(recipe.star.intensity);
  surfaceStarMaterial.freeze();
  surfaceStar.material = surfaceStarMaterial;
  meshes.push(surfaceStar);

  const surfaceStarHalo = MeshBuilder.CreateSphere(
    "surfaceHostStarHalo",
    {
      diameter: surfaceStarDiameter * 1.65,
      segments: profile.tier === "desktop" ? 24 : 16,
    },
    scene,
  );
  surfaceStarHalo.parent = root;
  surfaceStarHalo.position.copyFrom(surfaceStar.position);
  surfaceStarHalo.isPickable = Boolean(onSelectHostStar);
  surfaceStarHalo.applyFog = false;
  surfaceStarHalo.renderingGroupId = 1;
  const surfaceStarHaloMaterial = new StandardMaterial("surfaceHostStarHaloMaterial", scene);
  surfaceStarHaloMaterial.disableLighting = true;
  surfaceStarHaloMaterial.emissiveColor = toColor3(recipe.star.color).scale(0.75);
  surfaceStarHaloMaterial.alpha = Math.min(0.24, 0.1 + recipe.star.intensity * 0.04);
  surfaceStarHaloMaterial.backFaceCulling = false;
  surfaceStarHaloMaterial.disableDepthWrite = true;
  surfaceStarHaloMaterial.freeze();
  surfaceStarHalo.material = surfaceStarHaloMaterial;
  meshes.push(surfaceStarHalo);

  if (onSelectHostStar) {
    for (const target of [surfaceStar, surfaceStarHalo]) {
      target.actionManager = new ActionManager(scene);
      target.actionManager.registerAction(
        new ExecuteCodeAction(ActionManager.OnPickTrigger, onSelectHostStar),
      );
    }
  }

  for (const mesh of meshes) {
    mesh.isVisible = false;
    mesh.setEnabled(false);
  }
  root.setEnabled(false);
  return { cloudLayers, meshes, root, sky: surfaceSky.material };
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
  onSelectHostStar,
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

  let isInXr = false;

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
  keyLight.diffuse = toColor3(recipe.star.color);
  keyLight.intensity = 2.2 * recipe.star.intensity;

  // Picking the host star tears this scene down, so an immersive session has to be handed over
  // to the star scene instead of silently dropping the wearer back into the flat page.
  const travelToHostStar = onSelectHostStar
    ? (): void => {
        if (isInXr) requestVrHandoff();
        onSelectHostStar();
      }
    : undefined;

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
    ringMaterial,
    ringSystem,
    shader,
  } = createPlanet(scene, recipe, profile);
  orbitalMeshes.push(...createHostStar(scene, recipe, profile, orbitalRoot, travelToHostStar));
  const surfaceEnvironment = createSurfaceEnvironment(scene, recipe, profile, travelToHostStar);

  let elapsedSeconds = 0;
  let qualitySampleSeconds = 0;
  let viewState: "entering" | "leaving" | "orbit" | "surface" = "orbit";
  let viewTransitionSeconds = 0;
  const pressedMovementKeys = new Set<string>();
  const orbitTarget = PLANET_POSITION.clone();
  const surfaceTarget = new Vector3(0, 0.1, 25);
  const movementForward = new Vector3();
  const movementRight = new Vector3();
  const movementDelta = new Vector3();

  const isTypingTarget = (target: EventTarget | null): boolean =>
    target instanceof HTMLInputElement ||
    target instanceof HTMLTextAreaElement ||
    (target instanceof HTMLElement && target.isContentEditable);

  const onMovementKeyDown = (event: KeyboardEvent): void => {
    if (isTypingTarget(event.target) || !["KeyW", "KeyA", "KeyS", "KeyD"].includes(event.code))
      return;
    event.preventDefault();
    pressedMovementKeys.add(event.code);
  };
  const onMovementKeyUp = (event: KeyboardEvent): void => {
    pressedMovementKeys.delete(event.code);
  };
  const clearMovementKeys = (): void => pressedMovementKeys.clear();
  window.addEventListener("keydown", onMovementKeyDown);
  window.addEventListener("keyup", onMovementKeyUp);
  window.addEventListener("blur", clearMovementKeys);

  const applyViewEnvironment = (surface: boolean): void => {
    setEnvironmentEnabled(orbitalRoot, orbitalMeshes, !surface);
    setEnvironmentEnabled(surfaceEnvironment.root, surfaceEnvironment.meshes, surface);
    scene.fogMode = surface ? Scene.FOGMODE_EXP2 : Scene.FOGMODE_NONE;
    scene.fogDensity = surface
      ? recipe.renderer === "gas-giant"
        ? 0.024
        : recipe.renderer === "ice-giant"
          ? 0.019
          : 0.008 + recipe.surface.cloudCover * 0.008 + recipe.surface.lavaStrength * 0.004
      : 0;
    scene.fogColor = toColor3(recipe.atmosphere.color).scale(
      recipe.renderer === "rocky" ? 0.38 : 0.52,
    );
    scene.clearColor = surface
      ? new Color4(
          recipe.atmosphere.color[0] * 0.18,
          recipe.atmosphere.color[1] * 0.18,
          recipe.atmosphere.color[2] * 0.18,
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

    const movementX =
      Number(pressedMovementKeys.has("KeyD")) - Number(pressedMovementKeys.has("KeyA"));
    const movementZ =
      Number(pressedMovementKeys.has("KeyW")) - Number(pressedMovementKeys.has("KeyS"));
    if (
      (movementX !== 0 || movementZ !== 0) &&
      viewState !== "entering" &&
      viewState !== "leaving"
    ) {
      const activeCamera = scene.activeCamera ?? camera;
      const forwardRay = activeCamera.getForwardRay();
      movementForward.set(forwardRay.direction.x, 0, forwardRay.direction.z);
      if (movementForward.lengthSquared() < 0.001) movementForward.set(0, 0, 1);
      movementForward.normalize();
      movementRight.set(movementForward.z, 0, -movementForward.x);
      movementDelta
        .copyFrom(movementForward)
        .scaleInPlace(movementZ)
        .addInPlace(movementRight.scale(movementX))
        .normalize()
        .scaleInPlace(DESKTOP_MOVE_SPEED * deltaSeconds);

      if (isInXr) {
        activeCamera.position.addInPlace(movementDelta);
      } else {
        camera.target.addInPlace(movementDelta);
        if (viewState === "surface") {
          camera.target.x = Math.min(30, Math.max(-30, camera.target.x));
          camera.target.z = Math.min(53, Math.max(-14, camera.target.z));
          surfaceTarget.copyFrom(camera.target);
        } else {
          orbitTarget.copyFrom(camera.target);
        }
      }
    }

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
    surfaceEnvironment.sky.setFloat("time", elapsedSeconds);
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
    ringMaterial?.setVector3("cameraPosition", activePosition);

    const rig = isInXr ? xrCamera() : null;
    if (rig) {
      // Thumbstick movement slides the rig across a flat plane, so the wearer has to be kept on
      // the terrain (or on the deck) instead of hovering above it or walking off the world.
      const eyeHeight = rig.realWorldHeight;
      if (viewState === "surface") {
        rig.position.x = clamp(rig.position.x, XR_SURFACE_BOUNDS.minX, XR_SURFACE_BOUNDS.maxX);
        rig.position.z = clamp(rig.position.z, XR_SURFACE_BOUNDS.minZ, XR_SURFACE_BOUNDS.maxZ);
        const groundY = surfaceGroundHeight(rig.position.x, rig.position.z, recipe);
        rig.position.y += groundY - (rig.position.y - eyeHeight);
      } else {
        const offsetX = rig.position.x - VIEWING_DECK_POSITION.x;
        const offsetZ = rig.position.z - VIEWING_DECK_POSITION.z;
        const distance = Math.hypot(offsetX, offsetZ);
        if (distance > XR_DECK_RADIUS) {
          const scale = XR_DECK_RADIUS / distance;
          rig.position.x = VIEWING_DECK_POSITION.x + offsetX * scale;
          rig.position.z = VIEWING_DECK_POSITION.z + offsetZ * scale;
        }
        rig.position.y += VIEWING_DECK_POSITION.y - (rig.position.y - eyeHeight);
      }
      xrMenu?.update(rig, deltaSeconds);
    }

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

  scene.onAfterRenderObservable.addOnce(onFirstFrame);
  engine.runRenderLoop(() => scene.render());

  const resize = (): void => engine.resize();
  window.addEventListener("resize", resize);

  onXrStatusChange("checking");
  let xr: WebXRDefaultExperience | null = null;
  let xrMenu: XrMenu | null = null;
  let isVrSupported = false;
  let disposed = false;

  const xrCamera = (): WebXRCamera | null => xr?.baseExperience.camera ?? null;

  let sessionFoveation = profile.xrFixedFoveation;

  /**
   * Trades peripheral sharpness for frame rate while the headset is on.
   *
   * Canvas resolution is fixed for the lifetime of a session, so foveation is the only lever
   * left; a Quest 2 that starts missing 72 Hz recovers by blurring further from the eye.
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
   * Moves the rig to the spot that makes sense for a view.
   *
   * On the very first pose Babylon has yet to add the wearer's real height to the rig, so the
   * position it expects is the floor. Every later move happens mid-session, where the camera
   * already sits at head height and the offset has to be added back by hand.
   */
  const placeXrCamera = (surface: boolean, initial: boolean): void => {
    const rig = xrCamera();
    if (!rig) return;
    const headOffset = initial ? 0 : rig.realWorldHeight;
    if (surface) {
      const groundY = surfaceGroundHeight(XR_SURFACE_STAND.x, XR_SURFACE_STAND.z, recipe);
      rig.position.set(XR_SURFACE_STAND.x, groundY + headOffset, XR_SURFACE_STAND.z);
      rig.setTarget(new Vector3(XR_SURFACE_STAND.x, groundY + 1.4, XR_SURFACE_STAND.z + 18));
    } else {
      rig.position.set(
        VIEWING_DECK_POSITION.x,
        VIEWING_DECK_POSITION.y + headOffset,
        VIEWING_DECK_POSITION.z,
      );
      rig.setTarget(PLANET_POSITION);
    }
  };

  /** Restores the desktop camera so leaving the headset lands on the view the wearer left in. */
  const syncDesktopCamera = (surface: boolean): void => {
    camera.lowerRadiusLimit = surface ? 7.5 : 10.5;
    camera.upperRadiusLimit = surface ? 18.4 : 25;
    camera.lowerBetaLimit = surface ? 1.02 : 0.58;
    camera.upperBetaLimit = surface ? 1.48 : Math.PI - 0.58;
    camera.target.copyFrom(surface ? surfaceTarget : orbitTarget);
    camera.radius = surface ? 12.8 : 17.2;
    camera.beta = surface ? 1.23 : Math.PI / 2.13;
    camera.alpha = -Math.PI / 2;
    camera.attachControl(canvas, true);
  };

  const buildXrMenuItems = (): XrMenuItem[] => {
    const surface = viewState === "surface";
    const items: XrMenuItem[] = [
      surface
        ? {
            id: "orbit",
            label: "Return to orbit",
            detail: "See the whole world again",
            onSelect: () => applyXrView(false, false),
          }
        : {
            id: "surface",
            label: "Descend to the surface",
            detail: "Walk the terrain",
            onSelect: () => applyXrView(true, false),
          },
      {
        id: "recentre",
        label: "Recentre me",
        detail: surface ? "Face the horizon" : "Face the planet",
        onSelect: () => placeXrCamera(viewState === "surface", false),
      },
    ];

    if (travelToHostStar) {
      items.push({
        id: "host-star",
        label: "Travel to the host star",
        detail: "Rebuilds the immersive session",
        onSelect: travelToHostStar,
      });
    }

    items.push({
      id: "exit",
      label: "Exit immersive VR",
      detail: "Back to the browser view",
      onSelect: () => void xr?.baseExperience.exitXRAsync(),
    });
    return items;
  };

  /** Switches view from inside the headset, where the orbit camera transition cannot be used. */
  const applyXrView = (surface: boolean, initial: boolean): void => {
    viewState = surface ? "surface" : "orbit";
    viewTransitionSeconds = 0;
    applyViewEnvironment(surface);
    setViewingDeckVisible(viewingDeck, !surface);
    placeXrCamera(surface, initial);
    xrMenu?.setTitle(surface ? "Surface excursion" : "Orbital deck");
    xrMenu?.setItems(buildXrMenuItems());
    onViewModeChange(surface ? "surface" : "orbit");
  };

  void WebXRDefaultExperience.CreateAsync(scene, {
    disableDefaultUI: true,
    disableNearInteraction: true,
    disableTeleportation: true,
    floorMeshes: [viewingDeck.floor],
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
      if (disposed) {
        createdXr.dispose();
        return;
      }

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
      xrMenu = createXrMenu(scene, viewState === "surface" ? "Surface excursion" : "Orbital deck");
      xrMenu.setItems(buildXrMenuItems());

      // The rig lands wherever the headset happens to face, so the view has to be aimed at the
      // subject; otherwise the session opens on empty starfield and looks broken.
      createdXr.baseExperience.onInitialXRPoseSetObservable.add(() => {
        applyXrView(viewState === "surface", true);
      });

      createdXr.baseExperience.onStateChangedObservable.add((state) => {
        if (disposed) return;
        if (state === WebXRState.ENTERING_XR) {
          setViewingDeckVisible(viewingDeck, viewState !== "surface");
          onXrStatusChange("entering");
        }
        if (state === WebXRState.IN_XR) {
          isInXr = true;
          sessionFoveation = profile.xrFixedFoveation;
          if (createdXr.baseExperience.sessionManager.isFixedFoveationSupported) {
            createdXr.baseExperience.sessionManager.fixedFoveation = sessionFoveation;
          }
          xrMenu?.setItems(buildXrMenuItems());
          xrMenu?.setVisible(true);
          onXrStatusChange("in-xr");
        }
        if (state === WebXRState.NOT_IN_XR) {
          isInXr = false;
          xrMenu?.setVisible(false);
          setViewingDeckVisible(viewingDeck, false);
          syncDesktopCamera(viewState === "surface");
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
      // Babylon appends the reference space and every enabled optional feature (including
      // hand tracking) to the session request, so nothing has to be listed by hand here.
      await xr.baseExperience.enterXRAsync("immersive-vr", "local-floor", xr.renderTarget);
    },
    dispose: () => {
      if (disposed) return;
      disposed = true;
      window.removeEventListener("resize", resize);
      window.removeEventListener("keydown", onMovementKeyDown);
      window.removeEventListener("keyup", onMovementKeyUp);
      window.removeEventListener("blur", clearMovementKeys);
      xrMenu?.dispose();
      xrMenu = null;
      xr?.dispose();
      engine.stopRenderLoop();
      scene.dispose();
      engine.dispose();
    },
  };
};
