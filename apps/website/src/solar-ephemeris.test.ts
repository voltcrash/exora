import type { OrbitalState } from "./solar-ephemeris.ts";
import { expect, test } from "vite-plus/test";
import { propagateEphemerisVector } from "./solar-ephemeris.ts";

const circularEarth: OrbitalState = {
  epoch: "2026-01-01T00:00:00.000Z",
  positionAu: { x: 1, y: 0, z: 0 },
  velocityAuPerDay: { x: 0, y: 0.017_202_124, z: 0 },
};

test("keeps an orbital state unchanged at its anchor epoch", () => {
  expect(propagateEphemerisVector(circularEarth, new Date(circularEarth.epoch))).toEqual(
    circularEarth.positionAu,
  );
});

test("advances an orbital state in its three-dimensional orbital plane", () => {
  const quarterYear = new Date(
    new Date(circularEarth.epoch).getTime() + 365.256_9 * 0.25 * 86_400_000,
  );
  const position = propagateEphemerisVector(circularEarth, quarterYear);

  expect(position.x).toBeCloseTo(0, 3);
  expect(position.y).toBeCloseTo(1, 3);
  expect(position.z).toBeCloseTo(0, 9);
  expect(Math.hypot(position.x, position.y, position.z)).toBeCloseTo(1, 3);
});
