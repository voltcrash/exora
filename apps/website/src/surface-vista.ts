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

/**
 * The ground a visitor stands on, as geometry and as a material.
 *
 * What this replaces was a flat-lit 72x82 plane of vertex-coloured triangles under a
 * `StandardMaterial`: no texture at any scale, no shadow, no horizon, and a palette interpolated
 * between three recipe colours. It read as a cartoon because it had nothing in it that ground has.
 *
 * Four things are added here, in the order they matter:
 *
 *  - **A horizon.** The patch runs 300 units across instead of 82, on a grid graded so the
 *    triangles under the viewer are half a unit wide and the ones at the rim are seven, and it
 *    dissolves into the sky's own colour before it ends. There is no longer an edge of the world.
 *  - **Sunlight that has been somewhere.** Terrain self-shadowing is marched over the height grid
 *    on the way in and baked per vertex, so a low sun throws real shadows down the length of a
 *    dune field or across a crater floor — the single strongest cue that a landscape is a place.
 *  - **Material, not tint.** Triplanar PBR detail at two scales, bedrock on the scarps, fines in
 *    the hollows, bedding planes in the cliff faces, wind streaks downwind of obstacles, frost on
 *    cold flat ground — all driven by the terrain's own material channels rather than by altitude.
 *  - **Air.** Aerial perspective toward the sky colour with forward scattering around the sun, so
 *    distance reads as distance. On Titan it closes in after a few hundred metres; on the Moon it
 *    never closes at all, and the far rim stays as sharp as the near.
 */

/**
 * Half-width of the ground patch, in scene units — which are metres to anyone standing in it.
 *
 * Pushed out this far for the headset above all: an immersive visitor is standing at eye height on
 * ground that runs to the edge of their vision in every direction, and a horizon a hundred metres
 * off reads as a plateau rather than as a world. The grading below means the extra reach costs no
 * extra vertices — only coarser triangles out where nothing can resolve them anyway.
 */
const HALF_EXTENT = 240;

/**
 * How the grid's vertices are spread from the middle of the patch to its rim.
 *
 * A uniform grid has to choose between detail underfoot and reach toward the horizon; this one
 * refuses the choice. `u` runs [-1, 1] across the grid and the cubic term stretches the outer rows
 * outward, so on desktop the quads by the viewer are about half a unit across and the ones on the
 * rim about seven — the same vertex budget covering thirteen times the ground.
 */
const gradeAxis = (u: number): number => HALF_EXTENT * (0.28 * u + 0.72 * u * u * u);

/** Inverse of `gradeAxis`, normalized to [-1, 1], by Newton iteration from a linear guess. Used to
 * step a shadow ray through the grid in grid space rather than in world space. */
const inverseGradeAxis = (x: number): number => {
  const target = Math.min(1, Math.max(-1, x / HALF_EXTENT));
  let u = target;
  for (let iteration = 0; iteration < 4; iteration += 1) {
    const value = 0.28 * u + 0.72 * u * u * u - target;
    const slope = 0.28 + 2.16 * u * u;
    u -= value / slope;
  }
  return Math.min(1, Math.max(-1, u));
};

const GRID_RESOLUTION: Readonly<Record<RenderQualityProfile["tier"], number>> = {
  desktop: 208,
  mobile: 132,
  quest: 116,
};

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
  // Material channels the terrain generator wrote per vertex: fines, scarp, frost, molten.
  vMaterial = color;
  // x: ambient occlusion from local curvature. y: sun visibility, marched over the height grid.
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

/** Five-stop ramp: real ground is darker in its hollows and brighter on its crests than any
 * two-colour blend can reach, and the stops in between carry the mineral hue. */
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
/** Whiteout-blended triplanar normal: the three axis projections are combined relative to the
 * surface normal so the seams between them never show. */
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
  // Two tilings of the same material an octave and a half apart: the fine one carries the grain a
  // visitor sees at their feet and fades out before it can alias, the coarse one carries the
  // structure that survives to the horizon.
  float fineFade = 1.0 - smoothstep(9.0, 46.0, viewDistance);
  vec3 fineNormal = triplanarNormal(primaryNormalMap, vWorldPosition * fineDetailScale, blend, baseNormal);
  vec3 coarseNormal = triplanarNormal(secondaryNormalMap, vWorldPosition * coarseDetailScale, blend, baseNormal);
  // Bedrock texture takes over where fines cannot rest: steep ground, scarps, crater rims.
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

  // --- Colour ------------------------------------------------------------------------------
  // Altitude alone barely moves across a plain, so the ramp is read at the altitude the ground
  // *locally* has: compressed toward the middle and pushed around by the macro field, which is
  // what stops a flat province from resolving to one flat colour.
  vec3 albedo = sampleRamp(0.25 + altitude * 0.55 + macro * 0.5 + grain * 0.1);
  // Freshly broken rock on everything too steep to hold a mantle.
  albedo = mix(albedo, bedrockColor * (1.05 + grain * 0.6), clamp(rockExposure * 0.62, 0.0, 1.0));
  // Fines gather on the flats and in the hollows, and they are the brightest thing on most worlds.
  float mantle = clamp(fines * (1.0 - slope * 1.7), 0.0, 1.0);
  albedo = mix(albedo, regolithColor * (0.86 + grain * 0.42 + macro * 0.2), mantle * 0.72);

