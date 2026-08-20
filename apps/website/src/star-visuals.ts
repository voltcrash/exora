import { Color3 } from "@babylonjs/core/Maths/math.color.js";
import { Vector3 } from "@babylonjs/core/Maths/math.vector.js";
import { Effect } from "@babylonjs/core/Materials/effect.js";
import { ShaderMaterial } from "@babylonjs/core/Materials/shaderMaterial.js";
import { StandardMaterial } from "@babylonjs/core/Materials/standardMaterial.js";
import { Mesh } from "@babylonjs/core/Meshes/mesh.js";
import { VertexData } from "@babylonjs/core/Meshes/mesh.vertexData.js";
import type { TransformNode } from "@babylonjs/core/Meshes/transformNode.js";
import type { Scene } from "@babylonjs/core/scene.js";

/**
 * How a star reads as a light source rather than as a lit ball.
 *
 * Everything here descends from one observation: a star is a *point source of light* far brighter
 * than anything a display can reproduce, so what a viewer actually recognises as "a star" is not
 * the object but its point-spread function — the way an unreproducibly bright point smears into
 * the optics between it and the eye. A single-pixel dot, or a flat-shaded sphere, has no PSF at
 * all, which is exactly why both read as "a dot" and "a ball" instead of "a star".
 *
 * Two consumers share that PSF: the background starfield (thousands of them, one draw call) and
 * the glare shell wrapped around a resolved star's disc.
 */

/**
 * The shared point-spread function, in normalised quad coordinates where `corner` runs -1..1 and
 * the source sits at the origin.
 *
 * Four superimposed terms, because a real bright source photographs as all four at once and any
 * one of them alone is a recognisable failure mode:
 *
 * - `core`   — a tight Gaussian. Alone: a soft cotton ball with no punch.
 * - `halo`   — the wide, shallow aureole scattered by the optics. Alone: a featureless smudge.
 * - `veil`   — a very broad, very faint lift. Carries the sense of overwhelming brightness; it is
 *              what makes the difference between "bright dot" and "too bright to look at".
 * - `spikes` — diffraction vanes. The single strongest "that is a star" cue there is, and the one
 *              thing a plain point sprite can never produce.
 *
 * The spikes come in two rotated pairs: a strong axis-aligned cross and a weaker diagonal cross,
 * giving an eight-vane burst on the brightest sources while ordinary ones show only the cross.
 */
const STAR_PSF_GLSL = `
float starPointSpread(vec2 corner, float spikeStrength, float spikeSharpness) {
  float radius = length(corner);

  float core = exp(-radius * radius * 34.0);
  float halo = exp(-radius * 4.6) * 0.34;
  float veil = exp(-radius * 1.55) * 0.085;

  // Only sources bright enough to throw visible vanes pay for the four extra exponentials. The
  // condition is constant across a whole quad, so the branch is perfectly coherent, and most of
  // any sky is faint stars that skip it.
  float spikes = 0.0;
  if (spikeStrength > 0.0) {
    vec2 axis = abs(corner);
    float spikeHorizontal = exp(-axis.y * axis.y * spikeSharpness) * exp(-axis.x * 3.1);
    float spikeVertical = exp(-axis.x * axis.x * spikeSharpness) * exp(-axis.y * 3.1);
    // 45-degree rotation of the same pair; 0.7071 is cos(45 degrees), so the rotated coordinates
    // stay unit-scaled and the diagonal vanes keep the same length as the axis-aligned ones.
    vec2 diagonal = abs(vec2(corner.x + corner.y, corner.x - corner.y) * 0.70710678);
    float spikeDiagonalA = exp(-diagonal.y * diagonal.y * spikeSharpness * 2.0)
      * exp(-diagonal.x * 4.8);
    float spikeDiagonalB = exp(-diagonal.x * diagonal.x * spikeSharpness * 2.0)
      * exp(-diagonal.y * 4.8);
    spikes = (spikeHorizontal + spikeVertical) * 0.5 + (spikeDiagonalA + spikeDiagonalB) * 0.2;
  }

  // The quad has to fade to nothing before its own edge, or every star in the sky shows a faint
  // square silhouette where the geometry stops.
  return (core + halo + veil + spikes * spikeStrength) * (1.0 - smoothstep(0.6, 1.0, radius));
}

/**
 * A source bright enough to clip does so in the achromatic direction: the sensor (or the eye)
 * runs out of headroom in every channel at once, so the core whitens while only the dimmer wings
 * keep the colour. Skipping this is what makes tinted stars read as coloured stickers.
 */
vec3 starClipToWhite(vec3 tint, float intensity) {
  return mix(tint, vec3(1.0), clamp(intensity - 0.5, 0.0, 1.0) * 0.92);
}
`;

