/**
 * The real sky, re-observed from wherever the visitor is standing.
 *
 * A starfield made of seeded noise is the same sky everywhere, which is the one thing the sky
 * demonstrably is not. Stand on a world 200 parsecs away and the constellations are not rotated —
 * they are *taken apart*, because the stars that drew them sit at wildly different distances and
 * the near ones have swung across the sky while the far ones have barely moved. That difference
 * is the whole point of going somewhere, and it only appears if the stars are real ones with real
 * distances.
 *
 * So this module holds a catalogue and the geometry that re-observes it:
 *
 * - `parseSkyCatalog` maps the bundled binary onto typed arrays and turns each catalogued right
 *   ascension and declination into a unit vector, once, for the life of the page.
 * - `projectSky` places the viewer in the same heliocentric frame the catalogue uses, subtracts,
 *   and reads off a new direction and a new apparent magnitude for every star.
 *
 * Every number that reaches the screen came out of a catalogue row. Nothing is generated to fill
 * a gap: a star with no usable parallax keeps its direction and loses its distance rather than
 * being assigned a plausible one, a star with no colour index never made it into the asset, and a
 * viewer whose own position is unknown gets no catalogue sky at all — see `star-visuals.ts`,
 * where that case falls back to the seeded field.
 *
 * The asset is built by `scripts/build-star-catalog.ts` from HYG v4.4; provenance and licence are
 * in THIRD_PARTY_ASSETS.md.
 */

import { temperatureToRgb } from "@exora/worldgen";

/** Version-stamped, so a regenerated catalogue can never be served from a stale cache entry. */
export const SKY_CATALOG_URL = "/sky/hyg-v44-vmag65.bin";

/** `EXSK`, little-endian. */
const MAGIC = 0x4b_53_58_45;
const FORMAT_VERSION = 1;
const HEADER_BYTES = 16;
const BYTES_PER_STAR = 16;

/** Magnitude and colour index ship as thousandths in an `Int16Array`. */
const MILLI = 1_000;

const DEGREES_TO_RADIANS = Math.PI / 180;

/**
 * The distance written for a star the catalogue could not place.
 *
 * HYG marks a missing, negative or uselessly small parallax by setting the distance to 100,000 pc;
 * the build script rewrites that marker as zero, which no real star can have. Such a star is
 * drawn in its catalogued direction and never moved, because moving it would require a distance
 * nobody has measured.
 */
const NO_PARALLAX_DISTANCE = 0;

/**
 * How close the viewpoint has to be to a catalogued star before that star is treated as the one
 * the scene is already drawing, rather than as part of the background.
 *
 * Stand on a world orbiting Vega and Vega is in this catalogue too — at a separation of a few
 * thousandths of a parsec, since Exora's viewpoint distance and HYG's distance come from the same
 * Hipparcos parallax. Drawn as a background point it would be a second, magnitude -25 Vega
 * pasted over the resolved star the scene renders in front of the visitor. It also divides by
 * zero. A fifth of a parsec is far wider than the disagreement between two catalogues about a
 * nearby star and far narrower than the gap to its true nearest neighbour.
 */
const SUBJECT_SEPARATION_PARSECS = 0.2;

/**
 * The apparent magnitude that reads at full brightness: Sirius, seen from Earth.
 *
 * Fixed rather than taken from the brightest star actually on screen, so brightness stays
 * absolute. A sky with nothing bright in it is supposed to look dim, and a scale normalised per
 * viewpoint would silently promote the best of a faint lot to look like Sirius.
 */
const REFERENCE_MAGNITUDE = -1.44;

/** Floor on a drawn star's intensity, so the faintest survivor of the cut is still just visible. */
const MINIMUM_INTENSITY = 0.22;

