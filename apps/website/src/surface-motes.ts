import { Color3 } from "@babylonjs/core/Maths/math.color.js";
import { Vector3 } from "@babylonjs/core/Maths/math.vector.js";
import { Effect } from "@babylonjs/core/Materials/effect.js";
import { Material } from "@babylonjs/core/Materials/material.js";
import { ShaderMaterial } from "@babylonjs/core/Materials/shaderMaterial.js";
import { Mesh } from "@babylonjs/core/Meshes/mesh.js";
import { VertexBuffer } from "@babylonjs/core/Buffers/buffer.js";
import type { TransformNode } from "@babylonjs/core/Meshes/transformNode.js";
import type { Scene } from "@babylonjs/core/scene.js";
import type { RenderQualityProfile } from "./render-quality.ts";
import type { SurfaceGeology } from "./surface-geology.ts";

/**
 * What is in the air between the viewer and everything else.
 *
 * A vista with perfectly clear air between the eye and the ground reads as a diorama under glass,
 * however good the ground is — there is nothing at arm's length for the eye to focus on, and in a
 * headset that absence is the loudest thing in the scene. So: dust on a windy world, snow on an
 * icy one, embers over molten ground, and on an airless one nothing at all, because there is
 * nothing to hold anything up.
 *
 * The whole field is one draw call and never touched by the CPU after it is built. Particles ride
 * a box pinned to the viewer and wrap around inside it in the vertex shader, so a visitor walks
 * through weather that has no beginning and no end rather than through a fixed cloud of specks.
 */

const MOTE_VERTEX_SHADER = `
precision highp float;

attribute vec3 position;
attribute vec2 uv;

uniform mat4 viewProjection;
uniform vec3 viewer;
uniform vec3 drift;
uniform vec3 boxSize;
uniform vec3 boxCenter;
uniform float time;
uniform float pointScale;
uniform vec3 sunDirection;

varying float vFade;
varying float vPhase;
varying float vForward;

void main(void) {
  // Wrapped around a box that follows the eye: a particle leaving one face re-enters the opposite
  // one, so a field of a couple of thousand covers a walk of any length.
  vec3 drifted = position + drift * time;
  // Centred a little above the eye rather than on it, because what is airborne is mostly between
  // the eye and the ground rather than evenly split above and below it.
  vec3 anchor = viewer + boxCenter;
  vec3 relative = mod(drifted - anchor + boxSize * 0.5, boxSize) - boxSize * 0.5;
  vec3 world = anchor + relative;
  vec4 clip = viewProjection * vec4(world, 1.0);

  float distance = length(world - viewer);
  // Gone at the far wall of the box, and gone again right at the eye — a mote in front of the
  // cornea is a smear, not a mote.
  vFade = (1.0 - smoothstep(boxSize.x * 0.22, boxSize.x * 0.5, distance))
    * smoothstep(0.5, 2.6, distance);
  vPhase = uv.y;
  // A grain in the air is only really visible when it is between the eye and the light: what
  // reaches the eye is sunlight scattered forward through it, which is why dust and snow show up
  // as a haze around the sun and as nothing at all with the sun behind you.
  vForward = pow(max(dot(normalize(world - viewer), sunDirection), 0.0), 3.0);
  gl_PointSize = clamp(pointScale * uv.x * (0.65 + vForward * 0.5) / max(clip.w, 0.001), 1.0, 14.0);
  gl_Position = clip;
}
`;

const MOTE_FRAGMENT_SHADER = `
precision highp float;

uniform vec3 tint;
uniform float opacity;
uniform float twinkle;
uniform float time;
uniform vec3 sunTint;

varying float vFade;
varying float vPhase;
varying float vForward;

void main(void) {
  vec2 offset = gl_PointCoord - 0.5;
  float radius = dot(offset, offset) * 4.0;
  if (radius > 1.0) discard;
  // Soft-edged rather than a square: a hard-edged speck reads as a dead pixel.
  float shape = (1.0 - radius) * (1.0 - radius);
  // Every grain is a different facet catching the light at a different moment.
  float flicker = 1.0 - twinkle * (0.5 + 0.5 * sin(time * 3.1 + vPhase * 62.8));
  float alpha = shape * vFade * opacity * flicker * (0.4 + vForward * 1.5);
  if (alpha <= 0.004) discard;
  gl_FragColor = vec4(mix(tint, sunTint, vForward * 0.45), min(alpha, 0.6));
}
`;

const MOTE_BUDGET: Readonly<Record<RenderQualityProfile["tier"], number>> = {
  desktop: 2_600,
  mobile: 900,
  quest: 800,
};

/** How wide a volume the motes fill around the viewer, in scene units. */
const BOX = new Vector3(72, 26, 72);
/** Where that volume sits relative to the eye. */
const BOX_CENTER = new Vector3(0, 5.5, 0);

const createSeededRandom = (seed: number): (() => number) => {
  let state = (seed || 1) >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let value = state;
    value = Math.imul(value ^ (value >>> 15), value | 1);
    value ^= value + Math.imul(value ^ (value >>> 7), value | 61);
    return ((value ^ (value >>> 14)) >>> 0) / 4_294_967_296;
  };
};

export interface SurfaceMotesOptions {
  geology: SurfaceGeology;
  parent: TransformNode;
  profile: RenderQualityProfile;
  skyHorizonColor: Color3;
  sunColor: Color3;
  /** Unit vector from the ground toward the host star. */
  sunDirection: Vector3;
}