const GLARE_VERTEX_SHADER = `
precision highp float;
attribute vec3 position;
attribute vec2 corner;

uniform mat4 worldView;
uniform mat4 projection;
uniform float glareRadius;
uniform float depthOffset;

varying vec2 vCorner;

void main(void) {
  vec4 viewPosition = worldView * vec4(position, 1.0);
  // Pulled toward the camera by (a little more than) the star's own radius so the billboard sits
  // in front of the photosphere rather than being sliced in half by it, while still depth-testing
  // against anything genuinely closer. Babylon's view space is left-handed and looks down +Z, so
  // "toward the camera" is -Z; the floor keeps the quad from being shoved behind the near plane
  // when the viewer flies right up to the star.
  float originalDepth = viewPosition.z;
  float shiftedDepth = max(originalDepth - depthOffset, originalDepth * 0.05);
  // Moving only view-space Z changes the projected centre of every off-axis star and makes its
  // glare slide away from the photosphere as the camera moves. Scale the full billboard by the
  // same depth ratio so the depth-test offset has zero effect on its screen-space position/size.
  float projectionScale = shiftedDepth / max(originalDepth, 0.0001);
  viewPosition.xy = (viewPosition.xy + corner * glareRadius) * projectionScale;
  viewPosition.z = shiftedDepth;
  vCorner = corner;
  gl_Position = projection * viewPosition;
}`;

const GLARE_FRAGMENT_SHADER = `
precision highp float;
varying vec2 vCorner;

uniform float time;
uniform float glareIntensity;
uniform float spikeStrength;
uniform float discFraction;
uniform vec3 glareColor;

${STAR_PSF_GLSL}

void main(void) {
  float spread = starPointSpread(vCorner, spikeStrength, 700.0);

  // A resolved star is not a point, so its glare cannot peak at the centre — the disc itself is
  // already drawn there. Suppressing the core inside the photosphere's own silhouette turns the
  // billboard into a rim bloom plus spikes, which is what an overexposed disc actually looks
  // like, instead of a bright blob pasted over the surface detail.
  float radius = length(vCorner);
  float outsideDisc = smoothstep(discFraction * 0.72, discFraction * 1.06, radius);
  float intensity = spread * mix(0.16, 1.0, outsideDisc) * glareIntensity;

  // A slow breath, driven by the same convective churn the photosphere shows; a dead-still glare
  // reads as a decal stuck to the screen.
  intensity *= 0.94 + 0.06 * sin(time * 0.35);

  if (intensity <= 0.002) discard;
  vec3 tint = starClipToWhite(glareColor, intensity);
  gl_FragColor = vec4(tint, clamp(intensity, 0.0, 1.0));
}`;

let shadersRegistered = false;

const registerStarShaders = (): void => {
  if (shadersRegistered) return;
  shadersRegistered = true;
  Effect.ShadersStore.exoraStarGlareVertexShader = GLARE_VERTEX_SHADER;
  Effect.ShadersStore.exoraStarGlareFragmentShader = GLARE_FRAGMENT_SHADER;
};

/** Corner offsets of the billboard quad, in the -1..1 space `starPointSpread` expects. */
const QUAD_CORNERS = [-1, -1, 1, -1, -1, 1, 1, 1] as const;

export interface StarfieldOptions {
  /** How many stars to place. Overwhelmingly faint ones, so this is cheap to raise. */
  count: number;
  /**
   * Distance the whole shell sits at. Only sets the scale the billboards are sized against —
   * the shell rides with the camera, so nothing ever parallaxes against it or flies through it.
   */
  distance?: number;
  scene: Scene;
  seed: number;
}

export interface Starfield {
  dispose: () => void;
  mesh: Mesh;
  /** Keeps the effectively infinite shell centred on the viewer. */
  update: (elapsedSeconds: number, viewerPosition: Vector3) => void;
}

/**
 * Builds the subdued point-star background used before the PSF billboard experiment. Background
 * stars provide scale and depth; resolved stars own the glare treatment and remain the focal
 * light sources. Keeping this as a single point cloud also avoids bright alpha-blended crosses
 * overwhelming planets in the foreground.
 */