export interface SkyCatalog {
  /** Johnson B-V in thousandths of a magnitude, as catalogued. */
  colourIndex: Int16Array;
  count: number;
  /** Parsecs from the Sun, or `NO_PARALLAX_DISTANCE` for a star with no usable parallax. */
  distanceParsecs: Float32Array;
  /** The catalogue's own faint cut, in magnitudes. */
  magnitudeLimit: number;
  /**
   * Heliocentric unit vectors, three per star, in the equatorial frame the catalogue uses:
   * +X toward the vernal equinox, +Z toward the north celestial pole, +Y toward 6h right
   * ascension on the equator. Derived once from the catalogued right ascension and declination.
   */
  unitDirections: Float32Array;
  /** Johnson V in thousandths of a magnitude, as seen from Earth. */
  visualMagnitude: Int16Array;
}

/** Where the visitor is, in the same terms the catalogue states a star's position. */
export interface SkyViewpoint {
  declinationDegrees: number;
  distanceParsecs: number;
  rightAscensionDegrees: number;
}

/** Vertex data for one projected sky, sized to the stars actually drawn. */
export interface SkyProjection {
  /** Four floats per star: red, green, blue, alpha. */
  colors: Float32Array;
  /** How many stars survived the visibility cut, capped by the device's star budget. */
  drawn: number;
  /** Three floats per star, on the shell, in Babylon's left-handed scene axes. */
  positions: Float32Array;
}

export interface ProjectSkyOptions {
  /** Radius of the shell the sky is painted on. Sets scale only; it rides with the viewer. */
  shellRadius: number;
  /** The device's star budget, from `RenderQualityProfile.starCount`. */
  starLimit: number;
}

/**
 * A star's effective temperature from its Johnson B-V colour index.
 *
 * Ballesteros (2012), "New insights into black bodies", EPL 97 34008: a two-term fit that treats
 * the star as a black body observed through the B and V bands. It is a published relation applied
 * to a catalogued colour, which is what keeps a star's hue traceable to a measurement rather than
 * to a brightness ramp. It flattens out for the very bluest stars — a B-V of -0.3 comes back near
 * 17,000 K where the star is really hotter — but the black-body curve is already saturated
 * blue-white by then, so the colour it produces is right even where the temperature is low.
 */
export const colourIndexToTemperatureKelvin = (colourIndex: number): number =>
  4_600 * (1 / (0.92 * colourIndex + 1.7) + 1 / (0.92 * colourIndex + 0.62));

/**
 * Reads the viewpoint out of a catalogue object's own observed position.
 *
 * Returns null unless all three numbers are there and usable, because a viewer whose place in the
 * galaxy is unknown cannot be given a sky: any position chosen for them would be invented, and
 * every star in the resulting sky would be wrong in a way nothing on screen would admit to.
 */
export const skyViewpointFrom = (observation: {
  declinationDegrees: number | null;
  distanceParsecs: number | null;
  rightAscensionDegrees: number | null;
}): SkyViewpoint | null => {
  const { declinationDegrees, distanceParsecs, rightAscensionDegrees } = observation;
  if (rightAscensionDegrees === null || declinationDegrees === null || distanceParsecs === null) {
    return null;
  }
  if (
    !Number.isFinite(rightAscensionDegrees) ||
    !Number.isFinite(declinationDegrees) ||
    !Number.isFinite(distanceParsecs) ||
    distanceParsecs <= 0
  ) {
    return null;
  }
  return { declinationDegrees, distanceParsecs, rightAscensionDegrees };
};

/**
 * Maps the equatorial frame onto Babylon's scene axes, with the north celestial pole up.
 *
 * The swap of the last two components is not cosmetic. Equatorial coordinates are right-handed
 * and a Babylon scene is left-handed, so feeding the components straight through would render a
 * mirror image of the sky — every constellation flipped, which is both wrong and, for the
 * recognisable ones, obviously wrong. Exchanging two axes is a reflection, and a reflection
 * composed with the handedness change leaves the sky the right way round.
 */
