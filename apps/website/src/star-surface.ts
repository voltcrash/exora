import { Color3 } from "@babylonjs/core/Maths/math.color.js";
import { Vector3 } from "@babylonjs/core/Maths/math.vector.js";
import { Effect } from "@babylonjs/core/Materials/effect.js";
import { ShaderMaterial } from "@babylonjs/core/Materials/shaderMaterial.js";
import { StandardMaterial } from "@babylonjs/core/Materials/standardMaterial.js";
import type { AbstractMesh } from "@babylonjs/core/Meshes/abstractMesh.js";
import { Mesh } from "@babylonjs/core/Meshes/mesh.js";
import { MeshBuilder } from "@babylonjs/core/Meshes/meshBuilder.js";
import type { TransformNode } from "@babylonjs/core/Meshes/transformNode.js";
import type { Scene } from "@babylonjs/core/scene.js";
import { type RenderQualityProfile, shaderDefines } from "./render-quality.ts";
import { createStarGlare, type StarGlare } from "./star-visuals.ts";

/**
 * The resolved surface of a star: photosphere, corona and glare, built once and shared by every
 * scene that has to draw one.
 *
 * Both scenes previously drew their own star and disagreed about what one is. The star scene had a
 * procedural photosphere; the planet scene had a flat emissive sphere with a translucent shell
 * around it, which is why its host star read as a grey ping-pong ball hanging in the sky. There is
 * only one right answer to "what does a star look like", so there is now only one implementation,
 * and both scenes feed it from the same worldgen-derived parameters.
 */

const STAR_VERTEX_SHADER = `
precision highp float;
attribute vec3 position;
attribute vec3 normal;
uniform mat4 world;
uniform mat4 worldViewProjection;
varying vec3 vObjectPosition;
varying vec3 vNormal;
varying vec3 vWorldPosition;
void main(void) {
  vObjectPosition = normalize(position);
  vNormal = normalize(mat3(world) * normal);
  vWorldPosition = (world * vec4(position, 1.0)).xyz;
  gl_Position = worldViewProjection * vec4(position, 1.0);
}`;

/**
 * Photosphere shading: multi-scale evolving convection, a supergranular magnetic network that
 * carries both the broad mottling and the limb-brightened faculae riding on it, deterministic
 * irregular starspots, a chromospheric rim on the cool active stars that actually have one,
 * mandatory limb darkening, and a final display/exposure adaptation pass kept separate from the
 * physical blackbody colour so the two concerns (what temperature the star physically is vs. how
 * that reads on a screen) never get tangled together.
 */
