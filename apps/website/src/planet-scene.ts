import "@babylonjs/core/Culling/ray.js";
import { Engine } from "@babylonjs/core/Engines/engine.js";
import { Color3, Color4 } from "@babylonjs/core/Maths/math.color.js";
import { Vector2, Vector3 } from "@babylonjs/core/Maths/math.vector.js";
import { Effect } from "@babylonjs/core/Materials/effect.js";
import { ShaderMaterial } from "@babylonjs/core/Materials/shaderMaterial.js";
import { StandardMaterial } from "@babylonjs/core/Materials/standardMaterial.js";
import type { AbstractMesh } from "@babylonjs/core/Meshes/abstractMesh.js";
import { Mesh } from "@babylonjs/core/Meshes/mesh.js";
import { MeshBuilder } from "@babylonjs/core/Meshes/meshBuilder.js";
import "@babylonjs/core/Meshes/instancedMesh.js";
import { VertexData } from "@babylonjs/core/Meshes/mesh.vertexData.js";
import { Scene } from "@babylonjs/core/scene.js";
import { TransformNode } from "@babylonjs/core/Meshes/transformNode.js";
import type { ExoplanetProfile } from "@exora/contracts";
import type { Rgb, RingRecipe, WorldRecipe } from "@exora/worldgen";
import { type RenderQualityProfile, shaderDefines } from "./render-quality.ts";
import { createPlanetKeyLight } from "./planet-lighting.ts";
import { bindPlanetSurfaceAssets } from "./planet-material-assets.ts";
import { displaceRockyPlanet } from "./planet-mesh-terrain.ts";
import { type SurfaceGeology, cloudDeckGeology, deriveSurfaceGeology } from "./surface-geology.ts";
import { type SurfaceMotes, createSurfaceMotes } from "./surface-motes.ts";
import { createSurfaceScatter } from "./surface-scatter.ts";
import { type SurfaceVista, createSurfaceVista } from "./surface-vista.ts";
import type { MountedWorld, SceneHost } from "./scene-host.ts";
import { skyViewpointFrom } from "./sky-catalog.ts";
import { createStellarSurface, type StellarSurface } from "./star-surface.ts";
import { createStarfield } from "./star-visuals.ts";
import { markAsVirtualBackground } from "./world-presentation.ts";
import {
  easeAway,
  easeSettle,
  SURFACE_SWAP_AT,
  SURFACE_TRANSITION_MS,
} from "./travel-transition.ts";

const PLANET_POSITION = new Vector3(0, 1.35, 9.5);
const XR_ORBIT_STAND = new Vector3(0, 0, -7.4);
const LIGHT_DIRECTION = new Vector3(-0.82, 0.3, -0.38).normalize();
const DESKTOP_MOVE_SPEED = 5.2;
const SURFACE_GROUND_ORIGIN_Z = 18;
const SURFACE_GROUND_BASE_Y = -1.6;
/** How far out the wheel reaches in a surface excursion, before the ground runs out under it. */
const SURFACE_FAR_LIMIT = 18.4;
/** Scrolling back past this inside a surface excursion is what asks to return to orbit. */
const SURFACE_RETURN_RADIUS = 18.1;
/**
 * Where a jump out of a surface excursion stops pulling back.
 *
 * Short of the radius that asks for orbit, so that leaving the *world* is never read by the view
 * as a request to leave the vista — the return would animate the same camera the flight is on.
 */
const SURFACE_DEPARTURE_RADIUS = 17.6;

/**
 * The distances a descent, and the climb back to orbit, are flown between.
 *
 * Each half of the move carries on the way the visitor's scroll was already going: scrolling in
 * keeps closing on the world until the dark takes it, and comes out of the dark still closing, on
 * ground that is now underfoot. The two `-ENTRY` distances are the ones nobody ever sees, because
 * they are set at the instant the dark is deepest; they exist so that the second half of the move
 * has somewhere to travel from.
 */
const SURFACE_PLUNGE_RADIUS = 7.9;
const SURFACE_ENTRY_RADIUS = 15.6;
const SURFACE_RESTING_RADIUS = 12.8;
const ORBIT_CLIMB_RADIUS = 21.6;
const ORBIT_ENTRY_RADIUS = 10.6;
const ORBIT_RETURN_RADIUS = 12.2;
/** Where the wearer stands when the immersive session drops onto the terrain. */
const XR_SURFACE_STAND = new Vector3(0, 0, 12);
/**
 * How the vista camera sits once it has settled onto the terrain.
 *
 * Babylon measures beta down from straight up, so this is a camera a little above the spot it
 * orbits, looking slightly down at it. It used to look down steeply enough that the sky over the
 * ridge line was a band barely wider than the host star's own disc — nowhere for a star to hang
 * without leaving the frame, which is part of why this one ended up down among the rocks.
 */
const SURFACE_RESTING_BETA = 1.37;
/**
 * Vertical field of view for the vista, in radians.
 *
 * Wider than the orbital view's default 0.8 for two reasons that pull the same way: a horizon
 * needs width to read as a horizon, and the sun sits fourteen degrees up while the camera looks
 * eleven degrees down, so a 46-degree frame would cut the disc off the top of the screen.
 */
const SURFACE_FIELD_OF_VIEW = 1.02;
const ORBIT_FIELD_OF_VIEW = 0.8;
/**
 * Which way the host star lies from anyone standing on the terrain.
 *
 * A sun is a direction and an angular size, at a distance nothing on the ground can be measured
 * against. This one used to be a fixed point 36 units in front of the terrain's origin — inside
 * the patch the wheel and WASD move across — so it behaved like the boulder it was standing next
 * to: walking the vista swung it through forty degrees of sky, doubled its disc, and left it
 * hanging in front of ridges that were further away than it was. Only the direction survives now;
 * the star rides an anchor pinned to the viewer, the same way the vacuum starfield does.
 *
 * Ahead and twenty-seven degrees to the left, which is the strip of sky this camera frames, and
 * fourteen
 * degrees up — mid-afternoon light. Low, because a low sun is what rakes a landscape: it throws
 * every ridge, dune crest and crater rim into a shadow as long as the feature is tall, which is
 * the whole reason the terrain bakes its own shadowing. Not lower, because below about ten degrees
 * a flat surface catches so little of the light that ambient sky glow drowns the shading out and
 * the ground goes back to reading as one flat colour. And to the side rather than straight ahead,
 * because a sun directly down the camera's axis back-lights every rock in the frame into a
 * silhouette; across the view it rakes them, and a raked rock has a shape.
 */
const SURFACE_STAR_DIRECTION = new Vector3(-0.44, 0.245, 0.864).normalize();
/**
 * Far enough out that ridges decide whether the star is visible, rather than standing beside it.
 *
 * Scaled with the ground: the patch now reaches 150 units from its own origin in every direction,
 * so a star at the old 320 was only twice as far away as the far rim — close enough to sit among
 * the terrain rather than beyond all of it.
 */
