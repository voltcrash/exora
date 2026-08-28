import { Color3 } from "@babylonjs/core/Maths/math.color.js";
import { Vector2, Vector3 } from "@babylonjs/core/Maths/math.vector.js";
import { Effect } from "@babylonjs/core/Materials/effect.js";
import { ShaderMaterial } from "@babylonjs/core/Materials/shaderMaterial.js";
import { Mesh } from "@babylonjs/core/Meshes/mesh.js";
import { VertexData } from "@babylonjs/core/Meshes/mesh.vertexData.js";
import type { TransformNode } from "@babylonjs/core/Meshes/transformNode.js";
import type { Scene } from "@babylonjs/core/scene.js";
import type { Rgb } from "@exora/worldgen";
import type { RenderQualityProfile } from "./render-quality.ts";
import type { SurfaceGeology } from "./surface-geology.ts";
import { createTerrainField, createTerrainSample } from "./surface-terrain.ts";
import { getSurfaceDetailTextures } from "./texture-cache.ts";
import {
  SURFACE_GRID_RESOLUTION,
  SURFACE_HALF_EXTENT,
  bakeSurfaceOcclusion,
  bakeSurfaceSunVisibility,
  bandlimitSurfaceFarField,
  gradeSurfaceAxis,
  inverseSurfaceGradeAxis,
} from "./surface-vista-baking.ts";

const GROUND_VERTEX_SHADER = `
precision highp float;

attribute vec3 position;
attribute vec3 normal;
attribute vec4 color;
attribute vec2 uv;

uniform mat4 world;
uniform mat4 worldViewProjection;

varying vec3 vWorldPosition;
varying vec3 vWorldNormal;
varying vec4 vMaterial;
varying vec2 vShade;

void main(void) {
  vec4 worldPosition = world * vec4(position, 1.0);
  vWorldPosition = worldPosition.xyz;
  vWorldNormal = normalize(mat3(world) * normal);
  vMaterial = color;
  vShade = uv;
  gl_Position = worldViewProjection * vec4(position, 1.0);
}
`;