const STAR_FRAGMENT_SHADER = `
precision highp float;
varying vec3 vObjectPosition;
varying vec3 vNormal;
varying vec3 vWorldPosition;

uniform float time;
uniform float seed;
uniform float activity;
uniform float rotationFactor;
uniform float spotCoverage;
uniform float granulationScale;
uniform float granulationStrength;
uniform float temperatureKelvin;
uniform vec3 baseColor;
uniform vec3 hotColor;
uniform vec3 spotColor;
uniform vec3 cameraPosition;

/**
 * How hard the photosphere blows out on screen. Purely a display choice — it never feeds back into
 * the blackbody colour or into anything the planet renderer lights from.
 *
 * It has to be high enough that the disc reads as emitting rather than as lit — an unsaturated
 * mid-tone ball is what the eye classifies as "an object with a light shining on it". But not
 * higher: past the point where the whole disc clips, granulation, faculae and spots all vanish
 * into flat white and the star loses every bit of surface it has. The brightness that a display
 * cannot carry is delivered by the corona and the glare around the disc instead.
 */
const float STAR_EXPOSURE = 3.0;

float hash13(vec3 p) {
  p = fract(p * 0.1031 + seed * 0.00001357);
  p += dot(p, p.zyx + 31.32);
  return fract((p.x + p.y) * p.z);
}
vec3 hash33(vec3 p) {
  p = vec3(
    dot(p, vec3(127.1, 311.7, 74.7)),
    dot(p, vec3(269.5, 183.3, 246.1)),
    dot(p, vec3(113.5, 271.9, 124.6))
  );
  return fract(sin(p + seed * 0.0001) * 43758.5453123);
}
float noise(vec3 p) {
  vec3 i = floor(p);
  vec3 f = fract(p);
  f = f * f * (3.0 - 2.0 * f);
  return mix(
    mix(mix(hash13(i), hash13(i + vec3(1,0,0)), f.x), mix(hash13(i + vec3(0,1,0)), hash13(i + vec3(1,1,0)), f.x), f.y),
    mix(mix(hash13(i + vec3(0,0,1)), hash13(i + vec3(1,0,1)), f.x), mix(hash13(i + vec3(0,1,1)), hash13(i + vec3(1,1,1)), f.x), f.y), f.z
  );
}
float fbm(vec3 p) {
  float value = 0.0;
  float amplitude = 0.56;
  for (int i = 0; i < FBM_OCTAVES; i++) {
    value += noise(p) * amplitude;
    p = p.yzx * 2.07 + vec3(7.1, 13.7, 19.3);
    amplitude *= 0.48;
  }
  return value;
}
// Cellular/Voronoi field with per-cell drift: feature points wobble in place over time rather
// than sliding uniformly, so cells evolve and occasionally reshuffle like real convection
// granules instead of looking like a texture scrolling underneath the surface.
//
// Returns (F1, F2, cellHash). F2 - F1 goes to zero exactly on a cell boundary, which is what
// gives the thin intergranular downflow lanes their shape — a plain F1 distance band would
// instead draw rings inside each cell.
vec3 cellular(vec3 p) {
  vec3 base = floor(p);
  vec3 local = fract(p);
  float nearest = 8.0;
  float second = 8.0;
  float cellHash = 0.0;
  for (int z = -1; z <= 1; z += 1) {
    for (int y = -1; y <= 1; y += 1) {
      for (int x = -1; x <= 1; x += 1) {
        vec3 offset = vec3(float(x), float(y), float(z));
        vec3 jitter = hash33(base + offset);
        vec3 featurePoint = offset + jitter * 0.88;
        float wobblePhase = jitter.x * 6.28318 + time * (0.1 + jitter.y * 0.15);
        featurePoint += 0.16 * jitter.z * vec3(sin(wobblePhase), cos(wobblePhase * 1.3), sin(wobblePhase * 0.7));
        float distanceToPoint = length(local - featurePoint);
        if (distanceToPoint < nearest) {
          second = nearest;
          nearest = distanceToPoint;
          cellHash = hash13(base + offset);
        } else if (distanceToPoint < second) {
          second = distanceToPoint;
        }
      }
    }
  }
  return vec3(nearest, second, cellHash);
}

#ifdef STAR_ADVANCED
vec3 rotateY(vec3 p, float angle) {
  float s = sin(angle);
  float c = cos(angle);
  return vec3(p.x * c - p.z * s, p.y, p.x * s + p.z * c);
}
// Irregular, clustered starspots: cluster centers come from a coarse cellular field, only a
// spotCoverage-controlled fraction of clusters are "active", and their boundary is perturbed
// by a finer noise field so edges read as ragged rather than perfect circles. A soft
// mid-latitude bias mirrors the belts real spots tend to favor without excluding the poles.
vec3 starspotField(vec3 p) {
  vec3 rotated = rotateY(p, time * (0.015 + rotationFactor * 0.05));
  float latitudeBias = mix(0.4, 1.0, exp(-pow((abs(rotated.y) - 0.5) * 2.4, 2.0)));
  vec3 warped = rotated + (fbm(rotated * 1.6 + 9.1) - 0.5) * 0.4;
  vec3 clusters = cellular(warped * 2.4);
  float threshold = 1.0 - clamp(spotCoverage * 1.9 * latitudeBias, 0.0, 0.96);
  float clusterActive = step(threshold, clusters.z);
  float clusterRadius = mix(0.055, 0.17, fract(clusters.z * 17.23));
  // Noise, not a second Voronoi pass: this only has to make the spot outline ragged so it does
  // not read as a circular decal, and noise breaks the circle just as well for far less cost.
  float boundary = clusters.x + (noise(warped * 9.0 + 5.0) - 0.5) * 0.09;
  float umbra = (1.0 - smoothstep(clusterRadius * 0.45, clusterRadius, boundary)) * clusterActive;
  float penumbra = (1.0 - smoothstep(clusterRadius, clusterRadius * 1.55, boundary)) * clusterActive;
  float plage = (1.0 - smoothstep(clusterRadius * 1.55, clusterRadius * 2.2, boundary)) * clusterActive;
  return vec3(umbra, penumbra - umbra, plage - penumbra);
}
#endif

void main(void) {
  vec3 p = normalize(vObjectPosition);

  vec3 viewDirection = normalize(cameraPosition - vWorldPosition);
  float mu = clamp(dot(normalize(vNormal), viewDirection), 0.0, 1.0);

  // Granule size. A real granule spans about a thousandth of the disc, so the only thing that
  // matters at any achievable frequency is that they read as *texture* rather than as geometry.
  // A few dozen cells across the whole star is the cracked-mud / golf-ball failure; several
  // hundred is a surface. Cooler, more convective stars still get proportionally larger cells.
  // Supergranulation: a convective scale roughly thirty times coarser than the granules, whose
  // boundaries are where the surface magnetic field piles up. Ridge lines of a low-frequency fbm
  // rather than a second 27-tap Voronoi pass — only the lane geometry is legible at this scale, so
  // ridged noise buys the same web for a fraction of the fragment cost.
  //
  // One field, three jobs: the broad brightness mottling, the magnetic network the faculae ride
  // on, and a spatial modulation of granule size. On a real star all three are consequences of the
  // same supergranular flow, so taking them from three separate noises would be both more
  // expensive and less truthful — and uniformly sized granules are exactly what makes a Voronoi
  // photosphere read as crackle glaze rather than as convection.
  float networkField = fbm(p * (2.3 + granulationScale * 0.8) + 4.3);
  float network = pow(clamp(1.0 - abs(networkField * 2.0 - 1.0), 0.0, 1.0), 5.0);
  float supergranule = mix(0.965, 1.04, networkField);

  float granuleFrequency = (16.0 + granulationScale * 8.0) * (0.72 + networkField * 0.62);
  vec3 cellSpace = p * granuleFrequency;
  // Both warps are sampled well BELOW the cell frequency, and that is the whole trick. A warp
  // sampled at or above the frequency of the cells it is warping does not bend the lattice, it
  // shreds it: every cell gets displaced by a large fraction of its own width independently of its
  // neighbours, the Voronoi structure dissolves, and what is left on screen is high-frequency
  // salt-and-pepper static that reads as sensor noise rather than as a surface. The warp offset
  // is what drifts with time, not the lattice, so the pattern evolves in place instead of sliding
  // across the surface like a texture on a turntable.
  float warpTime = time * 0.06;
  vec3 warpField = vec3(
    fbm(cellSpace * 0.25 + vec3(0.0, 0.0, warpTime)),
    fbm(cellSpace * 0.25 + vec3(5.2, 1.3, warpTime * 0.83)),
    fbm(cellSpace * 0.25 + vec3(1.7, 9.2, warpTime * 1.14))
  );
  vec3 warped = cellSpace + (warpField - 0.5) * 1.5;
  // A second, coarser warp makes the cell walls wander. Without it the Voronoi edges stay evenly
  // spaced and the surface reads as lizard skin stretched over a ball.
  warped += (vec3(
    noise(cellSpace * 0.55 + 11.0),
    noise(cellSpace * 0.55 + 23.0),
    noise(cellSpace * 0.55 + 37.0)
  ) - 0.5) * 0.6;

  vec3 cells = cellular(warped);

  // Distance to the nearest cell *boundary*. F2 - F1 vanishes exactly on a boundary, so this is a
  // clean measure of how deep inside its granule a fragment sits — unlike the distance to the
  // feature point, which peaks wherever the jitter happened to throw the seed rather than in the
  // middle of the cell, and so lights granules off-centre.
  float boundary = cells.y - cells.x;
  float laneWidth = mix(0.05, 0.12, noise(warped * 1.7 + 3.0));
  float lane = 1.0 - smoothstep(0.0, laneWidth, boundary);
  // Granule interiors are domed: hot gas rises through the middle and cools as it spreads out to
  // the edges, so brightness falls off from the centre toward the downflow lane that rings it.
  float dome = smoothstep(0.0, 0.34, boundary);
  // Granules are all doing the same thing, so they are all close to the same brightness. A wide
  // random spread here is what turns a convection pattern into a field of unrelated speckles.
  float cellSeed = fract(cells.z * 7.31);
  float cellBrightness = mix(0.96, 1.05, cellSeed);

  float granulation = (0.84 + dome * 0.32) * cellBrightness * supergranule;
  // Lane depth varies per cell rather than being one constant applied to the whole web. A single
  // uniform darkening draws every boundary at the same weight, which is what turns the network
  // into a crazed-porcelain grid instead of a field of individually convecting cells.
  granulation *= 1.0 - lane * (0.08 + granulationStrength * 0.16) * mix(0.55, 1.4, cellSeed);
  // Granulation contrast falls away toward the limb, where the line of sight grazes the tops of
  // the cells rather than looking straight down into them. Collapsing it almost completely there
  // also keeps the fine cell pattern from aliasing where foreshortening crushes it below a pixel.
  granulation = mix(1.0, granulation, smoothstep(0.0, 0.5, mu));

  // Granulation drives emission level; the hottest granule cores also shift toward the star's
  // hot colour, so brightness and hue move together the way rising convection cells do.
  vec3 color = mix(
    baseColor,
    hotColor,
    clamp((granulation - 0.85) * 1.6, 0.0, 1.0) * (0.35 + granulationStrength * 0.5)
  );
  color *= granulation;

  // Faculae: the bright walls of the magnetic network. They are nearly invisible at disc centre
  // and brighten sharply toward the limb, because there the line of sight enters the hot side wall
  // of a flux tube instead of looking straight down its cooler throat. That limb dependence is the
  // entire signature — applied evenly across the disc they read as scattered white speckle.
  float faculae = network * activity * (1.0 - mu) * (1.0 - mu);
  color += hotColor * faculae * 0.5;

#ifdef STAR_ADVANCED
  vec3 spots = starspotField(p);
  float umbra = spots.x;
  float penumbra = clamp(spots.y, 0.0, 1.0);
  float plage = clamp(spots.z, 0.0, 1.0);
  color = mix(color, spotColor * 0.55, umbra);
  color = mix(color, spotColor * 1.05, penumbra * 0.85);
  color += hotColor * plage * activity * 0.22;
#endif

  // Mandatory limb darkening: cooler photospheres darken more sharply toward the edge than
  // hotter, more radiative ones. mu is the view-angle cosine, independent of any light
  // direction, since the star is the light source rather than something lit externally.
  float temperatureNorm = clamp((temperatureKelvin - 3000.0) / 27000.0, 0.0, 1.0);
  float limbCoefficient = mix(0.72, 0.36, temperatureNorm);
  // The plain linear law, deliberately. Raising it to a further power drove the edge of a cool
  // star down to a fifth of disc centre, which stops reading as shading and starts reading as a
  // dark outline drawn around the disc.
  float limb = 1.0 - limbCoefficient * (1.0 - mu);
  color *= limb;

  // Chromospheric rim. In the last fraction of a degree of the disc the line of sight leaves the
  // photosphere and grazes the thin hot gas above it, which emits in the red hydrogen lines.
  //
  // Gated on temperature directly, not on the normalised 0-1 remap: a linear falloff still leaves
  // three quarters of the effect on an A star, and an A star has essentially no chromosphere, so
  // it comes out as a drawn-on salmon ring rather than as an emission layer. The smoothstep hands
  // it to the K and M dwarfs that actually carry a thick one and to nobody else.
  // smoothstep's edges must ascend — a descending pair is undefined in GLSL, and reversing them
  // here is what put a dark red ring around an A star that has no chromosphere to speak of.
  float chromosphere = pow(1.0 - mu, 6.0)
    * activity
    * (1.0 - smoothstep(3800.0, 6800.0, temperatureKelvin));
  color += vec3(1.0, 0.36, 0.28) * chromosphere * 0.35;

  // Display/exposure adaptation, kept strictly separate from the physical blackbody colour above.
  // A photosphere is a light source, so it has to read as emitting rather than settle at some mid
  // grey — a plain Reinhard curve maps an emission of 1.0 to 0.5 and makes the star a dull ball.
  //
  // The curve is applied to LUMINANCE and the hue is then restored, rather than being applied per
  // channel. A per-channel exponential lifts the dim channels proportionally further than the
  // bright ones, so it bleaches every colour it brightens: a 3,000 K red supergiant comes out of
  // it as a cream ball with no temperature left in it at all. Tone-mapping the brightness and
  // putting the chromaticity back keeps the star's temperature legible at any exposure.
  float luminance = dot(color, vec3(0.2126, 0.7152, 0.0722));
  float exposed = 1.0 - exp(-luminance * STAR_EXPOSURE);
  vec3 shown = color * (exposed / max(luminance, 0.0001));
  // Only the part of the disc that is genuinely clipping whitens, the way an over-exposed
  // photograph does — not the whole star.
  shown = mix(shown, vec3(1.0), clamp(exposed - 0.9, 0.0, 1.0) * 3.0);

  gl_FragColor = vec4(clamp(shown, 0.0, 1.0), 1.0);
}`;