const toSceneAxes = (
  equatorialX: number,
  equatorialY: number,
  equatorialZ: number,
  into: Float32Array,
  offset: number,
): void => {
  into[offset] = equatorialX;
  into[offset + 1] = equatorialZ;
  into[offset + 2] = equatorialY;
};

export class SkyCatalogFormatError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "SkyCatalogFormatError";
  }
}

/**
 * Maps the downloaded asset onto typed arrays.
 *
 * The columns are stored one after another rather than interleaved per star, so each one becomes
 * a single view over the same buffer: no copying, no per-star object, and the whole catalogue
 * costs one allocation plus the unit directions derived below.
 */
export const parseSkyCatalog = (buffer: ArrayBuffer): SkyCatalog => {
  if (buffer.byteLength < HEADER_BYTES) {
    throw new SkyCatalogFormatError("Sky catalogue is shorter than its own header.");
  }

  const header = new DataView(buffer);
  if (header.getUint32(0, true) !== MAGIC) {
    throw new SkyCatalogFormatError("Sky catalogue does not start with the EXSK magic number.");
  }

  const version = header.getUint16(4, true);
  if (version !== FORMAT_VERSION) {
    throw new SkyCatalogFormatError(
      `Sky catalogue is format version ${version}; this build reads version ${FORMAT_VERSION}.`,
    );
  }

  const count = header.getUint32(8, true);
  const expectedBytes = HEADER_BYTES + count * BYTES_PER_STAR;
  if (buffer.byteLength !== expectedBytes) {
    throw new SkyCatalogFormatError(
      `Sky catalogue declares ${count} stars (${expectedBytes} bytes) but is ${buffer.byteLength} bytes.`,
    );
  }

  const magnitudeLimit = header.getFloat32(12, true);
  const rightAscensionRadians = new Float32Array(buffer, HEADER_BYTES, count);
  const declinationRadians = new Float32Array(buffer, HEADER_BYTES + count * 4, count);
  const distanceParsecs = new Float32Array(buffer, HEADER_BYTES + count * 8, count);
  const visualMagnitude = new Int16Array(buffer, HEADER_BYTES + count * 12, count);
  const colourIndex = new Int16Array(buffer, HEADER_BYTES + count * 14, count);

  // Derived once here rather than per world: four trigonometric calls each, for every star, on
  // every arrival at a new destination is a cost with no reason to be paid more than once.
  const unitDirections = new Float32Array(count * 3);
  for (let index = 0; index < count; index += 1) {
    const rightAscension = rightAscensionRadians[index];
    const declination = declinationRadians[index];
    const cosineDeclination = Math.cos(declination);
    unitDirections[index * 3] = cosineDeclination * Math.cos(rightAscension);
    unitDirections[index * 3 + 1] = cosineDeclination * Math.sin(rightAscension);
    unitDirections[index * 3 + 2] = Math.sin(declination);
  }

  return {
    colourIndex,
    count,
    distanceParsecs,
    magnitudeLimit,
    unitDirections,
    visualMagnitude,
  };
};

let pendingCatalog: Promise<SkyCatalog | null> | null = null;

/**
 * Downloads and parses the catalogue once for the lifetime of the page.
 *
 * Resolves with null rather than rejecting when the asset is missing or malformed: an unreachable
 * sky asset is not a reason to fail a destination, and every caller already has the seeded
 * starfield to fall back to.
 */
export const loadSkyCatalog = async (): Promise<SkyCatalog | null> => {
  pendingCatalog ??= (async () => {
    try {
      const response = await fetch(SKY_CATALOG_URL);
      if (!response.ok) {
        throw new Error(`Sky catalogue request failed with status ${response.status}.`);
      }
      return parseSkyCatalog(await response.arrayBuffer());
    } catch (error) {
      console.warn("[sky-catalog] falling back to the seeded starfield", error);
      return null;
    }
  })();

  return pendingCatalog;
};