#ifndef CLOUD_DECK
  // Bedding planes, visible only where rock is exposed — a scarp is a stack of layers, not a slope.
  float bedding = fract((vWorldPosition.y + macro * strataSpacing * 0.7) / max(strataSpacing, 0.05));
  float bed = smoothstep(0.44, 0.5, abs(bedding - 0.5));
  albedo *= 1.0 + (bed - 0.35) * strataStrength * rockExposure * 0.55;

  // Wind streaks: fines swept into long tails, stretched along the prevailing wind and narrow
  // across it, only on ground shallow enough for them to settle.
  vec2 downwind = vec2(dot(ground, windAxis), dot(ground, vec2(-windAxis.y, windAxis.x)));
  float streak = smoothstep(0.52, 0.78, fbm2(vec2(downwind.x * 0.012, downwind.y * 0.24)));
  albedo = mix(albedo, regolithColor * 1.22, streak * windStreaks * 0.32 * (1.0 - slope * 1.6));
#endif

#ifdef GROUND_CHEMISTRY
  // Mineral grain from the chemistry map, applied relative to its own luminance so a dark carbon
  // map tints the ground rather than crushing every elevation cue in it to black.
  vec3 chemistry = triplanarColor(chemistryColorMap, vWorldPosition * chemistryScale, blend);
  float chemistryLuminance = max(dot(chemistry, vec3(0.2126, 0.7152, 0.0722)), 0.08);
  vec3 relative = clamp(chemistry / chemistryLuminance, vec3(0.5), vec3(1.7));
  albedo = mix(albedo, albedo * relative * (0.8 + chemistryLuminance * 0.32), chemistryStrength);
#endif

  // Frost settles on flat, cold ground and thickens in the hollows the sun never reaches.
  float frostMask = clamp(frost * smoothstep(0.5, 0.92, baseNormal.y) * (0.6 + vShade.x * 0.6), 0.0, 1.0);
  albedo = mix(albedo, frostColor * (0.9 + grain * 0.2), frostMask);

  // --- Light -------------------------------------------------------------------------------
  float occlusion = clamp(vShade.x, 0.0, 1.0);
  float sunVisibility = clamp(vShade.y, 0.0, 1.0);
  float lambert = max(dot(shadingNormal, sunDirection), 0.0);
  // A dusty, porous surface scatters light back toward the source rather than falling off as a
  // clean cosine, which is why a full moon is flat and its terminator is not. Kept small: past
  // about a fifth it flattens the very slope shading the detail maps exist to reveal.
  float backscatter = pow(clamp(dot(shadingNormal, sunDirection) * 0.5 + 0.5, 0.0, 1.0), 2.2);
  float direct = mix(lambert, backscatter, 0.16) * sunVisibility;
  // The sun is a small, bright disc and the sky is a large, dim dome. Normalizing the direct term
  // by how much of it flat ground actually catches keeps that ratio where it belongs whatever
  // angle the star sits at — otherwise a low sun leaves the whole vista lit by sky glow alone,
  // which is exactly as flat as it sounds.
  vec3 sunlight = sunColor * sunIntensity * direct * 2.4;

  // Sky light: the whole dome is a source, and on a hazy world it is most of the light there is.
  float skyFacing = clamp(shadingNormal.y * 0.5 + 0.5, 0.0, 1.0);
  vec3 ambient = mix(skyHorizonColor, skyZenithColor, skyFacing) * ambientStrength * occlusion;
  // Light that has already bounced off the ground once, arriving from below.
  // Light that has already bounced off the ground once. On an airless world there is no sky to
  // fill a shadow, and this is the whole reason a shadowed slope on the Moon is dark rather than
  // absent: the sunlit ground a few metres away is throwing light into it.
  // How much light the ground around this point is throwing back is a fact about *that* ground,
  // not about the face receiving it — which is why a shadowed slope on Europa's 90%-albedo ice is
  // plainly lit while the same slope on the Moon's 12% regolith is nearly black.
  vec3 bounce = albedo * groundAlbedo * sunColor * sunIntensity * occlusion
    * (0.34 * clamp(0.5 - shadingNormal.y * 0.5, 0.0, 1.0) + 0.2);

  vec3 halfVector = normalize(sunDirection + viewDirection);
  float specularPower = mix(3.0, 120.0, 1.0 - roughness);
  float specular = pow(max(dot(shadingNormal, halfVector), 0.0), specularPower)
    * (1.0 - roughness) * sunVisibility;
  // Rock is not a mirror; frost and wet ground are closer to one.
  // Rock is not a mirror; frost and ice come much closer to being one.
  float specularStrength = 0.035 + frostMask * 0.45;