const SURFACE_STAR_DISTANCE = 900;
/**
 * How wide the host star's disc is in the surface sky, as an angular radius in radians.
 *
 * Distance is a free choice for something drawn as a sky object, so the size that has to be pinned
 * down is the angle it covers — and it is the same angle the old, far closer placement subtended.
 * The floor keeps a modest star from shrinking to a dot in a sky that holds nothing else to judge
 * it against; the slope carries the relative sizes worldgen derives from each system's geometry.
 */
const surfaceStarAngularRadius = (apparentRadiusRadians: number): number =>
  0.021 + apparentRadiusRadians * 0.39;

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

  // Naked-eye stars in the planet's own sky. The lattice only chooses WHERE each star sits; its
  // brightness then falls off from a point inside its cell. Thresholding the cell hash directly
  // instead lights the whole cell, which fills the sky with little squares rather than stars.
  vec2 starGrid = vec2(longitude * 88.0, asin(direction.y) * 104.0);
  vec2 starCell = floor(starGrid);
  vec2 starOffset = vec2(hash(starCell + 3.7), hash(starCell + 8.1));
  float starDistance = length((fract(starGrid) - starOffset) * vec2(1.0, 1.2));
  float magnitude = pow(hash(starCell + 9.4), 4.0) * step(0.84, hash(starCell));
  // A tight core over a wider halo — the same two-term point spread the orbital starfield uses,
  // and the reason a star reads as a light source instead of as a lit pixel.
  float star = (exp(-starDistance * starDistance * 300.0) + exp(-starDistance * 10.0) * 0.14)
    * magnitude;
  // Scintillation. Unlike the vacuum starfield this one really is being viewed through moving
  // air, so the twinkle is physical here, and it deepens with the thickness of that air.
  star *= 1.0 - (0.12 + density * 0.3)
    * (0.5 + 0.5 * sin(time * (2.2 + hash(starCell + 1.3) * 5.0) + hash(starCell) * 40.0));
  star *= smoothstep(0.02, 0.5, direction.y) * starVisibility;
  vec3 starTint = mix(vec3(1.0, 0.79, 0.63), vec3(0.71, 0.84, 1.0), hash(starCell + 5.5));
  sky += starTint * star * 2.6;

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

const KNOWN_BODY_VERTEX_SHADER = `
precision highp float;

attribute vec3 position;
attribute vec3 normal;
attribute vec2 uv;
uniform mat4 world;
uniform mat4 worldViewProjection;
uniform sampler2D heightMap;
uniform float topographyScale;
uniform float useTopography;
varying vec3 vWorldPosition;
varying vec3 vWorldNormal;
varying vec2 vUv;

void main(void) {
  float sampledHeight = texture2D(heightMap, vec2(1.0 - uv.x, uv.y)).r - 0.5;
  vec3 displacedPosition = position + normal * sampledHeight * topographyScale * useTopography;
  vec4 worldPosition = world * vec4(displacedPosition, 1.0);
  vWorldPosition = worldPosition.xyz;
  vWorldNormal = normalize(mat3(world) * normal);
  vUv = uv;
  gl_Position = worldViewProjection * vec4(displacedPosition, 1.0);
}
`;

/**
 * Spacecraft mosaics already contain the geology and cloud structure that procedural noise can
 * only approximate. This shader leaves that color intact and supplies the physically legible
 * pieces a flat map does not carry: a night hemisphere, solar tint, soft limb, and grazing sheen.
 */