const GROUND_FRAGMENT_SHADER = `
precision highp float;

varying vec3 vWorldPosition;
varying vec3 vWorldNormal;
varying vec4 vMaterial;
varying vec2 vShade;

uniform vec3 cameraPosition;
uniform vec3 sunDirection;
uniform vec3 sunColor;
uniform float sunIntensity;
uniform vec3 skyZenithColor;
uniform vec3 skyHorizonColor;
uniform vec3 rampA;
uniform vec3 rampB;
uniform vec3 rampC;
uniform vec3 rampD;
uniform vec3 rampE;
uniform vec3 regolithColor;
uniform vec3 bedrockColor;
uniform vec3 frostColor;
uniform vec3 lavaColor;
uniform vec3 groundAlbedo;
uniform float groundLow;
uniform float groundSpan;
uniform float hazeDensity;
uniform float ambientStrength;
uniform float exposure;
uniform float strataStrength;
uniform float strataSpacing;
uniform vec2 windAxis;
uniform float windStreaks;
uniform float horizonStart;
uniform float horizonEnd;
uniform vec3 patchOrigin;
uniform float time;
uniform float seed;

#ifdef GROUND_DETAIL
uniform sampler2D primaryNormalMap;
uniform sampler2D primaryRoughnessMap;
uniform sampler2D secondaryNormalMap;
uniform float fineDetailScale;
uniform float coarseDetailScale;
#endif

#ifdef GROUND_CHEMISTRY
uniform sampler2D chemistryColorMap;
uniform float chemistryScale;
uniform float chemistryStrength;
#endif

float hash21(vec2 point) {
  vec3 p = fract(vec3(point.xyx) * 0.1031 + seed * 0.000013);
  p += dot(p, p.yzx + 33.33);
  return fract((p.x + p.y) * p.z);
}

float valueNoise(vec2 point) {
  vec2 index = floor(point);
  vec2 fraction = fract(point);
  fraction = fraction * fraction * (3.0 - 2.0 * fraction);
  return mix(
    mix(hash21(index), hash21(index + vec2(1.0, 0.0)), fraction.x),
    mix(hash21(index + vec2(0.0, 1.0)), hash21(index + vec2(1.0, 1.0)), fraction.x),
    fraction.y
  );
}

float fbm2(vec2 point) {
  float value = 0.0;
  float amplitude = 0.55;
  for (int octave = 0; octave < FBM_OCTAVES; octave++) {
    value += valueNoise(point) * amplitude;
    point = point * 2.07 + vec2(11.3, 7.9);
    amplitude *= 0.47;
  }
  return value;
}

vec3 sampleRamp(float t) {
  float position = clamp(t, 0.0, 1.0) * 4.0;
  vec3 result = mix(rampA, rampB, clamp(position, 0.0, 1.0));
  result = mix(result, rampC, clamp(position - 1.0, 0.0, 1.0));
  result = mix(result, rampD, clamp(position - 2.0, 0.0, 1.0));
  return mix(result, rampE, clamp(position - 3.0, 0.0, 1.0));
}

#if defined(GROUND_DETAIL) || defined(GROUND_CHEMISTRY)
vec3 triplanarBlend(vec3 surfaceNormal) {
  vec3 blend = pow(abs(surfaceNormal), vec3(4.0));
  return blend / max(blend.x + blend.y + blend.z, 0.0001);
}
#endif

#ifdef GROUND_DETAIL
vec3 triplanarNormal(sampler2D tex, vec3 point, vec3 blend, vec3 surfaceNormal) {
  vec3 nx = texture2D(tex, point.yz).xyz * 2.0 - 1.0;
  vec3 ny = texture2D(tex, point.xz).xyz * 2.0 - 1.0;
  vec3 nz = texture2D(tex, point.xy).xyz * 2.0 - 1.0;
  nx = vec3(nx.xy + surfaceNormal.zy, abs(nx.z) * surfaceNormal.x);
  ny = vec3(ny.xy + surfaceNormal.xz, abs(ny.z) * surfaceNormal.y);
  nz = vec3(nz.xy + surfaceNormal.xy, abs(nz.z) * surfaceNormal.z);
  return normalize(nx.zyx * blend.x + ny.xzy * blend.y + nz.xyz * blend.z);
}

float triplanarScalar(sampler2D tex, vec3 point, vec3 blend) {
  return texture2D(tex, point.yz).r * blend.x
    + texture2D(tex, point.zx).r * blend.y
    + texture2D(tex, point.xy).r * blend.z;
}
#endif

#ifdef GROUND_CHEMISTRY
vec3 triplanarColor(sampler2D tex, vec3 point, vec3 blend) {
  return texture2D(tex, point.yz).rgb * blend.x
    + texture2D(tex, point.zx).rgb * blend.y
    + texture2D(tex, point.xy).rgb * blend.z;
}
#endif

void main(void) {
  vec3 baseNormal = normalize(vWorldNormal);
  vec3 toCamera = cameraPosition - vWorldPosition;
  float viewDistance = length(toCamera);
  vec3 viewDirection = toCamera / max(viewDistance, 0.0001);
  vec2 ground = vWorldPosition.xz - patchOrigin.xz;

  float altitude = clamp((vWorldPosition.y - groundLow) / max(groundSpan, 0.001), 0.0, 1.0);
  float slope = 1.0 - clamp(baseNormal.y, 0.0, 1.0);
  float fines = vMaterial.r;
  float scarp = vMaterial.g;
  float frost = vMaterial.b;
  float molten = vMaterial.a;

  float macro = fbm2(ground * 0.028) - 0.5;
  float grain = fbm2(ground * 0.34) - 0.5;

  vec3 shadingNormal = baseNormal;
  float roughness = 0.78;

#if defined(GROUND_DETAIL) || defined(GROUND_CHEMISTRY)
  vec3 blend = triplanarBlend(baseNormal);
#endif

#ifdef GROUND_DETAIL
  float fineFade = 1.0 - smoothstep(9.0, 46.0, viewDistance);
  vec3 fineNormal = triplanarNormal(primaryNormalMap, vWorldPosition * fineDetailScale, blend, baseNormal);
  vec3 coarseNormal = triplanarNormal(secondaryNormalMap, vWorldPosition * coarseDetailScale, blend, baseNormal);
  float rockExposure = clamp(slope * 1.4 + scarp * 1.1 - fines * 0.7, 0.0, 1.0);
  vec3 detailNormal = normalize(mix(coarseNormal, fineNormal, fineFade * 0.72));
  shadingNormal = normalize(mix(baseNormal, detailNormal, 0.62 * (0.45 + rockExposure * 0.55)));
  roughness = mix(
    0.92,
    triplanarScalar(primaryRoughnessMap, vWorldPosition * coarseDetailScale, blend),
    0.85
  );
  roughness = clamp(roughness * (1.0 - frost * 0.45) - molten * 0.3, 0.05, 1.0);
#else
  float rockExposure = clamp(slope * 1.4 + scarp * 1.1 - fines * 0.7, 0.0, 1.0);
#endif

  vec3 albedo = sampleRamp(0.25 + altitude * 0.55 + macro * 0.5 + grain * 0.1);
  albedo = mix(albedo, bedrockColor * (1.05 + grain * 0.6), clamp(rockExposure * 0.62, 0.0, 1.0));
  float mantle = clamp(fines * (1.0 - slope * 1.7), 0.0, 1.0);
  albedo = mix(albedo, regolithColor * (0.86 + grain * 0.42 + macro * 0.2), mantle * 0.72);

#ifndef CLOUD_DECK
  float bedding = fract((vWorldPosition.y + macro * strataSpacing * 0.7) / max(strataSpacing, 0.05));
  float bed = smoothstep(0.44, 0.5, abs(bedding - 0.5));
  albedo *= 1.0 + (bed - 0.35) * strataStrength * rockExposure * 0.55;

  vec2 downwind = vec2(dot(ground, windAxis), dot(ground, vec2(-windAxis.y, windAxis.x)));
  float streak = smoothstep(0.52, 0.78, fbm2(vec2(downwind.x * 0.012, downwind.y * 0.24)));
  albedo = mix(albedo, regolithColor * 1.22, streak * windStreaks * 0.32 * (1.0 - slope * 1.6));
#endif

#ifdef GROUND_CHEMISTRY
  vec3 chemistry = triplanarColor(chemistryColorMap, vWorldPosition * chemistryScale, blend);
  float chemistryLuminance = max(dot(chemistry, vec3(0.2126, 0.7152, 0.0722)), 0.08);
  vec3 relative = clamp(chemistry / chemistryLuminance, vec3(0.5), vec3(1.7));
  albedo = mix(albedo, albedo * relative * (0.8 + chemistryLuminance * 0.32), chemistryStrength);
#endif

  float frostMask = clamp(frost * smoothstep(0.5, 0.92, baseNormal.y) * (0.6 + vShade.x * 0.6), 0.0, 1.0);
  albedo = mix(albedo, frostColor * (0.9 + grain * 0.2), frostMask);

  float occlusion = clamp(vShade.x, 0.0, 1.0);
  float sunVisibility = clamp(vShade.y, 0.0, 1.0);
  float lambert = max(dot(shadingNormal, sunDirection), 0.0);
  float backscatter = pow(clamp(dot(shadingNormal, sunDirection) * 0.5 + 0.5, 0.0, 1.0), 2.2);
  float direct = mix(lambert, backscatter, 0.16) * sunVisibility;
  vec3 sunlight = sunColor * sunIntensity * direct * 2.4;

  float skyFacing = clamp(shadingNormal.y * 0.5 + 0.5, 0.0, 1.0);
  vec3 ambient = mix(skyHorizonColor, skyZenithColor, skyFacing) * ambientStrength * occlusion;
  vec3 bounce = albedo * groundAlbedo * sunColor * sunIntensity * occlusion
    * (0.34 * clamp(0.5 - shadingNormal.y * 0.5, 0.0, 1.0) + 0.2);

  vec3 halfVector = normalize(sunDirection + viewDirection);
  float specularPower = mix(3.0, 120.0, 1.0 - roughness);
  float specular = pow(max(dot(shadingNormal, halfVector), 0.0), specularPower)
    * (1.0 - roughness) * sunVisibility;
  float specularStrength = 0.035 + frostMask * 0.45;

#ifdef CLOUD_DECK
  float through = pow(clamp(dot(shadingNormal, sunDirection) * 0.5 + 0.5, 0.0, 1.0), 1.3);
  vec3 color = albedo * (sunColor * sunIntensity * mix(through, direct, 0.4) * 0.95 + ambient * 1.5);
  color += albedo * sunColor * pow(max(dot(-viewDirection, sunDirection), 0.0), 4.0) * 0.22;
#else
  vec3 color = albedo * (sunlight + ambient) + bounce;
  color += sunColor * sunIntensity * specular * specularStrength;
#endif
#ifndef CLOUD_DECK
  float grazing = pow(1.0 - clamp(dot(shadingNormal, viewDirection), 0.0, 1.0), 4.0);
  color += mix(skyHorizonColor, sunColor, 0.5) * grazing * 0.028 * (sunVisibility * 0.7 + 0.3);
#endif

  float glow = molten * (0.72 + 0.2 * sin(time * 0.8 + macro * 14.0) + 0.14 * sin(time * 2.3 + grain * 9.0));
  color += lavaColor * glow;

  color *= exposure;

  float optical = 1.0 - exp(-viewDistance * pow(hazeDensity, 1.6) * 0.031);
  float sunGlow = pow(max(dot(-viewDirection, sunDirection), 0.0), 6.0);
  vec3 airColor = mix(skyHorizonColor, skyZenithColor, clamp(viewDirection.y * 1.4, 0.0, 1.0))
    + sunColor * sunGlow * hazeDensity * 0.5;
  color = mix(color, airColor, clamp(optical, 0.0, 0.96));

  float rim = max(abs(ground.x), abs(ground.y));
  float dissolve = smoothstep(horizonStart, horizonEnd, rim);
  color = mix(color, skyHorizonColor * (1.0 + hazeDensity * 0.32), dissolve);

  float dither = (hash21(gl_FragCoord.xy) - 0.5) / 255.0;
  gl_FragColor = vec4(color + dither, 1.0);
}
`;

