import { Constants } from "@babylonjs/core/Engines/constants.js";
import { Effect } from "@babylonjs/core/Materials/effect.js";
import { ShaderMaterial } from "@babylonjs/core/Materials/shaderMaterial.js";
import { Color3 } from "@babylonjs/core/Maths/math.color.js";
import { Vector3 } from "@babylonjs/core/Maths/math.vector.js";
import type { Scene } from "@babylonjs/core/scene.js";
import type { RenderQualityProfile } from "./render-quality.ts";

// Lengths inside the shader are in Schwarzschild radii; the mesh scaling maps them to scene units.
export const LENSING_BOUND_RADII = 13;
const DISK_INNER_RADII = 3;
const DISK_OUTER_RADII = 9.5;
// The shadow of a Schwarzschild hole spans sqrt(27)/2 Schwarzschild radii.
export const SHADOW_TO_SCHWARZSCHILD = Math.sqrt(27) / 2;

const LENSING_VERTEX_SHADER = `
precision highp float;
attribute vec3 position;
uniform mat4 world;
uniform mat4 worldViewProjection;
uniform vec3 cameraPosition;
uniform vec3 companionCenter;
varying vec3 vLocal;
varying vec3 vEye;
varying vec3 vCompanion;

vec3 toLocal(vec3 point) {
  vec3 offset = point - world[3].xyz;
  float scale = dot(world[0].xyz, world[0].xyz);
  return vec3(dot(world[0].xyz, offset), dot(world[1].xyz, offset), dot(world[2].xyz, offset)) / scale;
}

void main() {
  vLocal = position;
  vEye = toLocal(cameraPosition);
  vCompanion = toLocal(companionCenter);
  gl_Position = worldViewProjection * vec4(position, 1.0);
}
`;