export interface SurfaceMotes {
  material: ShaderMaterial;
  mesh: Mesh;
  update: (elapsedSeconds: number, cameraPosition: Vector3) => void;
}

/** What this world has in its air, if anything. */
const moteKind = (
  geology: SurfaceGeology,
): { drift: Vector3; opacity: number; size: number; tint: Color3; twinkle: number } | null => {
  const wind = new Vector3(Math.cos(geology.windDirection), 0, Math.sin(geology.windDirection));

  // Sparks off molten ground, rising on their own heat.
  if (geology.lavaGlow > 0.15) {
    return {
      drift: new Vector3(wind.x * 1.1, 2.4, wind.z * 1.1),
      opacity: 0.62 * geology.lavaGlow,
      size: 150,
      tint: new Color3(geology.lavaColor[0], geology.lavaColor[1], geology.lavaColor[2]),
      twinkle: 0.75,
    };
  }

  // Nothing stays airborne without air.
  if (geology.hazeDensity < 0.06) return null;

  // Ice crystals falling out of a cold sky, sliding sideways as they go.
  if (geology.frostCoverage > 0.45) {
    return {
      drift: new Vector3(wind.x * 1.6, -1.15, wind.z * 1.6),
      opacity: 0.5,
      size: 260,
      tint: new Color3(geology.frostColor[0], geology.frostColor[1], geology.frostColor[2]),
      twinkle: 0.3,
    };
  }

  // Dust, carried by whatever wind this world has.
  if (geology.windStreaks > 0.18) {
    return {
      drift: new Vector3(wind.x * 4.6, -0.18, wind.z * 4.6),
      opacity: 0.34 * Math.min(1, geology.windStreaks * 1.3),
      size: 130,
      tint: new Color3(
        geology.regolithColor[0],
        geology.regolithColor[1],
        geology.regolithColor[2],
      ),
      twinkle: 0.45,
    };
  }

  return null;
};

export const createSurfaceMotes = (
  scene: Scene,
  { geology, parent, profile, skyHorizonColor, sunColor, sunDirection }: SurfaceMotesOptions,
): SurfaceMotes | null => {
  const kind = moteKind(geology);
  if (!kind) return null;

  Effect.ShadersStore.exoraMoteVertexShader = MOTE_VERTEX_SHADER;
  Effect.ShadersStore.exoraMoteFragmentShader = MOTE_FRAGMENT_SHADER;

  const random = createSeededRandom((geology.seed ^ 0x7c_3a_11_9d) >>> 0);
  const count = MOTE_BUDGET[profile.tier];
  const positions = new Float32Array(count * 3);
  const attributes = new Float32Array(count * 2);
  const indices: number[] = [];

  for (let index = 0; index < count; index += 1) {
    positions[index * 3] = (random() - 0.5) * BOX.x;
    positions[index * 3 + 1] = (random() - 0.5) * BOX.y;
    positions[index * 3 + 2] = (random() - 0.5) * BOX.z;
    // Grain sizes follow a power law like everything else loose on a world.
    attributes[index * 2] = 0.35 + random() ** 2.6 * 1.9;
    attributes[index * 2 + 1] = random();
    indices.push(index);
  }

  const mesh = new Mesh("surfaceMotes", scene);
  mesh.setVerticesData(VertexBuffer.PositionKind, positions, false, 3);
  mesh.setVerticesData(VertexBuffer.UVKind, attributes, false, 2);
  mesh.setIndices(indices);
  mesh.isUnIndexed = true;
  mesh.parent = parent;
  mesh.isPickable = false;
  // The mesh's own bounds say nothing about where its particles end up, since they are placed
  // around the viewer in the vertex shader.
  mesh.alwaysSelectAsActiveMesh = true;

  const material = new ShaderMaterial(
    "surfaceMotesMaterial",
    scene,
    { fragment: "exoraMote", vertex: "exoraMote" },
    {
      attributes: ["position", "uv"],
      needAlphaBlending: true,
      uniforms: [
        "viewProjection",
        "viewer",
        "drift",
        "boxSize",
        "boxCenter",
        "time",
        "pointScale",
        "tint",
        "sunTint",
        "sunDirection",
        "opacity",
        "twinkle",
      ],
    },
  );
  material.setVector3("drift", kind.drift);
  material.setVector3("boxSize", BOX);
  material.setVector3("boxCenter", BOX_CENTER);
  material.setFloat("time", 0);
  material.setFloat("pointScale", kind.size);
  // Lit by the sun it is floating in, tinted toward the sky it is floating under.
  material.setColor3(
    "tint",
    Color3.Lerp(
      kind.tint,
      Color3.Lerp(skyHorizonColor, sunColor, 0.55),
      geology.lavaGlow > 0.15 ? 0.1 : 0.45,
    ),
  );
  material.setColor3("sunTint", sunColor);
  material.setVector3("sunDirection", sunDirection);
  material.setFloat("opacity", kind.opacity * 1.05);
  material.setFloat("twinkle", kind.twinkle);
  material.setVector3("viewer", Vector3.Zero());
  material.backFaceCulling = false;
  material.disableDepthWrite = true;
  material.fillMode = Material.PointFillMode;
  mesh.material = material;

  return {
    material,
    mesh,
    update: (elapsedSeconds, cameraPosition) => {
      material.setFloat("time", elapsedSeconds);
      material.setVector3("viewer", cameraPosition);
    },
  };
};