const LIQUID_VERTEX_SHADER = `
precision highp float;

attribute vec3 position;
attribute vec4 color;
attribute vec2 uv;

uniform mat4 world;
uniform mat4 worldViewProjection;

varying vec3 vWorldPosition;
varying vec2 vDepth;
varying vec2 vShade;

void main(void) {
  vec4 worldPosition = world * vec4(position, 1.0);
  vWorldPosition = worldPosition.xyz;
  vDepth = color.xy;
  vShade = uv;
  gl_Position = worldViewProjection * vec4(position, 1.0);
}
`;

const LIQUID_FRAGMENT_SHADER = `
precision highp float;

varying vec3 vWorldPosition;
varying vec2 vDepth;
varying vec2 vShade;

uniform vec3 cameraPosition;
uniform vec3 sunDirection;
uniform vec3 sunColor;
uniform float sunIntensity;
uniform vec3 skyZenithColor;
uniform vec3 skyHorizonColor;
uniform vec3 shallowColor;
uniform vec3 deepColor;
uniform float hazeDensity;
uniform float exposure;
uniform float waveHeight;
uniform float time;
uniform float seed;
uniform float horizonStart;
uniform float horizonEnd;
uniform vec3 patchOrigin;

float hash21(vec2 point) {
  vec3 p = fract(vec3(point.xyx) * 0.1031 + seed * 0.000013);
  p += dot(p, p.yzx + 33.33);
  return fract((p.x + p.y) * p.z);
}

float valueNoise(vec2 point) {
  vec2 index = floor(point);
  vec2 fraction = fract(point);
  fraction = fraction * fraction * (3.0 - 2.0 * fraction);
  return mix(
    mix(hash21(index), hash21(index + vec2(1.0, 0.0)), fraction.x),
    mix(hash21(index + vec2(0.0, 1.0)), hash21(index + vec2(1.0, 1.0)), fraction.x),
    fraction.y
  );
}

vec2 waveGradient(vec2 point, float scale, vec2 drift) {
  vec2 p = point * scale + drift * time;
  float epsilon = 0.35;
  float center = valueNoise(p);
  return vec2(valueNoise(p + vec2(epsilon, 0.0)) - center, valueNoise(p + vec2(0.0, epsilon)) - center);
}

void main(void) {
  float depth = vDepth.x;
  float shore = vDepth.y;
  if (depth <= 0.002) discard;

  vec2 ground = vWorldPosition.xz - patchOrigin.xz;
  vec3 toCamera = cameraPosition - vWorldPosition;
  float viewDistance = length(toCamera);
  vec3 viewDirection = toCamera / max(viewDistance, 0.0001);

  vec2 slope = waveGradient(ground, 0.19, vec2(0.09, 0.05)) * 1.9 * min(1.0, depth * 2.4)
    + waveGradient(ground, 0.62, vec2(-0.14, 0.11)) * 0.9
    + waveGradient(ground, 2.1, vec2(0.31, -0.24)) * 0.35;
  vec3 normal = normalize(vec3(-slope.x, 1.0 / max(waveHeight, 0.02), -slope.y));

  float facing = clamp(dot(normal, viewDirection), 0.0, 1.0);
  float fresnel = 0.02 + 0.98 * pow(1.0 - facing, 5.0);

  vec3 reflectedDirection = reflect(-viewDirection, normal);
  vec3 reflected = mix(skyHorizonColor, skyZenithColor, clamp(reflectedDirection.y * 1.6, 0.0, 1.0));

  vec3 body = mix(shallowColor, deepColor, clamp(depth * 2.6, 0.0, 1.0));
  float scatter = (1.0 - clamp(depth * 3.2, 0.0, 1.0)) * max(dot(normal, sunDirection), 0.0);
  body += shallowColor * scatter * 0.4;

  float sunVisibility = clamp(vShade.y, 0.0, 1.0);
  vec3 halfVector = normalize(sunDirection + viewDirection);
  float glint = pow(max(dot(normal, halfVector), 0.0), 420.0) * sunVisibility;

  vec3 color = mix(body, reflected, fresnel);
  color += sunColor * sunIntensity * glint * 1.6;
  color = mix(color, shallowColor * 1.5 + sunColor * 0.1, shore * 0.32);
  color *= exposure;

  float optical = 1.0 - exp(-viewDistance * pow(hazeDensity, 1.6) * 0.031);
  float sunGlow = pow(max(dot(-viewDirection, sunDirection), 0.0), 6.0);
  vec3 airColor = mix(skyHorizonColor, skyZenithColor, clamp(viewDirection.y * 1.4, 0.0, 1.0))
    + sunColor * sunGlow * hazeDensity * 0.5;
  color = mix(color, airColor, clamp(optical, 0.0, 0.96));

  float rim = max(abs(ground.x), abs(ground.y));
  color = mix(
    color,
    skyHorizonColor * (1.0 + hazeDensity * 0.32),
    smoothstep(horizonStart, horizonEnd, rim)
  );

  float dither = (hash21(gl_FragCoord.xy) - 0.5) / 255.0;
  gl_FragColor = vec4(color + dither, 1.0);
}
`;