const CORONA_VERTEX_SHADER = `
precision highp float;
attribute vec3 position;
attribute vec3 normal;
uniform mat4 world;
uniform mat4 worldViewProjection;
varying vec3 vObjectPosition;
varying vec3 vNormal;
varying vec3 vWorldPosition;
void main(void) {
  vObjectPosition = normalize(position);
  vNormal = normalize(mat3(world) * normal);
  vWorldPosition = (world * vec4(position, 1.0)).xyz;
  gl_Position = worldViewProjection * vec4(position, 1.0);
}`;

/**
 * A thin emissive shell rather than a uniform bloom sphere: density is keyed to how close the view
 * ray passes to the star's own limb, and low-frequency noise sampled in a purely directional frame
 * breaks the halo into radial streamers instead of a perfectly round ring.
 */
const CORONA_FRAGMENT_SHADER = `
precision highp float;
varying vec3 vObjectPosition;
varying vec3 vNormal;
varying vec3 vWorldPosition;

uniform float time;
uniform float seed;
uniform float coronalIntensity;
uniform float starRadius;
uniform float shellRadii;
uniform vec3 starCenter;
uniform vec3 coronaColor;
uniform vec3 chromosphereColor;
uniform vec3 cameraPosition;

float hash13(vec3 p) {
  p = fract(p * 0.1031 + seed * 0.00001357);
  p += dot(p, p.zyx + 31.32);
  return fract((p.x + p.y) * p.z);
}
float noise(vec3 p) {
  vec3 i = floor(p);
  vec3 f = fract(p);
  f = f * f * (3.0 - 2.0 * f);
  return mix(
    mix(mix(hash13(i), hash13(i + vec3(1,0,0)), f.x), mix(hash13(i + vec3(0,1,0)), hash13(i + vec3(1,1,0)), f.x), f.y),
    mix(mix(hash13(i + vec3(0,0,1)), hash13(i + vec3(1,0,1)), f.x), mix(hash13(i + vec3(0,1,1)), hash13(i + vec3(1,1,1)), f.x), f.y), f.z
  );
}
float fbm(vec3 p) {
  float value = 0.0;
  float amplitude = 0.56;
  for (int i = 0; i < CORONA_OCTAVES; i++) {
    value += noise(p) * amplitude;
    p = p.yzx * 2.07 + vec3(7.1, 13.7, 19.3);
    amplitude *= 0.48;
  }
  return value;
}
void main(void) {
  // Impact parameter of this fragment's view ray, measured from the star's centre in stellar
  // radii. Keying the falloff to distance from the STAR — rather than to a Fresnel term on the
  // shell — is what anchors the glow to the photosphere's limb. A shell Fresnel instead peaks
  // at the shell's own silhouette, where it saturates into a hard-edged bright circle floating
  // in empty space, which reads as a black disc with a ring drawn around it.
  vec3 rayDirection = normalize(vWorldPosition - cameraPosition);
  vec3 toStar = starCenter - cameraPosition;
  float along = dot(toStar, rayDirection);
  float impact = length(toStar - rayDirection * along);
  float radii = impact / max(starRadius, 0.0001);
  // Only the half of the sky the star is actually in. The impact parameter is measured on the
  // infinite view line, so a ray pointing away from the star reports exactly what its mirror image
  // reports, and would hang a second corona behind the viewer. Nothing could see that while the
  // shell was only ever drawn from outside; a camera that ends up inside one sees all of it.
  float ahead = smoothstep(0.0, starRadius, along);

  // Two falloffs, because a corona is not one exponential. A tight, bright inner rim hugs the limb
  // where the chromosphere and low corona are dense; a much shallower halo reaches out several
  // radii. A single exponential can be one or the other and never both, which is why a one-term
  // corona always ends up either a hard ring or a featureless fog.
  float rim = exp(-(radii - 1.0) * 13.0);
  float halo = exp(-(radii - 1.0) * 1.9) * 0.5;
  // The rim is weighted well below its own peak on purpose. This shell composites with ordinary
  // alpha blending, so an alpha approaching 1 does not add plasma over the limb — it *replaces*
  // the limb, painting a tinted ring straight over the brightest part of the star.
  // Cut off inside the disc so the photosphere stays crisp under its own corona, and fade out
  // before the shell's own silhouette so the shell never shows up as geometry.
  float density = (rim * 0.34 + halo)
    * ahead
    * smoothstep(0.985, 1.02, radii)
    * (1.0 - smoothstep(shellRadii * 0.82, shellRadii, radii));

  // Resolved before the noise below, and dropped here rather than at the end, because density is
  // the cheap term and the streamers are the whole cost of this shader. The shell covers the
  // frame from close in and most of that is the star's own disc, where the corona is cut off
  // anyway — shading it would be paying the fractal for pixels that composite to nothing.
  if (density <= 0.0005) discard;

  // Structure sampled in a frame that varies only with DIRECTION from the star, so the pattern is
  // fixed to the corona's own geometry and stretches radially outward the way a helmet streamer
  // does. Sampling in world position instead makes the noise drift sideways across the halo like a
  // cloud layer, which is the single most obvious tell that a corona is a texture on a sphere.
  vec3 direction = normalize(vObjectPosition);
  float drift = time * 0.02;
  float streamers = fbm(direction * 3.2 + vec3(0.0, drift, 0.0));
  // A single noise octave, not a second fbm: at this frequency the corona only needs its
  // streamers broken up, and a full fractal here costs as much as everything else in the shader.
  float filaments = noise(direction * 8.5 - vec3(drift * 0.6, 0.0, drift * 0.4));
  float shape = 0.34 + smoothstep(0.22, 0.85, streamers) * 0.72 + filaments * 0.16;

  // Real coronae are strongly flattened toward the equator outside of solar maximum: field lines
  // over the poles open into the wind and carry little bright closed-loop plasma with them.
  shape *= mix(1.0, 0.52, smoothstep(0.42, 0.96, abs(direction.y)));

  // The inner rim runs hotter and pinker than the pearly outer halo, the way the chromosphere
  // sits colour-separated against the white corona in an eclipse photograph.
  vec3 tint = mix(coronaColor, chromosphereColor, clamp(rim * 0.45, 0.0, 0.45));
  float alpha = clamp(density * shape * (0.45 + coronalIntensity * 0.75), 0.0, 0.72);

  gl_FragColor = vec4(tint, alpha);
}`;

