import bodies from "./data/solar-orbits.json";
import { propagateEphemerisVector, type Vector3Value } from "./solar-ephemeris.ts";

export interface DerivedSolarPosition {
  naifId: number;
  positionAu: Vector3Value;
  provenance: "derived";
}

export const MIN_SOLAR_TIME = Date.UTC(1900, 0, 1);
export const MAX_SOLAR_TIME = Date.UTC(2101, 0, 1) - 1;

export const solarPositionsAt = (date: Date): DerivedSolarPosition[] => {
  const time = date.getTime();
  if (!Number.isFinite(time) || time < MIN_SOLAR_TIME || time > MAX_SOLAR_TIME) {
    throw new RangeError("Solar positions cover UTC 1900–2100 only.");
  }
  const jd = time / 86_400_000 + 2_440_587.5;
  return bodies.map((body) => {
    const index = Math.floor((jd - body.states[0]![0]!) / 365);
    const left = body.states[index]!;
    const right = body.states[index + 1]!;
    const propagate = (state: number[]): Vector3Value => {
      const [epoch, x, y, z, vx, vy, vz] = state as [
        number,
        number,
        number,
        number,
        number,
        number,
        number,
      ];
      return propagateEphemerisVector(
        {
          epoch: new Date((epoch - 2_440_587.5) * 86_400_000).toISOString(),
          positionAu: { x, y, z },
          velocityAuPerDay: { x: vx, y: vy, z: vz },
        },
        date,
      );
    };
    const a = propagate(left);
    const b = propagate(right);
    const t = (jd - left[0]!) / (right[0]! - left[0]!);
    // Smoothly join neighbouring osculating orbits without jumps at anchor boundaries.
    const weight = t * t * (3 - 2 * t);
    return {
      naifId: body.naifId,
      provenance: "derived",
      positionAu: {
        x: a.x + (b.x - a.x) * weight,
        y: a.y + (b.y - a.y) * weight,
        z: a.z + (b.z - a.z) * weight,
      },
    };
  });
};