const toColor3 = ([red, green, blue]: Rgb): Color3 => new Color3(red, green, blue);

export interface SurfaceVistaOptions {
  skyHorizonColor: Color3;
  skyZenithColor: Color3;
  geology: SurfaceGeology;
  origin: Vector3;
  parent: TransformNode;
  profile: RenderQualityProfile;
  sunColor: Color3;
  sunDirection: Vector3;
  sunIntensity: number;
  liquid: { deepColor: Rgb; shallowColor: Rgb; waveHeight: number } | null;
}

export interface SurfaceLiquid {
  material: ShaderMaterial;
  mesh: Mesh;
  level: number;
}

export interface SurfaceVista {
  bounds: { high: number; low: number };
  liquid: SurfaceLiquid | null;
  heightAt: (x: number, z: number) => number;
  material: ShaderMaterial;
  mesh: Mesh;
  sampleAt: (
    x: number,
    z: number,
  ) => { frost: number; molten: number; regolith: number; scarp: number };
  shadeAt: (x: number, z: number) => { occlusion: number; sunVisibility: number };
  slopeAt: (x: number, z: number) => Vector3;
  stampShadows: (
    casters: readonly { height: number; radius: number; x: number; z: number }[],
  ) => void;
  update: (elapsedSeconds: number, cameraPosition: Vector3) => void;
}