let shadersRegistered = false;

const registerSurfaceShaders = (): void => {
  if (shadersRegistered) return;
  shadersRegistered = true;
  Effect.ShadersStore.exoraStarVertexShader = STAR_VERTEX_SHADER;
  Effect.ShadersStore.exoraStarFragmentShader = STAR_FRAGMENT_SHADER;
  Effect.ShadersStore.exoraCoronaVertexShader = CORONA_VERTEX_SHADER;
  Effect.ShadersStore.exoraCoronaFragmentShader = CORONA_FRAGMENT_SHADER;
};

const clampUnit = (value: number): number => Math.min(1, Math.max(0, value));

/** The worldgen-derived inputs the photosphere needs. Satisfied by both `StarVisualRecipe` and a
 * world recipe's `star`, so a catalogue star and a host star render through the same code. */
export interface StellarSurfaceRecipe {
  activity: number;
  color: readonly [red: number, green: number, blue: number];
  coronalIntensity: number;
  granulationScale: number;
  granulationStrength: number;
  temperatureKelvin: number;
}

export interface StellarSurfaceOptions {
  /**
   * How much of the frame this star is expected to occupy.
   *
   * `subject` is the star a scene is *about*: full segment count, starspots, a wide corona, and a
   * restrained glare, since at that size a big diffraction burst reads as a lens artefact rather
   * than as brightness. `distant` is a star hanging in someone else's sky: it covers few pixels, so
   * the budget moves off the surface (which nobody can resolve) and onto the glare and spikes,
   * which are the only things that make a small bright object read as a star at all.
   */
  detail: "distant" | "subject";
  /** Photosphere diameter in scene units. */
  diameter: number;
  parent?: TransformNode;
  pickable?: boolean;
  position: Vector3;
  profile: RenderQualityProfile;
  recipe: StellarSurfaceRecipe;
  /**
   * Rendering group for the star's own geometry. Defaults to the opaque group; a caller that draws
   * the star against a sky dome needs it in a later group so it is not sorted behind one.
   */
  renderingGroupId?: number;
  rotationFactor?: number;
  scene: Scene;
  seed: number;
  spotCoverage: number;
}

