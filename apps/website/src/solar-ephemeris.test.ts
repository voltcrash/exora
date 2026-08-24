import type { EphemerisVector } from "@exora/contracts";
import { expect, test } from "vite-plus/test";
import { isEphemerisDerivedAt, propagateEphemerisVector } from "./solar-ephemeris.ts";

const circularEarth: EphemerisVector = {
  epoch: "2026-01-01T00:00:00.000Z",
  name: "Earth",
  naifId: 399,
  positionAu: { x: 1, y: 0, z: 0 },
  solution: "DE441",
  spkId: "399",
  velocityAuPerDay: { x: 0, y: 0.017_202_124, z: 0 },
};

test("keeps an authoritative vector unchanged at its Horizons epoch", () => {
  expect(propagateEphemerisVector(circularEarth, new Date(circularEarth.epoch))).toEqual(
    circularEarth.positionAu,
  );
  expect(isEphemerisDerivedAt([circularEarth], new Date(circularEarth.epoch))).toBe(false);
});

test("advances a Horizons state in its measured three-dimensional orbital plane", () => {
  const quarterYear = new Date(
    new Date(circularEarth.epoch).getTime() + 365.256_9 * 0.25 * 86_400_000,
  );
  const position = propagateEphemerisVector(circularEarth, quarterYear);

  expect(position.x).toBeCloseTo(0, 3);
  expect(position.y).toBeCloseTo(1, 3);
  expect(position.z).toBeCloseTo(0, 9);
  expect(Math.hypot(position.x, position.y, position.z)).toBeCloseTo(1, 3);
  expect(isEphemerisDerivedAt([circularEarth], quarterYear)).toBe(true);
});
