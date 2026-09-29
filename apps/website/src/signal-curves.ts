import type { TransitSignal, VelocitySignal } from "./detection-signal.ts";

/*
 * THE CURVES A TELESCOPE RECORDED
 *
 * The transit is drawn from the archive's own depth, duration and chord rather than from a full
 * orbit model: across the few hours a planet spends on its star the chord is a straight line, so
 * the planet's centre sits at z = √(x² + b²) stellar radii, with x running linearly between the
 * first and last contacts. The planet's disk is integrated over a quadratic limb-darkening law,
 * which is what rounds the floor of a real light curve, and the modelled floor is scaled to the
 * archive's measured depth so the picture never contradicts the number printed beside it.
 */

/** Quadratic limb darkening of a Sun-like star in visible light — an assumption, not a fit. */
export const LIMB_DARKENING = { u1: 0.44, u2: 0.23 } as const;

export interface CurvePoint {
  /** Hours from mid-transit, or orbital phase from 0 to 1 for a velocity curve. */
  x: number;
  y: number;
}

export interface TransitCurve {
  /** Hours of first and last contact either side of mid-transit. */
  contactHours: number;
  /** Fractional dip at the floor, matching the archive's depth when it reported one. */
  depth: number;
  points: readonly CurvePoint[];
  /** True when the chord's position was unknown and a central crossing was drawn. */
  assumedCentral: boolean;
  /** Half-width of the plotted window in hours. */
  windowHours: number;
}

const intensity = (radius: number): number => {
  const mu = Math.sqrt(Math.max(1 - radius * radius, 0));
  return 1 - LIMB_DARKENING.u1 * (1 - mu) - LIMB_DARKENING.u2 * (1 - mu) ** 2;
};

const TOTAL_FLUX = Math.PI * (1 - LIMB_DARKENING.u1 / 3 - LIMB_DARKENING.u2 / 6);
const RINGS = 28;
const SPOKES = 56;

/** Fraction of the star's light a disk of radius k blocks with its centre z stellar radii out. */
export const occultedFraction = (z: number, k: number): number => {
  if (z >= 1 + k) return 0;
  let blocked = 0;
  for (let ring = 0; ring < RINGS; ring += 1) {
    const inner = (ring / RINGS) * k;
    const outer = ((ring + 1) / RINGS) * k;
    const r = (inner + outer) / 2;
    const area = (Math.PI * (outer * outer - inner * inner)) / SPOKES;
    for (let spoke = 0; spoke < SPOKES; spoke += 1) {
      const angle = ((spoke + 0.5) / SPOKES) * Math.PI * 2;
      const x = z + r * Math.cos(angle);
      const y = r * Math.sin(angle);
      const distance = Math.hypot(x, y);
      if (distance < 1) blocked += intensity(distance) * area;
    }
  }
  return blocked / TOTAL_FLUX;
};

/** A limb-darkened light curve for the transit, or null without a duration to span. */
export const transitCurve = (transit: TransitSignal, samples = 161): TransitCurve | null => {
  if (transit.durationHours === null || transit.durationHours <= 0) return null;
  const k = transit.radiusRatio;
  const assumedCentral = transit.impactParameter === null;
  const b = Math.min(transit.impactParameter ?? 0, 1 + k - 1e-6);
  const halfChord = Math.sqrt((1 + k) ** 2 - b ** 2);
  const contactHours = transit.durationHours / 2;
  const windowHours = contactHours * 1.6;
  const raw = Array.from({ length: samples }, (_, index) => {
    const hours = -windowHours + (2 * windowHours * index) / (samples - 1);
    const x = (hours / contactHours) * halfChord;
    return { hours, blocked: occultedFraction(Math.hypot(x, b), k) };
  });
  const floor = Math.max(...raw.map(({ blocked }) => blocked));
  const scale = floor > 0 && transit.depthSource === "measured" ? transit.depth / floor : 1;
  return {
    assumedCentral,
    contactHours,
    depth: floor * scale,
    points: raw.map(({ hours, blocked }) => ({ x: hours, y: 1 - blocked * scale })),
    windowHours,
  };
};

/** One orbit of the star's line-of-sight velocity; circular, so a sinusoid of amplitude K. */
export const velocityCurve = (velocity: VelocitySignal, samples = 121): readonly CurvePoint[] =>
  Array.from({ length: samples }, (_, index) => {
    const phase = index / (samples - 1);
    // Phase 0 is the transit: the planet crosses in front, so the star is moving neither way.
    return { x: phase, y: -velocity.amplitudeMetersPerSecond * Math.sin(2 * Math.PI * phase) };
  });

/** Eccentric orbits skew the curve by an argument of periastron the reading does not carry. */
export const drawsCircularVelocity = (eccentricity: number | null): boolean =>
  eccentricity === null || eccentricity < 0.1;

/** A 1, 2 or 5 × 10ⁿ tick step that divides `span` into about `divisions` intervals. */
export const niceStep = (span: number, divisions = 2): number => {
  const raw = span / divisions;
  const magnitude = 10 ** Math.floor(Math.log10(raw));
  const normalized = raw / magnitude;
  return (normalized >= 5 ? 5 : normalized >= 2 ? 2 : 1) * magnitude;
};