/** Test seam: forgets the memoized download so a suite can install a different one. */
export const resetSkyCatalogForTesting = (): void => {
  pendingCatalog = null;
};

/**
 * Re-observes the catalogue from `viewpoint`.
 *
 * Three things happen to each star, and each of them is the reason one of the requirements above
 * exists:
 *
 * - Its heliocentric position is differenced against the viewer's, so a star 5 pc from the viewer
 *   swings right across the sky while one at 800 pc barely stirs. That is the parallax that turns
 *   the constellations into something else.
 * - Its apparent magnitude is recomputed for the new distance. Approaching a star makes it
 *   brighter; leaving it behind can push it below the naked-eye limit, and then it is not drawn,
 *   because from there nobody could see it.
 * - Its colour comes from the catalogued B-V, through a black-body temperature.
 *
 * A star with no usable parallax skips the first two: it keeps its catalogued direction and its
 * catalogued magnitude, which is all anyone knows about it.
 */
export const projectSky = (
  catalog: SkyCatalog,
  viewpoint: SkyViewpoint,
  { shellRadius, starLimit }: ProjectSkyOptions,
): SkyProjection => {
  const rightAscension = viewpoint.rightAscensionDegrees * DEGREES_TO_RADIANS;
  const declination = viewpoint.declinationDegrees * DEGREES_TO_RADIANS;
  const cosineDeclination = Math.cos(declination);
  const viewerX = viewpoint.distanceParsecs * cosineDeclination * Math.cos(rightAscension);
  const viewerY = viewpoint.distanceParsecs * cosineDeclination * Math.sin(rightAscension);
  const viewerZ = viewpoint.distanceParsecs * Math.sin(declination);

  const { count, distanceParsecs, magnitudeLimit, unitDirections, visualMagnitude } = catalog;

  // One slot per star that survives the cut. Ranking happens afterwards, over the survivors
  // alone, so it never has to touch a star the viewer cannot see in the first place.
  const candidateStars = new Uint32Array(count);
  const candidateMagnitudes = new Float32Array(count);
  let visible = 0;

  for (let index = 0; index < count; index += 1) {
    const catalogDistance = distanceParsecs[index];
    const magnitude = visualMagnitude[index] / MILLI;

    if (catalogDistance === NO_PARALLAX_DISTANCE) {
      // Unplaceable, so unmovable. It was visible from Earth at this magnitude, and that is the
      // only statement the catalogue supports about it.
      candidateStars[visible] = index;
      candidateMagnitudes[visible] = magnitude;
      visible += 1;
      continue;
    }

    const offset = index * 3;
    const deltaX = unitDirections[offset] * catalogDistance - viewerX;
    const deltaY = unitDirections[offset + 1] * catalogDistance - viewerY;
    const deltaZ = unitDirections[offset + 2] * catalogDistance - viewerZ;
    const separation = Math.sqrt(deltaX * deltaX + deltaY * deltaY + deltaZ * deltaZ);
    if (separation < SUBJECT_SEPARATION_PARSECS) continue;

    // The inverse-square law in magnitudes: five of them per factor of a hundred in distance.
    const apparent = magnitude + 5 * Math.log10(separation / catalogDistance);
    if (apparent > magnitudeLimit) continue;

    candidateStars[visible] = index;
    candidateMagnitudes[visible] = apparent;
    visible += 1;
  }

  const drawn = Math.min(visible, starLimit);
  let drawStars = candidateStars.subarray(0, drawn);
  let drawMagnitudes = candidateMagnitudes.subarray(0, drawn);

  if (visible > starLimit) {
    // Brightest first, so a device that can only afford part of the sky gets the part of it a
    // person would actually notice. The sort moves slot numbers rather than stars, because the
    // star and the magnitude computed for it live in two arrays that have to stay in step.
    const slots = new Uint32Array(visible);
    for (let slot = 0; slot < visible; slot += 1) slots[slot] = slot;
    slots.sort((left, right) => candidateMagnitudes[left] - candidateMagnitudes[right]);

    drawStars = new Uint32Array(drawn);
    drawMagnitudes = new Float32Array(drawn);
    for (let rank = 0; rank < drawn; rank += 1) {
      const slot = slots[rank];
      drawStars[rank] = candidateStars[slot];
      drawMagnitudes[rank] = candidateMagnitudes[slot];
    }
  }

  return buildVertexData(catalog, drawStars, drawMagnitudes, shellRadius, {
    viewerX,
    viewerY,
    viewerZ,
  });
};

