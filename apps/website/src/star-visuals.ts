import type { Color3 } from "@babylonjs/core/Maths/math.color.js";
import { Vector3 } from "@babylonjs/core/Maths/math.vector.js";
import { Effect } from "@babylonjs/core/Materials/effect.js";
import { ShaderMaterial } from "@babylonjs/core/Materials/shaderMaterial.js";
import { Mesh } from "@babylonjs/core/Meshes/mesh.js";
import type { TransformNode } from "@babylonjs/core/Meshes/transformNode.js";
import type { Scene } from "@babylonjs/core/scene.js";
import { temperatureToRgb } from "@exora/worldgen";

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

const STARFIELD_VERTEX_SHADER = `
precision highp float;
attribute vec3 position;
attribute vec2 corner;
attribute vec3 starColor;
attribute vec3 starProfile;
attribute vec2 starPhase;

uniform mat4 worldView;
uniform mat4 projection;
uniform float time;
uniform float scintillation;

varying vec2 vCorner;
varying vec3 vColor;
varying float vFlux;
varying float vSpike;

void main(void) {
  // Two incommensurate frequencies multiplied together, so no star ever settles into a visible
  // loop and no two stars beat in step with each other.
  float shimmer = sin(time * starPhase.y + starPhase.x)
    * cos(time * starPhase.y * 0.61 + starPhase.x * 1.7);
  float flux = starProfile.y * (1.0 + shimmer * scintillation);

  // Apparent size tracks brightness, not distance: a star is a point source, so what grows on
  // screen is the smear its own flux drives through the optics, never the object itself.
  float radius = starProfile.x * (0.8 + 0.4 * sqrt(max(flux, 0.0)));

  vec4 viewPosition = worldView * vec4(position, 1.0);
  viewPosition.xy += corner * radius;

  vCorner = corner;
  vColor = starColor;
  vFlux = flux;
  vSpike = starProfile.z;
  gl_Position = projection * viewPosition;
}`;

const STARFIELD_FRAGMENT_SHADER = `
precision highp float;
varying vec2 vCorner;
varying vec3 vColor;
varying float vFlux;
varying float vSpike;

${STAR_PSF_GLSL}

void main(void) {
  float intensity = starPointSpread(vCorner, vSpike, 170.0) * vFlux;
  // Most of a faint star's quad is below anything a display can show. Dropping those fragments
  // before the blend is what makes a sky of several thousand billboards affordable.
  if (intensity <= 0.004) discard;
  vec3 tint = starClipToWhite(vColor, intensity);
  gl_FragColor = vec4(tint, clamp(intensity, 0.0, 1.0));
}`;

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
  viewPosition.z = max(viewPosition.z - depthOffset, viewPosition.z * 0.05);
  viewPosition.xy += corner * glareRadius;
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
  Effect.ShadersStore.exoraStarfieldVertexShader = STARFIELD_VERTEX_SHADER;
  Effect.ShadersStore.exoraStarfieldFragmentShader = STARFIELD_FRAGMENT_SHADER;
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
  /** Advances the shimmer and keeps the shell centred on the viewer. */
  update: (elapsedSeconds: number, viewerPosition: Vector3) => void;
}

/**
 * Apparent brightness distribution.
 *
 * Star counts rise steeply toward the faint end — roughly a factor of three per magnitude — so a
 * uniform draw produces a sky of identical mid-grey dots with no hierarchy at all. Raising a
 * uniform variate to a high power reproduces the real shape: a great many barely-there stars, a
 * few hundred obvious ones, and a handful of genuinely dominant beacons the eye can navigate by.
 */
const sampleFlux = (uniform: number): number => uniform ** 3.4;

/**
 * Colour temperature, correlated with apparent brightness on purpose.
 *
 * By count the galaxy is overwhelmingly cool red dwarfs, but *by apparent brightness* the naked-eye
 * sky is the opposite: the stars bright enough to notice are mostly hot and blue-white, because a
 * hot star is luminous enough to be seen from much further away. Sampling temperature independently
 * of flux gets both halves wrong at once — a sky of red first-magnitude stars and no blue ones.
 */
const sampleTemperature = (flux: number, uniform: number): number => {
  const hotBias = flux ** 0.45;
  const cool = 2_900 + uniform * 3_400;
  const hot = 6_200 + uniform ** 0.7 * 18_000;
  return cool + (hot - cool) * hotBias;
};

/**
 * Builds the background sky as one draw call of camera-facing billboards.
 *
 * The alternative — a GL point cloud — is what this replaces, and it cannot work: `gl_PointSize`
 * quads are unfilterable hard-edged squares clamped to a driver-dependent maximum, so every star
 * is the same size, the same shape, and has no glow, no spikes and no colour falloff. Billboards
 * cost four vertices each (a few thousand triangles for the entire sky) and buy a real PSF.
 */
