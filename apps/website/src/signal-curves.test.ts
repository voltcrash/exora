import { expect, test } from "vite-plus/test";
import type { TransitSignal } from "./detection-signal.ts";
import {
  drawsCircularVelocity,
  LIMB_DARKENING,
  niceStep,
  occultedFraction,
  transitCurve,
  velocityCurve,
} from "./signal-curves.ts";

const transit: TransitSignal = {
  depth: 0.015,
  depthSource: "measured",
  durationHours: 3,
  durationSource: "measured",
  impactParameter: 0.5,
  impactSource: "measured",
  periodDays: 3.52,
  radiusRatio: 0.12,
  radiusRatioSource: "measured",
};

test("a planet at disk centre blocks more than k² because the centre is the brightest part", () => {
  const centralBrightening = 1 / (1 - LIMB_DARKENING.u1 / 3 - LIMB_DARKENING.u2 / 6);

  expect(occultedFraction(0, 0.05)).toBeCloseTo(0.0025 * centralBrightening, 4);
  expect(occultedFraction(0.95, 0.05)).toBeLessThan(occultedFraction(0, 0.05));
  expect(occultedFraction(1.06, 0.05)).toBe(0);
});

test("the drawn floor is the archive's measured depth", () => {
  const curve = transitCurve(transit)!;
  const floor = Math.min(...curve.points.map((point) => point.y));

  expect(1 - floor).toBeCloseTo(0.015, 6);
  expect(curve.depth).toBeCloseTo(0.015, 6);
  expect(curve.contactHours).toBe(1.5);
  expect(curve.assumedCentral).toBe(false);
});

test("the curve is flat outside contact and symmetric about mid-transit", () => {
  const curve = transitCurve(transit, 81)!;
  const first = curve.points[0]!;
  const last = curve.points.at(-1)!;

  expect(first.y).toBe(1);
  expect(last.y).toBe(1);
  expect(first.x).toBeCloseTo(-last.x, 9);
  curve.points.forEach((point, index) => {
    expect(point.y).toBeCloseTo(curve.points[curve.points.length - 1 - index]!.y, 9);
  });
});

test("an unreported chord is drawn central and says so", () => {
  expect(transitCurve({ ...transit, impactParameter: null })?.assumedCentral).toBe(true);
  expect(transitCurve({ ...transit, durationHours: null })).toBeNull();
});

test("a derived depth keeps the limb-darkened floor instead of being rescaled", () => {
  const curve = transitCurve({
    ...transit,
    depth: 0.0144,
    depthSource: "derived",
    impactParameter: 0,
  })!;

  expect(curve.depth).toBeGreaterThan(0.0144);
});

test("the star's velocity crosses zero at transit and peaks at K a quarter orbit later", () => {
  const curve = velocityCurve(
    { amplitudeMetersPerSecond: 55.8, lowerBound: false, source: "measured" },
    5,
  );

  expect(curve.map((point) => Math.round(point.y * 10) / 10 + 0)).toEqual([0, -55.8, 0, 55.8, 0]);
  expect(drawsCircularVelocity(0.01)).toBe(true);
  expect(drawsCircularVelocity(0.43)).toBe(false);
});

test("tick steps land on 1, 2 and 5 times a power of ten", () => {
  expect(niceStep(0.5)).toBe(0.2);
  expect(niceStep(55.8)).toBe(20);
  expect(niceStep(3)).toBe(1);
  expect(niceStep(12)).toBe(5);
});
