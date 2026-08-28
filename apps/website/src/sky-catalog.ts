import { temperatureToRgb } from "@exora/worldgen";

export const SKY_CATALOG_URL = "/sky/hyg-v44-vmag65.bin";

const MAGIC = 0x4b_53_58_45;
const FORMAT_VERSION = 1;
// Header followed by columnar RA, declination, distance, magnitude, and colour arrays.
const HEADER_BYTES = 16;
const BYTES_PER_STAR = 16;

const MILLI = 1_000;

const DEGREES_TO_RADIANS = Math.PI / 180;

const NO_PARALLAX_DISTANCE = 0;

const SUBJECT_SEPARATION_PARSECS = 0.2;

const REFERENCE_MAGNITUDE = -1.44;

const MINIMUM_INTENSITY = 0.22;

export interface SkyCatalog {
  colourIndex: Int16Array;
  count: number;
  distanceParsecs: Float32Array;
  magnitudeLimit: number;
  unitDirections: Float32Array;
  visualMagnitude: Int16Array;
}

export interface SkyViewpoint {
  declinationDegrees: number;
  distanceParsecs: number;
  rightAscensionDegrees: number;
}

export interface SkyProjection {
  colors: Float32Array;
  drawn: number;
  positions: Float32Array;
}

export interface ProjectSkyOptions {
  shellRadius: number;
  starLimit: number;
}

export const colourIndexToTemperatureKelvin = (colourIndex: number): number =>
  4_600 * (1 / (0.92 * colourIndex + 1.7) + 1 / (0.92 * colourIndex + 0.62));

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

const valueAt = (values: ArrayLike<number>, index: number): number => {
  const value = values[index];
  if (value === undefined) {
    throw new SkyCatalogFormatError(`Sky catalogue column is missing value ${index}.`);
  }
  return value;
};

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

  const unitDirections = new Float32Array(count * 3);
  for (let index = 0; index < count; index += 1) {
    const rightAscension = valueAt(rightAscensionRadians, index);
    const declination = valueAt(declinationRadians, index);
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

export const resetSkyCatalogForTesting = (): void => {
  pendingCatalog = null;
};

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

  const candidateStars = new Uint32Array(count);
  const candidateMagnitudes = new Float32Array(count);
  let visible = 0;

  for (let index = 0; index < count; index += 1) {
    const catalogDistance = valueAt(distanceParsecs, index);
    const magnitude = valueAt(visualMagnitude, index) / MILLI;

    if (catalogDistance === NO_PARALLAX_DISTANCE) {
      candidateStars[visible] = index;
      candidateMagnitudes[visible] = magnitude;
      visible += 1;
      continue;
    }

    const offset = index * 3;
    const deltaX = valueAt(unitDirections, offset) * catalogDistance - viewerX;
    const deltaY = valueAt(unitDirections, offset + 1) * catalogDistance - viewerY;
    const deltaZ = valueAt(unitDirections, offset + 2) * catalogDistance - viewerZ;
    const separation = Math.sqrt(deltaX * deltaX + deltaY * deltaY + deltaZ * deltaZ);
    if (separation < SUBJECT_SEPARATION_PARSECS) continue;

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
    const slots = new Uint32Array(visible);
    for (let slot = 0; slot < visible; slot += 1) slots[slot] = slot;
    slots.sort(
      (left, right) => valueAt(candidateMagnitudes, left) - valueAt(candidateMagnitudes, right),
    );

    drawStars = new Uint32Array(drawn);
    drawMagnitudes = new Float32Array(drawn);
    for (let rank = 0; rank < drawn; rank += 1) {
      const slot = valueAt(slots, rank);
      drawStars[rank] = valueAt(candidateStars, slot);
      drawMagnitudes[rank] = valueAt(candidateMagnitudes, slot);
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
    const star = valueAt(stars, drawIndex);
    const offset = star * 3;
    const catalogDistance = valueAt(distanceParsecs, star);

    let directionX = valueAt(unitDirections, offset);
    let directionY = valueAt(unitDirections, offset + 1);
    let directionZ = valueAt(unitDirections, offset + 2);

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

    const apparent = valueAt(apparentMagnitudes, drawIndex);
    const brightness = Math.min(1, Math.max(0, (magnitudeLimit - apparent) / magnitudeSpan));
    const intensity = MINIMUM_INTENSITY + (1 - MINIMUM_INTENSITY) * brightness;

    const [red, green, blue] = temperatureToRgb(
      colourIndexToTemperatureKelvin(valueAt(colourIndex, star) / MILLI),
    );
    const whiten = Math.min(1, Math.max(0, intensity - 0.5)) * 0.92;
    const colorOffset = drawIndex * 4;
    colors[colorOffset] = (red + (1 - red) * whiten) * intensity;
    colors[colorOffset + 1] = (green + (1 - green) * whiten) * intensity;
    colors[colorOffset + 2] = (blue + (1 - blue) * whiten) * intensity;
    colors[colorOffset + 3] = 1;
  }

  return { colors, drawn, positions };
};