interface ViewerPosition {
  viewerX: number;
  viewerY: number;
  viewerZ: number;
}

/**
 * Turns the chosen stars into positions and colours.
 *
 * `stars` and `apparentMagnitudes` are parallel and already in draw order: the magnitude at each
 * slot is the one recomputed for this viewpoint, never the one the catalogue holds.
 */
const buildVertexData = (
  catalog: SkyCatalog,
  stars: Uint32Array,
  apparentMagnitudes: Float32Array,
  shellRadius: number,
  { viewerX, viewerY, viewerZ }: ViewerPosition,
): SkyProjection => {
  const drawn = stars.length;
  const positions = new Float32Array(drawn * 3);
  const colors = new Float32Array(drawn * 4);
  const { colourIndex, distanceParsecs, magnitudeLimit, unitDirections } = catalog;
  const magnitudeSpan = magnitudeLimit - REFERENCE_MAGNITUDE;

  for (let drawIndex = 0; drawIndex < drawn; drawIndex += 1) {
    const star = stars[drawIndex];
    const offset = star * 3;
    const catalogDistance = distanceParsecs[star];

    let directionX = unitDirections[offset];
    let directionY = unitDirections[offset + 1];
    let directionZ = unitDirections[offset + 2];

    if (catalogDistance !== NO_PARALLAX_DISTANCE) {
      const deltaX = directionX * catalogDistance - viewerX;
      const deltaY = directionY * catalogDistance - viewerY;
      const deltaZ = directionZ * catalogDistance - viewerZ;
      const separation = Math.sqrt(deltaX * deltaX + deltaY * deltaY + deltaZ * deltaZ);
      directionX = deltaX / separation;
      directionY = deltaY / separation;
      directionZ = deltaZ / separation;
    }

    toSceneAxes(
      directionX * shellRadius,
      directionY * shellRadius,
      directionZ * shellRadius,
      positions,
      drawIndex * 3,
    );

    const apparent = apparentMagnitudes[drawIndex];
    // Linear in magnitude, which is Pogson's scale and therefore already logarithmic in flux —
    // the way brightness is perceived rather than the way it is measured. Linear in flux would
    // leave everything below second magnitude as black pixels.
    const brightness = Math.min(1, Math.max(0, (magnitudeLimit - apparent) / magnitudeSpan));
    const intensity = MINIMUM_INTENSITY + (1 - MINIMUM_INTENSITY) * brightness;

    const [red, green, blue] = temperatureToRgb(
      colourIndexToTemperatureKelvin(colourIndex[star] / MILLI),
    );
    // A source bright enough to clip does so in every channel at once, so the brightest stars
    // whiten while the fainter ones keep their colour. Same curve as `starClipToWhite` in
    // `star-visuals.ts`, so the background sky and a resolved star's glare agree about it.
    const whiten = Math.min(1, Math.max(0, intensity - 0.5)) * 0.92;
    const colorOffset = drawIndex * 4;
    colors[colorOffset] = (red + (1 - red) * whiten) * intensity;
    colors[colorOffset + 1] = (green + (1 - green) * whiten) * intensity;
    colors[colorOffset + 2] = (blue + (1 - blue) * whiten) * intensity;
    colors[colorOffset + 3] = 1;
  }

  return { colors, drawn, positions };
};