const LENSING_FRAGMENT_SHADER = `
precision highp float;
varying vec3 vLocal;
varying vec3 vEye;
varying vec3 vCompanion;
uniform float time;
uniform float seed;
uniform float brightness;
uniform float companionRadius;
uniform vec3 companionColor;
uniform vec3 diskColor;
uniform vec3 jetColor;

const float BOUND = ${LENSING_BOUND_RADII.toFixed(1)};
const float DISK_INNER = ${DISK_INNER_RADII.toFixed(1)};
const float DISK_OUTER = ${DISK_OUTER_RADII.toFixed(1)};

float hash(vec3 p) {
  p = fract(p * 0.3183099 + vec3(0.71, 0.113, 0.419));
  p *= 17.0;
  return fract(p.x * p.y * p.z * (p.x + p.y + p.z));
}

float noise(vec3 x) {
  vec3 i = floor(x);
  vec3 f = fract(x);
  f = f * f * (3.0 - 2.0 * f);
  return mix(
    mix(mix(hash(i), hash(i + vec3(1.0, 0.0, 0.0)), f.x),
        mix(hash(i + vec3(0.0, 1.0, 0.0)), hash(i + vec3(1.0, 1.0, 0.0)), f.x), f.y),
    mix(mix(hash(i + vec3(0.0, 0.0, 1.0)), hash(i + vec3(1.0, 0.0, 1.0)), f.x),
        mix(hash(i + vec3(0.0, 1.0, 1.0)), hash(i + vec3(1.0, 1.0, 1.0)), f.x), f.y),
    f.z);
}

float turbulence(float angle, float radius) {
  vec3 p = vec3(cos(angle) * 2.2, sin(angle) * 2.2, log(radius) * 16.0 + seed);
  float value = 0.0;
  float amplitude = 0.55;
  for (int octave = 0; octave < DISK_OCTAVES; octave++) {
    value += noise(p) * amplitude;
    p = p * vec3(2.1, 2.1, 1.6) + vec3(3.1, 1.7, 5.3);
    amplitude *= 0.5;
  }
  return value;
}

// Differential rotation would wind any fixed pattern into ever-tighter spirals, so two
// phase-offset copies take turns fading in and resetting.
float diskDensity(vec2 point, float radius) {
  float angle = atan(point.y, point.x);
  float cycle = 7.0;
  float omega = 2.4 * pow(radius, -1.5);
  float phaseA = fract(time / cycle);
  float phaseB = fract(time / cycle + 0.5);
  float weightA = 1.0 - abs(phaseA * 2.0 - 1.0);
  float a = turbulence(angle - omega * phaseA * cycle, radius);
  float b = turbulence(angle - omega * phaseB * cycle + 1.7, radius);
  float density = mix(b, a, weightA);
  return smoothstep(0.18, 0.95, density);
}

vec3 diskTint(float heat) {
  vec3 ember = diskColor * vec3(0.95, 0.42, 0.24);
  vec3 white = vec3(1.0, 0.97, 0.92);
  if (heat < 1.0) return mix(ember, diskColor, heat);
  return mix(diskColor, white, clamp((heat - 1.0) * 0.9, 0.0, 1.0));
}

// Line integral of a Gaussian jet column along one straight segment of the ray.
vec3 jetLight(vec3 origin, vec3 direction, float span, vec3 toward) {
  vec2 across = direction.xz;
  float speed2 = max(dot(across, across), 0.0225);
  float nearest = clamp(-dot(origin.xz, across) / speed2, 0.0, span);
  vec3 point = origin + direction * nearest;
  float height = abs(point.y);
  float width = 0.22 + 0.07 * height;
  float radial2 = dot(point.xz, point.xz) / (width * width);
  if (radial2 > 9.0) return vec3(0.0);
  float profile = smoothstep(1.4, 3.0, height) * (1.0 - smoothstep(5.5, BOUND - 0.5, height));
  float beaming = 1.0 / (1.0 - 0.55 * sign(point.y) * dot(vec3(0.0, 1.0, 0.0), toward));
  return jetColor * exp(-radial2) * width * 1.77 / sqrt(speed2) * profile * beaming * beaming * 0.08;
}

float companionHalo(vec3 origin, vec3 direction, float span) {
  float along = clamp(dot(vCompanion - origin, direction), 0.0, span);
  float gap = length(origin + direction * along - vCompanion) - companionRadius;
  return exp(-max(gap, 0.0) / (0.42 * companionRadius));
}

float companionDistance(vec3 origin, vec3 direction, float span) {
  vec3 offset = origin - vCompanion;
  float b = dot(offset, direction);
  float c = dot(offset, offset) - companionRadius * companionRadius;
  float discriminant = b * b - c;
  if (discriminant < 0.0) return -1.0;
  float t = -b - sqrt(discriminant);
  return t >= 0.0 && t <= span ? t : -1.0;
}

vec3 companionSurface(vec3 point, vec3 heading) {
  vec3 normal = (point - vCompanion) / companionRadius;
  float facing = max(dot(normal, -heading), 0.0);
  return min(companionColor * (0.85 + 0.3 * facing) + vec3(0.3 * facing * facing), vec3(1.0));
}

void main() {
  vec3 direction = normalize(vLocal - vEye);
  float eyeDistance = dot(vEye, vEye);
  vec3 position = vEye;
  if (eyeDistance > BOUND * BOUND) {
    float b = dot(vEye, direction);
    float c = eyeDistance - BOUND * BOUND;
    position = vEye + direction * max(0.0, -b - sqrt(max(b * b - c, 0.0)));
  }

  vec3 velocity = direction;
  vec3 momentum = cross(position, velocity);
  float angularMomentum2 = dot(momentum, momentum);
  float radius2 = dot(position, position);
  vec3 acceleration = -1.5 * angularMomentum2 * position / (radius2 * radius2 * sqrt(radius2));
  vec3 light = vec3(0.0);
  vec3 surface = vec3(0.0);
  float opacity = 0.0;
  float halo = 0.0;

  for (int step = 0; step < MAX_STEPS; step++) {
    float radius = sqrt(dot(position, position));
    if (radius < 1.0) {
      opacity = 1.0;
      break;
    }
    // Outside the disk and receding, a ray only climbs, so the rest of its path is a straight line.
    bool receding = dot(position, velocity) > 0.0;
    if (receding && radius > DISK_OUTER) {
      vec3 heading = normalize(velocity);
#ifdef JETS
      light += (1.0 - opacity) * jetLight(position, heading, 2.0 * BOUND, -heading);
#endif
#ifdef COMPANION
      halo = max(halo, companionHalo(position, heading, 2.0 * BOUND) * (1.0 - opacity));
      float hit = companionDistance(position, heading, 2.0 * BOUND);
      if (hit >= 0.0) {
        surface = companionSurface(position + heading * hit, heading) * (1.0 - opacity);
        opacity = 1.0;
      }
#endif
      break;
    }

    // Velocity Verlet on the Binet form of a Schwarzschild null geodesic.
    float dt = clamp(STEP_SCALE * radius, 0.02, 1.2);
    velocity += acceleration * (0.5 * dt);
    vec3 next = position + velocity * dt;
    float nextRadius2 = dot(next, next);
    acceleration = -1.5 * angularMomentum2 * next / (nextRadius2 * nextRadius2 * sqrt(nextRadius2));
    velocity += acceleration * (0.5 * dt);

#if defined(JETS) || defined(COMPANION)
    vec3 segment = next - position;
    float span = length(segment);
    vec3 heading = segment / span;
#endif
#ifdef JETS
    light += (1.0 - opacity) * jetLight(position, heading, span, -heading);
#endif
#ifdef COMPANION
    halo = max(halo, companionHalo(position, heading, span) * (1.0 - opacity));
    float hit = companionDistance(position, heading, span);
    if (hit >= 0.0) {
      surface = companionSurface(position + heading * hit, heading) * (1.0 - opacity);
      opacity = 1.0;
      break;
    }
#endif

    if (position.y * next.y < 0.0) {
      vec3 crossing = mix(position, next, position.y / (position.y - next.y));
      float r = length(crossing.xz);
      if (r > DISK_INNER * 0.96 && r < DISK_OUTER) {
        float edge = smoothstep(DISK_INNER * 0.96, DISK_INNER * 1.1, r)
          * (1.0 - smoothstep(DISK_OUTER * 0.6, DISK_OUTER, r));
        float density = diskDensity(crossing.xz, r) * edge;
        float emissivity = pow(DISK_INNER / r, 3.0) * (1.0 - sqrt(DISK_INNER * 0.96 / r)) / 0.057;
        float beta = sqrt(0.5 / (r - 1.0));
        vec3 orbit = normalize(vec3(-crossing.z, 0.0, crossing.x));
        float cosine = dot(orbit, -normalize(velocity));
        float doppler = sqrt(1.0 - beta * beta) / (1.0 - beta * cosine);
        float shift = doppler * sqrt(1.0 - 1.0 / r);
        float heat = shift * (0.75 + 0.85 * sqrt(emissivity));
        vec3 glow = diskTint(heat) * emissivity * pow(shift, 3.0) * (0.4 + 0.9 * density);
        float coverage = clamp(0.25 + density * 0.8, 0.0, 1.0) * edge;
        light += (1.0 - opacity) * glow * coverage;
        opacity += (1.0 - opacity) * coverage * 0.94;
      }
    }

    position = next;
  }

  // Tone-map luminance rather than each channel so bright gas keeps its hue.
  vec3 exposed = light * brightness;
  float luminance = dot(exposed, vec3(0.2126, 0.7152, 0.0722));
  vec3 color = exposed * ((1.0 - exp(-luminance)) / max(luminance, 1e-4));
  color = mix(color, vec3(max(color.r, max(color.g, color.b))), smoothstep(0.9, 3.0, luminance) * 0.6);
  color = min(color + companionColor * halo * 0.75 * (1.0 - opacity), vec3(1.0));
  gl_FragColor = vec4(color + surface, opacity);
}
`;

