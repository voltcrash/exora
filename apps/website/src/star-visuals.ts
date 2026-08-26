import { Color3 } from "@babylonjs/core/Maths/math.color.js";
import { Vector3 } from "@babylonjs/core/Maths/math.vector.js";
import { Effect } from "@babylonjs/core/Materials/effect.js";
import { ShaderMaterial } from "@babylonjs/core/Materials/shaderMaterial.js";
import { StandardMaterial } from "@babylonjs/core/Materials/standardMaterial.js";
import { Mesh } from "@babylonjs/core/Meshes/mesh.js";
import { VertexData } from "@babylonjs/core/Meshes/mesh.vertexData.js";
import type { TransformNode } from "@babylonjs/core/Meshes/transformNode.js";
import type { Scene } from "@babylonjs/core/scene.js";
import { loadSkyCatalog, projectSky, type SkyViewpoint } from "./sky-catalog.ts";
import { markAsVirtualBackground } from "./world-presentation.ts";

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
uniform float glareScale;
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
  float shiftedDepth = max(originalDepth - depthOffset * glareScale, originalDepth * 0.05);
  // Moving only view-space Z changes the projected centre of every off-axis star and makes its
  // glare slide away from the photosphere as the camera moves. Scale the full billboard by the
  // same depth ratio so the depth-test offset has zero effect on its screen-space position/size.
  float projectionScale = shiftedDepth / max(originalDepth, 0.0001);
  viewPosition.xy = (viewPosition.xy + corner * glareRadius * glareScale) * projectionScale;
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
  /**
   * Ceiling on the points drawn. The seeded field below always draws exactly this many; a
   * catalogue sky draws the brightest this many of however many are visible from the viewpoint,
   * which is often fewer.
   */
  count: number;
  /**
   * Radius the whole shell sits at. Sets scale only — the shell rides with the camera, so nothing
   * ever parallaxes against it or flies through it.
   */
  distance?: number;
  scene: Scene;
  seed: number;
  /**
   * Where in the galaxy this destination actually is, if anyone knows.
   *
   * Given one, the field is the real sky re-observed from that point. Left null — a World Forge
   * object, or a catalogue entry with no measured position or distance — it is the seeded field
   * below, because a made-up viewpoint would produce a confidently wrong sky.
   */
  viewpoint?: SkyViewpoint | null;
}

/** Which of the two skies is on screen. `catalog` only ever means real, projected stars. */
export type StarfieldSource = "catalog" | "seeded";

export interface Starfield {
  dispose: () => void;
  mesh: Mesh;
  /** What the field is currently drawing. Starts `seeded`, or `pending` until the asset lands. */
  source: () => StarfieldSource | "pending";
  /** Keeps the effectively infinite shell centred on the viewer. */
  update: (elapsedSeconds: number, viewerPosition: Vector3) => void;
}

/** Radius the shell sits at when the caller does not pick one. */
const DEFAULT_SHELL_RADIUS = 90;

/**
 * The fallback sky: a seeded, isotropic scatter of points.
 *
 * This is what a World Forge object gets, because a world that was invented five seconds ago has
 * no place among the real stars to be looked at from. It is deliberately not dressed up as
 * anything else — the scatter is uniform on the sphere and the brightness ramp is random, which
 * is exactly what "we do not know where you are" looks like.
 */
const seededSky = (
  count: number,
  distance: number,
  seed: number,
): { colors: Float32Array; positions: Float32Array } => {
  const positions = new Float32Array(count * 3);
  const colors = new Float32Array(count * 4);

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
    positions[index * 3] = radius * Math.sin(phi) * Math.cos(theta);
    positions[index * 3 + 1] = radius * Math.cos(phi);
    positions[index * 3 + 2] = radius * Math.sin(phi) * Math.sin(theta);
    colors[index * 4] = brightness * 0.72;
    colors[index * 4 + 1] = brightness * 0.85;
    colors[index * 4 + 2] = brightness;
    colors[index * 4 + 3] = 1;
  }

  return { colors, positions };
};

/**
 * Builds the background starfield.
 *
 * Background stars provide scale and depth; resolved stars own the glare treatment and remain the
 * focal light sources. Keeping this as a single point cloud also avoids bright alpha-blended
 * crosses overwhelming planets in the foreground — and it is what makes a real sky affordable,
 * because swapping a seeded scatter for a catalogue changes which points are submitted and
 * nothing at all about the one draw call that submits them.
 *
 * With a viewpoint, the geometry arrives on the microtask that resolves the catalogue rather than
 * during this call. That is deliberate: the download is memoized for the life of the page, so
 * every destination after the first has it in hand before its first frame is drawn, and the one
 * destination that might not is better off showing nothing for a moment than showing an invented
 * sky it would then have to take back.
 */
export const createStarfield = ({
  count,
  distance = DEFAULT_SHELL_RADIUS,
  scene,
  seed,
  viewpoint = null,
}: StarfieldOptions): Starfield => {
  const mesh = markAsVirtualBackground(new Mesh("starfield", scene));

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

  let disposed = false;
  let source: StarfieldSource | "pending" = viewpoint ? "pending" : "seeded";

  const applyPoints = (positions: Float32Array, colors: Float32Array): void => {
    const drawn = positions.length / 3;
    const indices = new Uint32Array(drawn);
    for (let index = 0; index < drawn; index += 1) indices[index] = index;

    const vertexData = new VertexData();
    vertexData.positions = positions;
    vertexData.colors = colors;
    vertexData.indices = indices;
    vertexData.applyToMesh(mesh);
  };

  const applySeeded = (): void => {
    const { colors, positions } = seededSky(count, distance, seed);
    applyPoints(positions, colors);
    source = "seeded";
  };

  if (viewpoint) {
    void loadSkyCatalog().then((catalog) => {
      // The world may already be gone: a visitor can travel again before the first download
      // lands, and `world-scope.ts` disposes the mesh without this closure hearing about it.
      if (disposed || mesh.isDisposed()) return;
      if (!catalog) {
        applySeeded();
        return;
      }
      const projected = projectSky(catalog, viewpoint, {
        shellRadius: distance,
        starLimit: count,
      });
      applyPoints(projected.positions, projected.colors);
      source = "catalog";
    });
  } else {
    applySeeded();
  }

  return {
    mesh,
    source: () => source,
    update: (_elapsedSeconds: number, viewerPosition: Vector3): void => {
      // The whole shell rides with the viewer. Every star on it is at least a parsec away and the
      // scene is a few tens of units across, so there is no parallax to be had inside it — and no
      // way to walk out through it during a long immersive session.
      mesh.position.copyFrom(viewerPosition);
    },
    dispose: (): void => {
      disposed = true;
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
        "glareScale",
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
  material.setFloat("glareScale", 1);
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
      // The billboard's vertices all share the star's centre and are expanded in view space by
      // the shader. Consequently Babylon's world matrix scales the centre but cannot scale that
      // expansion for us. Read the inherited presentation scale explicitly so tabletop AR (and
      // its pinch gesture) shrinks the halo with the star instead of leaving a desktop-sized,
      // translucent quad across the whole camera feed.
      mesh.computeWorldMatrix(true);
      const absoluteScale = mesh.absoluteScaling;
      material.setFloat(
        "glareScale",
        Math.max(Math.abs(absoluteScale.x), Math.abs(absoluteScale.y), Math.abs(absoluteScale.z)),
      );
      material.setFloat("time", elapsedSeconds);
    },
    dispose: (): void => {
      mesh.dispose(false, true);
    },
  };
};