export const createSurfaceVista = (
  scene: Scene,
  {
    geology,
    liquid,
    origin,
    parent,
    profile,
    skyHorizonColor,
    skyZenithColor,
    sunColor,
    sunDirection,
    sunIntensity,
  }: SurfaceVistaOptions,
): SurfaceVista => {
  Effect.ShadersStore.exoraGroundVertexShader = GROUND_VERTEX_SHADER;
  Effect.ShadersStore.exoraGroundFragmentShader = GROUND_FRAGMENT_SHADER;

  const field = createTerrainField(geology);
  const resolution = SURFACE_GRID_RESOLUTION[profile.tier];
  const stride = resolution + 1;
  const vertexCount = stride * stride;

  const positions = new Float32Array(vertexCount * 3);
  const colors = new Float32Array(vertexCount * 4);
  const shade = new Float32Array(vertexCount * 2);
  const heights = new Float32Array(vertexCount);
  const indices = new Uint32Array(resolution * resolution * 6);
  const sample = createTerrainSample();

  let low = Number.POSITIVE_INFINITY;
  let high = Number.NEGATIVE_INFINITY;

  for (let iz = 0; iz <= resolution; iz += 1) {
    const z = gradeSurfaceAxis((iz / resolution) * 2 - 1);
    for (let ix = 0; ix <= resolution; ix += 1) {
      const x = gradeSurfaceAxis((ix / resolution) * 2 - 1);
      const index = iz * stride + ix;
      field.sample(x, z, sample);
      heights[index] = sample.height;
      positions[index * 3] = x;
      positions[index * 3 + 1] = sample.height;
      positions[index * 3 + 2] = z;
      colors[index * 4] = sample.regolith;
      colors[index * 4 + 1] = sample.scarp;
      colors[index * 4 + 2] = sample.frost;
      colors[index * 4 + 3] = sample.molten;
      if (sample.height < low) low = sample.height;
      if (sample.height > high) high = sample.height;
    }
  }

  let cursor = 0;
  for (let iz = 0; iz < resolution; iz += 1) {
    for (let ix = 0; ix < resolution; ix += 1) {
      const topLeft = iz * stride + ix;
      const topRight = topLeft + 1;
      const bottomLeft = topLeft + stride;
      const bottomRight = bottomLeft + 1;
      indices[cursor] = topLeft;
      indices[cursor + 1] = topRight;
      indices[cursor + 2] = bottomLeft;
      indices[cursor + 3] = topRight;
      indices[cursor + 4] = bottomRight;
      indices[cursor + 5] = bottomLeft;
      cursor += 6;
    }
  }

  bandlimitSurfaceFarField(heights, resolution);
  low = Number.POSITIVE_INFINITY;
  high = Number.NEGATIVE_INFINITY;
  for (let index = 0; index < vertexCount; index += 1) {
    const height = heights[index] ?? 0;
    positions[index * 3 + 1] = height;
    if (height < low) low = height;
    if (height > high) high = height;
  }

  const occlusion = bakeSurfaceOcclusion(heights, resolution);
  const visibility = bakeSurfaceSunVisibility(heights, resolution, sunDirection, geology.relief);
  for (let index = 0; index < vertexCount; index += 1) {
    shade[index * 2] = occlusion[index] ?? 1;
    shade[index * 2 + 1] = visibility[index] ?? 1;
  }

  const normals = new Float32Array(vertexCount * 3);
  VertexData.ComputeNormals(positions, indices, normals);

  const mesh = new Mesh("surfaceTerrain", scene);
  const vertexData = new VertexData();
  vertexData.positions = positions;
  vertexData.indices = indices;
  vertexData.normals = normals;
  vertexData.colors = colors;
  vertexData.uvs = shade;
  vertexData.applyToMesh(mesh, false);
  mesh.parent = parent;
  mesh.position.copyFrom(origin);
  mesh.isPickable = false;
  mesh.alwaysSelectAsActiveMesh = true;

  const noiseOctaves = profile.tier === "desktop" ? profile.fbmOctaves - 1 : 2;
  const isCloud = geology.medium === "cloud";
  const detail = geology.detail;
  const textures = isCloud
    ? null
    : getSurfaceDetailTextures(
        scene,
        detail,
        profile.surfaceMicrodetail,
        profile.anisotropicFiltering,
      );
  const defines = [`#define FBM_OCTAVES ${Math.max(2, noiseOctaves)}`];
  if (isCloud) defines.push("#define CLOUD_DECK");
  if (profile.surfaceMicrodetail && !isCloud) defines.push("#define GROUND_DETAIL");
  if (profile.surfaceColorDetail && !isCloud) defines.push("#define GROUND_CHEMISTRY");

  const material = new ShaderMaterial(
    "surfaceTerrainMaterial",
    scene,
    { fragment: "exoraGround", vertex: "exoraGround" },
    {
      attributes: ["position", "normal", "color", "uv"],
      defines,
      samplers: [
        "primaryNormalMap",
        "primaryRoughnessMap",
        "secondaryNormalMap",
        "chemistryColorMap",
      ],
      uniforms: [
        "world",
        "worldViewProjection",
        "cameraPosition",
        "sunDirection",
        "sunColor",
        "sunIntensity",
        "skyZenithColor",
        "skyHorizonColor",
        "rampA",
        "rampB",
        "rampC",
        "rampD",
        "rampE",
        "regolithColor",
        "bedrockColor",
        "frostColor",
        "lavaColor",
        "groundAlbedo",
        "groundLow",
        "groundSpan",
        "hazeDensity",
        "ambientStrength",
        "exposure",
        "strataStrength",
        "strataSpacing",
        "windAxis",
        "windStreaks",
        "horizonStart",
        "horizonEnd",
        "patchOrigin",
        "time",
        "seed",
        "fineDetailScale",
        "coarseDetailScale",
        "chemistryScale",
        "chemistryStrength",
      ],
    },
  );

  const worldLow = origin.y + low;
  const worldHigh = origin.y + high;

  material.setVector3("sunDirection", sunDirection);
  material.setColor3("sunColor", sunColor);
  material.setFloat("sunIntensity", sunIntensity);
  material.setColor3("skyZenithColor", skyZenithColor);
  material.setColor3("skyHorizonColor", skyHorizonColor);
  material.setColor3("rampA", toColor3(geology.ramp[0]));
  material.setColor3("rampB", toColor3(geology.ramp[1]));
  material.setColor3("rampC", toColor3(geology.ramp[2]));
  material.setColor3("rampD", toColor3(geology.ramp[3]));
  material.setColor3("rampE", toColor3(geology.ramp[4]));
  material.setColor3("regolithColor", toColor3(geology.regolithColor));
  material.setColor3("bedrockColor", toColor3(geology.bedrockColor));
  material.setColor3("frostColor", toColor3(geology.frostColor));
  material.setColor3("lavaColor", toColor3(geology.lavaColor));
  material.setColor3(
    "groundAlbedo",
    new Color3(
      geology.ramp.reduce((sum, stop) => sum + stop[0], 0) / geology.ramp.length,
      geology.ramp.reduce((sum, stop) => sum + stop[1], 0) / geology.ramp.length,
      geology.ramp.reduce((sum, stop) => sum + stop[2], 0) / geology.ramp.length,
    ),
  );
  material.setFloat("groundLow", worldLow);
  material.setFloat("groundSpan", Math.max(0.4, worldHigh - worldLow));
  material.setFloat("hazeDensity", geology.hazeDensity);
  material.setFloat("ambientStrength", 0.11 + geology.hazeDensity * 0.5);
  const rampLuminance =
    geology.ramp.reduce(
      (sum, stop) => sum + (stop[0] * 0.2126 + stop[1] * 0.7152 + stop[2] * 0.0722),
      0,
    ) / geology.ramp.length;
  const lambert = Math.max(0.02, sunDirection.y);
  const backscatter = (sunDirection.y * 0.5 + 0.5) ** 2.2;
  const flatSunlight = sunIntensity * (lambert * 0.84 + backscatter * 0.16) * 2.4;
  const skyLuminance =
    skyHorizonColor.r * 0.2126 + skyHorizonColor.g * 0.7152 + skyHorizonColor.b * 0.0722;
  const flatAmbient = (0.11 + geology.hazeDensity * 0.5) * skyLuminance;
  const groundExposure = Math.min(
    5,
    Math.max(0.6, 0.42 / Math.max(rampLuminance * (flatSunlight + flatAmbient), 0.02)),
  );
  material.setFloat("exposure", groundExposure);
  material.setFloat("strataStrength", geology.strataStrength);
  material.setFloat("strataSpacing", Math.max(0.18, geology.strataSpacing));
  material.setFloat("windStreaks", geology.windStreaks);
  material.setFloat("horizonStart", SURFACE_HALF_EXTENT * 0.72);
  material.setFloat("horizonEnd", SURFACE_HALF_EXTENT * 0.985);
  material.setVector3("patchOrigin", origin);
  material.setFloat("time", 0);
  material.setFloat("seed", geology.seed % 100_000);
  material.setFloat("fineDetailScale", 0.42);
  material.setFloat("coarseDetailScale", 0.072);
  material.setFloat("chemistryScale", 0.026);
  material.setFloat("chemistryStrength", detail.chemistryStrength);
  if (textures) {
    material.setTexture("chemistryColorMap", textures.chemistry);
    material.setTexture("primaryNormalMap", textures.primary.normal);
    material.setTexture("primaryRoughnessMap", textures.primary.roughness);
    material.setTexture("secondaryNormalMap", textures.secondary.normal);
  }
  material.setVector2(
    "windAxis",
    new Vector2(Math.cos(geology.windDirection), Math.sin(geology.windDirection)),
  );
  material.backFaceCulling = true;
  mesh.material = material;

  const buildLiquid = (): SurfaceLiquid | null => {
    if (!liquid) return null;
    const level =
      low + (high - low) * (0.18 + Math.min(1, Math.max(0, geology.liquidLevel ?? 0)) * 0.5);
    const span = Math.max(0.6, high - low);

    const liquidPositions: number[] = [];
    const liquidColors: number[] = [];
    const liquidShade: number[] = [];
    const liquidIndices: number[] = [];
    const remap = new Int32Array(vertexCount).fill(-1);

    const claim = (index: number): number => {
      const existing = remap[index] ?? -1;
      if (existing >= 0) return existing;
      const next = liquidPositions.length / 3;
      const depth = level - (heights[index] ?? 0);
      liquidPositions.push(positions[index * 3] ?? 0, level, positions[index * 3 + 2] ?? 0);
      liquidColors.push(
        Math.min(1, Math.max(0, depth / (span * 0.35))),
        1 - Math.min(1, Math.max(0, depth / (span * 0.07))),
        0,
        1,
      );
      liquidShade.push(shade[index * 2] ?? 1, shade[index * 2 + 1] ?? 1);
      remap[index] = next;
      return next;
    };

    for (let iz = 0; iz < resolution; iz += 1) {
      for (let ix = 0; ix < resolution; ix += 1) {
        const topLeft = iz * stride + ix;
        const topRight = topLeft + 1;
        const bottomLeft = topLeft + stride;
        const bottomRight = bottomLeft + 1;
        const wet =
          level > (heights[topLeft] ?? 0) ||
          level > (heights[topRight] ?? 0) ||
          level > (heights[bottomLeft] ?? 0) ||
          level > (heights[bottomRight] ?? 0);
        if (!wet) continue;
        const a = claim(topLeft);
        const b = claim(topRight);
        const c = claim(bottomLeft);
        const d = claim(bottomRight);
        liquidIndices.push(a, b, c, b, d, c);
      }
    }

    if (liquidIndices.length === 0) return null;

    Effect.ShadersStore.exoraLiquidVertexShader = LIQUID_VERTEX_SHADER;
    Effect.ShadersStore.exoraLiquidFragmentShader = LIQUID_FRAGMENT_SHADER;

    const liquidMesh = new Mesh("surfaceWater", scene);
    const liquidData = new VertexData();
    liquidData.positions = liquidPositions;
    liquidData.indices = liquidIndices;
    liquidData.colors = liquidColors;
    liquidData.uvs = liquidShade;
    liquidData.applyToMesh(liquidMesh, false);
    liquidMesh.parent = parent;
    liquidMesh.position.copyFrom(origin);
    liquidMesh.isPickable = false;
    liquidMesh.alwaysSelectAsActiveMesh = true;

    const liquidMaterial = new ShaderMaterial(
      "surfaceWaterMaterial",
      scene,
      { fragment: "exoraLiquid", vertex: "exoraLiquid" },
      {
        attributes: ["position", "color", "uv"],
        defines: [`#define FBM_OCTAVES ${Math.max(2, noiseOctaves)}`],
        uniforms: [
          "world",
          "worldViewProjection",
          "cameraPosition",
          "sunDirection",
          "sunColor",
          "sunIntensity",
          "skyZenithColor",
          "skyHorizonColor",
          "shallowColor",
          "deepColor",
          "hazeDensity",
          "exposure",
          "waveHeight",
          "time",
          "seed",
          "horizonStart",
          "horizonEnd",
          "patchOrigin",
        ],
      },
    );
    liquidMaterial.setVector3("sunDirection", sunDirection);
    liquidMaterial.setColor3("sunColor", sunColor);
    liquidMaterial.setFloat("sunIntensity", sunIntensity);
    liquidMaterial.setColor3("skyZenithColor", skyZenithColor);
    liquidMaterial.setColor3("skyHorizonColor", skyHorizonColor);
    liquidMaterial.setColor3("shallowColor", toColor3(liquid.shallowColor));
    liquidMaterial.setColor3("deepColor", toColor3(liquid.deepColor));
    liquidMaterial.setFloat("hazeDensity", geology.hazeDensity);
    liquidMaterial.setFloat("exposure", groundExposure);
    liquidMaterial.setFloat("waveHeight", liquid.waveHeight);
    liquidMaterial.setFloat("time", 0);
    liquidMaterial.setFloat("seed", geology.seed % 100_000);
    liquidMaterial.setFloat("horizonStart", SURFACE_HALF_EXTENT * 0.72);
    liquidMaterial.setFloat("horizonEnd", SURFACE_HALF_EXTENT * 0.985);
    liquidMaterial.setVector3("patchOrigin", origin);
    liquidMaterial.backFaceCulling = false;
    liquidMesh.material = liquidMaterial;

    return { level: origin.y + level, material: liquidMaterial, mesh: liquidMesh };
  };

  const surfaceLiquid = buildLiquid();

  const sampleScratch = createTerrainSample();

  return {
    bounds: { high: worldHigh, low: worldLow },
    liquid: surfaceLiquid,
    heightAt: (x, z) => origin.y + field.height(x - origin.x, z - origin.z),
    material,
    mesh,
    stampShadows: (casters) => {
      const horizontal = Math.hypot(sunDirection.x, sunDirection.z);
      if (horizontal < 1e-4 || sunDirection.y <= 0.01 || casters.length === 0) return;
      const reach = horizontal / sunDirection.y;
      const alongX = -sunDirection.x / horizontal;
      const alongZ = -sunDirection.z / horizontal;

      for (const caster of casters) {
        const length = caster.height * reach;
        const localX = caster.x - origin.x;
        const localZ = caster.z - origin.z;
        const tipX = localX + alongX * length;
        const tipZ = localZ + alongZ * length;
        const pad = caster.radius + 0.5;
        const minX = Math.min(localX, tipX) - pad;
        const maxX = Math.max(localX, tipX) + pad;
        const minZ = Math.min(localZ, tipZ) - pad;
        const maxZ = Math.max(localZ, tipZ) + pad;
        if (maxX < -SURFACE_HALF_EXTENT || minX > SURFACE_HALF_EXTENT) continue;

        const ix0 = Math.max(0, Math.floor((inverseSurfaceGradeAxis(minX) + 1) * 0.5 * resolution));
        const ix1 = Math.min(
          resolution,
          Math.ceil((inverseSurfaceGradeAxis(maxX) + 1) * 0.5 * resolution),
        );
        const iz0 = Math.max(0, Math.floor((inverseSurfaceGradeAxis(minZ) + 1) * 0.5 * resolution));
        const iz1 = Math.min(
          resolution,
          Math.ceil((inverseSurfaceGradeAxis(maxZ) + 1) * 0.5 * resolution),
        );

        for (let iz = iz0; iz <= iz1; iz += 1) {
          const worldZ = gradeSurfaceAxis((iz / resolution) * 2 - 1);
          for (let ix = ix0; ix <= ix1; ix += 1) {
            const worldX = gradeSurfaceAxis((ix / resolution) * 2 - 1);
            const dx = worldX - localX;
            const dz = worldZ - localZ;
            const along = dx * alongX + dz * alongZ;
            if (along < -caster.radius || along > length + caster.radius) continue;
            const across = Math.abs(dx * -alongZ + dz * alongX);
            const spread = caster.radius * (1 + along * 0.12);
            if (across > spread) continue;
            const fade = (1 - Math.min(1, Math.max(0, along / Math.max(length, 0.001)))) ** 0.6;
            const soft = 1 - (across / spread) ** 2;
            const shadow = Math.min(0.82, fade * soft * 0.9);
            const index = iz * stride + ix;
            shade[index * 2 + 1] = Math.min(shade[index * 2 + 1] ?? 1, 1 - shadow);
            if (along < caster.radius * 1.2 && across < caster.radius * 1.2) {
              shade[index * 2] = Math.min(shade[index * 2] ?? 1, 0.55);
            }
          }
        }
      }

      mesh.updateVerticesData("uv", shade, false, false);
    },
    shadeAt: (x, z) => {
      const u = inverseSurfaceGradeAxis(x - origin.x);
      const v = inverseSurfaceGradeAxis(z - origin.z);
      const fx = (u + 1) * 0.5 * resolution;
      const fz = (v + 1) * 0.5 * resolution;
      const x0 = Math.min(resolution, Math.max(0, Math.round(fx)));
      const z0 = Math.min(resolution, Math.max(0, Math.round(fz)));
      const index = z0 * stride + x0;
      return {
        occlusion: occlusion[index] ?? 1,
        sunVisibility: visibility[index] ?? 1,
      };
    },
    slopeAt: (x, z) => {
      const step = 0.6;
      const localX = x - origin.x;
      const localZ = z - origin.z;
      const dx = field.height(localX + step, localZ) - field.height(localX - step, localZ);
      const dz = field.height(localX, localZ + step) - field.height(localX, localZ - step);
      return new Vector3(-dx, 2 * step, -dz).normalize();
    },
    sampleAt: (x, z) => {
      field.sample(x - origin.x, z - origin.z, sampleScratch);
      return {
        frost: sampleScratch.frost,
        molten: sampleScratch.molten,
        regolith: sampleScratch.regolith,
        scarp: sampleScratch.scarp,
      };
    },
    update: (elapsedSeconds, cameraPosition) => {
      material.setFloat("time", elapsedSeconds);
      material.setVector3("cameraPosition", cameraPosition);
      surfaceLiquid?.material.setFloat("time", elapsedSeconds);
      surfaceLiquid?.material.setVector3("cameraPosition", cameraPosition);
    },
  };
};