export interface LensingOptions {
  activity: number;
  companion: { color: Color3; position: Vector3; radius: number } | null;
  diskColor: Color3;
  jetColor: Color3;
  jetStrength: number;
  profile: Pick<RenderQualityProfile, "tier">;
  schwarzschildRadius: number;
  seed: number;
}

const STEP_BUDGET = { desktop: 180, mobile: 120, quest: 90 } as const;
const STEP_SCALE = { desktop: 0.1, mobile: 0.13, quest: 0.16 } as const;
const DISK_OCTAVES = { desktop: 4, mobile: 3, quest: 2 } as const;

export const createLensingMaterial = (scene: Scene, options: LensingOptions): ShaderMaterial => {
  Effect.ShadersStore.exoraLensingVertexShader = LENSING_VERTEX_SHADER;
  Effect.ShadersStore.exoraLensingFragmentShader = LENSING_FRAGMENT_SHADER;
  const tier = options.profile.tier;
  const material = new ShaderMaterial(
    "event-horizon-lensing-material",
    scene,
    { vertex: "exoraLensing", fragment: "exoraLensing" },
    {
      attributes: ["position"],
      defines: [
        `#define MAX_STEPS ${STEP_BUDGET[tier]}`,
        `#define STEP_SCALE ${STEP_SCALE[tier].toFixed(3)}`,
        `#define DISK_OCTAVES ${DISK_OCTAVES[tier]}`,
        ...(options.companion ? ["#define COMPANION"] : []),
        ...(options.jetStrength > 0 ? ["#define JETS"] : []),
      ],
      uniforms: [
        "world",
        "worldViewProjection",
        "cameraPosition",
        "companionCenter",
        "companionRadius",
        "companionColor",
        "time",
        "seed",
        "brightness",
        "diskColor",
        "jetColor",
      ],
      needAlphaBlending: true,
    },
  );
  material.setFloat("time", 0);
  material.setFloat("seed", (options.seed % 997) * 0.37);
  material.setFloat("brightness", 1.6 + options.activity * 1.8);
  material.setColor3("diskColor", options.diskColor);
  material.setColor3("jetColor", options.jetColor.scale(options.jetStrength));
  material.setVector3("companionCenter", options.companion?.position ?? Vector3.Zero());
  material.setFloat(
    "companionRadius",
    options.companion ? options.companion.radius / options.schwarzschildRadius : 0,
  );
  material.setColor3("companionColor", options.companion?.color ?? Color3.Black());
  material.alphaMode = Constants.ALPHA_PREMULTIPLIED;
  material.depthFunction = Constants.ALWAYS;
  material.disableDepthWrite = true;
  return material;
};
