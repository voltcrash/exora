import { ArcRotateCamera } from "@babylonjs/core/Cameras/arcRotateCamera.js";
import { ActionManager } from "@babylonjs/core/Actions/actionManager.js";
import { ExecuteCodeAction } from "@babylonjs/core/Actions/directActions.js";
import "@babylonjs/core/Culling/ray.js";
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
import "@babylonjs/core/XR/features/WebXRControllerMovement.js";
import "@babylonjs/core/XR/features/WebXRControllerPointerSelection.js";
import "@babylonjs/core/XR/features/WebXRControllerTeleportation.js";
import "@babylonjs/core/XR/features/WebXRHandTracking.js";
import { WebXRFeatureName } from "@babylonjs/core/XR/webXRFeaturesManager.js";
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
const DESKTOP_MOVE_SPEED = 5.2;
const XR_MOVE_SPEED = 2.2;

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
  for (int octave = 0; octave < 5; octave++) {
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
uniform float stormLatitude;
uniform float stormScale;
uniform float stormStrength;
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
  for (int octave = 0; octave < 6; octave++) {
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
  float bandPhase = latitude * jetCount * 1.42 + (broadNoise - 0.5) * 5.4 + (warpNoise - 0.5) * 2.2;
  float bandWave = 0.5 + sin(bandPhase) * 0.34 + sin(bandPhase * 0.51 + 1.8) * 0.12;
  float bandMix = smoothstep(0.12, 0.88, bandWave);
  bandMix = mix(0.5, bandMix, contrast);

  float stormLongitude = sin(seed * 0.00013) * 2.4;
  vec3 stormCenter = vec3(
    cos(stormLatitude) * cos(stormLongitude),
    sin(stormLatitude),
    cos(stormLatitude) * sin(stormLongitude)
  );
  vec3 stormEast = normalize(cross(vec3(0.0, 1.0, 0.0), stormCenter));
  vec3 stormNorth = normalize(cross(stormCenter, stormEast));
  vec2 stormUv = vec2(dot(surface, stormEast), dot(surface, stormNorth));
  float stormDistance = length(stormUv * vec2(stormScale * 0.7, stormScale * 1.65));
  float stormCore = (1.0 - smoothstep(0.38, 1.0, stormDistance)) * smoothstep(-0.2, 0.72, dot(surface, stormCenter));
  float stormAngle = atan(stormUv.y, stormUv.x);
  float stormSpiral = sin(stormAngle * 5.0 - stormDistance * 19.0 + flow * 2.0 + warpNoise * 2.0);
  float storms = stormCore * (0.7 + stormSpiral * 0.18 + filamentNoise * 0.12) * stormStrength;
  float cells = smoothstep(0.66, 0.9, filamentNoise) * (0.35 + 0.65 * abs(cos(bandPhase)));

  vec3 cloudColor = mix(deepColor, midColor, clamp(0.22 + broadNoise * 0.62 + warpNoise * 0.12, 0.0, 1.0));
  cloudColor = mix(cloudColor, lightColor, clamp(bandMix * 0.82 + filamentNoise * 0.12 + cells * 0.16, 0.0, 1.0));
  cloudColor *= 0.92 + (filamentNoise - 0.5) * 0.12;
  cloudColor = mix(cloudColor, stormColor, clamp(storms, 0.0, 0.9));

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
uniform float stormStrength;
uniform float stormLatitude;
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
  for (int octave = 0; octave < 5; octave++) {
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
  float haze = fbm(flowingSurface * 2.6 + vec3(3.7, 11.9, 6.2));
  float detail = fbm(
    vec3(flowingSurface.x * 6.0, flowingSurface.y * 15.0, flowingSurface.z * 6.0) + vec3(haze * 2.0)
  );
  float bandPhase = latitude * bandScale * 1.65 + (haze - 0.5) * 3.5 + (detail - 0.5) * 0.9;
  float bands = 0.5 + sin(bandPhase) * 0.25 + sin(bandPhase * 0.47 + 2.2) * 0.08;
  bands = smoothstep(0.12, 0.88, bands);
  float stormNoise = fbm(rotateY(surface, -flow * 1.8) * 6.5 + vec3(12.4, 4.2, 8.7));
  float latitudeMask = 1.0 - smoothstep(0.08, 0.48, abs(latitude - stormLatitude));
  float storms = smoothstep(0.64, 0.9, stormNoise) * stormStrength * latitudeMask;
  float pole = pow(smoothstep(0.55, 1.3, abs(latitude)), 2.0) * polarGlow;

  vec3 atmosphereColor = mix(deepColor, hazeColor, clamp(0.3 + haze * 0.5 + detail * 0.08, 0.0, 1.0));
  atmosphereColor = mix(atmosphereColor, lightColor, bands * 0.2 + storms + detail * 0.05);

  float diffuse = max(dot(normal, lightDirection), 0.0);
  float wrappedLight = 0.22 + diffuse * 0.9;
  vec3 viewDirection = normalize(cameraPosition - vWorldPosition);
  float rim = pow(1.0 - max(dot(normal, viewDirection), 0.0), 2.5);
  vec3 finalColor = atmosphereColor * wrappedLight * mix(vec3(1.0), stellarColor, diffuse * 0.32) * stellarIntensity + hazeColor * rim * 0.46;
  finalColor += lightColor * pole * (0.14 + detail * 0.11);
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
uniform vec3 emissiveColor;

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
  for (int octave = 0; octave < 5; octave++) {
    value += amplitude * noise(point);
    point = point.yzx * 2.04 + vec3(8.7, 13.1, 5.9);
    amplitude *= 0.48;
  }
  return value;
}

float ridgedFbm(vec3 point) {
  float value = 0.0;
  float amplitude = 0.54;
  for (int octave = 0; octave < 4; octave++) {
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
  float fractureField = abs(
    ridgedFbm(surface * 7.8 + vec3(2.4, 18.1, 9.7)) -
    ridgedFbm(surface * 7.8 + vec3(9.6, 3.2, 21.4))
  );
  float fractures = (1.0 - smoothstep(0.012, 0.085, fractureField)) * lavaStrength;
  float surfaceHeight = macroDetail * 0.32 + erosion * 0.1 + mineralDetail * 0.025 - crater * 0.04 + craterRim * 0.025;
  vec3 normal = perturbNormal(vWorldPosition, baseNormal, surfaceHeight);

  vec3 rockColor = mix(lowColor, midColor, smoothstep(0.28, 0.62, vHeight));
  rockColor = mix(rockColor, highColor, smoothstep(0.62, 0.9, vHeight));
  vec3 mineralTint = mix(lowColor, highColor, clamp(mineralDetail * 0.88 + erosion * 0.18, 0.0, 1.0));
  rockColor = mix(rockColor, mineralTint, 0.18 + erosion * 0.12);
  rockColor *= 0.94 + (microDetail - 0.5) * 0.06;
  rockColor = mix(rockColor, highColor * 1.08, craterRim * 0.36);
  rockColor = mix(rockColor, lowColor * 0.38, crater * 0.68);

  float coastline = vHeight + (macroDetail - 0.5) * 0.025;
  float waterMask = waterLevel > 0.0 ? 1.0 - smoothstep(waterLevel - 0.012, waterLevel + 0.016, coastline) : 0.0;
  normal = normalize(mix(normal, baseNormal, waterMask * 0.94));
  vec3 surfaceColor = mix(rockColor, waterColor, waterMask * 0.92);
  float polarBoundary = abs(surface.y) + (macroDetail - 0.5) * 0.16 + (mineralDetail - 0.5) * 0.04;
  float polarMask = smoothstep(0.58, 0.88, polarBoundary) * iceCapStrength;
  surfaceColor = mix(surfaceColor, vec3(0.72, 0.84, 0.88), polarMask * (0.62 + microDetail * 0.16));
  float diffuse = max(dot(normal, lightDirection), 0.0);
  float wrappedLight = 0.16 + diffuse * 0.98;
  vec3 viewDirection = normalize(cameraPosition - vWorldPosition);
  vec3 halfDirection = normalize(lightDirection + viewDirection);
  float waterSpecular = pow(max(dot(normal, halfDirection), 0.0), 46.0) * waterMask;
  float rim = pow(1.0 - max(dot(normal, viewDirection), 0.0), 3.0);

  vec3 finalColor = surfaceColor * wrappedLight * mix(vec3(1.0), stellarColor, diffuse * 0.38) * stellarIntensity + vec3(0.34, 0.58, 0.72) * waterSpecular * 0.45;
  finalColor += highColor * rim * 0.08;
  finalColor += emissiveColor * fractures * (0.72 + 0.28 * sin(time * 0.7 + microDetail * 8.0));
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
          "stellarColor",
          "stellarIntensity",
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
          "stellarColor",
        ],
        needAlphaBlending: true,
      },
    );
    cloudLayer.setFloat("seed", recipe.seed);
    cloudLayer.setFloat("cloudCover", recipe.surface.cloudCover);
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
  ground.position.set(0, -1.6, 18);
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
  orbitalMeshes.push(...createHostStar(scene, recipe, profile, orbitalRoot, onSelectHostStar));
  const surfaceEnvironment = createSurfaceEnvironment(scene, recipe, profile, onSelectHostStar);

  let elapsedSeconds = 0;
  let qualitySampleSeconds = 0;
  let isInXr = false;
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
    disableTeleportation: true,
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
      window.removeEventListener("keydown", onMovementKeyDown);
      window.removeEventListener("keyup", onMovementKeyUp);
      window.removeEventListener("blur", clearMovementKeys);
      xr?.dispose();
      engine.stopRenderLoop();
      scene.dispose();
      engine.dispose();
    },
  };
};