export const createStarfield = ({
  count,
  distance = 90,
  scene,
  seed,
}: StarfieldOptions): Starfield => {
  registerStarShaders();

  const mesh = new Mesh("starfield", scene);
  const positions = new Float32Array(count * 12);
  const corners = new Float32Array(count * 8);
  const colors = new Float32Array(count * 12);
  const profiles = new Float32Array(count * 12);
  const phases = new Float32Array(count * 8);
  const indices = new Uint32Array(count * 6);

  let state = seed >>> 0 || 1;
  const random = (): number => {
    state = (state * 1_664_525 + 1_013_904_223) >>> 0;
    return state / 4_294_967_296;
  };

  // A galactic plane, tilted per seed. Real skies are not isotropic: most of the galaxy's stars
  // lie in a disc, which from inside it reads as the Milky Way. Concentrating a share of the field
  // toward one great circle produces that band for free, out of the stars already being drawn,
  // with no extra geometry and no nebula texture.
  const bandTilt = random() * Math.PI;
  const bandAxis = new Vector3(
    Math.sin(bandTilt),
    Math.cos(bandTilt) * 0.86,
    Math.sin(bandTilt * 1.7) * 0.5,
  );
  bandAxis.normalize();

  for (let index = 0; index < count; index += 1) {
    const inBand = random() < 0.42;
    let direction: Vector3;
    if (inBand) {
      // Latitude pulled tight around the plane perpendicular to bandAxis. Cubing a signed variate
      // keeps the band soft-edged and denser at its spine rather than a hard-edged stripe.
      const spread = (random() * 2 - 1) ** 3 * 0.34;
      const longitude = random() * Math.PI * 2;
      const reference = Math.abs(bandAxis.y) < 0.9 ? new Vector3(0, 1, 0) : new Vector3(1, 0, 0);
      const right = Vector3.Cross(bandAxis, reference).normalize();
      const forward = Vector3.Cross(bandAxis, right).normalize();
      direction = right
        .scale(Math.cos(longitude))
        .addInPlace(forward.scale(Math.sin(longitude)))
        .scaleInPlace(Math.sqrt(Math.max(0, 1 - spread * spread)))
        .addInPlace(bandAxis.scale(spread));
    } else {
      const longitude = random() * Math.PI * 2;
      const latitude = Math.acos(2 * random() - 1);
      direction = new Vector3(
        Math.sin(latitude) * Math.cos(longitude),
        Math.cos(latitude),
        Math.sin(latitude) * Math.sin(longitude),
      );
    }
    direction.normalize().scaleInPlace(distance);

    const flux = sampleFlux(random());
    // Band members are the distant disc population, dimmed so the band reads as a soft glow of
    // unresolved stars rather than as a stripe of bright ones.
    const apparentFlux = (0.1 + flux * 1.55) * (inBand ? 0.62 : 1);
    const [red, green, blue] = temperatureToRgb(sampleTemperature(flux, random()));

    // Angular size in world units at the shell's distance. The floor keeps the faintest stars a
    // resolvable smudge instead of a flickering sub-pixel speck that aliases as the camera turns;
    // above it, size grows with brightness because the PSF's wings are what spread on screen.
    const angularSize = distance * (0.0042 + flux ** 0.55 * 0.019);
    // Only genuinely bright sources push enough energy through the optics to throw visible vanes.
    const spikeStrength = Math.max(0, flux - 0.22) * 1.5;
    const phase = random() * Math.PI * 2;
    const rate = 0.5 + random() * 1.6;

    for (let vertex = 0; vertex < 4; vertex += 1) {
      const vertexIndex = index * 4 + vertex;
      positions[vertexIndex * 3] = direction.x;
      positions[vertexIndex * 3 + 1] = direction.y;
      positions[vertexIndex * 3 + 2] = direction.z;
      corners[vertexIndex * 2] = QUAD_CORNERS[vertex * 2];
      corners[vertexIndex * 2 + 1] = QUAD_CORNERS[vertex * 2 + 1];
      colors[vertexIndex * 3] = red;
      colors[vertexIndex * 3 + 1] = green;
      colors[vertexIndex * 3 + 2] = blue;
      profiles[vertexIndex * 3] = angularSize;
      profiles[vertexIndex * 3 + 1] = apparentFlux;
      profiles[vertexIndex * 3 + 2] = spikeStrength;
      phases[vertexIndex * 2] = phase;
      phases[vertexIndex * 2 + 1] = rate;
    }

    const base = index * 4;
    indices[index * 6] = base;
    indices[index * 6 + 1] = base + 1;
    indices[index * 6 + 2] = base + 2;
    indices[index * 6 + 3] = base + 1;
    indices[index * 6 + 4] = base + 3;
    indices[index * 6 + 5] = base + 2;
  }

  mesh.setVerticesData("position", positions, false, 3);
  mesh.setVerticesData("corner", corners, false, 2);
  mesh.setVerticesData("starColor", colors, false, 3);
  mesh.setVerticesData("starProfile", profiles, false, 3);
  mesh.setVerticesData("starPhase", phases, false, 2);
  mesh.setIndices(indices);

  const material = new ShaderMaterial(
    "starfield-material",
    scene,
    { vertex: "exoraStarfield", fragment: "exoraStarfield" },
    {
      attributes: ["position", "corner", "starColor", "starProfile", "starPhase"],
      uniforms: ["worldView", "projection", "time", "scintillation"],
      needAlphaBlending: true,
    },
  );
  material.backFaceCulling = false;
  material.disableDepthWrite = true;
  // Vacuum has no atmosphere to scintillate through, so this is deliberately far below the
  // twinkle of a ground-level sky: just enough that a still camera does not look at a frozen
  // texture, not enough to claim an optical effect that is not physically there in orbit.
  material.setFloat("scintillation", 0.07);
  material.setFloat("time", 0);
  mesh.material = material;
  mesh.isPickable = false;
  mesh.alwaysSelectAsActiveMesh = true;
  // The shell tracks the camera, so its centre is always zero units away and Babylon's
  // back-to-front sort would otherwise draw the sky *last*, on top of every other transparent
  // object in the group. A fixed low alpha index pins it to the back where it belongs.
  mesh.alphaIndex = 0;

  return {
    mesh,
    update: (elapsedSeconds: number, viewerPosition: Vector3): void => {
      material.setFloat("time", elapsedSeconds);
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