export const createStarfield = ({
  count,
  distance = 90,
  scene,
  seed,
}: StarfieldOptions): Starfield => {
  const mesh = new Mesh("starfield", scene);
  const positions: number[] = [];
  const colors: number[] = [];
  const indices: number[] = [];

  let state = seed >>> 0 || 1;
  const random = (): number => {
    state = (state * 1_664_525 + 1_013_904_223) >>> 0;
    return state / 4_294_967_296;
  };

  for (let index = 0; index < count; index += 1) {
    const radius = distance * (0.78 + random() * 0.5);
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

  const vertexData = new VertexData();
  vertexData.positions = positions;
  vertexData.colors = colors;
  vertexData.indices = indices;
  vertexData.applyToMesh(mesh);

  const material = new StandardMaterial("starfield-material", scene);
  material.disableLighting = true;
  material.emissiveColor = Color3.White();
  material.pointsCloud = true;
  material.pointSize = 1.65;
  material.disableDepthWrite = true;
  material.freeze();
  mesh.material = material;
  mesh.isPickable = false;
  mesh.alwaysSelectAsActiveMesh = true;

  return {
    mesh,
    update: (_elapsedSeconds: number, viewerPosition: Vector3): void => {
      // Stars are effectively at infinity, so the shell rides with the viewer: no parallax as the
      // camera orbits, and no way to walk out through it during a long immersive session.
      mesh.position.copyFrom(viewerPosition);
    },
    dispose: (): void => {
      mesh.dispose(false, true);
    },
  };
};

export interface StarGlareOptions {
  color: Color3;
  /** Diameter of the photosphere the glare wraps, in scene units. */
  diameter: number;
  /** Overall strength. Roughly "how many stops over-exposed this star is". */
  intensity: number;
  parent?: TransformNode;
  position: Vector3;
  /** Rendering group the billboard draws in. Must be at or after the star's own. */
  renderingGroupId?: number;
  scene: Scene;
  /** Billboard extent as a multiple of the star's own diameter. */
  spread?: number;
  /** 0 for a clean bloom, 1 for a full eight-vane starburst. */
  spikes: number;
}

export interface StarGlare {
  dispose: () => void;
  mesh: Mesh;
  update: (elapsedSeconds: number) => void;
}

/**
 * The bloom, aureole and diffraction vanes around a resolved star's disc.
 *
 * A star mesh on its own is just an emissive sphere, and an emissive sphere is exactly as bright
 * as the display's white — which is to say, not bright at all. The glare is what communicates the
 * many orders of magnitude the display cannot show, by spilling the source's light outside its own
 * silhouette the way it spills in every real image of a star.
 */
export const createStarGlare = ({
  color,
  diameter,
  intensity,
  parent,
  position,
  renderingGroupId = 1,
  scene,
  spikes,
  spread = 3.4,
}: StarGlareOptions): StarGlare => {
  registerStarShaders();

  const mesh = new Mesh("star-glare", scene);
  const positions = new Float32Array(12);
  const corners = new Float32Array(QUAD_CORNERS);
  for (let vertex = 0; vertex < 4; vertex += 1) {
    positions[vertex * 3] = 0;
    positions[vertex * 3 + 1] = 0;
    positions[vertex * 3 + 2] = 0;
  }
  mesh.setVerticesData("position", positions, false, 3);
  mesh.setVerticesData("corner", corners, false, 2);
  mesh.setIndices(new Uint32Array([0, 1, 2, 1, 3, 2]));
  if (parent) mesh.parent = parent;
  mesh.position.copyFrom(position);
  mesh.isPickable = false;
  mesh.alwaysSelectAsActiveMesh = true;
  mesh.applyFog = false;
  // Drawn after the opaque pass, so the glare lands over the photosphere it belongs to instead
  // of being sorted behind it.
  mesh.renderingGroupId = renderingGroupId;

  const glareRadius = diameter * 0.5 * spread;
  const material = new ShaderMaterial(
    "star-glare-material",
    scene,
    { vertex: "exoraStarGlare", fragment: "exoraStarGlare" },
    {
      attributes: ["position", "corner"],
      uniforms: [
        "worldView",
        "projection",
        "time",
        "glareRadius",
        "glareIntensity",
        "glareColor",
        "spikeStrength",
        "discFraction",
        "depthOffset",
      ],
      needAlphaBlending: true,
    },
  );
  material.backFaceCulling = false;
  material.disableDepthWrite = true;
  material.setFloat("glareRadius", glareRadius);
  material.setFloat("glareIntensity", intensity);
  material.setColor3("glareColor", color);
  material.setFloat("spikeStrength", spikes);
  // Where the photosphere's own edge falls in the billboard's -1..1 space, so the shader knows
  // which part of the glare is sitting on top of the disc.
  material.setFloat("discFraction", 1 / spread);
  material.setFloat("depthOffset", diameter * 0.55);
  material.setFloat("time", 0);
  mesh.material = material;

  return {
    mesh,
    update: (elapsedSeconds: number): void => {
      material.setFloat("time", elapsedSeconds);
    },
    dispose: (): void => {
      mesh.dispose(false, true);
    },
  };
};