const KNOWN_BODY_FRAGMENT_SHADER = `
precision highp float;

varying vec3 vWorldPosition;
varying vec3 vWorldNormal;
varying vec2 vUv;
uniform sampler2D surfaceMap;
uniform vec3 cameraPosition;
uniform vec3 lightDirection;
uniform vec3 stellarColor;
uniform float stellarIntensity;
uniform float time;

void main(void) {
  vec3 normal = normalize(vWorldNormal);
  vec3 viewDirection = normalize(cameraPosition - vWorldPosition);
  float diffuse = max(dot(normal, lightDirection), 0.0);
  float wrappedLight = 0.055 + diffuse * 0.98;
  float rim = pow(1.0 - max(dot(normal, viewDirection), 0.0), 3.2);
  vec3 halfDirection = normalize(lightDirection + viewDirection);
  float sheen = pow(max(dot(normal, halfDirection), 0.0), 54.0) * 0.12;
  vec3 mappedColor = texture2D(surfaceMap, vec2(1.0 - vUv.x, vUv.y)).rgb;
  vec3 litColor = mappedColor * wrappedLight * mix(vec3(1.0), stellarColor, diffuse * 0.2);
  litColor *= stellarIntensity;
  litColor += mappedColor * rim * 0.08 + vec3(1.0) * sheen;
  gl_FragColor = vec4(litColor, 1.0);
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
  // The storm noise field is sampled once outside the loop and each storm reads it at a
  // different threshold and latitude band -- sampling fbm per storm instead would trip the
  // per-pixel cost of this shader by itself, and buys no visible variation the offsets below
  // do not already give.
  float stormField = fbm(rotateY(surface, -flow * 1.6) * 5.5 + vec3(12.4, 4.2, 8.7));
  float stormMask = 0.0;
  int activeStorms = int(min(stormCount, float(MAX_GIANT_STORMS)));
  for (int i = 0; i < MAX_GIANT_STORMS; i++) {
    if (i >= activeStorms) continue;
    float fi = float(i);
    float indexHash = hash(vec3(seed * 0.00023 + fi * 6.7, fi * 4.1, fi * 8.3));
    float thisLatitude = clamp(stormLatitude + (indexHash - 0.5) * (0.15 + fi * 0.3), -1.2, 1.2);
    float latitudeMask = 1.0 - smoothstep(0.06, 0.42, abs(latitude - thisLatitude));
    float thisStrength = stormStrength * (1.0 - fi * 0.28);
    float thisShift = fract(stormColorShift + indexHash * 0.6 + fi * 0.21);
    float threshold = 0.62 + indexHash * 0.12;
    stormMask += smoothstep(threshold, threshold + 0.28, stormField) * thisStrength * latitudeMask * (0.7 + thisShift * 0.3);
  }
  stormMask = clamp(stormMask, 0.0, 1.0);

  float pole = pow(smoothstep(0.55, 1.3, abs(latitude)), 2.0);

  float depthMix = clamp(0.3 + hazeNoise * 0.5 + detail * 0.08, 0.0, 1.0);
  depthMix = pow(depthMix, mix(1.4, 0.7, clamp(atmosphereDepth, 0.0, 1.0)));
  vec3 atmosphereColor = mix(deepColor, hazeColor, depthMix);
  float filament = smoothstep(0.58, 0.86, detail) * (0.35 + bands * 0.65);
  atmosphereColor = mix(
    atmosphereColor,
    lightColor,
    clamp(bands * 0.32 + stormMask * 0.82 + filament * 0.13, 0.0, 1.0)
  );
  // Strong haze flattens contrast further -- the defining difference from a gas giant's crisper
  // cloud definition.
  atmosphereColor = mix(atmosphereColor, hazeColor, clamp(haze, 0.0, 1.0) * 0.22);
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
uniform float elevation;
uniform float planetRadius;

varying vec3 vWorldPosition;
varying vec3 vWorldNormal;
varying vec3 vSurfacePosition;
varying vec3 vObjectPosition;
varying float vHeight;

void main(void) {
  // Geometry is displaced once, CPU-side. Recover the actual displaced height here so coastlines,
  // snow lines, and material transitions follow the visible terrain instead of an unrelated
  // cosmetic noise field.
  vec3 direction = normalize(position);
  float terrainHeight = (length(position) - planetRadius) / max(elevation * 0.5, 0.0001);
  vec4 worldPosition = world * vec4(position, 1.0);

  vHeight = clamp(0.5 + terrainHeight * 0.25, 0.0, 1.0);
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

#ifdef SURFACE_COLOR_DETAIL
uniform sampler2D chemistryColorMap;
uniform float chemistryScale;
uniform float chemistryStrength;
uniform float colorDetailFadeStart;
uniform float colorDetailFadeEnd;
#endif

#ifdef SURFACE_MICRODETAIL
uniform sampler2D primaryNormalMap;
uniform sampler2D primaryRoughnessMap;
uniform sampler2D secondaryNormalMap;
uniform sampler2D secondaryRoughnessMap;
uniform float primaryDetailScale;
uniform float secondaryDetailScale;
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

#if defined(SURFACE_COLOR_DETAIL) || defined(SURFACE_MICRODETAIL)
/** Sharpened per-axis blend weights for object-space triplanar sampling (Babylon translates
 * texture2D/attribute/varying to their WebGL2 equivalents automatically). */
vec3 triplanarBlend(vec3 objectNormal) {
  vec3 blend = pow(abs(objectNormal), vec3(4.0));
  return blend / max(blend.x + blend.y + blend.z, 0.0001);
}
#endif

#ifdef SURFACE_MICRODETAIL
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

#ifdef SURFACE_COLOR_DETAIL
vec3 sampleTriplanarColor(sampler2D tex, vec3 p, vec3 blend) {
  vec3 sx = texture2D(tex, p.yz).rgb;
  vec3 sy = texture2D(tex, p.zx).rgb;
  vec3 sz = texture2D(tex, p.xy).rgb;
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
#if defined(SURFACE_COLOR_DETAIL) || defined(SURFACE_MICRODETAIL)
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
#endif

#ifdef SURFACE_COLOR_DETAIL
  float cameraDistance = length(cameraPosition - vWorldPosition);
  float chemistryFade = 1.0 - smoothstep(colorDetailFadeStart, colorDetailFadeEnd, cameraDistance);
  vec3 chemistryColor = sampleTriplanarColor(
    chemistryColorMap,
    detailPosition * chemistryScale,
    triBlend
  );
#endif

#ifdef SURFACE_MICRODETAIL
  // Each chemistry family selects two physically appropriate 2K materials. The secondary map
  // emerges on slopes, crater rims, highlands, and fractures, replacing the old five-family
  // branch forest with a predictable twelve texture samples per fragment.
  float slope = 1.0 - clamp(dot(baseNormal, surface), 0.0, 1.0);
  float secondaryWeight = clamp(
    slope * 1.4 + craterRim * 1.6 + crater * 0.35 + erosion * 0.12 + fractures * 0.45,
    0.0,
    1.0
  );
  vec3 primaryPosition = detailPosition * primaryDetailScale;
  vec3 secondaryPosition = detailPosition * secondaryDetailScale;
  vec3 primaryNormal = sampleTriplanarNormal(primaryNormalMap, primaryPosition, triBlend, objectNormal);
  vec3 secondaryNormal = sampleTriplanarNormal(secondaryNormalMap, secondaryPosition, triBlend, objectNormal);
  detailRoughness = mix(
    sampleTriplanarScalar(primaryRoughnessMap, primaryPosition, triBlend),
    sampleTriplanarScalar(secondaryRoughnessMap, secondaryPosition, triBlend),
    secondaryWeight
  );
  vec3 objectDetailNormal = normalize(mix(primaryNormal, secondaryNormal, secondaryWeight));

  // Fade microdetail out with distance: rich up close, smooth again from orbit so the planet
  // does not read as sandpaper in a wide shot.
  float normalDetailFade = 1.0 - smoothstep(
    detailFadeStart,
    detailFadeEnd,
    length(cameraPosition - vWorldPosition)
  );
  vec3 worldDetailNormal = normalize(mat3(world) * objectDetailNormal);
  normal = normalize(mix(normal, worldDetailNormal, 0.52 * normalDetailFade));
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

#ifdef SURFACE_COLOR_DETAIL
  // Preserve macro palette readability while borrowing real grain and mineral hue variation from
  // the chemistry texture. Luminance-relative tinting prevents a dark carbon map from simply
  // crushing all procedural elevation color to black.
  float chemistryLuminance = max(dot(chemistryColor, vec3(0.2126, 0.7152, 0.0722)), 0.08);
  vec3 relativeChemistry = clamp(chemistryColor / chemistryLuminance, vec3(0.45), vec3(1.8));
  vec3 chemicallyTextured = rockColor * relativeChemistry * (0.78 + chemistryLuminance * 0.36);
  rockColor = mix(
    rockColor,
    chemicallyTextured,
    chemistryStrength * chemistryFade * (1.0 - polarMask * 0.5)
  );
#endif

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
  float wrappedLight = 0.22 + diffuse * 0.94;
  // Camera exposure adapts to the host system: stellarIntensity still changes highlights and hue,
  // but a dim M-dwarf no longer hides the surface material the visualization is meant to show.
  float surfaceExposure = 0.78 + clamp(stellarIntensity, 0.65, 3.2) * 0.2;
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

  vec3 finalColor = surfaceColor * wrappedLight * mix(vec3(1.0), stellarColor, diffuse * 0.38) * surfaceExposure;
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
  // Higher base frequency prevents the cloud shell from reading as a handful of blurry polygons
  // at orbital distance while still leaving room for recognizable planetary-scale systems.
  vec3 samplePosition = normal * (cloudScale * 1.7 + 4.2) + drift;
  float cloudNoise = fbm(samplePosition);

#ifdef CLOUD_DETAIL
  // A second, higher-frequency octave group sampled at a different scale/speed than the base
  // layer, so the cloud field reads as multi-scale structure (large systems + fine wisps)
  // instead of one blob of noise. Skipped on fill-rate-constrained tiers.
  vec3 fineSamplePosition = normal * (cloudScale * 4.6 + 11.0) - drift * 1.7;
  float fineNoise = fbm(fineSamplePosition + cloudNoise * 0.6);
  float billows = 1.0 - abs(fineNoise * 2.0 - 1.0);
  cloudNoise = cloudNoise * 0.76 + fineNoise * 0.17 + billows * 0.07;
#endif

  float threshold = mix(0.74, 0.43, cloudCover);
  float cloud = smoothstep(threshold, threshold + mix(0.065, 0.11, cloudCover), cloudNoise);
  vec3 viewDirection = normalize(cameraPosition - vWorldPosition);
  float rim = pow(1.0 - max(dot(normal, viewDirection), 0.0), 2.2);
  float diffuse = 0.28 + max(dot(normal, lightDirection), 0.0) * 0.78;
  vec3 litCloud = cloudColor * mix(vec3(1.0), stellarColor, 0.28) * (diffuse + rim * 0.38);
  gl_FragColor = vec4(litCloud, cloud * (0.14 + cloudCover * 0.34));
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

export type ViewMode = "orbit" | "subsystem" | "surface" | "transition";

interface PlanetWorldOptions {
  onFirstFrame: () => void;
  onViewModeChange: (mode: ViewMode) => void;
  planet: ExoplanetProfile;
  recipe: WorldRecipe;
}

const toColor3 = ([red, green, blue]: Rgb): Color3 => new Color3(red, green, blue);

const HOST_STAR_OFFSET = new Vector3(-18, 11, 32);

/**
 * The planet's own sun, hanging in its sky.
 *
 * This used to be a flat emissive sphere with a translucent shell around it, which is a shape lit
 * from nowhere rather than a light source: it read as a grey ping-pong ball taped to the
 * background. It is now the same photosphere the star scene draws, at `distant` detail — real
 * limb darkening and granulation on the disc, and a glare with diffraction spikes carrying the
 * brightness that the display cannot.
 */
const createHostStar = (
  scene: Scene,
  recipe: WorldRecipe,
  profile: RenderQualityProfile,
  parent: TransformNode,
): StellarSurface => {
  const surface = createStellarSurface({
    detail: "distant",
    diameter: recipe.star.radiusSceneUnits * 2,
    parent,
    pickable: false,
    position: PLANET_POSITION.add(HOST_STAR_OFFSET),
    profile,
    recipe: recipe.star,
    scene,
    seed: recipe.seed,
    spotCoverage: recipe.star.spotCoverage,
  });

  return surface;
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

const createPlanet = (
  scene: Scene,
  recipe: WorldRecipe,
  profile: RenderQualityProfile,
  planetProfile: ExoplanetProfile,
): {
  atmosphere: ShaderMaterial;
  atmosphereMesh: Mesh;
  cloudLayer: ShaderMaterial | null;
  cloudMesh: Mesh | null;
  orbitalMeshes: AbstractMesh[];
  orbitalRoot: TransformNode;
  planet: Mesh;
  planetRoot: TransformNode;
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
  Effect.ShadersStore.exoraKnownBodyVertexShader = KNOWN_BODY_VERTEX_SHADER;
  Effect.ShadersStore.exoraKnownBodyFragmentShader = KNOWN_BODY_FRAGMENT_SHADER;

  const orbitalRoot = new TransformNode("orbitalWorld", scene);
  const planetRoot = new TransformNode("planetAssembly", scene);
  planetRoot.parent = orbitalRoot;
  const orbitalMeshes: AbstractMesh[] = [];

  // Rocky worlds get an icosphere: its near-uniform vertex distribution avoids the pinched
  // triangles a UV sphere has at the poles, which otherwise show up as displacement/crater
  // artifacts once terrain pushes vertices in and out along their normals. Gas/ice giants have
  // no vertex displacement, so they keep the cheaper UV sphere.
  const knownTexture = planetProfile.solarSystem?.texture;
  const planet =
    recipe.renderer === "rocky" && !knownTexture
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
  planet.parent = planetRoot;
  const measuredDimensions = planetProfile.solarSystem?.dimensionsKilometers;
  const meanDiameterKilometers = (planetProfile.observation.radiusEarth ?? 1) * 6_371 * 2;
  if (measuredDimensions && meanDiameterKilometers > 0) {
    planet.scaling.set(
      measuredDimensions[0] / meanDiameterKilometers,
      measuredDimensions[2] / meanDiameterKilometers,
      measuredDimensions[1] / meanDiameterKilometers,
    );
  }
  const axialTilt =
    planetProfile.solarSystem?.axialTiltDegrees === null || !planetProfile.solarSystem
      ? recipe.axialTilt
      : (planetProfile.solarSystem.axialTiltDegrees * Math.PI) / 180;
  planet.rotation.z = axialTilt;
  planet.isPickable = true;
  orbitalMeshes.push(planet);

  if (recipe.renderer === "rocky" && !knownTexture) {
    displaceRockyPlanet(planet, recipe);
  }

  let shader: ShaderMaterial;

  if (knownTexture) {
    shader = new ShaderMaterial(
      "knownSolarSystemBodyMaterial",
      scene,
      { vertex: "exoraKnownBody", fragment: "exoraKnownBody" },
      {
        attributes: ["position", "normal", "uv"],
        uniforms: [
          "world",
          "worldViewProjection",
          "cameraPosition",
          "lightDirection",
          "stellarColor",
          "stellarIntensity",
          "topographyScale",
          "time",
          "useTopography",
        ],
        samplers: ["heightMap", "surfaceMap"],
      },
    );
  } else if (recipe.renderer === "rocky") {
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
          "planetRadius",
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
          ...(profile.surfaceColorDetail
            ? ["chemistryScale", "chemistryStrength", "colorDetailFadeStart", "colorDetailFadeEnd"]
            : []),
          ...(profile.surfaceMicrodetail
            ? ["primaryDetailScale", "secondaryDetailScale", "detailFadeStart", "detailFadeEnd"]
            : []),
        ],
        samplers: [
          ...(profile.surfaceColorDetail ? ["chemistryColorMap"] : []),
          ...(profile.surfaceMicrodetail
            ? [
                "primaryNormalMap",
                "primaryRoughnessMap",
                "secondaryNormalMap",
                "secondaryRoughnessMap",
              ]
            : []),
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

  if (knownTexture || recipe.renderer === "rocky") {
    bindPlanetSurfaceAssets(scene, shader, recipe, profile, planetProfile);
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
    ? createRingSystem(scene, profile, recipe.radiusSceneUnits, ringRecipe, recipe.star, axialTilt)
    : null;
  const ringSystem = ringBuild?.system ?? null;
  const ringMaterial = ringBuild?.material ?? null;
  if (ringSystem) {
    ringSystem.parent = planetRoot;
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
    cloudMesh.parent = planetRoot;
    cloudMesh.rotation.z = axialTilt;
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
  atmosphereMesh.parent = planetRoot;
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

  return {
    atmosphere,
    atmosphereMesh,
    cloudLayer,
    cloudMesh,
    orbitalMeshes,
    orbitalRoot,
    planet,
    planetRoot,
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

/** What a sky with nothing in it looks like: not quite black, because the zodiacal light and the
 * unresolved stars behind it are not quite nothing. */
const AIRLESS_SKY: Rgb = [0.003, 0.004, 0.008];

const createSurfaceSky = (
  scene: Scene,
  parent: TransformNode,
  recipe: WorldRecipe,
  geology: SurfaceGeology | null,
  profile: RenderQualityProfile,
): { horizonColor: Color3; material: ShaderMaterial; mesh: Mesh; zenithColor: Color3 } => {
  Effect.ShadersStore.exoraSkyVertexShader = SKY_VERTEX_SHADER;
  Effect.ShadersStore.exoraSkyFragmentShader = SKY_FRAGMENT_SHADER;
  const atmosphere = recipe.atmosphere.color;
  const isGasGiant = recipe.renderer === "gas-giant";
  const isIceGiant = recipe.renderer === "ice-giant";
  /**
   * How much air there is to look through, which is the one number a sky is made of.
   *
   * This used to start at 0.25 for every rocky world and climb with cloud cover, so the Moon —
   * which has no atmosphere at all, and whose sky is black at noon with the sun blazing in it —
   * got a quarter-density blue one. The geology's own haze figure is the honest answer: zero on
   * the Moon and Mercury, a hundredth on Europa, a third on Mars where suspended dust does the
   * scattering, and nearly total on Venus and Titan.
   */
  const air = geology
    ? Math.min(1, Math.max(0, geology.hazeDensity))
    : Math.min(1, Math.max(0, recipe.renderer === "rocky" ? recipe.atmosphere.density : 1));
  const cloudiness = isGasGiant
    ? 0.94
    : isIceGiant
      ? 0.8
      : Math.min(1, recipe.surface.cloudCover * air * 1.6);
  const density = isGasGiant ? 1 : isIceGiant ? 0.9 : air;
  // What this world's air actually scatters. The geology states it outright for a body a mission
  // has stood on or flown through; everything else falls back to the recipe's inferred colour.
  const skyTint = geology ? geology.skyColor : atmosphere;
  const zenithColor = isGasGiant
    ? mixColor3(atmosphere, recipe.cloudBands.deepColor, 0.62)
    : isIceGiant
      ? mixColor3(atmosphere, recipe.atmosphereBands.deepColor, 0.66)
      : // Deeper and darker overhead than at the horizon, because that is the shorter path
        // through the air — the same reason Earth's zenith is a stronger blue than its skyline.
        mixColor3(AIRLESS_SKY, skyTint, Math.min(1, air ** 0.6 * 1.15) * 0.72);
  const horizonColor = isGasGiant
    ? mixColor3(atmosphere, recipe.cloudBands.lightColor, 0.35)
    : isIceGiant
      ? mixColor3(atmosphere, recipe.atmosphereBands.hazeColor, 0.38)
      : mixColor3(
          AIRLESS_SKY,
          mixColor3(skyTint, [1, 0.94, 0.86], 0.22).asArray() as unknown as Rgb,
          Math.min(1, air ** 0.5 * 1.25),
        );
  const cloudColor = isGasGiant
    ? toColor3(recipe.cloudBands.lightColor)
    : isIceGiant
      ? toColor3(recipe.atmosphereBands.hazeColor)
      : toColor3(recipe.surface.cloudColor);
  // Wide enough that the whole terrain patch stays inside it from every corner a visitor can
  // stand in, with the star hanging inside it too. The dome writes no depth, so nothing sorts
  // against it — but ground that ends up outside it is ground the sky can be drawn over, and
  // pinning the dome to the viewer puts the far side of an 82-unit patch well outside the
  // 90-unit radius it used to have.
  const mesh = markAsVirtualBackground(
    MeshBuilder.CreateSphere(
      "surfaceSky",
      { diameter: 1_400, segments: profile.tier === "desktop" ? 40 : 24 },
      scene,
    ),
  );
  mesh.parent = parent;
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
  // Stars burn through a thin sky in broad daylight — from the Moon they are there the whole time,
  // and only a real atmosphere scatters enough light to hide them.
  material.setFloat(
    "starVisibility",
    isGasGiant ? 0 : isIceGiant ? 0.02 : Math.max(0, 1 - air * 2.2),
  );
  material.setColor3("horizonColor", horizonColor);
  material.setColor3("zenithColor", zenithColor);
  material.setColor3("cloudColor", cloudColor);
  material.backFaceCulling = false;
  material.disableDepthWrite = true;
  mesh.material = material;
  // The ground reads these back: a lit sky is the ambient source for everything under it, and its
  // colour is what distance fades into. Sharing the values is what keeps the two agreeing.
  return { horizonColor, material, mesh, zenithColor };
};

const createSurfaceEnvironment = (
  scene: Scene,
  recipe: WorldRecipe,
  geology: SurfaceGeology | null,
  profile: RenderQualityProfile,
): {
  cloudLayers: Mesh[];
  /** World-space ground height under any point a visitor can reach. */
  groundHeightAt: (x: number, z: number) => number;
  meshes: AbstractMesh[];
  motes: SurfaceMotes | null;
  root: TransformNode;
  sky: ShaderMaterial;
  skyAnchor: TransformNode;
  star: StellarSurface;
  vista: SurfaceVista | null;
} => {
  const root = new TransformNode("surfaceEnvironment", scene);
  // What the vista treats as unreachably far — the sky dome, and the host star hanging on it —
  // rides this instead of the ground, and the render loop pins it to wherever the viewer is.
  // Babylon's own `infiniteDistance` cannot do the job: it is skipped outright on a parented mesh
  // (`transformNode.ts` applies it only when `!this.parent`), so the flag the dome carried had no
  // effect and the sky slid with every step, tipping its own horizon as it went.
  const skyAnchor = new TransformNode("surfaceSkyAnchor", scene);
  skyAnchor.parent = root;
  const meshes: AbstractMesh[] = [];
  const random = createSeededRandom(recipe.seed ^ 0x9e3779b9);
  const surfaceSky = createSurfaceSky(scene, skyAnchor, recipe, geology, profile);
  meshes.push(surfaceSky.mesh);
  let motes: SurfaceMotes | null = null;

  // Rocky worlds get real ground: measured or inferred geology, landform provinces, baked sun
  // shadowing and triplanar material. A giant has no ground at all, so it gets the top of its own
  // convecting cloud layer instead — the same horizon, air and light, none of the rock.
  const vista = geology
    ? createSurfaceVista(scene, {
        geology,
        liquid:
          geology.liquidLevel !== null && recipe.renderer === "rocky"
            ? {
                deepColor: geology.liquidColor,
                shallowColor: geology.liquidShallowColor,
                // Thin, cold air raises almost no swell; a thick atmosphere raises a lot of it.
                waveHeight: 0.5 + geology.hazeDensity * 1.4,
              }
            : null,
        origin: new Vector3(0, SURFACE_GROUND_BASE_Y, SURFACE_GROUND_ORIGIN_Z),
        parent: root,
        profile,
        skyHorizonColor: surfaceSky.horizonColor,
        skyZenithColor: surfaceSky.zenithColor,
        sunColor: toColor3(recipe.star.color),
        sunDirection: SURFACE_STAR_DIRECTION,
        sunIntensity: Math.min(2.6, Math.max(0.85, recipe.star.intensity)),
      })
    : null;

  if (vista && geology) {
    meshes.push(vista.mesh);
    if (vista.liquid) meshes.push(vista.liquid.mesh);
    // Loose rock, sharing the ground's material so it takes the same sun, the same baked shadow
    // and the same air — and merged into one mesh, so the whole field costs a single draw call.
    const scatter = createSurfaceScatter(scene, {
      geology,
      material: vista.material,
      origin: new Vector3(0, SURFACE_GROUND_BASE_Y, SURFACE_GROUND_ORIGIN_Z),
      parent: root,
      profile,
      vista,
    });
    if (scatter) meshes.push(scatter);

    // Whatever this world holds up in its air, between the eye and everything else.
    motes = createSurfaceMotes(scene, {
      geology,
      parent: skyAnchor,
      profile,
      skyHorizonColor: surfaceSky.horizonColor,
      sunColor: toColor3(recipe.star.color),
      sunDirection: SURFACE_STAR_DIRECTION,
    });
    if (motes) meshes.push(motes.mesh);
  }

  const cloudLayers: Mesh[] = [];
  /**
   * No drifting haze banks any more, on any world.
   *
   * Every excursion's sky is drawn by the dome above it and its distance by the vista's own aerial
   * perspective, and both of those know what that world's air is made of. These flattened emissive
   * spheres knew neither: on the Moon one hung over a black airless sky as a lit ellipse, and over
   * Jupiter's cloud deck they read as saucers cut out of the sky. Kept as an empty list so the
   * render loop and the world's own teardown keep their shape.
   */
  const hazeCount = 0;
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

  // The same star as the orbital view, seen from under the planet's air. It keeps the real
  // photosphere and the glare rather than the flat emissive ball plus alpha shell it used to be —
  // through an atmosphere the glare is if anything more of the read, not less, since scattering
  // spreads a bright source out much further than vacuum does.
  const surfaceStar = createStellarSurface({
    detail: "distant",
    diameter:
      SURFACE_STAR_DISTANCE * 2 * surfaceStarAngularRadius(recipe.star.apparentRadiusRadians),
    parent: skyAnchor,
    pickable: false,
    position: SURFACE_STAR_DIRECTION.scale(SURFACE_STAR_DISTANCE),
    profile,
    recipe: recipe.star,
    // Group 1 puts the star over the sky dome, which draws in group 0 without a depth write.
    renderingGroupId: 1,
    scene,
    seed: recipe.seed,
    spotCoverage: recipe.star.spotCoverage,
  });
  meshes.push(...surfaceStar.meshes);

  // Air thick enough and the sun is not a disc any more: Huygens saw no sun at all from Titan's
  // surface, and neither Venera nor Magellan ever resolved one through Venus's cloud deck. What
  // reaches the ground is the whole sky glowing, which the dome above is already drawing.
  if (geology && geology.hazeDensity > 0.85) {
    for (const target of surfaceStar.meshes) {
      target.isVisible = false;
      target.setEnabled(false);
    }
    meshes.splice(0, meshes.length, ...meshes.filter((mesh) => !surfaceStar.meshes.includes(mesh)));
  }

  for (const mesh of meshes) {
    mesh.isVisible = false;
    mesh.setEnabled(false);
  }
  root.setEnabled(false);
  return {
    cloudLayers,
    groundHeightAt: vista ? vista.heightAt : () => SURFACE_GROUND_BASE_Y,
    meshes,
    motes,
    root,
    sky: surfaceSky.material,
    skyAnchor,
    star: surfaceStar,
    vista,
  };
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

/**
 * Builds a planet into the shared scene.
 *
 * Everything expensive here — terrain displacement, shader compilation, the rock field — runs
 * synchronously, which is what lets `world-scope.ts` tell exactly what this world added to a
 * scene it does not own. The host fades the headset to black around the call.
 */
export const createPlanetWorld = (
  host: SceneHost,
  { onFirstFrame, onViewModeChange, planet: planetProfile, recipe }: PlanetWorldOptions,
): MountedWorld => {
  const { camera, canvas, engine, profile, scene } = host;

  // Babylon clears the depth buffer between rendering groups by default. Group 1 holds every
  // additive shell in the scene (the planet's atmosphere and cloud layers, the host star's
  // corona, the surface-view star halo), so with the depth buffer wiped they drew over the
  // opaque planet instead of behind it — which read as the planet being semi-transparent with
  // the star shining through it. Keeping group 0's depth lets those shells occlude correctly;
  // they still show around the limb, where no opaque geometry is in front of them.
  scene.setRenderingAutoClearDepthStencil(1, false, true, true);

  // The target moves first, and everything else after it. `setTarget` rebuilds alpha, beta and
  // radius from wherever the camera was left standing by the previous destination, so angles and
  // distances assigned before it are silently thrown away — which framed every arriving world
  // from the last one's viewpoint rather than from its own.
  camera.setTarget(PLANET_POSITION.clone());
  camera.lowerRadiusLimit = 10.5;
  camera.upperRadiusLimit = 25;
  camera.lowerBetaLimit = 0.58;
  camera.upperBetaLimit = Math.PI - 0.58;
  camera.alpha = -Math.PI / 2;
  camera.beta = Math.PI / 2.13;
  camera.radius = 17.2;
  if (!host.isInXr()) camera.attachControl(canvas, true);

  createPlanetKeyLight(scene, LIGHT_DIRECTION, recipe.star);

  // The archive reports where this planet's host system is on the sky and how far away it is, so
  // the orbital view can be given the sky that system actually has. A procedural world, or a
  // catalogue row missing any of the three, falls back to the seeded field.
  const starfield = createStarfield({
    count: profile.starCount,
    scene,
    seed: recipe.seed,
    viewpoint: skyViewpointFrom(planetProfile.observation),
  });
  const {
    atmosphere,
    cloudLayer,
    cloudMesh,
    orbitalMeshes,
    orbitalRoot,
    planet,
    ringMaterial,
    ringSystem,
    shader,
  } = createPlanet(scene, recipe, profile, planetProfile);
  const hostStar = createHostStar(scene, recipe, profile, orbitalRoot);
  orbitalMeshes.push(...hostStar.meshes);
  // The deep-space starfield belongs to the orbital view only. Down on the surface the sky shader
  // owns what the sky contains, and it has to: stars there are seen through an atmosphere that
  // scatters them out entirely in daylight, so a vacuum starfield shining through a lit sky would
  // be showing the viewer something no one standing on that planet could see.
  orbitalMeshes.push(starfield.mesh);
  // Measured geology for a Solar System body, inferred geology for a catalogue world, and nothing
  // at all for a giant — which has no ground for a visitor to stand on in the first place.
  const surfaceGeology =
    deriveSurfaceGeology(
      recipe,
      planetProfile.solarSystem
        ? {
            naifId: planetProfile.solarSystem.naifId,
            ...(planetProfile.solarSystem.surfaceStatus
              ? { surfaceStatus: planetProfile.solarSystem.surfaceStatus }
              : {}),
          }
        : null,
    ) ?? cloudDeckGeology(recipe);
  const surfaceEnvironment = createSurfaceEnvironment(scene, recipe, surfaceGeology, profile);

  let elapsedSeconds = 0;
  const displayRotationSpeed = planetProfile.solarSystem?.rotationPeriodHours
    ? Math.sign(planetProfile.solarSystem.rotationPeriodHours) *
      Math.min(
        0.22,
        Math.max(
          0.008,
          0.085 * (24 / Math.abs(planetProfile.solarSystem.rotationPeriodHours)) ** 0.32,
        ),
      )
    : recipe.rotationSpeed;
  let viewState: "entering" | "leaving" | "orbit" | "surface" = "orbit";
  let viewTransitionSeconds = 0;
  /** Where the visitor's own scroll had got to when it asked for the other view. */
  let viewTransitionFrom = 0;
  let viewTransitionSwapped = false;
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

  /**
   * Hands the world over to the other half of itself, at the instant the dark is deepest.
   *
   * Everything that cannot be moved through goes here together: the ground and sky appearing or
   * being taken away, the fog, the colour behind it all, and where the camera is pointing and
   * from what angle. Doing any of it a frame earlier or later puts it on screen, and a world that
   * changes out from under a moving camera reads as a glitch rather than as an arrival.
   */
  const swapViewEnvironment = (entering: boolean): void => {
    applyViewEnvironment(entering);
    camera.fov = entering ? SURFACE_FIELD_OF_VIEW : ORBIT_FIELD_OF_VIEW;
    if (entering) {
      surfaceTarget.y = surfaceEnvironment.groundHeightAt(surfaceTarget.x, surfaceTarget.z) + 1.15;
    }
    camera.target = (entering ? surfaceTarget : orbitTarget).clone();
    camera.alpha = -Math.PI / 2;
    camera.beta = entering ? SURFACE_RESTING_BETA : Math.PI / 2.13;
    // A visitor who asked for less movement is put down where the view rests, and the dark that
    // was covering the flight covers a plain cut instead.
    camera.radius = host.prefersReducedMotion()
      ? entering
        ? SURFACE_RESTING_RADIUS
        : ORBIT_RETURN_RADIUS
      : entering
        ? SURFACE_ENTRY_RADIUS
        : ORBIT_ENTRY_RADIUS;
  };

  const finishViewTransition = (entering: boolean): void => {
    if (!viewTransitionSwapped) swapViewEnvironment(entering);
    viewState = entering ? "surface" : "orbit";
    camera.radius = entering ? SURFACE_RESTING_RADIUS : ORBIT_RETURN_RADIUS;
    camera.lowerRadiusLimit = entering ? 7.5 : 10.5;
    camera.upperRadiusLimit = entering ? SURFACE_FAR_LIMIT : 25;
    camera.lowerBetaLimit = entering ? 1.02 : 0.58;
    camera.upperBetaLimit = entering ? 1.48 : Math.PI - 0.58;
    camera.attachControl(canvas, true);
    onViewModeChange(entering ? "surface" : "orbit");
  };

  const beginViewTransition = (direction: "entering" | "leaving"): void => {
    if (viewState !== "orbit" && viewState !== "surface") return;
    viewState = direction;
    viewTransitionSeconds = 0;
    viewTransitionFrom = camera.radius;
    viewTransitionSwapped = false;
    camera.detachControl();
    // The environment stays as it is for now. It used to change here, at the top of the move,
    // where the veil covering it had not begun to darken — so the world being left vanished in
    // one frame and the camera then flew through whatever had replaced it.
    onViewModeChange("transition");
  };

  // A/X has one immersive-world action: point at the planet and press once to enter terrain.
  planet.metadata = {
    ...planet.metadata,
    exoraXrPrimaryAction: () => {
      if (host.isInXr() && viewState === "orbit") applyXrView(true, false);
    },
  };
  const renderObserver = scene.onBeforeRenderObservable.add(() => {
    const isInXr = host.isInXr();
    // Two clocks, deliberately. Anything that integrates — walking, rotation, drifting cloud —
    // reads the clamped one, so that a single long frame cannot teleport it across the world.
    // Anything with a fixed duration reads the real one, because clamping *that* is what makes a
    // move take five seconds on a machine drawing three frames a second: every frame advances it
    // by fifty milliseconds however long the frame really was, and the camera falls out of step
    // with the dark on screen that is covering for it.
    const realDeltaSeconds = engine.getDeltaTime() / 1_000;
    const deltaSeconds = Math.min(realDeltaSeconds, 0.05);
    elapsedSeconds += deltaSeconds;

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
        // A wearer walking the terrain has to stay on it. Without this the rig keeps whatever
        // height it started at and the ground rises through the floor or drops away underfoot,
        // which in a headset is not a visual glitch — it is the thing that makes people ill.
        const rig = host.xrCamera();
        if (rig && viewState === "surface") {
          const standing =
            surfaceEnvironment.groundHeightAt(rig.position.x, rig.position.z) + rig.realWorldHeight;
          rig.position.y += (standing - rig.position.y) * Math.min(1, deltaSeconds * 6);
        }
      } else {
        camera.target.addInPlace(movementDelta);
        if (viewState === "surface") {
          // How far a visitor may walk from where they landed. Well inside the patch, so the eye
          // never approaches the rim where the ground dissolves — and near enough the middle that
          // the host star stays far beyond every piece of ground between it and the viewer.
          camera.target.x = Math.min(55, Math.max(-55, camera.target.x));
          camera.target.z = Math.min(76, Math.max(-40, camera.target.z));
          surfaceTarget.copyFrom(camera.target);
        } else {
          orbitTarget.copyFrom(camera.target);
        }
      }
    }

    // The vista camera walks over ground that now has real relief, so it has to ride it. An arc
    // camera has only one height to give — the target's — and the eye hangs off it at a fixed
    // offset, so both ends are checked and the higher requirement wins: the eye never sinks into
    // a ridge it is standing behind, and the target never floats over a hollow it is looking into.
    if (!isInXr && viewState === "surface") {
      const eyeAboveTarget = camera.radius * Math.cos(camera.beta);
      const underTarget = surfaceEnvironment.groundHeightAt(camera.target.x, camera.target.z);
      const eye = camera.globalPosition;
      const underEye = surfaceEnvironment.groundHeightAt(eye.x, eye.z);
      const wanted = Math.max(underTarget + 1.15, underEye + 1.5 - eyeAboveTarget);
      // Followed rather than snapped: a step onto a boulder should not throw the horizon.
      camera.target.y += (wanted - camera.target.y) * Math.min(1, deltaSeconds * 5.5);
      surfaceTarget.y = camera.target.y;
    }

    if (!isInXr && viewState === "orbit" && camera.radius <= 10.62) beginViewTransition("entering");
    if (!isInXr && viewState === "surface" && camera.radius >= SURFACE_RETURN_RADIUS)
      beginViewTransition("leaving");

    if (viewState === "entering" || viewState === "leaving") {
      // Timed off the clock rather than stepped per frame. What used to be here moved the camera
      // by a fraction of the distance remaining *each frame*, so the same descent took half as
      // long on a 120 Hz display as on a 60 Hz one, arrived somewhere different on each, and
      // never quite reached the end — whatever the decay had got to when the clock ran out was
      // snapped away by the limits going back on.
      viewTransitionSeconds += realDeltaSeconds;
      const progress = Math.min(1, (viewTransitionSeconds * 1_000) / SURFACE_TRANSITION_MS);
      const entering = viewState === "entering";

      if (progress >= SURFACE_SWAP_AT && !viewTransitionSwapped) {
        viewTransitionSwapped = true;
        swapViewEnvironment(entering);
      }

      // One move in one direction, in two halves that never share a frame: away from where the
      // scroll started, then on to where the other view rests.
      if (host.prefersReducedMotion()) {
        // Nothing to fly: the swap above already put the camera where this view rests.
      } else if (viewTransitionSwapped) {
        const settling = (progress - SURFACE_SWAP_AT) / (1 - SURFACE_SWAP_AT);
        const from = entering ? SURFACE_ENTRY_RADIUS : ORBIT_ENTRY_RADIUS;
        const to = entering ? SURFACE_RESTING_RADIUS : ORBIT_RETURN_RADIUS;
        camera.radius = from + (to - from) * easeSettle(settling);
      } else {
        const leaving = entering ? SURFACE_PLUNGE_RADIUS : ORBIT_CLIMB_RADIUS;
        camera.radius =
          viewTransitionFrom +
          (leaving - viewTransitionFrom) * easeAway(progress / SURFACE_SWAP_AT);
      }

      if (progress >= 1) finishViewTransition(entering);
    }

    planet.rotation.y += deltaSeconds * displayRotationSpeed;
    if (ringSystem) ringSystem.rotation.y += deltaSeconds * displayRotationSpeed * 0.045;
    if (cloudMesh && recipe.renderer === "rocky")
      cloudMesh.rotation.y += deltaSeconds * (displayRotationSpeed + recipe.surface.cloudSpeed);
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
    hostStar.update(elapsedSeconds, activePosition);
    // The sky rides the viewer: the dome keeps its horizon level with the eye that is under it,
    // and the star holds one direction and one angular size however far a visitor walks.
    surfaceEnvironment.vista?.update(elapsedSeconds, activePosition);
    surfaceEnvironment.motes?.update(elapsedSeconds, activePosition);
    surfaceEnvironment.skyAnchor.position.copyFrom(activePosition);
    surfaceEnvironment.star.update(elapsedSeconds, activePosition);
    starfield.update(elapsedSeconds, activePosition);
  });

  const firstFrameObserver = scene.onAfterRenderObservable.addOnce(onFirstFrame);

  /**
   * A jump out of this world takes the camera, so a descent still in the air lands first.
   *
   * Both are flights, and both write the same one camera every frame: left to run together they
   * would each undo the other's step, which is the one kind of stutter no amount of easing fixes.
   * Landing rather than freezing is what makes it safe for the jump to come to nothing — a
   * destination the archive cannot resolve flies back to a world that is in one of its two
   * states, not stranded between them with its controls taken away.
   */
  const releaseCameraToTravel = host.onTravelPhase((phase) => {
    if (phase !== "departing") return;
    if (viewState === "entering" || viewState === "leaving") {
      finishViewTransition(viewState === "entering");
    }
  });

  /**
   * Moves the rig to the spot that makes sense for a view.
   *
   * On the very first pose Babylon has yet to add the wearer's real height to the rig, so the
   * position it expects is the floor. Every later move happens mid-session, where the camera
   * already sits at head height and the offset has to be added back by hand.
   */
  const placeXrCamera = (surface: boolean, initial: boolean): void => {
    const rig = host.xrCamera();
    if (!rig) return;
    const headOffset = initial ? 0 : rig.realWorldHeight;
    if (surface) {
      const groundY = surfaceEnvironment.groundHeightAt(XR_SURFACE_STAND.x, XR_SURFACE_STAND.z);
      rig.position.set(XR_SURFACE_STAND.x, groundY + headOffset, XR_SURFACE_STAND.z);
      rig.setTarget(new Vector3(XR_SURFACE_STAND.x, groundY + 1.4, XR_SURFACE_STAND.z + 18));
    } else {
      rig.position.set(XR_ORBIT_STAND.x, XR_ORBIT_STAND.y + headOffset, XR_ORBIT_STAND.z);
      rig.setTarget(PLANET_POSITION);
    }
  };

  /** Restores the desktop camera so leaving the headset lands on the view the wearer left in. */
  const syncDesktopCamera = (surface: boolean): void => {
    camera.fov = surface ? SURFACE_FIELD_OF_VIEW : ORBIT_FIELD_OF_VIEW;
    camera.lowerRadiusLimit = surface ? 7.5 : 10.5;
    camera.upperRadiusLimit = surface ? SURFACE_FAR_LIMIT : 25;
    camera.lowerBetaLimit = surface ? 1.02 : 0.58;
    camera.upperBetaLimit = surface ? 1.48 : Math.PI - 0.58;
    camera.target.copyFrom(surface ? surfaceTarget : orbitTarget);
    camera.radius = surface ? SURFACE_RESTING_RADIUS : 17.2;
    camera.beta = surface ? SURFACE_RESTING_BETA : Math.PI / 2.13;
    camera.alpha = -Math.PI / 2;
    camera.attachControl(canvas, true);
  };

  /** Switches view from inside the headset, where the orbit camera transition cannot be used. */
  const applyXrView = (surface: boolean, initial: boolean): void => {
    viewState = surface ? "surface" : "orbit";
    viewTransitionSeconds = 0;
    applyViewEnvironment(surface);
    placeXrCamera(surface, initial);
    onViewModeChange(surface ? "surface" : "orbit");
  };

  return {
    /**
     * How far a jump may pull back from this world before it stops holding up.
     *
     * In orbit there is nothing behind the camera but a sky that follows it, so a departure can
     * be flown as far as it likes. A surface excursion stands on a ground patch 72 by 82 units
     * across under a dome half that wide again: pull back past the far limit the view already
     * keeps for the wheel, and the visitor is shown the edge of the world instead of leaving it.
     */
    farthestView: () => (viewState === "surface" ? SURFACE_DEPARTURE_RADIUS : undefined),
    focusXrRig: (initial) => applyXrView(viewState === "surface", initial),
    restoreDesktopView: () => syncDesktopCamera(viewState === "surface"),
    // Meshes, materials and the key light are removed by the world scope the host opened around
    // this build; what is left here is everything that lives outside the scene graph.
    dispose: () => {
      camera.fov = ORBIT_FIELD_OF_VIEW;
      window.removeEventListener("keydown", onMovementKeyDown);
      window.removeEventListener("keyup", onMovementKeyUp);
      window.removeEventListener("blur", clearMovementKeys);
      releaseCameraToTravel();
      scene.onBeforeRenderObservable.remove(renderObserver);
      scene.onAfterRenderObservable.remove(firstFrameObserver);
    },
  };
};