#ifdef CLOUD_DECK
  // A cloud is lit through rather than off. Most of what reaches the eye has been scattered
  // forward inside the layer, which is why a cloud top is brightest just around the sun and why
  // its shaded side never goes dark the way a rock's does.
  float through = pow(clamp(dot(shadingNormal, sunDirection) * 0.5 + 0.5, 0.0, 1.0), 1.3);
  vec3 color = albedo * (sunColor * sunIntensity * mix(through, direct, 0.4) * 0.95 + ambient * 1.5);
  color += albedo * sunColor * pow(max(dot(-viewDirection, sunDirection), 0.0), 4.0) * 0.22;
#else
  vec3 color = albedo * (sunlight + ambient) + bounce;
  color += sunColor * sunIntensity * specular * specularStrength;
#endif
#ifndef CLOUD_DECK
  // Grazing light picks out every grain, which is what makes a low sun read as low.
  float grazing = pow(1.0 - clamp(dot(shadingNormal, viewDirection), 0.0, 1.0), 4.0);
  color += mix(skyHorizonColor, sunColor, 0.5) * grazing * 0.028 * (sunVisibility * 0.7 + 0.3);
#endif

  // Incandescence, from below, pulsing on its own clock rather than the frame's.
  float glow = molten * (0.72 + 0.2 * sin(time * 0.8 + macro * 14.0) + 0.14 * sin(time * 2.3 + grain * 9.0));
  color += lavaColor * glow;

  // Exposure last, over everything the surface emitted or reflected — the way a camera works, and
  // the only way the highlights keep the same relationship to the diffuse that they were given.
  color *= exposure;

  // --- Air ---------------------------------------------------------------------------------
  // Aerial perspective: distance reads as distance because the air between puts its own colour in
  // front of everything. Forward scattering brightens the sky within a few degrees of the sun.
  // Optical depth rises faster than linearly with the amount of air, which is why Mars's thin
  // dusty sky still leaves a hundred metres of ground readable while Titan's smog closes in
  // within a few dozen — Huygens could not see its own horizon.
  float optical = 1.0 - exp(-viewDistance * pow(hazeDensity, 1.6) * 0.031);
  float sunGlow = pow(max(dot(-viewDirection, sunDirection), 0.0), 6.0);
  vec3 airColor = mix(skyHorizonColor, skyZenithColor, clamp(viewDirection.y * 1.4, 0.0, 1.0))
    + sunColor * sunGlow * hazeDensity * 0.5;
  color = mix(color, airColor, clamp(optical, 0.0, 0.96));

  // The rim of the patch dissolves into the sky before it can be seen ending. On an airless world
  // the haze above does nothing, so this is the only thing hiding the edge — and it has to.
  float rim = max(abs(ground.x), abs(ground.y));
  float dissolve = smoothstep(horizonStart, horizonEnd, rim);
  // Matched to what the sky dome actually paints along its own horizon, which is its horizon
  // colour plus the band it brightens by there — a rim that fades to anything else leaves a
  // visible seam where the ground stops.
  color = mix(color, skyHorizonColor * (1.0 + hazeDensity * 0.32), dissolve);

  float dither = (hash21(gl_FragCoord.xy) - 0.5) / 255.0;
  gl_FragColor = vec4(color + dither, 1.0);
}
`;

/**
 * Standing liquid, as a surface rather than as a coloured plane.
 *
 * Water is almost entirely a mirror at a glancing angle and almost entirely its own colour looking
 * straight down, and what makes it read as liquid is that the boundary between those two moves.
 * So this is Fresnel over a wave-perturbed normal: the sky above reflected off the far half of the
 * surface, the depth-tinted body of it underfoot, a glint where the sun's own reflection lands,
 * and a shoreline that follows the terrain rather than cutting a straight line across it.
 */
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
  // x: how deep the liquid is here, normalized. y: how close the shoreline is.
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

/** Slope of a drifting wave field, as a gradient rather than a height — the surface itself is
 * flat geometry and everything about the swell is carried in the normal. */
vec2 waveGradient(vec2 point, float scale, vec2 drift) {
  vec2 p = point * scale + drift * time;
  float epsilon = 0.35;
  float center = valueNoise(p);
  return vec2(valueNoise(p + vec2(epsilon, 0.0)) - center, valueNoise(p + vec2(0.0, epsilon)) - center);
}

void main(void) {
  float depth = vDepth.x;
  float shore = vDepth.y;
  // Below the waterline the liquid is not there at all: the shoreline follows the ground under it
  // rather than cutting a straight edge across the patch.
  if (depth <= 0.002) discard;

  vec2 ground = vWorldPosition.xz - patchOrigin.xz;
  vec3 toCamera = cameraPosition - vWorldPosition;
  float viewDistance = length(toCamera);
  vec3 viewDirection = toCamera / max(viewDistance, 0.0001);

  // Three wave trains at different scales and headings, the way a real swell is built. The
  // shallows carry less of the long swell, which is why they go glassy near a shore.
  vec2 slope = waveGradient(ground, 0.19, vec2(0.09, 0.05)) * 1.9 * min(1.0, depth * 2.4)
    + waveGradient(ground, 0.62, vec2(-0.14, 0.11)) * 0.9
    + waveGradient(ground, 2.1, vec2(0.31, -0.24)) * 0.35;
  vec3 normal = normalize(vec3(-slope.x, 1.0 / max(waveHeight, 0.02), -slope.y));

  // Fresnel: nearly transparent looking straight down, nearly a mirror at a grazing angle.
  float facing = clamp(dot(normal, viewDirection), 0.0, 1.0);
  float fresnel = 0.02 + 0.98 * pow(1.0 - facing, 5.0);

  // What the mirror half shows: the sky in the direction the surface throws the eye.
  vec3 reflectedDirection = reflect(-viewDirection, normal);
  vec3 reflected = mix(skyHorizonColor, skyZenithColor, clamp(reflectedDirection.y * 1.6, 0.0, 1.0));

  // What the transmitted half shows: the liquid's own colour, deepening with the water column.
  // Depth carries the colour away fast: a body of water is its own filter, and a couple of its
  // own depths of it is enough to take the shallow tint out entirely.
  vec3 body = mix(shallowColor, deepColor, clamp(depth * 2.6, 0.0, 1.0));
  // Light that went in, scattered, and came back out — why shallow water glows against a shore.
  float scatter = (1.0 - clamp(depth * 3.2, 0.0, 1.0)) * max(dot(normal, sunDirection), 0.0);
  body += shallowColor * scatter * 0.4;

  float sunVisibility = clamp(vShade.y, 0.0, 1.0);
  vec3 halfVector = normalize(sunDirection + viewDirection);
  // A tight, very bright glint: the sun's own reflection, broken up by the waves into a path.
  float glint = pow(max(dot(normal, halfVector), 0.0), 420.0) * sunVisibility;

  vec3 color = mix(body, reflected, fresnel);
  color += sunColor * sunIntensity * glint * 1.6;
  // Where the liquid meets the ground it thins to nothing and brightens as it goes.
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
  /** Sky colours the ground borrows for its ambient light and its aerial perspective. */
  skyHorizonColor: Color3;
  skyZenithColor: Color3;
  geology: SurfaceGeology;
  /** Where the patch sits in the scene; the terrain field's own origin maps here. */
  origin: Vector3;
  parent: TransformNode;
  profile: RenderQualityProfile;
  sunColor: Color3;
  /** Unit vector from the ground toward the host star. */
  sunDirection: Vector3;
  sunIntensity: number;
  /** Deep and shallow tints for standing liquid, and how high its swell runs. */
  liquid: { deepColor: Rgb; shallowColor: Rgb; waveHeight: number } | null;
}

export interface SurfaceLiquid {
  material: ShaderMaterial;
  mesh: Mesh;
  /** World Y of the liquid's surface. */
  level: number;
}

export interface SurfaceVista {
  /** Highest and lowest ground in the patch, in world Y — used to place anything that sits on it. */
  bounds: { high: number; low: number };
  /** Standing liquid over this ground, or null on a dry world. */
  liquid: SurfaceLiquid | null;
  /** World-space ground height, matching the mesh exactly. */
  heightAt: (x: number, z: number) => number;
  material: ShaderMaterial;
  mesh: Mesh;
  /** Material channels at a point, for deciding what to scatter there. */
  sampleAt: (
    x: number,
    z: number,
  ) => { frost: number; molten: number; regolith: number; scarp: number };
  /** The baked light at a point: how open the sky is above it, and whether the sun reaches it.
   * Anything standing on the ground reads these so it is lit by the same light the ground is. */
  shadeAt: (x: number, z: number) => { occlusion: number; sunVisibility: number };
  /** Ground normal at a point, for standing something upright on a slope. */
  slopeAt: (x: number, z: number) => Vector3;
  /**
   * Lays the shadows of everything standing on the ground into the ground's own baked light.
   *
   * A boulder that casts nothing is a sticker. Rather than a shadow map — which a hand-written
   * shader would have to be rebuilt around, for a scene where neither the sun nor the rocks ever
   * move — each caster's shadow is projected down the sun's own direction and stamped into the
   * per-vertex sun visibility the terrain already carries. One upload, no per-frame cost, and the
   * shadows land in exactly the same light the terrain shades itself with.
   */
  stampShadows: (
    casters: readonly { height: number; radius: number; x: number; z: number }[],
  ) => void;
  update: (elapsedSeconds: number, cameraPosition: Vector3) => void;
}

/**
 * Marches the sun's ray over the height grid and reports how much of the disc reaches each vertex.
 *
 * Terrain that cannot shadow itself has no time of day: every slope reads the same whichever way
 * it faces the light, and a landscape without shadows is the flattest thing a renderer can draw.
 * The march is done here, once, over the grid that has already been built, rather than in a shadow
 * map — the patch is static, the sun does not move, and a bake costs nothing per frame.
 *
 * The ray is stepped geometrically, so the metre in front of a vertex is sampled as finely as the
 * hundred metres behind it are sampled coarsely, and the result is softened by how far above the
 * ray the blocker stood — which is the penumbra a sun with an angular radius actually casts.
 */
const bakeSunVisibility = (
  heights: Float32Array,
  resolution: number,
  sunDirection: Vector3,
  reliefScale: number,
): Float32Array => {
  const stride = resolution + 1;
  const visibility = new Float32Array(stride * stride);
  const horizontal = Math.hypot(sunDirection.x, sunDirection.z);

  // A sun at or below the horizon leaves the whole patch in shade; one directly overhead casts
  // nothing. Either way there is no march to run.
  if (horizontal < 1e-4 || sunDirection.y <= 0.01) {
    visibility.fill(sunDirection.y > 0.01 ? 1 : 0);
    return visibility;
  }

  const stepX = sunDirection.x / horizontal;
  const stepZ = sunDirection.z / horizontal;
  const rise = sunDirection.y / horizontal;
  const steps = 22;
  // Out to a third of the patch: beyond that a blocker would have to be taller than any terrain
  // this generator raises to still be in the way.
  const maxDistance = HALF_EXTENT * 0.62;

  const heightAtGrid = (worldX: number, worldZ: number): number => {
    const u = inverseGradeAxis(worldX);
    const v = inverseGradeAxis(worldZ);
    const fx = (u + 1) * 0.5 * resolution;
    const fz = (v + 1) * 0.5 * resolution;
    const x0 = Math.min(resolution - 1, Math.max(0, Math.floor(fx)));
    const z0 = Math.min(resolution - 1, Math.max(0, Math.floor(fz)));
    const tx = Math.min(1, Math.max(0, fx - x0));
    const tz = Math.min(1, Math.max(0, fz - z0));
    const h00 = heights[z0 * stride + x0] ?? 0;
    const h10 = heights[z0 * stride + x0 + 1] ?? 0;
    const h01 = heights[(z0 + 1) * stride + x0] ?? 0;
    const h11 = heights[(z0 + 1) * stride + x0 + 1] ?? 0;
    return (h00 * (1 - tx) + h10 * tx) * (1 - tz) + (h01 * (1 - tx) + h11 * tx) * tz;
  };

  for (let iz = 0; iz <= resolution; iz += 1) {
    const worldZ = gradeAxis((iz / resolution) * 2 - 1);
    for (let ix = 0; ix <= resolution; ix += 1) {
      const worldX = gradeAxis((ix / resolution) * 2 - 1);
      const origin = heights[iz * stride + ix] ?? 0;
      let shade = 0;

      for (let step = 0; step < steps; step += 1) {
        // Geometric spacing: fine where a small rock can block the sun, coarse where only a ridge can.
        const t = (step + 1) / steps;
        const distance = maxDistance * t * t;
        const sampleX = worldX + stepX * distance;
        const sampleZ = worldZ + stepZ * distance;
        if (Math.abs(sampleX) > HALF_EXTENT || Math.abs(sampleZ) > HALF_EXTENT) break;
        const rayHeight = origin + rise * distance;
        const blocker = heightAtGrid(sampleX, sampleZ);
        if (blocker > rayHeight) {
          // How far the blocker overtops the ray, measured against the sun's own angular size:
          // a ridge just clipping the disc dims it, one well above it puts the vertex in umbra.
          const overtop = (blocker - rayHeight) / Math.max(distance * 0.035 + 0.12, 0.05);
          shade = Math.max(shade, Math.min(1, overtop));
          if (shade >= 1) break;
        }
      }

      // Steeper relief casts harder shadows; a nearly flat world barely shades itself at all.
      visibility[iz * stride + ix] = 1 - shade * Math.min(1, 0.55 + reliefScale * 0.12);
    }
  }

  return visibility;
};

/**
 * Ambient occlusion from the shape of the ground itself.
 *
 * A hollow sees less of the sky than a crest does, and that difference is most of what gives a
 * crater floor, a dune trough or a canyon its depth under diffuse light. Comparing each vertex to
 * the average of a ring around it, at two radii, approximates it closely enough to read — and
 * unlike a screen-space pass it is stable when the camera moves.
 */
/**
 * Low-passes the outer rows of the height grid in step with how far apart their vertices are.
 *
 * The grading that buys the horizon also means the rim quads are fourteen times the width of the
 * ones underfoot, and terrain detail finer than a quad does not get smaller out there — it turns
 * into single-triangle slivers that flicker as the camera moves and read as scratches drawn on
 * the ground. Blurring each row by roughly the width of its own quads removes exactly the
 * frequencies the mesh cannot carry, and leaves the near field untouched.
 */
const bandlimitFarField = (heights: Float32Array, resolution: number): void => {
  const stride = resolution + 1;
  const source = Float32Array.from(heights);

  for (let iz = 0; iz <= resolution; iz += 1) {
    const v = (iz / resolution) * 2 - 1;
    for (let ix = 0; ix <= resolution; ix += 1) {
      const u = (ix / resolution) * 2 - 1;
      // How coarse this vertex's own neighbourhood is, as a fraction of the coarsest in the grid.
      const coarseness = Math.max(Math.abs(u), Math.abs(v));
      const strength = Math.min(1, Math.max(0, (coarseness - 0.34) / 0.66)) ** 1.5;
      if (strength <= 0.01) continue;

      let sum = 0;
      let weight = 0;
      const radius = strength > 0.6 ? 2 : 1;
      for (let oz = -radius; oz <= radius; oz += 1) {
        for (let ox = -radius; ox <= radius; ox += 1) {
          const sx = Math.min(resolution, Math.max(0, ix + ox));
          const sz = Math.min(resolution, Math.max(0, iz + oz));
          const kernel = 1 / (1 + ox * ox + oz * oz);
          sum += (source[sz * stride + sx] ?? 0) * kernel;
          weight += kernel;
        }
      }

      const smoothed = sum / Math.max(weight, 1e-6);
      const index = iz * stride + ix;
      heights[index] = (source[index] ?? 0) * (1 - strength) + smoothed * strength;
    }
  }
};

const bakeOcclusion = (heights: Float32Array, resolution: number): Float32Array => {
  const stride = resolution + 1;
  const occlusion = new Float32Array(stride * stride);
  const radii = [1, 3, 7];

  for (let iz = 0; iz <= resolution; iz += 1) {
    for (let ix = 0; ix <= resolution; ix += 1) {
      const center = heights[iz * stride + ix] ?? 0;
      let openness = 0;
      let weightTotal = 0;

      for (const radius of radii) {
        let sum = 0;
        let count = 0;
        for (let offset = -radius; offset <= radius; offset += radius) {
          for (let other = -radius; other <= radius; other += radius) {
            if (offset === 0 && other === 0) continue;
            const sx = Math.min(resolution, Math.max(0, ix + offset));
            const sz = Math.min(resolution, Math.max(0, iz + other));
            sum += heights[sz * stride + sx] ?? 0;
            count += 1;
          }
        }
        const weight = 1 / radius;
        // Above the ring average the vertex is a crest and sees the whole sky; below it, a hollow.
        openness += weight * Math.tanh((center - sum / Math.max(count, 1)) * 1.6);
        weightTotal += weight;
      }

      occlusion[iz * stride + ix] = Math.min(
        1,
        Math.max(0.16, 0.72 + (openness / Math.max(weightTotal, 1e-6)) * 0.34),
      );
    }
  }

  return occlusion;
};

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
  const resolution = GRID_RESOLUTION[profile.tier];
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
    const z = gradeAxis((iz / resolution) * 2 - 1);
    for (let ix = 0; ix <= resolution; ix += 1) {
      const x = gradeAxis((ix / resolution) * 2 - 1);
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
      // Wound so `ComputeNormals` returns upward normals in Babylon's left-handed convention.
      // The reverse order also renders — the faces come out front-facing either way — but the
      // normals come out pointing into the ground, and a surface whose normal faces away from the
      // sky is lit by nothing at all.
      indices[cursor] = topLeft;
      indices[cursor + 1] = topRight;
      indices[cursor + 2] = bottomLeft;
      indices[cursor + 3] = topRight;
      indices[cursor + 4] = bottomRight;
      indices[cursor + 5] = bottomLeft;
      cursor += 6;
    }
  }

  bandlimitFarField(heights, resolution);
  low = Number.POSITIVE_INFINITY;
  high = Number.NEGATIVE_INFINITY;
  for (let index = 0; index < vertexCount; index += 1) {
    const height = heights[index] ?? 0;
    positions[index * 3 + 1] = height;
    if (height < low) low = height;
    if (height > high) high = height;
  }

  const occlusion = bakeOcclusion(heights, resolution);
  const visibility = bakeSunVisibility(heights, resolution, sunDirection, geology.relief);
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
  // The patch is much wider than it is tall and never moves, so let Babylon skip it only when it
  // is genuinely off screen rather than culling on a bounding sphere that swallows the camera.
  mesh.alwaysSelectAsActiveMesh = true;

  const detail = geology.detail;
  const textures = getSurfaceDetailTextures(
    scene,
    detail,
    profile.surfaceMicrodetail,
    profile.anisotropicFiltering,
  );

  // Two fractal fields per fragment over ground that fills most of the frame is the vista's
  // dominant fill cost, and in a headset it is paid twice over. The macro and grain fields only
  // shape colour, so an octave less is invisible where an unsteady frame rate is not.
  const noiseOctaves = profile.tier === "desktop" ? profile.fbmOctaves - 1 : 2;
  const isCloud = geology.medium === "cloud";
  const defines = [`#define FBM_OCTAVES ${Math.max(2, noiseOctaves)}`];
  // A cloud deck has no rock in it, so the mineral maps have nothing to say about it — and every
  // one of them read as stone laid over the sky.
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
  // The average colour of this world's ground, which is what its bounced light is made of.
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
  // Thick air is itself the light source on a world like Venus or Titan; a vacuum world gets only
  // the small floor that keeps its shadowed ground legible rather than pure black.
  // Sky light. On a world with air this is what fills the shadows — a Martian rock's shaded face
  // is plainly readable under a dust-bright sky, not a black cut-out — and on an airless one the
  // small floor left here is all that keeps a shadowed slope from going to nothing at all.
  material.setFloat("ambientStrength", 0.11 + geology.hazeDensity * 0.5);
  /**
   * Exposure, the way a camera sets it rather than the way a light meter reads it.
   *
   * Albedo across the Solar System spans more than an order of magnitude — the Moon reflects 12%
   * of the light that hits it, Enceladus essentially all of it — and rendering both at the same
   * gain leaves one a black field and the other a white one. Every photograph ever taken of a
   * surface was exposed for that surface; this does the same, opening up for dark ground and
   * stopping down for bright, within the range a real exposure would move.
   */
  const rampLuminance =
    geology.ramp.reduce(
      (sum, stop) => sum + (stop[0] * 0.2126 + stop[1] * 0.7152 + stop[2] * 0.0722),
      0,
    ) / geology.ramp.length;
  // What flat ground under this sun actually receives, mirroring the fragment shader's own terms
  // so the exposure answers to the light as well as to the albedo. A world lit by a low sun with
  // no air to fill its shadows needs opening up further than its albedo alone would say.
  const lambert = Math.max(0.02, sunDirection.y);
  const backscatter = (sunDirection.y * 0.5 + 0.5) ** 2.2;
  const flatSunlight = sunIntensity * (lambert * 0.84 + backscatter * 0.16) * 2.4;
  const skyLuminance =
    skyHorizonColor.r * 0.2126 + skyHorizonColor.g * 0.7152 + skyHorizonColor.b * 0.0722;
  const flatAmbient = (0.11 + geology.hazeDensity * 0.5) * skyLuminance;
  // The target is a display-space mid-tone rather than a photometric one: this renderer writes
  // shader output straight to the framebuffer with no tone curve, the same as every other surface
  // in the scene, so the number to aim at is what a mid-grey looks like on the glass.
  const groundExposure = Math.min(
    5,
    Math.max(0.6, 0.42 / Math.max(rampLuminance * (flatSunlight + flatAmbient), 0.02)),
  );
  material.setFloat("exposure", groundExposure);
  material.setFloat("strataStrength", geology.strataStrength);
  material.setFloat("strataSpacing", Math.max(0.18, geology.strataSpacing));
  material.setFloat("windStreaks", geology.windStreaks);
  material.setFloat("horizonStart", HALF_EXTENT * 0.72);
  material.setFloat("horizonEnd", HALF_EXTENT * 0.985);
  material.setVector3("patchOrigin", origin);
  material.setFloat("time", 0);
  material.setFloat("seed", geology.seed % 100_000);
  material.setFloat("fineDetailScale", 0.42);
  material.setFloat("coarseDetailScale", 0.072);
  material.setFloat("chemistryScale", 0.026);
  material.setFloat("chemistryStrength", detail.chemistryStrength);
  material.setTexture("chemistryColorMap", textures.chemistry);
  material.setTexture("primaryNormalMap", textures.primary.normal);
  material.setTexture("primaryRoughnessMap", textures.primary.roughness);
  material.setTexture("secondaryNormalMap", textures.secondary.normal);
  material.setVector2(
    "windAxis",
    new Vector2(Math.cos(geology.windDirection), Math.sin(geology.windDirection)),
  );
  material.backFaceCulling = true;
  mesh.material = material;

  /**
   * The liquid surface, built on the same graded grid as the ground beneath it.
   *
   * Sharing the grid is what buys the shoreline: every vertex already knows how far the ground
   * under it is below the waterline, so the depth tint, the shallowing swell and the waterline
   * itself all follow the terrain instead of being drawn as one flat rectangle with a straight
   * edge. Quads with no submerged corner are never emitted at all, so a mostly dry world pays
   * almost nothing for having a lake in one corner of it.
   */
  const buildLiquid = (): SurfaceLiquid | null => {
    if (!liquid) return null;
    // The datum the ground drains toward, lifted by however much of this world is under liquid.
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
    // The same stop the ground is exposed at, so a shore does not change brightness at the
    // waterline — without it the water simply multiplied by zero and rendered black.
    liquidMaterial.setFloat("exposure", groundExposure);
    liquidMaterial.setFloat("waveHeight", liquid.waveHeight);
    liquidMaterial.setFloat("time", 0);
    liquidMaterial.setFloat("seed", geology.seed % 100_000);
    liquidMaterial.setFloat("horizonStart", HALF_EXTENT * 0.72);
    liquidMaterial.setFloat("horizonEnd", HALF_EXTENT * 0.985);
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
      // How far a shadow reaches per unit of caster height, and which way it lies.
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
        if (maxX < -HALF_EXTENT || minX > HALF_EXTENT) continue;

        const ix0 = Math.max(0, Math.floor((inverseGradeAxis(minX) + 1) * 0.5 * resolution));
        const ix1 = Math.min(
          resolution,
          Math.ceil((inverseGradeAxis(maxX) + 1) * 0.5 * resolution),
        );
        const iz0 = Math.max(0, Math.floor((inverseGradeAxis(minZ) + 1) * 0.5 * resolution));
        const iz1 = Math.min(
          resolution,
          Math.ceil((inverseGradeAxis(maxZ) + 1) * 0.5 * resolution),
        );

        for (let iz = iz0; iz <= iz1; iz += 1) {
          const worldZ = gradeAxis((iz / resolution) * 2 - 1);
          for (let ix = ix0; ix <= ix1; ix += 1) {
            const worldX = gradeAxis((ix / resolution) * 2 - 1);
            // Distance along the shadow's axis, and away from it.
            const dx = worldX - localX;
            const dz = worldZ - localZ;
            const along = dx * alongX + dz * alongZ;
            if (along < -caster.radius || along > length + caster.radius) continue;
            const across = Math.abs(dx * -alongZ + dz * alongX);
            // Shadows soften along their length as the sun's disc widens the penumbra, and the
            // far end of a long one has all but dissolved.
            const spread = caster.radius * (1 + along * 0.12);
            if (across > spread) continue;
            const fade = (1 - Math.min(1, Math.max(0, along / Math.max(length, 0.001)))) ** 0.6;
            const soft = 1 - (across / spread) ** 2;
            const shadow = Math.min(0.82, fade * soft * 0.9);
            const index = iz * stride + ix;
            shade[index * 2 + 1] = Math.min(shade[index * 2 + 1] ?? 1, 1 - shadow);
            // A rock also blocks part of the sky right around its foot.
            if (along < caster.radius * 1.2 && across < caster.radius * 1.2) {
              shade[index * 2] = Math.min(shade[index * 2] ?? 1, 0.55);
            }
          }
        }
      }

      mesh.updateVerticesData("uv", shade, false, false);
    },
    shadeAt: (x, z) => {
      const u = inverseGradeAxis(x - origin.x);
      const v = inverseGradeAxis(z - origin.z);
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
      // Central differences on the field itself rather than on the grid: whatever stands here
      // should sit on the ground the shader draws, not on the average of the quad around it.
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
