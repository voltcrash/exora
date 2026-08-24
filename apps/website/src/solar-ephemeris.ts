import type { EphemerisVector } from "@exora/contracts";

/** Gaussian gravitational constant squared, in AU³/day², for heliocentric two-body propagation. */
const SOLAR_MU_AU3_PER_DAY2 = 0.000_295_912_208_285_591_1;

export interface Vector3Value {
  x: number;
  y: number;
  z: number;
}

const magnitude = ({ x, y, z }: Vector3Value): number => Math.hypot(x, y, z);
const scale = ({ x, y, z }: Vector3Value, amount: number): Vector3Value => ({
  x: x * amount,
  y: y * amount,
  z: z * amount,
});
const subtract = (left: Vector3Value, right: Vector3Value): Vector3Value => ({
  x: left.x - right.x,
  y: left.y - right.y,
  z: left.z - right.z,
});
const dot = (left: Vector3Value, right: Vector3Value): number =>
  left.x * right.x + left.y * right.y + left.z * right.z;
const cross = (left: Vector3Value, right: Vector3Value): Vector3Value => ({
  x: left.y * right.z - left.z * right.y,
  y: left.z * right.x - left.x * right.z,
  z: left.x * right.y - left.y * right.x,
});
const normalize = (value: Vector3Value): Vector3Value => scale(value, 1 / magnitude(value));

const solveEccentricAnomaly = (meanAnomaly: number, eccentricity: number): number => {
  let eccentricAnomaly = meanAnomaly;
  for (let iteration = 0; iteration < 12; iteration += 1) {
    const correction =
      (eccentricAnomaly - eccentricity * Math.sin(eccentricAnomaly) - meanAnomaly) /
      (1 - eccentricity * Math.cos(eccentricAnomaly));
    eccentricAnomaly -= correction;
    if (Math.abs(correction) < 1e-12) break;
  }
  return eccentricAnomaly;
};

/**
 * Advances one authoritative Horizons state vector without inventing a catalog phase.
 *
 * Horizons supplies both position and velocity. Between explicit lookups Exora converts that
 * state into its osculating heliocentric ellipse and advances it under the Sun's two-body field.
 * The UI labels this interval as derived; selecting a new time obtains a fresh JPL anchor.
 */
export const propagateEphemerisVector = (
  vector: EphemerisVector,
  displayedAt: Date,
): Vector3Value => {
  const position = vector.positionAu;
  const elapsedDays = (displayedAt.getTime() - new Date(vector.epoch).getTime()) / 86_400_000;
  // Preserve the authoritative sample byte-for-byte at its own epoch; no derived arithmetic is
  // needed until the clock actually moves away from it.
  if (elapsedDays === 0) return { ...position };
  const velocity = vector.velocityAuPerDay;
  const radius = magnitude(position);
  const angularMomentum = cross(position, velocity);
  const angularMomentumMagnitude = magnitude(angularMomentum);
  const speedSquared = dot(velocity, velocity);
  const energy = speedSquared / 2 - SOLAR_MU_AU3_PER_DAY2 / radius;
  const semiMajorAxis = -SOLAR_MU_AU3_PER_DAY2 / (2 * energy);
  if (
    !Number.isFinite(radius) ||
    radius <= 0 ||
    !Number.isFinite(semiMajorAxis) ||
    semiMajorAxis <= 0 ||
    angularMomentumMagnitude <= 0
  ) {
    return { ...position };
  }

  const eccentricityVector = subtract(
    scale(cross(velocity, angularMomentum), 1 / SOLAR_MU_AU3_PER_DAY2),
    scale(position, 1 / radius),
  );
  const eccentricity = magnitude(eccentricityVector);
  if (!Number.isFinite(eccentricity) || eccentricity >= 1) return { ...position };

  const periapsis = eccentricity > 1e-8 ? normalize(eccentricityVector) : normalize(position);
  const normal = normalize(angularMomentum);
  const transverse = normalize(cross(normal, periapsis));
  const root = Math.sqrt(1 - eccentricity ** 2);
  const cosineAtEpoch = dot(position, periapsis) / semiMajorAxis + eccentricity;
  const sineAtEpoch = dot(position, transverse) / (semiMajorAxis * root);
  const anomalyAtEpoch = Math.atan2(sineAtEpoch, cosineAtEpoch);
  const meanAtEpoch = anomalyAtEpoch - eccentricity * Math.sin(anomalyAtEpoch);
  const meanMotion = Math.sqrt(SOLAR_MU_AU3_PER_DAY2 / semiMajorAxis ** 3);
  const eccentricAnomaly = solveEccentricAnomaly(
    meanAtEpoch + meanMotion * elapsedDays,
    eccentricity,
  );

  const alongPeriapsis = semiMajorAxis * (Math.cos(eccentricAnomaly) - eccentricity);
  const alongTransverse = semiMajorAxis * root * Math.sin(eccentricAnomaly);
  return {
    x: periapsis.x * alongPeriapsis + transverse.x * alongTransverse,
    y: periapsis.y * alongPeriapsis + transverse.y * alongTransverse,
    z: periapsis.z * alongPeriapsis + transverse.z * alongTransverse,
  };
};

export const isEphemerisDerivedAt = (
  vectors: readonly EphemerisVector[],
  displayedAt: Date,
): boolean => {
  const anchor = vectors[0]?.epoch;
  return anchor ? Math.abs(displayedAt.getTime() - new Date(anchor).getTime()) >= 1_000 : false;
};