export interface StellarSurface {
  dispose: () => void;
  /** Every mesh the star is made of, for callers that need to attach picking or toggle visibility. */
  meshes: AbstractMesh[];
  photosphere: Mesh;
  update: (elapsedSeconds: number, cameraPosition: Vector3) => void;
}

export const createStellarSurface = ({
  detail,
  diameter,
  parent,
  pickable = false,
  position,
  profile,
  recipe,
  renderingGroupId = 0,
  rotationFactor = 0.4,
  scene,
  seed,
  spotCoverage,
}: StellarSurfaceOptions): StellarSurface => {
  registerSurfaceShaders();

  const isSubject = detail === "subject";
  // Quest is GPU-limited enough that the per-pixel 27-tap cellular field used for spots and active
  // regions is skipped entirely there, as is any surface detail on a star nobody can resolve.
  // Granulation and limb darkening (mandatory) stay on every tier — they carry most of the read.
  const advanced = isSubject && profile.tier !== "quest";
  const segments = isSubject ? (profile.tier === "desktop" ? 128 : 64) : 32;
  const coronaOctaves = profile.tier === "desktop" ? 4 : profile.tier === "mobile" ? 3 : 2;
  const coronaShellRadii = 2.6;

  // A UV sphere is enough here: nothing displaces the star's surface (all detail — granulation,
  // spots, limb darkening — is computed per-fragment from the normal/view direction), so the pole
  // pinching an icosphere would avoid never becomes visible, and the cheaper geometry leaves more
  // of the frame budget for the shading itself.
  const photosphere = MeshBuilder.CreateSphere("star-photosphere", { diameter, segments }, scene);
  if (parent) photosphere.parent = parent;
  photosphere.position.copyFrom(position);
  photosphere.isPickable = pickable;
  photosphere.applyFog = false;
  photosphere.renderingGroupId = renderingGroupId;

  const material = new ShaderMaterial(
    "star-photosphere-material",
    scene,
    { vertex: "exoraStar", fragment: "exoraStar" },
    {
      attributes: ["position", "normal"],
      defines: [...shaderDefines(profile), ...(advanced ? ["#define STAR_ADVANCED"] : [])],
      uniforms: [
        "world",
        "worldViewProjection",
        "cameraPosition",
        "time",
        "seed",
        "activity",
        "rotationFactor",
        "spotCoverage",
        "granulationScale",
        "granulationStrength",
        "temperatureKelvin",
        "baseColor",
        "hotColor",
        "spotColor",
      ],
    },
  );
  const [red, green, blue] = recipe.color;
  const baseColor = new Color3(red, green, blue);
  // hotColor drives bright granule cores, faculae and active regions (lifted toward white);
  // spotColor drives umbra/penumbra (pulled toward black and slightly desaturated, the way a
  // sunspot reads darker and cooler rather than simply dimmer).
  const hotColor = Color3.Lerp(baseColor, Color3.White(), 0.45);
  const spotColor = Color3.Lerp(baseColor, Color3.Black(), 0.72);
  material.setColor3("baseColor", baseColor);
  material.setColor3("hotColor", hotColor);
  material.setColor3("spotColor", spotColor);
  material.setFloat("seed", seed);
  material.setFloat("activity", recipe.activity);
  material.setFloat("rotationFactor", rotationFactor);
  material.setFloat("spotCoverage", spotCoverage);
  material.setFloat("granulationScale", recipe.granulationScale);
  material.setFloat("granulationStrength", recipe.granulationStrength);
  material.setFloat("temperatureKelvin", recipe.temperatureKelvin);
  material.setFloat("time", 0);
  photosphere.material = material;

  // Only the subject star gets a corona shell. On a star a few pixels across the streamer
  // structure is unresolvable, the extra alpha-blended sphere is pure fill cost, and a shell three
  // times the star's diameter is large enough to intersect nearby geometry — the glare billboard
  // carries the halo far more cheaply and reads better at that size.
  const buildCorona = (): { material: ShaderMaterial; mesh: Mesh } => {
    const mesh = MeshBuilder.CreateSphere(
      "star-corona",
      {
        diameter: diameter * coronaShellRadii,
        segments: profile.tier === "desktop" ? 64 : 40,
        // Drawn on the shell's FAR side rather than the near one. The shader resolves the corona
        // from the view ray's impact parameter, so which of the two surfaces a fragment lands on
        // cannot change the picture — but it decides whether there is a fragment at all, and the
        // near side is the one an approaching viewer runs into. The shell stands 2.6 stellar radii
        // off, which for the star view is 9.36 scene units against a camera that comes in to 9.5:
        // fully zoomed the near surface sat inside the one-unit near clip plane and was discarded,
        // so the halo shrank as a visitor approached and then went out altogether, leaving the
        // disc cut hard against black. The far surface is a whole chord further along every ray —
        // on the rays that carry any corona at all it is never within several units of the viewer —
        // and it still wraps a camera that ends up inside the shell, which the diorama's does at
        // 3.5 units against a shell reaching 3.9.
        sideOrientation: Mesh.BACKSIDE,
      },
      scene,
    );
    if (parent) mesh.parent = parent;
    mesh.position.copyFrom(position);
    mesh.isPickable = pickable;
    mesh.applyFog = false;
    // A group later than the star's own, matching the planet atmosphere shell. Sharing the star's
    // group the transparent shell sorts against the starfield and blanks it out, leaving a black
    // annulus around the star instead of blending over it.
    mesh.renderingGroupId = renderingGroupId + 1;

    const coronaMaterial = new ShaderMaterial(
      "star-corona-material",
      scene,
      { vertex: "exoraCorona", fragment: "exoraCorona" },
      {
        attributes: ["position", "normal"],
        defines: [`#define CORONA_OCTAVES ${coronaOctaves}`],
        uniforms: [
          "world",
          "worldViewProjection",
          "cameraPosition",
          "time",
          "seed",
          "coronalIntensity",
          "coronaColor",
          "chromosphereColor",
          "starCenter",
          "starRadius",
          "shellRadii",
        ],
        needAlphaBlending: true,
      },
    );
    // Standard alpha blending, not ALPHA_ADD: the scene runs at Intermediate performance priority,
    // which keeps render state between frames, and an explicitly forced additive mode ends up
    // stale here — the shell then blanks the starfield behind it and leaves a black annulus.
    coronaMaterial.backFaceCulling = true;
    coronaMaterial.disableDepthWrite = true;
    // A corona is million-kelvin plasma scattering photospheric light, so it photographs pearly
    // white almost regardless of the star beneath it; only a trace of the star's own hue survives.
    coronaMaterial.setColor3("coronaColor", Color3.Lerp(hotColor, Color3.White(), 0.5));
    // The warm inner rim is a cool-star feature, for the same reason as the photosphere's own
    // chromospheric edge: hot radiative stars have almost no chromosphere. Left warm on an A star
    // it lands as a brown ring in the gap between the darkened limb and the white halo, which is
    // the most conspicuous artefact this whole shell can produce.
    const chromosphereWarmth = 1 - clampUnit((recipe.temperatureKelvin - 4_200) / 3_000);
    coronaMaterial.setColor3(
      "chromosphereColor",
      Color3.Lerp(
        Color3.Lerp(hotColor, Color3.White(), 0.5),
        Color3.Lerp(new Color3(1, 0.55, 0.44), baseColor, 0.5),
        chromosphereWarmth,
      ),
    );
    coronaMaterial.setFloat("seed", seed);
    coronaMaterial.setFloat("coronalIntensity", recipe.coronalIntensity);
    coronaMaterial.setFloat("starRadius", diameter * 0.5);
    coronaMaterial.setFloat("shellRadii", coronaShellRadii);
    coronaMaterial.setFloat("time", 0);
    mesh.material = coronaMaterial;
    return { material: coronaMaterial, mesh };
  };

  const corona = isSubject ? buildCorona() : null;
  // The corona's falloff is measured from the star's world-space centre, which has to be refreshed
  // whenever the star can move — a host star rides a rotating root in the planet scene.
  const starCenter = Vector3.Zero();

  // A generous, invisible hit volume. The photosphere is pickable in its own right, but a star in
  // someone else's sky can be a very small disc, and the glare that makes it findable is a
  // camera-facing billboard whose CPU-side geometry is a single degenerate point — visually
  // correct, completely unpickable. Without this, making the star clickable at all would depend on
  // hitting a handful of pixels. Fully transparent rather than merely hidden: Babylon's default
  // pick predicate rejects `isVisible === false`, so an invisible mesh cannot be picked either.
  const pickTarget = pickable
    ? MeshBuilder.CreateSphere(
        "star-pick-target",
        { diameter: diameter * 2.4, segments: 12 },
        scene,
      )
    : null;
  if (pickTarget) {
    if (parent) pickTarget.parent = parent;
    pickTarget.position.copyFrom(position);
    pickTarget.applyFog = false;
    pickTarget.renderingGroupId = renderingGroupId;
    const pickMaterial = new StandardMaterial("star-pick-target-material", scene);
    pickMaterial.disableLighting = true;
    pickMaterial.alpha = 0;
    pickMaterial.disableDepthWrite = true;
    pickMaterial.freeze();
    pickTarget.material = pickMaterial;
  }

  const glare: StarGlare = createStarGlare({
    color: Color3.Lerp(baseColor, Color3.White(), 0.35),
    diameter,
    // A star that fills the frame is already overwhelmingly bright on its own; one that covers a
    // handful of pixels has nothing but its glare to say so.
    intensity: isSubject ? 0.78 + recipe.activity * 0.25 : 1.15,
    parent,
    position,
    scene,
    // The glare has to land on top of the disc it belongs to, not be sorted behind it.
    renderingGroupId: renderingGroupId + 1,
    spikes: isSubject ? 0.28 : 1,
    spread: isSubject ? 3.2 : 5.5,
  });
  glare.mesh.isPickable = pickable;

  const meshes: AbstractMesh[] = [photosphere, glare.mesh];
  if (corona) meshes.push(corona.mesh);
  if (pickTarget) meshes.push(pickTarget);

  return {
    meshes,
    photosphere,
    update: (elapsedSeconds: number, cameraPosition: Vector3): void => {
      material.setFloat("time", elapsedSeconds);
      material.setVector3("cameraPosition", cameraPosition);
      glare.update(elapsedSeconds);
      if (corona) {
        corona.material.setFloat("time", elapsedSeconds);
        corona.material.setVector3("cameraPosition", cameraPosition);
        corona.mesh.computeWorldMatrix(true).getTranslationToRef(starCenter);
        corona.material.setVector3("starCenter", starCenter);
      }
      photosphere.rotation.y = elapsedSeconds * (0.008 + rotationFactor * 0.07);
    },
    dispose: (): void => {
      glare.dispose();
      pickTarget?.dispose(false, true);
      corona?.mesh.dispose(false, true);
      photosphere.dispose(false, true);
    },
  };
};
