import type { DetectionSignal } from "@exora/contracts";
import { expect, test } from "vite-plus/test";
import {
  bjdToUtcMs,
  earthHeliocentric,
  nextTransitFact,
  predictTransits,
  roemerDelaySeconds,
} from "./transit-ephemeris.ts";

const J2000 = 2_451_545;
const utc = new Intl.DateTimeFormat("en-GB", {
  dateStyle: "medium",
  timeStyle: "short",
  timeZone: "UTC",
});

const signal = (overrides: Partial<DetectionSignal>): DetectionSignal => ({
  impactParameter: null,
  orbitalPeriodUncertaintyDays: null,
  radialVelocityAmplitudeMetersPerSecond: null,
  radiusRatio: null,
  transitDepthPercent: null,
  transitDurationHours: null,
  transitMidpointBjd: null,
  transitMidpointUncertaintyDays: null,
  ...overrides,
});

test("Earth sits at perihelion distance in early January", () => {
  const [x, y, z] = earthHeliocentric(J2000);

  expect(Math.hypot(x, y, z)).toBeCloseTo(0.983, 2);
});

test("light from a star behind the Sun reaches Earth about eight minutes after the barycentre", () => {
  // The Sun's apparent position on 2000 January 1.5.
  expect(roemerDelaySeconds(J2000, 281.3, -23.03)).toBeCloseTo(-490, -1);
  expect(roemerDelaySeconds(J2000, 101.3, 23.03)).toBeCloseTo(490, -1);
});

test("without a sky position only the TDB to UTC offset is removed", () => {
  expect(bjdToUtcMs(2_440_587.5, null, null)).toBeCloseTo(-69_184, 0);
});

test("the next three crossings follow one period apart with a widening error", () => {
  const nowMs = Date.UTC(2026, 8, 28);
  const predictions = predictTransits({
    declinationDegrees: null,
    nowMs,
    periodDays: 1.5,
    rightAscensionDegrees: null,
    signal: signal({
      orbitalPeriodUncertaintyDays: 0.000_01,
      transitMidpointBjd: 2_457_000,
      transitMidpointUncertaintyDays: 0.000_1,
    }),
  });

  expect(predictions).toHaveLength(3);
  expect(predictions[0]!.midTransitMs).toBeGreaterThan(nowMs);
  expect(predictions[0]!.midTransitMs - nowMs).toBeLessThanOrEqual(1.5 * 86_400_000);
  expect(predictions[1]!.midTransitMs - predictions[0]!.midTransitMs).toBeCloseTo(
    1.5 * 86_400_000,
    -2,
  );
  const [first] = predictions;
  expect(first!.uncertaintyMinutes).toBeCloseTo(
    Math.hypot(0.000_1, first!.epoch * 0.000_01) * 1_440,
    6,
  );
  expect(predictions[2]!.uncertaintyMinutes).toBeGreaterThan(first!.uncertaintyMinutes!);
});

test("a planet with no transit ephemeris predicts nothing", () => {
  expect(
    predictTransits({
      declinationDegrees: 0,
      nowMs: 0,
      periodDays: 4.23,
      rightAscensionDegrees: 0,
      signal: signal({ radialVelocityAmplitudeMetersPerSecond: 55.8 }),
    }),
  ).toEqual([]);
});

test("a prediction whose error outgrows the transit is flagged instead of scheduled", () => {
  const nowMs = Date.UTC(2026, 8, 28);
  const fresh = nextTransitFact(
    [{ epoch: 12, midTransitMs: nowMs + 3 * 3_600_000, uncertaintyMinutes: 2 }],
    1,
    nowMs,
    utc,
  );
  const stale = nextTransitFact(
    [{ epoch: 9_000, midTransitMs: nowMs + 3 * 3_600_000, uncertaintyMinutes: 300 }],
    1,
    nowMs,
    utc,
  );

  expect(fresh).toMatchObject({
    label: "Next transit",
    tone: "cyan",
    value: "28 Sept 2026, 03:00",
  });
  expect(fresh?.detail).toMatch(/^in 3 h 0 min · ±2 min · orbit 12/);
  expect(stale?.tone).toBe("accent");
  expect(stale?.detail).toMatch(/±5 h .* watch a wide window/);
});
